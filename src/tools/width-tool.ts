import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer, Path } from '@/types'

// ─── Module state ────────────────────────────────────────────

interface WidthToolState {
  layerId: string | null
  artboardId: string | null
  activePosition: number // t parameter along path (0-1)
  dragStartY: number
  originalMultiplier: number
  isDragging: boolean
}

const initialState: WidthToolState = {
  layerId: null,
  artboardId: null,
  activePosition: 0,
  dragStartY: 0,
  originalMultiplier: 1,
  isDragging: false,
}

let state: WidthToolState = { ...initialState }

// ─── Exports ─────────────────────────────────────────────────

export function getWidthToolState(): WidthToolState {
  return state
}

export function resetWidthTool() {
  state = { ...initialState }
}

// ─── Path flattening helpers ─────────────────────────────────

interface Point {
  x: number
  y: number
}

const FLATTEN_STEPS = 20

/**
 * Flatten a single path into a polyline with cumulative arc lengths.
 * Returns { points, arcLengths, totalLength }.
 */
function flattenPath(path: Path): {
  points: Point[]
  arcLengths: number[]
  totalLength: number
} {
  const points: Point[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  for (const seg of path.segments) {
    switch (seg.type) {
      case 'move':
        cx = seg.x
        cy = seg.y
        startX = cx
        startY = cy
        points.push({ x: cx, y: cy })
        break

      case 'line':
        cx = seg.x
        cy = seg.y
        points.push({ x: cx, y: cy })
        break

      case 'cubic': {
        const x0 = cx,
          y0 = cy
        for (let i = 1; i <= FLATTEN_STEPS; i++) {
          const t = i / FLATTEN_STEPS
          const u = 1 - t
          const x = u * u * u * x0 + 3 * u * u * t * seg.cp1x + 3 * u * t * t * seg.cp2x + t * t * t * seg.x
          const y = u * u * u * y0 + 3 * u * u * t * seg.cp1y + 3 * u * t * t * seg.cp2y + t * t * t * seg.y
          points.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'quadratic': {
        const x0 = cx,
          y0 = cy
        for (let i = 1; i <= FLATTEN_STEPS; i++) {
          const t = i / FLATTEN_STEPS
          const u = 1 - t
          const x = u * u * x0 + 2 * u * t * seg.cpx + t * t * seg.x
          const y = u * u * y0 + 2 * u * t * seg.cpy + t * t * seg.y
          points.push({ x, y })
        }
        cx = seg.x
        cy = seg.y
        break
      }

      case 'close':
        if (cx !== startX || cy !== startY) {
          points.push({ x: startX, y: startY })
        }
        cx = startX
        cy = startY
        break
    }
  }

  // Compute cumulative arc lengths
  const arcLengths = new Array<number>(points.length)
  arcLengths[0] = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x
    const dy = points[i]!.y - points[i - 1]!.y
    arcLengths[i] = arcLengths[i - 1]! + Math.sqrt(dx * dx + dy * dy)
  }

  const totalLength = arcLengths.length > 0 ? arcLengths[arcLengths.length - 1]! : 0

  return { points, arcLengths, totalLength }
}

// ─── Hit test: find nearest point on path ────────────────────

/**
 * Find the nearest position (t parameter 0-1) on a vector layer's paths
 * to a given document coordinate. Returns the t parameter and distance.
 */
function findNearestPositionOnPath(
  layer: VectorLayer,
  localX: number,
  localY: number,
): { t: number; distance: number } | null {
  let bestT = 0
  let bestDist = Infinity

  for (const path of layer.paths) {
    const { points, arcLengths, totalLength } = flattenPath(path)
    if (points.length < 2 || totalLength === 0) continue

    for (let i = 0; i < points.length; i++) {
      const dx = points[i]!.x - localX
      const dy = points[i]!.y - localY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < bestDist) {
        bestDist = dist
        bestT = arcLengths[i]! / totalLength
      }
    }
  }

  if (bestDist === Infinity) return null
  return { t: bestT, distance: bestDist }
}

/**
 * Look up the current width multiplier at a given position in the profile.
 */
function getMultiplierAt(profile: [number, number][] | undefined, t: number): number {
  if (!profile || profile.length === 0) return 1

  // Find surrounding entries
  for (let i = 0; i < profile.length; i++) {
    if (profile[i]![0] >= t) {
      if (i === 0) return profile[0]![1]
      const [pos0, w0] = profile[i - 1]!
      const [pos1, w1] = profile[i]!
      const range = pos1 - pos0
      if (range === 0) return w0
      const localT = (t - pos0) / range
      return w0 + (w1 - w0) * localT
    }
  }

  return profile[profile.length - 1]![1]
}

// ─── Event handlers ──────────────────────────────────────────

export function widthToolMouseDown(
  docX: number,
  docY: number,
  zoom: number,
  artboardId: string,
  artboardX: number,
  artboardY: number,
) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const localX = docX - artboardX
  const localY = docY - artboardY

  // Search all vector layers on this artboard for the closest path
  let bestLayer: VectorLayer | null = null
  let bestT = 0
  let bestDist = Infinity

  for (const layer of artboard.layers) {
    if (layer.type !== 'vector' || !layer.visible || layer.locked) continue

    const vl = layer as VectorLayer
    // Adjust for layer transform
    const testX = localX - vl.transform.x
    const testY = localY - vl.transform.y

    const result = findNearestPositionOnPath(vl, testX, testY)
    if (result && result.distance < bestDist) {
      bestDist = result.distance
      bestT = result.t
      bestLayer = vl
    }
  }

  // Only activate if we're close enough to a path
  const threshold = 20 / zoom
  if (!bestLayer || bestDist > threshold) return

  state.layerId = bestLayer.id
  state.artboardId = artboardId
  state.activePosition = bestT
  state.dragStartY = docY
  state.originalMultiplier = getMultiplierAt(bestLayer.stroke?.widthProfile, bestT)
  state.isDragging = true

  // Ensure the layer has a stroke with a width profile
  if (!bestLayer.stroke) {
    store.updateLayerSilent(artboardId, bestLayer.id, {
      stroke: {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 4,
        widthProfile: [
          [0, 1],
          [1, 1],
        ],
      },
    } as Partial<VectorLayer>)
  } else if (!bestLayer.stroke.widthProfile || bestLayer.stroke.widthProfile.length === 0) {
    store.updateLayerSilent(artboardId, bestLayer.id, {
      stroke: {
        ...bestLayer.stroke,
        widthProfile: [
          [0, 1],
          [1, 1],
        ],
      },
    } as Partial<VectorLayer>)
  }
}

