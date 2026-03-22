import { getRasterCanvasCtx, getRasterData } from '@/store/raster-data'
import { getPixelDrawSettings } from '@/tools/pixel-draw'
import {
  beginPixelStroke,
  endPixelStroke,
  getActiveChunkId,
  bresenhamLine,
  erasePixel,
  erasePixelImageData,
} from '@/tools/pixel-utils'

let lastX = -1
let lastY = -1
let strokeStarted = false

export function beginPixelErase(): string | null {
  strokeStarted = false
  lastX = -1
  lastY = -1
  return beginPixelStroke()
}

export function paintPixelErase(points: Array<{ x: number; y: number }>) {
  const chunkId = getActiveChunkId()
  if (!chunkId) return

  const { pixelSize, opacity } = getPixelDrawSettings()

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(chunkId)
    if (!ctx) return

    for (const pt of points) {
      const gx = Math.floor(pt.x / pixelSize)
      const gy = Math.floor(pt.y / pixelSize)

      if (!strokeStarted) {
        erasePixel(ctx, gx, gy, pixelSize, opacity)
        lastX = gx
        lastY = gy
        strokeStarted = true
        continue
      }

      if (gx === lastX && gy === lastY) continue

      const linePoints = bresenhamLine(lastX, lastY, gx, gy)
      for (let i = 1; i < linePoints.length; i++) {
        erasePixel(ctx, linePoints[i]!.x, linePoints[i]!.y, pixelSize, opacity)
      }
      lastX = gx
      lastY = gy
    }
  } else {
    const imageData = getRasterData(chunkId)
    if (!imageData) return

    for (const pt of points) {
      const gx = Math.floor(pt.x / pixelSize)
      const gy = Math.floor(pt.y / pixelSize)

      if (!strokeStarted) {
        erasePixelImageData(imageData, gx, gy, pixelSize, opacity)
        lastX = gx
        lastY = gy
        strokeStarted = true
        continue
      }

      if (gx === lastX && gy === lastY) continue

      const linePoints = bresenhamLine(lastX, lastY, gx, gy)
      for (let i = 1; i < linePoints.length; i++) {
        erasePixelImageData(imageData, linePoints[i]!.x, linePoints[i]!.y, pixelSize, opacity)
      }
      lastX = gx
      lastY = gy
    }
  }
}

export function endPixelErase() {
  endPixelStroke('Pixel erase')
  strokeStarted = false
  lastX = -1
  lastY = -1
}
