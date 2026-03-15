import { describe, it, expect } from 'bun:test'
import { importPSD } from '@/io/psd-import'

// Helper to build a minimal valid PSD buffer
function buildPSD(opts?: {
  width?: number
  height?: number
  depth?: number
  colorMode?: number
  numChannels?: number
  layers?: {
    name: string
    top: number
    left: number
    bottom: number
    right: number
    opacity?: number
    visible?: boolean
    blendMode?: string
    sectionDivider?: number
    channels?: { id: number; data: Uint8Array }[]
  }[]
}): ArrayBuffer {
  const width = opts?.width ?? 4
  const height = opts?.height ?? 4
  const depth = opts?.depth ?? 8
  const colorMode = opts?.colorMode ?? 3 // RGB
  const numChannels = opts?.numChannels ?? 3
  const layers = opts?.layers ?? []

  // We'll build the buffer piece by piece
  const parts: number[] = []

  function writeBytes(bytes: number[]) {
    parts.push(...bytes)
  }

  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) parts.push(s.charCodeAt(i))
  }

  function writeU16BE(v: number) {
    parts.push((v >> 8) & 0xff, v & 0xff)
  }

  function writeU32BE(v: number) {
    parts.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
  }

  // 1. File Header
  writeString('8BPS') // signature
  writeU16BE(1) // version = 1 (PSD)
  writeBytes([0, 0, 0, 0, 0, 0]) // reserved
  writeU16BE(numChannels) // channels
  writeU32BE(height)
  writeU32BE(width)
  writeU16BE(depth)
  writeU16BE(colorMode)

  // 2. Color Mode Data
  writeU32BE(0) // length = 0

  // 3. Image Resources
  writeU32BE(0) // length = 0

  // 4. Layer and Mask Information
  if (layers.length === 0) {
    writeU32BE(0) // layerMaskInfoLen = 0
  } else {
    // Build the layer info section
    const layerInfoParts: number[] = []

    function lU8(v: number) {
      layerInfoParts.push(v & 0xff)
    }
    function lU16BE(v: number) {
      layerInfoParts.push((v >> 8) & 0xff, v & 0xff)
    }
    function lI16BE(v: number) {
      lU16BE(v < 0 ? v + 0x10000 : v)
    }
    function lI32BE(v: number) {
      const uv = v < 0 ? v + 0x100000000 : v
      layerInfoParts.push((uv >> 24) & 0xff, (uv >> 16) & 0xff, (uv >> 8) & 0xff, uv & 0xff)
    }
    function lU32BE(v: number) {
      layerInfoParts.push((v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
    }
    function lString(s: string) {
      for (let i = 0; i < s.length; i++) layerInfoParts.push(s.charCodeAt(i))
    }

    // Layer count
    lI16BE(layers.length)

    // Layer records
    for (const layer of layers) {
      lI32BE(layer.top)
      lI32BE(layer.left)
      lI32BE(layer.bottom)
      lI32BE(layer.right)

      const chanCount = layer.channels?.length ?? 3
      lU16BE(chanCount)

      const lw = layer.right - layer.left
      const lh = layer.bottom - layer.top
      const pixelCount = Math.max(lw, 0) * Math.max(lh, 0)
      const bytesPerPixel = depth === 16 ? 2 : 1

      for (let c = 0; c < chanCount; c++) {
        const chanId = layer.channels?.[c]?.id ?? c
        lI16BE(chanId)
        // data length = 2 (compression) + uncompressed data
        const dataLen = pixelCount > 0 ? 2 + pixelCount * bytesPerPixel : 2
        lU32BE(dataLen)
      }

      // Blend mode signature
      lString('8BIM')
      // Blend mode key
      const bm = layer.blendMode ?? 'norm'
      lString(bm)

      // Opacity
      lU8(layer.opacity !== undefined ? Math.round(layer.opacity * 255) : 255)
      lU8(0) // clipping
      // Flags: bit 1 set = invisible
      const flags = layer.visible === false ? 0x02 : 0x00
      lU8(flags)
      lU8(0) // filler

      // Extra data
      // Compute extra data: layerMaskData(4) + blendingRanges(4) + name + sectionDivider
      const nameBytes = new TextEncoder().encode(layer.name)
      const nameLen = nameBytes.length
      const nameFieldLen = nameLen + 1
      const namePadding = (4 - (nameFieldLen % 4)) % 4
      const nameTotal = nameFieldLen + namePadding

      let sectionDividerSize = 0
      if (layer.sectionDivider !== undefined) {
        // 8BIM + lsct + len(4) + divider(4) = 16
        sectionDividerSize = 16
      }

      const extraDataLen = 4 + 4 + nameTotal + sectionDividerSize
      lU32BE(extraDataLen)

      // Layer mask data length = 0
      lU32BE(0)
      // Blending ranges length = 0
      lU32BE(0)

      // Layer name (Pascal string padded to multiple of 4)
      lU8(nameLen)
      for (let i = 0; i < nameLen; i++) lU8(nameBytes[i]!)
      for (let i = 0; i < namePadding; i++) lU8(0)

      // Section divider
      if (layer.sectionDivider !== undefined) {
        lString('8BIM')
        lString('lsct')
        lU32BE(4)
        lU32BE(layer.sectionDivider)
      }
    }

    // Channel image data for each layer
    for (const layer of layers) {
      const lw = layer.right - layer.left
      const lh = layer.bottom - layer.top
      const chanCount = layer.channels?.length ?? 3
      const pixelCount = Math.max(lw, 0) * Math.max(lh, 0)
      const bytesPerPixel = depth === 16 ? 2 : 1

      for (let c = 0; c < chanCount; c++) {
        if (pixelCount <= 0) {
          lU16BE(0) // compression = raw
          continue
        }
        lU16BE(0) // compression = 0 (raw)
        if (layer.channels?.[c]?.data) {
          const d = layer.channels[c]!.data
          for (let i = 0; i < d.length; i++) lU8(d[i]!)
        } else {
          // Fill with zeros
          for (let i = 0; i < pixelCount * bytesPerPixel; i++) lU8(128)
        }
      }
    }

    // Now wrap: layerInfoLen(4) + layerInfoParts
    const layerInfoLen = layerInfoParts.length
    // layerMaskInfoLen = 4 (layerInfoLen field) + layerInfoLen
    const layerMaskInfoLen = 4 + layerInfoLen

    writeU32BE(layerMaskInfoLen)
    writeU32BE(layerInfoLen)
    writeBytes(layerInfoParts)
  }

  // 5. Image Data section - minimal (we skip this but need the buffer to end cleanly)
  // PSD spec requires image data section but importPSD only reads up to layer/mask end

  const buf = new ArrayBuffer(parts.length)
  const u8 = new Uint8Array(buf)
  for (let i = 0; i < parts.length; i++) u8[i] = parts[i]!
  return buf
}

describe('importPSD', () => {
  it('should reject non-PSD files', async () => {
    const buf = new ArrayBuffer(50)
    const u8 = new Uint8Array(buf)
    u8[0] = 'N'.charCodeAt(0)
    u8[1] = 'O'.charCodeAt(0)
    u8[2] = 'T'.charCodeAt(0)
    u8[3] = 'P'.charCodeAt(0)

    await expect(importPSD(buf)).rejects.toThrow('Not a PSD file')
  })

  it('should reject non-RGB color mode', async () => {
    const buf = buildPSD({ colorMode: 1 }) // 1 = Grayscale
    await expect(importPSD(buf)).rejects.toThrow('Only RGB color mode is supported')
  })

  it('should reject unsupported bit depths', async () => {
    const buf = buildPSD({ depth: 32 })
    await expect(importPSD(buf)).rejects.toThrow('Only 8-bit and 16-bit channels are supported')
  })

  it('should import a minimal PSD with no layers', async () => {
    const buf = buildPSD({ width: 100, height: 50 })
    const doc = await importPSD(buf)

    expect(doc.metadata.width).toBe(100)
    expect(doc.metadata.height).toBe(50)
    expect(doc.metadata.title).toBe('PSD Import')
    expect(doc.metadata.colorspace).toBe('srgb')
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.width).toBe(100)
    expect(doc.artboards[0]!.height).toBe(50)
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  it('should import a PSD with a single raster layer', async () => {
    const lw = 4
    const lh = 4
    const pixelCount = lw * lh
    const rData = new Uint8Array(pixelCount)
    const gData = new Uint8Array(pixelCount)
    const bData = new Uint8Array(pixelCount)
    rData.fill(255)
    gData.fill(0)
    bData.fill(128)

    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'Red Layer',
          top: 0,
          left: 0,
          bottom: lh,
          right: lw,
          opacity: 1.0,
          visible: true,
          channels: [
            { id: 0, data: rData },
            { id: 1, data: gData },
            { id: 2, data: bData },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers.length).toBe(1)

    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('raster')
    expect(layer.name).toBe('Red Layer')
    expect(layer.visible).toBe(true)
    expect(layer.opacity).toBeCloseTo(1.0, 2)
  })

  it('should handle invisible layers', async () => {
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'Hidden',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          visible: false,
          channels: [
            { id: 0, data: new Uint8Array(4) },
            { id: 1, data: new Uint8Array(4) },
            { id: 2, data: new Uint8Array(4) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers[0]!.visible).toBe(false)
  })

  it('should map blend modes correctly', async () => {
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'Multiply',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          blendMode: 'mul ',
          channels: [
            { id: 0, data: new Uint8Array(4) },
            { id: 1, data: new Uint8Array(4) },
            { id: 2, data: new Uint8Array(4) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers[0]!.blendMode).toBe('multiply')
  })

  it('should handle layer opacity correctly', async () => {
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'HalfOpacity',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          opacity: 0.5,
          channels: [
            { id: 0, data: new Uint8Array(4) },
            { id: 1, data: new Uint8Array(4) },
            { id: 2, data: new Uint8Array(4) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers[0]!.opacity).toBeCloseTo(0.5, 1)
  })

  it('should handle empty layers (zero dimensions)', async () => {
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'Empty',
          top: 5,
          left: 5,
          bottom: 5, // zero height
          right: 5, // zero width
          channels: [
            { id: 0, data: new Uint8Array(0) },
            { id: 1, data: new Uint8Array(0) },
            { id: 2, data: new Uint8Array(0) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    // Empty layers should not be added
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  it('should set layer transform from bounds', async () => {
    const buf = buildPSD({
      width: 100,
      height: 100,
      layers: [
        {
          name: 'Offset',
          top: 10,
          left: 20,
          bottom: 30,
          right: 40,
          channels: [
            { id: 0, data: new Uint8Array(20 * 20).fill(100) },
            { id: 1, data: new Uint8Array(20 * 20).fill(100) },
            { id: 2, data: new Uint8Array(20 * 20).fill(100) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    const layer = doc.artboards[0]!.layers[0]! as any
    expect(layer.transform.x).toBe(20) // left
    expect(layer.transform.y).toBe(10) // top
  })

  it('should import groups via section dividers', async () => {
    // PSD layer records are stored bottom-to-top.
    // buildLayers iterates forward (0 → N-1), matching PSD bottom-to-top order.
    // In the PSD file format, a group looks like (from bottom to top in the array):
    //   [0] End marker (sectionDivider=3) — name = "</Layer group>"
    //   [1] Child layer
    //   [2] Group header (sectionDivider=1) — name = "MyGroup"
    // buildLayers processes from index 0 → 2:
    //   i=0: sectionDivider=3 → push stack (start collecting children)
    //   i=1: regular layer → add to stack top's children
    //   i=2: sectionDivider=1 → pop stack, finalize group with name/props
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: '</Layer group>',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          sectionDivider: 3,
          channels: [
            { id: 0, data: new Uint8Array(0) },
            { id: 1, data: new Uint8Array(0) },
            { id: 2, data: new Uint8Array(0) },
          ],
        },
        {
          name: 'Child',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          channels: [
            { id: 0, data: new Uint8Array(4).fill(200) },
            { id: 1, data: new Uint8Array(4).fill(100) },
            { id: 2, data: new Uint8Array(4).fill(50) },
          ],
        },
        {
          name: 'MyGroup',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          sectionDivider: 1,
          channels: [
            { id: 0, data: new Uint8Array(0) },
            { id: 1, data: new Uint8Array(0) },
            { id: 2, data: new Uint8Array(0) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    const layers = doc.artboards[0]!.layers
    expect(layers.length).toBe(1)
    expect(layers[0]!.type).toBe('group')
    expect(layers[0]!.name).toBe('MyGroup')
    expect((layers[0] as any).children.length).toBe(1)
    expect((layers[0] as any).children[0].name).toBe('Child')
  })

  it('should handle 16-bit depth', async () => {
    const lw = 2
    const lh = 2
    const pixelCount = lw * lh
    // 16-bit: 2 bytes per pixel per channel
    const rData = new Uint8Array(pixelCount * 2)
    const gData = new Uint8Array(pixelCount * 2)
    const bData = new Uint8Array(pixelCount * 2)
    // Set high bytes
    for (let i = 0; i < pixelCount; i++) {
      rData[i * 2] = 200 // high byte
      gData[i * 2] = 100
      bData[i * 2] = 50
    }

    const buf = buildPSD({
      width: 10,
      height: 10,
      depth: 16,
      layers: [
        {
          name: '16bit',
          top: 0,
          left: 0,
          bottom: lh,
          right: lw,
          channels: [
            { id: 0, data: rData },
            { id: 1, data: gData },
            { id: 2, data: bData },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers.length).toBe(1)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('raster')
  })

  it('should import multiple layers in correct order', async () => {
    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'Bottom',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          channels: [
            { id: 0, data: new Uint8Array(4) },
            { id: 1, data: new Uint8Array(4) },
            { id: 2, data: new Uint8Array(4) },
          ],
        },
        {
          name: 'Top',
          top: 0,
          left: 0,
          bottom: 2,
          right: 2,
          channels: [
            { id: 0, data: new Uint8Array(4) },
            { id: 1, data: new Uint8Array(4) },
            { id: 2, data: new Uint8Array(4) },
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    // PSD layers are bottom-to-top; Crossdraw also stores bottom-to-top
    // (layers[0] drawn first = bottom, layers[last] drawn last = top)
    expect(doc.artboards[0]!.layers.length).toBe(2)
    expect(doc.artboards[0]!.layers[0]!.name).toBe('Bottom')
    expect(doc.artboards[0]!.layers[1]!.name).toBe('Top')
  })

  it('should produce a document with expected structure', async () => {
    const buf = buildPSD({ width: 50, height: 30 })
    const doc = await importPSD(buf)

    expect(doc.id).toBeTruthy()
    expect(doc.metadata).toBeTruthy()
    expect(doc.artboards).toBeInstanceOf(Array)
    expect(doc.assets.gradients).toBeInstanceOf(Array)
    expect(doc.assets.patterns).toBeInstanceOf(Array)
    expect(doc.assets.colors).toBeInstanceOf(Array)
  })

  it('should handle layers with alpha channel', async () => {
    const lw = 2
    const lh = 2
    const pixelCount = lw * lh

    const buf = buildPSD({
      width: 10,
      height: 10,
      layers: [
        {
          name: 'WithAlpha',
          top: 0,
          left: 0,
          bottom: lh,
          right: lw,
          channels: [
            { id: -1, data: new Uint8Array(pixelCount).fill(128) }, // alpha
            { id: 0, data: new Uint8Array(pixelCount).fill(255) }, // R
            { id: 1, data: new Uint8Array(pixelCount).fill(0) }, // G
            { id: 2, data: new Uint8Array(pixelCount).fill(0) }, // B
          ],
        },
      ],
    })

    const doc = await importPSD(buf)
    expect(doc.artboards[0]!.layers.length).toBe(1)
  })

  it('should handle various blend modes', async () => {
    const modes: [string, string][] = [
      ['norm', 'normal'],
      ['dark', 'darken'],
      ['lite', 'lighten'],
      ['scrn', 'screen'],
      ['over', 'overlay'],
      ['diff', 'difference'],
    ]

    for (const [psdMode, expected] of modes) {
      const buf = buildPSD({
        width: 10,
        height: 10,
        layers: [
          {
            name: `Mode_${psdMode}`,
            top: 0,
            left: 0,
            bottom: 2,
            right: 2,
            blendMode: psdMode,
            channels: [
              { id: 0, data: new Uint8Array(4) },
              { id: 1, data: new Uint8Array(4) },
              { id: 2, data: new Uint8Array(4) },
            ],
          },
        ],
      })

      const doc = await importPSD(buf)
      expect(doc.artboards[0]!.layers[0]!.blendMode).toBe(expected as any)
    }
  })
})
