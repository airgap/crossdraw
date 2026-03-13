/**
 * GIF89a encoder (single-frame and animated multi-frame).
 *
 * Quantizes RGBA ImageData down to 256 colours using a popularity algorithm,
 * then LZW-compresses the indexed pixels and wraps everything in the GIF89a
 * container format.
 */

// ── Colour quantization (popularity) ──

interface QuantResult {
  palette: Uint8Array // 256 * 3 bytes (RGB)
  indices: Uint8Array // one index per pixel
}

/**
 * Quantize an RGBA image to at most 256 colours.
 *
 * Uses a popularity algorithm: bucket every pixel into a reduced colour space,
 * pick the 256 most-used buckets, then map each pixel to the nearest palette
 * entry.
 */
function quantize(imageData: ImageData): QuantResult {
  const { data, width, height } = imageData
  const pixelCount = width * height

  // 1. Build a histogram in a reduced 15-bit colour space (5 bits per channel)
  const shift = 3 // 8 → 5 bits
  const bucketCount = 32 * 32 * 32
  const histogram = new Uint32Array(bucketCount)
  const rSum = new Float64Array(bucketCount)
  const gSum = new Float64Array(bucketCount)
  const bSum = new Float64Array(bucketCount)

  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4
    const a = data[off + 3]!
    if (a === 0) continue // skip fully transparent
    const r = data[off]!
    const g = data[off + 1]!
    const b = data[off + 2]!
    const key = ((r >> shift) << 10) | ((g >> shift) << 5) | (b >> shift)
    histogram[key]!++
    rSum[key]! += r
    gSum[key]! += g
    bSum[key]! += b
  }

  // 2. Pick the 256 most popular buckets
  const entries: { key: number; count: number }[] = []
  for (let k = 0; k < bucketCount; k++) {
    if (histogram[k]! > 0) entries.push({ key: k, count: histogram[k]! })
  }
  entries.sort((a, b) => b.count - a.count)
  const paletteSize = 256
  const chosen = entries.slice(0, paletteSize)

  // Build RGB palette from average colour in each bucket
  const palette = new Uint8Array(paletteSize * 3)
  for (let i = 0; i < chosen.length; i++) {
    const e = chosen[i]!
    const r = Math.round(rSum[e.key]! / e.count)
    const g = Math.round(gSum[e.key]! / e.count)
    const b = Math.round(bSum[e.key]! / e.count)
    palette[i * 3] = r
    palette[i * 3 + 1] = g
    palette[i * 3 + 2] = b
  }

  // Build a fast lookup from bucket key → palette index
  const keyToIndex = new Map<number, number>()
  for (let i = 0; i < chosen.length; i++) {
    keyToIndex.set(chosen[i]!.key, i)
  }

  // 3. Map each pixel to the nearest palette entry
  const indices = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4
    const a = data[off + 3]!
    if (a === 0) {
      indices[i] = 0 // transparent → index 0
      continue
    }
    const r = data[off]!
    const g = data[off + 1]!
    const b = data[off + 2]!
    const key = ((r >> shift) << 10) | ((g >> shift) << 5) | (b >> shift)
    const exact = keyToIndex.get(key)
    if (exact !== undefined) {
      indices[i] = exact
    } else {
      // Brute-force nearest in palette
      let bestDist = Infinity
      let bestIdx = 0
      for (let j = 0; j < chosen.length; j++) {
        const pr = palette[j * 3]!
        const pg = palette[j * 3 + 1]!
        const pb = palette[j * 3 + 2]!
        const dr = r - pr
        const dg = g - pg
        const db = b - pb
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = j
        }
      }
      indices[i] = bestIdx
    }
  }

  return { palette, indices }
}

// ── LZW compression ──

