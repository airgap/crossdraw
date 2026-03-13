/**
 * 16/32-bit Float Pipeline (#76)
 *
 * Provides a Float32 image representation for high-precision color processing.
 * All internal operations work in linear-light float RGBA (0-1 range, values
 * can exceed 1.0 for HDR content).
 *
 * sRGB gamma encode/decode uses the IEC 61966-2-1 transfer function.
 */

// ── Float32 Image type ───────────────────────────────────────────────────────

export interface Float32Image {
  data: Float32Array
  width: number
  height: number
  channels: 4
}

// ── sRGB transfer functions ──────────────────────────────────────────────────

/** sRGB gamma decode: convert a single sRGB channel (0-1) to linear light. */
export function srgbToLinear(v: number): number {
  if (v <= 0.04045) return v / 12.92
  return Math.pow((v + 0.055) / 1.055, 2.4)
}

/** sRGB gamma encode: convert a linear light value to sRGB. Clamps to [0,1]. */
export function linearToSrgb(v: number): number {
  const c = Math.max(0, Math.min(1, v))
  if (c <= 0.0031308) return 12.92 * c
  return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055
}

// ── Conversion: ImageData → Float32Image ─────────────────────────────────────

/**
 * Convert an sRGB uint8 ImageData to a linear-light Float32Image.
 * Each channel is gamma-decoded from sRGB to linear.
 */
export function imageDataToFloat32(imageData: ImageData): Float32Image {
  const { width, height, data } = imageData
  const len = width * height * 4
  const out = new Float32Array(len)

  for (let i = 0; i < len; i += 4) {
    out[i] = srgbToLinear(data[i]! / 255)
    out[i + 1] = srgbToLinear(data[i + 1]! / 255)
    out[i + 2] = srgbToLinear(data[i + 2]! / 255)
    out[i + 3] = data[i + 3]! / 255 // alpha is linear
  }

  return { data: out, width, height, channels: 4 }
}

// ── Conversion: Float32Image → ImageData ─────────────────────────────────────

/**
 * Convert a linear-light Float32Image back to sRGB uint8 ImageData.
 * Values exceeding 1.0 are tone-mapped with a simple Reinhard curve
 * before gamma encoding.
 */
export function float32ToImageData(image: Float32Image): ImageData {
  const { width, height, data } = image
  const len = width * height * 4
  const out = new Uint8ClampedArray(len)

  for (let i = 0; i < len; i += 4) {
    // Simple Reinhard tone-map for values > 1
    let r = data[i]!
    let g = data[i + 1]!
    let b = data[i + 2]!
    const a = data[i + 3]!

    // Reinhard: v / (1 + v) — only applied when v > 1, blended smoothly
    r = r > 0 ? r / (1 + Math.max(0, r - 1)) : 0
    g = g > 0 ? g / (1 + Math.max(0, g - 1)) : 0
    b = b > 0 ? b / (1 + Math.max(0, b - 1)) : 0

    out[i] = Math.round(linearToSrgb(r) * 255)
    out[i + 1] = Math.round(linearToSrgb(g) * 255)
    out[i + 2] = Math.round(linearToSrgb(b) * 255)
    out[i + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255)
  }

  return makeImageData(width, height, out)
}

// ── Float-precision filter wrapper ───────────────────────────────────────────

export type FloatFilter = (image: Float32Image) => Float32Image

/**
 * Apply a filter function in float precision.
 * The filter receives and returns a Float32Image; this wrapper is a
 * convenience to keep the pipeline consistent.
 */
export function applyFilterFloat32(image: Float32Image, filter: FloatFilter): Float32Image {
  return filter(image)
}

// ── Create blank Float32Image ────────────────────────────────────────────────

export function createFloat32Image(width: number, height: number): Float32Image {
  return {
    data: new Float32Array(width * height * 4),
    width,
    height,
    channels: 4,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}
