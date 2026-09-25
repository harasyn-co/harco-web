// The scene: a plain, JSON-serialisable description of everything the field
// shows. Apps and agents change the field by editing a scene and passing it
// (or any part of it) to field.set().
import type { FormName } from "./sources/forms"

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
  kind: "dots"
  /** Particle diameter in CSS px. */
  size: number
  /** Overall particle opacity, 0..1. */
  opacity: number
  palette: Palette
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
  motion: MotionSpec
}

export type ScenePatch = {
  [K in keyof Scene]?: K extends "source" ? SourceSpec : Scene[K] extends object ? DeepPartial<Scene[K]> : Scene[K]
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends unknown[] ? T[K] : T[K] extends object | null ? DeepPartial<T[K]> : T[K] }

export const ISOMETRIC_PITCH = 35.264

/** harasyn.co v1's look. */
export const DEFAULT_SCENE: Scene = {
  source: { type: "shape", form: "cells" },
  style: {
    kind: "dots",
    size: 1.5,
    opacity: 1,
    palette: {
      background: "#020203",
      shadow: "#1a1626",
      body: "#584840",
      mid: "#887a70",
      light: "#c0b6aa",
      rim: "#305c96",
      accent: "form",
      loose: "#ccc7bf",
    },
  },
  camera: { projection: "perspective", yaw: 0, pitch: 15, spin: 4.5, zoom: 1, drag: true },
  particles: { count: "auto" },
  motion: { gather: 3, scatter: 2.5, reserve: 0.12, via: "direct", autoplay: null },
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Returns a new scene with the patch applied. Sources are replaced whole. */
export function applyPatch(scene: Scene, patch: ScenePatch): Scene {
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
