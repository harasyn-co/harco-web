// Particle update. World space: the form is centred at the origin with radius
// ~1, y up, the viewer on +z. State lives in two float textures:
//   pos: position xyz, w = attachment 0..1 (1 = riding the surface)
//   vel: velocity xyz (world units per second), w = 1 + visibility 0..1
//        (0 until initialised)
// Each particle is paired with the anchor in the same texel. A particle
// wants its anchor while its key is below the presence level; the key mixes
// a random rank with the anchor's height, so forms build from the bottom up
// and let go from the bottom first. Particles that are not wanted return to
// their home in the reservoir, which takes one of three shapes:
//   band:  a soft pool along the bottom, dense at the floor and thinning
//          upward under a slowly shifting, wavy edge
//   field: faint dust suspended across the whole view
//   none:  out of sight; particles materialise just off the surface as they
//          arrive, and dissolve outward from it as they leave
import { COMMON_GLSL } from "../glsl/common"
import { FULLSCREEN_VERT } from "./gl"

export const RESERVOIR_MODES = { none: 0, band: 1, field: 2 } as const

export const UPDATE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uAnchor;   // object-space surface point, w = 1 if valid
uniform mat3 uModel;         // object -> world
uniform float uTime;
uniform float uDt;
uniform float uPresence;     // 0..1 share of the eligible particles that want the form
uniform float uReserve;      // share of particles that always stay in the reservoir
uniform float uDir;          // +1 gathering, -1 letting go
uniform vec2 uView;          // half width, half height (world units at z = 0)
uniform vec2 uCamera;        // camera distance, 1 = perspective
uniform vec4 uReservoir;     // mode, height (share of the view), opacity, drift
uniform float uReset;        // 1 = put every particle at home

layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outVel;

${COMMON_GLSL}

// Where a particle rests, and how visible it is there. Homes drift over time.
struct Home { vec3 p; float vis; };

// Scales a height so it lands at the same place on screen at depth z.
float onScreen(float y, float z) { return uCamera.y > 0.5 ? y * (uCamera.x - z) / uCamera.x : y; }

// The band's wavy upper edge, as a multiple of its height.
float edge(float x) {
  return 1.0 + 0.3 * sin(x * 1.1 + uTime * 0.05)
             + 0.18 * sin(x * 2.7 - uTime * 0.09 + 1.7)
             + 0.1 * sin(x * 5.9 + uTime * 0.14 + 4.2);
}

