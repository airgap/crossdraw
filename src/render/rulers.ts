/**
 * Rulers, grid, and guide rendering for the viewport canvas.
 */

const RULER_SIZE = 20

export interface RulerRenderParams {
  ctx: CanvasRenderingContext2D
  canvasWidth: number
  canvasHeight: number
  panX: number
  panY: number
  zoom: number
  mouseDocX: number
  mouseDocY: number
  artboardX: number
  artboardY: number
  artboardW: number
  artboardH: number
  guides?: { horizontal: number[]; vertical: number[] }
  showGrid: boolean
  gridSize: number
}

/**
 * Compute tick spacing that adapts to zoom level.
 * Returns a nice round number (1, 2, 5, 10, 20, 50, 100, ...).
 */
function getTickSpacing(zoom: number): number {
  const minPixelSpacing = 50
  const rawSpacing = minPixelSpacing / zoom

  const magnitude = Math.pow(10, Math.floor(Math.log10(rawSpacing)))
  const normalized = rawSpacing / magnitude

  let nice: number
  if (normalized <= 1) nice = 1
  else if (normalized <= 2) nice = 2
  else if (normalized <= 5) nice = 5
  else nice = 10

  return nice * magnitude
}

export function renderRulers(p: RulerRenderParams) {
  const { ctx, canvasWidth, canvasHeight, panX, panY, zoom } = p

  const tickSpacing = getTickSpacing(zoom)

  ctx.save()

  // ── Horizontal ruler (top) ──
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#1e1e2e'
  ctx.fillRect(0, 0, canvasWidth, RULER_SIZE)
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, RULER_SIZE)
  ctx.lineTo(canvasWidth, RULER_SIZE)
  ctx.stroke()

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
  ctx.font = '9px monospace'
  ctx.textBaseline = 'top'

  // Calculate visible range in document coordinates
  const startDocX = -panX / zoom
  const endDocX = (canvasWidth - panX) / zoom
  const firstTick = Math.floor(startDocX / tickSpacing) * tickSpacing

  for (let docX = firstTick; docX <= endDocX; docX += tickSpacing) {
    const screenX = docX * zoom + panX
    if (screenX < RULER_SIZE || screenX > canvasWidth) continue

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(screenX, RULER_SIZE - 8)
    ctx.lineTo(screenX, RULER_SIZE)
    ctx.stroke()

    ctx.fillText(String(Math.round(docX)), screenX + 2, 2)

    // Sub-ticks
    const subSpacing = tickSpacing / 5
    for (let j = 1; j < 5; j++) {
      const subDocX = docX + j * subSpacing
      const subScreenX = subDocX * zoom + panX
      if (subScreenX < RULER_SIZE || subScreenX > canvasWidth) continue
      ctx.beginPath()
      ctx.moveTo(subScreenX, RULER_SIZE - 3)
      ctx.lineTo(subScreenX, RULER_SIZE)
      ctx.stroke()
    }
  }

  // ── Vertical ruler (left) ──
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#1e1e2e'
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, canvasHeight - RULER_SIZE)
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(RULER_SIZE, RULER_SIZE)
  ctx.lineTo(RULER_SIZE, canvasHeight)
  ctx.stroke()

  const startDocY = -panY / zoom
  const endDocY = (canvasHeight - panY) / zoom
  const firstTickY = Math.floor(startDocY / tickSpacing) * tickSpacing

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'

  for (let docY = firstTickY; docY <= endDocY; docY += tickSpacing) {
    const screenY = docY * zoom + panY
    if (screenY < RULER_SIZE || screenY > canvasHeight) continue

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#888'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(RULER_SIZE - 8, screenY)
    ctx.lineTo(RULER_SIZE, screenY)
    ctx.stroke()

    ctx.save()
    ctx.translate(2, screenY + 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(String(Math.round(docY)), 0, 0)
    ctx.restore()

    const subSpacing = tickSpacing / 5
    for (let j = 1; j < 5; j++) {
      const subDocY = docY + j * subSpacing
      const subScreenY = subDocY * zoom + panY
      if (subScreenY < RULER_SIZE || subScreenY > canvasHeight) continue
      ctx.beginPath()
      ctx.moveTo(RULER_SIZE - 3, subScreenY)
      ctx.lineTo(RULER_SIZE, subScreenY)
      ctx.stroke()
    }
  }

  // ── Corner square ──
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim() || '#1e1e2e'
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE)

  // ── Cursor markers ──
  const cursorScreenX = p.mouseDocX * zoom + panX
  const cursorScreenY = p.mouseDocY * zoom + panY

  ctx.strokeStyle = '#ff6b6b'
  ctx.lineWidth = 1

  // Horizontal ruler cursor marker
  if (cursorScreenX > RULER_SIZE && cursorScreenX < canvasWidth) {
    ctx.beginPath()
    ctx.moveTo(cursorScreenX, 0)
    ctx.lineTo(cursorScreenX, RULER_SIZE)
    ctx.stroke()
  }

  // Vertical ruler cursor marker
  if (cursorScreenY > RULER_SIZE && cursorScreenY < canvasHeight) {
    ctx.beginPath()
    ctx.moveTo(0, cursorScreenY)
    ctx.lineTo(RULER_SIZE, cursorScreenY)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Render guides as dashed lines across the full viewport.
 */
export function renderGuides(p: RulerRenderParams) {
  if (!p.guides) return
  const { ctx, canvasWidth, canvasHeight, panX, panY, zoom, artboardX, artboardY } = p

  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.5

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4a7dff'
  ctx.strokeStyle = accentColor

  for (const gy of p.guides.horizontal) {
    const screenY = (artboardY + gy) * zoom + panY
    ctx.beginPath()
    ctx.moveTo(0, screenY)
    ctx.lineTo(canvasWidth, screenY)
    ctx.stroke()
  }

  for (const gx of p.guides.vertical) {
    const screenX = (artboardX + gx) * zoom + panX
    ctx.beginPath()
    ctx.moveTo(screenX, 0)
    ctx.lineTo(screenX, canvasHeight)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * Render the pixel grid when zoomed in enough.
 */
export function renderGrid(p: RulerRenderParams) {
  if (!p.showGrid) return
  const { ctx, canvasWidth, canvasHeight, panX, panY, zoom, gridSize, artboardX, artboardY, artboardW, artboardH } = p

  const pixelSize = gridSize * zoom
  if (pixelSize < 4) return // Too zoomed out — hide grid

  ctx.save()

  const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#333'
  ctx.fillStyle = borderColor
  ctx.globalAlpha = 0.3

  // Calculate visible artboard range
  const startDocX = Math.max(artboardX, (-panX) / zoom)
  const endDocX = Math.min(artboardX + artboardW, (canvasWidth - panX) / zoom)
  const startDocY = Math.max(artboardY, (-panY) / zoom)
  const endDocY = Math.min(artboardY + artboardH, (canvasHeight - panY) / zoom)

  const firstGridX = Math.ceil((startDocX - artboardX) / gridSize) * gridSize + artboardX
  const firstGridY = Math.ceil((startDocY - artboardY) / gridSize) * gridSize + artboardY

  // Render as dots at intersections
  const dotSize = Math.max(1, 1 / zoom)
  for (let gx = firstGridX; gx <= endDocX; gx += gridSize) {
    const screenX = gx * zoom + panX
    for (let gy = firstGridY; gy <= endDocY; gy += gridSize) {
      const screenY = gy * zoom + panY
      ctx.fillRect(screenX - dotSize / 2, screenY - dotSize / 2, dotSize, dotSize)
    }
  }

  ctx.restore()
}

/**
 * Render temporary snap indicator lines (magenta).
 */
export function renderSnapLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  panX: number,
  panY: number,
  zoom: number,
  snapLinesH: number[],
  snapLinesV: number[],
) {
  if (snapLinesH.length === 0 && snapLinesV.length === 0) return

  ctx.save()
  ctx.strokeStyle = '#ff00ff'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 3])

  for (const docY of snapLinesH) {
    const screenY = docY * zoom + panY
    ctx.beginPath()
    ctx.moveTo(0, screenY)
    ctx.lineTo(canvasWidth, screenY)
    ctx.stroke()
  }

  for (const docX of snapLinesV) {
    const screenX = docX * zoom + panX
    ctx.beginPath()
    ctx.moveTo(screenX, 0)
    ctx.lineTo(screenX, canvasHeight)
    ctx.stroke()
  }

  ctx.restore()
}

export { RULER_SIZE }
