import { v4 as uuid } from 'uuid'
import type { Layer, SmartObjectLayer, RasterLayer, Effect, DesignDocument, Artboard } from '@/types'
import { getRasterData } from '@/store/raster-data'

// ─── Smart Object creation ─────────────────────────────────────

/**
 * Wrap any layer as a smart object by rasterising its visual content into
 * an embedded base64 PNG.  When `ImageData` cannot be obtained (e.g. for
 * vector/text layers in a headless environment) the smart object is still
 * created with placeholder dimensions — the cache will be filled lazily
 * during rendering.
 */
export function createSmartObject(layer: Layer): SmartObjectLayer {
  let width = 100
  let height = 100
  let base64 = ''

  // Attempt to resolve pixel dimensions from the source layer
  if (layer.type === 'raster') {
    width = layer.width
    height = layer.height
    const imageData = getRasterData(layer.imageChunkId)
    if (imageData) {
      base64 = imageDataToBase64(imageData)
    }
  } else if (layer.type === 'vector' || layer.type === 'text') {
    // Use the transform as a reasonable dimension proxy
    width = Math.max(1, Math.abs(layer.transform.scaleX * 100))
    height = Math.max(1, Math.abs(layer.transform.scaleY * 100))
  } else if (layer.type === 'group') {
    width = Math.max(1, Math.abs(layer.transform.scaleX * 100))
    height = Math.max(1, Math.abs(layer.transform.scaleY * 100))
  }

  return {
    id: uuid(),
    name: `Smart Object (${layer.name})`,
    type: 'smart-object',
    visible: true,
    locked: false,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    effects: [],
    sourceType: 'embedded',
    embeddedData: {
      format: 'png',
      data: base64,
      originalWidth: width,
      originalHeight: height,
    },
    cachedWidth: width,
    cachedHeight: height,
    smartFilters: [],
  }
}

// ─── Editing ────────────────────────────────────────────────────

/**
 * Extract the embedded data from a smart object for editing.
 * Returns a minimal DesignDocument with a single artboard containing
 * a raster layer of the embedded pixels.
 */
