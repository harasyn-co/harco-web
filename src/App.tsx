import { ParticleBackground } from "@/components/particle-background"

function App() {
  return (
    <div className="relative h-full overflow-hidden">
      <ParticleBackground />
      <div className="fixed inset-0 z-10 flex items-center justify-center">
        <p className="max-w-[680px] px-8 text-center text-[clamp(1.15rem,2.4vw,1.55rem)] leading-[1.7] font-light tracking-wide text-foreground/88 animate-in fade-in slide-in-from-bottom-6 duration-1000">
          Building digital tools that solve real problems without the baggage.
          One-time prices. No subscriptions. No upsells. Just useful software,
          made with care.
        </p>
      </div>
    </div>
  )
}

export default App
