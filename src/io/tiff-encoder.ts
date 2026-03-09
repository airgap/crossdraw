/**
 * Minimal uncompressed TIFF writer.
 *
 * Produces a baseline TIFF (little-endian, no compression) with RGBA pixel data.
 */

// IFD Tag IDs
const TAG_IMAGE_WIDTH = 256
const TAG_IMAGE_LENGTH = 257
const TAG_BITS_PER_SAMPLE = 258
const TAG_COMPRESSION = 259
const TAG_PHOTOMETRIC = 262
const TAG_STRIP_OFFSETS = 273
const TAG_SAMPLES_PER_PIXEL = 277
const TAG_ROWS_PER_STRIP = 278
const TAG_STRIP_BYTE_COUNTS = 279
const TAG_X_RESOLUTION = 282
const TAG_Y_RESOLUTION = 283
const TAG_RESOLUTION_UNIT = 296
const TAG_EXTRA_SAMPLES = 338

// Data types
const TYPE_SHORT = 3 // 2 bytes
const TYPE_LONG = 4 // 4 bytes
const TYPE_RATIONAL = 5 // 8 bytes (num/denom)

/**
 * Encode an ImageData as an uncompressed TIFF file (RGBA, 8 bits per channel).
 */
export function encodeTIFF(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData
  const samplesPerPixel = 4 // RGBA
  const bitsPerSample = 8

  // Layout:
  //  [0..7]    TIFF header (8 bytes)
  //  [8..]     IFD entries
  //  After IFD: overflow data (BitsPerSample array, resolution rationals, strip data)

  const ifdEntryCount = 13
  const ifdSize = 2 + ifdEntryCount * 12 + 4 // count(2) + entries + next-IFD pointer(4)
  const ifdOffset = 8

  // Overflow data comes right after the IFD
  let overflowOffset = ifdOffset + ifdSize

  // BitsPerSample: 4 shorts = 8 bytes (doesn't fit in 4-byte value field)
  const bpsOffset = overflowOffset
  overflowOffset += 8 // 4 * 2 bytes

  // XResolution: RATIONAL = 8 bytes
  const xResOffset = overflowOffset
  overflowOffset += 8

  // YResolution: RATIONAL = 8 bytes
  const yResOffset = overflowOffset
  overflowOffset += 8

  // Strip data starts here
  const stripDataOffset = overflowOffset

  // Pixel data: convert RGBA interleaved from ImageData
  const pixelByteCount = width * height * samplesPerPixel
  const totalSize = stripDataOffset + pixelByteCount

  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  let pos = 0

  // ── TIFF Header (8 bytes) ──
  // Byte order: little-endian ("II")
  view.setUint8(pos++, 0x49) // I
  view.setUint8(pos++, 0x49) // I
  // Magic number: 42
  view.setUint16(pos, 42, true)
  pos += 2
  // Offset to first IFD
  view.setUint32(pos, ifdOffset, true)
  pos += 4

  // ── IFD ──
  // Number of entries
  view.setUint16(pos, ifdEntryCount, true)
  pos += 2

  function writeEntry(tag: number, type: number, count: number, value: number) {
    view.setUint16(pos, tag, true)
    pos += 2
    view.setUint16(pos, type, true)
    pos += 2
    view.setUint32(pos, count, true)
    pos += 4
    // Value/offset field (4 bytes)
    if (type === TYPE_SHORT && count === 1) {
      view.setUint16(pos, value, true)
      pos += 4 // still 4 bytes total
    } else {
      view.setUint32(pos, value, true)
      pos += 4
    }
  }

  // Entries MUST be sorted by tag number
  writeEntry(TAG_IMAGE_WIDTH, TYPE_LONG, 1, width) // 256
  writeEntry(TAG_IMAGE_LENGTH, TYPE_LONG, 1, height) // 257
  writeEntry(TAG_BITS_PER_SAMPLE, TYPE_SHORT, 4, bpsOffset) // 258, offset to array
  writeEntry(TAG_COMPRESSION, TYPE_SHORT, 1, 1) // 259, 1 = no compression
  writeEntry(TAG_PHOTOMETRIC, TYPE_SHORT, 1, 2) // 262, 2 = RGB
  writeEntry(TAG_STRIP_OFFSETS, TYPE_LONG, 1, stripDataOffset) // 273
  writeEntry(TAG_SAMPLES_PER_PIXEL, TYPE_SHORT, 1, samplesPerPixel) // 277
  writeEntry(TAG_ROWS_PER_STRIP, TYPE_LONG, 1, height) // 278, single strip
  writeEntry(TAG_STRIP_BYTE_COUNTS, TYPE_LONG, 1, pixelByteCount) // 279
  writeEntry(TAG_X_RESOLUTION, TYPE_RATIONAL, 1, xResOffset) // 282
  writeEntry(TAG_Y_RESOLUTION, TYPE_RATIONAL, 1, yResOffset) // 283
  writeEntry(TAG_RESOLUTION_UNIT, TYPE_SHORT, 1, 2) // 296, 2 = DPI
  writeEntry(TAG_EXTRA_SAMPLES, TYPE_SHORT, 1, 2) // 338, 2 = unassociated alpha

  // Next IFD offset (0 = no more IFDs)
  view.setUint32(pos, 0, true)
  pos += 4

  // ── Overflow: BitsPerSample (4 x SHORT) ──
  pos = bpsOffset
  for (let i = 0; i < 4; i++) {
    view.setUint16(pos, bitsPerSample, true)
    pos += 2
  }

  // ── Overflow: XResolution (RATIONAL 72/1) ──
  pos = xResOffset
  view.setUint32(pos, 72, true)
  pos += 4
  view.setUint32(pos, 1, true)
  pos += 4

  // ── Overflow: YResolution (RATIONAL 72/1) ──
  pos = yResOffset
  view.setUint32(pos, 72, true)
  pos += 4
  view.setUint32(pos, 1, true)
  pos += 4

  // ── Pixel data (RGBA) ──
  // ImageData.data is already RGBA interleaved, copy directly
  u8.set(data, stripDataOffset)

  return new Uint8Array(buf)
}
