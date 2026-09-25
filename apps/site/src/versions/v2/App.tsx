import { useEffect, useState } from "react"
import type { Field as EngineField, FormName, ScenePatch, SourceSpec } from "@harasyn/engine"
import { Field } from "@harasyn/engine/react"
import looks from "./looks.json"
import { Typewriter } from "./components/typewriter"
import { Wordmark } from "./components/wordmark"

// The site's look is the active entry in looks.json. In development, the
// studio (⌥⇧S, or ?studio) edits and saves looks; see studio.ts.
const LOOK = (looks.looks as Record<string, ScenePatch>)[looks.active] ?? {}

// Each form has a matching tagline, typed out as the form gathers.
const PHRASES: Record<FormName, string> = {
  cells: "in experimentation mode",
  gyroid: "optimizing hardware",
  knot: "optimizing hardware",
  harmonic: "building agentic interaction models",
  chladni: "building agentic interaction models",
}
const phraseFor = (source: SourceSpec) => (source.type === "shape" ? PHRASES[source.form] : PHRASES.cells)

// Shown instead of the live field when WebGL2 is unavailable.
const POSTER_SRC = "/v1-poster.jpg"

// In development, `?poster` hides the text so a clean poster can be captured.
const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const hideChrome = !!devParams?.has("poster")

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function App() {
  const [field, setField] = useState<EngineField | null>(null)
  const [phrase, setPhrase] = useState("")
  const [reducedMotion] = useState(prefersReducedMotion)

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

  return (
    <div className="relative h-dvh overflow-hidden">
      <Field
        scene={LOOK}
        className="fixed inset-0 h-full w-full touch-none"
        onField={setField}
        onSource={(s) => setPhrase(phraseFor(s))}
        fallback={<img src={POSTER_SRC} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />}
      />
      {!hideChrome && (
        <>
          <header className="pointer-events-none fixed inset-x-0 top-0 z-10 px-[clamp(20px,3vw,40px)] pt-[max(clamp(20px,3vw,40px),env(safe-area-inset-top))]">
            <h1 className="animate-in fade-in slide-in-from-top-2 duration-1000">
              <Wordmark className="block h-auto w-[100px] text-[#d9d6ce]" />
            </h1>
          </header>
          <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 px-[clamp(20px,3vw,40px)] pb-[max(clamp(20px,3vw,40px),env(safe-area-inset-bottom))] font-mono text-[0.8125rem] font-normal leading-[1.6] -tracking-[0.02em]">
            <p className="animate-in fade-in slide-in-from-bottom-2 duration-1000 text-white/65">
              <Typewriter text={phrase} animate={!reducedMotion} />
            </p>
          </footer>
        </>
      )}
    </div>
  )
}

export default App
