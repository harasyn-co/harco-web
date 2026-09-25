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

// Mandelbulb: a 3D fractal whose power slowly drifts, so its folds bloom
// and recede.
float fBulb(vec3 p, vec4 s) {
  p *= 1.2;
  float power = 7.0 + 1.5 * sin(uTime * 0.12 + s.x * 6.0);
  vec3 z = p;
  float dr = 1.0;
  float r = 0.0;
  for (int i = 0; i < 6; i++) {
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(clamp(z.y / max(r, 1e-5), -1.0, 1.0)) * power;
    float phi = atan(z.z, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    z = pow(r, power) * vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)) + p;
  }
  return 0.5 * log(max(r, 1e-5)) * r / dr / 1.2;
}

// Quadratic Bezier distance (Inigo Quilez), for the pi glyph's strokes.
float dot2(vec2 v) { return dot(v, v); }
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C) {
  vec2 a = B - A;
  vec2 b = A - 2.0 * B + C;
  vec2 c = a * 2.0;
  vec2 d = A - pos;
  float kk = 1.0 / dot(b, b);
  float kx = kk * dot(a, b);
  float ky = kk * (2.0 * dot(a, a) + dot(d, b)) / 3.0;
  float kz = kk * dot(d, a);
  float res;
  float p = ky - kx * kx;
  float q = kx * (2.0 * kx * kx - 3.0 * ky) + kz;
  float h = q * q + 4.0 * p * p * p;
  if (h >= 0.0) {
    h = sqrt(h);
    vec2 x = (vec2(h, -h) - q) / 2.0;
    vec2 uv = sign(x) * pow(abs(x), vec2(1.0 / 3.0));
    float t = clamp(uv.x + uv.y - kx, 0.0, 1.0);
    res = dot2(d + (c + b * t) * t);
  } else {
    float z = sqrt(-p);
    float v = acos(q / (p * z * 2.0)) / 3.0;
    float m = cos(v);
    float n = sin(v) * 1.732050808;
    vec3 t = clamp(vec3(m + m, -n - m, n - m) * z - kx, 0.0, 1.0);
    res = min(dot2(d + (c + b * t.x) * t.x), dot2(d + (c + b * t.y) * t.y));
  }
  return sqrt(res);
}

// Pi: the glyph as a rounded solid. An arched bar over two curved legs,
// the right one kicking out at the foot. The strokes breathe and the bar
// sways gently.
float fPi(vec3 p, vec4 s) {
  float t = uTime * 0.5 + s.x * 6.0;
  vec2 q = p.xy;
  float sway = 0.04 * sin(t * 0.7);
  float bar = sdBezier(q, vec2(-0.8, 0.4 + sway), vec2(-0.05, 0.66), vec2(0.8, 0.5 - sway));
  float left = sdBezier(q, vec2(-0.3, 0.52), vec2(-0.26, -0.12), vec2(-0.56, -0.64));
  float right = sdBezier(q, vec2(0.3, 0.52), vec2(0.2, -0.4), vec2(0.6, -0.58));
  float stroke = min(bar, min(left, right)) - (0.09 + 0.012 * sin(t * 1.3));
  // Extrude, with rounded edges.
  vec2 w = vec2(stroke, abs(p.z) - 0.1);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.04;
}
`

export type FormName = "cells" | "gyroid" | "knot" | "harmonic" | "bulb" | "pi"

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
  bulb: { sdf: "return fBulb(p, uSeed);", accent: "#1e3a96", label: "Mandelbulb" },
  pi: { sdf: "return fPi(p, uSeed);", accent: "#2f5fa6", label: "Pi" },
}

export const FORM_NAMES = Object.keys(FORMS) as FormName[]
