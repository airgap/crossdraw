import { type SelectionMask, setSelectionMask, featherSelection } from '@/tools/raster-selection'
import { rasterizePolygon } from '@/tools/polygonal-lasso'

// ─── Settings ──────────────────────────────────────────────────

export interface MagneticLassoSettings {
  /** Search radius in pixels for edge snapping */
  width: number
  /** Minimum edge strength threshold (0-1) to consider an edge */
  contrast: number
  /** Auto-anchor spacing in pixels (0 = manual only) */
  frequency: number
  /** Feather radius for the final selection */
  feather: number
}

let settings: MagneticLassoSettings = {
  width: 10,
  contrast: 0.1,
  frequency: 40,
  feather: 0,
}

export function getMagneticLassoSettings(): MagneticLassoSettings {
  return { ...settings }
}

export function setMagneticLassoSettings(patch: Partial<MagneticLassoSettings>) {
  settings = { ...settings, ...patch }
}

// ─── State ─────────────────────────────────────────────────────

interface MagneticLassoState {
  active: boolean
  /** Locked anchor points */
  anchors: Array<{ x: number; y: number }>
  /** Complete locked edge path (all segments joined) */
  edgePath: Array<{ x: number; y: number }>
  /** Live preview path from last anchor to current mouse */
  livePath: Array<{ x: number; y: number }>
  /** Cached edge map from Sobel filter */
  edgeMap: Float32Array | null
  /** Image dimensions for the edge map */
  edgeMapWidth: number
  edgeMapHeight: number
  /** Distance accumulator for auto-anchor placement */
  autoAnchorAccum: number
  /** Last mouse position for auto-anchor distance tracking */
  lastMouseX: number
  lastMouseY: number
}

const state: MagneticLassoState = {
  active: false,
  anchors: [],
  edgePath: [],
  livePath: [],
  edgeMap: null,
  edgeMapWidth: 0,
  edgeMapHeight: 0,
  autoAnchorAccum: 0,
  lastMouseX: 0,
  lastMouseY: 0,
}

/** Distance (in document pixels) at which clicking near the first point auto-closes. */
const CLOSING_DISTANCE = 8

// ─── Edge Detection ─────────────────────────────────────────────

/**
 * Compute a Sobel edge-strength map from image data.
 * Returns a Float32Array of normalized 0-1 gradient magnitudes, one per pixel.
 */
export function computeEdgeMap(imageData: ImageData): Float32Array {
  const w = imageData.width
  const h = imageData.height
  const pixels = imageData.data
  const edgeMap = new Float32Array(w * h)

  // Convert to grayscale luminance
  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = pixels[i * 4]!
    const g = pixels[i * 4 + 1]!
    const b = pixels[i * 4 + 2]!
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }

  // Sobel 3x3 kernel convolution
  let maxMag = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)]!
      const tc = gray[(y - 1) * w + x]!
      const tr = gray[(y - 1) * w + (x + 1)]!
      const ml = gray[y * w + (x - 1)]!
      const mr = gray[y * w + (x + 1)]!
      const bl = gray[(y + 1) * w + (x - 1)]!
      const bc = gray[(y + 1) * w + x]!
      const br = gray[(y + 1) * w + (x + 1)]!

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br

      const mag = Math.sqrt(gx * gx + gy * gy)
      edgeMap[y * w + x] = mag
      if (mag > maxMag) maxMag = mag
    }
  }

  // Normalize to 0-1
  if (maxMag > 0) {
    for (let i = 0; i < edgeMap.length; i++) {
      edgeMap[i] = edgeMap[i]! / maxMag
    }
  }

  return edgeMap
}

// ─── Edge Snapping ─────────────────────────────────────────────

/**
 * Search within `searchRadius` pixels for the highest edge strength.
 * Returns the snapped position, or the original position if no strong edge found.
 */
export function snapToEdge(
  x: number,
  y: number,
  edgeMap: Float32Array,
  width: number,
  height: number,
  searchRadius: number,
  contrastThreshold: number = 0,
): { x: number; y: number } {
  const px = Math.round(x)
  const py = Math.round(y)

  let bestX = px
  let bestY = py
  let bestStrength = -1

  const minX = Math.max(0, px - searchRadius)
  const maxX = Math.min(width - 1, px + searchRadius)
  const minY = Math.max(0, py - searchRadius)
  const maxY = Math.min(height - 1, py + searchRadius)
  const r2 = searchRadius * searchRadius

  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      const dx = sx - px
      const dy = sy - py
      // Circular search area
      if (dx * dx + dy * dy > r2) continue

      const strength = edgeMap[sy * width + sx]!
      if (strength > bestStrength && strength >= contrastThreshold) {
        bestStrength = strength
        bestX = sx
        bestY = sy
      }
    }
  }

  return { x: bestX, y: bestY }
}

