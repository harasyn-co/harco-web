// Streaks: each particle is drawn as a short line back along its motion,
// fading towards the tail, like a long exposure. Drawn over small points so
// particles at rest still show.
import { SHADING_GLSL } from "./shading"

export const STREAKS_VERT = /* glsl */ `#version 300 es
precision highp float;

${SHADING_GLSL}

uniform float uTrail;   // seconds of motion each streak covers

out vec4 vColor;

void main() {
  Particle p = fetchParticle(gl_VertexID / 2);
  bool tail = (gl_VertexID & 1) == 1;
  vec3 back = p.vel * uTrail;
  float len = length(back);
  if (len > 0.35) back *= 0.35 / len;  // flights can be fast; keep streaks short
  float k;
  gl_Position = project(tail ? p.world - back : p.world, k);
  vec4 c = shade(p);
  vColor = tail ? vec4(0.0) : c;
}
`

export const STREAKS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }
`
