// Rasters: an image whose inked pixels become particles, one per pixel, for
// pre-rendered text and UI. The image's red channel is coverage (white ink
// on black); pixels above the threshold are points, in pixel units from the
// image's top-left corner, y down. Each particle of the layer takes one
// point. Points are shuffled, so a layer with fewer particles than points
// draws an even subset rather than cutting off.
//
// Placed with a screen-space layer whose scale is world units per CSS px, and
// drawn with the Print model, particles land exactly on the screen's pixels.
import { FULLSCREEN_VERT, compile, uniforms } from "../core/gl"

const rasterFrag = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAnchor;
uniform float uTime;
uniform float uDt;
uniform float uAge;
uniform vec4 uSeed;
uniform float uReseed;
uniform float uReset;
uniform sampler2D uPoints;    // x, y (px), 0, coverage
uniform int uPointsSide;
uniform int uPointCount;
uniform int uSide;            // particles per row
uniform int uRow0;            // the layer's first row

layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outNormal;

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  int i = (cell.y - uRow0) * uSide + cell.x;
  if (i >= uPointCount) {
    // Not needed: rest.
    outAnchor = vec4(0.0);
    outNormal = vec4(0.0, 0.0, 1.0, 0.0);
    return;
  }
  vec4 pt = texelFetch(uPoints, ivec2(i % uPointsSide, i / uPointsSide), 0);
  outAnchor = vec4(pt.x, -pt.y, 0.0, 1.0);
  // w 3..4: ink, with its coverage in the fraction.
  outNormal = vec4(0.0, 0.0, 1.0, 3.0 + clamp(pt.w, 0.0, 0.999));
}
`

export interface RasterProgram {
  program: WebGLProgram
  u: Record<"uAnchor" | "uTime" | "uDt" | "uAge" | "uSeed" | "uReseed" | "uReset", WebGLUniformLocation | null>
  raster: {
    points: WebGLTexture
    side: number
    /** Points loaded so far (0 until the image arrives). */
    count: number
    extra: Record<"uPoints" | "uPointsSide" | "uPointCount" | "uSide" | "uRow0", WebGLUniformLocation | null>
  }
  dispose(): void
}

/** Coverage below this is left empty by default. */
export const RASTER_THRESHOLD = 0.03

// Decoded points by URL, shared between layers and kept for revisits.
const decoded = new Map<string, Promise<Float32Array>>()

// Deterministic shuffle, so the same image always yields the same subset.
function shuffle(points: Float32Array, n: number) {
  let s = 0x9e3779b9
  for (let i = n - 1; i > 0; i--) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    const j = (s >>> 0) % (i + 1)
    for (let k = 0; k < 4; k++) {
      const a = points[i * 4 + k]
      points[i * 4 + k] = points[j * 4 + k]
      points[j * 4 + k] = a
    }
  }
}

/** Loads and decodes a raster ahead of use, so it draws the moment it's shown. */
export function preloadRaster(src: string, threshold = RASTER_THRESHOLD): Promise<unknown> {
  return decodeRaster(src, threshold).catch(() => {})
}

export function decodeRaster(src: string, threshold: number): Promise<Float32Array> {
  const key = `${threshold}|${src}`
  let p = decoded.get(key)
  if (!p) {
    p = (async () => {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`Raster "${src}" failed to load (${res.status})`)
      const bitmap = await createImageBitmap(await res.blob())
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      ctx.drawImage(bitmap, 0, 0)
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
      const min = Math.round(threshold * 255)
      let n = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] > min) n++
      const points = new Float32Array(n * 4)
      let j = 0
      for (let y = 0; y < bitmap.height; y++) {
        for (let x = 0; x < bitmap.width; x++) {
          const r = data[(y * bitmap.width + x) * 4]
          if (r <= min) continue
          points.set([x + 0.5, y + 0.5, 0, r / 255], j * 4)
          j++
        }
      }
      shuffle(points, n)
      return points
    })()
    decoded.set(key, p)
    p.catch(() => decoded.delete(key))
  }
  return p
}

let shared: WeakMap<WebGL2RenderingContext, WebGLProgram> = new WeakMap()

export function compileRaster(gl: WebGL2RenderingContext, src: string, threshold: number, onError: (err: unknown) => void): RasterProgram {
  let program = shared.get(gl)
  if (!program || !gl.isProgram(program)) {
    program = compile(gl, FULLSCREEN_VERT, rasterFrag)
    shared.set(gl, program)
  }
  const u = uniforms(gl, program, ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const)
  const extra = uniforms(gl, program, ["uPoints", "uPointsSide", "uPointCount", "uSide", "uRow0"] as const)
  const tex = gl.createTexture()!
  const result: RasterProgram = {
    program,
    u,
    raster: { points: tex, side: 1, count: 0, extra },
    dispose: () => { disposed = true; gl.deleteTexture(tex) },
  }
  // Not gl.isTexture: a texture never bound yet reports false, and a
  // preloaded raster arrives before its first frame binds it.
  let disposed = false
  decodeRaster(src, threshold).then((points) => {
    if (disposed || gl.isContextLost()) return
    const n = points.length / 4
    const side = Math.max(1, Math.ceil(Math.sqrt(n)))
    const padded = new Float32Array(side * side * 4)
    padded.set(points)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, side, side, 0, gl.RGBA, gl.FLOAT, padded)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    result.raster.side = side
    result.raster.count = n
  }, onError)
  return result
}

/** Forget compiled programs (after the GL context is lost). */
export function resetRasterPrograms() { shared = new WeakMap() }
