// Surface points for signed-distance shapes. Every particle owns one point
// (its anchor) in the shape's object space. Each frame, a pass carries every
// anchor onto the current surface with a few Newton steps, starting from
// where it was last frame. Anchors therefore ride the surface as it moves, and
// when the shape changes they slide to the nearest point of the new one.
// Anchors that fail to settle, and a small random share each second, are
// re-seeded at a random point inside the bounding ball, which keeps the
// spread of points even over time.
import { COMMON_GLSL } from "../glsl/common"
import { FULLSCREEN_VERT, compile, uniforms, type Uniforms } from "../core/gl"
import { FORMS_GLSL } from "./forms"

// Newton steps per frame. Anchors continue from last frame, so a few suffice.
const STEPS = 3

const anchorFrag = (sdfBody: string) => /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uAnchor;  // previous anchors: object-space point, w = state
uniform float uTime;
uniform float uDt;
uniform float uAge;         // seconds since this shape appeared
uniform vec4 uSeed;
uniform float uReseed;      // share of anchors re-seeded per second
uniform float uReset;       // 1 = re-seed every anchor this frame

layout(location = 0) out vec4 outAnchor;
layout(location = 1) out vec4 outNormal;

${COMMON_GLSL}
${FORMS_GLSL}

float sdf(vec3 p) {
${sdfBody}
}

float map(vec3 p) {
  // A new shape grows slightly as it gathers.
  float g = mix(0.8, 1.0, smoothstep(0.0, 4.0, uAge));
  return sdf(p / g) * g;
}

// Gradient and distance from four taps on a tetrahedron.
vec4 probe(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.002;
  float a = map(p + k.xyy * e);
  float b = map(p + k.yyx * e);
  float c = map(p + k.yxy * e);
  float d = map(p + k.xxx * e);
  vec3 g = (k.xyy * a + k.yyx * b + k.yxy * c + k.xxx * d) / (4.0 * e);
  return vec4(g, (a + b + c + d) * 0.25);
}

// A uniformly random point in the bounding ball.
vec3 randomPoint(vec2 id, float salt) {
  float u = hash21(id + salt * 1.7);
  float v = hash21(id * 1.31 + salt * 3.1 + 7.0);
  float w = hash21(id * 0.73 + salt * 5.3 + 13.0);
  float th = 2.0 * PI * u;
  float z = 2.0 * v - 1.0;
  float r = 1.15 * pow(w, 1.0 / 3.0);
  float s = sqrt(max(0.0, 1.0 - z * z));
  return r * vec3(s * cos(th), z, s * sin(th));
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 id = vec2(cell) + 0.5;
  vec4 prev = texelFetch(uAnchor, cell, 0);
  vec3 p = prev.xyz;
  // w: 1 = on the surface; otherwise minus the number of frames spent looking.
  float tries = prev.w > 0.5 ? 0.0 : -prev.w;
  float salt = fract(uTime * 0.1713) * 97.0;
  if (uReset > 0.5 || tries >= 4.0 || hash21(id + salt) < uReseed * uDt) {
    p = randomPoint(id, salt);
    tries = 0.0;
  }

  vec4 pr;
  for (int i = 0; i < ${STEPS}; i++) {
    pr = probe(p);
    vec3 step = pr.w * pr.xyz / max(dot(pr.xyz, pr.xyz), 1e-4);
    float len = length(step);
    if (len > 0.25) step *= 0.25 / len;
    p -= step;
  }
  pr = probe(p);
  float glen = length(pr.xyz);
  // Distance estimate in object units, allowing for SDFs scaled below 1.
  float err = abs(pr.w) / max(glen, 1e-3);
  bool ok = err < 0.006 && glen > 1e-3 && length(p) < 1.45;

  outAnchor = vec4(p, ok ? 1.0 : -(tries + 1.0));
  outNormal = vec4(pr.xyz / max(glen, 1e-4), ok ? 1.0 : 0.0);
}
`

const NAMES = ["uAnchor", "uTime", "uDt", "uAge", "uSeed", "uReseed", "uReset"] as const

export interface SdfProgram {
  program: WebGLProgram
  u: Uniforms<(typeof NAMES)[number]>
}

export function compileSdf(gl: WebGL2RenderingContext, sdfBody: string): SdfProgram {
  const program = compile(gl, FULLSCREEN_VERT, anchorFrag(sdfBody))
  return { program, u: uniforms(gl, program, NAMES) }
}
