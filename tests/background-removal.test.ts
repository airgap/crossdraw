import { describe, it, expect } from 'bun:test'
import {
  removeBackgroundByColor,
  removeBackgroundByEdge,
  removeBackgroundByThreshold,
  sobelEdgeDetect,
  floodFillMask,
  applyFeathering,
  sampleCornerColor,
} from '@/filters/background-removal'
import type { BackgroundRemovalParams } from '@/filters/background-removal'

// ── Test helpers ──────────────────────────────────────────────

/** Create a minimal ImageData-like object for testing. */
function makeImageData(data: number[], w: number, h: number): ImageData {
  return {
    data: new Uint8ClampedArray(data),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as unknown as ImageData
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
 * Create a 10x10 image with a white background and a 4x4 red square
 * centered in the middle (rows 3-6, cols 3-6).
 */
function makeWhiteBgRedSquare(): ImageData {
  const w = 10
  const h = 10
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= 3 && x <= 6 && y >= 3 && y <= 6) {
        // Red square
        data.push(255, 0, 0, 255)
      } else {
        // White background
        data.push(255, 255, 255, 255)
      }
    }
  }
  return makeImageData(data, w, h)
}

/**
 * Create an image with a sharp vertical edge: left half one colour,
 * right half a different colour.
 */
function makeTwoColorImage(
  w: number, h: number,
  leftR: number, leftG: number, leftB: number,
  rightR: number, rightG: number, rightB: number,
): ImageData {
  const data: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < w / 2) {
        data.push(leftR, leftG, leftB, 255)
      } else {
        data.push(rightR, rightG, rightB, 255)
      }
    }
  }
  return makeImageData(data, w, h)
}

// ── Flood fill tests ─────────────────────────────────────────

describe('floodFillMask', () => {
  it('fills a solid colour region completely', () => {
    const img = makeSolid(5, 5, 100, 100, 100)
    const mask = floodFillMask(img, 0, 0, 10)

    // Every pixel should be filled
    let filledCount = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) filledCount++
    }
    expect(filledCount).toBe(25)
  })

  it('stops at a colour boundary', () => {
    // Left half is black, right half is white
    const img = makeTwoColorImage(10, 10, 0, 0, 0, 255, 255, 255)

    // Flood fill from top-left (black region), tolerance=50
    const mask = floodFillMask(img, 0, 0, 50)

    // Should fill only the left half (50 pixels)
    let filledCount = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) filledCount++
    }
    expect(filledCount).toBe(50) // 5 columns * 10 rows

    // Check that right side is not filled
    const rightMiddle = 5 * 10 + 7 // row 5, col 7
    expect(mask[rightMiddle]).toBe(0)
  })

  it('handles out-of-bounds seed gracefully', () => {
    const img = makeSolid(5, 5, 100, 100, 100)
    const mask = floodFillMask(img, -1, -1, 10)

    let filledCount = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) filledCount++
    }
    expect(filledCount).toBe(0)
  })
})

// ── Sobel edge detection tests ───────────────────────────────

describe('sobelEdgeDetect', () => {
  it('produces edges at colour boundaries', () => {
    // Left half black, right half white, 20x10
    const img = makeTwoColorImage(20, 10, 0, 0, 0, 255, 255, 255)
    const edges = sobelEdgeDetect(img)

    // Pixels at the boundary (x=9,10) should have high edge values
    // Pixels far from the boundary should have low/zero edge values
    const farLeft = edges[5 * 20 + 2]! // row 5, col 2 (inside black)
    const atBoundary = edges[5 * 20 + 10]! // row 5, col 10 (at edge)
    const farRight = edges[5 * 20 + 17]! // row 5, col 17 (inside white)

    expect(farLeft).toBe(0)
    expect(farRight).toBe(0)
    expect(atBoundary).toBeGreaterThan(100)
  })

  it('returns zero for a solid colour image', () => {
    const img = makeSolid(10, 10, 128, 128, 128)
    const edges = sobelEdgeDetect(img)

    let maxEdge = 0
    for (let i = 0; i < edges.length; i++) {
      if (edges[i]! > maxEdge) maxEdge = edges[i]!
    }
    expect(maxEdge).toBe(0)
  })
})

