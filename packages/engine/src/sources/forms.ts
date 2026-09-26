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

// Primitives for the science forms below.

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// A cone rounded at both ends: radius r1 at a, r2 at b.
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// An arrow from a along dir, len long.
float sdArrow(vec3 p, vec3 a, vec3 dir, float len, float r) {
  vec3 neck = a + dir * len * 0.72;
  return min(sdCapsule(p, a, neck, r), sdRoundCone(p, neck, a + dir * len, r * 3.0, r * 0.3));
}

float sdBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// A ring of radius R in the xz plane.
float sdTorus(vec3 p, float R, float r) {
  return length(vec2(length(p.xz) - R, p.y)) - r;
}

// A ring of radius R around axis n (unit), centred at the origin.
float sdRing(vec3 p, vec3 n, float R, float r) {
  float h = dot(p, n);
  return length(vec2(length(p - n * h) - R, h)) - r;
}

// A flat disc of radius R and half-thickness th, facing n (unit).
float sdDisc(vec3 p, vec3 n, float R, float th) {
  float h = dot(p, n);
  vec2 d = vec2(length(p - n * h) - R, abs(h) - th);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// A hexagonal prism with flat top and bottom edges: apothem h.x, half-depth h.y.
float sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x), p.z - h.y);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// The hexagon (axial q, r) containing p, for flat-topped hexagons of
// circumradius R.
vec2 hexCell(vec2 p, float R) {
  vec2 qr = vec2(2.0 / 3.0 * p.x, -1.0 / 3.0 * p.x + 0.57735 * p.y) / R;
  vec3 c = vec3(qr, -qr.x - qr.y);
  vec3 rc = floor(c + 0.5);
  vec3 d = abs(rc - c);
  if (d.x > d.y && d.x > d.z) rc.x = -rc.y - rc.z;
  else if (d.y > d.z) rc.y = -rc.x - rc.z;
  return rc.xy;
}

vec2 hexCentre(vec2 cell, float R) {
  return R * vec2(1.5 * cell.x, 1.7320508 * (cell.y + 0.5 * cell.x));
}

// Entangled pair: two particles drift apart and back, joined by a thread
// that thins as they separate. Each carries a spin arrow; whenever one
// flips, the other flips the opposite way at the same instant.
float fEntangle(vec3 p, vec4 s) {
  float scale = 1.3;
  p /= scale;
  float t = uTime * 0.3 + s.x * 10.0;
  p.xz *= rot(s.y * 6.0);
  p.xy *= rot(0.15 * sin(uTime * 0.11));
  float sep = 0.28 + 0.24 * (0.5 - 0.5 * cos(t));
  float f = uTime * 0.22 + s.z * 4.0;
  float flip = PI * (floor(f) + smoothstep(0.7, 1.0, fract(f)));
  vec3 dir = vec3(sin(flip), cos(flip), 0.0);
  vec3 ca = vec3(sep, 0.03 * sin(uTime * 0.9), 0.0);
  vec3 cb = -ca;
  float d = min(length(p - ca), length(p - cb)) - 0.17;
  float thread = sdCapsule(p, ca, cb, mix(0.018, 0.005, (sep - 0.28) / 0.24));
  d = smin(d, thread, 0.05);
  d = min(d, sdArrow(p, ca - dir * 0.3, dir, 0.62, 0.02));
  d = min(d, sdArrow(p, cb + dir * 0.3, -dir, 0.62, 0.02));
  return d * scale;
}

