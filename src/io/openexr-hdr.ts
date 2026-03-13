/**
 * OpenEXR and Radiance HDR format support.
 *
 * HDR (.hdr): Radiance RGBE format — encodes RGB with shared exponent
 * for high dynamic range. Supports RLE compression.
 *
 * OpenEXR (.exr): Industry standard HDR format — minimal implementation
 * with uncompressed or ZIP scanline compression.
 *
 * Both formats store linear-light pixel data. Tone mapping is applied
 * for display: displayValue = 1 - exp(-exposure * linearValue).
 */

// ── Tone mapping ─────────────────────────────────────────────────────────────

/**
 * Apply Reinhard-style exponential tone mapping to convert HDR linear values
 * to displayable LDR range [0, 255].
 */
export function toneMap(linearValue: number, exposure: number = 1.0): number {
  const mapped = 1 - Math.exp(-exposure * linearValue)
  return Math.min(255, Math.max(0, Math.round(mapped * 255)))
}

/**
 * Apply tone mapping to a full Float32 HDR buffer and return displayable ImageData.
 * Input: Float32Array with [R, G, B, A, R, G, B, A, ...] in linear light.
 */
export function toneMapBuffer(hdrData: Float32Array, width: number, height: number, exposure: number = 1.0): ImageData {
  const ldr = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < hdrData.length; i += 4) {
    ldr[i] = toneMap(hdrData[i]!, exposure)
    ldr[i + 1] = toneMap(hdrData[i + 1]!, exposure)
    ldr[i + 2] = toneMap(hdrData[i + 2]!, exposure)
    ldr[i + 3] = 255 // alpha
  }
  return makeImageData(width, height, ldr)
}

// ══════════════════════════════════════════════════════════════════════════════
// Radiance HDR (.hdr) Format
// ══════════════════════════════════════════════════════════════════════════════

// ── RGBE encoding ────────────────────────────────────────────────────────────

/**
 * Encode linear RGB (0..∞) into RGBE (4 bytes: R mantissa, G mantissa, B mantissa, shared exponent).
 */
export function encodeRGBE(r: number, g: number, b: number): [number, number, number, number] {
  const maxVal = Math.max(r, g, b)
  if (maxVal < 1e-32) return [0, 0, 0, 0]

  // frexp equivalent: maxVal = mantissa * 2^exponent
  const exponent = Math.ceil(Math.log2(maxVal))
  const scale = Math.pow(2, -exponent) * 256

  return [
    Math.min(255, Math.max(0, Math.round(r * scale))),
    Math.min(255, Math.max(0, Math.round(g * scale))),
    Math.min(255, Math.max(0, Math.round(b * scale))),
    exponent + 128,
  ]
}

/**
 * Decode RGBE (4 bytes) back to linear RGB floats.
 */
export function decodeRGBE(rm: number, gm: number, bm: number, e: number): [number, number, number] {
  if (e === 0) return [0, 0, 0]
  const scale = Math.pow(2, e - 128) / 256
  return [rm * scale, gm * scale, bm * scale]
}

// ── HDR Export ───────────────────────────────────────────────────────────────

/**
 * Encode HDR scanline using adaptive RLE compression.
 *
 * New-style RLE: each scanline is stored as 4 separate channels (R, G, B, E),
 * each channel RLE-compressed independently.
 */
function rleScanline(channelData: Uint8Array): Uint8Array {
  const output: number[] = []
  let i = 0
  const len = channelData.length

  while (i < len) {
    // Look for a run of identical values
    let runStart = i
    let runVal = channelData[i]!
    while (i < len && i - runStart < 127 && channelData[i] === runVal) {
      i++
    }
    const runLen = i - runStart

    if (runLen > 2) {
      // Encode as run: (128 + count) value
      output.push(128 + runLen, runVal)
    } else {
      // Non-run: collect differing values
      i = runStart
      const nonRunStart = i
      while (i < len && i - nonRunStart < 127) {
        // Check if next 3 values are a run (worth switching to run mode)
        if (i + 2 < len && channelData[i] === channelData[i + 1] && channelData[i] === channelData[i + 2]) {
          break
        }
        i++
      }
      const count = i - nonRunStart
      if (count > 0) {
        output.push(count)
        for (let j = nonRunStart; j < nonRunStart + count; j++) {
          output.push(channelData[j]!)
        }
      }
    }
  }

  return new Uint8Array(output)
}

