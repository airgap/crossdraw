import { describe, it, expect, afterAll } from 'bun:test'
import {
  computeEnergyMap,
  findMinSeam,
  performContentAwareScale,
  getContentAwareScaleSettings,
  setContentAwareScaleSettings,
} from '@/tools/content-aware-scale'

// ── ImageData polyfill for bun test environment ──

const origImageData = globalThis.ImageData

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
})

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, maybeHeight?: number) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth
        this.width = widthOrHeight
        this.height = maybeHeight ?? dataOrWidth.length / 4 / widthOrHeight
      } else {
        this.width = dataOrWidth
        this.height = widthOrHeight
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      }
    }
  }
}

// ── Test helpers ──────────────────────────────────────────────

/** Create a minimal ImageData-like object for testing. */
function makeImageData(data: number[], w: number, h: number): ImageData {
  return new ImageData(new Uint8ClampedArray(data), w, h)
}

/** Create a flat-colour image (all pixels the same RGBA). */
function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) {
    data.push(r, g, b, a)
  }
  return makeImageData(data, w, h)
}

/**
 * Create a 6x6 image with a vertical stripe of a different colour.
 * Left 2 cols = red, middle 2 cols = green, right 2 cols = blue.
 */
function makeStripedImage(): ImageData {
  const w = 6
  const h = 6
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < 2) {
        data.push(255, 0, 0, 255) // Red
      } else if (x < 4) {
        data.push(0, 255, 0, 255) // Green
      } else {
        data.push(0, 0, 255, 255) // Blue
      }
    }
  }
  return makeImageData(data, w, h)
}

/**
 * Create an image with a horizontal gradient from black to white.
 */
function makeGradientImage(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.round((x / (w - 1)) * 255)
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

// ── computeEnergyMap tests ──────────────────────────────────────

describe('computeEnergyMap', () => {
  it('returns zero energy for a solid-colour image', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const energy = computeEnergyMap(img)
    expect(energy.length).toBe(16)
    for (let i = 0; i < energy.length; i++) {
      expect(energy[i]!).toBe(0)
    }
  })

  it('returns correct dimensions', () => {
    const img = makeSolid(10, 7, 0, 0, 0)
    const energy = computeEnergyMap(img)
    expect(energy.length).toBe(70)
  })

  it('detects edges — pixels at colour boundaries have higher energy', () => {
    const img = makeStripedImage()
    const energy = computeEnergyMap(img)
    // Interior of red stripe (x=0, y=3) should have low energy
    const interiorIdx = 3 * 6 + 0
    // Boundary between red and green (x=2, y=3) should have higher energy
    const boundaryIdx = 3 * 6 + 2
    expect(energy[boundaryIdx]!).toBeGreaterThan(energy[interiorIdx]!)
  })

  it('energy values are non-negative', () => {
    const img = makeGradientImage(8, 8)
    const energy = computeEnergyMap(img)
    for (let i = 0; i < energy.length; i++) {
      expect(energy[i]!).toBeGreaterThanOrEqual(0)
    }
  })

  it('gradient image has higher energy than solid image', () => {
    const solid = makeSolid(8, 8, 100, 100, 100)
    const grad = makeGradientImage(8, 8)
    const solidEnergy = computeEnergyMap(solid)
    const gradEnergy = computeEnergyMap(grad)

    let solidSum = 0
    let gradSum = 0
    for (let i = 0; i < solidEnergy.length; i++) {
      solidSum += solidEnergy[i]!
      gradSum += gradEnergy[i]!
    }
    expect(gradSum).toBeGreaterThan(solidSum)
  })
})

// ── findMinSeam tests ──────────────────────────────────────────

describe('findMinSeam', () => {
  it('returns a seam of correct length', () => {
    const img = makeGradientImage(8, 6)
    const energy = computeEnergyMap(img)
    const seam = findMinSeam(energy, 8, 6)
    expect(seam.length).toBe(6)
  })

  it('seam x-values are within bounds', () => {
    const img = makeGradientImage(10, 10)
    const energy = computeEnergyMap(img)
    const seam = findMinSeam(energy, 10, 10)
    for (const x of seam) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(10)
    }
  })

  it('adjacent seam rows differ by at most 1', () => {
    const img = makeGradientImage(10, 10)
    const energy = computeEnergyMap(img)
    const seam = findMinSeam(energy, 10, 10)
    for (let y = 1; y < seam.length; y++) {
      expect(Math.abs(seam[y]! - seam[y - 1]!)).toBeLessThanOrEqual(1)
    }
  })

  it('finds the lowest-energy column in a uniform-row energy map', () => {
    // Create an energy map where column 2 has the lowest energy
    const w = 5
    const h = 4
    const energy = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        energy[y * w + x] = x === 2 ? 1 : 100
      }
    }
    const seam = findMinSeam(energy, w, h)
    for (const x of seam) {
      expect(x).toBe(2)
    }
  })

  it('avoids high-energy columns', () => {
    // Column 0 is very high energy, all others are low
    const w = 5
    const h = 4
    const energy = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        energy[y * w + x] = x === 0 ? 10000 : 1
      }
    }
    const seam = findMinSeam(energy, w, h)
    for (const x of seam) {
      expect(x).not.toBe(0)
    }
  })
})

// ── performContentAwareScale tests ──────────────────────────────

