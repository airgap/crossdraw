import { useEditorStore } from '@/store/editor.store'
import type { Point } from '@/math/viewport'
import { pathBBox, mergeBBox, getLayerBBox, type BBox } from '@/math/bbox'
import type { Transform, Layer } from '@/types'
import { snapBBox, snapPoint } from '@/tools/snap'

export type HandleType = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'rotation' | 'body'

interface MultiTransformEntry {
  layerId: string
  originalTransform: Transform
  /** Area text reflows (textWidth/textHeight) instead of scaling. */
  isAreaText?: boolean
  originalTextWidth?: number
  originalTextHeight?: number
}

interface DragState {
  handle: HandleType
  layerId: string
  artboardId: string
  startDocPoint: Point
  originalTransform: Transform
  localBBox: BBox
  /** Text layer: reflow instead of scaling */
  isTextLayer: boolean
  originalTextWidth?: number
  originalTextHeight?: number
  originalTextMode?: 'point' | 'area'
  /** Additional layers being transformed together (multi-select). */
  extraLayers?: MultiTransformEntry[]
  /** Combined world bbox at drag start — only set for multi-layer transforms. */
  combinedWorldBBox?: BBox
  /** Artboard origin captured at drag start — for converting world↔local coords. */
  artboardOrigin?: { x: number; y: number }
}

let drag: DragState | null = null

export function isTransformDragging(): boolean {
  return drag !== null
}

