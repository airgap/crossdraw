/**
 * Overprint Preview (#78)
 *
 * Simulates ink overprinting for prepress proofing. In overprint mode, inks
 * combine by multiplication rather than knocking out (replacing) underlying
 * ink. This is critical for evaluating trap behaviour and rich blacks.
 *
 * The simulation works in CMYK space: for each pixel, the CMYK values from
 * the foreground and background are combined multiplicatively, and the result
 * is converted back to RGB for screen display.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CMYKData {
  /** Interleaved CMYK float arrays, 4 values per pixel (0-1 each). */
  data: Float32Array
  width: number
  height: number
}

export interface OverprintSettings {
  /** Enable overprint simulation. */
  enabled: boolean
  /** Simulate rich black (K + CMY for deeper blacks). */
  simulateRichBlack: boolean
  /** Ink density limit (total CMYK percentage, e.g. 320). */
  inkLimit: number
}

export const DEFAULT_OVERPRINT_SETTINGS: OverprintSettings = {
  enabled: true,
  simulateRichBlack: true,
  inkLimit: 320,
}

// ── RGB ↔ CMYK helpers (local, simple model) ────────────────────────────────

function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const k = 1 - Math.max(rn, gn, bn)
  if (k >= 1) return [0, 0, 0, 1]

  const c = (1 - rn - k) / (1 - k)
  const m = (1 - gn - k) / (1 - k)
  const y = (1 - bn - k) / (1 - k)

  return [c, m, y, k]
}

function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const r = Math.round(255 * (1 - c) * (1 - k))
  const g = Math.round(255 * (1 - m) * (1 - k))
  const b = Math.round(255 * (1 - y) * (1 - k))
  return [clamp255(r), clamp255(g), clamp255(b)]
}

// ── Convert ImageData to CMYKData ────────────────────────────────────────────

export function imageDataToCMYK(imageData: ImageData): CMYKData {
  const { width, height, data } = imageData
  const len = width * height
  const out = new Float32Array(len * 4)

  for (let p = 0; p < len; p++) {
    const si = p * 4
    const [c, m, y, k] = rgbToCmyk(data[si]!, data[si + 1]!, data[si + 2]!)
    out[si] = c
    out[si + 1] = m
    out[si + 2] = y
    out[si + 3] = k
  }

  return { data: out, width, height }
}

// ── Overprint simulation ─────────────────────────────────────────────────────

/**
 * Simulate overprint preview.
 *
 * Foreground ink (cmykData) is composited over the background (imageData)
 * using multiplicative ink combination rather than knockout.
 *
 * For each pixel:
 *   combined_ink[channel] = 1 - (1 - fg[channel]) * (1 - bg[channel])
 *
 * This is the standard overprint model: inks add together (darken).
 */
export function applyOverprintPreview(
  imageData: ImageData,
  cmykData: CMYKData,
  settings: OverprintSettings = DEFAULT_OVERPRINT_SETTINGS,
): ImageData {
  const { width, height } = imageData
  const bgData = imageData.data
  const fgCmyk = cmykData.data
  const len = width * height
  const out = new Uint8ClampedArray(len * 4)

  const inkLimitFrac = settings.inkLimit / 100

  for (let p = 0; p < len; p++) {
    const si = p * 4

    // Background in CMYK
    const [bgC, bgM, bgY, bgK] = rgbToCmyk(bgData[si]!, bgData[si + 1]!, bgData[si + 2]!)

    // Foreground CMYK
    const fgC = fgCmyk[si]!
    const fgM = fgCmyk[si + 1]!
    const fgY = fgCmyk[si + 2]!
    const fgK = fgCmyk[si + 3]!

    // Multiplicative overprint: inks combine
    let c = 1 - (1 - fgC) * (1 - bgC)
    let m = 1 - (1 - fgM) * (1 - bgM)
    let y = 1 - (1 - fgY) * (1 - bgY)
    let k = 1 - (1 - fgK) * (1 - bgK)

    // Apply ink limit
    const total = c + m + y + k
    if (total > inkLimitFrac) {
      const scale = inkLimitFrac / total
      c *= scale
      m *= scale
      y *= scale
      // k is preserved for shadow detail
    }

    c = Math.min(1, Math.max(0, c))
    m = Math.min(1, Math.max(0, m))
    y = Math.min(1, Math.max(0, y))
    k = Math.min(1, Math.max(0, k))

    const [r, g, b] = cmykToRgb(c, m, y, k)
    out[si] = r
    out[si + 1] = g
    out[si + 2] = b
    out[si + 3] = bgData[si + 3]!
  }

  return makeImageData(width, height, out)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}
