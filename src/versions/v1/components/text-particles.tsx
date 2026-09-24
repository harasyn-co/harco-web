import { useEffect, useImperativeHandle, useRef, type Ref } from "react"

type Point = { x: number; y: number }

export interface TextParticlesHandle {
  /**
   * Turns the element's text into particles and hides it. With `burstFrom`
   * (a viewport point) they explode outward from it before gravity takes
   * over; without it they break loose and fall.
   */
  dissolve(el: HTMLElement, burstFrom?: Point): Promise<void>
  /** Gathers particles into the (hidden) element's text, then reveals it. */
  assemble(el: HTMLElement): Promise<void>
  /**
   * Explodes the element's text from `burstFrom` and keeps the particles in
   * flight, ready for regroup(). Resolves once the burst has spread.
   */
  explode(el: HTMLElement, burstFrom: Point): Promise<void>
  /**
   * Sends the particles in flight to the (hidden) element's text, then
   * reveals it. Spare particles fall away; missing ones split off others.
   */
  regroup(el: HTMLElement): Promise<void>
}

// Upper bound on particles per sampled element.
const MAX_SPECKS = 18000

// Physics, in CSS px and seconds.
const GRAVITY = 1400
const DRAG = 1.6
const FALL_STAGGER = 0.35    // lower lines let go first
const FALL_JITTER = 0.18
const BURST_SPEED = [220, 620] as const
const BURST_STAGGER = 0.12   // specks near the burst point leave first
const EXPLODE_SPREAD = 0.42  // seconds the burst spreads before regrouping
const EXPLODE_GRAVITY = 0.35 // lighter gravity while waiting to regroup

const ASSEMBLE_TIME = 0.75
const ASSEMBLE_JITTER = 0.35
const REGROUP_TIME = [0.8, 1.2] as const
const REGROUP_STAGGER = 0.25

interface Sample { x: number; y: number; r: number; g: number; b: number; a: number }

interface Speck {
  x: number; y: number; vx: number; vy: number
  r: number; g: number; b: number; a: number
  // "fly": free flight under gravity until `life` runs out.
  // "seek": a cubic path from (x0, y0) with velocity (v0x, v0y) that ends at
  // rest on (tx, ty), blending colour from (r0..a0) to (tr..ta).
  mode: "fly" | "seek"
  gravity: number
  age: number
  delay: number
  life: number
  x0: number; y0: number; v0x: number; v0y: number
  tx: number; ty: number
  r0: number; g0: number; b0: number; a0: number
  tr: number; tg: number; tb: number; ta: number
  dur: number
}

// Redraws the element's visible text, character by character at its exact
// on-screen position, into an offscreen canvas at CSS-pixel resolution, and
// returns the lit pixels. One CSS pixel matches the page's grain speck size.
function sampleText(root: HTMLElement, width: number, height: number): Sample[] {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []
  ctx.textBaseline = "alphabetic"
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    const text = node.textContent ?? ""
    if (!parent || !text.trim()) continue
    const cs = getComputedStyle(parent)
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    ctx.fillStyle = cs.color
    const ascent = ctx.measureText("Hg").fontBoundingBoxAscent
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch.trim() === "") continue
      range.setStart(node, i)
      range.setEnd(node, i + 1)
      const r = range.getClientRects()[0]
      if (!r || r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) continue
      ctx.fillText(ch, r.left, r.top + ascent)
    }
  }
  const data = ctx.getImageData(0, 0, width, height).data
  const out: Sample[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]
      if (a > 70) out.push({ x, y, r: data[i], g: data[i + 1], b: data[i + 2], a: a / 255 })
    }
  }
  if (out.length <= MAX_SPECKS) return out
  const keep = MAX_SPECKS / out.length
  return out.filter(() => Math.random() < keep)
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function newSpeck(s: Sample): Speck {
  return {
    x: s.x, y: s.y, vx: 0, vy: 0, r: s.r, g: s.g, b: s.b, a: s.a,
    mode: "fly", gravity: 1, age: 0, delay: 0, life: 1,
    x0: s.x, y0: s.y, v0x: 0, v0y: 0, tx: s.x, ty: s.y,
    r0: s.r, g0: s.g, b0: s.b, a0: s.a, tr: s.r, tg: s.g, tb: s.b, ta: s.a, dur: 1,
  }
}

// Points a speck at a target, continuing smoothly from its current motion.
function seek(p: Speck, target: Sample, delay: number, dur: number) {
  p.mode = "seek"
  p.age = 0
  p.delay = delay
  p.dur = dur
  p.x0 = p.x; p.y0 = p.y
  p.v0x = p.vx; p.v0y = p.vy
  p.tx = target.x; p.ty = target.y
  p.r0 = p.r; p.g0 = p.g; p.b0 = p.b; p.a0 = p.a
  p.tr = target.r; p.tg = target.g; p.tb = target.b; p.ta = target.a
}

