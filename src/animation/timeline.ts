import { v4 as uuid } from 'uuid'
import type { AnimationFrame, AnimationTimeline, Artboard } from '@/types'

// ── Timeline CRUD ──

/**
 * Create a new empty timeline with a single blank frame.
 */
export function createTimeline(fps = 12): AnimationTimeline {
  return {
    frames: [
      {
        id: uuid(),
        name: 'Frame 1',
        duration: 0,
        layerVisibility: {},
      },
    ],
    fps,
    loop: true,
    currentFrame: 0,
  }
}

/**
 * Collect current layer visibility from an artboard into a Record.
 */
function captureLayerVisibility(artboard: Artboard): Record<string, boolean> {
  const vis: Record<string, boolean> = {}
  const walk = (layers: Artboard['layers']) => {
    for (const layer of layers) {
      vis[layer.id] = layer.visible
      if (layer.type === 'group') {
        walk(layer.children)
      }
    }
  }
  walk(artboard.layers)
  return vis
}

/**
 * Add a new frame to the timeline after the given index (or at the end).
 * Copies layer visibility from the current frame if available, otherwise from the artboard.
 */
export function addFrame(timeline: AnimationTimeline, artboard: Artboard, afterIndex?: number): AnimationTimeline {
  const insertAt = afterIndex !== undefined ? afterIndex + 1 : timeline.frames.length
  const sourceFrame = timeline.frames[timeline.currentFrame]
  const layerVisibility = sourceFrame ? { ...sourceFrame.layerVisibility } : captureLayerVisibility(artboard)

  const newFrame: AnimationFrame = {
    id: uuid(),
    name: `Frame ${timeline.frames.length + 1}`,
    duration: 0,
    layerVisibility,
  }

  const frames = [...timeline.frames]
  frames.splice(insertAt, 0, newFrame)

  return {
    ...timeline,
    frames,
    currentFrame: insertAt,
  }
}

/**
 * Duplicate the frame at the given index.
 */
export function duplicateFrame(timeline: AnimationTimeline, index: number): AnimationTimeline {
  if (index < 0 || index >= timeline.frames.length) return timeline

  const source = timeline.frames[index]!
  const newFrame: AnimationFrame = {
    ...source,
    id: uuid(),
    name: `${source.name} copy`,
    layerVisibility: { ...source.layerVisibility },
    layerOpacity: source.layerOpacity ? { ...source.layerOpacity } : undefined,
  }

  const frames = [...timeline.frames]
  frames.splice(index + 1, 0, newFrame)

  return {
    ...timeline,
    frames,
    currentFrame: index + 1,
  }
}

/**
 * Delete the frame at the given index. Maintains at least 1 frame.
 */
export function deleteFrame(timeline: AnimationTimeline, index: number): AnimationTimeline {
  if (timeline.frames.length <= 1) return timeline
  if (index < 0 || index >= timeline.frames.length) return timeline

  const frames = timeline.frames.filter((_, i) => i !== index)
  const currentFrame = Math.min(timeline.currentFrame, frames.length - 1)

  return { ...timeline, frames, currentFrame }
}

/**
 * Move a frame from one index to another.
 */
export function reorderFrame(timeline: AnimationTimeline, from: number, to: number): AnimationTimeline {
  if (from < 0 || from >= timeline.frames.length) return timeline
  if (to < 0 || to >= timeline.frames.length) return timeline
  if (from === to) return timeline

  const frames = [...timeline.frames]
  const [moved] = frames.splice(from, 1)
  frames.splice(to, 0, moved!)

  // Follow the current frame if it was moved
  let currentFrame = timeline.currentFrame
  if (currentFrame === from) {
    currentFrame = to
  } else {
    if (from < currentFrame && to >= currentFrame) currentFrame--
    else if (from > currentFrame && to <= currentFrame) currentFrame++
  }

  return { ...timeline, frames, currentFrame }
}

/**
 * Set the duration override for a specific frame.
 */
export function setFrameDuration(timeline: AnimationTimeline, index: number, duration: number): AnimationTimeline {
  if (index < 0 || index >= timeline.frames.length) return timeline

  const frames = timeline.frames.map((f, i) => (i === index ? { ...f, duration } : f))
  return { ...timeline, frames }
}

/**
 * Get the effective duration of a frame (its own duration or the default from fps).
 */
export function getFrameDuration(timeline: AnimationTimeline, index: number): number {
  const frame = timeline.frames[index]
  if (!frame) return 1000 / timeline.fps
  return frame.duration > 0 ? frame.duration : 1000 / timeline.fps
}

/**
 * Apply a frame's layer visibility and opacity to the artboard layers.
 * Returns a new artboard with updated layers (immutable).
 */
export function applyFrame(timeline: AnimationTimeline, index: number, artboard: Artboard): Artboard {
  const frameData = timeline.frames[index]
  if (!frameData) return artboard

  const frameLV = frameData.layerVisibility
  const frameLO = frameData.layerOpacity

  function applyToLayers(layers: Artboard['layers']): Artboard['layers'] {
    return layers.map((layer) => {
      const visible = frameLV[layer.id] ?? layer.visible
      const opacity = frameLO && frameLO[layer.id] !== undefined ? frameLO[layer.id]! : layer.opacity

      if (layer.type === 'group') {
        return {
          ...layer,
          visible,
          opacity,
          children: applyToLayers(layer.children),
        }
      }
      return { ...layer, visible, opacity }
    })
  }

  return { ...artboard, layers: applyToLayers(artboard.layers) }
}

// ── Playback ──

interface PlaybackState {
  playing: boolean
  timerId: ReturnType<typeof setTimeout> | null
  currentFrame: number
  onFrame: ((index: number) => void) | null
}

const playbackState: PlaybackState = {
  playing: false,
  timerId: null,
  currentFrame: 0,
  onFrame: null,
}

// Store ref to current timeline for playback tick
let playbackTimeline: AnimationTimeline | null = null

function tick() {
  if (!playbackState.playing || !playbackTimeline) return

  const tl = playbackTimeline
  let next = playbackState.currentFrame + 1
  if (next >= tl.frames.length) {
    if (tl.loop) {
      next = 0
    } else {
      stopPlayback()
      return
    }
  }

  playbackState.currentFrame = next
  if (playbackState.onFrame) {
    playbackState.onFrame(next)
  }

  // Schedule next tick
  const duration = getFrameDuration(tl, next)
  playbackState.timerId = setTimeout(tick, duration)
}

/**
 * Start frame-by-frame playback.
 */
export function startPlayback(timeline: AnimationTimeline, onFrame: (index: number) => void): void {
  stopPlayback()
  playbackTimeline = timeline
  playbackState.playing = true
  playbackState.currentFrame = timeline.currentFrame
  playbackState.onFrame = onFrame

  // Start the first tick after the current frame's duration
  const duration = getFrameDuration(timeline, timeline.currentFrame)
  playbackState.timerId = setTimeout(tick, duration)
}

/**
 * Stop playback.
 */
export function stopPlayback(): void {
  playbackState.playing = false
  if (playbackState.timerId !== null) {
    clearTimeout(playbackState.timerId)
    playbackState.timerId = null
  }
  playbackState.onFrame = null
  playbackTimeline = null
}

/**
 * Query whether playback is active.
 */
export function isPlaying(): boolean {
  return playbackState.playing
}

/**
 * Update the timeline reference during playback (e.g. if fps changed).
 */
export function updatePlaybackTimeline(timeline: AnimationTimeline): void {
  if (playbackState.playing) {
    playbackTimeline = timeline
  }
}