function lzwCompress(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const maxCode = 4096

  // Bit-packing state
  let bits = 0
  let bitCount = 0
  const byteBuffer: number[] = []

  function writeBits(code: number, size: number) {
    bits |= code << bitCount
    bitCount += size
    while (bitCount >= 8) {
      byteBuffer.push(bits & 0xff)
      bits >>= 8
      bitCount -= 8
    }
  }

  // Dictionary: key = (prefix << 12) | suffix, value = code
  let dict = new Map<number, number>()

  function resetDict() {
    dict = new Map()
    for (let i = 0; i < clearCode; i++) {
      dict.set(i, i) // single-byte entries
    }
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
  }

  // Start
  writeBits(clearCode, codeSize)
  resetDict()

  if (indices.length === 0) {
    writeBits(eoiCode, codeSize)
    if (bitCount > 0) byteBuffer.push(bits & 0xff)
    return packSubBlocks(byteBuffer)
  }

  let prefix = indices[0]!

  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i]!
    const key = (prefix << 12) | suffix

    if (dict.has(key)) {
      prefix = dict.get(key)!
    } else {
      writeBits(prefix, codeSize)
      if (nextCode < maxCode) {
        dict.set(key, nextCode)
        nextCode++
        if (nextCode > 1 << codeSize && codeSize < 12) {
          codeSize++
        }
      } else {
        // Table full — emit clear code and reset
        writeBits(clearCode, codeSize)
        resetDict()
      }
      prefix = suffix
    }
  }

  // Write the remaining prefix
  writeBits(prefix, codeSize)
  writeBits(eoiCode, codeSize)

  // Flush remaining bits
  if (bitCount > 0) {
    byteBuffer.push(bits & 0xff)
  }

  return packSubBlocks(byteBuffer)
}

function packSubBlocks(bytes: number[]): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < bytes.length) {
    const blockSize = Math.min(255, bytes.length - i)
    out.push(blockSize)
    for (let j = 0; j < blockSize; j++) {
      out.push(bytes[i + j]!)
    }
    i += blockSize
  }
  out.push(0) // block terminator
  return new Uint8Array(out)
}

// ── GIF assembly ──

/**
 * Encode an ImageData as a single-frame GIF89a image.
 */
export function encodeGIF(imageData: ImageData): Uint8Array {
  const { width, height } = imageData
  const { palette, indices } = quantize(imageData)

  const minCodeSize = 8 // 256-colour palette → minCodeSize = 8
  const lzwData = lzwCompress(indices, minCodeSize)

  // Calculate total size
  // Header (6) + LSD (7) + GCT (768) + Image Descriptor (10)
  // + minCodeSize byte (1) + lzwData + Trailer (1)
  const totalSize = 6 + 7 + 768 + 10 + 1 + lzwData.length + 1
  const buf = new Uint8Array(totalSize)
  const view = new DataView(buf.buffer)
  let offset = 0

  // Header: "GIF89a"
  buf[offset++] = 0x47 // G
  buf[offset++] = 0x49 // I
  buf[offset++] = 0x46 // F
  buf[offset++] = 0x38 // 8
  buf[offset++] = 0x39 // 9
  buf[offset++] = 0x61 // a

  // Logical Screen Descriptor (7 bytes)
  view.setUint16(offset, width, true)
  offset += 2
  view.setUint16(offset, height, true)
  offset += 2
  // Packed field: GCT flag (1), colour resolution (7 = 8 bits), sort (0), GCT size (7 = 256)
  buf[offset++] = 0x80 | (0x07 << 4) | 0x07 // = 0xf7
  buf[offset++] = 0 // background colour index
  buf[offset++] = 0 // pixel aspect ratio

  // Global Colour Table (256 * 3 = 768 bytes)
  buf.set(palette, offset)
  offset += 768

  // Image Descriptor (10 bytes)
  buf[offset++] = 0x2c // Image separator
  view.setUint16(offset, 0, true) // left
  offset += 2
  view.setUint16(offset, 0, true) // top
  offset += 2
  view.setUint16(offset, width, true)
  offset += 2
  view.setUint16(offset, height, true)
  offset += 2
  buf[offset++] = 0 // packed: no local colour table, not interlaced

  // LZW Minimum Code Size
  buf[offset++] = minCodeSize

  // LZW compressed data (sub-blocks)
  buf.set(lzwData, offset)
  offset += lzwData.length

  // Trailer
  buf[offset++] = 0x3b

  return buf.subarray(0, offset)
}

// ── Animated GIF encoding ──

export interface AnimatedGIFOptions {
  /** Delay between frames in milliseconds */
  delayMs: number
  /** Number of times to loop (0 = infinite) */
  loopCount: number
}

/**
 * Encode multiple ImageData frames as an animated GIF89a.
 *
 * All frames must have the same dimensions. Each frame is independently
 * quantized to 256 colours and uses a local colour table.
 */