// Quantum levitation: a magnet locked in the air above a superconducting
// disc. Its field lines loop round it and are squashed flat above the disc,
// which pushes them out (the Meissner effect); a ring of pinned flux tubes
// threads down through the disc and holds the magnet in place.
float fLevitate(vec3 p, vec4 s) {
  float t = uTime + s.x * 20.0;
  vec3 q = p - vec3(0.0, -0.5, 0.0);
  vec2 c = vec2(length(q.xz) - 0.78, abs(q.y) - 0.05);
  float d = min(max(c.x, c.y), 0.0) + length(max(c, 0.0)) - 0.02;

  float my = 0.1 + 0.02 * sin(t * 0.8);
  vec3 m = p - vec3(0.0, my, 0.0);
  m.xz *= rot(uTime * 0.25 + s.y * 6.0);
  c = vec2(length(m.xz) - 0.26, abs(m.y) - 0.06);
  d = min(d, min(max(c.x, c.y), 0.0) + length(max(c, 0.0)) - 0.02);

  // Field lines in 4 planes through the magnet's axis, taken one sector
  // at a time. Below the magnet they're squashed against the disc.
  float r = length(m.xz);
  float a = atan(m.z, m.x);
  float sector = PI / 4.0;
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec2 pl = vec2(r * cos(a), m.y * (m.y < 0.0 ? 1.9 : 1.0));
  float lines = 1e5;
  for (int i = 0; i < 3; i++) {
    float R = 0.22 + 0.1 * float(i) + 0.012 * sin(t * 1.3 + float(i));
    lines = min(lines, length(vec2(length(pl - vec2(R, 0.0)) - R, r * sin(a))) - 0.01);
  }
  d = min(d, lines * 0.6);

  // Pinned flux tubes: six, straight down from the magnet into the disc.
  a = atan(m.z, m.x);
  sector = PI / 3.0;
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  vec3 tube = vec3(r * cos(a) - 0.17, m.y, r * sin(a));
  d = min(d, sdCapsule(tube, vec3(0.0), vec3(0.0, -0.58 - my, 0.0), 0.012));
  return d;
}

// Bloch sphere: a wireframe globe with |0> at the top and |1> at the
// bottom. The qubit's state is an arrow that precesses around the axis and
// swings between the poles, tracing its latitude as it goes.
float fQubit(vec3 p, vec4 s) {
  float t = uTime + s.x * 20.0;
  p.xz *= rot(s.y * 6.0 + uTime * 0.05);
  p.yz *= rot(0.3);
  float R = 0.78;
  float d = sdTorus(p, R, 0.01);
  float lat = 0.45;
  float rl = sqrt(R * R - lat * lat);
  d = min(d, sdTorus(p - vec3(0.0, lat, 0.0), rl, 0.007));
  d = min(d, sdTorus(p + vec3(0.0, lat, 0.0), rl, 0.007));
  // Meridians: 4 great circles through the poles, one sector at a time.
  float a = atan(p.z, p.x);
  float sector = PI / 4.0;
  a = mod(a + sector * 0.5, sector) - sector * 0.5;
  float r = length(p.xz);
  d = min(d, length(vec2(length(vec2(r * cos(a), p.y)) - R, r * sin(a))) - 0.007);
  d = min(d, sdCapsule(p, vec3(0.0, -R, 0.0), vec3(0.0, R, 0.0), 0.008));
  d = min(d, length(p - vec3(0.0, R, 0.0)) - 0.045);
  d = min(d, length(p + vec3(0.0, R, 0.0)) - 0.045);
  // The state.
  float th = PI * (0.5 - 0.42 * cos(t * 0.35));
  float ph = t * 0.8;
  vec3 v = vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph));
  d = min(d, sdArrow(p, vec3(0.0), v, R * 0.94, 0.04));
  d = min(d, length(p - v * R) - 0.09);
  d = min(d, sdTorus(p - vec3(0.0, R * cos(th), 0.0), R * sin(th), 0.006));
  return d;
}

