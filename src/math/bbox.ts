import type { Segment, Path, VectorLayer, Layer, Artboard, GroupLayer, TextLayer } from '@/types'

export interface BBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const EMPTY_BBOX: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

export function mergeBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

export function expandBBox(bbox: BBox, amount: number): BBox {
  return {
    minX: bbox.minX - amount,
    minY: bbox.minY - amount,
    maxX: bbox.maxX + amount,
    maxY: bbox.maxY + amount,
  }
}

export function bboxContainsPoint(bbox: BBox, x: number, y: number): boolean {
  return x >= bbox.minX && x <= bbox.maxX && y >= bbox.minY && y <= bbox.maxY
}

/** Compute the bounding box of a cubic bezier segment. */
function cubicBBox(
  x0: number,
  y0: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  x3: number,
  y3: number,
): BBox {
  // Find extrema by solving derivative = 0 for each axis
  const bbox: BBox = {
    minX: Math.min(x0, x3),
    minY: Math.min(y0, y3),
    maxX: Math.max(x0, x3),
    maxY: Math.max(y0, y3),
  }

  for (const [p0, p1, p2, p3, axis] of [[x0, cp1x, cp2x, x3, 'x'] as const, [y0, cp1y, cp2y, y3, 'y'] as const]) {
    // Derivative coefficients: at^2 + bt + c = 0
    const a = -3 * p0 + 9 * p1 - 9 * p2 + 3 * p3
    const b = 6 * p0 - 12 * p1 + 6 * p2
    const c = -3 * p0 + 3 * p1

    if (Math.abs(a) < 1e-12) {
      // Linear case
      if (Math.abs(b) > 1e-12) {
        const t = -c / b
        if (t > 0 && t < 1) {
          const val = cubicAt(p0, p1, p2, p3, t)
          if (axis === 'x') {
            bbox.minX = Math.min(bbox.minX, val)
            bbox.maxX = Math.max(bbox.maxX, val)
          } else {
            bbox.minY = Math.min(bbox.minY, val)
            bbox.maxY = Math.max(bbox.maxY, val)
          }
        }
      }
      continue
    }

    const disc = b * b - 4 * a * c
    if (disc < 0) continue

    const sqrtDisc = Math.sqrt(disc)
    for (const t of [(-b + sqrtDisc) / (2 * a), (-b - sqrtDisc) / (2 * a)]) {
      if (t > 0 && t < 1) {
        const val = cubicAt(p0, p1, p2, p3, t)
        if (axis === 'x') {
          bbox.minX = Math.min(bbox.minX, val)
          bbox.maxX = Math.max(bbox.maxX, val)
        } else {
          bbox.minY = Math.min(bbox.minY, val)
          bbox.maxY = Math.max(bbox.maxY, val)
        }
      }
    }
  }

  return bbox
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

/** Compute the bounding box of a quadratic bezier segment. */
function quadraticBBox(x0: number, y0: number, cpx: number, cpy: number, x2: number, y2: number): BBox {
  const bbox: BBox = {
    minX: Math.min(x0, x2),
    minY: Math.min(y0, y2),
    maxX: Math.max(x0, x2),
    maxY: Math.max(y0, y2),
  }

  // t = (p0 - p1) / (p0 - 2*p1 + p2) for each axis
  for (const [p0, p1, p2, axis] of [[x0, cpx, x2, 'x'] as const, [y0, cpy, y2, 'y'] as const]) {
    const denom = p0 - 2 * p1 + p2
    if (Math.abs(denom) < 1e-12) continue
    const t = (p0 - p1) / denom
    if (t > 0 && t < 1) {
      const mt = 1 - t
      const val = mt * mt * p0 + 2 * mt * t * p1 + t * t * p2
      if (axis === 'x') {
        bbox.minX = Math.min(bbox.minX, val)
        bbox.maxX = Math.max(bbox.maxX, val)
      } else {
        bbox.minY = Math.min(bbox.minY, val)
        bbox.maxY = Math.max(bbox.maxY, val)
      }
    }
  }

  return bbox
}

/** Compute the bounding box of a path's segments. */
export function pathBBox(segments: Segment[]): BBox {
  let bbox = { ...EMPTY_BBOX }
  let curX = 0
  let curY = 0

  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        bbox = mergeBBox(bbox, { minX: seg.x, minY: seg.y, maxX: seg.x, maxY: seg.y })
        curX = seg.x
        curY = seg.y
        break
      case 'line':
        bbox = mergeBBox(bbox, {
          minX: Math.min(curX, seg.x),
          minY: Math.min(curY, seg.y),
          maxX: Math.max(curX, seg.x),
          maxY: Math.max(curY, seg.y),
        })
        curX = seg.x
        curY = seg.y
        break
      case 'cubic':
        bbox = mergeBBox(bbox, cubicBBox(curX, curY, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y))
        curX = seg.x
        curY = seg.y
        break
      case 'quadratic':
        bbox = mergeBBox(bbox, quadraticBBox(curX, curY, seg.cpx, seg.cpy, seg.x, seg.y))
        curX = seg.x
        curY = seg.y
        break
      case 'arc':
        // Conservative: use endpoint + current as bbox (exact arc bbox is complex)
        bbox = mergeBBox(bbox, {
          minX: Math.min(curX, seg.x) - Math.max(seg.rx, seg.ry),
          minY: Math.min(curY, seg.y) - Math.max(seg.rx, seg.ry),
          maxX: Math.max(curX, seg.x) + Math.max(seg.rx, seg.ry),
          maxY: Math.max(curY, seg.y) + Math.max(seg.rx, seg.ry),
        })
        curX = seg.x
        curY = seg.y
        break
      case 'close':
        break
    }
  }

  return bbox
}

