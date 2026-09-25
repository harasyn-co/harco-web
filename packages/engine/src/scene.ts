// The scene: a plain, JSON-serialisable description of everything the field
// shows. Apps and agents change the field by editing a scene and passing it
// (or any part of it) to field.set().
import type { FormName } from "./sources/forms"
import type { CurveName } from "./sources/curve"

export type Vec4 = [number, number, number, number]

/** What the particles gather into. */
export type SourceSpec =
  /** One of the built-in forms. */
  | { type: "shape"; form: FormName; seed?: Vec4 }
  /**
   * A custom signed distance function. `glsl` is the body of
   * `float sdf(vec3 p)`: return the distance to a surface that fits inside
   * radius ~1. It can use uTime (seconds), uSeed (vec4, 0..1), PI and the
   * form helpers (rot, smin, vnoise).
   */
  | { type: "sdf"; glsl: string; seed?: Vec4 }
  /**
   * A curve that draws itself: particles spread along t in 0..length, and
   * the drawn range grows to the full length over `duration` seconds. Use a
   * built-in `curve`, or give `glsl`: the body of `vec3 curve(float t)`,
   * returning a point inside radius ~1 (it can use PI).
   */
  | { type: "curve"; curve?: CurveName; glsl?: string; length?: number; duration?: number; seed?: Vec4 }

export interface Palette {
  /** Page background. */
  background: string
  /** Crevices and the far side of the form. */
  shadow: string
  /** The form's body in shade, midtone and light. */
  body: string
  mid: string
  light: string
  /** Rims and edges. */
  rim: string
  /** Tints rims and loose particles. "form" uses the current form's accent. */
  accent: string
  /** Particles in flight and in the reservoir. */
  loose: string
}

export interface StyleSpec {
  /**
   * How each particle is drawn. "dots": soft round points. "squares": crisp
   * square points. "streaks": short trails along each particle's motion.
   * "ascii": characters (see `ascii`).
   */
  kind: "dots" | "squares" | "streaks" | "ascii"
  /** Particle size in CSS px (dots, squares, streaks). */
  size: number
  /** Overall particle opacity, 0..1. */
  opacity: number
  palette: Palette
  streaks: {
    /** Seconds of motion each streak covers. */
    length: number
  }
  ascii: {
    /** Character cell size in CSS px. */
    cell: number
    /** Characters from empty to full; the first is usually a space. */
    chars: string
    /** true: one character per grid cell, like a terminal. false: one per particle. */
    grid: boolean
    /** "shade" uses each cell's shaded colour; a hex colour prints in one ink. */
    color: string
    /** How quickly cells fill up to the densest character. */
    contrast: number
    /** CSS font family for the characters. */
    font: string
  }
}

export interface CameraSpec {
  /** "isometric" is an orthographic view; "perspective" has depth. */
  projection: "perspective" | "isometric"
  /** Rotation about the vertical axis, degrees. */
  yaw: number
  /** Tilt of the top towards the viewer, degrees. Isometric is 35.26. */
  pitch: number
  /** Auto-rotation, degrees per second. */
  spin: number
  /** Scale of the form; 1 fits it to the view. */
  zoom: number
  /** Let the pointer drag to rotate. */
  drag: boolean
}

export interface ParticleSpec {
  /** Particle count, rounded to a square. "auto" picks by device. */
  count: "auto" | number
}

export type Via = "direct" | "reservoir"

/**
 * Where idle particles wait. "band": a soft pool along the bottom. "field":
 * faint dust across the whole view, so forms gather from anywhere. "none":
 * out of sight; particles fade in as they come and out as they go.
 */
export interface ReservoirSpec {
  mode: "band" | "field" | "none"
  /** Height of the band as a share of the view, 0..1. */
  height: number
  /** How visible resting particles are, 0..1. */
  opacity: number
  /** How fast resting particles drift, world units per second. */
  drift: number
}

export interface MotionSpec {
  /** Seconds for the form to gather out of the reservoir. */
  gather: number
  /** Seconds for the form to let go and fall back. */
  scatter: number
  /** Fraction of particles that stay behind in the reservoir, 0..1. */
  reserve: number
  /** How a change of source travels: sliding over, or via the reservoir. */
  via: Via
  /** Cycle through forms on its own. Null to stay put. */
  autoplay: null | { forms: FormName[]; hold: number }
}

