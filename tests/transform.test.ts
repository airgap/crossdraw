import { describe, it, expect } from 'vitest'
import { hitTestHandles, getHandlePositions } from '@/tools/transform'
import type { BBox } from '@/math/bbox'

describe('transform handles', () => {
  const bbox: BBox = { minX: 100, minY: 100, maxX: 200, maxY: 200 }
  const zoom = 1

  it('should compute handle positions', () => {
    const handles = getHandlePositions(bbox, zoom)

    expect(handles.nw).toEqual({ x: 100, y: 100 })
    expect(handles.se).toEqual({ x: 200, y: 200 })
    expect(handles.n).toEqual({ x: 150, y: 100 })
    expect(handles.s).toEqual({ x: 150, y: 200 })
    expect(handles.w).toEqual({ x: 100, y: 150 })
    expect(handles.e).toEqual({ x: 200, y: 150 })
  })

  it('should hit test corner handles', () => {
    const result = hitTestHandles({ x: 100, y: 100 }, bbox, zoom)
    expect(result).toBe('nw')
  })

  it('should hit test edge handles', () => {
    const result = hitTestHandles({ x: 150, y: 200 }, bbox, zoom)
    expect(result).toBe('s')
  })

  it('should hit test body (interior)', () => {
    const result = hitTestHandles({ x: 150, y: 150 }, bbox, zoom)
    expect(result).toBe('body')
  })

  it('should return null for points outside', () => {
    const result = hitTestHandles({ x: 300, y: 300 }, bbox, zoom)
    expect(result).toBeNull()
  })

  it('should hit test rotation handle', () => {
    const handles = getHandlePositions(bbox, zoom)
    const result = hitTestHandles(
      { x: handles.rotation.x, y: handles.rotation.y },
      bbox,
      zoom,
    )
    expect(result).toBe('rotation')
  })

  it('should scale handle size with zoom', () => {
    const zoom2 = 2
    const handles = getHandlePositions(bbox, zoom2)
    // Rotation handle should be closer to top edge at higher zoom
    const handles1 = getHandlePositions(bbox, 1)
    expect(handles.rotation.y).toBeGreaterThan(handles1.rotation.y)
  })
})
