import { describe, expect, it } from "vitest"
import { allocateRows } from "../src/core/layers"
import { MODELS, MODEL_NAMES } from "../src/core/models"
import { validateScene } from "../src/validate"

describe("allocateRows", () => {
  it("gives the base every row when there are no layers", () => {
    expect(allocateRows(256, [])).toEqual([[0, 256]])
  })

  it("splits rows by share, base first, with no gaps", () => {
    const ranges = allocateRows(100, [0.2, 0.1])
    expect(ranges).toEqual([[0, 70], [70, 90], [90, 100]])
  })

  it("gives every layer at least one row", () => {
    const ranges = allocateRows(64, [0.001, 0.001])
    expect(ranges.slice(1).every(([a, b]) => b - a >= 1)).toBe(true)
  })

  it("squeezes layers so the base keeps its minimum", () => {
    for (const side of [16, 100, 181, 256]) {
      const ranges = allocateRows(side, [0.9, 0.9, 0.9])
      expect(ranges[0][1]).toBeGreaterThanOrEqual(Math.ceil(side * 0.1))
      expect(ranges.at(-1)![1]).toBe(side)
      ranges.slice(1).forEach(([a], i) => expect(a).toBe(ranges[i][1]))
    }
  })
})

describe("layers and models in scenes", () => {
  it("accepts layers and models", () => {
    expect(validateScene({ particles: { model: "lite" } })).toEqual([])
    expect(validateScene({ layers: [{ id: "head", share: 0.2, model: "type", space: "screen", at: [0, 0.6], scale: 0.7, source: { type: "text", text: "hi" } }] })).toEqual([])
    expect(validateScene({ layers: [] })).toEqual([])
  })

  it("names bad layers", () => {
    expect(validateScene({ particles: { model: "fast" } })[0]).toMatch(/^particles\.model: must be one of/)
    expect(validateScene({ layers: [{ id: "Head!", share: 0.2, source: { type: "text", text: "hi" } }] })[0]).toMatch(/^layers\[0\]\.id: must be a name in lower case/)
    expect(validateScene({ layers: [{ id: "a", share: 2, source: { type: "text", text: "hi" } }] })[0]).toMatch(/^layers\[0\]\.share/)
    expect(validateScene({ layers: [{ id: "a", share: 0.2 }] })[0]).toMatch(/source/)
  })

  it("keeps Sculpt as the engine's original flight", () => {
    expect(MODELS.sculpt.flight).toEqual([0.6, 1.8, 0.9, 3])
    expect(MODEL_NAMES).toEqual(["sculpt", "type", "relief", "wave", "lite"])
  })
})
