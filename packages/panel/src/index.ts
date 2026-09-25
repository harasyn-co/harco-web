// @harasyn/panel: a control panel for an engine field. Every scene setting
// as a control, the scene as editable JSON, and (given stores) saved looks:
// named scenes that can be loaded, saved, and set as the one an app uses.
// It either floats over the page, or docks into an app's own layout: a head
// with the current look, tabs for Style, Scene, Behavior, Text and Looks,
// and a foot with the look's state and its actions.
// Meant for development and the studio; apps keep it out of their builds.
import {
  CURVES, CURVE_NAMES, FORMS, FORM_NAMES, PALETTES, SceneError,
  type CurveName, type Field, type FormName, type Palette, type PaletteName, type Scene, type ScenePatch,
} from "@harasyn/engine"
import { STUDIO_CSS } from "./styles"
import { applyTheme, panelTheme, type PanelTheme } from "./theme"

export { devLooksStore } from "./store"
export { browserLooksStore, checkGitHubToken, cleanToken, githubLooksStore } from "./stores"
export { applyTheme, panelTheme, type PanelTheme } from "./theme"

/** Named scenes, and which one the app uses. */
export interface Looks {
  active: string | null
  looks: Record<string, Scene>
}

/** Where looks are kept. */
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
  /** Extra sections for the Looks tab (e.g. keys). */
  sections?: Node[]
  /** Offer Share, which puts the scene in the URL hash. */
  shareLinks?: boolean
  /** Start folded (floating panels only; defaults to folded on small screens). */
  folded?: boolean
  /** With `looks`: the page starts out showing the active look. */
  showsActiveLook?: boolean
  /** Dock the tabs into this element instead of floating over the page. */
  container?: HTMLElement
  /** Where the top bar goes when docked (defaults to the top of the panel). */
  header?: HTMLElement
  /** Where the status line goes when docked (defaults to the panel's foot). */
  footer?: HTMLElement
  /** Floating panels start in this top corner (and return to it on reset). */
  corner?: "left" | "right"
  /** Shown small and centred at the foot of the panel, e.g. a wordmark. */
  brand?: Node
  /** Called with the panel's colours whenever they follow a new palette. */
  onTheme?: (theme: PanelTheme) => void
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

// ASCII character sets, by name.
const CHARSETS = [
  { name: "Classic", chars: " .:-=+*#%@" },
  { name: "Dense", chars: " .·:;+=xX$&" },
  { name: "Blocks", chars: " ░▒▓█" },
  { name: "Binary", chars: " 01" },
  { name: "Dots", chars: " ·•●" },
] as const
const INKS = [
  { name: "Shaded", color: "shade" },
  { name: "Bone", color: "#d9d6ce" },
  { name: "Phosphor", color: "#4dff6a" },
  { name: "Amber", color: "#ffb347" },
] as const
const LOOK_NAME = /^[a-z0-9][a-z0-9-]*$/

type Tab = "style" | "scene" | "behavior" | "text" | "looks"
const TABS: { id: Tab; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "scene", label: "Scene" },
  { id: "behavior", label: "Behavior" },
  { id: "text", label: "Text" },
  { id: "looks", label: "Looks" },
]

