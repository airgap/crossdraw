/**
 * GIF89a/GIF87a decoder — extracts all frames with timing metadata.
 *
 * Parses the binary GIF format: header, logical screen descriptor,
 * global colour table, graphic control extensions, image descriptors,
 * local colour tables, and LZW-compressed pixel data.
 *
 * @module io/gif-decoder
 */

// ── Types ──────────────────────────────────────────────────────

export interface GIFFrame {
  /** Decoded RGBA pixel data (full canvas size) */
  imageData: ImageData
  /** Delay before showing next frame, in milliseconds */
  delayMs: number
  /** How the frame should be disposed before next frame renders */
  disposal: 'none' | 'background' | 'previous'
  /** Transparent colour index (-1 if none) */
  transparentIndex: number
}

export interface DecodedGIF {
  width: number
  height: number
  frames: GIFFrame[]
  /** Number of times to loop (0 = infinite) */
  loopCount: number
}

// ── Decoder ────────────────────────────────────────────────────

export function decodeGIF(buffer: ArrayBuffer): DecodedGIF {
  const data = new Uint8Array(buffer)
  let pos = 0

  function readByte(): number {
    return data[pos++]!
  }

  function readU16(): number {
    const lo = data[pos]!
    const hi = data[pos + 1]!
    pos += 2
    return lo | (hi << 8)
  }

  function readBytes(n: number): Uint8Array {
    const slice = data.subarray(pos, pos + n)
    pos += n
    return slice
  }

  // ── Header ─────────────────────────────────────────────────

  const sig = String.fromCharCode(data[0]!, data[1]!, data[2]!, data[3]!, data[4]!, data[5]!)
  if (sig !== 'GIF87a' && sig !== 'GIF89a') {
    throw new Error(`Not a GIF file (signature: "${sig}")`)
  }
  pos = 6

  // ── Logical Screen Descriptor ──────────────────────────────

  const width = readU16()
  const height = readU16()
  const packed = readByte()
  const gctFlag = (packed >> 7) & 1
  const gctSize = gctFlag ? 1 << ((packed & 0x07) + 1) : 0
  readByte() // background colour index
  readByte() // pixel aspect ratio

  // ── Global Colour Table ────────────────────────────────────

  let gct: Uint8Array | null = null
  if (gctFlag) {
    gct = readBytes(gctSize * 3)
  }

  // ── Parse blocks ───────────────────────────────────────────

  const frames: GIFFrame[] = []
  let loopCount = 0

  // GCE state for the next image
  let gceDelay = 100 // default 100ms
  let gceDisposal: GIFFrame['disposal'] = 'none'
  let gceTransparentFlag = false
  let gceTransparentIndex = 0

  // Canvas for compositing (some GIFs rely on frame accumulation)
  const canvas = new Uint8ClampedArray(width * height * 4)
  let previousCanvas: Uint8ClampedArray | null = null

  while (pos < data.length) {
    const block = readByte()

    if (block === 0x3b) {
      // Trailer — end of GIF
      break
    }

    if (block === 0x21) {
      // Extension
      const label = readByte()

      if (label === 0xf9) {
        // Graphic Control Extension
        readByte() // block size (always 4)
        const gcePacked = readByte()
        gceDisposal = parseDisposal((gcePacked >> 2) & 0x07)
        gceTransparentFlag = (gcePacked & 0x01) === 1
        gceDelay = readU16() * 10 // centiseconds → milliseconds
        if (gceDelay === 0) gceDelay = 100 // treat 0 as 100ms (common convention)
        gceTransparentIndex = readByte()
        readByte() // block terminator
        continue
      }

      if (label === 0xff) {
        // Application Extension
        const appBlockSize = readByte()
        const appId = readBytes(appBlockSize)
        const appStr = String.fromCharCode(...appId)

        if (appStr === 'NETSCAPE2.0') {
          const subSize = readByte()
          if (subSize === 3) {
            readByte() // sub-block ID (1)
            loopCount = readU16()
            readByte() // block terminator
          } else {
            skipSubBlocks()
          }
        } else {
          skipSubBlocks()
        }
        continue
      }

      // Other extension — skip sub-blocks
      skipSubBlocks()
      continue
    }

    if (block === 0x2c) {
      // Image Descriptor
      const frameLeft = readU16()
      const frameTop = readU16()
      const frameWidth = readU16()
      const frameHeight = readU16()
      const imgPacked = readByte()
      const lctFlag = (imgPacked >> 7) & 1
      const interlaced = ((imgPacked >> 6) & 1) === 1
      const lctSize = lctFlag ? 1 << ((imgPacked & 0x07) + 1) : 0

      // Local Colour Table
      let colourTable: Uint8Array
      if (lctFlag) {
        colourTable = readBytes(lctSize * 3)
      } else if (gct) {
        colourTable = gct
      } else {
        // No colour table — greyscale fallback
        colourTable = new Uint8Array(256 * 3)
        for (let i = 0; i < 256; i++) {
          colourTable[i * 3] = i
          colourTable[i * 3 + 1] = i
          colourTable[i * 3 + 2] = i
        }
      }

      // LZW decompress
      const minCodeSize = readByte()
      const compressedData = readSubBlocks()
      const indices = lzwDecompress(compressedData, minCodeSize, frameWidth * frameHeight)

      // De-interlace if needed
      const finalIndices = interlaced ? deinterlace(indices, frameWidth, frameHeight) : indices

      // Save previous canvas state for 'previous' disposal
      if (gceDisposal === 'previous') {
        previousCanvas = new Uint8ClampedArray(canvas)
      }

      // Render frame pixels onto canvas
      const transparentIdx = gceTransparentFlag ? gceTransparentIndex : -1
      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const srcIdx = y * frameWidth + x
          const colorIdx = finalIndices[srcIdx]!
          if (colorIdx === transparentIdx) continue

          const dstX = frameLeft + x
          const dstY = frameTop + y
          if (dstX >= width || dstY >= height) continue

          const dstOff = (dstY * width + dstX) * 4
          const palOff = colorIdx * 3
          canvas[dstOff] = colourTable[palOff]!
          canvas[dstOff + 1] = colourTable[palOff + 1]!
          canvas[dstOff + 2] = colourTable[palOff + 2]!
          canvas[dstOff + 3] = 255
        }
      }

      // Snapshot the canvas as this frame's ImageData
      const frameImageData = new ImageData(new Uint8ClampedArray(canvas), width, height)

      frames.push({
        imageData: frameImageData,
        delayMs: gceDelay,
        disposal: gceDisposal,
        transparentIndex: transparentIdx,
      })

      // Apply disposal for next frame
      if (gceDisposal === 'background') {
        // Clear the frame region to transparent
        for (let y = 0; y < frameHeight; y++) {
          for (let x = 0; x < frameWidth; x++) {
            const dstX = frameLeft + x
            const dstY = frameTop + y
            if (dstX >= width || dstY >= height) continue
            const dstOff = (dstY * width + dstX) * 4
            canvas[dstOff] = 0
            canvas[dstOff + 1] = 0
            canvas[dstOff + 2] = 0
            canvas[dstOff + 3] = 0
          }
        }
      } else if (gceDisposal === 'previous' && previousCanvas) {
        canvas.set(previousCanvas)
      }

      // Reset GCE state
      gceDelay = 100
      gceDisposal = 'none'
      gceTransparentFlag = false
      gceTransparentIndex = 0

      continue
    }

    // Unknown block — skip
    break
  }

  return { width, height, frames, loopCount }

  // ── Helpers ──────────────────────────────────────────────────

  function skipSubBlocks() {
    while (pos < data.length) {
      const size = data[pos++]!
      if (size === 0) break
      pos += size
    }
  }

  function readSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = []
    let total = 0
    while (pos < data.length) {
      const size = data[pos++]!
      if (size === 0) break
      chunks.push(data.subarray(pos, pos + size))
      total += size
      pos += size
    }
    const result = new Uint8Array(total)
    let off = 0
    for (const chunk of chunks) {
      result.set(chunk, off)
      off += chunk.length
    }
    return result
  }
}

