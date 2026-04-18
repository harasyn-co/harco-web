import { useEffect, useRef } from "react"

const TRAIL_FADE = 0.02
const BRIGHTNESS_CAP = 30
const CLAMP_INTERVAL = 120

const bands = [
  {
    cx: 0.12, cy: 0.15, spread: 0.18, angle: -38,
    colors: [
      [120, 40, 130, 0.28],
      [100, 30, 115, 0.22],
      [40, 75, 160, 0.35],
      [30, 65, 150, 0.30],
      [20, 100, 145, 0.25],
      [15, 85, 130, 0.22],
    ],
    count: 350,
  },
  {
    cx: 0.68, cy: 0.48, spread: 0.20, angle: -33,
    colors: [
      [18, 85, 140, 0.25],
      [15, 95, 135, 0.23],
      [22, 75, 130, 0.22],
      [12, 105, 145, 0.20],
      [25, 65, 120, 0.18],
    ],
    count: 300,
  },
]

interface Band {
  cx: number
  cy: number
  spread: number
  angle: number
  colors: number[][]
  count: number
}

class Particle {
  band: Band
  x = 0; y = 0; px = 0; py = 0
  vx = 0; vy = 0
  r = 0; g = 0; b = 0
  alpha = 0; life = 0; age = 0; lineWidth = 0

  constructor(band: Band, W: number, H: number) {
    this.band = band
    this.reset(W, H)
  }

  reset(W: number, H: number) {
    const b = this.band
    const angle = b.angle * Math.PI / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    const along = (Math.random() - 0.5) * 2.5
    const across = (Math.random() - 0.5) * b.spread

    const colorBias = (across / b.spread) + 0.5
    const ci = Math.floor(colorBias * (b.colors.length - 1))
    const c = b.colors[Math.min(ci, b.colors.length - 1)]

    this.x = (b.cx + along * cos - across * sin) * W
    this.y = (b.cy + along * sin + across * cos) * H
    this.px = this.x
    this.py = this.y

    const speed = 0.3 + Math.random() * 0.6
    const wander = (Math.random() - 0.5) * 0.3
    this.vx = cos * speed + sin * wander
    this.vy = sin * speed - cos * wander

    this.r = c[0]
    this.g = c[1]
    this.b = c[2]
    this.alpha = c[3] * (0.7 + Math.random() * 0.3)
    this.life = 600 + Math.random() * 1000
    this.age = 0
    this.lineWidth = 1.5 + Math.random() * 2.5
  }

  update(t: number, W: number, H: number) {
    this.px = this.x
    this.py = this.y

    const nx = Math.sin(this.x * 0.003 + t * 0.4) * 0.04
    const ny = Math.cos(this.y * 0.003 + t * 0.3) * 0.04
    this.vx += nx
    this.vy += ny

    const b = this.band
    const dx = b.cx * W - this.x
    const dy = b.cy * H - this.y
    this.vx += dx * 0.00003
    this.vy += dy * 0.00003

    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy)
    if (speed > 1.5) {
      this.vx = (this.vx / speed) * 1.5
      this.vy = (this.vy / speed) * 1.5
    }

    this.vx *= 0.998
    this.vy *= 0.998

    this.x += this.vx
    this.y += this.vy
    this.age++

    const margin = 200
    if (this.age > this.life ||
        this.x < -margin || this.x > W + margin ||
        this.y < -margin || this.y > H + margin) {
      this.reset(W, H)
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const frac = this.age / this.life
    const fadeIn = Math.min(1, this.age / 80)
    const fadeOut = frac > 0.75 ? 1 - (frac - 0.75) / 0.25 : 1
    const a = this.alpha * fadeIn * fadeOut
    if (a < 0.01) return

    ctx.beginPath()
    ctx.moveTo(this.px, this.py)
    ctx.lineTo(this.x, this.y)
    ctx.strokeStyle = `rgba(${this.r},${this.g},${this.b},${a})`
    ctx.lineWidth = this.lineWidth
    ctx.stroke()
  }
}

const GRAIN_SIZE = 256
const GRAIN_DENSITY = 0.4
const GRAIN_REFRESH = 12

