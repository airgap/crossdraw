import { useEditorStore } from '@/store/editor.store'
import { getRasterData, storeRasterData } from '@/store/raster-data'
import type { CropRegion, RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Crop tool state machine
//
//   idle → drawing (drag to create rect)
//        → adjusting (rect placed, user can resize/move handles)
//        → idle (Enter/double-click commits, Escape cancels)
// ---------------------------------------------------------------------------

type CropPhase = 'idle' | 'drawing' | 'adjusting'
export type CropHandle = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'body' | null

interface CropState {
  phase: CropPhase
  artboardId: string
  /** The crop rectangle in document space (always normalised: w,h > 0) */
  x: number
  y: number
  w: number
  h: number
  /** Drawing phase: raw start/current points before normalisation */
  drawStartX: number
  drawStartY: number
  /** Adjustment drag state */
  activeHandle: CropHandle
  dragStartX: number
  dragStartY: number
  /** Snapshot of rect at drag start for delta-based adjustment */
  snapX: number
  snapY: number
  snapW: number
  snapH: number
}

const idle: CropState = {
  phase: 'idle',
  artboardId: '',
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  drawStartX: 0,
  drawStartY: 0,
  activeHandle: null,
  dragStartX: 0,
  dragStartY: 0,
  snapX: 0,
  snapY: 0,
  snapW: 0,
  snapH: 0,
}

let state: CropState = { ...idle }

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function isCropActive(): boolean {
  return state.phase !== 'idle'
}

export function isCropDragging(): boolean {
  return state.phase === 'drawing' || (state.phase === 'adjusting' && state.activeHandle !== null)
}

export function isCropAdjusting(): boolean {
  return state.phase === 'adjusting'
}

export function getCropRect(): { x: number; y: number; w: number; h: number } | null {
  if (state.phase === 'idle') return null
  if (state.w < 1 || state.h < 1) return null
  return { x: state.x, y: state.y, w: state.w, h: state.h }
}

/** Hit-test crop handles. Returns handle type or null. */
export function hitTestCropHandle(docX: number, docY: number, zoom: number): CropHandle {
  if (state.phase !== 'adjusting') return null
  const r = state
  const handleR = Math.min(14, Math.max(6, 8 / zoom))

  // Corners
  if (dist2(docX, docY, r.x, r.y) <= handleR * handleR) return 'nw'
  if (dist2(docX, docY, r.x + r.w, r.y) <= handleR * handleR) return 'ne'
  if (dist2(docX, docY, r.x, r.y + r.h) <= handleR * handleR) return 'sw'
  if (dist2(docX, docY, r.x + r.w, r.y + r.h) <= handleR * handleR) return 'se'

  // Edges (check proximity to edge lines)
  const edgeR = handleR * 0.8
  if (Math.abs(docY - r.y) < edgeR && docX > r.x + handleR && docX < r.x + r.w - handleR) return 'n'
  if (Math.abs(docY - (r.y + r.h)) < edgeR && docX > r.x + handleR && docX < r.x + r.w - handleR) return 's'
  if (Math.abs(docX - r.x) < edgeR && docY > r.y + handleR && docY < r.y + r.h - handleR) return 'w'
  if (Math.abs(docX - (r.x + r.w)) < edgeR && docY > r.y + handleR && docY < r.y + r.h - handleR) return 'e'

  // Body
  if (docX >= r.x && docX <= r.x + r.w && docY >= r.y && docY <= r.y + r.h) return 'body'

  return null
}

export function getCropHandleCursor(handle: CropHandle): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'body':
      return 'move'
    default:
      return 'crosshair'
  }
}

