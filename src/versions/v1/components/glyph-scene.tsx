import { useEffect, useRef } from "react"
import {
  BANDS_FRAG, COMPOSITE_FRAG, FORM, FORM_COUNT, FULLSCREEN_VERT, PARTICLE_FRAG, PARTICLE_SIDE,
  PARTICLE_UPDATE_FRAG, PARTICLE_VERT, SCENE_FRAG, TRAIL_LENGTH,
} from "./glyph-scene-shaders"

const FPS = 30
const HOLD = 12 // seconds a form shows on its own
const MORPH = 6 // seconds to scatter into grain and condense the next form
const PERIOD = HOLD + MORPH
// Opening: the page starts as grain, the reservoir fades in, the streams
// wake at INTRO_WAKE, and the first form condenses from INTRO_START over
// INTRO_GATHER seconds.
const INTRO_WAKE = 1
const INTRO_START = 2
const INTRO_GATHER = 3
// Stream strength while a form simply holds.
const HOLD_STREAMS = 0.12
// Particle respawn rate (per second, per dead particle) at full flow, and
// while a form holds.
const PARTICLE_RATE = 1.4
const HOLD_PARTICLE_RATE = 0.05
// Moment shown as a still frame for visitors who prefer reduced motion.
const STILL_T = 10

// Each form's accent: it tints the reservoir, streams, particles and rims.
const ACCENTS: Record<number, [number, number, number]> = {
  [FORM.CELLS]: [110 / 255, 52 / 255, 132 / 255],   // violet
  [FORM.GYROID]: [22 / 255, 112 / 255, 140 / 255],  // teal
  [FORM.KNOT]: [34 / 255, 88 / 255, 156 / 255],     // blue
  [FORM.HARMONIC]: [92 / 255, 60 / 255, 150 / 255], // indigo
  [FORM.BULB]: [30 / 255, 58 / 255, 150 / 255],     // deep blue
}
const mixRgb = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k)

// The form occupies a centred square of this size (CSS px), limited by the
// viewport so it never runs off screen.
const MIN_SIZE = 320
const MAX_SIZE = 960
const MIN_TEXELS = 96
const MAX_TEXELS = 384
// The background bands are soft, so they render at 1/6 resolution.
const BAND_SCALE = 6

// Quality levels, stepped down when frames arrive too slowly: scene
// resolution (CSS px per texel), ray-march steps, and pixel-ratio cap.
const QUALITY = [
  { texelPx: 2.5, steps: 120, dprCap: 2 },
  { texelPx: 3.2, steps: 90, dprCap: 1.5 },
  { texelPx: 4.2, steps: 64, dprCap: 1.25 },
  { texelPx: 5.5, steps: 48, dprCap: 1 },
]
const SLOW_FRAME_MS = (1000 / FPS) * 1.35
const QUALITY_SAMPLES = 45

// Pointer trail: points fade over this long, and their radius grows as they
// fade, so disturbed grain appears to re-settle outward.
const TRAIL_LIFE = 1.6
const TRAIL_SPACING = 10 // CSS px between recorded points

type Rng = () => number

function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smoothstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

