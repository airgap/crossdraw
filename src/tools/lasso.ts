import { useEditorStore } from '@/store/editor.store'
import { getLayerBBox } from '@/math/bbox'

interface LassoState {
  active: boolean
  points: Array<{ x: number; y: number }>
}

const state: LassoState = {
  active: false,
  points: [],
}

export function beginLasso(docX: number, docY: number) {
  state.active = true
  state.points = [{ x: docX, y: docY }]
}

export function updateLasso(docX: number, docY: number) {
  if (!state.active) return
  state.points.push({ x: docX, y: docY })
}

export function endLasso(addToSelection: boolean) {
  if (!state.active || state.points.length < 3) {
    state.active = false
    state.points = []
    return
  }

  const store = useEditorStore.getState()
  if (!addToSelection) store.deselectAll()

  // Select layers whose bounding box center is inside the lasso polygon
  for (const artboard of store.document.artboards) {
    for (const layer of artboard.layers) {
      if (!layer.visible || layer.locked) continue
      const bbox = getLayerBBox(layer, artboard)
      if (bbox.minX === Infinity) continue
      const cx = (bbox.minX + bbox.maxX) / 2
      const cy = (bbox.minY + bbox.maxY) / 2
      if (pointInPolygon(cx, cy, state.points)) {
        store.selectLayer(layer.id, true)
      }
    }
  }

  state.active = false
  state.points = []
}

export function getLassoPoints(): Array<{ x: number; y: number }> {
  return state.points
}

export function isLassoActive(): boolean {
  return state.active
}

/** Ray casting point-in-polygon test */
function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
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
