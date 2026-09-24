import { useImperativeHandle, useRef, type Ref } from "react"

export interface TextParticlesHandle {
  /** Turns the element's text into particles that drift away, then hides it. */
  dissolve(el: HTMLElement): Promise<void>
  /** Gathers particles into the (hidden) element's text, then reveals it. */
  assemble(el: HTMLElement): Promise<void>
}

// Upper bound on particles, sampled evenly if the text has more pixels lit.
const MAX_SPECKS = 18000
const DISSOLVE_SWEEP = 0.3   // seconds for the dissolve to sweep left to right
const DISSOLVE_JITTER = 0.2
const ASSEMBLE_TIME = 0.75
const ASSEMBLE_JITTER = 0.35

interface Sample { x: number; y: number; r: number; g: number; b: number; a: number }

interface Speck extends Sample {
  sx: number; sy: number   // start position (assemble)
  px: number; py: number   // current position
  vx: number; vy: number
  delay: number
  life: number
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

const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3)

// A full-screen overlay that turns page text into grain-sized particles and
// back. Views call dissolve() before they leave and assemble() when they
// arrive, so text on the page is made of the same material as the scene.
export function TextParticles({ ref, reducedMotion }: { ref: Ref<TextParticlesHandle>; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frame = useRef(0)
  const pending = useRef<(() => void) | null>(null)

  function run(el: HTMLElement, mode: "in" | "out"): Promise<void> {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const reveal = () => { el.style.visibility = mode === "in" ? "visible" : "hidden" }
    if (reducedMotion || !canvas || !ctx) { reveal(); return Promise.resolve() }

    // Finish any animation still running before starting another.
    cancelAnimationFrame(frame.current)
    pending.current?.()

    const width = window.innerWidth
    const height = window.innerHeight
    const samples = sampleText(el, width, height)
    if (mode === "out") el.style.visibility = "hidden"
    canvas.width = width
    canvas.height = height
    const image = ctx.createImageData(width, height)
    const pixels = new Uint32Array(image.data.buffer)

    const specks: Speck[] = samples.map((s) => {
      const out = mode === "out"
      return {
        ...s,
        sx: out ? s.x : s.x + (Math.random() - 0.5) * 180,
        sy: out ? s.y : s.y + 30 + Math.random() * 140,
        px: s.x,
        py: s.y,
        vx: (Math.random() - 0.5) * 50,
        vy: -(10 + Math.random() * 45),
        delay: out
          ? (s.x / width) * DISSOLVE_SWEEP + Math.random() * DISSOLVE_JITTER
          : Math.random() * ASSEMBLE_JITTER,
        life: out ? 0.6 + Math.random() * 0.5 : ASSEMBLE_TIME,
      }
    })
    const duration = specks.reduce((m, p) => Math.max(m, p.delay + p.life), 0)

    return new Promise((resolve) => {
      // Safety net: if frames stop (for example a background tab), finish
      // anyway so the page never gets stuck between views.
      const watchdog = setTimeout(() => finish(), (duration + 0.5) * 1000)
      const finish = () => {
        clearTimeout(watchdog)
        cancelAnimationFrame(frame.current)
        if (pending.current !== finish) return
        pending.current = null
        ctx.clearRect(0, 0, width, height)
        reveal()
        resolve()
      }
      pending.current = finish
      const start = performance.now()
      let last = start

      function tick(now: number) {
        const t = (now - start) / 1000
        const dt = Math.min(0.05, (now - last) / 1000)
        last = now
        pixels.fill(0)
        for (const p of specks) {
          let alpha: number
          if (mode === "out") {
            const age = t - p.delay
            if (age >= p.life) continue
            if (age > 0) {
              // Drift up and away with a little turbulence.
              p.vx += (Math.random() - 0.5) * 120 * dt
              p.vy -= 40 * dt
              p.px += p.vx * dt
              p.py += p.vy * dt
            }
            alpha = p.a * Math.pow(1 - Math.max(0, age) / p.life, 1.5)
          } else {
            const k = easeOutCubic(Math.min(1, Math.max(0, (t - p.delay) / p.life)))
            if (k <= 0) continue
            const wobble = (1 - k) * 6 * Math.sin(t * 9 + p.x * 0.3)
            p.px = p.sx + (p.x - p.sx) * k + wobble
            p.py = p.sy + (p.y - p.sy) * k
            alpha = p.a * k
          }
          const x = Math.round(p.px)
          const y = Math.round(p.py)
          if (x < 0 || y < 0 || x >= width || y >= height) continue
          const a = Math.round(Math.min(1, alpha) * 255)
          pixels[y * width + x] = ((a << 24) | (p.b << 16) | (p.g << 8) | p.r) >>> 0
        }
        ctx!.putImageData(image, 0, 0)
        if (t < duration) frame.current = requestAnimationFrame(tick)
        else finish()
      }
      frame.current = requestAnimationFrame(tick)
    })
  }

  useImperativeHandle(ref, () => ({
    dissolve: (el) => run(el, "out"),
    assemble: (el) => run(el, "in"),
  }))

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 h-full w-full [image-rendering:pixelated]"
    />
  )
}
