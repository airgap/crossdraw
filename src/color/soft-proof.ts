/**
 * Soft proofing: preview how colours will appear on an output device.
 *
 * The pipeline converts each pixel:
 *   document profile → PCS (XYZ) → proof profile → PCS → monitor profile
 *
 * For matrix-based RGB profiles the full transform is applied.  When
 * profiles are unavailable the module falls back to a simple sRGB
 * round-trip.
 */

import type { ICCProfileData, RenderingIntent } from './icc-profile'
import { convertWithProfile, getActiveProfiles, SRGB_PROFILE } from './icc-profile'
import { rgbToLab, deltaE76 } from './color-spaces'

// ─── Settings ────────────────────────────────────────────────

export interface SoftProofSettings {
  /** Whether soft proofing is active. */
  enabled: boolean
  /** Output device profile. */
  profile: ICCProfileData | null
  /** Rendering intent for the proof conversion. */
  renderingIntent: RenderingIntent
  /** Simulate the paper colour (by clamping the white point). */
  simulatePaperColor: boolean
  /** Show an overlay marking out-of-gamut pixels. */
  gamutWarning: boolean
  /** Colour used for gamut warning overlay. */
  gamutWarningColor: string
}

/** Default soft proof settings. */
export function defaultSoftProofSettings(): SoftProofSettings {
  return {
    enabled: false,
    profile: null,
    renderingIntent: 'relative-colorimetric',
    simulatePaperColor: false,
    gamutWarning: false,
    gamutWarningColor: '#ff00ff',
  }
}

// ─── Soft proof transform ────────────────────────────────────

/**
 * Apply soft proofing to an ImageData buffer.
 *
 * Each pixel is converted through the document → proof → monitor profile
 * chain.  Returns a new ImageData.
 */
export function applySoftProof(imageData: ImageData, settings: SoftProofSettings): ImageData {
  const { profile } = settings
  if (!profile) return imageData

  const active = getActiveProfiles()
  const docProfile = active.documentProfile ?? SRGB_PROFILE
  const monProfile = active.monitorProfile ?? SRGB_PROFILE

  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const out = createImageData(w, h)
  const dst = out.data

  for (let i = 0; i < src.length; i += 4) {
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!

    // Document → PCS → proof device
    const proofed = convertWithProfile([r, g, b], docProfile, profile)
    // Proof device → PCS → monitor
    const displayed = convertWithProfile(proofed, profile, monProfile)

    dst[i] = displayed[0]
    dst[i + 1] = displayed[1]
    dst[i + 2] = displayed[2]
    dst[i + 3] = src[i + 3]!
  }

  return out
}

// ─── Gamut warning ───────────────────────────────────────────

/** Delta-E threshold above which a colour is considered out of gamut. */
const GAMUT_THRESHOLD = 2.0

/**
 * Compute a gamut-warning bitmask for the given image.
 *
 * Returns a Uint8Array the same length as the pixel count (width * height)
 * where 1 = out of gamut, 0 = in gamut.
 *
 * The test converts each pixel from document space → proof space → back to
 * document space and checks whether the round-trip introduces a colour
 * difference (measured in CIE76 ΔE) above the threshold.
 */
export function computeGamutWarning(imageData: ImageData, proofProfile: ICCProfileData): Uint8Array {
  const active = getActiveProfiles()
  const docProfile = active.documentProfile ?? SRGB_PROFILE

  const pixelCount = imageData.width * imageData.height
  const mask = new Uint8Array(pixelCount)
  const src = imageData.data

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4
    const r = src[i]!
    const g = src[i + 1]!
    const b = src[i + 2]!

    // Forward: doc → proof → doc round-trip
    const proofed = convertWithProfile([r, g, b], docProfile, proofProfile)
    const roundTrip = convertWithProfile(proofed, proofProfile, docProfile)

    // Measure ΔE in Lab
    const [L1, a1, b1] = rgbToLab(r, g, b)
    const [L2, a2, b2] = rgbToLab(roundTrip[0], roundTrip[1], roundTrip[2])
    const dE = deltaE76(L1, a1, b1, L2, a2, b2)

    mask[p] = dE > GAMUT_THRESHOLD ? 1 : 0
  }

  return mask
}

/**
 * Render the gamut warning overlay onto an ImageData in-place.
 * Pixels flagged in the mask are replaced with the warning colour.
 */
export function applyGamutWarningOverlay(imageData: ImageData, mask: Uint8Array, warningColor: string): void {
  const hex = warningColor.replace('#', '')
  const wr = parseInt(hex.slice(0, 2), 16) || 255
  const wg = parseInt(hex.slice(2, 4), 16) || 0
  const wb = parseInt(hex.slice(4, 6), 16) || 255
  const data = imageData.data

  for (let p = 0; p < mask.length; p++) {
    if (mask[p]) {
      const i = p * 4
      data[i] = wr
      data[i + 1] = wg
      data[i + 2] = wb
      // Keep alpha
    }
  }
}

// ─── Internal helpers ────────────────────────────────────────

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
