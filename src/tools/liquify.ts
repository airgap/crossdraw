/**
 * Liquify tool — displacement field brush for interactive mesh warping.
 *
 * The tool maintains a per-pixel displacement field (dx, dy) stored as a
 * Float32Array.  Each brush stroke modifies the field, and the result is
 * rendered in real-time by sampling the original snapshot through the
 * accumulated displacement.
 */

import { bilinearSample } from '@/filters/distort'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export type LiquifyMode = 'push' | 'twirl-cw' | 'twirl-ccw' | 'bloat' | 'pinch' | 'smooth' | 'reconstruct'

export interface LiquifySettings {
  mode: LiquifyMode
  brushSize: number
  brushPressure: number
  brushRate: number
}

export interface LiquifyState {
  active: boolean
  /** Displacement field: Float32Array of size width * height * 2 (dx, dy pairs) */
  displacementField: Float32Array | null
  /** Original unmodified snapshot */
  originalSnapshot: ImageData | null
  width: number
  height: number
  chunkId: string | null
  /** Last brush position for push direction tracking */
  lastBrushX: number
  lastBrushY: number
  brushDown: boolean
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: LiquifyState = {
  active: false,
  displacementField: null,
  originalSnapshot: null,
  width: 0,
  height: 0,
  chunkId: null,
  lastBrushX: 0,
  lastBrushY: 0,
  brushDown: false,
}

const defaultSettings: LiquifySettings = {
  mode: 'push',
  brushSize: 50,
  brushPressure: 0.5,
  brushRate: 0.3,
}

let currentSettings: LiquifySettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getLiquifySettings(): LiquifySettings {
  return { ...currentSettings }
}

export function setLiquifySettings(patch: Partial<LiquifySettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isLiquifyActive(): boolean {
  return state.active
}

export function getLiquifyDisplacementField(): Float32Array | null {
  return state.displacementField
}

// ── Gaussian falloff helper ──────────────────────────────────────────────────

/**
 * Compute a smooth radial falloff in [0, 1] based on distance from center.
 * Uses a cosine-based bell curve for smooth edges.
 */
function brushFalloff(dist: number, radius: number): number {
  if (dist >= radius) return 0
  const t = dist / radius
  // Smooth cosine falloff: 1 at center, 0 at edge
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

// ── Tool lifecycle ───────────────────────────────────────────────────────────

/**
 * Begin a liquify session on the current raster layer.
 * Allocates the displacement field and takes a snapshot of the original data.
 */
export function beginLiquify(): boolean {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return false

  // Find selected raster layer
  const selectedId = store.selection.layerIds[0]
  let chunkId: string | null = null
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster' && 'imageChunkId' in layer) {
      chunkId = (layer as { imageChunkId: string }).imageChunkId
    }
  }

  // Fallback: first raster layer
  if (!chunkId) {
    const raster = artboard.layers.find((l) => l.type === 'raster')
    if (raster && 'imageChunkId' in raster) {
      chunkId = (raster as { imageChunkId: string }).imageChunkId
    }
  }

  if (!chunkId) return false

  const imgData = getRasterData(chunkId)
  if (!imgData) return false

  const { width, height } = imgData

  state.originalSnapshot = new ImageData(new Uint8ClampedArray(imgData.data), width, height)
  state.displacementField = new Float32Array(width * height * 2) // all zeros = no displacement
  state.width = width
  state.height = height
  state.chunkId = chunkId
  state.active = true
  state.brushDown = false

  return true
}

/**
 * Begin a liquify session from an existing ImageData (for testing / headless use).
 */
export function beginLiquifyFromImageData(imageData: ImageData): void {
  const { width, height } = imageData
  state.originalSnapshot = new ImageData(new Uint8ClampedArray(imageData.data), width, height)
  state.displacementField = new Float32Array(width * height * 2)
  state.width = width
  state.height = height
  state.chunkId = null
  state.active = true
  state.brushDown = false
}

/**
 * Start a brush stroke at the given position.
 */
export function startLiquifyBrush(x: number, y: number): void {
  if (!state.active) return
  state.lastBrushX = x
  state.lastBrushY = y
  state.brushDown = true
}

/**
 * Apply the liquify brush at position (x, y).
 * The brush modifies the displacement field based on the current mode.
 */
export function applyLiquifyBrush(x: number, y: number): void {
  if (!state.active || !state.displacementField) return

  const { brushSize, brushPressure, brushRate, mode } = currentSettings
  const radius = brushSize / 2
  const { width, height } = state
  const field = state.displacementField

  // Direction for push mode
  const dirX = x - state.lastBrushX
  const dirY = y - state.lastBrushY
  const dirLen = Math.sqrt(dirX * dirX + dirY * dirY)
  const ndx = dirLen > 0.01 ? dirX / dirLen : 0
  const ndy = dirLen > 0.01 ? dirY / dirLen : 0

  // Iterate over brush bounding box
  const minX = Math.max(0, Math.floor(x - radius))
  const maxX = Math.min(width - 1, Math.ceil(x + radius))
  const minY = Math.max(0, Math.floor(y - radius))
  const maxY = Math.min(height - 1, Math.ceil(y + radius))

  const strength = brushPressure * brushRate

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px - x
      const dy = py - y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const falloff = brushFalloff(dist, radius)
      if (falloff <= 0) continue

      const idx = (py * width + px) * 2
      const amount = strength * falloff

      switch (mode) {
        case 'push': {
          field[idx] = field[idx]! + ndx * amount * radius
          field[idx + 1] = field[idx + 1]! + ndy * amount * radius
          break
        }
        case 'twirl-cw': {
          // Perpendicular clockwise: (dy, -dx) relative to brush center
          const toX = dx / (dist || 1)
          const toY = dy / (dist || 1)
          field[idx] = field[idx]! + -toY * amount * radius
          field[idx + 1] = field[idx + 1]! + toX * amount * radius
          break
        }
        case 'twirl-ccw': {
          // Perpendicular counter-clockwise
          const toX2 = dx / (dist || 1)
          const toY2 = dy / (dist || 1)
          field[idx] = field[idx]! + toY2 * amount * radius
          field[idx + 1] = field[idx + 1]! + -toX2 * amount * radius
          break
        }
        case 'bloat': {
          // Push away from center
          if (dist > 0.01) {
            const toX3 = dx / dist
            const toY3 = dy / dist
            field[idx] = field[idx]! + toX3 * amount * radius
            field[idx + 1] = field[idx + 1]! + toY3 * amount * radius
          }
          break
        }
        case 'pinch': {
          // Pull toward center
          if (dist > 0.01) {
            const toX4 = dx / dist
            const toY4 = dy / dist
            field[idx] = field[idx]! - toX4 * amount * radius
            field[idx + 1] = field[idx + 1]! - toY4 * amount * radius
          }
          break
        }
        case 'smooth': {
          // Average with neighbors
          let avgDx = 0
          let avgDy = 0
          let count = 0
          for (let sy = -1; sy <= 1; sy++) {
            for (let sx = -1; sx <= 1; sx++) {
              const nx = px + sx
              const ny = py + sy
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const ni = (ny * width + nx) * 2
                avgDx += field[ni]!
                avgDy += field[ni + 1]!
                count++
              }
            }
          }
          if (count > 0) {
            avgDx /= count
            avgDy /= count
            field[idx] = field[idx]! + (avgDx - field[idx]!) * amount
            field[idx + 1] = field[idx + 1]! + (avgDy - field[idx + 1]!) * amount
          }
          break
        }
        case 'reconstruct': {
          // Reduce displacement toward zero
          field[idx] = field[idx]! * (1 - amount)
          field[idx + 1] = field[idx + 1]! * (1 - amount)
          break
        }
      }
    }
  }

  state.lastBrushX = x
  state.lastBrushY = y
}

