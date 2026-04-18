import { useEffect, useState } from "react"
import { ParticleBackground } from "@/components/particle-background"
import { Typewriter } from "@/components/typewriter"

const SCROLL_TEXT =
  "Building digital tools that solve real problems without the baggage. One-time prices. No subscriptions. No upsells. Just useful software."

function App() {
  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    function onScroll() {
      const scrollY = window.scrollY
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll <= 0) { setCharCount(0); return }
      const progress = Math.min(1, scrollY / maxScroll)
      setCharCount(Math.round(progress * SCROLL_TEXT.length))
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const isScrolling = charCount > 0

  return (
    <div className="relative" style={{ height: "300vh" }}>
      <ParticleBackground />
      <div className="fixed inset-0 z-10 flex items-center">
        <div className="pl-[8vw] max-w-[680px] font-mono text-[clamp(1.1rem,2.2vw,1.8rem)] font-normal leading-[1.6] -tracking-[0.02em] text-white/65">
          <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000">
            <Typewriter hideCursor={isScrolling} frozen={isScrolling} />
          </div>
          {isScrolling && (
            <div className="mt-4">
              {SCROLL_TEXT.slice(0, charCount)}
              <span className="ml-1 inline-block h-[0.75em] w-[0.5em] translate-y-[0.05em] animate-blink bg-white/40" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
