import type { AnimationTrack, KeyframeProperties, Keyframe, Layer } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ── Easing functions ──

function easeLinear(t: number): number {
  return t
}

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

function easeInOut(t: number): number {
  // Smoothstep
  return t * t * (3 - 2 * t)
}

function easeSpring(t: number): number {
  // Damped harmonic oscillator approximation
  const decay = 4.0
  const frequency = 6.0
  return 1 - Math.exp(-decay * t) * Math.cos(frequency * Math.PI * t)
}

function getEasingFn(easing: Keyframe['easing']): (t: number) => number {
  switch (easing) {
    case 'linear':
      return easeLinear
    case 'ease-in':
      return easeIn
    case 'ease-out':
      return easeOut
    case 'ease-in-out':
      return easeInOut
    case 'spring':
      return easeSpring
  }
}

// ── Color interpolation ──

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  }
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [clamp(r), clamp(g), clamp(b)].map((c) => c.toString(16).padStart(2, '0')).join('')
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

// ── Keyframe interpolation ──

export function interpolateKeyframes(track: AnimationTrack, time: number): KeyframeProperties {
  const keyframes = [...track.keyframes].sort((a, b) => a.time - b.time)

  if (keyframes.length === 0) return {}
  if (keyframes.length === 1) return { ...keyframes[0]!.properties }

  // Clamp time
  const clampedTime = Math.max(0, Math.min(track.duration, time))

  // Find surrounding keyframes
  let before: Keyframe | null = null
  let after: Keyframe | null = null

  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!
    if (kf.time <= clampedTime) {
      before = kf
    }
    if (kf.time >= clampedTime && !after) {
      after = kf
    }
  }

  // Before first keyframe
  if (!before && after) return { ...after.properties }
  // After last keyframe
  if (before && !after) return { ...before.properties }
  // Exact match or same keyframe
  if (!before || !after || before.id === after.id) {
    return { ...(before ?? after)!.properties }
  }

  // Interpolate
  const span = after.time - before.time
  const rawT = span > 0 ? (clampedTime - before.time) / span : 0
  const easingFn = getEasingFn(after.easing) // use the "after" keyframe's easing
  const t = easingFn(rawT)

  const result: KeyframeProperties = {}
  const bp = before.properties
  const ap = after.properties

  // Numeric properties
  const numericKeys: (keyof KeyframeProperties)[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity']
  for (const key of numericKeys) {
    const bv = bp[key] as number | undefined
    const av = ap[key] as number | undefined
    if (bv !== undefined && av !== undefined) {
      ;(result as Record<string, number>)[key] = bv + (av - bv) * t
    } else if (bv !== undefined) {
      ;(result as Record<string, number>)[key] = bv
    } else if (av !== undefined) {
      ;(result as Record<string, number>)[key] = av
    }
  }

  // Color properties
  const colorKeys: (keyof KeyframeProperties)[] = ['fillColor', 'strokeColor']
  for (const key of colorKeys) {
    const bv = bp[key] as string | undefined
    const av = ap[key] as string | undefined
    if (bv !== undefined && av !== undefined) {
      ;(result as Record<string, string>)[key] = lerpColor(bv, av, t)
    } else if (bv !== undefined) {
      ;(result as Record<string, string>)[key] = bv
    } else if (av !== undefined) {
      ;(result as Record<string, string>)[key] = av
    }
  }

  return result
}

// ── Animation playback state ──

interface AnimationPlaybackState {
  playing: boolean
  currentTime: number // ms
  startWallTime: number // performance.now() when play started
  rafId: number
  /** Currently playing layer IDs (empty = all animated layers) */
  layerIds: string[]
}

const playback: AnimationPlaybackState = {
  playing: false,
  currentTime: 0,
  startWallTime: 0,
  rafId: 0,
  layerIds: [],
}

/** Temporary transform/property overrides applied during animation playback.
 *  Map from layerId to interpolated properties. */
const animationOverrides = new Map<string, KeyframeProperties>()

