// The built-in forms, carried over from harasyn.co v1. Each is a signed
// distance function that fits inside radius ~1, animated by uTime and shaped
// by a per-appearance random uSeed (vec4, 0..1). Expects uTime, uSeed and PI.

export const FORMS_GLSL = /* glsl */ `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// Living cells: blobs that drift, fuse and pull apart like dividing cells,
// with a wobbling, pitted membrane.
float fCells(vec3 p, vec4 s) {
  float t = uTime * 0.3 + s.x * 20.0;
  float d = 1e5;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec3 c = vec3(
      sin(t * 0.7 + fi * 2.1 + s.y * 6.0),
      sin(t * 0.53 + fi * 1.3 + s.z * 6.0),
      cos(t * 0.61 + fi * 2.7 + s.w * 6.0)) * 0.58;
    // Cells swell and shrink out of phase, so pairs pinch apart and fuse.
    float r = 0.2 + 0.06 * sin(t * 1.1 + fi * 1.7);
    d = smin(d, length(p - c) - r, 0.18);
  }
  d += (vnoise(p * 5.0 + vec3(0.0, t, 0.0)) - 0.5) * 0.05;
  d += (vnoise(p * 14.0 - vec3(t)) - 0.5) * 0.015;
  return d * 0.8;
}

// Gyroid: a triply periodic minimal surface, cut to a sphere so its lattice
// shows on the cut face. The level set breathes over time.
float fGyroid(vec3 p, vec4 s) {
  float sc = 5.0 + s.x * 3.0;
  vec3 q = p * sc;
  q.xz *= rot(uTime * 0.05 + s.y * 6.0);
  float level = 0.4 * sin(uTime * 0.25 + s.z * 6.0);
  float g = (abs(dot(sin(q), cos(q.yzx)) - level) - 0.28) / (sc * 1.7);
  return max(g, length(p) - 0.92);
}

// Torus knot: a tube following a (p, q) knot around a torus, flowing slowly
// along its own length.
float fKnot(vec3 p, vec4 s) {
  int pick = int(floor(s.x * 4.0));
  float P = pick == 0 ? 2.0 : pick == 1 ? 3.0 : pick == 2 ? 2.0 : 3.0;
  float Q = pick == 0 ? 3.0 : pick == 1 ? 2.0 : pick == 2 ? 5.0 : 4.0;
  p.xy *= rot(0.5 + 0.25 * sin(uTime * 0.1 + s.y * 6.0));
  float R = 0.56;
  float r = 0.26;
  float a = atan(p.z, p.x);
  vec2 cyl = vec2(length(p.xz) - R, p.y);
  float d = 1e5;
  for (int k = 0; k < 3; k++) {
    if (float(k) >= P) break;
    float ang = (a + 2.0 * PI * float(k)) * Q / P + uTime * 0.25;
    d = min(d, length(cyl - r * vec2(cos(ang), sin(ang))));
  }
  float thick = 0.1 + 0.025 * sin(a * 5.0 + uTime * 0.8);
  return (d - thick) * 0.5;
}

// Radiolarian: a sphere shaped by shifting spherical harmonics, like a
// microscopic organism that keeps changing its mind.
float fHarmonic(vec3 p, vec4 s) {
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  float th = atan(n.z, n.x);
  float ph = acos(clamp(n.y, -1.0, 1.0));
  float m1 = floor(3.0 + s.x * 5.0);
  float m2 = floor(2.0 + s.y * 4.0);
  float t = uTime * 0.4 + s.z * 10.0;
  float disp = 0.17 * sin(m1 * th + t) * sin(m2 * ph + t * 0.7)
             + 0.08 * sin((m1 + 2.0) * th - t * 1.3) * cos((m2 + 1.0) * ph)
             + 0.06 * (vnoise(n * 4.0 + t * 0.3) - 0.5);
  return (r - (0.6 + disp)) * 0.45;
}

// Chladni plate: sand on a vibrating plate gathers where it stays still,
// along the nodal lines of its vibration mode. Here those lines are raised
// ridges on a floating square plate inside a thin frame. The plate drifts
// from one mode to the next, so the lines break and reconnect.
float chladni(vec2 q, vec2 nm) {
  return cos(nm.x * PI * q.x) * cos(nm.y * PI * q.y) - cos(nm.y * PI * q.x) * cos(nm.x * PI * q.y);
}

vec2 chladniMode(float i) {
  float k = mod(i, 7.0);
  return k < 1.0 ? vec2(1.0, 3.0) : k < 2.0 ? vec2(2.0, 5.0) : k < 3.0 ? vec2(3.0, 4.0)
       : k < 4.0 ? vec2(1.0, 5.0) : k < 5.0 ? vec2(3.0, 5.0) : k < 6.0 ? vec2(2.0, 3.0) : vec2(4.0, 5.0);
}

float fChladni(vec3 p, vec4 s) {
  // A slight tip, so the plate reads as a solid object.
  p.yz *= rot(0.12);
  const float HALF = 0.78;
  vec2 q = p.xy / HALF;
  float phase = uTime * 0.1 + s.x * 7.0;
  float k = smoothstep(0.25, 0.75, fract(phase));
  vec2 a = chladniMode(floor(phase));
  vec2 b = chladniMode(floor(phase) + 1.0);
  float f = mix(chladni(q, a), chladni(q, b), k);
  const float e = 0.004;
  vec2 g = vec2(
    mix(chladni(q + vec2(e, 0.0), a), chladni(q + vec2(e, 0.0), b), k) - f,
    mix(chladni(q + vec2(0.0, e), a), chladni(q + vec2(0.0, e), b), k) - f) / e;
  // Distance to the nodal lines, in plate units, then to a ridge along them.
  float line = abs(f) / max(length(g), 0.5) * HALF;
  float ridge = length(vec2(line, p.z)) - 0.022;
  vec2 box = abs(q) - 1.0;
  float inside = max(box.x, box.y) * HALF;
  float frame = length(vec2(abs(inside), p.z)) - 0.018;
  return min(max(ridge, inside), frame);
}
`

export type FormName = "cells" | "gyroid" | "knot" | "harmonic" | "chladni"

export interface FormInfo {
  /** Body of `float sdf(vec3 p)`. */
  sdf: string
  /** The form's accent colour, used when the palette's accent is "form". */
  accent: string
  label: string
}

export const FORMS: Record<FormName, FormInfo> = {
  cells: { sdf: "return fCells(p, uSeed);", accent: "#6e3484", label: "Living cells" },
  gyroid: { sdf: "return fGyroid(p, uSeed);", accent: "#16708c", label: "Gyroid" },
  knot: { sdf: "return fKnot(p, uSeed);", accent: "#22589c", label: "Torus knot" },
  harmonic: { sdf: "return fHarmonic(p, uSeed);", accent: "#5c3c96", label: "Radiolarian" },
  chladni: { sdf: "return fChladni(p, uSeed);", accent: "#1e3a96", label: "Chladni plate" },
}

export const FORM_NAMES = Object.keys(FORMS) as FormName[]
