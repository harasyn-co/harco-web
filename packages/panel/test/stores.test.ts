import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SCENE, type Scene } from "@harasyn/engine"
import { browserLooksStore, cleanToken, githubLooksStore } from "../src/stores"

const scene = DEFAULT_SCENE as Scene

describe("browserLooksStore", () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it("saves, lists sorted, and removes looks", async () => {
    const store = browserLooksStore("test")
    expect(await store.load()).toEqual({ active: null, looks: {} })
    await store.save("zeta", scene, false)
    const after = await store.save("alpha", scene, false)
    expect(Object.keys(after.looks)).toEqual(["alpha", "zeta"])
    expect(Object.keys((await store.remove("zeta")).looks)).toEqual(["alpha"])
  })
})

describe("githubLooksStore", () => {
  const file = (looks: object) => ({ content: btoa(JSON.stringify(looks)), sha: "abc" })
  afterEach(() => vi.unstubAllGlobals())

  it("reads without a key and refuses to save without one", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(file({ active: "site", looks: { site: scene } })), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const store = githubLooksStore({ repo: "o/r", path: "looks.json", branch: "main" })
    expect((await store.load()).active).toBe("site")
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization")
    await expect(store.save("x", scene, false)).rejects.toThrow(/owner key/)
  })

  it("retries once when someone else committed first, then commits", async () => {
    const puts: RequestInit[] = []
    let conflicts = 1
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push(init)
        if (conflicts-- > 0) return new Response("{}", { status: 409 })
        return new Response("{}", { status: 200 })
      }
      return new Response(JSON.stringify(file({ active: "site", looks: { site: scene } })), { status: 200 })
    }))
    const store = githubLooksStore({ repo: "o/r", path: "looks.json", branch: "main", token: "t" })
    const result = await store.save("ember", scene, true)
    expect(puts).toHaveLength(2)
    expect(result.active).toBe("ember")
    expect(JSON.parse(puts[1].body as string).message).toBe("Studio: save look ember as the site default")
  })

  it("explains a key that can't write", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ message: "Resource not accessible" }), { status: 403 })
        : new Response(JSON.stringify(file({ active: null, looks: {} })), { status: 200 })))
    const store = githubLooksStore({ repo: "o/r", path: "looks.json", branch: "main", token: "t" })
    await expect(store.save("x", scene, false)).rejects.toThrow(/can't write to o\/r.*Contents: Read and write/)
  })
})

describe("cleanToken", () => {
  it("strips pasted whitespace and rejects non-tokens", () => {
    expect(cleanToken("  github_pat_ABC\n123 ")).toBe("github_pat_ABC123")
    expect(() => cleanToken("")).toThrow(/Paste the owner key/)
    expect(() => cleanToken("not a token!")).toThrow(/doesn't look like a GitHub token/)
  })
})
