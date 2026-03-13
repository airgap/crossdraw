/**
 * HDR / OpenEXR Support (#77)
 *
 * Provides tone-mapping operators for converting Float32Image (linear HDR)
 * to displayable sRGB ImageData.
 *
 * Operators:
 * - Reinhard (global, with exposure control)
 * - ACES Filmic (Academy Color Encoding System approximation)
 *
 * Also exposes helpers for detecting HDR display capability.
 */

import type { Float32Image } from './float-pipeline'
import { linearToSrgb } from './float-pipeline'

// ── Tone-mapping: Reinhard ───────────────────────────────────────────────────

/**
 * Reinhard global tone-mapping with exposure control.
 *
 * exposure > 0 brightens, < 0 darkens (EV stops). Default 0 = no exposure
 * shift.  The operator maps [0, inf) → [0, 1) via v / (1 + v).
 */
export function toneMapReinhard(image: Float32Image, exposure: number = 0): ImageData {
  const { width, height, data } = image
  const len = width * height * 4
  const out = new Uint8ClampedArray(len)
  const exposureScale = Math.pow(2, exposure)

  for (let i = 0; i < len; i += 4) {
    let r = Math.max(0, data[i]! * exposureScale)
    let g = Math.max(0, data[i + 1]! * exposureScale)
    let b = Math.max(0, data[i + 2]! * exposureScale)

    // Reinhard operator: v / (1 + v)
    r = r / (1 + r)
    g = g / (1 + g)
    b = b / (1 + b)

    out[i] = Math.round(linearToSrgb(r) * 255)
    out[i + 1] = Math.round(linearToSrgb(g) * 255)
    out[i + 2] = Math.round(linearToSrgb(b) * 255)
    out[i + 3] = Math.round(Math.max(0, Math.min(1, data[i + 3]!)) * 255)
  }

  return makeImageData(width, height, out)
}

// ── Tone-mapping: ACES Filmic ────────────────────────────────────────────────

/**
 * ACES filmic tone-mapping (Narkowicz 2015 fit).
 *
 * Maps HDR linear values to [0, ~1] using the curve:
 *   f(x) = (x * (2.51x + 0.03)) / (x * (2.43x + 0.59) + 0.14)
 */
function acesFilmic(v: number): number {
  const a = 2.51
  const b = 0.03
  const c = 2.43
  const d = 0.59
  const e = 0.14
  return Math.max(0, Math.min(1, (v * (a * v + b)) / (v * (c * v + d) + e)))
}

export function toneMapACES(image: Float32Image): ImageData {
  const { width, height, data } = image
  const len = width * height * 4
  const out = new Uint8ClampedArray(len)

  for (let i = 0; i < len; i += 4) {
    const r = Math.max(0, data[i]!)
    const g = Math.max(0, data[i + 1]!)
    const b = Math.max(0, data[i + 2]!)

    out[i] = Math.round(linearToSrgb(acesFilmic(r)) * 255)
    out[i + 1] = Math.round(linearToSrgb(acesFilmic(g)) * 255)
    out[i + 2] = Math.round(linearToSrgb(acesFilmic(b)) * 255)
    out[i + 3] = Math.round(Math.max(0, Math.min(1, data[i + 3]!)) * 255)
  }

  return makeImageData(width, height, out)
}

// ── HDR display detection ────────────────────────────────────────────────────

/**
 * Detect whether the current display supports HDR (high dynamic range).
 * Uses the CSS `dynamic-range: high` media query.
 *
 * Returns false in non-browser environments.
 */
export function isHdrDisplay(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false
  return globalThis.matchMedia('(dynamic-range: high)').matches
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}
