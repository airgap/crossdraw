/**
 * Mesh Warp tool — NxM grid deformation for raster layers.
 *
 * The user drags grid points to deform the image.  For each cell (quad) in the
 * deformed grid, we use inverse bilinear mapping (Newton iteration) to find the
 * source pixel for every destination pixel, then sample with bilinear
 * interpolation.
 */

import { bilinearSample } from '@/filters/distort'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number
  y: number
}

export interface MeshWarpState {
  active: boolean
  /** Current (deformed) grid positions: [row][col] */
  gridPoints: Point2D[][]
  /** Original (undeformed) grid positions */
  originalGrid: Point2D[][]
  /** Grid dimensions */
  rows: number
  cols: number
  /** Layer bounds */
  layerBounds: { x: number; y: number; width: number; height: number }
  /** Chunk ID of the raster layer */
  chunkId: string | null
  /** Original image snapshot */
  originalSnapshot: ImageData | null
}

export interface MeshWarpSettings {
  gridRows: number
  gridCols: number
  showGrid: boolean
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: MeshWarpState = {
  active: false,
  gridPoints: [],
  originalGrid: [],
  rows: 0,
  cols: 0,
  layerBounds: { x: 0, y: 0, width: 0, height: 0 },
  chunkId: null,
  originalSnapshot: null,
}

const defaultSettings: MeshWarpSettings = {
  gridRows: 4,
  gridCols: 4,
  showGrid: true,
}

let currentSettings: MeshWarpSettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getMeshWarpSettings(): MeshWarpSettings {
  return { ...currentSettings }
}

export function setMeshWarpSettings(patch: Partial<MeshWarpSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isMeshWarpActive(): boolean {
  return state.active
}

export function getMeshWarpGrid(): { points: Point2D[][]; rows: number; cols: number } {
  return {
    points: state.gridPoints.map((row) => row.map((p) => ({ ...p }))),
    rows: state.rows,
    cols: state.cols,
  }
}

// ── Grid helpers ─────────────────────────────────────────────────────────────

function createGrid(
  bounds: { x: number; y: number; width: number; height: number },
  rows: number,
  cols: number,
): Point2D[][] {
  const grid: Point2D[][] = []
  for (let r = 0; r <= rows; r++) {
    const row: Point2D[] = []
    for (let c = 0; c <= cols; c++) {
      row.push({
        x: bounds.x + (c / cols) * bounds.width,
        y: bounds.y + (r / rows) * bounds.height,
      })
    }
    grid.push(row)
  }
  return grid
}

function cloneGrid(grid: Point2D[][]): Point2D[][] {
  return grid.map((row) => row.map((p) => ({ ...p })))
}

// ── Inverse bilinear mapping ─────────────────────────────────────────────────

/**
 * Given a deformed quad (p00, p10, p01, p11) and a point (px, py) inside it,
 * find the parametric coordinates (u, v) in [0,1]x[0,1] using Newton iteration.
 *
 * The bilinear mapping is:
 *   P(u,v) = (1-u)(1-v)*p00 + u*(1-v)*p10 + (1-u)*v*p01 + u*v*p11
 *
 * Returns [u, v] or null if the point is outside the quad.
 */
export function inverseBilinear(
  px: number,
  py: number,
  p00: Point2D,
  p10: Point2D,
  p01: Point2D,
  p11: Point2D,
): [number, number] | null {
  // Coefficients: P(u,v) = A + B*u + C*v + D*u*v
  const ax = p00.x
  const ay = p00.y
  const bx = p10.x - p00.x
  const by = p10.y - p00.y
  const cx = p01.x - p00.x
  const cy = p01.y - p00.y
  const dx = p11.x - p10.x - p01.x + p00.x
  const dy = p11.y - p10.y - p01.y + p00.y

  // Newton iteration to solve:
  //   f(u,v) = A + B*u + C*v + D*u*v - P = 0
  let u = 0.5
  let v = 0.5

  for (let iter = 0; iter < 20; iter++) {
    const fx = ax + bx * u + cx * v + dx * u * v - px
    const fy = ay + by * u + cy * v + dy * u * v - py

    // Check convergence
    if (Math.abs(fx) < 1e-6 && Math.abs(fy) < 1e-6) break

    // Jacobian
    const j00 = bx + dx * v // df_x/du
    const j01 = cx + dx * u // df_x/dv
    const j10 = by + dy * v // df_y/du
    const j11 = cy + dy * u // df_y/dv

    const det = j00 * j11 - j01 * j10
    if (Math.abs(det) < 1e-12) return null

    const invDet = 1 / det
    u -= (j11 * fx - j01 * fy) * invDet
    v -= (-j10 * fx + j00 * fy) * invDet
  }

  // Accept if within bounds (with small tolerance)
  if (u < -0.01 || u > 1.01 || v < -0.01 || v > 1.01) return null

  return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))]
}

