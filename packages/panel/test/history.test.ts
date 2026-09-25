import { describe, expect, it } from "vitest"
import { applyPatch, DEFAULT_SCENE } from "@harasyn/engine"
import { History, sceneKey } from "../src/history"

describe("History", () => {
  it("steps back and forward through recorded states", () => {
    const h = new History("a")
    expect(h.record("b")).toBe(true)
    expect(h.record("b")).toBe(false) // unchanged
    h.record("c")
    expect(h.undo()).toBe("b")
    expect(h.undo()).toBe("a")
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBe("b")
    h.record("d") // a new change drops the redo trail
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe("b")
  })
})

describe("sceneKey", () => {
  it("ignores the form while autoplay is choosing it", () => {
    const auto = applyPatch(DEFAULT_SCENE, { motion: { autoplay: { forms: ["cells", "knot"], hold: 12 } } })
    const moved = applyPatch(auto, { source: { type: "shape", form: "knot" } })
    expect(sceneKey(moved)).toBe(sceneKey(auto))
    const held = applyPatch(auto, { motion: { autoplay: null } })
    const heldMoved = applyPatch(held, { source: { type: "shape", form: "knot" } })
    expect(sceneKey(heldMoved)).not.toBe(sceneKey(held))
  })
})
