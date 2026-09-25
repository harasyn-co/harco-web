// @harasyn/engine: particles that gather into shapes, harmonics, math,
// images and UI. Framework-free.
export { createField, isSupported, UnsupportedError } from "./core/field"
export type { Field, FieldEvent, FieldStats } from "./core/field"
export { DEFAULT_SCENE, ISOMETRIC_PITCH, applyPatch } from "./scene"
export type { Scene, ScenePatch, SourceSpec, StyleSpec, CameraSpec, MotionSpec, ParticleSpec, Palette, Via, Vec4 } from "./scene"
export { FORMS, FORM_NAMES } from "./sources/forms"
export type { FormName } from "./sources/forms"
