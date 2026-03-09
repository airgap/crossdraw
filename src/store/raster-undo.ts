/**
 * External store for raster undo/redo snapshots.
 * Keeps heavy ImageData out of Zustand to avoid GC pressure and re-render overhead.
 * Only the dirty bounding-box region is stored, not the full canvas.
 */

export interface RasterRegion {
  chunkId: string
  x: number
  y: number
  width: number
  height: number
  data: Uint8ClampedArray
}

const snapshots = new Map<number, RasterRegion>()
let nextId = 1

export function storeSnapshot(region: RasterRegion): number {
  const id = nextId++
  snapshots.set(id, region)
  return id
}

export function getSnapshot(id: number): RasterRegion | undefined {
  return snapshots.get(id)
}

export function deleteSnapshots(ids: number[]) {
  for (const id of ids) snapshots.delete(id)
}
