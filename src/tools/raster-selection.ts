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
  x: number,
  y: number,
  width: number,
  height: number,
  layerWidth: number,
  layerHeight: number,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const mask =
    mode === 'replace' || !currentMask
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
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  layerWidth: number,
  layerHeight: number,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const mask =
    mode === 'replace' || !currentMask
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
  const mask =
    mode === 'replace' || !currentMask
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
    width,
    height,
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
 * Feather (blur) the selection mask to create soft edges.
 * Applies a separable box blur (3 iterations ≈ Gaussian) to the mask data.
 */
export function featherSelection(radius: number): SelectionMask | null {
  if (!currentMask || radius <= 0) return currentMask
  const { width: w, height: h, data } = currentMask

  // Convert to float for blur
  let src = new Float32Array(w * h)
  for (let i = 0; i < data.length; i++) src[i] = data[i]!

  let dst = new Float32Array(w * h)
  const diam = radius * 2 + 1
  const inv = 1 / diam

  // 3 iterations of box blur ≈ Gaussian
  for (let pass = 0; pass < 3; pass++) {
    // Horizontal pass
    for (let y = 0; y < h; y++) {
      let sum = 0
      for (let dx = -radius; dx <= radius; dx++) {
        sum += src[y * w + Math.max(0, Math.min(w - 1, dx))]!
      }
      dst[y * w] = sum * inv
      for (let x = 1; x < w; x++) {
        sum += src[y * w + Math.min(x + radius, w - 1)]! - src[y * w + Math.max(x - radius - 1, 0)]!
        dst[y * w + x] = sum * inv
      }
    }
    // Swap
    ;[src, dst] = [dst, src]

    // Vertical pass
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = -radius; dy <= radius; dy++) {
        sum += src[Math.max(0, Math.min(h - 1, dy)) * w + x]!
      }
      dst[x] = sum * inv
      for (let y = 1; y < h; y++) {
        sum += src[Math.min(y + radius, h - 1) * w + x]! - src[Math.max(y - radius - 1, 0) * w + x]!
        dst[y * w + x] = sum * inv
      }
    }
    ;[src, dst] = [dst, src]
  }

  // Write back to Uint8Array
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, Math.min(255, Math.round(src[i]!)))
  }

  return currentMask
}

/**
 * Expand selection by `pixels` amount (dilate).
 */
export function expandSelection(pixels: number): SelectionMask | null {
  if (!currentMask || pixels <= 0) return currentMask
  const { width: w, height: h, data } = currentMask
  const out = new Uint8Array(w * h)
  const r = Math.round(pixels)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]! > 0) {
        // Dilate: set all pixels within radius
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) {
              const nx = x + dx
              const ny = y + dy
              if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                out[ny * w + nx] = 255
              }
            }
          }
        }
      }
    }
  }

  currentMask.data.set(out)
  return currentMask
}

/**
 * Contract selection by `pixels` amount (erode).
 */
export function contractSelection(pixels: number): SelectionMask | null {
  if (!currentMask || pixels <= 0) return currentMask
  const { width: w, height: h, data } = currentMask
  const out = new Uint8Array(data)
  const r = Math.round(pixels)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x]! > 0) {
        // Check if any pixel within radius is unselected
        let erode = false
        outer: for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) {
              const nx = x + dx
              const ny = y + dy
              if (nx < 0 || nx >= w || ny < 0 || ny >= h || data[ny * w + nx]! === 0) {
                erode = true
                break outer
              }
            }
          }
        }
        if (erode) out[y * w + x] = 0
      }
    }
  }

  currentMask.data.set(out)
  return currentMask
}

/**
 * Color range selection: selects ALL pixels across the layer that match the target color
 * within the specified fuzziness, with soft gradient falloff for semi-matching pixels.
 * Unlike magic wand, this is non-contiguous — it selects every matching pixel regardless of connectivity.
 */
export function colorRangeSelect(
  imageData: ImageData,
  targetColor: { r: number; g: number; b: number },
  fuzziness: number = 40,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const w = imageData.width
  const h = imageData.height
  const mask =
    mode === 'replace' || !currentMask
      ? { width: w, height: h, data: new Uint8Array(w * h) }
      : { ...currentMask, data: new Uint8Array(currentMask.data) }

  const pixels = imageData.data
  const { r: tr, g: tg, b: tb } = targetColor
  const fuzz = Math.max(0, Math.min(200, fuzziness))

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    const dr = pixels[idx]! - tr
    const dg = pixels[idx + 1]! - tg
    const db = pixels[idx + 2]! - tb
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)

    let value = 0
    if (distance <= fuzz) {
      value = 255
    } else if (fuzz > 0 && distance < fuzz * 2) {
      // Gradient falloff: linear interpolation from 255 to 0 between fuzz and fuzz*2
      value = Math.round(255 * (1 - (distance - fuzz) / fuzz))
    }

    if (value > 0) {
      if (mode === 'subtract') {
        mask.data[i] = Math.max(0, mask.data[i]! - value) as number
      } else {
        mask.data[i] = Math.max(mask.data[i]!, value) as number
      }
    }
  }

  currentMask = mask
  return mask
}

/**
 * Luminosity range selection: selects pixels whose luminosity falls within [min, max],
 * with optional feather for soft falloff at the range boundaries.
 * Luminosity formula: 0.2126*R + 0.7152*G + 0.0722*B (sRGB perceived brightness).
 */
export function luminosityRangeSelect(
  imageData: ImageData,
  min: number = 0,
  max: number = 255,
  feather: number = 0,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask {
  const w = imageData.width
  const h = imageData.height
  const mask =
    mode === 'replace' || !currentMask
      ? { width: w, height: h, data: new Uint8Array(w * h) }
      : { ...currentMask, data: new Uint8Array(currentMask.data) }

  const pixels = imageData.data
  const lo = Math.max(0, min)
  const hi = Math.min(255, max)
  const f = Math.max(0, feather)

  for (let i = 0; i < w * h; i++) {
    const idx = i * 4
    const lum = 0.2126 * pixels[idx]! + 0.7152 * pixels[idx + 1]! + 0.0722 * pixels[idx + 2]!

    let value = 0
    if (lum >= lo && lum <= hi) {
      value = 255
    } else if (f > 0) {
      // Feathered falloff at boundaries
      if (lum < lo && lum >= lo - f) {
        value = Math.round(255 * (1 - (lo - lum) / f))
      } else if (lum > hi && lum <= hi + f) {
        value = Math.round(255 * (1 - (lum - hi) / f))
      }
    }

    if (value > 0) {
      if (mode === 'subtract') {
        mask.data[i] = Math.max(0, mask.data[i]! - value) as number
      } else {
        mask.data[i] = Math.max(mask.data[i]!, value) as number
      }
    }
  }

  currentMask = mask
  return mask
}

/**
 * Get the bounding box of the selection.
 */
export function getSelectionBounds(
  mask: SelectionMask,
): { x: number; y: number; width: number; height: number } | null {
  let minX = mask.width,
    minY = mask.height,
    maxX = 0,
    maxY = 0
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
