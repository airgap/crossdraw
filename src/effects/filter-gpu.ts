/**
 * GPU-accelerated adjustment filters via WebGL2.
 *
 * Each adjustment type (levels, curves, hue-sat, color-balance) is a fragment
 * shader that runs per-pixel in parallel on the GPU. The source image is
 * uploaded as a texture, filter params are passed as uniforms, and the result
 * is drawn to a WebGL canvas that can be composited back.
 *
 * Falls back gracefully: if WebGL2 is unavailable, getFilterGPU() returns null
 * and callers should use the CPU path.
 */

import type { LevelsParams, CurvesParams, HueSatParams, ColorBalanceParams } from '@/types'

// ── Shader sources ──────────────────────────────────────────────

const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  // Flip Y so texture coordinates match canvas orientation
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0, 1);
}
`

const FRAG_LEVELS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform float u_blackPoint;   // 0-255
uniform float u_whitePoint;   // 0-255
uniform float u_invGamma;

void main() {
  vec4 c = texture(u_tex, v_uv);
  float range = u_whitePoint - u_blackPoint;
  vec3 normalized = clamp((c.rgb * 255.0 - u_blackPoint) / range, 0.0, 1.0);
  fragColor = vec4(pow(normalized, vec3(u_invGamma)), c.a);
}
`

const FRAG_CURVES = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform sampler2D u_lut;  // 256x1 R8 texture

void main() {
  vec4 c = texture(u_tex, v_uv);
  fragColor = vec4(
    texture(u_lut, vec2(c.r, 0.5)).r,
    texture(u_lut, vec2(c.g, 0.5)).r,
    texture(u_lut, vec2(c.b, 0.5)).r,
    c.a
  );
}
`

const FRAG_HUE_SAT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform float u_hueShift;    // -0.5 to 0.5 (normalized from -180..180)
uniform float u_satShift;    // -1.0 to 1.0
uniform float u_lightShift;  // -1.0 to 1.0

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return vec3(h / 6.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y == 0.0) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0/3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0/3.0)
  );
}

void main() {
  vec4 c = texture(u_tex, v_uv);
  vec3 hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + u_hueShift + 1.0);
  hsl.y = clamp(hsl.y + u_satShift, 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightShift, 0.0, 1.0);
  fragColor = vec4(hsl2rgb(hsl), c.a);
}
`

const FRAG_COLOR_BALANCE = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
uniform float u_shadows;     // -100..100
uniform float u_midtones;
uniform float u_highlights;

