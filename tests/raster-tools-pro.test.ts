import { describe, test, expect } from 'bun:test'
import { applyGaussianBlur } from '@/filters/gaussian-blur'
import {
  applyBrightnessContrast,
  applyShadowHighlight,
  applyExposure,
  applyPhotoFilter,
  applyBlackWhiteMixer,
} from '@/filters/color-adjust'
import {
  featherSelection,
  expandSelection,
  contractSelection,
  getSelectionMask,
  createRectSelection,
} from '@/tools/raster-selection'
import { computeHistogram } from '@/ui/histogram'

// ── Helpers ──

function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

function makeSolid(w: number, h: number, r: number, g: number, b: number, a = 255): ImageData {
  const data: number[] = []
  for (let i = 0; i < w * h; i++) data.push(r, g, b, a)
  return makeImageData(data, w, h)
}

// ── Gaussian Blur ──

describe('applyGaussianBlur', () => {
  test('radius=0 returns unchanged copy', () => {
    const img = makeSolid(4, 4, 100, 100, 100)
    const result = applyGaussianBlur(img, { radius: 0 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
    for (let i = 0; i < img.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
    // Verify it's a copy, not the same reference
    expect(result.data).not.toBe(img.data)
  })

  test('radius>0 blurs pixels', () => {
    // Create image with single white pixel on black background
    const w = 16
    const h = 16
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 8 && y === 8) {
          data.push(255, 255, 255, 255)
        } else {
          data.push(0, 0, 0, 255)
        }
      }
    }
    const img = makeImageData(data, w, h)
    const result = applyGaussianBlur(img, { radius: 2 })

    // The center pixel should be dimmer (spread out)
    const centerIdx = (8 * w + 8) * 4
    expect(result.data[centerIdx]!).toBeLessThan(255)
    expect(result.data[centerIdx]!).toBeGreaterThan(0)

    // Neighbouring pixels should have some value
    const neighborIdx = (8 * w + 9) * 4
    expect(result.data[neighborIdx]!).toBeGreaterThan(0)
  })

  test('returns new ImageData', () => {
    const img = makeSolid(4, 4, 128, 128, 128)
    const result = applyGaussianBlur(img, { radius: 1 })
    expect(result).not.toBe(img)
  })
})

// ── Brightness / Contrast ──

describe('applyBrightnessContrast', () => {
  test('zero brightness/contrast returns identical pixels', () => {
    const img = makeSolid(2, 2, 128, 64, 200)
    const result = applyBrightnessContrast(img, { brightness: 0, contrast: 0 })
    for (let i = 0; i < img.data.length; i += 4) {
      expect(result.data[i]).toBe(img.data[i])
      expect(result.data[i + 1]).toBe(img.data[i + 1])
      expect(result.data[i + 2]).toBe(img.data[i + 2])
      expect(result.data[i + 3]).toBe(img.data[i + 3])
    }
  })

  test('positive brightness lightens pixels', () => {
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyBrightnessContrast(img, { brightness: 50, contrast: 0 })
    expect(result.data[0]!).toBeGreaterThan(100)
  })

  test('negative brightness darkens pixels', () => {
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyBrightnessContrast(img, { brightness: -50, contrast: 0 })
    expect(result.data[0]!).toBeLessThan(100)
  })

  test('high contrast pushes values toward extremes', () => {
    // Bright pixel should get brighter, dark pixel should get darker
    const data = [
      200,
      200,
      200,
      255, // bright
      50,
      50,
      50,
      255, // dark
    ]
    const img = makeImageData(data, 2, 1)
    const result = applyBrightnessContrast(img, { brightness: 0, contrast: 80 })
    expect(result.data[0]!).toBeGreaterThan(200) // bright gets brighter
    expect(result.data[4]!).toBeLessThan(50) // dark gets darker
  })

  test('preserves alpha', () => {
    const img = makeSolid(1, 1, 100, 100, 100, 128)
    const result = applyBrightnessContrast(img, { brightness: 50, contrast: 50 })
    expect(result.data[3]).toBe(128)
  })

  test('clamps to 0-255', () => {
    const img = makeSolid(1, 1, 250, 250, 250)
    const result = applyBrightnessContrast(img, { brightness: 100, contrast: 100 })
    expect(result.data[0]!).toBeLessThanOrEqual(255)
    expect(result.data[0]!).toBeGreaterThanOrEqual(0)
  })
})

