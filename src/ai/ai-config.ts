/**
 * AI Backend Configuration for generative/vision features.
 *
 * Separate from the existing ai-service.ts (which is Claude-specific for
 * design-assistant features).  This module provides a generic inpainting /
 * text-to-image / vision endpoint configuration that generative fill,
 * generative expand, the remove tool, and smart rename all consume.
 */

export interface AIBackendConfig {
  /** URL for the inpainting / outpainting API (e.g. Stable Diffusion, DALL-E). */
  inpaintingEndpoint: string
  /** URL for text-to-image generation. */
  textToImageEndpoint: string
  /** URL for vision / image captioning (used by smart rename). */
  visionEndpoint: string
  /** Bearer / API key sent with every request. */
  apiKey: string
  /** Request timeout in milliseconds. */
  timeout: number
}

const STORAGE_KEY = 'crossdraw:ai-backend-config'

let config: AIBackendConfig = {
  inpaintingEndpoint: '',
  textToImageEndpoint: '',
  visionEndpoint: '',
  apiKey: '',
  timeout: 60000,
}

// Hydrate from localStorage on module load (browser only)
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<AIBackendConfig>
    Object.assign(config, parsed)
  }
} catch {
  // ignore
}

/** Return the current AI backend configuration (copy). */
export function getAIConfig(): AIBackendConfig {
  return { ...config }
}

/** Merge partial updates into the AI backend configuration and persist. */
export function setAIConfig(patch: Partial<AIBackendConfig>): void {
  Object.assign(config, patch)
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    }
  } catch {
    // SSR / test environments
  }
}

/** Returns `true` when at least one endpoint has been configured. */
export function isAIConfigured(): boolean {
  return config.inpaintingEndpoint !== '' || config.textToImageEndpoint !== '' || config.visionEndpoint !== ''
}
