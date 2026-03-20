/**
 * Perspective Transform tool — 4-corner homography applied to raster layers.
 *
 * The user drags four corner handles to define a perspective warp.  Internally
 * we compute a 3x3 homography via Direct Linear Transform (DLT), then apply
 * inverse mapping with bilinear interpolation to produce the warped raster.
 */

import { bilinearSample } from '@/filters/distort'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface Point2D {
  x: number
  y: number
}

export interface PerspectiveState {
  active: boolean
  /** Source corners: top-left, top-right, bottom-right, bottom-left */
  srcCorners: [Point2D, Point2D, Point2D, Point2D]
  /** Destination corners the user drags */
  dstCorners: [Point2D, Point2D, Point2D, Point2D]
  activeHandle: number // -1 = none, 0-3 = corner index
  /** Layer bounds used to initialise corners */
  layerBounds: { x: number; y: number; width: number; height: number }
  /** Chunk ID of the raster layer being transformed */
  chunkId: string | null
  /** Snapshot of original image data before transform */
  originalSnapshot: ImageData | null
}

export interface PerspectiveSettings {
  /** Show grid overlay while editing */
  showGrid: boolean
  /** Grid subdivisions per axis */
  gridDivisions: number
  /** Interpolation quality: 'bilinear' is default */
  interpolation: 'nearest' | 'bilinear'
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: PerspectiveState = {
  active: false,
  srcCorners: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  dstCorners: [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ],
  activeHandle: -1,
  layerBounds: { x: 0, y: 0, width: 0, height: 0 },
  chunkId: null,
  originalSnapshot: null,
}

const defaultSettings: PerspectiveSettings = {
  showGrid: true,
  gridDivisions: 4,
  interpolation: 'bilinear',
}

let currentSettings: PerspectiveSettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getPerspectiveSettings(): PerspectiveSettings {
  return { ...currentSettings }
}

export function setPerspectiveSettings(patch: Partial<PerspectiveSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isPerspectiveActive(): boolean {
  return state.active
}

export function getCorners(): {
  src: [Point2D, Point2D, Point2D, Point2D]
  dst: [Point2D, Point2D, Point2D, Point2D]
} {
  return {
    src: state.srcCorners.map((p) => ({ ...p })) as [Point2D, Point2D, Point2D, Point2D],
    dst: state.dstCorners.map((p) => ({ ...p })) as [Point2D, Point2D, Point2D, Point2D],
  }
}

export function getActiveHandle(): number {
  return state.activeHandle
}

// ── Homography math ──────────────────────────────────────────────────────────

/**
 * Compute a 3x3 homography matrix H mapping `src` points to `dst` points
 * using the Direct Linear Transform (DLT) algorithm with Gaussian elimination.
 *
 * H maps (x, y, 1) → (x', y', w') where destination = (x'/w', y'/w').
 *
 * Returns a flat 9-element array [h0..h8] in row-major order, or null if the
 * system is degenerate (all points collinear, etc.).
 */
export function computeHomography(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D],
): number[] | null {
  // Build the 8x9 matrix A for the system Ah = 0
  // Each point pair gives 2 rows:
  //   [-x -y -1  0  0  0  x'x  x'y  x']
  //   [ 0  0  0 -x -y -1  y'x  y'y  y']
  const A: number[][] = []

  for (let i = 0; i < 4; i++) {
    const sx = src[i]!.x
    const sy = src[i]!.y
    const dx = dst[i]!.x
    const dy = dst[i]!.y

    A.push([-sx, -sy, -1, 0, 0, 0, dx * sx, dx * sy, dx])
    A.push([0, 0, 0, -sx, -sy, -1, dy * sx, dy * sy, dy])
  }

  // Solve 8x9 system via Gaussian elimination with partial pivoting.
  // We have 8 equations, 9 unknowns — set h8 = 1 and solve the 8x8 system.
  // Rearrange: for each row, move the last column to the RHS.
  const M: number[][] = []
  const rhs: number[] = []

  for (let i = 0; i < 8; i++) {
    M.push(A[i]!.slice(0, 8))
    rhs.push(-A[i]![8]!)
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    // Find pivot
    let maxVal = Math.abs(M[col]![col]!)
    let maxRow = col
    for (let row = col + 1; row < 8; row++) {
      const v = Math.abs(M[row]![col]!)
      if (v > maxVal) {
        maxVal = v
        maxRow = row
      }
    }

    if (maxVal < 1e-12) return null // degenerate

    // Swap rows
    if (maxRow !== col) {
      const tmpM = M[col]!
      M[col] = M[maxRow]!
      M[maxRow] = tmpM
      const tmpR = rhs[col]!
      rhs[col] = rhs[maxRow]!
      rhs[maxRow] = tmpR
    }

    // Eliminate
    const pivot = M[col]![col]!
    for (let row = col + 1; row < 8; row++) {
      const factor = M[row]![col]! / pivot
      for (let j = col; j < 8; j++) {
        M[row]![j] = M[row]![j]! - factor * M[col]![j]!
      }
      rhs[row] = rhs[row]! - factor * rhs[col]!
    }
  }

  // Back-substitution
  const h = new Array<number>(9)
  h[8] = 1
  for (let i = 7; i >= 0; i--) {
    let sum = rhs[i]!
    for (let j = i + 1; j < 8; j++) {
      sum -= M[i]![j]! * h[j]!
    }
    h[i] = sum / M[i]![i]!
  }

  return h
}

/**
 * Compute the inverse homography: given H that maps src→dst, compute H_inv
 * that maps dst→src.  We invert the 3x3 matrix.
 */
export function invertHomography(H: number[]): number[] | null {
  const a = H[0]!
  const b = H[1]!
  const c = H[2]!
  const d = H[3]!
  const e = H[4]!
  const f = H[5]!
  const g = H[6]!
  const hh = H[7]!
  const ii = H[8]!

  const det = a * (e * ii - f * hh) - b * (d * ii - f * g) + c * (d * hh - e * g)
  if (Math.abs(det) < 1e-12) return null

  const invDet = 1 / det
  return [
    (e * ii - f * hh) * invDet,
    (c * hh - b * ii) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * ii) * invDet,
    (a * ii - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * hh - e * g) * invDet,
    (b * g - a * hh) * invDet,
    (a * e - b * d) * invDet,
  ]
}