// ─── Path Tracing ──────────────────────────────────────────────

/**
 * Trace a path between two points following edges.
 * Uses a greedy approach: at each step, pick the neighboring pixel
 * in the general direction of `to` with the highest edge strength.
 */
export function traceEdgePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  edgeMap: Float32Array,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const path: Array<{ x: number; y: number }> = [{ x: Math.round(from.x), y: Math.round(from.y) }]

  let cx = Math.round(from.x)
  let cy = Math.round(from.y)
  const tx = Math.round(to.x)
  const ty = Math.round(to.y)

  // Limit iterations to avoid infinite loops
  const totalDist = Math.abs(tx - cx) + Math.abs(ty - cy)
  const maxSteps = Math.max(totalDist * 3, 10)

  for (let step = 0; step < maxSteps; step++) {
    if (cx === tx && cy === ty) break

    // Direction vector toward target
    const dx = tx - cx
    const dy = ty - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) break

    const dirX = dx / dist
    const dirY = dy / dist

    // Evaluate all 8 neighbors
    let bestX = cx
    let bestY = cy
    let bestScore = -Infinity

    for (let ny = -1; ny <= 1; ny++) {
      for (let nx = -1; nx <= 1; nx++) {
        if (nx === 0 && ny === 0) continue
        const px = cx + nx
        const py = cy + ny
        if (px < 0 || px >= width || py < 0 || py >= height) continue

        // Dot product with direction to target (favor progress toward target)
        const ndist = Math.sqrt(nx * nx + ny * ny)
        const dot = (nx / ndist) * dirX + (ny / ndist) * dirY

        // Reject neighbors that go backwards (dot < -0.3)
        if (dot < -0.3) continue

        // Score = edge strength + directional bias
        const edgeStrength = edgeMap[py * width + px]!
        const score = edgeStrength * 2 + dot

        if (score > bestScore) {
          bestScore = score
          bestX = px
          bestY = py
        }
      }
    }

    // If no progress, step directly toward target
    if (bestX === cx && bestY === cy) {
      cx += Math.sign(dx)
      cy += Math.sign(dy)
    } else {
      cx = bestX
      cy = bestY
    }

    path.push({ x: cx, y: cy })
  }

  // Ensure we end at the target
  const last = path[path.length - 1]!
  if (last.x !== tx || last.y !== ty) {
    path.push({ x: tx, y: ty })
  }

  return path
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Start a new magnetic lasso. Computes the edge map and places the first anchor.
 */
export function beginMagneticLasso(x: number, y: number, imageData: ImageData) {
  state.edgeMap = computeEdgeMap(imageData)
  state.edgeMapWidth = imageData.width
  state.edgeMapHeight = imageData.height

  // Snap the starting point to the nearest edge
  const snapped = snapToEdge(
    Math.round(x),
    Math.round(y),
    state.edgeMap,
    state.edgeMapWidth,
    state.edgeMapHeight,
    settings.width,
    settings.contrast,
  )

  state.active = true
  state.anchors = [snapped]
  state.edgePath = [snapped]
  state.livePath = []
  state.autoAnchorAccum = 0
  state.lastMouseX = snapped.x
  state.lastMouseY = snapped.y
}

/**
 * Update the magnetic lasso as the mouse moves.
 * Snaps to the nearest edge and computes a live preview path from the last anchor.
 * May auto-place anchors based on the frequency setting.
 */
export function updateMagneticLasso(x: number, y: number) {
  if (!state.active || !state.edgeMap) return

  const snapped = snapToEdge(
    Math.round(x),
    Math.round(y),
    state.edgeMap,
    state.edgeMapWidth,
    state.edgeMapHeight,
    settings.width,
    settings.contrast,
  )

  // Track distance for auto-anchor
  const dx = snapped.x - state.lastMouseX
  const dy = snapped.y - state.lastMouseY
  const moveDist = Math.sqrt(dx * dx + dy * dy)
  state.autoAnchorAccum += moveDist
  state.lastMouseX = snapped.x
  state.lastMouseY = snapped.y

  // Auto-place anchor if frequency threshold reached
  if (settings.frequency > 0 && state.autoAnchorAccum >= settings.frequency) {
    state.autoAnchorAccum = 0
    addMagneticLassoAnchorInternal(snapped.x, snapped.y)
  }

  // Compute live preview from last anchor to current snapped position
  const lastAnchor = state.anchors[state.anchors.length - 1]!
  state.livePath = traceEdgePath(lastAnchor, snapped, state.edgeMap, state.edgeMapWidth, state.edgeMapHeight)
}

