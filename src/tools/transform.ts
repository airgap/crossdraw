import { useEditorStore } from '@/store/editor.store'
import type { Point } from '@/math/viewport'
import { pathBBox, mergeBBox, getLayerBBox, type BBox } from '@/math/bbox'
import type { Transform, VectorLayer } from '@/types'
import { snapBBox } from '@/tools/snap'

export type HandleType = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se' | 'rotation' | 'body'

interface DragState {
  handle: HandleType
  layerId: string
  artboardId: string
  startDocPoint: Point
  originalTransform: Transform
  localBBox: BBox
}

let drag: DragState | null = null

export function isTransformDragging(): boolean {
  return drag !== null
}

function computeLocalBBox(layer: VectorLayer): BBox {
  let bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const path of layer.paths) {
    bbox = mergeBBox(bbox, pathBBox(path.segments))
  }
  return bbox
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

export function hitTestHandles(docPoint: Point, bbox: BBox, zoom: number): HandleType | null {
  const handles = getHandlePositions(bbox, zoom)
  const radius = Math.min(10, Math.max(4, 6 / zoom))
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
  if (!layer || layer.type !== 'vector') return

  drag = {
    handle,
    layerId,
    artboardId,
    startDocPoint: { ...docPoint },
    originalTransform: { ...layer.transform },
    localBBox: computeLocalBBox(layer),
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

  // Restore original silently, then commit final with undo entry
  store.updateLayerSilent(d.artboardId, d.layerId, { transform: { ...d.originalTransform } })
  store.updateLayer(d.artboardId, d.layerId, { transform: finalTransform })

  drag = null
}

export function cancelTransform() {
  const d = drag
  if (!d) return
  const store = useEditorStore.getState()
  store.setActiveSnapLines(null)
  store.updateLayerSilent(d.artboardId, d.layerId, {
    transform: { ...d.originalTransform },
  })
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
