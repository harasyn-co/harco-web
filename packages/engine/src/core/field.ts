// The field: owns the canvas, the particles and the render loop, and exposes
// the commands apps and agents use to drive it.
import { applyPatch, DEFAULT_SCENE, ISOMETRIC_PITCH, type Scene, type ScenePatch, type SourceSpec, type Vec4, type Via } from "../scene"
import { FORMS, type FormName } from "../sources/forms"
import { compileSdf, type SdfProgram } from "../sources/sdf"
import { compileCurve, CURVES, type CurveProgram } from "../sources/curve"
import { SHADING_UNIFORMS } from "../styles/shading"
import { POINTS_FRAG, POINTS_VERT, SHAPE } from "../styles/points"
import { STREAKS_FRAG, STREAKS_VERT } from "../styles/streaks"
import { ASCII_FRAG, CELL_ASPECT, glyphAtlas } from "../styles/ascii"
import { RESERVOIR_MODES, UPDATE_FRAG } from "./particles"
import { bindTextures, compile, FULLSCREEN_VERT, PingPong, uniforms } from "./gl"
import { clamp, DEG, hexToRgb, orbit } from "./math"
import { SceneError, validateScene } from "../validate"

// The form sits in a centred square of this size (CSS px), limited by the
// viewport, with radius 1 spanning 1/2.6 of it (as in v1).
const MIN_SIZE = 320
const MAX_SIZE = 960
const SQUARE_UNITS = 2.6
const CAMERA_DISTANCE = 3
const PERSPECTIVE_PITCH = 15
// Share of anchors re-seeded per second: at rest, and just after a change.
const RESEED_REST = 0.006
const RESEED_CHANGE = 0.35
const RESEED_CHANGE_TIME = 1.5
// Pause in the reservoir between letting go of one form and gathering the next.
const RESERVOIR_PAUSE = 0.8
const START_DELAY = 0.6
// Adaptive quality: sample this long, and step down if frames run slower
// than this. Each level caps the pixel ratio and, for "auto" counts, scales
// the particle texture's side.
const QUALITY_WINDOW = 2
const SLOW_FPS = 42
const QUALITY = [
  { dprCap: 2, sideScale: 1 },
  { dprCap: 1.5, sideScale: 1 },
  { dprCap: 1, sideScale: 1 },
  { dprCap: 1, sideScale: 0.75 },
  { dprCap: 1, sideScale: 0.55 },
]
// After a particle count change, particles jump into place for this long.
const SNAP_TIME = 0.6
// The frozen moment shown with reduced motion.
const STILL_TIME = 10
// Drag: degrees per CSS px, and how fast the spin from a flick dies away.
const DRAG_YAW = 0.35
const DRAG_PITCH = 0.25
const FLICK_DECAY = 2.5

export type FieldEvent = "source" | "quality" | "contextlost" | "contextrestored"

export interface FieldStats {
  fps: number
  particles: number
  /** 0 is full quality; each step down lowers resolution or particle count. */
  quality: number
  reducedMotion: boolean
}

export interface FieldOptions {
  /** Hold still and change instantly. Defaults to the system setting. */
  reducedMotion?: boolean
}

export interface Field {
  readonly canvas: HTMLCanvasElement
  /** A copy of the current scene. */
  getScene(): Scene
  /** Apply part of a scene. Changing the source morphs to it. Throws a SceneError listing any problems, leaving the scene unchanged. */
  set(patch: ScenePatch): void
  /** Change what the particles gather into. Throws if a custom SDF fails to compile. */
  morph(source: SourceSpec, options?: { via?: Via }): void
  /** Let go of the form: particles fall into the reservoir. */
  scatter(): void
  /** Gather the form out of the reservoir. */
  gather(): void
  /** Live rotation in degrees, including spin and dragging. */
  getView(): { yaw: number; pitch: number }
  stats(): FieldStats
  /** Reads particle state back from the GPU (slow): how many are on the form, in flight, or at rest. */
  debug(): { attached: number; flying: number; resting: number; validAnchors: number }
  on(event: FieldEvent, listener: (detail: unknown) => void): () => void
  dispose(): void
}

