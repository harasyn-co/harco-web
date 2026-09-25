// Checks scene patches against scene.schema.json before they reach the field,
// so a bad value from an app or agent fails with a clear message instead of
// a broken frame. Supports the parts of JSON Schema the scene schema uses.
import SCENE_SCHEMA from "./scene.schema.json"

export { SCENE_SCHEMA }

type Schema = {
  type?: string
  const?: unknown
  enum?: unknown[]
  oneOf?: Schema[]
  $ref?: string
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: boolean
  items?: Schema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  minLength?: number
  pattern?: string
  description?: string
}

const root = SCENE_SCHEMA as unknown as Schema & { $defs: Record<string, Schema> }

const show = (v: unknown) => (typeof v === "string" ? JSON.stringify(v) : v === undefined ? "nothing" : JSON.stringify(v))

function typeOf(v: unknown) {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  return typeof v
}

function check(schema: Schema, value: unknown, path: string, errors: string[]) {
  if (schema.$ref) schema = root.$defs[schema.$ref.replace("#/$defs/", "")]
  const at = path || "scene"

  if (schema.oneOf) {
    const attempts = schema.oneOf.map((s) => { const e: string[] = []; check(s, value, path, e); return e })
    if (attempts.some((e) => e.length === 0)) return
    // Simple alternatives (names, "auto", null): list them. Otherwise report
    // the closest match, preferring one whose `type` field matches.
    const branches = schema.oneOf.map(resolve)
    const simple = branches.filter((s) => s.const !== undefined || s.enum || s.type === "null")
    if (typeOf(value) !== "object" && simple.length) {
      const options = simple.flatMap((s) => (s.enum ?? (s.type === "null" ? [null] : [s.const]))).map(show)
      const others = branches.filter((s) => !simple.includes(s)).map((s) => phrase(s.type))
      errors.push(`${at}: must be ${[...options, ...others].join(" or ")} (got ${show(value)})`)
      return
    }
    // Objects: a `type` field picks the branch; otherwise the branch that
    // describes an object.
    const kinds: unknown[] = branches.map((s) => s.properties?.type?.const).filter((k) => k !== undefined)
    const kind = typeOf(value) === "object" ? (value as Record<string, unknown>).type : undefined
    if (kinds.length && !kinds.includes(kind)) {
      errors.push(`${at}.type: must be one of ${kinds.map(show).join(", ")} (got ${show(kind)})`)
      return
    }
    const matching = branches.findIndex((s) => (kinds.length ? s.properties?.type?.const === kind : s.type === typeOf(value)))
    const best = matching >= 0 ? matching : attempts.reduce((b, e, i) => (e.length < attempts[b].length ? i : b), 0)
    errors.push(...attempts[best])
    return
  }

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at}: must be ${show(schema.const)} (got ${show(value)})`)
    return
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: must be one of ${schema.enum.map(show).join(", ")} (got ${show(value)})`)
    return
  }

  const t = typeOf(value)
  if (schema.type) {
    const ok = schema.type === "integer" ? Number.isInteger(value) : schema.type === t
    if (!ok || (t === "number" && !Number.isFinite(value as number))) {
      errors.push(`${at}: must be ${phrase(schema.type)} (got ${show(value)})`)
      return
    }
  }

  if (t === "number") {
    const n = value as number
    if (schema.minimum !== undefined && n < schema.minimum) errors.push(`${at}: must be at least ${schema.minimum} (got ${n})`)
    if (schema.maximum !== undefined && n > schema.maximum) errors.push(`${at}: must be at most ${schema.maximum} (got ${n})`)
    if (schema.exclusiveMinimum !== undefined && n <= schema.exclusiveMinimum) errors.push(`${at}: must be more than ${schema.exclusiveMinimum} (got ${n})`)
  }
  if (t === "string") {
    const s = value as string
    if (schema.minLength !== undefined && s.length < schema.minLength) errors.push(`${at}: must be at least ${schema.minLength} characters`)
    if (schema.pattern && !new RegExp(schema.pattern).test(s)) errors.push(`${at}: must be ${schema.description ?? `like ${schema.pattern}`} (got ${show(s)})`)
  }
  if (t === "array") {
    const a = value as unknown[]
    if (schema.minItems !== undefined && a.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} items`)
    if (schema.maxItems !== undefined && a.length > schema.maxItems) errors.push(`${at}: allows at most ${schema.maxItems} items`)
    if (schema.items) a.forEach((v, i) => check(schema.items!, v, `${path}[${i}]`, errors))
  }
  if (t === "object" && schema.properties) {
    const o = value as Record<string, unknown>
    for (const key of schema.required ?? []) if (!(key in o)) errors.push(`${at}.${key}: is required`)
    for (const [key, v] of Object.entries(o)) {
      const sub = schema.properties[key]
      const p = path ? `${path}.${key}` : key
      if (!sub) {
        if (schema.additionalProperties === false) {
          errors.push(`${p}: is not a setting here. Known: ${Object.keys(schema.properties).join(", ")}`)
        }
        continue
      }
      if (v !== undefined) check(sub, v, p, errors)
    }
  }
}

function phrase(type?: string) {
  return type === "integer" ? "a whole number" : type === "object" ? "an object" : type ? `a ${type}` : "something else"
}

function resolve(s: Schema): Schema {
  return s.$ref ? root.$defs[s.$ref.replace("#/$defs/", "")] : s
}

/** Returns a list of problems with a scene patch; empty if it is valid. */
export function validateScene(patch: unknown): string[] {
  const errors: string[] = []
  check(root, patch, "", errors)
  return errors
}

export class SceneError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Invalid scene:\n  ${problems.join("\n  ")}`)
    this.problems = problems
  }
}