/** Compute bounding box of a Path (all segments). */
export function getPathBBox(path: Path): BBox {
  return pathBBox(path.segments)
}

/** Compute bounding box for any layer type. */
export function getLayerBBox(layer: Layer, artboard: Artboard): BBox {
  switch (layer.type) {
    case 'vector':
      return getVectorLayerBBox(layer, artboard)
    case 'raster': {
      const t = layer.transform
      const w = layer.width * t.scaleX
      const h = layer.height * t.scaleY
      return {
        minX: artboard.x + t.x + Math.min(0, w),
        minY: artboard.y + t.y + Math.min(0, h),
        maxX: artboard.x + t.x + Math.max(0, w),
        maxY: artboard.y + t.y + Math.max(0, h),
      }
    }
    case 'group':
      return getGroupLayerBBox(layer, artboard)
    case 'text':
      return getTextLayerBBox(layer, artboard)
    case 'adjustment':
      // Adjustment layers affect the entire artboard
      return {
        minX: artboard.x,
        minY: artboard.y,
        maxX: artboard.x + artboard.width,
        maxY: artboard.y + artboard.height,
      }
    default:
      return {
        minX: artboard.x,
        minY: artboard.y,
        maxX: artboard.x + artboard.width,
        maxY: artboard.y + artboard.height,
      }
  }
}

function getGroupLayerBBox(group: GroupLayer, artboard: Artboard): BBox {
  const visibleChildren = group.children.filter((c) => c.visible)
  if (visibleChildren.length === 0) return { ...EMPTY_BBOX }

  let bbox = { ...EMPTY_BBOX }
  for (const child of visibleChildren) {
    const childBBox = getLayerBBox(child, artboard)
    if (childBBox.minX === Infinity) continue
    bbox = mergeBBox(bbox, childBBox)
  }

  if (bbox.minX === Infinity) return { ...EMPTY_BBOX }

  // Apply group's own transform (scale relative to group origin, then translate)
  const t = group.transform
  if (t.scaleX !== 1 || t.scaleY !== 1) {
    const originX = artboard.x + t.x
    const originY = artboard.y + t.y
    const x1 = (bbox.minX - originX) * t.scaleX + originX
    const x2 = (bbox.maxX - originX) * t.scaleX + originX
    const y1 = (bbox.minY - originY) * t.scaleY + originY
    const y2 = (bbox.maxY - originY) * t.scaleY + originY
    bbox = {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    }
  }
  if (t.x !== 0 || t.y !== 0) {
    bbox = {
      minX: bbox.minX + t.x,
      minY: bbox.minY + t.y,
      maxX: bbox.maxX + t.x,
      maxY: bbox.maxY + t.y,
    }
  }

  return bbox
}

