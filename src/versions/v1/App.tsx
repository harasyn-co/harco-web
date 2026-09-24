import { useCallback, useEffect, useRef, useState } from "react"
import { INSIGHTS } from "./content/insights"
import { GlyphScene } from "./components/glyph-scene"
import { FORM } from "./components/glyph-scene-shaders"
import { InsightArticle } from "./components/insight-article"
import { InsightsPanel } from "./components/insights-panel"
import { TextParticles, type TextParticlesHandle } from "./components/text-particles"
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

// Shown instead of the live scene when WebGL2 is unavailable.
const POSTER_SRC = "/v1-poster.jpg"

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

// In development, `?poster` hides the text so a clean poster can be captured,
// and `?insights` opens the insights list on load.
const devParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const hideChrome = !!devParams?.has("poster")
const openInsightsOnLoad = !!devParams?.has("insights")

type View = { kind: "home" } | { kind: "list" } | { kind: "article"; slug: string }

// Pause after opening insights before the list assembles, so the form has
// blown apart first.
const LIST_DELAY_MS = 350

function App() {
  // Null until the first form begins to condense; the tagline types out then.
  const [form, setForm] = useState<number | null>(null)
  const [supported, setSupported] = useState(true)
  const [reducedMotion] = useState(prefersReducedMotion)
  const [view, setView] = useState<View>(openInsightsOnLoad ? { kind: "list" } : { kind: "home" })
  const insightsOpen = view.kind !== "home"
  const insightsButton = useRef<HTMLButtonElement>(null)
  const particles = useRef<TextParticlesHandle>(null)
  const content = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  // Moves between views: the current text dissolves into particles, the
  // view changes, and the next view's text assembles from particles.
  // Leaving a view: its text breaks loose and falls.
  const go = useCallback(async (next: View) => {
    if (busy.current) return
    busy.current = true
    if (content.current && particles.current) await particles.current.dissolve(content.current)
    setView(next)
    busy.current = false
  }, [])
  const openList = useCallback(() => setView({ kind: "list" }), [])
  const goHome = useCallback(() => go({ kind: "home" }), [go])
  const goList = useCallback(() => go({ kind: "list" }), [go])

  // Opening a post: the list explodes from the click, and the same particles
  // regroup as the article's text once it mounts.
  const regroupNext = useRef(false)
  const openArticle = useCallback(async (slug: string, from: { x: number; y: number }) => {
    if (busy.current) return
    busy.current = true
    if (content.current && particles.current) {
      regroupNext.current = true
      await particles.current.explode(content.current, from)
    }
    setView({ kind: "article", slug })
    busy.current = false
  }, [])

  // Whenever a list or article mounts, bring its text in from particles.
  useEffect(() => {
    if (view.kind === "home") return
    const el = content.current
    if (!el) return
    if (regroupNext.current) {
      regroupNext.current = false
      void particles.current?.regroup(el)
      return
    }
    const delay = view.kind === "list" && !reducedMotion ? LIST_DELAY_MS : 0
    const timer = setTimeout(() => { void particles.current?.assemble(el) }, delay)
    return () => clearTimeout(timer)
  }, [view, reducedMotion])

  // Back home: return focus to the insights button once it's rendered again.
  const wasOpen = useRef(insightsOpen)
  useEffect(() => {
    if (wasOpen.current && !insightsOpen) insightsButton.current?.focus()
    wasOpen.current = insightsOpen
  }, [insightsOpen])

  const article = view.kind === "article" ? INSIGHTS.find((p) => p.slug === view.slug) : undefined

  return (
    <div className="relative h-dvh overflow-hidden">
      {supported ? (
        <GlyphScene
          className="pointer-events-none fixed inset-0 h-full w-full"
          still={reducedMotion}
          shattered={insightsOpen}
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
            {!insightsOpen && (
              <button
                ref={insightsButton}
                type="button"
                aria-expanded={false}
                aria-controls="insights"
                onClick={openList}
                className="animate-in fade-in duration-700 shrink-0 cursor-pointer text-white/65 transition-colors hover:text-white/90 focus-visible:text-white/90 focus-visible:outline-none"
              >
                insights
              </button>
            )}
          </footer>
          {view.kind === "list" && (
            <InsightsPanel id="insights" posts={INSIGHTS} contentRef={content} onSelect={openArticle} onClose={goHome} />
          )}
          {article && <InsightArticle key={article.slug} post={article} contentRef={content} onBack={goList} onClose={goHome} />}
          <TextParticles ref={particles} reducedMotion={reducedMotion} />
        </>
      )}
    </div>
  )
}

export default App
