import { useState } from "react"
import { GlyphScene } from "./components/glyph-scene"
import { FORM } from "./components/glyph-scene-shaders"
import { Typewriter } from "./components/typewriter"
import { Wordmark } from "./components/wordmark"

// Each form has a matching tagline, typed out as the form condenses.
const PHRASES: Record<number, string> = {
  [FORM.CELLS]: "in experimentation mode",
  [FORM.GYROID]: "optimizing hardware",
  [FORM.KNOT]: "optimizing hardware",
  [FORM.HARMONIC]: "building agentic interaction models",
  [FORM.BULB]: "building agentic interaction models",
}

// TODO: confirm this address before publishing v1.
const CONTACT_HREF = "mailto:hello@harasyn.co"

// Shown instead of the live scene when WebGL2 is unavailable.
const POSTER_SRC = "/v1-poster.jpg"

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// In development, `?poster` hides the text so a clean poster can be captured.
const hideChrome = import.meta.env.DEV && new URLSearchParams(window.location.search).has("poster")

function App() {
  // Null until the first form begins to condense; the tagline types out then.
  const [form, setForm] = useState<number | null>(null)
  const [supported, setSupported] = useState(true)
  const [reducedMotion] = useState(prefersReducedMotion)

  return (
    <div className="relative h-dvh overflow-hidden">
      {supported ? (
        <GlyphScene
          className="pointer-events-none fixed inset-0 h-full w-full"
          still={reducedMotion}
          onForm={setForm}
          onUnsupported={() => setSupported(false)}
        />
      ) : (
        <img src={POSTER_SRC} alt="" className="pointer-events-none fixed inset-0 h-full w-full object-cover" />
      )}
      {!hideChrome && (
        <>
          <header className="fixed inset-x-0 top-0 z-10 px-[clamp(20px,3vw,40px)] pt-[max(clamp(20px,3vw,40px),env(safe-area-inset-top))]">
            <h1 className="animate-in fade-in slide-in-from-top-2 duration-1000">
              <Wordmark className="block h-auto w-[100px] text-[#d9d6ce]" />
            </h1>
          </header>
          <footer
            className="fixed inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 px-[clamp(20px,3vw,40px)] pb-[max(clamp(20px,3vw,40px),env(safe-area-inset-bottom))] font-mono text-[0.8125rem] font-normal leading-[1.6] -tracking-[0.02em]"
          >
            <p className="animate-in fade-in slide-in-from-bottom-2 duration-1000 text-white/65">
              <Typewriter text={form === null ? (supported ? "" : PHRASES[FORM.CELLS]) : PHRASES[form]} animate={!reducedMotion} />
            </p>
            <a
              href={CONTACT_HREF}
              className="animate-in fade-in duration-1000 shrink-0 text-white/65 transition-colors hover:text-white/90 focus-visible:text-white/90 focus-visible:outline-none"
            >
              contact
            </a>
          </footer>
        </>
      )}
    </div>
  )
}

export default App
