// GLSL for the glyph scene. Everything on the page behind the text is drawn
// here, so the forms and the background are one material. Three passes:
//  1. SCENE_FRAG ray-marches the current 3D form into a square texture:
//     lit, premultiplied colour, plus a second target holding defocus.
//  2. BANDS_FRAG draws the background's coloured particle bands at low
//     resolution, revealed along an organic edge near the bottom. The flow
//     bends around the form and rises into it, and the pointer stirs it.
//  3. COMPOSITE_FRAG runs over the whole screen: dark base, bands, and film
//     grain. The form is expressed through that same grain, denser and
//     brighter where the form is. Morphs scatter the form back into grain.

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

/** Form indices, matching the switch in SCENE_FRAG's map(). */
export const FORM = { CELLS: 0, GYROID: 1, KNOT: 2, HARMONIC: 3, BULB: 4 } as const
export const FORM_COUNT = 5

/** Pointer trail length, matching TRAIL in the shaders. */
export const TRAIL_LENGTH = 12

// Pointer trail. Each entry: x, y (device px, GL origin), strength 0..1,
// radius (device px).
const TRAIL_GLSL = /* glsl */ `
#define TRAIL 12
uniform vec4 uTrail[TRAIL];

// Returns the combined disturbance at a point, and in push the direction
// pointing away from the pointer, weighted by strength.
float stir(vec2 dev, out vec2 push) {
  float total = 0.0;
  push = vec2(0.0);
  for (int i = 0; i < TRAIL; i++) {
    vec4 tr = uTrail[i];
    if (tr.z <= 0.0) continue;
    vec2 d = dev - tr.xy;
    float f = tr.z * exp(-dot(d, d) / (tr.w * tr.w));
    total += f;
    push += d / max(length(d), 1.0) * f;
  }
  return total;
}
`

const NOISE2_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float vnoise2(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}

