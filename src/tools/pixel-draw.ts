import { getRasterCanvasCtx, getRasterData } from '@/store/raster-data'
import { getBrushSettings } from '@/tools/brush'
import {
  beginPixelStroke as sharedBeginStroke,
  endPixelStroke as sharedEndStroke,
  getActiveChunkId,
  bresenhamLine,
  stampPixel,
  stampPixelImageData,
  parseColor,
} from '@/tools/pixel-utils'

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

let lastX = -1
let lastY = -1
let strokeStarted = false

export function beginPixelStroke(): string | null {
  strokeStarted = false
  lastX = -1
  lastY = -1
  return sharedBeginStroke()
}

export function paintPixelStroke(points: Array<{ x: number; y: number }>, colorOverride?: string) {
  const chunkId = getActiveChunkId()
  if (!chunkId) {
    if (!beginPixelStroke()) return
  }

  const { pixelSize, opacity } = currentSettings
  const fillColor = colorOverride ?? getBrushSettings().color
  const currentChunkId = getActiveChunkId()!

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(currentChunkId)
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
      for (let i = 1; i < linePoints.length; i++) {
        stampPixel(ctx, linePoints[i]!.x, linePoints[i]!.y, pixelSize, fillColor, opacity)
      }
      lastX = gx
      lastY = gy
    }

    ctx.globalAlpha = 1
  } else {
    const imageData = getRasterData(currentChunkId)
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
  sharedEndStroke('Pixel draw')
  strokeStarted = false
  lastX = -1
  lastY = -1
}
