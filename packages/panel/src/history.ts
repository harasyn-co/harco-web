// Undo and redo over snapshots of what the person set (see sceneKey): each
// change made in the panel records the new state; undo and redo step
// through them.
import type { Scene } from "@harasyn/engine"

const LIMIT = 100

/**
 * The part of a scene that someone set. While autoplay runs, the source
 * changes on its own, so it isn't part of the look's state.
 */
export function sceneKey(scene: Scene): string {
  return JSON.stringify(scene.motion.autoplay ? { ...scene, source: undefined } : scene)
}

export class History {
  private past: string[] = []
  private future: string[] = []
  private current: string

  constructor(initial: string) {
    this.current = initial
  }

  /** Records a new state; returns whether it differed from the last. */
  record(state: string) {
    if (state === this.current) return false
    this.past.push(this.current)
    if (this.past.length > LIMIT) this.past.shift()
    this.current = state
    this.future = []
    return true
  }

  undo(): string | null {
    const prev = this.past.pop()
    if (prev === undefined) return null
    this.future.push(this.current)
    this.current = prev
    return prev
  }

  redo(): string | null {
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(this.current)
    this.current = next
    return next
  }

  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
}
