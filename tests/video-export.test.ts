import { describe, it, expect } from 'bun:test'
import {
  validateExportSettings,
  defaultVideoExportSettings,
  getTimelineDuration,
  computeFrameOverrides,
  renderFrameToImageData,
  exportGIF,
} from '@/animation/video-export'
import type { VideoExportSettings } from '@/animation/video-export'
import { encodeAnimatedGIF } from '@/io/gif-encoder'
import { muxMP4 } from '@/animation/mp4-muxer'
import type { Artboard, Layer, AnimationTrack } from '@/types'

// ── Helpers ──

function makeImageData(width: number, height: number, fillR = 0, fillG = 0, fillB = 0): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fillR
    data[i + 1] = fillG
    data[i + 2] = fillB
    data[i + 3] = 255
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}

function makeBaseLayer(id: string, overrides: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  } as unknown as Layer
}

function makeAnimatedLayer(id: string, track: AnimationTrack): Layer {
  return makeBaseLayer(id, { animation: track } as Partial<Layer>)
}

function makeArtboard(layers: Layer[], width = 800, height = 600): Artboard {
  return {
    id: 'artboard-1',
    name: 'Test Artboard',
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor: '#ffffff',
    layers,
  }
}

// ── Tests ──

describe('validateExportSettings', () => {
  it('should return no errors for valid default settings', () => {
    const errors = validateExportSettings(defaultVideoExportSettings)
    expect(errors).toEqual([])
  })

  it('should reject invalid format', () => {
    const settings = { ...defaultVideoExportSettings, format: 'avi' as 'mp4' }
    const errors = validateExportSettings(settings)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('format')
  })

  it('should reject zero width', () => {
    const settings = { ...defaultVideoExportSettings, width: 0 }
    const errors = validateExportSettings(settings)
    expect(errors.some((e) => e.includes('Width'))).toBe(true)
  })

  it('should reject negative height', () => {
    const settings = { ...defaultVideoExportSettings, height: -1 }
    const errors = validateExportSettings(settings)
    expect(errors.some((e) => e.includes('Height'))).toBe(true)
  })

  it('should reject oversized dimensions', () => {
    const settings = { ...defaultVideoExportSettings, width: 8000 }
    const errors = validateExportSettings(settings)
    expect(errors.some((e) => e.includes('Width'))).toBe(true)
  })

  it('should reject FPS out of range', () => {
    const errors0 = validateExportSettings({ ...defaultVideoExportSettings, fps: 0 })
    expect(errors0.some((e) => e.includes('FPS'))).toBe(true)

    const errors200 = validateExportSettings({ ...defaultVideoExportSettings, fps: 200 })
    expect(errors200.some((e) => e.includes('FPS'))).toBe(true)
  })

  it('should reject quality out of range', () => {
    const errors = validateExportSettings({ ...defaultVideoExportSettings, quality: -1 })
    expect(errors.some((e) => e.includes('Quality'))).toBe(true)

    const errors2 = validateExportSettings({ ...defaultVideoExportSettings, quality: 101 })
    expect(errors2.some((e) => e.includes('Quality'))).toBe(true)
  })

  it('should reject invalid frame range', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      frameRange: [10, 5],
    }
    const errors = validateExportSettings(settings)
    expect(errors.some((e) => e.includes('frame range'))).toBe(true)
  })

  it('should reject negative frame range start', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      frameRange: [-1, 5],
    }
    const errors = validateExportSettings(settings)
    expect(errors.some((e) => e.includes('start'))).toBe(true)
  })

  it('should reject negative loop count', () => {
    const errors = validateExportSettings({ ...defaultVideoExportSettings, loopCount: -1 })
    expect(errors.some((e) => e.includes('Loop'))).toBe(true)
  })

  it('should accept frame range "all"', () => {
    const errors = validateExportSettings({ ...defaultVideoExportSettings, frameRange: 'all' })
    expect(errors).toEqual([])
  })

  it('should accept valid numeric frame range', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      frameRange: [0, 10],
    }
    const errors = validateExportSettings(settings)
    expect(errors).toEqual([])
  })

  it('should require even dimensions for MP4', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      format: 'mp4',
      width: 801,
      height: 601,
    }
    const errors = validateExportSettings(settings)
    expect(errors.length).toBe(2)
    expect(errors.some((e) => e.includes('even'))).toBe(true)
  })

  it('should accept even dimensions for MP4', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      format: 'mp4',
      width: 800,
      height: 600,
    }
    const errors = validateExportSettings(settings)
    expect(errors).toEqual([])
  })

  it('should not require even dimensions for GIF', () => {
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      format: 'gif',
      width: 801,
      height: 601,
    }
    const errors = validateExportSettings(settings)
    expect(errors).toEqual([])
  })
})