export class UnsupportedError extends Error {}

export function isSupported(): boolean {
  const gl = document.createElement("canvas").getContext("webgl2")
  return !!gl && !!gl.getExtension("EXT_color_buffer_float")
}

function autoSide() {
  const small = Math.min(window.screen.width, window.screen.height) < 700
  const coarse = window.matchMedia?.("(pointer: coarse)").matches
  return small || coarse ? 256 : 384
}

function sideFor(count: Scene["particles"]["count"], sideScale: number) {
  return count === "auto" ? Math.round(autoSide() * sideScale) : clamp(Math.round(Math.sqrt(count)), 16, 1024)
}

function sdfBody(source: Exclude<SourceSpec, { type: "curve" }>) {
  if (source.type === "shape") {
    const form = FORMS[source.form]
    if (!form) throw new Error(`Unknown form "${source.form}". Forms: ${Object.keys(FORMS).join(", ")}`)
    return form.sdf
  }
  return source.glsl
}

function curveParts(source: Extract<SourceSpec, { type: "curve" }>) {
  const preset = source.curve ? CURVES[source.curve] : undefined
  if (source.curve && !preset) throw new Error(`Unknown curve "${source.curve}". Curves: ${Object.keys(CURVES).join(", ")}`)
  const glsl = source.glsl ?? preset?.glsl
  if (!glsl) throw new Error("A curve source needs `curve` or `glsl`")
  return { glsl, length: source.length ?? preset?.length ?? 2 * Math.PI, duration: source.duration ?? preset?.duration ?? 10 }
}

const UPDATE_UNIFORMS = [
  "uPos", "uVel", "uAnchor", "uModel", "uTime", "uDt", "uPresence", "uReserve", "uDir",
  "uView", "uCamera", "uReservoir", "uCapture", "uSnap", "uReset",
] as const
const POINTS_UNIFORMS = [...SHADING_UNIFORMS, "uPointSize", "uGlyphCount", "uGain", "uShape", "uAtlas", "uStride"] as const
const STREAKS_UNIFORMS = [...SHADING_UNIFORMS, "uTrail"] as const
const ASCII_UNIFORMS = ["uGrid", "uAtlas", "uGlyphCount", "uCell", "uGain", "uBackground", "uInk"] as const

