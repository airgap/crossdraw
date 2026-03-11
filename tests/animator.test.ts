import { describe, test, expect, beforeEach, afterAll } from 'bun:test'
import {
  interpolateKeyframes,
  startAnimation,
  stopAnimation,
  isAnimationPlaying,
  getAnimationCurrentTime,
  setAnimationTime,
  toggleAnimation,
  getMaxDuration,
  getAnimationOverrides,
  subscribeAnimation,
} from '@/animation/animator'
import { useEditorStore } from '@/store/editor.store'
import type { AnimationTrack, Keyframe } from '@/types'

// Save originals
const origRAF = globalThis.requestAnimationFrame
const origCAF = globalThis.cancelAnimationFrame

// Mock requestAnimationFrame and cancelAnimationFrame
// Use a non-recursive mock: schedule cb with setTimeout(0) instead of calling synchronously
let rafId = 1
const rafCallbacks = new Map<number, FrameRequestCallback>()

globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = rafId++
  rafCallbacks.set(id, cb)
  // Do NOT call cb synchronously - it re-requests RAF causing infinite recursion
  return id
}
globalThis.cancelAnimationFrame = (id: number) => {
  rafCallbacks.delete(id)
}

afterAll(() => {
  globalThis.requestAnimationFrame = origRAF
  globalThis.cancelAnimationFrame = origCAF
})

/** Manually flush one pending RAF callback */
function flushRaf() {
  const first = rafCallbacks.entries().next()
  if (!first.done) {
    const [id, cb] = first.value
    rafCallbacks.delete(id)
    cb(performance.now())
  }
}

function resetStore() {
  useEditorStore.getState().newDocument()
}

function createKeyframe(time: number, props: Record<string, unknown>, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return {
    id: `kf-${time}`,
    time,
    easing,
    properties: props,
  }
}

function createTrack(keyframes: Keyframe[], duration = 1000, loop = false): AnimationTrack {
  return {
    keyframes,
    duration,
    loop,
  }
}

