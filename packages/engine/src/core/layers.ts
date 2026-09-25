// Layers share one pool of particles by rows of the particle texture: each
// layer owns a contiguous band of rows, sized by its share. Every pass runs
// once per layer, clipped to its band.

/**
 * Splits `side` rows between a base layer and extra layers. Extra layers get
 * their share (at least one row each); the base gets what's left, but never
 * less than `minBase` of the rows. Returns [start, end) row ranges, base first.
 */
export function allocateRows(side: number, extraShares: number[], minBase = 0.1): [number, number][] {
  const shares = extraShares.map((s) => Math.max(0, s))
  const total = shares.reduce((a, b) => a + b, 0)
  // Squeeze the extra layers if they'd leave the base too little.
  const room = 1 - minBase
  const scale = total > room ? room / total : 1
  const rows = shares.map((s) => Math.max(1, Math.round(s * scale * side)))
  let used = rows.reduce((a, b) => a + b, 0)
  // Rounding can overshoot; take the excess back from the largest layers.
  while (used > side - Math.ceil(minBase * side) && rows.some((r) => r > 1)) {
    const i = rows.indexOf(Math.max(...rows))
    rows[i]--
    used--
  }
  const ranges: [number, number][] = [[0, side - used]]
  let start = side - used
  for (const r of rows) {
    ranges.push([start, start + r])
    start += r
  }
  return ranges
}