export function getAnimationOverrides(): ReadonlyMap<string, KeyframeProperties> {
  return animationOverrides
}

export function isAnimationPlaying(): boolean {
  return playback.playing
}

export function getAnimationCurrentTime(): number {
  return playback.currentTime
}

/** Listeners for animation state changes */
type AnimationListener = () => void
const listeners = new Set<AnimationListener>()

export function subscribeAnimation(fn: AnimationListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyListeners() {
  for (const fn of listeners) fn()
}

/** Get all animated layers across all artboards */
function getAnimatedLayers(): Array<{ layer: Layer; artboardId: string }> {
  const doc = useEditorStore.getState().document
  const result: Array<{ layer: Layer; artboardId: string }> = []

  for (const artboard of doc.artboards) {
    const collectLayers = (layers: Layer[]) => {
      for (const layer of layers) {
        if (layer.animation && layer.animation.keyframes.length > 0) {
          result.push({ layer, artboardId: artboard.id })
        }
        if (layer.type === 'group') {
          collectLayers(layer.children)
        }
      }
    }
    collectLayers(artboard.layers)
  }

  return result
}

/** Compute animation overrides at a given time and trigger re-render */
function computeOverrides(time: number) {
  animationOverrides.clear()
  const animated = getAnimatedLayers()

  for (const { layer } of animated) {
    if (!layer.animation) continue
    if (playback.layerIds.length > 0 && !playback.layerIds.includes(layer.id)) continue

    const track = layer.animation
    let effectiveTime = time

    if (track.loop && track.duration > 0) {
      effectiveTime = time % track.duration
    } else {
      effectiveTime = Math.min(time, track.duration)
    }

    const props = interpolateKeyframes(track, effectiveTime)
    if (Object.keys(props).length > 0) {
      animationOverrides.set(layer.id, props)
    }
  }
}

/** Animation loop */
function animationFrame(now: number) {
  if (!playback.playing) return

  const elapsed = now - playback.startWallTime
  playback.currentTime = elapsed

  // Check if all animations have completed (non-looping)
  const animated = getAnimatedLayers()
  const allDone = animated.every((a) => {
    if (!a.layer.animation) return true
    if (a.layer.animation.loop) return false
    return elapsed >= a.layer.animation.duration
  })

  computeOverrides(elapsed)
  notifyListeners()

  // Trigger viewport re-render via a benign store update
  useEditorStore.setState({})

  if (allDone && animated.length > 0) {
    stopAnimation()
    return
  }

  playback.rafId = requestAnimationFrame(animationFrame)
}

export function startAnimation(layerId?: string): void {
  if (playback.playing) stopAnimation()

  playback.playing = true
  playback.layerIds = layerId ? [layerId] : []
  playback.startWallTime = performance.now() - playback.currentTime
  playback.rafId = requestAnimationFrame(animationFrame)
  notifyListeners()
}

export function stopAnimation(): void {
  playback.playing = false
  if (playback.rafId) {
    cancelAnimationFrame(playback.rafId)
    playback.rafId = 0
  }
  animationOverrides.clear()
  notifyListeners()
  // Trigger re-render to clear overrides
  useEditorStore.setState({})
}

export function setAnimationTime(time: number): void {
  playback.currentTime = Math.max(0, time)
  if (!playback.playing) {
    computeOverrides(playback.currentTime)
    notifyListeners()
    useEditorStore.setState({})
  } else {
    playback.startWallTime = performance.now() - playback.currentTime
  }
}

export function toggleAnimation(): void {
  if (playback.playing) {
    stopAnimation()
  } else {
    startAnimation()
  }
}

/** Get the maximum animation duration across all animated layers */
export function getMaxDuration(): number {
  const animated = getAnimatedLayers()
  let maxDur = 0
  for (const { layer } of animated) {
    if (layer.animation && layer.animation.duration > maxDur) {
      maxDur = layer.animation.duration
    }
  }
  return maxDur || 3000 // default 3s
}
