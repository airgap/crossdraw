import { getRasterCanvasCtx, getRasterData } from '@/store/raster-data'
import { getBrushSettings } from '@/tools/brush'
import { getPixelDrawSettings } from '@/tools/pixel-draw'
import {
  beginPixelStroke,
  endPixelStroke,
  getActiveChunkId,
  stampPixel,
  stampPixelImageData,
  parseColor,
} from '@/tools/pixel-utils'

let startGx = 0
let startGy = 0
let active = false

export function beginPixelRect(localX: number, localY: number): boolean {
  const chunkId = beginPixelStroke()
  if (!chunkId) return false
  const { pixelSize } = getPixelDrawSettings()
  startGx = Math.floor(localX / pixelSize)
  startGy = Math.floor(localY / pixelSize)
  active = true
  return true
}

export function commitPixelRect(localX: number, localY: number, filled: boolean, colorOverride?: string) {
  if (!active) return
  const chunkId = getActiveChunkId()
  if (!chunkId) return

  const { pixelSize, opacity } = getPixelDrawSettings()
  const fillColor = colorOverride ?? getBrushSettings().color
  const endGx = Math.floor(localX / pixelSize)
  const endGy = Math.floor(localY / pixelSize)

  const minX = Math.min(startGx, endGx)
  const maxX = Math.max(startGx, endGx)
  const minY = Math.min(startGy, endGy)
  const maxY = Math.max(startGy, endGy)

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(chunkId)
    if (!ctx) return
    if (filled) {
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          stampPixel(ctx, gx, gy, pixelSize, fillColor, opacity)
        }
      }
    } else {
      // Top and bottom edges
      for (let gx = minX; gx <= maxX; gx++) {
        stampPixel(ctx, gx, minY, pixelSize, fillColor, opacity)
        stampPixel(ctx, gx, maxY, pixelSize, fillColor, opacity)
      }
      // Left and right edges (excluding corners)
      for (let gy = minY + 1; gy < maxY; gy++) {
        stampPixel(ctx, minX, gy, pixelSize, fillColor, opacity)
        stampPixel(ctx, maxX, gy, pixelSize, fillColor, opacity)
      }
    }
    ctx.globalAlpha = 1
  } else {
    const imageData = getRasterData(chunkId)
    if (!imageData) return
    const rgb = parseColor(fillColor)
    if (filled) {
      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          stampPixelImageData(imageData, gx, gy, pixelSize, rgb, opacity)
        }
      }
    } else {
      for (let gx = minX; gx <= maxX; gx++) {
        stampPixelImageData(imageData, gx, minY, pixelSize, rgb, opacity)
        stampPixelImageData(imageData, gx, maxY, pixelSize, rgb, opacity)
      }
      for (let gy = minY + 1; gy < maxY; gy++) {
        stampPixelImageData(imageData, minX, gy, pixelSize, rgb, opacity)
        stampPixelImageData(imageData, maxX, gy, pixelSize, rgb, opacity)
      }
    }
  }

  endPixelStroke('Pixel rectangle')
  active = false
}

export function cancelPixelRect() {
  if (active) {
    endPixelStroke('Pixel rectangle')
    active = false
  }
}

export function isPixelRectActive(): boolean {
  return active
}

export function getPixelRectStart(): { gx: number; gy: number } {
  return { gx: startGx, gy: startGy }
}
