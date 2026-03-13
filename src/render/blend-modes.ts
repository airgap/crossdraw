/**
 * Custom blend mode pixel math for modes not natively supported by Canvas 2D
 * globalCompositeOperation. Canvas 2D supports: normal (source-over), multiply,
 * screen, overlay, darken, lighten, color-dodge, color-burn, hard-light,
 * soft-light, difference, exclusion, hue, saturation, color, luminosity.
 *
 * This module implements: vivid-light, linear-light, pin-light, hard-mix,
 * darker-color, lighter-color, subtract, divide, linear-burn, linear-dodge,
 * and dissolve.
 */

import type { BlendMode } from '@/types/document'

/** Blend modes that Canvas 2D handles natively via globalCompositeOperation. */
export const NATIVE_BLEND_MODES: Set<BlendMode> = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'color-dodge',
  'color-burn',
  'darken',
  'lighten',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
])

/** Blend modes requiring manual pixel blending. */
export const CUSTOM_BLEND_MODES: Set<BlendMode> = new Set([
  'vivid-light',
  'linear-light',
  'pin-light',
  'hard-mix',
  'darker-color',
  'lighter-color',
  'subtract',
  'divide',
  'linear-burn',
  'linear-dodge',
  'dissolve',
])

/** Returns true if the blend mode requires custom pixel blending. */
export function isCustomBlendMode(mode: BlendMode): boolean {
  return CUSTOM_BLEND_MODES.has(mode)
}

// --- Helper: clamp to 0-255 ---
function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

// --- Helper: luminance of an RGB pixel (BT.601) ---
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// --- Color Dodge per-channel (used by vivid-light) ---
function colorDodgeCh(base: number, blend: number): number {
  if (base === 0) return 0
  if (blend === 255) return 255
  return clamp((base * 255) / (255 - blend))
}

// --- Color Burn per-channel (used by vivid-light) ---
function colorBurnCh(base: number, blend: number): number {
  if (base === 255) return 255
  if (blend === 0) return 0
  return clamp(255 - ((255 - base) * 255) / blend)
}

/**
 * Blend a single pixel (base beneath blend) using a custom blend mode.
 * All values are 0-255. Returns [r, g, b, a].
 *
 * For dissolve mode, pass `dissolveRand` — a random number in [0,1)
 * generated per-pixel externally to allow deterministic testing.
 */
