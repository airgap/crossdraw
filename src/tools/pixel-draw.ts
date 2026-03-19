import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData, getRasterData, getRasterCanvasCtx, syncCanvasToImageData } from '@/store/raster-data'
import { getBrushSettings } from '@/tools/brush'
import type { RasterLayer } from '@/types'

export interface PixelDrawSettings {
  pixelSize: number
  opacity: number
}

const defaultSettings: PixelDrawSettings = {
  pixelSize: 1,
  opacity: 1,
}

let currentSettings: PixelDrawSettings = { ...defaultSettings }

export function getPixelDrawSettings(): PixelDrawSettings {
  return { ...currentSettings }
}

export function setPixelDrawSettings(settings: Partial<PixelDrawSettings>) {
  Object.assign(currentSettings, settings)
}

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastX = -1
let lastY = -1
let strokeStarted = false

function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
}

/** Bresenham's line algorithm — returns all integer grid positions between two points */
function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let dx = Math.abs(x1 - x0)
  let dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    points.push({ x: x0, y: y0 })
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
  return points
}

export function beginPixelStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer
  }

  if (!rasterLayer) {
    const chunkId = uuid()
    const w = artboard.width
    const h = artboard.height
    storeRasterData(chunkId, new ImageData(w, h))

    rasterLayer = {
      id: uuid(),
      name: 'Pixel Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: chunkId,
      width: w,
      height: h,
    }
    store.addLayer(artboard.id, rasterLayer)
    store.selectLayer(rasterLayer.id)
  }

  activeChunkId = rasterLayer.imageChunkId
  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }
  strokeStarted = false
  lastX = -1
  lastY = -1
  return activeChunkId
}

function stampPixel(
  ctx: OffscreenCanvasRenderingContext2D,
  gx: number,
  gy: number,
  size: number,
  color: string,
  opacity: number,
) {
  const px = gx * size
  const py = gy * size
  if (opacity >= 1) {
    ctx.globalAlpha = 1
    ctx.fillStyle = color
  } else {
    ctx.globalAlpha = opacity
    ctx.fillStyle = color
  }
  ctx.fillRect(px, py, size, size)
}

function stampPixelImageData(
  imageData: ImageData,
  gx: number,
  gy: number,
  size: number,
  color: { r: number; g: number; b: number },
  opacity: number,
) {
  const alpha = Math.round(opacity * 255)
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = gx * size + dx
      const py = gy * size + dy
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) continue
      const idx = (py * imageData.width + px) * 4
      const srcA = alpha / 255
      const dstA = imageData.data[idx + 3]! / 255
      const outA = srcA + dstA * (1 - srcA)
      if (outA === 0) continue
      imageData.data[idx] = Math.round((color.r * srcA + imageData.data[idx]! * dstA * (1 - srcA)) / outA)
      imageData.data[idx + 1] = Math.round((color.g * srcA + imageData.data[idx + 1]! * dstA * (1 - srcA)) / outA)
      imageData.data[idx + 2] = Math.round((color.b * srcA + imageData.data[idx + 2]! * dstA * (1 - srcA)) / outA)
      imageData.data[idx + 3] = Math.round(outA * 255)
    }
  }
}

export function paintPixelStroke(points: Array<{ x: number; y: number }>) {
  if (!activeChunkId) {
    if (!beginPixelStroke()) return
  }

  const { pixelSize, opacity } = currentSettings
  const fillColor = getBrushSettings().color

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(activeChunkId!)
    if (!ctx) return

    for (const pt of points) {
      const gx = Math.floor(pt.x / pixelSize)
      const gy = Math.floor(pt.y / pixelSize)

      if (!strokeStarted) {
        stampPixel(ctx, gx, gy, pixelSize, fillColor, opacity)
        lastX = gx
        lastY = gy
        strokeStarted = true
        continue
      }

      if (gx === lastX && gy === lastY) continue

      const linePoints = bresenhamLine(lastX, lastY, gx, gy)
      // Skip first point (already drawn as lastX/lastY)
      for (let i = 1; i < linePoints.length; i++) {
        stampPixel(ctx, linePoints[i]!.x, linePoints[i]!.y, pixelSize, fillColor, opacity)
      }
      lastX = gx
      lastY = gy
    }

    ctx.globalAlpha = 1
  } else {
    // Fallback for non-browser (bun test)
    const imageData = getRasterData(activeChunkId!)
    if (!imageData) return
    const rgb = parseColor(fillColor)

    for (const pt of points) {
      const gx = Math.floor(pt.x / pixelSize)
      const gy = Math.floor(pt.y / pixelSize)

      if (!strokeStarted) {
        stampPixelImageData(imageData, gx, gy, pixelSize, rgb, opacity)
        lastX = gx
        lastY = gy
        strokeStarted = true
        continue
      }

      if (gx === lastX && gy === lastY) continue

      const linePoints = bresenhamLine(lastX, lastY, gx, gy)
      for (let i = 1; i < linePoints.length; i++) {
        stampPixelImageData(imageData, linePoints[i]!.x, linePoints[i]!.y, pixelSize, rgb, opacity)
      }
      lastX = gx
      lastY = gy
    }
  }
}

export function endPixelStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Pixel draw', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  lastX = -1
  lastY = -1
}
