/**
 * Text to Vector — generate vector paths from a text prompt.
 *
 * Pipeline:
 *   1. Call the text-to-image API to generate a raster image from the prompt.
 *   2. Auto-trace the result using the existing `traceImage` from image-trace.ts.
 *   3. Return VectorLayer descriptions ready to insert into the document.
 *
 * Style presets control both the image generation prompt suffix and the
 * tracing parameters (e.g. flat illustrations use fewer colors / simpler
 * paths, while line-art uses a high-contrast threshold).
 */

import { v4 as uuid } from 'uuid'
import type { VectorLayer } from '@/types'
import { traceImage, defaultTraceOptions, type TraceOptions } from '@/tools/image-trace'
import { performTextToImage } from './text-to-image'

// ── Style presets ──────────────────────────────────────────────────────────

export type VectorStyle = 'flat' | 'line-art' | 'detailed' | 'sketch' | 'geometric'

export interface VectorStylePreset {
  /** Suffix appended to the user prompt for better generation results. */
  promptSuffix: string
  /** Trace options tuned for this style. */
  traceOptions: Partial<TraceOptions>
  /** Negative prompt additions. */
  negativePrompt: string
}

const stylePresets: Record<VectorStyle, VectorStylePreset> = {
  flat: {
    promptSuffix: ', flat vector illustration, minimal colors, clean shapes, solid fills',
    traceOptions: {
      threshold: 128,
      minPathLength: 12,
      simplifyTolerance: 2.5,
      smoothing: true,
    },
    negativePrompt: 'photorealistic, gradient, shadow, texture, noise',
  },
  'line-art': {
    promptSuffix: ', black and white line art, clean lines, no fill, high contrast',
    traceOptions: {
      threshold: 200,
      minPathLength: 6,
      simplifyTolerance: 1.0,
      smoothing: true,
    },
    negativePrompt: 'color, gradient, photorealistic, shading',
  },
  detailed: {
    promptSuffix: ', detailed vector illustration, clean paths',
    traceOptions: {
      threshold: 128,
      minPathLength: 4,
      simplifyTolerance: 0.8,
      smoothing: true,
    },
    negativePrompt: 'blurry, noisy, photorealistic',
  },
  sketch: {
    promptSuffix: ', hand-drawn sketch style, pencil lines, rough strokes',
    traceOptions: {
      threshold: 160,
      minPathLength: 5,
      simplifyTolerance: 1.2,
      smoothing: false,
    },
    negativePrompt: 'photorealistic, clean, digital, gradient',
  },
  geometric: {
    promptSuffix: ', geometric shapes, abstract, polygonal, low poly art',
    traceOptions: {
      threshold: 128,
      minPathLength: 8,
      simplifyTolerance: 3.0,
      smoothing: false,
    },
    negativePrompt: 'organic, photorealistic, curved, natural',
  },
}

/** Get the style preset for a given vector style. */
export function getStylePreset(style: VectorStyle): VectorStylePreset {
  return stylePresets[style]
}

/** Get all available style names. */
export function getAvailableStyles(): VectorStyle[] {
  return Object.keys(stylePresets) as VectorStyle[]
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface TextToVectorOptions {
  /** Text description of the desired vector image. */
  prompt: string
  /** Visual style preset to use. */
  style: VectorStyle
  /** Optional fill colors for the generated paths. */
  colors?: string[]
  /** Level of detail: controls simplification tolerance. 0 = very simple, 100 = very detailed. */
  detail?: number
  /** Image generation resolution (square). */
  size?: number
}

/**
 * Generate vector layers from a text prompt.
 *
 * @returns Array of VectorLayer objects ready to add to an artboard.
 */
export async function performTextToVector(options: TextToVectorOptions): Promise<VectorLayer[]> {
  const { prompt, style, colors, detail, size = 512 } = options
  const preset = stylePresets[style]

  // Step 1: Generate a raster image from the prompt
  const augmentedPrompt = prompt + preset.promptSuffix
  const images = await performTextToImage({
    prompt: augmentedPrompt,
    negativePrompt: preset.negativePrompt,
    width: size,
    height: size,
    numVariations: 1,
  })

  if (images.length === 0) {
    throw new Error('Text-to-image API returned no images.')
  }

  const sourceImage = images[0]!

  // Step 2: Build trace options, optionally adjusting for detail level
  const traceOpts: TraceOptions = {
    ...defaultTraceOptions,
    ...preset.traceOptions,
  }

  if (detail !== undefined) {
    // Map detail 0-100 to simplifyTolerance: high detail = low tolerance
    const baseTolerance = traceOpts.simplifyTolerance
    traceOpts.simplifyTolerance = baseTolerance * (1 - detail / 125)
    // Minimum path length scales inversely with detail
    traceOpts.minPathLength = Math.max(3, Math.round(traceOpts.minPathLength * (1 - detail / 150)))
  }

  // Step 3: Trace the raster image to vector contours
  const contours = traceImage(sourceImage, traceOpts)

  if (contours.length === 0) {
    throw new Error('Tracing produced no vector paths. Try adjusting the style or detail level.')
  }

  // Step 4: Build VectorLayer objects
  const layers: VectorLayer[] = []

  // Group contours into a single vector layer
  const paths = contours.map((segments, i) => ({
    id: uuid(),
    segments,
    closed: true,
    fillRule: 'evenodd' as const,
    fill:
      colors && colors[i % colors.length]
        ? { type: 'solid' as const, color: colors[i % colors.length]!, opacity: 1 }
        : undefined,
  }))

  const vectorLayer: VectorLayer = {
    id: uuid(),
    name: `AI Vector: ${prompt.slice(0, 40)}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    effects: [],
    paths,
    fill: { type: 'solid', color: colors?.[0] ?? '#000000', opacity: 1 },
    stroke:
      style === 'line-art'
        ? {
            color: '#000000',
            width: 2,
            opacity: 1,
            position: 'center',
            linecap: 'round',
            linejoin: 'round',
            miterLimit: 4,
          }
        : null,
  }

  layers.push(vectorLayer)

  return layers
}
