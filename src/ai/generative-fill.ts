/**
 * Generative Fill — AI-powered inpainting that fills a selected region with
 * content matching a text prompt.
 *
 * Pipeline:
 *   1. Extract context + mask around the current selection (with configurable
 *      padding so the model has context).
 *   2. Encode both as base64 PNG-like RGBA blobs.
 *   3. POST to the configured inpainting endpoint.
 *   4. Composite the result back onto the original image with feathered edges.
 */

import { getAIConfig, isAIConfigured } from './ai-config'
import { getSelectionMask, getSelectionBounds, type SelectionMask } from '@/tools/raster-selection'
import { getRasterData, updateRasterCache } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { RasterLayer } from '@/types'

// ── Settings ──

export interface GenerativeFillSettings {
  prompt: string
  negativePrompt: string
  /** Denoising / replacement strength 0 – 1.  Higher → more creative. */
  strength: number
  /** How many alternative results to request. */
  numVariations: number
}

const defaultSettings: GenerativeFillSettings = {
  prompt: '',
  negativePrompt: '',
  strength: 0.85,
  numVariations: 1,
}

let currentSettings: GenerativeFillSettings = { ...defaultSettings }

export function getGenerativeFillSettings(): GenerativeFillSettings {
  return { ...currentSettings }
}

export function setGenerativeFillSettings(patch: Partial<GenerativeFillSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Mask / context preparation ──

export interface PreparedMask {
  /** Raw RGBA mask data encoded as a Uint8Array (white = fill region). */
  maskData: Uint8Array
  /** Raw RGBA context image data as Uint8Array. */
  contextData: Uint8Array
  /** Bounding box of the padded region relative to the full image. */
  bounds: { x: number; y: number; w: number; h: number }
}

/**
 * Extract the region around the selection with `padding` pixels of context on
 * every side. Returns the cropped mask and cropped context ready to send to
 * the inpainting backend.
 */
export function prepareMaskPNG(mask: SelectionMask, contextImage: ImageData, padding: number = 32): PreparedMask {
  const rawBounds = getSelectionBounds(mask)
  if (!rawBounds) {
    return {
      maskData: new Uint8Array(0),
      contextData: new Uint8Array(0),
      bounds: { x: 0, y: 0, w: 0, h: 0 },
    }
  }

  const imgW = contextImage.width
  const imgH = contextImage.height

  const x0 = Math.max(0, rawBounds.x - padding)
  const y0 = Math.max(0, rawBounds.y - padding)
  const x1 = Math.min(imgW, rawBounds.x + rawBounds.width + padding)
  const y1 = Math.min(imgH, rawBounds.y + rawBounds.height + padding)
  const w = x1 - x0
  const h = y1 - y0

  // Build cropped RGBA mask (white where selected, black otherwise)
  const maskRGBA = new Uint8Array(w * h * 4)
  // Build cropped context (original pixels)
  const ctxRGBA = new Uint8Array(w * h * 4)

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const srcX = x0 + col
      const srcY = y0 + row
      const dstI = (row * w + col) * 4
      const srcI = (srcY * imgW + srcX) * 4

      // Context
      ctxRGBA[dstI] = contextImage.data[srcI]!
      ctxRGBA[dstI + 1] = contextImage.data[srcI + 1]!
      ctxRGBA[dstI + 2] = contextImage.data[srcI + 2]!
      ctxRGBA[dstI + 3] = contextImage.data[srcI + 3]!

      // Mask
      const maskVal = mask.data[srcY * mask.width + srcX]! > 0 ? 255 : 0
      maskRGBA[dstI] = maskVal
      maskRGBA[dstI + 1] = maskVal
      maskRGBA[dstI + 2] = maskVal
      maskRGBA[dstI + 3] = 255
    }
  }

  return {
    maskData: maskRGBA,
    contextData: ctxRGBA,
    bounds: { x: x0, y: y0, w, h },
  }
}

// ── API request ──

/**
 * Send an inpainting request to the configured backend.
 * Returns one or more generated ImageData results.
 */
