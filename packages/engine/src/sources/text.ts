// Text that types itself out in particles. The text is drawn once into a
// canvas and its inked pixels become sample points, each tagged with the
// character it belongs to. A small share of the particles (the density) makes
// the letters, sparse enough that the grain shows; each takes a random sample
// point and moves to it once its character is typed. A few more make a block
// cursor after the last letter to land; it blinks once typing is done.
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
}

// Up to this many characters, plus the cursor's position after the last.
export const MAX_TEXT = 80
const RASTER_PX = 96
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
uniform sampler2D uPoints;     // x, y (world), character index
uniform float uPointCount;
uniform int uPointsSide;
uniform float uCharCount;
uniform float uCharTime;       // seconds per character
uniform float uDelay;
uniform float uCharX[${MAX_TEXT + 1}];  // world x where each character starts
uniform vec4 uCursor;          // bottom, top, width (world), share of particles
uniform float uDensity;        // share of particles that make the letters

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
      outNormal = vec4(facing, 1.0);
      return;
    }
  } else if (pick < uCursor.w + uDensity) {
    // A letter particle: to its point once its character is typed.
    float j = min(floor(hash21(id * 0.617 + 1.9) * uPointCount), uPointCount - 1.0);
    vec4 pt = texelFetch(uPoints, ivec2(mod(j, float(uPointsSide)), floor(j / float(uPointsSide))), 0);
    if (pt.z < floor(typed)) {
      outAnchor = vec4(inv * vec3(pt.xy, z), 1.0);
      outNormal = vec4(facing, 1.0);
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
  }
  extra: Record<"uModel" | "uPoints" | "uNormalPrev" | "uPointCount" | "uPointsSide" | "uCharCount" | "uCharTime" | "uDelay" | "uCharX" | "uCursor" | "uDensity", WebGLUniformLocation | null>
  dispose(): void
}

// Rasterises the text and returns its inked pixels as world-space points.
function sample(options: TextOptions) {
  const chars = [...options.text].slice(0, MAX_TEXT)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const font = `${RASTER_PX}px ${options.font}`
  ctx.font = font
  // Where each character starts, measured cumulatively so proportional fonts work.
  const starts = chars.map((_, i) => ctx.measureText(chars.slice(0, i).join("")).width)
  const textW = ctx.measureText(chars.join("")).width
  const cell = ctx.measureText("M").width
  starts.push(textW)
  const pad = 8
  const cursorW = options.cursor ? cell * 1.1 : 0
  canvas.width = Math.ceil(textW + cursorW + pad * 2)
  canvas.height = Math.ceil(RASTER_PX * 1.5)
  const baseline = Math.round(RASTER_PX * 1.05)
  ctx.font = font
  ctx.fillStyle = "#fff"
  ctx.textBaseline = "alphabetic"
  chars.forEach((ch, i) => ctx.fillText(ch, pad + starts[i], baseline))

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  // World scale: the text plus cursor spans `width`, centred on the origin.
  const scale = options.width / (textW + cursorW)
  const cx = pad + (textW + cursorW) / 2
  const cy = baseline - RASTER_PX * 0.33
  const toX = (px: number) => (px - cx) * scale
  const toY = (py: number) => -(py - cy) * scale
  const pts: number[] = []
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 128) continue
      let c = 0
      while (c < chars.length - 1 && pad + starts[c + 1] <= x) c++
      pts.push(toX(x + 0.5), toY(y + 0.5), c, 0)
    }
  }
  const count = Math.max(1, pts.length / 4)
  const side = Math.ceil(Math.sqrt(count))
  const points = new Float32Array(side * side * 4)
  points.set(pts)
  const charX = new Float32Array(MAX_TEXT + 1)
  starts.forEach((s, i) => (charX[i] = toX(pad + s + cell * 0.04)))
  // A block cell: from just below the baseline to about cap height. Its
  // share of particles matches the letters' density per unit of area.
  const cursorArea = cell * 0.9 * RASTER_PX * 0.86
  const cursor: [number, number, number, number] = [
    toY(baseline + RASTER_PX * 0.14), toY(baseline - RASTER_PX * 0.72), cell * 0.9 * scale,
    options.cursor ? options.density * (cursorArea / count) : 0,
  ]
  return { points, side, count, charX, cursor, charCount: chars.length }
}

export function compileText(gl: WebGL2RenderingContext, options: TextOptions): TextProgram {
  const program = compile(gl, FULLSCREEN_VERT, textFrag)
  const u = uniforms(gl, program, ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const)
  const extra = uniforms(gl, program, ["uModel", "uPoints", "uNormalPrev", "uPointCount", "uPointsSide", "uCharCount", "uCharTime", "uDelay", "uCharX", "uCursor", "uDensity"] as const)
  const tex = gl.createTexture()
  const upload = () => {
    const s = sample(options)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, s.side, s.side, 0, gl.RGBA, gl.FLOAT, s.points)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    Object.assign(result.text, { side: s.side, count: s.count, charX: s.charX, cursor: s.cursor, charCount: s.charCount })
  }
  const result: TextProgram = {
    program,
    u,
    extra,
    text: {
      points: tex, side: 1, count: 1, charX: new Float32Array(MAX_TEXT + 1), cursor: [0, 0, 0, 0],
      charCount: 0, charTime: 1 / Math.max(0.5, options.speed), delay: TYPE_DELAY, density: options.density,
    },
    dispose: () => gl.deleteTexture(tex),
  }
  upload()
  // Web fonts load lazily; draw again once the font is ready.
  const probe = `${RASTER_PX}px ${options.font}`
  if (document.fonts && !document.fonts.check(probe)) {
    document.fonts.load(probe).then(() => { if (gl.isTexture(tex)) upload() }, () => {})
  }
  return result
}