function computeLocalBBox(layer: Layer, artboard: { x: number; y: number }): BBox {
  switch (layer.type) {
    case 'vector': {
      let bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      for (const path of layer.paths) {
        bbox = mergeBBox(bbox, pathBBox(path.segments))
      }
      return bbox
    }
    case 'raster':
      return { minX: 0, minY: 0, maxX: layer.width, maxY: layer.height }
    case 'text': {
      // Area text: use textWidth/textHeight for the local bbox
      if (layer.textMode === 'area' && layer.textWidth != null && layer.textWidth > 0) {
        const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
        const lines = layer.text.split('\n')
        const h = layer.textHeight ?? lines.length * lineH
        return { minX: 0, minY: 0, maxX: layer.textWidth, maxY: h }
      }
      // Point text: measure with a temp canvas for accuracy
      const lines = layer.text.split('\n')
      const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
      let maxLineWidth = 0
      try {
        const canvas = new OffscreenCanvas(1, 1)
        const mctx = canvas.getContext('2d')!
        const style = layer.fontStyle === 'italic' ? 'italic ' : ''
        const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
        mctx.font = `${style}${weight}${layer.fontSize}px ${layer.fontFamily}`
        for (const line of lines) {
          maxLineWidth = Math.max(maxLineWidth, mctx.measureText(line).width)
        }
      } catch {
        // Fallback: rough estimation
        for (const line of lines) {
          maxLineWidth = Math.max(maxLineWidth, layer.fontSize * line.length * 0.6)
        }
      }
      return { minX: 0, minY: 0, maxX: maxLineWidth, maxY: lines.length * lineH }
    }
    case 'group': {
      // Fall back to world bbox minus artboard offset and layer transform
      const worldBBox = getLayerBBox(layer, artboard as any)
      if (worldBBox.minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      const t = layer.transform
      const sx = t.scaleX || 1
      const sy = t.scaleY || 1
      return {
        minX: (worldBBox.minX - artboard.x - t.x) / sx,
        minY: (worldBBox.minY - artboard.y - t.y) / sy,
        maxX: (worldBBox.maxX - artboard.x - t.x) / sx,
        maxY: (worldBBox.maxY - artboard.y - t.y) / sy,
      }
    }
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
}

export function getHandlePositions(bbox: BBox, zoom: number) {
  const cx = (bbox.minX + bbox.maxX) / 2
  const cy = (bbox.minY + bbox.maxY) / 2
  const rotOffset = 25 / zoom
  return {
    nw: { x: bbox.minX, y: bbox.minY },
    n: { x: cx, y: bbox.minY },
    ne: { x: bbox.maxX, y: bbox.minY },
    w: { x: bbox.minX, y: cy },
    e: { x: bbox.maxX, y: cy },
    sw: { x: bbox.minX, y: bbox.maxY },
    s: { x: cx, y: bbox.maxY },
    se: { x: bbox.maxX, y: bbox.maxY },
    rotation: { x: cx, y: bbox.minY - rotOffset },
  }
}

export function hitTestHandles(docPoint: Point, bbox: BBox, zoom: number, touchMode = false): HandleType | null {
  const handles = getHandlePositions(bbox, zoom)
  const radius = (touchMode ? 14 : 8) / zoom
  const r2 = radius * radius

  const order: Exclude<HandleType, 'body'>[] = ['rotation', 'nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e']

  for (const type of order) {
    const h = handles[type]
    const dx = docPoint.x - h.x
    const dy = docPoint.y - h.y
    if (dx * dx + dy * dy <= r2) return type
  }

  if (docPoint.x >= bbox.minX && docPoint.x <= bbox.maxX && docPoint.y >= bbox.minY && docPoint.y <= bbox.maxY) {
    return 'body'
  }

  return null
}

export function beginTransform(
  handle: HandleType,
  docPoint: Point,
  layerId: string,
  artboardId: string,
  extraLayerIds?: string[],
) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = findLayerDeepLocal(artboard.layers, layerId)
  if (!layer) return
  // Skip layer types that shouldn't be individually transformed
  if (layer.type === 'adjustment' || layer.type === 'filter' || layer.type === 'fill') return

  const isText = layer.type === 'text'
  let extraLayers: DragState['extraLayers']
  let combinedWorldBBox: BBox | undefined
  let artboardOrigin: { x: number; y: number } | undefined
  if (extraLayerIds && extraLayerIds.length > 0) {
    extraLayers = []
    for (const id of extraLayerIds) {
      if (id === layerId) continue
      const extra = findLayerDeepLocal(artboard.layers, id)
      if (!extra) continue
      if (extra.type === 'adjustment' || extra.type === 'filter' || extra.type === 'fill') continue
      const entry: MultiTransformEntry = { layerId: id, originalTransform: { ...extra.transform } }
      if (extra.type === 'text' && extra.textMode === 'area' && extra.textWidth != null && extra.textWidth > 0) {
        entry.isAreaText = true
        entry.originalTextWidth = extra.textWidth
        const lineH = extra.fontSize * (extra.lineHeight ?? 1.4)
        entry.originalTextHeight = extra.textHeight ?? extra.text.split('\n').length * lineH
      }
      extraLayers.push(entry)
    }
    // Compute combined world bbox (primary + all extras), used by resize/rotate handles.
    let mnX = Infinity,
      mnY = Infinity,
      mxX = -Infinity,
      mxY = -Infinity
    for (const id of [layerId, ...extraLayers.map((e) => e.layerId)]) {
      const ll = findLayerDeepLocal(artboard.layers, id)
      if (!ll) continue
      const wb = getLayerBBox(ll, artboard)
      if (wb.minX === Infinity) continue
      if (wb.minX < mnX) mnX = wb.minX
      if (wb.minY < mnY) mnY = wb.minY
      if (wb.maxX > mxX) mxX = wb.maxX
      if (wb.maxY > mxY) mxY = wb.maxY
    }
    if (mnX !== Infinity) {
      combinedWorldBBox = { minX: mnX, minY: mnY, maxX: mxX, maxY: mxY }
      artboardOrigin = { x: artboard.x, y: artboard.y }
    }
  }
  drag = {
    handle,
    layerId,
    artboardId,
    startDocPoint: { ...docPoint },
    originalTransform: { ...layer.transform },
    localBBox: computeLocalBBox(layer, artboard),
    isTextLayer: isText,
    originalTextWidth: isText ? layer.textWidth : undefined,
    originalTextHeight: isText ? layer.textHeight : undefined,
    originalTextMode: isText ? layer.textMode : undefined,
    extraLayers,
    combinedWorldBBox,
    artboardOrigin,
  }
}

// Local recursive layer lookup (descends into groups).
function findLayerDeepLocal(layers: Layer[], id: string): Layer | undefined {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const found = findLayerDeepLocal(l.children, id)
      if (found) return found
    }
  }
  return undefined
}

/** Maps a resize-handle key to the combined-bbox anchor and drag direction. */
const MULTI_SCALE_CFG: Record<
  string,
  { ax: 'min' | 'max' | 'mid'; ay: 'min' | 'max' | 'mid'; dragX: number; dragY: number }
