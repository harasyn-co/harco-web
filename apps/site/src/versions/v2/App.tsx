import { useEffect, useMemo, useState } from "react"
import { DEFAULT_SCENE, type Field as EngineField, type FormName, type ScenePatch } from "@harasyn/engine"
import { Field } from "@harasyn/engine/react"
import looks from "./looks.json"
import { Wordmark } from "./components/wordmark"
import { Link, usePath } from "./router"

// The site's look is the active entry in looks.json, including what the
// particles cycle through (the forms, and the tagline typed out in particles).
// In development, the studio (⌥⇧S, or ?studio) edits and saves looks; see
// studio.ts.
const LOOK = (looks.looks as Record<string, ScenePatch>)[looks.active] ?? {}

// Articles (/experiments) are compiled out of builds until they go live; see
// articlesLive in site.config.ts. Their code is loaded up front into state
// rather than with React.lazy, whose Suspense reveal is throttled (~300 ms),
// so opening them is instant.
type ExperimentsModule = typeof import("./experiments/Experiments")

type BakedModule = typeof import("./experiments/baked")

const padFor = (w: number) => Math.min(40, Math.max(20, w * 0.03))

// The Experiments link on the home page: baked, drawn by particles, top right.
function navBox(baked: BakedModule, w: number) {
  const nav = baked.pick(baked.ui["nav-experiments"])
  if (!nav) return null
  const pad = padFor(w)
  return { nav, left: Math.round(w - pad - nav.width), top: Math.round(pad - 3) }
}

// Home: the look as saved, the form in the middle (and the nav, when there).
const home = (baked: BakedModule | null, w: number, field: EngineField | null): ScenePatch => {
  const box = baked && field ? navBox(baked, w) : null
  return {
    ...LOOK,
    // Everything the reading pages change goes back, including what the
    // look leaves at the defaults (its resting dust, the particle count).
    motion: { ...LOOK.motion, instant: false },
    reservoir: { ...DEFAULT_SCENE.reservoir, ...LOOK.reservoir },
    particles: { ...DEFAULT_SCENE.particles, ...LOOK.particles },
    place: { space: "world", at: [0, 0, 0], scale: 1, visible: true },
    layers: box && field && baked ? baked.bakedLayers(field, box.nav, box.left, box.top) : [],
  }
}

// Reading: only the page shows. The form lets go and its particles rest
// out of sight (no resting dust in view); the page's particles condense in
// with a trace of dust (the print model). Pages are one particle per pixel
// of ink, so they get a larger pool.
const READING_FORM: ScenePatch["source"] =
  LOOK.source?.type === "shape" ? LOOK.source
    : { type: "shape", form: (LOOK.motion?.autoplay?.forms?.find((f) => typeof f === "string") as FormName | undefined) ?? "cells" }
const reading = (count: number): ScenePatch => ({
  ...LOOK,
  source: READING_FORM,
  motion: { ...LOOK.motion, autoplay: null, instant: true },
  reservoir: { ...LOOK.reservoir, opacity: 0 },
  particles: { ...LOOK.particles, count },
  place: { space: "world", at: [0, 0, 0], scale: 1, visible: false },
})

// Shown instead of the live field when WebGL2 is unavailable.
const POSTER_SRC = "/v2-poster.jpg"

// In development, `?poster` hides the text so a clean poster can be captured.
const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const hideChrome = !!devParams?.has("poster")

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [size, setSize] = useState(read)
  useEffect(() => {
    const update = () => setSize(read())
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  return size
}

function App() {
  const [field, setField] = useState<EngineField | null>(null)
  const path = usePath()
  const { w, h } = useViewport()
  const [experiments, setExperiments] = useState<ExperimentsModule | null>(null)
  const Experiments = experiments?.default
  const inExperiments = __ARTICLES__ && (path === "/experiments" || path.startsWith("/experiments/"))

  // The baked pages' manifest, loaded only when articles are in the build.
  const [baked, setBaked] = useState<BakedModule | null>(null)
  useEffect(() => { if (__ARTICLES__) void import("./experiments/baked").then(setBaked) }, [])

  useEffect(() => { if (__ARTICLES__) void import("./experiments/Experiments").then(setExperiments) }, [])

  // Once home has settled, get the list's first screen ready.
  useEffect(() => {
    if (!__ARTICLES__ || !baked) return
    const id = window.setTimeout(() => {
      const list = baked.pages["/experiments"]
      const version = list && baked.pick(list.widths, w - 2 * padFor(w))
      if (version) baked.preload(version)
    }, 1500)
    return () => clearTimeout(id)
  }, [baked, w])

  // Recomputed on resize (w, h), as the nav's place depends on the view.
  const scene = useMemo(
    () => (inExperiments ? reading(baked?.readingCount() ?? 147456) : home(__ARTICLES__ ? baked : null, w, field)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inExperiments, w, h, field, baked],
  )
  const nav = __ARTICLES__ && baked && !inExperiments ? navBox(baked, w) : null

  // Development only: the field as `window.field`, for poking at in the console.
  useEffect(() => { if (import.meta.env.DEV) Object.assign(window, { field }) }, [field])

  // Development only: the studio. The whole branch is removed from builds.
  useEffect(() => {
    if (!import.meta.env.DEV || !field) return
    const open = () => import("./studio").then((m) => m.toggleStudio(field))
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyS") { e.preventDefault(); void open() }
    }
    window.addEventListener("keydown", onKey)
    if (devParams?.has("studio")) void open()
    return () => {
      window.removeEventListener("keydown", onKey)
      void import("./studio").then((m) => m.closeStudio())
    }
  }, [field])

  const wordmark = <Wordmark className="block h-auto w-[100px] text-[#d9d6ce]" />
  return (
    <div className={inExperiments ? "relative min-h-dvh" : "relative h-dvh overflow-hidden"}>
      <Field
        scene={scene}
        className="fixed inset-0 h-full w-full touch-none"
        onField={setField}
        fallback={<img src={POSTER_SRC} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />}
      />
      {!hideChrome && (
        <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex items-start justify-between px-[clamp(20px,3vw,40px)] pt-[max(clamp(20px,3vw,40px),env(safe-area-inset-top))]">
          <h1 className="animate-in fade-in slide-in-from-top-2 duration-1000">
            {__ARTICLES__ ? <Link to="/" aria-label="HARCO, home" className="pointer-events-auto block">{wordmark}</Link> : wordmark}
          </h1>

        </header>
      )}
      {nav && (
        // Drawn by the particles; this is only where it can be clicked.
        <Link
          to="/experiments"
          className="fixed z-10 block"
          style={{ left: nav.left - 8, top: nav.top - 6, width: nav.nav.width + 16, height: nav.nav.height + 12 }}
        />
      )}
      {Experiments && inExperiments && <Experiments field={field} path={path} />}
    </div>
  )
}

export default App
