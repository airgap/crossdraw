import { describe, test, expect, beforeEach } from 'bun:test'
import type { BrushPreset } from '@/tools/brush-presets'
import {
  getBuiltInPresets,
  getCustomPresets,
  savePreset,
  deletePreset,
  getAllPresets,
  applyPreset,
  exportPresets,
  importPresets,
} from '@/tools/brush-presets'
import {
  computeScatterDabs,
  generateTexturePattern,
  applyTextureToDab,
  getScatterSettings,
  setScatterSettings,
  defaultScatterSettings,
  setSeed,
} from '@/tools/scatter-brush'
import type { ScatterBrushSettings, TexturePatternType } from '@/tools/scatter-brush'
import { getBrushSettings, setBrushSettings } from '@/tools/brush'

// ── Mock localStorage ──
const store: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
  removeItem: (k: string) => {
    delete store[k]
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k]
  },
}

beforeEach(() => {
  ;(globalThis as any).localStorage.clear()
  setScatterSettings({ ...defaultScatterSettings })
  setBrushSettings({ size: 10, hardness: 0.8, opacity: 1, flow: 1, color: '#000000', spacing: 0.25 })
  setSeed(42)
})

// ═══════════════════════════════════════════════════════════
// Task #27 — Brush Presets Library
// ═══════════════════════════════════════════════════════════

