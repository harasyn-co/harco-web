// The panel's building blocks: groups, rows, tiles, sliders, colour pickers
// and buttons. Every control reports its change so it can be undone.
import type { Field, Scene, ScenePatch } from "@harasyn/engine"

/** What the building blocks need from the panel. */
export interface Ctx {
  field: Field
  scene(): Scene
  set(patch: ScenePatch): void
  /** Called on every refresh, to bring controls up to date. */
  refreshers: (() => void)[]
  /** Runs an action, showing any error in the panel. */
  attempt(action: () => void | Promise<void>): Promise<void>
  refresh(): void
  flash(text: string): void
  /** Records the current state for undo, after a change. */
  record(): void
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []) {
  const node: HTMLElementTagNameMap[K] = document.createElement(tag)
  Object.assign(node, props)
  node.append(...children)
  return node
}

export function ui(ctx: Ctx) {
  const group = (title: string, ...rows: Node[]) => el("section", { className: "hs-group" }, [el("h3", { textContent: title }), ...rows])
  const row = (...children: Node[]) => el("div", { className: "hs-row" }, children)
  // Shown only while `when` holds, e.g. ASCII settings for the ASCII style.
  const showWhen = <T extends HTMLElement>(node: T, when: () => boolean) => { ctx.refreshers.push(() => (node.hidden = !when())); return node }
  // Folded away by default.
  const advanced = (...rows: Node[]) => el("details", { className: "hs-advanced" }, [el("summary", { textContent: "Advanced" }), ...rows])

  // Tiles: one choice from a few, each with a label (and optional preview).
  function tiles<T extends string>(values: readonly T[], label: (v: T) => string, get: () => T, pick: (v: T) => void, extra?: (v: T) => Node | null) {
    const r = el("div", { className: "hs-tiles", role: "group" })
    const buttons = values.map((v) => {
      const b = el("button", { type: "button", className: "hs-tile" }, [el("span", { textContent: label(v) })])
      const x = extra?.(v)
      if (x) b.prepend(x)
      b.addEventListener("click", async () => { await ctx.attempt(() => pick(v)); ctx.record(); ctx.refresh() })
      r.append(b)
      return { v, b }
    })
    ctx.refreshers.push(() => buttons.forEach(({ v, b }) => {
      const on = get() === v
      b.classList.toggle("hs-on", on)
      b.setAttribute("aria-pressed", String(on))
    }))
    return r
  }

  // A slider with its value as an editable number. Dragging updates live;
  // letting go records the change.
  function slider(label: string, min: number, max: number, step: number, get: () => number, put: (v: number) => void) {
    const range = el("input", { type: "range", min: String(min), max: String(max), step: String(step), ariaLabel: label })
    const num = el("input", { type: "number", min: String(min), max: String(max), step: String(step), className: "hs-num", ariaLabel: `${label} value` })
    range.addEventListener("input", () => { void ctx.attempt(() => put(Number(range.value))); ctx.refresh() })
    range.addEventListener("change", () => ctx.record())
    num.addEventListener("change", async () => {
      const v = Math.min(max, Math.max(min, Number(num.value)))
      if (Number.isFinite(v)) { await ctx.attempt(() => put(v)); ctx.record(); ctx.refresh() }
    })
    ctx.refreshers.push(() => {
      const v = get()
      if (document.activeElement !== range) range.value = String(v)
      if (document.activeElement !== num) num.value = String(Math.round(v * 1000) / 1000)
      // The track fills up to the value, like a meter.
      range.style.setProperty("--fill", `${((Number(range.value) - min) / (max - min)) * 100}%`)
    })
    return el("label", { className: "hs-slider" }, [el("span", { textContent: label }), range, num])
  }

  // A colour, as a swatch that opens the system picker, with its hex beside it.
  function color(label: string, get: () => string, put: (hex: string) => void) {
    const input = el("input", { type: "color", className: "hs-color", ariaLabel: label })
    const hex = el("span", { className: "hs-hex" })
    input.addEventListener("input", () => { void ctx.attempt(() => put(input.value)); ctx.refresh() })
    input.addEventListener("change", () => ctx.record())
    ctx.refreshers.push(() => {
      const v = get()
      if (/^#[0-9a-f]{6}$/i.test(v) && document.activeElement !== input) input.value = v
      hex.textContent = v
    })
    return el("label", { className: "hs-colorrow" }, [el("span", { textContent: label }), hex, input])
  }

  function button(label: string, action: () => void | Promise<void>, className = "", options: { record?: boolean } = {}) {
    const b = el("button", { textContent: label, type: "button", className })
    b.addEventListener("click", async () => {
      await ctx.attempt(action)
      if (options.record) ctx.record()
      ctx.refresh()
    })
    return b
  }

  return { el, group, row, showWhen, advanced, tiles, slider, color, button }
}