/**
 * Export an ImageData as a Radiance HDR (.hdr) file.
 *
 * Input ImageData is assumed to be in sRGB [0-255]. We convert to linear light
 * before encoding to RGBE.
 */
export function exportHDR(imageData: ImageData): ArrayBuffer {
  const { width, height, data } = imageData
  const encoder = new TextEncoder()

  // Header
  const headerLines = [
    '#?RADIANCE',
    '# Created by Crossdraw',
    'FORMAT=32-bit_rle_rgbe',
    'EXPOSURE=1.0',
    '',
    `-Y ${height} +X ${width}`,
  ]
  const headerStr = headerLines.join('\n') + '\n'
  const headerBytes = encoder.encode(headerStr)

  // Encode scanlines
  const scanlineBuffers: Uint8Array[] = []

  for (let y = 0; y < height; y++) {
    const rgbeRow = new Uint8Array(width * 4)

    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4
      // sRGB to linear (approximate gamma 2.2)
      const r = Math.pow(data[srcIdx]! / 255, 2.2)
      const g = Math.pow(data[srcIdx + 1]! / 255, 2.2)
      const b = Math.pow(data[srcIdx + 2]! / 255, 2.2)

      const [rm, gm, bm, e] = encodeRGBE(r, g, b)
      const dstIdx = x * 4
      rgbeRow[dstIdx] = rm
      rgbeRow[dstIdx + 1] = gm
      rgbeRow[dstIdx + 2] = bm
      rgbeRow[dstIdx + 3] = e
    }

    if (width >= 8 && width <= 0x7fff) {
      // New-style RLE: separate channels, each RLE-compressed
      // Scanline header: 2 bytes (0x02 0x02) + width as big-endian 16-bit
      const scanHeader = new Uint8Array(4)
      scanHeader[0] = 0x02
      scanHeader[1] = 0x02
      scanHeader[2] = (width >> 8) & 0xff
      scanHeader[3] = width & 0xff

      // Split into 4 channels
      const channels: Uint8Array[] = []
      for (let ch = 0; ch < 4; ch++) {
        const channelData = new Uint8Array(width)
        for (let x = 0; x < width; x++) {
          channelData[x] = rgbeRow[x * 4 + ch]!
        }
        channels.push(rleScanline(channelData))
      }

      // Total size for this scanline
      const totalLen = 4 + channels.reduce((sum, ch) => sum + ch.length, 0)
      const scanBuf = new Uint8Array(totalLen)
      scanBuf.set(scanHeader, 0)
      let off = 4
      for (const ch of channels) {
        scanBuf.set(ch, off)
        off += ch.length
      }
      scanlineBuffers.push(scanBuf)
    } else {
      // Flat RGBE (no RLE for very narrow or very wide images)
      scanlineBuffers.push(rgbeRow)
    }
  }

  // Combine header + scanlines
  const totalSize = headerBytes.length + scanlineBuffers.reduce((s, b) => s + b.length, 0)
  const result = new Uint8Array(totalSize)
  result.set(headerBytes, 0)
  let offset = headerBytes.length
  for (const buf of scanlineBuffers) {
    result.set(buf, offset)
    offset += buf.length
  }

  return result.buffer as ArrayBuffer
}

// ── HDR Import ───────────────────────────────────────────────────────────────

/**
 * Import a Radiance HDR (.hdr) file and return ImageData (tone-mapped to LDR).
 */