float fbm2(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise2(p); p *= 2.03; a *= 0.5; }
  return v / 0.9375;
}
`

// Helpers and the five forms. Each form returns a signed distance and fits
// inside radius ~1. Expects uTime and PI to be defined.
const FORMS_GLSL = /* glsl */ `
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
`

export const SCENE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform float uN;        // scene size in texels
uniform float uTime;
uniform int uForm;
uniform float uAge;      // seconds since the form began condensing
uniform vec4 uSeed;      // per-appearance random parameters, 0..1
uniform vec2 uLean;      // -1..1, eased pointer position; the form leans to it
uniform int uMaxSteps;   // ray-march budget, lowered on slow devices
uniform vec3 uAccent;    // the current form's accent colour

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragAux;

const float PI = 3.14159265;

${FORMS_GLSL}

float map(vec3 p) {
  // The form grows slightly as it condenses.
  float g = mix(0.8, 1.0, smoothstep(0.0, 4.0, uAge));
  p /= g;
  float d;
  if (uForm == 0) d = fCells(p, uSeed);
  else if (uForm == 1) d = fGyroid(p, uSeed);
  else if (uForm == 2) d = fKnot(p, uSeed);
  else if (uForm == 3) d = fHarmonic(p, uSeed);
  else d = fBulb(p, uSeed);
  return d * g;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.12 * float(i) / 4.0;
    occ += (h - map(p + h * n)) * sca;
    sca *= 0.9;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

// Palette drawn from the page background: a grey-brown body, with shadows
// sinking into the violet and rims picking up the blue of the particle bands.
const vec3 SHADOW = vec3(26.0, 22.0, 38.0) / 255.0;
const vec3 BROWN = vec3(88.0, 72.0, 64.0) / 255.0;
const vec3 TAUPE = vec3(136.0, 122.0, 112.0) / 255.0;
const vec3 LIGHT = vec3(192.0, 182.0, 170.0) / 255.0;
const vec3 BAND_BLUE = vec3(48.0, 92.0, 150.0) / 255.0;
const vec3 BAND_TEAL = vec3(26.0, 100.0, 140.0) / 255.0;
const vec3 BAND_VIOLET = vec3(104.0, 48.0, 124.0) / 255.0;

void main() {
  vec2 uv = (gl_FragCoord.xy / uN) * 2.0 - 1.0;

  // Camera slowly orbits and bobs; the pointer adds a gentle lean.
  float ang = uTime * 0.08 + uLean.x * 0.45;
  vec3 ro = vec3(sin(ang) * 3.0, 0.8 + 0.5 * sin(uTime * 0.07) + uLean.y * 0.7, cos(ang) * 3.0);
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 2.3 * fw);

  fragColor = vec4(0.0);
  fragAux = vec4(0.0);

  // Only march inside the bounding sphere.
  float b = dot(ro, rd);
  float h = b * b - (dot(ro, ro) - 1.35 * 1.35);
  if (h < 0.0) return;
  h = sqrt(h);
  float t = max(0.0, -b - h);
  float tMax = -b + h;
  bool hit = false;
  for (int i = 0; i < 160; i++) {
    if (i >= uMaxSteps) break;
    float d = map(ro + rd * t);
    if (d < 0.0012 * t) { hit = true; break; }
    t += d * 0.8;
    if (t > tMax) break;
  }
  if (!hit) return;

  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  float ao = calcAO(p, n);
  // Key light from the viewer's upper left.
  vec3 L = normalize(-0.6 * rt + 0.75 * up - 0.35 * fw);
  float dif = max(dot(n, L), 0.0);
  float fre = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 28.0);
  // Cool bounce light from below, as if lit by the bands under the form.
  float below = max(-dot(n, up), 0.0);
  float lit = dif * (0.45 + 0.55 * ao);

  // Grey-brown body: brown in shade, taupe to pale warm grey where lit.
  vec3 col = mix(BROWN, TAUPE, smoothstep(0.0, 0.6, lit));
  col = mix(col, LIGHT, smoothstep(0.45, 1.0, lit) * 0.8);
  col *= 0.35 + 0.75 * lit + 0.2 * ao;
  // Crevices sink towards the violet-black of the background.
  col = mix(col, SHADOW, (1.0 - ao) * 0.7);
  // Rims and undersides pick up the particle-band colours.
  col += mix(BAND_BLUE, uAccent, 0.6) * fre * 0.9 + BAND_TEAL * fre * fre * 0.4;
  col += BAND_VIOLET * below * 0.22 * ao;
  col += LIGHT * spec * 0.28 * ao;

  // Coverage fades on the far side and at grazing silhouettes.
  float nearness = smoothstep(3.7, 2.3, t);
  float facing = smoothstep(0.0, 0.45, dot(n, -rd));
  float cover = mix(0.35, 1.0, nearness) * mix(0.5, 1.0, facing);

  // Defocus for depth of field: the far side and deep folds scatter more.
  float defocus = clamp(smoothstep(2.5, 3.6, t) * 0.8 + (1.0 - ao) * 0.45, 0.0, 1.0);

  // Premultiplied, so the textures can be filtered and blurred cleanly.
  fragColor = vec4(col * cover, cover);
  fragAux = vec4(defocus * cover, 0.0, 0.0, cover);
}
`

export const BANDS_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uBandRes;   // this pass's size in texels
uniform vec2 uScreen;    // canvas size in device px
uniform vec3 uRect;      // scene square: x, y (device px, GL origin), size
uniform sampler2D uScene;
uniform float uTime;
uniform float uPresence; // how condensed the form is, 0..1
uniform vec3 uAccent;    // the current form's accent colour
uniform float uReservoir; // 0..1, fades the bands in when the page opens

out vec4 fragColor;

const float PI = 3.14159265;

${NOISE2_GLSL}
${TRAIL_GLSL}

