// Point sprites: one per particle, drawn round, square, or as a character
// chosen by the particle's brightness (free ASCII).
import { SHADING_GLSL } from "./shading"
import { CELL_ASPECT } from "./ascii"

export const SHAPE = { round: 0, square: 1, glyph: 2 } as const

export const POINTS_VERT = /* glsl */ `#version 300 es
precision highp float;

${SHADING_GLSL}

uniform float uPointSize;   // device px
uniform float uGlyphCount;  // characters in the atlas, for glyph sprites
uniform float uGain;        // brightness multiplier when choosing a glyph
uniform int uStride;        // draw every nth particle (glyphs need room)
uniform int uFirst;         // the first particle of the layer being drawn
uniform vec2 uResolution;   // drawing size, device px
uniform float uPixelSnap;   // 1 = centre particles on device pixels

out vec4 vColor;
out float vSize;
flat out float vGlyph;

void main() {
  Particle p = fetchParticle(uFirst + (gl_VertexID - uFirst) * uStride);
  float k;
  gl_Position = project(p.world, k);
  vSize = max(1.0, uPointSize * k);
  if (uPixelSnap > 0.5) {
    // Crisp text and UI: cover whole device pixels. An odd-sized point
    // centres on a pixel, an even-sized one on the corner between pixels.
    vSize = floor(vSize + 0.5);
    vec2 px = (gl_Position.xy * 0.5 + 0.5) * uResolution;
    vec2 c = mod(vSize, 2.0) > 0.5 ? floor(px) + 0.5 : floor(px + 0.5);
    gl_Position.xy = (c / uResolution) * 2.0 - 1.0;
  }
  gl_PointSize = vSize;
  vColor = shade(p);
  // Darker particles get sparser characters; the first is usually a space.
  float b = clamp(luma(vColor.rgb) * uGain, 0.0, 1.0);
  vGlyph = floor(b * (uGlyphCount - 1.0) + 0.5);
  if (vColor.a < 0.002) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; }
}
`

export const POINTS_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform int uShape;
uniform sampler2D uAtlas;
uniform float uGlyphCount;

in vec4 vColor;
in float vSize;
flat in float vGlyph;
out vec4 fragColor;

void main() {
  if (uShape == 1) { fragColor = vColor; return; }
  if (uShape == 2) {
    // Characters are narrower than the square sprite; centre them in it.
    float x = (gl_PointCoord.x - 0.5) / ${CELL_ASPECT.toFixed(3)} + 0.5;
    if (x < 0.0 || x > 1.0) discard;
    vec2 uv = vec2((vGlyph + x) / uGlyphCount, gl_PointCoord.y);
    float ink = texture(uAtlas, uv).r;
    if (ink < 0.02) discard;
    // Characters show the particle's colour at a firmer opacity than a dot.
    vec3 col = vColor.rgb / max(vColor.a, 1e-3);
    float a = ink * clamp(vColor.a * 1.6, 0.0, 1.0);
    fragColor = vec4(col * a, a);
    return;
  }
  // Round, with a soft edge once points are large enough to show one.
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = length(c);
  float edge = vSize < 2.5 ? 1.0 : smoothstep(1.0, 1.0 - 2.0 / vSize, r);
  if (edge <= 0.0) discard;
  fragColor = vColor * edge;
}
`
