/**
 * Cage Transform tool — Mean Value Coordinate (MVC) deformation.
 *
 * The user draws a closed polygon "cage" around a region, then drags cage
 * vertices to deform the enclosed image.  Mean Value Coordinates provide
 * smooth, shape-preserving deformation that is well-suited for organic shapes.
 *
 * Reference: Hormann & Floater — "Mean Value Coordinates for Arbitrary Planar
 * Polygons" (2006).
 */

import { bilinearSample } from '@/filters/distort'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CageVertex {
  x: number
  y: number
  originalX: number
  originalY: number
}

export type CagePhase = 'draw' | 'deform'

export interface CageTransformState {
  active: boolean
  phase: CagePhase
  vertices: CageVertex[]
  /** Is the cage closed? */
  closed: boolean
  /** Chunk ID */
  chunkId: string | null
  /** Original image snapshot */
  originalSnapshot: ImageData | null
  /** Pre-computed MVC weights for interior pixels: Map<pixelIndex, weights[]> */
  weightCache: Map<number, number[]>
  /** Bounding box of the cage for optimization */
  cacheBounds: { minX: number; minY: number; maxX: number; maxY: number } | null
}

export interface CageTransformSettings {
  showCage: boolean
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: CageTransformState = {
  active: false,
  phase: 'draw',
  vertices: [],
  closed: false,
  chunkId: null,
  originalSnapshot: null,
  weightCache: new Map(),
  cacheBounds: null,
}

const defaultSettings: CageTransformSettings = {
  showCage: true,
}

let currentSettings: CageTransformSettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getCageTransformSettings(): CageTransformSettings {
  return { ...currentSettings }
}

export function setCageTransformSettings(patch: Partial<CageTransformSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isCageTransformActive(): boolean {
  return state.active
}

export function getCagePhase(): CagePhase {
  return state.phase
}

export function getCageVertices(): CageVertex[] {
  return state.vertices.map((v) => ({ ...v }))
}

export function isCageClosed(): boolean {
  return state.closed
}

// ── Vertex management ────────────────────────────────────────────────────────

/**
 * Add a vertex to the cage (draw phase only).
 */
export function addCageVertex(x: number, y: number): void {
  if (!state.active || state.phase !== 'draw' || state.closed) return
  state.vertices.push({ x, y, originalX: x, originalY: y })
}

/**
 * Close the cage polygon. Requires at least 3 vertices.
 */
export function closeCage(): boolean {
  if (!state.active || state.phase !== 'draw') return false
  if (state.vertices.length < 3) return false

  state.closed = true
  return true
}

/**
 * Enter deform phase after closing the cage.
 * Pre-computes MVC weights for interior pixels.
 */
export function enterDeformPhase(): boolean {
  if (!state.active || !state.closed || state.phase !== 'draw') return false
  if (!state.originalSnapshot) return false

  state.phase = 'deform'

  // Pre-compute MVC weights for interior pixels
  precomputeWeights()

  return true
}

/**
 * Move a cage vertex during deform phase.
 */
export function moveCageVertex(index: number, x: number, y: number): void {
  if (!state.active || state.phase !== 'deform') return
  if (index < 0 || index >= state.vertices.length) return
  state.vertices[index]!.x = x
  state.vertices[index]!.y = y
}

// ── Mean Value Coordinates ───────────────────────────────────────────────────

/**
 * Compute the Mean Value Coordinates for a point relative to a polygon.
 *
 * MVC weight for vertex i:
 *   wi = (tan(alpha_{i-1}/2) + tan(alpha_i/2)) / |p_i - v|
 *
 * where alpha_i is the angle at v in the triangle (v, p_i, p_{i+1}).
 *
 * Returns normalised weights that sum to 1.
 */
export function computeMVCWeights(vx: number, vy: number, polygon: { x: number; y: number }[]): number[] {
  const n = polygon.length
  const weights = new Array<number>(n).fill(0)

  // Vectors from v to each polygon vertex
  const s: { x: number; y: number; len: number }[] = []
  for (let i = 0; i < n; i++) {
    const dx = polygon[i]!.x - vx
    const dy = polygon[i]!.y - vy
    const len = Math.sqrt(dx * dx + dy * dy)
    s.push({ x: dx, y: dy, len })
  }

  // Check if point is exactly on a vertex
  for (let i = 0; i < n; i++) {
    if (s[i]!.len < 1e-10) {
      weights[i] = 1
      return weights
    }
  }

  let totalWeight = 0

  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n
    const si = s[i]!
    const sNext = s[(i + 1) % n]!
    const sPrev = s[prev]!

    // Angle at v between edge to p_i and edge to p_{i+1}
    const dotNext = si.x * sNext.x + si.y * sNext.y
    const crossNext = si.x * sNext.y - si.y * sNext.x
    const alphaI = Math.atan2(crossNext, dotNext)

    // Angle at v between edge to p_{i-1} and edge to p_i
    const dotPrev = sPrev.x * si.x + sPrev.y * si.y
    const crossPrev = sPrev.x * si.y - sPrev.y * si.x
    const alphaPrev = Math.atan2(crossPrev, dotPrev)

    // Tangent half-angles
    const tanHalfAlpha = Math.tan(alphaI / 2)
    const tanHalfPrev = Math.tan(alphaPrev / 2)

    const w = (tanHalfPrev + tanHalfAlpha) / si.len
    weights[i] = w
    totalWeight += w
  }

  // Normalise
  if (Math.abs(totalWeight) > 1e-12) {
    for (let i = 0; i < n; i++) {
      weights[i] = weights[i]! / totalWeight
    }
  }

  return weights
}

/**
 * Test if a point is inside a polygon using ray casting.
 */
export function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  const n = polygon.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }

  return inside
}

