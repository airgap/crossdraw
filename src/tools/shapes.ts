import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { snapPoint } from '@/tools/snap'
import { getShapeDefaults } from '@/ui/tool-options-state'

/**
 * Generate a rectangle path from origin + size.
 * If shift is held, constrains to a square.
 */
export function generateRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  cornerRadius: number | [number, number, number, number] = 0,
): Segment[] {
  // Normalize to per-corner array [TL, TR, BR, BL]
  const radii =
    typeof cornerRadius === 'number' ? [cornerRadius, cornerRadius, cornerRadius, cornerRadius] : cornerRadius

  const maxR = Math.min(Math.abs(w) / 2, Math.abs(h) / 2)
  const [tl, tr, br, bl] = radii.map((r) => Math.min(Math.max(r, 0), maxR)) as [number, number, number, number]

  if (tl <= 0 && tr <= 0 && br <= 0 && bl <= 0) {
    return [
      { type: 'move', x, y },
      { type: 'line', x: x + w, y },
      { type: 'line', x: x + w, y: y + h },
      { type: 'line', x, y: y + h },
      { type: 'close' },
    ]
  }

  const k = 0.5522847498 // cubic bezier approximation of quarter circle
  const segs: Segment[] = []

  // Start at top-left corner, after TL radius
  segs.push({ type: 'move', x: x + tl, y })

  // Top edge → TR corner
  segs.push({ type: 'line', x: x + w - tr, y })
  if (tr > 0) {
    segs.push({
      type: 'cubic',
      x: x + w,
      y: y + tr,
      cp1x: x + w - tr + tr * k,
      cp1y: y,
      cp2x: x + w,
      cp2y: y + tr - tr * k,
    })
  }

  // Right edge → BR corner
  segs.push({ type: 'line', x: x + w, y: y + h - br })
  if (br > 0) {
    segs.push({
      type: 'cubic',
      x: x + w - br,
      y: y + h,
      cp1x: x + w,
      cp1y: y + h - br + br * k,
      cp2x: x + w - br + br * k,
      cp2y: y + h,
    })
  }

  // Bottom edge → BL corner
  segs.push({ type: 'line', x: x + bl, y: y + h })
  if (bl > 0) {
    segs.push({
      type: 'cubic',
      x,
      y: y + h - bl,
      cp1x: x + bl - bl * k,
      cp1y: y + h,
      cp2x: x,
      cp2y: y + h - bl + bl * k,
    })
  }

  // Left edge → TL corner
  segs.push({ type: 'line', x, y: y + tl })
  if (tl > 0) {
    segs.push({ type: 'cubic', x: x + tl, y, cp1x: x, cp1y: y + tl - tl * k, cp2x: x + tl - tl * k, cp2y: y })
  }

  segs.push({ type: 'close' })
  return segs
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

  // Read tool option defaults from the tool options bar state
  const shapeDefs = getShapeDefaults()

  let segments: Segment[]
  switch (tool) {
    case 'rectangle':
      segments = generateRectangle(0, 0, w, h, shapeDefs.cornerRadius)
      break
    case 'ellipse':
      segments = generateEllipse(w / 2, h / 2, Math.abs(w) / 2, Math.abs(h) / 2)
      break
    case 'polygon':
      segments = generatePolygon(w / 2, h / 2, Math.max(Math.abs(w), Math.abs(h)) / 2, shapeDefs.polygonSides)
      break
    case 'star':
      segments = generateStar(
        w / 2,
        h / 2,
        Math.max(Math.abs(w), Math.abs(h)) / 2,
        shapeDefs.starInnerRatio,
        shapeDefs.starPoints,
      )
      break
    default:
      return
  }

  // Build shape params for parametric editing
  const shapeParams: VectorLayer['shapeParams'] = {
    shapeType: tool as 'rectangle' | 'ellipse' | 'polygon' | 'star',
    width: w,
    height: h,
    cornerRadius: tool === 'rectangle' ? shapeDefs.cornerRadius : 0,
    sides: tool === 'polygon' ? shapeDefs.polygonSides : undefined,
    points: tool === 'star' ? shapeDefs.starPoints : undefined,
    innerRatio: tool === 'star' ? shapeDefs.starInnerRatio : undefined,
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
