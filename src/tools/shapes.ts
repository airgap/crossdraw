import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { snapPoint } from '@/tools/snap'

/**
 * Generate a rectangle path from origin + size.
 * If shift is held, constrains to a square.
 */
export function generateRectangle(x: number, y: number, w: number, h: number, cornerRadius = 0): Segment[] {
  if (cornerRadius <= 0) {
    return [
      { type: 'move', x, y },
      { type: 'line', x: x + w, y },
      { type: 'line', x: x + w, y: y + h },
      { type: 'line', x, y: y + h },
      { type: 'close' },
    ]
  }

  const r = Math.min(cornerRadius, Math.abs(w) / 2, Math.abs(h) / 2)
  const k = 0.5522847498 // cubic bezier approximation of quarter circle
  return [
    { type: 'move', x: x + r, y },
    { type: 'line', x: x + w - r, y },
    { type: 'cubic', x: x + w, y: y + r, cp1x: x + w - r + r * k, cp1y: y, cp2x: x + w, cp2y: y + r - r * k },
    { type: 'line', x: x + w, y: y + h - r },
    {
      type: 'cubic',
      x: x + w - r,
      y: y + h,
      cp1x: x + w,
      cp1y: y + h - r + r * k,
      cp2x: x + w - r + r * k,
      cp2y: y + h,
    },
    { type: 'line', x: x + r, y: y + h },
    { type: 'cubic', x, y: y + h - r, cp1x: x + r - r * k, cp1y: y + h, cp2x: x, cp2y: y + h - r + r * k },
    { type: 'line', x, y: y + r },
    { type: 'cubic', x: x + r, y, cp1x: x, cp1y: y + r - r * k, cp2x: x + r - r * k, cp2y: y },
    { type: 'close' },
  ]
}

/**
 * Generate an ellipse path approximated with 4 cubic bezier curves.
 */
export function generateEllipse(cx: number, cy: number, rx: number, ry: number): Segment[] {
  const k = 0.5522847498
  const kx = rx * k
  const ky = ry * k
  return [
    { type: 'move', x: cx + rx, y: cy },
    { type: 'cubic', x: cx, y: cy - ry, cp1x: cx + rx, cp1y: cy - ky, cp2x: cx + kx, cp2y: cy - ry },
    { type: 'cubic', x: cx - rx, y: cy, cp1x: cx - kx, cp1y: cy - ry, cp2x: cx - rx, cp2y: cy - ky },
    { type: 'cubic', x: cx, y: cy + ry, cp1x: cx - rx, cp1y: cy + ky, cp2x: cx - kx, cp2y: cy + ry },
    { type: 'cubic', x: cx + rx, y: cy, cp1x: cx + kx, cp1y: cy + ry, cp2x: cx + rx, cp2y: cy + ky },
    { type: 'close' },
  ]
}

/**
 * Generate a regular polygon with N sides.
 */
export function generatePolygon(cx: number, cy: number, radius: number, sides: number): Segment[] {
  sides = Math.max(3, Math.min(12, sides))
  const segments: Segment[] = []
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
    const x = cx + Math.cos(angle) * radius
    const y = cy + Math.sin(angle) * radius
    segments.push(i === 0 ? { type: 'move', x, y } : { type: 'line', x, y })
  }
  segments.push({ type: 'close' })
  return segments
}

/**
 * Generate a star with N points.
 */
export function generateStar(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRatio: number,
  points: number,
): Segment[] {
  points = Math.max(3, Math.min(12, points))
  const innerRadius = outerRadius * Math.max(0.1, Math.min(0.95, innerRatio))
  const segments: Segment[] = []
  const totalPoints = points * 2

  for (let i = 0; i < totalPoints; i++) {
    const angle = (i / totalPoints) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? outerRadius : innerRadius
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    segments.push(i === 0 ? { type: 'move', x, y } : { type: 'line', x, y })
  }
  segments.push({ type: 'close' })
  return segments
}

// ─── Shape tool interaction ──────────────────────────────────

interface ShapeDragState {
  active: boolean
  startX: number
  startY: number
  artboardId: string
  layerId: string | null
}

