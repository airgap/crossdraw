import type { Gradient, GradientStop } from '@/types'

/**
 * Create a Canvas 2D gradient from our Gradient type.
 * For linear/radial/conical, uses native CanvasGradient.
 * For box, returns null (must use renderBoxGradient instead).
 */
export function createCanvasGradient(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grad: Gradient,
  width: number,
  height: number,
): CanvasGradient | null {
  switch (grad.type) {
    case 'linear':
      return createLinearGradient(ctx, grad, width, height)
    case 'radial':
      return createRadialGradient(ctx, grad, width, height)
    case 'conical':
      return createConicalGradient(ctx, grad, width, height)
    case 'box':
      return null // handled by renderBoxGradient
  }
}

function createLinearGradient(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grad: Gradient,
  width: number,
  height: number,
): CanvasGradient {
  const angle = ((grad.angle ?? 0) * Math.PI) / 180
  const cx = grad.x * width
  const cy = grad.y * height
  const len = Math.max(width, height)
  const dx = Math.cos(angle) * len
  const dy = Math.sin(angle) * len

  const g = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2)
  applyStops(g, grad.stops)
  return g
}

function createRadialGradient(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grad: Gradient,
  width: number,
  height: number,
): CanvasGradient {
  const cx = grad.x * width
  const cy = grad.y * height
  const r = (grad.radius ?? 0.5) * Math.max(width, height)

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  applyStops(g, grad.stops)
  return g
}

function createConicalGradient(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grad: Gradient,
  width: number,
  height: number,
): CanvasGradient {
  const cx = grad.x * width
  const cy = grad.y * height
  const startAngle = ((grad.angle ?? 0) * Math.PI) / 180

  const g = (ctx as CanvasRenderingContext2D).createConicGradient(startAngle, cx, cy)
  applyStops(g, grad.stops)
  return g
}

function applyStops(g: CanvasGradient, stops: GradientStop[]) {
  for (const stop of stops) {
    // Combine stop color with stop opacity
    const color = hexToRgba(stop.color, stop.opacity)
    g.addColorStop(Math.max(0, Math.min(1, stop.offset)), color)
  }
}

/**
 * Render a box gradient to a canvas. Box gradient uses max(|dx|, |dy|) distance.
 */
export function renderBoxGradient(
  _ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  grad: Gradient,
  width: number,
  height: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const offCtx = canvas.getContext('2d')!
  const imageData = offCtx.createImageData(width, height)
  const data = imageData.data

  const cx = grad.x * width
  const cy = grad.y * height
  const maxDist = (grad.radius ?? 0.5) * Math.max(width, height)

  // Precompute stop colors
  const parsedStops = grad.stops.map((s) => ({
    offset: s.offset,
    ...parseHexColor(s.color),
    a: Math.round(s.opacity * 255),
  }))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - cx)
      const dy = Math.abs(y - cy)
      const dist = Math.max(dx, dy)
      const t = maxDist > 0 ? Math.min(1, dist / maxDist) : 0

      const [r, g, b, a] = interpolateStops(parsedStops, t)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }

  offCtx.putImageData(imageData, 0, 0)
  return canvas
}

function interpolateStops(
  stops: { offset: number; r: number; g: number; b: number; a: number }[],
  t: number,
): [number, number, number, number] {
  if (stops.length === 0) return [0, 0, 0, 255]
  if (stops.length === 1) return [stops[0]!.r, stops[0]!.g, stops[0]!.b, stops[0]!.a]

  // Find surrounding stops
  let low = stops[0]!
  let high = stops[stops.length - 1]!

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i]!.offset && t <= stops[i + 1]!.offset) {
      low = stops[i]!
      high = stops[i + 1]!
      break
    }
  }

  if (t <= low.offset) return [low.r, low.g, low.b, low.a]
  if (t >= high.offset) return [high.r, high.g, high.b, high.a]

  const range = high.offset - low.offset
  const f = range > 0 ? (t - low.offset) / range : 0

  return [
    Math.round(low.r + (high.r - low.r) * f),
    Math.round(low.g + (high.g - low.g) * f),
    Math.round(low.b + (high.b - low.b) * f),
    Math.round(low.a + (high.a - low.a) * f),
  ]
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}

function hexToRgba(hex: string, opacity: number): string {
  const { r, g, b } = parseHexColor(hex)
  return `rgba(${r},${g},${b},${opacity})`
}

// Exported for tests
export { interpolateStops, parseHexColor, hexToRgba }
