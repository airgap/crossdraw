import type { AnimationTimeline, Artboard } from '@/types'
import { applyFrame } from './timeline'

// ── Onion Skin Settings ──

export interface OnionSkinSettings {
  enabled: boolean
  previousFrames: number // how many previous frames to show (1-5)
  nextFrames: number // how many next frames to show (1-5)
  previousColor: string // hex tint for previous frames (e.g. '#ff0000')
  nextColor: string // hex tint for next frames (e.g. '#00ff00')
  opacity: number // base opacity (0-1)
  falloff: number // opacity falloff per frame step (0-1), e.g. 0.5 = halves each step
}

const DEFAULT_SETTINGS: OnionSkinSettings = {
  enabled: false,
  previousFrames: 2,
  nextFrames: 1,
  previousColor: '#ff0000',
  nextColor: '#00ff00',
  opacity: 0.3,
  falloff: 0.5,
}

let currentSettings: OnionSkinSettings = { ...DEFAULT_SETTINGS }

/**
 * Get current onion skin settings.
 */
export function getOnionSkinSettings(): OnionSkinSettings {
  return { ...currentSettings }
}

/**
 * Update onion skin settings (partial update).
 */
export function setOnionSkinSettings(settings: Partial<OnionSkinSettings>): void {
  currentSettings = { ...currentSettings, ...settings }
}

/**
 * Reset to defaults.
 */
export function resetOnionSkinSettings(): void {
  currentSettings = { ...DEFAULT_SETTINGS }
}

// ── Color tinting ──

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  }
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/**
 * Apply a color tint and opacity to an ImageData (in-place mutation).
 * Blends the tint color with each pixel proportionally to the tint opacity,
 * and multiplies the alpha channel by the given opacity.
 */
export function tintImageData(imageData: ImageData, color: string, opacity: number): ImageData {
  const [tr, tg, tb] = parseHex(color)
  const data = imageData.data
  const tintStrength = 0.5 // how much tint color vs original

  for (let i = 0; i < data.length; i += 4) {
    // Blend tint color with original
    data[i] = Math.round(data[i]! * (1 - tintStrength) + tr * tintStrength)
    data[i + 1] = Math.round(data[i + 1]! * (1 - tintStrength) + tg * tintStrength)
    data[i + 2] = Math.round(data[i + 2]! * (1 - tintStrength) + tb * tintStrength)
    // Scale alpha by opacity
    data[i + 3] = Math.round(data[i + 3]! * opacity)
  }

  return imageData
}

// ── Onion overlay computation ──

export interface OnionOverlayFrame {
  frameIndex: number
  artboard: Artboard
  tintColor: string
  opacity: number
  direction: 'previous' | 'next'
}

/**
 * Compute which frames should be shown as onion skin overlays.
 * Returns an array of overlay descriptors, each containing the artboard state
 * (with layer visibility applied) and the tint/opacity to apply.
 *
 * Note: actual pixel rendering (ImageData) is done by the viewport renderer.
 * This function provides the logical frame info needed to render overlays.
 */
export function computeOnionOverlayFrames(
  timeline: AnimationTimeline,
  currentFrame: number,
  artboard: Artboard,
  settings?: OnionSkinSettings,
): OnionOverlayFrame[] {
  const s = settings ?? currentSettings
  if (!s.enabled) return []

  const overlays: OnionOverlayFrame[] = []
  const frameCount = timeline.frames.length

  // Previous frames
  for (let step = 1; step <= s.previousFrames; step++) {
    let idx = currentFrame - step
    if (idx < 0) {
      if (timeline.loop) {
        idx = frameCount + idx
      } else {
        continue
      }
    }
    if (idx < 0 || idx >= frameCount) continue

    const frameArtboard = applyFrame(timeline, idx, artboard)
    const stepOpacity = s.opacity * Math.pow(s.falloff, step - 1)

    overlays.push({
      frameIndex: idx,
      artboard: frameArtboard,
      tintColor: s.previousColor,
      opacity: stepOpacity,
      direction: 'previous',
    })
  }

  // Next frames
  for (let step = 1; step <= s.nextFrames; step++) {
    let idx = currentFrame + step
    if (idx >= frameCount) {
      if (timeline.loop) {
        idx = idx % frameCount
      } else {
        continue
      }
    }
    if (idx < 0 || idx >= frameCount) continue

    const frameArtboard = applyFrame(timeline, idx, artboard)
    const stepOpacity = s.opacity * Math.pow(s.falloff, step - 1)

    overlays.push({
      frameIndex: idx,
      artboard: frameArtboard,
      tintColor: s.nextColor,
      opacity: stepOpacity,
      direction: 'next',
    })
  }

  return overlays
}

/**
 * Compute tinted ImageData overlays from raw frame renders.
 * This is a convenience function for when the caller has already rendered
 * each overlay frame to an ImageData.
 */
export function computeOnionOverlay(
  timeline: AnimationTimeline,
  currentFrame: number,
  artboard: Artboard,
  settings?: OnionSkinSettings,
  renderFrame?: (artboard: Artboard, frameIndex: number) => ImageData,
): ImageData[] {
  if (!renderFrame) return []

  const overlayFrames = computeOnionOverlayFrames(timeline, currentFrame, artboard, settings)
  const results: ImageData[] = []

  for (const overlay of overlayFrames) {
    const imgData = renderFrame(overlay.artboard, overlay.frameIndex)
    tintImageData(imgData, overlay.tintColor, overlay.opacity)
    results.push(imgData)
  }

  return results
}
