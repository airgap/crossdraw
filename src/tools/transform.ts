import { useEditorStore } from '@/store/editor.store'
import type { Point } from '@/math/viewport'
import { pathBBox, mergeBBox, getLayerBBox, type BBox } from '@/math/bbox'
import type { Transform, Layer } from '@/types'
import { snapBBox, snapPoint } from '@/tools/snap'

export type HandleType = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'rotation' | 'body'

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

export function beginTransform(handle: HandleType, docPoint: Point, layerId: string, artboardId: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer) return
  // Skip layer types that shouldn't be individually transformed
  if (layer.type === 'adjustment' || layer.type === 'filter' || layer.type === 'fill') return

  const isText = layer.type === 'text'
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
  }
}

export function updateTransform(docPoint: Point, shiftKey = false) {
  const d = drag
  if (!d) return

  const deltaX = docPoint.x - d.startDocPoint.x
  const deltaY = docPoint.y - d.startDocPoint.y
  const orig = d.originalTransform
  const lb = d.localBBox
  const localW = lb.maxX - lb.minX
  const localH = lb.maxY - lb.minY

  const t: Transform = { ...orig }

  if (d.handle === 'body') {
    // Get the layer's world bounding box for snap calculations
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === d.artboardId)
    if (artboard) {
      const layer = artboard.layers.find((l) => l.id === d.layerId)
      if (layer) {
        const layerBBox = getLayerBBox(layer, artboard)
        if (layerBBox.minX !== Infinity) {
          // snapBBox takes the original bbox (before this drag) and raw deltas
          const origBBox: BBox = {
            minX: layerBBox.minX - (layer.transform.x - orig.x),
            minY: layerBBox.minY - (layer.transform.y - orig.y),
            maxX: layerBBox.maxX - (layer.transform.x - orig.x),
            maxY: layerBBox.maxY - (layer.transform.y - orig.y),
          }
          const snapResult = snapBBox(origBBox, deltaX, deltaY, [d.layerId])
          t.x = orig.x + snapResult.dx
          t.y = orig.y + snapResult.dy
          store.setActiveSnapLines({
            h: snapResult.snapLinesH,
            v: snapResult.snapLinesV,
          })
        } else {
          t.x = orig.x + deltaX
          t.y = orig.y + deltaY
          store.setActiveSnapLines(null)
        }
      } else {
        t.x = orig.x + deltaX
        t.y = orig.y + deltaY
      }
    } else {
      t.x = orig.x + deltaX
      t.y = orig.y + deltaY
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
  const layer = artboard.layers.find((l) => l.id === d.layerId)
  if (!layer) {
    drag = null
    return
  }

  const finalTransform = { ...layer.transform }

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