// CRISPR-Cas9: a Cas9 protein rides down a double helix, unzipping it as it
// goes. At the target it cuts, the ends part, the protein lets go and
// dissolves, and the strands knit back together.
float fCrispr(vec3 p, vec4 s) {
  float T = 13.0;
  float u = mod(uTime + s.x * T, T);
  float target = -0.2 + (s.y - 0.5) * 0.3;
  float yc = mix(0.9, target, smoothstep(0.5, 4.5, u));
  float gone = smoothstep(8.0, 10.0, u);
  float cut = smoothstep(5.0, 6.5, u) * (1.0 - smoothstep(9.5, 12.0, u));

  // Cas9: two lobes clamped round the helix, lumpy, shrinking away when done.
  vec3 cq = p - vec3(0.0, yc, 0.0);
  float size = 1.0 - gone;
  float cas = smin(length(cq - vec3(0.13, 0.06, 0.05)) - 0.2 * size,
                   length(cq - vec3(-0.1, -0.07, 0.1)) - 0.17 * size, 0.08);
  cas += (vnoise(cq * 9.0 + uTime * 0.2) - 0.5) * 0.05 * size + (1.0 - size) * 0.1;

  // The helix, turning.
  p.xz *= rot(uTime * 0.25);
  float k = 2.0 * PI / 0.9;
  float unzip = exp(-pow((p.y - yc) / 0.2, 2.0)) * size;
  float R = 0.2 + 0.13 * unzip;
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  float slope = 1.0 / sqrt(1.0 + R * R * k * k);
  float dna = 1e5;
  for (int i = 0; i < 2; i++) {
    float off = float(i) * 0.72 * PI;
    float da = mod(a - k * p.y - off + PI, 2.0 * PI) - PI;
    dna = min(dna, length(vec2(r - R, R * da * slope)) - 0.034);
  }
  // Base pairs: rungs across between the strands, gone where it's unzipped.
  float h = 0.07;
  float yi = (floor(p.y / h) + 0.5) * h;
  float ai = k * yi;
  vec3 e1 = vec3(R * cos(ai), yi, R * sin(ai));
  vec3 e2 = vec3(R * cos(ai + 0.72 * PI), yi, R * sin(ai + 0.72 * PI));
  dna = min(dna, sdCapsule(p, e1, e2, 0.013) + unzip * 0.2);
  // The cut: a gap opens at the target, then closes as the cell repairs it.
  dna = max(dna, 0.09 * cut - abs(p.y - target));
  dna = max(dna, abs(p.y) - 0.95);
  return min(dna * 0.6, cas);
}

// One face of the origami box: rows of scaffold tube, S square, lying in the
// xz plane with its hinge along x = 0.
float origamiFace(vec3 q, float S, float loose) {
  q.y += loose * 0.04 * sin(q.x * 11.0 + q.z * 5.0 + uTime * 2.0);
  float pitch = S / 8.0;
  float row = clamp(floor(q.z / pitch + 0.5), -4.0, 4.0);
  float dz = q.z - row * pitch;
  float dx = q.x - clamp(q.x, 0.03, S - 0.03);
  return length(vec3(dx, q.y, dz)) - 0.024;
}

// DNA origami: a scaffold strand, laid out as rows of tube, folds itself up
// from a flat cross into a closed box, lid last, then lets go and repeats.
float fOrigami(vec3 p, vec4 s) {
  float T = 14.0;
  float u = mod(uTime + s.x * T, T);
  float undo = 1.0 - smoothstep(11.5, 14.0, u);
  float sides = smoothstep(1.0, 5.0, u) * undo;
  float lid = smoothstep(5.5, 8.5, u) * undo;
  float a = mix(0.2, 0.5 * PI, sides);
  float b = mix(0.35, 0.5 * PI, lid);
  float loose = 1.0 - sides;
  p.xz *= rot(uTime * 0.12 + s.y * 6.0);
  p.yz *= rot(-0.45);
  float S = 0.46;
  float h = S * 0.5;
  float d = origamiFace(vec3(p.x + h, p.y + h, p.z), S, 0.0);
  // Four sides, hinged on the bottom's edges (paired up by symmetry).
  vec3 q = vec3(abs(p.x) - h, p.y + h, p.z);
  q.xy *= rot(a);
  d = min(d, origamiFace(q, S, loose));
  q = vec3(abs(p.z) - h, p.y + h, p.x);
  q.xy *= rot(a);
  d = min(d, origamiFace(q, S, loose));
  // The lid, hinged on the top edge of the +x side.
  q = vec3(p.x - h, p.y + h, p.z);
  q.xy *= rot(a);
  q.x -= S;
  q.xy *= rot(b);
  d = min(d, origamiFace(q, S, 1.0 - lid));
  return d * 0.8;
}

