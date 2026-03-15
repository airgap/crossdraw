/**
 * PSD (Adobe Photoshop) file import.
 *
 * Parses the PSD binary format and converts it into a Crossdraw DesignDocument.
 * Handles: file header, layer info (names, bounds, opacity, visibility),
 * channel image data (raw + RLE/PackBits), layer masks, and group layer structure.
 *
 * Limitations: text layers, smart objects, layer effects, and adjustment layers
 * are imported as rasterised layers.  Only RGB color mode is supported.
 */

import { v4 as uuid } from 'uuid'
import type { DesignDocument, Layer, RasterLayer, GroupLayer, BlendMode } from '@/types'
import { storeRasterData } from '@/store/raster-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Big-endian DataView reader with an auto-advancing offset. */
class PSDReader {
  private view: DataView
  offset: number

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.offset = 0
  }

  get length(): number {
    return this.view.byteLength
  }

  u8(): number {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  i8(): number {
    const v = this.view.getInt8(this.offset)
    this.offset += 1
    return v
  }

  u16(): number {
    const v = this.view.getUint16(this.offset, false)
    this.offset += 2
    return v
  }

  i16(): number {
    const v = this.view.getInt16(this.offset, false)
    this.offset += 2
    return v
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, false)
    this.offset += 4
    return v
  }

  i32(): number {
    const v = this.view.getInt32(this.offset, false)
    this.offset += 4
    return v
  }

  /** Read `n` bytes as a new Uint8Array (copies). */
  bytes(n: number): Uint8Array {
    const arr = new Uint8Array(this.view.buffer, this.offset, n)
    const copy = new Uint8Array(n)
    copy.set(arr)
    this.offset += n
    return copy
  }

  /** Read `n` bytes as ASCII string. */
  ascii(n: number): string {
    let s = ''
    for (let i = 0; i < n; i++) {
      s += String.fromCharCode(this.view.getUint8(this.offset + i))
    }
    this.offset += n
    return s
  }

  /** Read a Pascal string (first byte = length), padded to even boundary. */
  pascalString(): string {
    const len = this.u8()
    const str = len > 0 ? this.ascii(len) : ''
    // Pascal strings in PSD are padded to make the total (1 + len) even
    if ((len + 1) % 2 !== 0) {
      this.offset += 1
    }
    return str
  }

  skip(n: number): void {
    this.offset += n
  }

  /** Check if we've gone past the end. */
  remaining(): number {
    return this.view.byteLength - this.offset
  }
}

// ── PSD blend mode mapping ──────────────────────────────────────────────────

const BLEND_MODE_MAP: Record<string, BlendMode> = {
  norm: 'normal',
  dark: 'darken',
  lite: 'lighten',
  'mul ': 'multiply',
  scrn: 'screen',
  over: 'overlay',
  sLit: 'soft-light',
  hLit: 'hard-light',
  diff: 'difference',
  smud: 'exclusion',
  'div ': 'color-dodge',
  idiv: 'color-burn',
  'hue ': 'hue',
  'sat ': 'saturation',
  colr: 'color',
  'lum ': 'luminosity',
  lbrn: 'linear-burn',
  lddg: 'linear-dodge',
  vLit: 'vivid-light',
  lLit: 'linear-light',
  pLit: 'pin-light',
  hMix: 'hard-mix',
  diss: 'normal', // dissolve → fallback to normal
  pass: 'pass-through',
}

function mapBlendMode(key: string): BlendMode {
  return BLEND_MODE_MAP[key] ?? 'normal'
}

// ── RLE (PackBits) decompression ────────────────────────────────────────────

function decompressPackBits(reader: PSDReader, unpackedLength: number): Uint8Array {
  const result = new Uint8Array(unpackedLength)
  let pos = 0
  while (pos < unpackedLength) {
    const n = reader.i8()
    if (n >= 0) {
      // Copy next n+1 bytes literally
      const count = n + 1
      for (let i = 0; i < count && pos < unpackedLength; i++) {
        result[pos++] = reader.u8()
      }
    } else if (n > -128) {
      // Repeat next byte 1-n times
      const count = 1 - n
      const val = reader.u8()
      for (let i = 0; i < count && pos < unpackedLength; i++) {
        result[pos++] = val
      }
    }
    // n === -128 is a no-op
  }
  return result
}

