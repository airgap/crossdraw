/**
 * Perspective grid rendering for 1-point, 2-point, and 3-point perspective.
 *
 * Draws convergence lines from vanishing points through evenly spaced
 * points along the artboard edges, a horizon line, and draggable VP indicators.
 */

export type PerspectiveMode = '1-point' | '2-point' | '3-point'

export interface PerspectiveConfig {
  mode: PerspectiveMode
  vanishingPoints: { x: number; y: number }[]
  gridDensity: number // number of lines per side (4-40)
  opacity: number // 0-1
  color: string // hex color
  horizonY: number // Y position of the horizon line in artboard-local coords
}

/** VP indicator radius in screen pixels (divided by zoom for document coords). */
const VP_RADIUS_PX = 7

/** Create a default perspective config for a given artboard size. */
export function createDefaultPerspectiveConfig(
  artboardWidth: number,
  artboardHeight: number,
  mode: PerspectiveMode = '1-point',
): PerspectiveConfig {
  const horizonY = artboardHeight * 0.4
  const cx = artboardWidth / 2
  const vps: { x: number; y: number }[] = []

  if (mode === '1-point') {
    vps.push({ x: cx, y: horizonY })
  } else if (mode === '2-point') {
    vps.push({ x: -artboardWidth * 0.3, y: horizonY })
    vps.push({ x: artboardWidth * 1.3, y: horizonY })
  } else {
    // 3-point
    vps.push({ x: -artboardWidth * 0.3, y: horizonY })
    vps.push({ x: artboardWidth * 1.3, y: horizonY })
    vps.push({ x: cx, y: -artboardHeight * 0.5 })
  }

  return {
    mode,
    vanishingPoints: vps,
    gridDensity: 12,
    opacity: 0.35,
    color: '#4a90d9',
    horizonY,
  }
}

/** Compute grid lines emanating from a vanishing point to evenly spaced edge targets.
 *  Returns an array of line segments: [vpX, vpY, targetX, targetY]. */
function computeConvergenceLines(
  vpX: number,
  vpY: number,
  artboardW: number,
  artboardH: number,
  density: number,
): [number, number, number, number][] {
  const lines: [number, number, number, number][] = []
  const step = 1 / density

  // Bottom edge
  for (let t = 0; t <= 1 + step / 2; t += step) {
    lines.push([vpX, vpY, t * artboardW, artboardH])
  }

  // Top edge
  for (let t = 0; t <= 1 + step / 2; t += step) {
    lines.push([vpX, vpY, t * artboardW, 0])
  }

  // Left edge
  for (let t = 0; t <= 1 + step / 2; t += step) {
    lines.push([vpX, vpY, 0, t * artboardH])
  }

  // Right edge
  for (let t = 0; t <= 1 + step / 2; t += step) {
    lines.push([vpX, vpY, artboardW, t * artboardH])
  }

  return lines
}

/** Clip a line (x0,y0)-(x1,y1) to a rectangle [0,0,w,h] using Cohen-Sutherland.
 *  Returns null if entirely outside, or the clipped endpoints. */
function clipLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
): [number, number, number, number] | null {
  const INSIDE = 0
  const LEFT = 1
  const RIGHT = 2
  const BOTTOM = 4
  const TOP = 8

  function code(x: number, y: number): number {
    let c = INSIDE
    if (x < 0) c |= LEFT
    else if (x > w) c |= RIGHT
    if (y < 0) c |= TOP
    else if (y > h) c |= BOTTOM
    return c
  }

  let cx0 = x0,
    cy0 = y0,
    cx1 = x1,
    cy1 = y1
  let c0 = code(cx0, cy0)
  let c1 = code(cx1, cy1)

  for (let iter = 0; iter < 20; iter++) {
    if ((c0 | c1) === 0) return [cx0, cy0, cx1, cy1]
    if ((c0 & c1) !== 0) return null

    const cOut = c0 !== 0 ? c0 : c1
    let x = 0,
      y = 0

    if (cOut & BOTTOM) {
      x = cx0 + ((cx1 - cx0) * (h - cy0)) / (cy1 - cy0)
      y = h
    } else if (cOut & TOP) {
      x = cx0 + ((cx1 - cx0) * (0 - cy0)) / (cy1 - cy0)
      y = 0
    } else if (cOut & RIGHT) {
      y = cy0 + ((cy1 - cy0) * (w - cx0)) / (cx1 - cx0)
      x = w
    } else if (cOut & LEFT) {
      y = cy0 + ((cy1 - cy0) * (0 - cx0)) / (cx1 - cx0)
      x = 0
    }

    if (cOut === c0) {
      cx0 = x
      cy0 = y
      c0 = code(cx0, cy0)
    } else {
      cx1 = x
      cy1 = y
      c1 = code(cx1, cy1)
    }
  }

  return null
}

