import { createField, CURVES, CURVE_NAMES, FORMS, FORM_NAMES, type CurveName, type Field, type FormName, type Scene, type ScenePatch } from "@harasyn/engine"

const canvas = document.getElementById("field") as HTMLCanvasElement
const panel = document.getElementById("panel")!

let field: Field
try {
  // ?reduced forces reduced motion, to preview it without changing system settings.
  const params = new URLSearchParams(location.search)
  field = createField(canvas, {
    motion: { autoplay: { forms: FORM_NAMES, hold: 12 } },
  }, { reducedMotion: params.has("reduced") ? true : undefined })
} catch (err) {
  panel.innerHTML = `<h1>Engine playground</h1><p class="error">${(err as Error).message}</p>`
  throw err
}
// Handy for driving the field from the console or an agent.
;(window as unknown as { field: Field }).field = field

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []) => {
  const node: HTMLElementTagNameMap[K] = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

function section(title: string, ...rows: Node[]) {
  return el("section", {}, [el("h2", { textContent: title }), ...rows])
}

function segmented<T extends string>(options: readonly T[], label: (v: T) => string, get: () => T, pick: (v: T) => void) {
  const row = el("div", { className: "seg" })
  const buttons = options.map((v) => {
    const b = el("button", { textContent: label(v), type: "button" })
    b.addEventListener("click", () => { pick(v); refresh() })
    row.append(b)
    return { v, b }
  })
  refreshers.push(() => buttons.forEach(({ v, b }) => b.classList.toggle("on", get() === v)))
  return row
}

function slider(label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void) {
  const out = el("output")
  const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) })
  input.addEventListener("input", () => { put(Number(input.value)); refresh() })
  refreshers.push(() => {
    if (document.activeElement !== input) input.value = String(get())
    out.textContent = String(get())
  })
  return el("label", { className: "slider" }, [el("span", { textContent: label }), input, out])
}

function button(label: string, action: () => void) {
  const b = el("button", { textContent: label, type: "button" })
  b.addEventListener("click", () => { action(); refresh() })
  return b
}

const refreshers: (() => void)[] = []
const scene = () => field.getScene()
const set = (patch: ScenePatch) => field.set(patch)
const currentForm = () => { const s = scene().source; return s.type === "shape" ? s.form : ("" as FormName) }
const currentCurve = () => { const s = scene().source; return s.type === "curve" && s.curve ? s.curve : ("" as CurveName) }

const json = el("pre", { className: "json" })
const stats = el("p", { className: "stats" })

// Tap the title to fold the panel away, e.g. on a phone.
const title = el("h1", { textContent: "Engine playground", title: "Show or hide the controls" })
title.addEventListener("click", () => panel.classList.toggle("folded"))
if (window.matchMedia("(max-width: 600px)").matches) panel.classList.add("folded")

panel.append(
  title,
  stats,
  section("Form",
    segmented(FORM_NAMES, (f) => FORMS[f].label, currentForm, (form) => field.morph({ type: "shape", form })),
    el("div", { className: "row" }, [
      button("Scatter", () => field.scatter()),
      button("Gather", () => field.gather()),
    ]),
  ),
  section("Math",
    segmented(CURVE_NAMES, (c) => CURVES[c].label, currentCurve, (curve) => {
      // Plane plots read best face-on.
      set({ camera: { yaw: 0, pitch: 0, spin: 0 }, motion: { autoplay: null } })
      field.morph({ type: "curve", curve })
    }),
  ),
  section("Motion",
    segmented(["direct", "reservoir"] as const, (v) => (v === "direct" ? "Slide" : "Via reservoir"), () => scene().motion.via, (via) => set({ motion: { via } })),
    segmented(["on", "off"] as const, (v) => (v === "on" ? "Autoplay" : "Hold"), () => (scene().motion.autoplay ? "on" : "off"),
      (v) => set({ motion: { autoplay: v === "on" ? { forms: FORM_NAMES, hold: 12 } : null } })),
  ),
  section("Reservoir",
    segmented(["band", "field", "none"] as const, (v) => ({ band: "Band", field: "Anywhere", none: "Off" })[v], () => scene().reservoir.mode, (mode) => set({ reservoir: { mode } })),
    slider("Height", 0.02, 0.4, 0.01, () => scene().reservoir.height, (height) => set({ reservoir: { height } })),
    slider("Opacity", 0, 1, 0.05, () => scene().reservoir.opacity, (opacity) => set({ reservoir: { opacity } })),
    slider("Drift", 0, 0.3, 0.01, () => scene().reservoir.drift, (drift) => set({ reservoir: { drift } })),
    slider("Reserve", 0, 0.5, 0.01, () => scene().motion.reserve, (reserve) => set({ motion: { reserve } })),
  ),
  section("Camera",
    segmented(["perspective", "isometric"] as const, (v) => (v === "perspective" ? "Perspective" : "Isometric"), () => scene().camera.projection, (projection) => set({ camera: { projection } })),
    slider("Spin °/s", -30, 30, 0.5, () => scene().camera.spin, (spin) => set({ camera: { spin } })),
    slider("Zoom", 0.5, 2, 0.05, () => scene().camera.zoom, (zoom) => set({ camera: { zoom } })),
  ),
  section("Style",
    slider("Size px", 0.5, 4, 0.1, () => scene().style.size, (size) => set({ style: { size } })),
    slider("Opacity", 0.1, 1, 0.05, () => scene().style.opacity, (opacity) => set({ style: { opacity } })),
  ),
  section("Particles",
    segmented(["auto", "16384", "65536", "147456", "262144"] as const,
      (v) => (v === "auto" ? "Auto" : `${Math.round(Number(v) / 1024)}k`),
      () => String(scene().particles.count) as "auto",
      (v) => set({ particles: { count: v === "auto" ? "auto" : Number(v) } })),
  ),
  section("Scene JSON", json),
)

function refresh() {
  refreshers.forEach((r) => r())
  const s: Scene = scene()
  json.textContent = JSON.stringify(s, null, 2)
}
field.on("source", () => refresh())
refresh()

setInterval(() => {
  const s = field.stats()
  const v = field.getView()
  stats.textContent = `${s.particles.toLocaleString()} particles · ${s.fps} fps · quality ${s.quality}${s.reducedMotion ? " · reduced motion" : ""} · yaw ${v.yaw.toFixed(0)}° pitch ${v.pitch.toFixed(0)}°`
}, 500)
