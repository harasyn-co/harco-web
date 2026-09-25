// Text that types itself out in particles. The text is drawn once into a
// canvas and its inked pixels become sample points, each tagged with the
// character it belongs to. Every particle takes a random sample point, and is
// wanted only once its character has been typed, so characters appear as
// their particles arrive. A share of the particles forms a block cursor after
// the last typed character; it blinks once typing is done.
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
}

// Up to this many characters, plus the cursor's position after the last.
export const MAX_TEXT = 80
const RASTER_PX = 96
// Share of particles that make the cursor.
const CURSOR_SHARE = 0.05
// Pause before the first character.
const TYPE_DELAY = 0.5

const textFrag = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAnchor;
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

layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outNormal;

${COMMON_GLSL}

const float CURSOR_LAG = 0.95;  // seconds until a character's particles have mostly landed

void main() {
  vec2 id = floor(gl_FragCoord.xy) + 0.5;
  float typed = clamp((uAge - uDelay) / uCharTime, 0.0, uCharCount);
  float z = (hash21(id * 2.71 + 0.7) - 0.5) * 0.02;

  vec3 p;
  float state;  // 0 = not yet, 1 = shown, 2 = held but hidden
  if (uCursor.w > 0.0 && hash21(id * 1.771 + 4.3) < uCursor.w) {
    // The cursor: a block in the cell after the last typed character. It
    // waits for that character's particles to fly in before moving on.
    float landed = clamp((uAge - uDelay - CURSOR_LAG) / uCharTime, 0.0, uCharCount);
    int k = int(min(floor(landed), uCharCount));
    p = vec3(uCharX[k] + hash21(id * 0.37 + 2.0) * uCursor.z,
             mix(uCursor.x, uCursor.y, hash21(id * 0.59 + 8.0)), z);
    // Solid while typing, then blinking about once a second.
    float since = uAge - uDelay - CURSOR_LAG - uCharCount * uCharTime;
    state = since > 0.0 && fract(since / 1.06) > 0.5 ? 2.0 : 1.0;
    if (uAge < uDelay) state = 0.0;
  } else {
    float j = min(floor(hash21(id * 0.617 + 1.9) * uPointCount), uPointCount - 1.0);
    vec4 pt = texelFetch(uPoints, ivec2(mod(j, float(uPointsSide)), floor(j / float(uPointsSide))), 0);
    p = vec3(pt.xy, z);
    state = pt.z < floor(typed) ? 1.0 : 0.0;
  }

  // Face the viewer whatever the rotation: undo it (rotations invert by transpose).
  mat3 inv = transpose(uModel);
  outAnchor = vec4(inv * p, state);
  outNormal = vec4(inv * normalize(vec3(-0.35, 0.45, 1.0)), 1.0);
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
  }
  extra: Record<"uModel" | "uPoints" | "uPointCount" | "uPointsSide" | "uCharCount" | "uCharTime" | "uDelay" | "uCharX" | "uCursor", WebGLUniformLocation | null>
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
  // A block cell: from just below the baseline to about cap height.
  const cursor: [number, number, number, number] = [
    toY(baseline + RASTER_PX * 0.14), toY(baseline - RASTER_PX * 0.72), cell * 0.9 * scale, options.cursor ? CURSOR_SHARE : 0,
  ]
  return { points, side, count, charX, cursor, charCount: chars.length }
}

export function compileText(gl: WebGL2RenderingContext, options: TextOptions): TextProgram {
  const program = compile(gl, FULLSCREEN_VERT, textFrag)
  const u = uniforms(gl, program, ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const)
  const extra = uniforms(gl, program, ["uModel", "uPoints", "uPointCount", "uPointsSide", "uCharCount", "uCharTime", "uDelay", "uCharX", "uCursor"] as const)
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
      charCount: 0, charTime: 1 / Math.max(0.5, options.speed), delay: TYPE_DELAY,
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
