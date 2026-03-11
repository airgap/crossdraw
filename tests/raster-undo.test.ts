import { describe, test, expect } from 'bun:test'
import { storeSnapshot, getSnapshot, deleteSnapshots, type RasterRegion } from '@/store/raster-undo'

function createRegion(chunkId: string, x: number, y: number, w: number, h: number, fill = 0): RasterRegion {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) data.fill(fill)
  return { chunkId, x, y, width: w, height: h, data }
}

describe('raster-undo', () => {
  test('storeSnapshot returns unique incrementing IDs', () => {
    const r1 = createRegion('chunk-1', 0, 0, 4, 4)
    const r2 = createRegion('chunk-2', 0, 0, 4, 4)
    const id1 = storeSnapshot(r1)
    const id2 = storeSnapshot(r2)
    expect(id2).toBeGreaterThan(id1)
    // Clean up
    deleteSnapshots([id1, id2])
  })

  test('getSnapshot retrieves stored snapshot', () => {
    const region = createRegion('chunk-a', 10, 20, 8, 8, 128)
    const id = storeSnapshot(region)
    const retrieved = getSnapshot(id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.chunkId).toBe('chunk-a')
    expect(retrieved!.x).toBe(10)
    expect(retrieved!.y).toBe(20)
    expect(retrieved!.width).toBe(8)
    expect(retrieved!.height).toBe(8)
    expect(retrieved!.data[0]).toBe(128)
    deleteSnapshots([id])
  })

  test('getSnapshot returns undefined for non-existent id', () => {
    expect(getSnapshot(999999)).toBeUndefined()
  })

  test('deleteSnapshots removes specified snapshots', () => {
    const r1 = createRegion('c1', 0, 0, 2, 2)
    const r2 = createRegion('c2', 0, 0, 2, 2)
    const r3 = createRegion('c3', 0, 0, 2, 2)
    const id1 = storeSnapshot(r1)
    const id2 = storeSnapshot(r2)
    const id3 = storeSnapshot(r3)

    deleteSnapshots([id1, id3])

    expect(getSnapshot(id1)).toBeUndefined()
    expect(getSnapshot(id2)).toBeDefined()
    expect(getSnapshot(id3)).toBeUndefined()

    deleteSnapshots([id2])
  })

  test('deleteSnapshots with empty array is no-op', () => {
    const region = createRegion('c1', 0, 0, 2, 2)
    const id = storeSnapshot(region)
    deleteSnapshots([])
    expect(getSnapshot(id)).toBeDefined()
    deleteSnapshots([id])
  })

  test('deleteSnapshots with non-existent IDs is safe', () => {
    // Should not throw
    deleteSnapshots([99999, 88888, 77777])
  })

  test('snapshot preserves pixel data integrity', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4) // 4x4 RGBA
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256
    }
    const region: RasterRegion = { chunkId: 'integrity', x: 5, y: 10, width: 4, height: 4, data }
    const id = storeSnapshot(region)
    const retrieved = getSnapshot(id)!
    expect(retrieved.data.length).toBe(data.length)
    for (let i = 0; i < data.length; i++) {
      expect(retrieved.data[i]).toBe(data[i])
    }
    deleteSnapshots([id])
  })

  test('multiple snapshots for same chunk coexist', () => {
    const r1 = createRegion('shared-chunk', 0, 0, 4, 4, 100)
    const r2 = createRegion('shared-chunk', 0, 0, 4, 4, 200)
    const id1 = storeSnapshot(r1)
    const id2 = storeSnapshot(r2)

    expect(getSnapshot(id1)!.data[0]).toBe(100)
    expect(getSnapshot(id2)!.data[0]).toBe(200)

    deleteSnapshots([id1, id2])
  })

  test('snapshot stores sub-region coordinates', () => {
    const region = createRegion('ch', 100, 200, 50, 30, 42)
    const id = storeSnapshot(region)
    const snap = getSnapshot(id)!
    expect(snap.x).toBe(100)
    expect(snap.y).toBe(200)
    expect(snap.width).toBe(50)
    expect(snap.height).toBe(30)
    deleteSnapshots([id])
  })
})