describe('Brush Presets Library', () => {
  test('getBuiltInPresets returns at least 12 presets', () => {
    const presets = getBuiltInPresets()
    expect(presets.length).toBeGreaterThanOrEqual(12)
  })

  test('built-in presets have required fields', () => {
    for (const p of getBuiltInPresets()) {
      expect(typeof p.id).toBe('string')
      expect(p.id.length).toBeGreaterThan(0)
      expect(typeof p.name).toBe('string')
      expect(['basic', 'artistic', 'texture', 'custom']).toContain(p.category)
      expect(typeof p.settings.size).toBe('number')
      expect(typeof p.settings.hardness).toBe('number')
      expect(typeof p.settings.opacity).toBe('number')
      expect(typeof p.settings.flow).toBe('number')
      expect(typeof p.settings.color).toBe('string')
      expect(typeof p.settings.spacing).toBe('number')
    }
  })

  test('built-in presets include expected names', () => {
    const names = getBuiltInPresets().map((p) => p.name)
    expect(names).toContain('Hard Round')
    expect(names).toContain('Soft Round')
    expect(names).toContain('Airbrush')
    expect(names).toContain('Chalk')
    expect(names).toContain('Charcoal')
    expect(names).toContain('Ink')
    expect(names).toContain('Watercolor')
  })

  test('built-in presets are deep copies (mutation safe)', () => {
    const a = getBuiltInPresets()
    const b = getBuiltInPresets()
    a[0]!.settings.size = 999
    expect(b[0]!.settings.size).not.toBe(999)
  })

  test('getCustomPresets returns empty array when no data', () => {
    expect(getCustomPresets()).toEqual([])
  })

  test('savePreset stores and retrieves custom preset', () => {
    const preset: BrushPreset = {
      id: 'custom-1',
      name: 'My Brush',
      category: 'custom',
      settings: {
        size: 42,
        hardness: 0.5,
        opacity: 0.8,
        flow: 0.6,
        color: '#ff0000',
        spacing: 0.3,
        ...defaultScatterSettings,
      },
    }
    savePreset(preset)
    const customs = getCustomPresets()
    expect(customs).toHaveLength(1)
    expect(customs[0]!.id).toBe('custom-1')
    expect(customs[0]!.name).toBe('My Brush')
    expect(customs[0]!.settings.size).toBe(42)
  })

  test('savePreset updates existing preset by id', () => {
    const p1: BrushPreset = {
      id: 'upd-1',
      name: 'Version 1',
      category: 'custom',
      settings: { size: 10, hardness: 1, opacity: 1, flow: 1, color: '#000', spacing: 0.25, ...defaultScatterSettings },
    }
    savePreset(p1)
    const p2 = { ...p1, name: 'Version 2', settings: { ...p1.settings, size: 50 } }
    savePreset(p2)
    const customs = getCustomPresets()
    expect(customs).toHaveLength(1)
    expect(customs[0]!.name).toBe('Version 2')
    expect(customs[0]!.settings.size).toBe(50)
  })

  test('deletePreset removes a custom preset', () => {
    const preset: BrushPreset = {
      id: 'del-1',
      name: 'To Delete',
      category: 'custom',
      settings: { size: 10, hardness: 1, opacity: 1, flow: 1, color: '#000', spacing: 0.25, ...defaultScatterSettings },
    }
    savePreset(preset)
    expect(getCustomPresets()).toHaveLength(1)
    deletePreset('del-1')
    expect(getCustomPresets()).toHaveLength(0)
  })

  test('deletePreset is a no-op for unknown id', () => {
    savePreset({
      id: 'keep',
      name: 'Keep',
      category: 'custom',
      settings: { size: 10, hardness: 1, opacity: 1, flow: 1, color: '#000', spacing: 0.25, ...defaultScatterSettings },
    })
    deletePreset('nonexistent')
    expect(getCustomPresets()).toHaveLength(1)
  })

  test('getAllPresets combines built-in and custom', () => {
    savePreset({
      id: 'cust-all',
      name: 'Custom',
      category: 'custom',
      settings: { size: 5, hardness: 0.5, opacity: 1, flow: 1, color: '#00f', spacing: 0.1, ...defaultScatterSettings },
    })
    const all = getAllPresets()
    expect(all.length).toBe(getBuiltInPresets().length + 1)
    expect(all.some((p) => p.id === 'cust-all')).toBe(true)
  })

  test('applyPreset updates brush and scatter settings', () => {
    const applied = applyPreset('builtin-chalk')
    expect(applied).toBe(true)
    const brush = getBrushSettings()
    expect(brush.size).toBe(18)
    const scatter = getScatterSettings()
    expect(scatter.sizeJitter).toBe(20)
    expect(scatter.textureEnabled).toBe(true)
  })

  test('applyPreset returns false for unknown id', () => {
    expect(applyPreset('nonexistent')).toBe(false)
  })

  test('exportPresets returns JSON string of custom presets', () => {
    savePreset({
      id: 'exp-1',
      name: 'Export Me',
      category: 'custom',
      settings: {
        size: 12,
        hardness: 0.5,
        opacity: 1,
        flow: 1,
        color: '#abc',
        spacing: 0.2,
        ...defaultScatterSettings,
      },
    })
    const json = exportPresets()
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe('exp-1')
  })

  test('importPresets adds presets from JSON', () => {
    const data = JSON.stringify([
      {
        id: 'imp-1',
        name: 'Imported',
        category: 'artistic',
        settings: { size: 30, hardness: 0.2, opacity: 0.9, flow: 0.5, color: '#fff', spacing: 0.15 },
      },
      {
        id: 'imp-2',
        name: 'Imported 2',
        category: 'basic',
        settings: { size: 5, hardness: 1, opacity: 1, flow: 1, color: '#000', spacing: 0.25 },
      },
    ])
    const count = importPresets(data)
    expect(count).toBe(2)
    const customs = getCustomPresets()
    expect(customs).toHaveLength(2)
    expect(customs[0]!.category).toBe('custom') // forced to custom
    expect(customs[0]!.name).toBe('Imported')
  })

  test('importPresets skips invalid entries', () => {
    const data = JSON.stringify([null, { broken: true }, { id: 'ok', name: 'OK', settings: { size: 5 } }])
    const count = importPresets(data)
    expect(count).toBe(1)
    expect(getCustomPresets()).toHaveLength(1)
  })

  test('importPresets throws on non-array input', () => {
    expect(() => importPresets('{"not":"array"}')).toThrow()
  })

  test('built-in presets include scatter settings', () => {
    const chalk = getBuiltInPresets().find((p) => p.name === 'Chalk')!
    expect(chalk.settings.scatterX).toBe(30)
    expect(chalk.settings.textureEnabled).toBe(true)
    expect(chalk.settings.texturePattern).toBe('canvas')
  })

  test('preset categories include basic, artistic, texture', () => {
    const cats = new Set(getBuiltInPresets().map((p) => p.category))
    expect(cats.has('basic')).toBe(true)
    expect(cats.has('artistic')).toBe(true)
    expect(cats.has('texture')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════
// Task #28 — Scatter / Texture / Dual Brush
// ═══════════════════════════════════════════════════════════

describe('Scatter Brush Settings', () => {
  test('default scatter settings are sensible', () => {
    const s = getScatterSettings()
    expect(s.scatterX).toBe(0)
    expect(s.scatterY).toBe(0)
    expect(s.count).toBe(1)
    expect(s.countJitter).toBe(0)
    expect(s.sizeJitter).toBe(0)
    expect(s.angleJitter).toBe(0)
    expect(s.roundnessJitter).toBe(0)
    expect(s.textureEnabled).toBe(false)
    expect(s.texturePattern).toBe('noise')
    expect(s.textureScale).toBe(100)
    expect(s.textureDepth).toBe(50)
    expect(s.dualBrushEnabled).toBe(false)
    expect(s.dualBrushSize).toBe(10)
    expect(s.dualBrushSpacing).toBe(0.25)
    expect(s.dualBrushScatter).toBe(0)
  })

  test('setScatterSettings updates and getScatterSettings reflects', () => {
    setScatterSettings({ scatterX: 150, count: 4, sizeJitter: 50 })
    const s = getScatterSettings()
    expect(s.scatterX).toBe(150)
    expect(s.count).toBe(4)
    expect(s.sizeJitter).toBe(50)
    // Unchanged values preserved
    expect(s.scatterY).toBe(0)
  })

  test('getScatterSettings returns a copy', () => {
    const a = getScatterSettings()
    a.scatterX = 999
    expect(getScatterSettings().scatterX).not.toBe(999)
  })
})

describe('computeScatterDabs', () => {
  test('returns exactly 1 dab with default settings', () => {
    const dabs = computeScatterDabs(100, 200, defaultScatterSettings)
    expect(dabs).toHaveLength(1)
    // With zero scatter, position should be the input
    expect(dabs[0]!.x).toBe(100)
    expect(dabs[0]!.y).toBe(200)
  })

  test('count parameter increases number of dabs', () => {
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 5 }
    const dabs = computeScatterDabs(0, 0, settings)
    expect(dabs).toHaveLength(5)
  })

  test('scatter offsets dab positions', () => {
    setSeed(123)
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, scatterX: 200, scatterY: 200 }
    const dabs = computeScatterDabs(100, 100, settings, 20)
    // At least one dab should be offset from center
    const offCenter = dabs.some((d) => Math.abs(d.x - 100) > 0.01 || Math.abs(d.y - 100) > 0.01)
    expect(offCenter).toBe(true)
  })

  test('sizeJitter varies dab sizes', () => {
    setSeed(99)
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 10, sizeJitter: 80 }
    const dabs = computeScatterDabs(0, 0, settings)
    const sizes = dabs.map((d) => d.size)
    const uniqueSizes = new Set(sizes.map((s) => s.toFixed(4)))
    expect(uniqueSizes.size).toBeGreaterThan(1)
  })

  test('angleJitter varies dab angles', () => {
    setSeed(77)
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 8, angleJitter: 180 }
    const dabs = computeScatterDabs(0, 0, settings)
    const angles = dabs.map((d) => d.angle)
    const uniqueAngles = new Set(angles.map((a) => a.toFixed(4)))
    expect(uniqueAngles.size).toBeGreaterThan(1)
  })

  test('roundnessJitter varies dab roundness', () => {
    setSeed(55)
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 8, roundnessJitter: 80 }
    const dabs = computeScatterDabs(0, 0, settings)
    const roundnesses = dabs.map((d) => d.roundness)
    // All should be in valid range
    for (const r of roundnesses) {
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
    const unique = new Set(roundnesses.map((r) => r.toFixed(4)))
    expect(unique.size).toBeGreaterThan(1)
  })

  test('countJitter varies actual count around base', () => {
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 8, countJitter: 100 }
    const counts: number[] = []
    for (let i = 0; i < 20; i++) {
      setSeed(i + 1)
      counts.push(computeScatterDabs(0, 0, settings).length)
    }
    const unique = new Set(counts)
    // With 100% jitter on count=8, we should see some variation
    expect(unique.size).toBeGreaterThan(1)
    // All counts should be >= 1
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(1)
    }
  })

  test('dab sizes are always positive', () => {
    setSeed(1)
    const settings: ScatterBrushSettings = { ...defaultScatterSettings, count: 16, sizeJitter: 100 }
    const dabs = computeScatterDabs(0, 0, settings)
    for (const d of dabs) {
      expect(d.size).toBeGreaterThan(0)
    }
  })
})

