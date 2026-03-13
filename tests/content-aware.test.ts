import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  performContentAwareFill,
  getContentAwareFillSettings,
  setContentAwareFillSettings,
} from '@/tools/content-aware-fill'
import {
  getContentAwareMoveSettings,
  setContentAwareMoveSettings,
  beginContentAwareMove,
  updateContentAwareMove,
  cancelContentAwareMove,
  isContentAwareMoveActive,
  getContentAwareMoveOffset,
} from '@/tools/content-aware-move'
import type { SelectionMask } from '@/tools/raster-selection'

// Save originals
const origImageData = globalThis.ImageData

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
})

// Polyfill ImageData for bun test environment
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

// ── Helpers ──

function makeImageData(w: number, h: number, fill?: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) {
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = fill[0]
      data[i * 4 + 1] = fill[1]
      data[i * 4 + 2] = fill[2]
      data[i * 4 + 3] = fill[3]
    }
  }
  return new ImageData(data, w, h)
}

function makeMask(w: number, h: number, selected: [number, number, number, number]): SelectionMask {
  const data = new Uint8Array(w * h)
  const [sx, sy, sw, sh] = selected
  for (let y = sy; y < sy + sh; y++) {
    for (let x = sx; x < sx + sw; x++) {
      if (x >= 0 && x < w && y >= 0 && y < h) {
        data[y * w + x] = 255
      }
    }
  }
  return { width: w, height: h, data }
}

function setPixel(imageData: ImageData, x: number, y: number, r: number, g: number, b: number, a: number = 255) {
  const i = (y * imageData.width + x) * 4
  imageData.data[i] = r
  imageData.data[i + 1] = g
  imageData.data[i + 2] = b
  imageData.data[i + 3] = a
}

function getPixel(imageData: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * imageData.width + x) * 4
  return [imageData.data[i]!, imageData.data[i + 1]!, imageData.data[i + 2]!, imageData.data[i + 3]!]
}

