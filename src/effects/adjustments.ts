import type { AdjustmentLayer, LevelsParams, CurvesParams, HueSatParams, ColorBalanceParams } from '@/types'

/**
 * Apply an adjustment layer's effect to pixel data in-place.
 */
export function applyAdjustment(imageData: ImageData, layer: AdjustmentLayer) {
  if (!layer.visible) return

  const d = imageData.data
  switch (layer.adjustmentType) {
    case 'levels':
      applyLevels(d, layer.params)
      break
    case 'curves':
      applyCurves(d, layer.params)
      break
    case 'hue-sat':
      applyHueSat(d, layer.params)
      break
    case 'color-balance':
      applyColorBalance(d, layer.params)
      break
  }
}

function applyLevels(data: Uint8ClampedArray, p: LevelsParams) {
  const range = p.whitePoint - p.blackPoint
  if (range <= 0) return
  const invGamma = 1 / Math.max(0.01, p.gamma)

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = (data[i + c]! - p.blackPoint) / range
      v = Math.max(0, Math.min(1, v))
      v = Math.pow(v, invGamma)
      data[i + c] = Math.round(v * 255)
    }
  }
}

function applyCurves(data: Uint8ClampedArray, p: CurvesParams) {
  const lut = buildCurveLUT(p.points)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]!]!
    data[i + 1] = lut[data[i + 1]!]!
    data[i + 2] = lut[data[i + 2]!]!
  }
}

/** Build a 256-entry lookup table from curve control points via linear interpolation. */
function buildCurveLUT(points: [number, number][]): Uint8Array {
  const lut = new Uint8Array(256)
  if (points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i
    return lut
  }

  // Sort by input value
  const sorted = [...points].sort((a, b) => a[0] - b[0])

  // Ensure endpoints
  if (sorted[0]![0] > 0) sorted.unshift([0, 0])
  if (sorted[sorted.length - 1]![0] < 255) sorted.push([255, 255])

  let seg = 0
  for (let i = 0; i < 256; i++) {
    while (seg < sorted.length - 2 && sorted[seg + 1]![0] < i) seg++
    const [x0, y0] = sorted[seg]!
    const [x1, y1] = sorted[seg + 1]!
    const t = x1 === x0 ? 0 : (i - x0) / (x1 - x0)
    lut[i] = Math.round(Math.max(0, Math.min(255, y0 + t * (y1 - y0))))
  }

  return lut
}

function applyHueSat(data: Uint8ClampedArray, p: HueSatParams) {
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!)
    const nh = (h + p.hue / 360 + 1) % 1
    const ns = Math.max(0, Math.min(1, s + p.saturation / 100))
    const nl = Math.max(0, Math.min(1, l + p.lightness / 100))
    const [r, g, b] = hslToRgb(nh, ns, nl)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
}

function applyColorBalance(data: Uint8ClampedArray, p: ColorBalanceParams) {
  // Simple color balance: shift RGB based on shadow/mid/highlight regions
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255

    // Weight: shadows (dark), midtones (mid), highlights (bright)
    const shadowW = Math.max(0, 1 - lum * 3)
    const highlightW = Math.max(0, lum * 3 - 2)
    const midW = 1 - shadowW - highlightW

    const shift = p.shadows * shadowW + p.midtones * midW + p.highlights * highlightW

    data[i] = Math.max(0, Math.min(255, data[i]! + shift))
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1]! - shift * 0.5))
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2]! - shift * 0.5))
  }
}

// ─── Color space conversion ───────────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

// Exported for tests
export { rgbToHsl, hslToRgb, buildCurveLUT }