export function editSmartObject(smartObj: SmartObjectLayer): DesignDocument | null {
  if (!smartObj.embeddedData) return null

  const rasterLayer: RasterLayer = {
    id: uuid(),
    name: 'Smart Object Content',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: `smart-edit-${smartObj.id}`,
    width: smartObj.embeddedData.originalWidth,
    height: smartObj.embeddedData.originalHeight,
  }

  const artboard: Artboard = {
    id: uuid(),
    name: 'Smart Object',
    x: 0,
    y: 0,
    width: smartObj.embeddedData.originalWidth,
    height: smartObj.embeddedData.originalHeight,
    backgroundColor: '#ffffff',
    layers: [rasterLayer],
  }

  return {
    id: uuid(),
    metadata: {
      title: smartObj.name,
      author: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      colorspace: 'srgb',
      width: smartObj.embeddedData.originalWidth,
      height: smartObj.embeddedData.originalHeight,
    },
    artboards: [artboard],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

// ─── Updating ───────────────────────────────────────────────────

/**
 * Update the embedded data of a smart object after editing.
 */
export function updateSmartObject(
  smartObj: SmartObjectLayer,
  newData: string,
  width: number,
  height: number,
): SmartObjectLayer {
  return {
    ...smartObj,
    embeddedData: {
      format: smartObj.embeddedData?.format ?? 'png',
      data: newData,
      originalWidth: width,
      originalHeight: height,
    },
    cachedWidth: width,
    cachedHeight: height,
  }
}

// ─── Rasterising ────────────────────────────────────────────────

/**
 * Decode the embedded data of a smart object to an ImageData for rendering.
 * Returns null if no embedded data is available or the data is empty.
 */
export function rasterizeSmartObject(smartObj: SmartObjectLayer): ImageData | null {
  if (!smartObj.embeddedData || !smartObj.embeddedData.data) return null
  return base64ToImageData(smartObj.embeddedData.data, smartObj.cachedWidth, smartObj.cachedHeight)
}

// ─── Relinking ──────────────────────────────────────────────────

/**
 * Update the linked file path for a linked smart object.
 */
export function relinkSmartObject(smartObj: SmartObjectLayer, newPath: string): SmartObjectLayer {
  return {
    ...smartObj,
    sourceType: 'linked',
    linkedPath: newPath,
    linkedHash: undefined, // will be refreshed on next load
  }
}

// ─── Duplication ────────────────────────────────────────────────

/**
 * Duplicate a smart object.
 * When `linked` is true, the duplicate shares the same embedded data reference
 * (changes to one will be reflected in the other — like Photoshop linked smart
 * objects).  When `linked` is false, the embedded data is deeply copied so the
 * two are independent.
 */
export function duplicateSmartObject(smartObj: SmartObjectLayer, linked: boolean): SmartObjectLayer {
  const dup: SmartObjectLayer = {
    ...smartObj,
    id: uuid(),
    name: `${smartObj.name} copy`,
    transform: {
      ...smartObj.transform,
      x: smartObj.transform.x + 20,
      y: smartObj.transform.y + 20,
    },
    smartFilters: smartObj.smartFilters ? smartObj.smartFilters.map((f) => ({ ...f, id: uuid() })) : [],
  }

  if (!linked && smartObj.embeddedData) {
    // Deep copy embedded data so edits to one don't affect the other
    dup.embeddedData = { ...smartObj.embeddedData }
  }

  return dup
}

// ─── Smart Filters ──────────────────────────────────────────────

/**
 * Add a non-destructive smart filter to a smart object.
 */
export function addSmartFilter(smartObj: SmartObjectLayer, effect: Effect): SmartObjectLayer {
  return {
    ...smartObj,
    smartFilters: [...(smartObj.smartFilters ?? []), effect],
  }
}

/**
 * Remove a smart filter by ID.
 */
export function removeSmartFilter(smartObj: SmartObjectLayer, effectId: string): SmartObjectLayer {
  return {
    ...smartObj,
    smartFilters: (smartObj.smartFilters ?? []).filter((f) => f.id !== effectId),
  }
}

/**
 * Toggle a smart filter's enabled state.
 */
export function toggleSmartFilter(smartObj: SmartObjectLayer, effectId: string): SmartObjectLayer {
  return {
    ...smartObj,
    smartFilters: (smartObj.smartFilters ?? []).map((f) => (f.id === effectId ? { ...f, enabled: !f.enabled } : f)),
  }
}

// ─── Rasterise to normal layer ──────────────────────────────────

/**
 * Convert a smart object back to a regular raster layer, discarding the
 * non-destructive editing capability.
 */
export function rasterizeToRasterLayer(smartObj: SmartObjectLayer): RasterLayer {
  return {
    id: uuid(),
    name: smartObj.name.replace(/^Smart Object \(/, '').replace(/\)$/, '') || smartObj.name,
    type: 'raster',
    visible: smartObj.visible,
    locked: smartObj.locked,
    opacity: smartObj.opacity,
    blendMode: smartObj.blendMode,
    transform: { ...smartObj.transform },
    effects: [],
    imageChunkId: `rasterized-${smartObj.id}`,
    width: smartObj.cachedWidth,
    height: smartObj.cachedHeight,
  }
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Encode ImageData to a base64 data string (raw RGBA bytes encoded as base64).
 */
export function imageDataToBase64(imageData: ImageData): string {
  const bytes = new Uint8Array(imageData.data.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Decode a base64 string of raw RGBA bytes back to ImageData.
 * Returns null if the data is empty or the dimensions don't match.
 */
export function base64ToImageData(base64: string, width: number, height: number): ImageData | null {
  if (!base64) return null
  try {
    const binary = atob(base64)
    const expectedLen = width * height * 4
    if (binary.length !== expectedLen) return null
    const data = new Uint8ClampedArray(expectedLen)
    for (let i = 0; i < expectedLen; i++) {
      data[i] = binary.charCodeAt(i)
    }
    return new ImageData(data, width, height)
  } catch {
    return null
  }
}