/**
 * Pre-compute MVC weights for all interior pixels.
 */
function precomputeWeights(): void {
  if (!state.originalSnapshot || state.vertices.length < 3) return

  const { width: w, height: h } = state.originalSnapshot
  const polygon = state.vertices.map((v) => ({ x: v.originalX, y: v.originalY }))

  state.weightCache.clear()

  // Compute bounding box
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of polygon) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  // Clamp to image bounds
  minX = Math.max(0, Math.floor(minX))
  minY = Math.max(0, Math.floor(minY))
  maxX = Math.min(w - 1, Math.ceil(maxX))
  maxY = Math.min(h - 1, Math.ceil(maxY))

  state.cacheBounds = { minX, minY, maxX, maxY }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x, y, polygon)) continue

      const weights = computeMVCWeights(x, y, polygon)
      state.weightCache.set(y * w + x, weights)
    }
  }
}

// ── Warp application ─────────────────────────────────────────────────────────

/**
 * Apply cage transform deformation to an ImageData.
 *
 * For each interior pixel, use pre-computed MVC weights to compute the
 * deformed position based on original cage vs deformed cage, then inverse-
 * sample from the source.
 */
export function applyCageTransform(src: ImageData, vertices: CageVertex[]): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  // Copy source first (non-interior pixels stay unchanged)
  dd.set(src.data)

  if (vertices.length < 3) return dst

  const originalPoly = vertices.map((v) => ({ x: v.originalX, y: v.originalY }))

  // Compute bounding box of the original cage
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const v of originalPoly) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  minX = Math.max(0, Math.floor(minX))
  minY = Math.max(0, Math.floor(minY))
  maxX = Math.min(w - 1, Math.ceil(maxX))
  maxY = Math.min(h - 1, Math.ceil(maxY))

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x, y, originalPoly)) continue

      const weights = computeMVCWeights(x, y, originalPoly)

      // Compute deformed position using MVC weights and deformed cage vertices
      let dx = 0
      let dy = 0
      for (let i = 0; i < vertices.length; i++) {
        dx += weights[i]! * vertices[i]!.x
        dy += weights[i]! * vertices[i]!.y
      }

      // Compute original position using MVC weights and original cage vertices
      let ox = 0
      let oy = 0
      for (let i = 0; i < vertices.length; i++) {
        ox += weights[i]! * vertices[i]!.originalX
        oy += weights[i]! * vertices[i]!.originalY
      }

      // Use the displacement-based forward approach:
      // This pixel (x,y) originally at position p gets deformed to p + displacement.
      // displacement = sum(w_i * q_i) - sum(w_i * p_i) where q_i = deformed, p_i = original
      const destX = x + (dx - ox)
      const destY = y + (dy - oy)

      // Forward splat: write source pixel (x,y) to destination (destX, destY)
      const di = Math.round(destX)
      const dj = Math.round(destY)
      if (di >= 0 && di < w && dj >= 0 && dj < h) {
        const srcIdx = (y * w + x) * 4
        const dstIdx = (dj * w + di) * 4
        dd[dstIdx] = src.data[srcIdx]!
        dd[dstIdx + 1] = src.data[srcIdx + 1]!
        dd[dstIdx + 2] = src.data[srcIdx + 2]!
        dd[dstIdx + 3] = src.data[srcIdx + 3]!
      }
    }
  }

  return dst
}

