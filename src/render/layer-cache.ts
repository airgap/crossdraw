/**
 * Layer rendering cache — caches OffscreenCanvas per layer to avoid
 * re-rendering unchanged layers every frame.
 */
interface CacheEntry {
  canvas: OffscreenCanvas
  hash: string
}

const cache = new Map<string, CacheEntry>()

/**
 * Compute a fast hash of a layer for cache invalidation.
 * Uses JSON.stringify which is fast enough for our layer objects.
 */
function layerHash(layer: { id: string; [key: string]: unknown }): string {
  // Quick structural hash — we skip effects/mask for speed since those
  // are less frequently changed. The layer's top-level properties cover
  // the common case (transform, fill, stroke, paths, visibility, opacity).
  return JSON.stringify({
    id: layer.id,
    visible: layer.visible,
    opacity: layer.opacity,
    transform: layer.transform,
    blendMode: layer.blendMode,
    // Type-specific
    paths: (layer as any).paths,
    fill: (layer as any).fill,
    stroke: (layer as any).stroke,
    text: (layer as any).text,
    fontSize: (layer as any).fontSize,
    fontFamily: (layer as any).fontFamily,
    color: (layer as any).color,
    imageChunkId: (layer as any).imageChunkId,
  })
}

/**
 * Get a cached canvas for a layer, or null if cache is stale/missing.
 */
export function getCachedLayer(layerId: string, layer: { id: string; [key: string]: unknown }): OffscreenCanvas | null {
  const entry = cache.get(layerId)
  if (!entry) return null

  const hash = layerHash(layer)
  if (entry.hash !== hash) {
    cache.delete(layerId)
    return null
  }

  return entry.canvas
}

/**
 * Store a rendered layer canvas in the cache.
 */
export function setCachedLayer(
  layerId: string,
  layer: { id: string; [key: string]: unknown },
  canvas: OffscreenCanvas,
) {
  cache.set(layerId, {
    canvas,
    hash: layerHash(layer),
  })
}

/**
 * Invalidate cache for a specific layer.
 */
export function invalidateLayer(layerId: string) {
  cache.delete(layerId)
}

/**
 * Clear entire cache (e.g. on document switch).
 */
export function clearLayerCache() {
  cache.clear()
}

/**
 * Get cache stats for profiling.
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: Array.from(cache.keys()) }
}
