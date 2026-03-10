import type { UserPresence } from './collab-provider'

export interface CollabViewport {
  zoom: number
  panX: number
  panY: number
}

/**
 * Render collaboration cursors and selection highlights for remote users.
 * Draws colored cursor arrows with name labels on the canvas.
 */
export function renderCollabCursors(
  ctx: CanvasRenderingContext2D,
  presences: UserPresence[],
  viewport: CollabViewport,
): void {
  for (const presence of presences) {
    if (presence.cursorX == null || presence.cursorY == null) continue

    // Convert canvas coordinates to screen coordinates
    const screenX = presence.cursorX * viewport.zoom + viewport.panX
    const screenY = presence.cursorY * viewport.zoom + viewport.panY

    drawCursorArrow(ctx, screenX, screenY, presence.color, presence.name)
  }
}

/**
 * Render selection highlights showing which layers each remote user has selected.
 * Call this with layer bounding boxes to draw colored outlines.
 */
export function renderCollabSelections(
  ctx: CanvasRenderingContext2D,
  presences: UserPresence[],
  layerBounds: Map<string, { x: number; y: number; width: number; height: number }>,
  viewport: CollabViewport,
): void {
  for (const presence of presences) {
    for (const layerId of presence.selectedLayerIds) {
      const bounds = layerBounds.get(layerId)
      if (!bounds) continue

      const x = bounds.x * viewport.zoom + viewport.panX
      const y = bounds.y * viewport.zoom + viewport.panY
      const w = bounds.width * viewport.zoom
      const h = bounds.height * viewport.zoom

      ctx.save()
      ctx.strokeStyle = presence.color
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.globalAlpha = 0.7
      ctx.strokeRect(x, y, w, h)

      // Draw small label above the selection
      const label = presence.name
      ctx.font = '10px system-ui, sans-serif'
      const metrics = ctx.measureText(label)
      const labelW = metrics.width + 8
      const labelH = 16
      const labelX = x
      const labelY = y - labelH - 2

      ctx.globalAlpha = 0.85
      ctx.fillStyle = presence.color
      roundRect(ctx, labelX, labelY, labelW, labelH, 3)
      ctx.fill()

      ctx.globalAlpha = 1
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, labelX + 4, labelY + labelH / 2)

      ctx.restore()
    }
  }
}

// ── Private Helpers ──

/** Draw a cursor arrow at the given screen position. */
function drawCursorArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, name: string): void {
  ctx.save()

  // Cursor arrow shape (12x18 pixels)
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 16)
  ctx.lineTo(4.5, 12.5)
  ctx.lineTo(8, 18)
  ctx.lineTo(10.5, 16.5)
  ctx.lineTo(7, 11)
  ctx.lineTo(12, 11)
  ctx.closePath()

  // Fill with user color
  ctx.fillStyle = color
  ctx.fill()

  // Thin white outline for visibility
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  ctx.stroke()

  // Name label
  ctx.font = 'bold 11px system-ui, sans-serif'
  const metrics = ctx.measureText(name)
  const labelW = metrics.width + 10
  const labelH = 18
  const labelX = 14
  const labelY = 10

  // Label background
  ctx.globalAlpha = 0.9
  ctx.fillStyle = color
  roundRect(ctx, labelX, labelY, labelW, labelH, 4)
  ctx.fill()

  // Label text
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, labelX + 5, labelY + labelH / 2)

  ctx.restore()
}

/** Draw a rounded rectangle path (does not fill or stroke). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
