/**
 * ML Denoise — AI-powered image denoising with fallback to the existing
 * non-local-means denoiser in filters/denoise.ts.
 *
 * When the AI backend is configured and reachable, the image is sent to the
 * endpoint for ML-based denoising (preserving more detail than traditional
 * approaches). If the API call fails or no endpoint is configured, the
 * function falls back to the local `applyDenoise` filter.
 *
 * The final result is blended with the original based on `strength` to give
 * precise control over the denoising amount.
 */

import { getAIConfig, isAIConfigured } from './ai-config'
import { applyDenoise } from '@/filters/denoise'

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Perform ML-based denoising on an image.
 *
 * @param imageData         - Source image to denoise.
 * @param strength          - Denoising strength (0-100). Controls blend between
 *                            original and denoised result.
 * @param detailPreservation - How aggressively to preserve edges/detail (0-100).
 * @returns Denoised ImageData.
 */
export async function performMLDenoise(
  imageData: ImageData,
  strength: number = 50,
  detailPreservation: number = 50,
): Promise<ImageData> {
  // Clamp parameters
  strength = Math.max(0, Math.min(100, strength))
  detailPreservation = Math.max(0, Math.min(100, detailPreservation))

  // No-op for zero strength
  if (strength === 0) {
    return cloneImageData(imageData)
  }

  let denoised: ImageData

  // Attempt ML backend first
  if (isAIConfigured()) {
    try {
      denoised = await requestMLDenoise(imageData, strength, detailPreservation)
    } catch {
      // Fallback to local denoiser on API failure
      denoised = applyLocalDenoise(imageData, strength, detailPreservation)
    }
  } else {
    // No AI configured — use local fallback directly
    denoised = applyLocalDenoise(imageData, strength, detailPreservation)
  }

  // Blend original ↔ denoised based on strength (0 = original, 100 = fully denoised)
  return blendImages(imageData, denoised, strength / 100)
}

// ── ML API request ─────────────────────────────────────────────────────────

async function requestMLDenoise(
  imageData: ImageData,
  strength: number,
  detailPreservation: number,
): Promise<ImageData> {
  const cfg = getAIConfig()
  const endpoint = cfg.inpaintingEndpoint // reuse inpainting endpoint
  if (!endpoint) {
    throw new Error('No endpoint configured for ML denoise.')
  }

  const imageB64 = uint8ToBase64(new Uint8Array(imageData.data.buffer))

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), cfg.timeout)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        filter: 'ml-denoise',
        image: imageB64,
        width: imageData.width,
        height: imageData.height,
        params: {
          strength,
          detailPreservation,
        },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`ML denoise API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { image: string }
    if (!data.image) {
      throw new Error('ML denoise API returned no image.')
    }

    return base64ToImageData(data.image, imageData.width, imageData.height)
  } finally {
    clearTimeout(timerId)
  }
}

// ── Local fallback ─────────────────────────────────────────────────────────

/** Apply the local non-local-means denoiser as a fallback. */
function applyLocalDenoise(imageData: ImageData, strength: number, detailPreservation: number): ImageData {
  return applyDenoise(imageData, {
    // Map 0-100 strength to the denoise filter's expected range
    strength: strength * 2.5, // applyDenoise uses higher absolute values
    detail: detailPreservation / 100,
  })
}

// ── Image blending ─────────────────────────────────────────────────────────

/**
 * Linearly blend two images: `result = lerp(a, b, t)`.
 *
 * @param a - First image (original).
 * @param b - Second image (processed).
 * @param t - Blend factor: 0 = all a, 1 = all b.
 */
export function blendImages(a: ImageData, b: ImageData, t: number): ImageData {
  const w = a.width
  const h = a.height
  const result = new ImageData(w, h)
  const dst = result.data
  const srcA = a.data
  const srcB = b.data
  const invT = 1 - t

  const len = w * h * 4
  for (let i = 0; i < len; i++) {
    dst[i] = Math.round(srcA[i]! * invT + srcB[i]! * t)
  }

  return result
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cloneImageData(img: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height)
}

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
