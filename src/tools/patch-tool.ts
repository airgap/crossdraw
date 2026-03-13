import { useEditorStore } from '@/store/editor.store'
import { getRasterData, updateRasterCache, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

/**
 * Patch Tool — select a region by drawing an outline (like lasso), then drag
 * that outline to a clean source area. The source texture fills the original
 * selection with tone/luminance matching.
 *
 * Workflow:
 *   Phase 1 (draw): User draws a closed outline around the area to fix
 *   Phase 2 (drag): User drags the outline to a clean source area
 *   Phase 3 (apply): Copy source region, apply luminance ratio transfer, composite
 *
 * Modes:
 *   - normal: direct copy with luminance matching
 *   - content-aware: blend at edges using Poisson-like averaging (iterative Jacobi relaxation)
 */

export interface PatchSettings {
  mode: 'normal' | 'content-aware'
  /** Edge diffusion iterations for content-aware blending (higher = smoother edges) */
  diffusion: number
}

const defaultSettings: PatchSettings = {
  mode: 'normal',
  diffusion: 4,
}

let currentSettings: PatchSettings = { ...defaultSettings }

export function getPatchSettings(): PatchSettings {
  return { ...currentSettings }
}

export function setPatchSettings(settings: Partial<PatchSettings>): void {
  Object.assign(currentSettings, settings)
}

// ── State ──

type Phase = 'idle' | 'drawing' | 'closed' | 'dragging'

interface PatchState {
  phase: Phase
  /** Outline points in artboard-local coordinates */
  points: Array<{ x: number; y: number }>
  /** Drag offset applied to the outline to find the source region */
  dragOffsetX: number
  dragOffsetY: number
  /** Position where the drag started */
  dragStartX: number
  dragStartY: number
}

const state: PatchState = {
  phase: 'idle',
  points: [],
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragStartX: 0,
  dragStartY: 0,
}

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null

// ── Helpers ──

function findRasterChunkId(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') return (layer as RasterLayer).imageChunkId
  }
  const raster = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  return raster?.imageChunkId ?? null
}

/**
 * Test if a point is inside a polygon using ray-casting.
 */
function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Compute the bounding box of a polygon.
 */
function polygonBounds(polygon: Array<{ x: number; y: number }>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Compute the minimum distance from a pixel to the polygon boundary.
 */
function distToPolygonBorder(px: number, py: number, polygon: Array<{ x: number; y: number }>): number {
  let minDist = Infinity
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = polygon[j]!.x
    const ay = polygon[j]!.y
    const bx = polygon[i]!.x
    const by = polygon[i]!.y

    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))

    const closestX = ax + t * dx
    const closestY = ay + t * dy
    const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2)
    if (dist < minDist) minDist = dist
  }
  return minDist
}

// ── Public API — Phase 1: Draw outline ──

/**
 * Begin drawing the patch outline. Adds the first point.
 */
export function beginPatchOutline(docX: number, docY: number): void {
  state.phase = 'drawing'
  state.points = [{ x: docX, y: docY }]
  state.dragOffsetX = 0
  state.dragOffsetY = 0

  const chunkId = findRasterChunkId()
  activeChunkId = chunkId
}

/**
 * Add a point to the patch outline.
 */
export function addPatchPoint(docX: number, docY: number): void {
  if (state.phase !== 'drawing') return
  state.points.push({ x: docX, y: docY })
}

/**
 * Close the patch outline, transitioning to the 'closed' phase.
 * The outline must have at least 3 points.
 */
export function closePatchOutline(): boolean {
  if (state.phase !== 'drawing' || state.points.length < 3) return false
  state.phase = 'closed'
  return true
}

// ── Public API — Phase 2: Drag ──

/**
 * Begin dragging the closed outline to a source area.
 */
export function beginPatchDrag(docX: number, docY: number): boolean {
  if (state.phase !== 'closed') return false
  state.phase = 'dragging'
  state.dragStartX = docX
  state.dragStartY = docY
  state.dragOffsetX = 0
  state.dragOffsetY = 0

  // Snapshot for undo
  if (activeChunkId) {
    const existing = getRasterData(activeChunkId)
    if (existing) {
      preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
    } else {
      preStrokeSnapshot = null
    }
  }

  return true
}

/**
 * Update the drag offset as the user moves the mouse.
 */
export function updatePatchDrag(docX: number, docY: number): void {
  if (state.phase !== 'dragging') return
  state.dragOffsetX = docX - state.dragStartX
  state.dragOffsetY = docY - state.dragStartY
}

// ── Public API — Phase 3: Apply ──

/**
 * Apply the patch: copy source texture from the dragged location back into
 * the original outline region with luminance matching.
 * Returns true on success.
 */
