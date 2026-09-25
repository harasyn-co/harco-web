// @harasyn/engine: particles that gather into shapes, harmonics, math,
// images and UI. Framework-free.
export { createField, isSupported, UnsupportedError } from "./core/field"
export type { Field, FieldEvent, FieldOptions, FieldStats } from "./core/field"
export { DEFAULT_SCENE, ISOMETRIC_PITCH, PALETTES, applyPatch } from "./scene"
export type { Scene, ScenePatch, SourceSpec, StyleSpec, TypeSpec, CameraSpec, MotionSpec, ParticleSpec, ReservoirSpec, LayerSpec, Palette, PaletteName, Via, Vec4 } from "./scene"
export { FORMS, FORM_NAMES } from "./sources/forms"
export type { FormName } from "./sources/forms"
export { CURVES, CURVE_NAMES } from "./sources/curve"
export type { CurveName } from "./sources/curve"
export { SCENE_SCHEMA, SceneError, validateScene } from "./validate"
export { MODELS, MODEL_NAMES } from "./core/models"
export type { ModelName, ParticleModel } from "./core/models"
export { allocateRows } from "./core/layers"
