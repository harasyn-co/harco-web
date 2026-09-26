import { describe, expect, it } from "vitest"
import { parseArticle } from "../src/content/parse"

describe("parseArticle", () => {
  it("reads front matter and renders the body", () => {
    const a = parseArticle("hello", `---
title: "Hello, world"
date: 2026-09-18
summary: A first piece.
---

Some *text*.

## A heading
`)
    expect(a).toMatchObject({ slug: "hello", title: "Hello, world", date: "2026-09-18", summary: "A first piece.", minutes: 1 })
    expect(a.html).toContain("<em>text</em>")
    expect(a.html).toContain("<h2>A heading</h2>")
  })

  it("falls back to the slug without front matter, and counts reading time", () => {
    const a = parseArticle("untitled", "word ".repeat(500))
    expect(a.title).toBe("untitled")
    expect(a.minutes).toBe(3)
  })
})
