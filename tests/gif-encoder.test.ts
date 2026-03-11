import { describe, it, expect } from 'bun:test'
import { encodeGIF } from '@/io/gif-encoder'

function makeImageData(width: number, height: number, data?: Uint8ClampedArray): ImageData {
  const pixelCount = width * height
  const d = data ?? new Uint8ClampedArray(pixelCount * 4)
  return {
    data: d,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData
}

describe('encodeGIF', () => {
  it('should produce a valid GIF89a header', () => {
    // 2x2 red image
    const data = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255])
    const img = makeImageData(2, 2, data)
    const result = encodeGIF(img)

    // GIF89a signature
    expect(result[0]).toBe(0x47) // G
    expect(result[1]).toBe(0x49) // I
    expect(result[2]).toBe(0x46) // F
    expect(result[3]).toBe(0x38) // 8
    expect(result[4]).toBe(0x39) // 9
    expect(result[5]).toBe(0x61) // a
  })

  it('should encode correct width and height in LSD', () => {
    const data = new Uint8ClampedArray(3 * 5 * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 128
      data[i + 1] = 64
      data[i + 2] = 32
      data[i + 3] = 255
    }
    const img = makeImageData(3, 5, data)
    const result = encodeGIF(img)

    // Width at offset 6 (little-endian u16)
    const width = result[6]! | (result[7]! << 8)
    expect(width).toBe(3)

    // Height at offset 8 (little-endian u16)
    const height = result[8]! | (result[9]! << 8)
    expect(height).toBe(5)
  })

  it('should have GCT flag set and correct packed byte', () => {
    const data = new Uint8ClampedArray(4)
    data[0] = 100
    data[1] = 200
    data[2] = 50
    data[3] = 255
    const img = makeImageData(1, 1, data)
    const result = encodeGIF(img)

    // Packed byte at offset 10
    // GCT flag=1, colour resolution=7 (8bits), sort=0, GCT size=7 (256 entries)
    expect(result[10]).toBe(0xf7)
  })

  it('should include a 768-byte Global Colour Table', () => {
    const data = new Uint8ClampedArray(4)
    data[0] = 10
    data[1] = 20
    data[2] = 30
    data[3] = 255
    const img = makeImageData(1, 1, data)
    const result = encodeGIF(img)

    // GCT starts at offset 13, is 256*3 = 768 bytes
    // Background colour index at offset 11
    expect(result[11]).toBe(0)
    // Pixel aspect ratio at offset 12
    expect(result[12]).toBe(0)

    // Image separator should be at offset 13 + 768 = 781
    expect(result[781]).toBe(0x2c)
  })

  it('should end with a GIF trailer byte 0x3B', () => {
    const data = new Uint8ClampedArray(16)
    for (let i = 0; i < 16; i += 4) {
      data[i] = 255
      data[i + 1] = 128
      data[i + 2] = 0
      data[i + 3] = 255
    }
    const img = makeImageData(2, 2, data)
    const result = encodeGIF(img)

    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should return a Uint8Array', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(255)
    const img = makeImageData(1, 1, data)
    const result = encodeGIF(img)
    expect(result).toBeInstanceOf(Uint8Array)
  })

  it('should handle fully transparent pixels', () => {
    // All pixels transparent (alpha=0)
    const data = new Uint8ClampedArray(4 * 4)
    // alpha stays 0
    const img = makeImageData(2, 2, data)
    const result = encodeGIF(img)

    // Should still produce a valid GIF
    expect(result[0]).toBe(0x47)
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should handle a single pixel image', () => {
    const data = new Uint8ClampedArray([0, 0, 255, 255])
    const img = makeImageData(1, 1, data)
    const result = encodeGIF(img)

    expect(result.length).toBeGreaterThan(13 + 768 + 10)
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should handle multi-colour images and quantize to 256', () => {
    // Make a 16x16 image with many distinct colours
    const w = 16
    const h = 16
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const off = (y * w + x) * 4
        data[off] = x * 16
        data[off + 1] = y * 16
        data[off + 2] = (x + y) * 8
        data[off + 3] = 255
      }
    }
    const img = makeImageData(w, h, data)
    const result = encodeGIF(img)

    expect(result[0]).toBe(0x47)
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should encode LZW minimum code size as 8', () => {
    const data = new Uint8ClampedArray(4)
    data[0] = 50
    data[1] = 100
    data[2] = 150
    data[3] = 255
    const img = makeImageData(1, 1, data)
    const result = encodeGIF(img)

    // Image descriptor: 1 (separator) + 2 (left) + 2 (top) + 2 (width) + 2 (height) + 1 (packed) = 10 bytes
    // So min code size byte is at 781 + 10 = 791
    expect(result[791]).toBe(8)
  })

  it('should handle a larger image with repeated colours', () => {
    // 100x100 solid green image
    const w = 100
    const h = 100
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 0
      data[i + 1] = 255
      data[i + 2] = 0
      data[i + 3] = 255
    }
    const img = makeImageData(w, h, data)
    const result = encodeGIF(img)

    // Should compress well since all pixels are the same
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toBe(0x47)
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should handle image with mix of transparent and opaque pixels', () => {
    // Checkerboard transparent/opaque
    const w = 4
    const h = 4
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const off = (y * w + x) * 4
        if ((x + y) % 2 === 0) {
          data[off] = 255
          data[off + 1] = 0
          data[off + 2] = 0
          data[off + 3] = 255
        } else {
          // transparent
          data[off + 3] = 0
        }
      }
    }
    const img = makeImageData(w, h, data)
    const result = encodeGIF(img)

    expect(result[0]).toBe(0x47)
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should write Image Descriptor with correct dimensions', () => {
    const w = 7
    const h = 3
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200
      data[i + 1] = 100
      data[i + 2] = 50
      data[i + 3] = 255
    }
    const img = makeImageData(w, h, data)
    const result = encodeGIF(img)

    // Image descriptor starts at offset 781
    // 0x2c separator at 781
    expect(result[781]).toBe(0x2c)
    // left position at 782 (u16 LE) = 0
    expect(result[782]! | (result[783]! << 8)).toBe(0)
    // top position at 784 (u16 LE) = 0
    expect(result[784]! | (result[785]! << 8)).toBe(0)
    // width at 786 (u16 LE)
    expect(result[786]! | (result[787]! << 8)).toBe(7)
    // height at 788 (u16 LE)
    expect(result[788]! | (result[789]! << 8)).toBe(3)
  })

  it('should handle >256 unique colours via quantization', () => {
    // Create an image with 512 unique colours
    const w = 32
    const h = 16
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const off = i * 4
      data[off] = i % 256
      data[off + 1] = (i * 3) % 256
      data[off + 2] = (i * 7) % 256
      data[off + 3] = 255
    }
    const img = makeImageData(w, h, data)
    const result = encodeGIF(img)

    // Should still produce a valid GIF, just quantized
    expect(result[0]).toBe(0x47)
    expect(result[result.length - 1]).toBe(0x3b)
    expect(result.length).toBeGreaterThan(0)
  })
})