const dragState: ShapeDragState = {
  active: false,
  startX: 0,
  startY: 0,
  artboardId: '',
  layerId: null,
}

export function beginShapeDrag(docX: number, docY: number, artboardId: string) {
  // Snap the starting point
  const snapResult = snapPoint(docX, docY)
  const snappedX = snapResult.x ?? docX
  const snappedY = snapResult.y ?? docY

  dragState.active = true
  dragState.startX = snappedX
  dragState.startY = snappedY
  dragState.artboardId = artboardId
  dragState.layerId = null
}

export function updateShapeDrag(docX: number, docY: number, shift: boolean, alt: boolean) {
  if (!dragState.active) return

  const store = useEditorStore.getState()
  const tool = store.activeTool

  // Snap the current drag point
  const excludeIds = dragState.layerId ? [dragState.layerId] : []
  const snapResult = snapPoint(docX, docY, excludeIds)
  const snappedDocX = snapResult.x ?? docX
  const snappedDocY = snapResult.y ?? docY

  // Show snap lines during drag
  if (snapResult.snapLinesH.length > 0 || snapResult.snapLinesV.length > 0) {
    store.setActiveSnapLines({ h: snapResult.snapLinesH, v: snapResult.snapLinesV })
  } else {
    store.setActiveSnapLines(null)
  }

  let w = snappedDocX - dragState.startX
  let h = snappedDocY - dragState.startY

  // Shift: constrain proportions
  if (shift) {
    const size = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w) * size
    h = Math.sign(h) * size
  }

  let originX = dragState.startX
  let originY = dragState.startY

  // Alt: draw from center
  if (alt) {
    originX -= w
    originY -= h
    w *= 2
    h *= 2
  }

  // Find artboard offset
  const artboard = store.document.artboards.find((a) => a.id === dragState.artboardId)
  if (!artboard) return
  const localX = originX - artboard.x
  const localY = originY - artboard.y

  let segments: Segment[]
  switch (tool) {
    case 'rectangle':
      segments = generateRectangle(0, 0, w, h)
      break
    case 'ellipse':
      segments = generateEllipse(w / 2, h / 2, Math.abs(w) / 2, Math.abs(h) / 2)
      break
    case 'polygon':
      segments = generatePolygon(w / 2, h / 2, Math.max(Math.abs(w), Math.abs(h)) / 2, 6)
      break
    case 'star':
      segments = generateStar(w / 2, h / 2, Math.max(Math.abs(w), Math.abs(h)) / 2, 0.4, 5)
      break
    default:
      return
  }

  // Build shape params for parametric editing
  const shapeParams: VectorLayer['shapeParams'] = {
    shapeType: tool as 'rectangle' | 'ellipse' | 'polygon' | 'star',
    width: w,
    height: h,
    cornerRadius: 0,
    sides: tool === 'polygon' ? 6 : undefined,
    points: tool === 'star' ? 5 : undefined,
    innerRatio: tool === 'star' ? 0.4 : undefined,
  }

  if (!dragState.layerId) {
    const layer: VectorLayer = {
      id: uuid(),
      name: `${tool} ${artboard.layers.length + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: localX, y: localY, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [{ id: uuid(), segments, closed: true }],
      fill: { type: 'solid', color: '#4a7dff', opacity: 1 },
      stroke: null,
      shapeParams,
    }
    store.addLayer(dragState.artboardId, layer)
    dragState.layerId = layer.id
    store.selectLayer(layer.id)
  } else {
    store.updateLayerSilent(dragState.artboardId, dragState.layerId, {
      transform: { x: localX, y: localY, scaleX: 1, scaleY: 1, rotation: 0 },
      paths: [{ id: uuid(), segments, closed: true }],
      shapeParams,
    } as Partial<VectorLayer>)
  }
}

export function endShapeDrag() {
  if (!dragState.active) return
  useEditorStore.getState().setActiveSnapLines(null)
  dragState.active = false
  dragState.layerId = null
}

export function isShapeDragging(): boolean {
  return dragState.active
}
