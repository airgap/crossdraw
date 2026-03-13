/**
 * 3D Color Lookup Table (LUT) filter for raster layers.
 *
 * Supports:
 * - 3D LUT application via trilinear interpolation
 * - .cube file format parsing (LUT_3D_SIZE + N^3 lines of R G B floats)
 *
 * Returns a *new* ImageData -- the original is not modified.
 */

export interface LUTParams {
  /** Flattened LUT data: size * size * size * 3 values (RGB, 0-1 range stored as numbers). */
  lutData: number[]
  /** The cube dimension (e.g. 33 for a 33x33x33 LUT). */
  size: number
}

export interface ParsedLUT {
  /** The cube dimension. */
  size: number
  /** Flattened LUT data: size^3 * 3 float values in R,G,B order. */
  data: Float32Array
}

/** Clamp a value to the 0-255 byte range. */
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

/**
 * Parse a .cube LUT file.
 *
 * Format:
 *   # Optional comments
 *   LUT_3D_SIZE N
 *   DOMAIN_MIN 0.0 0.0 0.0    (optional)
 *   DOMAIN_MAX 1.0 1.0 1.0    (optional)
 *   R G B   (N^3 lines of float triplets)
 *
 * Blue varies fastest, then green, then red.
 */
export function parseCubeLUT(text: string): ParsedLUT {
  const lines = text.split(/\r?\n/)
  let size = 0
  let domainMin = [0, 0, 0]
  let domainMax = [1, 1, 1]
  const rgbValues: number[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('TITLE')) continue

    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(/\s+/)[1]!, 10)
      continue
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/)
      domainMin = [parseFloat(parts[1]!), parseFloat(parts[2]!), parseFloat(parts[3]!)]
      continue
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/)
      domainMax = [parseFloat(parts[1]!), parseFloat(parts[2]!), parseFloat(parts[3]!)]
      continue
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      // 1D LUTs not supported
      continue
    }

    // Try to parse as RGB triple
    const parts = line.split(/\s+/)
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]!)
      const g = parseFloat(parts[1]!)
      const b = parseFloat(parts[2]!)
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        // Normalize to 0-1 range if domain is not default
        const rangeR = domainMax[0]! - domainMin[0]!
        const rangeG = domainMax[1]! - domainMin[1]!
        const rangeB = domainMax[2]! - domainMin[2]!
        rgbValues.push(
          rangeR !== 0 ? (r - domainMin[0]!) / rangeR : r,
          rangeG !== 0 ? (g - domainMin[1]!) / rangeG : g,
          rangeB !== 0 ? (b - domainMin[2]!) / rangeB : b,
        )
      }
    }
  }

  if (size <= 0) {
    throw new Error('Invalid .cube file: missing LUT_3D_SIZE')
  }

  const expected = size * size * size * 3
  if (rgbValues.length < expected) {
    throw new Error(`Invalid .cube file: expected ${expected / 3} entries but got ${rgbValues.length / 3}`)
  }

  return { size, data: new Float32Array(rgbValues.slice(0, expected)) }
}

/**
 * Apply a 3D Color LUT to `imageData` using trilinear interpolation.
 *
 * The LUT is a cube of size^3 entries, stored as a flat array:
 *   idx = (r_idx * size * size + g_idx * size + b_idx) * 3
 *
 * @returns A new ImageData with the LUT-mapped result.
 */
export function applyLUT(imageData: ImageData, params: LUTParams): ImageData {
  const { lutData, size } = params
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  if (size <= 1 || lutData.length < size * size * size * 3) {
    // Invalid LUT — return copy unchanged
    dst.set(src)
    return out
  }

  const maxIdx = size - 1

  for (let i = 0; i < src.length; i += 4) {
    // Normalize pixel to 0-1
    const r = src[i]! / 255
    const g = src[i + 1]! / 255
    const b = src[i + 2]! / 255

    // Map to LUT coordinates
    const rScaled = r * maxIdx
    const gScaled = g * maxIdx
    const bScaled = b * maxIdx

    // Floor and ceiling indices
    const r0 = Math.floor(rScaled)
    const g0 = Math.floor(gScaled)
    const b0 = Math.floor(bScaled)
    const r1 = Math.min(r0 + 1, maxIdx)
    const g1 = Math.min(g0 + 1, maxIdx)
    const b1 = Math.min(b0 + 1, maxIdx)

    // Fractional parts
    const rf = rScaled - r0
    const gf = gScaled - g0
    const bf = bScaled - b0

    // Trilinear interpolation: sample 8 corners of the cube cell
    // idx = (r_idx * size * size + g_idx * size + b_idx) * 3
    const ss = size * size

    const i000 = (r0 * ss + g0 * size + b0) * 3
    const i001 = (r0 * ss + g0 * size + b1) * 3
    const i010 = (r0 * ss + g1 * size + b0) * 3
    const i011 = (r0 * ss + g1 * size + b1) * 3
    const i100 = (r1 * ss + g0 * size + b0) * 3
    const i101 = (r1 * ss + g0 * size + b1) * 3
    const i110 = (r1 * ss + g1 * size + b0) * 3
    const i111 = (r1 * ss + g1 * size + b1) * 3

    for (let c = 0; c < 3; c++) {
      const c000 = lutData[i000 + c]!
      const c001 = lutData[i001 + c]!
      const c010 = lutData[i010 + c]!
      const c011 = lutData[i011 + c]!
      const c100 = lutData[i100 + c]!
      const c101 = lutData[i101 + c]!
      const c110 = lutData[i110 + c]!
      const c111 = lutData[i111 + c]!

      // Interpolate along blue axis
      const c00 = c000 + (c001 - c000) * bf
      const c01 = c010 + (c011 - c010) * bf
      const c10 = c100 + (c101 - c100) * bf
      const c11 = c110 + (c111 - c110) * bf

      // Interpolate along green axis
      const c0 = c00 + (c01 - c00) * gf
      const c1 = c10 + (c11 - c10) * gf

      // Interpolate along red axis
      const val = c0 + (c1 - c0) * rf

      dst[i + c] = clamp255(val * 255)
    }

    // Preserve alpha
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ── Internal helpers ─────────────────────────────────────────

/** Create an ImageData instance, with a fallback for non-browser environments. */
function createImageData(w: number, h: number): ImageData {
  if (typeof globalThis.ImageData === 'function') {
    return new ImageData(w, h)
  }
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as ImageData
}
