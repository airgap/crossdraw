import { describe, it, expect, beforeEach } from 'vitest'
import {
  storeRasterData,
  getRasterData,
  deleteRasterData,
  collectRasterChunks,
  restoreRasterChunks,
} from '@/store/raster-data'

// Minimal ImageData polyfill for bun test environment
function makeImageData(w: number, h: number): ImageData {
  if (typeof ImageData !== 'undefined') {
    return new ImageData(w, h)
  }
  // Polyfill for test
  return {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
    colorSpace: 'srgb',
  } as unknown as ImageData
}

describe('raster data store', () => {
  beforeEach(() => {
    deleteRasterData('test-1')
    deleteRasterData('test-2')
  })

  it('should store and retrieve raster data', () => {
    const img = makeImageData(10, 10)
    img.data[0] = 255 // R
    storeRasterData('test-1', img)

    const retrieved = getRasterData('test-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.width).toBe(10)
    expect(retrieved!.height).toBe(10)
    expect(retrieved!.data[0]).toBe(255)
  })

  it('should return undefined for missing data', () => {
    expect(getRasterData('nonexistent')).toBeUndefined()
  })

  it('should delete raster data', () => {
    const img = makeImageData(5, 5)
    storeRasterData('test-2', img)
    expect(getRasterData('test-2')).toBeDefined()

    deleteRasterData('test-2')
    expect(getRasterData('test-2')).toBeUndefined()
  })

  it('should collect raster chunks from a document structure', () => {
    const img = makeImageData(4, 4)
    img.data[0] = 42
    storeRasterData('chunk-a', img)

    const doc = {
      artboards: [
        {
          layers: [
            { type: 'raster', imageChunkId: 'chunk-a' },
            { type: 'vector' },
          ],
        },
      ],
    }

    const chunks = collectRasterChunks(doc)
    expect(chunks['chunk-a']).toBeDefined()
    expect(chunks['chunk-a']!.width).toBe(4)
    expect(chunks['chunk-a']!.height).toBe(4)
    expect(chunks['chunk-a']!.data[0]).toBe(42)

    deleteRasterData('chunk-a')
  })

  it('should restore raster chunks into the store', () => {
    const data = new Uint8Array(16 * 4) // 4x4 RGBA
    data[0] = 128

    restoreRasterChunks({
      'restored-1': { width: 4, height: 4, data },
    })

    const retrieved = getRasterData('restored-1')
    expect(retrieved).toBeDefined()
    expect(retrieved!.width).toBe(4)
    expect(retrieved!.data[0]).toBe(128)

    deleteRasterData('restored-1')
  })
})
