// Development only: opens the studio over the page, saving looks into this
// version's looks.json through the dev server. App.tsx loads this module only
// when import.meta.env.DEV is true, so it never reaches a build.
import type { Field } from "@harasyn/engine"
import { devLooksStore, mountStudio, type Studio } from "@harasyn/panel"

let studio: Studio | null = null
let mountedOn: Field | null = null

export function toggleStudio(field: Field) {
  if (studio && mountedOn !== field) { studio.destroy(); studio = null }
  if (!studio) {
    studio = mountStudio(field, { title: "Studio", looks: devLooksStore(), folded: false, showsActiveLook: true })
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
