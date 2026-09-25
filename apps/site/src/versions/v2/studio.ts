// Development only: opens the studio over the page, saving looks into this
// version's looks.json through the dev server. App.tsx loads this module only
// when import.meta.env.DEV is true, so it never reaches a build.
import type { Field } from "@harasyn/engine"
import { mountStudio, type Looks, type LooksStore, type Studio } from "@harasyn/studio"

async function call(body?: object): Promise<Looks> {
  const res = await fetch("/__studio/looks", body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Saving failed (${res.status})`)
  return data
}

const store: LooksStore = {
  load: () => call(),
  save: (name, scene, makeActive) => call({ action: "save", name, scene, makeActive }),
  setActive: (name) => call({ action: "activate", name }),
  remove: (name) => call({ action: "remove", name }),
}

let studio: Studio | null = null
let mountedOn: Field | null = null

export function toggleStudio(field: Field) {
  if (studio && mountedOn !== field) { studio.destroy(); studio = null }
  if (!studio) {
    studio = mountStudio(field, { title: "Studio", looks: store, folded: false })
    mountedOn = field
    return
  }
  studio.toggle()
}

export function closeStudio() {
  studio?.destroy()
  studio = null
  mountedOn = null
}