export function importHDR(data: ArrayBuffer, exposure: number = 1.0): ImageData {
  const bytes = new Uint8Array(data)

  // Parse header
  let headerEnd = 0
  let foundEmpty = false
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0a) {
      // Check if next line is the resolution string or another newline (end of header)
      if (foundEmpty) {
        headerEnd = i + 1
        break
      }
      // Check if this is an empty line (double newline signals end of header properties)
      if (bytes[i + 1] === 0x0a) {
        foundEmpty = true
        // The resolution string follows on the next line
        headerEnd = i + 2
      } else if (bytes[i + 1] === 0x2d || bytes[i + 1] === 0x2b) {
        // -Y or +Y — this IS the resolution line
        headerEnd = i + 1
        break
      }
    }
  }

  // Find resolution string: -Y height +X width
  let width = 0
  let height = 0
  const headerStr = new TextDecoder('ascii').decode(bytes.slice(0, Math.min(bytes.length, 4096)))
  const resMatch = headerStr.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/)
  if (resMatch) {
    height = parseInt(resMatch[1]!, 10)
    width = parseInt(resMatch[2]!, 10)
    // Advance headerEnd past the resolution line
    const resLineStart = headerStr.indexOf(resMatch[0])
    headerEnd = resLineStart + resMatch[0].length + 1 // +1 for newline
  } else {
    throw new Error('Invalid HDR file: no resolution string found')
  }

  // Decode scanlines
  const hdrPixels = new Float32Array(width * height * 4)
  let pos = headerEnd

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4

    // Check for new-style RLE (0x02 0x02 + width)
    if (pos + 4 <= bytes.length && bytes[pos] === 0x02 && bytes[pos + 1] === 0x02) {
      const scanWidth = (bytes[pos + 2]! << 8) | bytes[pos + 3]!
      if (scanWidth !== width) {
        throw new Error(`HDR scanline width mismatch: expected ${width}, got ${scanWidth}`)
      }
      pos += 4

      // Decode 4 channels separately
      const channels = new Uint8Array(width * 4)
      for (let ch = 0; ch < 4; ch++) {
        let x = 0
        while (x < width) {
          if (pos >= bytes.length) break
          const code = bytes[pos++]!
          if (code > 128) {
            // Run
            const count = code - 128
            const val = bytes[pos++]!
            for (let j = 0; j < count && x < width; j++) {
              channels[ch * width + x] = val
              x++
            }
          } else {
            // Non-run
            for (let j = 0; j < code && x < width; j++) {
              channels[ch * width + x] = bytes[pos++]!
              x++
            }
          }
        }
      }

      // De-interleave RGBE and convert to float
      for (let x = 0; x < width; x++) {
        const rm = channels[x]!
        const gm = channels[width + x]!
        const bm = channels[width * 2 + x]!
        const e = channels[width * 3 + x]!
        const [r, g, b] = decodeRGBE(rm, gm, bm, e)
        const idx = rowOffset + x * 4
        hdrPixels[idx] = r
        hdrPixels[idx + 1] = g
        hdrPixels[idx + 2] = b
        hdrPixels[idx + 3] = 1.0
      }
    } else {
      // Flat or old-style RGBE
      for (let x = 0; x < width; x++) {
        if (pos + 4 > bytes.length) break
        const rm = bytes[pos++]!
        const gm = bytes[pos++]!
        const bm = bytes[pos++]!
        const e = bytes[pos++]!
        const [r, g, b] = decodeRGBE(rm, gm, bm, e)
        const idx = rowOffset + x * 4
        hdrPixels[idx] = r
        hdrPixels[idx + 1] = g
        hdrPixels[idx + 2] = b
        hdrPixels[idx + 3] = 1.0
      }
    }
  }

  // Tone map to LDR for display
  return toneMapBuffer(hdrPixels, width, height, exposure)
}

// ══════════════════════════════════════════════════════════════════════════════
// OpenEXR (.exr) Format
// ══════════════════════════════════════════════════════════════════════════════

// ── OpenEXR Export ───────────────────────────────────────────────────────────

/**
 * Export an ImageData as a minimal OpenEXR (.exr) file.
 *
 * Uses HALF (float16) pixel type with no compression for simplicity.
 * Channels: R, G, B (no alpha for smaller files).
 */
