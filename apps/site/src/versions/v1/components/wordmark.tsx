// Custom HARCO wordmark, drawn on a 100-unit cap height.
// Verticals are 28 units thick, horizontals 24, outer corners 40, counters 16.
// Letters are 14 units apart. Colour comes from `currentColor`.
const LETTERS = [
  // H
  { x: 0, d: "M0 0H28V44H122V0H150V100H122V68H28V100H0Z" },
  // A
  {
    x: 164,
    d: "M0 100V40A40 40 0 0 1 40 0H120A40 40 0 0 1 160 40V100H132V68H28V100ZM28 44V40A16 16 0 0 1 44 24H116A16 16 0 0 1 132 40V44Z",
  },
  // R: notch on the right where the bowl meets the leg
  {
    x: 338,
    d: "M0 0H110A40 40 0 0 1 150 40V54A14 14 0 0 1 136 68H150V100H122V68H28V100H0ZM28 24H106A16 16 0 0 1 122 40V44H28Z",
  },
  // C: flat horizontal terminals
  {
    x: 502,
    d: "M164.8 36A40 40 0 0 0 125 0H40A40 40 0 0 0 0 40V60A40 40 0 0 0 40 100H125A40 40 0 0 0 164.8 64H136.49A16 16 0 0 1 121 76H44A16 16 0 0 1 28 60V40A16 16 0 0 1 44 24H121A16 16 0 0 1 136.49 36Z",
  },
  // O
  {
    x: 681,
    d: "M40 0H130A40 40 0 0 1 170 40V60A40 40 0 0 1 130 100H40A40 40 0 0 1 0 60V40A40 40 0 0 1 40 0ZM44 24H126A16 16 0 0 1 142 40V60A16 16 0 0 1 126 76H44A16 16 0 0 1 28 60V40A16 16 0 0 1 44 24Z",
  },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 851 100"
      role="img"
      aria-label="HARCO"
      className={className}
      fill="currentColor"
      fillRule="evenodd"
    >
      {LETTERS.map(({ x, d }) => (
        <path key={x} transform={x ? `translate(${x} 0)` : undefined} d={d} />
      ))}
    </svg>
  )
}
