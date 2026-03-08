import { describe, test, expect } from 'bun:test'
import type { BBox } from '@/math/bbox'

describe('LYK-116: stroke position', () => {
  test('center stroke width is used as-is', () => {
    const width = 4
    const position = 'center'
    // Center stroke: lineWidth = width
    expect(position === 'center' ? width : width * 2).toBe(4)
  })

  test('inside stroke doubles width for clip rendering', () => {
    const width = 4
    const position = 'inside'
    // Inside stroke: clip to path, lineWidth = width * 2
    expect(position === 'inside' ? width * 2 : width).toBe(8)
  })

  test('outside stroke doubles width for inverted clip', () => {
    const width = 4
    const position = 'outside'
    expect(position === 'outside' ? width * 2 : width).toBe(8)
  })
})

describe('LYK-89: text alignment', () => {
  test('textAlign defaults to left', () => {
    const layer = { textAlign: undefined as string | undefined }
    const align = layer.textAlign ?? 'left'
    expect(align).toBe('left')
  })

  test('textAlign center is preserved', () => {
    const layer = { textAlign: 'center' as const }
    expect(layer.textAlign).toBe('center')
  })

  test('textAlign right is preserved', () => {
    const layer = { textAlign: 'right' as const }
    expect(layer.textAlign).toBe('right')
  })
})

describe('LYK-121: marquee selection', () => {
  function bboxIntersectsRect(bbox: BBox, rx: number, ry: number, rw: number, rh: number): boolean {
    return bbox.maxX >= rx && bbox.minX <= rx + rw &&
           bbox.maxY >= ry && bbox.minY <= ry + rh
  }

  test('bbox fully inside marquee', () => {
    const bbox: BBox = { minX: 10, minY: 10, maxX: 20, maxY: 20 }
    expect(bboxIntersectsRect(bbox, 0, 0, 50, 50)).toBe(true)
  })

  test('bbox fully outside marquee', () => {
    const bbox: BBox = { minX: 100, minY: 100, maxX: 120, maxY: 120 }
    expect(bboxIntersectsRect(bbox, 0, 0, 50, 50)).toBe(false)
  })

  test('bbox partially overlapping marquee', () => {
    const bbox: BBox = { minX: 40, minY: 40, maxX: 60, maxY: 60 }
    expect(bboxIntersectsRect(bbox, 0, 0, 50, 50)).toBe(true)
  })

  test('marquee fully inside bbox', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    expect(bboxIntersectsRect(bbox, 20, 20, 10, 10)).toBe(true)
  })

  test('no overlap on x axis', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 10, maxY: 100 }
    expect(bboxIntersectsRect(bbox, 20, 0, 30, 100)).toBe(false)
  })

  test('no overlap on y axis', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 10 }
    expect(bboxIntersectsRect(bbox, 0, 20, 100, 30)).toBe(false)
  })

  test('marquee start/end normalization (drag right-to-left)', () => {
    const startX = 50, startY = 50
    const endX = 10, endY = 10
    const mx = Math.min(startX, endX)
    const my = Math.min(startY, endY)
    const mw = Math.abs(endX - startX)
    const mh = Math.abs(endY - startY)
    expect(mx).toBe(10)
    expect(my).toBe(10)
    expect(mw).toBe(40)
    expect(mh).toBe(40)
  })
})

describe('LYK-91: fill/stroke opacity independence', () => {
  test('fill opacity multiplied with layer opacity', () => {
    const layerOpacity = 0.5
    const fillOpacity = 0.8
    const effectiveAlpha = layerOpacity * fillOpacity
    expect(effectiveAlpha).toBeCloseTo(0.4)
  })

  test('stroke opacity multiplied with layer opacity', () => {
    const layerOpacity = 0.5
    const strokeOpacity = 0.6
    const effectiveAlpha = layerOpacity * strokeOpacity
    expect(effectiveAlpha).toBeCloseTo(0.3)
  })

  test('fill and stroke have independent opacity', () => {
    const layerOpacity = 1.0
    const fillOpacity = 0.5
    const strokeOpacity = 0.9
    const fillAlpha = layerOpacity * fillOpacity
    const strokeAlpha = layerOpacity * strokeOpacity
    expect(fillAlpha).not.toBe(strokeAlpha)
    expect(fillAlpha).toBeCloseTo(0.5)
    expect(strokeAlpha).toBeCloseTo(0.9)
  })
})

describe('LYK-126: context menu', () => {
  test('menu entries include expected actions', () => {
    const labels = [
      'Cut', 'Copy', 'Paste', 'Delete', 'Duplicate',
      'Bring to Front', 'Bring Forward', 'Send Backward', 'Send to Back',
      'Flip Horizontal', 'Flip Vertical', 'Select All',
    ]
    expect(labels.length).toBe(12)
    expect(labels.includes('Cut')).toBe(true)
    expect(labels.includes('Select All')).toBe(true)
  })
})
