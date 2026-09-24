import { useEffect, useRef } from "react"
import type { Insight } from "../content/insights"

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

// The list of posts shown over the shattered form. It fades in after a short
// delay so the form has blown apart first.
export function InsightsPanel({ id, posts, onClose }: { id: string; posts: Insight[]; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="fixed inset-0 z-10 flex items-center justify-center px-[clamp(20px,3vw,40px)] py-24"
    >
      {/* Soft scrim so the scattered grain doesn't compete with the text. */}
      <div
        aria-hidden
        className="animate-in fade-in duration-700 pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(2,2,3,0.72)_0%,rgba(2,2,3,0.45)_40%,transparent_75%)]"
      />
      <div className="relative animate-in fade-in slide-in-from-bottom-3 fill-mode-both delay-300 duration-700 w-full max-w-[560px] max-h-full overflow-y-auto">
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
              <a href={post.href} className="group block focus-visible:outline-none">
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
      </div>
    </section>
  )
}