function dist2(x1: number, y1: number, x2: number, y2: number) {
  const dx = x1 - x2
  const dy = y1 - y2
  return dx * dx + dy * dy
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Start drawing a new crop rect (mousedown on empty area). */
export function beginCropDrag(docX: number, docY: number, artboardId: string) {
  state = {
    ...idle,
    phase: 'drawing',
    artboardId,
    drawStartX: docX,
    drawStartY: docY,
    x: docX,
    y: docY,
    w: 0,
    h: 0,
  }
}

/** Update during drawing phase. */
export function updateCropDrag(docX: number, docY: number) {
  if (state.phase === 'drawing') {
    state.x = Math.min(state.drawStartX, docX)
    state.y = Math.min(state.drawStartY, docY)
    state.w = Math.abs(docX - state.drawStartX)
    state.h = Math.abs(docY - state.drawStartY)
  } else if (state.phase === 'adjusting' && state.activeHandle) {
    const dx = docX - state.dragStartX
    const dy = docY - state.dragStartY
    applyHandleDelta(state.activeHandle, dx, dy)
  }
}

/** Mouseup after drawing → transition to adjusting. */
export function endCropDrawing() {
  if (state.phase === 'drawing') {
    if (state.w < 2 || state.h < 2) {
      // Too small, cancel
      state = { ...idle }
      return
    }
    state.phase = 'adjusting'
    state.activeHandle = null
  }
}

/** Begin adjusting an existing crop rect (mousedown on a handle). */
export function beginCropAdjust(docX: number, docY: number, handle: CropHandle) {
  if (state.phase !== 'adjusting' || !handle) return
  state.activeHandle = handle
  state.dragStartX = docX
  state.dragStartY = docY
  state.snapX = state.x
  state.snapY = state.y
  state.snapW = state.w
  state.snapH = state.h
}

/** End an adjustment drag. */
export function endCropAdjust() {
  if (state.phase === 'adjusting') {
    state.activeHandle = null
  }
}

/** Apply the crop and return to idle. */
export function commitCrop() {
  if (state.phase !== 'adjusting') return
  const rect = getCropRect()
  if (!rect) {
    state = { ...idle }
    return
  }

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) {
    state = { ...idle }
    return
  }

  // Check if a raster layer is selected
  const sel = store.selection
  if (sel.layerIds.length === 1) {
    const layer = artboard.layers.find((l) => l.id === sel.layerIds[0])
    if (layer && layer.type === 'raster') {
      applyRasterCrop(state.artboardId, layer.id, rect, artboard)
      state = { ...idle }
      return
    }
  }

  // Artboard crop — the crop rect may extend beyond the artboard to
  // enlarge the canvas, not just shrink it.
  const cx = rect.x
  const cy = rect.y
  const cw = rect.w
  const ch = rect.h
  if (cw < 1 || ch < 1) {
    state = { ...idle }
    return
  }

  const dx = cx - artboard.x
  const dy = cy - artboard.y
  for (const layer of artboard.layers) {
    store.updateLayerSilent(state.artboardId, layer.id, {
      transform: { ...layer.transform, x: layer.transform.x - dx, y: layer.transform.y - dy },
    })
  }
  store.resizeArtboard(state.artboardId, Math.round(cw), Math.round(ch))
  state = { ...idle }
}

/** Cancel crop and return to idle. */
export function cancelCrop() {
  state = { ...idle }
}

// ---------------------------------------------------------------------------
// Handle delta application
// ---------------------------------------------------------------------------

const MIN_SIZE = 5

function applyHandleDelta(handle: CropHandle, dx: number, dy: number) {
  const s = state
  switch (handle) {
    case 'body':
      s.x = s.snapX + dx
      s.y = s.snapY + dy
      break
    case 'nw':
      s.x = Math.min(s.snapX + dx, s.snapX + s.snapW - MIN_SIZE)
      s.y = Math.min(s.snapY + dy, s.snapY + s.snapH - MIN_SIZE)
      s.w = s.snapW - (s.x - s.snapX)
      s.h = s.snapH - (s.y - s.snapY)
      break
    case 'ne':
      s.w = Math.max(MIN_SIZE, s.snapW + dx)
      s.y = Math.min(s.snapY + dy, s.snapY + s.snapH - MIN_SIZE)
      s.h = s.snapH - (s.y - s.snapY)
      break
    case 'sw':
      s.x = Math.min(s.snapX + dx, s.snapX + s.snapW - MIN_SIZE)
      s.w = s.snapW - (s.x - s.snapX)
      s.h = Math.max(MIN_SIZE, s.snapH + dy)
      break
    case 'se':
      s.w = Math.max(MIN_SIZE, s.snapW + dx)
      s.h = Math.max(MIN_SIZE, s.snapH + dy)
      break
    case 'n':
      s.y = Math.min(s.snapY + dy, s.snapY + s.snapH - MIN_SIZE)
      s.h = s.snapH - (s.y - s.snapY)
      break
    case 's':
      s.h = Math.max(MIN_SIZE, s.snapH + dy)
      break
    case 'w':
      s.x = Math.min(s.snapX + dx, s.snapX + s.snapW - MIN_SIZE)
      s.w = s.snapW - (s.x - s.snapX)
      break
    case 'e':
      s.w = Math.max(MIN_SIZE, s.snapW + dx)
      break
  }
}

