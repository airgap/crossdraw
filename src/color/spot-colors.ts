/**
 * Pantone / Spot colour library.
 *
 * Provides a curated library of ~200 common Pantone Coated spot colours
 * with Lab values, and utilities for searching and matching.
 */

import { rgbToLab, labToRgb, deltaE76, rgbToCmyk } from './color-spaces'

// ─── Types ───────────────────────────────────────────────────

export interface SpotColor {
  /** Colour name (e.g. "PANTONE 186 C"). */
  name: string
  /** sRGB approximation. */
  rgb: [number, number, number]
  /** CMYK approximation (0-1 ranges). */
  cmyk: [number, number, number, number]
  /** CIE L*a*b* values. */
  lab: [number, number, number]
  /** Library name. */
  library: string
}

export interface DocumentSpotSwatch {
  /** Unique ID. */
  id: string
  /** Spot colour reference. */
  spotColor: SpotColor
  /** Tint percentage 0-100 (100 = full strength). */
  tint: number
}

// ─── Pantone Coated library ──────────────────────────────────

/**
 * A curated set of ~200 commonly used Pantone Coated spot colours.
 *
 * Lab values are approximate conversions; actual Pantone Lab values are
 * proprietary.  These are close enough for colour matching and previewing.
 *
 * Note: The RGB and CMYK values are derived from the Lab values.
 */
function makeSpot(name: string, L: number, a: number, b: number): SpotColor {
  const rgb = labToRgb(L, a, b) as [number, number, number]
  const cmyk = rgbToCmyk(rgb[0], rgb[1], rgb[2]) as [number, number, number, number]
  return { name, rgb, cmyk, lab: [L, a, b], library: 'PANTONE+ Coated' }
}

