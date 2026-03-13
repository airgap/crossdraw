/**
 * ML Super Resolution — upscale images using AI with tiled processing.
 *
 * Large images are split into overlapping tiles (default 512x512 with 64px
 * overlap). Each tile is sent individually to the AI endpoint.  Tiles are
 * then reassembled at the target resolution with linear blending in overlap
 * regions to avoid seam artifacts.
 */

import { getAIConfig, isAIConfigured } from './ai-config'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Tile {
  x: number
  y: number
  w: number
  h: number
}

export type SuperResolutionModel = 'default' | 'photo' | 'illustration' | 'anime'

// ── Tile computation ───────────────────────────────────────────────────────

/**
 * Compute a set of overlapping tiles that cover an image of the given size.
 *
 * @param width    - Image width in pixels.
 * @param height   - Image height in pixels.
 * @param tileSize - Maximum tile side length (default 512).
 * @param overlap  - Overlap between adjacent tiles in pixels (default 64).
 * @returns Array of tile descriptors { x, y, w, h }.
 */
export function computeTiles(width: number, height: number, tileSize: number = 512, overlap: number = 64): Tile[] {
  const tiles: Tile[] = []
  const step = Math.max(1, tileSize - overlap)

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const w = Math.min(tileSize, width - x)
      const h = Math.min(tileSize, height - y)
      tiles.push({ x, y, w, h })
    }
  }

  return tiles
}

// ── Tile extraction / reassembly ───────────────────────────────────────────

/** Extract a tile region from an ImageData. */
export function extractTile(imageData: ImageData, tile: Tile): ImageData {
  const { x, y, w, h } = tile
  const result = new ImageData(w, h)
  const src = imageData.data
  const dst = result.data
  const srcW = imageData.width

  for (let row = 0; row < h; row++) {
    const srcOffset = ((y + row) * srcW + x) * 4
    const dstOffset = row * w * 4
    for (let col = 0; col < w; col++) {
      const si = srcOffset + col * 4
      const di = dstOffset + col * 4
      dst[di] = src[si]!
      dst[di + 1] = src[si + 1]!
      dst[di + 2] = src[si + 2]!
      dst[di + 3] = src[si + 3]!
    }
  }

  return result
}

/**
 * Reassemble upscaled tiles into a final image.
 *
 * In overlap regions, pixel values are blended using linear interpolation
 * based on distance from the tile edge.
 *
 * @param tiles         - Original tile descriptors (at source resolution).
 * @param upscaledTiles - Upscaled tile ImageData, parallel to `tiles`.
 * @param scaleFactor   - The scale factor that was applied (e.g. 2 or 4).
 * @param srcWidth      - Original image width.
 * @param srcHeight     - Original image height.
 * @param overlap       - Overlap at source resolution.
 */
