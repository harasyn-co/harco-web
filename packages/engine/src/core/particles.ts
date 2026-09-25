// Particle update. World space: the form is centred at the origin with radius
// ~1, y up, the viewer on +z. State lives in two float textures:
//   pos: position xyz, w = attachment 0..1 (1 = riding the surface)
//   vel: velocity xyz (world units per second), w = 1 once initialised
// Each particle is paired with the anchor in the same texel. A particle
// wants its anchor while its key is below the presence level; the key mixes
// a random rank with the anchor's height, so forms build from the bottom up
// and let go from the bottom first. Particles that are not wanted fall into
// the reservoir, a band along the bottom of the view, and drift there.
import { COMMON_GLSL } from "../glsl/common"
import { FULLSCREEN_VERT } from "./gl"

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
uniform vec4 uView;          // half width, half height (world units at z = 0),
                             // reservoir bottom and top (world y)
uniform vec2 uCamera;        // camera distance, 1 = perspective
uniform float uReset;        // 1 = put every particle in the reservoir

layout(location = 0) out vec4 outPos;
layout(location = 1) out vec4 outVel;

${COMMON_GLSL}

// Depth within the reservoir, and the height that keeps a particle inside
// the band on screen at that depth.
float restDepth(vec2 id) { return (hash21(id * 2.3 + 9.7) - 0.5) * 0.9; }
float restHeight(vec2 id, float z) {
  float y = mix(uView.z, uView.w, hash21(id * 0.9 + 5.1));
  return uCamera.y > 0.5 ? y * (uCamera.x - z) / uCamera.x : y;
}

vec3 restPoint(vec2 id) {
  float z = restDepth(id);
  return vec3((hash21(id * 1.7 + 0.3) * 2.0 - 1.0) * uView.x, restHeight(id, z), z);
}

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 id = vec2(cell) + 0.5;
  vec4 P = texelFetch(uPos, cell, 0);
  vec4 V = texelFetch(uVel, cell, 0);
  vec4 A = texelFetch(uAnchor, cell, 0);

  if (uReset > 0.5 || V.w < 0.5) {
    outPos = vec4(restPoint(id), 0.0);
    outVel = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 pos = P.xyz;
  vec3 vel = V.xyz;
  float attach = P.w;
  float dt = uDt;

  vec3 target = uModel * A.xyz;
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
    float rest = restHeight(id, pos.z);
    if (pos.y > rest + 0.02) {
      // Falling: gravity and drag, with a little drift.
      vel.y -= 2.2 * dt;
      vel += noise33(pos * 1.3 + vec3(uTime * 0.2)) * dt * 1.2;
      vel *= exp(-dt * 0.8);
      pos += vel * dt;
    } else {
      // In the reservoir: settle to a resting height and drift sideways.
      float flow = 0.05 + 0.04 * sin(uTime * 0.13 + pos.x * 0.8);
      vec3 drift = vec3(flow, 0.0, 0.0) + noise33(pos * 2.0 + vec3(uTime * 0.15)) * vec3(0.12, 0.05, 0.12);
      vel = mix(vel, drift, 1.0 - exp(-dt * 3.0));
      pos += vel * dt;
      pos.y = mix(pos.y, rest, 1.0 - exp(-dt * 2.0));
      if (pos.x > uView.x * 1.05) pos.x -= uView.x * 2.1;
      if (pos.x < -uView.x * 1.05) pos.x += uView.x * 2.1;
    }
  }

  outPos = vec4(pos, attach);
  outVel = vec4(vel, 1.0);
}
`

export { FULLSCREEN_VERT }
