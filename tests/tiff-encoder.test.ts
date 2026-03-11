import { describe, it, expect } from 'bun:test'
import { encodeTIFF } from '@/io/tiff-encoder'

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

describe('encodeTIFF', () => {
  it('should produce a valid TIFF header with little-endian byte order', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    // "II" = little-endian
    expect(result[0]).toBe(0x49) // I
    expect(result[1]).toBe(0x49) // I
  })

  it('should have magic number 42', () => {
    const data = new Uint8ClampedArray([0, 255, 0, 255])
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    expect(view.getUint16(2, true)).toBe(42)
  })

  it('should point to IFD at offset 8', () => {
    const data = new Uint8ClampedArray([0, 0, 255, 255])
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    expect(view.getUint32(4, true)).toBe(8)
  })

  it('should have 13 IFD entries', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(128)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    expect(view.getUint16(8, true)).toBe(13)
  })

  it('should return a Uint8Array', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(255)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)
    expect(result).toBeInstanceOf(Uint8Array)
  })

  it('should have correct total size for pixel data', () => {
    const w = 3
    const h = 2
    const pixelByteCount = w * h * 4
    const data = new Uint8ClampedArray(pixelByteCount)
    data.fill(200)
    const img = makeImageData(w, h, data)
    const result = encodeTIFF(img)

    // Header(8) + IFD(2 + 13*12 + 4 = 162) + BPS(8) + XRes(8) + YRes(8) + pixels
    const expectedIfdSize = 2 + 13 * 12 + 4
    const expectedOverflow = 8 + 8 + 8 // BPS + XRes + YRes
    const expectedTotal = 8 + expectedIfdSize + expectedOverflow + pixelByteCount
    expect(result.length).toBe(expectedTotal)
  })

  it('should encode ImageWidth tag correctly', () => {
    const w = 10
    const h = 5
    const data = new Uint8ClampedArray(w * h * 4)
    data.fill(100)
    const img = makeImageData(w, h, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // First IFD entry starts at offset 10
    // Tag 256 (ImageWidth) = TYPE_LONG(4), count=1, value=width
    expect(view.getUint16(10, true)).toBe(256) // tag
    expect(view.getUint16(12, true)).toBe(4) // TYPE_LONG
    expect(view.getUint32(14, true)).toBe(1) // count
    expect(view.getUint32(18, true)).toBe(w) // value
  })

  it('should encode ImageLength tag correctly', () => {
    const w = 10
    const h = 5
    const data = new Uint8ClampedArray(w * h * 4)
    data.fill(100)
    const img = makeImageData(w, h, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // Second entry at offset 10 + 12 = 22
    expect(view.getUint16(22, true)).toBe(257) // TAG_IMAGE_LENGTH
    expect(view.getUint32(30, true)).toBe(h) // value
  })

  it('should encode BitsPerSample tag pointing to overflow', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // Third entry at offset 34
    expect(view.getUint16(34, true)).toBe(258) // TAG_BITS_PER_SAMPLE
    expect(view.getUint16(36, true)).toBe(3) // TYPE_SHORT
    expect(view.getUint32(38, true)).toBe(4) // count=4

    // Value is offset to BPS data
    const bpsOffset = view.getUint32(42, true)
    // Read the 4 shorts at the BPS overflow area
    expect(view.getUint16(bpsOffset, true)).toBe(8)
    expect(view.getUint16(bpsOffset + 2, true)).toBe(8)
    expect(view.getUint16(bpsOffset + 4, true)).toBe(8)
    expect(view.getUint16(bpsOffset + 6, true)).toBe(8)
  })

  it('should encode Compression tag as 1 (no compression)', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // Fourth entry at offset 46
    expect(view.getUint16(46, true)).toBe(259) // TAG_COMPRESSION
    expect(view.getUint16(54, true)).toBe(1) // no compression
  })

  it('should encode Photometric as 2 (RGB)', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // Fifth entry at offset 58
    expect(view.getUint16(58, true)).toBe(262) // TAG_PHOTOMETRIC
    expect(view.getUint16(66, true)).toBe(2) // RGB
  })

  it('should encode SamplesPerPixel as 4 (RGBA)', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // Seventh entry at offset 82 (after StripOffsets at 70)
    expect(view.getUint16(82, true)).toBe(277) // TAG_SAMPLES_PER_PIXEL
    expect(view.getUint16(90, true)).toBe(4)
  })

  it('should encode ResolutionUnit as 2 (DPI)', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // 12th entry at offset 10 + 11*12 = 142
    expect(view.getUint16(142, true)).toBe(296) // TAG_RESOLUTION_UNIT
    expect(view.getUint16(150, true)).toBe(2)
  })

  it('should encode ExtraSamples as 2 (unassociated alpha)', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // 13th entry at offset 10 + 12*12 = 154
    expect(view.getUint16(154, true)).toBe(338) // TAG_EXTRA_SAMPLES
    expect(view.getUint16(162, true)).toBe(2) // unassociated alpha
  })

  it('should have next IFD pointer as 0', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // After 13 entries: offset = 10 + 13*12 = 166, then 4 bytes for next IFD
    expect(view.getUint32(166, true)).toBe(0)
  })

  it('should encode XResolution as 72/1 rational', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // XRes rational: find the offset
    // 11th entry (TAG_X_RESOLUTION) at offset 10 + 9*12 = 118
    const xResEntry = 118
    expect(view.getUint16(xResEntry, true)).toBe(282)
    const xResOffset = view.getUint32(xResEntry + 8, true)
    expect(view.getUint32(xResOffset, true)).toBe(72) // numerator
    expect(view.getUint32(xResOffset + 4, true)).toBe(1) // denominator
  })

  it('should encode YResolution as 72/1 rational', () => {
    const data = new Uint8ClampedArray(4)
    data.fill(200)
    const img = makeImageData(1, 1, data)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // 12th entry is ResolutionUnit at 130, so YRes is at 10 + 10*12 = 130
    const yResEntry = 130
    expect(view.getUint16(yResEntry, true)).toBe(283)
    const yResOffset = view.getUint32(yResEntry + 8, true)
    expect(view.getUint32(yResOffset, true)).toBe(72)
    expect(view.getUint32(yResOffset + 4, true)).toBe(1)
  })

  it('should embed pixel data correctly', () => {
    const pixels = new Uint8ClampedArray([255, 0, 128, 200])
    const img = makeImageData(1, 1, pixels)
    const result = encodeTIFF(img)

    const view = new DataView(result.buffer)
    // StripOffsets entry at offset 70 (6th entry)
    expect(view.getUint16(70, true)).toBe(273)
    const stripOffset = view.getUint32(78, true)

    // Check pixel data at strip offset
    expect(result[stripOffset]).toBe(255)
    expect(result[stripOffset + 1]).toBe(0)
    expect(result[stripOffset + 2]).toBe(128)
    expect(result[stripOffset + 3]).toBe(200)
  })

  it('should handle a multi-pixel image', () => {
    const w = 4
    const h = 3
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = i % 256
      data[i + 1] = (i * 2) % 256
      data[i + 2] = (i * 3) % 256
      data[i + 3] = 255
    }
    const img = makeImageData(w, h, data)
    const result = encodeTIFF(img)

    // Verify size
    const ifdSize = 2 + 13 * 12 + 4
    const overflow = 8 + 8 + 8
    const expectedTotal = 8 + ifdSize + overflow + w * h * 4
    expect(result.length).toBe(expectedTotal)

    // Verify StripByteCount
    const view = new DataView(result.buffer)
    // 9th entry at offset 10 + 8*12 = 106
    expect(view.getUint16(106, true)).toBe(279) // TAG_STRIP_BYTE_COUNTS
    expect(view.getUint32(114, true)).toBe(w * h * 4)
  })
})