void main() {
  vec4 c = texture(u_tex, v_uv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float shadowW = max(0.0, 1.0 - lum * 3.0);
  float highlightW = max(0.0, lum * 3.0 - 2.0);
  float midW = 1.0 - shadowW - highlightW;
  float shift = (u_shadows * shadowW + u_midtones * midW + u_highlights * highlightW) / 255.0;
  fragColor = vec4(
    clamp(c.r + shift, 0.0, 1.0),
    clamp(c.g - shift * 0.5, 0.0, 1.0),
    clamp(c.b - shift * 0.5, 0.0, 1.0),
    c.a
  );
}
`

// ── WebGL helper ────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s)
    gl.deleteShader(s)
    throw new Error(`Shader compile: ${info}`)
  }
  return s
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(p)
    gl.deleteProgram(p)
    throw new Error(`Program link: ${info}`)
  }
  return p
}

// ── FilterGPU class ─────────────────────────────────────────────

export class FilterGPU {
  private gl: WebGL2RenderingContext
  private canvas: OffscreenCanvas
  private programs: Map<string, WebGLProgram> = new Map()
  private quadVAO: WebGLVertexArrayObject
  private srcTexture: WebGLTexture
  private lutTexture: WebGLTexture
  private currentWidth = 0
  private currentHeight = 0

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1)
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    })
    if (!gl) throw new Error('WebGL2 not available')
    this.gl = gl

    // Compile all programs
    this.programs.set('levels', linkProgram(gl, VERT, FRAG_LEVELS))
    this.programs.set('curves', linkProgram(gl, VERT, FRAG_CURVES))
    this.programs.set('hue-sat', linkProgram(gl, VERT, FRAG_HUE_SAT))
    this.programs.set('color-balance', linkProgram(gl, VERT, FRAG_COLOR_BALANCE))

    // Fullscreen quad VAO
    const vao = gl.createVertexArray()!
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,   1, -1,   -1, 1,
      -1,  1,   1, -1,    1, 1,
    ]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.quadVAO = vao

    // Source texture
    this.srcTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    // LUT texture for curves (256x1 R8)
    this.lutTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  }

  /** Upload the current canvas state as the source texture. */
  private uploadSource(source: OffscreenCanvas | ImageBitmap) {
    const gl = this.gl
    const w = source.width
    const h = source.height
    if (w !== this.currentWidth || h !== this.currentHeight) {
      this.canvas.width = w
      this.canvas.height = h
      gl.viewport(0, 0, w, h)
      this.currentWidth = w
      this.currentHeight = h
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.srcTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  private draw(programKey: string) {
    const gl = this.gl
    const prog = this.programs.get(programKey)!
    gl.useProgram(prog)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0)
    gl.bindVertexArray(this.quadVAO)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  applyLevels(source: OffscreenCanvas | ImageBitmap, params: LevelsParams): OffscreenCanvas {
    this.uploadSource(source)
    const gl = this.gl
    const prog = this.programs.get('levels')!
    gl.useProgram(prog)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_blackPoint'), params.blackPoint)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_whitePoint'), params.whitePoint)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_invGamma'), 1 / Math.max(0.01, params.gamma))
    this.draw('levels')
    return this.canvas
  }

  applyCurves(source: OffscreenCanvas | ImageBitmap, params: CurvesParams): OffscreenCanvas {
    // Build LUT on CPU (256 bytes, trivial)
    const sorted = [...params.points].sort((a, b) => a[0] - b[0])
    if (sorted.length === 0) return this.canvas
    if (sorted[0]![0] > 0) sorted.unshift([0, 0])
    if (sorted[sorted.length - 1]![0] < 255) sorted.push([255, 255])
    const lut = new Uint8Array(256)
    let seg = 0
    for (let i = 0; i < 256; i++) {
      while (seg < sorted.length - 2 && sorted[seg + 1]![0] < i) seg++
      const [x0, y0] = sorted[seg]!
      const [x1, y1] = sorted[seg + 1]!
      const t = x1 === x0 ? 0 : (i - x0) / (x1 - x0)
      lut[i] = Math.round(Math.max(0, Math.min(255, y0 + t * (y1 - y0))))
    }

    this.uploadSource(source)
    const gl = this.gl
    const prog = this.programs.get('curves')!
    gl.useProgram(prog)

    // Upload LUT as 256x1 R8 texture on unit 1
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut)
    gl.uniform1i(gl.getUniformLocation(prog, 'u_lut'), 1)

    gl.activeTexture(gl.TEXTURE0)
    this.draw('curves')
    return this.canvas
  }

  applyHueSat(source: OffscreenCanvas | ImageBitmap, params: HueSatParams): OffscreenCanvas {
    this.uploadSource(source)
    const gl = this.gl
    const prog = this.programs.get('hue-sat')!
    gl.useProgram(prog)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_hueShift'), params.hue / 360)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_satShift'), params.saturation / 100)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_lightShift'), params.lightness / 100)
    this.draw('hue-sat')
    return this.canvas
  }

  applyColorBalance(source: OffscreenCanvas | ImageBitmap, params: ColorBalanceParams): OffscreenCanvas {
    this.uploadSource(source)
    const gl = this.gl
    const prog = this.programs.get('color-balance')!
    gl.useProgram(prog)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_shadows'), params.shadows)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_midtones'), params.midtones)
    gl.uniform1f(gl.getUniformLocation(prog, 'u_highlights'), params.highlights)
    this.draw('color-balance')
    return this.canvas
  }
}

// ── Singleton access ────────────────────────────────────────────

let instance: FilterGPU | null | false = null // null = untried, false = unavailable

/** Returns the shared FilterGPU instance, or null if WebGL2 is not available. */
export function getFilterGPU(): FilterGPU | null {
  if (instance === false) return null
  if (instance) return instance
  try {
    instance = new FilterGPU()
    return instance
  } catch {
    instance = false
    return null
  }
}