export const PANTONE_COATED: SpotColor[] = [
  // Reds
  makeSpot('PANTONE 185 C', 47.56, 69.06, 48.25),
  makeSpot('PANTONE 186 C', 44.06, 64.62, 40.25),
  makeSpot('PANTONE 187 C', 38.66, 57.89, 31.79),
  makeSpot('PANTONE 188 C', 32.72, 45.44, 21.12),
  makeSpot('PANTONE 189 C', 60.43, 48.59, 11.84),
  makeSpot('PANTONE 190 C', 55.08, 55.55, 14.63),
  makeSpot('PANTONE 191 C', 49.58, 63.88, 23.12),
  makeSpot('PANTONE 192 C', 47.12, 67.82, 32.96),
  makeSpot('PANTONE 193 C', 38.23, 59.72, 22.36),
  makeSpot('PANTONE 194 C', 33.89, 48.98, 13.43),
  makeSpot('PANTONE Red 032 C', 48.85, 70.14, 55.47),
  makeSpot('PANTONE 199 C', 43.83, 66.38, 38.56),
  makeSpot('PANTONE 200 C', 39.36, 60.02, 30.12),
  makeSpot('PANTONE 201 C', 34.84, 48.31, 21.86),
  makeSpot('PANTONE 202 C', 31.39, 44.22, 18.33),

  // Oranges
  makeSpot('PANTONE 021 C', 59.83, 50.86, 73.81),
  makeSpot('PANTONE 144 C', 64.19, 30.57, 71.93),
  makeSpot('PANTONE 151 C', 62.47, 40.89, 72.42),
  makeSpot('PANTONE 152 C', 59.65, 43.62, 67.82),
  makeSpot('PANTONE 158 C', 57.98, 44.92, 63.18),
  makeSpot('PANTONE 159 C', 53.34, 42.71, 55.09),
  makeSpot('PANTONE 165 C', 60.36, 48.38, 70.91),
  makeSpot('PANTONE 166 C', 55.93, 49.27, 65.52),
  makeSpot('PANTONE 167 C', 51.06, 44.43, 52.69),
  makeSpot('PANTONE 172 C', 57.58, 55.29, 63.66),
  makeSpot('PANTONE 173 C', 50.55, 46.61, 45.42),
  makeSpot('PANTONE 1505 C', 62.72, 43.18, 74.86),
  makeSpot('PANTONE 1585 C', 60.95, 48.51, 72.12),
  makeSpot('PANTONE 1665 C', 53.98, 54.11, 60.09),
  makeSpot('PANTONE 1788 C', 48.36, 67.21, 47.89),

  // Yellows
  makeSpot('PANTONE Yellow C', 89.92, -3.41, 91.05),
  makeSpot('PANTONE 100 C', 91.25, -6.93, 57.84),
  makeSpot('PANTONE 101 C', 91.49, -6.12, 73.11),
  makeSpot('PANTONE 102 C', 89.88, -3.94, 87.73),
  makeSpot('PANTONE 107 C', 89.35, -2.56, 82.29),
  makeSpot('PANTONE 108 C', 87.34, 0.26, 85.16),
  makeSpot('PANTONE 109 C', 84.51, 4.53, 86.38),
  makeSpot('PANTONE 110 C', 79.01, 6.28, 81.97),
  makeSpot('PANTONE 111 C', 72.14, 3.72, 69.82),
  makeSpot('PANTONE 112 C', 76.11, 5.22, 78.45),
  makeSpot('PANTONE 113 C', 90.31, -5.26, 65.81),
  makeSpot('PANTONE 114 C', 90.68, -4.47, 74.82),
  makeSpot('PANTONE 115 C', 90.16, -2.88, 78.11),
  makeSpot('PANTONE 116 C', 86.39, 3.45, 87.27),
  makeSpot('PANTONE 117 C', 73.88, 7.92, 74.63),
  makeSpot('PANTONE 1215 C', 89.77, -2.43, 51.43),
  makeSpot('PANTONE 1225 C', 84.53, 4.32, 71.24),
  makeSpot('PANTONE 1235 C', 79.31, 11.86, 77.48),
  makeSpot('PANTONE 1245 C', 69.56, 12.66, 66.21),
  makeSpot('PANTONE 1255 C', 62.45, 16.23, 60.72),

  // Greens
  makeSpot('PANTONE 348 C', 46.28, -44.78, 27.63),
  makeSpot('PANTONE 349 C', 37.75, -38.56, 21.83),
  makeSpot('PANTONE 350 C', 32.24, -30.45, 14.81),
  makeSpot('PANTONE 354 C', 54.98, -62.48, 44.73),
  makeSpot('PANTONE 355 C', 50.44, -59.26, 40.98),
  makeSpot('PANTONE 356 C', 42.56, -49.22, 30.47),
  makeSpot('PANTONE 357 C', 36.72, -38.93, 22.41),
  makeSpot('PANTONE 361 C', 60.42, -55.86, 39.29),
  makeSpot('PANTONE 362 C', 54.18, -50.36, 36.57),
  makeSpot('PANTONE 363 C', 48.35, -44.23, 30.41),
  makeSpot('PANTONE 364 C', 41.92, -39.44, 26.73),
  makeSpot('PANTONE 365 C', 77.83, -29.15, 34.05),
  makeSpot('PANTONE 366 C', 80.86, -24.36, 31.82),
  makeSpot('PANTONE 367 C', 78.31, -33.52, 42.43),
  makeSpot('PANTONE 368 C', 66.84, -52.45, 51.82),
  makeSpot('PANTONE Green C', 57.43, -56.42, 24.63),
  makeSpot('PANTONE 3268 C', 60.78, -44.82, 2.14),
  makeSpot('PANTONE 3278 C', 54.48, -48.78, 5.83),
  makeSpot('PANTONE 3288 C', 44.12, -40.93, 2.14),
  makeSpot('PANTONE 3298 C', 38.72, -36.35, -0.52),

  // Blues
  makeSpot('PANTONE 279 C', 52.24, 6.18, -53.48),
  makeSpot('PANTONE 280 C', 26.89, 18.34, -52.28),
  makeSpot('PANTONE 281 C', 22.35, 14.55, -44.52),
  makeSpot('PANTONE 282 C', 18.67, 8.62, -33.75),
  makeSpot('PANTONE 283 C', 67.22, -3.64, -30.66),
  makeSpot('PANTONE 284 C', 58.77, -0.19, -40.48),
  makeSpot('PANTONE 285 C', 47.65, 5.89, -55.82),
  makeSpot('PANTONE 286 C', 33.08, 22.23, -63.32),
  makeSpot('PANTONE 287 C', 27.45, 20.48, -58.38),
  makeSpot('PANTONE 288 C', 22.78, 16.56, -50.95),
  makeSpot('PANTONE 289 C', 16.74, 5.69, -28.53),
  makeSpot('PANTONE 290 C', 76.11, -5.89, -17.63),
  makeSpot('PANTONE 291 C', 71.36, -5.35, -25.78),
  makeSpot('PANTONE 292 C', 63.22, -2.54, -36.55),
  makeSpot('PANTONE 293 C', 34.62, 18.62, -59.43),
  makeSpot('PANTONE 294 C', 24.56, 10.21, -44.72),
  makeSpot('PANTONE 295 C', 19.89, 7.18, -36.42),
  makeSpot('PANTONE 296 C', 15.12, 2.33, -23.85),
  makeSpot('PANTONE 297 C', 62.81, -11.35, -34.85),
  makeSpot('PANTONE 298 C', 57.73, -10.12, -40.78),
  makeSpot('PANTONE Process Blue C', 53.27, -10.95, -45.77),
  makeSpot('PANTONE 299 C', 52.62, -7.86, -46.42),
  makeSpot('PANTONE 300 C', 41.88, 1.56, -55.64),
  makeSpot('PANTONE 301 C', 33.12, 1.82, -44.93),
  makeSpot('PANTONE 302 C', 25.36, -4.83, -31.44),

  // Purples / Violets
  makeSpot('PANTONE 2562 C', 59.72, 33.82, -35.45),
  makeSpot('PANTONE 2563 C', 55.23, 37.41, -31.26),
  makeSpot('PANTONE 2572 C', 52.85, 42.38, -39.67),
  makeSpot('PANTONE 2573 C', 47.64, 45.86, -36.12),
  makeSpot('PANTONE 2582 C', 44.32, 53.28, -42.88),
  makeSpot('PANTONE 2583 C', 38.95, 52.18, -38.45),
  makeSpot('PANTONE 2587 C', 37.41, 56.72, -46.33),
  makeSpot('PANTONE 2593 C', 35.68, 55.95, -43.82),
  makeSpot('PANTONE 2597 C', 27.42, 53.18, -52.85),
  makeSpot('PANTONE 2602 C', 32.85, 55.62, -41.38),
  makeSpot('PANTONE 2607 C', 24.18, 48.62, -45.29),
  makeSpot('PANTONE 2612 C', 29.56, 50.85, -36.72),
  makeSpot('PANTONE 2617 C', 22.81, 44.38, -40.15),
  makeSpot('PANTONE Violet C', 27.83, 55.21, -55.93),
  makeSpot('PANTONE Purple C', 35.48, 60.33, -32.46),

  // Pinks / Magentas
  makeSpot('PANTONE Rhodamine Red C', 50.21, 70.62, -12.83),
  makeSpot('PANTONE 211 C', 62.35, 48.24, -8.26),
  makeSpot('PANTONE 212 C', 55.82, 57.46, -6.93),
  makeSpot('PANTONE 213 C', 49.67, 63.58, -2.75),
  makeSpot('PANTONE 214 C', 43.25, 62.81, 3.42),
  makeSpot('PANTONE 215 C', 37.82, 55.93, 4.26),
  makeSpot('PANTONE 216 C', 32.55, 41.27, 2.18),
  makeSpot('PANTONE 218 C', 42.35, 64.56, -1.83),
  makeSpot('PANTONE 219 C', 45.82, 69.38, 0.86),
  makeSpot('PANTONE 220 C', 35.45, 55.72, 5.11),
  makeSpot('PANTONE 221 C', 33.18, 52.45, 6.82),
  makeSpot('PANTONE Rubine Red C', 44.14, 68.57, 4.82),
  makeSpot('PANTONE 225 C', 45.38, 67.18, -5.42),
  makeSpot('PANTONE 226 C', 42.82, 68.35, -1.53),
  makeSpot('PANTONE 227 C', 35.45, 57.88, 2.63),

  // Browns / Warm Neutrals
  makeSpot('PANTONE 469 C', 38.23, 21.14, 32.46),
  makeSpot('PANTONE 470 C', 48.42, 28.53, 41.72),
  makeSpot('PANTONE 471 C', 43.85, 30.26, 40.55),
  makeSpot('PANTONE 472 C', 72.66, 15.32, 31.47),
  makeSpot('PANTONE 473 C', 79.48, 9.63, 22.86),
  makeSpot('PANTONE 474 C', 75.22, 12.46, 28.63),
  makeSpot('PANTONE 476 C', 30.66, 14.55, 16.43),
  makeSpot('PANTONE 477 C', 28.82, 18.43, 17.66),
  makeSpot('PANTONE 478 C', 31.25, 23.66, 22.88),
  makeSpot('PANTONE 4625 C', 26.78, 20.86, 19.24),
  makeSpot('PANTONE 4635 C', 56.33, 18.54, 32.67),
  makeSpot('PANTONE 4645 C', 65.82, 14.23, 27.54),
  makeSpot('PANTONE 4655 C', 51.48, 21.36, 33.82),
  makeSpot('PANTONE 4665 C', 68.95, 12.18, 22.65),
  makeSpot('PANTONE 4675 C', 74.62, 9.45, 19.37),

  // Neutrals / Grays
  makeSpot('PANTONE Black C', 17.41, 0.53, 0.82),
  makeSpot('PANTONE Black 2 C', 22.36, -0.42, -2.63),
  makeSpot('PANTONE Black 3 C', 23.56, -5.82, 1.24),
  makeSpot('PANTONE Black 4 C', 25.82, -1.35, 6.47),
  makeSpot('PANTONE Black 5 C', 27.45, 2.63, -4.82),
  makeSpot('PANTONE Black 6 C', 21.88, -4.57, -4.23),
  makeSpot('PANTONE Black 7 C', 28.62, -0.26, 2.18),
  makeSpot('PANTONE Cool Gray 1 C', 88.45, -0.21, 0.85),
  makeSpot('PANTONE Cool Gray 2 C', 84.72, -0.33, 0.43),
  makeSpot('PANTONE Cool Gray 3 C', 80.85, -0.45, 0.22),
  makeSpot('PANTONE Cool Gray 4 C', 76.56, -0.52, -0.15),
  makeSpot('PANTONE Cool Gray 5 C', 72.33, -0.68, -0.42),
  makeSpot('PANTONE Cool Gray 6 C', 68.22, -0.73, -0.68),
  makeSpot('PANTONE Cool Gray 7 C', 63.85, -0.81, -0.93),
  makeSpot('PANTONE Cool Gray 8 C', 58.42, -0.86, -1.15),
  makeSpot('PANTONE Cool Gray 9 C', 52.88, -0.92, -1.36),
  makeSpot('PANTONE Cool Gray 10 C', 45.62, -0.95, -1.52),
  makeSpot('PANTONE Cool Gray 11 C', 38.45, -0.98, -1.68),
  makeSpot('PANTONE Warm Gray 1 C', 87.82, 1.15, 3.82),
  makeSpot('PANTONE Warm Gray 2 C', 83.55, 1.42, 4.23),
  makeSpot('PANTONE Warm Gray 3 C', 79.32, 1.63, 5.18),
  makeSpot('PANTONE Warm Gray 4 C', 74.88, 1.86, 5.95),
  makeSpot('PANTONE Warm Gray 5 C', 70.45, 2.12, 6.82),
  makeSpot('PANTONE Warm Gray 6 C', 66.18, 2.35, 7.45),
  makeSpot('PANTONE Warm Gray 7 C', 61.82, 2.55, 8.12),
  makeSpot('PANTONE Warm Gray 8 C', 56.33, 2.78, 8.86),
  makeSpot('PANTONE Warm Gray 9 C', 50.86, 2.96, 9.45),
  makeSpot('PANTONE Warm Gray 10 C', 44.55, 3.18, 10.12),
  makeSpot('PANTONE Warm Gray 11 C', 38.22, 3.42, 10.82),

  // Cyan / Teal
  makeSpot('PANTONE 311 C', 68.42, -34.82, -18.63),
  makeSpot('PANTONE 312 C', 63.18, -37.45, -19.86),
  makeSpot('PANTONE 313 C', 55.82, -38.66, -22.47),
  makeSpot('PANTONE 314 C', 48.35, -34.88, -23.63),
  makeSpot('PANTONE 315 C', 40.66, -28.95, -21.45),
  makeSpot('PANTONE 316 C', 28.82, -18.63, -14.88),
  makeSpot('PANTONE 317 C', 83.56, -16.42, -6.82),
  makeSpot('PANTONE 318 C', 75.88, -26.45, -12.35),
  makeSpot('PANTONE 319 C', 71.22, -31.86, -14.63),
  makeSpot('PANTONE 320 C', 55.18, -42.55, -13.24),
  makeSpot('PANTONE 321 C', 48.66, -40.82, -12.86),
  makeSpot('PANTONE 322 C', 42.12, -36.35, -11.45),
  makeSpot('PANTONE 323 C', 50.55, -34.18, -8.72),
  makeSpot('PANTONE Process Cyan C', 58.85, -31.55, -40.42),
  makeSpot('PANTONE 3105 C', 72.86, -32.45, -12.88),

  // Additional common colours
  makeSpot('PANTONE Reflex Blue C', 22.56, 28.95, -65.82),
  makeSpot('PANTONE Warm Red C', 49.82, 64.53, 49.88),
  makeSpot('PANTONE Bright Red C', 46.18, 68.22, 48.55),
  makeSpot('PANTONE Strong Red C', 42.55, 62.88, 35.72),
  makeSpot('PANTONE Rubine Red 2X C', 39.82, 65.45, 8.63),
  makeSpot('PANTONE Magenta C', 43.25, 72.86, -8.55),
  makeSpot('PANTONE Medium Purple C', 32.45, 48.22, -40.66),
  makeSpot('PANTONE Blue 072 C', 24.82, 32.18, -68.45),
]

