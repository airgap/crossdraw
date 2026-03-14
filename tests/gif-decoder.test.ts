import { describe, test, expect } from 'bun:test'
import { encodeGIF, encodeAnimatedGIF } from '@/io/gif-encoder'
import { decodeGIF, isAnimatedGIF } from '@/io/gif-decoder'

describe('gif-decoder', () => {
  function makeImageData(w: number, h: number, r: number, g: number, b: number): ImageData {
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = r
      data[i * 4 + 1] = g
      data[i * 4 + 2] = b
      data[i * 4 + 3] = 255
    }
    return new ImageData(data, w, h)
  }

  describe('single-frame GIF', () => {
    test('decodes dimensions correctly', () => {
      const img = makeImageData(10, 8, 255, 0, 0)
      const encoded = encodeGIF(img)
      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      expect(decoded.width).toBe(10)
      expect(decoded.height).toBe(8)
      expect(decoded.frames.length).toBe(1)
    })

    test('decodes pixel data', () => {
      const img = makeImageData(4, 4, 255, 0, 0)
      const encoded = encodeGIF(img)
      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      const frame = decoded.frames[0]!
      expect(frame.imageData.width).toBe(4)
      expect(frame.imageData.height).toBe(4)

      // Check first pixel is reddish (quantization may shift exact values)
      const r = frame.imageData.data[0]!
      const g = frame.imageData.data[1]!
      const b = frame.imageData.data[2]!
      expect(r).toBeGreaterThan(200)
      expect(g).toBeLessThan(50)
      expect(b).toBeLessThan(50)
    })

    test('isAnimatedGIF returns false', () => {
      const img = makeImageData(4, 4, 0, 0, 255)
      const encoded = encodeGIF(img)
      expect(isAnimatedGIF(encoded.buffer as ArrayBuffer)).toBe(false)
    })
  })

  describe('animated GIF', () => {
    test('decodes multiple frames', () => {
      const frame1 = makeImageData(8, 8, 255, 0, 0)
      const frame2 = makeImageData(8, 8, 0, 255, 0)
      const frame3 = makeImageData(8, 8, 0, 0, 255)

      const encoded = encodeAnimatedGIF([frame1, frame2, frame3], {
        delayMs: 200,
        loopCount: 0,
      })

      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      expect(decoded.width).toBe(8)
      expect(decoded.height).toBe(8)
      expect(decoded.frames.length).toBe(3)
      expect(decoded.loopCount).toBe(0)
    })

    test('preserves frame delays', () => {
      const frame1 = makeImageData(4, 4, 255, 0, 0)
      const frame2 = makeImageData(4, 4, 0, 255, 0)

      const encoded = encodeAnimatedGIF([frame1, frame2], {
        delayMs: 500,
        loopCount: 3,
      })

      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      // 500ms → 50 centiseconds → 500ms back
      expect(decoded.frames[0]!.delayMs).toBe(500)
      expect(decoded.frames[1]!.delayMs).toBe(500)
      expect(decoded.loopCount).toBe(3)
    })

    test('isAnimatedGIF returns true', () => {
      const frame1 = makeImageData(4, 4, 255, 0, 0)
      const frame2 = makeImageData(4, 4, 0, 255, 0)

      const encoded = encodeAnimatedGIF([frame1, frame2], {
        delayMs: 100,
        loopCount: 0,
      })

      expect(isAnimatedGIF(encoded.buffer as ArrayBuffer)).toBe(true)
    })

    test('frames have correct imageData dimensions', () => {
      const frame1 = makeImageData(16, 12, 100, 100, 100)
      const frame2 = makeImageData(16, 12, 200, 200, 200)

      const encoded = encodeAnimatedGIF([frame1, frame2], {
        delayMs: 100,
        loopCount: 0,
      })

      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      for (const frame of decoded.frames) {
        expect(frame.imageData.width).toBe(16)
        expect(frame.imageData.height).toBe(12)
        expect(frame.imageData.data.length).toBe(16 * 12 * 4)
      }
    })

    test('different coloured frames decode to distinct pixel data', () => {
      const red = makeImageData(4, 4, 255, 0, 0)
      const green = makeImageData(4, 4, 0, 255, 0)

      const encoded = encodeAnimatedGIF([red, green], {
        delayMs: 100,
        loopCount: 0,
      })

      const decoded = decodeGIF(encoded.buffer as ArrayBuffer)

      // Frame 1 should be reddish
      const f1 = decoded.frames[0]!.imageData.data
      expect(f1[0]!).toBeGreaterThan(200) // R
      expect(f1[1]!).toBeLessThan(50) // G

      // Frame 2 should be greenish
      const f2 = decoded.frames[1]!.imageData.data
      expect(f2[1]!).toBeGreaterThan(200) // G
      expect(f2[0]!).toBeLessThan(50) // R
    })
  })

  describe('error handling', () => {
    test('throws on invalid signature', () => {
      const bad = new ArrayBuffer(10)
      expect(() => decodeGIF(bad)).toThrow('Not a GIF')
    })

    test('isAnimatedGIF returns false for non-GIF data', () => {
      const bad = new ArrayBuffer(10)
      expect(isAnimatedGIF(bad)).toBe(false)
    })
  })
})