function getTextLayerBBox(layer: TextLayer, artboard: Artboard): BBox {
  const t = layer.transform
  let localW: number
  let localH: number

  if (layer.textMode === 'area' && layer.textWidth != null && layer.textWidth > 0) {
    localW = layer.textWidth
    const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
    const lines = layer.text.split('\n')
    localH = layer.textHeight ?? lines.length * lineH
  } else {
    const lines = layer.text.split('\n')
    const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
    localW = 0
    try {
      const canvas = new OffscreenCanvas(1, 1)
      const mctx = canvas.getContext('2d')!
      const style = layer.fontStyle === 'italic' ? 'italic ' : ''
      const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
      mctx.font = `${style}${weight}${layer.fontSize}px ${layer.fontFamily}`
      for (const line of lines) {
        localW = Math.max(localW, mctx.measureText(line).width)
      }
    } catch {
      for (const line of lines) {
        localW = Math.max(localW, layer.fontSize * line.length * 0.6)
      }
    }
    localH = lines.length * lineH
  }

  const w = localW * t.scaleX
  const h = localH * t.scaleY
  const minX = w >= 0 ? artboard.x + t.x : artboard.x + t.x + w
  const maxX = w >= 0 ? artboard.x + t.x + w : artboard.x + t.x
  const minY = h >= 0 ? artboard.y + t.y : artboard.y + t.y + h
  const maxY = h >= 0 ? artboard.y + t.y + h : artboard.y + t.y

  return { minX, minY, maxX, maxY }
}

/** Compute the union bounding box of all layers in an infinite artboard, with padding.
 *  Falls back to 1920x1080 if the artboard has no layers or all bounds are empty. */
export function getInfiniteArtboardBounds(artboard: Artboard): {
  width: number
  height: number
  offsetX: number
  offsetY: number
} {
  const padding = 20
  let union = { ...EMPTY_BBOX }

  for (const layer of artboard.layers) {
    if (!layer.visible) continue
    const lb = getLayerBBox(layer, artboard)
    if (lb.minX === Infinity) continue
    union = mergeBBox(union, lb)
  }

  if (union.minX === Infinity) {
    // Empty — fallback
    return { width: 1920, height: 1080, offsetX: artboard.x, offsetY: artboard.y }
  }

  return {
    width: Math.ceil(union.maxX - union.minX + padding * 2),
    height: Math.ceil(union.maxY - union.minY + padding * 2),
    offsetX: union.minX - padding,
    offsetY: union.minY - padding,
  }
}

function getVectorLayerBBox(layer: VectorLayer, artboard: Artboard): BBox {
  if (layer.paths.length === 0) return { ...EMPTY_BBOX }

  let bbox = { ...EMPTY_BBOX }
  for (const path of layer.paths) {
    bbox = mergeBBox(bbox, getPathBBox(path))
  }

  // Apply layer transform (scale then translate)
  const t = layer.transform
  const x1 = bbox.minX * t.scaleX
  const x2 = bbox.maxX * t.scaleX
  const y1 = bbox.minY * t.scaleY
  const y2 = bbox.maxY * t.scaleY
  bbox = {
    minX: Math.min(x1, x2) + t.x + artboard.x,
    minY: Math.min(y1, y2) + t.y + artboard.y,
    maxX: Math.max(x1, x2) + t.x + artboard.x,
    maxY: Math.max(y1, y2) + t.y + artboard.y,
  }

  // Expand for stroke
  if (layer.stroke) {
    bbox = expandBBox(bbox, layer.stroke.width / 2)
  }

  return bbox
}
