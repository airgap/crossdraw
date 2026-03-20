/**
 * Perspective Warp tool — Multi-plane perspective correction.
 *
 * Unlike simple perspective transform (4-corner homography), this tool allows
 * the user to define multiple quadrilateral planes with shared edges, then
 * adjust them with constraint-aware warping.  Shared edges keep adjacent
 * planes connected.  Auto-straighten makes horizontal/vertical edges true.
 *
 * Workflow:
 *   1. Layout phase: user clicks to define quad planes, connect shared edges
 *   2. Warp phase:   user drags corners/edges, auto-straighten available
 *   3. Commit:       apply final homography per plane
 */

import { bilinearSample } from '@/filters/distort'
import { computeHomography, invertHomography } from '@/tools/perspective-transform'
import type { Point2D } from '@/tools/perspective-transform'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PerspectivePlane {
  /** Four corners: top-left, top-right, bottom-right, bottom-left */
  corners: [Point2D, Point2D, Point2D, Point2D]
  /** Original corners before warp phase */
  originalCorners: [Point2D, Point2D, Point2D, Point2D]
  /** Adjacent plane connections */
  adjacentPlanes: { planeIndex: number; sharedEdge: [number, number]; otherEdge: [number, number] }[]
}

export type PerspectiveWarpPhase = 'layout' | 'warp'

export interface PerspectiveWarpState {
  active: boolean
  phase: PerspectiveWarpPhase
  planes: PerspectivePlane[]
  /** Layer bounds */
  layerBounds: { x: number; y: number; width: number; height: number }
  /** Chunk ID */
  chunkId: string | null
  /** Original image snapshot */
  originalSnapshot: ImageData | null
}

export interface PerspectiveWarpSettings {
  showGrid: boolean
  gridDivisions: number
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: PerspectiveWarpState = {
  active: false,
  phase: 'layout',
  planes: [],
  layerBounds: { x: 0, y: 0, width: 0, height: 0 },
  chunkId: null,
  originalSnapshot: null,
}

const defaultSettings: PerspectiveWarpSettings = {
  showGrid: true,
  gridDivisions: 4,
}

let currentSettings: PerspectiveWarpSettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getPerspectiveWarpSettings(): PerspectiveWarpSettings {
  return { ...currentSettings }
}

export function setPerspectiveWarpSettings(patch: Partial<PerspectiveWarpSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isPerspectiveWarpActive(): boolean {
  return state.active
}

export function getPerspectiveWarpPhase(): PerspectiveWarpPhase {
  return state.phase
}

export function getPerspectiveWarpPlanes(): PerspectivePlane[] {
  return state.planes.map((p) => ({
    corners: p.corners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D],
    originalCorners: p.originalCorners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D],
    adjacentPlanes: p.adjacentPlanes.map((a) => ({ ...a })),
  }))
}

// ── Plane management ─────────────────────────────────────────────────────────

/**
 * Add a new perspective plane with the given four corners.
 * Returns the index of the new plane.
 */
export function addPlane(corners: [Point2D, Point2D, Point2D, Point2D]): number {
  if (!state.active || state.phase !== 'layout') return -1

  const plane: PerspectivePlane = {
    corners: corners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D],
    originalCorners: corners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D],
    adjacentPlanes: [],
  }

  state.planes.push(plane)
  return state.planes.length - 1
}

/**
 * Connect two planes along shared edges. Shared edge indices refer to
 * corner indices forming the edge (e.g., [0,1] = top edge).
 */
export function connectPlanes(
  planeA: number,
  planeB: number,
  sharedEdgeA: [number, number],
  sharedEdgeB: [number, number],
): boolean {
  if (!state.active || state.phase !== 'layout') return false
  if (planeA < 0 || planeA >= state.planes.length) return false
  if (planeB < 0 || planeB >= state.planes.length) return false
  if (planeA === planeB) return false

  const a = state.planes[planeA]!
  const b = state.planes[planeB]!

  a.adjacentPlanes.push({ planeIndex: planeB, sharedEdge: sharedEdgeA, otherEdge: sharedEdgeB })
  b.adjacentPlanes.push({ planeIndex: planeA, sharedEdge: sharedEdgeB, otherEdge: sharedEdgeA })

  // Snap shared edge corners together
  const ca0 = a.corners[sharedEdgeA[0] as 0 | 1 | 2 | 3]
  const ca1 = a.corners[sharedEdgeA[1] as 0 | 1 | 2 | 3]
  b.corners[sharedEdgeB[0] as 0 | 1 | 2 | 3] = { x: ca0.x, y: ca0.y }
  b.corners[sharedEdgeB[1] as 0 | 1 | 2 | 3] = { x: ca1.x, y: ca1.y }

  return true
}

/**
 * Move a corner of a plane. If the corner is shared with adjacent planes,
 * propagate the movement.
 */
export function moveCorner(planeIndex: number, cornerIndex: number, x: number, y: number): void {
  if (!state.active || planeIndex < 0 || planeIndex >= state.planes.length) return
  if (cornerIndex < 0 || cornerIndex > 3) return

  const plane = state.planes[planeIndex]!
  plane.corners[cornerIndex] = { x, y }

  // Propagate to adjacent planes sharing this corner
  for (const adj of plane.adjacentPlanes) {
    const otherPlane = state.planes[adj.planeIndex]!
    if (adj.sharedEdge[0] === cornerIndex) {
      otherPlane.corners[adj.otherEdge[0]] = { x, y }
    }
    if (adj.sharedEdge[1] === cornerIndex) {
      otherPlane.corners[adj.otherEdge[1]] = { x, y }
    }
  }
}

