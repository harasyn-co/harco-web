// Parametric curves that draw themselves. The drawn range grows from 0 to its
// full length over `duration` seconds, and every particle holds a fixed share
// of the drawn range, so all of them are always on the visible part: the
// line starts dense and bright, particles stream along it as the tip
// advances, and it thins out as it grows.
import { COMMON_GLSL } from "../glsl/common"
import { FULLSCREEN_VERT, compile, uniforms } from "../core/gl"
import type { SdfProgram } from "./sdf"

export type CurveName = "phi-rotation"

export interface CurveInfo {
  /** Body of `vec3 curve(float t)`; the result should fit inside radius ~1. */
  glsl: string
  /** Parameter range drawn, 0..length. */
  length: number
  /** Seconds to draw the whole range. */
  duration: number
  label: string
}

export const CURVES: Record<CurveName, CurveInfo> = {
  // Two arms turning at speeds 1 and phi, the golden ratio. Phi is the
  // hardest number to approximate with fractions; its best tries are ratios
  // of Fibonacci numbers (3/2, 5/3, 8/5, 13/8...), so the curve only ever
  // loosely nearly-closes, after 2, 3, 5, 8, 13, 21, 34 and 55 turns, and
  // weaves an unusually even rosette.
  "phi-rotation": {
    glsl: `
  const float PHI = 1.6180339887;
  vec2 a = vec2(cos(t), sin(t));
  vec2 b = vec2(cos(PHI * t), sin(PHI * t));
  return vec3((a + b) * 0.5, 0.0);`,
    length: 2.0 * Math.PI * 55,
    duration: 40,
    label: "φ rotation",
  },

}

export const CURVE_NAMES = Object.keys(CURVES) as CurveName[]

const curveFrag = (body: string) => /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAnchor;
uniform float uTime;
uniform float uDt;
uniform float uAge;
uniform vec4 uSeed;
uniform float uReseed;
uniform float uReset;
uniform vec2 uRange;        // full length, seconds to draw it

layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outNormal;

${COMMON_GLSL}

vec3 curve(float t) {
${body}
}

void main() {
  vec2 id = floor(gl_FragCoord.xy) + 0.5;
  float u = hash21(id * 0.617 + 1.9);
  // The tip eases in, so the first turns are drawn slowly enough to follow.
  // A small first stretch is drawn at once, so there is a line to start from.
  float grown = uRange.y > 0.0 ? clamp(uAge / uRange.y, 0.0, 1.0) : 1.0;
  float tip = max(uRange.x * grown * grown, uRange.x * 0.01);
  float t = u * tip;

  vec3 p = curve(t);
  vec3 tangent = curve(t + 1e-3) - p;
  tangent /= max(length(tangent), 1e-6);
  // A thin ribbon: a little spread across the line and out of the plane.
  vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)) + vec3(1e-5));
  p += side * (hash21(id * 1.33 + 4.1) - 0.5) * 0.008;
  p.z += (hash21(id * 2.71 + 0.7) - 0.5) * 0.02;

  outAnchor = vec4(p, 1.0);
  outNormal = vec4(normalize(vec3(0.0, 0.0, 1.0) + side * 0.35), 1.0);
}
`

export interface CurveProgram extends SdfProgram {
  /** Full length and seconds to draw it. */
  range: [number, number]
  uRange: WebGLUniformLocation | null
}

export function compileCurve(gl: WebGL2RenderingContext, body: string, length: number, duration: number): CurveProgram {
  const program = compile(gl, FULLSCREEN_VERT, curveFrag(body))
  const u = uniforms(gl, program, ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const)
  return { program, u, range: [length, duration], uRange: gl.getUniformLocation(program, "uRange") }
}