export async function requestInpainting(
  context: ImageData,
  mask: Uint8Array,
  prompt: string,
  numVariations: number = 1,
): Promise<ImageData[]> {
  const cfg = getAIConfig()
  if (!cfg.inpaintingEndpoint) {
    throw new Error('Inpainting endpoint not configured. Set it in AI Settings.')
  }

  const contextB64 = uint8ToBase64(new Uint8Array(context.data.buffer))
  const maskB64 = uint8ToBase64(mask)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), cfg.timeout)

  try {
    const response = await fetch(cfg.inpaintingEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        image: contextB64,
        mask: maskB64,
        width: context.width,
        height: context.height,
        prompt,
        negative_prompt: currentSettings.negativePrompt,
        strength: currentSettings.strength,
        num_variations: numVariations,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`Inpainting API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { images: string[] }
    if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error('Inpainting API returned no images.')
    }

    return data.images.map((b64) => base64ToImageData(b64, context.width, context.height))
  } finally {
    clearTimeout(timerId)
  }
}

// ── Compositing ──

/**
 * Feathered composite of a generated result back onto the original image.
 * The mask controls the blend region; values 0-255 provide gradual blending.
 */
export function compositeResult(
  original: ImageData,
  generated: ImageData,
  mask: SelectionMask,
  bounds: { x: number; y: number; w: number; h: number },
  featherRadius: number = 4,
): ImageData {
  const w = original.width
  const h = original.height
  const result = new Uint8ClampedArray(original.data)

  for (let row = 0; row < bounds.h; row++) {
    for (let col = 0; col < bounds.w; col++) {
      const imgX = bounds.x + col
      const imgY = bounds.y + row
      if (imgX < 0 || imgX >= w || imgY < 0 || imgY >= h) continue

      const maskIdx = imgY * mask.width + imgX
      const maskVal = mask.data[maskIdx]!
      if (maskVal === 0) continue

      // Compute feather alpha based on distance to mask edge
      let alpha = maskVal / 255

      if (featherRadius > 0) {
        // Check distance to nearest unselected pixel (simple approximation)
        let minDist = featherRadius + 1
        for (let ky = -featherRadius; ky <= featherRadius; ky++) {
          for (let kx = -featherRadius; kx <= featherRadius; kx++) {
            const nx = imgX + kx
            const ny = imgY + ky
            if (nx < 0 || nx >= mask.width || ny < 0 || ny >= mask.height) {
              minDist = Math.min(minDist, Math.max(Math.abs(kx), Math.abs(ky)))
              continue
            }
            if (mask.data[ny * mask.width + nx]! === 0) {
              minDist = Math.min(minDist, Math.max(Math.abs(kx), Math.abs(ky)))
            }
          }
        }
        if (minDist <= featherRadius) {
          alpha *= minDist / (featherRadius + 1)
        }
      }

      const genI = (row * bounds.w + col) * 4
      const imgI = (imgY * w + imgX) * 4

      result[imgI] = Math.round(original.data[imgI]! * (1 - alpha) + generated.data[genI]! * alpha)
      result[imgI + 1] = Math.round(original.data[imgI + 1]! * (1 - alpha) + generated.data[genI + 1]! * alpha)
      result[imgI + 2] = Math.round(original.data[imgI + 2]! * (1 - alpha) + generated.data[genI + 2]! * alpha)
      result[imgI + 3] = Math.round(original.data[imgI + 3]! * (1 - alpha) + generated.data[genI + 3]! * alpha)
    }
  }

  return new ImageData(result, w, h)
}

// ── Full pipeline ──

/**
 * End-to-end generative fill: reads the current selection + raster layer,
 * calls the inpainting API, composites, and writes back to the raster store.
 */
export async function performGenerativeFill(prompt: string, numVariations: number = 1): Promise<ImageData[]> {
  if (!isAIConfigured()) {
    throw new Error('AI backend not configured. Open Preferences → AI to set endpoints.')
  }

  const mask = getSelectionMask()
  if (!mask) throw new Error('No selection active. Create a selection first.')

  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) throw new Error('No artboard found.')

  // Find active raster layer
  const selectedId = store.selection.layerIds[0]
  let rasterLayer: RasterLayer | undefined
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }
  if (!rasterLayer) throw new Error('No raster layer found.')

  const imageData = getRasterData(rasterLayer.imageChunkId)
  if (!imageData) throw new Error('No raster data for selected layer.')

  const prepared = prepareMaskPNG(mask, imageData, 32)
  if (prepared.bounds.w === 0 || prepared.bounds.h === 0) {
    throw new Error('Selection is empty.')
  }

  // Build a cropped context ImageData for the API
  const croppedCtx = new ImageData(new Uint8ClampedArray(prepared.contextData), prepared.bounds.w, prepared.bounds.h)

  const variations = await requestInpainting(croppedCtx, prepared.maskData, prompt, numVariations)

  // Composite first result back
  if (variations.length > 0) {
    const composited = compositeResult(imageData, variations[0]!, mask, prepared.bounds)
    // Write to raster store
    const before = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)
    imageData.data.set(composited.data)
    updateRasterCache(rasterLayer.imageChunkId)

    useEditorStore.getState().pushRasterHistory('Generative Fill', rasterLayer.imageChunkId, before, composited)
  }

  return variations
}

// ── Helpers ──

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

  // Pad with transparent black if short
  const padded = new Uint8ClampedArray(expectedLength)
  padded.set(clamped)
  return new ImageData(padded, width, height)
}