/**
 * Render perspective grid overlay onto the given canvas context.
 * Coordinates are in artboard-local space (caller should translate to artboard origin).
 */
export function renderPerspectiveGrid(
  ctx: CanvasRenderingContext2D,
  config: PerspectiveConfig,
  artboardBounds: { x: number; y: number; width: number; height: number },
  zoom: number,
): void {
  const { mode, vanishingPoints, gridDensity, opacity, color, horizonY } = config
  const { x: abX, y: abY, width: abW, height: abH } = artboardBounds

  ctx.save()
  ctx.translate(abX, abY)

  // Clip to artboard for grid lines
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, abW, abH)
  ctx.clip()

  ctx.globalAlpha = opacity
  ctx.strokeStyle = color
  ctx.lineWidth = 0.8 / zoom

  // Draw horizon line
  ctx.save()
  ctx.lineWidth = 1.2 / zoom
  ctx.setLineDash([6 / zoom, 4 / zoom])
  ctx.beginPath()
  ctx.moveTo(0, horizonY)
  ctx.lineTo(abW, horizonY)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  // Draw convergence lines for each VP
  const vpCount = mode === '1-point' ? 1 : mode === '2-point' ? 2 : 3
  for (let vi = 0; vi < vpCount && vi < vanishingPoints.length; vi++) {
    const vp = vanishingPoints[vi]!
    const lines = computeConvergenceLines(vp.x, vp.y, abW, abH, gridDensity)

    ctx.beginPath()
    for (const [lx0, ly0, lx1, ly1] of lines) {
      const clipped = clipLine(lx0, ly0, lx1, ly1, abW, abH)
      if (clipped) {
        ctx.moveTo(clipped[0], clipped[1])
        ctx.lineTo(clipped[2], clipped[3])
      }
    }
    ctx.stroke()
  }

  ctx.restore() // un-clip

  // Draw VP indicators (outside clip so they remain visible even if off-artboard)
  ctx.globalAlpha = Math.min(opacity + 0.3, 1)
  for (let vi = 0; vi < vpCount && vi < vanishingPoints.length; vi++) {
    const vp = vanishingPoints[vi]!
    const r = VP_RADIUS_PX / zoom

    // Outer circle
    ctx.beginPath()
    ctx.arc(vp.x, vp.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5 / zoom
    ctx.stroke()

    // Crosshair
    const cr = r * 0.6
    ctx.beginPath()
    ctx.moveTo(vp.x - cr, vp.y)
    ctx.lineTo(vp.x + cr, vp.y)
    ctx.moveTo(vp.x, vp.y - cr)
    ctx.lineTo(vp.x, vp.y + cr)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1 / zoom
    ctx.stroke()

    // Label
    ctx.save()
    ctx.translate(vp.x, vp.y - r - 4 / zoom)
    ctx.scale(1 / zoom, 1 / zoom)
    ctx.fillStyle = color
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`VP${vi + 1}`, 0, 0)
    ctx.restore()
  }

  ctx.restore() // undo translate(abX, abY)
}

