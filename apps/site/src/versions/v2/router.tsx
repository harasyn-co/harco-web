// A small router over the History API: the path as state, and links that
// change it without reloading (so the field keeps running between pages).
import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react"

const listeners = new Set<() => void>()

export function navigate(to: string) {
  if (to === location.pathname) return
  history.pushState(null, "", to)
  window.scrollTo(0, 0)
  listeners.forEach((l) => l())
}

export function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const update = () => setPath(location.pathname)
    listeners.add(update)
    window.addEventListener("popstate", update)
    return () => { listeners.delete(update); window.removeEventListener("popstate", update) }
  }, [])
  return path.replace(/\/+$/, "") || "/"
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    // Let the browser handle new tabs and windows.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={go} {...props} />
}
