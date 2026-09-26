// Pages drawn entirely by particles, from tiles baked by scripts/bake.ts:
// each tile is a raster layer, one particle per inked pixel, placed exactly
// on the screen's pixels. Only tiles in view are drawn. Links are empty hit
// areas over where the tiles show them; no text is in the page.
//
// Pages are baked at 1x and 2x; high-density screens take 2x, one particle
// per device pixel, and need a larger pool of particles (DENSE_COUNT).
import { useEffect, useRef } from "react"
import { preloadRaster, type Field, type LayerSpec } from "@harasyn/engine"
import manifest from "../../../../baked/manifest.json"
import { Link } from "../router"

export interface Baked {
  width: number
  height: number
  /** Source pixels per CSS px. */
  scale: number
  tiles: { src: string; top: number; height: number; ink: number }[]
  links: { href: string; x: number; y: number; w: number; h: number }[]
}

export const pages = manifest.pages as Record<string, { title: string; widths: Baked[] }>
export const ui = manifest.ui as Record<string, Baked[]>

/** The density this screen takes. */
export const density = () => ((window.devicePixelRatio || 1) >= 1.5 ? 2 : 1)
/** Particles the reading pages need at this density. */
export const readingCount = () => (density() === 2 ? 262144 : 147456)

/**
 * The widest baked version that fits, at this screen's density (or any
 * density, if this one wasn't baked). Null when there's nothing baked, e.g.
 * a page added since the last bake.
 */
export function pick(versions: Baked[] | undefined, available = Infinity): Baked | null {
  if (!versions?.length) return null
  const d = density()
  const atDensity = versions.filter((b) => b.scale === d)
  const sorted = (atDensity.length ? atDensity : versions).slice().sort((a, b) => b.width - a.width)
  return sorted.find((b) => b.width <= available) ?? sorted[sorted.length - 1]
}

/** Fetches and decodes a page's first screen of tiles ahead of time. */
export function preload(baked: Baked, screens = 1) {
  for (const t of baked.tiles) if (t.top < window.innerHeight * screens) void preloadRaster(t.src)
}

const idFor = (src: string) => "t-" + (src.match(/-([0-9a-f]{10})\.png$/)?.[1] ?? src.replace(/[^a-z0-9]/gi, "").slice(-12).toLowerCase())

// Tiles this far (CSS px) outside the view are already placed, so text
// scrolling in is there before it shows.
const LOOKAHEAD = 200

/**
 * Layers for a baked piece whose top-left corner is at (left, top) in the
 * viewport, CSS px. Tiles off screen are left out; those `instant` says
 * so appear at once instead of condensing out of dust.
 */
export function bakedLayers(field: Field, baked: Baked, left: number, top: number, instant: (id: string) => boolean = () => false): LayerSpec[] {
  const total = Math.max(1, field.stats().particles)
  // World units per source pixel.
  const px = field.fit({ left: 0, top: 0, width: 1, height: 1 }).width / baked.scale
  const layers: LayerSpec[] = []
  for (const t of baked.tiles) {
    const y = top + t.top
    if (y + t.height < -LOOKAHEAD || y > window.innerHeight + LOOKAHEAD) continue
    const id = idFor(t.src)
    layers.push({
      id,
      ...(instant(id) ? { instant: true } : {}),
      // A little over the ink, so every pixel gets a particle.
      share: Math.min(0.85, Math.max(0.01, (t.ink * 1.01 + 64) / total)),
      model: "print",
      space: "screen",
      at: field.fit({ left, top: y, width: 0, height: 0 }).at,
      scale: px,
      source: { type: "raster", src: t.src },
    })
  }
  return layers.slice(0, 6)
}

const PAD_BOTTOM = 0.3  // of the view height, below the page

/** A baked page, its left edge at `left`, following the window's scroll. */
export function BakedPage({ field, baked, left, top }: { field: Field | null; baked: Baked; left: number; top: number }) {
  // The whole page is fetched and decoded up front, so scrolling never waits.
  useEffect(() => { preload(baked, Infinity) }, [baked])

  // Every frame: place the tiles in view; the field only hears of changes.
  // Only the tiles showing when the page opens condense out of dust; any
  // that come into view later (or again) are simply there.
  const last = useRef("")
  useEffect(() => {
    if (!field) return
    let frame = 0
    let opening: Set<string> | null = null
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const scrolledTop = Math.round(top - window.scrollY)
      const ids = bakedLayers(field, baked, left, scrolledTop).map((l) => l.id)
      if (!opening) {
        const inView = baked.tiles.filter((t) => scrolledTop + t.top + t.height > 0 && scrolledTop + t.top < window.innerHeight)
        opening = new Set(inView.map((t) => idFor(t.src)))
      }
      else for (const id of opening) if (!ids.includes(id)) opening.delete(id)  // left the view: next time, instant
      const first = opening
      const layers = bakedLayers(field, baked, left, scrolledTop, (id) => !first.has(id))
      const key = JSON.stringify(layers)
      if (key === last.current) return
      last.current = key
      try { field.set({ layers }) } catch (err) { console.error(err) }
    }
    tick()
    return () => { cancelAnimationFrame(frame); last.current = "" }
  }, [field, baked, left, top])

  return (
    <div className="baked" style={{ height: top + baked.height + window.innerHeight * PAD_BOTTOM }}>
      {baked.links.map((l, i) => {
        const style = { left: left + l.x - 6, top: top + l.y - 4, width: l.w + 12, height: l.h + 8 }
        return l.href.startsWith("/")
          ? <Link key={i} to={l.href} className="baked-link" style={style} />
          : <a key={i} href={l.href} target="_blank" rel="noreferrer" className="baked-link" style={style} />
      })}
    </div>
  )
}
