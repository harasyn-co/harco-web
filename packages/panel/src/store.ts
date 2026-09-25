// The browser side of the studio-looks dev endpoint (see ../vite.ts).
import type { Looks, LooksStore } from "./index"

export function devLooksStore(endpoint = "/__studio/looks"): LooksStore {
  async function call(body?: object): Promise<Looks> {
    const res = await fetch(endpoint, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : undefined)
    const data = await res.json().catch(() => ({ error: `The dev server didn't answer (${res.status})` }))
    if (!res.ok) throw new Error(data.error ?? `Saving failed (${res.status})`)
    return data
  }
  return {
    load: () => call(),
    save: (name, scene, makeActive) => call({ action: "save", name, scene, makeActive }),
    setActive: (name) => call({ action: "activate", name }),
    remove: (name) => call({ action: "remove", name }),
  }
}