export function applyPatch(): boolean {
  if (state.phase !== 'dragging' || !activeChunkId) {
    resetState()
    return false
  }

  const imageData = getRasterData(activeChunkId)
  if (!imageData || !preStrokeSnapshot) {
    resetState()
    return false
  }

  const polygon = state.points
  const bounds = polygonBounds(polygon)

  const minX = Math.max(0, Math.floor(bounds.minX))
  const minY = Math.max(0, Math.floor(bounds.minY))
  const maxX = Math.min(imageData.width - 1, Math.ceil(bounds.maxX))
  const maxY = Math.min(imageData.height - 1, Math.ceil(bounds.maxY))

  const offX = Math.round(state.dragOffsetX)
  const offY = Math.round(state.dragOffsetY)

  // Collect destination pixels that are inside the polygon
  const patchPixels: Array<{ x: number; y: number }> = []

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!pointInPolygon(x, y, polygon)) continue
      patchPixels.push({ x, y })
    }
  }

  if (patchPixels.length === 0) {
    resetState()
    return false
  }

  if (currentSettings.mode === 'content-aware') {
    applyContentAware(imageData, preStrokeSnapshot, polygon, patchPixels, offX, offY)
  } else {
    applyNormal(imageData, preStrokeSnapshot, patchPixels, offX, offY)
  }

  updateRasterCache(activeChunkId)
  syncCanvasToImageData(activeChunkId)

  // Push undo
  if (preStrokeSnapshot) {
    const afterData = getRasterData(activeChunkId)
    if (afterData) {
      useEditorStore.getState().pushRasterHistory('Patch tool', activeChunkId, preStrokeSnapshot, afterData)
    }
  }

  resetState()
  return true
}

/**
 * Normal mode: direct copy with luminance ratio transfer.
 */
function applyNormal(
  targetData: ImageData,
  snapshot: ImageData,
  pixels: Array<{ x: number; y: number }>,
  offX: number,
  offY: number,
): void {
  for (const { x, y } of pixels) {
    // Source is at the dragged position
    const srcX = x + offX
    const srcY = y + offY
    if (srcX < 0 || srcY < 0 || srcX >= snapshot.width || srcY >= snapshot.height) continue

    const srcIdx = (srcY * snapshot.width + srcX) * 4
    const dstIdx = (y * snapshot.width + x) * 4

    const srcR = snapshot.data[srcIdx]!
    const srcG = snapshot.data[srcIdx + 1]!
    const srcB = snapshot.data[srcIdx + 2]!
    const srcA = snapshot.data[srcIdx + 3]!

    const dstR = snapshot.data[dstIdx]!
    const dstG = snapshot.data[dstIdx + 1]!
    const dstB = snapshot.data[dstIdx + 2]!

    // Luminance ratio transfer
    const srcLum = 0.299 * srcR + 0.587 * srcG + 0.114 * srcB
    const dstLum = 0.299 * dstR + 0.587 * dstG + 0.114 * dstB

    let healedR: number
    let healedG: number
    let healedB: number

    if (dstLum > 0) {
      const ratio = srcLum / dstLum
      healedR = Math.min(255, Math.max(0, Math.round(dstR * ratio)))
      healedG = Math.min(255, Math.max(0, Math.round(dstG * ratio)))
      healedB = Math.min(255, Math.max(0, Math.round(dstB * ratio)))
    } else {
      healedR = srcR
      healedG = srcG
      healedB = srcB
    }

    const tgtIdx = (y * targetData.width + x) * 4
    targetData.data[tgtIdx] = healedR
    targetData.data[tgtIdx + 1] = healedG
    targetData.data[tgtIdx + 2] = healedB
    targetData.data[tgtIdx + 3] = srcA
  }
}

/**
 * Content-aware mode: copy source, apply luminance ratio transfer, then
 * run Poisson-like Jacobi relaxation at the border to smooth the blend.
 */
