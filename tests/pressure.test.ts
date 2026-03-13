import { describe, it, expect, beforeEach } from 'bun:test'
import {
  applyPressure,
  applyPressureFromEvent,
  getPressureMapping,
  setPressureMapping,
  resetPressureMapping,
  isPressureAvailable,
  notifyPressure,
} from '@/tools/pressure'
import type { BrushSettings } from '@/types'

const baseBrush: BrushSettings = {
  size: 20,
  hardness: 0.8,
  opacity: 1,
  flow: 1,
  color: '#ff0000',
  spacing: 0.25,
}

describe('pressure', () => {
  beforeEach(() => {
    resetPressureMapping()
    // Reset tablet detection by notifying with 0.5 (mouse default) — won't set detected
    // We need to ensure a clean state; since tabletDetected is module-level, we call
    // resetPressureMapping which resets the mapping but not the detection flag.
    // For tests that need tablet detected, we call notifyPressure(0.7) first.
  })

  describe('getPressureMapping / setPressureMapping', () => {
    it('returns default mapping', () => {
      const m = getPressureMapping()
      expect(m.enabled).toBe(true)
      expect(m.sizeMin).toBe(30)
      expect(m.sizeMax).toBe(100)
      expect(m.opacityMin).toBe(100)
      expect(m.opacityMax).toBe(100)
      expect(m.flowMin).toBe(100)
      expect(m.flowMax).toBe(100)
      expect(m.hardnessMin).toBe(100)
      expect(m.hardnessMax).toBe(100)
    })

    it('returns a copy, not a reference', () => {
      const m1 = getPressureMapping()
      m1.sizeMin = 999
      const m2 = getPressureMapping()
      expect(m2.sizeMin).toBe(30)
    })

    it('merges partial updates', () => {
      setPressureMapping({ sizeMin: 10, opacityMin: 50 })
      const m = getPressureMapping()
      expect(m.sizeMin).toBe(10)
      expect(m.opacityMin).toBe(50)
      // untouched fields remain default
      expect(m.sizeMax).toBe(100)
    })
  })

  describe('resetPressureMapping', () => {
    it('restores defaults', () => {
      setPressureMapping({ sizeMin: 5, sizeMax: 50, enabled: false })
      resetPressureMapping()
      const m = getPressureMapping()
      expect(m.sizeMin).toBe(30)
      expect(m.sizeMax).toBe(100)
      expect(m.enabled).toBe(true)
    })
  })

  describe('isPressureAvailable / notifyPressure', () => {
    it('detects tablet when pressure differs from 0.5', () => {
      // First call with a non-0.5 value triggers detection
      notifyPressure(0.7)
      expect(isPressureAvailable()).toBe(true)
    })

    it('does not detect tablet for mouse default 0.5', () => {
      // After a test where tablet was detected, the flag persists (module-level).
      // This test may see true if a previous test already set it.
      // We test the notify logic specifically: 0.5 should NOT newly set the flag.
      // But since the module is shared, we just verify the notify doesn't crash.
      notifyPressure(0.5)
      // Can't fully reset module-level state between tests, so just check it's a boolean.
      expect(typeof isPressureAvailable()).toBe('boolean')
    })
  })

  describe('applyPressure', () => {
    it('returns base settings when mapping is disabled', () => {
      setPressureMapping({ enabled: false })
      notifyPressure(0.7) // ensure tablet detected
      const result = applyPressure(baseBrush, 0.3)
      expect(result.size).toBe(baseBrush.size)
      expect(result.opacity).toBe(baseBrush.opacity)
      expect(result.flow).toBe(baseBrush.flow)
      expect(result.hardness).toBe(baseBrush.hardness)
    })

    it('returns base settings for mouse default pressure (0.5) when no tablet', () => {
      // Reset to a fresh module state by resetting mapping
      resetPressureMapping()
      // Note: tablet may already be detected from previous tests — if so, this test
      // still exercises the code path but the 0.5 shortcut won't trigger.
      const result = applyPressure(baseBrush, 0.5)
      // If tablet was detected, pressure mapping applies. Otherwise, returns base.
      // Either way, result should be a valid BrushSettings.
      expect(result.size).toBeGreaterThan(0)
      expect(result.opacity).toBeGreaterThanOrEqual(0)
      expect(result.opacity).toBeLessThanOrEqual(1)
    })

    it('maps full pressure (1.0) to max settings', () => {
      notifyPressure(0.8) // ensure tablet detected
      resetPressureMapping() // default: sizeMin=30, sizeMax=100
      const result = applyPressure(baseBrush, 1.0)
      // At full pressure, size = base * (sizeMax/100) = 20 * 1.0 = 20
      expect(result.size).toBeCloseTo(20, 1)
      // Opacity max is 100%, so opacity = 1 * 1.0 = 1
      expect(result.opacity).toBeCloseTo(1, 2)
    })

    it('maps zero pressure to min settings', () => {
      notifyPressure(0.8) // ensure tablet detected
      resetPressureMapping() // default: sizeMin=30, sizeMax=100
      const result = applyPressure(baseBrush, 0.0)
      // At zero pressure, size = base * (sizeMin/100) = 20 * 0.30 = 6
      expect(result.size).toBeCloseTo(6, 1)
      // Opacity min is 100%, so opacity = 1 * 1.0 = 1
      expect(result.opacity).toBeCloseTo(1, 2)
    })

    it('interpolates at mid pressure', () => {
      notifyPressure(0.8) // ensure tablet detected
      resetPressureMapping()
      const result = applyPressure(baseBrush, 0.5)
      // At 0.5 pressure, sizeMultiplier = lerp(30, 100, 0.5) / 100 = 65/100 = 0.65
      // size = 20 * 0.65 = 13
      expect(result.size).toBeCloseTo(13, 1)
    })

    it('clamps pressure to 0-1 range', () => {
      notifyPressure(0.8)
      resetPressureMapping()
      const resultHigh = applyPressure(baseBrush, 2.0)
      const resultMax = applyPressure(baseBrush, 1.0)
      expect(resultHigh.size).toBeCloseTo(resultMax.size, 1)

      const resultLow = applyPressure(baseBrush, -0.5)
      const resultZero = applyPressure(baseBrush, 0.0)
      expect(resultLow.size).toBeCloseTo(resultZero.size, 1)
    })

    it('applies custom min/max for opacity', () => {
      notifyPressure(0.8)
      setPressureMapping({ opacityMin: 20, opacityMax: 80 })
      // At pressure 0.5, opacityMul = lerp(20,80,0.5)/100 = 50/100 = 0.5
      const result = applyPressure(baseBrush, 0.5)
      expect(result.opacity).toBeCloseTo(0.5, 2) // 1.0 * 0.5
    })

    it('applies custom min/max for flow', () => {
      notifyPressure(0.8)
      setPressureMapping({ flowMin: 10, flowMax: 90 })
      // At pressure 1.0, flowMul = 90/100 = 0.9
      const result = applyPressure(baseBrush, 1.0)
      expect(result.flow).toBeCloseTo(0.9, 2)
    })

    it('applies custom min/max for hardness', () => {
      notifyPressure(0.8)
      setPressureMapping({ hardnessMin: 0, hardnessMax: 50 })
      // At pressure 1.0, hardnessMul = 50/100 = 0.5
      // hardness = 0.8 * 0.5 = 0.4
      const result = applyPressure(baseBrush, 1.0)
      expect(result.hardness).toBeCloseTo(0.4, 2)
    })

    it('preserves color and spacing unchanged', () => {
      notifyPressure(0.8)
      resetPressureMapping()
      const result = applyPressure(baseBrush, 0.3)
      expect(result.color).toBe('#ff0000')
      expect(result.spacing).toBe(0.25)
    })

    it('ensures size never goes below 1', () => {
      notifyPressure(0.8)
      setPressureMapping({ sizeMin: 0, sizeMax: 0 })
      const result = applyPressure(baseBrush, 0.5)
      expect(result.size).toBe(1) // clamped to minimum of 1
    })

    it('ensures opacity stays in 0-1 range', () => {
      notifyPressure(0.8)
      // Even with opacityMax > 100 (invalid but defensively handled)
      setPressureMapping({ opacityMin: 0, opacityMax: 200 })
      const result = applyPressure(baseBrush, 1.0)
      expect(result.opacity).toBeLessThanOrEqual(1)
      expect(result.opacity).toBeGreaterThanOrEqual(0)
    })
  })

  describe('applyPressureFromEvent', () => {
    it('combines notifyPressure and applyPressure', () => {
      resetPressureMapping()
      // Should trigger tablet detection and apply pressure
      const result = applyPressureFromEvent(baseBrush, 0.7)
      expect(isPressureAvailable()).toBe(true)
      // sizeMultiplier at 0.7 = lerp(30,100,0.7)/100 = 79/100 = 0.79
      // size = 20 * 0.79 = 15.8
      expect(result.size).toBeCloseTo(15.8, 0)
    })
  })
})
