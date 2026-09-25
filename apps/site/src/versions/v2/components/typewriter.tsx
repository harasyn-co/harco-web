import { useEffect, useLayoutEffect, useRef, useState } from "react"

const TYPE_SPEED = 80
const DELETE_SPEED = 45
const GAP = 400 // pause between deleting the old text and typing the new

// Shared canvas for measuring glyphs.
let measureCtx: CanvasRenderingContext2D | null = null

// Monospace glyphs sit inside a fixed-width cell, so the first letter's ink
// starts a little right of the text's left edge. Returns that gap in px.
function leftBearing(el: HTMLElement, ch: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d")
  if (!measureCtx) return 0
  const cs = getComputedStyle(el)
  measureCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  // actualBoundingBoxLeft is negative when ink starts right of the origin
  return -measureCtx.measureText(ch).actualBoundingBoxLeft
}

// Shows `text` with a blinking block cursor. When `text` changes, the old
// text is deleted and the new text typed out. With `animate` off, it swaps
// instantly.
export function Typewriter({ text, animate = true }: { text: string; animate?: boolean }) {
  const [displayed, setDisplayed] = useState(text)
  const shown = useRef(text)
  const textRef = useRef<HTMLSpanElement>(null)
  const firstChar = displayed[0] ?? ""

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const show = (s: string) => { shown.current = s; setDisplayed(s) }

    function type(i: number) {
      if (cancelled) return
      show(text.slice(0, i))
      if (i < text.length) timer = setTimeout(() => type(i + 1), TYPE_SPEED)
    }
    function erase() {
      if (cancelled) return
      const cur = shown.current
      if (cur === text) return
      if (cur.length === 0) { timer = setTimeout(() => type(1), GAP); return }
      show(cur.slice(0, -1))
      timer = setTimeout(erase, DELETE_SPEED)
    }

    timer = setTimeout(animate ? erase : () => show(text), 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [text, animate])

  // Pull the text left by the first letter's side bearing so its ink lines
  // up exactly with the wordmark's edge. Re-run once web fonts load.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el) return
    const apply = () => {
      el.style.marginLeft = firstChar ? `${-leftBearing(el, firstChar)}px` : ""
    }
    apply()
    let active = true
    document.fonts.ready.then(() => { if (active) apply() })
    return () => { active = false }
  }, [firstChar])

  return (
    <span ref={textRef} className="inline-block">
      {displayed}
      <span className="ml-1 inline-block h-[0.75em] w-[0.5em] translate-y-[0.05em] animate-blink bg-white/40" />
    </span>
  )
}
