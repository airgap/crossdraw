/**
 * Font Matching (#81)
 *
 * Analyses a text region in raster imagery and returns ranked font matches
 * based on visual characteristics:  x-height ratio, stroke contrast, serif
 * detection, weight estimation, and aspect ratio.
 *
 * This is a heuristic approach — real-world font identification would use a
 * trained ML model or a service like WhatTheFont.  The local metrics database
 * covers common system fonts and provides a reasonable first pass.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface FontMatchResult {
  family: string
  weight: string
  style: string
  confidence: number // 0-1
}

export interface FontMatchSettings {
  /** Maximum number of results to return. */
  maxResults: number
  /** Minimum confidence threshold (0-1). Results below this are excluded. */
  minConfidence: number
}

export const DEFAULT_FONT_MATCH_SETTINGS: FontMatchSettings = {
  maxResults: 5,
  minConfidence: 0.1,
}

/** Internal font metrics entry in the database. */
export interface FontMetrics {
  family: string
  weight: string
  style: string
  /** x-height / cap-height ratio (typically 0.4-0.8). */
  xHeightRatio: number
  /** Stroke contrast: ratio of thinnest to thickest stroke (0-1). */
  strokeContrast: number
  /** Whether the font has serifs. */
  hasSerifs: boolean
  /** Average character width / height ratio. */
  aspectRatio: number
  /** Approximate stem weight (thin=1, black=9). */
  weightClass: number
}

// ── Built-in font metrics database ───────────────────────────────────────────

export const FONT_METRICS_DB: FontMetrics[] = [
  {
    family: 'Arial',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.52,
    strokeContrast: 0.85,
    hasSerifs: false,
    aspectRatio: 0.55,
    weightClass: 4,
  },
  {
    family: 'Arial',
    weight: 'bold',
    style: 'normal',
    xHeightRatio: 0.52,
    strokeContrast: 0.8,
    hasSerifs: false,
    aspectRatio: 0.58,
    weightClass: 7,
  },
  {
    family: 'Helvetica',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.52,
    strokeContrast: 0.88,
    hasSerifs: false,
    aspectRatio: 0.55,
    weightClass: 4,
  },
  {
    family: 'Helvetica',
    weight: 'bold',
    style: 'normal',
    xHeightRatio: 0.52,
    strokeContrast: 0.82,
    hasSerifs: false,
    aspectRatio: 0.58,
    weightClass: 7,
  },
  {
    family: 'Times New Roman',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.45,
    strokeContrast: 0.4,
    hasSerifs: true,
    aspectRatio: 0.45,
    weightClass: 4,
  },
  {
    family: 'Times New Roman',
    weight: 'bold',
    style: 'normal',
    xHeightRatio: 0.45,
    strokeContrast: 0.45,
    hasSerifs: true,
    aspectRatio: 0.48,
    weightClass: 7,
  },
  {
    family: 'Georgia',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.48,
    strokeContrast: 0.42,
    hasSerifs: true,
    aspectRatio: 0.5,
    weightClass: 4,
  },
  {
    family: 'Verdana',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.55,
    strokeContrast: 0.9,
    hasSerifs: false,
    aspectRatio: 0.58,
    weightClass: 4,
  },
  {
    family: 'Courier New',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.43,
    strokeContrast: 0.95,
    hasSerifs: true,
    aspectRatio: 0.6,
    weightClass: 4,
  },
  {
    family: 'Trebuchet MS',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.53,
    strokeContrast: 0.75,
    hasSerifs: false,
    aspectRatio: 0.52,
    weightClass: 4,
  },
  {
    family: 'Garamond',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.42,
    strokeContrast: 0.35,
    hasSerifs: true,
    aspectRatio: 0.43,
    weightClass: 4,
  },
  {
    family: 'Futura',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.5,
    strokeContrast: 0.92,
    hasSerifs: false,
    aspectRatio: 0.52,
    weightClass: 4,
  },
  {
    family: 'Roboto',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.53,
    strokeContrast: 0.85,
    hasSerifs: false,
    aspectRatio: 0.54,
    weightClass: 4,
  },
  {
    family: 'Roboto',
    weight: 'bold',
    style: 'normal',
    xHeightRatio: 0.53,
    strokeContrast: 0.78,
    hasSerifs: false,
    aspectRatio: 0.57,
    weightClass: 7,
  },
  {
    family: 'Open Sans',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.54,
    strokeContrast: 0.87,
    hasSerifs: false,
    aspectRatio: 0.55,
    weightClass: 4,
  },
  {
    family: 'Palatino',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.46,
    strokeContrast: 0.38,
    hasSerifs: true,
    aspectRatio: 0.47,
    weightClass: 4,
  },
  {
    family: 'Impact',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.52,
    strokeContrast: 0.65,
    hasSerifs: false,
    aspectRatio: 0.4,
    weightClass: 9,
  },
  {
    family: 'Comic Sans MS',
    weight: 'normal',
    style: 'normal',
    xHeightRatio: 0.54,
    strokeContrast: 0.8,
    hasSerifs: false,
    aspectRatio: 0.58,
    weightClass: 4,
  },
]

// ── Image analysis ───────────────────────────────────────────────────────────

interface AnalysedRegion {
  xHeightRatio: number
  strokeContrast: number
  hasSerifs: boolean
  aspectRatio: number
  weightClass: number
}

/**
 * Analyse a rectangular region of an ImageData to extract font-like metrics.
 *
 * The analysis is simplified:
 * - Binarize the region
 * - Measure horizontal/vertical run lengths to estimate stroke weight
 * - Detect serifs by checking for small horizontal protrusions
 * - Estimate x-height ratio from vertical ink distribution
 */
