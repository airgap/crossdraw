import { describe, test, expect } from 'bun:test'
import { applySmartSharpen } from '@/filters/smart-sharpen'
import { applyLUT, parseCubeLUT } from '@/filters/lut'
import { applySelectiveColor, defaultSelectiveColorParams } from '@/filters/selective-color'

// ── Helpers ──────────────────────────────────────────────────

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

function makeEdgeImage(w: number, h: number): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x < Math.floor(w / 2) ? 50 : 200
      data.push(v, v, v, 255)
    }
  }
  return makeImageData(data, w, h)
}

/** Build an identity 3D LUT (output = input) of given size. */
function makeIdentityLUT(size: number): number[] {
  const lut: number[] = []
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        lut.push(r / (size - 1), g / (size - 1), b / (size - 1))
      }
    }
  }
  return lut
}

/** Build a LUT that inverts all colors. */
function makeInvertLUT(size: number): number[] {
  const lut: number[] = []
  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        lut.push(1 - r / (size - 1), 1 - g / (size - 1), 1 - b / (size - 1))
      }
    }
  }
  return lut
}

// ═══════════════════════════════════════════════════════════════
// Smart Sharpen
// ═══════════════════════════════════════════════════════════════

describe('applySmartSharpen', () => {
  test('radius=0 returns unchanged copy', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const result = applySmartSharpen(img, {
      amount: 2,
      radius: 0,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
    expect(result).not.toBe(img)
  })

  test('amount=0 returns unchanged copy', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const result = applySmartSharpen(img, {
      amount: 0,
      radius: 2,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('sharpening modifies edges', () => {
    const img = makeEdgeImage(7, 7)
    const result = applySmartSharpen(img, {
      amount: 2,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    let anyDifferent = false
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] !== img.data[i]) {
        anyDifferent = true
        break
      }
    }
    expect(anyDifferent).toBe(true)
  })

  test('preserves alpha channel', () => {
    const img = makeSolid(4, 4, 100, 150, 200, 180)
    const result = applySmartSharpen(img, {
      amount: 1.5,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })

  test('output values are clamped to 0-255', () => {
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 0 : 255
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)
    const result = applySmartSharpen(img, {
      amount: 10,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('does not modify original', () => {
    const img = makeSolid(4, 4, 100, 150, 200)
    const originalData = new Uint8ClampedArray(img.data)
    applySmartSharpen(img, {
      amount: 2,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(originalData[i])
    }
  })

  test('negative radius returns unchanged copy', () => {
    const img = makeSolid(3, 3, 100, 100, 100)
    const result = applySmartSharpen(img, {
      amount: 2,
      radius: -1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBe(img.data[i])
    }
  })

  test('shadow fade reduces sharpening in dark areas', () => {
    // Dark image with edge
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 10 : 40
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)

    const noFade = applySmartSharpen(img, {
      amount: 3,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    const withFade = applySmartSharpen(img, {
      amount: 3,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 100,
      highlightFade: 0,
    })

    // With shadow fade, the difference from original should be smaller
    let diffNoFade = 0
    let diffWithFade = 0
    for (let i = 0; i < img.data.length; i += 4) {
      diffNoFade += Math.abs(noFade.data[i]! - img.data[i]!)
      diffWithFade += Math.abs(withFade.data[i]! - img.data[i]!)
    }
    expect(diffWithFade).toBeLessThanOrEqual(diffNoFade)
  })

  test('highlight fade reduces sharpening in bright areas', () => {
    // Bright image with edge
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = x < 3 ? 220 : 250
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)

    const noFade = applySmartSharpen(img, {
      amount: 3,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    const withFade = applySmartSharpen(img, {
      amount: 3,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 100,
    })

    let diffNoFade = 0
    let diffWithFade = 0
    for (let i = 0; i < img.data.length; i += 4) {
      diffNoFade += Math.abs(noFade.data[i]! - img.data[i]!)
      diffWithFade += Math.abs(withFade.data[i]! - img.data[i]!)
    }
    expect(diffWithFade).toBeLessThanOrEqual(diffNoFade)
  })

  test('noise reduction suppresses sharpening in flat areas', () => {
    // Nearly flat image with tiny noise
    const data: number[] = []
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const v = 128 + (x % 2 === 0 ? 1 : -1)
        data.push(v, v, v, 255)
      }
    }
    const img = makeImageData(data, 5, 5)

    const noNR = applySmartSharpen(img, {
      amount: 5,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    const withNR = applySmartSharpen(img, {
      amount: 5,
      radius: 1,
      noiseReduction: 100,
      shadowFade: 0,
      highlightFade: 0,
    })

    let diffNoNR = 0
    let diffWithNR = 0
    for (let i = 0; i < img.data.length; i += 4) {
      diffNoNR += Math.abs(noNR.data[i]! - img.data[i]!)
      diffWithNR += Math.abs(withNR.data[i]! - img.data[i]!)
    }
    expect(diffWithNR).toBeLessThanOrEqual(diffNoNR)
  })

  test('correct dimensions on output', () => {
    const img = makeSolid(6, 4, 128, 128, 128)
    const result = applySmartSharpen(img, {
      amount: 1,
      radius: 1,
      noiseReduction: 0,
      shadowFade: 0,
      highlightFade: 0,
    })
    expect(result.width).toBe(6)
    expect(result.height).toBe(4)
    expect(result.data.length).toBe(6 * 4 * 4)
  })
})

// ═══════════════════════════════════════════════════════════════
// Color LUT
// ═══════════════════════════════════════════════════════════════

describe('applyLUT', () => {
  test('identity LUT returns (approximately) same image', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const lut = makeIdentityLUT(4)
    const result = applyLUT(img, { lutData: lut, size: 4 })
    // Allow small rounding differences from trilinear interpolation
    expect(Math.abs(result.data[0]! - 100)).toBeLessThanOrEqual(1)
    expect(Math.abs(result.data[1]! - 150)).toBeLessThanOrEqual(1)
    expect(Math.abs(result.data[2]! - 200)).toBeLessThanOrEqual(1)
  })

  test('invert LUT approximately inverts colors', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const lut = makeInvertLUT(8)
    const result = applyLUT(img, { lutData: lut, size: 8 })
    // 255 - 100 = 155, 255 - 150 = 105, 255 - 200 = 55
    expect(Math.abs(result.data[0]! - 155)).toBeLessThanOrEqual(2)
    expect(Math.abs(result.data[1]! - 105)).toBeLessThanOrEqual(2)
    expect(Math.abs(result.data[2]! - 55)).toBeLessThanOrEqual(2)
  })

  test('preserves alpha', () => {
    const img = makeSolid(2, 2, 100, 150, 200, 128)
    const lut = makeIdentityLUT(4)
    const result = applyLUT(img, { lutData: lut, size: 4 })
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(128)
    }
  })

  test('invalid LUT (size=0) returns copy', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const result = applyLUT(img, { lutData: [], size: 0 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('invalid LUT (too small data) returns copy', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const result = applyLUT(img, { lutData: [0, 0, 0], size: 4 })
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('output values are clamped to 0-255', () => {
    // LUT that maps everything to > 1.0
    const size = 2
    const lut = new Array(size * size * size * 3).fill(1.5)
    const img = makeSolid(2, 2, 100, 100, 100)
    const result = applyLUT(img, { lutData: lut, size })
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBeLessThanOrEqual(255)
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
    }
  })

  test('correct dimensions', () => {
    const img = makeSolid(5, 3, 128, 128, 128)
    const lut = makeIdentityLUT(4)
    const result = applyLUT(img, { lutData: lut, size: 4 })
    expect(result.width).toBe(5)
    expect(result.height).toBe(3)
    expect(result.data.length).toBe(5 * 3 * 4)
  })

  test('does not modify original', () => {
    const img = makeSolid(2, 2, 100, 150, 200)
    const originalData = new Uint8ClampedArray(img.data)
    const lut = makeInvertLUT(4)
    applyLUT(img, { lutData: lut, size: 4 })
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(originalData[i])
    }
  })

  test('handles black (0,0,0) and white (255,255,255)', () => {
    const data = [0, 0, 0, 255, 255, 255, 255, 255]
    const img = makeImageData(data, 2, 1)
    const lut = makeIdentityLUT(4)
    const result = applyLUT(img, { lutData: lut, size: 4 })
    // Black should stay black
    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(0)
    expect(result.data[2]).toBe(0)
    // White should stay white
    expect(result.data[4]).toBe(255)
    expect(result.data[5]).toBe(255)
    expect(result.data[6]).toBe(255)
  })
})

describe('parseCubeLUT', () => {
  test('parses valid .cube file', () => {
    const cube = `# Comment line
TITLE "Test LUT"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`
    const result = parseCubeLUT(cube)
    expect(result.size).toBe(2)
    expect(result.data.length).toBe(2 * 2 * 2 * 3)
    // First entry: (0,0,0) -> (0,0,0)
    expect(result.data[0]).toBe(0)
    expect(result.data[1]).toBe(0)
    expect(result.data[2]).toBe(0)
    // Last entry: (1,1,1) -> (1,1,1)
    expect(result.data[21]).toBe(1)
    expect(result.data[22]).toBe(1)
    expect(result.data[23]).toBe(1)
  })

  test('parses with DOMAIN_MIN and DOMAIN_MAX', () => {
    const cube = `LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`
    const result = parseCubeLUT(cube)
    expect(result.size).toBe(2)
    expect(result.data.length).toBe(24)
  })

  test('throws on missing LUT_3D_SIZE', () => {
    const cube = `0.0 0.0 0.0\n1.0 1.0 1.0\n`
    expect(() => parseCubeLUT(cube)).toThrow('missing LUT_3D_SIZE')
  })

  test('throws on insufficient data', () => {
    const cube = `LUT_3D_SIZE 2\n0.0 0.0 0.0\n`
    expect(() => parseCubeLUT(cube)).toThrow('expected')
  })

  test('handles Windows line endings (\\r\\n)', () => {
    const cube = `LUT_3D_SIZE 2\r\n0.0 0.0 0.0\r\n1.0 0.0 0.0\r\n0.0 1.0 0.0\r\n1.0 1.0 0.0\r\n0.0 0.0 1.0\r\n1.0 0.0 1.0\r\n0.0 1.0 1.0\r\n1.0 1.0 1.0\r\n`
    const result = parseCubeLUT(cube)
    expect(result.size).toBe(2)
    expect(result.data.length).toBe(24)
  })

  test('skips blank lines and comments', () => {
    const cube = `
# Comment
LUT_3D_SIZE 2

# More comments
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`
    const result = parseCubeLUT(cube)
    expect(result.size).toBe(2)
  })

  test('round-trip: parse cube then apply as LUT', () => {
    // Build a .cube identity LUT of size 2
    const lines = ['LUT_3D_SIZE 2']
    for (let r = 0; r < 2; r++) {
      for (let g = 0; g < 2; g++) {
        for (let b = 0; b < 2; b++) {
          lines.push(`${r} ${g} ${b}`)
        }
      }
    }
    const parsed = parseCubeLUT(lines.join('\n'))
    const img = makeSolid(2, 2, 128, 64, 200)
    const result = applyLUT(img, { lutData: Array.from(parsed.data), size: parsed.size })
    // Identity should preserve (approximately)
    expect(Math.abs(result.data[0]! - 128)).toBeLessThanOrEqual(2)
    expect(Math.abs(result.data[1]! - 64)).toBeLessThanOrEqual(2)
    expect(Math.abs(result.data[2]! - 200)).toBeLessThanOrEqual(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// Selective Color
// ═══════════════════════════════════════════════════════════════

describe('applySelectiveColor', () => {
  test('all-zero adjustments returns (approximately) same image', () => {
    const img = makeSolid(3, 3, 100, 150, 200)
    const params = defaultSelectiveColorParams()
    const result = applySelectiveColor(img, params)
    // With all zero adjustments, CMYK shifts are 0, so output should equal input
    expect(result.data[0]).toBe(100)
    expect(result.data[1]).toBe(150)
    expect(result.data[2]).toBe(200)
  })

  test('preserves alpha', () => {
    const img = makeSolid(2, 2, 200, 50, 50, 180)
    const params = defaultSelectiveColorParams()
    params.reds.cyan = 50
    const result = applySelectiveColor(img, params)
    for (let i = 3; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180)
    }
  })

  test('does not modify original', () => {
    const img = makeSolid(2, 2, 200, 50, 50)
    const originalData = new Uint8ClampedArray(img.data)
    const params = defaultSelectiveColorParams()
    params.reds.cyan = 50
    applySelectiveColor(img, params)
    for (let i = 0; i < img.data.length; i++) {
      expect(img.data[i]).toBe(originalData[i])
    }
  })

  test('adjusting reds cyan reduces red in red pixels', () => {
    // Pure red pixel
    const img = makeSolid(1, 1, 255, 0, 0)
    const params = defaultSelectiveColorParams()
    params.reds.cyan = 50 // add cyan = reduce red
    const result = applySelectiveColor(img, params)
    // Red should be reduced
    expect(result.data[0]!).toBeLessThan(255)
  })

  test('adjusting blues yellow reduces blue in blue pixels', () => {
    // Pure blue pixel
    const img = makeSolid(1, 1, 0, 0, 255)
    const params = defaultSelectiveColorParams()
    params.blues.yellow = 50 // add yellow = reduce blue
    const result = applySelectiveColor(img, params)
    expect(result.data[2]!).toBeLessThan(255)
  })

  test('adjusting blacks darkens dark pixels', () => {
    // Very dark pixel (low chroma)
    const img = makeSolid(1, 1, 10, 10, 10)
    const params = defaultSelectiveColorParams()
    params.blacks.black = 50 // positive black = darken
    const result = applySelectiveColor(img, params)
    // Should be darker (closer to 0)
    expect(result.data[0]!).toBeLessThan(10)
  })

  test('adjusting whites affects bright pixels', () => {
    // Very bright, low-chroma pixel
    const img = makeSolid(1, 1, 240, 240, 240)
    const params = defaultSelectiveColorParams()
    params.whites.black = 50 // darken whites
    const result = applySelectiveColor(img, params)
    expect(result.data[0]!).toBeLessThan(240)
  })

  test('adjusting neutrals affects mid-tone pixels', () => {
    // Mid-tone, low-chroma pixel
    const img = makeSolid(1, 1, 128, 128, 128)
    const params = defaultSelectiveColorParams()
    params.neutrals.black = 50
    const result = applySelectiveColor(img, params)
    expect(result.data[0]!).toBeLessThan(128)
  })

  test('output values are clamped to 0-255', () => {
    const img = makeSolid(2, 2, 255, 0, 0)
    const params = defaultSelectiveColorParams()
    params.reds.cyan = -100
    params.reds.black = -100
    const result = applySelectiveColor(img, params)
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('correct dimensions', () => {
    const img = makeSolid(5, 3, 128, 128, 128)
    const params = defaultSelectiveColorParams()
    const result = applySelectiveColor(img, params)
    expect(result.width).toBe(5)
    expect(result.height).toBe(3)
    expect(result.data.length).toBe(5 * 3 * 4)
  })

  test('handles green pixels with greens adjustment', () => {
    const img = makeSolid(1, 1, 0, 255, 0)
    const params = defaultSelectiveColorParams()
    params.greens.magenta = 50 // add magenta = reduce green
    const result = applySelectiveColor(img, params)
    expect(result.data[1]!).toBeLessThan(255)
  })

  test('handles cyan pixels', () => {
    const img = makeSolid(1, 1, 0, 200, 200)
    const params = defaultSelectiveColorParams()
    params.cyans.yellow = 50
    const result = applySelectiveColor(img, params)
    // Blue should be reduced (yellow adjustment affects blue channel)
    expect(result.data[2]!).toBeLessThan(200)
  })

  test('handles yellow pixels', () => {
    const img = makeSolid(1, 1, 200, 200, 0)
    const params = defaultSelectiveColorParams()
    params.yellows.cyan = 50
    const result = applySelectiveColor(img, params)
    // Red should be reduced (cyan adjustment affects red channel)
    expect(result.data[0]!).toBeLessThan(200)
  })

  test('handles magenta pixels', () => {
    const img = makeSolid(1, 1, 200, 0, 200)
    const params = defaultSelectiveColorParams()
    params.magentas.yellow = 50
    const result = applySelectiveColor(img, params)
    expect(result.data[2]!).toBeLessThan(200)
  })
})

describe('defaultSelectiveColorParams', () => {
  test('returns all-zero adjustments', () => {
    const params = defaultSelectiveColorParams()
    const channels = [
      'reds',
      'yellows',
      'greens',
      'cyans',
      'blues',
      'magentas',
      'whites',
      'neutrals',
      'blacks',
    ] as const
    for (const ch of channels) {
      expect(params[ch].cyan).toBe(0)
      expect(params[ch].magenta).toBe(0)
      expect(params[ch].yellow).toBe(0)
      expect(params[ch].black).toBe(0)
    }
  })
})
