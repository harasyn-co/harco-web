// @harasyn/panel: a control panel for an engine field. Every scene setting
// as a control, and (given stores) saved looks: named scenes that can be
// loaded, saved, and set as the one an app uses. It floats over the page as
// a card: a head with the current look, tabs for Style, Scene, Behavior,
// Text and Looks, and a foot with the look's state and its actions.
// Meant for development and the studio; apps keep it out of their builds.
import { SceneError, type Field, type Scene, type ScenePatch } from "@harasyn/engine"
import { makeDraggable } from "./drag"
import { encodeScene } from "./hash"
import { History, sceneKey } from "./history"
import { getPreview, movePreview, setPreview } from "./previews"
import { STUDIO_CSS } from "./styles"
import { settingTabs } from "./tabs"
import { applyTheme, panelTheme } from "./theme"
import type { Looks, LooksLibrary, Studio, StudioOptions } from "./types"
import { el, ui, type Ctx } from "./ui"

export { devLooksStore } from "./store"
export { browserLooksStore, checkGitHubToken, cleanToken, githubLooksStore } from "./stores"
export { applyTheme, panelTheme, type PanelTheme } from "./theme"
export { encodeScene, sceneFromHash } from "./hash"
export type { Looks, LooksLibrary, LooksStore, Studio, StudioOptions } from "./types"

const LOOK_NAME = /^[a-z0-9][a-z0-9-]*$/
const FOLDED_KEY = "harasyn-panel:folded"
// Seconds after loading a look before its thumbnail is taken, so the form
// has gathered.
const PREVIEW_DELAY = 3200

type Tab = "style" | "scene" | "behavior" | "text" | "looks"
const TABS: { id: Tab; label: string }[] = [
  { id: "style", label: "Style" },
  { id: "scene", label: "Scene" },
  { id: "behavior", label: "Behavior" },
  { id: "text", label: "Text" },
  { id: "looks", label: "Looks" },
]

let styleInjected = false