// Kinesin: a two-headed motor walking hand over hand along a microtubule,
// hauling a cargo vesicle that sways behind it. The track scrolls back under
// its feet so the walker stays in view.
float fKinesin(vec3 p, vec4 s) {
  float step = uTime / 1.4 + s.x * 10.0;
  float u = fract(step);
  float L = 0.3;
  p.xz *= rot(0.35 + 0.25 * sin(uTime * 0.08 + s.y * 6.0));
  // Microtubule: 13 protofilament ridges, beaded with tubulin.
  vec3 q = p - vec3(0.0, -0.42, 0.0);
  float a = atan(q.z, q.y);
  float mt = length(q.yz) - 0.13 - 0.012 * cos(13.0 * a)
           - 0.008 * cos((q.x + step * L) * 4.0 * PI / L);
  mt = max(mt * 0.8, abs(q.x) - 0.95);
  // Heads: the stance head rides back with the track while the other swings
  // over it to the front. Both legs look alike, so each step is the same.
  float top = -0.42 + 0.13 + 0.09;
  float sw = smoothstep(0.0, 1.0, u);
  vec3 stance = vec3(L * 0.5 - u * L, top, -0.03);
  vec3 swing = vec3(-L * 0.5 + L * sw, top + 0.2 * sin(PI * u), 0.05 + 0.05 * sin(PI * u));
  vec3 hip = vec3(0.0, 0.12 + 0.02 * sin(2.0 * PI * u), 0.0);
  float d = min(length((p - stance) * vec3(0.7, 1.0, 1.0)) - 0.09,
                length((p - swing) * vec3(0.7, 1.0, 1.0)) - 0.09);
  d = smin(d, sdCapsule(p, stance, hip, 0.035), 0.04);
  d = smin(d, sdCapsule(p, swing, hip, 0.035), 0.04);
  // The stalk up to the cargo, which lags a little behind each step.
  vec3 cargo = vec3(-0.12 + 0.02 * sin(2.0 * PI * u - 1.2), 0.58, 0.0);
  vec3 knee = vec3(-0.03, 0.3, 0.0);
  d = smin(d, sdCapsule(p, hip, knee, 0.024), 0.03);
  d = smin(d, sdCapsule(p, knee, cargo, 0.024), 0.03);
  float ves = length(p - cargo) - 0.26 + (vnoise(p * 7.0 + uTime * 0.3) - 0.5) * 0.03;
  d = smin(d, ves, 0.04);
  return min(d, mt);
}

// Gravitational waves: two black holes spiral in and merge, sending a
// two-armed spiral ripple out across a grid of spacetime, then ring down.
float gwPhase(float x) {
  // Orbital phase. Before the merger the orbit speeds up as it shrinks.
  float M = 9.0;
  return x < M ? -8.0 * pow(max(M - x, 0.3), 0.625) : -8.0 * pow(0.3, 0.625) + 6.0 * (x - M);
}

float fGravWave(vec3 p, vec4 s) {
  float T = 13.0;
  float M = 9.0;
  float u = mod(uTime + s.x * T, T);
  p.xz *= rot(s.y * 6.0);
  float tau = max(M - u, 0.0);
  float sep = 0.3 * pow(tau / M, 0.25);
  float y0 = -0.12;
  float r = length(p.xz);
  float th = atan(p.z, p.x);
  // The sheet: a well in the middle and a quadrupole ripple travelling out.
  float xr = u - r / 0.6;
  float tr = max(M - xr, 0.0);
  float amp = xr < M ? 0.02 + 0.025 * (1.0 - pow(tr / M, 0.25)) : 0.045 * exp(-(xr - M) * 1.2);
  amp *= smoothstep(0.0, 0.2, r) * step(0.0, xr);
  float h = y0 - 0.14 * exp(-r * r / 0.06) + amp * cos(2.0 * th - 2.0 * gwPhase(xr));
  // Grid lines on the sheet.
  float g = 0.1;
  float gx = abs(fract(p.x / g + 0.5) - 0.5) * g;
  float gz = abs(fract(p.z / g + 0.5) - 0.5) * g;
  float d = (length(vec2(p.y - h, min(gx, gz))) - 0.008) * 0.5;
  d = max(d, r - 0.95);
  // The black holes, or after the merger the one that rings down.
  vec3 c = vec3(cos(gwPhase(u)), 0.0, sin(gwPhase(u))) * sep;
  float hy = y0 + 0.06;
  float bh = u < M
    ? min(length(p - vec3(c.x, hy, c.z)) - 0.085, length(p - vec3(-c.x, hy, -c.z)) - 0.085)
    : length(p - vec3(0.0, hy, 0.0)) - 0.11 - 0.012 * exp(-(u - M) * 1.5) * sin(2.0 * th + 12.0 * u);
  return min(d, bh);
}

