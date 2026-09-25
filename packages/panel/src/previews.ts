// Thumbnails of looks, captured from the field when a look is saved or
// loaded, and kept in this browser (they'd bloat the looks files).
const KEY = "harasyn-panel:previews"
const LIMIT = 60

type Previews = Record<string, { url: string; at: number }>

function read(): Previews {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}")
  } catch {
    return {}
  }
}

export function getPreview(id: string): string | undefined {
  return read()[id]?.url
}

export function setPreview(id: string, url: string) {
  const all = read()
  all[id] = { url, at: Date.now() }
  // Keep the most recent ones.
  const kept = Object.entries(all).sort(([, a], [, b]) => b.at - a.at).slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Storage full or blocked: previews are a nicety.
  }
}

export function movePreview(from: string, to: string) {
  const url = getPreview(from)
  if (url) setPreview(to, url)
}