export function mountStudio(field: Field, options: StudioOptions = {}): Studio {
  if (!styleInjected) {
    document.head.append(el("style", { textContent: STUDIO_CSS }))
    styleInjected = true
  }
  const scene = () => field.getScene()

  // Errors from any control show above the tabs; notes show as toasts.
  const problems = el("pre", { className: "hs-problems", role: "alert" })
  const toast = el("div", { className: "hs-toast", role: "status" })
  let toastTimer = 0
  const flash = (text: string) => {
    toast.textContent = text
    toast.classList.add("hs-shown")
    clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove("hs-shown"), 2400)
  }

  // Undo history over what the person set.
  const history = new History(sceneKey(scene()))
  const refreshers: (() => void)[] = []
  const ctx: Ctx = {
    field,
    scene,
    set: (patch) => field.set(patch),
    refreshers,
    async attempt(action) {
      problems.textContent = ""
      try {
        await action()
      } catch (err) {
        problems.textContent = err instanceof SceneError ? err.problems.join("\n") : (err as Error).message
      }
    },
    refresh: () => refresh(),
    flash,
    record: () => { history.record(sceneKey(scene())) },
  }
  const { row, group, button } = ui(ctx)

  // Applies a scene (or the settable part of one). The source goes straight
  // over, and only if it changed, so restyling never restarts the form.
  function applyScene(next: ScenePatch) {
    const { source, ...rest } = next
    field.set(rest)
    if (source && JSON.stringify(source) !== JSON.stringify(scene().source)) field.morph(source, { via: "direct" })
  }
  function step(dir: "undo" | "redo") {
    const state = dir === "undo" ? history.undo() : history.redo()
    if (state === null) return
    void ctx.attempt(() => applyScene(JSON.parse(state)))
    refresh()
  }

  // ---- The current look: its name, library, saved scene, unsaved changes ----
  const libraries: LooksLibrary[] = options.libraries ?? (options.looks
    ? [{ title: "Looks", store: options.looks, site: true, canSave: true, showsActiveLook: options.showsActiveLook }]
    : [])
  const siteLib = libraries.find((l) => l.site && l.canSave) ?? null
  const current = { name: "", lib: null as LooksLibrary | null, saved: null as Scene | null, key: sceneKey(scene()) }
  const lookName = el("span", { className: "hs-lookname", textContent: "Default", title: "The current look" })
  const previewId = (lib: LooksLibrary, name: string) => `${lib.title}:${name}`
  function markClean(name: string, lib: LooksLibrary | null) {
    current.name = name
    current.lib = lib
    current.saved = structuredClone(scene())
    current.key = sceneKey(scene())
    lookName.textContent = name || "Default"
  }
  // Changes that autoplay makes on its own (which form is showing) don't count.
  const isDirty = () => sceneKey(scene()) !== current.key
  // A thumbnail of the look as it looks now (after a pause, once it's formed).
  function capturePreview(lib: LooksLibrary, name: string, delay = 0) {
    const key = current.key
    setTimeout(async () => {
      if (current.lib !== lib || current.name !== name || sceneKey(scene()) !== key) return
      setPreview(previewId(lib, name), await field.capture(240))
      renderAll()
    }, delay)
  }

  const reloaders: (() => Promise<void>)[] = []
  const renderers: (() => void)[] = []
  const reloadLibraries = async () => { for (const r of reloaders) await r() }
  const renderAll = () => renderers.forEach((r) => r())

  // Saves under the given name, or the current look's. A look with no name
  // yet (the default) is named in the Looks tab first.
  const saveTarget = () => (current.lib?.canSave ? current.lib : siteLib ?? libraries.find((l) => l.canSave) ?? null)
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
    capturePreview(lib, name)
    await reloadLibraries()
    flash(makeDefault ? `Saved ${name} as the site's default` : `Saved ${name} to ${lib.title}`)
  }
  function revert() {
    if (!current.saved) return
    applyScene(current.saved)
    ctx.record()
    flash(`Back to the saved ${current.name}`)
  }
  async function share() {
    location.hash = `scene=${encodeScene(scene())}`
    try { await navigator.clipboard.writeText(location.href); flash("Link copied") } catch { flash("The link is in the address bar") }
  }
  async function copyJson() {
    try { await navigator.clipboard.writeText(JSON.stringify(scene(), null, 2)); flash("Scene JSON copied") } catch { flash("Couldn't reach the clipboard") }
  }

  // State and actions for the foot.
  const statusTag = el("span", { className: "hs-tag" })
  const showStatus = () => {
    const dirty = isDirty()
    statusTag.textContent = dirty ? "Unsaved" : current.name ? "Saved" : ""
    statusTag.classList.toggle("hs-tag-quiet", !dirty)
    revertButton.hidden = !(dirty && current.saved)
  }
  refreshers.push(showStatus)
  const revertButton = button("Revert", revert, "hs-pill hs-quiet")
  revertButton.title = "Go back to the saved version of this look"
  const saveButton = button("Save", () => saveLook(false), "hs-primary hs-pill")
  saveButton.title = "Save the current look (⌘S); name a new one in Looks"
  const defaultButton = siteLib ? button("Set as site default", () => saveLook(true), "hs-pill") : null
  if (defaultButton) defaultButton.title = "Save this look and make it the site's default"
  const shareButton = options.shareLinks ? button("Share", share, "hs-pill") : null
  if (shareButton) shareButton.title = "Copy a link to this exact scene"

  // ---- Looks tab: save as, then each library's looks ----
  function libraryGroup(lib: LooksLibrary) {
    let looks: Looks = { active: null, looks: {} }
    let editing: string | null = null
    const list = el("div", { className: "hs-looks" })
    const hint = el("p", { className: "hs-hint" })
    function lookRow(n: string) {
      const live = lib.site && looks.active === n
      const isCurrent = current.lib === lib && current.name === n
      const thumb = el("span", { className: "hs-thumb" })
      const url = getPreview(previewId(lib, n))
      if (url) thumb.style.backgroundImage = `url("${url}")`
      const open = button("", () => {
        applyScene(looks.looks[n])
        markClean(n, lib)
        ctx.record()
        capturePreview(lib, n, PREVIEW_DELAY)
        renderAll()
        flash(`Loaded ${n}`)
      }, `hs-look-name${isCurrent ? " hs-on" : ""}`)
      open.append(thumb, el("span", { textContent: n }))
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
      if (lib.canSave) {
        const more = button("⋯", () => { editing = editing === n ? null : n; render() }, "hs-quiet")
        more.title = "Rename or duplicate"
        more.ariaLabel = `More for ${n}`
        controls.push(more)
      }
      if (lib.canSave && !live) {
        const del = button("×", async () => {
          looks = await lib.store.remove(n)
          if (isCurrent) current.lib = null
          render()
          flash(`Deleted ${n}`)
        }, "hs-quiet")
        del.title = "Delete this look"
        del.ariaLabel = `Delete ${n}`
        controls.push(del)
      }
      const item = el("div", { className: "hs-look-item" }, [el("div", { className: "hs-look" }, controls)])
      if (editing === n) {
        // Rename moves the look (keeping it the site default if it was);
        // duplicate saves a copy.
        const input = el("input", { type: "text", value: `${n}-copy`, spellcheck: false, ariaLabel: "New name" })
        const newName = () => {
          const v = input.value.trim()
          if (!LOOK_NAME.test(v)) throw new Error("Look names use lowercase letters, numbers and dashes, e.g. ember-ascii")
          if (looks.looks[v]) throw new Error(`There's already a look called ${v}`)
          return v
        }
        item.append(row(input,
          button("Rename", async () => {
            const to = newName()
            await lib.store.save(to, looks.looks[n], !!live)
            looks = await lib.store.remove(n)
            movePreview(previewId(lib, n), previewId(lib, to))
            if (isCurrent) markClean(to, lib)
            editing = null
            render()
            flash(`Renamed ${n} to ${to}`)
          }, "hs-pill"),
          button("Duplicate", async () => {
            const to = newName()
            looks = await lib.store.save(to, looks.looks[n], false)
            movePreview(previewId(lib, n), previewId(lib, to))
            editing = null
            render()
            flash(`Saved a copy as ${to}`)
          }, "hs-pill"),
        ))
        setTimeout(() => input.select())
      }
      return item
    }
    function render() {
      list.replaceChildren(...Object.keys(looks.looks).sort().map(lookRow))
      if (!Object.keys(looks.looks).length) list.append(el("p", { className: "hs-hint", textContent: "No saved looks yet." }))
      hint.textContent = !lib.canSave && lib.readOnlyNote ? lib.readOnlyNote : ""
      hint.hidden = !hint.textContent
    }
    renderers.push(render)
    reloaders.push(async () => { looks = await lib.store.load(); render() })
    void ctx.attempt(async () => {
      looks = await lib.store.load()
      if (lib.showsActiveLook && looks.active && !current.name) {
        markClean(looks.active, lib)
        capturePreview(lib, looks.active, PREVIEW_DELAY)
      }
      render()
    })
    return group(lib.title, list, hint)
  }
  const saveAsInput = el("input", { type: "text", placeholder: "name, e.g. ember-ascii", spellcheck: false, ariaLabel: "Name for the look" })
  saveAsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void ctx.attempt(() => saveLook(false, saveAsInput.value)).then(refresh) } })
  const looksTab: Node[] = [
    ...(libraries.some((l) => l.canSave)
      ? [group("Save as",
          row(saveAsInput),
          row(
            button("Save", () => saveLook(false, saveAsInput.value), "hs-primary hs-pill"),
            ...(siteLib ? [button("Save & set as site default", () => saveLook(true, saveAsInput.value), "hs-pill")] : []),
          ),
        )]
      : []),
    ...libraries.map(libraryGroup),
    group("Scene", row(button("Copy scene JSON", copyJson, "hs-pill"))),
    ...(options.sections ?? []),
  ]

  // ---- Assemble ----
  const tabs = settingTabs(ctx)
  const panes: Record<Tab, HTMLElement> = {
    style: el("div", { className: "hs-pane", role: "tabpanel" }, tabs.style),
    scene: el("div", { className: "hs-pane", role: "tabpanel" }, tabs.scene),
    behavior: el("div", { className: "hs-pane", role: "tabpanel" }, tabs.behavior),
    text: el("div", { className: "hs-pane", role: "tabpanel" }, tabs.text),
    looks: el("div", { className: "hs-pane", role: "tabpanel" }, looksTab),
  }
  const tabBar = el("nav", { className: "hs-tabs", role: "tablist" })
  const tabButtons = TABS.map(({ id, label }, i) => {
    const b = el("button", { type: "button", textContent: label, role: "tab", title: `${label} (${i + 1})` })
    b.addEventListener("click", () => showTab(id))
    tabBar.append(b)
    return { id, b }
  })
  function showTab(id: Tab) {
    tabButtons.forEach(({ id: t, b }) => { b.classList.toggle("hs-on", t === id); b.setAttribute("aria-selected", String(t === id)) })
    for (const [t, pane] of Object.entries(panes)) pane.hidden = t !== id
  }

  const round = (label: string, text: string, action: () => void) => {
    const b = el("button", { type: "button", className: "hs-fold", textContent: text, title: label, ariaLabel: label })
    b.addEventListener("click", action)
    return b
  }
  // Curved arrows for undo and redo, drawn rather than typed so every font
  // shows them the same.
  const arrow = (flip: boolean) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${flip ? ' style="transform: scaleX(-1)"' : ""}><path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7"/></svg>`
  const undoButton = round("Undo (⌘Z)", "", () => step("undo"))
  undoButton.innerHTML = arrow(false)
  const redoButton = round("Redo (⇧⌘Z)", "", () => step("redo"))
  redoButton.innerHTML = arrow(true)
  refreshers.push(() => { undoButton.disabled = !history.canUndo; redoButton.disabled = !history.canRedo })
  const fold = round("Fold the panel away (Esc)", "–", () => setFolded(!panel.classList.contains("hs-folded")))
  const stats = el("div", { className: "hs-stats" })
  const titleEl = el("span", { className: "hs-crumb-root", textContent: options.title || "Studio" })
  const head = el("div", { className: "hs-head" }, [
    el("div", { className: "hs-head-text" }, [titleEl, lookName]),
    undoButton, redoButton, fold,
  ])
  const foot = el("div", { className: "hs-foot" }, [
    el("div", { className: "hs-foot-row" }, [
      el("div", { className: "hs-foot-meta" }, [statusTag, stats]),
      el("div", { className: "hs-actions" }, [revertButton, ...(shareButton ? [shareButton] : []), ...(defaultButton ? [defaultButton] : []), saveButton]),
    ]),
    ...(options.brand ? [el("div", { className: "hs-brand" }, [options.brand])] : []),
  ])
  const body = el("div", { className: "hs-body" }, [problems, ...Object.values(panes)])
  const panel = el("aside", { className: `hs-studio${options.corner === "left" ? " hs-left" : ""}`, ariaLabel: options.title || "Studio" })
  panel.append(head, tabBar, body, foot, toast)
  document.body.append(panel)

  // Folding, remembered for next time.
  function setFolded(folded: boolean) {
    panel.classList.toggle("hs-folded", folded)
    fold.textContent = folded ? "+" : "–"
    fold.title = folded ? "Open the panel (Esc)" : "Fold the panel away (Esc)"
    try { localStorage.setItem(FOLDED_KEY, String(folded)) } catch { /* not remembered */ }
  }
  const rememberedFold = (() => { try { return localStorage.getItem(FOLDED_KEY) } catch { return null } })()
  setFolded(options.folded ?? (rememberedFold !== null ? rememberedFold === "true" : window.matchMedia("(max-width: 600px)").matches))
  const stopDragging = makeDraggable(panel, head, (target) => { if (target.closest(".hs-crumb-root")) setFolded(!panel.classList.contains("hs-folded")) })
  showTab("style")

  // Keys: ⌘S save, ⌘Z / ⇧⌘Z undo and redo, 1–5 tabs, H hide, Esc fold.
  const onKey = (e: KeyboardEvent) => {
    const target = e.target
    const typing = target instanceof Element && target.closest("input, textarea, select, [contenteditable]") !== null
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === "s" && !panel.hidden) { e.preventDefault(); void ctx.attempt(() => saveLook(false)).then(refresh); return }
    if (typing) return
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); step(e.shiftKey ? "redo" : "undo"); return }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); step("redo"); return }
    if (mod || e.altKey) return
    if (e.key.toLowerCase() === "h") { panel.hidden = !panel.hidden; if (!panel.hidden) refresh(); return }
    if (e.key === "Escape") { setFolded(!panel.classList.contains("hs-folded")); return }
    const n = Number(e.key)
    if (n >= 1 && n <= TABS.length && !panel.hidden) { setFolded(false); showTab(TABS[n - 1].id) }
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
    toggle() { panel.hidden = !panel.hidden; if (!panel.hidden) refresh() },
    destroy() {
      clearInterval(timer)
      offSource()
      window.removeEventListener("keydown", onKey)
      stopDragging()
      panel.remove()
    },
  }
}