/**
 * End the current brush stroke.
 */
export function endLiquifyBrush(): void {
  state.brushDown = false
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Render the liquify result by applying the displacement field to the original
 * snapshot.  Returns a new ImageData.
 */
export function renderLiquify(): ImageData | null {
  if (!state.active || !state.displacementField || !state.originalSnapshot) return null

  const { width, height } = state
  const field = state.displacementField
  const src = state.originalSnapshot
  const dst = new ImageData(width, height)
  const dd = dst.data

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fi = (y * width + x) * 2
      const sx = x - field[fi]!
      const sy = y - field[fi + 1]!

      const [r, g, b, a] = bilinearSample(src, sx, sy)
      const idx = (y * width + x) * 4
      dd[idx] = r
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}

/**
 * Render and update the raster cache so the viewport shows the live preview.
 */
export function updateLiquifyPreview(): void {
  if (!state.chunkId) return
  const result = renderLiquify()
  if (!result) return
  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)
}

// ── Commit / Cancel ──────────────────────────────────────────────────────────

/**
 * Commit the liquify: finalize the displacement and push undo history.
 */
export function commitLiquify(): boolean {
  if (!state.active || !state.originalSnapshot) return false

  const result = renderLiquify()
  if (!result) return false

  if (state.chunkId) {
    storeRasterData(state.chunkId, result)
    updateRasterCache(state.chunkId)

    useEditorStore.getState().pushRasterHistory('Liquify', state.chunkId, state.originalSnapshot, result)
  }

  resetState()
  return true
}

/**
 * Cancel the liquify: restore the original image and discard the displacement field.
 */
export function cancelLiquify(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }
  resetState()
}

function resetState(): void {
  state.active = false
  state.displacementField = null
  state.originalSnapshot = null
  state.width = 0
  state.height = 0
  state.chunkId = null
  state.brushDown = false
}
