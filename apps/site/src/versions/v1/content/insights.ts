export interface Insight {
  slug: string
  title: string
  /** ISO date, e.g. "2026-09-12". */
  date: string
  readingMinutes: number
  excerpt: string
  href: string
  /** Article body, one string per paragraph. */
  body: string[]
}

// PLACEHOLDER: sample entries and bodies so the list and article views can be
// designed. Replace with real posts before v1 goes live.

const PLACEHOLDER_BODY = [
  "This is placeholder text for an article that hasn't been written yet. It stands in for real writing so the reading layout, type sizes and line lengths can be judged on the page.",
  "A real post would open with the idea in a sentence or two, then work through the reasoning: what we tried, what surprised us, and what we would do differently next time.",
  "Longer articles would break into short sections, with the occasional pull quote, figure or code sample. Paragraphs stay short so the column remains easy to scan on a phone.",
  "The closing paragraph would point to what comes next: a prototype to try, a follow-up post, or an open question we are still exploring.",
]
export const INSIGHTS: Insight[] = [
  {
    slug: "experimentation-mode",
    title: "Working in experimentation mode",
    date: "2026-09-12",
    readingMinutes: 4,
    excerpt: "Why we ship small, strange prototypes before committing to a product.",
    href: "#",
    body: PLACEHOLDER_BODY,
  },
  {
    slug: "minimal-surfaces",
    title: "Minimal surfaces as interface metaphors",
    date: "2026-08-28",
    readingMinutes: 7,
    excerpt: "What gyroids and soap films can teach us about designing interfaces.",
    href: "#",
    body: PLACEHOLDER_BODY,
  },
  {
    slug: "agentic-interaction",
    title: "Notes on agentic interaction models",
    date: "2026-08-03",
    readingMinutes: 9,
    excerpt: "Sketching how people and software agents might share a single workspace.",
    href: "#",
    body: PLACEHOLDER_BODY,
  },
  {
    slug: "hardware-constraints",
    title: "Optimizing for the hardware you actually have",
    date: "2026-07-15",
    readingMinutes: 6,
    excerpt: "Adaptive quality, frame budgets, and building for the median device.",
    href: "#",
    body: PLACEHOLDER_BODY,
  },
  {
    slug: "one-time-prices",
    title: "The case for one-time prices",
    date: "2026-06-30",
    readingMinutes: 5,
    excerpt: "Software without subscriptions, upsells, or the usual baggage.",
    href: "#",
    body: PLACEHOLDER_BODY,
  },
]