export function widthToolMouseDrag(_docX: number, docY: number) {
  if (!state.isDragging || !state.layerId || !state.artboardId) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === state.layerId)
  if (!layer || layer.type !== 'vector') return

  const vl = layer as VectorLayer
  if (!vl.stroke) return

  // Dragging up increases width, dragging down decreases.
  // Sensitivity: 200px of drag = 2x multiplier change
  const dy = state.dragStartY - docY // positive = dragged up
  const sensitivity = 0.01
  const newMultiplier = Math.max(0, state.originalMultiplier + dy * sensitivity)

  // Update the width profile: insert or update the control point at activePosition
  const profile: [number, number][] = vl.stroke.widthProfile
    ? [...vl.stroke.widthProfile.map((e) => [...e] as [number, number])]
    : [
        [0, 1],
        [1, 1],
      ]

  // Find if there's already a point near this position
  const posThreshold = 0.02
  let found = false
  for (let i = 0; i < profile.length; i++) {
    if (Math.abs(profile[i]![0] - state.activePosition) < posThreshold) {
      profile[i]![1] = newMultiplier
      found = true
      break
    }
  }

  if (!found) {
    // Insert a new control point at the correct sorted position
    let insertIdx = profile.length
    for (let i = 0; i < profile.length; i++) {
      if (profile[i]![0] > state.activePosition) {
        insertIdx = i
        break
      }
    }
    profile.splice(insertIdx, 0, [state.activePosition, newMultiplier])
  }

  // Update layer with new width profile (silent for live preview)
  store.updateLayerSilent(state.artboardId, state.layerId, {
    stroke: {
      ...vl.stroke,
      widthProfile: profile,
    },
  } as Partial<VectorLayer>)
}

export function widthToolMouseUp() {
  if (!state.isDragging) return

  // Commit the final state with an undo entry
  if (state.layerId && state.artboardId) {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
    if (artboard) {
      const layer = artboard.layers.find((l) => l.id === state.layerId)
      if (layer && layer.type === 'vector') {
        const vl = layer as VectorLayer
        if (vl.stroke) {
          // Re-apply via updateLayer (with undo) to make it persistent
          store.updateLayer(state.artboardId, state.layerId, {
            stroke: { ...vl.stroke },
          } as Partial<VectorLayer>)
        }
      }
    }
  }

  state.isDragging = false
  state.layerId = null
  state.artboardId = null
}

export function isWidthToolDragging(): boolean {
  return state.isDragging
}
