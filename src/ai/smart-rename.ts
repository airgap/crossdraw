/**
 * Smart Layer Rename — AI-powered layer renaming that uses vision / image
 * captioning to generate meaningful names for layers based on their visual
 * content.
 *
 * For raster layers a 128x128 thumbnail is rendered and sent to the vision
 * endpoint.  For vector / text / group layers the existing text-based bulk
 * rename from `ai-service.ts` is used instead.
 */

import { getAIConfig, isAIConfigured } from './ai-config'
import { bulkRenameLayers, type LayerRename } from './ai-service'
import type { RenameLayerInfo } from './prompt-templates'
import { getRasterData } from '@/store/raster-data'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { Layer, RasterLayer } from '@/types'

// ── Types ──

export interface SmartRenameResult {
  layerId: string
  suggestedName: string
}

// ── Thumbnail generation ──

const THUMB_SIZE = 128

/**
 * Render a 128x128 thumbnail for a raster layer.
 * Returns the pixel data as a base64-encoded RGBA blob.
 */
export function renderLayerThumbnail(layer: RasterLayer): Uint8Array | null {
  const imageData = getRasterData(layer.imageChunkId)
  if (!imageData) return null

  const srcW = imageData.width
  const srcH = imageData.height
  const scale = Math.min(THUMB_SIZE / srcW, THUMB_SIZE / srcH, 1)
  const dstW = Math.max(1, Math.round(srcW * scale))
  const dstH = Math.max(1, Math.round(srcH * scale))

  // Nearest-neighbour downscale (works without Canvas API for test environments)
  const thumb = new Uint8Array(dstW * dstH * 4)
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(Math.floor(x / scale), srcW - 1)
      const srcY = Math.min(Math.floor(y / scale), srcH - 1)
      const srcI = (srcY * srcW + srcX) * 4
      const dstI = (y * dstW + x) * 4
      thumb[dstI] = imageData.data[srcI]!
      thumb[dstI + 1] = imageData.data[srcI + 1]!
      thumb[dstI + 2] = imageData.data[srcI + 2]!
      thumb[dstI + 3] = imageData.data[srcI + 3]!
    }
  }

  return thumb
}

// ── Vision API ──

/**
 * Send a thumbnail to the vision endpoint for captioning.
 * Returns a short descriptive caption.
 */
