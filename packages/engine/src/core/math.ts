export const DEG = Math.PI / 180

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Object-to-world rotation as a column-major mat3: turn about the vertical
 * axis by yaw, then tip the top towards the viewer by pitch (radians).
 */
export function orbit(yaw: number, pitch: number): Float32Array {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  // Rx(pitch) * Ry(yaw)
  return new Float32Array([
    cy, sp * sy, -cp * sy,
    0, cp, sp,
    sy, -sp * cy, cp * cy,
  ])
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h.slice(0, 6), 16)
  if (Number.isNaN(n)) throw new Error(`Not a hex colour: ${hex}`)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
