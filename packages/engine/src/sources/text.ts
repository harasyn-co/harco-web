// Text that types itself out in particles. Letters come from one of three
// glyph sets, each turned into sample points tagged with their character and
// their order within it:
//   strokes: Hershey single-stroke letters; particles lie along each pen
//            stroke, spread across its width by the weight, and each letter
//            is written stroke by stroke in drawing order.
//   matrix:  dot-matrix letters on a 5x7 grid; each dot is a small cluster.
//   font:    a web font's filled letters, rasterised (the first approach).
// A small share of the particles (the density) makes the letters; each takes
// a random sample point and moves to it once typing reaches it. A few more
// make a block cursor after the last letter to land; it blinks once typing is
// done. Text is shaded flat and bright rather than lit like a solid.
// The letters are built from whatever came before: until it is needed, every
// particle keeps its previous anchor, so the last form stays in place and
// letters are pulled out of it one by one. The particles that don't make
// letters let go of the form bit by bit while the line types, and fall away.
// Text always faces the viewer: anchors are placed in view space, then turned
// back by the inverse of the form's rotation, so rotating the view never
// turns the text edge-on.
import { COMMON_GLSL } from "../glsl/common"
import { FULLSCREEN_VERT, compile, uniforms } from "../core/gl"
import type { SdfProgram } from "./sdf"
import { HERSHEY_SIMPLEX } from "./hershey-simplex"

export type Glyphs = "strokes" | "matrix" | "font"

export interface TextOptions {
  text: string
  font: string
  /** Width of the text in world units (the forms are ~2 across). */
  width: number
  /** Characters typed per second. */
  speed: number
  cursor: boolean
  /** Share of particles that make the letters (the rest fall away). */
  density: number
  glyphs: Glyphs
  /** Stroke width or dot size, as a share of the capital height. */
  weight: number
}

// Up to this many characters, plus the cursor's position after the last.
export const MAX_TEXT = 80
const RASTER_PX = 96
export const GLYPH_MODE: Record<Glyphs, number> = { font: 0, strokes: 1, matrix: 2 }
// Pause before the first character.
const TYPE_DELAY = 0.5

const textFrag = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAnchor;
uniform sampler2D uNormalPrev; // the previous normals, kept with held anchors
uniform float uTime;
uniform float uDt;
uniform float uAge;
uniform vec4 uSeed;
uniform float uReseed;
uniform float uReset;
uniform mat3 uModel;           // object -> world; text is placed in world space
uniform sampler2D uPoints;     // x, y (world), character + order within it, stroke angle
uniform float uPointCount;
uniform int uPointsSide;
uniform float uCharCount;
uniform float uCharTime;       // seconds per character
uniform float uDelay;
uniform float uCharX[${MAX_TEXT + 1}];  // world x where each character starts
uniform vec4 uCursor;          // bottom, top, width (world), share of particles
uniform float uDensity;        // share of particles that make the letters
uniform int uGlyphMode;        // 0 font, 1 strokes, 2 matrix
uniform float uWeight;         // stroke width or dot radius (world)

layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outNormal;

${COMMON_GLSL}