// ── Color-based removal tests ────────────────────────────────

describe('removeBackgroundByColor', () => {
  it('makes matching pixels transparent', () => {
    const img = makeWhiteBgRedSquare()
    const params: BackgroundRemovalParams = {
      method: 'color',
      tolerance: 30,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByColor(img, params)

    // Corner pixel (0,0) should be transparent (was white background)
    const cornerAlpha = result.data[3]!
    expect(cornerAlpha).toBe(0)

    // Center pixel (5,5) should remain opaque (red square)
    const centerIdx = (5 * 10 + 5) * 4
    expect(result.data[centerIdx]!).toBe(255)     // R
    expect(result.data[centerIdx + 1]!).toBe(0)   // G
    expect(result.data[centerIdx + 2]!).toBe(0)   // B
    expect(result.data[centerIdx + 3]!).toBe(255)  // A
  })

  it('preserves all pixels when tolerance is zero and colours differ', () => {
    // An image where corners are one colour and the rest is another
    const img = makeSolid(5, 5, 100, 50, 50)
    const params: BackgroundRemovalParams = {
      method: 'color',
      tolerance: 0,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByColor(img, params)

    // All pixels should be transparent because all match the corner colour exactly
    for (let i = 0; i < 5 * 5; i++) {
      expect(result.data[i * 4 + 3]!).toBe(0)
    }
  })
})

// ── Corner sampling tests ────────────────────────────────────

describe('sampleCornerColor', () => {
  it('detects background colour from uniform corners', () => {
    const img = makeWhiteBgRedSquare()
    const [r, g, b] = sampleCornerColor(img)

    // All four corners are white (255, 255, 255)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })

  it('averages mixed corner colours', () => {
    // 4x4 image: top-left=red, top-right=green, bottom-left=blue, bottom-right=black
    const w = 4
    const h = 4
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x === 0 && y === 0) {
          data.push(255, 0, 0, 255) // TL red
        } else if (x === w - 1 && y === 0) {
          data.push(0, 255, 0, 255) // TR green
        } else if (x === 0 && y === h - 1) {
          data.push(0, 0, 255, 255) // BL blue
        } else if (x === w - 1 && y === h - 1) {
          data.push(0, 0, 0, 255) // BR black
        } else {
          data.push(128, 128, 128, 255) // fill
        }
      }
    }
    const img = makeImageData(data, w, h)
    const [r, g, b] = sampleCornerColor(img)

    expect(r).toBe(Math.round(255 / 4))
    expect(g).toBe(Math.round(255 / 4))
    expect(b).toBe(Math.round(255 / 4))
  })
})

// ── Feathering tests ─────────────────────────────────────────

describe('applyFeathering', () => {
  it('produces gradual alpha transition', () => {
    // Create a sharp mask: left half 0, right half 255
    const w = 20
    const h = 10
    const mask = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        mask[y * w + x] = x >= w / 2 ? 255 : 0
      }
    }

    const feathered = applyFeathering(mask, w, h, 3)

    // At the boundary (x=9,10), the values should be intermediate
    // Instead of a sharp 0->255 jump, we should see gradual values
    const midRow = 5
    const leftEdge = feathered[midRow * w + 8]!  // just left of boundary
    const boundary = feathered[midRow * w + 10]!  // at boundary
    const rightEdge = feathered[midRow * w + 12]! // just right of boundary

    // The feathered boundary should be between 0 and 255
    expect(boundary).toBeGreaterThan(20)
    expect(boundary).toBeLessThan(235)

    // Left of boundary should be less than boundary
    expect(leftEdge).toBeLessThan(boundary)

    // Right of boundary should be more than boundary
    expect(rightEdge).toBeGreaterThan(boundary)
  })

  it('returns a copy when radius is zero', () => {
    const mask = new Uint8Array([0, 128, 255, 0])
    const result = applyFeathering(mask, 2, 2, 0)

    expect(result[0]).toBe(0)
    expect(result[1]).toBe(128)
    expect(result[2]).toBe(255)
    expect(result[3]).toBe(0)
    // Should be a copy, not the same reference
    expect(result).not.toBe(mask)
  })
})

