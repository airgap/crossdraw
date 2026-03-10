import { describe, it, expect } from 'bun:test'
import { simplex2D, perlin2D, cellular2D, generateNoiseFill } from '@/render/noise-fill'
import type { NoiseFillParams } from '@/render/noise-fill'

// ── Helper: build a seeded permutation table ──

function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildPermutation(rng: () => number): Uint8Array {
  const perm = new Uint8Array(512)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = base[i]!
    base[i] = base[j]!
    base[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!
  return perm
}

function makeParams(overrides: Partial<NoiseFillParams> = {}): NoiseFillParams {
  return {
    noiseType: 'simplex',
    scale: 50,
    octaves: 4,
    persistence: 0.5,
    seed: 42,
    color1: '#000000',
    color2: '#ffffff',
    opacity: 1,
    ...overrides,
  }
}

describe('simplex2D', () => {
  it('returns values in [-1, 1] range', () => {
    const perm = buildPermutation(mulberry32(42))
    for (let i = 0; i < 1000; i++) {
      const x = (mulberry32(i)() - 0.5) * 200
      const y = (mulberry32(i + 1000)() - 0.5) * 200
      const val = simplex2D(x, y, perm)
      expect(val).toBeGreaterThanOrEqual(-1)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic (same inputs = same output)', () => {
    const perm = buildPermutation(mulberry32(42))
    const a = simplex2D(1.5, 2.3, perm)
    const b = simplex2D(1.5, 2.3, perm)
    expect(a).toBe(b)
  })
})

describe('perlin2D', () => {
  it('returns values in approximately [-1, 1] range', () => {
    const perm = buildPermutation(mulberry32(99))
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < 1000; i++) {
      const rng = mulberry32(i)
      const x = (rng() - 0.5) * 200
      const y = (rng() - 0.5) * 200
      const val = perlin2D(x, y, perm)
      if (val < min) min = val
      if (val > max) max = val
    }
    expect(min).toBeGreaterThanOrEqual(-1.5)
    expect(max).toBeLessThanOrEqual(1.5)
  })
})

describe('cellular2D', () => {
  it('returns values in [0, 1] range', () => {
    const perm = buildPermutation(mulberry32(77))
    const rng = mulberry32(77)
    for (let i = 0; i < 500; i++) {
      const x = rng() * 50
      const y = rng() * 50
      const val = cellular2D(x, y, perm, mulberry32(77))
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  it('returns non-uniform values (not all the same)', () => {
    const perm = buildPermutation(mulberry32(77))
    const values = new Set<number>()
    for (let i = 0; i < 100; i++) {
      const val = cellular2D(i * 0.3, i * 0.7, perm, mulberry32(77))
      values.add(Math.round(val * 100))
    }
    expect(values.size).toBeGreaterThan(1)
  })
})

describe('generateNoiseFill', () => {
  it('produces valid ImageData with correct dimensions', () => {
    const result = generateNoiseFill(16, 16, makeParams())
    expect(result.width).toBe(16)
    expect(result.height).toBe(16)
    expect(result.data.length).toBe(16 * 16 * 4)
  })

  it('seeded reproducibility: same seed = same output', () => {
    const a = generateNoiseFill(8, 8, makeParams({ seed: 123 }))
    const b = generateNoiseFill(8, 8, makeParams({ seed: 123 }))
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('different seeds produce different output', () => {
    const a = generateNoiseFill(8, 8, makeParams({ seed: 1 }))
    const b = generateNoiseFill(8, 8, makeParams({ seed: 2 }))
    let diff = 0
    for (let i = 0; i < a.data.length; i++) {
      if (a.data[i] !== b.data[i]) diff++
    }
    expect(diff).toBeGreaterThan(0)
  })

  it('generates simplex noise', () => {
    const result = generateNoiseFill(32, 32, makeParams({ noiseType: 'simplex' }))
    // Should have variation (not all same pixel)
    const uniqueR = new Set<number>()
    for (let i = 0; i < result.data.length; i += 4) {
      uniqueR.add(result.data[i]!)
    }
    expect(uniqueR.size).toBeGreaterThan(1)
  })

  it('generates perlin noise', () => {
    const result = generateNoiseFill(32, 32, makeParams({ noiseType: 'perlin' }))
    const uniqueR = new Set<number>()
    for (let i = 0; i < result.data.length; i += 4) {
      uniqueR.add(result.data[i]!)
    }
    expect(uniqueR.size).toBeGreaterThan(1)
  })

  it('generates cellular noise', () => {
    const result = generateNoiseFill(32, 32, makeParams({ noiseType: 'cellular' }))
    const uniqueR = new Set<number>()
    for (let i = 0; i < result.data.length; i += 4) {
      uniqueR.add(result.data[i]!)
    }
    expect(uniqueR.size).toBeGreaterThan(1)
  })

  it('generates white noise', () => {
    const result = generateNoiseFill(32, 32, makeParams({ noiseType: 'white' }))
    const uniqueR = new Set<number>()
    for (let i = 0; i < result.data.length; i += 4) {
      uniqueR.add(result.data[i]!)
    }
    // White noise should produce many unique values
    expect(uniqueR.size).toBeGreaterThan(10)
  })

  it('octave layering: different octave counts produce different output', () => {
    const low = generateNoiseFill(64, 64, makeParams({ octaves: 1, seed: 42 }))
    const high = generateNoiseFill(64, 64, makeParams({ octaves: 6, seed: 42 }))

    // Different octave counts should produce different pixel data
    let diff = 0
    for (let i = 0; i < low.data.length; i += 4) {
      if (low.data[i] !== high.data[i]) diff++
    }
    expect(diff).toBeGreaterThan(0)

    // Both should still have meaningful variation (not flat)
    const uniqueLow = new Set<number>()
    const uniqueHigh = new Set<number>()
    for (let i = 0; i < low.data.length; i += 4) {
      uniqueLow.add(low.data[i]!)
      uniqueHigh.add(high.data[i]!)
    }
    expect(uniqueLow.size).toBeGreaterThan(10)
    expect(uniqueHigh.size).toBeGreaterThan(10)
  })

  it('color interpolation between color1 and color2', () => {
    const result = generateNoiseFill(32, 32, makeParams({
      color1: '#ff0000',
      color2: '#0000ff',
      noiseType: 'simplex',
    }))

    // Check that pixels have color values: R channel from 0-255 (red), B from 0-255 (blue)
    // and G channel should stay near 0 (neither red nor blue contribute to green)
    let hasRed = false
    let hasBlue = false
    for (let i = 0; i < result.data.length; i += 4) {
      const r = result.data[i]!
      const b = result.data[i + 2]!
      const g = result.data[i + 1]!
      if (r > 100) hasRed = true
      if (b > 100) hasBlue = true
      // Green channel should be 0 (interpolating between pure red and pure blue)
      expect(g).toBe(0)
    }
    expect(hasRed).toBe(true)
    expect(hasBlue).toBe(true)
  })

  it('respects opacity parameter', () => {
    const full = generateNoiseFill(8, 8, makeParams({ opacity: 1, seed: 42 }))
    const half = generateNoiseFill(8, 8, makeParams({ opacity: 0.5, seed: 42 }))

    // All alpha channels in full should be 255
    for (let i = 3; i < full.data.length; i += 4) {
      expect(full.data[i]).toBe(255)
    }
    // All alpha channels in half should be ~128
    for (let i = 3; i < half.data.length; i += 4) {
      expect(half.data[i]).toBe(128)
    }
  })

  it('produces non-zero dimensions correctly', () => {
    const result = generateNoiseFill(1, 1, makeParams())
    expect(result.width).toBe(1)
    expect(result.height).toBe(1)
    expect(result.data.length).toBe(4)
  })
})
