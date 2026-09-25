import type { Scene } from "@harasyn/engine"
import type { PanelTheme } from "./theme"

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
  /** Start folded (defaults to how it was last left, or folded on small screens). */
  folded?: boolean
  /** With `looks`: the page starts out showing the active look. */
  showsActiveLook?: boolean
  /** The panel starts in this top corner (and returns to it on reset). */
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