export function ParticleBackground() {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const dtRef = useRef<HTMLCanvasElement>(null)
  const grainRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const bgCanvas = bgRef.current!
    const dtCanvas = dtRef.current!
    const grainCanvas = grainRef.current!
    const bgCtx = bgCanvas.getContext("2d")!
    const dtCtx = dtCanvas.getContext("2d")!
    const grainCtx = grainCanvas.getContext("2d")!

    // Grain tile rendered offscreen, tiled onto the grain canvas
    const grainTile = document.createElement("canvas")
    grainTile.width = grainTile.height = GRAIN_SIZE
    const gtCtx = grainTile.getContext("2d")!
    const grainImg = gtCtx.createImageData(GRAIN_SIZE, GRAIN_SIZE)
    const totalPixels = GRAIN_SIZE * GRAIN_SIZE

    let W: number, H: number, dpr: number
    let particles: Particle[] = []
    let grainPattern: CanvasPattern | null = null

    function resize() {
      dpr = window.devicePixelRatio || 1
      W = Math.max(window.innerWidth, screen.width || 0)
      H = Math.max(window.innerHeight, screen.height || 0)
      bgCanvas.width = dtCanvas.width = W * dpr
      bgCanvas.height = dtCanvas.height = H * dpr
      grainCanvas.width = W * dpr
      grainCanvas.height = H * dpr
      bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dtCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      grainCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      grainPattern = null
      bgCtx.fillStyle = "#020203"
      bgCtx.fillRect(0, 0, W, H)
      dtCtx.fillStyle = "#020203"
      dtCtx.fillRect(0, 0, W, H)
    }

    function init() {
      resize()
      particles = []
      for (const band of bands) {
        for (let i = 0; i < band.count; i++) {
          particles.push(new Particle(band, W, H))
        }
      }
    }

    function regenerateGrain() {
      const d = grainImg.data
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4
        if (Math.random() < GRAIN_DENSITY) {
          const v = 180 + Math.random() * 75
          d[idx] = d[idx + 1] = d[idx + 2] = v
          d[idx + 3] = 4 + Math.random() * 14
        } else {
          d[idx + 3] = 0
        }
      }
      gtCtx.putImageData(grainImg, 0, 0)
      grainPattern = grainCtx.createPattern(grainTile, "repeat")
    }

    init()

    let resizeTimer: ReturnType<typeof setTimeout>
    function onResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 200)
    }
    window.addEventListener("resize", onResize)

    let lastTime = 0
    let elapsed = 0
    let raf: number
    let frame = 0

    const sampleW = 32
    const sampleH = 18
    const sampleCanvas = document.createElement("canvas")
    sampleCanvas.width = sampleW
    sampleCanvas.height = sampleH
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true })!

    function clampBrightness(
      source: HTMLCanvasElement,
      ctx: CanvasRenderingContext2D,
    ) {
      sampleCtx.drawImage(source, 0, 0, sampleW, sampleH)
      const data = sampleCtx.getImageData(0, 0, sampleW, sampleH).data
      let peak = 0
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        if (lum > peak) peak = lum
      }
      if (peak > BRIGHTNESS_CAP) {
        const overshoot = (peak - BRIGHTNESS_CAP) / peak
        ctx.globalCompositeOperation = "source-over"
        ctx.fillStyle = `rgba(3, 3, 5, ${Math.min(overshoot * 0.8, 0.25)})`
        ctx.fillRect(0, 0, W, H)
      }
    }

    function render(ts: number) {
      const dt = Math.min(ts - lastTime, 32)
      lastTime = ts
      elapsed += dt
      const t = elapsed * 0.001
      frame++

      bgCtx.globalCompositeOperation = "source-over"
      bgCtx.fillStyle = `rgba(2, 2, 3, ${TRAIL_FADE})`
      bgCtx.fillRect(0, 0, W, H)

      dtCtx.globalCompositeOperation = "source-over"
      dtCtx.fillStyle = `rgba(2, 2, 3, ${TRAIL_FADE * 2})`
      dtCtx.fillRect(0, 0, W, H)

      bgCtx.globalCompositeOperation = "lighter"
      dtCtx.globalCompositeOperation = "lighter"

      for (const p of particles) {
        p.update(t, W, H)
        p.draw(bgCtx)
        p.draw(dtCtx)
      }

      if (frame % CLAMP_INTERVAL === 0) {
        clampBrightness(bgCanvas, bgCtx)
        clampBrightness(dtCanvas, dtCtx)
      }

      // Refresh grain every few frames for subtle flicker
      if (frame % GRAIN_REFRESH === 0) {
        regenerateGrain()
      }

      grainCtx.clearRect(0, 0, W, H)
      if (grainPattern) {
        grainCtx.fillStyle = grainPattern
        grainCtx.fillRect(0, 0, W, H)
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <>
      <canvas
        ref={bgRef}
        className="fixed blur-[55px]"
        style={{
          top: "calc(-5rem - env(safe-area-inset-top, 0px))",
          right: "calc(-5rem - env(safe-area-inset-right, 0px))",
          bottom: "calc(-5rem - env(safe-area-inset-bottom, 0px))",
          left: "calc(-5rem - env(safe-area-inset-left, 0px))",
        }}
      />
      <canvas
        ref={dtRef}
        className="fixed blur-[12px] mix-blend-lighten opacity-15"
        style={{
          top: "calc(-30px - env(safe-area-inset-top, 0px))",
          right: "calc(-30px - env(safe-area-inset-right, 0px))",
          bottom: "calc(-30px - env(safe-area-inset-bottom, 0px))",
          left: "calc(-30px - env(safe-area-inset-left, 0px))",
        }}
      />
      <canvas
        ref={grainRef}
        className="fixed pointer-events-none"
        style={{
          top: "calc(-1px - env(safe-area-inset-top, 0px))",
          right: "calc(-1px - env(safe-area-inset-right, 0px))",
          bottom: "calc(-1px - env(safe-area-inset-bottom, 0px))",
          left: "calc(-1px - env(safe-area-inset-left, 0px))",
        }}
      />
    </>
  )
}
