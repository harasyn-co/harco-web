// Where looks can be kept, besides the dev server (see store.ts):
//   githubLooksStore: a looks.json in a GitHub repo. Anyone can read a
//     public repo; saving commits the file, which needs a token that can
//     write to the repo.
//   browserLooksStore: this browser's storage, for looks that aren't meant
//     for a site.
import type { Scene } from "@harasyn/engine"
import type { Looks, LooksStore } from "./index"

export interface GitHubLooksOptions {
  /** "owner/repo" */
  repo: string
  /** Path to the looks file in the repo. */
  path: string
  branch: string
  /** A token that can write to the repo; without one the store is read-only. */
  token?: string
}

const API = "https://api.github.com"

// UTF-8 safe base64, as the contents API speaks it.
const toBase64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)))

const sortLooks = (looks: Looks): Looks => ({
  active: looks.active,
  looks: Object.fromEntries(Object.entries(looks.looks).sort(([a], [b]) => a.localeCompare(b))),
})

export function githubLooksStore(options: GitHubLooksOptions): LooksStore & { canSave: boolean } {
  const headers = (): HeadersInit => ({
    Accept: "application/vnd.github+json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  })
  const url = `${API}/repos/${options.repo}/contents/${options.path}`

  // Reads without the key: the file is public, and a stale key shouldn't
  // stop the studio from showing the site's looks.
  async function read(): Promise<{ looks: Looks; sha: string }> {
    const res = await fetch(`${url}?ref=${encodeURIComponent(options.branch)}`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" })
    if (!res.ok) throw new Error(`Couldn't read the site's looks from GitHub (${res.status})`)
    const file = await res.json()
    return { looks: JSON.parse(fromBase64(file.content)), sha: file.sha }
  }

  // Read, change, and commit; retried once if someone else committed first.
  async function change(message: string, edit: (looks: Looks) => void): Promise<Looks> {
    if (!options.token) throw new Error("Saving to the site needs the owner key")
    for (let attempt = 0; attempt < 2; attempt++) {
      const { looks, sha } = await read()
      edit(looks)
      const next = sortLooks(looks)
      const res = await fetch(url, {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          content: toBase64(JSON.stringify(next, null, 2) + "\n"),
          sha,
          branch: options.branch,
        }),
      })
      if (res.ok) return next
      if (res.status === 409 && attempt === 0) continue
      const body = await res.json().catch(() => ({}))
      if (res.status === 401) throw new Error("GitHub no longer accepts the owner key (expired or revoked). Forget it and unlock with a new one.")
      if (res.status === 403 || res.status === 404) throw new Error(`The owner key can't write to ${options.repo}. ${TOKEN_FIX}`)
      throw new Error(`GitHub refused the save (${res.status}${body.message ? `: ${body.message}` : ""})`)
    }
    throw new Error("GitHub refused the save")
  }

  return {
    canSave: !!options.token,
    load: async () => (await read()).looks,
    save: (name, scene, makeActive) =>
      change(`Studio: save look ${name}${makeActive ? " as the site default" : ""}`, (l) => {
        l.looks[name] = scene
        if (makeActive) l.active = name
      }),
    setActive: (name) =>
      change(`Studio: make ${name} the site default`, (l) => {
        if (!l.looks[name]) throw new Error(`No look named ${name}`)
        l.active = name
      }),
    remove: (name) =>
      change(`Studio: delete look ${name}`, (l) => {
        if (l.active === name) throw new Error("The site's default look can't be deleted")
        delete l.looks[name]
      }),
  }
}

const TOKEN_FIX = "Its resource owner must be the repo's owner (e.g. harasyn-co, chosen when the token is made), with repository access to the repo and Contents: Read and write."

/** Removes whitespace a paste can pick up, and rejects anything that isn't a token. */
export function cleanToken(raw: string) {
  const token = raw.replace(/\s+/g, "")
  if (!token) throw new Error("Paste the owner key first")
  if (!/^[A-Za-z0-9_]+$/.test(token)) throw new Error("That doesn't look like a GitHub token (they start with github_pat_ or ghp_)")
  return token
}

/**
 * Checks that a token can write to a file in the repo, without changing
 * anything: it tries to update the file against a made-up version, which
 * GitHub rejects as a conflict (409) if the token may write, and as
 * forbidden (403/404) if it may not. Resolves to the account's login.
 */
export async function checkGitHubToken(repo: string, token: string, path: string, branch: string): Promise<string> {
  const auth = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` }
  const call = async (input: string, init?: RequestInit) => {
    try {
      return await fetch(input, init)
    } catch {
      throw new Error("Couldn't reach GitHub. Check the connection, or that the key has no stray characters.")
    }
  }
  const user = await call(`${API}/user`, { headers: auth })
  if (user.status === 401) throw new Error("GitHub doesn't recognise that key: it may be mistyped, expired or revoked")
  const probe = await call(`${API}/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Studio key check (never committed)", content: "", sha: "0".repeat(40), branch }),
  })
  if (probe.status === 409) return (await user.json().catch(() => null))?.login ?? "owner"
  const body = await probe.json().catch(() => ({}))
  if (probe.status === 403 || probe.status === 404) throw new Error(`That key can't write to ${repo}. ${TOKEN_FIX}`)
  throw new Error(`GitHub answered the key check unexpectedly (${probe.status}${body.message ? `: ${body.message}` : ""})`)
}

/** Looks kept in this browser. There's no site default, so no active look. */
export function browserLooksStore(key = "harasyn-studio:looks"): LooksStore {
  const read = (): Looks => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return JSON.parse(raw)
    } catch {
      // Storage can be unavailable (private windows); start empty.
    }
    return { active: null, looks: {} }
  }
  const write = (looks: Looks) => {
    const next = sortLooks(looks)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      throw new Error("This browser won't let the studio save (storage is blocked)")
    }
    return next
  }
  return {
    load: async () => read(),
    save: async (name, scene: Scene) => { const l = read(); l.looks[name] = scene; return write(l) },
    setActive: async () => read(),
    remove: async (name) => { const l = read(); delete l.looks[name]; return write(l) },
  }
}
