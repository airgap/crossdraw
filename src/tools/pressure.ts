/**
 * Pressure sensitivity / brush dynamics module.
 *
 * Maps tablet/stylus pressure (0-1) to brush parameter ranges (size, opacity,
 * flow, hardness). Sits between pointer events and painting tools so that
 * brush.ts / eraser.ts themselves don't need to know about pressure hardware.
 */

import type { BrushSettings } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PressureMapping {
  /** Minimum size at zero pressure (0-100 % of base size) */
  sizeMin: number
  /** Maximum size at full pressure (0-100 % of base size) */
  sizeMax: number
  /** Minimum opacity at zero pressure (0-100 %) */
  opacityMin: number
  /** Maximum opacity at full pressure (0-100 %) */
  opacityMax: number
  /** Minimum flow at zero pressure (0-100 %) */
  flowMin: number
  /** Maximum flow at full pressure (0-100 %) */
  flowMax: number
  /** Minimum hardness at zero pressure (0-100 %) */
  hardnessMin: number
  /** Maximum hardness at full pressure (0-100 %) */
  hardnessMax: number
  /** Whether pressure mapping is enabled at all */
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Defaults & state
// ---------------------------------------------------------------------------

const defaultMapping: PressureMapping = {
  sizeMin: 30,
  sizeMax: 100,
  opacityMin: 100,
  opacityMax: 100,
  flowMin: 100,
  flowMax: 100,
  hardnessMin: 100,
  hardnessMax: 100,
  enabled: true,
}

let currentMapping: PressureMapping = { ...defaultMapping }

/**
 * Whether a real pressure-capable device has been detected this session.
 * Set to true the first time we see a pressure value that is not the mouse
 * default of 0.5.
 */
let tabletDetected = false

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return a copy of the active pressure mapping. */
export function getPressureMapping(): PressureMapping {
  return { ...currentMapping }
}

/** Merge partial settings into the active pressure mapping. */
export function setPressureMapping(patch: Partial<PressureMapping>) {
  Object.assign(currentMapping, patch)
}

/** Reset pressure mapping to defaults. */
export function resetPressureMapping() {
  currentMapping = { ...defaultMapping }
}

/**
 * Report whether real pressure hardware has been detected this session.
 *
 * Mouse events always report pressure = 0.5 (the PointerEvent spec default for
 * devices that do not support pressure). We only consider pressure meaningful
 * when we see a value other than exactly 0.5.
 */
export function isPressureAvailable(): boolean {
  return tabletDetected
}

/**
 * Notify the module that a new raw pressure value was observed from a pointer
 * event. Call this from the viewport whenever you read `event.pressure`.
 */
export function notifyPressure(rawPressure: number) {
  if (!tabletDetected && rawPressure !== 0.5 && rawPressure !== 0) {
    tabletDetected = true
  }
}

/**
 * Given the user's base brush settings and a raw pressure value (0-1),
 * return effective brush settings with pressure mapping applied.
 *
 * When pressure mapping is disabled, or when no tablet is detected and the
 * pressure value is the mouse default (0.5), the base settings are returned
 * unchanged.
 */
export function applyPressure(base: BrushSettings, pressure: number): BrushSettings {
  const p = Math.max(0, Math.min(1, pressure))

  if (!currentMapping.enabled) {
    return base
  }

  // Mouse sends 0.5 as default. If no tablet detected, don't alter settings.
  if (!tabletDetected && p === 0.5) {
    return base
  }

  const lerp = (min: number, max: number) => min + (max - min) * p

  // min/max values are percentages (0-100), so divide by 100 to get a multiplier
  const sizeMul = lerp(currentMapping.sizeMin, currentMapping.sizeMax) / 100
  const opacityMul = lerp(currentMapping.opacityMin, currentMapping.opacityMax) / 100
  const flowMul = lerp(currentMapping.flowMin, currentMapping.flowMax) / 100
  const hardnessMul = lerp(currentMapping.hardnessMin, currentMapping.hardnessMax) / 100

  return {
    ...base,
    size: Math.max(1, base.size * sizeMul),
    opacity: Math.max(0, Math.min(1, base.opacity * opacityMul)),
    flow: Math.max(0, Math.min(1, base.flow * flowMul)),
    hardness: Math.max(0, Math.min(1, base.hardness * hardnessMul)),
  }
}

/**
 * Convenience: combine `notifyPressure` + `applyPressure` in one call.
 * Typically called from the viewport right before painting.
 */
export function applyPressureFromEvent(base: BrushSettings, rawPressure: number): BrushSettings {
  notifyPressure(rawPressure)
  return applyPressure(base, rawPressure)
}