// ---------------------------------------------------------------------------
// Raster crop (destructive)
// ---------------------------------------------------------------------------

function applyRasterCrop(
  artboardId: string,
  layerId: string,
  rect: { x: number; y: number; w: number; h: number },
  artboard: { x: number; y: number },
) {
  const store = useEditorStore.getState()
  const layer = store.document.artboards.find((a) => a.id === artboardId)?.layers.find((l) => l.id === layerId) as
    | RasterLayer
    | undefined
  if (!layer) return

  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return

  const t = layer.transform
  const sx = t.scaleX || 1
  const sy = t.scaleY || 1
  const localX = (rect.x - artboard.x - t.x) / sx
  const localY = (rect.y - artboard.y - t.y) / sy
  const localW = rect.w / Math.abs(sx)
  const localH = rect.h / Math.abs(sy)

  const x0 = Math.max(0, Math.round(localX))
  const y0 = Math.max(0, Math.round(localY))
  const x1 = Math.min(imageData.width, Math.round(localX + localW))
  const y1 = Math.min(imageData.height, Math.round(localY + localH))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0) return

  const cropped = new ImageData(w, h)
  for (let row = 0; row < h; row++) {
    const srcOff = ((y0 + row) * imageData.width + x0) * 4
    const dstOff = row * w * 4
    cropped.data.set(imageData.data.subarray(srcOff, srcOff + w * 4), dstOff)
  }

  storeRasterData(layer.imageChunkId, cropped)

  store.updateLayer(artboardId, layerId, {
    width: w,
    height: h,
    transform: { ...t, x: t.x + x0 * sx, y: t.y + y0 * sy },
  } as Partial<RasterLayer>)
}

// ---------------------------------------------------------------------------
// Legacy API (kept for backwards compat)
// ---------------------------------------------------------------------------

export function applyCrop(artboardId: string, layerId: string, region: CropRegion) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer = artboard.layers.find((l) => l.id === layerId) as RasterLayer | undefined
  if (!layer || layer.type !== 'raster') return

  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return

  const x = Math.max(0, Math.round(region.x))
  const y = Math.max(0, Math.round(region.y))
  const w = Math.min(imageData.width - x, Math.round(region.width))
  const h = Math.min(imageData.height - y, Math.round(region.height))
  if (w <= 0 || h <= 0) return

  const cropped = new ImageData(w, h)
  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * imageData.width + x) * 4
    const dstOffset = row * w * 4
    cropped.data.set(imageData.data.subarray(srcOffset, srcOffset + w * 4), dstOffset)
  }

  storeRasterData(layer.imageChunkId, cropped)

  store.updateLayer(artboardId, layerId, {
    width: w,
    height: h,
    transform: {
      ...layer.transform,
      x: layer.transform.x + x * layer.transform.scaleX,
      y: layer.transform.y + y * layer.transform.scaleY,
    },
  } as Partial<RasterLayer>)
}

export function setCropRegion(artboardId: string, layerId: string, region: CropRegion) {
  const store = useEditorStore.getState()
  store.updateLayer(artboardId, layerId, { cropRegion: region } as Partial<RasterLayer>)
}

export function clearCropRegion(artboardId: string, layerId: string) {
  const store = useEditorStore.getState()
  store.updateLayer(artboardId, layerId, { cropRegion: undefined } as Partial<RasterLayer>)
}

export function getEffectiveDimensions(layer: RasterLayer): { width: number; height: number } {
  if (layer.cropRegion) {
    return { width: layer.cropRegion.width, height: layer.cropRegion.height }
  }
  return { width: layer.width, height: layer.height }
}
