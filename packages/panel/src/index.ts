// @harasyn/panel: a control panel for an engine field. Every scene setting
// as a control, the scene as editable JSON, and (given a store) saved looks:
// named scenes that can be loaded, saved, and set as the one an app uses.
// Meant for development; apps should keep it out of production builds.
import {
  CURVES, CURVE_NAMES, FORMS, FORM_NAMES, PALETTES, SCENE_SCHEMA, SceneError,
  type CurveName, type Field, type FormName, type PaletteName, type Scene, type ScenePatch,
} from "@harasyn/engine"
import { STUDIO_CSS } from "./styles"

export { devLooksStore } from "./store"
export { browserLooksStore, checkGitHubToken, cleanToken, githubLooksStore } from "./stores"

/** Named scenes, and which one the app uses. */
export interface Looks {
  active: string | null
  looks: Record<string, Scene>
}

/** Where looks are kept. The site's dev server writes them into the repo. */
export interface LooksStore {
  load(): Promise<Looks>
  save(name: string, scene: Scene, makeActive: boolean): Promise<Looks>
  setActive(name: string): Promise<Looks>
  remove(name: string): Promise<Looks>
}

/** A named set of looks shown in the panel. */
export interface LooksLibrary {
  title: string
  store: LooksStore
  /** A site's looks: one is the site's default. */
  site?: boolean
  /** Saving, deleting and setting the default are allowed. */
  canSave?: boolean
  /** Shown in place of the save controls when saving isn't allowed. */
  readOnlyNote?: string
  /** The page starts out showing this library's default look. */
  showsActiveLook?: boolean
}

export interface StudioOptions {
  title?: string
  /** Saved looks: shorthand for one site library that can save. */
  looks?: LooksStore
  /** Libraries of looks, shown in order. */
  libraries?: LooksLibrary[]
  /** Extra sections placed at the top of the panel. */
  sections?: Node[]
  /** Offer "Copy link", which puts the scene in the URL hash. */
  shareLinks?: boolean
  /** Start folded (defaults to folded on small screens). */
  folded?: boolean
  /** With `looks`: the page starts out showing the active look (true on the site itself). */
  showsActiveLook?: boolean
}

export interface Studio {
  readonly element: HTMLElement
  show(): void
  hide(): void
  toggle(): void
  destroy(): void
}

let styleInjected = false

