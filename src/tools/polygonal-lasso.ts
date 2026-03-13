import { type SelectionMask, getSelectionMask, setSelectionMask, featherSelection } from '@/tools/raster-selection'

// ─── Settings ──────────────────────────────────────────────────

interface PolygonalLassoSettings {
  feather: number
  antiAlias: boolean
}

let settings: PolygonalLassoSettings = {
  feather: 0,
  antiAlias: true,
}

export function getPolygonalLassoSettings(): PolygonalLassoSettings {
  return { ...settings }
}

export function setPolygonalLassoSettings(patch: Partial<PolygonalLassoSettings>) {
  settings = { ...settings, ...patch }
}

// ─── State ─────────────────────────────────────────────────────

interface PolygonalLassoState {
  active: boolean
  points: Array<{ x: number; y: number }>
}

const state: PolygonalLassoState = {
  active: false,
  points: [],
}

/** Distance (in document pixels) at which clicking near the first point auto-closes. */
const CLOSING_DISTANCE = 8

// ─── Public API ────────────────────────────────────────────────

/**
 * Start a new polygonal lasso. Places the first vertex.
 */
export function beginPolygonalLasso(x: number, y: number) {
  state.active = true
  state.points = [{ x, y }]
}

/**
 * Add a vertex to the polygonal lasso.
 * If the new point is within closing distance of the first point, returns true
 * to signal the polygon should be closed.
 */
export function addPolygonalLassoPoint(x: number, y: number): boolean {
  if (!state.active) return false

  // Check if clicking near the first point to auto-close
  if (state.points.length >= 3) {
    const first = state.points[0]!
    const dx = x - first.x
    const dy = y - first.y
    if (Math.sqrt(dx * dx + dy * dy) <= CLOSING_DISTANCE) {
      return true // signal: close the polygon
    }
  }

  state.points.push({ x, y })
  return false
}

/**
 * Close the polygon and create a raster SelectionMask via scanline fill.
 * Returns the mask, or null if fewer than 3 points.
 */
export function closePolygonalLasso(
  mode: 'replace' | 'add' | 'subtract',
  layerWidth: number,
  layerHeight: number,
): SelectionMask | null {
  if (!state.active || state.points.length < 3) {
    cancelPolygonalLasso()
    return null
  }

  const mask = rasterizePolygon(state.points, layerWidth, layerHeight, mode)
  setSelectionMask(mask)

  if (settings.feather > 0) {
    featherSelection(settings.feather)
  }

  state.active = false
  state.points = []
  return mask
}

/**
 * Cancel the current polygonal lasso without creating a selection.
 */
export function cancelPolygonalLasso() {
  state.active = false
  state.points = []
}

export function isPolygonalLassoActive(): boolean {
  return state.active
}

export function getPolygonalLassoPoints(): Array<{ x: number; y: number }> {
  return state.points
}

// ─── Scanline polygon rasterizer (even-odd rule) ───────────────

/**
 * Rasterize a polygon into a SelectionMask using scanline fill with the
 * even-odd rule. This matches the behavior of standard graphics selection tools.
 */
export function rasterizePolygon(
  polygon: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const currentMask = getSelectionMask()
  const mask: SelectionMask =
    mode === 'replace' || !currentMask
      ? { width, height, data: new Uint8Array(width * height) }
      : { width: currentMask.width, height: currentMask.height, data: new Uint8Array(currentMask.data) }

  const n = polygon.length
  if (n < 3) return mask

  // For each scanline row, find edge intersections and fill spans
  for (let y = 0; y < height; y++) {
    const scanY = y + 0.5 // sample at pixel center
    const intersections: number[] = []

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = polygon[i]!.y
      const yj = polygon[j]!.y

      // Check if this edge crosses the scanline
      if ((yi <= scanY && yj > scanY) || (yj <= scanY && yi > scanY)) {
        const xi = polygon[i]!.x
        const xj = polygon[j]!.x
        const t = (scanY - yi) / (yj - yi)
        intersections.push(xi + t * (xj - xi))
      }
    }

    // Sort intersections left to right
    intersections.sort((a, b) => a - b)

    // Fill between pairs (even-odd rule)
    for (let k = 0; k < intersections.length - 1; k += 2) {
      const xStart = Math.max(0, Math.ceil(intersections[k]!))
      const xEnd = Math.min(width, Math.floor(intersections[k + 1]!))

      for (let x = xStart; x < xEnd; x++) {
        const idx = y * width + x
        if (mode === 'subtract') {
          mask.data[idx] = 0
        } else {
          mask.data[idx] = 255
        }
      }
    }
  }

  return mask
}
