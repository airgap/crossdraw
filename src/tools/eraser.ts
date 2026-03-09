import { useEditorStore } from '@/store/editor.store'
import { getRasterData, getRasterCanvasCtx, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer, BrushSettings } from '@/types'

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastStampX = 0
let lastStampY = 0
let distRemainder = 0
let strokeStarted = false

const defaultEraser: BrushSettings = {
  size: 20,
  hardness: 1,
  opacity: 1,
  flow: 1,
  color: '#000000',
  spacing: 0.25,
}

let currentEraser: BrushSettings = { ...defaultEraser }

export function getEraserSettings(): BrushSettings {
  return { ...currentEraser }
}

export function setEraserSettings(settings: Partial<BrushSettings>) {
  Object.assign(currentEraser, settings)
}

export function beginEraserStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  // Find existing raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  // If no raster layer selected, find first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  // No raster layer to erase — nothing to do
  if (!rasterLayer) return null

  activeChunkId = rasterLayer.imageChunkId

  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }
  strokeStarted = false
  distRemainder = 0
  return activeChunkId
}

export function paintEraser(points: Array<{ x: number; y: number }>, size?: number) {
  if (!activeChunkId) {
    if (!beginEraserStroke()) return
  }

  const eraserSize = size ?? currentEraser.size
  const spacingPx = Math.max(1, eraserSize * currentEraser.spacing)
  const halfDab = eraserSize / 2

  const ctx = getRasterCanvasCtx(activeChunkId!)
  if (!ctx) return

  // Save compositing state, switch to erase mode
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      stampEraser(ctx, pt.x, pt.y, halfDab)
      lastStampX = pt.x
      lastStampY = pt.y
      distRemainder = 0
      strokeStarted = true
      continue
    }

    const dx = pt.x - lastStampX
    const dy = pt.y - lastStampY
    const segLen = Math.sqrt(dx * dx + dy * dy)
    if (segLen < 0.5) continue

    const ux = dx / segLen
    const uy = dy / segLen

    let d = spacingPx - distRemainder
    while (d <= segLen) {
      const sx = lastStampX + ux * d
      const sy = lastStampY + uy * d
      stampEraser(ctx, sx, sy, halfDab)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }

  ctx.restore()
}

function stampEraser(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

export function endEraserStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Eraser stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
}