describe('performContentAwareScale', () => {
  it('returns same dimensions when target matches source', () => {
    const img = makeSolid(5, 5, 100, 100, 100)
    const result = performContentAwareScale(img, 5, 5)
    expect(result.width).toBe(5)
    expect(result.height).toBe(5)
  })

  it('returns a copy (not the same buffer) when dimensions match', () => {
    const img = makeSolid(4, 4, 50, 50, 50)
    const result = performContentAwareScale(img, 4, 4)
    expect(result.data).not.toBe(img.data)
    expect(result.data.length).toBe(img.data.length)
  })

  it('shrinks width correctly', () => {
    const img = makeSolid(8, 4, 200, 100, 50)
    const result = performContentAwareScale(img, 6, 4)
    expect(result.width).toBe(6)
    expect(result.height).toBe(4)
    expect(result.data.length).toBe(6 * 4 * 4)
  })

  it('grows width correctly', () => {
    const img = makeSolid(4, 4, 200, 100, 50)
    const result = performContentAwareScale(img, 6, 4)
    expect(result.width).toBe(6)
    expect(result.height).toBe(4)
    expect(result.data.length).toBe(6 * 4 * 4)
  })

  it('shrinks height correctly', () => {
    const img = makeSolid(4, 8, 100, 200, 50)
    const result = performContentAwareScale(img, 4, 6)
    expect(result.width).toBe(4)
    expect(result.height).toBe(6)
    expect(result.data.length).toBe(4 * 6 * 4)
  })

  it('grows height correctly', () => {
    const img = makeSolid(4, 4, 100, 200, 50)
    const result = performContentAwareScale(img, 4, 6)
    expect(result.width).toBe(4)
    expect(result.height).toBe(6)
    expect(result.data.length).toBe(4 * 6 * 4)
  })

  it('scales both dimensions', () => {
    const img = makeSolid(6, 6, 128, 128, 128)
    const result = performContentAwareScale(img, 4, 4)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    expect(result.data.length).toBe(4 * 4 * 4)
  })

  it('grows both dimensions', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const result = performContentAwareScale(img, 6, 6)
    expect(result.width).toBe(6)
    expect(result.height).toBe(6)
    expect(result.data.length).toBe(6 * 6 * 4)
  })

  it('throws for target dimensions < 1', () => {
    const img = makeSolid(4, 4, 0, 0, 0)
    expect(() => performContentAwareScale(img, 0, 4)).toThrow()
    expect(() => performContentAwareScale(img, 4, 0)).toThrow()
    expect(() => performContentAwareScale(img, -1, 4)).toThrow()
  })

  it('preserves colour in a solid image after shrink', () => {
    const img = makeSolid(6, 6, 42, 84, 126)
    const result = performContentAwareScale(img, 4, 4)
    // All pixels should still be the same colour
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(42)
      expect(result.data[i + 1]).toBe(84)
      expect(result.data[i + 2]).toBe(126)
      expect(result.data[i + 3]).toBe(255)
    }
  })

  it('accepts a protect mask without crashing', () => {
    const img = makeSolid(6, 6, 100, 100, 100)
    const mask = new Uint8Array(36)
    // Protect the left 3 columns
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 3; x++) {
        mask[y * 6 + x] = 255
      }
    }
    const result = performContentAwareScale(img, 4, 6, mask)
    expect(result.width).toBe(4)
    expect(result.height).toBe(6)
  })

  it('protect mask influences seam placement', () => {
    // Create a striped image where seams would naturally go through
    // the low-energy regions. With a mask protecting those regions,
    // seams should be placed elsewhere.
    const img = makeStripedImage() // 6x6
    const mask = new Uint8Array(36)
    // Protect the green stripe (columns 2-3) — seams should avoid it
    for (let y = 0; y < 6; y++) {
      mask[y * 6 + 2] = 255
      mask[y * 6 + 3] = 255
    }
    const result = performContentAwareScale(img, 4, 6, mask)
    expect(result.width).toBe(4)
    expect(result.height).toBe(6)
    // The result should still have some green pixels (protected)
    let greenCount = 0
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] === 0 && result.data[i + 1] === 255 && result.data[i + 2] === 0) {
        greenCount++
      }
    }
    expect(greenCount).toBeGreaterThan(0)
  })

  it('shrink by 1 column produces correct width', () => {
    const img = makeGradientImage(10, 5)
    const result = performContentAwareScale(img, 9, 5)
    expect(result.width).toBe(9)
    expect(result.height).toBe(5)
  })

  it('grow by 1 column produces correct width', () => {
    const img = makeGradientImage(10, 5)
    const result = performContentAwareScale(img, 11, 5)
    expect(result.width).toBe(11)
    expect(result.height).toBe(5)
  })
})

// ── Settings tests ──────────────────────────────────────────────

describe('ContentAwareScaleSettings', () => {
  it('returns default settings', () => {
    const s = getContentAwareScaleSettings()
    expect(s.protectMask).toBe(false)
  })

  it('updates settings', () => {
    setContentAwareScaleSettings({ protectMask: true })
    expect(getContentAwareScaleSettings().protectMask).toBe(true)
    // Reset
    setContentAwareScaleSettings({ protectMask: false })
  })

  it('returns a copy, not a reference', () => {
    const a = getContentAwareScaleSettings()
    const b = getContentAwareScaleSettings()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })
})