describe('generateTexturePattern', () => {
  const types: TexturePatternType[] = ['noise', 'canvas', 'burlap', 'brick', 'crosshatch']

  for (const type of types) {
    test(`generates ${type} pattern of correct size`, () => {
      setSeed(42)
      const w = 32
      const h = 32
      const buf = generateTexturePattern(type, w, h, 100)
      expect(buf).toBeInstanceOf(Float32Array)
      expect(buf.length).toBe(w * h)
    })

    test(`${type} pattern values are in [0, 1]`, () => {
      setSeed(42)
      const buf = generateTexturePattern(type, 16, 16, 100)
      for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBeGreaterThanOrEqual(0)
        expect(buf[i]).toBeLessThanOrEqual(1)
      }
    })
  }

  test('noise pattern has variation', () => {
    setSeed(42)
    const buf = generateTexturePattern('noise', 32, 32, 100)
    const unique = new Set<number>()
    for (let i = 0; i < buf.length; i++) unique.add(Math.round(buf[i]! * 1000))
    expect(unique.size).toBeGreaterThan(10)
  })

  test('scale parameter affects canvas pattern', () => {
    setSeed(42)
    const small = generateTexturePattern('canvas', 64, 64, 50)
    setSeed(42)
    const large = generateTexturePattern('canvas', 64, 64, 200)
    // Different scales should produce different patterns
    let diffs = 0
    for (let i = 0; i < small.length; i++) {
      if (Math.abs(small[i]! - large[i]!) > 0.01) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })

  test('handles minimum dimensions', () => {
    setSeed(42)
    const buf = generateTexturePattern('brick', 1, 1, 100)
    expect(buf.length).toBe(1)
  })
})