describe('getTimelineDuration', () => {
  it('should return default 3000ms for empty artboard', () => {
    const artboard = makeArtboard([])
    expect(getTimelineDuration(artboard)).toBe(3000)
  })

  it('should return default for layers without animation', () => {
    const artboard = makeArtboard([makeBaseLayer('layer-1')])
    expect(getTimelineDuration(artboard)).toBe(3000)
  })

  it('should return the max duration of animated layers', () => {
    const track1: AnimationTrack = {
      duration: 2000,
      loop: false,
      keyframes: [
        { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
        { id: 'k2', time: 2000, easing: 'linear', properties: { x: 100 } },
      ],
    }
    const track2: AnimationTrack = {
      duration: 5000,
      loop: false,
      keyframes: [
        { id: 'k3', time: 0, easing: 'linear', properties: { opacity: 1 } },
        { id: 'k4', time: 5000, easing: 'linear', properties: { opacity: 0 } },
      ],
    }

    const artboard = makeArtboard([makeAnimatedLayer('a', track1), makeAnimatedLayer('b', track2)])
    expect(getTimelineDuration(artboard)).toBe(5000)
  })

  it('should find animated layers inside groups', () => {
    const track: AnimationTrack = {
      duration: 4000,
      loop: false,
      keyframes: [
        { id: 'k1', time: 0, easing: 'linear', properties: { y: 0 } },
        { id: 'k2', time: 4000, easing: 'linear', properties: { y: 200 } },
      ],
    }
    const group: Layer = {
      id: 'group-1',
      name: 'group-1',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      children: [makeAnimatedLayer('child', track)],
    } as unknown as Layer

    const artboard = makeArtboard([group])
    expect(getTimelineDuration(artboard)).toBe(4000)
  })
})

describe('computeFrameOverrides', () => {
  it('should return empty map for artboard with no animations', () => {
    const artboard = makeArtboard([makeBaseLayer('static')])
    const overrides = computeFrameOverrides(artboard, 500)
    expect(overrides.size).toBe(0)
  })

  it('should interpolate position at midpoint', () => {
    const track: AnimationTrack = {
      duration: 1000,
      loop: false,
      keyframes: [
        { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
        { id: 'k2', time: 1000, easing: 'linear', properties: { x: 100 } },
      ],
    }
    const artboard = makeArtboard([makeAnimatedLayer('mover', track)])
    const overrides = computeFrameOverrides(artboard, 500)

    expect(overrides.has('mover')).toBe(true)
    const props = overrides.get('mover')!
    expect(props.x).toBeCloseTo(50, 0)
  })

  it('should handle looping tracks', () => {
    const track: AnimationTrack = {
      duration: 1000,
      loop: true,
      keyframes: [
        { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
        { id: 'k2', time: 1000, easing: 'linear', properties: { x: 100 } },
      ],
    }
    const artboard = makeArtboard([makeAnimatedLayer('looper', track)])

    // At time 1500ms with loop, effective time is 500ms
    const overrides = computeFrameOverrides(artboard, 1500)
    const props = overrides.get('looper')!
    expect(props.x).toBeCloseTo(50, 0)
  })

  it('should clamp non-looping tracks at duration', () => {
    const track: AnimationTrack = {
      duration: 1000,
      loop: false,
      keyframes: [
        { id: 'k1', time: 0, easing: 'linear', properties: { x: 0 } },
        { id: 'k2', time: 1000, easing: 'linear', properties: { x: 100 } },
      ],
    }
    const artboard = makeArtboard([makeAnimatedLayer('clamped', track)])

    const overrides = computeFrameOverrides(artboard, 2000)
    const props = overrides.get('clamped')!
    expect(props.x).toBeCloseTo(100, 0)
  })
})

describe('renderFrameToImageData', () => {
  it('should return ImageData of correct dimensions', () => {
    const artboard = makeArtboard([])
    const frame = renderFrameToImageData(0, artboard, 24, 320, 240, '#ffffff')

    expect(frame.width).toBe(320)
    expect(frame.height).toBe(240)
    expect(frame.data.length).toBe(320 * 240 * 4)
  })

  it('should fill with background color', () => {
    const artboard = makeArtboard([])
    const frame = renderFrameToImageData(0, artboard, 24, 2, 2, '#ff0000')

    // All pixels should be red
    for (let i = 0; i < frame.data.length; i += 4) {
      expect(frame.data[i]).toBe(255) // R
      expect(frame.data[i + 1]).toBe(0) // G
      expect(frame.data[i + 2]).toBe(0) // B
      expect(frame.data[i + 3]).toBe(255) // A
    }
  })

  it('should fill with black background', () => {
    const artboard = makeArtboard([])
    const frame = renderFrameToImageData(0, artboard, 24, 2, 2, '#000000')

    for (let i = 0; i < frame.data.length; i += 4) {
      expect(frame.data[i]).toBe(0)
      expect(frame.data[i + 1]).toBe(0)
      expect(frame.data[i + 2]).toBe(0)
      expect(frame.data[i + 3]).toBe(255)
    }
  })

  it('should handle non-standard background colors', () => {
    const artboard = makeArtboard([])
    const frame = renderFrameToImageData(0, artboard, 24, 1, 1, '#336699')

    expect(frame.data[0]).toBe(0x33) // R
    expect(frame.data[1]).toBe(0x66) // G
    expect(frame.data[2]).toBe(0x99) // B
    expect(frame.data[3]).toBe(255) // A
  })

  it('should handle different frame indices', () => {
    const artboard = makeArtboard([])
    // Rendering different frame indices should not throw
    const f0 = renderFrameToImageData(0, artboard, 24, 10, 10, '#ffffff')
    const f10 = renderFrameToImageData(10, artboard, 24, 10, 10, '#ffffff')
    const f100 = renderFrameToImageData(100, artboard, 24, 10, 10, '#ffffff')

    expect(f0.width).toBe(10)
    expect(f10.width).toBe(10)
    expect(f100.width).toBe(10)
  })
})

describe('GIF multi-frame encoding', () => {
  it('should encode single frame', () => {
    const frame = makeImageData(4, 4, 255, 0, 0)
    const result = encodeAnimatedGIF([frame], { delayMs: 100, loopCount: 0 })

    // Valid GIF89a header
    expect(result[0]).toBe(0x47) // G
    expect(result[1]).toBe(0x49) // I
    expect(result[2]).toBe(0x46) // F
    expect(result[3]).toBe(0x38) // 8
    expect(result[4]).toBe(0x39) // 9
    expect(result[5]).toBe(0x61) // a
    // Trailer
    expect(result[result.length - 1]).toBe(0x3b)
  })

  it('should encode multiple frames', () => {
    const frames = [makeImageData(4, 4, 255, 0, 0), makeImageData(4, 4, 0, 255, 0), makeImageData(4, 4, 0, 0, 255)]
    const result = encodeAnimatedGIF(frames, { delayMs: 100, loopCount: 0 })

    expect(result[0]).toBe(0x47) // G
    expect(result[result.length - 1]).toBe(0x3b)

    // Should be larger than single frame
    const singleFrame = encodeAnimatedGIF([frames[0]!], { delayMs: 100, loopCount: 0 })
    expect(result.length).toBeGreaterThan(singleFrame.length)
  })

  it('should include NETSCAPE extension for looping', () => {
    const frame = makeImageData(2, 2, 128, 128, 128)
    const result = encodeAnimatedGIF([frame], { delayMs: 50, loopCount: 0 })

    // Search for NETSCAPE2.0 application extension
    let found = false
    for (let i = 0; i < result.length - 11; i++) {
      if (
        result[i] === 0x4e && // N
        result[i + 1] === 0x45 && // E
        result[i + 2] === 0x54 && // T
        result[i + 3] === 0x53 && // S
        result[i + 4] === 0x43 && // C
        result[i + 5] === 0x41 && // A
        result[i + 6] === 0x50 && // P
        result[i + 7] === 0x45 // E
      ) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it('should include Graphic Control Extension per frame', () => {
    const frames = [makeImageData(2, 2, 255, 0, 0), makeImageData(2, 2, 0, 255, 0)]
    const result = encodeAnimatedGIF(frames, { delayMs: 100, loopCount: 0 })

    // Count GCE blocks (0x21 0xF9)
    let gceCount = 0
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === 0x21 && result[i + 1] === 0xf9) {
        gceCount++
      }
    }
    expect(gceCount).toBe(2)
  })

  it('should encode frame delay correctly', () => {
    const frame = makeImageData(2, 2, 100, 100, 100)
    const delayMs = 200 // = 20 centiseconds
    const result = encodeAnimatedGIF([frame], { delayMs, loopCount: 0 })

    // Find the GCE block and check delay
    for (let i = 0; i < result.length - 5; i++) {
      if (result[i] === 0x21 && result[i + 1] === 0xf9) {
        // Delay is at offset +4 and +5 (little-endian u16 in centiseconds)
        const delayCentiseconds = result[i + 4]! | (result[i + 5]! << 8)
        expect(delayCentiseconds).toBe(20)
        break
      }
    }
  })

  it('should throw for empty frames array', () => {
    expect(() => encodeAnimatedGIF([], { delayMs: 100, loopCount: 0 })).toThrow()
  })

  it('should encode with non-zero loop count', () => {
    const frame = makeImageData(2, 2, 50, 50, 50)
    const result = encodeAnimatedGIF([frame], { delayMs: 100, loopCount: 3 })

    // Find NETSCAPE extension and check loop count
    // Structure: "NETSCAPE2.0" (11 bytes) + 0x03 + 0x01 + loop_low + loop_high + 0x00
    for (let i = 0; i < result.length - 16; i++) {
      if (
        result[i] === 0x4e && // N
        result[i + 1] === 0x45 && // E
        result[i + 7] === 0x45 // E (end of NETSCAPE)
      ) {
        // After 11-byte identifier: sub-block size (0x03), sub-block ID (0x01), then loop count
        const loopLow = result[i + 13]!
        const loopHigh = result[i + 14]!
        const loop = loopLow | (loopHigh << 8)
        expect(loop).toBe(3)
        break
      }
    }
  })
})

describe('exportGIF', () => {
  it('should produce a valid animated GIF from frames', () => {
    const frames = [makeImageData(4, 4, 255, 0, 0), makeImageData(4, 4, 0, 255, 0)]
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      format: 'gif',
      width: 4,
      height: 4,
      fps: 10,
    }
    const result = exportGIF(frames, settings)

    expect(result[0]).toBe(0x47) // G
    expect(result[result.length - 1]).toBe(0x3b) // trailer
  })

  it('should call progress callback', () => {
    const frames = [makeImageData(2, 2, 128, 128, 128)]
    const settings: VideoExportSettings = {
      ...defaultVideoExportSettings,
      format: 'gif',
    }
    let called = false
    exportGIF(frames, settings, (current, total) => {
      expect(current).toBeGreaterThanOrEqual(0)
      expect(total).toBeGreaterThan(0)
      called = true
    })
    expect(called).toBe(true)
  })
})

describe('MP4 muxer', () => {
  it('should produce a valid MP4 with ftyp box', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e, 0xab, 0x40, 0x50])
    const pps = new Uint8Array([0x68, 0xce, 0x38, 0x80])
    const samples = [
      {
        data: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        duration: 3000,
        isKeyframe: true,
      },
    ]

    const result = muxMP4(samples, {
      width: 320,
      height: 240,
      timescale: 90000,
      sps,
      pps,
    })

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)

    // Check ftyp box signature
    // First 4 bytes are box size, next 4 are 'ftyp'
    const ftypType = String.fromCharCode(result[4]!, result[5]!, result[6]!, result[7]!)
    expect(ftypType).toBe('ftyp')
  })

  it('should contain moov box', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e])
    const pps = new Uint8Array([0x68, 0xce])
    const samples = [{ data: new Uint8Array([0x01]), duration: 1000, isKeyframe: true }]

    const result = muxMP4(samples, {
      width: 640,
      height: 480,
      timescale: 30,
      sps,
      pps,
    })

    // Search for 'moov' box type
    let foundMoov = false
    for (let i = 0; i < result.length - 4; i++) {
      if (
        result[i] === 0x6d && // m
        result[i + 1] === 0x6f && // o
        result[i + 2] === 0x6f && // o
        result[i + 3] === 0x76 // v
      ) {
        foundMoov = true
        break
      }
    }
    expect(foundMoov).toBe(true)
  })

  it('should contain mdat box', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e])
    const pps = new Uint8Array([0x68, 0xce])
    const samples = [{ data: new Uint8Array([0xaa, 0xbb]), duration: 500, isKeyframe: true }]

    const result = muxMP4(samples, {
      width: 128,
      height: 128,
      timescale: 1000,
      sps,
      pps,
    })

    let foundMdat = false
    for (let i = 0; i < result.length - 4; i++) {
      if (
        result[i] === 0x6d && // m
        result[i + 1] === 0x64 && // d
        result[i + 2] === 0x61 && // a
        result[i + 3] === 0x74 // t
      ) {
        foundMdat = true
        break
      }
    }
    expect(foundMdat).toBe(true)
  })

  it('should handle multiple samples', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e])
    const pps = new Uint8Array([0x68, 0xce])
    const samples = [
      { data: new Uint8Array([0x01, 0x02]), duration: 3000, isKeyframe: true },
      { data: new Uint8Array([0x03, 0x04]), duration: 3000, isKeyframe: false },
      { data: new Uint8Array([0x05, 0x06]), duration: 3000, isKeyframe: false },
    ]

    const result = muxMP4(samples, {
      width: 320,
      height: 240,
      timescale: 90000,
      sps,
      pps,
    })

    expect(result.length).toBeGreaterThan(0)

    // Check mdat contains all sample data
    // Each sample is 4 (length prefix) + 2 (data) = 6 bytes, total 18 bytes payload
    // mdat header is 8 bytes, so mdat box total = 26 bytes
    let mdatOffset = -1
    for (let i = 0; i < result.length - 4; i++) {
      if (result[i] === 0x6d && result[i + 1] === 0x64 && result[i + 2] === 0x61 && result[i + 3] === 0x74) {
        mdatOffset = i - 4 // box size starts 4 bytes before type
        break
      }
    }
    expect(mdatOffset).toBeGreaterThan(0)

    const mdatSize =
      (result[mdatOffset]! << 24) |
      (result[mdatOffset + 1]! << 16) |
      (result[mdatOffset + 2]! << 8) |
      result[mdatOffset + 3]!
    expect(mdatSize).toBe(8 + 18) // header + 3 * (4 + 2)
  })

  it('should include stss box when there are mixed keyframes', () => {
    const sps = new Uint8Array([0x67, 0x42, 0x00, 0x1e])
    const pps = new Uint8Array([0x68, 0xce])
    const samples = [
      { data: new Uint8Array([0x01]), duration: 1000, isKeyframe: true },
      { data: new Uint8Array([0x02]), duration: 1000, isKeyframe: false },
      { data: new Uint8Array([0x03]), duration: 1000, isKeyframe: true },
    ]

    const result = muxMP4(samples, {
      width: 320,
      height: 240,
      timescale: 30000,
      sps,
      pps,
    })

    // Search for 'stss' box
    let foundStss = false
    for (let i = 0; i < result.length - 4; i++) {
      if (
        result[i] === 0x73 && // s
        result[i + 1] === 0x74 && // t
        result[i + 2] === 0x73 && // s
        result[i + 3] === 0x73 // s
      ) {
        foundStss = true
        break
      }
    }
    expect(foundStss).toBe(true)
  })
})
