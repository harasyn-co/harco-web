export interface Insight {
  slug: string
  title: string
  /** ISO date, e.g. "2026-09-12". */
  date: string
  readingMinutes: number
  excerpt: string
  href: string
}

// PLACEHOLDER: sample entries so the list can be designed. Replace with real
// posts before v1 goes live.
export const INSIGHTS: Insight[] = [
  {
    slug: "experimentation-mode",
    title: "Working in experimentation mode",
    date: "2026-09-12",
    readingMinutes: 4,
    excerpt: "Why we ship small, strange prototypes before committing to a product.",
    href: "#",
  },
  {
    slug: "minimal-surfaces",
    title: "Minimal surfaces as interface metaphors",
    date: "2026-08-28",
    readingMinutes: 7,
    excerpt: "What gyroids and soap films can teach us about designing interfaces.",
    href: "#",
  },
  {
    slug: "agentic-interaction",
    title: "Notes on agentic interaction models",
    date: "2026-08-03",
    readingMinutes: 9,
    excerpt: "Sketching how people and software agents might share a single workspace.",
    href: "#",
  },
  {
    slug: "hardware-constraints",
    title: "Optimizing for the hardware you actually have",
    date: "2026-07-15",
    readingMinutes: 6,
    excerpt: "Adaptive quality, frame budgets, and building for the median device.",
    href: "#",
  },
  {
    slug: "one-time-prices",
    title: "The case for one-time prices",
    date: "2026-06-30",
    readingMinutes: 5,
    excerpt: "Software without subscriptions, upsells, or the usual baggage.",
    href: "#",
  },
]