// Webb's primary mirror: the hexagonal segments in columns qMin..qMax of
// the 18-segment array (two rings round an empty centre), on a shallow dish.
float webbSegments(vec3 p, float R, float qMin, float qMax) {
  vec2 cell = hexCell(p.xy, R);
  float ring = (abs(cell.x) + abs(cell.y) + abs(cell.x + cell.y)) * 0.5;
  if (ring < 0.5 || ring > 2.5 || cell.x < qMin - 0.5 || cell.x > qMax + 0.5) return 0.05;
  vec2 c = hexCentre(cell, R);
  vec3 q = p - vec3(c, 0.12 * dot(c, c));
  return sdHexPrism(q, vec2(R * 0.866 - 0.01, 0.012));
}

// Webb unfolding: the five-layer sunshield spreads out and tensions, the
// secondary mirror swings forward on its tripod, and the golden mirror's
// side wings fold into place. Then it all stows and goes again.
float fWebb(vec3 p, vec4 s) {
  float T = 18.0;
  float u = mod(uTime + s.x * T, T);
  float back = 1.0 - smoothstep(15.5, 18.0, u);
  float shield = smoothstep(0.5, 5.0, u) * back;
  float tension = smoothstep(5.0, 8.0, u) * back;
  float boom = smoothstep(8.0, 10.5, u) * back;
  float wings = smoothstep(10.5, 13.5, u) * back;
  p.xz *= rot(0.6 + 0.35 * sin(uTime * 0.06) + s.y * 1.0);
  float R = 0.13;
  vec3 m = p - vec3(0.0, 0.2, 0.0);
  float d = webbSegments(m, R, -1.0, 1.0);
  // Side wings: the outer columns, hinged behind the mirror, folded back.
  float hx = 2.25 * R;
  vec3 w = vec3(abs(m.x) - hx, m.y, m.z + 0.03);
  w.xz *= rot(-(1.0 - wings) * 1.9);
  d = min(d, webbSegments(w + vec3(hx, 0.0, -0.03), R, 2.0, 2.0));
  // Secondary mirror on three struts.
  vec3 sm = mix(vec3(0.0, 0.62, -0.08), vec3(0.0, 0.02, 0.62), boom);
  d = min(d, sdCapsule(m, vec3(-0.3, -0.34, 0.02), sm, 0.008));
  d = min(d, sdCapsule(m, vec3(0.3, -0.34, 0.02), sm, 0.008));
  d = min(d, sdCapsule(m, vec3(0.0, 0.5, -0.05), sm, 0.008));
  d = min(d, sdDisc(m - sm, normalize(vec3(0.0, 0.2, -1.0)), 0.06, 0.012));
  // Tower and spacecraft bus under the sunshield.
  d = min(d, sdCapsule(p, vec3(0.0, -0.15, -0.05), vec3(0.0, -0.5, -0.05), 0.03));
  d = min(d, sdBox(p - vec3(0.0, -0.68, -0.05), vec3(0.16, 0.07, 0.16), 0.01));
  // Sunshield: five kite-shaped layers, stacked when stowed.
  float sc = mix(0.14, 1.0, shield);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 q = p - vec3(0.0, -0.45 - fi * mix(0.006, 0.035, tension), -0.05);
    float lsc = sc * (1.0 - 0.03 * fi);
    vec2 k = abs(q.xz) / lsc;
    float shape = (max(k.x / 0.88 + k.y / 0.55, k.y / 0.42) - 1.0) * lsc * 0.4;
    d = min(d, max(shape, abs(q.y) - 0.004));
  }
  return d;
}