Home home(vec2 id, vec3 target) {
  float mode = uReservoir.x;
  float h1 = hash21(id * 1.7 + 0.3);
  float h2 = hash21(id * 0.9 + 5.1);
  float h3 = hash21(id * 2.3 + 9.7);
  float drift = uReservoir.w;
  if (mode > 1.5) {
    // Field: spread through the view, wandering on a slow current.
    vec3 p = vec3(h1 * 2.0 - 1.0, h2 * 2.0 - 1.0, (h3 - 0.5) * 1.6) * vec3(uView * 1.05, 1.0);
    p += noise33(p * 0.45 + vec3(0.0, 0.0, uTime * 0.04)) * 0.9 * (0.3 + drift * 8.0);
    return Home(vec3(p.xy * (uCamera.y > 0.5 ? (uCamera.x - p.z) / uCamera.x : 1.0), p.z), uReservoir.z * (0.35 + 0.4 * h3));
  }
  if (mode > 0.5) {
    // Band: across the width, flowing sideways, most particles low down.
    float span = uView.x * 2.2;
    float x = mod(h1 * span + uTime * drift * (0.5 + h3), span) - span * 0.5;
    const float k = 3.5;
    float f = -log(1.0 - h2 * (1.0 - exp(-k))) / k;   // 0..1, dense near 0
    float z = (h3 - 0.5) * 0.9;
    float bandH = uReservoir.y * 2.0 * uView.y;
    float y = -uView.y * 1.03 + f * bandH * edge(x);
    y += noise3(vec3(x * 1.5, f * 3.0, uTime * 0.2)) * bandH * 0.15;
    // Particles near the top of the band are fainter, so it has no hard edge.
    float vis = uReservoir.z * mix(1.0, 0.1, smoothstep(0.1, 1.0, f));
    return Home(vec3(x, onScreen(y, z), z), vis);
  }
  // None: a little way out from the particle's point on the form, unseen.
  vec3 out_ = target * (1.25 + 0.35 * h3) + (vec3(h1, h2, h3) - 0.5) * 0.5;
  return Home(out_ + noise33(out_ + vec3(uTime * 0.1)) * 0.3, 0.0);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 id = vec2(cell) + 0.5;
  vec4 P = texelFetch(uPos, cell, 0);
  vec4 V = texelFetch(uVel, cell, 0);
  vec4 A = texelFetch(uAnchor, cell, 0);
  vec3 target = uModel * A.xyz;
  Home h = home(id, target);

  if (uReset > 0.5 || V.w < 0.5) {
    outPos = vec4(h.p, 0.0);
    outVel = vec4(0.0, 0.0, 0.0, 1.0 + h.vis);
    return;
  }

  vec3 pos = P.xyz;
  vec3 vel = V.xyz;
  float attach = P.w;
  float dt = uDt;

  float rank = hash21(id * 0.731 + 3.3);
  bool eligible = hash21(id * 1.913 + 8.1) >= uReserve;
  float height = clamp(target.y * 0.4 + 0.5, 0.0, 1.0);
  // Spread the key back over 0..1 after mixing in height.
  float key = smoothstep(0.1, 0.9, mix(rank, uDir > 0.0 ? height : 1.0 - height, 0.35));
  bool wants = eligible && key < uPresence && A.w > 0.5;

  vec3 to = target - pos;
  float dist = length(to);

  if (wants && attach > 0.5 && dist < 0.25) {
    // Riding the surface: follow the anchor closely.
    vec3 next = mix(pos, target, 1.0 - exp(-dt * 30.0));
    vel = (next - pos) / max(dt, 1e-3);
    pos = next;
    attach = min(1.0, attach + dt * 4.0);
  } else if (wants) {
    // In flight: steer towards the anchor, wandering like grains in a current.
    vec3 dir = to / max(dist, 1e-4);
    float speed = 0.6 + 1.8 * dist;
    vec3 swirl = noise33(pos * 1.6 + vec3(0.0, uTime * 0.25, rank * 7.0));
    vec3 desired = dir * speed + cross(dir, swirl) * speed * 0.9 * smoothstep(0.05, 0.6, dist);
    vel = mix(vel, desired, 1.0 - exp(-dt * 3.0));
    pos += vel * dt;
    // Pull in firmly over the last stretch so particles land.
    float close = smoothstep(0.12, 0.0, dist);
    pos = mix(pos, target, close * (1.0 - exp(-dt * 10.0)));
    attach = dist < 0.02 ? 1.0 : max(0.0, attach - dt * 3.0);
  } else {
    attach = max(0.0, attach - dt * 3.0);
    bool band = uReservoir.x > 0.5 && uReservoir.x < 1.5;
    // Distance home, taking the shortest way across the band's wrap.
    vec3 toHome = h.p - pos;
    float span = uView.x * 2.2;
    if (band) toHome.x -= span * floor(toHome.x / span + 0.5);
    if (band && pos.y > h.p.y + 0.15) {
      // Falling into the band: gravity and drag, with a little drift.
      vel.y -= 2.2 * dt;
      vel += noise33(pos * 1.3 + vec3(uTime * 0.2, rank * 13.0, 0.0)) * dt * 2.4;
      vel.x += toHome.x * dt * 0.15;
      vel *= exp(-dt * 0.8);
    } else {
      // Settling home: a soft spring, stirred by a slow current.
      vec3 desired = toHome * (band ? 1.2 : 0.9) + noise33(pos * 1.7 + vec3(uTime * 0.15)) * 0.12;
      float len = length(desired);
      if (len > 1.2) desired *= 1.2 / len;
      vel = mix(vel, desired, 1.0 - exp(-dt * 2.0));
    }
    pos += vel * dt;
    if (band) {
      if (pos.x > span * 0.5) pos.x -= span;
      if (pos.x < -span * 0.5) pos.x += span;
    }
  }

  // Visibility: full in flight and on the form, fading to the home's own
  // visibility on arrival. With no reservoir, particles only show close to
  // their point on the form, coming or going.
  float atHome = smoothstep(0.45, 0.05, length(h.p - pos));
  float vis = uReservoir.x < 0.5
    ? max(attach, smoothstep(0.6, 0.08, length(target - pos)))
    : max(mix(1.0, h.vis, atHome), attach);

  outPos = vec4(pos, attach);
  outVel = vec4(vel, 1.0 + clamp(vis, 0.0, 1.0));
}
`

export { FULLSCREEN_VERT }
