import { getRasterData } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

/**
 * Selection mask for pixel-level selections on raster layers.
 * Uses a single-channel Uint8Array (0 = unselected, 255 = selected).
 */
export interface SelectionMask {
  width: number
  height: number
  data: Uint8Array
}

let currentMask: SelectionMask | null = null

export function getSelectionMask(): SelectionMask | null {
  return currentMask
}

export function setSelectionMask(mask: SelectionMask | null) {
  currentMask = mask
}

export function clearSelection() {
  currentMask = null
}

/**
 * Create a rectangular marquee selection.
 */
export function createRectSelection(
  x: number, y: number, width: number, height: number,
  layerWidth: number, layerHeight: number,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const mask = mode === 'replace' || !currentMask
    ? { width: layerWidth, height: layerHeight, data: new Uint8Array(layerWidth * layerHeight) }
    : { ...currentMask, data: new Uint8Array(currentMask.data) }

  const x0 = Math.max(0, Math.round(x))
  const y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(layerWidth, Math.round(x + width))
  const y1 = Math.min(layerHeight, Math.round(y + height))

  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const idx = row * layerWidth + col
      if (mode === 'subtract') {
        mask.data[idx] = 0
      } else {
        mask.data[idx] = 255
      }
    }
  }

  currentMask = mask
  return mask
}

/**
 * Create an elliptical marquee selection.
 */
export function createEllipseSelection(
  cx: number, cy: number, rx: number, ry: number,
  layerWidth: number, layerHeight: number,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const mask = mode === 'replace' || !currentMask
    ? { width: layerWidth, height: layerHeight, data: new Uint8Array(layerWidth * layerHeight) }
    : { ...currentMask, data: new Uint8Array(currentMask.data) }

  const y0 = Math.max(0, Math.floor(cy - ry))
  const y1 = Math.min(layerHeight, Math.ceil(cy + ry))
  const x0 = Math.max(0, Math.floor(cx - rx))
  const x1 = Math.min(layerWidth, Math.ceil(cx + rx))

  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      const dx = (col - cx) / rx
      const dy = (row - cy) / ry
      if (dx * dx + dy * dy <= 1) {
        const idx = row * layerWidth + col
        if (mode === 'subtract') {
          mask.data[idx] = 0
        } else {
          mask.data[idx] = 255
        }
      }
    }
  }

  currentMask = mask
  return mask
}

/**
 * Magic wand: flood-fill selection by color similarity.
 */
export function magicWandSelect(
  layer: RasterLayer,
  startX: number,
  startY: number,
  tolerance: number = 32,
  contiguous: boolean = true,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) {
    return { width: layer.width, height: layer.height, data: new Uint8Array(layer.width * layer.height) }
  }

  const w = imageData.width
  const h = imageData.height
  const mask = mode === 'replace' || !currentMask
    ? { width: w, height: h, data: new Uint8Array(w * h) }
    : { ...currentMask, data: new Uint8Array(currentMask.data) }

  const sx = Math.round(startX)
  const sy = Math.round(startY)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
    currentMask = mask
    return mask
  }

  const pixels = imageData.data
  const targetIdx = (sy * w + sx) * 4
  const tr = pixels[targetIdx]!
  const tg = pixels[targetIdx + 1]!
  const tb = pixels[targetIdx + 2]!
  const ta = pixels[targetIdx + 3]!

  function colorMatch(idx: number): boolean {
    const dr = Math.abs(pixels[idx]! - tr)
    const dg = Math.abs(pixels[idx + 1]! - tg)
    const db = Math.abs(pixels[idx + 2]! - tb)
    const da = Math.abs(pixels[idx + 3]! - ta)
    return dr + dg + db + da <= tolerance * 4
  }

  if (contiguous) {
    // Flood fill from start point
    const visited = new Uint8Array(w * h)
    const stack: number[] = [sy * w + sx]

    while (stack.length > 0) {
      const pos = stack.pop()!
      if (visited[pos]) continue
      visited[pos] = 1

      const pixIdx = pos * 4
      if (!colorMatch(pixIdx)) continue

      if (mode === 'subtract') {
        mask.data[pos] = 0
      } else {
        mask.data[pos] = 255
      }

      const x = pos % w
      const y = Math.floor(pos / w)
      if (x > 0) stack.push(pos - 1)
      if (x < w - 1) stack.push(pos + 1)
      if (y > 0) stack.push(pos - w)
      if (y < h - 1) stack.push(pos + w)
    }
  } else {
    // Non-contiguous: select all pixels matching the color
    for (let i = 0; i < w * h; i++) {
      if (colorMatch(i * 4)) {
        if (mode === 'subtract') {
          mask.data[i] = 0
        } else {
          mask.data[i] = 255
        }
      }
    }
  }

  currentMask = mask
  return mask
}

/**
 * Invert the current selection mask.
 */
export function invertSelection(): SelectionMask | null {
  if (!currentMask) return null
  for (let i = 0; i < currentMask.data.length; i++) {
    currentMask.data[i] = currentMask.data[i]! === 0 ? 255 : 0
  }
  return currentMask
}

/**
 * Select all pixels in the layer.
 */
export function selectAll(width: number, height: number): SelectionMask {
  const mask: SelectionMask = {
    width, height,
    data: new Uint8Array(width * height).fill(255),
  }
  currentMask = mask
  return mask
}

/**
 * Count selected pixels in the mask.
 */
export function getSelectedPixelCount(mask: SelectionMask): number {
  let count = 0
  for (let i = 0; i < mask.data.length; i++) {
    if (mask.data[i]! > 0) count++
  }
  return count
}

/**
 * Get the bounding box of the selection.
 */
export function getSelectionBounds(mask: SelectionMask): { x: number; y: number; width: number; height: number } | null {
  let minX = mask.width, minY = mask.height, maxX = 0, maxY = 0
  let hasSelection = false

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]! > 0) {
        hasSelection = true
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (!hasSelection) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}
