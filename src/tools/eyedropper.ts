import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

/**
 * Eyedropper tool: sample a pixel color from the viewport canvas.
 */

export interface EyedropperState {
  /** Last sampled color as hex #RRGGBB */
  lastColor: string | null
  /** Last sampled opacity 0-1 */
  lastOpacity: number
  /** Whether the alt-key temporary mode is active */
  tempMode: boolean
  /** The tool to return to when temp mode ends */
  returnTool: string | null
}

const state: EyedropperState = {
  lastColor: null,
  lastOpacity: 1,
  tempMode: false,
  returnTool: null,
}

export function getEyedropperState(): EyedropperState {
  return state
}

/**
 * Sample a pixel from the canvas at the given screen coordinates.
 */
export function sampleColor(
  canvas: HTMLCanvasElement,
  screenX: number,
  screenY: number,
): { hex: string; opacity: number } {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { hex: '#000000', opacity: 0 }

  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const x = Math.round((screenX - rect.left) * dpr)
  const y = Math.round((screenY - rect.top) * dpr)

  const pixel = ctx.getImageData(x, y, 1, 1).data
  const r = pixel[0]!
  const g = pixel[1]!
  const b = pixel[2]!
  const a = pixel[3]! / 255

  const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`

  state.lastColor = hex
  state.lastOpacity = a

  return { hex, opacity: a }
}

/**
 * Apply the sampled color to the selected layer.
 * Default: fill. Shift: stroke.
 */
export function applyColorToSelection(hex: string, opacity: number, shiftKey: boolean) {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return

  const selectedId = store.selection.layerIds[0]
  if (!selectedId) {
    // No selection — copy to clipboard
    navigator.clipboard.writeText(hex).catch(() => {})
    return
  }

  const layer = artboard.layers.find((l) => l.id === selectedId)
  if (!layer) return

  if (shiftKey) {
    // Apply to stroke
    if (layer.type === 'vector') {
      const stroke = layer.stroke ?? {
        width: 1,
        color: hex,
        opacity,
        position: 'center' as const,
        dasharray: undefined,
        linecap: 'butt' as const,
        linejoin: 'miter' as const,
        miterLimit: 4,
      }
      store.setStroke(artboard.id, layer.id, { ...stroke, color: hex, opacity })
    }
  } else {
    // Apply to fill
    if (layer.type === 'vector') {
      store.setFill(artboard.id, layer.id, { type: 'solid', color: hex, opacity })
    } else if (layer.type === 'text') {
      store.updateLayer(artboard.id, layer.id, { color: hex } as Partial<typeof layer>)
    }
  }
}

/**
 * Render a magnified loupe around the cursor position.
 */
export function renderLoupe(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  screenX: number,
  screenY: number,
) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const cx = Math.round((screenX - rect.left) * dpr)
  const cy = Math.round((screenY - rect.top) * dpr)

  const gridSize = 9
  const cellSize = 11
  const half = Math.floor(gridSize / 2)
  const loupeSize = gridSize * cellSize

  // Position loupe offset from cursor
  const loupeX = screenX - rect.left + 20
  const loupeY = screenY - rect.top - loupeSize - 10

  // Get source pixel data
  const sx = cx - half
  const sy = cy - half
  let imageData: ImageData
  try {
    imageData = ctx.getImageData(sx, sy, gridSize, gridSize)
  } catch {
    return
  }

  // Draw loupe background
  ctx.save()
  ctx.fillStyle = '#222'
  ctx.strokeStyle = '#666'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(loupeX - 2, loupeY - 2, loupeSize + 4, loupeSize + 24, 4)
  ctx.fill()
  ctx.stroke()

  // Draw magnified pixels
  for (let py = 0; py < gridSize; py++) {
    for (let px = 0; px < gridSize; px++) {
      const i = (py * gridSize + px) * 4
      const r = imageData.data[i]!
      const g = imageData.data[i + 1]!
      const b = imageData.data[i + 2]!
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.fillRect(loupeX + px * cellSize, loupeY + py * cellSize, cellSize, cellSize)
    }
  }

  // Draw crosshair on center cell
  const centerX = loupeX + half * cellSize
  const centerY = loupeY + half * cellSize
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.strokeRect(centerX, centerY, cellSize, cellSize)

  // Draw hex label
  const centerPixel = ctx.getImageData(cx, cy, 1, 1).data
  const hex = `#${centerPixel[0]!.toString(16).padStart(2, '0')}${centerPixel[1]!.toString(16).padStart(2, '0')}${centerPixel[2]!.toString(16).padStart(2, '0')}`
  ctx.fillStyle = '#fff'
  ctx.font = '11px monospace'
  ctx.fillText(hex.toUpperCase(), loupeX + 4, loupeY + loupeSize + 14)

  ctx.restore()
}
