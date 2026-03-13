import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  createTimeline,
  addFrame,
  duplicateFrame,
  deleteFrame,
  reorderFrame,
  setFrameDuration,
  getFrameDuration,
  applyFrame,
  startPlayback,
  stopPlayback,
  isPlaying,
} from '@/animation/timeline'
import {
  tintImageData,
  getOnionSkinSettings,
  setOnionSkinSettings,
  resetOnionSkinSettings,
  computeOnionOverlayFrames,
} from '@/animation/onion-skin'
import type { Artboard, VectorLayer } from '@/types'

// ── Helper factories ──

function makeArtboard(layerCount = 3): Artboard {
  const layers: VectorLayer[] = []
  for (let i = 0; i < layerCount; i++) {
    layers.push({
      id: `layer-${i}`,
      name: `Layer ${i}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [],
      fill: { type: 'solid', color: '#000000', opacity: 1 },
      stroke: null,
    })
  }
  return {
    id: 'artboard-1',
    name: 'Test Artboard',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    layers,
  }
}

// ── Timeline CRUD ──

describe('Timeline CRUD', () => {
  test('createTimeline creates a timeline with 1 frame', () => {
    const tl = createTimeline(24)
    expect(tl.fps).toBe(24)
    expect(tl.loop).toBe(true)
    expect(tl.currentFrame).toBe(0)
    expect(tl.frames).toHaveLength(1)
    expect(tl.frames[0]!.name).toBe('Frame 1')
    expect(tl.frames[0]!.duration).toBe(0)
  })

  test('createTimeline defaults to 12 fps', () => {
    const tl = createTimeline()
    expect(tl.fps).toBe(12)
  })

  test('addFrame adds a frame after the specified index', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard, 0)
    expect(tl.frames).toHaveLength(2)
    expect(tl.currentFrame).toBe(1)
    expect(tl.frames[1]!.name).toBe('Frame 2')
  })

  test('addFrame at end when no index specified', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    expect(tl.frames).toHaveLength(2)
    expect(tl.currentFrame).toBe(1)
  })

  test('addFrame copies layer visibility from current frame', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    // Set some visibility on frame 0
    tl.frames[0]!.layerVisibility = { 'layer-0': false, 'layer-1': true, 'layer-2': true }
    tl = addFrame(tl, artboard)
    const newFrame = tl.frames[tl.currentFrame]!
    expect(newFrame.layerVisibility['layer-0']).toBe(false)
    expect(newFrame.layerVisibility['layer-1']).toBe(true)
  })

  test('duplicateFrame copies frame data', () => {
    let tl = createTimeline()
    tl.frames[0]!.layerVisibility = { 'layer-0': false }
    tl.frames[0]!.duration = 200
    tl = duplicateFrame(tl, 0)
    expect(tl.frames).toHaveLength(2)
    expect(tl.currentFrame).toBe(1)
    expect(tl.frames[1]!.layerVisibility['layer-0']).toBe(false)
    expect(tl.frames[1]!.duration).toBe(200)
    expect(tl.frames[1]!.name).toContain('copy')
    // Different IDs
    expect(tl.frames[0]!.id).not.toBe(tl.frames[1]!.id)
  })

  test('duplicateFrame with invalid index returns unchanged', () => {
    const tl = createTimeline()
    const result = duplicateFrame(tl, 5)
    expect(result.frames).toHaveLength(1)
  })

  test('deleteFrame removes a frame', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    expect(tl.frames).toHaveLength(3)
    tl = deleteFrame(tl, 1)
    expect(tl.frames).toHaveLength(2)
  })

  test('deleteFrame refuses to remove the last frame', () => {
    let tl = createTimeline()
    tl = deleteFrame(tl, 0)
    expect(tl.frames).toHaveLength(1)
  })

  test('deleteFrame adjusts currentFrame if needed', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    // currentFrame is 2 after adding 2 frames
    tl = deleteFrame(tl, 2)
    expect(tl.currentFrame).toBeLessThanOrEqual(tl.frames.length - 1)
  })

  test('reorderFrame moves frame from one position to another', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    // Frames: 0, 1, 2
    const id0 = tl.frames[0]!.id
    void tl.frames[2]!.id
    tl = reorderFrame(tl, 0, 2)
    expect(tl.frames[2]!.id).toBe(id0)
    expect(tl.frames[0]!.id).not.toBe(id0)
  })

  test('reorderFrame with same index returns unchanged', () => {
    const tl = createTimeline()
    const result = reorderFrame(tl, 0, 0)
    expect(result).toBe(tl)
  })

  test('reorderFrame with out-of-bounds returns unchanged', () => {
    const tl = createTimeline()
    const result = reorderFrame(tl, -1, 0)
    expect(result).toBe(tl)
  })
})

// ── Frame Duration ──

describe('Frame Duration', () => {
  test('setFrameDuration overrides duration', () => {
    let tl = createTimeline(12)
    tl = setFrameDuration(tl, 0, 500)
    expect(tl.frames[0]!.duration).toBe(500)
  })

  test('getFrameDuration returns custom duration when set', () => {
    let tl = createTimeline(12)
    tl = setFrameDuration(tl, 0, 250)
    expect(getFrameDuration(tl, 0)).toBe(250)
  })

  test('getFrameDuration returns fps-based default when duration is 0', () => {
    const tl = createTimeline(10) // 10 fps = 100ms per frame
    expect(getFrameDuration(tl, 0)).toBeCloseTo(100)
  })

  test('getFrameDuration returns fps default for missing index', () => {
    const tl = createTimeline(24)
    expect(getFrameDuration(tl, 99)).toBeCloseTo(1000 / 24)
  })
})

// ── Apply Frame ──

describe('applyFrame', () => {
  test('applies layer visibility from frame to artboard', () => {
    let tl = createTimeline()
    tl.frames[0]!.layerVisibility = { 'layer-0': false, 'layer-1': true, 'layer-2': false }
    const artboard = makeArtboard()
    const result = applyFrame(tl, 0, artboard)
    expect(result.layers[0]!.visible).toBe(false)
    expect(result.layers[1]!.visible).toBe(true)
    expect(result.layers[2]!.visible).toBe(false)
  })

  test('applies layer opacity overrides from frame', () => {
    let tl = createTimeline()
    tl.frames[0]!.layerOpacity = { 'layer-0': 0.5, 'layer-2': 0.25 }
    const artboard = makeArtboard()
    const result = applyFrame(tl, 0, artboard)
    expect(result.layers[0]!.opacity).toBe(0.5)
    expect(result.layers[1]!.opacity).toBe(1) // unchanged
    expect(result.layers[2]!.opacity).toBe(0.25)
  })

  test('returns artboard unchanged for invalid frame index', () => {
    const tl = createTimeline()
    const artboard = makeArtboard()
    const result = applyFrame(tl, 99, artboard)
    expect(result).toBe(artboard)
  })

  test('preserves original artboard immutability', () => {
    let tl = createTimeline()
    tl.frames[0]!.layerVisibility = { 'layer-0': false }
    const artboard = makeArtboard()
    const result = applyFrame(tl, 0, artboard)
    expect(artboard.layers[0]!.visible).toBe(true) // original unchanged
    expect(result.layers[0]!.visible).toBe(false) // new has changes
  })
})

// ── Playback ──

describe('Playback', () => {
  afterEach(() => {
    stopPlayback()
  })

  test('isPlaying is false initially', () => {
    expect(isPlaying()).toBe(false)
  })

  test('startPlayback sets playing to true', () => {
    const artboard = makeArtboard()
    let tl = createTimeline(10)
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = { ...tl, currentFrame: 0 }

    startPlayback(tl, () => {})
    expect(isPlaying()).toBe(true)
  })

  test('stopPlayback sets playing to false', () => {
    const artboard = makeArtboard()
    let tl = createTimeline(10)
    tl = addFrame(tl, artboard)

    startPlayback(tl, () => {})
    stopPlayback()
    expect(isPlaying()).toBe(false)
  })

  test('playback calls onFrame with next frame index', async () => {
    const artboard = makeArtboard()
    let tl = createTimeline(100) // 100fps = 10ms per frame for fast test
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = { ...tl, currentFrame: 0 }

    const frames: number[] = []
    startPlayback(tl, (index) => {
      frames.push(index)
    })

    // Wait for a few ticks (each ~10ms)
    await new Promise((resolve) => setTimeout(resolve, 60))
    stopPlayback()

    expect(frames.length).toBeGreaterThan(0)
    expect(frames[0]).toBe(1) // advances from frame 0 to frame 1
  })
})

// ── Onion Skin Tinting ──

describe('Onion Skin Tinting', () => {
  test('tintImageData applies red tint', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    const imgData = { data, width: 2, height: 1, colorSpace: 'srgb' as const }

    tintImageData(imgData as unknown as ImageData, '#ff0000', 0.5)

    // Pixel 0: white (255,255,255) tinted red at 50% tint strength
    // R: 255*(0.5) + 255*0.5 = 255 (still max)
    // G: 255*(0.5) + 0*0.5 = 128 (approx)
    // B: 255*(0.5) + 0*0.5 = 128 (approx)
    expect(data[0]).toBe(255) // R stays high
    expect(data[1]).toBe(128) // G reduced
    expect(data[2]).toBe(128) // B reduced
    // Alpha: 255 * 0.5 = 128
    expect(data[3]).toBe(128)
  })

  test('tintImageData applies green tint', () => {
    const data = new Uint8ClampedArray([255, 255, 255, 200])
    const imgData = { data, width: 1, height: 1, colorSpace: 'srgb' as const }

    tintImageData(imgData as unknown as ImageData, '#00ff00', 1.0)

    // Pixel: white (255,255,255) tinted green at 50% tint strength, alpha * 1.0
    expect(data[0]).toBe(128) // R reduced
    expect(data[1]).toBe(255) // G stays high
    expect(data[2]).toBe(128) // B reduced
    expect(data[3]).toBe(200) // alpha * 1.0 = 200
  })

  test('tintImageData with zero opacity makes fully transparent', () => {
    const data = new Uint8ClampedArray([100, 100, 100, 255])
    const imgData = { data, width: 1, height: 1, colorSpace: 'srgb' as const }

    tintImageData(imgData as unknown as ImageData, '#ff0000', 0)

    expect(data[3]).toBe(0) // alpha is 0
  })
})

// ── Onion Skin Settings ──

describe('Onion Skin Settings', () => {
  beforeEach(() => {
    resetOnionSkinSettings()
  })

  test('default settings', () => {
    const s = getOnionSkinSettings()
    expect(s.enabled).toBe(false)
    expect(s.previousFrames).toBe(2)
    expect(s.nextFrames).toBe(1)
    expect(s.previousColor).toBe('#ff0000')
    expect(s.nextColor).toBe('#00ff00')
    expect(s.opacity).toBe(0.3)
    expect(s.falloff).toBe(0.5)
  })

  test('setOnionSkinSettings updates partially', () => {
    setOnionSkinSettings({ enabled: true, opacity: 0.7 })
    const s = getOnionSkinSettings()
    expect(s.enabled).toBe(true)
    expect(s.opacity).toBe(0.7)
    expect(s.previousFrames).toBe(2) // unchanged
  })

  test('resetOnionSkinSettings restores defaults', () => {
    setOnionSkinSettings({ enabled: true, previousFrames: 5 })
    resetOnionSkinSettings()
    const s = getOnionSkinSettings()
    expect(s.enabled).toBe(false)
    expect(s.previousFrames).toBe(2)
  })
})

// ── Onion Overlay Frames ──

describe('Onion Overlay Frames', () => {
  test('returns empty when disabled', () => {
    const tl = createTimeline()
    const artboard = makeArtboard()
    const overlays = computeOnionOverlayFrames(tl, 0, artboard, {
      enabled: false,
      previousFrames: 2,
      nextFrames: 1,
      previousColor: '#ff0000',
      nextColor: '#00ff00',
      opacity: 0.3,
      falloff: 0.5,
    })
    expect(overlays).toHaveLength(0)
  })

  test('computes previous and next overlays', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    // 5 frames total, current at 2

    const settings = {
      enabled: true,
      previousFrames: 2,
      nextFrames: 1,
      previousColor: '#ff0000',
      nextColor: '#00ff00',
      opacity: 0.6,
      falloff: 0.5,
    }

    const overlays = computeOnionOverlayFrames(tl, 2, artboard, settings)

    // Should have 2 previous + 1 next = 3 overlays
    expect(overlays).toHaveLength(3)

    // Previous frames
    const prevOverlays = overlays.filter((o) => o.direction === 'previous')
    expect(prevOverlays).toHaveLength(2)
    expect(prevOverlays[0]!.frameIndex).toBe(1)
    expect(prevOverlays[0]!.tintColor).toBe('#ff0000')
    expect(prevOverlays[0]!.opacity).toBeCloseTo(0.6) // step 1: opacity * falloff^0
    expect(prevOverlays[1]!.frameIndex).toBe(0)
    expect(prevOverlays[1]!.opacity).toBeCloseTo(0.3) // step 2: opacity * falloff^1

    // Next frames
    const nextOverlays = overlays.filter((o) => o.direction === 'next')
    expect(nextOverlays).toHaveLength(1)
    expect(nextOverlays[0]!.frameIndex).toBe(3)
    expect(nextOverlays[0]!.tintColor).toBe('#00ff00')
  })

  test('wraps around when looping', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = { ...tl, loop: true }
    // 3 frames, current at 0, loop enabled

    const settings = {
      enabled: true,
      previousFrames: 1,
      nextFrames: 1,
      previousColor: '#ff0000',
      nextColor: '#00ff00',
      opacity: 0.5,
      falloff: 0.5,
    }

    const overlays = computeOnionOverlayFrames(tl, 0, artboard, settings)

    // Previous should wrap to last frame (index 2)
    const prevOverlays = overlays.filter((o) => o.direction === 'previous')
    expect(prevOverlays).toHaveLength(1)
    expect(prevOverlays[0]!.frameIndex).toBe(2)

    // Next should be frame 1
    const nextOverlays = overlays.filter((o) => o.direction === 'next')
    expect(nextOverlays).toHaveLength(1)
    expect(nextOverlays[0]!.frameIndex).toBe(1)
  })

  test('does not wrap when not looping', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = { ...tl, loop: false }
    // 2 frames, current at 0, no loop

    const settings = {
      enabled: true,
      previousFrames: 1,
      nextFrames: 1,
      previousColor: '#ff0000',
      nextColor: '#00ff00',
      opacity: 0.5,
      falloff: 0.5,
    }

    const overlays = computeOnionOverlayFrames(tl, 0, artboard, settings)

    // No previous frame available (we're at 0 and not looping)
    const prevOverlays = overlays.filter((o) => o.direction === 'previous')
    expect(prevOverlays).toHaveLength(0)

    // Next frame should be 1
    const nextOverlays = overlays.filter((o) => o.direction === 'next')
    expect(nextOverlays).toHaveLength(1)
  })

  test('opacity falls off correctly with multiple frames', () => {
    const artboard = makeArtboard()
    let tl = createTimeline()
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    tl = addFrame(tl, artboard)
    // 5 frames

    const settings = {
      enabled: true,
      previousFrames: 3,
      nextFrames: 0,
      previousColor: '#ff0000',
      nextColor: '#00ff00',
      opacity: 0.8,
      falloff: 0.5,
    }

    const overlays = computeOnionOverlayFrames(tl, 3, artboard, settings)
    expect(overlays).toHaveLength(3)

    // step 1: 0.8 * 0.5^0 = 0.8
    expect(overlays[0]!.opacity).toBeCloseTo(0.8)
    // step 2: 0.8 * 0.5^1 = 0.4
    expect(overlays[1]!.opacity).toBeCloseTo(0.4)
    // step 3: 0.8 * 0.5^2 = 0.2
    expect(overlays[2]!.opacity).toBeCloseTo(0.2)
  })
})
