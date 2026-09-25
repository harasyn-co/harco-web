// Moving a floating panel by its head: drag to place it anywhere in the
// window (kept fully inside, and remembered), double-click to send it back
// to its corner. A click that doesn't move counts as a click. Small screens
// keep the panel as a bottom sheet.
const POSITION_KEY = "harasyn-panel:position"
const MARGIN = 8

const small = () => window.matchMedia("(max-width: 600px)").matches

export function makeDraggable(panel: HTMLElement, handle: HTMLElement, onClick: (target: HTMLElement) => void) {
  function place(left: number, top: number) {
    const x = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - panel.offsetWidth - MARGIN))
    const y = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, window.innerHeight - 120))
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto", maxHeight: `${window.innerHeight - y - MARGIN}px` })
  }
  function unplace() {
    Object.assign(panel.style, { left: "", top: "", right: "", bottom: "", maxHeight: "" })
  }

  let drag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null = null
  const saved = (() => { try { return JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") } catch { return null } })()
  if (saved && !small()) place(saved.x, saved.y)

  const down = (e: PointerEvent) => {
    if (small() || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
    const r = panel.getBoundingClientRect()
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false }
    handle.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return
    drag.moved = true
    panel.classList.add("hs-dragging")
    place(e.clientX - drag.dx, e.clientY - drag.dy)
  }
  const up = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const { moved } = drag
    drag = null
    panel.classList.remove("hs-dragging")
    if (!moved) { onClick(e.target as HTMLElement); return }
    const r = panel.getBoundingClientRect()
    try { localStorage.setItem(POSITION_KEY, JSON.stringify({ x: r.left, y: r.top })) } catch { /* not remembered */ }
  }
  const reset = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return
    unplace()
    try { localStorage.removeItem(POSITION_KEY) } catch { /* nothing to forget */ }
  }
  // Keep it inside the window as the window changes.
  const resize = () => {
    if (small()) { unplace(); return }
    if (panel.style.left) place(panel.getBoundingClientRect().left, panel.getBoundingClientRect().top)
  }
  handle.addEventListener("pointerdown", down)
  handle.addEventListener("pointermove", move)
  handle.addEventListener("pointerup", up)
  handle.addEventListener("pointercancel", up)
  handle.addEventListener("dblclick", reset)
  window.addEventListener("resize", resize)
  return () => window.removeEventListener("resize", resize)
}