> = {
  se: { ax: 'min', ay: 'min', dragX: 1, dragY: 1 },
  nw: { ax: 'max', ay: 'max', dragX: -1, dragY: -1 },
  ne: { ax: 'min', ay: 'max', dragX: 1, dragY: -1 },
  sw: { ax: 'max', ay: 'min', dragX: -1, dragY: 1 },
  e: { ax: 'min', ay: 'mid', dragX: 1, dragY: 0 },
  w: { ax: 'max', ay: 'mid', dragX: -1, dragY: 0 },
  n: { ax: 'mid', ay: 'max', dragX: 0, dragY: -1 },
  s: { ax: 'mid', ay: 'min', dragX: 0, dragY: 1 },
}

/** Apply scale, rotation, or skew to all layers in a multi-select transform, around the combined bbox. */
function applyMultiLayerTransform(
  d: DragState,
  docPoint: Point,
  deltaX: number,
  deltaY: number,
  shiftKey: boolean,
  skewMode: boolean,
) {
  const store = useEditorStore.getState()
  const cw = d.combinedWorldBBox!
  const ao = d.artboardOrigin!
  const primary: MultiTransformEntry = {
    layerId: d.layerId,
    originalTransform: d.originalTransform,
    isAreaText: d.isTextLayer && d.originalTextMode === 'area' && d.originalTextWidth != null,
    originalTextWidth: d.originalTextWidth,
    originalTextHeight: d.originalTextHeight ?? (d.isTextLayer ? d.localBBox.maxY - d.localBBox.minY : undefined),
  }
  const entries: MultiTransformEntry[] = [primary, ...(d.extraLayers ?? [])]
  const combinedW = cw.maxX - cw.minX
  const combinedH = cw.maxY - cw.minY

  if (d.handle === 'rotation') {
    store.setActiveSnapLines(null)
    const cx = (cw.minX + cw.maxX) / 2
    const cy = (cw.minY + cw.maxY) / 2
    const startAngle = Math.atan2(d.startDocPoint.y - cy, d.startDocPoint.x - cx)
    const curAngle = Math.atan2(docPoint.y - cy, docPoint.x - cx)
    let deltaDeg = ((curAngle - startAngle) * 180) / Math.PI
    if (shiftKey) deltaDeg = Math.round(deltaDeg / 15) * 15
    const rad = (deltaDeg * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)

    const items = entries.map((e) => {
      const o = e.originalTransform
      const wx = ao.x + o.x
      const wy = ao.y + o.y
      const rx = wx - cx
      const ry = wy - cy
      const newWx = cx + rx * cos - ry * sin
      const newWy = cy + rx * sin + ry * cos
      return {
        layerId: e.layerId,
        updates: {
          transform: { ...o, x: newWx - ao.x, y: newWy - ao.y, rotation: o.rotation + deltaDeg },
        } as Partial<Layer>,
      }
    })
    store.updateLayersBatchSilent(d.artboardId, items)
    return
  }

  // Skew: shear all layers about the opposite edge of the combined bbox.
  if (skewMode && (d.handle === 'n' || d.handle === 's' || d.handle === 'e' || d.handle === 'w')) {
    store.setActiveSnapLines(null)
    const horizontal = d.handle === 'n' || d.handle === 's'
    if ((horizontal && combinedH <= 0.001) || (!horizontal && combinedW <= 0.001)) return

    // World shear factor K such that the dragged edge follows the cursor and the
    // opposite (anchor) edge stays fixed: x' = x + K·(y − anchorY) (or transposed).
    let K: number
    let anchor: number
    if (d.handle === 'n') {
      K = -deltaX / combinedH
      anchor = cw.maxY
    } else if (d.handle === 's') {
      K = deltaX / combinedH
      anchor = cw.minY
    } else if (d.handle === 'e') {
      K = deltaY / combinedW
      anchor = cw.minX
    } else {
      K = -deltaY / combinedW
      anchor = cw.maxX
    }

    const items = entries.map((e) => {
      const o = e.originalTransform
      const wx = ao.x + o.x
      const wy = ao.y + o.y
      const sxr = o.scaleX || 1
      const syr = o.scaleY || 1
      if (horizontal) {
        // Content shear in layer-local coords: tan(a)·scaleX/scaleY must match world K.
        const aDeg = (Math.atan(K * (syr / sxr)) * 180) / Math.PI
        return {
          layerId: e.layerId,
          updates: {
            transform: { ...o, x: wx + K * (wy - anchor) - ao.x, skewX: (o.skewX ?? 0) + aDeg },
          } as Partial<Layer>,
        }
      }
      const bDeg = (Math.atan(K * (sxr / syr)) * 180) / Math.PI
      return {
        layerId: e.layerId,
        updates: {
          transform: { ...o, y: wy + K * (wx - anchor) - ao.y, skewY: (o.skewY ?? 0) + bDeg },
        } as Partial<Layer>,
      }
    })
    store.updateLayersBatchSilent(d.artboardId, items)
    return
  }

  const cfg = MULTI_SCALE_CFG[d.handle]
  if (!cfg) return

  const ax = cfg.ax === 'min' ? cw.minX : cfg.ax === 'max' ? cw.maxX : (cw.minX + cw.maxX) / 2
  const ay = cfg.ay === 'min' ? cw.minY : cfg.ay === 'max' ? cw.maxY : (cw.minY + cw.maxY) / 2

  let sx = 1
  let sy = 1
  if (cfg.dragX !== 0 && combinedW > 0.001) {
    sx = 1 + (cfg.dragX * deltaX) / combinedW
    if (Math.abs(sx) < 0.01) sx = 0.01 * Math.sign(sx || 1)
  }
  if (cfg.dragY !== 0 && combinedH > 0.001) {
    sy = 1 + (cfg.dragY * deltaY) / combinedH
    if (Math.abs(sy) < 0.01) sy = 0.01 * Math.sign(sy || 1)
  }

  // Shift on a corner = lock aspect ratio
  const isCorner = d.handle === 'nw' || d.handle === 'ne' || d.handle === 'sw' || d.handle === 'se'
  if (shiftKey && isCorner) {
    const m = Math.max(Math.abs(sx), Math.abs(sy))
    sx = m * Math.sign(sx || 1)
    sy = m * Math.sign(sy || 1)
  }

  // Snap the moving edge/corner of the combined bbox to guides/grid/artboard edges.
  const allIds = entries.map((e) => e.layerId)
  const movingX = cfg.dragX === 1 ? cw.maxX : cfg.dragX === -1 ? cw.minX : null
  const movingY = cfg.dragY === 1 ? cw.maxY : cfg.dragY === -1 ? cw.minY : null
  const snapDocX = movingX !== null ? ax + (movingX - ax) * sx : null
  const snapDocY = movingY !== null ? ay + (movingY - ay) * sy : null
  const snap = snapPoint(snapDocX ?? docPoint.x, snapDocY ?? docPoint.y, allIds)
  if (snap.x !== null && movingX !== null && Math.abs(movingX - ax) > 0.001) {
    const snapped = (snap.x - ax) / (movingX - ax)
    if (Math.abs(snapped) >= 0.01) sx = snapped
  }
  if (snap.y !== null && movingY !== null && Math.abs(movingY - ay) > 0.001) {
    const snapped = (snap.y - ay) / (movingY - ay)
    if (Math.abs(snapped) >= 0.01) sy = snapped
  }
  store.setActiveSnapLines({ h: snap.snapLinesH, v: snap.snapLinesV })

  const items = entries.map((e) => {
    const o = e.originalTransform
    const wx = ao.x + o.x
    const wy = ao.y + o.y
    const newWx = ax + (wx - ax) * sx
    const newWy = ay + (wy - ay) * sy
    if (e.isAreaText && e.originalTextWidth != null) {
      // Area text reflows: convert the scale into textWidth/textHeight, keep scaleX/scaleY.
      return {
        layerId: e.layerId,
        updates: {
          transform: { ...o, x: newWx - ao.x, y: newWy - ao.y },
          textMode: 'area',
          textWidth: Math.max(20, e.originalTextWidth * Math.abs(sx)),
          textHeight: Math.max(10, (e.originalTextHeight ?? 100) * Math.abs(sy)),
        } as Partial<Layer>,
      }
    }
    return {
      layerId: e.layerId,
      updates: {
        transform: { ...o, x: newWx - ao.x, y: newWy - ao.y, scaleX: o.scaleX * sx, scaleY: o.scaleY * sy },
      } as Partial<Layer>,
    }
  })
  store.updateLayersBatchSilent(d.artboardId, items)
}