// ── Per-layer parsed info ───────────────────────────────────────────────────

interface MaskBounds {
  top: number
  left: number
  bottom: number
  right: number
  defaultColor: number // 0 or 255
}

interface PSDLayerInfo {
  name: string
  top: number
  left: number
  bottom: number
  right: number
  channelCount: number
  channels: { id: number; dataLength: number; _data?: Uint8Array }[]
  blendMode: BlendMode
  opacity: number // 0-1
  visible: boolean
  flags: number
  /** Section divider type: 0=none, 1=open folder, 2=closed folder, 3=bounding end */
  sectionDivider: number
  /** Layer mask bounds (if present) — used for channel -2 dimensions */
  maskBounds: MaskBounds | null
  /** Clipping base flag: 0=base, 1=non-base (clipping layer) */
  clipping: number
}

// ── Main import function ────────────────────────────────────────────────────

export async function importPSD(buffer: ArrayBuffer): Promise<DesignDocument> {
  const r = new PSDReader(buffer)

  // ── 1. File Header ──────────────────────────────────────────────────────
  const signature = r.ascii(4)
  if (signature !== '8BPS') {
    throw new Error(`Not a PSD file (invalid signature "${signature}")`)
  }

  const version = r.u16()
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported PSD version ${version}`)
  }
  const isPSB = version === 2

  r.skip(6) // reserved

  r.u16() // numChannels — not used for layer-based import
  const height = r.u32()
  const width = r.u32()
  const depth = r.u16()
  const colorMode = r.u16()

  if (colorMode !== 3) {
    throw new Error(`Only RGB color mode is supported (got mode ${colorMode})`)
  }
  if (depth !== 8 && depth !== 16) {
    throw new Error(`Only 8-bit and 16-bit channels are supported (got ${depth})`)
  }

  // ── 2. Color Mode Data ────────────────────────────────────────────────
  const colorModeLen = r.u32()
  r.skip(colorModeLen)

  // ── 3. Image Resources ────────────────────────────────────────────────
  const imageResourcesLen = r.u32()
  r.skip(imageResourcesLen)

  // ── 4. Layer and Mask Information ─────────────────────────────────────
  const layerMaskInfoLen = isPSB ? Number(r.u32()) * 0x100000000 + r.u32() : r.u32()
  const layerMaskEnd = r.offset + layerMaskInfoLen

  const psdLayers: PSDLayerInfo[] = []

  if (layerMaskInfoLen > 0) {
    // Layer info sub-section
    const layerInfoLen = isPSB ? Number(r.u32()) * 0x100000000 + r.u32() : r.u32()
    const layerInfoEnd = r.offset + layerInfoLen

    if (layerInfoLen > 0) {
      let layerCount = r.i16()
      // Negative count means first alpha channel contains transparency
      if (layerCount < 0) layerCount = -layerCount
      // ── Parse each layer record ───────────────────────────────────
      for (let i = 0; i < layerCount; i++) {
        const top = r.i32()
        const left = r.i32()
        const bottom = r.i32()
        const right = r.i32()
        const channelCount = r.u16()

        const channels: { id: number; dataLength: number; _data?: Uint8Array }[] = []
        for (let c = 0; c < channelCount; c++) {
          const id = r.i16()
          const dataLength = isPSB ? Number(r.u32()) * 0x100000000 + r.u32() : r.u32()
          channels.push({ id, dataLength })
        }

        // Blend mode signature
        const blendSig = r.ascii(4)
        if (blendSig !== '8BIM') {
          throw new Error(`Invalid blend mode signature "${blendSig}"`)
        }
        const blendKey = r.ascii(4)
        const blendMode = mapBlendMode(blendKey)
        const opacityRaw = r.u8()
        const opacity = opacityRaw / 255
        const clipping = r.u8()
        const flags = r.u8()
        r.skip(1) // filler

        const visible = (flags & 0x02) === 0 // bit 1 set means invisible

        // Extra data
        const extraDataLen = r.u32()
        const extraDataEnd = r.offset + extraDataLen

        // Layer mask data — parse bounds for channel -2 sizing
        const layerMaskDataLen = r.u32()
        const layerMaskDataEnd = r.offset + layerMaskDataLen
        let maskBounds: MaskBounds | null = null
        if (layerMaskDataLen >= 16) {
          const maskTop = r.i32()
          const maskLeft = r.i32()
          const maskBottom = r.i32()
          const maskRight = r.i32()
          const defaultColor = layerMaskDataLen >= 17 ? r.u8() : 0
          maskBounds = { top: maskTop, left: maskLeft, bottom: maskBottom, right: maskRight, defaultColor }
        }
        r.offset = layerMaskDataEnd

        // Blending ranges
        const blendingRangesLen = r.u32()
        r.skip(blendingRangesLen)

        // Layer name — Pascal string padded to multiple of 4
        const nameLen = r.u8()
        const name = nameLen > 0 ? r.ascii(nameLen) : `Layer ${i + 1}`
        // Pad to multiple of 4 from the start of the name field
        const nameFieldLen = nameLen + 1
        const padding = (4 - (nameFieldLen % 4)) % 4
        r.skip(padding)

        // Parse additional layer information (tagged blocks) for section dividers
        let sectionDivider = 0
        while (r.offset < extraDataEnd - 4) {
          const tagSig = r.ascii(4)
          if (tagSig !== '8BIM' && tagSig !== '8B64') {
            // Not a valid tag, rewind and break
            r.offset -= 4
            break
          }
          const tagKey = r.ascii(4)
          let tagLen: number
          // 8B64 uses 8-byte lengths for certain keys in PSB, but for simplicity
          // and PSD v1, use 4-byte lengths
          if (isPSB && tagSig === '8B64') {
            tagLen = Number(r.u32()) * 0x100000000 + r.u32()
          } else {
            tagLen = r.u32()
          }
          const tagEnd = r.offset + tagLen
          // Pad to even
          const paddedEnd = tagEnd + (tagEnd % 2)

          if (tagKey === 'lsct' || tagKey === 'lsdk') {
            // Section divider
            sectionDivider = r.u32()
          }

          r.offset = paddedEnd
        }

        r.offset = extraDataEnd

        psdLayers.push({
          name,
          top,
          left,
          bottom,
          right,
          channelCount,
          channels,
          blendMode,
          opacity,
          visible,
          flags,
          sectionDivider,
          maskBounds,
          clipping,
        })
      }

      // ── Parse channel image data for each layer ─────────────────
      for (const layer of psdLayers) {
        const lw = layer.right - layer.left
        const lh = layer.bottom - layer.top

        // Mask dimensions (for channel -2)
        const mw = layer.maskBounds ? layer.maskBounds.right - layer.maskBounds.left : 0
        const mh = layer.maskBounds ? layer.maskBounds.bottom - layer.maskBounds.top : 0

        for (const chan of layer.channels) {
          // Determine the pixel dimensions for this channel
          const isMaskChannel = chan.id === -2
          const chanW = isMaskChannel ? mw : lw
          const chanH = isMaskChannel ? mh : lh

          // Track start offset for bounded reads
          const chanStartOffset = r.offset

          if (chanW <= 0 || chanH <= 0) {
            // Empty channel — skip data
            r.skip(chan.dataLength)
            continue
          }

          const compression = r.u16()
          const pixelCount = chanW * chanH
          const bytesPerPixel = depth === 16 ? 2 : 1
          const unpackedLen = pixelCount * bytesPerPixel

          if (compression === 0) {
            // Raw
            chan._data = r.bytes(unpackedLen)
          } else if (compression === 1) {
            // RLE — read scan line byte counts first
            const scanLineCounts = new Array(chanH)
            for (let row = 0; row < chanH; row++) {
              scanLineCounts[row] = isPSB ? r.u32() : r.u16()
            }
            chan._data = decompressPackBits(r, unpackedLen)
          } else {
            // ZIP or unknown — skip the rest of the channel data
            // dataLength includes the 2-byte compression field we already read
            r.skip(chan.dataLength - 2)
            chan._data = new Uint8Array(unpackedLen) // transparent
          }

          // Ensure reader position matches expected end to prevent offset drift
          const expectedEnd = chanStartOffset + chan.dataLength
          if (r.offset !== expectedEnd && chan.dataLength > 0) {
            r.offset = expectedEnd
          }
        }
      }
    }

    // Skip to end of layer info sub-section
    r.offset = layerInfoEnd

    // ── 4b. Global layer mask info ───────────────────────────────────
    if (r.offset < layerMaskEnd) {
      const globalMaskLen = r.u32()
      if (globalMaskLen > 0) {
        r.skip(globalMaskLen)
      }
    }

    // ── 4c. Additional layer information (tagged blocks) ─────────────
    // Some PSDs (16-bit, 32-bit, newer Photoshop versions) store layer
    // data here instead of the main layer info section.
    if (psdLayers.length === 0 && r.offset < layerMaskEnd) {
      parseAdditionalLayerInfo(r, layerMaskEnd, psdLayers, isPSB, depth)
    }
  }

  // Skip remaining layer/mask info
  r.offset = layerMaskEnd

  // ── 5. Build Crossdraw document ───────────────────────────────────────

  const is16bit = depth === 16

  // If no layers were parsed, fall back to the composite image data
  if (psdLayers.length === 0 && r.remaining() > 0) {
    readCompositeAsLayer(r, width, height, depth, psdLayers)
  }

  const layers = buildLayers(psdLayers, width, height, is16bit)

  const now = new Date().toISOString()
  const artboardId = uuid()

  const doc: DesignDocument = {
    id: uuid(),
    metadata: {
      title: 'PSD Import',
      author: '',
      created: now,
      modified: now,
      colorspace: 'srgb',
      width,
      height,
    },
    artboards: [
      {
        id: artboardId,
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width,
        height,
        backgroundColor: '#ffffff',
        layers,
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }

  return doc
}

// ── Parse additional layer information blocks ───────────────────────────────

/**
 * Scan the additional layer information section for Layr/Lr16/Lr32 tagged
 * blocks.  These contain the same layer-record + channel-data structure as
 * the main layer info section but are used by 16/32-bit PSDs and newer
 * Photoshop versions that moved layer data here.
 */
function parseAdditionalLayerInfo(
  r: PSDReader,
  endOffset: number,
  psdLayers: PSDLayerInfo[],
  isPSB: boolean,
  depth: number,
) {
  while (r.offset < endOffset - 12) {
    const tagSig = r.ascii(4)
    if (tagSig !== '8BIM' && tagSig !== '8B64') {
      // Not a valid tagged block — stop scanning
      break
    }

    const tagKey = r.ascii(4)

    // Length: 8B64 uses 8-byte lengths for large-resource keys in PSB
    const useLongLength =
      isPSB &&
      tagSig === '8B64' &&
      ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD', 'cinf', 'lnkE'].includes(tagKey)
    let tagLen: number
    if (useLongLength) {
      tagLen = Number(r.u32()) * 0x100000000 + r.u32()
    } else {
      tagLen = r.u32()
    }

    const tagEnd = r.offset + tagLen
    // Pad to even
    const paddedEnd = tagEnd + (tagEnd % 2)

    if (tagKey === 'Layr' || tagKey === 'Lr16' || tagKey === 'Lr32') {
      // This block contains the same structure as the main layer info section
      const blockDepth = tagKey === 'Lr32' ? 32 : tagKey === 'Lr16' ? 16 : depth
      parseLayerBlock(r, psdLayers, isPSB, blockDepth, tagEnd)
      break // Only process the first layer block found
    }

    r.offset = paddedEnd
  }
}

/**
 * Parse a layer info block (layer count + records + channel data).
 * Same structure as the main layer info section.
 */
function parseLayerBlock(
  r: PSDReader,
  psdLayers: PSDLayerInfo[],
  isPSB: boolean,
  depth: number,
  blockEnd: number,
) {
  if (r.offset >= blockEnd) return

  let layerCount = r.i16()
  if (layerCount < 0) layerCount = -layerCount
  if (layerCount === 0) return

  // Parse layer records
  for (let i = 0; i < layerCount && r.offset < blockEnd; i++) {
    const top = r.i32()
    const left = r.i32()
    const bottom = r.i32()
    const right = r.i32()
    const channelCount = r.u16()

    const channels: { id: number; dataLength: number; _data?: Uint8Array }[] = []
    for (let c = 0; c < channelCount; c++) {
      const id = r.i16()
      const dataLength = isPSB ? Number(r.u32()) * 0x100000000 + r.u32() : r.u32()
      channels.push({ id, dataLength })
    }

    const blendSig = r.ascii(4)
    if (blendSig !== '8BIM') {
      // Invalid — bail out
      return
    }
    const blendKey = r.ascii(4)
    const blendMode = mapBlendMode(blendKey)
    const opacityRaw = r.u8()
    const opacity = opacityRaw / 255
    const clipping = r.u8()
    const flags = r.u8()
    r.skip(1) // filler
    const visible = (flags & 0x02) === 0

    const extraDataLen = r.u32()
    const extraDataEnd = r.offset + extraDataLen

    // Layer mask data
    const layerMaskDataLen = r.u32()
    const layerMaskDataEnd = r.offset + layerMaskDataLen
    let maskBounds: MaskBounds | null = null
    if (layerMaskDataLen >= 16) {
      const maskTop = r.i32()
      const maskLeft = r.i32()
      const maskBottom = r.i32()
      const maskRight = r.i32()
      const defaultColor = layerMaskDataLen >= 17 ? r.u8() : 0
      maskBounds = { top: maskTop, left: maskLeft, bottom: maskBottom, right: maskRight, defaultColor }
    }
    r.offset = layerMaskDataEnd

    // Blending ranges
    const blendingRangesLen = r.u32()
    r.skip(blendingRangesLen)

    // Layer name
    const nameLen = r.u8()
    const name = nameLen > 0 ? r.ascii(nameLen) : `Layer ${i + 1}`
    const nameFieldLen = nameLen + 1
    const padding = (4 - (nameFieldLen % 4)) % 4
    r.skip(padding)

    // Tagged blocks for section dividers
    let sectionDivider = 0
    while (r.offset < extraDataEnd - 4) {
      const tSig = r.ascii(4)
      if (tSig !== '8BIM' && tSig !== '8B64') {
        r.offset -= 4
        break
      }
      const tKey = r.ascii(4)
      let tLen: number
      if (isPSB && tSig === '8B64') {
        tLen = Number(r.u32()) * 0x100000000 + r.u32()
      } else {
        tLen = r.u32()
      }
      const tEnd = r.offset + tLen
      const tPaddedEnd = tEnd + (tEnd % 2)

      if (tKey === 'lsct' || tKey === 'lsdk') {
        sectionDivider = r.u32()
      }

      r.offset = tPaddedEnd
    }

    r.offset = extraDataEnd

    psdLayers.push({
      name,
      top,
      left,
      bottom,
      right,
      channelCount,
      channels,
      blendMode,
      opacity,
      visible,
      flags,
      sectionDivider,
      maskBounds,
      clipping,
    })
  }

  // Parse channel image data
  for (const layer of psdLayers) {
    const lw = layer.right - layer.left
    const lh = layer.bottom - layer.top
    const mw = layer.maskBounds ? layer.maskBounds.right - layer.maskBounds.left : 0
    const mh = layer.maskBounds ? layer.maskBounds.bottom - layer.maskBounds.top : 0

    for (const chan of layer.channels) {
      const isMaskChannel = chan.id === -2
      const chanW = isMaskChannel ? mw : lw
      const chanH = isMaskChannel ? mh : lh

      if (chanW <= 0 || chanH <= 0) {
        r.skip(chan.dataLength)
        continue
      }

      const chanStartOffset = r.offset
      const compression = r.u16()
      const pixelCount = chanW * chanH
      const effectiveBpp = depth === 32 ? 4 : depth === 16 ? 2 : 1
      const unpackedLen = pixelCount * effectiveBpp

      if (compression === 0) {
        chan._data = r.bytes(unpackedLen)
      } else if (compression === 1) {
        const scanLineCounts = new Array(chanH)
        for (let row = 0; row < chanH; row++) {
          scanLineCounts[row] = isPSB ? r.u32() : r.u16()
        }
        chan._data = decompressPackBits(r, unpackedLen)
      } else {
        r.skip(chan.dataLength - 2)
        chan._data = new Uint8Array(unpackedLen)
      }

      // Ensure we consumed exactly the right amount of data
      const expectedEnd = chanStartOffset + chan.dataLength
      if (r.offset !== expectedEnd && chan.dataLength > 0) {
        r.offset = expectedEnd
      }
    }
  }
}

// ── Composite image fallback ────────────────────────────────────────────────

/**
 * Read the merged/composite image data section as a single raster layer.
 * This is the fallback when no layer records were found (flat PSD).
 */
function readCompositeAsLayer(
  r: PSDReader,
  width: number,
  height: number,
  depth: number,
  psdLayers: PSDLayerInfo[],
) {
  if (r.remaining() < 2) return

  const compression = r.u16()
  const pixelCount = width * height
  const bytesPerPixel = depth === 16 ? 2 : 1
  const channelLen = pixelCount * bytesPerPixel

  // The composite image stores channels in order: R, G, B (and optionally A)
  // All data for channel 0, then all for channel 1, etc.
  const channelDatas: Uint8Array[] = []

  if (compression === 0) {
    // Raw — 3 or 4 channels of raw data
    for (let c = 0; c < 3 && r.remaining() >= channelLen; c++) {
      channelDatas.push(r.bytes(channelLen))
    }
    // Try reading alpha
    if (r.remaining() >= channelLen) {
      channelDatas.push(r.bytes(channelLen))
    }
  } else if (compression === 1) {
    // RLE — scan line byte counts for ALL channels first, then data
    // Count = height * numChannels
    const numChannels = r.remaining() > height * 2 * 4 ? 4 : 3
    const totalScanLines = height * numChannels
    const scanLineCounts = new Array(totalScanLines)
    for (let i = 0; i < totalScanLines && r.remaining() >= 2; i++) {
      scanLineCounts[i] = r.u16()
    }
    // Then compressed data for each channel
    for (let c = 0; c < numChannels && r.remaining() > 0; c++) {
      channelDatas.push(decompressPackBits(r, channelLen))
    }
  } else {
    // ZIP or unknown — can't read composite
    return
  }

  if (channelDatas.length < 3) return // Need at least RGB

  const rData = channelDatas[0]!
  const gData = channelDatas[1]!
  const bData = channelDatas[2]!
  const aData = channelDatas.length > 3 ? channelDatas[3] : undefined

  // Build channel array in PSDLayerInfo format
  const channels: { id: number; dataLength: number; _data?: Uint8Array }[] = [
    { id: 0, dataLength: 0, _data: rData },
    { id: 1, dataLength: 0, _data: gData },
    { id: 2, dataLength: 0, _data: bData },
  ]
  if (aData) {
    channels.unshift({ id: -1, dataLength: 0, _data: aData })
  }

  psdLayers.push({
    name: 'Background',
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    channelCount: channels.length,
    channels,
    blendMode: 'normal',
    opacity: 1,
    visible: true,
    flags: 0,
    sectionDivider: 0,
    maskBounds: null,
    clipping: 0,
  })
}

// ── Build Crossdraw layers from parsed PSD layer records ────────────────────

function buildLayers(psdLayers: PSDLayerInfo[], _docWidth: number, _docHeight: number, is16bit: boolean): Layer[] {
  // PSD layers are stored bottom-to-top; Crossdraw expects top-to-bottom
  // (first element renders on top).  We'll process in PSD order then reverse.

  interface StackFrame {
    group: GroupLayer
    children: Layer[]
  }

  const rootChildren: Layer[] = []
  const stack: StackFrame[] = []

  // PSD stores layers bottom-to-top. When iterating top-to-bottom (reverse),
  // we encounter the group HEADER (type 1/2) first, then children, then the
  // END marker (type 3). So: HEADER → PUSH, END → POP.
  for (let i = psdLayers.length - 1; i >= 0; i--) {
    const psd = psdLayers[i]!

    // Section divider: type 1 or 2 = open/closed folder (group header).
    // Start a new group — push frame to collect children.
    if (psd.sectionDivider === 1 || psd.sectionDivider === 2) {
      const group: GroupLayer = {
        id: uuid(),
        name: psd.name || 'Group',
        type: 'group',
        visible: psd.visible,
        locked: false,
        opacity: psd.opacity,
        blendMode: psd.blendMode,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        children: [],
      }
      stack.push({ group, children: [] })
      continue
    }

    // Section divider: type 3 = bounding section (end marker).
    // Pop the stack — finalize the group with collected children.
    if (psd.sectionDivider === 3) {
      if (stack.length > 0) {
        const frame = stack.pop()!
        frame.group.children = frame.children
        // Add to parent
        if (stack.length > 0) {
          stack[stack.length - 1]!.children.push(frame.group)
        } else {
          rootChildren.push(frame.group)
        }
      }
      continue
    }

    // Regular raster layer
    const layer = createRasterLayer(psd, is16bit)
    if (layer) {
      if (stack.length > 0) {
        stack[stack.length - 1]!.children.push(layer)
      } else {
        rootChildren.push(layer)
      }
    }
  }

  // Close any unclosed groups
  while (stack.length > 0) {
    const frame = stack.pop()!
    frame.group.children = frame.children
    if (stack.length > 0) {
      stack[stack.length - 1]!.children.push(frame.group)
    } else {
      rootChildren.push(frame.group)
    }
  }

  return rootChildren
}

function createRasterLayer(psd: PSDLayerInfo, is16bit: boolean): RasterLayer | null {
  const lw = psd.right - psd.left
  const lh = psd.bottom - psd.top

  if (lw <= 0 || lh <= 0) return null

  // Build RGBA ImageData from channel data
  const pixelCount = lw * lh
  const rgba = new Uint8ClampedArray(pixelCount * 4)

  // Find channels by ID: -1=transparency(A), 0=R, 1=G, 2=B, -2=mask
  const channelData: Record<number, Uint8Array | undefined> = {}
  for (const chan of psd.channels) {
    channelData[chan.id] = chan._data
  }

  const rData = channelData[0]
  const gData = channelData[1]
  const bData = channelData[2]
  const aData = channelData[-1]

  if (is16bit) {
    // Convert 16-bit channels to 8-bit
    for (let p = 0; p < pixelCount; p++) {
      const hi = p * 2
      rgba[p * 4 + 0] = rData ? rData[hi]! : 0
      rgba[p * 4 + 1] = gData ? gData[hi]! : 0
      rgba[p * 4 + 2] = bData ? bData[hi]! : 0
      rgba[p * 4 + 3] = aData ? aData[hi]! : 255
    }
  } else {
    for (let p = 0; p < pixelCount; p++) {
      rgba[p * 4 + 0] = rData ? rData[p]! : 0
      rgba[p * 4 + 1] = gData ? gData[p]! : 0
      rgba[p * 4 + 2] = bData ? bData[p]! : 0
      rgba[p * 4 + 3] = aData ? aData[p]! : 255
    }
  }

  // Apply layer mask (channel -2) if present
  const maskData = channelData[-2]
  if (maskData && psd.maskBounds) {
    const mb = psd.maskBounds
    const mw = mb.right - mb.left
    const mh = mb.bottom - mb.top

    if (mw > 0 && mh > 0) {
      // The mask has its own coordinate space. We need to map mask pixels
      // to layer pixels. Both are in document (artboard) coordinates.
      for (let p = 0; p < pixelCount; p++) {
        const layerX = psd.left + (p % lw)
        const layerY = psd.top + Math.floor(p / lw)

        // Find corresponding mask pixel
        const maskX = layerX - mb.left
        const maskY = layerY - mb.top

        let maskAlpha: number
        if (maskX >= 0 && maskX < mw && maskY >= 0 && maskY < mh) {
          const maskIdx = maskY * mw + maskX
          if (is16bit) {
            maskAlpha = maskData[maskIdx * 2]!
          } else {
            maskAlpha = maskData[maskIdx]!
          }
        } else {
          // Outside mask bounds: use default color
          maskAlpha = mb.defaultColor
        }

        // Multiply existing alpha by mask alpha
        rgba[p * 4 + 3] = (rgba[p * 4 + 3]! * maskAlpha) / 255
      }
    }
  }

  // Create ImageData and store it
  const chunkId = uuid()
  let imageData: ImageData
  if (typeof ImageData !== 'undefined') {
    imageData = new ImageData(rgba, lw, lh)
  } else {
    imageData = {
      data: rgba,
      width: lw,
      height: lh,
      colorSpace: 'srgb',
    } as unknown as ImageData
  }
  storeRasterData(chunkId, imageData)

  return {
    id: uuid(),
    name: psd.name,
    type: 'raster',
    visible: psd.visible,
    locked: false,
    opacity: psd.opacity,
    blendMode: psd.blendMode,
    transform: {
      x: psd.left,
      y: psd.top,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    effects: [],
    imageChunkId: chunkId,
    width: lw,
    height: lh,
  }
}