// ─── Search & match ──────────────────────────────────────────

/**
 * Find the closest Pantone spot colour to the given sRGB colour.
 * Uses CIE76 ΔE distance in L*a*b* space.
 */
export function findClosestSpotColor(r: number, g: number, b: number): SpotColor {
  const [L, a, bVal] = rgbToLab(r, g, b)

  let best = PANTONE_COATED[0]!
  let bestDist = Infinity

  for (const spot of PANTONE_COATED) {
    const dist = deltaE76(L, a, bVal, spot.lab[0], spot.lab[1], spot.lab[2])
    if (dist < bestDist) {
      bestDist = dist
      best = spot
    }
  }

  return best
}

/**
 * Search spot colours by name (case-insensitive substring match).
 */
export function searchSpotColors(query: string): SpotColor[] {
  const q = query.toLowerCase()
  return PANTONE_COATED.filter((c) => c.name.toLowerCase().includes(q))
}

/**
 * Find spot colours within a given ΔE distance of an sRGB colour.
 */
export function findSpotColorsInRange(r: number, g: number, b: number, maxDeltaE: number): SpotColor[] {
  const [L, a, bVal] = rgbToLab(r, g, b)
  return PANTONE_COATED.filter((spot) => {
    return deltaE76(L, a, bVal, spot.lab[0], spot.lab[1], spot.lab[2]) <= maxDeltaE
  })
}

/**
 * Create a document spot swatch from a spot colour reference.
 */
export function createSpotSwatch(spotColor: SpotColor, tint = 100): DocumentSpotSwatch {
  return {
    id: crypto.randomUUID(),
    spotColor,
    tint: Math.max(0, Math.min(100, tint)),
  }
}

/**
 * Compute the display RGB for a tinted spot colour.
 * Tint < 100 blends toward white.
 */
export function tintedSpotRgb(spot: SpotColor, tint: number): [number, number, number] {
  const t = tint / 100
  return [
    Math.round(spot.rgb[0] * t + 255 * (1 - t)),
    Math.round(spot.rgb[1] * t + 255 * (1 - t)),
    Math.round(spot.rgb[2] * t + 255 * (1 - t)),
  ]
}
