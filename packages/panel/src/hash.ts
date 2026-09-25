// Scenes travel in URL hashes as base64url JSON (the panel's Share links).
import type { ScenePatch } from "@harasyn/engine"

export function encodeScene(scene: ScenePatch) {
  const bytes = new TextEncoder().encode(JSON.stringify(scene))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function sceneFromHash(hash = location.hash): ScenePatch | null {
  const m = hash.match(/scene=([\w-]+)/)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/")
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch {
    return null
  }
}