describe('applyTextureToDab', () => {
  test('depth=0 returns original dab mask unchanged', () => {
    const dab = new Float32Array([0.5, 0.8, 1.0, 0.0])
    const tex = new Float32Array([0.1, 0.2, 0.3, 0.4])
    const result = applyTextureToDab(dab, tex, 0)
    for (let i = 0; i < dab.length; i++) {
      expect(Math.abs(result[i]! - dab[i]!)).toBeLessThan(0.001)
    }
  })

  test('depth=100 multiplies dab by texture', () => {
    const dab = new Float32Array([1.0, 0.5, 0.8])
    const tex = new Float32Array([0.5, 1.0, 0.25])
    const result = applyTextureToDab(dab, tex, 100)
    expect(Math.abs(result[0]! - 0.5)).toBeLessThan(0.001) // 1.0 * 0.5
    expect(Math.abs(result[1]! - 0.5)).toBeLessThan(0.001) // 0.5 * 1.0
    expect(Math.abs(result[2]! - 0.2)).toBeLessThan(0.001) // 0.8 * 0.25
  })

  test('depth=50 blends between original and textured', () => {
    const dab = new Float32Array([1.0])
    const tex = new Float32Array([0.0])
    const result = applyTextureToDab(dab, tex, 50)
    // 1.0 * (1 - 0.5 + 0.5 * 0.0) = 1.0 * 0.5 = 0.5
    expect(Math.abs(result[0]! - 0.5)).toBeLessThan(0.001)
  })

  test('handles mismatched lengths (uses shorter)', () => {
    const dab = new Float32Array([1.0, 0.5, 0.3])
    const tex = new Float32Array([0.5, 1.0])
    const result = applyTextureToDab(dab, tex, 100)
    expect(result.length).toBe(2) // min(3, 2)
  })

  test('depth is clamped to 0-100', () => {
    const dab = new Float32Array([1.0])
    const tex = new Float32Array([0.5])
    const over = applyTextureToDab(dab, tex, 200)
    const under = applyTextureToDab(dab, tex, -50)
    // Clamped to 100 → 1.0 * 0.5 = 0.5
    expect(Math.abs(over[0]! - 0.5)).toBeLessThan(0.001)
    // Clamped to 0 → 1.0
    expect(Math.abs(under[0]! - 1.0)).toBeLessThan(0.001)
  })
})