// One diagonal band of flowing streaks, modelled on the original particle
// bands: a centre, an angle, a width, and colours across its width.
vec3 band(vec2 p, vec2 c, float angDeg, float spread, vec3 cA, vec3 cB, float seed) {
  float a = radians(angDeg);
  vec2 dir = vec2(cos(a), sin(a));
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 d = p - c;
  float along = dot(d, dir);
  float across = dot(d, nrm) / spread;
  float env = exp(-across * across * 3.0) * smoothstep(1.7, 0.7, abs(along));
  float streak = fbm2(vec2(along * 2.2 - uTime * 0.05, across * 5.0 + seed));
  float fine = fbm2(vec2(along * 9.0 - uTime * 0.12, across * 22.0 + seed * 3.0));
  float v = env * (0.3 + 0.9 * streak * streak + 0.3 * fine);
  vec3 col = mix(cA, cB, smoothstep(-0.9, 0.9, across + (streak - 0.5) * 1.2));
  return col * v;
}

// The organic reveal edge: slow sine waves at unrelated frequencies, as a
// fraction of screen height measured from the top.
float edge(float u, float off) {
  float y = 0.6 + 0.04 * sin(uTime * 0.031 + off);
  y += 0.06 * sin(u * 1.3 * PI + uTime * 0.05 + off);
  y += 0.035 * sin(u * 2.9 * PI - uTime * 0.09 + 1.7 + off);
  y += 0.018 * sin(u * 6.1 * PI + uTime * 0.14 + 4.2 + off);
  return y;
}