// The form sequence is a pure function of time. Period 0 is the opening.
// Every later period k starts with form k - 1 scattering and sinking back
// into grain (first half of MORPH), then form k condensing out of it (second
// half), then HOLD seconds of form k. Form 0 is the cells.
function createTimeline(seed: number, pinnedForm: number | null) {
  const rng = mulberry32(seed)
  const forms: number[] = [pinnedForm ?? FORM.CELLS]
  const seeds: number[][] = []
  function ensure(k: number) {
    while (forms.length <= k) {
      if (pinnedForm !== null) { forms.push(pinnedForm); continue }
      let f = forms[forms.length - 1]
      while (f === forms[forms.length - 1]) f = Math.floor(rng() * FORM_COUNT)
      forms.push(f)
    }
    while (seeds.length <= k) seeds.push([rng(), rng(), rng(), rng()])
  }
  const half = MORPH / 2
  const startOf = (k: number) => (k === 0 ? INTRO_START : k * PERIOD + half)
  const hold = (k: number, t: number) => ({
    form: forms[k], seed: seeds[k], age: t - startOf(k), condense: 1,
    flow: 1, streams: HOLD_STREAMS, rate: HOLD_PARTICLE_RATE,
    accent: ACCENTS[forms[k]], upcoming: forms[k],
  })

  return (t: number) => {
    const k = Math.floor(t / PERIOD)
    const local = t - k * PERIOD
    ensure(k)
    if (k === 0) {
      if (t < INTRO_START) {
        // Grain only; the streams wake and start rising.
        const wake = smoothstep((t - INTRO_WAKE) / (INTRO_START - INTRO_WAKE))
        return {
          form: forms[0], seed: seeds[0], age: 0, condense: 0, flow: 1,
          streams: 0.6 * wake, rate: PARTICLE_RATE * wake, accent: ACCENTS[forms[0]], upcoming: -1,
        }
      }
      if (t < INTRO_START + INTRO_GATHER) {
        const p = (t - INTRO_START) / INTRO_GATHER
        return {
          form: forms[0], seed: seeds[0], age: t - INTRO_START, condense: smoothstep(p), flow: 1,
          streams: 0.6 + 0.4 * Math.sin(Math.PI * p), rate: PARTICLE_RATE * (1 - p * 0.7),
          accent: ACCENTS[forms[0]], upcoming: forms[0],
        }
      }
      return hold(0, t)
    }
    if (local < half) {
      // The previous form scatters and sinks back into the reservoir.
      const p = local / half
      return {
        form: forms[k - 1], seed: seeds[k - 1], age: t - startOf(k - 1), condense: 1 - smoothstep(p),
        flow: -1, streams: Math.sin(Math.PI * p), rate: PARTICLE_RATE * Math.sin(Math.PI * p),
        accent: ACCENTS[forms[k - 1]], upcoming: forms[k],
      }
    }
    if (local < MORPH) {
      // The next form condenses, fed from the reservoir.
      const p = (local - half) / half
      return {
        form: forms[k], seed: seeds[k], age: t - startOf(k), condense: smoothstep(p),
        flow: 1, streams: Math.max(HOLD_STREAMS, Math.sin(Math.PI * p)), rate: PARTICLE_RATE * Math.sin(Math.PI * Math.min(1, p * 1.3)),
        accent: mixRgb(ACCENTS[forms[k - 1]], ACCENTS[forms[k]], smoothstep(p)), upcoming: forms[k],
      }
    }
    return hold(k, t)
  }
}

function compile(gl: WebGL2RenderingContext, vert: string, frag: string) {
  const program = gl.createProgram()!
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed")
    }
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed")
  }
  return program
}

interface GlyphSceneProps {
  className?: string
  /** Render a single still frame instead of animating. */
  still?: boolean
  /** Called with the form that is showing or about to condense. */
  onForm?: (form: number) => void
  /** Called if WebGL2 is unavailable, so the page can show a fallback. */
  onUnsupported?: () => void
}