// ── Shadow / Highlight Recovery ──

describe('applyShadowHighlight', () => {
  test('zero adjustments returns unchanged pixels', () => {
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyShadowHighlight(img, { shadows: 0, highlights: 0 })
    for (let i = 0; i < 3; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
  })

  test('positive shadows lightens dark pixels', () => {
    const img = makeSolid(1, 1, 30, 30, 30) // dark pixel
    const result = applyShadowHighlight(img, { shadows: 80, highlights: 0 })
    expect(result.data[0]!).toBeGreaterThan(30)
  })

  test('positive highlights darkens bright pixels', () => {
    const img = makeSolid(1, 1, 230, 230, 230) // bright pixel
    const result = applyShadowHighlight(img, { shadows: 0, highlights: 80 })
    expect(result.data[0]!).toBeLessThan(230)
  })

  test('midtones are relatively unaffected', () => {
    const img = makeSolid(1, 1, 128, 128, 128)
    const result = applyShadowHighlight(img, { shadows: 50, highlights: 50 })
    // Midtones should not shift much
    expect(Math.abs(result.data[0]! - 128)).toBeLessThan(20)
  })
})

// ── Exposure ──

describe('applyExposure', () => {
  test('neutral settings return unchanged pixels', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applyExposure(img, { exposure: 0, offset: 0, gamma: 1 })
    for (let i = 0; i < 3; i++) {
      expect(result.data[i]).toBe(128)
    }
  })

  test('positive exposure brightens', () => {
    const img = makeSolid(1, 1, 100, 100, 100)
    const result = applyExposure(img, { exposure: 1, offset: 0, gamma: 1 })
    expect(result.data[0]!).toBeGreaterThan(100)
  })

  test('negative exposure darkens', () => {
    const img = makeSolid(1, 1, 200, 200, 200)
    const result = applyExposure(img, { exposure: -1, offset: 0, gamma: 1 })
    expect(result.data[0]!).toBeLessThan(200)
  })
})

// ── Photo Filter ──

describe('applyPhotoFilter', () => {
  test('density=0 returns unchanged pixels', () => {
    const img = makeSolid(2, 2, 128, 128, 128)
    const result = applyPhotoFilter(img, { color: '#ff8800', density: 0, preserveLuminosity: false })
    expect(result.data[0]).toBe(128)
    expect(result.data[1]).toBe(128)
    expect(result.data[2]).toBe(128)
  })

  test('warming filter shifts toward orange', () => {
    const img = makeSolid(1, 1, 128, 128, 128)
    const result = applyPhotoFilter(img, { color: '#ff8800', density: 50, preserveLuminosity: false })
    expect(result.data[0]!).toBeGreaterThan(128) // red increases
    expect(result.data[2]!).toBeLessThan(128) // blue decreases
  })

  test('preserveLuminosity maintains overall brightness', () => {
    const img = makeSolid(1, 1, 128, 128, 128)
    const withPres = applyPhotoFilter(img, { color: '#ff0000', density: 80, preserveLuminosity: true })
    const origLum = 0.2126 * 128 + 0.7152 * 128 + 0.0722 * 128
    const newLum = 0.2126 * withPres.data[0]! + 0.7152 * withPres.data[1]! + 0.0722 * withPres.data[2]!
    // With strong red filter, luminosity should be closer to original than without preservation
    const withoutPres = applyPhotoFilter(img, { color: '#ff0000', density: 80, preserveLuminosity: false })
    const lumWithout = 0.2126 * withoutPres.data[0]! + 0.7152 * withoutPres.data[1]! + 0.0722 * withoutPres.data[2]!
    expect(Math.abs(newLum - origLum)).toBeLessThan(Math.abs(lumWithout - origLum))
  })
})

// ── Black & White Mixer ──

