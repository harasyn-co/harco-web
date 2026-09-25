// The field: owns the canvas, the particles and the render loop, and exposes
// the commands apps and agents use to drive it.
import { applyPatch, DEFAULT_SCENE, ISOMETRIC_PITCH, type Scene, type ScenePatch, type SourceSpec, type Vec4, type Via } from "../scene"
import { FORMS, type FormName } from "../sources/forms"
import { compileSdf, type SdfProgram } from "../sources/sdf"
import { DOTS_FRAG, DOTS_VERT } from "../styles/dots"
import { RESERVOIR_MODES, UPDATE_FRAG } from "./particles"
import { bindTextures, compile, FULLSCREEN_VERT, PingPong, uniforms } from "./gl"
import { clamp, DEG, hexToRgb, orbit } from "./math"

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
// Drag: degrees per CSS px, and how fast the spin from a flick dies away.
const DRAG_YAW = 0.35
const DRAG_PITCH = 0.25
const FLICK_DECAY = 2.5

export type FieldEvent = "source" | "error"

export interface FieldStats {
  fps: number
  particles: number
}

export interface Field {
  readonly canvas: HTMLCanvasElement
  /** A copy of the current scene. */
  getScene(): Scene
  /** Apply part of a scene. Changing the source morphs to it. */
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

function sideFor(count: Scene["particles"]["count"]) {
  return count === "auto" ? autoSide() : clamp(Math.round(Math.sqrt(count)), 16, 1024)
}

function sdfBody(source: SourceSpec) {
  if (source.type === "shape") {
    const form = FORMS[source.form]
    if (!form) throw new Error(`Unknown form "${source.form}". Forms: ${Object.keys(FORMS).join(", ")}`)
    return form.sdf
  }
  return source.glsl
}

export function createField(canvas: HTMLCanvasElement, initial: ScenePatch = {}): Field {
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false })
  if (!gl) throw new UnsupportedError("WebGL2 is not available")
  if (!gl.getExtension("EXT_color_buffer_float")) throw new UnsupportedError("Float render targets are not available")

  let scene = applyPatch(DEFAULT_SCENE, initial)
  const listeners = new Map<FieldEvent, Set<(detail: unknown) => void>>()
  const emit = (event: FieldEvent, detail: unknown) => listeners.get(event)?.forEach((l) => l(detail))

  const update = compile(gl, FULLSCREEN_VERT, UPDATE_FRAG)
  const uu = uniforms(gl, update, ["uPos", "uVel", "uAnchor", "uModel", "uTime", "uDt", "uPresence", "uReserve", "uDir", "uView", "uCamera", "uReservoir", "uReset"] as const)
  const dots = compile(gl, DOTS_VERT, DOTS_FRAG)
  const du = uniforms(gl, dots, [
    "uPos", "uNormal", "uModel", "uProj", "uPointSize", "uOpacity", "uSide",
    "uShadow", "uBody", "uMid", "uLight", "uRim", "uAccent", "uLoose", "uVel",
  ] as const)
  const vao = gl.createVertexArray()

  // Particle and anchor state, sized together.
  let side = 0
  let particles: PingPong | null = null
  let anchors: PingPong | null = null
  let resetParticles = true
  let resetAnchors = true
  function allocate() {
    particles?.dispose()
    anchors?.dispose()
    side = sideFor(scene.particles.count)
    particles = new PingPong(gl!, side, 2)
    anchors = new PingPong(gl!, side, 2)
    resetParticles = true
    resetAnchors = true
  }
  allocate()

  // Compiled SDF programs, by source code.
  const programs = new Map<string, SdfProgram>()
  function programFor(source: SourceSpec) {
    const body = sdfBody(source)
    let p = programs.get(body)
    if (!p) {
      p = compileSdf(gl!, body)
      programs.set(body, p)
    }
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
  let pending: { source: SourceSpec; program: SdfProgram; seed: Vec4; resumeAt: number } | null = null
  let nextAuto = Infinity
  let started = false

  function activate(source: SourceSpec, program: SdfProgram, seed: Vec4) {
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

  function morph(source: SourceSpec, options: { via?: Via } = {}) {
    const program = programFor(source) // throws on bad GLSL before anything changes
    const seed = source.seed ?? randomSeed()
    const via = options.via ?? scene.motion.via
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
    dpr = Math.min(window.devicePixelRatio || 1, 2)
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

  // Frame loop.
  let raf = 0
  let lastT = 0
  let fps = 60

  function step(now: number) {
    raf = requestAnimationFrame(step)
    t = (now - t0) / 1000
    const dt = Math.min(0.05, Math.max(0.001, t - lastT))
    if (lastT) fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
    lastT = t
    if (!width || !particles || !anchors) return

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
    const auto = scene.motion.autoplay
    if (auto && t >= nextAuto && !pending) {
      const options = auto.forms.filter((f) => !(scene.source.type === "shape" && scene.source.form === f))
      if (options.length) morph({ type: "shape", form: options[Math.floor(Math.random() * options.length)] })
      else nextAuto = Infinity
    }

    // Rotation.
    if (!drag) {
      view.yaw += (scene.camera.spin + view.yawVel) * dt
      view.pitch = clamp(view.pitch + view.pitchVel * dt, -85, 85)
      const decay = Math.exp(-dt * FLICK_DECAY)
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
    gl!.uniform1f(sp.u.uTime, t)
    gl!.uniform1f(sp.u.uDt, dt)
    gl!.uniform1f(sp.u.uAge, t - current.since)
    gl!.uniform4fv(sp.u.uSeed, current.seed)
    gl!.uniform1f(sp.u.uReseed, t < reseedUntil ? RESEED_CHANGE : RESEED_REST)
    gl!.uniform1f(sp.u.uReset, resetAnchors ? 1 : 0)
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
    gl!.uniform1f(uu.uTime, t)
    gl!.uniform1f(uu.uDt, dt)
    gl!.uniform1f(uu.uPresence, presence)
    gl!.uniform1f(uu.uReserve, clamp(scene.motion.reserve, 0, 1))
    gl!.uniform1f(uu.uDir, dir)
    gl!.uniform2f(uu.uCamera, proj[2], proj[3])
    gl!.uniform2f(uu.uView, viewVec[0], viewVec[1])
    const r = scene.reservoir
    gl!.uniform4f(uu.uReservoir, RESERVOIR_MODES[r.mode] ?? 1, clamp(r.height, 0, 1), clamp(r.opacity, 0, 1), r.drift)
    gl!.uniform1f(uu.uReset, resetParticles ? 1 : 0)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
    particles.swap()
    resetParticles = false

    // 3. Draw.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    gl!.viewport(0, 0, width, height)
    gl!.clearColor(background[0], background[1], background[2], 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    gl!.useProgram(dots)
    bindTextures(gl!, 0, [
      [du.uPos, particles.read.textures[0]],
      [du.uVel, particles.read.textures[1]],
      [du.uNormal, anchors.read.textures[1]],
    ])
    gl!.uniformMatrix3fv(du.uModel, false, model)
    gl!.uniform4fv(du.uProj, proj)
    gl!.uniform1f(du.uPointSize, scene.style.size * dpr)
    gl!.uniform1f(du.uOpacity, scene.style.opacity)
    gl!.uniform1i(du.uSide, side)
    gl!.uniform3fv(du.uShadow, colors.shadow)
    gl!.uniform3fv(du.uBody, colors.body)
    gl!.uniform3fv(du.uMid, colors.mid)
    gl!.uniform3fv(du.uLight, colors.light)
    gl!.uniform3fv(du.uRim, colors.rim)
    gl!.uniform3fv(du.uAccent, accent)
    gl!.uniform3fv(du.uLoose, colors.loose)
    gl!.enable(gl!.BLEND)
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA)
    gl!.drawArrays(gl!.POINTS, 0, side * side)
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
    stats: () => ({ fps: Math.round(fps), particles: side * side }),
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
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      particles?.dispose()
      anchors?.dispose()
      for (const p of programs.values()) gl!.deleteProgram(p.program)
      gl!.deleteProgram(update)
      gl!.deleteProgram(dots)
      gl!.deleteVertexArray(vao)
      listeners.clear()
    },
  }
}