// ── Disposal parsing ───────────────────────────────────────────

function parseDisposal(code: number): GIFFrame['disposal'] {
  switch (code) {
    case 2:
      return 'background'
    case 3:
      return 'previous'
    default:
      return 'none'
  }
}

// ── LZW decompression ──────────────────────────────────────────

function lzwDecompress(data: Uint8Array, minCodeSize: number, pixelCount: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1

  const output = new Uint8Array(pixelCount)
  let outPos = 0

  let codeSize = minCodeSize + 1
  let nextCode = eoiCode + 1
  const maxTableSize = 4096

  // Dictionary: each entry is [prefix, suffix] or a single byte
  // For speed, store as arrays of pixel values
  let table: Uint8Array[] = []

  function initTable() {
    table = []
    for (let i = 0; i < clearCode; i++) {
      table[i] = new Uint8Array([i])
    }
    table[clearCode] = new Uint8Array(0) // clear
    table[eoiCode] = new Uint8Array(0) // eoi
    nextCode = eoiCode + 1
    codeSize = minCodeSize + 1
  }

  // Bit reader
  let bitPos = 0

  function readCode(): number {
    let code = 0
    for (let i = 0; i < codeSize; i++) {
      const byteIdx = (bitPos + i) >> 3
      const bitIdx = (bitPos + i) & 7
      if (byteIdx < data.length && (data[byteIdx]! >> bitIdx) & 1) {
        code |= 1 << i
      }
    }
    bitPos += codeSize
    return code
  }

  initTable()

  let prevEntry: Uint8Array | null = null

  while (bitPos < data.length * 8) {
    const code = readCode()

    if (code === clearCode) {
      initTable()
      prevEntry = null
      continue
    }

    if (code === eoiCode) break

    let entry: Uint8Array

    if (code < nextCode) {
      entry = table[code]!
    } else if (code === nextCode && prevEntry) {
      // KwKwK case
      entry = new Uint8Array(prevEntry.length + 1)
      entry.set(prevEntry)
      entry[prevEntry.length] = prevEntry[0]!
    } else {
      // Invalid code — stop gracefully
      break
    }

    // Output entry
    for (let i = 0; i < entry.length && outPos < pixelCount; i++) {
      output[outPos++] = entry[i]!
    }

    // Add to table
    if (prevEntry && nextCode < maxTableSize) {
      const newEntry = new Uint8Array(prevEntry.length + 1)
      newEntry.set(prevEntry)
      newEntry[prevEntry.length] = entry[0]!
      table[nextCode] = newEntry
      nextCode++
      if (nextCode > 1 << codeSize && codeSize < 12) {
        codeSize++
      }
    }

    prevEntry = entry
  }

  return output
}

