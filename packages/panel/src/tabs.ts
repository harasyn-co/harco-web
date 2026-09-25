// The setting tabs: Style (how particles look), Scene (what they form),
// Behavior (how it moves, where idle particles wait, the view) and Text.
import {
  CURVES, CURVE_NAMES, FORMS, FORM_NAMES, PALETTES,
  type CurveName, type FormName, type Palette, type PaletteName, type Scene,
} from "@harasyn/engine"
import { ui, type Ctx } from "./ui"

// ASCII character sets and inks, by name.
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
const PREVIEW_TEXT = "in experimentation mode"

type Autoplay = NonNullable<Scene["motion"]["autoplay"]>

export function settingTabs(ctx: Ctx) {
  const { el, group, row, showWhen, advanced, tiles, slider, color, button } = ui(ctx)
  const { field, scene, set } = ctx

  // Turning autoplay back on restores the rotation it had (e.g. with text).
  let lastAutoplay: Autoplay = scene().motion.autoplay ?? { forms: FORM_NAMES, hold: 12 }
  const rememberAutoplay = () => { const now = scene().motion.autoplay; if (now) lastAutoplay = now }
  const resumeAutoplay = () => set({ motion: { autoplay: lastAutoplay } })

  const currentForm = () => { const s = scene().source; return s.type === "shape" ? s.form : ("" as FormName) }
  const currentCurve = () => { const s = scene().source; return s.type === "curve" && s.curve ? s.curve : ("" as CurveName) }
  const currentPalette = () => {
    const p = scene().style.palette
    return ((Object.keys(PALETTES) as PaletteName[]).find((k) => JSON.stringify(PALETTES[k]) === JSON.stringify(p)) ?? "") as PaletteName
  }
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
  const paletteColor = (key: keyof Palette, label: string) =>
    color(label, () => scene().style.palette[key], (hex) => set({ style: { palette: { [key]: hex } } }))

  const style = [
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
      // Any palette is a starting point: change its colours here.
      el("details", { className: "hs-advanced" }, [
        el("summary", { textContent: "Custom colours" }),
        paletteColor("background", "Background"),
        paletteColor("light", "Light"),
        paletteColor("mid", "Mid"),
        paletteColor("body", "Body"),
        paletteColor("shadow", "Shadow"),
        paletteColor("rim", "Rim"),
        paletteColor("loose", "Loose"),
        color("Accent", () => (scene().style.palette.accent === "form" ? scene().style.palette.rim : scene().style.palette.accent),
          (hex) => set({ style: { palette: { accent: hex } } })),
        row(showWhen(button("Accent follows each form", () => set({ style: { palette: { accent: "form" } } }), "hs-quiet", { record: true }),
          () => scene().style.palette.accent !== "form")),
      ]),
    ),
    showWhen(group("ASCII",
      tiles(["grid", "free"] as const, (v) => (v === "grid" ? "Grid" : "Per particle"), () => (scene().style.ascii.grid ? "grid" : "free"),
        (v) => set({ style: { ascii: { grid: v === "grid" } } })),
      tiles(CHARSETS.map((c) => c.chars), (v) => CHARSETS.find((c) => c.chars === v)!.name, () => scene().style.ascii.chars as (typeof CHARSETS)[number]["chars"],
        (chars) => set({ style: { ascii: { chars } } }), (v) => el("code", { textContent: v.trim() })),
      tiles(INKS.map((i) => i.color), (v) => INKS.find((i) => i.color === v)!.name, () => scene().style.ascii.color as "shade",
        (c) => set({ style: { ascii: { color: c } } }),
        (v) => { if (v === "shade") return null; const dot = el("i", { className: "hs-ink" }); dot.style.background = v; return dot }),
      slider("Cell px", 3, 24, 1, () => scene().style.ascii.cell, (cell) => set({ style: { ascii: { cell } } })),
      slider("Contrast", 0.1, 3, 0.05, () => scene().style.ascii.contrast, (contrast) => set({ style: { ascii: { contrast } } })),
    ), () => scene().style.kind === "ascii"),
  ]

  const sceneTab = [
    group("Form",
      tiles(FORM_NAMES, (f) => FORMS[f].label, currentForm, (form) => field.morph({ type: "shape", form })),
      tiles(CURVE_NAMES, (c) => CURVES[c].label, currentCurve, (curve) => {
        // Plane plots read best face-on.
        rememberAutoplay()
        set({ camera: { yaw: 0, pitch: 0, spin: 0 }, motion: { autoplay: null } })
        field.morph({ type: "curve", curve })
      }),
      row(button("Scatter", () => field.scatter()), button("Gather", () => field.gather())),
    ),
  ]

  const behavior = [
    group("Motion",
      tiles(["on", "off"] as const, (v) => (v === "on" ? "Autoplay" : "Hold"), () => (scene().motion.autoplay ? "on" : "off"), (v) => {
        rememberAutoplay()
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

  // Text: the style's type settings, tried out on any line. A preview holds
  // autoplay so the line stays up; the note says so and offers to resume.
  const onScreen = scene().source
  const textInput = el("input", { type: "text", value: onScreen.type === "text" ? onScreen.text : PREVIEW_TEXT, spellcheck: false, placeholder: "text to preview", ariaLabel: "Text to preview" })
  function previewText() {
    rememberAutoplay()
    set({ motion: { autoplay: null } })
    field.morph({ type: "text", text: textInput.value || PREVIEW_TEXT }, { via: "direct" })
  }
  textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); void ctx.attempt(previewText); ctx.refresh() } })
  const setType = (type: Partial<Scene["style"]["type"]>) => {
    set({ style: { type } })
    if (scene().source.type !== "text") previewText()
  }
  const paused = showWhen(el("div", { className: "hs-note" }, [
    el("span", { textContent: "Autoplay is paused while you preview." }),
    button("Resume autoplay", resumeAutoplay, "hs-quiet", { record: true }),
  ]), () => !scene().motion.autoplay && scene().source.type === "text")
  const text = [
    group("Preview", row(textInput, button("Type it", previewText, "", { record: true })), paused),
    group("Letters",
      tiles(["strokes", "matrix", "font"] as const, (v) => ({ strokes: "Strokes", matrix: "Dot matrix", font: "Font" })[v],
        () => scene().style.type.glyphs, (glyphs) => setType({ glyphs })),
      slider("Weight", 0, 0.3, 0.01, () => scene().style.type.weight, (weight) => setType({ weight })),
      slider("Density", 0.005, 0.3, 0.005, () => scene().style.type.density, (density) => setType({ density })),
      slider("Speed", 2, 40, 1, () => scene().style.type.speed, (speed) => setType({ speed })),
      slider("Width", 0.6, 4, 0.1, () => scene().style.type.width, (width) => setType({ width })),
    ),
  ]

  return { style, scene: sceneTab, behavior, text }
}
