/**
 * Neural Filters — registry and execution engine for AI-powered image filters.
 *
 * Built-in filters include style transfer, colorize, depth blur, super resolution,
 * background blur, and sketch-to-photo. Plugins can register additional filters
 * via `registerFilter()`.
 *
 * Each filter sends the source image (base64-encoded RGBA) along with
 * filter-specific parameters to the configured AI endpoint.
 */

import { getAIConfig, isAIConfigured } from './ai-config'

// ── Types ──────────────────────────────────────────────────────────────────

export interface NeuralFilterParam {
  name: string
  type: 'slider' | 'image' | 'select' | 'boolean'
  min?: number
  max?: number
  default?: number | string | boolean
  options?: string[]
}

export interface NeuralFilter {
  id: string
  name: string
  description: string
  params: NeuralFilterParam[]
  /** Override the global AI endpoint for this specific filter. */
  endpoint?: string
}

// ── Built-in filter registry ───────────────────────────────────────────────

const builtinFilters: NeuralFilter[] = [
  {
    id: 'style-transfer',
    name: 'Style Transfer',
    description: 'Apply the visual style of a reference image to the current layer.',
    params: [
      { name: 'styleImage', type: 'image' },
      { name: 'strength', type: 'slider', min: 0, max: 100, default: 75 },
      { name: 'preserveColor', type: 'boolean', default: false },
    ],
  },
  {
    id: 'colorize',
    name: 'Colorize',
    description: 'Automatically add realistic color to grayscale images.',
    params: [
      { name: 'saturation', type: 'slider', min: 0, max: 200, default: 100 },
      { name: 'colorHint', type: 'select', options: ['auto', 'warm', 'cool', 'vintage', 'vivid'], default: 'auto' },
    ],
  },
  {
    id: 'depth-blur',
    name: 'Depth Blur',
    description: 'Simulate a shallow depth-of-field effect using AI depth estimation.',
    params: [
      { name: 'blurStrength', type: 'slider', min: 0, max: 100, default: 50 },
      { name: 'focalPoint', type: 'slider', min: 0, max: 100, default: 50 },
      { name: 'bokehShape', type: 'select', options: ['circle', 'hexagon', 'star'], default: 'circle' },
    ],
  },
  {
    id: 'super-resolution',
    name: 'Super Resolution',
    description: 'Upscale images using AI to recover fine detail.',
    params: [
      { name: 'scaleFactor', type: 'select', options: ['2x', '4x'], default: '2x' },
      { name: 'denoiseLevel', type: 'slider', min: 0, max: 100, default: 30 },
    ],
  },
  {
    id: 'background-blur',
    name: 'Background Blur',
    description: 'Detect the foreground subject and blur the background.',
    params: [
      { name: 'blurRadius', type: 'slider', min: 0, max: 100, default: 60 },
      { name: 'edgeRefinement', type: 'slider', min: 0, max: 100, default: 50 },
    ],
  },
  {
    id: 'sketch-to-photo',
    name: 'Sketch to Photo',
    description: 'Convert sketches and line drawings into photorealistic images.',
    params: [
      {
        name: 'prompt',
        type: 'select',
        options: ['auto', 'portrait', 'landscape', 'object', 'architecture'],
        default: 'auto',
      },
      { name: 'fidelity', type: 'slider', min: 0, max: 100, default: 70 },
    ],
  },
]

/** Custom filters registered by plugins at runtime. */
const customFilters: NeuralFilter[] = []

// ── Public API ─────────────────────────────────────────────────────────────

/** Return all available neural filters (built-in + plugin-registered). */
export function getAvailableFilters(): NeuralFilter[] {
  return [...builtinFilters, ...customFilters]
}

/** Look up a filter by ID. Returns `undefined` if not found. */
export function getFilterById(id: string): NeuralFilter | undefined {
  return builtinFilters.find((f) => f.id === id) ?? customFilters.find((f) => f.id === id)
}

/** Register a custom filter (e.g. from a plugin). */
export function registerFilter(filter: NeuralFilter): void {
  // Prevent duplicate IDs
  if (getFilterById(filter.id)) {
    throw new Error(`Neural filter with id "${filter.id}" is already registered.`)
  }
  customFilters.push(filter)
}

/** Remove a previously registered custom filter by ID. Returns `true` if found. */
export function unregisterFilter(id: string): boolean {
  const idx = customFilters.findIndex((f) => f.id === id)
  if (idx === -1) return false
  customFilters.splice(idx, 1)
  return true
}

/**
 * Apply a neural filter to an image.
 *
 * Sends the image as base64-encoded RGBA to the filter's endpoint (or the
 * global inpainting endpoint) along with filter-specific parameters.
 *
 * @param imageData - Source image to process.
 * @param filterId  - ID of the registered filter.
 * @param params    - Key-value map of parameter overrides.
 * @returns Processed image as ImageData.
 */
export async function applyNeuralFilter(
  imageData: ImageData,
  filterId: string,
  params: Record<string, unknown> = {},
): Promise<ImageData> {
  const filter = getFilterById(filterId)
  if (!filter) {
    throw new Error(`Unknown neural filter: "${filterId}"`)
  }

  if (!isAIConfigured()) {
    throw new Error('AI backend not configured. Open Preferences -> AI to set endpoints.')
  }

  const cfg = getAIConfig()
  const endpoint = filter.endpoint || cfg.inpaintingEndpoint
  if (!endpoint) {
    throw new Error('No endpoint configured for neural filters.')
  }

  // Merge defaults with provided params
  const mergedParams: Record<string, unknown> = {}
  for (const p of filter.params) {
    mergedParams[p.name] = params[p.name] ?? p.default
  }

  // Encode image as base64
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
        filter: filterId,
        image: imageB64,
        width: imageData.width,
        height: imageData.height,
        params: mergedParams,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`Neural filter API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { image: string; width?: number; height?: number }
    if (!data.image) {
      throw new Error('Neural filter API returned no image.')
    }

    const outWidth = data.width ?? imageData.width
    const outHeight = data.height ?? imageData.height
    return base64ToImageData(data.image, outWidth, outHeight)
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

  // Pad with transparent black if short
  const padded = new Uint8ClampedArray(expectedLength)
  padded.set(clamped)
  return new ImageData(padded, width, height)
}