export interface Scene {
  source: SourceSpec
  style: StyleSpec
  camera: CameraSpec
  particles: ParticleSpec
  reservoir: ReservoirSpec
  motion: MotionSpec
}

export type ScenePatch = {
  [K in keyof Scene]?: K extends "source"
    ? SourceSpec
    : K extends "style"
      ? Omit<DeepPartial<StyleSpec>, "palette"> & { palette?: PaletteName | Partial<Palette> }
      : Scene[K] extends object ? DeepPartial<Scene[K]> : Scene[K]
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object | null ? DeepPartial<T[K]> : T[K] }

export const ISOMETRIC_PITCH = 35.264

/** Named palettes. "v1" is harasyn.co v1's look. */
export const PALETTES = {
  v1: {
    background: "#020203", shadow: "#1a1626", body: "#584840", mid: "#887a70",
    light: "#c0b6aa", rim: "#305c96", accent: "form", loose: "#ccc7bf",
  },
  mono: {
    background: "#050505", shadow: "#101010", body: "#4a4a4a", mid: "#8c8c8c",
    light: "#e6e6e6", rim: "#b0b0b0", accent: "#9a9a9a", loose: "#bdbdbd",
  },
  ember: {
    background: "#070302", shadow: "#1c0806", body: "#6e2a12", mid: "#c0561c",
    light: "#ffc27a", rim: "#ff7a2e", accent: "#ff5a1f", loose: "#e0a27a",
  },
  ocean: {
    background: "#01040a", shadow: "#03101f", body: "#0f3d5c", mid: "#2a7fa8",
    light: "#b8ecff", rim: "#39d0ff", accent: "#1fb5d6", loose: "#8fc6d9",
  },
  phosphor: {
    background: "#010401", shadow: "#021006", body: "#0b4a1a", mid: "#1f9a3a",
    light: "#b6ffb0", rim: "#4dff6a", accent: "#2bd94a", loose: "#6fcf7d",
  },
  paper: {
    background: "#ece8e0", shadow: "#8a8378", body: "#3a3530", mid: "#221f1c",
    light: "#0d0c0b", rim: "#5a5248", accent: "#7a5a3a", loose: "#6e675e",
  },
} satisfies Record<string, Palette>

export type PaletteName = keyof typeof PALETTES

/** harasyn.co v1's look. */
export const DEFAULT_SCENE: Scene = {
  source: { type: "shape", form: "cells" },
  style: {
    kind: "dots",
    size: 1.5,
    opacity: 1,
    palette: { ...PALETTES.v1 },
    streaks: { length: 0.06 },
    ascii: {
      cell: 10,
      chars: " .:-=+*#%@",
      grid: true,
      color: "shade",
      contrast: 1,
      font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
    },
  },
  camera: { projection: "perspective", yaw: 0, pitch: 15, spin: 4.5, zoom: 1, drag: true },
  particles: { count: "auto" },
  reservoir: { mode: "band", height: 0.12, opacity: 0.55, drift: 0.05 },
  motion: { gather: 3, scatter: 2.5, reserve: 0.12, via: "direct", autoplay: null },
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/**
 * Returns a new scene with the patch applied. Sources are replaced whole, and
 * a palette given by name is swapped for that palette's colours.
 */
export function applyPatch(scene: Scene, patch: ScenePatch): Scene {
  const named = patch.style?.palette
  if (typeof named === "string") {
    if (!(named in PALETTES)) throw new Error(`Unknown palette "${named}". Palettes: ${Object.keys(PALETTES).join(", ")}`)
    patch = { ...patch, style: { ...patch.style, palette: { ...PALETTES[named] } } }
  }
  const merge = (a: unknown, b: unknown): unknown => {
    if (!isObject(a) || !isObject(b)) return b === undefined ? a : b
    const out: Record<string, unknown> = { ...a }
    for (const [k, v] of Object.entries(b)) out[k] = merge(a[k], v)
    return out
  }
  const next = merge(scene, { ...patch, source: undefined }) as Scene
  if (patch.source) next.source = structuredClone(patch.source)
  return next
}
