// Grid ASCII: particles are first gathered into a low-resolution grid, one
// texel per character cell, adding up their colour and coverage. A full
// screen pass then prints one character per cell, picked from a ramp by how
// full the cell is, in the cell's average colour (or a fixed ink).

/** Width of a character cell relative to its height, as in a terminal. */
export const CELL_ASPECT = 0.6

/** Draws a row of characters, white on black, into a canvas for a texture. */
export function glyphAtlas(chars: string, font: string, cellPx = 48): HTMLCanvasElement {
  const glyphs = [...chars]
  const cellW = Math.round(cellPx * CELL_ASPECT)
  const canvas = document.createElement("canvas")
  canvas.width = cellW * glyphs.length
  canvas.height = cellPx
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "#fff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.font = `${Math.round(cellPx * 0.82)}px ${font}`
  glyphs.forEach((g, i) => ctx.fillText(g, (i + 0.5) * cellW, cellPx * 0.54))
  return canvas
}

export const ASCII_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uGrid;     // per cell: summed premultiplied colour, summed coverage
uniform sampler2D uAtlas;
uniform float uGlyphCount;
uniform vec2 uCell;          // cell size, device px
uniform float uGain;         // coverage to brightness
uniform vec4 uBackground;     // rgb, a = 0 for a transparent background
uniform vec4 uInk;           // rgb, a = 1 to use it instead of the cell's colour

out vec4 fragColor;

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cellPos = floor(frag / uCell);
  vec2 local = fract(frag / uCell);
  vec4 acc = texelFetch(uGrid, ivec2(cellPos), 0);
  // Premultiplied: empty cells are the background, or nothing when transparent.
  fragColor = vec4(uBackground.rgb * uBackground.a, uBackground.a);
  if (acc.a <= 1e-4) return;
  float b = 1.0 - exp(-dot(acc.rgb, vec3(0.3, 0.59, 0.11)) * uGain);
  float index = floor(b * (uGlyphCount - 1.0) + 0.5);
  if (index < 0.5) return;
  float ink = texture(uAtlas, vec2((index + local.x) / uGlyphCount, 1.0 - local.y)).r;
  vec3 col = uInk.a > 0.5 ? uInk.rgb : acc.rgb / acc.a;
  // Fuller cells are brighter as well as denser.
  col = clamp(col * (0.55 + 0.9 * b), 0.0, 1.0);
  float a = mix(uBackground.a, 1.0, ink);
  fragColor = vec4(mix(uBackground.rgb * uBackground.a, col, ink), a);
}
`