export function blendPixel(
  baseR: number,
  baseG: number,
  baseB: number,
  baseA: number,
  blendR: number,
  blendG: number,
  blendB: number,
  blendA: number,
  mode: BlendMode,
  dissolveRand?: number,
): [number, number, number, number] {
  // If blend pixel is fully transparent, result is base
  if (blendA === 0) return [baseR, baseG, baseB, baseA]

  const blendAlpha = blendA / 255

  let rr: number, rg: number, rb: number

  switch (mode) {
    case 'vivid-light': {
      // < 128: color-burn(base, 2*blend), >= 128: color-dodge(base, 2*(blend-128))
      rr = blendR <= 127 ? colorBurnCh(baseR, clamp(2 * blendR)) : colorDodgeCh(baseR, clamp(2 * (blendR - 128)))
      rg = blendG <= 127 ? colorBurnCh(baseG, clamp(2 * blendG)) : colorDodgeCh(baseG, clamp(2 * (blendG - 128)))
      rb = blendB <= 127 ? colorBurnCh(baseB, clamp(2 * blendB)) : colorDodgeCh(baseB, clamp(2 * (blendB - 128)))
      break
    }
    case 'linear-light': {
      // linear-burn when blend < 128, linear-dodge when >= 128
      // linear-burn: base + 2*blend - 255
      // linear-dodge: base + 2*(blend - 128)
      rr = blendR <= 127 ? clamp(baseR + 2 * blendR - 255) : clamp(baseR + 2 * (blendR - 128))
      rg = blendG <= 127 ? clamp(baseG + 2 * blendG - 255) : clamp(baseG + 2 * (blendG - 128))
      rb = blendB <= 127 ? clamp(baseB + 2 * blendB - 255) : clamp(baseB + 2 * (blendB - 128))
      break
    }
    case 'pin-light': {
      // < 128: darken(base, 2*blend), >= 128: lighten(base, 2*(blend-128))
      rr = blendR <= 127 ? Math.min(baseR, 2 * blendR) : Math.max(baseR, 2 * (blendR - 128))
      rg = blendG <= 127 ? Math.min(baseG, 2 * blendG) : Math.max(baseG, 2 * (blendG - 128))
      rb = blendB <= 127 ? Math.min(baseB, 2 * blendB) : Math.max(baseB, 2 * (blendB - 128))
      break
    }
    case 'hard-mix': {
      // threshold of vivid-light: each channel is 0 or 255
      const vr = blendR <= 127 ? colorBurnCh(baseR, clamp(2 * blendR)) : colorDodgeCh(baseR, clamp(2 * (blendR - 128)))
      const vg = blendG <= 127 ? colorBurnCh(baseG, clamp(2 * blendG)) : colorDodgeCh(baseG, clamp(2 * (blendG - 128)))
      const vb = blendB <= 127 ? colorBurnCh(baseB, clamp(2 * blendB)) : colorDodgeCh(baseB, clamp(2 * (blendB - 128)))
      rr = vr >= 128 ? 255 : 0
      rg = vg >= 128 ? 255 : 0
      rb = vb >= 128 ? 255 : 0
      break
    }
    case 'darker-color': {
      // Compare luminance; keep entire pixel that is darker
      const baseLum = luminance(baseR, baseG, baseB)
      const blendLum = luminance(blendR, blendG, blendB)
      if (blendLum < baseLum) {
        rr = blendR
        rg = blendG
        rb = blendB
      } else {
        rr = baseR
        rg = baseG
        rb = baseB
      }
      break
    }
    case 'lighter-color': {
      // Compare luminance; keep entire pixel that is lighter
      const baseLum2 = luminance(baseR, baseG, baseB)
      const blendLum2 = luminance(blendR, blendG, blendB)
      if (blendLum2 > baseLum2) {
        rr = blendR
        rg = blendG
        rb = blendB
      } else {
        rr = baseR
        rg = baseG
        rb = baseB
      }
      break
    }
    case 'subtract': {
      rr = clamp(baseR - blendR)
      rg = clamp(baseG - blendG)
      rb = clamp(baseB - blendB)
      break
    }
    case 'divide': {
      rr = blendR === 0 ? 255 : clamp((baseR / blendR) * 255)
      rg = blendG === 0 ? 255 : clamp((baseG / blendG) * 255)
      rb = blendB === 0 ? 255 : clamp((baseB / blendB) * 255)
      break
    }
    case 'linear-burn': {
      rr = clamp(baseR + blendR - 255)
      rg = clamp(baseG + blendG - 255)
      rb = clamp(baseB + blendB - 255)
      break
    }
    case 'linear-dodge': {
      rr = clamp(baseR + blendR)
      rg = clamp(baseG + blendG)
      rb = clamp(baseB + blendB)
      break
    }
    case 'dissolve': {
      // Random dither based on blend alpha: if rand < blendAlpha, show blend pixel; else show base
      const rand = dissolveRand ?? Math.random()
      if (rand < blendAlpha) {
        // Fully opaque blend pixel (dissolve replaces, doesn't interpolate)
        return [blendR, blendG, blendB, 255]
      } else {
        return [baseR, baseG, baseB, baseA]
      }
    }
    default:
      // Fallback: normal compositing
      rr = blendR
      rg = blendG
      rb = blendB
      break
  }

  // Alpha compositing: mix blended result with base using blend alpha
  const outR = clamp(baseR + (rr - baseR) * blendAlpha)
  const outG = clamp(baseG + (rg - baseG) * blendAlpha)
  const outB = clamp(baseB + (rb - baseB) * blendAlpha)
  const outA = clamp(baseA + blendA - (baseA * blendA) / 255)

  return [outR, outG, outB, outA]
}

/**
 * Composite two ImageData buffers using a custom blend mode.
 * `base` is the bottom layer; `blend` is the top layer.
 * The result is written into `base` in-place.
 */
export function compositeImageData(base: ImageData, blend: ImageData, mode: BlendMode, opacity: number = 1): void {
  const bd = base.data
  const td = blend.data
  const len = bd.length

  // Use a simple seeded PRNG for dissolve to give consistent results per-frame
  let dissolveState = 0x12345678
  function nextRand(): number {
    dissolveState ^= dissolveState << 13
    dissolveState ^= dissolveState >> 17
    dissolveState ^= dissolveState << 5
    return (dissolveState >>> 0) / 0x100000000
  }

  for (let i = 0; i < len; i += 4) {
    const baseR = bd[i]!
    const baseG = bd[i + 1]!
    const baseB = bd[i + 2]!
    const baseA = bd[i + 3]!
    // Apply layer opacity to blend alpha
    const blendA = Math.round(td[i + 3]! * opacity)
    const blendR = td[i]!
    const blendG = td[i + 1]!
    const blendB = td[i + 2]!

    const [r, g, b, a] = blendPixel(
      baseR,
      baseG,
      baseB,
      baseA,
      blendR,
      blendG,
      blendB,
      blendA,
      mode,
      mode === 'dissolve' ? nextRand() : undefined,
    )

    bd[i] = r
    bd[i + 1] = g
    bd[i + 2] = b
    bd[i + 3] = a
  }
}