// Burst velocity and stagger for a speck exploding from a point.
function burst(p: Speck, from: Point, reach: number) {
  const dx = p.x - from.x
  const dy = p.y - from.y
  const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.9
  const speed = BURST_SPEED[0] + Math.random() * (BURST_SPEED[1] - BURST_SPEED[0])
  p.vx = Math.cos(a) * speed
  p.vy = Math.sin(a) * speed - 120
  p.delay = (Math.hypot(dx, dy) / reach) * BURST_STAGGER * 4 + Math.random() * 0.06
}

function put(pixels: Uint32Array, width: number, height: number, p: Speck, alpha: number) {
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  pixels[y * width + x] = ((a << 24) | (Math.round(p.b) << 16) | (Math.round(p.g) << 8) | Math.round(p.r)) >>> 0
}

// The particle simulation behind TextParticles. One simulation runs for every
// transition, so particles from one view can fly on into the next.
function createTextParticles(canvas: HTMLCanvasElement, reducedMotion: boolean) {
  const sim = {
    specks: [] as Speck[],
    raf: 0,
    last: 0,
    width: 0,
    height: 0,
    image: null as ImageData | null,
    pixels: new Uint32Array(0),
    // Called once every seeking speck has landed.
    onLanded: [] as (() => void)[],
  }

  function ensureCanvas() {
    const s = sim
    const ctx = canvas.getContext("2d")
    if (!ctx) return false
    const width = window.innerWidth
    const height = window.innerHeight
    if (width !== s.width || height !== s.height || !s.image) {
      s.width = width
      s.height = height
      canvas.width = width
      canvas.height = height
      s.image = ctx.createImageData(width, height)
      s.pixels = new Uint32Array(s.image.data.buffer)
    }
    return true
  }

  function step(now: number) {
    const s = sim
    const ctx = canvas.getContext("2d")
    const dt = Math.min(0.05, (now - s.last) / 1000)
    s.last = now
    if (!ctx || !s.image) { s.raf = 0; return }
    const { width, height, pixels } = s
    pixels.fill(0)
    let seeking = 0
    const alive: Speck[] = []

    for (const p of s.specks) {
      p.age += dt
      const t = p.age - p.delay
      if (p.mode === "fly") {
        if (t >= p.life) continue
        if (t > 0) {
          p.vy += GRAVITY * p.gravity * dt
          p.vx -= p.vx * DRAG * dt
          p.vx += (Math.random() - 0.5) * 40 * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
        }
        alive.push(p)
        put(pixels, width, height, p, p.a * Math.pow(1 - Math.max(0, t) / p.life, 1.2))
        continue
      }
      if (t < 0) {
        // Waiting its turn: keep drifting along its old path.
        p.x0 += p.v0x * dt
        p.y0 += p.v0y * dt
        p.v0y += GRAVITY * p.gravity * dt
      }
      const k = Math.min(1, Math.max(0, t / p.dur))
      // Cubic Hermite from (x0, v0) to the target at rest.
      const k2 = k * k
      const k3 = k2 * k
      const h00 = 2 * k3 - 3 * k2 + 1
      const h10 = k3 - 2 * k2 + k
      const h01 = -2 * k3 + 3 * k2
      const m = p.dur * 0.6
      p.x = h00 * p.x0 + h10 * p.v0x * m + h01 * p.tx
      p.y = h00 * p.y0 + h10 * p.v0y * m + h01 * p.ty
      p.r = p.r0 + (p.tr - p.r0) * k
      p.g = p.g0 + (p.tg - p.g0) * k
      p.b = p.b0 + (p.tb - p.b0) * k
      if (k < 1) seeking++
      alive.push(p)
      put(pixels, width, height, p, p.a0 + (p.ta - p.a0) * k)
    }
    s.specks = alive
    ctx.putImageData(s.image, 0, 0)

    if (seeking === 0 && s.onLanded.length) {
      // Landed specks hand over to the real text.
      s.specks = s.specks.filter((p) => p.mode !== "seek")
      const done = s.onLanded
      s.onLanded = []
      done.forEach((fn) => fn())
    }
    if (s.specks.length || s.onLanded.length) {
      s.raf = requestAnimationFrame(step)
    } else {
      ctx.clearRect(0, 0, width, height)
      s.raf = 0
    }
  }

  function start() {
    const s = sim
    if (s.raf) return
    s.last = performance.now()
    s.raf = requestAnimationFrame(step)
  }

  // Resolves and reveals the element when every seeking speck has landed,
  // with a time limit so the page can never get stuck between views.
  function whenLanded(limit: number, el: HTMLElement) {
    return new Promise<void>((resolve) => {
      const s = sim
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        el.style.visibility = "visible"
        resolve()
      }
      s.onLanded.push(finish)
      setTimeout(() => {
        if (settled) return
        s.onLanded = s.onLanded.filter((fn) => fn !== finish)
        s.specks = s.specks.filter((p) => p.mode !== "seek")
        finish()
      }, limit * 1000)
    })
  }

  function sampleAndHide(el: HTMLElement) {
    const s = sim
    const samples = sampleText(el, s.width, s.height)
    el.style.visibility = "hidden"
    return samples
  }

  function dissolve(el: HTMLElement, burstFrom?: Point): Promise<void> {
    if (reducedMotion || !ensureCanvas()) { el.style.visibility = "hidden"; return Promise.resolve() }
    const s = sim
    const samples = sampleAndHide(el)
    let top = Infinity
    let bottom = -Infinity
    for (const p of samples) { top = Math.min(top, p.y); bottom = Math.max(bottom, p.y) }
    const span = Math.max(1, bottom - top)
    const reach = Math.hypot(s.width, s.height)
    let longest = 0
    for (const smp of samples) {
      const p = newSpeck(smp)
      if (burstFrom) {
        burst(p, burstFrom, reach)
        p.life = 0.9 + Math.random() * 0.6
      } else {
        p.vx = (Math.random() - 0.5) * 60
        p.vy = Math.random() * 40
        p.delay = ((bottom - smp.y) / span) * FALL_STAGGER + Math.random() * FALL_JITTER
        p.life = 0.8 + Math.random() * 0.5
      }
      longest = Math.max(longest, p.delay + p.life)
      s.specks.push(p)
    }
    start()
    return new Promise((resolve) => setTimeout(resolve, longest * 1000))
  }

  function assemble(el: HTMLElement): Promise<void> {
    if (reducedMotion || !ensureCanvas()) { el.style.visibility = "visible"; return Promise.resolve() }
    const s = sim
    for (const t of sampleText(el, s.width, s.height)) {
      const p = newSpeck(t)
      p.x = t.x + (Math.random() - 0.5) * 180
      p.y = t.y + 30 + Math.random() * 140
      p.gravity = 0
      seek(p, t, Math.random() * ASSEMBLE_JITTER, ASSEMBLE_TIME)
      p.a0 = 0
      s.specks.push(p)
    }
    start()
    return whenLanded(ASSEMBLE_TIME + ASSEMBLE_JITTER + 0.6, el)
  }

  function explode(el: HTMLElement, burstFrom: Point): Promise<void> {
    if (reducedMotion || !ensureCanvas()) { el.style.visibility = "hidden"; return Promise.resolve() }
    const s = sim
    const reach = Math.hypot(s.width, s.height)
    for (const smp of sampleAndHide(el)) {
      const p = newSpeck(smp)
      burst(p, burstFrom, reach)
      p.gravity = EXPLODE_GRAVITY
      p.life = 4 // held in flight until regroup() claims or releases it
      s.specks.push(p)
    }
    start()
    return new Promise((resolve) => setTimeout(resolve, EXPLODE_SPREAD * 1000))
  }

  function regroup(el: HTMLElement): Promise<void> {
    if (reducedMotion || !ensureCanvas()) { el.style.visibility = "visible"; return Promise.resolve() }
    const s = sim
    const targets = shuffle(sampleText(el, s.width, s.height))
    const flying = shuffle(s.specks.filter((p) => p.mode === "fly"))
    const pickDur = () => REGROUP_TIME[0] + Math.random() * (REGROUP_TIME[1] - REGROUP_TIME[0])
    targets.forEach((t, i) => {
      let p = flying[i]
      if (!p) {
        // More text than particles: split one off a particle in flight.
        const src = flying.length ? flying[Math.floor(Math.random() * flying.length)] : null
        p = src
          ? { ...src, vx: src.vx + (Math.random() - 0.5) * 80, vy: src.vy + (Math.random() - 0.5) * 80 }
          : newSpeck({ ...t, y: t.y + 120 })
        s.specks.push(p)
      }
      seek(p, t, Math.random() * REGROUP_STAGGER, pickDur())
    })
    // Spare particles fall away under full gravity and fade.
    for (let i = targets.length; i < flying.length; i++) {
      const p = flying[i]
      p.gravity = 1
      p.life = Math.max(0, p.age - p.delay) + 0.5 + Math.random() * 0.5
    }
    start()
    return whenLanded(REGROUP_TIME[1] + REGROUP_STAGGER + 0.6, el)
  }

  return {
    dissolve, assemble, explode, regroup,
    destroy: () => cancelAnimationFrame(sim.raf),
  }
}

type Simulation = ReturnType<typeof createTextParticles>

// A full-screen overlay that turns page text into grain-sized particles and
// back.
export function TextParticles({ ref, reducedMotion }: { ref: Ref<TextParticlesHandle>; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<Simulation | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const created = createTextParticles(canvasRef.current, reducedMotion)
    simRef.current = created
    return () => created.destroy()
  }, [reducedMotion])

  // Without a simulation, views just show or hide their text.
  const show = (el: HTMLElement) => { el.style.visibility = "visible"; return Promise.resolve() }
  const hide = (el: HTMLElement) => { el.style.visibility = "hidden"; return Promise.resolve() }
  useImperativeHandle(ref, () => ({
    dissolve: (el, from) => simRef.current?.dissolve(el, from) ?? hide(el),
    assemble: (el) => simRef.current?.assemble(el) ?? show(el),
    explode: (el, from) => simRef.current?.explode(el, from) ?? hide(el),
    regroup: (el) => simRef.current?.regroup(el) ?? show(el),
  }))

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 h-full w-full [image-rendering:pixelated]"
    />
  )
}