function applyContentAware(
  targetData: ImageData,
  snapshot: ImageData,
  polygon: Array<{ x: number; y: number }>,
  pixels: Array<{ x: number; y: number }>,
  offX: number,
  offY: number,
): void {
  // First, do a normal copy with luminance matching into a working buffer
  const w = targetData.width
  const h = targetData.height
  const bufR = new Float64Array(w * h)
  const bufG = new Float64Array(w * h)
  const bufB = new Float64Array(w * h)
  const bufA = new Float64Array(w * h)

  // Initialize buffer with current target data
  for (let i = 0; i < w * h; i++) {
    bufR[i] = targetData.data[i * 4]!
    bufG[i] = targetData.data[i * 4 + 1]!
    bufB[i] = targetData.data[i * 4 + 2]!
    bufA[i] = targetData.data[i * 4 + 3]!
  }

  // Build a set of patch pixel indices for fast lookup
  const patchSet = new Set<number>()
  for (const { x, y } of pixels) {
    patchSet.add(y * w + x)
  }

  // Copy source pixels with luminance matching
  for (const { x, y } of pixels) {
    const srcX = x + offX
    const srcY = y + offY
    if (srcX < 0 || srcY < 0 || srcX >= snapshot.width || srcY >= snapshot.height) continue

    const srcIdx = (srcY * snapshot.width + srcX) * 4
    const dstIdx = (y * snapshot.width + x) * 4

    const srcR = snapshot.data[srcIdx]!
    const srcG = snapshot.data[srcIdx + 1]!
    const srcB = snapshot.data[srcIdx + 2]!
    const srcA = snapshot.data[srcIdx + 3]!

    const dstR = snapshot.data[dstIdx]!
    const dstG = snapshot.data[dstIdx + 1]!
    const dstB = snapshot.data[dstIdx + 2]!

    const srcLum = 0.299 * srcR + 0.587 * srcG + 0.114 * srcB
    const dstLum = 0.299 * dstR + 0.587 * dstG + 0.114 * dstB

    const idx = y * w + x
    if (dstLum > 0) {
      const ratio = srcLum / dstLum
      bufR[idx] = Math.min(255, Math.max(0, dstR * ratio))
      bufG[idx] = Math.min(255, Math.max(0, dstG * ratio))
      bufB[idx] = Math.min(255, Math.max(0, dstB * ratio))
    } else {
      bufR[idx] = srcR
      bufG[idx] = srcG
      bufB[idx] = srcB
    }
    bufA[idx] = srcA
  }

  // Jacobi relaxation — only affects pixels near the boundary of the patch
  const maxDist = Math.max(2, currentSettings.diffusion)
  const borderPixels: Array<{ x: number; y: number; blendWeight: number }> = []

  for (const { x, y } of pixels) {
    const dist = distToPolygonBorder(x, y, polygon)
    if (dist <= maxDist) {
      const blendWeight = dist / maxDist // 0 at border, 1 at maxDist from border
      borderPixels.push({ x, y, blendWeight })
    }
  }

  // Run relaxation iterations
  const iterations = Math.max(1, currentSettings.diffusion)
  const tmpR = new Float64Array(w * h)
  const tmpG = new Float64Array(w * h)
  const tmpB = new Float64Array(w * h)

  for (let iter = 0; iter < iterations; iter++) {
    tmpR.set(bufR)
    tmpG.set(bufG)
    tmpB.set(bufB)

    for (const { x, y, blendWeight } of borderPixels) {
      if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) continue
      const idx = y * w + x

      // Average of 4 neighbors
      const avgR = (tmpR[(y - 1) * w + x]! + tmpR[(y + 1) * w + x]! + tmpR[y * w + x - 1]! + tmpR[y * w + x + 1]!) / 4
      const avgG = (tmpG[(y - 1) * w + x]! + tmpG[(y + 1) * w + x]! + tmpG[y * w + x - 1]! + tmpG[y * w + x + 1]!) / 4
      const avgB = (tmpB[(y - 1) * w + x]! + tmpB[(y + 1) * w + x]! + tmpB[y * w + x - 1]! + tmpB[y * w + x + 1]!) / 4

      // Blend between the copied value and the averaged value based on distance to border
      const w1 = blendWeight // how much to keep the copied value
      bufR[idx] = tmpR[idx]! * w1 + avgR * (1 - w1)
      bufG[idx] = tmpG[idx]! * w1 + avgG * (1 - w1)
      bufB[idx] = tmpB[idx]! * w1 + avgB * (1 - w1)
    }
  }

  // Write buffer back to target data
  for (const { x, y } of pixels) {
    const idx = y * w + x
    const tgtIdx = idx * 4
    targetData.data[tgtIdx] = Math.round(Math.min(255, Math.max(0, bufR[idx]!)))
    targetData.data[tgtIdx + 1] = Math.round(Math.min(255, Math.max(0, bufG[idx]!)))
    targetData.data[tgtIdx + 2] = Math.round(Math.min(255, Math.max(0, bufB[idx]!)))
    targetData.data[tgtIdx + 3] = Math.round(Math.min(255, Math.max(0, bufA[idx]!)))
  }
}

// ── Public API — Cancellation & query ──

/**
 * Cancel the current patch operation and reset state.
 */
export function cancelPatch(): void {
  resetState()
}

/**
 * Returns true if a patch operation is in progress (any phase except idle).
 */
export function isPatchActive(): boolean {
  return state.phase !== 'idle'
}

/**
 * Returns the current patch phase.
 */
export function getPatchPhase(): Phase {
  return state.phase
}

/**
 * Returns the outline points (empty if no outline drawn).
 */
export function getPatchPoints(): Array<{ x: number; y: number }> {
  return [...state.points]
}

/**
 * Returns the current drag offset.
 */
export function getPatchDragOffset(): { x: number; y: number } {
  return { x: state.dragOffsetX, y: state.dragOffsetY }
}

function resetState(): void {
  state.phase = 'idle'
  state.points = []
  state.dragOffsetX = 0
  state.dragOffsetY = 0
  state.dragStartX = 0
  state.dragStartY = 0
  preStrokeSnapshot = null
  activeChunkId = null
}
