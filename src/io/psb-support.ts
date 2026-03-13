/**
 * PSB (Photoshop Large Document) support.
 *
 * PSB is identical to PSD except:
 *  - Signature is still '8BPS' but version is 2 (not 1)
 *  - Several length fields are 8 bytes instead of 4
 *  - Channel data length uses 8-byte fields
 *  - Supports dimensions > 30,000 px and files > 2 GB
 *
 * This module provides detection, import (delegates to the PSD parser which
 * already handles version 2), and export to PSB binary format.
 */

import type { DesignDocument, Layer, RasterLayer } from '@/types'
import { getRasterData } from '@/store/raster-data'
import { importPSD } from './psd-import'

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Check if a buffer is a PSB (Large Document) file.
 * PSB has signature '8BPS' with version 2.
 */
export function isPSB(data: ArrayBuffer): boolean {
  if (data.byteLength < 6) return false
  const view = new DataView(data)
  const sig =
    String.fromCharCode(view.getUint8(0)) +
    String.fromCharCode(view.getUint8(1)) +
    String.fromCharCode(view.getUint8(2)) +
    String.fromCharCode(view.getUint8(3))
  if (sig !== '8BPS') return false
  const version = view.getUint16(4, false) // big-endian
  return version === 2
}

/**
 * Check if a buffer is a PSD (version 1) file.
 */
export function isPSD(data: ArrayBuffer): boolean {
  if (data.byteLength < 6) return false
  const view = new DataView(data)
  const sig =
    String.fromCharCode(view.getUint8(0)) +
    String.fromCharCode(view.getUint8(1)) +
    String.fromCharCode(view.getUint8(2)) +
    String.fromCharCode(view.getUint8(3))
  if (sig !== '8BPS') return false
  const version = view.getUint16(4, false)
  return version === 1
}

// ── Import ───────────────────────────────────────────────────────────────────

/**
 * Parse a PSB file into a DesignDocument.
 * The existing PSD importer already handles version 2 (PSB), so we delegate.
 */
export async function parsePSB(data: ArrayBuffer): Promise<DesignDocument> {
  if (!isPSB(data)) {
    throw new Error('Not a PSB file (version is not 2)')
  }
  // importPSD already checks for version 1 or 2 and handles PSB length fields
  return importPSD(data)
}

// ── Export ────────────────────────────────────────────────────────────────────

/** Big-endian DataView writer with auto-advancing offset. */
class PSBWriter {
  private buffer: ArrayBuffer
  private view: DataView
  private u8: Uint8Array
  offset: number

  constructor(initialSize: number) {
    this.buffer = new ArrayBuffer(initialSize)
    this.view = new DataView(this.buffer)
    this.u8 = new Uint8Array(this.buffer)
    this.offset = 0
  }

  /** Ensure the internal buffer has at least `needed` more bytes. */
  private ensureCapacity(needed: number): void {
    const required = this.offset + needed
    if (required <= this.buffer.byteLength) return

    let newSize = this.buffer.byteLength * 2
    while (newSize < required) newSize *= 2

    const newBuf = new ArrayBuffer(newSize)
    new Uint8Array(newBuf).set(this.u8)
    this.buffer = newBuf
    this.view = new DataView(this.buffer)
    this.u8 = new Uint8Array(this.buffer)
  }

  writeU8(v: number): void {
    this.ensureCapacity(1)
    this.view.setUint8(this.offset, v)
    this.offset += 1
  }

  writeU16(v: number): void {
    this.ensureCapacity(2)
    this.view.setUint16(this.offset, v, false)
    this.offset += 2
  }

  writeI16(v: number): void {
    this.ensureCapacity(2)
    this.view.setInt16(this.offset, v, false)
    this.offset += 2
  }

  writeU32(v: number): void {
    this.ensureCapacity(4)
    this.view.setUint32(this.offset, v, false)
    this.offset += 4
  }

