// Small WebGL2 helpers shared by the engine's passes.

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export function compile(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const program = gl.createProgram()
  const shaders: WebGLShader[] = []
  for (const [type, src] of [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "shader compile failed"
      gl.deleteShader(shader)
      throw new Error(log)
    }
    gl.attachShader(program, shader)
    shaders.push(shader)
  }
  gl.linkProgram(program)
  for (const shader of shaders) gl.deleteShader(shader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "program link failed")
  }
  return program
}

export type Uniforms<K extends string> = Record<K, WebGLUniformLocation | null>

export function uniforms<K extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: readonly K[]): Uniforms<K> {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)])) as Uniforms<K>
}

/** A framebuffer with one or more square RGBA32F colour attachments. */
export interface Target {
  textures: WebGLTexture[]
  fb: WebGLFramebuffer
}

export function createTarget(gl: WebGL2RenderingContext, side: number, attachments: number): Target {
  const fb = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  const textures: WebGLTexture[] = []
  const buffers: number[] = []
  for (let i = 0; i < attachments; i++) {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, side, side)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0)
    textures.push(tex)
    buffers.push(gl.COLOR_ATTACHMENT0 + i)
  }
  gl.drawBuffers(buffers)
  for (let i = 0; i < attachments; i++) gl.clearBufferfv(gl.COLOR, i, [0, 0, 0, 0])
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { textures, fb }
}

export function deleteTarget(gl: WebGL2RenderingContext, t: Target) {
  for (const tex of t.textures) gl.deleteTexture(tex)
  gl.deleteFramebuffer(t.fb)
}

/** Two targets that take turns being read and written. */
export class PingPong {
  private gl: WebGL2RenderingContext
  private targets: [Target, Target]
  private index = 0

  constructor(gl: WebGL2RenderingContext, side: number, attachments: number) {
    this.gl = gl
    this.targets = [createTarget(gl, side, attachments), createTarget(gl, side, attachments)]
  }

  get read() { return this.targets[this.index] }
  get write() { return this.targets[1 - this.index] }
  swap() { this.index = 1 - this.index }

  dispose() {
    for (const t of this.targets) deleteTarget(this.gl, t)
  }
}

/** Binds textures to consecutive units starting at `from`, and points the samplers at them. */
export function bindTextures(gl: WebGL2RenderingContext, from: number, pairs: [WebGLUniformLocation | null, WebGLTexture][]) {
  pairs.forEach(([loc, tex], i) => {
    gl.activeTexture(gl.TEXTURE0 + from + i)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(loc, from + i)
  })
}