void main() {
  vec2 suv = gl_FragCoord.xy / uBandRes;
  vec2 dev = suv * uScreen;
  float aspect = uScreen.x / uScreen.y;

  // The form's blurred presence and its gradient, to bend the flow.
  vec2 fuv = (dev - uRect.xy) / uRect.z;
  float halo = 0.0;
  vec2 grad = vec2(0.0);
  if (fuv.x > -0.3 && fuv.y > -0.3 && fuv.x < 1.3 && fuv.y < 1.3) {
    const float e = 0.04;
    halo = textureLod(uScene, fuv, 5.0).a;
    grad = vec2(
      textureLod(uScene, fuv + vec2(e, 0.0), 5.0).a - textureLod(uScene, fuv - vec2(e, 0.0), 5.0).a,
      textureLod(uScene, fuv + vec2(0.0, e), 5.0).a - textureLod(uScene, fuv - vec2(0.0, e), 5.0).a);
    halo *= uPresence;
    grad *= uPresence;
  }

  vec2 push;
  float st = stir(dev, push);

  // Band space: units of screen height, y pointing down.
  vec2 p = vec2(suv.x * aspect, 1.0 - suv.y);
  p += vec2(grad.x, -grad.y) * 0.35;  // the flow bends around the form
  p += vec2(push.x, -push.y) * 0.05;  // and is swept by the pointer

  vec3 col = band(p, vec2(0.12 * aspect, 0.15), -38.0, 0.2,
    vec3(120.0, 40.0, 130.0) / 255.0, vec3(20.0, 100.0, 145.0) / 255.0, 0.0);
  col += band(p, vec2(0.68 * aspect, 0.48), -33.0, 0.22,
    vec3(25.0, 65.0, 120.0) / 255.0, vec3(12.0, 105.0, 145.0) / 255.0, 7.3);
  // A broad, low band across the whole width: the reservoir the forms draw
  // from. Its hue shifts from violet on the left to blue and teal on the right.
  vec3 low = band(p, vec2(0.5 * aspect, 0.97), -4.0, 0.14,
    vec3(38.0, 60.0, 150.0) / 255.0, vec3(14.0, 96.0, 140.0) / 255.0, 3.1);
  col += mix(low, low.bgr * vec3(1.6, 0.5, 1.0), smoothstep(0.6, 0.0, suv.x) * 0.6);
  // Lean the whole field towards the current form's accent.
  col = mix(col, uAccent * dot(col, vec3(0.34)) * 2.6, 0.4);
  col *= 0.3 * (1.0 + st * 0.9) * uReservoir;

  // Reveal the bands only below the organic edge, with a softer veil above
  // it. Near the form, the current rises up into it.
  float yDown = 1.0 - suv.y;
  float e0 = edge(suv.x, 0.0);
  float e1 = edge(suv.x, 2.3);
  float solid = smoothstep(e0 - 0.05, e0 + 0.1, yDown);
  float veil = smoothstep(e1 + 0.05, e1 + 0.2, yDown);
  float vis = max(solid * (0.5 + 0.5 * veil), halo * 0.6);
  fragColor = vec4(col * vis, 1.0);
}
`

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uScene;  // premultiplied colour, with mipmaps
uniform sampler2D uAux;    // premultiplied defocus in .r
uniform sampler2D uBands;
uniform vec2 uScreen;      // canvas size in device px
uniform float uDpr;
uniform vec3 uRect;        // scene square: x, y (device px, GL origin), size
uniform float uTime;
uniform float uIntro;      // 0..1 fade-in of the form
uniform float uCondense;   // 1 = form fully present, 0 = scattered to grain
uniform vec3 uAccent;      // the current form's accent colour
uniform float uFlow;       // +1 material rising into the form, -1 falling out
uniform float uStreams;    // 0..1 strength of the streams

out vec4 fragColor;

const float PI = 3.14159265;
const vec3 BASE = vec3(2.0, 2.0, 3.0) / 255.0;

// The page's grain: 1 CSS px specks, 40% density, grey 180-255, alpha 4-18
// of 255, re-rolled about five times a second.
const float GRAIN_DENSITY = 0.4;

const vec3 BAND_VIOLET = vec3(120.0, 40.0, 130.0) / 255.0;
const vec3 BAND_BLUE = vec3(40.0, 75.0, 160.0) / 255.0;
const vec3 BAND_TEAL = vec3(20.0, 100.0, 145.0) / 255.0;

${NOISE2_GLSL}
${TRAIL_GLSL}

// Rising streams: lanes of grain that start across the whole bottom of the
// screen and fan in towards the base of the form, dashes travelling upward.
// Returns strength 0..1 and the lane's colour, which shifts across the width.
float streams(vec2 css, vec2 cssScreen, vec2 baseCss, float t, float dir, out vec3 tint) {
  tint = BAND_BLUE;
  if (css.y >= baseCss.y) return 0.0;
  float v = (baseCss.y - css.y) / max(baseCss.y, 1.0);   // 0 at the form, 1 at the bottom
  // Lanes converge: at the bottom they span the full width, at the form a quarter.
  float x0 = baseCss.x + (css.x - baseCss.x) / (0.25 + 0.75 * v);
  // Lanes every 9 px at the bottom, each 2 px wide; about half are active.
  float lane = floor(x0 / 9.0);
  if (fract(x0 / 9.0) > 0.24) return 0.0;
  float h = hash21(vec2(lane, 3.7));
  if (h > 0.5) return 0.0;
  float h2 = hash21(vec2(lane, 9.1));
  float phase = fract(v * (4.0 + 3.0 * h2) + dir * t * (0.16 + 0.14 * h) + h2 * 7.0);
  float dash = smoothstep(0.16, 0.0, phase) * (0.6 + 0.4 * h2);
  float across = clamp(x0 / cssScreen.x, 0.0, 1.0);
  tint = mix(mix(BAND_VIOLET, BAND_BLUE, smoothstep(0.0, 0.5, across)), BAND_TEAL, smoothstep(0.5, 1.0, across));
  return dash * smoothstep(1.0, 0.75, v) * smoothstep(0.0, 0.2, v);
}

// Flowing diagonal streaks in the band colours, running through the form's
// material at the same angle as the background bands.
vec3 bandMaterial(vec2 css) {
  float a = radians(-35.0);
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * css * 0.004;
  float streak = fbm2(vec2(q.x * 0.5 - uTime * 0.03, q.y * 3.5));
  float hue = fbm2(q * 0.7 + vec2(5.0, uTime * 0.01));
  vec3 c = mix(BAND_BLUE, BAND_TEAL, smoothstep(0.35, 0.7, streak));
  c = mix(c, BAND_VIOLET, smoothstep(0.55, 0.8, hue));
  c = mix(c, uAccent, 0.35);
  return c * (0.55 + 0.9 * streak);
}

float brightness(vec3 c) { return clamp(dot(c, vec3(0.3, 0.59, 0.11)) * 2.05, 0.0, 1.0); }

bool inScene(vec2 uv) { return uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0; }

// Unpremultiplied colour and brightness of the form at a scene coordinate.
vec4 readForm(vec2 uv) {
  if (!inScene(uv)) return vec4(0.0);
  vec4 s = textureLod(uScene, uv, 0.0);
  if (s.a < 0.002) return vec4(0.0);
  vec3 c = s.rgb / s.a;
  return vec4(c, brightness(c) * s.a);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 css = floor(frag / uDpr);
  float tick = floor(uTime * 5.0);
  float g1 = hash31(vec3(css, tick));
  float g2 = hash31(vec3(css, tick + 17.0));
  float g3 = hash31(vec3(css, tick + 31.0));
  float g4 = hash31(vec3(css, tick + 43.0));

  vec3 bg = BASE + texture(uBands, frag / uScreen).rgb;

  vec2 push;
  float st = stir(frag, push);

  vec2 uv = (frag - uRect.xy) / uRect.z;
  float halo = 0.0;
  float defocus = 0.0;
  if (inScene(uv)) {
    halo = textureLod(uScene, uv, 4.5).a;
    vec4 s0 = textureLod(uScene, uv, 0.0);
    if (s0.a > 0.01) defocus = textureLod(uAux, uv, 0.0).r / s0.a;
  }

  // Each speck samples the form from a jittered spot. The jitter widens at
  // the edges, in defocused areas, around the pointer, and while the form is
  // dissolving, so the form is always partly made of loose grain.
  float scatter = 1.0 - uCondense;
  float spread = mix(14.0, 1.5, smoothstep(0.15, 0.8, halo))
               + defocus * 9.0 + st * 40.0 + scatter * scatter * 90.0;
  vec2 jitter = (vec2(g2, g3) - 0.5) * 2.0 * spread * uDpr / uRect.z;
  vec2 shove = push * 26.0 * uDpr / uRect.z;  // specks pushed away from the pointer
  // While scattering, the form's grain also sinks back towards the bottom.
  float sink = uFlow < 0.0 ? scatter * sqrt(scatter) * 0.22 * (0.4 + g4) : 0.0;
  vec4 form = readForm(uv + jitter - shove + vec2(0.0, sink));
  vec3 col = form.rgb;
  float v = form.a * pow(uCondense, 1.3);
  halo *= uCondense;

  // The lower part of the form breaks back down into grain.
  float yDown = 1.0 - uv.y;
  float top = 0.64 + 0.04 * sin(uTime * 0.21);
  if (yDown > top && v > 0.0) {
    float keep = smoothstep(top + 0.3, top, yDown);
    v = g3 < keep ? v * (0.55 + 0.45 * keep) : 0.0;
  }
  // Fragments sampled from above drift down and fade.
  if (v == 0.0 && yDown > top - 0.05 && g4 > 0.95) {
    float fall = fract(uTime * 0.07 + hash21(vec2(floor(css.x / 2.0), 7.0)));
    vec4 above = readForm(uv + vec2(0.0, fall * 0.22));
    col = above.rgb;
    v = above.a * (1.0 - fall) * 0.7 * uCondense;
  }
  v *= uIntro;
  halo *= uIntro;

  // Streams rise into the form while it condenses and run back down while
  // it scatters; the strength comes from the timeline.
  vec2 cssScreen = uScreen / uDpr;
  vec2 baseCss = vec2(uRect.x + uRect.z * 0.5, uRect.y + uRect.z * 0.3) / uDpr;
  vec3 streamTint;
  float stream = streams(css, cssScreen, baseCss, uTime, uFlow < 0.0 ? -1.0 : 1.0, streamTint) * uStreams;
  streamTint = mix(streamTint, uAccent, 0.5);

  float density = clamp(GRAIN_DENSITY + 0.42 * smoothstep(0.0, 0.8, v) + 0.12 * halo + 0.12 * st + 0.5 * stream, 0.0, 0.92);

  // Rare sparkles on bright areas, drawn as small crosses in 5px blocks.
  vec2 block = floor(css / 5.0);
  float cyc = uTime * 0.35 + hash21(block + 3.1) * 10.0;
  float spark = 0.0;
  if (hash31(vec3(block, floor(cyc))) > 0.9993) {
    vec4 centre = readForm(((block * 5.0 + 2.5) * uDpr - uRect.xy) / uRect.z);
    if (centre.a * uCondense > 0.35) {
      vec2 l = css - block * 5.0 - 2.0;
      bool onCross = (l.x == 0.0 && abs(l.y) <= 2.0) || (l.y == 0.0 && abs(l.x) <= 2.0);
      if (onCross) spark = 0.85 * sin(fract(cyc) * PI) * uIntro;
    }
  }

  if (g1 >= density && spark <= 0.0) { fragColor = vec4(bg, 1.0); return; }

  // Base grain speck.
  vec3 rgb = vec3((180.0 + g2 * 75.0) / 255.0);
  float grainAlpha = (4.0 + g3 * 14.0) / 255.0;
  float alpha = grainAlpha + st * 0.05;
  if (stream > 0.0) {
    rgb = mix(rgb, streamTint * 2.4 + 0.08, 0.7);
    alpha = max(alpha, stream * (0.3 + 0.35 * g4));
  }

  float presence = max(v, halo * 0.35);
  if (presence > 0.003) {
    // The form's material: its lit grey-brown, streaked with band colour.
    vec3 streaks = bandMaterial(css);
    vec3 mat = mix(clamp(col * 1.2, 0.0, 1.0), streaks * (0.8 + 0.8 * v), 0.16);
    float k = smoothstep(0.02, 0.45, v);
    rgb = mix(rgb, mat, k);
    // Grain around the form picks up the band hues.
    rgb = mix(rgb, streaks * 2.2, halo * 0.25 * (1.0 - k));
    // Alpha varies a lot speck to speck, like film grain, and never goes solid.
    alpha = mix(alpha, 0.82, pow(smoothstep(0.02, 0.95, v), 1.2)) * (0.45 + 0.55 * g4);
    alpha = max(alpha, grainAlpha + halo * 0.1);
  }

  if (spark > 0.0) {
    rgb = mix(rgb, vec3(0.93, 0.9, 0.86), spark);
    alpha = max(alpha, spark);
  }
  fragColor = vec4(mix(bg, rgb, clamp(alpha, 0.0, 1.0)), 1.0);
}
`