/**
 * Internal: lock the current traced path segment and add a new anchor.
 */
function addMagneticLassoAnchorInternal(x: number, y: number) {
  if (!state.active || !state.edgeMap) return

  const snapped = snapToEdge(
    Math.round(x),
    Math.round(y),
    state.edgeMap,
    state.edgeMapWidth,
    state.edgeMapHeight,
    settings.width,
    settings.contrast,
  )

  const lastAnchor = state.anchors[state.anchors.length - 1]!
  const segment = traceEdgePath(lastAnchor, snapped, state.edgeMap, state.edgeMapWidth, state.edgeMapHeight)

  // Append segment (skip first point to avoid duplicate)
  for (let i = 1; i < segment.length; i++) {
    state.edgePath.push(segment[i]!)
  }

  state.anchors.push(snapped)
  state.autoAnchorAccum = 0
}

/**
 * Manually place an anchor point.
 * Returns true if the click is near the first point (close signal).
 */
export function addMagneticLassoAnchor(x: number, y: number): boolean {
  if (!state.active || !state.edgeMap) return false

  // Check if clicking near the first anchor to close
  if (state.anchors.length >= 3) {
    const first = state.anchors[0]!
    const dx = x - first.x
    const dy = y - first.y
    if (Math.sqrt(dx * dx + dy * dy) <= CLOSING_DISTANCE) {
      return true
    }
  }

  addMagneticLassoAnchorInternal(x, y)
  return false
}

/**
 * Close the magnetic lasso polygon and create a raster SelectionMask.
 */
export function closeMagneticLasso(
  mode: 'replace' | 'add' | 'subtract',
  layerWidth: number,
  layerHeight: number,
): SelectionMask | null {
  if (!state.active || state.anchors.length < 3) {
    cancelMagneticLasso()
    return null
  }

  // Trace final segment from last anchor to first anchor
  if (state.edgeMap) {
    const lastAnchor = state.anchors[state.anchors.length - 1]!
    const firstAnchor = state.anchors[0]!
    const closingSegment = traceEdgePath(
      lastAnchor,
      firstAnchor,
      state.edgeMap,
      state.edgeMapWidth,
      state.edgeMapHeight,
    )
    for (let i = 1; i < closingSegment.length; i++) {
      state.edgePath.push(closingSegment[i]!)
    }
  }

  // Use the full edge path as the polygon for rasterization
  const polygon = state.edgePath.length >= 3 ? state.edgePath : state.anchors
  const mask = rasterizePolygon(polygon, layerWidth, layerHeight, mode)
  setSelectionMask(mask)

  if (settings.feather > 0) {
    featherSelection(settings.feather)
  }

  resetState()
  return mask
}

/**
 * Cancel the magnetic lasso without creating a selection.
 */
export function cancelMagneticLasso() {
  resetState()
}

function resetState() {
  state.active = false
  state.anchors = []
  state.edgePath = []
  state.livePath = []
  state.edgeMap = null
  state.edgeMapWidth = 0
  state.edgeMapHeight = 0
  state.autoAnchorAccum = 0
  state.lastMouseX = 0
  state.lastMouseY = 0
}

// ─── Query helpers ─────────────────────────────────────────────

export function isMagneticLassoActive(): boolean {
  return state.active
}

/**
 * Get all points for rendering: the locked edge path plus the live preview path.
 */
export function getMagneticLassoPoints(): Array<{ x: number; y: number }> {
  if (!state.active) return []
  // Combine locked path + live preview
  const combined = [...state.edgePath]
  if (state.livePath.length > 1) {
    // Skip first point of live path (same as last in edgePath)
    for (let i = 1; i < state.livePath.length; i++) {
      combined.push(state.livePath[i]!)
    }
  }
  return combined
}

/**
 * Get just the anchor points (for rendering anchor dots).
 */
export function getMagneticLassoAnchors(): Array<{ x: number; y: number }> {
  return state.anchors
}
