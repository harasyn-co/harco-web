import { createField, type Field, type ScenePatch } from "@harasyn/engine"
import { mountStudio, sceneFromHash } from "@harasyn/studio"
// The starting scene; the site's default look uses the same settings.
import defaultScene from "./default-scene.json"

const canvas = document.getElementById("field") as HTMLCanvasElement

let field: Field
try {
  // ?reduced forces reduced motion, to preview it without changing system settings.
  // #scene=... holds a shared scene (see "Copy link").
  const params = new URLSearchParams(location.search)
  field = createField(canvas, sceneFromHash() ?? (defaultScene as ScenePatch),
    { reducedMotion: params.has("reduced") ? true : undefined })
} catch (err) {
  document.body.append(Object.assign(document.createElement("p"), { className: "error", textContent: (err as Error).message }))
  throw err
}
// Handy for driving the field from the console or an agent.
;(window as unknown as { field: Field }).field = field

mountStudio(field, { title: "Engine playground", shareLinks: true })
