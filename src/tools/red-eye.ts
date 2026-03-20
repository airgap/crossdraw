import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getRasterData, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedEyeSettings {
  pupilSize: number // max radius to search (pixels)
  darkenAmount: number // 0-1, how much to darken the red channel
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const defaultSettings: RedEyeSettings = {
  pupilSize: 20,
  darkenAmount: 0.8,
}

let currentSettings: RedEyeSettings = { ...defaultSettings }

export function getRedEyeSettings(): RedEyeSettings {
  return { ...currentSettings }
}

export function setRedEyeSettings(settings: Partial<RedEyeSettings>) {
  Object.assign(currentSettings, settings)
}

// ---------------------------------------------------------------------------
// Red-pixel detection
// ---------------------------------------------------------------------------

/** Check if a pixel is "red" enough to be part of a red-eye */
function isRedPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 32) return false // skip nearly-transparent
  return r > g * 1.5 && r > b * 1.5 && r > 80
}

// ---------------------------------------------------------------------------
// Flood-fill to find connected red pixels
// ---------------------------------------------------------------------------

function floodFillRed(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  maxRadius: number,
): Set<number> {
  const visited = new Set<number>()
  const result = new Set<number>()
  const stack: Array<[number, number]> = [[startX, startY]]

  const maxRadiusSq = maxRadius * maxRadius

  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    const key = y * width + x

    if (visited.has(key)) continue
    visited.add(key)

    // Check bounds
    if (x < 0 || y < 0 || x >= width || y >= height) continue

    // Check distance from start
    const dx = x - startX
    const dy = y - startY
    if (dx * dx + dy * dy > maxRadiusSq) continue

    const idx = key * 4
    const r = data[idx]!
    const g = data[idx + 1]!
    const b = data[idx + 2]!
    const a = data[idx + 3]!

    if (!isRedPixel(r, g, b, a)) continue

    result.add(key)

    // Add neighbours (4-connected)
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  return result
}

// ---------------------------------------------------------------------------
// Compute distance from edge of the red region (for soft falloff)
// ---------------------------------------------------------------------------

function computeEdgeDistances(pixels: Set<number>, width: number): Map<number, number> {
  const distances = new Map<number, number>()

  // Find edge pixels (pixels adjacent to non-red pixels)
  const edgePixels: number[] = []
  for (const key of pixels) {
    const x = key % width
    const y = Math.floor(key / width)
    const isEdge =
      !pixels.has((y - 1) * width + x) ||
      !pixels.has((y + 1) * width + x) ||
      !pixels.has(y * width + (x - 1)) ||
      !pixels.has(y * width + (x + 1))
    if (isEdge) {
      edgePixels.push(key)
      distances.set(key, 0)
    }
  }

  // BFS from edge pixels inward
  const queue = [...edgePixels]
  let qi = 0
  while (qi < queue.length) {
    const key = queue[qi++]!
    const dist = distances.get(key)!
    const x = key % width
    const y = Math.floor(key / width)

    const neighbors = [(y - 1) * width + x, (y + 1) * width + x, y * width + (x - 1), y * width + (x + 1)]

    for (const nk of neighbors) {
      if (pixels.has(nk) && !distances.has(nk)) {
        distances.set(nk, dist + 1)
        queue.push(nk)
      }
    }
  }

  return distances
}

// ---------------------------------------------------------------------------
// Apply red-eye removal
// ---------------------------------------------------------------------------

/**
 * Apply red-eye removal at a click point on the given ImageData.
 * Finds connected red pixels via flood-fill and desaturates them.
 * Returns the number of pixels affected.
 */
export function applyRedEyeRemoval(
  x: number,
  y: number,
  imageData: ImageData,
  settings?: Partial<RedEyeSettings>,
): number {
  const s = { ...currentSettings, ...settings }
  const { data, width, height } = imageData

  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= width || py >= height) return 0

  // Flood-fill to find red pixels
  const redPixels = floodFillRed(data, width, height, px, py, s.pupilSize)

  if (redPixels.size === 0) return 0

  // Compute edge distances for soft falloff
  const edgeDists = computeEdgeDistances(redPixels, width)

  // Find max distance for normalization
  let maxDist = 1
  for (const d of edgeDists.values()) {
    if (d > maxDist) maxDist = d
  }

  // Desaturate red pixels
  for (const key of redPixels) {
    const idx = key * 4
    const r = data[idx]!
    const g = data[idx + 1]!
    const b = data[idx + 2]!

    // Soft falloff: pixels near the edge get less correction
    const edgeDist = edgeDists.get(key) ?? 0
    const falloff = maxDist > 1 ? Math.min(1, edgeDist / (maxDist * 0.5)) : 1

    // Desaturate red: set R toward average of G, B
    const avgGB = (g + b) / 2
    const targetR = avgGB * (1 - s.darkenAmount) + r * (1 - s.darkenAmount) * s.darkenAmount
    const newR = Math.round(r + (targetR - r) * falloff)

    data[idx] = Math.max(0, Math.min(255, newR))
  }

  return redPixels.size
}

// ---------------------------------------------------------------------------
// Convenience: apply on the active raster layer with undo support
// ---------------------------------------------------------------------------

export function applyRedEyeAtPoint(x: number, y: number): number {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return 0

  // Find selected raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  if (!rasterLayer) return 0

  const chunkId = rasterLayer.imageChunkId
  const imageData = getRasterData(chunkId)
  if (!imageData) return 0

  // Snapshot for undo
  const before = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)

  const affected = applyRedEyeRemoval(x, y, imageData)

  if (affected > 0) {
    updateRasterCache(chunkId)
    syncCanvasToImageData(chunkId)
    store.pushRasterHistory('Red Eye Removal', chunkId, before, imageData)
  }

  return affected
}
