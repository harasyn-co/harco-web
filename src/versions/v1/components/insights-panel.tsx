import { useEffect, useRef, type Ref } from "react"
import { formatDate } from "../content/format"
import type { Insight } from "../content/insights"

// The list of posts shown over the shattered form. Its content starts hidden
// and is revealed by the text particles. Choosing a post opens it; clicking
// anywhere outside the list, or pressing Escape, returns home.
export function InsightsPanel({
  id, posts, contentRef, onSelect, onClose,
}: {
  id: string
  posts: Insight[]
  contentRef: Ref<HTMLDivElement>
  onSelect: (slug: string) => void
  onClose: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="fixed inset-0 z-20 flex items-center justify-center px-[clamp(20px,3vw,40px)] py-24"
      onClick={(e) => {
        if (!(e.target as Element).closest("[data-insights-content]")) onClose()
      }}
    >
      {/* Soft scrim so the scattered grain doesn't compete with the text. */}
      <div
        aria-hidden
        className="animate-in fade-in duration-700 pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(2,2,3,0.72)_0%,rgba(2,2,3,0.45)_40%,transparent_75%)]"
      />
      <div ref={contentRef} data-insights-content style={{ visibility: "hidden" }} className="relative w-full max-w-[560px] max-h-full overflow-y-auto">
        <h2
          id={`${id}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="mb-8 font-mono text-[0.8125rem] -tracking-[0.02em] text-white/45 outline-none"
        >
          insights
        </h2>
        <ol className="space-y-7">
          {posts.map((post) => (
            <li key={post.slug}>
              <a
                href={post.href}
                onClick={(e) => { e.preventDefault(); onSelect(post.slug) }}
                className="group block focus-visible:outline-none"
              >
                <p className="font-mono text-[0.75rem] -tracking-[0.02em] text-white/40">
                  <time dateTime={post.date}>{formatDate(post.date)}</time>
                  <span aria-hidden> · </span>
                  {post.readingMinutes} min read
                </p>
                <h3 className="mt-1.5 font-sans text-[1.25rem] leading-snug font-medium -tracking-[0.01em] text-white/85 transition-colors group-hover:text-white group-focus-visible:text-white">
                  {post.title}
                  <span aria-hidden className="ml-2 inline-block text-white/0 transition-all group-hover:translate-x-1 group-hover:text-white/60 group-focus-visible:text-white/60">
                    →
                  </span>
                </h3>
                <p className="mt-1.5 font-mono text-[0.8125rem] leading-[1.6] -tracking-[0.02em] text-white/55">
                  {post.excerpt}
                </p>
              </a>
            </li>
          ))}
        </ol>
        {/* Invisible until focused, so keyboard and screen reader users have a
            way back besides Escape. */}
        <button
          type="button"
          onClick={onClose}
          className="sr-only mt-8 font-mono text-[0.8125rem] -tracking-[0.02em] text-white/65 focus-visible:not-sr-only focus-visible:text-white/90 focus-visible:outline-none"
        >
          back to home
        </button>
      </div>
    </section>
  )
}