// DART: a spacecraft flies head-on into Dimorphos, the little moon of the
// asteroid Didymos. Debris sprays back in a cone, and the moon's orbit
// tightens and speeds up.
float fDart(vec3 p, vec4 s) {
  float T = 13.0;
  float hit = 5.0;
  float u = mod(uTime + s.x * T, T);
  p.xz *= rot(s.y * 6.0);
  p.yz *= rot(0.6);
  // Didymos: a spinning-top asteroid.
  vec3 n = normalize(p + vec3(0.0, 1e-4, 0.0));
  float d = length(p) - 0.26 - 0.04 * (1.0 - abs(n.y)) - (vnoise(p * 7.0) - 0.5) * 0.05;
  // Dimorphos and its orbit.
  float after = smoothstep(hit, hit + 1.5, u);
  float orbit = mix(0.62, 0.54, after);
  float a0 = s.z * 6.0;
  float a = a0 + 0.45 * u + 0.12 * max(u - hit, 0.0);
  vec3 moon = orbit * vec3(cos(a), 0.0, sin(a));
  vec3 mq = p - moon;
  d = min(d, length(mq) - 0.11 - (vnoise(mq * 14.0) - 0.5) * 0.04);
  d = min(d, sdTorus(p, orbit, 0.005));
  // The spacecraft, meeting the moon head-on along its path.
  float ah = a0 + 0.45 * hit;
  vec3 atHit = 0.62 * vec3(cos(ah), 0.0, sin(ah));
  vec3 ahead = vec3(-sin(ah), 0.0, cos(ah));
  if (u < hit) {
    vec3 craft = atHit + (ahead + vec3(0.0, 0.08, 0.0)) * (hit - u) * 0.12;
    vec3 cq = p - craft;
    vec3 side = normalize(cross(ahead, vec3(0.0, 1.0, 0.0)));
    d = min(d, sdBox(cq, vec3(0.035), 0.006));
    d = min(d, sdDisc(cq - side * 0.11, ahead, 0.065, 0.005));
    d = min(d, sdDisc(cq + side * 0.11, ahead, 0.065, 0.005));
  }
  // Ejecta: a hollow, clumpy cone thrown back along the craft's path,
  // spreading out and thinning away.
  float e = u - hit;
  if (e > 0.0) {
    float len = 0.42 * (1.0 - exp(-e * 0.9));
    float th = 0.03 * (1.0 - smoothstep(3.0, 7.0, e));
    vec3 q = p - atHit;
    float hz = dot(q, ahead);
    float rr = length(q - ahead * hz);
    float cone = abs(rr * 0.82 - hz * 0.57);
    cone += (vnoise(q * 16.0 + e * 0.5) - 0.5) * 0.06;
    d = min(d, max(max(cone - th, -hz), hz - len));
  }
  return d;
}

// The layers of the neural network: x position and node count. Layer 0 is
// the input image; its connections leave from its centre.
const float NN_X[5] = float[5](-0.82, -0.35, 0.1, 0.5, 0.85);
const int NN_N[5] = int[5](1, 5, 4, 3, 2);
// The input: a 7x7 cat face (ears, eyes, nose), one row per int.
const int NN_CAT[7] = int[7](65, 99, 127, 93, 127, 107, 62);

vec3 nnNode(int l, int j) {
  return vec3(NN_X[l], (float(j) - 0.5 * float(NN_N[l] - 1)) * 0.28, 0.0);
}

// Whether a node lights for this input. The first output node is "cat".
bool nnOn(int l, int j, float seed) {
  if (l == 0) return true;
  if (l == 4) return j == 0;
  return hash13(vec3(float(l), float(j), seed)) > 0.4;
}