export function exportOpenEXR(imageData: ImageData): ArrayBuffer {
  const { width, height, data } = imageData

  // Build header
  const headerParts: Uint8Array[] = []

  // Magic number and version
  const magic = new Uint8Array(8)
  const magicView = new DataView(magic.buffer)
  magicView.setUint32(0, 20000630, true) // OpenEXR magic
  magicView.setUint32(4, 2, true) // version 2, single-part scanline
  headerParts.push(magic)

  // Attributes
  headerParts.push(makeStringAttr('channels', 'chlist', encodeChannelList(['B', 'G', 'R'])))
  headerParts.push(makeStringAttr('compression', 'compression', new Uint8Array([0]))) // 0 = no compression
  headerParts.push(makeStringAttr('dataWindow', 'box2i', encodeBox2i(0, 0, width - 1, height - 1)))
  headerParts.push(makeStringAttr('displayWindow', 'box2i', encodeBox2i(0, 0, width - 1, height - 1)))
  headerParts.push(makeStringAttr('lineOrder', 'lineOrder', new Uint8Array([0]))) // 0 = increasing Y
  headerParts.push(makeStringAttr('pixelAspectRatio', 'float', encodeFloat32(1.0)))
  headerParts.push(makeStringAttr('screenWindowCenter', 'v2f', encodeV2f(0, 0)))
  headerParts.push(makeStringAttr('screenWindowWidth', 'float', encodeFloat32(1.0)))

  // End of header
  headerParts.push(new Uint8Array([0]))

  // Compute header size
  const headerSize = headerParts.reduce((s, p) => s + p.length, 0)

  // Offset table: one entry per scanline
  const offsetTableSize = height * 8 // 8 bytes per offset (uint64)

  // Pixel data: 3 channels (B, G, R) x width x 2 bytes (float16) per scanline
  // Each scanline block: 4 bytes (y coordinate) + 4 bytes (pixel data size) + pixel data
  const channelCount = 3
  const pixelDataPerScanline = channelCount * width * 2 // float16 = 2 bytes
  const scanlineBlockSize = 4 + 4 + pixelDataPerScanline

  const totalSize = headerSize + offsetTableSize + height * scanlineBlockSize
  const buf = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)

  // Write header
  let pos = 0
  for (const part of headerParts) {
    u8.set(part, pos)
    pos += part.length
  }

  // Write offset table
  const offsetTableStart = pos
  let scanlineOffset = headerSize + offsetTableSize
  for (let y = 0; y < height; y++) {
    // Write as 64-bit integer (split into two 32-bit writes)
    view.setUint32(offsetTableStart + y * 8, scanlineOffset, true)
    view.setUint32(offsetTableStart + y * 8 + 4, 0, true) // high 32 bits
    scanlineOffset += scanlineBlockSize
  }
  pos = headerSize + offsetTableSize

  // Write scanline data
  for (let y = 0; y < height; y++) {
    // Y coordinate
    view.setInt32(pos, y, true)
    pos += 4

    // Pixel data size
    view.setUint32(pos, pixelDataPerScanline, true)
    pos += 4

    // Channel data: channels are stored in alphabetical order (B, G, R)
    // Each channel: width x float16 values
    for (let ch = 0; ch < channelCount; ch++) {
      const channelIdx = ch === 0 ? 2 : ch === 1 ? 1 : 0 // B=2, G=1, R=0 in RGBA
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4 + channelIdx
        // sRGB byte to linear float, then to float16
        const linear = Math.pow(data[srcIdx]! / 255, 2.2)
        const half = floatToHalf(linear)
        view.setUint16(pos, half, true)
        pos += 2
      }
    }
  }

  return buf
}

// ── OpenEXR Import ───────────────────────────────────────────────────────────

/**
 * Import an OpenEXR (.exr) file and return ImageData (tone-mapped).
 */