export function reassembleTiles(
  tiles: Tile[],
  upscaledTiles: ImageData[],
  scaleFactor: number,
  srcWidth: number,
  srcHeight: number,
  overlap: number = 64,
): ImageData {
  const outW = srcWidth * scaleFactor
  const outH = srcHeight * scaleFactor
  const result = new ImageData(outW, outH)
  const dst = result.data

  // Weight accumulator for blending
  const weight = new Float32Array(outW * outH)
  const accR = new Float32Array(outW * outH)
  const accG = new Float32Array(outW * outH)
  const accB = new Float32Array(outW * outH)
  const accA = new Float32Array(outW * outH)

  const scaledOverlap = overlap * scaleFactor

  for (let ti = 0; ti < tiles.length; ti++) {
    const tile = tiles[ti]!
    const tileImg = upscaledTiles[ti]!
    const tileW = tileImg.width
    const tileH = tileImg.height
    const tileData = tileImg.data

    const dstX = tile.x * scaleFactor
    const dstY = tile.y * scaleFactor

    for (let row = 0; row < tileH; row++) {
      for (let col = 0; col < tileW; col++) {
        // Compute blend weight based on distance from tile edge
        const distLeft = col
        const distRight = tileW - 1 - col
        const distTop = row
        const distBottom = tileH - 1 - row

        let w = 1.0
        if (scaledOverlap > 0) {
          const edgeDist = Math.min(distLeft, distRight, distTop, distBottom)
          if (edgeDist < scaledOverlap) {
            w = edgeDist / scaledOverlap
          }
        }
        // Clamp minimum weight so fully-interior pixels have w=1
        w = Math.max(w, 0.001)

        const outX = dstX + col
        const outY = dstY + row
        if (outX >= outW || outY >= outH) continue

        const srcI = (row * tileW + col) * 4
        const outIdx = outY * outW + outX

        accR[outIdx] = (accR[outIdx] ?? 0) + tileData[srcI]! * w
        accG[outIdx] = (accG[outIdx] ?? 0) + tileData[srcI + 1]! * w
        accB[outIdx] = (accB[outIdx] ?? 0) + tileData[srcI + 2]! * w
        accA[outIdx] = (accA[outIdx] ?? 0) + tileData[srcI + 3]! * w
        weight[outIdx] = (weight[outIdx] ?? 0) + w
      }
    }
  }

  // Normalize
  for (let i = 0; i < outW * outH; i++) {
    const wt = weight[i]!
    if (wt > 0) {
      const di = i * 4
      dst[di] = Math.round(accR[i]! / wt)
      dst[di + 1] = Math.round(accG[i]! / wt)
      dst[di + 2] = Math.round(accB[i]! / wt)
      dst[di + 3] = Math.round(accA[i]! / wt)
    }
  }

  return result
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Perform ML super-resolution on an image.
 *
 * The image is tiled into overlapping patches, each sent to the AI backend.
 * Results are blended and reassembled at the target resolution.
 *
 * @param imageData   - Source image.
 * @param scaleFactor - Upscaling factor (2 or 4).
 * @param model       - Model variant to use.
 * @returns Upscaled ImageData.
 */
export async function performSuperResolution(
  imageData: ImageData,
  scaleFactor: number = 2,
  model: SuperResolutionModel = 'default',
): Promise<ImageData> {
  if (!isAIConfigured()) {
    throw new Error('AI backend not configured. Open Preferences -> AI to set endpoints.')
  }

  const cfg = getAIConfig()
  const endpoint = cfg.inpaintingEndpoint // reuse inpainting endpoint for SR
  if (!endpoint) {
    throw new Error('No endpoint configured for super resolution.')
  }

  const tileSize = 512
  const overlap = 64

  // Compute tiles at source resolution
  const tiles = computeTiles(imageData.width, imageData.height, tileSize, overlap)

  // Process each tile through the API
  const upscaledTiles: ImageData[] = []

  for (const tile of tiles) {
    const tileImg = extractTile(imageData, tile)
    const upscaled = await upscaleTileViaAPI(tileImg, scaleFactor, model, endpoint, cfg.apiKey, cfg.timeout)
    upscaledTiles.push(upscaled)
  }

  // Reassemble
  return reassembleTiles(tiles, upscaledTiles, scaleFactor, imageData.width, imageData.height, overlap)
}

// ── Internal ───────────────────────────────────────────────────────────────

async function upscaleTileViaAPI(
  tileData: ImageData,
  scaleFactor: number,
  model: SuperResolutionModel,
  endpoint: string,
  apiKey: string,
  timeout: number,
): Promise<ImageData> {
  const imageB64 = uint8ToBase64(new Uint8Array(tileData.data.buffer))

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        filter: 'super-resolution',
        image: imageB64,
        width: tileData.width,
        height: tileData.height,
        params: {
          scaleFactor,
          model,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`Super resolution API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { image: string; width?: number; height?: number }
    if (!data.image) {
      throw new Error('Super resolution API returned no image.')
    }

    const outW = data.width ?? tileData.width * scaleFactor
    const outH = data.height ?? tileData.height * scaleFactor
    return base64ToImageData(data.image, outW, outH)
  } finally {
    clearTimeout(timerId)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
}

function base64ToImageData(b64: string, width: number, height: number): ImageData {
  let bytes: Uint8Array
  if (typeof atob === 'function') {
    const binary = atob(b64)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  }

  const clamped = new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const expectedLength = width * height * 4
  if (clamped.length >= expectedLength) {
    return new ImageData(clamped.slice(0, expectedLength), width, height)
  }

  const padded = new Uint8ClampedArray(expectedLength)
  padded.set(clamped)
  return new ImageData(padded, width, height)
}