  writeI32(v: number): void {
    this.ensureCapacity(4)
    this.view.setInt32(this.offset, v, false)
    this.offset += 4
  }

  /** Write a 64-bit unsigned value as two 32-bit words (big-endian). */
  writeU64(v: number): void {
    this.ensureCapacity(8)
    const hi = Math.floor(v / 0x100000000)
    const lo = v >>> 0
    this.view.setUint32(this.offset, hi, false)
    this.view.setUint32(this.offset + 4, lo, false)
    this.offset += 8
  }

  writeASCII(s: string): void {
    this.ensureCapacity(s.length)
    for (let i = 0; i < s.length; i++) {
      this.view.setUint8(this.offset + i, s.charCodeAt(i))
    }
    this.offset += s.length
  }

  writeBytes(data: Uint8Array): void {
    this.ensureCapacity(data.length)
    this.u8.set(data, this.offset)
    this.offset += data.length
  }

  /** Write zero padding bytes. */
  pad(n: number): void {
    this.ensureCapacity(n)
    // Already zero-filled from ArrayBuffer
    this.offset += n
  }

  /** Patch a U32 at a specific offset (for back-patching lengths). */
  patchU32(offset: number, value: number): void {
    this.view.setUint32(offset, value, false)
  }

  /** Patch a U64 at a specific offset (for back-patching PSB lengths). */
  patchU64(offset: number, value: number): void {
    const hi = Math.floor(value / 0x100000000)
    const lo = value >>> 0
    this.view.setUint32(offset, hi, false)
    this.view.setUint32(offset + 4, lo, false)
  }

  /** Return a trimmed copy of the written data. */
  toArrayBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset)
  }
}

/** Collect raster layers (flattened) from a layer tree. */
function collectRasterLayers(layers: Layer[]): RasterLayer[] {
  const result: RasterLayer[] = []
  for (const layer of layers) {
    if (layer.type === 'raster') {
      result.push(layer)
    } else if (layer.type === 'group') {
      result.push(...collectRasterLayers(layer.children))
    }
  }
  return result
}

/**
 * Export a DesignDocument as a PSB (Large Document Format) binary.
 */
