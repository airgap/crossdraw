import { describe, test, expect } from 'bun:test'

// Test alignment and distribution math directly without store dependencies

interface BBox {
  minX: number; minY: number; maxX: number; maxY: number
}

interface Item {
  id: string
  bbox: BBox
  dx: number
  dy: number
}

function makeItems(bboxes: BBox[]): Item[] {
  return bboxes.map((bbox, i) => ({ id: `layer-${i}`, bbox, dx: 0, dy: 0 }))
}

// Replicate alignment logic
function alignLeftLogic(items: Item[]): Item[] {
  const targetX = Math.min(...items.map(i => i.bbox.minX))
  return items.map(i => ({ ...i, dx: targetX - i.bbox.minX }))
}

function alignRightLogic(items: Item[]): Item[] {
  const targetX = Math.max(...items.map(i => i.bbox.maxX))
  return items.map(i => ({ ...i, dx: targetX - i.bbox.maxX }))
}

function alignCenterHLogic(items: Item[]): Item[] {
  const allMinX = Math.min(...items.map(i => i.bbox.minX))
  const allMaxX = Math.max(...items.map(i => i.bbox.maxX))
  const targetCx = (allMinX + allMaxX) / 2
  return items.map(i => {
    const cx = (i.bbox.minX + i.bbox.maxX) / 2
    return { ...i, dx: targetCx - cx }
  })
}

function alignTopLogic(items: Item[]): Item[] {
  const targetY = Math.min(...items.map(i => i.bbox.minY))
  return items.map(i => ({ ...i, dy: targetY - i.bbox.minY }))
}

function alignBottomLogic(items: Item[]): Item[] {
  const targetY = Math.max(...items.map(i => i.bbox.maxY))
  return items.map(i => ({ ...i, dy: targetY - i.bbox.maxY }))
}

function distributeHLogic(items: Item[]): Item[] {
  if (items.length < 3) return items
  const sorted = [...items].sort((a, b) => {
    const aCx = (a.bbox.minX + a.bbox.maxX) / 2
    const bCx = (b.bbox.minX + b.bbox.maxX) / 2
    return aCx - bCx
  })
  const firstCx = (sorted[0]!.bbox.minX + sorted[0]!.bbox.maxX) / 2
  const lastCx = (sorted[sorted.length - 1]!.bbox.minX + sorted[sorted.length - 1]!.bbox.maxX) / 2
  const step = (lastCx - firstCx) / (sorted.length - 1)

  return sorted.map((item, i) => {
    if (i === 0 || i === sorted.length - 1) return { ...item, dx: 0 }
    const currentCx = (item.bbox.minX + item.bbox.maxX) / 2
    const targetCx = firstCx + step * i
    return { ...item, dx: targetCx - currentCx }
  })
}

function distributeSpacingHLogic(items: Item[]): Item[] {
  if (items.length < 3) return items
  const sorted = [...items].sort((a, b) => a.bbox.minX - b.bbox.minX)

  const totalWidth = sorted.reduce((sum, i) => sum + (i.bbox.maxX - i.bbox.minX), 0)
  const totalSpan = sorted[sorted.length - 1]!.bbox.maxX - sorted[0]!.bbox.minX
  const gap = (totalSpan - totalWidth) / (sorted.length - 1)

  let x = sorted[0]!.bbox.maxX + gap
  return sorted.map((item, i) => {
    if (i === 0 || i === sorted.length - 1) return { ...item, dx: 0 }
    const dx = x - item.bbox.minX
    x += (item.bbox.maxX - item.bbox.minX) + gap
    return { ...item, dx }
  })
}