export function updateTransform(docPoint: Point, shiftKey = false, skewMode = false) {
  const d = drag
  if (!d) return

  const deltaX = docPoint.x - d.startDocPoint.x
  const deltaY = docPoint.y - d.startDocPoint.y
  const orig = d.originalTransform
  const lb = d.localBBox
  const localW = lb.maxX - lb.minX
  const localH = lb.maxY - lb.minY

  // Multi-layer scale / rotate / skew around the combined bbox.
  // 'body' still uses the existing single-translation path (which already supports extraLayers).
  if (d.extraLayers && d.extraLayers.length > 0 && d.handle !== 'body' && d.combinedWorldBBox && d.artboardOrigin) {
    applyMultiLayerTransform(d, docPoint, deltaX, deltaY, shiftKey, skewMode)
    return
  }

  const t: Transform = { ...orig }

  if (d.handle === 'body') {
    // Get the world bounding box for snap calculations — the combined bbox for
    // multi-select drags, the single layer's bbox otherwise.
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
    const allDraggedIds = [d.layerId, ...(d.extraLayers?.map((e) => e.layerId) ?? [])]
    let snappedDx = deltaX
    let snappedDy = deltaY
    if (d.extraLayers && d.extraLayers.length > 0 && d.combinedWorldBBox) {
      // combinedWorldBBox was captured at drag start, so it already reflects original positions.
      const snapResult = snapBBox(d.combinedWorldBBox, deltaX, deltaY, allDraggedIds)
      snappedDx = snapResult.dx
      snappedDy = snapResult.dy
      store.setActiveSnapLines({
        h: snapResult.snapLinesH,
        v: snapResult.snapLinesV,
      })
    } else if (artboard) {
      const layer = findLayerDeepLocal(artboard.layers, d.layerId)
      if (layer) {
        const layerBBox = getLayerBBox(layer, artboard)
        if (layerBBox.minX !== Infinity) {
          const origBBox: BBox = {
            minX: layerBBox.minX - (layer.transform.x - orig.x),
            minY: layerBBox.minY - (layer.transform.y - orig.y),
            maxX: layerBBox.maxX - (layer.transform.x - orig.x),
            maxY: layerBBox.maxY - (layer.transform.y - orig.y),
          }
          const snapResult = snapBBox(origBBox, deltaX, deltaY, allDraggedIds)
          snappedDx = snapResult.dx
          snappedDy = snapResult.dy
          store.setActiveSnapLines({
            h: snapResult.snapLinesH,
            v: snapResult.snapLinesV,
          })
        } else {
          store.setActiveSnapLines(null)
        }
      }
    }
    t.x = orig.x + snappedDx
    t.y = orig.y + snappedDy

    if (d.extraLayers && d.extraLayers.length > 0) {
      // Apply the same delta to each extra layer in a single silent batch update.
      const updates = [
        { layerId: d.layerId, transform: t },
        ...d.extraLayers.map((e) => ({
          layerId: e.layerId,
          transform: {
            ...e.originalTransform,
            x: e.originalTransform.x + snappedDx,
            y: e.originalTransform.y + snappedDy,
          },
        })),
      ]
      useEditorStore.getState().translateLayersBatchSilent(d.artboardId, updates)
      return
    }
  } else if (d.handle === 'rotation') {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
    if (!artboard) return

    const centerX = artboard.x + orig.x + ((lb.minX + lb.maxX) / 2) * orig.scaleX
    const centerY = artboard.y + orig.y + ((lb.minY + lb.maxY) / 2) * orig.scaleY

    const startAngle = Math.atan2(d.startDocPoint.y - centerY, d.startDocPoint.x - centerX)
    const curAngle = Math.atan2(docPoint.y - centerY, docPoint.x - centerX)
    let rotation = orig.rotation + (curAngle - startAngle) * (180 / Math.PI)

    // Shift constrains to 15° increments
    if (shiftKey) {
      rotation = Math.round(rotation / 15) * 15
    }
    t.rotation = rotation
  } else if (skewMode && (d.handle === 'n' || d.handle === 's' || d.handle === 'e' || d.handle === 'w')) {
    // Skew via edge handles (Ctrl/Cmd+drag): shear so the dragged edge follows
    // the cursor and the opposite edge stays fixed.
    useEditorStore.getState().setActiveSnapLines(null)
    if (d.handle === 'n' || d.handle === 's') {
      const denom = (orig.scaleX || 1) * localH
      if (Math.abs(denom) > 0.001) {
        // Content shear in local coords: world x-offset(y_local) = scaleX·tan(a)·y_local.
        const k = (d.handle === 'n' ? -deltaX : deltaX) / denom
        t.skewX = (orig.skewX ?? 0) + (Math.atan(k) * 180) / Math.PI
        const anchorLocalY = d.handle === 'n' ? lb.maxY : lb.minY
        t.x = orig.x - (orig.scaleX || 1) * k * anchorLocalY
      }
    } else {
      const denom = (orig.scaleY || 1) * localW
      if (Math.abs(denom) > 0.001) {
        const k = (d.handle === 'w' ? -deltaY : deltaY) / denom
        t.skewY = (orig.skewY ?? 0) + (Math.atan(k) * 180) / Math.PI
        const anchorLocalX = d.handle === 'e' ? lb.minX : lb.maxX
        t.y = orig.y - (orig.scaleY || 1) * k * anchorLocalX
      }
    }
  } else if (d.isTextLayer && d.originalTextMode === 'area') {
    // Area text: resize changes textWidth/textHeight for reflow, not scaleX/scaleY
    const cfg = scaleConfigs[d.handle]
    if (!cfg) return

    // Compute what scaleX/scaleY would be (same math as non-text)
    let newScaleX = orig.scaleX
    let newScaleY = orig.scaleY
    if (localW > 0.001 && cfg.sx !== 0) {
      newScaleX = orig.scaleX + (cfg.sx * deltaX) / localW
      if (Math.abs(newScaleX) < 0.01) newScaleX = 0.01 * Math.sign(newScaleX || 1)
      t.x = orig.x + cfg.anchorX(lb) * (orig.scaleX - newScaleX)
    }
    if (localH > 0.001 && cfg.sy !== 0) {
      newScaleY = orig.scaleY + (cfg.sy * deltaY) / localH
      if (Math.abs(newScaleY) < 0.01) newScaleY = 0.01 * Math.sign(newScaleY || 1)
      t.y = orig.y + cfg.anchorY(lb) * (orig.scaleY - newScaleY)
    }

    // Convert scale into textWidth/textHeight — keep scaleX/scaleY at 1
    const newTextWidth = Math.max(20, localW * Math.abs(newScaleX))
    const newTextHeight = Math.max(10, localH * Math.abs(newScaleY))
    t.scaleX = 1
    t.scaleY = 1

    useEditorStore.getState().updateLayerSilent(d.artboardId, d.layerId, {
      transform: t,
      textMode: 'area',
      textWidth: newTextWidth,
      textHeight: newTextHeight,
    } as Partial<Layer>)
    return
  } else {
    const cfg = scaleConfigs[d.handle]
    if (!cfg) return

    // Corner handles with shift: lock aspect ratio
    const isCorner = ['nw', 'ne', 'sw', 'se'].includes(d.handle)

    if (localW > 0.001 && cfg.sx !== 0) {
      t.scaleX = orig.scaleX + (cfg.sx * deltaX) / localW
      if (Math.abs(t.scaleX) < 0.01) t.scaleX = 0.01 * Math.sign(t.scaleX || 1)
      t.x = orig.x + cfg.anchorX(lb) * (orig.scaleX - t.scaleX)
    }

    if (localH > 0.001 && cfg.sy !== 0) {
      t.scaleY = orig.scaleY + (cfg.sy * deltaY) / localH
      if (Math.abs(t.scaleY) < 0.01) t.scaleY = 0.01 * Math.sign(t.scaleY || 1)
      t.y = orig.y + cfg.anchorY(lb) * (orig.scaleY - t.scaleY)
    }

    // Aspect ratio lock: match scaleY to scaleX ratio
    if (shiftKey && isCorner && localW > 0.001 && localH > 0.001) {
      const ratio = orig.scaleY / orig.scaleX
      t.scaleY = t.scaleX * ratio
      if (Math.abs(t.scaleY) < 0.01) t.scaleY = 0.01 * Math.sign(t.scaleY || 1)
      t.y = orig.y + cfg.anchorY(lb) * (orig.scaleY - t.scaleY)
    }

    // Snap the dragged edge/corner to guides/grid/artboard edges
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
    if (artboard) {
      // The dragged point in document space: the edge opposite the anchor
      // For sx=1 (dragging right), the moving edge is maxX; for sx=-1 (dragging left), it's minX
      const movingLocalX = cfg.sx === 1 ? lb.maxX : cfg.sx === -1 ? lb.minX : null
      const movingLocalY = cfg.sy === 1 ? lb.maxY : cfg.sy === -1 ? lb.minY : null

      const snapDocX = movingLocalX !== null ? artboard.x + t.x + movingLocalX * t.scaleX : null
      const snapDocY = movingLocalY !== null ? artboard.y + t.y + movingLocalY * t.scaleY : null

      const snap = snapPoint(snapDocX ?? docPoint.x, snapDocY ?? docPoint.y, [d.layerId])

      if (snap.x !== null && movingLocalX !== null) {
        // Solve for newScaleX given snap target:
        // snap.x = artboard.x + orig.x + anchorX * orig.scaleX + newScaleX * (movingLocalX - anchorX)
        const anchorX = cfg.anchorX(lb)
        const denom = movingLocalX - anchorX
        if (Math.abs(denom) > 0.001) {
          const newScaleX = (snap.x - artboard.x - orig.x - anchorX * orig.scaleX) / denom
          if (Math.abs(newScaleX) >= 0.01) {
            t.scaleX = newScaleX
            t.x = orig.x + anchorX * (orig.scaleX - t.scaleX)
          }
        }
      }
      if (snap.y !== null && movingLocalY !== null) {
        const anchorY = cfg.anchorY(lb)
        const denom = movingLocalY - anchorY
        if (Math.abs(denom) > 0.001) {
          const newScaleY = (snap.y - artboard.y - orig.y - anchorY * orig.scaleY) / denom
          if (Math.abs(newScaleY) >= 0.01) {
            t.scaleY = newScaleY
            t.y = orig.y + anchorY * (orig.scaleY - t.scaleY)
          }
        }
      }

      store.setActiveSnapLines({
        h: snap.snapLinesH,
        v: snap.snapLinesV,
      })
    }
  }

  useEditorStore.getState().updateLayerSilent(d.artboardId, d.layerId, { transform: t })
}

