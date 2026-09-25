// Dots: each particle is a soft round point. Particles riding the form are
// lit by its surface normal in v1's palette: a grey-brown body, shadows
// sinking to violet-black, and blue rims. The far side of the form is faint,
// so the form reads as a solid made of grain. Loose particles are warm grey.
export const DOTS_VERT = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uPos;
uniform sampler2D uNormal;
uniform mat3 uModel;
uniform vec4 uProj;         // x, y scale to clip space; camera distance; 1 = perspective
uniform float uPointSize;   // device px
uniform float uOpacity;
uniform int uSide;
uniform vec3 uShadow;
uniform vec3 uBody;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uRim;
uniform vec3 uAccent;
uniform vec3 uLoose;
uniform vec4 uView;         // half width, half height, reservoir bottom, top

out vec4 vColor;
out float vSize;

void main() {
  ivec2 cell = ivec2(gl_VertexID % uSide, gl_VertexID / uSide);
  vec4 P = texelFetch(uPos, cell, 0);
  vec4 N = texelFetch(uNormal, cell, 0);
  vec3 world = P.xyz;
  float attach = P.w;

  bool persp = uProj.w > 0.5;
  float D = uProj.z;
  float k = persp ? D / max(D - world.z, 0.2) : 1.0;
  gl_Position = vec4(world.x * k * uProj.x, world.y * k * uProj.y, 0.0, 1.0);
  vSize = max(1.0, uPointSize * (persp ? k : 1.0));
  gl_PointSize = vSize;

  // Lighting for particles on the form.
  vec3 n = normalize(uModel * N.xyz);
  vec3 viewDir = persp ? normalize(vec3(0.0, 0.0, D) - world) : vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(vec3(-0.6, 0.75, 0.35));
  float dif = max(dot(n, L), 0.0);
  float facing = dot(n, viewDir);
  float fre = pow(1.0 - clamp(facing, 0.0, 1.0), 3.0);
  float spec = pow(max(dot(reflect(-viewDir, n), L), 0.0), 28.0);
  float below = max(-n.y, 0.0);

  vec3 col = mix(uBody, uMid, smoothstep(0.0, 0.6, dif));
  col = mix(col, uLight, smoothstep(0.45, 1.0, dif) * 0.8);
  col *= (0.6 + 0.9 * dif) * 1.55;
  col = mix(col, uShadow, (1.0 - dif) * 0.35);
  col += mix(uRim, uAccent, 0.6) * fre * 0.9;
  col += uAccent * below * 0.25;
  col += uLight * spec * 0.3;

  // The side facing away shows faintly through.
  float front = smoothstep(-0.2, 0.35, facing);
  float formAlpha = mix(0.1, 0.95, front);
  if (persp) formAlpha *= mix(0.55, 1.0, smoothstep(-1.2, 0.6, world.z));

  // Loose grain: warm grey with a trace of the accent; dimmer at rest.
  vec3 loose = mix(uLoose, uAccent * 2.2 + 0.1, 0.18);
  float resting = smoothstep(uView.w + 0.15, uView.w - 0.05, world.y);
  float looseAlpha = mix(0.55, 0.3, resting);

  float alpha = mix(looseAlpha, formAlpha, attach) * uOpacity;
  vColor = vec4(mix(loose, col, attach) * alpha, alpha);
}
`

export const DOTS_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec4 vColor;
in float vSize;
out vec4 fragColor;
void main() {
  // Round, with a soft edge once points are large enough to show one.
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  float edge = vSize < 2.5 ? 1.0 : smoothstep(1.0, 1.0 - 2.0 / vSize, r);
  if (edge <= 0.0) discard;
  fragColor = vColor * edge;
}
`
