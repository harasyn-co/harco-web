// Parsing one Markdown article, shared by the pages and the build (which
// writes a static page per article for search engines and direct links).
import { marked } from "marked"

export interface ArticleMeta {
  slug: string
  title: string
  /** ISO date, e.g. 2026-09-18. */
  date: string
  summary: string
  /** Minutes to read, rounded up. */
  minutes: number
}

export interface Article extends ArticleMeta {
  /** The body as HTML. */
  html: string
}

// Front matter: `key: value` lines between two `---` lines at the top.
export function parseArticle(slug: string, raw: string): Article {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  const fields: Record<string, string> = {}
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "")
  }
  const body = match ? match[2] : raw
  const words = body.split(/\s+/).filter(Boolean).length
  return {
    slug,
    title: fields.title ?? slug,
    date: fields.date ?? "",
    summary: fields.summary ?? "",
    minutes: Math.max(1, Math.ceil(words / 220)),
    html: marked.parse(body, { async: false }),
  }
}