// The whole page background: dark base, coloured particle bands revealed
// along an organic edge, and film grain. 3D mathematical and organic forms
// are expressed through that same grain, so the forms and the background are
// one material. Forms scatter into grain and the next condenses out of it.
// The pointer stirs the grain and bands, and the form leans towards it.
//
// In development, `?t=<seconds>` freezes time, `?from=<seconds>` starts the
// clock at a given moment, and `?form=<0-4>` pins a form.
export function GlyphScene({ className, still = false, onForm, onUnsupported }: GlyphSceneProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const onFormRef = useRef(onForm)
  const onUnsupportedRef = useRef(onUnsupported)
  useEffect(() => {
    onFormRef.current = onForm
    onUnsupportedRef.current = onUnsupported
  })

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false })
    if (!gl) { onUnsupportedRef.current?.(); return }

    const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
    const fixedT = params?.has("t") ? Number(params.get("t")) : still ? STILL_T : null
    const pinned = params?.has("form") ? Number(params.get("form")) : null
    const startAt = params?.has("from") ? Number(params.get("from")) : 0
    const timeline = createTimeline((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, pinned)

    let scene: WebGLProgram, bands: WebGLProgram, composite: WebGLProgram
    try {
      scene = compile(gl, FULLSCREEN_VERT, SCENE_FRAG)
      bands = compile(gl, FULLSCREEN_VERT, BANDS_FRAG)
      composite = compile(gl, FULLSCREEN_VERT, COMPOSITE_FRAG)
    } catch (err) {
      console.error(err)
      onUnsupportedRef.current?.()
      return
    }
    // Particles need float render targets. Without them the page still
    // works, just without the travelling particles.
    let particleUpdate: WebGLProgram | null = null
    let particleDraw: WebGLProgram | null = null
    if (gl.getExtension("EXT_color_buffer_float")) {
      try {
        particleUpdate = compile(gl, FULLSCREEN_VERT, PARTICLE_UPDATE_FRAG)
        particleDraw = compile(gl, PARTICLE_VERT, PARTICLE_FRAG)
      } catch (err) {
        console.error(err)
      }
    }
    const loc = (p: WebGLProgram, names: string[]) =>
      Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))
    const su = loc(scene, ["uN", "uTime", "uForm", "uAge", "uSeed", "uLean", "uMaxSteps", "uAccent"])
    const bu = loc(bands, ["uBandRes", "uScreen", "uRect", "uScene", "uTime", "uPresence", "uTrail", "uAccent", "uReservoir"])
    const cu = loc(composite, [
      "uScene", "uAux", "uBands", "uScreen", "uDpr", "uRect", "uTime", "uIntro", "uCondense", "uTrail",
      "uAccent", "uFlow", "uStreams",
    ])
    const pu = particleUpdate
      ? loc(particleUpdate, ["uStateA", "uStateB", "uScene", "uRectN", "uAspect", "uTime", "uDt", "uFlow", "uRate"])
      : {}
    const pd = particleDraw
      ? loc(particleDraw, ["uStateA", "uStateB", "uCssScreen", "uPointSize", "uAccent"])
      : {}

    // Particle state: two ping-pong sets, each with two float textures.
    const particleSets = particleUpdate
      ? [0, 1].map(() => {
          const make = () => {
            const tex = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, PARTICLE_SIDE, PARTICLE_SIDE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
            return tex
          }
          const a = make()
          const b = make()
          const fb = gl.createFramebuffer()
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, b, 0)
          gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
          gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0])
          gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0])
          return { a, b, fb }
        })
      : []
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    let particleRead = 0

    const vao = gl.createVertexArray()
    const sceneFb = gl.createFramebuffer()
    const bandFb = gl.createFramebuffer()
    let colorTex: WebGLTexture | null = null
    let auxTex: WebGLTexture | null = null
    let bandTex: WebGLTexture | null = null

    let quality = 0
    let width = 0
    let height = 0
    let dpr = 1
    let cells = 0
    let bandW = 0
    let bandH = 0
    const rect = { x: 0, y: 0, size: 0 }

    function makeTexture(w: number, h: number, levels: number) {
      const tex = gl!.createTexture()
      gl!.bindTexture(gl!.TEXTURE_2D, tex)
      gl!.texStorage2D(gl!.TEXTURE_2D, levels, gl!.RGBA8, w, h)
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, levels > 1 ? gl!.LINEAR_MIPMAP_LINEAR : gl!.LINEAR)
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
      return tex
    }

    function resize() {
      const cssW = canvas!.clientWidth
      const cssH = canvas!.clientHeight
      if (!cssW || !cssH) return
      const q = QUALITY[quality]
      dpr = Math.min(window.devicePixelRatio || 1, q.dprCap)
      width = Math.round(cssW * dpr)
      height = Math.round(cssH * dpr)
      canvas!.width = width
      canvas!.height = height
      const sizeCss = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.min(cssW * 0.62, cssH * 0.92)))
      rect.size = sizeCss * dpr
      rect.x = (width - rect.size) / 2
      rect.y = (height - rect.size) / 2
      cells = Math.round(Math.min(MAX_TEXELS, Math.max(MIN_TEXELS, sizeCss / q.texelPx)))
      bandW = Math.max(1, Math.ceil(width / BAND_SCALE))
      bandH = Math.max(1, Math.ceil(height / BAND_SCALE))

      for (const tex of [colorTex, auxTex, bandTex]) if (tex) gl!.deleteTexture(tex)
      // Scene colour keeps a full mip chain; blurred levels form the halo.
      colorTex = makeTexture(cells, cells, Math.floor(Math.log2(cells)) + 1)
      auxTex = makeTexture(cells, cells, 1)
      bandTex = makeTexture(bandW, bandH, 1)

      gl!.bindFramebuffer(gl!.FRAMEBUFFER, sceneFb)
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, colorTex, 0)
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT1, gl!.TEXTURE_2D, auxTex, 0)
      gl!.drawBuffers([gl!.COLOR_ATTACHMENT0, gl!.COLOR_ATTACHMENT1])
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, bandFb)
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, bandTex, 0)
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    }

    // Pointer: a trail of recent points, and an eased lean for the camera.
    const trail: { x: number; y: number; at: number }[] = []
    const trailData = new Float32Array(TRAIL_LENGTH * 4)
    const lean = { x: 0, y: 0, tx: 0, ty: 0 }
    let last: { x: number; y: number } | null = null
    function onPointer(e: PointerEvent) {
      lean.tx = (e.clientX / window.innerWidth) * 2 - 1
      lean.ty = -((e.clientY / window.innerHeight) * 2 - 1)
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < TRAIL_SPACING) return
      last = { x: e.clientX, y: e.clientY }
      trail.unshift({ x: e.clientX, y: e.clientY, at: performance.now() / 1000 })
      if (trail.length > TRAIL_LENGTH) trail.pop()
    }
    function onLeave() { lean.tx = 0; lean.ty = 0 }
    function updateTrail(now: number) {
      trailData.fill(0)
      trail.forEach((p, i) => {
        const age = now - p.at
        if (age > TRAIL_LIFE) return
        const k = 1 - age / TRAIL_LIFE
        trailData[i * 4] = p.x * dpr
        trailData[i * 4 + 1] = height - p.y * dpr
        trailData[i * 4 + 2] = k * k
        trailData[i * 4 + 3] = (24 + age * 28) * dpr
      })
    }

    let reportedForm = -1
    let lastT = 0

    function draw(t: number) {
      if (!cells) return
      const s = timeline(t)
      const dt = Math.min(0.1, Math.max(0, t - lastT))
      lastT = t
      if (s.upcoming >= 0 && s.upcoming !== reportedForm) {
        reportedForm = s.upcoming
        onFormRef.current?.(s.upcoming)
      }
      lean.x += (lean.tx - lean.x) * 0.04
      lean.y += (lean.ty - lean.y) * 0.04
      updateTrail(performance.now() / 1000)
      const reservoir = still ? 1 : smoothstep(t / 1.5)

      gl!.bindVertexArray(vao)

      // Pass 1: ray-march the form into colour and defocus targets.
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, sceneFb)
      gl!.viewport(0, 0, cells, cells)
      gl!.useProgram(scene)
      gl!.uniform1f(su.uN, cells)
      gl!.uniform1f(su.uTime, t)
      gl!.uniform1i(su.uForm, s.form)
      gl!.uniform1f(su.uAge, s.age)
      gl!.uniform4fv(su.uSeed, s.seed)
      gl!.uniform2f(su.uLean, lean.x, lean.y)
      gl!.uniform1i(su.uMaxSteps, QUALITY[quality].steps)
      gl!.uniform3fv(su.uAccent, s.accent)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      gl!.activeTexture(gl!.TEXTURE0)
      gl!.bindTexture(gl!.TEXTURE_2D, colorTex)
      gl!.generateMipmap(gl!.TEXTURE_2D)

      // Particles: advance their state, reading the fresh scene for targets.
      if (particleUpdate && particleSets.length && dt > 0) {
        const src = particleSets[particleRead]
        const dst = particleSets[1 - particleRead]
        gl!.bindFramebuffer(gl!.FRAMEBUFFER, dst.fb)
        gl!.viewport(0, 0, PARTICLE_SIDE, PARTICLE_SIDE)
        gl!.useProgram(particleUpdate)
        gl!.activeTexture(gl!.TEXTURE3)
        gl!.bindTexture(gl!.TEXTURE_2D, src.a)
        gl!.activeTexture(gl!.TEXTURE4)
        gl!.bindTexture(gl!.TEXTURE_2D, src.b)
        gl!.uniform1i(pu.uStateA, 3)
        gl!.uniform1i(pu.uStateB, 4)
        gl!.uniform1i(pu.uScene, 0)
        gl!.uniform4f(pu.uRectN, rect.x / width, rect.y / height, rect.size / width, rect.size / height)
        gl!.uniform1f(pu.uAspect, width / height)
        gl!.uniform1f(pu.uTime, t)
        gl!.uniform1f(pu.uDt, dt)
        gl!.uniform1f(pu.uFlow, s.flow)
        gl!.uniform1f(pu.uRate, s.rate)
        gl!.drawArrays(gl!.TRIANGLES, 0, 3)
        particleRead = 1 - particleRead
      }

      // Pass 2: background bands at low resolution, bent around the form.
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, bandFb)
      gl!.viewport(0, 0, bandW, bandH)
      gl!.useProgram(bands)
      gl!.uniform1i(bu.uScene, 0)
      gl!.uniform2f(bu.uBandRes, bandW, bandH)
      gl!.uniform2f(bu.uScreen, width, height)
      gl!.uniform3f(bu.uRect, rect.x, rect.y, rect.size)
      gl!.uniform1f(bu.uTime, t)
      gl!.uniform1f(bu.uPresence, s.condense)
      gl!.uniform4fv(bu.uTrail, trailData)
      gl!.uniform3fv(bu.uAccent, s.accent)
      gl!.uniform1f(bu.uReservoir, reservoir)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)

      // Pass 3: full-screen composite of base, bands, grain and form.
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
      gl!.viewport(0, 0, width, height)
      gl!.useProgram(composite)
      gl!.activeTexture(gl!.TEXTURE1)
      gl!.bindTexture(gl!.TEXTURE_2D, auxTex)
      gl!.activeTexture(gl!.TEXTURE2)
      gl!.bindTexture(gl!.TEXTURE_2D, bandTex)
      gl!.uniform1i(cu.uScene, 0)
      gl!.uniform1i(cu.uAux, 1)
      gl!.uniform1i(cu.uBands, 2)
      gl!.uniform2f(cu.uScreen, width, height)
      gl!.uniform1f(cu.uDpr, dpr)
      gl!.uniform3f(cu.uRect, rect.x, rect.y, rect.size)
      gl!.uniform1f(cu.uTime, t)
      gl!.uniform1f(cu.uIntro, 1)
      gl!.uniform1f(cu.uCondense, s.condense)
      gl!.uniform4fv(cu.uTrail, trailData)
      gl!.uniform3fv(cu.uAccent, s.accent)
      gl!.uniform1f(cu.uFlow, s.flow)
      gl!.uniform1f(cu.uStreams, s.streams * reservoir * 0.75)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)

      // Particles on top, as grain-sized points.
      if (particleDraw && particleSets.length) {
        const cur = particleSets[particleRead]
        gl!.useProgram(particleDraw)
        gl!.activeTexture(gl!.TEXTURE3)
        gl!.bindTexture(gl!.TEXTURE_2D, cur.a)
        gl!.activeTexture(gl!.TEXTURE4)
        gl!.bindTexture(gl!.TEXTURE_2D, cur.b)
        gl!.uniform1i(pd.uStateA, 3)
        gl!.uniform1i(pd.uStateB, 4)
        gl!.uniform2f(pd.uCssScreen, width / dpr, height / dpr)
        gl!.uniform1f(pd.uPointSize, Math.max(1, Math.round(dpr * 1.25)))
        gl!.uniform3fv(pd.uAccent, s.accent)
        gl!.enable(gl!.BLEND)
        gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA)
        gl!.drawArrays(gl!.POINTS, 0, PARTICLE_SIDE * PARTICLE_SIDE)
        gl!.disable(gl!.BLEND)
      }
    }

    resize()
    const observer = new ResizeObserver(() => {
      resize()
      if (fixedT !== null) draw(fixedT)
    })
    observer.observe(canvas)

    function release() {
      observer.disconnect()
      for (const p of [scene, bands, composite, particleUpdate, particleDraw]) if (p) gl!.deleteProgram(p)
      for (const set of particleSets) {
        gl!.deleteTexture(set.a)
        gl!.deleteTexture(set.b)
        gl!.deleteFramebuffer(set.fb)
      }
      for (const tex of [colorTex, auxTex, bandTex]) if (tex) gl!.deleteTexture(tex)
      gl!.deleteFramebuffer(sceneFb)
      gl!.deleteFramebuffer(bandFb)
      gl!.deleteVertexArray(vao)
    }

    // Still mode: one frame, redrawn only on resize.
    if (still) {
      draw(fixedT ?? STILL_T)
      return release
    }

    window.addEventListener("pointermove", onPointer, { passive: true })
    window.addEventListener("pointerdown", onPointer, { passive: true })
    document.documentElement.addEventListener("pointerleave", onLeave)

    // Adaptive quality: if frames keep arriving slowly, step down a level.
    const intervals: number[] = []
    let lastFrameAt = 0

    const t0 = performance.now()
    let lastDraw = -Infinity
    let raf = 0
    function tick(now: number) {
      raf = requestAnimationFrame(tick)
      const t = fixedT ?? startAt + (now - t0) / 1000
      if (fixedT === null && t - lastDraw < 1 / FPS - 0.002) return
      lastDraw = t
      if (fixedT === null && lastFrameAt) {
        const gap = now - lastFrameAt
        if (gap < 250) intervals.push(gap) // ignore pauses such as hidden tabs
        if (intervals.length >= QUALITY_SAMPLES) {
          const sorted = [...intervals].sort((a, b) => a - b)
          if (sorted[sorted.length >> 1] > SLOW_FRAME_MS && quality < QUALITY.length - 1) {
            quality++
            resize()
          }
          intervals.length = 0
        }
      }
      lastFrameAt = now
      draw(t)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("pointerdown", onPointer)
      document.documentElement.removeEventListener("pointerleave", onLeave)
      release()
    }
  }, [still])

  return <canvas ref={ref} aria-hidden className={className} />
}