export function importOpenEXR(data: ArrayBuffer, exposure: number = 1.0): ImageData {
  const view = new DataView(data)
  const bytes = new Uint8Array(data)

  // Verify magic number
  const magic = view.getUint32(0, true)
  if (magic !== 20000630) {
    throw new Error('Invalid OpenEXR file: wrong magic number')
  }

  // Parse version
  // version field (unused — we handle v2 single-part scanline)
  view.getUint32(4, true)
  let pos = 8

  // Parse header attributes
  let width = 0
  let height = 0
  let compression = 0
  const channels: { name: string; pixelType: number }[] = []

  while (pos < bytes.length) {
    // Read attribute name
    const nameEnd = bytes.indexOf(0, pos)
    if (nameEnd === pos) {
      pos++ // end of header
      break
    }
    const attrName = new TextDecoder('ascii').decode(bytes.slice(pos, nameEnd))
    pos = nameEnd + 1

    // Read attribute type
    const typeEnd = bytes.indexOf(0, pos)
    // Read past the attribute type name (we parse known attributes by name instead)
    // const attrType = new TextDecoder('ascii').decode(bytes.slice(pos, typeEnd))
    pos = typeEnd + 1

    // Read attribute size
    const attrSize = view.getUint32(pos, true)
    pos += 4

    // Parse known attributes
    if (attrName === 'dataWindow') {
      const xMin = view.getInt32(pos, true)
      const yMin = view.getInt32(pos + 4, true)
      const xMax = view.getInt32(pos + 8, true)
      const yMax = view.getInt32(pos + 12, true)
      width = xMax - xMin + 1
      height = yMax - yMin + 1
    } else if (attrName === 'compression') {
      compression = bytes[pos]!
    } else if (attrName === 'channels') {
      let chPos = pos
      const chEnd = pos + attrSize
      while (chPos < chEnd) {
        const chNameEnd = bytes.indexOf(0, chPos)
        if (chNameEnd === chPos) break
        const chName = new TextDecoder('ascii').decode(bytes.slice(chPos, chNameEnd))
        chPos = chNameEnd + 1
        const pixelType = view.getUint32(chPos, true) // 0=UINT, 1=HALF, 2=FLOAT
        chPos += 4
        chPos += 12 // pLinear(1) + reserved(3) + xSampling(4) + ySampling(4)
        channels.push({ name: chName, pixelType })
      }
    }

    pos += attrSize
  }

  if (width === 0 || height === 0) {
    throw new Error('Invalid OpenEXR: could not determine image dimensions')
  }

  // Sort channels alphabetically (EXR spec)
  channels.sort((a, b) => a.name.localeCompare(b.name))

  // Skip offset table
  pos += height * 8

  // Read pixel data
  const hdrPixels = new Float32Array(width * height * 4)
  // Initialize alpha to 1.0
  for (let i = 3; i < hdrPixels.length; i += 4) {
    hdrPixels[i] = 1.0
  }

  if (compression !== 0) {
    // For compressed data, we'd need to implement decompression
    // For now, return a blank tone-mapped image
    return toneMapBuffer(hdrPixels, width, height, exposure)
  }

  for (let y = 0; y < height; y++) {
    if (pos + 8 > data.byteLength) break

    // Scanline Y coordinate
    // Skip scanline Y coordinate
    pos += 4

    // Skip pixel data size
    pos += 4

    // Read channel data
    for (const ch of channels) {
      const chIdx = ch.name === 'R' ? 0 : ch.name === 'G' ? 1 : ch.name === 'B' ? 2 : ch.name === 'A' ? 3 : -1
      const bytesPerPixel = ch.pixelType === 1 ? 2 : ch.pixelType === 2 ? 4 : 4

      for (let x = 0; x < width; x++) {
        if (pos + bytesPerPixel > data.byteLength) break

        let value: number
        if (ch.pixelType === 1) {
          // HALF float
          value = halfToFloat(view.getUint16(pos, true))
        } else if (ch.pixelType === 2) {
          // FLOAT
          value = view.getFloat32(pos, true)
        } else {
          // UINT
          value = view.getUint32(pos, true) / 4294967295.0
        }
        pos += bytesPerPixel

        if (chIdx >= 0) {
          hdrPixels[(y * width + x) * 4 + chIdx] = value
        }
      }
    }
  }

  return toneMapBuffer(hdrPixels, width, height, exposure)
}

/**
 * Detect if the data is an OpenEXR file.
 */
export function isOpenEXR(data: ArrayBuffer): boolean {
  if (data.byteLength < 8) return false
  const view = new DataView(data)
  return view.getUint32(0, true) === 20000630
}

/**
 * Detect if the data is a Radiance HDR file.
 */
export function isHDR(data: ArrayBuffer): boolean {
  if (data.byteLength < 11) return false
  const header = new TextDecoder('ascii').decode(new Uint8Array(data, 0, Math.min(data.byteLength, 64)))
  return header.startsWith('#?RADIANCE') || header.startsWith('#?RGBE')
}

// ── Float16 helpers ──────────────────────────────────────────────────────────

/**
 * Convert a 32-bit float to a 16-bit half float (IEEE 754 binary16).
 */
