import { v4 as uuid } from 'uuid'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { storeRasterData, getRasterData, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ── Shared pixel-tool state ──

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null

export function getActiveChunkId(): string | null {
  return activeChunkId
}

// ── Raster layer management ──

export function beginPixelStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
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
  return activeChunkId
}

export function endPixelStroke(historyLabel = 'Pixel draw') {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory(historyLabel, activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
}

// ── Color parsing ──

export function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
}

// ── Bresenham's line ──

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
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

// ── Midpoint ellipse algorithm ──

export function midpointEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): Array<{ x: number; y: number }> {
  if (rx <= 0 || ry <= 0) return []
  const points: Array<{ x: number; y: number }> = []
  const set = new Set<string>()
  const add = (x: number, y: number) => {
    const key = `${x},${y}`
    if (!set.has(key)) {
      set.add(key)
      points.push({ x, y })
    }
  }

  let x = 0
  let y = ry
  const rx2 = rx * rx
  const ry2 = ry * ry

  // Region 1
  let p1 = ry2 - rx2 * ry + 0.25 * rx2
  let dx = 2 * ry2 * x
  let dy = 2 * rx2 * y
  while (dx < dy) {
    add(cx + x, cy + y)
    add(cx - x, cy + y)
    add(cx + x, cy - y)
    add(cx - x, cy - y)
    x++
    dx += 2 * ry2
    if (p1 < 0) {
      p1 += dx + ry2
    } else {
      y--
      dy -= 2 * rx2
      p1 += dx - dy + ry2
    }
  }

  // Region 2
  let p2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2
  while (y >= 0) {
    add(cx + x, cy + y)
    add(cx - x, cy + y)
    add(cx + x, cy - y)
    add(cx - x, cy - y)
    y--
    dy -= 2 * rx2
    if (p2 > 0) {
      p2 += rx2 - dy
    } else {
      x++
      dx += 2 * ry2
      p2 += dx - dy + rx2
    }
  }

  return points
}

// ── Stamping ──

export function stampPixel(
  ctx: OffscreenCanvasRenderingContext2D,
  gx: number,
  gy: number,
  size: number,
  color: string,
  opacity: number,
) {
  const px = gx * size
  const py = gy * size
  ctx.globalAlpha = opacity >= 1 ? 1 : opacity
  ctx.fillStyle = color
  ctx.fillRect(px, py, size, size)
}

export function stampPixelImageData(
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

// ── Erase stamping ──

export function erasePixel(
  ctx: OffscreenCanvasRenderingContext2D,
  gx: number,
  gy: number,
  size: number,
  opacity: number,
) {
  const px = gx * size
  const py = gy * size
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = opacity >= 1 ? 1 : opacity
  ctx.fillStyle = '#000'
  ctx.fillRect(px, py, size, size)
  ctx.restore()
}

export function erasePixelImageData(
  imageData: ImageData,
  gx: number,
  gy: number,
  size: number,
  opacity: number,
) {
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = gx * size + dx
      const py = gy * size + dy
      if (px < 0 || py < 0 || px >= imageData.width || py >= imageData.height) continue
      const idx = (py * imageData.width + px) * 4
      const removeA = opacity
      const currentA = imageData.data[idx + 3]! / 255
      const newA = Math.max(0, currentA - removeA)
      imageData.data[idx + 3] = Math.round(newA * 255)
    }
  }
}