const float CURSOR_LAG = 0.5;  // seconds until a character's particles have mostly landed

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 id = vec2(cell) + 0.5;
  vec4 prev = texelFetch(uAnchor, cell, 0);
  vec4 prevNormal = texelFetch(uNormalPrev, cell, 0);
  float typed = clamp((uAge - uDelay) / uCharTime, 0.0, uCharCount);
  float typing = uCharCount * uCharTime;
  float z = (hash21(id * 2.71 + 0.7) - 0.5) * 0.02;
  mat3 inv = transpose(uModel);  // rotations invert by transpose
  vec3 facing = inv * normalize(vec3(-0.35, 0.45, 1.0));

  float pick = hash21(id * 1.771 + 4.3);
  if (pick < uCursor.w) {
    // The cursor: a block in the cell after the last typed character. It
    // waits for that character's particles to fly in before moving on.
    float landed = clamp((uAge - uDelay - CURSOR_LAG) / uCharTime, 0.0, uCharCount);
    int k = int(min(floor(landed), uCharCount));
    vec3 p = vec3(uCharX[k] + hash21(id * 0.37 + 2.0) * uCursor.z,
                  mix(uCursor.x, uCursor.y, hash21(id * 0.59 + 8.0)), z);
    // Solid while typing, then blinking about once a second.
    float since = uAge - uDelay - CURSOR_LAG - typing;
    float state = since > 0.0 && fract(since / 1.06) > 0.5 ? 2.0 : 1.0;
    if (uAge >= uDelay) {
      outAnchor = vec4(inv * p, state);
      outNormal = vec4(facing, 2.0);
      return;
    }
  } else if (pick < uCursor.w + uDensity) {
    // A letter particle: to its point once typing reaches it. Typing is
    // fractional, so strokes draw themselves partway through a letter.
    float j = min(floor(hash21(id * 0.617 + 1.9) * uPointCount), uPointCount - 1.0);
    vec4 pt = texelFetch(uPoints, ivec2(mod(j, float(uPointsSide)), floor(j / float(uPointsSide))), 0);
    if (pt.z < typed) {
      vec2 at = pt.xy;
      float r = hash21(id * 3.13 + 1.1);
      if (uGlyphMode == 1) {
        // Across the stroke, by the weight.
        at += vec2(-sin(pt.w), cos(pt.w)) * (r - 0.5) * uWeight;
      } else if (uGlyphMode == 2) {
        // Within the dot.
        float a = hash21(id * 5.71 + 2.3) * 6.2832;
        at += vec2(cos(a), sin(a)) * sqrt(r) * uWeight;
      }
      outAnchor = vec4(inv * vec3(at, z * 0.3), 1.0);
      outNormal = vec4(facing, 2.0);  // w 2: shade flat, as type
      return;
    }
  } else {
    // Not part of the text: let go at a random moment while the line types.
    float release = uDelay + hash21(id * 0.913 + 6.1) * typing;
    if (uAge >= release) {
      outAnchor = vec4(prev.xyz, 0.0);
      outNormal = prevNormal;
      return;
    }
  }
  // Until needed, hold on to what was there before (usually the last form).
  outAnchor = vec4(prev.xyz, prev.w > 0.5 && prev.w < 1.5 ? 1.0 : 0.0);
  outNormal = prevNormal;
}
`

export interface TextProgram extends SdfProgram {
  text: {
    points: WebGLTexture
    side: number
    count: number
    charX: Float32Array
    cursor: [number, number, number, number]
    charCount: number
    charTime: number
    delay: number
    density: number
    mode: number
    weight: number
  }
  extra: Record<"uModel" | "uPoints" | "uNormalPrev" | "uPointCount" | "uPointsSide" | "uCharCount" | "uCharTime" | "uDelay" | "uCharX" | "uCursor" | "uDensity" | "uGlyphMode" | "uWeight", WebGLUniformLocation | null>
  dispose(): void
}

// A laid-out line, in its own units (y down): sample points (x, y,
// character + order within it, stroke angle), where each character starts,
// the cursor cell, the capital height, and how much ink there is (in square
// units) so the cursor can match the letters' density.
interface Layout {
  pts: number[]
  starts: number[]
  cursorBox: { x: number; w: number; top: number; bottom: number }
  cap: number
  top: number
  bottom: number
  ink: number
}

// Hershey strokes, sampled every STEP units along each polyline.
function strokeLayout(chars: string[], weight: number): Layout {
  const STEP = 0.3
  const SPACE = 16
  const pts: number[] = []
  const starts: number[] = []
  let pen = 0
  let length = 0
  chars.forEach((ch, c) => {
    starts.push(pen)
    const g = HERSHEY_SIMPLEX[(ch.codePointAt(0) ?? 32) - 33]
    if (!g) { pen += SPACE; return }
    // Polylines: "M x,y L x,y x,y ... M ...".
    const lines = g.d.split("M").filter(Boolean).map((part) =>
      part.replace("L", " ").trim().split(/\s+/).map((xy) => xy.split(",").map(Number) as [number, number]))
    const total = lines.reduce((sum, l) => sum + l.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - l[i][0], p[1] - l[i][1]), 0), 0) || 1
    let walked = 0
    for (const line of lines) {
      if (line.length === 1) line.push([line[0][0] + 0.01, line[0][1]])
      for (let i = 1; i < line.length; i++) {
        const [x0, y0] = line[i - 1]
        const [x1, y1] = line[i]
        const seg = Math.hypot(x1 - x0, y1 - y0)
        const angle = Math.atan2(-(y1 - y0), x1 - x0)
        const n = Math.max(1, Math.round(seg / STEP))
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n
          pts.push(pen + x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, c + ((walked + seg * f) / total) * 0.999, angle)
        }
        walked += seg
      }
    }
    length += total
    pen += g.o * 2 + 1
  })
  starts.push(pen)
  return {
    // Ink counts the stroke ribbons generously, so the cursor block beside
    // thin strokes stays light and grainy rather than solid.
    pts, starts, cap: 21, top: 1, bottom: 22, ink: length * Math.max(weight * 21, STEP) * 3,
    cursorBox: { x: 1, w: 14, top: 1, bottom: 24 },
  }
}

// Dot matrix: each character drawn small in a web font and read back as a
// 6x12 grid of cells (9 above the baseline, 3 below), fine enough for
// lowercase; inked cells become dots, ordered top to bottom.
function matrixLayout(chars: string[], font: string): Layout {
  const COLS = 6, ROWS = 12, ABOVE = 9, PX = 12
  const canvas = document.createElement("canvas")
  canvas.width = COLS * PX
  canvas.height = ROWS * PX
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const pts: number[] = []
  const starts: number[] = []
  let dots = 0
  chars.forEach((ch, c) => {
    const x0 = c * (COLS + 1)
    starts.push(x0)
    if (ch.trim() === "") return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#fff"
    ctx.font = `${ABOVE * PX * 1.02}px ${font}`
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(ch, canvas.width / 2, ABOVE * PX)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const cells: [number, number][] = []
    for (let r = 0; r < ROWS; r++) {
      for (let q = 0; q < COLS; q++) {
        let ink = 0
        for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) ink += data[((r * PX + y) * canvas.width + q * PX + x) * 4 + 3]
        if (ink / (PX * PX * 255) > 0.33) cells.push([q, r])
      }
    }
    cells.forEach(([q, r], i) => pts.push(x0 + q + 0.5, r + 0.5, c + (i / Math.max(1, cells.length)) * 0.999, 0))
    dots += cells.length
  })
  starts.push(chars.length * (COLS + 1))
  return {
    pts, starts, cap: ABOVE, top: 0, bottom: ABOVE, ink: dots,
    cursorBox: { x: 0, w: COLS, top: 0, bottom: ABOVE },
  }
}

// A web font's filled letters, rasterised; inked pixels become points.
function fontLayout(chars: string[], font: string): Layout {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const spec = `${RASTER_PX}px ${font}`
  ctx.font = spec
  // Where each character starts, measured cumulatively so proportional fonts work.
  const starts = chars.map((_, i) => ctx.measureText(chars.slice(0, i).join("")).width)
  const textW = ctx.measureText(chars.join("")).width
  const cell = ctx.measureText("M").width
  starts.push(textW)
  canvas.width = Math.ceil(textW + cell * 2)
  canvas.height = Math.ceil(RASTER_PX * 1.5)
  const baseline = Math.round(RASTER_PX * 1.05)
  ctx.font = spec
  ctx.fillStyle = "#fff"
  chars.forEach((ch, i) => ctx.fillText(ch, starts[i], baseline))
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const pts: number[] = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 128) continue
      let c = 0
      while (c < chars.length - 1 && starts[c + 1] <= x) c++
      pts.push(x + 0.5, y + 0.5, c + 0.999, 0)
    }
  }
  const cap = RASTER_PX * 0.7
  return {
    pts, starts, cap, top: baseline - cap, bottom: baseline, ink: pts.length / 4,
    cursorBox: { x: cell * 0.05, w: cell * 0.9, top: baseline - RASTER_PX * 0.72, bottom: baseline + RASTER_PX * 0.14 },
  }
}

// Lays the line out and maps it to world space: `width` wide including the
// cursor cell, centred on the origin, y up.
function sample(options: TextOptions) {
  const chars = [...options.text].slice(0, MAX_TEXT)
  const layout = options.glyphs === "strokes" ? strokeLayout(chars, options.weight)
    : options.glyphs === "matrix" ? matrixLayout(chars, options.font)
    : fontLayout(chars, options.font)
  const end = layout.starts[layout.starts.length - 1]
  const cursorW = options.cursor ? layout.cursorBox.x + layout.cursorBox.w * 1.1 : 0
  const scale = options.width / Math.max(1e-3, end + cursorW)
  const cx = (end + cursorW) / 2
  const cy = (layout.top + layout.bottom) / 2
  const toX = (u: number) => (u - cx) * scale
  const toY = (v: number) => -(v - cy) * scale

  const count = Math.max(1, layout.pts.length / 4)
  const side = Math.ceil(Math.sqrt(count))
  const points = new Float32Array(side * side * 4)
  for (let i = 0; i < layout.pts.length; i += 4) {
    points[i] = toX(layout.pts[i])
    points[i + 1] = toY(layout.pts[i + 1])
    points[i + 2] = layout.pts[i + 2]
    points[i + 3] = layout.pts[i + 3]
  }
  const charX = new Float32Array(MAX_TEXT + 1)
  layout.starts.forEach((s, i) => (charX[i] = toX(s + layout.cursorBox.x)))
  // Match the cursor's particles per unit area to the letters'.
  const box = layout.cursorBox
  const cursorArea = box.w * (box.bottom - box.top)
  const cursor: [number, number, number, number] = [
    toY(box.bottom), toY(box.top), box.w * scale,
    options.cursor ? Math.min(0.2, options.density * (cursorArea / Math.max(1, layout.ink))) : 0,
  ]
  // Weight: across a stroke, or a dot's radius (a dot cell is one unit).
  const weight = options.glyphs === "strokes" ? options.weight * layout.cap * scale
    : options.glyphs === "matrix" ? Math.min(0.5, options.weight * 3) * scale : 0
  return { points, side, count, charX, cursor, charCount: chars.length, weight }
}

export function compileText(gl: WebGL2RenderingContext, options: TextOptions): TextProgram {
  const program = compile(gl, FULLSCREEN_VERT, textFrag)
  const u = uniforms(gl, program, ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const)
  const extra = uniforms(gl, program, ["uModel", "uPoints", "uNormalPrev", "uPointCount", "uPointsSide", "uCharCount", "uCharTime", "uDelay", "uCharX", "uCursor", "uDensity", "uGlyphMode", "uWeight"] as const)
  const tex = gl.createTexture()
  const upload = () => {
    const s = sample(options)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, s.side, s.side, 0, gl.RGBA, gl.FLOAT, s.points)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    Object.assign(result.text, { side: s.side, count: s.count, charX: s.charX, cursor: s.cursor, charCount: s.charCount, weight: s.weight })
  }
  const result: TextProgram = {
    program,
    u,
    extra,
    text: {
      points: tex, side: 1, count: 1, charX: new Float32Array(MAX_TEXT + 1), cursor: [0, 0, 0, 0],
      charCount: 0, charTime: 1 / Math.max(0.5, options.speed), delay: TYPE_DELAY, density: options.density,
      mode: GLYPH_MODE[options.glyphs], weight: 0,
    },
    dispose: () => gl.deleteTexture(tex),
  }
  upload()
  // Web fonts load lazily; draw again once the font is ready (strokes need none).
  const probe = `${RASTER_PX}px ${options.font}`
  if (options.glyphs !== "strokes" && document.fonts && !document.fonts.check(probe)) {
    document.fonts.load(probe).then(() => { if (gl.isTexture(tex)) upload() }, () => {})
  }
  return result
}