describe('Dual Brush settings', () => {
  test('dual brush settings are part of scatter config', () => {
    setScatterSettings({
      dualBrushEnabled: true,
      dualBrushSize: 30,
      dualBrushSpacing: 0.5,
      dualBrushScatter: 100,
    })
    const s = getScatterSettings()
    expect(s.dualBrushEnabled).toBe(true)
    expect(s.dualBrushSize).toBe(30)
    expect(s.dualBrushSpacing).toBe(0.5)
    expect(s.dualBrushScatter).toBe(100)
  })
})

describe('Integration: presets with scatter', () => {
  test('spatter preset has high scatter and multi-count', () => {
    const spatter = getBuiltInPresets().find((p) => p.name === 'Spatter')!
    expect(spatter).toBeDefined()
    expect(spatter.settings.scatterX).toBeGreaterThanOrEqual(100)
    expect(spatter.settings.count).toBeGreaterThan(1)
  })

  test('applying a scatter-heavy preset then computing dabs produces scattered results', () => {
    setSeed(42)
    applyPreset('builtin-spatter')
    const scatter = getScatterSettings()
    const brush = getBrushSettings()
    const dabs = computeScatterDabs(50, 50, scatter, brush.size)
    expect(dabs.length).toBeGreaterThan(1)
    // With high scatter, not all dabs should be at (50,50)
    const offCenter = dabs.filter((d) => Math.abs(d.x - 50) > 1 || Math.abs(d.y - 50) > 1)
    expect(offCenter.length).toBeGreaterThan(0)
  })

  test('round-trip export/import preserves scatter settings', () => {
    const preset: BrushPreset = {
      id: 'scatter-rt',
      name: 'Scatter RT',
      category: 'custom',
      settings: {
        size: 20,
        hardness: 0.5,
        opacity: 1,
        flow: 1,
        color: '#000',
        spacing: 0.25,
        ...defaultScatterSettings,
        scatterX: 300,
        sizeJitter: 75,
        textureEnabled: true,
        texturePattern: 'burlap',
        textureDepth: 80,
      },
    }
    savePreset(preset)
    const json = exportPresets()
    ;(globalThis as any).localStorage.clear()
    importPresets(json)
    const loaded = getCustomPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.settings.scatterX).toBe(300)
    expect(loaded[0]!.settings.sizeJitter).toBe(75)
    expect(loaded[0]!.settings.texturePattern).toBe('burlap')
  })
})
