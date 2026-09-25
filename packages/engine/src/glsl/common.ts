// Hashes and noise shared by the engine's shaders. Names avoid the helpers
// defined in the forms (hash13, vnoise), so both can be included together.
export const COMMON_GLSL = /* glsl */ `
const float PI = 3.14159265;

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

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x),
        mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x),
        mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// Three decorrelated noise channels, centred on zero.
vec3 noise33(vec3 x) {
  return vec3(noise3(x), noise3(x + vec3(31.4, 17.9, 5.3)), noise3(x + vec3(-8.2, 44.1, 23.7))) - 0.5;
}
`