describe('applyBlackWhiteMixer', () => {
  test('outputs greyscale', () => {
    const img = makeSolid(1, 1, 200, 100, 50)
    const result = applyBlackWhiteMixer(img, {
      reds: 0,
      yellows: 0,
      greens: 0,
      cyans: 0,
      blues: 0,
      magentas: 0,
    })
    // All channels should be equal (greyscale)
    expect(result.data[0]).toBe(result.data[1])
    expect(result.data[1]).toBe(result.data[2])
  })

  test('boosting reds makes red areas brighter', () => {
    const img = makeSolid(1, 1, 200, 50, 50) // reddish pixel
    const neutral = applyBlackWhiteMixer(img, {
      reds: 0,
      yellows: 0,
      greens: 0,
      cyans: 0,
      blues: 0,
      magentas: 0,
    })
    const boosted = applyBlackWhiteMixer(img, {
      reds: 100,
      yellows: 0,
      greens: 0,
      cyans: 0,
      blues: 0,
      magentas: 0,
    })
    expect(boosted.data[0]!).toBeGreaterThan(neutral.data[0]!)
  })

  test('preserves alpha', () => {
    const img = makeSolid(1, 1, 128, 128, 128, 100)
    const result = applyBlackWhiteMixer(img, {
      reds: 0,
      yellows: 0,
      greens: 0,
      cyans: 0,
      blues: 0,
      magentas: 0,
    })
    expect(result.data[3]).toBe(100)
  })
})

// ── Selection Feathering ──

describe('featherSelection', () => {
  test('feathering softens hard edges', () => {
    // Create a 10x10 selection with a 5x5 rectangle selected
    createRectSelection(2, 2, 6, 6, 10, 10, 'replace')
    const mask = getSelectionMask()
    expect(mask).not.toBeNull()

    // Before feathering: edges are sharp (0 or 255)
    const beforeEdge = mask!.data[2 * 10 + 1] // just outside selection
    expect(beforeEdge).toBe(0)
    const beforeInside = mask!.data[4 * 10 + 4] // inside selection
    expect(beforeInside).toBe(255)

    // Feather
    featherSelection(2)
    const feathered = getSelectionMask()!

    // After feathering: edge pixels should have intermediate values
    // The formerly-0 pixels near the edge should now have some value
    const afterNearEdge = feathered.data[2 * 10 + 1]
    expect(afterNearEdge!).toBeGreaterThan(0) // was 0, now partly selected

    // Center should still be relatively high (blur reduces peak but doesn't zero it)
    const afterCenter = feathered.data[5 * 10 + 5]
    expect(afterCenter!).toBeGreaterThan(100)
  })

  test('radius=0 does not change mask', () => {
    createRectSelection(0, 0, 4, 4, 8, 8, 'replace')
    const before = new Uint8Array(getSelectionMask()!.data)
    featherSelection(0)
    const after = getSelectionMask()!
    for (let i = 0; i < before.length; i++) {
      expect(after.data[i]).toBe(before[i])
    }
  })
})

describe('expandSelection', () => {
  test('expands selection outward', () => {
    createRectSelection(3, 3, 4, 4, 10, 10, 'replace')
    const before = getSelectionMask()!
    // Pixel at (2, 5) should be unselected
    expect(before.data[5 * 10 + 2]).toBe(0)

    expandSelection(2)
    const after = getSelectionMask()!
    // Now should be selected (within 2px of the rectangle)
    expect(after.data[5 * 10 + 2]!).toBe(255)
  })
})

describe('contractSelection', () => {
  test('shrinks selection inward', () => {
    createRectSelection(0, 0, 10, 10, 10, 10, 'replace')
    contractSelection(2)
    const after = getSelectionMask()!
    // Edge pixel should now be deselected
    expect(after.data[0 * 10 + 0]).toBe(0)
    expect(after.data[1 * 10 + 1]).toBe(0)
    // Interior should still be selected
    expect(after.data[5 * 10 + 5]).toBe(255)
  })
})

// ── Histogram ──

