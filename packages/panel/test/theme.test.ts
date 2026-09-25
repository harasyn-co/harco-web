import { describe, expect, it } from "vitest"
import { PALETTES, type Palette } from "@harasyn/engine"
import { panelTheme } from "../src/theme"

const luma = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}

describe("panelTheme", () => {
  it("keeps every palette's accent readable on the dark glass", () => {
    for (const [name, palette] of Object.entries(PALETTES)) {
      const theme = panelTheme(palette as Palette)
      expect(luma(theme["--hs-accent"]), name).toBeGreaterThanOrEqual(0.58)
      expect(theme["--hs-card"]).toBe("rgb(0 0 0 / 0.65)")
    }
  })

  it("uses the rim when the accent follows each form, and flags light palettes", () => {
    const v1 = panelTheme(PALETTES.v1 as Palette)
    expect(v1.lightPalette).toBe(false)
    expect(panelTheme(PALETTES.paper as Palette).lightPalette).toBe(true)
    const blue = panelTheme({ ...(PALETTES.v1 as Palette), accent: "form" })
    expect(blue["--hs-accent"]).toBe(v1["--hs-accent"])
  })
})