/**
 * Switch from layout phase to warp phase.
 */
export function enterWarpPhase(): boolean {
  if (!state.active || state.phase !== 'layout') return false
  if (state.planes.length === 0) return false

  // Store current corners as originals for warp phase
  for (const plane of state.planes) {
    plane.originalCorners = plane.corners.map((c) => ({ ...c })) as [Point2D, Point2D, Point2D, Point2D]
  }

  state.phase = 'warp'
  return true
}

/**
 * Auto-straighten: make horizontal edges truly horizontal and vertical edges
 * truly vertical by averaging the y-coordinates of horizontal pairs and
 * x-coordinates of vertical pairs.
 */
export function autoStraighten(): void {
  if (!state.active || state.phase !== 'warp') return

  for (const plane of state.planes) {
    const [tl, tr, br, bl] = plane.corners

    // Top edge: average y of tl and tr
    const topY = (tl.y + tr.y) / 2
    tl.y = topY
    tr.y = topY

    // Bottom edge: average y of bl and br
    const bottomY = (bl.y + br.y) / 2
    bl.y = bottomY
    br.y = bottomY

    // Left edge: average x of tl and bl
    const leftX = (tl.x + bl.x) / 2
    tl.x = leftX
    bl.x = leftX

    // Right edge: average x of tr and br
    const rightX = (tr.x + br.x) / 2
    tr.x = rightX
    br.x = rightX
  }

  // Propagate shared edge constraints
  for (const plane of state.planes) {
    for (const adj of plane.adjacentPlanes) {
      const otherPlane = state.planes[adj.planeIndex]!
      const cs0 = plane.corners[adj.sharedEdge[0] as 0 | 1 | 2 | 3]
      const cs1 = plane.corners[adj.sharedEdge[1] as 0 | 1 | 2 | 3]
      otherPlane.corners[adj.otherEdge[0] as 0 | 1 | 2 | 3] = { x: cs0.x, y: cs0.y }
      otherPlane.corners[adj.otherEdge[1] as 0 | 1 | 2 | 3] = { x: cs1.x, y: cs1.y }
    }
  }
}

// ── Warp application ─────────────────────────────────────────────────────────

/**
 * Check if a point is inside a convex quad using cross products.
 */
function pointInQuad(px: number, py: number, corners: [Point2D, Point2D, Point2D, Point2D]): boolean {
  let allPos = true
  let allNeg = true

  for (let i = 0; i < 4; i++) {
    const c0 = corners[i]!
    const c1 = corners[(i + 1) % 4]!
    const cross = (c1.x - c0.x) * (py - c0.y) - (c1.y - c0.y) * (px - c0.x)
    if (cross < 0) allPos = false
    if (cross > 0) allNeg = false
  }

  return allPos || allNeg
}

/**
 * Apply perspective warp to an ImageData.
 * Each plane gets its own homography from original corners to deformed corners.
 */
export function applyPerspectiveWarp(src: ImageData, planes: PerspectivePlane[]): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  if (planes.length === 0) {
    dd.set(src.data)
    return dst
  }

  // Pre-compute inverse homographies for each plane
  const invHomographies: (number[] | null)[] = []
  for (const plane of planes) {
    const H = computeHomography(plane.originalCorners, plane.corners)
    invHomographies.push(H ? invertHomography(H) : null)
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sampled = false

      // Find which deformed plane this pixel falls into
      for (let pi = 0; pi < planes.length && !sampled; pi++) {
        const plane = planes[pi]!
        if (!pointInQuad(x, y, plane.corners)) continue

        const Hinv = invHomographies[pi]
        if (!Hinv) continue

        // Map back to source using inverse homography
        const denom = Hinv[6]! * x + Hinv[7]! * y + Hinv[8]!
        if (Math.abs(denom) < 1e-10) continue

        const sx = (Hinv[0]! * x + Hinv[1]! * y + Hinv[2]!) / denom
        const sy = (Hinv[3]! * x + Hinv[4]! * y + Hinv[5]!) / denom

        if (sx >= -0.5 && sx < w - 0.5 && sy >= -0.5 && sy < h - 0.5) {
          const [r, g, b, a] = bilinearSample(src, sx, sy)
          const idx = (y * w + x) * 4
          dd[idx] = r
          dd[idx + 1] = g
          dd[idx + 2] = b
          dd[idx + 3] = a
          sampled = true
        }
      }

      // For pixels not in any deformed plane, copy from source
      if (!sampled) {
        const idx = (y * w + x) * 4
        dd[idx] = src.data[idx]!
        dd[idx + 1] = src.data[idx + 1]!
        dd[idx + 2] = src.data[idx + 2]!
        dd[idx + 3] = src.data[idx + 3]!
      }
    }
  }

  return dst
}

// ── Tool lifecycle ───────────────────────────────────────────────────────────

/**
 * Begin a perspective warp session on the current raster layer.
 */
export function beginPerspectiveWarp(bounds: { x: number; y: number; width: number; height: number }): boolean {
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
  state.layerBounds = { ...bounds }
  state.planes = []
  state.phase = 'layout'
  state.active = true

  return true
}

/**
 * Commit the perspective warp.
 */
export function commitPerspectiveWarp(): boolean {
  if (!state.active || !state.chunkId || !state.originalSnapshot) return false

  const result = applyPerspectiveWarp(state.originalSnapshot, state.planes)

  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)

  useEditorStore.getState().pushRasterHistory('Perspective warp', state.chunkId, state.originalSnapshot, result)

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.planes = []

  return true
}

/**
 * Cancel the perspective warp, restoring the original image.
 */
export function cancelPerspectiveWarp(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.planes = []
}
