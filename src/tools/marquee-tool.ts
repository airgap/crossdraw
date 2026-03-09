import { useEditorStore } from '@/store/editor.store'
import { getLayerBBox } from '@/math/bbox'

interface MarqueeState {
  active: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

const state: MarqueeState = {
  active: false,
  startX: 0,
  startY: 0,
  endX: 0,
  endY: 0,
}

export function beginMarquee(docX: number, docY: number) {
  state.active = true
  state.startX = docX
  state.startY = docY
  state.endX = docX
  state.endY = docY
}

export function updateMarquee(docX: number, docY: number, shift: boolean) {
  if (!state.active) return
  state.endX = docX
  state.endY = docY

  // Shift: constrain to square
  if (shift) {
    const dx = state.endX - state.startX
    const dy = state.endY - state.startY
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    state.endX = state.startX + Math.sign(dx) * size
    state.endY = state.startY + Math.sign(dy) * size
  }
}

export function endMarquee(addToSelection: boolean) {
  if (!state.active) {
    return
  }

  const mx = Math.min(state.startX, state.endX)
  const my = Math.min(state.startY, state.endY)
  const mw = Math.abs(state.endX - state.startX)
  const mh = Math.abs(state.endY - state.startY)

  if (mw > 2 || mh > 2) {
    const store = useEditorStore.getState()
    if (!addToSelection) store.deselectAll()

    for (const artboard of store.document.artboards) {
      for (const layer of artboard.layers) {
        if (!layer.visible || layer.locked) continue
        const bbox = getLayerBBox(layer, artboard)
        if (bbox.minX === Infinity) continue
        if (bbox.maxX >= mx && bbox.minX <= mx + mw && bbox.maxY >= my && bbox.minY <= my + mh) {
          store.selectLayer(layer.id, true)
        }
      }
    }
  }

  state.active = false
}

export function getMarqueeRect(): { x: number; y: number; w: number; h: number } | null {
  if (!state.active) return null
  return {
    x: Math.min(state.startX, state.endX),
    y: Math.min(state.startY, state.endY),
    w: Math.abs(state.endX - state.startX),
    h: Math.abs(state.endY - state.startY),
  }
}

export function isMarqueeActive(): boolean {
  return state.active
}