// ── De-interlace ───────────────────────────────────────────────

function deinterlace(data: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height)
  const passes = [
    { start: 0, step: 8 }, // Pass 1: every 8th row starting at 0
    { start: 4, step: 8 }, // Pass 2: every 8th row starting at 4
    { start: 2, step: 4 }, // Pass 3: every 4th row starting at 2
    { start: 1, step: 2 }, // Pass 4: every 2nd row starting at 1
  ]

  let srcRow = 0
  for (const pass of passes) {
    for (let y = pass.start; y < height; y += pass.step) {
      const srcOff = srcRow * width
      const dstOff = y * width
      for (let x = 0; x < width; x++) {
        result[dstOff + x] = data[srcOff + x]!
      }
      srcRow++
    }
  }

  return result
}

// ── Convenience ────────────────────────────────────────────────

/** Returns true if the GIF has more than one frame. */
export function isAnimatedGIF(buffer: ArrayBuffer): boolean {
  const data = new Uint8Array(buffer)
  let pos = 0

  // Validate header
  const sig = String.fromCharCode(data[0]!, data[1]!, data[2]!)
  if (sig !== 'GIF') return false
  pos = 6

  // Skip LSD
  pos += 4 // width + height
  const packed = data[pos++]!
  pos += 2 // bg + aspect
  const gctFlag = (packed >> 7) & 1
  if (gctFlag) {
    const gctSize = 1 << ((packed & 0x07) + 1)
    pos += gctSize * 3
  }

  let imageCount = 0
  while (pos < data.length) {
    const block = data[pos++]!
    if (block === 0x3b) break // trailer
    if (block === 0x2c) {
      imageCount++
      if (imageCount > 1) return true
      // Skip image descriptor
      pos += 8
      const imgPacked = data[pos++]!
      const lctFlag = (imgPacked >> 7) & 1
      if (lctFlag) {
        const lctSize = 1 << ((imgPacked & 0x07) + 1)
        pos += lctSize * 3
      }
      pos++ // min code size
      // Skip sub-blocks
      while (pos < data.length) {
        const size = data[pos++]!
        if (size === 0) break
        pos += size
      }
    } else if (block === 0x21) {
      pos++ // label
      while (pos < data.length) {
        const size = data[pos++]!
        if (size === 0) break
        pos += size
      }
    }
  }
  return false
}
