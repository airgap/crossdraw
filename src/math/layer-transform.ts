import type { Transform } from '@/types'

/**
 * Canonical layer transform composition: translate ∘ rotate ∘ skew ∘ scale.
 * Scale applies first in local space, then skew, then rotation, then the
 * translation — so rotating a non-uniformly scaled layer keeps it rigid
 * instead of shearing it. This matches the standard CSS/SVG decomposition
 * (svg-import's decomposeMatrix assumes exactly this order).
 *
 * Every consumer of a layer transform (canvas render, raster/SVG export,
 * bounding boxes, hit-testing) must go through these helpers so they can
 * never disagree about where a layer is drawn.
 */

/** 2x2 linear part (rotate · skew · scale) in canvas matrix convention:
 *  x' = a·x + c·y, y' = b·x + d·y. */
export function layerMatrix2x2(t: Transform): { a: number; b: number; c: number; d: number } {
  const rad = ((t.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const tanX = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
  const tanY = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
  return {
    a: (cos - sin * tanY) * t.scaleX,
    b: (sin + cos * tanY) * t.scaleX,
    c: (cos * tanX - sin) * t.scaleY,
    d: (sin * tanX + cos) * t.scaleY,
  }
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * Apply a layer transform to a canvas context.
 * When `bounds` is provided and the layer has a custom anchor point (anything
 * other than the default 0.5/0.5), scale/rotate/skew pivot around that anchor.
 */
export function applyLayerTransform(ctx: Canvas2D, t: Transform, bounds?: { width: number; height: number }) {
  ctx.translate(t.x, t.y)

  const ax = t.anchorX ?? 0.5
  const ay = t.anchorY ?? 0.5
  const hasCustomAnchor = bounds && (Math.abs(ax - 0.5) > 0.001 || Math.abs(ay - 0.5) > 0.001)
  const ox = hasCustomAnchor ? ax * bounds.width : 0
  const oy = hasCustomAnchor ? ay * bounds.height : 0

  if (hasCustomAnchor) ctx.translate(ox, oy)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
  if (t.skewX || t.skewY) {
    const tanX = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
    const tanY = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
    ctx.transform(1, tanY, tanX, 1, 0, 0)
  }
  ctx.scale(t.scaleX, t.scaleY)
  if (hasCustomAnchor) ctx.translate(-ox, -oy)
}

/**
 * Invert the linear part (rotate · skew · scale) of a layer transform.
 * `vx/vy` must already have the translation removed (doc point minus artboard
 * origin and t.x/t.y); returns the point in layer-local coordinates.
 */
export function invertLayerPoint(t: Transform, vx: number, vy: number): { x: number; y: number } {
  const { a, b, c, d } = layerMatrix2x2(t)
  const det = a * d - b * c
  if (Math.abs(det) < 1e-9) return { x: vx, y: vy }
  return {
    x: (d * vx - c * vy) / det,
    y: (a * vy - b * vx) / det,
  }
}

/**
 * Return a transform with `rotation` set to `newRotationDeg` and x/y adjusted
 * so the given local point keeps its world position — i.e. the layer visually
 * rotates in place around that point (typically its local bbox center).
 */
export function rotateTransformAboutLocalPoint(
  orig: Transform,
  px: number,
  py: number,
  newRotationDeg: number,
): Transform {
  // Local pivot mapped through skew · scale (rotation-independent part)
  const tanX = Math.tan(((orig.skewX ?? 0) * Math.PI) / 180)
  const tanY = Math.tan(((orig.skewY ?? 0) * Math.PI) / 180)
  const sxp = orig.scaleX * px
  const syp = orig.scaleY * py
  const mx = sxp + tanX * syp
  const my = tanY * sxp + syp

  const r0 = ((orig.rotation ?? 0) * Math.PI) / 180
  const r1 = (newRotationDeg * Math.PI) / 180
  const wx = orig.x + Math.cos(r0) * mx - Math.sin(r0) * my
  const wy = orig.y + Math.sin(r0) * mx + Math.cos(r0) * my

  return {
    ...orig,
    rotation: newRotationDeg,
    x: wx - (Math.cos(r1) * mx - Math.sin(r1) * my),
    y: wy - (Math.sin(r1) * mx + Math.cos(r1) * my),
  }
}
