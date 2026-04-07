#!/usr/bin/env bun
/**
 * Generates Chrome extension icons as PNG files.
 * Uses raw pixel buffer — no canvas dependency.
 */

function generateIcon(size: number): Buffer {
  const data = new Uint8Array(size * size * 4)

  const bg = [108, 92, 231, 255] // #6c5ce7
  const fg = [255, 255, 255, 255] // white
  const radius = Math.floor(size * 0.15)

  // Fill background with rounded corners
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4

      // Rounded corner check
      let inside = true
      if (x < radius && y < radius) {
        inside = (x - radius) ** 2 + (y - radius) ** 2 <= radius ** 2
      } else if (x >= size - radius && y < radius) {
        inside = (x - (size - radius - 1)) ** 2 + (y - radius) ** 2 <= radius ** 2
      } else if (x < radius && y >= size - radius) {
        inside = (x - radius) ** 2 + (y - (size - radius - 1)) ** 2 <= radius ** 2
      } else if (x >= size - radius && y >= size - radius) {
        inside = (x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2 <= radius ** 2
      }

      if (inside) {
        data[idx] = bg[0]!
        data[idx + 1] = bg[1]!
        data[idx + 2] = bg[2]!
        data[idx + 3] = bg[3]!
      }
    }
  }

  // Draw a simple "T" shape
  const cx = Math.floor(size / 2)
  const cy = Math.floor(size / 2)
  const barW = Math.floor(size * 0.5)
  const barH = Math.max(2, Math.floor(size * 0.1))
  const stemW = Math.max(2, Math.floor(size * 0.12))
  const stemH = Math.floor(size * 0.4)
  const topY = cy - Math.floor(stemH * 0.5)

  // Horizontal bar of T
  for (let y = topY; y < topY + barH; y++) {
    for (let x = cx - Math.floor(barW / 2); x < cx + Math.floor(barW / 2); x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4
        data[idx] = fg[0]!
        data[idx + 1] = fg[1]!
        data[idx + 2] = fg[2]!
        data[idx + 3] = fg[3]!
      }
    }
  }

  // Vertical stem of T
  for (let y = topY; y < topY + stemH; y++) {
    for (let x = cx - Math.floor(stemW / 2); x < cx + Math.floor(stemW / 2); x++) {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4
        data[idx] = fg[0]!
        data[idx + 1] = fg[1]!
        data[idx + 2] = fg[2]!
        data[idx + 3] = fg[3]!
      }
    }
  }

  // Encode as PNG (minimal encoder)
  return Buffer.from(encodePNG(size, size, data))
}

// Minimal PNG encoder
function encodePNG(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const { deflateSync } = require('zlib') as typeof import('zlib')

  // Add filter byte (0 = None) before each row
  const raw = new Uint8Array(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter: None
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (1 + w * 4) + 1)
  }

  const compressed = deflateSync(Buffer.from(raw))

  const chunks: Uint8Array[] = []

  // Signature
  chunks.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))

  // IHDR
  const ihdr = new Uint8Array(13)
  new DataView(ihdr.buffer).setUint32(0, w)
  new DataView(ihdr.buffer).setUint32(4, h)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  chunks.push(pngChunk('IHDR', ihdr))

  // IDAT
  chunks.push(pngChunk('IDAT', new Uint8Array(compressed)))

  // IEND
  chunks.push(pngChunk('IEND', new Uint8Array(0)))

  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk[4] = type.charCodeAt(0)
  chunk[5] = type.charCodeAt(1)
  chunk[6] = type.charCodeAt(2)
  chunk[7] = type.charCodeAt(3)
  chunk.set(data, 8)
  // CRC32 over type + data
  const crcData = chunk.subarray(4, 8 + data.length)
  view.setUint32(8 + data.length, crc32(crcData))
  return chunk
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function main() {
  for (const size of [16, 48, 128]) {
    const png = generateIcon(size)
    const path = new URL(`../chrome-extension/icons/icon${size}.png`, import.meta.url).pathname
    await Bun.write(path, png)
    console.log(`Generated ${path} (${png.length} bytes)`)
  }
}

main().catch(console.error)