/** Scenes travel in URL hashes as base64url JSON. */
export function encodeScene(scene: ScenePatch) {
  const bytes = new TextEncoder().encode(JSON.stringify(scene))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function sceneFromHash(hash = location.hash): ScenePatch | null {
  const m = hash.match(/scene=([\w-]+)/)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/")
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
}

export function mountStudio(field: Field, options: StudioOptions = {}): Studio {
  if (!styleInjected) {
    const style = document.createElement("style")
    style.textContent = STUDIO_CSS
    document.head.append(style)
    styleInjected = true
  }

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []) => {
    const node: HTMLElementTagNameMap[K] = document.createElement(tag)
    Object.assign(node, props)
    node.append(...children)
    return node
  }
  const refreshers: (() => void)[] = []
  // Sections fold when their heading is clicked; `closed` ones start folded.
  const section = (title: string, ...rows: Node[]) => {
    const heading = el("h2", { textContent: title, title: "Show or hide" })
    const body = el("div", { className: "hs-body" }, rows)
    const sec = el("section", {}, [heading, body])
    heading.addEventListener("click", () => sec.classList.toggle("hs-closed"))
    return sec
  }
  const closed = (sec: HTMLElement) => { sec.classList.add("hs-closed"); return sec }
  const row = (...children: Node[]) => el("div", { className: "hs-row" }, children)

  function segmented<T extends string>(values: readonly T[], label: (v: T) => string, get: () => T, pick: (v: T) => void) {
    const r = row()
    const buttons = values.map((v) => {
      const b = el("button", { textContent: label(v), type: "button" })
      b.addEventListener("click", () => { attempt(() => pick(v)); refresh() })
      r.append(b)
      return { v, b }
    })
    refreshers.push(() => buttons.forEach(({ v, b }) => b.classList.toggle("hs-on", get() === v)))
    return r
  }

  function slider(label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void) {
    const out = el("output")
    const input = el("input", { type: "range", min: String(min), max: String(max), step: String(step) })
    input.addEventListener("input", () => { attempt(() => put(Number(input.value))); refresh() })
    refreshers.push(() => {
      if (document.activeElement !== input) input.value = String(get())
      out.textContent = String(get())
    })
    return el("label", { className: "hs-slider" }, [el("span", { textContent: label }), input, out])
  }

  function button(label: string, action: () => void | Promise<void>) {
    const b = el("button", { textContent: label, type: "button" })
    b.addEventListener("click", async () => { await attempt(action); refresh() })
    return b
  }

  // Errors from any control show in the panel rather than the console.
  const problems = el("pre", { className: "hs-problems" })
  async function attempt(action: () => void | Promise<void>) {
    problems.textContent = ""
    try {
      await action()
    } catch (err) {
      problems.textContent = err instanceof SceneError ? err.problems.join("\n") : (err as Error).message
    }
  }

  const scene = () => field.getScene()
  let lastAutoplay: NonNullable<Scene["motion"]["autoplay"]> = field.getScene().motion.autoplay ?? { forms: FORM_NAMES, hold: 12 }
  const set = (patch: ScenePatch) => field.set(patch)
  const currentForm = () => { const s = scene().source; return s.type === "shape" ? s.form : ("" as FormName) }
  const currentCurve = () => { const s = scene().source; return s.type === "curve" && s.curve ? s.curve : ("" as CurveName) }
  const currentPalette = () => {
    const p = scene().style.palette
    return ((Object.keys(PALETTES) as PaletteName[]).find((k) => PALETTES[k].background === p.background && PALETTES[k].body === p.body) ?? "") as PaletteName
  }

  // Applies a whole scene, only re-sending the source if it changed, so
  // restyling doesn't restart the form.
  function applyScene(next: ScenePatch) {
    const patch = { ...next }
    if (patch.source && JSON.stringify(patch.source) === JSON.stringify(scene().source)) delete patch.source
    field.set(patch)
  }

  // Text: the style's type settings, previewed on a line of your choosing.
  // Typing a preview holds autoplay so the line stays up while you tune it.
  const onScreen = scene().source
  const textInput = el("input", { type: "text", value: onScreen.type === "text" ? onScreen.text : "in experimentation mode", spellcheck: false, placeholder: "text to preview" })
  function previewText() {
    set({ motion: { autoplay: null } })
    field.morph({ type: "text", text: textInput.value || "in experimentation mode" }, { via: "direct" })
  }
  textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void attempt(previewText); refresh() } })
  const setType = (type: Partial<Scene["style"]["type"]>) => {
    set({ style: { type } })
    if (scene().source.type !== "text") previewText()
  }
  // Copies only the type settings into the site's default look.
  async function saveTypeToSite() {
    const lib = libraries.find((l) => l.site && l.canSave)
    if (!lib) throw new Error("Saving to the site isn't available here")
    const store = lib.store
    const current = await store.load()
    const name = current.active
    if (!name || !current.looks[name]) throw new Error("There's no site default look to save into yet")
    const type = scene().style.type
    // A page running older engine code has no type settings; never save that.
    if (!type) throw new Error("This page is running older engine code with no type settings. Reload it and try again.")
    const look = structuredClone(current.looks[name]) as ScenePatch
    look.style = { ...look.style, type }
    await store.save(name, look as Scene, true)
    await reloadLibraries()
    flash(`type saved to ${name}, the site's default`)
  }

  // Scene JSON.
  const json = el("textarea", { spellcheck: false, rows: 14 })
  function applyJson() {
    let patch: ScenePatch
    try {
      patch = JSON.parse(json.value)
    } catch (err) {
      throw new Error(`Not valid JSON: ${(err as Error).message}`)
    }
    applyScene(patch)
    refresh(true)
  }
  json.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void attempt(applyJson) }
  })
  json.addEventListener("focus", () => (problems.textContent = ""))
  const note = el("span", { className: "hs-note" })
  const flash = (text: string) => { note.textContent = text; setTimeout(() => { if (note.textContent === text) note.textContent = "" }, 2500) }
  const jsonTools = row(
    button("Apply ⌘↵", applyJson),
    ...(options.shareLinks ? [button("Copy link", async () => {
      location.hash = `scene=${encodeScene(scene())}`
      try { await navigator.clipboard.writeText(location.href); flash("link copied") } catch { flash("link is in the address bar") }
    })] : []),
    button("Schema", () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(SCENE_SCHEMA, null, 2)], { type: "application/json" }))
      window.open(url, "_blank")
    }),
  )

  // Libraries of looks. A site library marks its default look and can make
  // any look the default; each library shows save controls only if it can save.
  const libraries: LooksLibrary[] = options.libraries ?? (options.looks
    ? [{ title: "Looks", store: options.looks, site: true, canSave: true, showsActiveLook: options.showsActiveLook }]
    : [])
  const reloaders: (() => Promise<void>)[] = []
  const reloadLibraries = async () => { for (const r of reloaders) await r() }

  function librarySection(lib: LooksLibrary) {
    let looks: Looks = { active: null, looks: {} }
    let loaded: string | null = null
    const list = el("div", { className: "hs-looks" })
    const name = el("input", { type: "text", placeholder: "name, e.g. ember-ascii", spellcheck: false })
    const hint = el("p")
    function render() {
      list.replaceChildren(...Object.keys(looks.looks).sort().map((n) => {
        const open = button(`${n === loaded ? "▸ " : ""}${n}`, () => {
          applyScene(looks.looks[n])
          loaded = n
          name.value = n
          render()
          flash(`loaded ${n}`)
        })
        open.title = "Load this look"
        const controls: HTMLButtonElement[] = [open]
        const live = lib.site && looks.active === n
        if (lib.site && (lib.canSave || live)) {
          const use = button(live ? "site default" : "set default", async () => {
            looks = await lib.store.setActive(n)
            render()
            flash(`${n} is now the site's default`)
          })
          use.title = live ? "The site uses this look" : "Make this the site's default look"
          if (live) { use.classList.add("hs-live"); use.disabled = true }
          controls.push(use)
        }
        if (lib.canSave) {
          const del = button("×", async () => {
            looks = await lib.store.remove(n)
            if (loaded === n) loaded = null
            render()
            flash(`deleted ${n}`)
          })
          del.title = "Delete this look"
          if (live) del.disabled = true
          controls.push(del)
        }
        return el("div", { className: "hs-look" }, controls)
      }))
      if (!Object.keys(looks.looks).length) list.append(el("p", { textContent: "No saved looks yet." }))
      hint.textContent = lib.site
        ? looks.active ? `Site default: ${looks.active}. Click a look to load it.` : "No site default yet."
        : "Click a look to load it."
    }
    async function save(makeActive: boolean) {
      const n = name.value.trim()
      if (!/^[a-z0-9][a-z0-9-]*$/.test(n)) throw new Error("Look names use lowercase letters, numbers and dashes, e.g. ember-ascii")
      looks = await lib.store.save(n, scene(), makeActive)
      loaded = n
      render()
      flash(makeActive ? `saved ${n}; it's now the site's default` : `saved ${n}`)
    }
    reloaders.push(async () => { looks = await lib.store.load(); render() })
    void attempt(async () => {
      looks = await lib.store.load()
      if (lib.showsActiveLook && looks.active) {
        loaded = looks.active
        name.value = loaded
      }
      render()
    })
    const saving = lib.canSave
      ? [row(name), row(button("Save", () => save(false)), ...(lib.site ? [button("Save & set as site default", () => save(true))] : []))]
      : lib.readOnlyNote ? [el("p", { textContent: lib.readOnlyNote })] : []
    return section(lib.title, hint, list, ...saving)
  }

  const stats = el("p", { className: "hs-stats" })
  const title = el("h1", { textContent: options.title ?? "Studio", title: "Show or hide the controls" })
  const panel = el("aside", { className: "hs-studio" })
  title.addEventListener("click", () => panel.classList.toggle("hs-folded"))
  if (options.folded ?? window.matchMedia("(max-width: 600px)").matches) panel.classList.add("hs-folded")

  panel.append(
    title,
    stats,
    problems,
    row(note),
    ...(options.sections ?? []),
    ...libraries.map(librarySection),
    section("Style",
      segmented(["dots", "squares", "streaks", "ascii"] as const, (v) => ({ dots: "Dots", squares: "Squares", streaks: "Streaks", ascii: "ASCII" })[v],
        () => scene().style.kind, (kind) => set({ style: { kind } })),
      segmented(Object.keys(PALETTES) as PaletteName[], (v) => v, currentPalette, (palette) => set({ style: { palette } })),
      slider("Size px", 0.5, 4, 0.1, () => scene().style.size, (size) => set({ style: { size } })),
      slider("Opacity", 0.1, 1, 0.05, () => scene().style.opacity, (opacity) => set({ style: { opacity } })),
      slider("Streak s", 0.01, 0.3, 0.01, () => scene().style.streaks.length, (length) => set({ style: { streaks: { length } } })),
    ),
    section("ASCII",
      segmented(["grid", "free"] as const, (v) => (v === "grid" ? "Grid" : "Per particle"), () => (scene().style.ascii.grid ? "grid" : "free"),
        (v) => set({ style: { kind: "ascii", ascii: { grid: v === "grid" } } })),
      segmented([" .:-=+*#%@", " .·:;+=xX$&", " ░▒▓█", " 01", " ·•●"] as const, (v) => v.trim() || "·", () => scene().style.ascii.chars as " 01",
        (chars) => set({ style: { kind: "ascii", ascii: { chars } } })),
      segmented(["shade", "#d9d6ce", "#4dff6a", "#ffb347"] as const, (v) => (v === "shade" ? "Shaded" : v), () => scene().style.ascii.color as "shade",
        (color) => set({ style: { kind: "ascii", ascii: { color } } })),
      slider("Cell px", 4, 24, 1, () => scene().style.ascii.cell, (cell) => set({ style: { ascii: { cell } } })),
      slider("Contrast", 0.2, 3, 0.1, () => scene().style.ascii.contrast, (contrast) => set({ style: { ascii: { contrast } } })),
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
    section("Motion",
      segmented(["direct", "reservoir"] as const, (v) => (v === "direct" ? "Slide" : "Via reservoir"), () => scene().motion.via, (via) => set({ motion: { via } })),
      segmented(["on", "off"] as const, (v) => (v === "on" ? "Autoplay" : "Hold"), () => (scene().motion.autoplay ? "on" : "off"), (v) => {
        // Turning autoplay back on restores the rotation it had, e.g. with text in it.
        const current = scene().motion.autoplay
        if (current) lastAutoplay = current
        set({ motion: { autoplay: v === "on" ? lastAutoplay : null } })
      }),
      slider("Gather s", 0.5, 10, 0.1, () => scene().motion.gather, (gather) => set({ motion: { gather } })),
      slider("Scatter s", 0.5, 10, 0.1, () => scene().motion.scatter, (scatter) => set({ motion: { scatter } })),
    ),
    section("Text",
      row(textInput, button("Type it", previewText)),
      segmented(["strokes", "matrix", "font"] as const, (v) => ({ strokes: "Strokes", matrix: "Dot matrix", font: "Font" })[v],
        () => scene().style.type.glyphs, (glyphs) => setType({ glyphs })),
      slider("Weight", 0, 0.3, 0.01, () => scene().style.type.weight, (weight) => setType({ weight })),
      slider("Density", 0.005, 0.3, 0.005, () => scene().style.type.density, (density) => setType({ density })),
      slider("Speed", 2, 40, 1, () => scene().style.type.speed, (speed) => setType({ speed })),
      slider("Width", 0.6, 4, 0.1, () => scene().style.type.width, (width) => setType({ width })),
      ...(libraries.some((l) => l.site && l.canSave) ? [row(button("Save type to site default", saveTypeToSite))] : []),
    ),
    section("Form",
      segmented(FORM_NAMES, (f) => FORMS[f].label, currentForm, (form) => field.morph({ type: "shape", form })),
      row(button("Scatter", () => field.scatter()), button("Gather", () => field.gather())),
    ),
    closed(section("Math",
      segmented(CURVE_NAMES, (c) => CURVES[c].label, currentCurve, (curve) => {
        // Plane plots read best face-on.
        set({ camera: { yaw: 0, pitch: 0, spin: 0 }, motion: { autoplay: null } })
        field.morph({ type: "curve", curve })
      }),
    )),
    closed(section("Particles",
      segmented(["auto", "16384", "65536", "147456", "262144"] as const,
        (v) => (v === "auto" ? "Auto" : `${Math.round(Number(v) / 1024)}k`),
        () => String(scene().particles.count) as "auto",
        (v) => set({ particles: { count: v === "auto" ? "auto" : Number(v) } })),
    )),
    closed(section("Scene JSON", json, jsonTools)),
  )
  document.body.append(panel)

  function refresh(force = false) {
    refreshers.forEach((r) => r())
    // Leave the JSON alone while someone is editing it.
    if (force || document.activeElement !== json) json.value = JSON.stringify(scene(), null, 2)
  }
  const offSource = field.on("source", () => refresh())
  refresh()
  const timer = setInterval(() => {
    if (panel.hidden) return
    const s = field.stats()
    const v = field.getView()
    stats.textContent = `${s.particles.toLocaleString()} particles · ${s.fps} fps · quality ${s.quality}${s.reducedMotion ? " · reduced motion" : ""} · yaw ${v.yaw.toFixed(0)}° pitch ${v.pitch.toFixed(0)}°`
  }, 500)

  return {
    element: panel,
    show() { panel.hidden = false; refresh() },
    hide() { panel.hidden = true },
    toggle() { if (panel.hidden) { panel.hidden = false; refresh() } else panel.hidden = true },
    destroy() {
      clearInterval(timer)
      offSource()
      panel.remove()
    },
  }
}