export function exportPSB(doc: DesignDocument): ArrayBuffer {
  const artboard = doc.artboards[0]
  if (!artboard) throw new Error('No artboard found')

  const { width, height } = artboard
  const rasterLayers = collectRasterLayers(artboard.layers)

  const w = new PSBWriter(1024 * 1024) // Start with 1MB

  // ── 1. File Header (26 bytes for PSD, 26 for PSB) ─────────────────────
  w.writeASCII('8BPS') // signature
  w.writeU16(2) // version 2 = PSB
  w.pad(6) // reserved
  w.writeU16(rasterLayers.length > 0 ? 4 : 3) // channels (RGBA or RGB)
  w.writeU32(height) // rows
  w.writeU32(width) // columns
  w.writeU16(8) // depth (8 bits per channel)
  w.writeU16(3) // color mode: RGB

  // ── 2. Color Mode Data ─────────────────────────────────────────────────
  w.writeU32(0) // length = 0 for RGB

  // ── 3. Image Resources ─────────────────────────────────────────────────
  w.writeU32(0) // length = 0

  // ── 4. Layer and Mask Information ──────────────────────────────────────
  // PSB uses 8-byte length for the layer/mask info section
  const layerMaskLenOffset = w.offset
  w.writeU64(0) // placeholder — will patch
  const layerMaskStart = w.offset

  if (rasterLayers.length > 0) {
    // Layer info sub-section — also 8-byte length in PSB
    const layerInfoLenOffset = w.offset
    w.writeU64(0) // placeholder
    const layerInfoStart = w.offset

    w.writeI16(rasterLayers.length) // layer count

    // ── Layer records ──
    const channelDataLenOffsets: number[][] = []
    for (const layer of rasterLayers) {
      const imgData = getRasterData(layer.imageChunkId)
      const lw = layer.width
      const lh = layer.height
      const top = Math.round(layer.transform.y)
      const left = Math.round(layer.transform.x)

      w.writeI32(top) // top
      w.writeI32(left) // left
      w.writeI32(top + lh) // bottom
      w.writeI32(left + lw) // right

      const numChannels = imgData ? 4 : 3
      w.writeU16(numChannels) // channel count

      // Channel info: PSB uses 8-byte data length
      const offsets: number[] = []
      for (let ch = 0; ch < numChannels; ch++) {
        const channelId = ch === 3 ? -1 : ch // 0=R, 1=G, 2=B, -1=A
        w.writeI16(channelId)
        offsets.push(w.offset)
        w.writeU64(0) // placeholder for channel data length
      }
      channelDataLenOffsets.push(offsets)

      // Blend mode
      w.writeASCII('8BIM') // blend mode signature
      w.writeASCII('norm') // normal blend
      w.writeU8(Math.round(layer.opacity * 255)) // opacity
      w.writeU8(0) // clipping
      w.writeU8(layer.visible ? 0x00 : 0x02) // flags
      w.writeU8(0) // filler

      // Extra data
      const nameBytes = encodeLayerName(layer.name)
      const extraDataLen = 4 + 4 + nameBytes.length // mask data(4) + blending ranges(4) + name
      w.writeU32(extraDataLen)
      w.writeU32(0) // layer mask data length
      w.writeU32(0) // blending ranges length
      w.writeBytes(nameBytes)
    }

    // ── Channel image data ──
    for (let i = 0; i < rasterLayers.length; i++) {
      const layer = rasterLayers[i]!
      const imgData = getRasterData(layer.imageChunkId)
      const lw = layer.width
      const lh = layer.height
      const offsets = channelDataLenOffsets[i]!
      const numChannels = imgData ? 4 : 3

      for (let ch = 0; ch < numChannels; ch++) {
        const channelStart = w.offset
        w.writeU16(0) // compression = raw

        const pixelCount = lw * lh
        const channelData = new Uint8Array(pixelCount)

        if (imgData) {
          const channelId = ch === 3 ? 3 : ch // RGBA index
          for (let p = 0; p < pixelCount; p++) {
            channelData[p] = imgData.data[p * 4 + channelId]!
          }
        }

        w.writeBytes(channelData)

        // Patch channel data length (includes 2-byte compression field)
        const channelLen = w.offset - channelStart
        w.patchU64(offsets[ch]!, channelLen)
      }
    }

    // Patch layer info length
    const layerInfoLen = w.offset - layerInfoStart
    w.patchU64(layerInfoLenOffset, layerInfoLen)
  }

  // Patch layer/mask info length
  const layerMaskLen = w.offset - layerMaskStart
  w.patchU64(layerMaskLenOffset, layerMaskLen)

  // ── 5. Image Data (composite) ──────────────────────────────────────────
  // Compression = raw
  w.writeU16(0)

  // Write composite image: just white if no layers
  const pixelCount = width * height
  const compositeChannels = 3
  for (let ch = 0; ch < compositeChannels; ch++) {
    const channelData = new Uint8Array(pixelCount)
    channelData.fill(255) // white background
    w.writeBytes(channelData)
  }

  return w.toArrayBuffer()
}

/** Encode a layer name as a Pascal string padded to 4 bytes. */
function encodeLayerName(name: string): Uint8Array {
  const maxLen = Math.min(name.length, 255)
  const nameFieldLen = 1 + maxLen
  const padding = (4 - (nameFieldLen % 4)) % 4
  const buf = new Uint8Array(nameFieldLen + padding)
  buf[0] = maxLen
  for (let i = 0; i < maxLen; i++) {
    buf[1 + i] = name.charCodeAt(i) & 0xff
  }
  return buf
}
