import { describe, expect, it } from "vitest"
import { validateScene } from "../src/validate"
import { applyPatch, DEFAULT_SCENE, PALETTES } from "../src/scene"
import { FORM_NAMES } from "../src/sources/forms"

describe("validateScene", () => {
  it("accepts the default scene and typical patches", () => {
    expect(validateScene(DEFAULT_SCENE)).toEqual([])
    expect(validateScene({ style: { palette: "ember", kind: "ascii" } })).toEqual([])
    expect(validateScene({ source: { type: "text", text: "hello" } })).toEqual([])
    expect(validateScene({ motion: { autoplay: { forms: [{ type: "text", text: "hi" }, "cells"], hold: 8 } } })).toEqual([])
    expect(validateScene({ motion: { autoplay: null } })).toEqual([])
  })

  it("accepts every built-in form, in a source and in autoplay", () => {
    for (const form of FORM_NAMES) expect(validateScene({ source: { type: "shape", form } })).toEqual([])
    expect(validateScene({ motion: { autoplay: { forms: FORM_NAMES, hold: 8 } } })).toEqual([])
  })

  it("names each bad setting in plain words", () => {
    expect(validateScene({ style: { size: 99 } })).toEqual(["style.size: must be at most 20 (got 99)"])
    expect(validateScene({ source: { type: "shape", form: "cube" } })[0]).toMatch(/^source\.form: must be one of "cells"/)
    expect(validateScene({ source: { type: "blob" } })[0]).toMatch(/^source\.type: must be one of "shape", "sdf", "curve", "text"/)
    expect(validateScene({ style: { palette: { rim: "blue" } } })).toEqual(['style.palette.rim: must be a hex colour, like #d9d6ce (got "blue")'])
    expect(validateScene({ colour: 1 })[0]).toMatch(/^colour: is not a setting here/)
    expect(validateScene({ particles: { count: "lots" } })[0]).toMatch(/"auto" or a whole number/)
    expect(validateScene({ source: { type: "text", text: "x".repeat(81) } })[0]).toMatch(/at most 80 characters/)
  })
})

describe("applyPatch", () => {
  it("merges parts, replaces sources whole, and expands palette names", () => {
    const next = applyPatch(DEFAULT_SCENE, { style: { palette: "ocean", size: 2 }, source: { type: "shape", form: "knot" } })
    expect(next.style.palette).toEqual(PALETTES.ocean)
    expect(next.style.size).toBe(2)
    expect(next.style.kind).toBe(DEFAULT_SCENE.style.kind)
    expect(next.source).toEqual({ type: "shape", form: "knot" })
    expect(DEFAULT_SCENE.style.size).toBe(1.5) // not mutated
  })

  it("rejects unknown palette names", () => {
    expect(() => applyPatch(DEFAULT_SCENE, { style: { palette: "neon" as "v1" } })).toThrow(/Unknown palette "neon"/)
  })
})