/** Particle state texture is PARTICLE_SIDE x PARTICLE_SIDE. */
export const PARTICLE_SIDE = 128

// Particle update. State lives in two float textures:
//   A: position x, y (0..1 of the screen, GL origin), velocity x, y (screen
//      heights per second)
//   B: remaining life, total life, target x, y (0..1 of the screen)
// Rising (uFlow >= 0): dead particles respawn low across the whole width and
// fly to a random point on the form, vanishing into it on arrival.
// Falling (uFlow < 0): they respawn on the form and drop back to the bottom.
export const PARTICLE_UPDATE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform sampler2D uScene;   // form colour, alpha = coverage
uniform vec4 uRectN;        // scene square in 0..1 screen units: x, y, w, h
uniform float uAspect;      // screen width / height
uniform float uTime;
uniform float uDt;
uniform float uFlow;
uniform float uRate;        // chance per second that a dead particle respawns

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

${NOISE2_GLSL}

// Finds a random visible point on the form, in screen units. Returns false
// if a few tries all miss.
bool pickFormPoint(vec2 seed, out vec2 point) {
  for (int i = 0; i < 6; i++) {
    vec2 uv = vec2(hash21(seed + float(i) * 7.1), hash21(seed + float(i) * 3.7 + 11.0));
    if (textureLod(uScene, uv, 0.0).a > 0.25) {
      point = uRectN.xy + uv * uRectN.zw;
      return true;
    }
  }
  return false;
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(uStateA, cell, 0);
  vec4 b = texelFetch(uStateB, cell, 0);
  vec2 id = vec2(cell) + 0.5;
  vec2 pos = a.xy;
  vec2 vel = a.zw;
  float life = b.x - uDt;

  if (life <= 0.0) {
    life = 0.0;
    vec2 seed = id + fract(uTime * 13.37) * 97.0;
    if (hash21(seed) < uRate * uDt) {
      vec2 point;
      if (pickFormPoint(seed + 5.0, point)) {
        float total = 2.2 + 2.0 * hash21(seed + 2.0);
        if (uFlow >= 0.0) {
          // From the reservoir, anywhere along the bottom.
          pos = vec2(hash21(seed + 3.0), 0.01 + 0.14 * hash21(seed + 4.0));
          vel = vec2(0.0, 0.05);
          b = vec4(total, total, point);
        } else {
          // From the form, down to the reservoir.
          pos = point;
          vel = vec2((hash21(seed + 3.0) - 0.5) * 0.1, -0.02);
          vec2 target = vec2(clamp(point.x + (hash21(seed + 4.0) - 0.5) * 0.7, 0.0, 1.0), 0.02 + 0.08 * hash21(seed + 6.0));
          b = vec4(total, total, target);
        }
        life = total;
      }
    }
    outA = vec4(pos, vel);
    outB = vec4(life, b.y, b.zw);
    return;
  }

  // Steer towards the target in aspect-correct space, with a curling drift
  // so paths wander like particles in a current.
  vec2 to = (b.zw - pos) * vec2(uAspect, 1.0);
  float dist = length(to);
  float speed = 0.16 + 0.5 * dist;
  vec2 desired = to / max(dist, 1e-4) * speed;
  float n = vnoise2(pos * vec2(uAspect, 1.0) * 5.0 + uTime * 0.2 + id * 0.01) - 0.5;
  desired += vec2(-to.y, to.x) / max(dist, 1e-4) * n * 0.12;
  vel = mix(vel, desired, 1.0 - exp(-uDt * 2.2));
  pos += vel * uDt / vec2(uAspect, 1.0);
  if (dist < 0.012) life = 0.0;  // absorbed into the form or the reservoir

  outA = vec4(pos, vel);
  outB = vec4(life, b.yzw);
}
`

export const PARTICLE_VERT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uStateA;
uniform sampler2D uStateB;
uniform vec2 uCssScreen;   // screen size in CSS px
uniform float uPointSize;  // device px
uniform vec3 uAccent;

out vec4 vColor;

void main() {
  ivec2 cell = ivec2(gl_VertexID % ${PARTICLE_SIDE}, gl_VertexID / ${PARTICLE_SIDE});
  vec4 a = texelFetch(uStateA, cell, 0);
  vec4 b = texelFetch(uStateB, cell, 0);
  if (b.x <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    return;
  }
  // Snap to the CSS pixel grid so particles match the grain exactly.
  vec2 p = (floor(a.xy * uCssScreen) + 0.5) / uCssScreen;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
  float k = b.x / max(b.y, 1e-3);  // remaining fraction of life
  float fade = smoothstep(1.0, 0.85, k) * smoothstep(0.0, 0.12, k);
  float alpha = fade * 0.55;
  vec3 col = mix(vec3(0.82, 0.8, 0.78), uAccent * 2.2 + 0.1, 0.55);
  vColor = vec4(col * alpha, alpha);
}
`

export const PARTICLE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`