describe('align', () => {
  test('align left moves all layers to leftmost edge', () => {
    const items = makeItems([
      { minX: 10, minY: 0, maxX: 50, maxY: 40 },
      { minX: 30, minY: 0, maxX: 80, maxY: 40 },
      { minX: 60, minY: 0, maxX: 100, maxY: 40 },
    ])
    const result = alignLeftLogic(items)
    expect(result[0]!.dx).toBe(0) // already at 10
    expect(result[1]!.dx).toBe(-20) // 10 - 30
    expect(result[2]!.dx).toBe(-50) // 10 - 60
  })

  test('align right moves all layers to rightmost edge', () => {
    const items = makeItems([
      { minX: 10, minY: 0, maxX: 50, maxY: 40 },
      { minX: 30, minY: 0, maxX: 80, maxY: 40 },
      { minX: 60, minY: 0, maxX: 100, maxY: 40 },
    ])
    const result = alignRightLogic(items)
    expect(result[0]!.dx).toBe(50) // 100 - 50
    expect(result[1]!.dx).toBe(20) // 100 - 80
    expect(result[2]!.dx).toBe(0) // already at 100
  })

  test('align center H centers all layers', () => {
    const items = makeItems([
      { minX: 0, minY: 0, maxX: 20, maxY: 10 },
      { minX: 80, minY: 0, maxX: 100, maxY: 10 },
    ])
    const result = alignCenterHLogic(items)
    // Selection bounds: 0..100, center = 50
    // Layer 0 center = 10, dx = 40
    // Layer 1 center = 90, dx = -40
    expect(result[0]!.dx).toBe(40)
    expect(result[1]!.dx).toBe(-40)
  })

  test('align top moves all layers to topmost edge', () => {
    const items = makeItems([
      { minX: 0, minY: 20, maxX: 40, maxY: 60 },
      { minX: 0, minY: 10, maxX: 40, maxY: 50 },
      { minX: 0, minY: 40, maxX: 40, maxY: 80 },
    ])
    const result = alignTopLogic(items)
    expect(result[0]!.dy).toBe(-10) // 10 - 20
    expect(result[1]!.dy).toBe(0) // already at 10
    expect(result[2]!.dy).toBe(-30) // 10 - 40
  })

  test('align bottom moves all layers to bottommost edge', () => {
    const items = makeItems([
      { minX: 0, minY: 20, maxX: 40, maxY: 60 },
      { minX: 0, minY: 10, maxX: 40, maxY: 50 },
      { minX: 0, minY: 40, maxX: 40, maxY: 80 },
    ])
    const result = alignBottomLogic(items)
    expect(result[0]!.dy).toBe(20) // 80 - 60
    expect(result[1]!.dy).toBe(30) // 80 - 50
    expect(result[2]!.dy).toBe(0)  // already at 80
  })
})

describe('distribute', () => {
  test('distribute H evenly spaces centers', () => {
    const items = makeItems([
      { minX: 0, minY: 0, maxX: 20, maxY: 10 },   // center = 10
      { minX: 30, minY: 0, maxX: 50, maxY: 10 },   // center = 40
      { minX: 80, minY: 0, maxX: 100, maxY: 10 },  // center = 90
    ])
    const result = distributeHLogic(items)
    // First and last stay. Step = (90 - 10) / 2 = 40. Middle target = 10 + 40 = 50
    // Middle current center = 40, dx = 10
    expect(result[0]!.dx).toBe(0)
    expect(result[1]!.dx).toBe(10)
    expect(result[2]!.dx).toBe(0)
  })

  test('distribute spacing H makes equal gaps', () => {
    // 3 items: widths 20, 20, 20. Span = 100 - 0 = 100. Total width = 60. Total gap = 40. Gap each = 20.
    const items = makeItems([
      { minX: 0, minY: 0, maxX: 20, maxY: 10 },
      { minX: 25, minY: 0, maxX: 45, maxY: 10 },  // should move to x=40
      { minX: 80, minY: 0, maxX: 100, maxY: 10 },
    ])
    const result = distributeSpacingHLogic(items)
    expect(result[0]!.dx).toBe(0)
    expect(result[1]!.dx).toBeCloseTo(15) // 40 - 25 = 15
    expect(result[2]!.dx).toBe(0)
  })

  test('distribute with fewer than 3 items is a no-op', () => {
    const items = makeItems([
      { minX: 0, minY: 0, maxX: 20, maxY: 10 },
      { minX: 80, minY: 0, maxX: 100, maxY: 10 },
    ])
    const result = distributeHLogic(items)
    expect(result.length).toBe(2)
  })
})