// Neural network: an image of a cat comes in as pixels; a pulse carries it
// through the layers, lighting the nodes that detect edges, then shapes,
// then features, until the "cat" output fires.
float fNeural(vec3 p, vec4 s) {
  float T = 7.0;
  float u = mod(uTime + s.x * T, T);
  float seed = floor(s.z * 4.0);
  float px = mix(-0.95, 1.0, u / 3.5);
  float fade = 1.0 - smoothstep(6.0, 7.0, u);
  p.xz *= rot(0.45 * sin(uTime * 0.1 + s.y * 6.0));
  // Input pixels, pushed out where the cat is.
  vec3 g = p - vec3(NN_X[0], 0.0, 0.0);
  float pitch = 0.085;
  float row = clamp(floor(-g.y / pitch + 0.5), -3.0, 3.0);
  float col = clamp(floor(g.z / pitch + 0.5), -3.0, 3.0);
  bool on = ((NN_CAT[int(row) + 3] >> (int(col) + 3)) & 1) == 1;
  float depth = 0.012 + (on ? 0.03 * smoothstep(0.0, 0.6, u) * fade : 0.0);
  float d = sdBox(g - vec3(-depth, -row * pitch, col * pitch), vec3(depth, 0.036, 0.036), 0.006);
  // Nodes swell as the pulse reaches their layer, if they detect something.
  for (int l = 1; l < 5; l++) {
    float act = smoothstep(NN_X[l] - 0.05, NN_X[l] + 0.08, px) * fade;
    for (int j = 0; j < 5; j++) {
      if (j >= NN_N[l]) break;
      float lit = nnOn(l, j, seed) ? act : 0.0;
      float r = l == 4 && j == 0 ? 0.05 + 0.08 * lit : 0.04 + 0.03 * lit;
      d = min(d, length(p - nnNode(l, j)) - r);
    }
  }
  // Connections, only for the gap between layers that p is in.
  int gap = p.x < NN_X[1] ? 0 : p.x < NN_X[2] ? 1 : p.x < NN_X[3] ? 2 : 3;
  float pulse = exp(-pow((p.x - px) / 0.08, 2.0)) * fade;
  float done = step(NN_X[gap + 1], px) * fade;
  for (int i = 0; i < 5; i++) {
    if (i >= NN_N[gap]) break;
    bool from = nnOn(gap, i, seed);
    for (int j = 0; j < 5; j++) {
      if (j >= NN_N[gap + 1]) break;
      bool live = from && nnOn(gap + 1, j, seed);
      float r = 0.005 + (live ? 0.012 * pulse + 0.004 * done : 0.0);
      d = min(d, sdCapsule(p, nnNode(gap, i), nnNode(gap + 1, j), r));
    }
  }
  return d;
}

// Graphene: a single layer of carbon atoms in a honeycomb. The sheet
// ripples, curls up into a carbon nanotube, and unrolls again.
float fGraphene(vec3 p, vec4 s) {
  float T = 14.0;
  float u = mod(uTime + s.x * T, T);
  float roll = smoothstep(2.0, 6.0, u) * (1.0 - smoothstep(9.0, 13.0, u));
  p.xz *= rot(s.y * 6.0);
  // Bend the sheet round an axis along z; at full roll its edges meet.
  float W = 0.9;
  float rho = mix(3.0, W / PI, roll);
  vec2 c = p.xy - vec2(0.0, rho - 0.2 * roll);
  float ang = atan(c.x, -c.y);
  vec3 q = vec3(rho * ang, rho - length(c), p.z);
  q.y -= 0.035 * sin(q.x * 4.0 + uTime * 0.6) * cos(q.z * 3.5 - uTime * 0.5) * (1.0 - roll);
  // Atoms sit on the corners of hexagonal cells; bonds are their edges.
  float a = 0.09;
  vec2 l = q.xz - hexCentre(hexCell(q.xz, a), a);
  float la = atan(l.y, l.x);
  float sector = PI / 3.0;
  float k = floor(la / sector + 0.5) * sector;
  float atom = length(vec3(l - a * vec2(cos(k), sin(k)), q.y)) - 0.024;
  float k0 = floor(la / sector) * sector;
  vec2 v0 = a * vec2(cos(k0), sin(k0));
  vec2 v1 = a * vec2(cos(k0 + sector), sin(k0 + sector));
  vec2 e = v1 - v0;
  vec2 off = l - v0 - e * clamp(dot(l - v0, e) / dot(e, e), 0.0, 1.0);
  float bond = length(vec3(off, q.y)) - 0.009;
  float edge = max(abs(q.x) - W, abs(q.z) - 0.75);
  return max(min(atom, bond), edge) * 0.8;
}

