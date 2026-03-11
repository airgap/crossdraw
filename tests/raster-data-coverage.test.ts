import { describe, test, expect, beforeEach } from 'bun:test'
import {
  storeRasterData,
  getRasterData,
  deleteRasterData,
  getRasterCanvas,
  getRasterCanvasCtx,
  syncCanvasToImageData,
  updateRasterCache,
  collectRasterChunks,
  restoreRasterChunks,
} from '@/store/raster-data'

// Minimal ImageData polyfill
function makeImageData(w: number, h: number, fill = 0): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) data.fill(fill)
  if (typeof ImageData !== 'undefined') {
    return new ImageData(new Uint8ClampedArray(data), w, h)
  }
  return { width: w, height: h, data, colorSpace: 'srgb' } as unknown as ImageData
}

describe('raster-data additional coverage', () => {
  const id = 'coverage-test'

  beforeEach(() => {
    deleteRasterData(id)
    deleteRasterData('cov-a')
    deleteRasterData('cov-b')
  })

  test('updateRasterCache with no data is no-op', () => {
    // Should not throw
    updateRasterCache('nonexistent')
  })

  test('getRasterCanvas returns undefined for missing data', () => {
    expect(getRasterCanvas('nonexistent')).toBeUndefined()
  })

  test('getRasterCanvasCtx returns undefined for missing data', () => {
    expect(getRasterCanvasCtx('nonexistent')).toBeUndefined()
  })

  test('syncCanvasToImageData is no-op when no cache', () => {
    // Should not throw
    syncCanvasToImageData('nonexistent')
  })

  test('collectRasterChunks ignores non-raster layers', () => {
    const doc = {
      artboards: [{ layers: [{ type: 'vector' }, { type: 'text' }] }],
    }
    const chunks = collectRasterChunks(doc)
    expect(Object.keys(chunks)).toHaveLength(0)
  })

  test('collectRasterChunks ignores raster layers without stored data', () => {
    const doc = {
      artboards: [{ layers: [{ type: 'raster', imageChunkId: 'missing-chunk' }] }],
    }
    const chunks = collectRasterChunks(doc)
    expect(Object.keys(chunks)).toHaveLength(0)
  })

  test('collectRasterChunks collects from multiple artboards', () => {
    const imgA = makeImageData(2, 2, 10)
    const imgB = makeImageData(3, 3, 20)
    storeRasterData('cov-a', imgA)
    storeRasterData('cov-b', imgB)

    const doc = {
      artboards: [
        { layers: [{ type: 'raster', imageChunkId: 'cov-a' }] },
        { layers: [{ type: 'raster', imageChunkId: 'cov-b' }] },
      ],
    }
    const chunks = collectRasterChunks(doc)
    expect(Object.keys(chunks)).toHaveLength(2)
    expect(chunks['cov-a']!.width).toBe(2)
    expect(chunks['cov-b']!.width).toBe(3)

    deleteRasterData('cov-a')
    deleteRasterData('cov-b')
  })

  test('collectRasterChunks handles empty artboards', () => {
    const doc = {
      artboards: [{ layers: [] }],
    }
    const chunks = collectRasterChunks(doc)
    expect(Object.keys(chunks)).toHaveLength(0)
  })

  test('collectRasterChunks handles multiple raster layers in same artboard', () => {
    const imgA = makeImageData(2, 2, 10)
    const imgB = makeImageData(3, 3, 20)
    storeRasterData('cov-a', imgA)
    storeRasterData('cov-b', imgB)

    const doc = {
      artboards: [
        {
          layers: [
            { type: 'raster', imageChunkId: 'cov-a' },
            { type: 'vector' },
            { type: 'raster', imageChunkId: 'cov-b' },
          ],
        },
      ],
    }
    const chunks = collectRasterChunks(doc)
    expect(Object.keys(chunks)).toHaveLength(2)

    deleteRasterData('cov-a')
    deleteRasterData('cov-b')
  })

  test('restoreRasterChunks restores multiple chunks', () => {
    const dataA = new Uint8Array(4 * 4 * 4)
    dataA[0] = 111
    const dataB = new Uint8Array(2 * 2 * 4)
    dataB[0] = 222

    restoreRasterChunks({
      'cov-a': { width: 4, height: 4, data: dataA },
      'cov-b': { width: 2, height: 2, data: dataB },
    })

    const a = getRasterData('cov-a')
    const b = getRasterData('cov-b')
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    expect(a!.data[0]).toBe(111)
    expect(b!.data[0]).toBe(222)

    deleteRasterData('cov-a')
    deleteRasterData('cov-b')
  })

  test('restoreRasterChunks with empty object is no-op', () => {
    restoreRasterChunks({})
    // No error thrown
  })

  test('storeRasterData stores and retrieves correctly', () => {
    const img = makeImageData(4, 4, 42)
    storeRasterData(id, img)
    const retrieved = getRasterData(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.width).toBe(4)
    expect(retrieved!.height).toBe(4)
    expect(retrieved!.data[0]).toBe(42)
    deleteRasterData(id)
  })

  test('storeRasterData overwrites existing data', () => {
    const img1 = makeImageData(4, 4, 10)
    storeRasterData(id, img1)
    const img2 = makeImageData(8, 8, 20)
    storeRasterData(id, img2)
    const retrieved = getRasterData(id)
    expect(retrieved!.width).toBe(8)
    expect(retrieved!.height).toBe(8)
    expect(retrieved!.data[0]).toBe(20)
    deleteRasterData(id)
  })

  test('deleteRasterData on non-existent key is safe', () => {
    deleteRasterData('definitely-not-stored')
    // No error
  })

  test('getRasterData returns undefined for deleted data', () => {
    const img = makeImageData(2, 2)
    storeRasterData(id, img)
    deleteRasterData(id)
    expect(getRasterData(id)).toBeUndefined()
  })
})