// ── Threshold-based removal tests ────────────────────────────

describe('removeBackgroundByThreshold', () => {
  it('produces binary alpha based on luminance', () => {
    // White background, dark foreground object
    const w = 10
    const h = 10
    const data: number[] = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= 3 && x <= 6 && y >= 3 && y <= 6) {
          // Dark foreground (lum ~50)
          data.push(50, 50, 50, 255)
        } else {
          // White background (lum = 255)
          data.push(255, 255, 255, 255)
        }
      }
    }
    const img = makeImageData(data, w, h)

    const params: BackgroundRemovalParams = {
      method: 'threshold',
      tolerance: 30,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByThreshold(img, params)

    // White background pixels (lum=255) should be transparent
    const cornerAlpha = result.data[3]!
    expect(cornerAlpha).toBe(0)

    // Dark foreground pixels should remain opaque
    const centerIdx = (5 * 10 + 5) * 4
    expect(result.data[centerIdx + 3]!).toBe(255)
  })

  it('with high tolerance, removes near-white pixels too', () => {
    // Image with pure white and light grey
    const w = 4
    const h = 1
    const data = [
      255, 255, 255, 255, // pure white
      230, 230, 230, 255, // light grey (lum ~230)
      100, 100, 100, 255, // medium grey (lum ~100)
      0, 0, 0, 255,       // black
    ]
    const img = makeImageData(data, w, h)

    const params: BackgroundRemovalParams = {
      method: 'threshold',
      tolerance: 60,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByThreshold(img, params)

    // Pure white (lum=255, >= 255-60=195) -> transparent
    expect(result.data[3]!).toBe(0)
    // Light grey (lum=230, >= 195) -> transparent
    expect(result.data[7]!).toBe(0)
    // Medium grey (lum=100, < 195) -> opaque
    expect(result.data[11]!).toBe(255)
    // Black (lum=0, < 195) -> opaque
    expect(result.data[15]!).toBe(255)
  })
})

// ── Edge-based removal tests ─────────────────────────────────

describe('removeBackgroundByEdge', () => {
  it('removes the background from a simple two-region image', () => {
    // White background with a dark square in the center
    const dark = makeSolid(10, 10, 255, 255, 255)
    // Make center 4x4 dark
    for (let y = 3; y <= 6; y++) {
      for (let x = 3; x <= 6; x++) {
        const idx = (y * 10 + x) * 4
        dark.data[idx] = 30
        dark.data[idx + 1] = 30
        dark.data[idx + 2] = 30
      }
    }

    const params: BackgroundRemovalParams = {
      method: 'edge',
      tolerance: 50,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByEdge(dark, params)

    // Corner (white bg) should become transparent
    expect(result.data[3]!).toBe(0)

    // Center dark pixel should remain opaque
    const centerIdx = (5 * 10 + 5) * 4
    expect(result.data[centerIdx + 3]!).toBe(255)
  })
})

// ── Integration tests ────────────────────────────────────────

describe('removeBackground integration', () => {
  it('preserves RGB channels when removing background', () => {
    const img = makeWhiteBgRedSquare()
    const params: BackgroundRemovalParams = {
      method: 'color',
      tolerance: 30,
      edgeStrength: 1.0,
      feather: 0,
    }

    const result = removeBackgroundByColor(img, params)

    // The red square pixels should have unchanged RGB
    const centerIdx = (5 * 10 + 5) * 4
    expect(result.data[centerIdx]!).toBe(255)     // R
    expect(result.data[centerIdx + 1]!).toBe(0)   // G
    expect(result.data[centerIdx + 2]!).toBe(0)   // B
  })

  it('does not modify the original image data', () => {
    const img = makeWhiteBgRedSquare()
    const originalAlpha = img.data[3]! // corner pixel alpha

    removeBackgroundByColor(img, {
      method: 'color',
      tolerance: 30,
      edgeStrength: 1.0,
      feather: 0,
    })

    // Original should be unchanged
    expect(img.data[3]!).toBe(originalAlpha)
  })
})
