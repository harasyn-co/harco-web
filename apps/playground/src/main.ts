import { createField, FORM_NAMES, type Field } from "@harasyn/engine"
import { devLooksStore, mountStudio, sceneFromHash } from "@harasyn/studio"

const canvas = document.getElementById("field") as HTMLCanvasElement

let field: Field
try {
  // ?reduced forces reduced motion, to preview it without changing system settings.
  // #scene=... holds a shared scene (see "Copy link").
  const params = new URLSearchParams(location.search)
  field = createField(canvas, sceneFromHash() ?? {
    motion: { autoplay: { forms: FORM_NAMES, hold: 12 } },
  }, { reducedMotion: params.has("reduced") ? true : undefined })
} catch (err) {
  document.body.append(Object.assign(document.createElement("p"), { className: "error", textContent: (err as Error).message }))
  throw err
}
// Handy for driving the field from the console or an agent.
;(window as unknown as { field: Field }).field = field

// Looks save into the site (see vite.config.ts): style here, save, and set
// the site's default.
mountStudio(field, { title: "Engine playground", shareLinks: true, looks: devLooksStore() })
