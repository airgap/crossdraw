// Smart guide rendering utilities

/**
 * Enhanced smart guide rendering with distance labels and equal-spacing indicators.
 */

export interface SnapLine {
  axis: 'horizontal' | 'vertical'
  position: number
  // Start and end coordinates on the cross axis for rendering
  start: number
  end: number
}

export interface DistanceLabel {
  x: number
  y: number
  distance: number
  axis: 'horizontal' | 'vertical'
}

export interface EqualSpacingIndicator {
  axis: 'horizontal' | 'vertical'
  positions: number[] // positions of equally spaced elements
  spacing: number
  crossPos: number // position on the cross axis
}

/**
 * Calculate distance labels for snap lines between two bounding boxes.
 */
export function calcDistanceLabels(
  selectedBBox: { x: number; y: number; w: number; h: number },
  targetBBox: { x: number; y: number; w: number; h: number },
): DistanceLabel[] {
  const labels: DistanceLabel[] = []

  // Horizontal distance (edge-to-edge)
  if (selectedBBox.x + selectedBBox.w <= targetBBox.x) {
    // Selected is left of target
    const dist = targetBBox.x - (selectedBBox.x + selectedBBox.w)
    labels.push({
      x: selectedBBox.x + selectedBBox.w + dist / 2,
      y: (selectedBBox.y + selectedBBox.h / 2 + targetBBox.y + targetBBox.h / 2) / 2,
      distance: Math.round(dist),
      axis: 'horizontal',
    })
  } else if (targetBBox.x + targetBBox.w <= selectedBBox.x) {
    const dist = selectedBBox.x - (targetBBox.x + targetBBox.w)
    labels.push({
      x: targetBBox.x + targetBBox.w + dist / 2,
      y: (selectedBBox.y + selectedBBox.h / 2 + targetBBox.y + targetBBox.h / 2) / 2,
      distance: Math.round(dist),
      axis: 'horizontal',
    })
  }

  // Vertical distance
  if (selectedBBox.y + selectedBBox.h <= targetBBox.y) {
    const dist = targetBBox.y - (selectedBBox.y + selectedBBox.h)
    labels.push({
      x: (selectedBBox.x + selectedBBox.w / 2 + targetBBox.x + targetBBox.w / 2) / 2,
      y: selectedBBox.y + selectedBBox.h + dist / 2,
      distance: Math.round(dist),
      axis: 'vertical',
    })
  } else if (targetBBox.y + targetBBox.h <= selectedBBox.y) {
    const dist = selectedBBox.y - (targetBBox.y + targetBBox.h)
    labels.push({
      x: (selectedBBox.x + selectedBBox.w / 2 + targetBBox.x + targetBBox.w / 2) / 2,
      y: targetBBox.y + targetBBox.h + dist / 2,
      distance: Math.round(dist),
      axis: 'vertical',
    })
  }

  return labels
}

/**
 * Detect equal spacing between 3+ elements on an axis.
 */
export function detectEqualSpacing(
  bboxes: Array<{ id: string; x: number; y: number; w: number; h: number }>,
  axis: 'horizontal' | 'vertical',
  tolerance: number = 2,
): EqualSpacingIndicator | null {
  if (bboxes.length < 3) return null

  // Sort by position on the relevant axis
  const sorted = [...bboxes].sort((a, b) => (axis === 'horizontal' ? a.x - b.x : a.y - b.y))

  // Calculate gaps between consecutive elements
  const gaps: number[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i]!
    const next = sorted[i + 1]!
    const gap = axis === 'horizontal' ? next.x - (curr.x + curr.w) : next.y - (curr.y + curr.h)
    gaps.push(gap)
  }

  // Check if all gaps are equal (within tolerance)
  if (gaps.length < 2) return null
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  const allEqual = gaps.every((g) => Math.abs(g - avgGap) <= tolerance)

  if (!allEqual) return null

  // Build the indicator
  const positions = sorted.map((b) => (axis === 'horizontal' ? b.x + b.w / 2 : b.y + b.h / 2))
  const crossPos =
    axis === 'horizontal' ? Math.min(...sorted.map((b) => b.y)) - 20 : Math.min(...sorted.map((b) => b.x)) - 20

  return {
    axis,
    positions,
    spacing: Math.round(avgGap),
    crossPos,
  }
}

/**
 * Render a distance label to canvas.
 */
export function renderDistanceLabel(ctx: CanvasRenderingContext2D, label: DistanceLabel, zoom: number) {
  const text = `${label.distance}px`
  const fontSize = Math.max(10, 11 / zoom)

  ctx.save()
  ctx.font = `${fontSize}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Background pill
  const metrics = ctx.measureText(text)
  const padX = 4 / zoom
  const padY = 2 / zoom
  const bgW = metrics.width + padX * 2
  const bgH = fontSize + padY * 2

  ctx.fillStyle = '#FF6B00'
  ctx.beginPath()
  const r = 3 / zoom
  const bx = label.x - bgW / 2
  const by = label.y - bgH / 2
  ctx.roundRect(bx, by, bgW, bgH, r)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, label.x, label.y)
  ctx.restore()
}

/**
 * Render an equal-spacing indicator line to canvas.
 */
export function renderEqualSpacing(ctx: CanvasRenderingContext2D, indicator: EqualSpacingIndicator, zoom: number) {
  ctx.save()
  ctx.strokeStyle = '#FF6B00'
  ctx.lineWidth = 1 / zoom
  ctx.setLineDash([4 / zoom, 4 / zoom])

  if (indicator.axis === 'horizontal') {
    // Draw horizontal line through indicators
    for (let i = 0; i < indicator.positions.length - 1; i++) {
      const x1 = indicator.positions[i]!
      const x2 = indicator.positions[i + 1]!
      const midX = (x1 + x2) / 2
      ctx.beginPath()
      ctx.moveTo(x1, indicator.crossPos)
      ctx.lineTo(x2, indicator.crossPos)
      ctx.stroke()

      // Spacing label
      ctx.setLineDash([])
      const fontSize = Math.max(9, 10 / zoom)
      ctx.font = `${fontSize}px sans-serif`
      ctx.fillStyle = '#FF6B00'
      ctx.textAlign = 'center'
      ctx.fillText(`${indicator.spacing}`, midX, indicator.crossPos - 4 / zoom)
      ctx.setLineDash([4 / zoom, 4 / zoom])
    }
  } else {
    for (let i = 0; i < indicator.positions.length - 1; i++) {
      const y1 = indicator.positions[i]!
      const y2 = indicator.positions[i + 1]!
      const midY = (y1 + y2) / 2
      ctx.beginPath()
      ctx.moveTo(indicator.crossPos, y1)
      ctx.lineTo(indicator.crossPos, y2)
      ctx.stroke()

      ctx.setLineDash([])
      const fontSize = Math.max(9, 10 / zoom)
      ctx.font = `${fontSize}px sans-serif`
      ctx.fillStyle = '#FF6B00'
      ctx.textAlign = 'right'
      ctx.fillText(`${indicator.spacing}`, indicator.crossPos - 4 / zoom, midY)
      ctx.setLineDash([4 / zoom, 4 / zoom])
    }
  }

  ctx.restore()
}