interface ScaleConfig {
  sx: number
  sy: number
  anchorX: (b: BBox) => number
  anchorY: (b: BBox) => number
}

const scaleConfigs: Partial<Record<HandleType, ScaleConfig>> = {
  se: { sx: 1, sy: 1, anchorX: (b) => b.minX, anchorY: (b) => b.minY },
  nw: { sx: -1, sy: -1, anchorX: (b) => b.maxX, anchorY: (b) => b.maxY },
  ne: { sx: 1, sy: -1, anchorX: (b) => b.minX, anchorY: (b) => b.maxY },
  sw: { sx: -1, sy: 1, anchorX: (b) => b.maxX, anchorY: (b) => b.minY },
  e: { sx: 1, sy: 0, anchorX: (b) => b.minX, anchorY: () => 0 },
  w: { sx: -1, sy: 0, anchorX: (b) => b.maxX, anchorY: () => 0 },
  s: { sx: 0, sy: 1, anchorX: () => 0, anchorY: (b) => b.minY },
  n: { sx: 0, sy: -1, anchorX: () => 0, anchorY: (b) => b.maxY },
}

export function endTransform() {
  const d = drag
  if (!d) return

  const store = useEditorStore.getState()
  store.setActiveSnapLines(null)

  const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
  if (!artboard) {
    drag = null
    return
  }
  const layer = findLayerDeepLocal(artboard.layers, d.layerId)
  if (!layer) {
    drag = null
    return
  }

  // Multi-layer transform (body / scale / rotate / skew): restore all silently, commit in one undo entry.
  if (d.extraLayers && d.extraLayers.length > 0) {
    const ct = layer.transform
    const ot = d.originalTransform
    const moved =
      ct.x !== ot.x ||
      ct.y !== ot.y ||
      ct.scaleX !== ot.scaleX ||
      ct.scaleY !== ot.scaleY ||
      ct.rotation !== ot.rotation ||
      (ct.skewX ?? 0) !== (ot.skewX ?? 0) ||
      (ct.skewY ?? 0) !== (ot.skewY ?? 0) ||
      (layer.type === 'text' && (layer.textWidth !== d.originalTextWidth || layer.textHeight !== d.originalTextHeight))
    if (!moved) {
      drag = null
      return
    }

    // Capture current (dragged) state per layer, including text reflow fields.
    const finalItems: Array<{ layerId: string; updates: Partial<Layer> }> = []
    for (const id of [d.layerId, ...d.extraLayers.map((e) => e.layerId)]) {
      const cur = findLayerDeepLocal(artboard.layers, id)
      if (!cur) continue
      const updates: Partial<Layer> = { transform: { ...cur.transform } }
      if (cur.type === 'text' && cur.textMode === 'area') {
        Object.assign(updates, { textMode: 'area', textWidth: cur.textWidth, textHeight: cur.textHeight })
      }
      finalItems.push({ layerId: id, updates })
    }

    const restoreItems: Array<{ layerId: string; updates: Partial<Layer> }> = [
      {
        layerId: d.layerId,
        updates: d.isTextLayer
          ? ({
              transform: { ...d.originalTransform },
              textMode: d.originalTextMode,
              textWidth: d.originalTextWidth,
              textHeight: d.originalTextHeight,
            } as Partial<Layer>)
          : { transform: { ...d.originalTransform } },
      },
      ...d.extraLayers.map((e) => ({
        layerId: e.layerId,
        updates: e.isAreaText
          ? ({
              transform: { ...e.originalTransform },
              textWidth: e.originalTextWidth,
              textHeight: e.originalTextHeight,
            } as Partial<Layer>)
          : { transform: { ...e.originalTransform } },
      })),
    ]
    store.updateLayersBatchSilent(d.artboardId, restoreItems)
    store.updateLayersBatch(d.artboardId, finalItems, `Transform ${finalItems.length} layers`)
    drag = null
    return
  }

  const finalTransform = { ...layer.transform }

  // Single-layer body drag with no movement (eg. click-without-drag to select a layer):
  // skip the redundant commit so we don't create a no-op undo entry.
  if (d.handle === 'body') {
    const moved = finalTransform.x !== d.originalTransform.x || finalTransform.y !== d.originalTransform.y
    if (!moved) {
      drag = null
      return
    }
  }

  if (d.isTextLayer && d.originalTextMode === 'area' && layer.type === 'text') {
    // Area text: capture final text reflow state
    const finalUpdates: Partial<Layer> = {
      transform: finalTransform,
      textMode: layer.textMode,
      textWidth: layer.textWidth,
      textHeight: layer.textHeight,
    } as Partial<Layer>

    // Restore original silently, then commit final with undo entry
    store.updateLayerSilent(d.artboardId, d.layerId, {
      transform: { ...d.originalTransform },
      textMode: d.originalTextMode,
      textWidth: d.originalTextWidth,
      textHeight: d.originalTextHeight,
    } as Partial<Layer>)
    store.updateLayer(d.artboardId, d.layerId, finalUpdates)
  } else {
    // Restore original silently, then commit final with undo entry
    store.updateLayerSilent(d.artboardId, d.layerId, { transform: { ...d.originalTransform } })
    store.updateLayer(d.artboardId, d.layerId, { transform: finalTransform })
  }

  drag = null
}

