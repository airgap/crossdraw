/**
 * Text to Image — generate raster images from text prompts via the
 * configured AI backend.
 *
 * Sends a POST request to `textToImageEndpoint` with prompt, dimensions,
 * and generation parameters.  Returns one or more ImageData variations.
 */

import { getAIConfig, isAIConfigured } from './ai-config'

// ── Types ──────────────────────────────────────────────────────────────────

export interface TextToImageSettings {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  /** Classifier-free guidance scale (higher = more prompt adherence). */
  cfgScale?: number
  /** Number of diffusion steps. */
  steps?: number
  /** Random seed for reproducibility. */
  seed?: number
  /** Number of image variations to generate. */
  numVariations?: number
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate images from a text prompt.
 *
 * @returns Array of ImageData results (one per variation).
 */
export async function performTextToImage(settings: TextToImageSettings): Promise<ImageData[]> {
  if (!isAIConfigured()) {
    throw new Error('AI backend not configured. Open Preferences -> AI to set endpoints.')
  }

  const cfg = getAIConfig()
  if (!cfg.textToImageEndpoint) {
    throw new Error('Text-to-image endpoint not configured. Set it in AI Settings.')
  }

  const { prompt, negativePrompt, width, height, cfgScale = 7.5, steps = 30, seed, numVariations = 1 } = settings

  if (!prompt.trim()) {
    throw new Error('Prompt cannot be empty.')
  }

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), cfg.timeout)

  try {
    const response = await fetch(cfg.textToImageEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        cfg_scale: cfgScale,
        steps,
        seed: seed ?? null,
        num_variations: numVariations,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`Text-to-image API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { images: string[] }
    if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error('Text-to-image API returned no images.')
    }

    return data.images.map((b64) => base64ToImageData(b64, width, height))
  } finally {
    clearTimeout(timerId)
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