/** Hit-test a point against VP indicators. Returns the VP index or -1. */
export function hitTestVanishingPoint(
  docX: number,
  docY: number,
  config: PerspectiveConfig,
  artboardBounds: { x: number; y: number },
  zoom: number,
): number {
  const vpCount = config.mode === '1-point' ? 1 : config.mode === '2-point' ? 2 : 3
  const hitR = (VP_RADIUS_PX + 4) / zoom // slightly larger for easier grabbing

  for (let i = 0; i < vpCount && i < config.vanishingPoints.length; i++) {
    const vp = config.vanishingPoints[i]!
    const dx = docX - (artboardBounds.x + vp.x)
    const dy = docY - (artboardBounds.y + vp.y)
    if (dx * dx + dy * dy <= hitR * hitR) return i
  }
  return -1
}

/**
 * Project a point onto a perspective plane defined by a vanishing point.
 * Projects `point` along the line from `vanishingPoint` through `point` onto
 * the horizontal plane at `planeY`.
 */
export function projectToPlane(
  point: { x: number; y: number },
  vanishingPoint: { x: number; y: number },
  planeY: number,
): { x: number; y: number } {
  const dy = point.y - vanishingPoint.y
  if (Math.abs(dy) < 0.001) {
    return { x: point.x, y: planeY }
  }

  const t = (planeY - vanishingPoint.y) / dy
  return {
    x: vanishingPoint.x + (point.x - vanishingPoint.x) * t,
    y: planeY,
  }
}

/**
 * Snap a point to the nearest perspective grid line.
 * Returns the snapped point and whether snapping occurred.
 */
export function snapToPerspective(
  x: number,
  y: number,
  config: PerspectiveConfig,
  artboardW: number,
  artboardH: number,
  threshold: number = 8,
): { x: number; y: number; snapped: boolean } {
  const vpCount = config.mode === '1-point' ? 1 : config.mode === '2-point' ? 2 : 3

  let bestDist = threshold
  let bestX = x
  let bestY = y
  let snapped = false

  for (let vi = 0; vi < vpCount && vi < config.vanishingPoints.length; vi++) {
    const vp = config.vanishingPoints[vi]!
    const lines = computeConvergenceLines(vp.x, vp.y, artboardW, artboardH, config.gridDensity)

    for (const [lx0, ly0, lx1, ly1] of lines) {
      const dist = pointToLineDistance(x, y, lx0, ly0, lx1, ly1)
      if (dist < bestDist) {
        bestDist = dist
        // Project point onto the line segment
        const proj = projectPointOnLine(x, y, lx0, ly0, lx1, ly1)
        bestX = proj.x
        bestY = proj.y
        snapped = true
      }
    }
  }

  // Also snap to horizon line
  const horizonDist = Math.abs(y - config.horizonY)
  if (horizonDist < bestDist) {
    bestX = x
    bestY = config.horizonY
    snapped = true
  }

  return { x: bestX, y: bestY, snapped }
}

/** Perpendicular distance from point (px,py) to line through (lx0,ly0)-(lx1,ly1). */
function pointToLineDistance(
  px: number,
  py: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
): number {
  const dx = lx1 - lx0
  const dy = ly1 - ly0
  const lenSq = dx * dx + dy * dy
  if (lenSq < 0.001) return Math.sqrt((px - lx0) ** 2 + (py - ly0) ** 2)

  const num = Math.abs(dy * px - dx * py + lx1 * ly0 - ly1 * lx0)
  return num / Math.sqrt(lenSq)
}

/** Project point (px,py) onto line through (lx0,ly0)-(lx1,ly1). */
function projectPointOnLine(
  px: number,
  py: number,
  lx0: number,
  ly0: number,
  lx1: number,
  ly1: number,
): { x: number; y: number } {
  const dx = lx1 - lx0
  const dy = ly1 - ly0
  const lenSq = dx * dx + dy * dy
  if (lenSq < 0.001) return { x: lx0, y: ly0 }

  const t = ((px - lx0) * dx + (py - ly0) * dy) / lenSq
  return {
    x: lx0 + t * dx,
    y: ly0 + t * dy,
  }
}

// Re-export for testing
export { computeConvergenceLines, pointToLineDistance, projectPointOnLine }