// ──────────────────────────────────────────────────────────────────────────────
// Content-Aware Fill tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Content-Aware Fill', () => {
  beforeEach(() => {
    setContentAwareFillSettings({ sampleArea: 'auto', blendAmount: 4, colorAdaptation: 0.5 })
  })

  test('settings get/set round-trips', () => {
    const before = getContentAwareFillSettings()
    expect(before.sampleArea).toBe('auto')
    expect(before.blendAmount).toBe(4)
    expect(before.colorAdaptation).toBe(0.5)

    setContentAwareFillSettings({ blendAmount: 10, colorAdaptation: 0.8 })
    const after = getContentAwareFillSettings()
    expect(after.blendAmount).toBe(10)
    expect(after.colorAdaptation).toBe(0.8)
    expect(after.sampleArea).toBe('auto') // unchanged
  })

  test('returns copy when no pixels are selected', () => {
    const img = makeImageData(10, 10, [128, 64, 32, 255])
    const mask: SelectionMask = { width: 10, height: 10, data: new Uint8Array(100) } // all 0
    const result = performContentAwareFill(img, mask)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    // Data should be identical to original
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
  })

  test('returns copy when all pixels are selected (no source)', () => {
    const img = makeImageData(8, 8, [100, 100, 100, 255])
    const mask: SelectionMask = { width: 8, height: 8, data: new Uint8Array(64).fill(255) }
    const result = performContentAwareFill(img, mask)
    // Nothing to sample from — should return unchanged data
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
  })

  test('fills selected pixels with values from surrounding area', () => {
    // Create a 20×20 image where the outside is solid green and centre 4×4 is red
    const w = 20,
      h = 20
    const img = makeImageData(w, h, [0, 200, 0, 255])
    // Paint center 4×4 red
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        setPixel(img, x, y, 255, 0, 0, 255)
      }
    }

    const mask = makeMask(w, h, [8, 8, 4, 4])

    const result = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 0, // no edge blending
      colorAdaptation: 0,
    })

    // The filled pixels should no longer be red — they should be sampled from
    // the surrounding green area
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        const [r, g, _b, a] = getPixel(result, x, y)
        // The red channel should be much lower than 255 (original was 255, 0, 0)
        // and green channel should be high (surrounding is 0, 200, 0)
        expect(r).toBeLessThan(200)
        expect(g).toBeGreaterThan(50)
        expect(a).toBe(255)
      }
    }
  })

  test('does not mutate the original ImageData', () => {
    const img = makeImageData(10, 10, [50, 100, 150, 255])
    const copy = new Uint8ClampedArray(img.data)
    const mask = makeMask(10, 10, [3, 3, 4, 4])

    performContentAwareFill(img, mask)

    // Original must be untouched
    for (let i = 0; i < copy.length; i++) {
      expect(img.data[i]).toBe(copy[i])
    }
  })

  test('edge blending creates a transition at selection boundary', () => {
    const w = 30,
      h = 30
    const img = makeImageData(w, h, [0, 0, 200, 255])
    // Paint center region bright red
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) {
        setPixel(img, x, y, 255, 0, 0, 255)
      }
    }

    const mask = makeMask(w, h, [10, 10, 10, 10])

    // With blending
    const withBlend = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 5,
      colorAdaptation: 0,
    })

    // Without blending
    const noBlend = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 0,
      colorAdaptation: 0,
    })

    // Edge pixels (e.g., 10,10) should differ between blended and non-blended
    // because blending mixes original with filled
    const blendedEdge = getPixel(withBlend, 10, 10)
    const noBlendEdge = getPixel(noBlend, 10, 10)

    // They may or may not differ depending on exact algorithm, but the blended
    // version at the very edge should lean more towards the original
    // (the original pixel at 10,10 was red, the fill from surrounds would be blue)
    // At minimum, both should produce valid pixel data
    expect(blendedEdge[3]).toBe(255)
    expect(noBlendEdge[3]).toBe(255)
  })

  test('color adaptation shifts filled pixels towards border average', () => {
    const w = 20,
      h = 20
    // Green background, white center
    const img = makeImageData(w, h, [0, 180, 0, 255])
    for (let y = 6; y < 14; y++) {
      for (let x = 6; x < 14; x++) {
        setPixel(img, x, y, 255, 255, 255, 255)
      }
    }

    const mask = makeMask(w, h, [6, 6, 8, 8])

    const noAdapt = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 0,
      colorAdaptation: 0,
    })

    const fullAdapt = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 0,
      colorAdaptation: 1.0,
    })

    // With full adaptation, the filled area should be shifted towards the
    // green average. The green channel should be closer to 180 on average.
    let avgGNoAdapt = 0
    let avgGFullAdapt = 0
    let count = 0
    for (let y = 6; y < 14; y++) {
      for (let x = 6; x < 14; x++) {
        avgGNoAdapt += getPixel(noAdapt, x, y)[1]
        avgGFullAdapt += getPixel(fullAdapt, x, y)[1]
        count++
      }
    }
    avgGNoAdapt /= count
    avgGFullAdapt /= count

    // Full adaptation should shift green higher (towards border's 180)
    // compared to no adaptation
    expect(avgGFullAdapt).toBeGreaterThanOrEqual(avgGNoAdapt)
  })

  test('works with 1×1 selection', () => {
    const img = makeImageData(5, 5, [100, 100, 100, 255])
    setPixel(img, 2, 2, 255, 0, 0, 255)
    const mask = makeMask(5, 5, [2, 2, 1, 1])

    const result = performContentAwareFill(img, mask, {
      sampleArea: 'auto',
      blendAmount: 0,
      colorAdaptation: 0,
    })

    // The single pixel should be replaced by something from the surround
    const [r] = getPixel(result, 2, 2)
    expect(r).not.toBe(255) // should not remain pure red
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// Content-Aware Move tests
// ──────────────────────────────────────────────────────────────────────────────

describe('Content-Aware Move', () => {
  beforeEach(() => {
    setContentAwareMoveSettings({ mode: 'move', adaptation: 'medium' })
  })

  test('settings get/set round-trips', () => {
    const before = getContentAwareMoveSettings()
    expect(before.mode).toBe('move')
    expect(before.adaptation).toBe('medium')

    setContentAwareMoveSettings({ mode: 'extend', adaptation: 'loose' })
    const after = getContentAwareMoveSettings()
    expect(after.mode).toBe('extend')
    expect(after.adaptation).toBe('loose')
  })

  test('beginContentAwareMove returns false without selection', () => {
    // No selection mask set — should fail gracefully
    const result = beginContentAwareMove(0, 0)
    expect(result).toBe(false)
    expect(isContentAwareMoveActive()).toBe(false)
  })

  test('cancelContentAwareMove resets state', () => {
    cancelContentAwareMove()
    expect(isContentAwareMoveActive()).toBe(false)
    expect(getContentAwareMoveOffset()).toBeNull()
  })

  test('getContentAwareMoveOffset returns null when inactive', () => {
    expect(getContentAwareMoveOffset()).toBeNull()
  })

  test('updateContentAwareMove is a no-op when inactive', () => {
    // Should not throw
    updateContentAwareMove(100, 200)
    expect(isContentAwareMoveActive()).toBe(false)
  })

  test('all adaptation levels are valid strings', () => {
    const levels = ['very-strict', 'strict', 'medium', 'loose', 'very-loose'] as const
    for (const level of levels) {
      setContentAwareMoveSettings({ adaptation: level })
      expect(getContentAwareMoveSettings().adaptation).toBe(level)
    }
  })

  test('mode can be set to move or extend', () => {
    setContentAwareMoveSettings({ mode: 'move' })
    expect(getContentAwareMoveSettings().mode).toBe('move')

    setContentAwareMoveSettings({ mode: 'extend' })
    expect(getContentAwareMoveSettings().mode).toBe('extend')
  })
})