export function analyseTextRegion(
  imageData: ImageData,
  region: { x: number; y: number; width: number; height: number },
): AnalysedRegion {
  const { width: imgW, data } = imageData
  const { x: rx, y: ry, width: rw, height: rh } = region

  // Binarize region (simple luminance threshold)
  const binary: boolean[][] = []
  for (let row = 0; row < rh; row++) {
    const bRow: boolean[] = []
    for (let col = 0; col < rw; col++) {
      const sx = rx + col
      const sy = ry + row
      const idx = (sy * imgW + sx) * 4
      const lum = 0.299 * data[idx]! + 0.587 * data[idx + 1]! + 0.114 * data[idx + 2]!
      bRow.push(lum < 128)
    }
    binary.push(bRow)
  }

  // Measure vertical ink distribution for x-height ratio
  const rowDensity: number[] = binary.map((row) => row.filter(Boolean).length / rw)
  const inkRows = rowDensity.filter((d) => d > 0.05)
  const totalInkHeight = inkRows.length

  // Find densest region (approximate body height)
  let maxDensityRun = 0
  let currentRun = 0
  for (const d of rowDensity) {
    if (d > 0.1) {
      currentRun++
      maxDensityRun = Math.max(maxDensityRun, currentRun)
    } else {
      currentRun = 0
    }
  }
  const xHeightRatio = totalInkHeight > 0 ? Math.min(1, maxDensityRun / totalInkHeight) : 0.5

  // Measure horizontal strokes (run lengths)
  const hRunLengths: number[] = []
  for (const row of binary) {
    let run = 0
    for (const px of row) {
      if (px) {
        run++
      } else if (run > 0) {
        hRunLengths.push(run)
        run = 0
      }
    }
    if (run > 0) hRunLengths.push(run)
  }

  // Measure vertical strokes
  const vRunLengths: number[] = []
  for (let col = 0; col < rw; col++) {
    let run = 0
    for (let row = 0; row < rh; row++) {
      if (binary[row]![col]) {
        run++
      } else if (run > 0) {
        vRunLengths.push(run)
        run = 0
      }
    }
    if (run > 0) vRunLengths.push(run)
  }

  // Stroke contrast: ratio of min to max average run length
  const avgH = hRunLengths.length > 0 ? hRunLengths.reduce((a, b) => a + b, 0) / hRunLengths.length : 1
  const avgV = vRunLengths.length > 0 ? vRunLengths.reduce((a, b) => a + b, 0) / vRunLengths.length : 1
  const strokeContrast = Math.min(avgH, avgV) / Math.max(avgH, avgV)

  // Serif detection: look for short horizontal protrusions at top/bottom
  let serifScore = 0
  const edgeRows = [0, 1, rh - 2, rh - 1].filter((r) => r >= 0 && r < rh)
  for (const row of edgeRows) {
    const bRow = binary[row]!
    let transitions = 0
    for (let col = 1; col < rw; col++) {
      if (bRow[col] !== bRow[col - 1]) transitions++
    }
    if (transitions > 4) serifScore++
  }
  const hasSerifs = serifScore >= 2

  // Aspect ratio: average ink column width / height
  const inkCols = binary[0]?.filter((_v, i) => binary.some((row) => row[i])).length ?? rw
  const aspectRatio = rw > 0 ? Math.min(1, inkCols / rh) : 0.5

  // Weight class: based on average horizontal stroke thickness relative to height
  const relativeWeight = avgH / rh
  const weightClass = Math.max(1, Math.min(9, Math.round(relativeWeight * 40)))

  return {
    xHeightRatio,
    strokeContrast,
    hasSerifs,
    aspectRatio,
    weightClass,
  }
}

// ── Font matching ────────────────────────────────────────────────────────────

function computeMatchScore(analysed: AnalysedRegion, metrics: FontMetrics): number {
  // Weighted distance across features
  const xHeightDiff = Math.abs(analysed.xHeightRatio - metrics.xHeightRatio)
  const contrastDiff = Math.abs(analysed.strokeContrast - metrics.strokeContrast)
  const aspectDiff = Math.abs(analysed.aspectRatio - metrics.aspectRatio)
  const weightDiff = Math.abs(analysed.weightClass - metrics.weightClass) / 9
  const serifPenalty = analysed.hasSerifs !== metrics.hasSerifs ? 0.3 : 0

  const distance = xHeightDiff * 0.25 + contrastDiff * 0.2 + aspectDiff * 0.15 + weightDiff * 0.15 + serifPenalty * 0.25

  // Convert distance to confidence (0 distance = 1.0 confidence)
  return Math.max(0, 1 - distance)
}

/**
 * Match a font from an image region.
 *
 * Analyses the given region for typographic characteristics and compares
 * against the built-in font metrics database.  Returns ranked matches
 * sorted by confidence (highest first).
 */
export async function matchFont(
  imageData: ImageData,
  region: { x: number; y: number; width: number; height: number },
  settings: FontMatchSettings = DEFAULT_FONT_MATCH_SETTINGS,
): Promise<FontMatchResult[]> {
  const analysed = analyseTextRegion(imageData, region)

  const scored = FONT_METRICS_DB.map((metrics) => ({
    family: metrics.family,
    weight: metrics.weight,
    style: metrics.style,
    confidence: computeMatchScore(analysed, metrics),
  }))

  return scored
    .filter((m) => m.confidence >= settings.minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, settings.maxResults)
}
