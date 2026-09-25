// The panel is dark glass (true black at 65%, blurring what's behind it)
// whatever the palette; the palette sets its accent, lightened until it
// reads on black. `lightPalette` says whether the palette itself is light
// (paper), for anything drawn in its colours on the glass.
import type { Palette } from "@harasyn/engine"

type Rgb = [number, number, number]

const parse = (hex: string): Rgb => {
  let h = hex.replace("#", "")
  if (h.length === 3) h = [...h].map((c) => c + c).join("")
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const luma = (c: Rgb) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
const rgba = (c: Rgb, a: number) => `rgb(${c.map(Math.round).join(" ")} / ${a})`

export type PanelTheme = Record<`--hs-${string}`, string> & { lightPalette: boolean }

export function panelTheme(palette: Palette): PanelTheme {
  const lightPalette = luma(parse(palette.background)) > 0.5
  let accent = parse(palette.accent === "form" ? palette.rim : palette.accent)
  for (let i = 0; i < 14 && luma(accent) < 0.6; i++) accent = mix(accent, [255, 255, 255], 0.12)
  const fg: Rgb = [244, 243, 238]
  const white: Rgb = [255, 255, 255]
  return {
    lightPalette,
    "--hs-card": "rgb(0 0 0 / 0.65)",
    "--hs-foot": "rgb(0 0 0 / 0.3)",
    "--hs-sunken": rgba(white, 0.05),
    "--hs-raised": rgba(white, 0.09),
    "--hs-fg": toHex(fg),
    "--hs-dim": rgba(fg, 0.58),
    "--hs-faint": rgba(fg, 0.38),
    "--hs-line": rgba(white, 0.09),
    "--hs-line-strong": rgba(white, 0.16),
    "--hs-accent": toHex(accent),
    "--hs-accent-bg": rgba(accent, 0.16),
    "--hs-accent-line": rgba(accent, 0.5),
    "--hs-primary-bg": "#f5f4f0",
    "--hs-primary-fg": "#0b0b0c",
  }
}

/** Applies a theme's variables to an element. */
export function applyTheme(el: HTMLElement, theme: PanelTheme) {
  for (const [k, v] of Object.entries(theme)) if (k.startsWith("--")) el.style.setProperty(k, v as string)
}