export function encodeAnimatedGIF(frames: ImageData[], options: AnimatedGIFOptions): Uint8Array {
  if (frames.length === 0) throw new Error('At least one frame is required')

  const { width, height } = frames[0]!
  const delayCs = Math.max(1, Math.round(options.delayMs / 10)) // GIF uses centiseconds

  // Build all frame data first to compute total size
  const frameChunks: Uint8Array[] = []

  for (const frame of frames) {
    const { palette, indices } = quantize(frame)
    const minCodeSize = 8
    const lzwData = lzwCompress(indices, minCodeSize)

    // Graphic Control Extension (8 bytes)
    const gce = new Uint8Array(8)
    gce[0] = 0x21 // Extension introducer
    gce[1] = 0xf9 // Graphic Control label
    gce[2] = 0x04 // Block size (always 4)
    gce[3] = 0x00 // Packed: disposal=none, no user input, no transparent
    gce[4] = delayCs & 0xff // Delay low byte
    gce[5] = (delayCs >> 8) & 0xff // Delay high byte
    gce[6] = 0x00 // Transparent colour index (unused)
    gce[7] = 0x00 // Block terminator

    // Image Descriptor (10 bytes)
    const imgDesc = new Uint8Array(10)
    const imgView = new DataView(imgDesc.buffer)
    imgDesc[0] = 0x2c // Image separator
    imgView.setUint16(1, 0, true) // left
    imgView.setUint16(3, 0, true) // top
    imgView.setUint16(5, width, true)
    imgView.setUint16(7, height, true)
    imgDesc[9] = 0x87 // packed: local colour table flag=1, size=7 (256 entries)

    // Local Colour Table (768 bytes) + minCodeSize (1) + lzwData
    const chunkSize = gce.length + imgDesc.length + 768 + 1 + lzwData.length
    const chunk = new Uint8Array(chunkSize)
    let off = 0

    chunk.set(gce, off)
    off += gce.length
    chunk.set(imgDesc, off)
    off += imgDesc.length
    chunk.set(palette, off)
    off += 768
    chunk[off++] = minCodeSize
    chunk.set(lzwData, off)

    frameChunks.push(chunk)
  }

  // Calculate total size
  // Header (6) + LSD (7) + GCT (768) + NETSCAPE extension (19) + frames + Trailer (1)
  let totalSize = 6 + 7 + 768 + 19 + 1
  for (const c of frameChunks) totalSize += c.length

  const buf = new Uint8Array(totalSize)
  const view = new DataView(buf.buffer)
  let offset = 0

  // Header: "GIF89a"
  buf[offset++] = 0x47 // G
  buf[offset++] = 0x49 // I
  buf[offset++] = 0x46 // F
  buf[offset++] = 0x38 // 8
  buf[offset++] = 0x39 // 9
  buf[offset++] = 0x61 // a

  // Logical Screen Descriptor (7 bytes)
  view.setUint16(offset, width, true)
  offset += 2
  view.setUint16(offset, height, true)
  offset += 2
  buf[offset++] = 0xf7 // GCT flag + colour resolution + GCT size
  buf[offset++] = 0 // background colour index
  buf[offset++] = 0 // pixel aspect ratio

  // Global Colour Table (use first frame's palette as GCT)
  const firstQuant = quantize(frames[0]!)
  buf.set(firstQuant.palette, offset)
  offset += 768

  // NETSCAPE 2.0 Application Extension (for looping)
  buf[offset++] = 0x21 // Extension introducer
  buf[offset++] = 0xff // Application extension label
  buf[offset++] = 0x0b // Block size (11)
  // "NETSCAPE2.0"
  const netscape = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30]
  for (const b of netscape) buf[offset++] = b
  buf[offset++] = 0x03 // Sub-block size
  buf[offset++] = 0x01 // Sub-block ID
  const loopCount = options.loopCount & 0xffff
  buf[offset++] = loopCount & 0xff
  buf[offset++] = (loopCount >> 8) & 0xff
  buf[offset++] = 0x00 // Block terminator

  // Write frame chunks
  for (const chunk of frameChunks) {
    buf.set(chunk, offset)
    offset += chunk.length
  }

  // Trailer
  buf[offset++] = 0x3b

  return buf.subarray(0, offset)
}