// ── Warp application ─────────────────────────────────────────────────────────

/**
 * Apply a mesh warp deformation to an ImageData.
 *
 * For each pixel in the output, determine which deformed grid cell it falls
 * into, compute the inverse bilinear parametric coordinates, map back to
 * the original grid cell, and sample the source image.
 */
export function applyMeshWarp(
  src: ImageData,
  gridPoints: Point2D[][],
  originalGrid: Point2D[][],
  rows: number,
  cols: number,
): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false

      // Search grid cells for the one containing this pixel
      for (let r = 0; r < rows && !found; r++) {
        for (let c = 0; c < cols && !found; c++) {
          const dp00 = gridPoints[r]![c]!
          const dp10 = gridPoints[r]![c + 1]!
          const dp01 = gridPoints[r + 1]![c]!
          const dp11 = gridPoints[r + 1]![c + 1]!

          const uv = inverseBilinear(x, y, dp00, dp10, dp01, dp11)
          if (!uv) continue

          const [u, v] = uv

          // Map back to original grid cell
          const op00 = originalGrid[r]![c]!
          const op10 = originalGrid[r]![c + 1]!
          const op01 = originalGrid[r + 1]![c]!
          const op11 = originalGrid[r + 1]![c + 1]!

          const sx = (1 - u) * (1 - v) * op00.x + u * (1 - v) * op10.x + (1 - u) * v * op01.x + u * v * op11.x
          const sy = (1 - u) * (1 - v) * op00.y + u * (1 - v) * op10.y + (1 - u) * v * op01.y + u * v * op11.y

          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            const [rv, g, b, a] = bilinearSample(src, sx, sy)
            const idx = (y * w + x) * 4
            dd[idx] = rv
            dd[idx + 1] = g
            dd[idx + 2] = b
            dd[idx + 3] = a
          }
          found = true
        }
      }
    }
  }

  return dst
}

// ── Tool lifecycle ───────────────────────────────────────────────────────────

/**
 * Begin a mesh warp session on the current raster layer.
 */
export function beginMeshWarp(bounds: { x: number; y: number; width: number; height: number }): boolean {
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

  const { gridRows, gridCols } = currentSettings
  state.rows = gridRows
  state.cols = gridCols
  state.originalGrid = createGrid(bounds, gridRows, gridCols)
  state.gridPoints = cloneGrid(state.originalGrid)
  state.active = true

  return true
}

/**
 * Drag a grid point to a new position.
 */
export function dragGridPoint(row: number, col: number, x: number, y: number): void {
  if (!state.active) return
  if (row < 0 || row > state.rows || col < 0 || col > state.cols) return
  state.gridPoints[row]![col] = { x, y }
}

/**
 * Commit the mesh warp: apply warped image to raster data with undo.
 */
export function commitMeshWarp(): boolean {
  if (!state.active || !state.chunkId || !state.originalSnapshot) return false

  const result = applyMeshWarp(state.originalSnapshot, state.gridPoints, state.originalGrid, state.rows, state.cols)

  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)

  useEditorStore.getState().pushRasterHistory('Mesh warp', state.chunkId, state.originalSnapshot, result)

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.gridPoints = []
  state.originalGrid = []

  return true
}

/**
 * Cancel the mesh warp, restoring the original image.
 */
export function cancelMeshWarp(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.gridPoints = []
  state.originalGrid = []
}