export function cancelTransform() {
  const d = drag
  if (!d) return
  const store = useEditorStore.getState()
  store.setActiveSnapLines(null)
  if (d.extraLayers && d.extraLayers.length > 0) {
    const restoreItems: Array<{ layerId: string; updates: Partial<Layer> }> = [
      {
        layerId: d.layerId,
        updates: d.isTextLayer
          ? ({
              transform: { ...d.originalTransform },
              textMode: d.originalTextMode,
              textWidth: d.originalTextWidth,
              textHeight: d.originalTextHeight,
            } as Partial<Layer>)
          : { transform: { ...d.originalTransform } },
      },
      ...d.extraLayers.map((e) => ({
        layerId: e.layerId,
        updates: e.isAreaText
          ? ({
              transform: { ...e.originalTransform },
              textWidth: e.originalTextWidth,
              textHeight: e.originalTextHeight,
            } as Partial<Layer>)
          : { transform: { ...e.originalTransform } },
      })),
    ]
    store.updateLayersBatchSilent(d.artboardId, restoreItems)
    drag = null
    return
  }
  if (d.isTextLayer) {
    store.updateLayerSilent(d.artboardId, d.layerId, {
      transform: { ...d.originalTransform },
      textMode: d.originalTextMode,
      textWidth: d.originalTextWidth,
      textHeight: d.originalTextHeight,
    } as Partial<Layer>)
  } else {
    store.updateLayerSilent(d.artboardId, d.layerId, {
      transform: { ...d.originalTransform },
    })
  }
  drag = null
}

export function getHandleCursor(handle: HandleType | null): string {
  if (!handle) return 'default'
  const cursors: Record<HandleType, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    rotation: 'crosshair',
    body: 'move',
  }
  return cursors[handle]
}
