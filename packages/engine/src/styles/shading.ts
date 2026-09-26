// How a particle looks, shared by every style. Particles riding the form are
// lit by its surface normal in the palette: body tones from shade to light,
// crevices sinking into the shadow colour, and rims picking up the accent.
// The far side of the form is faint, so the form reads as a solid made of
// grain. Loose particles take the loose colour, faded as they rest. Colours
// roll off softly towards white instead of clipping.
export const SHADING_GLSL = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uNormal;
uniform mat3 uModel;
uniform vec4 uProj;         // x, y scale to clip space; camera distance; 1 = perspective
uniform float uOpacity;
uniform int uSide;
uniform vec3 uShadow;
uniform vec3 uBody;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uRim;
uniform vec3 uAccent;
uniform vec3 uLoose;

struct Particle {
  vec3 world;
  vec3 vel;
  float attach;
  float vis;
  vec4 normal;  // object-space normal, w = occlusion
};

Particle fetchParticle(int index) {
  ivec2 cell = ivec2(index % uSide, index / uSide);
  vec4 P = texelFetch(uPos, cell, 0);
  vec4 V = texelFetch(uVel, cell, 0);
  return Particle(P.xyz, V.xyz, P.w, clamp(V.w - 1.0, 0.0, 1.0), texelFetch(uNormal, cell, 0));
}

// Clip-space position; k is the perspective scale at that depth.
vec4 project(vec3 world, out float k) {
  bool persp = uProj.w > 0.5;
  k = persp ? uProj.z / max(uProj.z - world.z, 0.2) : 1.0;
  return vec4(world.x * k * uProj.x, world.y * k * uProj.y, 0.0, 1.0);
}

// Premultiplied colour.
vec4 shade(Particle p) {
  bool persp = uProj.w > 0.5;
  vec3 n = normalize(uModel * p.normal.xyz);
  vec3 viewDir = persp ? normalize(vec3(0.0, 0.0, uProj.z) - p.world) : vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.6, 0.75, 0.35));
  float dif = max(dot(n, L), 0.0);
  float facing = dot(n, viewDir);
  float fre = pow(1.0 - clamp(facing, 0.0, 1.0), 3.0);
  float spec = pow(max(dot(reflect(-viewDir, n), L), 0.0), 28.0);
  float below = max(-n.y, 0.0);
  float ao = clamp(p.normal.w, 0.0, 1.0);
  float lit = dif * (0.45 + 0.55 * ao);

  vec3 col = mix(uBody, uMid, smoothstep(0.0, 0.6, lit));
  col = mix(col, uLight, smoothstep(0.45, 1.0, lit) * 0.8);
  col *= (0.55 + 1.0 * lit + 0.25 * ao) * 1.5;
  col = mix(col, uShadow, (1.0 - ao) * 0.75);
  col += mix(uRim, uAccent, 0.6) * fre * 0.9 * ao;
  col += uAccent * below * 0.25 * ao;
  col += uLight * spec * 0.3 * ao;
  // Soft shoulder: keeps highlights from clipping to flat white.
  col = 1.0 - exp(-col * 1.25);

  // The side facing away shows faintly through.
  float front = smoothstep(-0.2, 0.35, facing);
  float formAlpha = mix(0.1, 0.95, front) * mix(0.55, 1.0, ao);
  if (persp) formAlpha *= mix(0.55, 1.0, smoothstep(-1.2, 0.6, p.world.z));

  // Ink (normal w 3..4, pre-rendered text): the light colour at the pixel's
  // coverage, exactly, with nothing added.
  if (p.normal.w > 2.5) {
    // Still travelling (attach < 1): fainter, like dust.
    float settle = mix(0.35, 1.0, clamp(p.attach, 0.0, 1.0) * clamp(p.attach, 0.0, 1.0));
    float cov = (p.normal.w - 3.0) * p.vis * uOpacity * settle;
    return vec4(uLight * cov, cov);
  }
  // Type (normal w 2) is flat and bright, not lit like a solid.
  if (p.normal.w > 1.5) {
    col = 1.0 - exp(-uLight * 2.4);
    formAlpha = 0.95;
  }

  // Loose grain: the loose colour with a trace of the accent.
  vec3 loose = mix(uLoose, uAccent * 2.2 + 0.1, 0.18);
  float looseAlpha = 0.6 * p.vis;

  float alpha = mix(looseAlpha, formAlpha * p.vis, p.attach) * uOpacity;
  return vec4(mix(loose, col, p.attach) * alpha, alpha);
}

float luma(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
`

export const SHADING_UNIFORMS = [
  "uPos", "uVel", "uNormal", "uModel", "uProj", "uOpacity", "uSide",
  "uShadow", "uBody", "uMid", "uLight", "uRim", "uAccent", "uLoose",
] as const