/**
 * Apply cage transform using inverse mapping with pre-computed weight cache.
 * This produces better quality than forward splatting.
 */
export function applyCageTransformInverse(
  src: ImageData,
  vertices: CageVertex[],
  weightCache: Map<number, number[]>,
): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  // Copy source first
  dd.set(src.data)

  if (vertices.length < 3 || weightCache.size === 0) return dst

  // For each cached interior pixel, compute its deformed position and use
  // inverse mapping: compute MVC weights in deformed cage for destination pixels.
  // Since direct inverse MVC is expensive, we use displacement-based forward map
  // with bilinear interpolation for quality.

  // Build displacement field from cached weights
  const deformedPoly = vertices.map((v) => ({ x: v.x, y: v.y }))
  const bounds = state.cacheBounds
  if (!bounds) return dst

  // Use inverse approach: iterate over destination pixels in the deformed cage bounding box
  let dMinX = Infinity
  let dMinY = Infinity
  let dMaxX = -Infinity
  let dMaxY = -Infinity
  for (const v of deformedPoly) {
    dMinX = Math.min(dMinX, v.x)
    dMinY = Math.min(dMinY, v.y)
    dMaxX = Math.max(dMaxX, v.x)
    dMaxY = Math.max(dMaxY, v.y)
  }
  dMinX = Math.max(0, Math.floor(dMinX))
  dMinY = Math.max(0, Math.floor(dMinY))
  dMaxX = Math.min(w - 1, Math.ceil(dMaxX))
  dMaxY = Math.min(h - 1, Math.ceil(dMaxY))

  for (let y = dMinY; y <= dMaxY; y++) {
    for (let x = dMinX; x <= dMaxX; x++) {
      if (!pointInPolygon(x, y, deformedPoly)) continue

      // Compute MVC weights in the deformed cage
      const weights = computeMVCWeights(x, y, deformedPoly)

      // Map to original cage position
      let sx = 0
      let sy = 0
      for (let i = 0; i < vertices.length; i++) {
        sx += weights[i]! * vertices[i]!.originalX
        sy += weights[i]! * vertices[i]!.originalY
      }

      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const [r, g, b, a] = bilinearSample(src, sx, sy)
        const idx = (y * w + x) * 4
        dd[idx] = r
        dd[idx + 1] = g
        dd[idx + 2] = b
        dd[idx + 3] = a
      }
    }
  }

  return dst
}

// ── Tool lifecycle ───────────────────────────────────────────────────────────

/**
 * Begin a cage transform session on the current raster layer.
 */
export function beginCageTransform(): boolean {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return false

  const selectedId = store.selection.layerIds[0]
  let chunkId: string | null = null
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster' && 'imageChunkId' in layer) {
      chunkId = (layer as { imageChunkId: string }).imageChunkId
    }
  }

  if (!chunkId) {
    const raster = artboard.layers.find((l) => l.type === 'raster')
    if (raster && 'imageChunkId' in raster) {
      chunkId = (raster as { imageChunkId: string }).imageChunkId
    }
  }

  if (!chunkId) return false

  const imgData = getRasterData(chunkId)
  if (!imgData) return false

  state.originalSnapshot = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height)
  state.chunkId = chunkId
  state.vertices = []
  state.closed = false
  state.phase = 'draw'
  state.weightCache.clear()
  state.cacheBounds = null
  state.active = true

  return true
}

/**
 * Commit the cage transform.
 */
export function commitCageTransform(): boolean {
  if (!state.active || !state.chunkId || !state.originalSnapshot) return false
  if (!state.closed || state.vertices.length < 3) return false

  const result = applyCageTransformInverse(state.originalSnapshot, state.vertices, state.weightCache)

  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)

  useEditorStore.getState().pushRasterHistory('Cage transform', state.chunkId, state.originalSnapshot, result)

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.vertices = []
  state.weightCache.clear()
  state.cacheBounds = null

  return true
}

/**
 * Cancel the cage transform, restoring the original image.
 */
export function cancelCageTransform(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.vertices = []
  state.weightCache.clear()
  state.cacheBounds = null
}