export function createField(canvas: HTMLCanvasElement, initial: ScenePatch = {}, options: FieldOptions = {}): Field {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false })
  if (!gl) throw new UnsupportedError("WebGL2 is not available")
  if (!gl.getExtension("EXT_color_buffer_float")) throw new UnsupportedError("Float render targets are not available")

  const initialProblems = validateScene(initial)
  if (initialProblems.length) throw new SceneError(initialProblems)
  let scene = applyPatch(DEFAULT_SCENE, initial)
  const listeners = new Map<FieldEvent, Set<(detail: unknown) => void>>()
  const emit = (event: FieldEvent, detail?: unknown) => listeners.get(event)?.forEach((l) => l(detail))

  // Reduced motion follows the system setting unless the app decides.
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)")
  let reduced = options.reducedMotion ?? !!motionQuery?.matches
  const onMotionPref = () => { if (options.reducedMotion === undefined) reduced = !!motionQuery?.matches }
  motionQuery?.addEventListener?.("change", onMotionPref)

  // GPU resources. Everything here is rebuilt if the context is lost.
  let update: WebGLProgram
  let uu: ReturnType<typeof uniforms<(typeof UPDATE_UNIFORMS)[number]>>
  let points: WebGLProgram
  let pu: ReturnType<typeof uniforms<(typeof POINTS_UNIFORMS)[number]>>
  let streaks: WebGLProgram
  let su: ReturnType<typeof uniforms<(typeof STREAKS_UNIFORMS)[number]>>
  let ascii: WebGLProgram
  let au: ReturnType<typeof uniforms<(typeof ASCII_UNIFORMS)[number]>>
  let vao: WebGLVertexArrayObject
  // ASCII: a character atlas, and a low-resolution grid to gather into.
  let atlas: { tex: WebGLTexture; key: string; count: number } | null = null
  let grid: { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number } | null = null
  const programs = new Map<string, SdfProgram | CurveProgram>()
  let side = 0
  let particles: PingPong | null = null
  let anchors: PingPong | null = null
  let resetParticles = true
  let resetAnchors = true
  let quality = 0
  let snapUntil = -1

  function buildPrograms() {
    update = compile(gl!, FULLSCREEN_VERT, UPDATE_FRAG)
    uu = uniforms(gl!, update, UPDATE_UNIFORMS)
    points = compile(gl!, POINTS_VERT, POINTS_FRAG)
    pu = uniforms(gl!, points, POINTS_UNIFORMS)
    streaks = compile(gl!, STREAKS_VERT, STREAKS_FRAG)
    su = uniforms(gl!, streaks, STREAKS_UNIFORMS)
    ascii = compile(gl!, FULLSCREEN_VERT, ASCII_FRAG)
    au = uniforms(gl!, ascii, ASCII_UNIFORMS)
    vao = gl!.createVertexArray()
    atlas = null
    grid = null
  }

  function ensureAtlas() {
    const { chars, font } = scene.style.ascii
    const key = `${chars}\u0000${font}`
    if (atlas?.key === key) return atlas
    if (atlas) gl!.deleteTexture(atlas.tex)
    const tex = gl!.createTexture()
    gl!.bindTexture(gl!.TEXTURE_2D, tex)
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, glyphAtlas(chars || " ", font))
    gl!.generateMipmap(gl!.TEXTURE_2D)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR_MIPMAP_LINEAR)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
    atlas = { tex, key, count: Math.max(1, [...chars].length) }
    return atlas
  }

  function ensureGrid(w: number, h: number) {
    if (grid && grid.w === w && grid.h === h) return grid
    if (grid) { gl!.deleteTexture(grid.tex); gl!.deleteFramebuffer(grid.fb) }
    const tex = gl!.createTexture()
    gl!.bindTexture(gl!.TEXTURE_2D, tex)
    gl!.texStorage2D(gl!.TEXTURE_2D, 1, gl!.RGBA16F, w, h)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST)
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST)
    const fb = gl!.createFramebuffer()
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fb)
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0)
    grid = { tex, fb, w, h }
    return grid
  }

  // Particle and anchor state, sized together.
  function allocate() {
    particles?.dispose()
    anchors?.dispose()
    side = sideFor(scene.particles.count, QUALITY[quality].sideScale)
    particles = new PingPong(gl!, side, 2)
    anchors = new PingPong(gl!, side, 2)
    resetParticles = true
    resetAnchors = true
  }
  buildPrograms()
  allocate()

  // Compiled source programs, by kind and code.
  function programFor(source: SourceSpec): SdfProgram | CurveProgram {
    if (source.type === "curve") {
      const { glsl, length, duration } = curveParts(source)
      const key = `curve:${length}:${duration}:${glsl}`
      let p = programs.get(key)
      if (!p) programs.set(key, (p = compileCurve(gl!, glsl, length, duration)))
      return p
    }
    const body = sdfBody(source)
    const key = `sdf:${body}`
    let p = programs.get(key)
    if (!p) programs.set(key, (p = compileSdf(gl!, body)))
    return p
  }

  const randomSeed = (): Vec4 => [Math.random(), Math.random(), Math.random(), Math.random()]
  let current = { program: programFor(scene.source), seed: scene.source.seed ?? randomSeed(), since: 0 }

  // Time, presence and the pending trip through the reservoir.
  const t0 = performance.now()
  let t = 0
  let presence = 0
  let presenceTarget = 0
  let presenceRate = 1
  let dir = 1
  let reseedUntil = -1
  let pending: { source: SourceSpec; program: SdfProgram | CurveProgram; seed: Vec4; resumeAt: number } | null = null
  let nextAuto = Infinity
  let started = false

  function activate(source: SourceSpec, program: SdfProgram | CurveProgram, seed: Vec4) {
    current = { program, seed, since: t }
    scene = { ...scene, source: structuredClone(source) }
    reseedUntil = t + RESEED_CHANGE_TIME
    scheduleAuto()
    emit("source", structuredClone(source))
  }

  function scheduleAuto() {
    const auto = scene.motion.autoplay
    nextAuto = auto ? t + auto.hold + scene.motion.gather : Infinity
  }

  function scatter() {
    presenceTarget = 0
    presenceRate = 1 / Math.max(0.1, scene.motion.scatter)
    dir = -1
  }

  function gather() {
    presenceTarget = 1
    presenceRate = 1 / Math.max(0.1, scene.motion.gather)
    dir = 1
  }

  function morph(source: SourceSpec, morphOptions: { via?: Via } = {}) {
    const problems = validateScene({ source })
    if (problems.length) throw new SceneError(problems)
    const program = programFor(source) // throws on bad GLSL before anything changes
    const seed = source.seed ?? randomSeed()
    const via = reduced ? "direct" : morphOptions.via ?? scene.motion.via
    if (via === "direct" || presence < 0.02) {
      pending = null
      if (via === "reservoir") resetAnchors = true
      activate(source, program, seed)
      if (started && presenceTarget === 0) gather()
      return
    }
    pending = { source, program, seed, resumeAt: Infinity }
    scatter()
  }

  // View: rotation from the scene, spin, and dragging with a flick.
  const view = { yaw: scene.camera.yaw, pitch: scene.camera.pitch, yawVel: 0, pitchVel: 0 }
  let drag: { id: number; x: number; y: number; at: number } | null = null
  function onDown(e: PointerEvent) {
    if (!scene.camera.drag || drag) return
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, at: performance.now() }
    canvas.setPointerCapture(e.pointerId)
    view.yawVel = view.pitchVel = 0
  }
  function onMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    const now = performance.now()
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    const dts = Math.max(0.008, (now - drag.at) / 1000)
    view.yaw += dx * DRAG_YAW
    view.pitch = clamp(view.pitch + dy * DRAG_PITCH, -85, 85)
    view.yawVel = (dx * DRAG_YAW) / dts
    view.pitchVel = (dy * DRAG_PITCH) / dts
    drag = { id: drag.id, x: e.clientX, y: e.clientY, at: now }
  }
  function onUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return
    if (performance.now() - drag.at > 80) view.yawVel = view.pitchVel = 0
    drag = null
  }
  canvas.addEventListener("pointerdown", onDown)
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerup", onUp)
  canvas.addEventListener("pointercancel", onUp)

  // Layout, recomputed on resize and zoom.
  let width = 0, height = 0, dpr = 1
  const viewVec = new Float32Array(2)
  const proj = new Float32Array(4)
  function resize() {
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (!cssW || !cssH) return
    dpr = Math.min(window.devicePixelRatio || 1, QUALITY[quality].dprCap)
    width = Math.round(cssW * dpr)
    height = Math.round(cssH * dpr)
    canvas.width = width
    canvas.height = height
    const square = clamp(Math.min(cssW * 0.62, cssH * 0.92), MIN_SIZE, MAX_SIZE)
    const ppu = (square / SQUARE_UNITS) * scene.camera.zoom
    const halfW = cssW / 2 / ppu
    const halfH = cssH / 2 / ppu
    viewVec.set([halfW, halfH])
    proj.set([1 / halfW, 1 / halfH, CAMERA_DISTANCE, scene.camera.projection === "perspective" ? 1 : 0])
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  // Colours, eased so accent changes blend.
  const colors = { shadow: [0, 0, 0], body: [0, 0, 0], mid: [0, 0, 0], light: [0, 0, 0], rim: [0, 0, 0], loose: [0, 0, 0] }
  let accent = [0, 0, 0]
  let accentTarget = [0, 0, 0]
  let background = [0, 0, 0]
  function readColors(snap: boolean) {
    const p = scene.style.palette
    for (const key of Object.keys(colors) as (keyof typeof colors)[]) colors[key] = hexToRgb(p[key])
    background = hexToRgb(p.background)
    const formAccent = scene.source.type === "shape" ? FORMS[scene.source.form as FormName].accent : p.rim
    accentTarget = hexToRgb(p.accent === "form" ? formAccent : p.accent)
    if (snap) accent = [...accentTarget]
  }
  readColors(true)
  // A new form brings its own accent.
  listeners.set("source", new Set([() => readColors(false)]))

  function set(patch: ScenePatch) {
    const problems = validateScene(patch)
    if (problems.length) throw new SceneError(problems)
    const prev = scene
    const { source, ...rest } = patch
    scene = applyPatch(scene, rest)
    const cam = patch.camera
    if (cam?.projection && cam.projection !== prev.camera.projection && cam.pitch === undefined) {
      scene.camera.pitch = cam.projection === "isometric" ? ISOMETRIC_PITCH : PERSPECTIVE_PITCH
    }
    if (cam?.yaw !== undefined) view.yaw = scene.camera.yaw
    if (scene.camera.pitch !== prev.camera.pitch) view.pitch = scene.camera.pitch
    if (scene.particles.count !== prev.particles.count) allocate()
    if (patch.motion?.autoplay !== undefined) scheduleAuto()
    resize()
    readColors(false)
    if (source) morph(source)
  }

  // Context loss: stop drawing, and rebuild everything when it comes back.
  let lost = false
  function onLost(e: Event) {
    e.preventDefault()
    lost = true
    emit("contextlost")
  }
  function onRestored() {
    // Extensions are lost with the context, so float targets need re-enabling.
    if (!gl!.getExtension("EXT_color_buffer_float")) return
    programs.clear()
    particles = anchors = null
    buildPrograms()
    allocate()
    current = { ...current, program: programFor(scene.source) }
    if (pending) pending = { ...pending, program: programFor(pending.source) }
    snapUntil = t + SNAP_TIME
    lost = false
    emit("contextrestored")
  }
  canvas.addEventListener("webglcontextlost", onLost)
  canvas.addEventListener("webglcontextrestored", onRestored)

  // Adaptive quality: step down when frames stay slow. Only "auto" particle
  // counts are reduced; a count the scene asked for is kept.
  const frameTimes: number[] = []
  let windowStart = 0
  function checkQuality(now: number, frameMs: number) {
    if (frameMs < 250) frameTimes.push(frameMs) // ignore pauses such as hidden tabs
    if (now - windowStart < QUALITY_WINDOW * 1000) return
    windowStart = now
    if (frameTimes.length < 20) { frameTimes.length = 0; return }
    const sorted = [...frameTimes].sort((a, b) => a - b)
    frameTimes.length = 0
    const medianFps = 1000 / sorted[sorted.length >> 1]
    let next = quality
    while (next < QUALITY.length - 1) {
      next++
      const level = QUALITY[next]
      const helpsDpr = level.dprCap < Math.min(window.devicePixelRatio || 1, QUALITY[quality].dprCap)
      const helpsCount = scene.particles.count === "auto" && level.sideScale < QUALITY[quality].sideScale
      if (helpsDpr || helpsCount) break
    }
    if (medianFps >= SLOW_FPS || next === quality) return
    const recount = QUALITY[next].sideScale !== QUALITY[quality].sideScale && scene.particles.count === "auto"
    quality = next
    resize()
    if (recount) { allocate(); snapUntil = t + SNAP_TIME }
    emit("quality", quality)
  }

  // Frame loop.
  let raf = 0
  let lastT = 0
  let lastNow = 0
  let fps = 60

  function step(now: number) {
    raf = requestAnimationFrame(step)
    t = (now - t0) / 1000
    const dt = Math.min(0.05, Math.max(0.001, t - lastT))
    if (lastT) fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
    lastT = t
    if (lastNow && !reduced) checkQuality(now, now - lastNow)
    lastNow = now
    if (lost || !width || !particles || !anchors) return
    // Reduced motion: a frozen moment, and every change lands at once.
    const snap = reduced || t < snapUntil
    const clock = reduced ? STILL_TIME : t

    if (!started && t >= START_DELAY) { started = true; gather(); scheduleAuto() }

    // Presence eases towards its target at a steady rate.
    const dp = presenceTarget - presence
    presence += Math.sign(dp) * Math.min(Math.abs(dp), presenceRate * dt)

    // A trip through the reservoir: once let go, pause, then gather the next.
    if (pending) {
      if (pending.resumeAt === Infinity && presence <= 0.001) pending.resumeAt = t + RESERVOIR_PAUSE + scene.motion.scatter * 0.4
      if (t >= pending.resumeAt) {
        resetAnchors = true
        activate(pending.source, pending.program, pending.seed)
        pending = null
        gather()
      }
    }

    // Autoplay picks another form once the current one has held long enough.
    const auto = reduced ? null : scene.motion.autoplay
    if (auto && t >= nextAuto && !pending) {
      const options = auto.forms.filter((f) => !(scene.source.type === "shape" && scene.source.form === f))
      if (options.length) morph({ type: "shape", form: options[Math.floor(Math.random() * options.length)] })
      else nextAuto = Infinity
    }

    // Rotation.
    if (!drag) {
      view.yaw += ((reduced ? 0 : scene.camera.spin) + view.yawVel) * dt
      view.pitch = clamp(view.pitch + view.pitchVel * dt, -85, 85)
      const decay = reduced ? 0 : Math.exp(-dt * FLICK_DECAY)
      view.yawVel *= decay
      view.pitchVel *= decay
    }
    const model = orbit(view.yaw * DEG, view.pitch * DEG)
    for (let i = 0; i < 3; i++) accent[i] += (accentTarget[i] - accent[i]) * (1 - Math.exp(-dt * 1.5))

    gl!.bindVertexArray(vao)
    gl!.disable(gl!.BLEND)
    gl!.viewport(0, 0, side, side)

    // 1. Anchors onto the surface.
    const sp = current.program
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, anchors.write.fb)
    gl!.useProgram(sp.program)
    bindTextures(gl!, 0, [[sp.u.uAnchor, anchors.read.textures[0]]])
    gl!.uniform1f(sp.u.uTime, clock)
    gl!.uniform1f(sp.u.uDt, dt)
    gl!.uniform1f(sp.u.uAge, reduced ? 1e4 : t - current.since)
    gl!.uniform4fv(sp.u.uSeed, current.seed)
    gl!.uniform1f(sp.u.uReseed, t < reseedUntil ? RESEED_CHANGE : RESEED_REST)
    gl!.uniform1f(sp.u.uReset, resetAnchors ? 1 : 0)
    if ("range" in sp) gl!.uniform2f(sp.uRange, sp.range[0], sp.range[1])
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    anchors.swap()
    resetAnchors = false

    // 2. Particles.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, particles.write.fb)
    gl!.useProgram(update)
    bindTextures(gl!, 0, [
      [uu.uPos, particles.read.textures[0]],
      [uu.uVel, particles.read.textures[1]],
      [uu.uAnchor, anchors.read.textures[0]],
    ])
    gl!.uniformMatrix3fv(uu.uModel, false, model)
    gl!.uniform1f(uu.uTime, clock)
    gl!.uniform1f(uu.uDt, dt)
    gl!.uniform1f(uu.uPresence, reduced ? presenceTarget : presence)
    gl!.uniform1f(uu.uReserve, clamp(scene.motion.reserve, 0, 1))
    gl!.uniform1f(uu.uDir, dir)
    gl!.uniform2f(uu.uCamera, proj[2], proj[3])
    gl!.uniform2f(uu.uView, viewVec[0], viewVec[1])
    const r = scene.reservoir
    gl!.uniform4f(uu.uReservoir, RESERVOIR_MODES[r.mode] ?? 1, clamp(r.height, 0, 1), clamp(r.opacity, 0, 1), r.drift)
    gl!.uniform1f(uu.uCapture, "range" in sp ? 0.3 : 0.02)
    gl!.uniform1f(uu.uSnap, snap ? 1 : 0)
    gl!.uniform1f(uu.uReset, resetParticles ? 1 : 0)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    particles.swap()
    resetParticles = false

    // 3. Draw, in the scene's style.
    const st = scene.style
    type ShadingU = Record<(typeof SHADING_UNIFORMS)[number], WebGLUniformLocation | null>
    const shading = (u: ShadingU) => {
      bindTextures(gl!, 0, [
        [u.uPos, particles!.read.textures[0]],
        [u.uVel, particles!.read.textures[1]],
        [u.uNormal, anchors!.read.textures[1]],
      ])
      gl!.uniformMatrix3fv(u.uModel, false, model)
      gl!.uniform4fv(u.uProj, proj)
      gl!.uniform1f(u.uOpacity, st.opacity)
      gl!.uniform1i(u.uSide, side)
      gl!.uniform3fv(u.uShadow, colors.shadow)
      gl!.uniform3fv(u.uBody, colors.body)
      gl!.uniform3fv(u.uMid, colors.mid)
      gl!.uniform3fv(u.uLight, colors.light)
      gl!.uniform3fv(u.uRim, colors.rim)
      gl!.uniform3fv(u.uAccent, accent)
      gl!.uniform3fv(u.uLoose, colors.loose)
    }
    const drawPoints = (shape: number, size: number, gain: number, stride = 1) => {
      gl!.useProgram(points)
      shading(pu)
      const a = shape === SHAPE.glyph ? ensureAtlas() : null
      if (a) bindTextures(gl!, 3, [[pu.uAtlas, a.tex]])
      gl!.uniform1f(pu.uPointSize, size)
      gl!.uniform1i(pu.uShape, shape)
      gl!.uniform1f(pu.uGlyphCount, a?.count ?? 1)
      gl!.uniform1f(pu.uGain, gain)
      gl!.uniform1i(pu.uStride, stride)
      gl!.drawArrays(gl!.POINTS, 0, Math.ceil((side * side) / stride))
    }

    if (st.kind === "ascii" && st.ascii.grid) {
      // Gather particles into the character grid, then print it.
      const cell = Math.max(2, st.ascii.cell) * dpr
      const g = ensureGrid(Math.ceil(width / (cell * CELL_ASPECT)), Math.ceil(height / cell))
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, g.fb)
      gl!.viewport(0, 0, g.w, g.h)
      gl!.clearColor(0, 0, 0, 0)
      gl!.clear(gl!.COLOR_BUFFER_BIT)
      gl!.enable(gl!.BLEND)
      gl!.blendFunc(gl!.ONE, gl!.ONE)
      drawPoints(SHAPE.round, 1, 0)
      gl!.disable(gl!.BLEND)

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
      gl!.viewport(0, 0, width, height)
      gl!.useProgram(ascii)
      const a = ensureAtlas()
      bindTextures(gl!, 3, [[au.uGrid, g.tex], [au.uAtlas, a.tex]])
      gl!.uniform1f(au.uGlyphCount, a.count)
      gl!.uniform2f(au.uCell, width / g.w, height / g.h)
      // Scale coverage by how many particles a cell would hold if they were
      // spread over the whole view, so density reads the same at any count.
      const perCell = (side * side) / (g.w * g.h)
      gl!.uniform1f(au.uGain, (1.1 * st.ascii.contrast) / Math.max(perCell, 1e-3))
      gl!.uniform3fv(au.uBackground, background)
      const ink = st.ascii.color === "shade" ? null : hexToRgb(st.ascii.color)
      gl!.uniform4f(au.uInk, ink?.[0] ?? 0, ink?.[1] ?? 0, ink?.[2] ?? 0, ink ? 1 : 0)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      return
    }

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    gl!.viewport(0, 0, width, height)
    gl!.clearColor(background[0], background[1], background[2], 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.enable(gl!.BLEND)
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA)
    if (st.kind === "ascii") {
      // One character per particle: draw only about as many as fit on the
      // form (roughly an eighth of the screen's cells), or they pile into mush.
      const cell = Math.max(2, st.ascii.cell) * dpr
      const cells = (width * height) / (cell * cell * CELL_ASPECT)
      const stride = Math.max(1, Math.round((side * side) / (cells * 0.12)))
      drawPoints(SHAPE.glyph, cell, 1.6 * st.ascii.contrast, stride)
    }
    else drawPoints(st.kind === "squares" ? SHAPE.square : SHAPE.round, st.size * dpr, 0)
    if (st.kind === "streaks") {
      gl!.useProgram(streaks)
      shading(su)
      gl!.uniform1f(su.uTrail, st.streaks.length)
      gl!.drawArrays(gl!.LINES, 0, side * side * 2)
    }
    gl!.disable(gl!.BLEND)
  }
  raf = requestAnimationFrame(step)

  return {
    canvas,
    getScene: () => structuredClone(scene),
    set,
    morph,
    scatter,
    gather,
    getView: () => ({ yaw: ((view.yaw % 360) + 360) % 360, pitch: view.pitch }),
    stats: () => ({ fps: Math.round(fps), particles: side * side, quality, reducedMotion: reduced }),
    debug() {
      const read = (target: { fb: WebGLFramebuffer }, attachment: number) => {
        const out = new Float32Array(side * side * 4)
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fb)
        gl!.readBuffer(gl!.COLOR_ATTACHMENT0 + attachment)
        gl!.readPixels(0, 0, side, side, gl!.RGBA, gl!.FLOAT, out)
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
        return out
      }
      const pos = read(particles!.read, 0)
      const vel = read(particles!.read, 1)
      const anc = read(anchors!.read, 0)
      let attached = 0, resting = 0, validAnchors = 0
      for (let i = 0; i < side * side; i++) {
        const speed = Math.hypot(vel[i * 4], vel[i * 4 + 1], vel[i * 4 + 2])
        if (pos[i * 4 + 3] > 0.5) attached++
        else if (speed < 0.35) resting++
        if (anc[i * 4 + 3] > 0.5) validAnchors++
      }
      return { attached, flying: side * side - attached - resting, resting, validAnchors }
    },
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(listener)
      return () => listeners.get(event)?.delete(listener)
    },
    dispose() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      motionQuery?.removeEventListener?.("change", onMotionPref)
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      particles?.dispose()
      anchors?.dispose()
      for (const p of programs.values()) gl!.deleteProgram(p.program)
      gl!.deleteProgram(update)
      for (const p of [points, streaks, ascii]) gl!.deleteProgram(p)
      if (atlas) gl!.deleteTexture(atlas.tex)
      if (grid) { gl!.deleteTexture(grid.tex); gl!.deleteFramebuffer(grid.fb) }
      gl!.deleteVertexArray(vao)
      listeners.clear()
    },
  }
}
