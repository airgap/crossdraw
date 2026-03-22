import { getRasterCanvasCtx, getRasterData } from '@/store/raster-data'
import { getBrushSettings } from '@/tools/brush'
import { getPixelDrawSettings } from '@/tools/pixel-draw'
import {
  beginPixelStroke,
  endPixelStroke,
  getActiveChunkId,
  bresenhamLine,
  stampPixel,
  stampPixelImageData,
  parseColor,
} from '@/tools/pixel-utils'

let startGx = 0
let startGy = 0
let active = false

export function beginPixelLine(localX: number, localY: number): boolean {
  const chunkId = beginPixelStroke()
  if (!chunkId) return false
  const { pixelSize } = getPixelDrawSettings()
  startGx = Math.floor(localX / pixelSize)
  startGy = Math.floor(localY / pixelSize)
  active = true
  return true
}

export function commitPixelLine(localX: number, localY: number, colorOverride?: string) {
  if (!active) return
  const chunkId = getActiveChunkId()
  if (!chunkId) return

  const { pixelSize, opacity } = getPixelDrawSettings()
  const fillColor = colorOverride ?? getBrushSettings().color
  const endGx = Math.floor(localX / pixelSize)
  const endGy = Math.floor(localY / pixelSize)
  const points = bresenhamLine(startGx, startGy, endGx, endGy)

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(chunkId)
    if (!ctx) return
    for (const pt of points) {
      stampPixel(ctx, pt.x, pt.y, pixelSize, fillColor, opacity)
    }
    ctx.globalAlpha = 1
  } else {
    const imageData = getRasterData(chunkId)
    if (!imageData) return
    const rgb = parseColor(fillColor)
    for (const pt of points) {
      stampPixelImageData(imageData, pt.x, pt.y, pixelSize, rgb, opacity)
    }
  }

  endPixelStroke('Pixel line')
  active = false
}

export function cancelPixelLine() {
  if (active) {
    endPixelStroke('Pixel line')
    active = false
  }
}

export function isPixelLineActive(): boolean {
  return active
}

export function getPixelLineStart(): { gx: number; gy: number } {
  return { gx: startGx, gy: startGy }
}