describe('computeHistogram', () => {
  test('solid color image produces single-bin spike', () => {
    const img = makeSolid(10, 10, 128, 64, 200)
    const hist = computeHistogram(img)

    // Red channel: all 100 pixels at bin 128
    expect(hist.red[128]).toBe(100)
    expect(hist.red[0]).toBe(0)

    // Green channel: all at bin 64
    expect(hist.green[64]).toBe(100)

    // Blue channel: all at bin 200
    expect(hist.blue[200]).toBe(100)
  })

  test('luminance bins are populated', () => {
    const img = makeSolid(4, 4, 100, 100, 100)
    const hist = computeHistogram(img)
    const expectedLum = Math.round(0.2126 * 100 + 0.7152 * 100 + 0.0722 * 100)
    expect(hist.luminance[expectedLum]).toBe(16)
  })

  test('total pixel count matches across all bins', () => {
    const img = makeSolid(5, 5, 50, 150, 250)
    const hist = computeHistogram(img)

    let redTotal = 0
    for (let i = 0; i < 256; i++) redTotal += hist.red[i]!
    expect(redTotal).toBe(25)

    let greenTotal = 0
    for (let i = 0; i < 256; i++) greenTotal += hist.green[i]!
    expect(greenTotal).toBe(25)
  })

  test('mixed image distributes across bins', () => {
    // 2x1 image: one black pixel, one white pixel
    const img = makeImageData([0, 0, 0, 255, 255, 255, 255, 255], 2, 1)
    const hist = computeHistogram(img)
    expect(hist.red[0]).toBe(1)
    expect(hist.red[255]).toBe(1)
    expect(hist.green[0]).toBe(1)
    expect(hist.green[255]).toBe(1)
  })
})

// ── Dodge/Burn/Sponge settings ──

describe('dodge-burn settings', () => {
  test('getDodgeBurnSettings returns defaults', async () => {
    const { getDodgeBurnSettings } = await import('@/tools/dodge-burn')
    const settings = getDodgeBurnSettings()
    expect(settings.size).toBeGreaterThan(0)
    expect(settings.hardness).toBeGreaterThanOrEqual(0)
    expect(settings.hardness).toBeLessThanOrEqual(1)
    expect(settings.exposure).toBeGreaterThan(0)
    expect(settings.exposure).toBeLessThanOrEqual(1)
  })

  test('setDodgeBurnSettings updates values', async () => {
    const { getDodgeBurnSettings, setDodgeBurnSettings } = await import('@/tools/dodge-burn')
    setDodgeBurnSettings({ size: 42, exposure: 0.75 })
    const settings = getDodgeBurnSettings()
    expect(settings.size).toBe(42)
    expect(settings.exposure).toBe(0.75)
  })
})

// ── Smudge settings ──

describe('smudge settings', () => {
  test('getSmudgeSettings returns defaults', async () => {
    const { getSmudgeSettings } = await import('@/tools/smudge')
    const settings = getSmudgeSettings()
    expect(settings.size).toBeGreaterThan(0)
    expect(settings.strength).toBeGreaterThan(0)
    expect(settings.strength).toBeLessThanOrEqual(1)
  })

  test('setSmudgeSettings updates values', async () => {
    const { getSmudgeSettings, setSmudgeSettings } = await import('@/tools/smudge')
    setSmudgeSettings({ size: 30, strength: 0.8 })
    const settings = getSmudgeSettings()
    expect(settings.size).toBe(30)
    expect(settings.strength).toBe(0.8)
  })
})

// ── Healing Brush settings ──

describe('healing-brush settings', () => {
  test('getHealingBrushSettings returns defaults', async () => {
    const { getHealingBrushSettings } = await import('@/tools/healing-brush')
    const settings = getHealingBrushSettings()
    expect(settings.size).toBeGreaterThan(0)
    expect(settings.opacity).toBeGreaterThan(0)
  })

  test('setHealingSource sets source point', async () => {
    const { setHealingSource, hasHealingSource, getHealingSource } = await import('@/tools/healing-brush')
    setHealingSource(100, 200)
    expect(hasHealingSource()).toBe(true)
    const src = getHealingSource()!
    expect(src.x).toBe(100)
    expect(src.y).toBe(200)
  })
})

// ── Raster Gradient settings ──

describe('raster-gradient settings', () => {
  test('getRasterGradientSettings returns defaults', async () => {
    const { getRasterGradientSettings } = await import('@/tools/raster-gradient')
    const settings = getRasterGradientSettings()
    expect(settings.type).toBe('linear')
    expect(settings.foreground).toMatch(/^#/)
    expect(settings.background).toMatch(/^#/)
    expect(settings.opacity).toBeGreaterThan(0)
  })

  test('setRasterGradientSettings updates values', async () => {
    const { getRasterGradientSettings, setRasterGradientSettings } = await import('@/tools/raster-gradient')
    setRasterGradientSettings({ type: 'radial', foreground: '#ff0000' })
    const settings = getRasterGradientSettings()
    expect(settings.type).toBe('radial')
    expect(settings.foreground).toBe('#ff0000')
  })
})
