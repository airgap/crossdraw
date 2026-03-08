/**
 * Pixel data store — lives outside Immer to avoid proxy overhead on large
 * binary buffers and to keep undo/redo patches lightweight.
 */
const store = new Map<string, ImageData>()

/** Rendering cache: OffscreenCanvas per chunk for fast drawImage(). */
const renderCache = new Map<string, OffscreenCanvas>()

export function storeRasterData(id: string, data: ImageData) {
  store.set(id, data)
  renderCache.delete(id) // invalidate
}

export function getRasterData(id: string): ImageData | undefined {
  return store.get(id)
}

export function deleteRasterData(id: string) {
  store.delete(id)
  renderCache.delete(id)
}

/** Get an OffscreenCanvas ready for ctx.drawImage(). Lazily created & cached. */
export function getRasterCanvas(id: string): OffscreenCanvas | undefined {
  let cached = renderCache.get(id)
  if (cached) return cached

  const data = store.get(id)
  if (!data) return undefined

  const canvas = new OffscreenCanvas(data.width, data.height)
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(data, 0, 0)
  renderCache.set(id, canvas)
  return canvas
}

/** Collect all raster chunks referenced by a document (for serialization). */
export function collectRasterChunks(doc: {
  artboards: { layers: { type: string; imageChunkId?: string }[] }[]
}): Record<string, { width: number; height: number; data: Uint8Array }> {
  const chunks: Record<string, { width: number; height: number; data: Uint8Array }> = {}
  for (const artboard of doc.artboards) {
    for (const layer of artboard.layers) {
      if (layer.type === 'raster' && layer.imageChunkId) {
        const imgData = store.get(layer.imageChunkId)
        if (imgData) {
          chunks[layer.imageChunkId] = {
            width: imgData.width,
            height: imgData.height,
            data: new Uint8Array(imgData.data.buffer),
          }
        }
      }
    }
  }
  return chunks
}

/** Restore raster chunks from deserialized data into the store. */
export function restoreRasterChunks(chunks: Record<string, { width: number; height: number; data: Uint8Array }>) {
  for (const [id, chunk] of Object.entries(chunks)) {
    const pixelData = new Uint8ClampedArray(chunk.data)
    let imageData: ImageData
    if (typeof ImageData !== 'undefined') {
      imageData = new ImageData(pixelData, chunk.width, chunk.height)
    } else {
      // Polyfill for non-browser environments (bun test)
      imageData = {
        data: pixelData,
        width: chunk.width,
        height: chunk.height,
        colorSpace: 'srgb',
      } as unknown as ImageData
    }
    storeRasterData(id, imageData)
  }
}