// Invisibility cloak: rays of light flow round a metamaterial shell and
// close up behind it as if nothing were there, with wavefronts pulsing along
// them. The rays are streamlines of the flow round a sphere.
float fCloak(vec3 p, vec4 s) {
  p.xz *= rot(0.5 + 0.3 * sin(uTime * 0.07 + s.y * 6.0));
  p.yz *= rot(0.25 + s.z);
  float Rc = 0.34;
  float r = max(length(p), 1e-3);
  float k3 = Rc * Rc * Rc / (r * r * r);
  // q: how far from the axis this point's ray started out.
  float rho = length(p.yz);
  float q = rho * sqrt(max(1.0 - k3, 0.0));
  float sector = PI / 4.0;
  float az = atan(p.z, p.y);
  float da = mod(az + sector * 0.5, sector) - sector * 0.5;
  float qi = clamp(floor(q / 0.14 + 0.5), 1.0, 4.0) * 0.14;
  // Wavefronts: level sets of the flow potential, moving downstream.
  float f = p.x * (1.0 + 0.5 * k3) / 0.2 - uTime * 0.6 - s.x * 10.0;
  float front = smoothstep(0.3, 0.0, abs(f - floor(f + 0.5)));
  float rays = (length(vec2(q - qi, rho * da)) - 0.006 - 0.014 * front) * 0.5;
  rays = max(rays, abs(p.x) - 0.92);
  rays = max(rays, Rc - 0.02 - r);
  // The shell: a sphere dimpled with a lattice of resonators.
  vec3 n = p / r;
  float lat = acos(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.z, n.x);
  float shell = r - 0.27 + 0.012 * cos(lat * 12.0) * cos(lon * 12.0);
  return min(rays, shell);
}

`

export type FormName =
  | "cells" | "gyroid" | "knot" | "harmonic"
  | "entangle" | "levitate" | "qubit" | "crispr" | "origami" | "kinesin"
  | "gravwave" | "webb" | "dart" | "neural" | "graphene" | "cloak"

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
  entangle: { sdf: "return fEntangle(p, uSeed);", accent: "#2f4fa8", label: "Entangled pair" },
  levitate: { sdf: "return fLevitate(p, uSeed);", accent: "#1c6f8a", label: "Quantum levitation" },
  qubit: { sdf: "return fQubit(p, uSeed);", accent: "#4a3fa0", label: "Bloch sphere" },
  crispr: { sdf: "return fCrispr(p, uSeed);", accent: "#7a2f6a", label: "CRISPR-Cas9" },
  origami: { sdf: "return fOrigami(p, uSeed);", accent: "#6b3f8c", label: "DNA origami" },
  kinesin: { sdf: "return fKinesin(p, uSeed);", accent: "#2e7a5c", label: "Kinesin walker" },
  gravwave: { sdf: "return fGravWave(p, uSeed);", accent: "#3b3f9a", label: "Gravitational waves" },
  webb: { sdf: "return fWebb(p, uSeed);", accent: "#a07a1c", label: "Webb unfolding" },
  dart: { sdf: "return fDart(p, uSeed);", accent: "#8a4a2a", label: "DART impact" },
  neural: { sdf: "return fNeural(p, uSeed);", accent: "#1f5f9a", label: "Neural network" },
  graphene: { sdf: "return fGraphene(p, uSeed);", accent: "#3a4f66", label: "Graphene" },
  cloak: { sdf: "return fCloak(p, uSeed);", accent: "#237a7a", label: "Invisibility cloak" },
}

export const FORM_NAMES = Object.keys(FORMS) as FormName[]
