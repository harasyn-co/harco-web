// The articles: a list at /experiments and a reading view at /experiments/<slug>,
// drawn entirely in particles from baked tiles (see baked.tsx).
import { useEffect, useRef, useState } from "react"
import type { Field } from "@harasyn/engine"
import { navigate } from "../router"
import { BakedPage, pages, pick, preload } from "./baked"
import "./reading.css"

// Where the page starts, below the wordmark.
const topFor = (h: number) => Math.round(Math.min(180, Math.max(120, h * 0.18)))
const PAD = (w: number) => Math.min(40, Math.max(20, w * 0.03))

function useView() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [view, setView] = useState(read)
  useEffect(() => {
    const onResize = () => setView(read())
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return view
}

export default function Experiments({ field, path }: { field: Field | null; path: string }) {
  const entry = pages[path]
  const { w, h } = useView()
  const root = useRef<HTMLDivElement>(null)
  const isList = path === "/experiments"

  useEffect(() => { if (!entry) navigate("/experiments") }, [entry])

  useEffect(() => {
    if (!entry) return
    const before = document.title
    document.title = `${entry.title} · Harasyn Co.`
    return () => { document.title = before }
  }, [entry])

  // Once scrolled, a scrim keeps the page from running into the wordmark.
  useEffect(() => {
    const update = () => root.current?.toggleAttribute("data-scrolled", window.scrollY > 24)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  // The list closes (back home) on a click away from its articles, or Escape.
  useEffect(() => {
    if (!isList) return
    const close = () => navigate("/")
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target || target.closest("a, button, input, .hs-studio")) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    document.addEventListener("click", onClick)
    window.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("click", onClick); window.removeEventListener("keydown", onKey) }
  }, [isList])

  // From the list, get each article's first screen ready.
  useEffect(() => {
    if (!isList) return
    for (const [key, page] of Object.entries(pages)) {
      const version = key !== "/experiments" && pick(page.widths, w - 2 * PAD(w))
      if (version) preload(version)
    }
  }, [isList, w])

  const baked = entry && pick(entry.widths, w - 2 * PAD(w))
  if (!baked) return null
  return (
    <div ref={root} className="reading">
      <div className="reading-scrim" />
      {/* A centred column; the text in it is left-aligned (baked that way). */}
      <BakedPage key={path} field={field} baked={baked} left={Math.round((w - baked.width) / 2)} top={topFor(h)} />
    </div>
  )
}