/**
 * Apply a perspective transform to an ImageData using inverse mapping.
 * For each pixel in the output, find the corresponding source pixel via H_inv
 * and sample using bilinear interpolation.
 */
export function applyPerspectiveTransform(src: ImageData, H: number[]): ImageData {
  const { width: w, height: h } = src
  const Hinv = invertHomography(H)
  if (!Hinv) return new ImageData(w, h)

  const dst = new ImageData(w, h)
  const dd = dst.data

  const useNearest = currentSettings.interpolation === 'nearest'

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Apply inverse homography: (x,y,1) → source coords
      const denom = Hinv[6]! * x + Hinv[7]! * y + Hinv[8]!
      if (Math.abs(denom) < 1e-10) continue // point at infinity

      const sx = (Hinv[0]! * x + Hinv[1]! * y + Hinv[2]!) / denom
      const sy = (Hinv[3]! * x + Hinv[4]! * y + Hinv[5]!) / denom

      // Skip pixels that map outside source bounds
      if (sx < -0.5 || sx > w - 0.5 || sy < -0.5 || sy > h - 0.5) continue

      const idx = (y * w + x) * 4

      if (useNearest) {
        const ix = Math.round(sx)
        const iy = Math.round(sy)
        if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
          const si = (iy * w + ix) * 4
          dd[idx] = src.data[si]!
          dd[idx + 1] = src.data[si + 1]!
          dd[idx + 2] = src.data[si + 2]!
          dd[idx + 3] = src.data[si + 3]!
        }
      } else {
        const [r, g, b, a] = bilinearSample(src, sx, sy)
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
 * Begin a perspective transform session on the current raster layer.
 * Initialises corners to the layer bounds.
 */
export function beginPerspectiveTransform(bounds: { x: number; y: number; width: number; height: number }): boolean {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
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

  // Snapshot for undo
  state.originalSnapshot = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height)
  state.chunkId = chunkId
  state.layerBounds = { ...bounds }

  // Initialise corners to bounds
  const { x, y, width, height } = bounds
  state.srcCorners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]
  state.dstCorners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]

  state.activeHandle = -1
  state.active = true

  return true
}

/**
 * Drag a corner handle to a new position.
 */
export function dragPerspectiveCorner(index: number, x: number, y: number): void {
  if (!state.active || index < 0 || index > 3) return
  state.dstCorners[index] = { x, y }
  state.activeHandle = index
}

/**
 * Commit the perspective transform: apply warped image to raster data with undo.
 */
export function commitPerspectiveTransform(): boolean {
  if (!state.active || !state.chunkId || !state.originalSnapshot) return false

  const H = computeHomography(state.srcCorners, state.dstCorners)
  if (!H) {
    cancelPerspectiveTransform()
    return false
  }

  const result = applyPerspectiveTransform(state.originalSnapshot, H)

  // Store result
  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)

  // Push undo
  useEditorStore.getState().pushRasterHistory('Perspective transform', state.chunkId, state.originalSnapshot, result)

  // Reset state
  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.activeHandle = -1

  return true
}

/**
 * Cancel the perspective transform, restoring the original image.
 */
export function cancelPerspectiveTransform(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.activeHandle = -1
}
