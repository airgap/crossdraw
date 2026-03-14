import { describe, test, expect } from 'bun:test'
import { screenToDocument, documentToScreen, zoomAtPoint } from '@/math/viewport'
import type { ViewportState } from '@/types'

// ---- Helpers ----

function makeViewport(overrides: Partial<ViewportState> = {}): ViewportState {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    artboardId: null,
    view3d: { enabled: false, rotX: -25, rotY: 35, spacing: 40 },
    ...overrides,
  }
}

function makeRect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect
}

// ---- screenToDocument Tests ----

describe('screenToDocument', () => {
  test('identity transform (zoom=1, pan=0, rect at origin)', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('accounts for canvas rect offset', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(50, 100, 800, 600)
    const result = screenToDocument({ x: 150, y: 300 }, viewport, rect)
    expect(result.x).toBe(100) // 150 - 50
    expect(result.y).toBe(200) // 300 - 100
  })

  test('accounts for pan offset', () => {
    const viewport = makeViewport({ zoom: 1, panX: 30, panY: 40 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 130, y: 240 }, viewport, rect)
    expect(result.x).toBe(100) // (130 - 0 - 30) / 1
    expect(result.y).toBe(200) // (240 - 0 - 40) / 1
  })

  test('accounts for zoom', () => {
    const viewport = makeViewport({ zoom: 2, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 200, y: 400 }, viewport, rect)
    expect(result.x).toBe(100) // 200 / 2
    expect(result.y).toBe(200) // 400 / 2
  })

  test('combined transform: rect offset + pan + zoom', () => {
    const viewport = makeViewport({ zoom: 2, panX: 50, panY: 100 })
    const rect = makeRect(10, 20, 800, 600)
    const result = screenToDocument({ x: 210, y: 420 }, viewport, rect)
    // x: (210 - 10 - 50) / 2 = 150 / 2 = 75
    // y: (420 - 20 - 100) / 2 = 300 / 2 = 150
    expect(result.x).toBe(75)
    expect(result.y).toBe(150)
  })

  test('zoom less than 1 (zoomed out)', () => {
    const viewport = makeViewport({ zoom: 0.5, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 50, y: 100 }, viewport, rect)
    expect(result.x).toBe(100) // 50 / 0.5
    expect(result.y).toBe(200) // 100 / 0.5
  })

  test('negative pan values', () => {
    const viewport = makeViewport({ zoom: 1, panX: -100, panY: -200 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 50, y: 50 }, viewport, rect)
    expect(result.x).toBe(150) // (50 - 0 - (-100)) / 1 = 150
    expect(result.y).toBe(250) // (50 - 0 - (-200)) / 1 = 250
  })

  test('origin point (0,0 screen)', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = screenToDocument({ x: 0, y: 0 }, viewport, rect)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })
})

// ---- documentToScreen Tests ----

