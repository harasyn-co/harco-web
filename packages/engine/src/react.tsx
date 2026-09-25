/// <reference types="vite/client" />
// React wrapper: <Field> owns a canvas and an engine field. The field is
// created once; later changes to `scene` are applied with field.set(), and a
// changed source morphs to it.
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createField, isSupported, type Field as EngineField, type FieldOptions } from "./core/field"
import type { ScenePatch, SourceSpec } from "./scene"

// In development, a hot update would swap this component in place and could
// keep a field running the engine code it started with. Any change to the
// engine therefore reloads the page instead.
if (import.meta.hot) import.meta.hot.accept(() => location.reload())

export interface FieldProps {
  scene: ScenePatch
  className?: string
  options?: FieldOptions
  /** Called once the field exists, and with null when it goes away. */
  onField?: (field: EngineField | null) => void
  /** Called with each new source as the field changes to it. */
  onSource?: (source: SourceSpec) => void
  /** Shown instead of the canvas without WebGL2. */
  fallback?: ReactNode
}

export function Field({ scene, className, options, onField, onSource, fallback }: FieldProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const field = useRef<EngineField | null>(null)
  const [supported] = useState(() => typeof document === "undefined" || isSupported())
  const callbacks = useRef({ onField, onSource })
  useEffect(() => { callbacks.current = { onField, onSource } })

  // Create once. The first scene is applied at creation.
  const initial = useRef(scene)
  useEffect(() => {
    if (!canvas.current || !supported) return
    const f = createField(canvas.current, initial.current, options)
    field.current = f
    const off = f.on("source", (s) => callbacks.current.onSource?.(s as SourceSpec))
    callbacks.current.onSource?.(f.getScene().source)
    callbacks.current.onField?.(f)
    return () => {
      off()
      f.dispose()
      field.current = null
      callbacks.current.onField?.(null)
    }
    // Options are read once; recreate the component to change them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Later scenes: apply the difference. The source only goes through when it
  // changed, so restyling never restarts the form.
  const applied = useRef(JSON.stringify(scene))
  useEffect(() => {
    const f = field.current
    const next = JSON.stringify(scene)
    if (!f || next === applied.current) return
    applied.current = next
    const patch = { ...scene }
    if (patch.source && JSON.stringify(patch.source) === JSON.stringify(f.getScene().source)) delete patch.source
    try {
      f.set(patch)
    } catch (err) {
      // A look that doesn't validate keeps the current scene rather than
      // breaking the page; the error names what's wrong.
      console.error(err)
    }
  }, [scene])

  if (!supported) return <>{fallback ?? null}</>
  return <canvas ref={canvas} className={className} />
}
