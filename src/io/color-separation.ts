/**
 * Color separation output.
 *
 * Exports individual CMYK separation plates from an ImageData.
 * Each plate is a grayscale image representing the ink density for that channel.
 * Under Color Removal (UCR) is applied during CMYK conversion to reduce total
 * ink coverage and improve print quality.
 *
 * Supports optional spot color plate extraction and TIFF export of individual plates.
 */

import { encodeTIFF } from '@/io/tiff-encoder'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeparationProfile {
  /** Total ink limit as percentage (typical: 300-340%). */
  totalInkLimit: number
  /** Under Color Removal percentage (0-1). Higher = more black replaces CMY. */
  ucrAmount: number
  /** Gray Component Replacement percentage (0-1). Determines how much CMY is replaced by K in neutral areas. */
  gcrAmount: number
  /** Optional spot colors to extract. */
  spotColors?: SpotColor[]
}

export interface SpotColor {
  /** Spot color name (e.g., 'PANTONE 485 C'). */
  name: string
  /** Target RGB color to match against. */
  targetRGB: [number, number, number]
  /** Color matching tolerance (0-255 per channel). */
  tolerance: number
}

export interface SeparationPlates {
  cyan: ImageData
  magenta: ImageData
  yellow: ImageData
  black: ImageData
  spotPlates?: Map<string, ImageData>
}

export const DEFAULT_SEPARATION_PROFILE: SeparationProfile = {
  totalInkLimit: 320,
  ucrAmount: 0.5,
  gcrAmount: 0.5,
}

// ── CMYK conversion ──────────────────────────────────────────────────────────

/**
 * Convert a single RGB pixel to CMYK with Under Color Removal and
 * Gray Component Replacement.
 *
 * UCR removes equal amounts of C, M, Y and replaces with K in neutral areas.
 * GCR is a more generalized version that works in all colors.
 */
function rgbToCMYK(r: number, g: number, b: number, profile: SeparationProfile): [number, number, number, number] {
  // Normalize to 0-1
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  // Initial CMY
  let c = 1 - rn
  let m = 1 - gn
  let y = 1 - bn

  // K = minimum of CMY (the gray component)
  const kBase = Math.min(c, m, y)

  // Apply GCR: how much of the gray component to convert to K
  const k = kBase * profile.gcrAmount

  // Apply UCR: remove the K amount from CMY
  if (kBase > 0) {
    const ucr = k * profile.ucrAmount
    c = Math.max(0, c - ucr)
    m = Math.max(0, m - ucr)
    y = Math.max(0, y - ucr)
  }

  // Total ink limit enforcement
  const totalInk = (c + m + y + k) * 100
  if (totalInk > profile.totalInkLimit) {
    const scale = profile.totalInkLimit / totalInk
    c *= scale
    m *= scale
    y *= scale
    // K is not scaled to preserve shadow detail
  }

  // Clamp to [0, 1]
  return [
    Math.min(1, Math.max(0, c)),
    Math.min(1, Math.max(0, m)),
    Math.min(1, Math.max(0, y)),
    Math.min(1, Math.max(0, k)),
  ]
}

// ── Spot color extraction ────────────────────────────────────────────────────

function extractSpotPlate(imageData: ImageData, spot: SpotColor): ImageData {
  const { width, height, data } = imageData
  const plate = new Uint8ClampedArray(width * height * 4)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!

    const dr = Math.abs(r - spot.targetRGB[0])
    const dg = Math.abs(g - spot.targetRGB[1])
    const db = Math.abs(b - spot.targetRGB[2])

    if (dr <= spot.tolerance && dg <= spot.tolerance && db <= spot.tolerance) {
      // Color matches — compute intensity based on distance
      const maxDist = spot.tolerance * Math.sqrt(3)
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      const intensity = Math.round((1 - dist / maxDist) * 255)
      plate[i] = intensity
      plate[i + 1] = intensity
      plate[i + 2] = intensity
      plate[i + 3] = 255
    } else {
      plate[i] = 0
      plate[i + 1] = 0
      plate[i + 2] = 0
      plate[i + 3] = 255
    }
  }

  return makeImageData(width, height, plate)
}

// ── Main separation ──────────────────────────────────────────────────────────

/**
 * Export color separations from an ImageData.
 *
 * Each plate is a grayscale ImageData where 255 = full ink and 0 = no ink.
 */
export function exportSeparations(
  imageData: ImageData,
  profile: SeparationProfile = DEFAULT_SEPARATION_PROFILE,
): SeparationPlates {
  const { width, height, data } = imageData

  const cyanData = new Uint8ClampedArray(width * height * 4)
  const magentaData = new Uint8ClampedArray(width * height * 4)
  const yellowData = new Uint8ClampedArray(width * height * 4)
  const blackData = new Uint8ClampedArray(width * height * 4)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!

    const [c, m, y, k] = rgbToCMYK(r, g, b, profile)

    // Each plate: grayscale where 255 = full ink density
    const cVal = Math.round(c * 255)
    const mVal = Math.round(m * 255)
    const yVal = Math.round(y * 255)
    const kVal = Math.round(k * 255)

    cyanData[i] = cVal
    cyanData[i + 1] = cVal
    cyanData[i + 2] = cVal
    cyanData[i + 3] = 255

    magentaData[i] = mVal
    magentaData[i + 1] = mVal
    magentaData[i + 2] = mVal
    magentaData[i + 3] = 255

    yellowData[i] = yVal
    yellowData[i + 1] = yVal
    yellowData[i + 2] = yVal
    yellowData[i + 3] = 255

    blackData[i] = kVal
    blackData[i + 1] = kVal
    blackData[i + 2] = kVal
    blackData[i + 3] = 255
  }

  const result: SeparationPlates = {
    cyan: makeImageData(width, height, cyanData),
    magenta: makeImageData(width, height, magentaData),
    yellow: makeImageData(width, height, yellowData),
    black: makeImageData(width, height, blackData),
  }

  // Extract spot color plates if configured
  if (profile.spotColors && profile.spotColors.length > 0) {
    result.spotPlates = new Map()
    for (const spot of profile.spotColors) {
      result.spotPlates.set(spot.name, extractSpotPlate(imageData, spot))
    }
  }

  return result
}

/**
 * Export a single separation plate as a grayscale TIFF.
 */
export function exportSeparationAsTIFF(plate: ImageData, _name: string): ArrayBuffer {
  // The plate is already in grayscale (R=G=B), encodeTIFF handles RGBA
  const tiffBytes = encodeTIFF(plate)
  return tiffBytes.buffer as ArrayBuffer
}

// ── Composite preview ────────────────────────────────────────────────────────

/**
 * Generate a composite preview from separation plates (CMYK back to RGB for display).
 */
export function compositeSeparations(plates: SeparationPlates): ImageData {
  const { width, height } = plates.cyan
  const result = new Uint8ClampedArray(width * height * 4)

  const cData = plates.cyan.data
  const mData = plates.magenta.data
  const yData = plates.yellow.data
  const kData = plates.black.data

  for (let i = 0; i < result.length; i += 4) {
    // Plate values are grayscale (R=G=B), use R channel
    const c = cData[i]! / 255
    const m = mData[i]! / 255
    const y = yData[i]! / 255
    const k = kData[i]! / 255

    // CMYK to RGB
    result[i] = Math.round((1 - c) * (1 - k) * 255)
    result[i + 1] = Math.round((1 - m) * (1 - k) * 255)
    result[i + 2] = Math.round((1 - y) * (1 - k) * 255)
    result[i + 3] = 255
  }

  return makeImageData(width, height, result)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return {
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData
}