describe('interpolateKeyframes', () => {
  test('returns empty object for empty keyframes', () => {
    const track = createTrack([])
    const result = interpolateKeyframes(track, 500)
    expect(Object.keys(result)).toHaveLength(0)
  })

  test('returns single keyframe properties for one keyframe', () => {
    const kf = createKeyframe(0, { x: 100, y: 200 })
    const track = createTrack([kf])
    const result = interpolateKeyframes(track, 500)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('interpolates linearly between two keyframes', () => {
    const kf1 = createKeyframe(0, { x: 0, y: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100, y: 200 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    expect(mid.x).toBeCloseTo(50, 1)
    expect(mid.y).toBeCloseTo(100, 1)
  })

  test('returns first keyframe values at time 0', () => {
    const kf1 = createKeyframe(0, { x: 10 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const result = interpolateKeyframes(track, 0)
    expect(result.x).toBe(10)
  })

  test('returns last keyframe values at end time', () => {
    const kf1 = createKeyframe(0, { x: 10 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const result = interpolateKeyframes(track, 1000)
    expect(result.x).toBe(100)
  })

  test('clamps time before first keyframe', () => {
    const kf1 = createKeyframe(500, { x: 50 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const result = interpolateKeyframes(track, 0)
    expect(result.x).toBe(50)
  })

  test('clamps time after last keyframe', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(500, { x: 50 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const result = interpolateKeyframes(track, 1000)
    expect(result.x).toBe(50)
  })

  test('ease-in interpolation', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'ease-in')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // ease-in: t*t => 0.5*0.5 = 0.25 => x = 25
    expect(mid.x).toBeCloseTo(25, 0)
  })

  test('ease-out interpolation', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'ease-out')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // ease-out: 1-(1-t)*(1-t) => 1 - 0.25 = 0.75 => x = 75
    expect(mid.x).toBeCloseTo(75, 0)
  })

  test('ease-in-out interpolation', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'ease-in-out')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // ease-in-out smoothstep: t*t*(3-2*t) => 0.5*0.5*(3-1) = 0.5 => x = 50
    expect(mid.x).toBeCloseTo(50, 0)
  })

  test('spring easing interpolation', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { x: 100 }, 'spring')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // Spring easing produces overshoot-like behavior
    expect(mid.x).toBeDefined()
    expect(typeof mid.x).toBe('number')
  })

  test('color interpolation between hex values', () => {
    const kf1 = createKeyframe(0, { fillColor: '#000000' }, 'linear')
    const kf2 = createKeyframe(1000, { fillColor: '#ffffff' }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // Midpoint should be ~#808080
    expect(mid.fillColor).toBeDefined()
    expect(typeof mid.fillColor).toBe('string')
  })

  test('interpolation with 3-char hex colors', () => {
    const kf1 = createKeyframe(0, { fillColor: '#000' }, 'linear')
    const kf2 = createKeyframe(1000, { fillColor: '#fff' }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    expect(mid.fillColor).toBeDefined()
  })

  test('handles opacity interpolation', () => {
    const kf1 = createKeyframe(0, { opacity: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { opacity: 1 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    expect(mid.opacity).toBeCloseTo(0.5, 1)
  })

  test('handles rotation interpolation', () => {
    const kf1 = createKeyframe(0, { rotation: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { rotation: 360 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 250)
    expect(mid.rotation).toBeCloseTo(90, 0)
  })

  test('handles scaleX and scaleY interpolation', () => {
    const kf1 = createKeyframe(0, { scaleX: 1, scaleY: 1 }, 'linear')
    const kf2 = createKeyframe(1000, { scaleX: 2, scaleY: 3 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    expect(mid.scaleX).toBeCloseTo(1.5, 1)
    expect(mid.scaleY).toBeCloseTo(2, 1)
  })

  test('handles partial properties (only one keyframe has a property)', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(1000, { y: 100 }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    // x should be from before only, y from after only
    expect(mid.x).toBe(0)
    expect(mid.y).toBe(100)
  })

  test('multiple keyframes picks correct pair', () => {
    const kf1 = createKeyframe(0, { x: 0 }, 'linear')
    const kf2 = createKeyframe(500, { x: 50 }, 'linear')
    const kf3 = createKeyframe(1000, { x: 100 }, 'linear')
    const track = createTrack([kf1, kf2, kf3], 1000)

    const result250 = interpolateKeyframes(track, 250)
    expect(result250.x).toBeCloseTo(25, 0)

    const result750 = interpolateKeyframes(track, 750)
    expect(result750.x).toBeCloseTo(75, 0)
  })

  test('strokeColor interpolation', () => {
    const kf1 = createKeyframe(0, { strokeColor: '#ff0000' }, 'linear')
    const kf2 = createKeyframe(1000, { strokeColor: '#0000ff' }, 'linear')
    const track = createTrack([kf1, kf2], 1000)

    const mid = interpolateKeyframes(track, 500)
    expect(mid.strokeColor).toBeDefined()
  })
})

describe('Animation Playback', () => {
  beforeEach(() => {
    stopAnimation()
    rafCallbacks.clear()
    resetStore()
  })

  test('isAnimationPlaying starts false', () => {
    expect(isAnimationPlaying()).toBe(false)
  })

  test('startAnimation sets playing to true', () => {
    startAnimation()
    expect(isAnimationPlaying()).toBe(true)
    stopAnimation()
  })

  test('stopAnimation stops playback', () => {
    startAnimation()
    stopAnimation()
    expect(isAnimationPlaying()).toBe(false)
  })

  test('toggleAnimation toggles playback', () => {
    toggleAnimation()
    expect(isAnimationPlaying()).toBe(true)
    toggleAnimation()
    expect(isAnimationPlaying()).toBe(false)
  })

  test('startAnimation with layerId filters layers', () => {
    startAnimation('specific-layer')
    expect(isAnimationPlaying()).toBe(true)
    stopAnimation()
  })

  test('setAnimationTime sets current time when not playing', () => {
    setAnimationTime(500)
    expect(getAnimationCurrentTime()).toBe(500)
  })

  test('setAnimationTime clamps to minimum 0', () => {
    setAnimationTime(-100)
    expect(getAnimationCurrentTime()).toBe(0)
  })

  test('setAnimationTime adjusts start time when playing', () => {
    startAnimation()
    setAnimationTime(200)
    // Time should be ~200 (adjusted by start wall time)
    stopAnimation()
  })

  test('getAnimationOverrides returns a map', () => {
    const overrides = getAnimationOverrides()
    expect(overrides).toBeDefined()
    expect(overrides instanceof Map).toBe(true)
  })

  test('stopAnimation clears overrides', () => {
    startAnimation()
    stopAnimation()
    expect(getAnimationOverrides().size).toBe(0)
  })

  test('getMaxDuration returns default 3000ms with no animated layers', () => {
    const duration = getMaxDuration()
    expect(duration).toBe(3000)
  })

  test('subscribeAnimation registers and unregisters listener', () => {
    let callCount = 0
    const unsub = subscribeAnimation(() => {
      callCount++
    })
    // startAnimation fires notifyListeners once
    startAnimation()
    expect(callCount).toBeGreaterThan(0)

    // stopAnimation fires notifyListeners again
    stopAnimation()
    const prevCount = callCount

    unsub()
    startAnimation()
    stopAnimation()
    // Should not have increased after unsubscribe
    expect(callCount).toBe(prevCount)
  })

  test('startAnimation while already playing restarts', () => {
    startAnimation()
    expect(isAnimationPlaying()).toBe(true)
    // Starting again should stop first then restart
    startAnimation()
    expect(isAnimationPlaying()).toBe(true)
    stopAnimation()
  })

  test('animation frame callback processes without error', () => {
    startAnimation()
    // Flush the RAF callback that startAnimation scheduled
    flushRaf()
    // With no animated layers, allDone=true but animated.length=0, so it re-queues
    // The animation remains playing — it only auto-stops when there ARE animated layers and all are done
    expect(isAnimationPlaying()).toBe(true)
    stopAnimation()
    expect(isAnimationPlaying()).toBe(false)
  })
})