export function mountStudio(field: Field, options: StudioOptions = {}): Studio {
  if (!styleInjected) {
    const style = document.createElement("style")
    style.textContent = STUDIO_CSS
    document.head.append(style)
    styleInjected = true
  }
  const docked = !!options.container

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []) => {
    const node: HTMLElementTagNameMap[K] = document.createElement(tag)
    Object.assign(node, props)
    node.append(...children)
    return node
  }
  const refreshers: (() => void)[] = []
  const group = (title: string, ...rows: Node[]) => el("section", { className: "hs-group" }, [el("h3", { textContent: title }), ...rows])
  const row = (...children: Node[]) => el("div", { className: "hs-row" }, children)
  // Shown only while `when` holds, e.g. ASCII settings for the ASCII style.
  const showWhen = (node: HTMLElement, when: () => boolean) => { refreshers.push(() => (node.hidden = !when())); return node }
  // Folded away by default.
  const advanced = (...rows: Node[]) => {
    const d = el("details", { className: "hs-advanced" }, [el("summary", { textContent: "Advanced" }), ...rows])
    return d
  }

  // Errors from any control show above the tabs; notes show as toasts.
  const problems = el("pre", { className: "hs-problems", role: "alert" })
  async function attempt(action: () => void | Promise<void>) {
    problems.textContent = ""
    try {
      await action()
    } catch (err) {
      problems.textContent = err instanceof SceneError ? err.problems.join("\n") : (err as Error).message
    }
  }
  const toast = el("div", { className: "hs-toast", role: "status" })
  let toastTimer = 0
  const flash = (text: string) => {
    toast.textContent = text
    toast.classList.add("hs-shown")
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove("hs-shown"), 2400)
  }

  // Tiles: one choice from a few, each with a label (and optional preview).
  function tiles<T extends string>(values: readonly T[], label: (v: T) => string, get: () => T, pick: (v: T) => void, extra?: (v: T) => Node | null) {
    const r = el("div", { className: "hs-tiles" })
    const buttons = values.map((v) => {
      const b = el("button", { type: "button", className: "hs-tile" }, [el("span", { textContent: label(v) })])
      const x = extra?.(v)
      if (x) b.prepend(x)
      b.addEventListener("click", () => { void attempt(() => pick(v)); refresh() })
      r.append(b)
      return { v, b }
    })
    refreshers.push(() => buttons.forEach(({ v, b }) => b.classList.toggle("hs-on", get() === v)))
    return r
  }

  // A slider with its value as an editable number.
  function slider(label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void) {
    const range = el("input", { type: "range", min: String(min), max: String(max), step: String(step) })
    const num = el("input", { type: "number", min: String(min), max: String(max), step: String(step), className: "hs-num" })
    range.addEventListener("input", () => { void attempt(() => put(Number(range.value))); refresh() })
    num.addEventListener("change", () => {
      const v = Math.min(max, Math.max(min, Number(num.value)))
      if (Number.isFinite(v)) { void attempt(() => put(v)); refresh() }
    })
    refreshers.push(() => {
      const v = get()
      if (document.activeElement !== range) range.value = String(v)
      if (document.activeElement !== num) num.value = String(Math.round(v * 1000) / 1000)
      // The track fills up to the value, like a meter.
      range.style.setProperty("--fill", `${((Number(range.value) - min) / (max - min)) * 100}%`)
    })
    return el("label", { className: "hs-slider" }, [el("span", { textContent: label }), range, num])
  }

  function button(label: string, action: () => void | Promise<void>, className = "") {
    const b = el("button", { textContent: label, type: "button", className })
    b.addEventListener("click", async () => { await attempt(action); refresh() })
    return b
  }

  const scene = () => field.getScene()
  const set = (patch: ScenePatch) => field.set(patch)
  let lastAutoplay: NonNullable<Scene["motion"]["autoplay"]> = scene().motion.autoplay ?? { forms: FORM_NAMES, hold: 12 }
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

  // ---- The current look: its name, where it came from, unsaved changes ----
  const libraries: LooksLibrary[] = options.libraries ?? (options.looks
    ? [{ title: "Looks", store: options.looks, site: true, canSave: true, showsActiveLook: options.showsActiveLook }]
    : [])
  const siteLib = libraries.find((l) => l.site && l.canSave) ?? null
  const current = { name: "", lib: null as LooksLibrary | null, snapshot: JSON.stringify(scene()) }
  const markClean = (name: string, lib: LooksLibrary | null) => {
    current.name = name
    current.lib = lib
    current.snapshot = JSON.stringify(scene())
    lookName.textContent = name || "Default"
  }
  const isDirty = () => JSON.stringify(scene()) !== current.snapshot

  const reloaders: (() => Promise<void>)[] = []
  const reloadLibraries = async () => { for (const r of reloaders) await r() }

  // Saving goes to the look's own library if it can save, else the first
  // one that can (the site's with the owner key, otherwise this browser's).
  const saveTarget = () => (current.lib?.canSave ? current.lib : siteLib ?? libraries.find((l) => l.canSave) ?? null)
  // Saves under the given name, or the current look's. A look that has no
  // name yet (the default) is named in the Looks tab first.
  async function saveLook(makeDefault: boolean, newName?: string) {
    const name = (newName ?? current.name).trim()
    if (!name) {
      showTab("looks")
      saveAsInput.focus()
      flash("Name the look to save it")
      return
    }
    if (!LOOK_NAME.test(name)) throw new Error("Look names use lowercase letters, numbers and dashes, e.g. ember-ascii")
    const lib = makeDefault ? siteLib : newName ? (siteLib ?? libraries.find((l) => l.canSave) ?? null) : saveTarget()
    if (!lib) throw new Error(makeDefault ? "Setting the site's default isn't available here" : "There's nowhere to save looks here")
    await lib.store.save(name, scene(), makeDefault)
    markClean(name, lib)
    await reloadLibraries()
    flash(makeDefault ? `Saved ${name} as the site's default` : `Saved ${name} to ${lib.title}`)
    refresh()
  }
  async function share() {
    location.hash = `scene=${encodeScene(scene())}`
    try { await navigator.clipboard.writeText(location.href); flash("Link copied") } catch { flash("The link is in the address bar") }
  }

  // ---- Top bar ----
  // The current look's name, or "Default" before one is loaded or saved.
  const lookName = el("span", { className: "hs-lookname", textContent: "Default", title: "The current look" })
  const dirtyDot = el("span", { className: "hs-dirty", title: "Unsaved changes" })
  // The look's state, as a tag: new (never saved), unsaved changes, or saved.
  const statusTag = el("span", { className: "hs-tag" })
  const showStatus = () => {
    const dirty = isDirty()
    dirtyDot.classList.toggle("hs-shown", dirty)
    statusTag.textContent = dirty ? "Unsaved" : current.name ? "Saved" : ""
    statusTag.classList.toggle("hs-tag-quiet", !dirty)
  }
  refreshers.push(showStatus)
  const saveButton = button("Save", () => saveLook(false), "hs-primary")
  saveButton.classList.add("hs-pill")
  saveButton.title = "Save the current look (⌘S); name a new one in Looks"
  const defaultButton = siteLib ? button("Set as site default", () => saveLook(true), "hs-pill") : null
  if (defaultButton) defaultButton.title = "Save this look and make it the site's default"
  const shareButton = options.shareLinks ? button("Share", share, "hs-pill") : null
  if (shareButton) shareButton.title = "Copy a link to this exact scene"
  const title = el("strong", { className: "hs-title", textContent: options.title ?? "Studio" })
  const lookField = el("div", { className: "hs-look-field" }, [lookName, dirtyDot])
  const actions = el("div", { className: "hs-actions" }, [...(shareButton ? [shareButton] : []), ...(defaultButton ? [defaultButton] : []), saveButton])

  // ---- Style ----
  const swatch = (p: Palette) => {
    const chips = el("span", { className: "hs-swatch" })
    chips.style.background = p.background
    for (const c of [p.body, p.mid, p.light, p.rim]) {
      const chip = el("i")
      chip.style.background = c
      chips.append(chip)
    }
    return chips
  }
  const styleTab = [
    group("Particles",
      tiles(["dots", "squares", "streaks", "ascii"] as const, (v) => ({ dots: "Dots", squares: "Squares", streaks: "Streaks", ascii: "ASCII" })[v],
        () => scene().style.kind, (kind) => set({ style: { kind } })),
      slider("Size", 0.5, 4, 0.1, () => scene().style.size, (size) => set({ style: { size } })),
      showWhen(slider("Streak", 0.01, 0.3, 0.01, () => scene().style.streaks.length, (length) => set({ style: { streaks: { length } } })),
        () => scene().style.kind === "streaks"),
      advanced(slider("Opacity", 0.1, 1, 0.05, () => scene().style.opacity, (opacity) => set({ style: { opacity } }))),
    ),
    group("Palette",
      tiles(Object.keys(PALETTES) as PaletteName[], (v) => v, currentPalette, (palette) => set({ style: { palette } }),
        (v) => swatch(PALETTES[v] as Palette)),
    ),
    showWhen(group("ASCII",
      tiles(["grid", "free"] as const, (v) => (v === "grid" ? "Grid" : "Per particle"), () => (scene().style.ascii.grid ? "grid" : "free"),
        (v) => set({ style: { ascii: { grid: v === "grid" } } })),
      tiles(CHARSETS.map((c) => c.chars), (v) => CHARSETS.find((c) => c.chars === v)!.name, () => scene().style.ascii.chars as (typeof CHARSETS)[number]["chars"],
        (chars) => set({ style: { ascii: { chars } } }), (v) => el("code", { textContent: v.trim() })),
      tiles(INKS.map((i) => i.color), (v) => INKS.find((i) => i.color === v)!.name, () => scene().style.ascii.color as "shade",
        (color) => set({ style: { ascii: { color } } }),
        (v) => { if (v === "shade") return null; const dot = el("i", { className: "hs-ink" }); dot.style.background = v; return dot }),
      slider("Cell px", 3, 24, 1, () => scene().style.ascii.cell, (cell) => set({ style: { ascii: { cell } } })),
      slider("Contrast", 0.1, 3, 0.05, () => scene().style.ascii.contrast, (contrast) => set({ style: { ascii: { contrast } } })),
    ), () => scene().style.kind === "ascii"),
  ]

  // ---- Scene ----
  const sceneTab = [
    group("Form",
      tiles(FORM_NAMES, (f) => FORMS[f].label, currentForm, (form) => field.morph({ type: "shape", form })),
      tiles(CURVE_NAMES, (c) => CURVES[c].label, currentCurve, (curve) => {
        // Plane plots read best face-on.
        set({ camera: { yaw: 0, pitch: 0, spin: 0 }, motion: { autoplay: null } })
        field.morph({ type: "curve", curve })
      }),
      row(button("Scatter", () => field.scatter()), button("Gather", () => field.gather())),
    ),
  ]

  // ---- Behavior: how the form moves, where idle particles wait, the view ----
  const behaviorTab = [
    group("Motion",
      tiles(["on", "off"] as const, (v) => (v === "on" ? "Autoplay" : "Hold"), () => (scene().motion.autoplay ? "on" : "off"), (v) => {
        // Turning autoplay back on restores the rotation it had, e.g. with text in it.
        const now = scene().motion.autoplay
        if (now) lastAutoplay = now
        set({ motion: { autoplay: v === "on" ? lastAutoplay : null } })
      }),
      tiles(["direct", "reservoir"] as const, (v) => (v === "direct" ? "Slide" : "Via reservoir"), () => scene().motion.via, (via) => set({ motion: { via } })),
      advanced(
        slider("Gather s", 0.5, 10, 0.1, () => scene().motion.gather, (gather) => set({ motion: { gather } })),
        slider("Scatter s", 0.5, 10, 0.1, () => scene().motion.scatter, (scatter) => set({ motion: { scatter } })),
      ),
    ),
    group("Reservoir",
      tiles(["band", "field", "none"] as const, (v) => ({ band: "Band", field: "Anywhere", none: "Off" })[v], () => scene().reservoir.mode, (mode) => set({ reservoir: { mode } })),
      slider("Opacity", 0, 1, 0.05, () => scene().reservoir.opacity, (opacity) => set({ reservoir: { opacity } })),
      advanced(
        slider("Height", 0.02, 0.4, 0.01, () => scene().reservoir.height, (height) => set({ reservoir: { height } })),
        slider("Drift", 0, 0.3, 0.01, () => scene().reservoir.drift, (drift) => set({ reservoir: { drift } })),
        slider("Reserve", 0, 0.5, 0.01, () => scene().motion.reserve, (reserve) => set({ motion: { reserve } })),
      ),
    ),
    group("Camera",
      tiles(["perspective", "isometric"] as const, (v) => (v === "perspective" ? "Perspective" : "Isometric"), () => scene().camera.projection, (projection) => set({ camera: { projection } })),
      slider("Spin °/s", -30, 30, 0.5, () => scene().camera.spin, (spin) => set({ camera: { spin } })),
      slider("Zoom", 0.5, 2, 0.05, () => scene().camera.zoom, (zoom) => set({ camera: { zoom } })),
    ),
    group("Performance",
      tiles(["auto", "16384", "65536", "147456", "262144"] as const,
        (v) => (v === "auto" ? "Auto" : `${Math.round(Number(v) / 1024)}k`),
        () => String(scene().particles.count) as "auto",
        (v) => set({ particles: { count: v === "auto" ? "auto" : Number(v) } })),
    ),
  ]

  // ---- Text: the style's type settings, previewed on any line ----
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
    if (!siteLib) throw new Error("Saving to the site isn't available here")
    const now = await siteLib.store.load()
    const name = now.active
    if (!name || !now.looks[name]) throw new Error("There's no site default look to save into yet")
    const type = scene().style.type
    // A page running older engine code has no type settings; never save that.
    if (!type) throw new Error("This page is running older engine code with no type settings. Reload it and try again.")
    const look = structuredClone(now.looks[name]) as ScenePatch
    look.style = { ...look.style, type }
    await siteLib.store.save(name, look as Scene, true)
    await reloadLibraries()
    flash(`Type saved to ${name}, the site's default`)
  }
  const textTab = [
    group("Preview", row(textInput, button("Type it", previewText))),
    group("Letters",
      tiles(["strokes", "matrix", "font"] as const, (v) => ({ strokes: "Strokes", matrix: "Dot matrix", font: "Font" })[v],
        () => scene().style.type.glyphs, (glyphs) => setType({ glyphs })),
      slider("Weight", 0, 0.3, 0.01, () => scene().style.type.weight, (weight) => setType({ weight })),
      slider("Density", 0.005, 0.3, 0.005, () => scene().style.type.density, (density) => setType({ density })),
      slider("Speed", 2, 40, 1, () => scene().style.type.speed, (speed) => setType({ speed })),
      slider("Width", 0.6, 4, 0.1, () => scene().style.type.width, (width) => setType({ width })),
    ),
    ...(siteLib ? [row(button("Save type to site default", saveTypeToSite))] : []),
  ]

  // ---- Looks: each library's looks, with the site's default marked ----
  function libraryGroup(lib: LooksLibrary) {
    let looks: Looks = { active: null, looks: {} }
    const list = el("div", { className: "hs-looks" })
    const hint = el("p", { className: "hs-hint" })
    function render() {
      list.replaceChildren(...Object.keys(looks.looks).sort().map((n) => {
        const live = lib.site && looks.active === n
        const isCurrent = current.lib === lib && current.name === n
        const open = button(n, () => {
          applyScene(looks.looks[n])
          markClean(n, lib)
          renderAll()
          flash(`Loaded ${n}`)
        }, `hs-look-name${isCurrent ? " hs-on" : ""}`)
        open.title = "Load this look"
        const controls: Node[] = [open]
        if (live) controls.push(el("span", { className: "hs-badge", textContent: "site default" }))
        else if (lib.site && lib.canSave) {
          const use = button("set default", async () => {
            looks = await lib.store.setActive(n)
            render()
            flash(`${n} is now the site's default`)
          }, "hs-quiet")
          use.title = "Make this the site's default look"
          controls.push(use)
        }
        if (lib.canSave && !live) {
          const del = button("×", async () => {
            looks = await lib.store.remove(n)
            if (isCurrent) current.lib = null
            render()
            flash(`Deleted ${n}`)
          }, "hs-quiet")
          del.title = "Delete this look"
          controls.push(del)
        }
        return el("div", { className: "hs-look" }, controls)
      }))
      if (!Object.keys(looks.looks).length) list.append(el("p", { className: "hs-hint", textContent: "No saved looks yet." }))
      hint.textContent = !lib.canSave && lib.readOnlyNote ? lib.readOnlyNote : ""
      hint.hidden = !hint.textContent
    }
    renderers.push(render)
    reloaders.push(async () => { looks = await lib.store.load(); render() })
    void attempt(async () => {
      looks = await lib.store.load()
      if (lib.showsActiveLook && looks.active && !current.name) markClean(looks.active, lib)
      render()
    })
    return group(lib.title, list, hint)
  }
  const renderers: (() => void)[] = []
  const renderAll = () => renderers.forEach((r) => r())
  // Save as: name a new look (or overwrite one by its name).
  const saveAsInput = el("input", { type: "text", placeholder: "name, e.g. ember-ascii", spellcheck: false })
  saveAsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void attempt(() => saveLook(false, saveAsInput.value)) } })
  const saveAs = libraries.some((l) => l.canSave)
    ? [group("Save as",
        row(saveAsInput),
        row(
          button("Save", () => saveLook(false, saveAsInput.value), "hs-primary hs-pill"),
          ...(siteLib ? [button("Save & set as site default", () => saveLook(true, saveAsInput.value), "hs-pill")] : []),
        ),
      )]
    : []
  const looksTab = [...saveAs, ...libraries.map(libraryGroup), ...(options.sections ?? [])]

  // ---- Assemble ----
  const panes: Record<Tab, HTMLElement> = {
    style: el("div", { className: "hs-pane" }, styleTab),
    scene: el("div", { className: "hs-pane" }, sceneTab),
    behavior: el("div", { className: "hs-pane" }, behaviorTab),
    text: el("div", { className: "hs-pane" }, textTab),
    looks: el("div", { className: "hs-pane" }, looksTab),

  }
  const tabBar = el("nav", { className: "hs-tabs", role: "tablist" })
  let activeTab: Tab = "style"
  const tabButtons = TABS.map(({ id, label }) => {
    const b = el("button", { type: "button", textContent: label, role: "tab" })
    b.addEventListener("click", () => showTab(id))
    tabBar.append(b)
    return { id, b }
  })
  function showTab(id: Tab) {
    activeTab = id
    tabButtons.forEach(({ id: t, b }) => { b.classList.toggle("hs-on", t === id); b.setAttribute("aria-selected", String(t === id)) })
    for (const [t, pane] of Object.entries(panes)) pane.hidden = t !== id
  }

  const stats = el("div", { className: "hs-stats" })
  const panel = el("aside", { className: `hs-studio${docked ? " hs-docked" : ""}${options.corner === "left" ? " hs-left" : ""}` })
  const body = el("div", { className: "hs-body" }, [problems, ...Object.values(panes)])
  // Docked: a top bar (title, look, actions) that can live in the app's own
  // header. Floating: a card whose head holds the look and a fold button,
  // with the actions just below it.
  let top: HTMLElement
  let stopDragging = () => {}

  // Floating panels move by their head: drag to place it anywhere in the
  // window (kept fully inside, and remembered), double-click to send it back
  // to its corner (top-left or top-right). A click that doesn't move folds it. Phones keep the sheet.
  const POSITION_KEY = "harasyn-panel:position"
  const small = () => window.matchMedia("(max-width: 600px)").matches
  function place(left: number, topPx: number) {
    const margin = 8
    const w = panel.offsetWidth
    const x = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - w - margin))
    const y = Math.min(Math.max(margin, topPx), Math.max(margin, window.innerHeight - 120))
    Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto", maxHeight: `${window.innerHeight - y - margin}px` })
    return { x, y }
  }
  function unplace() {
    Object.assign(panel.style, { left: "", top: "", right: "", bottom: "", maxHeight: "" })
  }
  function makeDraggable(handle: HTMLElement, onClick: () => void) {
    let drag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean } | null = null
    const saved = (() => { try { return JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") } catch { return null } })()
    if (saved && !small()) place(saved.x, saved.y)
    const down = (e: PointerEvent) => {
      if (small() || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
      const r = panel.getBoundingClientRect()
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: false }
      handle.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return
      drag.moved = true
      panel.classList.add("hs-dragging")
      place(e.clientX - drag.dx, e.clientY - drag.dy)
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const { moved } = drag
      drag = null
      panel.classList.remove("hs-dragging")
      if (!moved) { if ((e.target as HTMLElement).closest(".hs-crumb-root")) onClick(); return }
      const r = panel.getBoundingClientRect()
      try { localStorage.setItem(POSITION_KEY, JSON.stringify({ x: r.left, y: r.top })) } catch { /* not remembered */ }
    }
    const reset = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return
      unplace()
      try { localStorage.removeItem(POSITION_KEY) } catch { /* nothing to forget */ }
    }
    // Keep it inside the window as the window changes; phones use the sheet.
    const resize = () => {
      if (small()) { unplace(); return }
      if (panel.style.left) place(panel.getBoundingClientRect().left, panel.getBoundingClientRect().top)
    }
    handle.addEventListener("pointerdown", down)
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
    handle.addEventListener("dblclick", reset)
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }

  if (docked) {
    top = el("div", { className: "hs-top" }, [title, lookField, actions])
    const header = options.header
    if (header) header.append(top)
    panel.append(...(header ? [] : [top]), tabBar, body, toast)
    if (options.footer) options.footer.append(stats)
    else panel.append(stats)
    options.container!.append(panel)
  } else {
    const fold = el("button", { type: "button", className: "hs-fold", textContent: "–", title: "Fold the panel away" })
    const setFolded = (folded: boolean) => {
      panel.classList.toggle("hs-folded", folded)
      fold.textContent = folded ? "+" : "–"
      fold.title = folded ? "Open the panel" : "Fold the panel away"
    }
    fold.addEventListener("click", () => setFolded(!panel.classList.contains("hs-folded")))
    // Head: the title and fold button, with the look's name just under the
    // title. Foot: the look's state, live stats, and actions, then the brand.
    const titleEl = el("span", { className: "hs-crumb-root", textContent: options.title || "Studio" })
    top = el("div", { className: "hs-head" }, [
      el("div", { className: "hs-head-text" }, [titleEl, lookField]),
      fold,
    ])
    const foot = el("div", { className: "hs-foot" }, [
      el("div", { className: "hs-foot-row" }, [el("div", { className: "hs-foot-meta" }, [statusTag, stats]), actions]),
      ...(options.brand ? [el("div", { className: "hs-brand" }, [options.brand])] : []),
    ])
    panel.append(top, tabBar, body, foot, toast)
    document.body.append(panel)
    setFolded(options.folded ?? window.matchMedia("(max-width: 600px)").matches)
    stopDragging = makeDraggable(top, () => setFolded(!panel.classList.contains("hs-folded")))
  }
  showTab(activeTab)

  // ⌘S saves the look.
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && !panel.hidden) {
      e.preventDefault()
      void attempt(() => saveLook(false))
    }
  }
  window.addEventListener("keydown", onKey)

  // The panel's colours follow the palette.
  let themeKey = ""
  function followPalette() {
    const palette = scene().style.palette
    const key = JSON.stringify(palette)
    if (key === themeKey) return
    themeKey = key
    const theme = panelTheme(palette)
    applyTheme(panel, theme)
    if (top) applyTheme(top, theme)
    options.onTheme?.(theme)
  }

  function refresh() {
    followPalette()
    refreshers.forEach((r) => r())
  }
  const offSource = field.on("source", () => refresh())
  refresh()
  const timer = setInterval(() => {
    if (panel.hidden) return
    showStatus()
    const s = field.stats()
    stats.textContent = `${Math.round(s.particles / 1024)}K · ${s.fps} FPS${s.quality ? ` · Q${s.quality}` : ""}`
    stats.title = `${s.particles.toLocaleString()} particles, ${s.fps} frames a second${s.quality ? `, quality step ${s.quality}` : ""}${s.reducedMotion ? ", reduced motion" : ""}`
  }, 500)

  return {
    element: panel,
    show() { panel.hidden = false; refresh() },
    hide() { panel.hidden = true },
    toggle() { if (panel.hidden) { panel.hidden = false; refresh() } else panel.hidden = true },
    destroy() {
      clearInterval(timer)
      offSource()
      window.removeEventListener("keydown", onKey)
      stopDragging()
      panel.remove()
      top.remove()
      stats.remove()
    },
  }
}