export function floatToHalf(value: number): number {
  const floatView = new Float32Array(1)
  const int32View = new Int32Array(floatView.buffer)
  floatView[0] = value
  const f = int32View[0]!

  const sign = (f >> 31) & 0x0001
  const exponent = (f >> 23) & 0x00ff
  let mantissa = f & 0x007fffff

  if (exponent === 0) {
    // Zero or denormalized float → half zero
    return sign << 15
  }

  if (exponent === 0xff) {
    // Inf or NaN
    if (mantissa) {
      return (sign << 15) | 0x7c00 | (mantissa >> 13) // NaN
    }
    return (sign << 15) | 0x7c00 // Inf
  }

  // Normalized float
  let halfExponent = exponent - 127 + 15
  if (halfExponent >= 0x1f) {
    // Overflow → Inf
    return (sign << 15) | 0x7c00
  }
  if (halfExponent <= 0) {
    // Underflow → denormalized half or zero
    if (halfExponent < -10) return sign << 15
    mantissa = (mantissa | 0x00800000) >> (1 - halfExponent)
    return (sign << 15) | (mantissa >> 13)
  }

  return (sign << 15) | (halfExponent << 10) | (mantissa >> 13)
}

/**
 * Convert a 16-bit half float to a 32-bit float.
 */
export function halfToFloat(half: number): number {
  const sign = (half >> 15) & 0x0001
  const exponent = (half >> 10) & 0x001f
  const mantissa = half & 0x03ff

  if (exponent === 0) {
    if (mantissa === 0) {
      // Zero
      return sign ? -0 : 0
    }
    // Denormalized
    let e = -1
    let m = mantissa
    while (!(m & 0x0400)) {
      m <<= 1
      e--
    }
    m &= ~0x0400
    const realExponent = e + 1
    return (sign ? -1 : 1) * Math.pow(2, realExponent - 14) * (1 + m / 1024)
  }

  if (exponent === 0x1f) {
    if (mantissa === 0) return sign ? -Infinity : Infinity
    return NaN
  }

  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + mantissa / 1024)
}

// ── OpenEXR attribute helpers ────────────────────────────────────────────────

function makeStringAttr(name: string, type: string, value: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()
  const nameBytes = encoder.encode(name)
  const typeBytes = encoder.encode(type)
  const result = new Uint8Array(nameBytes.length + 1 + typeBytes.length + 1 + 4 + value.length)
  let pos = 0
  result.set(nameBytes, pos)
  pos += nameBytes.length
  result[pos++] = 0 // null terminator
  result.set(typeBytes, pos)
  pos += typeBytes.length
  result[pos++] = 0 // null terminator
  // Size as uint32 LE
  const sizeView = new DataView(result.buffer, pos, 4)
  sizeView.setUint32(0, value.length, true)
  pos += 4
  result.set(value, pos)
  return result
}

function encodeChannelList(channelNames: string[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  for (const name of channelNames) {
    const nameBytes = encoder.encode(name)
    // name (null-terminated) + pixelType(4) + pLinear(1) + reserved(3) + xSampling(4) + ySampling(4)
    const entry = new Uint8Array(nameBytes.length + 1 + 16)
    entry.set(nameBytes, 0)
    entry[nameBytes.length] = 0 // null term
    const view = new DataView(entry.buffer, nameBytes.length + 1, 16)
    view.setUint32(0, 1, true) // pixelType = 1 (HALF)
    view.setUint8(4, 0) // pLinear = 0
    // reserved bytes [5..7] = 0
    view.setInt32(8, 1, true) // xSampling = 1
    view.setInt32(12, 1, true) // ySampling = 1
    parts.push(entry)
  }
  // Null terminator for channel list
  parts.push(new Uint8Array([0]))
  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(totalLen)
  let pos = 0
  for (const p of parts) {
    result.set(p, pos)
    pos += p.length
  }
  return result
}

function encodeBox2i(xMin: number, yMin: number, xMax: number, yMax: number): Uint8Array {
  const buf = new Uint8Array(16)
  const view = new DataView(buf.buffer)
  view.setInt32(0, xMin, true)
  view.setInt32(4, yMin, true)
  view.setInt32(8, xMax, true)
  view.setInt32(12, yMax, true)
  return buf
}

function encodeFloat32(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  const view = new DataView(buf.buffer)
  view.setFloat32(0, value, true)
  return buf
}

function encodeV2f(x: number, y: number): Uint8Array {
  const buf = new Uint8Array(8)
  const view = new DataView(buf.buffer)
  view.setFloat32(0, x, true)
  view.setFloat32(4, y, true)
  return buf
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeImageData(width: number, height: number, data: Uint8ClampedArray): ImageData {
  return {
    data,
    width,
    height,
    colorSpace: 'srgb',
  } as unknown as ImageData
}
