import { describe, it, expect } from 'bun:test'
import { applyDithering } from '@/effects/dithering'
import type { DitheringConfig } from '@/types'

function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeConfig(overrides: Partial<DitheringConfig> = {}): DitheringConfig {
  return {
    enabled: true,
    algorithm: 'floyd-steinberg',
    strength: 0.5,
    seed: 0,
    ...overrides,
  }
}

describe('applyDithering', () => {
  it('does nothing when disabled', () => {
    const img = makeImageData([128, 128, 128, 255, 128, 128, 128, 255], 2, 1)
    const original = new Uint8ClampedArray(img.data)
    applyDithering(img, makeConfig({ enabled: false }))
    expect(Array.from(img.data)).toEqual(Array.from(original))
  })

  it('does nothing when algorithm is none', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const original = new Uint8ClampedArray(img.data)
    applyDithering(img, makeConfig({ algorithm: 'none' }))
    expect(Array.from(img.data)).toEqual(Array.from(original))
  })

  it('does nothing when strength is 0', () => {
    const img = makeImageData([128, 128, 128, 255], 1, 1)
    const original = new Uint8ClampedArray(img.data)
    applyDithering(img, makeConfig({ strength: 0 }))
    expect(Array.from(img.data)).toEqual(Array.from(original))
  })

  it('bayer modifies pixel values', () => {
    // 4x4 image of solid grey
    const pixels: number[] = []
    for (let i = 0; i < 16; i++) pixels.push(128, 128, 128, 255)
    const img = makeImageData(pixels, 4, 4)
    applyDithering(img, makeConfig({ algorithm: 'bayer', strength: 1 }))

    // At least some pixels should be changed
    let changed = 0
    for (let i = 0; i < 16; i++) {
      if (img.data[i * 4] !== 128) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('bayer preserves alpha channel', () => {
    const img = makeImageData([128, 128, 128, 200], 1, 1)
    applyDithering(img, makeConfig({ algorithm: 'bayer', strength: 0.5 }))
    expect(img.data[3]).toBe(200)
  })

  it('floyd-steinberg modifies pixel values', () => {
    // Use a gradient of values that will definitely get quantized
    const pixels: number[] = []
    for (let i = 0; i < 16; i++) pixels.push(100 + i * 3, 50 + i * 5, 200 - i * 4, 255)
    const img = makeImageData(pixels, 4, 4)
    const original = new Uint8ClampedArray(img.data)
    applyDithering(img, makeConfig({ algorithm: 'floyd-steinberg', strength: 1 }))

    // At least some pixels should differ from original
    let changed = 0
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] !== original[i]) changed++
    }
    expect(changed).toBeGreaterThan(0)
  })

  it('atkinson produces different result than floyd-steinberg', () => {
    const makeGrey = () => {
      const p: number[] = []
      for (let i = 0; i < 16; i++) p.push(100, 100, 100, 255)
      return makeImageData(p, 4, 4)
    }

    const fs = makeGrey()
    applyDithering(fs, makeConfig({ algorithm: 'floyd-steinberg', strength: 1 }))

    const atk = makeGrey()
    applyDithering(atk, makeConfig({ algorithm: 'atkinson', strength: 1 }))

    // They should produce different results
    let same = true
    for (let i = 0; i < fs.data.length; i++) {
      if (fs.data[i] !== atk.data[i]) { same = false; break }
    }
    expect(same).toBe(false)
  })

  it('jarvis works without error', () => {
    const pixels: number[] = []
    for (let i = 0; i < 4; i++) pixels.push(80, 160, 240, 255)
    const img = makeImageData(pixels, 2, 2)
    applyDithering(img, makeConfig({ algorithm: 'jarvis', strength: 0.5 }))
    // Just check it doesn't throw and values are in range
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }
  })

  it('stucki works without error', () => {
    const pixels: number[] = []
    for (let i = 0; i < 4; i++) pixels.push(80, 160, 240, 255)
    const img = makeImageData(pixels, 2, 2)
    applyDithering(img, makeConfig({ algorithm: 'stucki', strength: 0.5 }))
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBeGreaterThanOrEqual(0)
      expect(img.data[i]).toBeLessThanOrEqual(255)
    }
  })

  it('bayer is deterministic with same seed', () => {
    const make = () => {
      const p: number[] = []
      for (let i = 0; i < 16; i++) p.push(128, 128, 128, 255)
      return makeImageData(p, 4, 4)
    }

    const a = make()
    applyDithering(a, makeConfig({ algorithm: 'bayer', strength: 1, seed: 42 }))

    const b = make()
    applyDithering(b, makeConfig({ algorithm: 'bayer', strength: 1, seed: 42 }))

    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })
})
