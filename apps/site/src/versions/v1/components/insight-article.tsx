import { useEffect, useRef, type Ref } from "react"
import type { Insight } from "../content/insights"
import { formatDate } from "../content/format"

// A single post, shown in place of the list. It only closes explicitly: the
// back control returns to the list (as does Escape), and close returns home.
export function InsightArticle({
  post, contentRef, onBack, onClose,
}: {
  post: Insight
  contentRef: Ref<HTMLDivElement>
  onBack: () => void
  onClose: () => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onBack() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onBack])

  const control =
    "cursor-pointer font-mono text-[0.8125rem] -tracking-[0.02em] text-white/65 transition-colors hover:text-white/90 focus-visible:text-white/90 focus-visible:outline-none"

  return (
    <article aria-labelledby="article-heading" className="fixed inset-0 z-20 flex justify-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(2,2,3,0.8)_0%,rgba(2,2,3,0.55)_45%,transparent_80%)]"
      />
      <div
        ref={contentRef}
        style={{ visibility: "hidden" }}
        className="relative h-full w-full max-w-[620px] overflow-y-auto px-[clamp(20px,3vw,40px)] pt-24 pb-32 [mask-image:linear-gradient(to_bottom,transparent,black_5rem,black_calc(100%-7rem),transparent)]"
      >
        <nav className="mb-10 flex items-center justify-between">
          <button type="button" onClick={onBack} className={control}>
            ← insights
          </button>
          <button type="button" onClick={onClose} className={control}>
            close
          </button>
        </nav>
        <p className="font-mono text-[0.75rem] -tracking-[0.02em] text-white/40">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden> · </span>
          {post.readingMinutes} min read
        </p>
        <h2
          id="article-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 font-sans text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-medium -tracking-[0.015em] text-white/90 outline-none"
        >
          {post.title}
        </h2>
        <p className="mt-4 font-mono text-[0.8125rem] leading-[1.6] -tracking-[0.02em] text-white/55">{post.excerpt}</p>
        <div className="mt-10 space-y-5 font-sans text-[1.0625rem] leading-[1.75] text-white/75">
          {post.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </article>
  )
}
