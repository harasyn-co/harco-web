import { describe, expect, it } from "vitest"
import { encodeScene, sceneFromHash } from "../src/hash"

describe("scene links", () => {
  it("round-trips a scene, including non-ASCII text", () => {
    const scene = { source: { type: "text" as const, text: "φ ░▒▓█ in experimentation mode" }, style: { size: 2 } }
    const hash = `#scene=${encodeScene(scene)}`
    expect(hash).toMatch(/^#scene=[\w-]+$/)
    expect(sceneFromHash(hash)).toEqual(scene)
  })

  it("ignores missing or broken links", () => {
    expect(sceneFromHash("")).toBeNull()
    expect(sceneFromHash("#scene=%%%")).toBeNull()
    expect(sceneFromHash("#scene=bm90IGpzb24")).toBeNull()
  })
})
