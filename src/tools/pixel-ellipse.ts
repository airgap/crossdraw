import { getRasterCanvasCtx, getRasterData } from '@/store/raster-data'
import { getBrushSettings } from '@/tools/brush'
import { getPixelDrawSettings } from '@/tools/pixel-draw'
import {
  beginPixelStroke,
  endPixelStroke,
  getActiveChunkId,
  midpointEllipse,
  stampPixel,
  stampPixelImageData,
  parseColor,
} from '@/tools/pixel-utils'

let startGx = 0
let startGy = 0
let active = false

export function beginPixelEllipse(localX: number, localY: number): boolean {
  const chunkId = beginPixelStroke()
  if (!chunkId) return false
  const { pixelSize } = getPixelDrawSettings()
  startGx = Math.floor(localX / pixelSize)
  startGy = Math.floor(localY / pixelSize)
  active = true
  return true
}

export function commitPixelEllipse(localX: number, localY: number, filled: boolean, colorOverride?: string) {
  if (!active) return
  const chunkId = getActiveChunkId()
  if (!chunkId) return

  const { pixelSize, opacity } = getPixelDrawSettings()
  const fillColor = colorOverride ?? getBrushSettings().color
  const endGx = Math.floor(localX / pixelSize)
  const endGy = Math.floor(localY / pixelSize)

  const cx = Math.round((startGx + endGx) / 2)
  const cy = Math.round((startGy + endGy) / 2)
  const rx = Math.abs(endGx - startGx) / 2
  const ry = Math.abs(endGy - startGy) / 2

  if (rx < 1 && ry < 1) {
    // Single pixel
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
    if (hasOffscreenCanvas) {
      const ctx = getRasterCanvasCtx(chunkId)
      if (ctx) stampPixel(ctx, cx, cy, pixelSize, fillColor, opacity)
    } else {
      const imageData = getRasterData(chunkId)
      if (imageData) stampPixelImageData(imageData, cx, cy, pixelSize, parseColor(fillColor), opacity)
    }
    endPixelStroke('Pixel ellipse')
    active = false
    return
  }

  const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

  if (filled) {
    // Scanline fill: for each row, find min/max x from outline points
    const outlinePoints = midpointEllipse(cx, cy, Math.round(rx), Math.round(ry))
    const rowBounds = new Map<number, { min: number; max: number }>()
    for (const pt of outlinePoints) {
      const existing = rowBounds.get(pt.y)
      if (existing) {
        existing.min = Math.min(existing.min, pt.x)
        existing.max = Math.max(existing.max, pt.x)
      } else {
        rowBounds.set(pt.y, { min: pt.x, max: pt.x })
      }
    }

    if (hasOffscreenCanvas) {
      const ctx = getRasterCanvasCtx(chunkId)
      if (!ctx) {
        endPixelStroke('Pixel ellipse')
        active = false
        return
      }
      for (const [row, bounds] of rowBounds) {
        for (let gx = bounds.min; gx <= bounds.max; gx++) {
          stampPixel(ctx, gx, row, pixelSize, fillColor, opacity)
        }
      }
      ctx.globalAlpha = 1
    } else {
      const imageData = getRasterData(chunkId)
      if (!imageData) {
        endPixelStroke('Pixel ellipse')
        active = false
        return
      }
      const rgb = parseColor(fillColor)
      for (const [row, bounds] of rowBounds) {
        for (let gx = bounds.min; gx <= bounds.max; gx++) {
          stampPixelImageData(imageData, gx, row, pixelSize, rgb, opacity)
        }
      }
    }
  } else {
    // Outline only
    const points = midpointEllipse(cx, cy, Math.round(rx), Math.round(ry))
    if (hasOffscreenCanvas) {
      const ctx = getRasterCanvasCtx(chunkId)
      if (!ctx) {
        endPixelStroke('Pixel ellipse')
        active = false
        return
      }
      for (const pt of points) {
        stampPixel(ctx, pt.x, pt.y, pixelSize, fillColor, opacity)
      }
      ctx.globalAlpha = 1
    } else {
      const imageData = getRasterData(chunkId)
      if (!imageData) {
        endPixelStroke('Pixel ellipse')
        active = false
        return
      }
      const rgb = parseColor(fillColor)
      for (const pt of points) {
        stampPixelImageData(imageData, pt.x, pt.y, pixelSize, rgb, opacity)
      }
    }
  }

  endPixelStroke('Pixel ellipse')
  active = false
}

export function cancelPixelEllipse() {
  if (active) {
    endPixelStroke('Pixel ellipse')
    active = false
  }
}

export function isPixelEllipseActive(): boolean {
  return active
}

export function getPixelEllipseStart(): { gx: number; gy: number } {
  return { gx: startGx, gy: startGy }
}