async function captionImage(thumbnail: Uint8Array): Promise<string> {
  const cfg = getAIConfig()
  if (!cfg.visionEndpoint) {
    throw new Error('Vision endpoint not configured.')
  }

  const b64 = uint8ToBase64(thumbnail)

  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), cfg.timeout)

  try {
    const response = await fetch(cfg.visionEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        image: b64,
        task: 'caption',
        max_tokens: 20,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      throw new Error(`Vision API error (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { caption?: string; text?: string }
    return (data.caption ?? data.text ?? 'Layer').trim()
  } finally {
    clearTimeout(timerId)
  }
}

/**
 * Parse a short, design-file-friendly name from a vision caption.
 * Truncates to ~3-4 words, title-cases, removes filler phrases.
 */
export function parseShortName(caption: string): string {
  // Strip common filler phrases (apply repeatedly for chained prefixes like "image of a ...")
  let name = caption.replace(/\.$/, '').trim()
  const fillerRe = /^(a |an |the |this is |image of |photo of |picture of |a$|an$|the$)/i
  while (fillerRe.test(name)) {
    name = name.replace(fillerRe, '').trim()
  }

  // Title-case each word
  name = name
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')

  return name || 'Layer'
}

// ── Layer name generation ──

/**
 * Generate suggested names for the given layers.
 *
 * - Raster layers: render thumbnails → vision API → parse short names.
 * - Other layers: use the existing text-based bulk rename from ai-service.ts.
 */
export async function generateLayerNames(layers: Layer[]): Promise<SmartRenameResult[]> {
  const results: SmartRenameResult[] = []

  // Separate raster layers (need vision) from others (use text rename)
  const rasterLayers: RasterLayer[] = []
  const otherLayers: Layer[] = []

  for (const layer of layers) {
    if (layer.type === 'raster') {
      rasterLayers.push(layer as RasterLayer)
    } else {
      otherLayers.push(layer)
    }
  }

  // Handle raster layers via vision
  if (rasterLayers.length > 0 && isAIConfigured() && getAIConfig().visionEndpoint) {
    const visionPromises = rasterLayers.map(async (layer) => {
      const thumb = renderLayerThumbnail(layer)
      if (!thumb) {
        return { layerId: layer.id, suggestedName: layer.name }
      }
      try {
        const caption = await captionImage(thumb)
        return { layerId: layer.id, suggestedName: parseShortName(caption) }
      } catch {
        return { layerId: layer.id, suggestedName: layer.name }
      }
    })
    const visionResults = await Promise.all(visionPromises)
    results.push(...visionResults)
  } else {
    // No vision endpoint — use text-based rename for raster layers too
    otherLayers.push(...rasterLayers)
  }

  // Handle non-raster layers via text-based bulk rename
  if (otherLayers.length > 0) {
    const renameInfos: RenameLayerInfo[] = otherLayers.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      details: buildLayerDetails(l),
    }))

    try {
      const renames: LayerRename[] = await bulkRenameLayers(renameInfos)
      for (const r of renames) {
        results.push({ layerId: r.id, suggestedName: r.newName })
      }
    } catch {
      // If AI rename fails, keep original names
      for (const l of otherLayers) {
        results.push({ layerId: l.id, suggestedName: l.name })
      }
    }
  }

  return results
}

// ── Batch rename ──

/**
 * Perform smart rename across layers based on the given scope.
 *
 * @param scope  'selected' — only selected layers
 *               'all' — every layer in the first artboard
 *               'unnamed' — only layers with generic names (Layer N, Rectangle, etc.)
 */
export async function performSmartRename(scope: 'selected' | 'all' | 'unnamed'): Promise<SmartRenameResult[]> {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return []

  let layers: Layer[]

  switch (scope) {
    case 'selected': {
      const selectedIds = new Set(store.selection.layerIds)
      layers = artboard.layers.filter((l) => selectedIds.has(l.id))
      break
    }
    case 'unnamed': {
      layers = artboard.layers.filter((l) => isGenericName(l.name))
      break
    }
    case 'all':
    default:
      layers = [...artboard.layers]
  }

  if (layers.length === 0) return []

  const results = await generateLayerNames(layers)

  // Apply renames via the store
  for (const r of results) {
    if (r.suggestedName && r.suggestedName !== '') {
      store.updateLayer(artboard.id, r.layerId, { name: r.suggestedName })
    }
  }

  return results
}

// ── Helpers ──

/** Generic name patterns that indicate a layer should be renamed. */
const GENERIC_PATTERNS = [
  /^Layer\s*\d*$/i,
  /^Rectangle\s*\d*$/i,
  /^Ellipse\s*\d*$/i,
  /^Group\s*\d*$/i,
  /^Vector\s*\d*$/i,
  /^Text\s*\d*$/i,
  /^Path\s*\d*$/i,
  /^Polygon\s*\d*$/i,
  /^Star\s*\d*$/i,
  /^Image\s*\d*$/i,
  /^Raster\s*\d*$/i,
  /^Untitled\s*\d*$/i,
]

export function isGenericName(name: string): boolean {
  return GENERIC_PATTERNS.some((p) => p.test(name.trim()))
}

function buildLayerDetails(layer: Layer): string {
  switch (layer.type) {
    case 'vector': {
      const fillStr = layer.fill ? `fill:${layer.fill.color}` : 'no fill'
      const strokeStr = layer.stroke ? `stroke:${layer.stroke.color}` : 'no stroke'
      const pathCount = layer.paths.length
      return `${pathCount} path(s), ${fillStr}, ${strokeStr}`
    }
    case 'text':
      return `text="${layer.text?.slice(0, 50) ?? ''}", fontSize=${layer.fontSize}, color=${layer.color}`
    case 'group':
      return `${layer.children.length} children`
    case 'raster':
      return `${layer.width}x${layer.height} raster`
    case 'adjustment':
      return `adjustment: ${(layer as any).adjustmentType ?? 'unknown'}`
    case 'filter':
      return `filter: ${(layer.filterParams as any)?.kind ?? 'unknown'}`
    case 'fill':
      return `fill layer: ${layer.fillType}`
    case 'clone':
      return `clone of ${layer.sourceLayerId}`
    case 'smart-object':
      return `smart object (${layer.sourceType})`
    default:
      return (layer as any).type
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')
}