describe('documentToScreen', () => {
  test('identity transform (zoom=1, pan=0, rect at origin)', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = documentToScreen({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(100)
    expect(result.y).toBe(200)
  })

  test('accounts for canvas rect offset', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(50, 100, 800, 600)
    const result = documentToScreen({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(150) // 100 * 1 + 0 + 50
    expect(result.y).toBe(300) // 200 * 1 + 0 + 100
  })

  test('accounts for pan offset', () => {
    const viewport = makeViewport({ zoom: 1, panX: 30, panY: 40 })
    const rect = makeRect(0, 0, 800, 600)
    const result = documentToScreen({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(130) // 100 + 30
    expect(result.y).toBe(240) // 200 + 40
  })

  test('accounts for zoom', () => {
    const viewport = makeViewport({ zoom: 2, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = documentToScreen({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(200) // 100 * 2
    expect(result.y).toBe(400) // 200 * 2
  })

  test('combined transform: rect offset + pan + zoom', () => {
    const viewport = makeViewport({ zoom: 2, panX: 50, panY: 100 })
    const rect = makeRect(10, 20, 800, 600)
    const result = documentToScreen({ x: 75, y: 150 }, viewport, rect)
    // x: 75 * 2 + 50 + 10 = 210
    // y: 150 * 2 + 100 + 20 = 420
    expect(result.x).toBe(210)
    expect(result.y).toBe(420)
  })

  test('zoom less than 1', () => {
    const viewport = makeViewport({ zoom: 0.5, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = documentToScreen({ x: 100, y: 200 }, viewport, rect)
    expect(result.x).toBe(50) // 100 * 0.5
    expect(result.y).toBe(100) // 200 * 0.5
  })

  test('negative pan', () => {
    const viewport = makeViewport({ zoom: 1, panX: -100, panY: -200 })
    const rect = makeRect(0, 0, 800, 600)
    const result = documentToScreen({ x: 150, y: 250 }, viewport, rect)
    expect(result.x).toBe(50) // 150 - 100
    expect(result.y).toBe(50) // 250 - 200
  })

  test('document origin maps correctly', () => {
    const viewport = makeViewport({ zoom: 2, panX: 100, panY: 200 })
    const rect = makeRect(10, 20, 800, 600)
    const result = documentToScreen({ x: 0, y: 0 }, viewport, rect)
    expect(result.x).toBe(110) // 0 * 2 + 100 + 10
    expect(result.y).toBe(220) // 0 * 2 + 200 + 20
  })
})

// ---- Round-trip Tests ----

describe('screenToDocument <-> documentToScreen round-trip', () => {
  test('round-trip with identity transform', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const screen = { x: 123, y: 456 }
    const doc = screenToDocument(screen, viewport, rect)
    const back = documentToScreen(doc, viewport, rect)
    expect(back.x).toBeCloseTo(screen.x)
    expect(back.y).toBeCloseTo(screen.y)
  })

  test('round-trip with complex transform', () => {
    const viewport = makeViewport({ zoom: 3.5, panX: -150, panY: 200 })
    const rect = makeRect(25, 50, 1920, 1080)
    const screen = { x: 500, y: 700 }
    const doc = screenToDocument(screen, viewport, rect)
    const back = documentToScreen(doc, viewport, rect)
    expect(back.x).toBeCloseTo(screen.x, 10)
    expect(back.y).toBeCloseTo(screen.y, 10)
  })

  test('round-trip with zoom < 1', () => {
    const viewport = makeViewport({ zoom: 0.25, panX: 50, panY: 50 })
    const rect = makeRect(100, 200, 800, 600)
    const screen = { x: 300, y: 400 }
    const doc = screenToDocument(screen, viewport, rect)
    const back = documentToScreen(doc, viewport, rect)
    expect(back.x).toBeCloseTo(screen.x, 10)
    expect(back.y).toBeCloseTo(screen.y, 10)
  })

  test('round-trip starting from document coords', () => {
    const viewport = makeViewport({ zoom: 2, panX: 100, panY: 200 })
    const rect = makeRect(10, 20, 800, 600)
    const docPt = { x: 75, y: 150 }
    const screen = documentToScreen(docPt, viewport, rect)
    const back = screenToDocument(screen, viewport, rect)
    expect(back.x).toBeCloseTo(docPt.x, 10)
    expect(back.y).toBeCloseTo(docPt.y, 10)
  })
})

// ---- zoomAtPoint Tests ----

describe('zoomAtPoint', () => {
  test('zoom in increases zoom level', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 0.1)
    expect(result.zoom).toBeGreaterThan(1)
    expect(result.zoom).toBeCloseTo(1.1)
  })

  test('zoom out decreases zoom level', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, -0.1)
    expect(result.zoom).toBeLessThan(1)
    expect(result.zoom).toBeCloseTo(0.9)
  })

  test('zoom clamps to minimum 0.1', () => {
    const viewport = makeViewport({ zoom: 0.15, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, -0.9)
    expect(result.zoom).toBeGreaterThanOrEqual(0.1)
  })

  test('zoom clamps to maximum 10', () => {
    const viewport = makeViewport({ zoom: 9.5, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 0.2)
    expect(result.zoom).toBeLessThanOrEqual(10)
  })

  test('point under cursor stays fixed after zoom', () => {
    const viewport = makeViewport({ zoom: 1, panX: 100, panY: 200 })
    const rect = makeRect(10, 20, 800, 600)
    const cursorScreen = { x: 400, y: 300 }

    // Document point under cursor before zoom
    const docBefore = screenToDocument(cursorScreen, viewport, rect)

    // Zoom in
    const zoomed = zoomAtPoint(viewport, cursorScreen, rect, 0.5)

    // Document point under cursor after zoom
    const docAfter = screenToDocument(cursorScreen, zoomed, rect)

    expect(docAfter.x).toBeCloseTo(docBefore.x, 8)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 8)
  })

  test('point under cursor stays fixed after zoom out', () => {
    const viewport = makeViewport({ zoom: 2, panX: -50, panY: -100 })
    const rect = makeRect(0, 0, 1024, 768)
    const cursorScreen = { x: 512, y: 384 }

    const docBefore = screenToDocument(cursorScreen, viewport, rect)
    const zoomed = zoomAtPoint(viewport, cursorScreen, rect, -0.3)
    const docAfter = screenToDocument(cursorScreen, zoomed, rect)

    expect(docAfter.x).toBeCloseTo(docBefore.x, 8)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 8)
  })

  test('zoom at corner of canvas rect', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 0, y: 0 }, rect, 1)
    expect(result.zoom).toBe(2)
    // At origin, pan should stay at 0
    expect(result.panX).toBeCloseTo(0)
    expect(result.panY).toBeCloseTo(0)
  })

  test('preserves artboardId from input viewport', () => {
    const viewport = makeViewport({ zoom: 1, panX: 0, panY: 0, artboardId: 'ab42' })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 0.1)
    expect(result.artboardId).toBe('ab42')
  })

  test('zoom delta of 0 does not change zoom or pan', () => {
    const viewport = makeViewport({ zoom: 1.5, panX: 30, panY: 40 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 0)
    expect(result.zoom).toBeCloseTo(1.5)
    expect(result.panX).toBeCloseTo(30)
    expect(result.panY).toBeCloseTo(40)
  })

  test('large zoom in from low zoom level', () => {
    const viewport = makeViewport({ zoom: 0.5, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 5)
    // 0.5 * (1 + 5) = 3.0
    expect(result.zoom).toBeCloseTo(3.0)
  })

  test('extreme zoom out clamps correctly', () => {
    const viewport = makeViewport({ zoom: 0.2, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, -0.99)
    // 0.2 * (1 + (-0.99)) = 0.2 * 0.01 = 0.002 => clamped to 0.1
    expect(result.zoom).toBe(0.1)
  })

  test('extreme zoom in clamps correctly', () => {
    const viewport = makeViewport({ zoom: 8, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const result = zoomAtPoint(viewport, { x: 400, y: 300 }, rect, 1)
    // 8 * (1 + 1) = 16 => clamped to 10
    expect(result.zoom).toBe(10)
  })

  test('zoom with rect offset and pan', () => {
    const viewport = makeViewport({ zoom: 1, panX: 200, panY: 150 })
    const rect = makeRect(50, 75, 800, 600)
    const cursorScreen = { x: 450, y: 375 }

    const docBefore = screenToDocument(cursorScreen, viewport, rect)
    const zoomed = zoomAtPoint(viewport, cursorScreen, rect, 0.5)
    const docAfter = screenToDocument(cursorScreen, zoomed, rect)

    expect(docAfter.x).toBeCloseTo(docBefore.x, 8)
    expect(docAfter.y).toBeCloseTo(docBefore.y, 8)
  })

  test('multiple sequential zooms keep cursor point stable', () => {
    let viewport = makeViewport({ zoom: 1, panX: 0, panY: 0 })
    const rect = makeRect(0, 0, 800, 600)
    const cursor = { x: 300, y: 200 }

    const docOriginal = screenToDocument(cursor, viewport, rect)

    // Zoom in 3 times
    viewport = zoomAtPoint(viewport, cursor, rect, 0.2)
    viewport = zoomAtPoint(viewport, cursor, rect, 0.3)
    viewport = zoomAtPoint(viewport, cursor, rect, 0.1)

    const docAfter = screenToDocument(cursor, viewport, rect)
    expect(docAfter.x).toBeCloseTo(docOriginal.x, 6)
    expect(docAfter.y).toBeCloseTo(docOriginal.y, 6)
  })
})
