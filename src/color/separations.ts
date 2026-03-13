/**
 * Color Separations (#79)
 *
 * Generates CMYK separation plates from an RGB ImageData.  Each plate is a
 * grayscale ImageData where 255 = full ink density and 0 = no ink.
 *
 * This module provides a simplified API surface compared to the more
 * comprehensive `io/color-separation.ts`; it's intended for quick preview
 * generation in the UI.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeparationPlates {
  cyan: ImageData
  magenta: ImageData
  yellow: ImageData
  black: ImageData
}

export interface SeparationSettings {
  /** GCR amount 0-1.  Higher values move more gray into the K channel. */
  gcrAmount: number
  /** Total ink limit as a percentage (typical: 300-340). */
  totalInkLimit: number
}

export const DEFAULT_SEPARATION_SETTINGS: SeparationSettings = {
  gcrAmount: 0.5,
  totalInkLimit: 320,
}

// ── Main API ─────────────────────────────────────────────────────────────────

/**
 * Generate CMYK separation plates from an RGB ImageData.
 *
 * Each returned plate is a grayscale image showing ink density for one
 * CMYK channel.
 */
export function generateSeparationPlates(
  imageData: ImageData,
  settings: SeparationSettings = DEFAULT_SEPARATION_SETTINGS,
): SeparationPlates {
  const { width, height, data } = imageData

  const cyanArr = new Uint8ClampedArray(width * height * 4)
  const magentaArr = new Uint8ClampedArray(width * height * 4)
  const yellowArr = new Uint8ClampedArray(width * height * 4)
  const blackArr = new Uint8ClampedArray(width * height * 4)

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!

    const [c, m, y, k] = rgbToCmykWithGCR(r, g, b, settings)

    const cVal = Math.round(c * 255)
    const mVal = Math.round(m * 255)
    const yVal = Math.round(y * 255)
    const kVal = Math.round(k * 255)

    // Cyan plate
    cyanArr[i] = cVal
    cyanArr[i + 1] = cVal
    cyanArr[i + 2] = cVal
    cyanArr[i + 3] = 255

    // Magenta plate
    magentaArr[i] = mVal
    magentaArr[i + 1] = mVal
    magentaArr[i + 2] = mVal
    magentaArr[i + 3] = 255

    // Yellow plate
    yellowArr[i] = yVal
    yellowArr[i + 1] = yVal
    yellowArr[i + 2] = yVal
    yellowArr[i + 3] = 255

    // Black plate
    blackArr[i] = kVal
    blackArr[i + 1] = kVal
    blackArr[i + 2] = kVal
    blackArr[i + 3] = 255
  }

  return {
    cyan: makeImageData(width, height, cyanArr),
    magenta: makeImageData(width, height, magentaArr),
    yellow: makeImageData(width, height, yellowArr),
    black: makeImageData(width, height, blackArr),
  }
}

/**
 * Preview a single separation plate tinted with its ink colour.
 *
 * Returns an RGBA ImageData where the plate density is shown in the
 * ink's actual colour (e.g., cyan plate → cyan pixels).
 */
export function tintPlate(plate: ImageData, inkColor: [number, number, number]): ImageData {
  const { width, height, data } = plate
  const out = new Uint8ClampedArray(width * height * 4)

  for (let i = 0; i < data.length; i += 4) {
    const density = data[i]! / 255
    out[i] = Math.round(inkColor[0] * density)
    out[i + 1] = Math.round(inkColor[1] * density)
    out[i + 2] = Math.round(inkColor[2] * density)
    out[i + 3] = 255
  }

  return makeImageData(width, height, out)
}

// ── Internal ─────────────────────────────────────────────────────────────────

function rgbToCmykWithGCR(
  r: number,
  g: number,
  b: number,
  settings: SeparationSettings,
): [number, number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  let c = 1 - rn
  let m = 1 - gn
  let y = 1 - bn

  const kBase = Math.min(c, m, y)
  const k = kBase * settings.gcrAmount

  // Remove gray component
  if (kBase > 0) {
    c = Math.max(0, c - k)
    m = Math.max(0, m - k)
    y = Math.max(0, y - k)
  }

  // Ink limit enforcement
  const totalInk = (c + m + y + k) * 100
  if (totalInk > settings.totalInkLimit) {
    const scale = settings.totalInkLimit / totalInk
    c *= scale
    m *= scale
    y *= scale
  }

  return [
    Math.min(1, Math.max(0, c)),
    Math.min(1, Math.max(0, m)),
    Math.min(1, Math.max(0, y)),
    Math.min(1, Math.max(0, k)),
  ]
}

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}
