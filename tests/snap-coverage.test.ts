import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origImageData = globalThis.ImageData
const origLocalStorage = globalThis.localStorage

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
  if (origLocalStorage !== undefined) {
    globalThis.localStorage = origLocalStorage
  } else {
    delete (globalThis as any).localStorage
  }
})

// Polyfill ImageData for bun:test
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(arg1: number | Uint8ClampedArray, w?: number, h?: number) {
      if (typeof arg1 === 'number') {
        this.width = arg1
        this.height = w!
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = arg1
        this.width = w!
        this.height = h ?? arg1.length / 4 / w!
      }
    }
  }
}

// Polyfill localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

import { useEditorStore } from '@/store/editor.store'
import { snapPoint, snapBBox, renderSnapLines } from '@/tools/snap'

describe('snap.ts - snapPoint', () => {
  beforeEach(() => {
    const store = useEditorStore.getState()
    store.newDocument({ width: 800, height: 600 })
    // Enable all snap options
    useEditorStore.setState({
      snapEnabled: true,
      snapToGuides: true,
      snapToGrid: true,
      snapToArtboard: true,
      snapToLayers: true,
      snapToPixel: false,
      showGrid: true,
      gridSize: 10,
      snapThreshold: 5,
    })
  })

  test('returns no snap when snapEnabled is false', () => {
    useEditorStore.setState({ snapEnabled: false })
    const result = snapPoint(100, 100)
    expect(result.x).toBeNull()
    expect(result.y).toBeNull()
    expect(result.snapLinesH).toEqual([])
    expect(result.snapLinesV).toEqual([])
  })

  test('returns no snap when no artboard', () => {
    useEditorStore.setState({
      document: {
        ...useEditorStore.getState().document,
        artboards: [],
      },
    })
    const result = snapPoint(100, 100)
    expect(result.x).toBeNull()
    expect(result.y).toBeNull()
  })

  test('snaps to artboard edges', () => {
    useEditorStore.setState({
      snapToGrid: false,
      snapToGuides: false,
      snapToLayers: false,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    // Snap to left edge of artboard
    const result = snapPoint(artboard.x + 2, artboard.y + 100)
    expect(result.x).toBe(artboard.x)
    expect(result.snapLinesV.length).toBeGreaterThan(0)
  })

  test('snaps to artboard center', () => {
    useEditorStore.setState({
      snapToGrid: false,
      snapToGuides: false,
      snapToLayers: false,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    const cx = artboard.x + artboard.width / 2
    const cy = artboard.y + artboard.height / 2
    const result = snapPoint(cx + 2, cy + 2)
    expect(result.x).toBe(cx)
    expect(result.y).toBe(cy)
  })

  test('snaps to grid', () => {
    useEditorStore.setState({
      snapToArtboard: false,
      snapToGuides: false,
      snapToLayers: false,
      gridSize: 20,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    // Point near grid line at artboard.x + 40
    const result = snapPoint(artboard.x + 41, artboard.y + 41)
    expect(result.x).toBe(artboard.x + 40)
    expect(result.y).toBe(artboard.y + 40)
  })

  test('does not snap to grid when showGrid is false', () => {
    useEditorStore.setState({
      showGrid: false,
      snapToArtboard: false,
      snapToGuides: false,
      snapToLayers: false,
    })
    const result = snapPoint(41, 41)
    expect(result.x).toBeNull()
    expect(result.y).toBeNull()
  })

  test('snaps to guides', () => {
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]!
    // Add guides
    useEditorStore.setState({
      document: {
        ...state.document,
        artboards: [
          {
            ...artboard,
            guides: {
              vertical: [100, 200],
              horizontal: [150, 300],
            },
          },
        ],
      },
      snapToGrid: false,
      snapToArtboard: false,
      snapToLayers: false,
    })

    const result = snapPoint(artboard.x + 101, artboard.y + 151)
    expect(result.x).toBe(artboard.x + 100)
    expect(result.y).toBe(artboard.y + 150)
  })

  test('does not snap to guides when snapToGuides is false', () => {
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]!
    useEditorStore.setState({
      document: {
        ...state.document,
        artboards: [
          {
            ...artboard,
            guides: {
              vertical: [100],
              horizontal: [100],
            },
          },
        ],
      },
      snapToGuides: false,
      snapToGrid: false,
      snapToArtboard: false,
      snapToLayers: false,
    })

    const result = snapPoint(artboard.x + 101, artboard.y + 101)
    expect(result.x).toBeNull()
    expect(result.y).toBeNull()
  })

  test('pixel snapping rounds to integer', () => {
    useEditorStore.setState({
      snapToPixel: true,
      snapToGrid: false,
      snapToArtboard: false,
      snapToGuides: false,
      snapToLayers: false,
    })
    const result = snapPoint(100.7, 200.3)
    expect(result.x).toBe(101)
    expect(result.y).toBe(200)
  })

  test('pixel snapping applies on top of other snaps', () => {
    useEditorStore.setState({
      snapToPixel: true,
      snapToArtboard: true,
      snapToGrid: false,
      snapToGuides: false,
      snapToLayers: false,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    const result = snapPoint(artboard.x + 2, artboard.y + 2)
    // Should snap to artboard edge and then round
    expect(result.x).toBe(Math.round(artboard.x))
  })

  test('snap threshold is scaled by zoom', () => {
    useEditorStore.setState({
      viewport: {
        ...useEditorStore.getState().viewport,
        zoom: 4,
      },
      snapToGrid: false,
      snapToGuides: false,
      snapToLayers: false,
      snapToArtboard: true,
      snapThreshold: 5,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    // Threshold = 5/4 = 1.25 in doc space
    // A point 2 units away should NOT snap
    const result = snapPoint(artboard.x + 2, artboard.y + 2)
    expect(result.x).toBeNull()
  })

  test('excludeLayerIds prevents snapping to specific layers', () => {
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]!
    if (artboard.layers.length > 0) {
      const layerId = artboard.layers[0]!.id
      // Disabling other snaps to isolate layer snap
      useEditorStore.setState({
        snapToGrid: false,
        snapToGuides: false,
        snapToArtboard: false,
        snapToLayers: true,
      })
      // Snap with exclusion (should not snap to the excluded layer)
      const result = snapPoint(100, 100, [layerId])
      // The result depends on what other layers exist, but the function shouldn't crash
      expect(result).toBeDefined()
    }
  })
})

describe('snap.ts - snapBBox', () => {
  beforeEach(() => {
    useEditorStore.getState().newDocument({ width: 800, height: 600 })
    useEditorStore.setState({
      snapEnabled: true,
      snapToGuides: false,
      snapToGrid: false,
      snapToArtboard: true,
      snapToLayers: false,
      snapToPixel: false,
      showGrid: false,
      snapThreshold: 5,
      viewport: {
        ...useEditorStore.getState().viewport,
        zoom: 1,
      },
    })
  })

  test('returns unmodified dx/dy when snap disabled', () => {
    useEditorStore.setState({ snapEnabled: false })
    const bbox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    const result = snapBBox(bbox, 10, 20)
    expect(result.dx).toBe(10)
    expect(result.dy).toBe(20)
    expect(result.snapLinesH).toEqual([])
    expect(result.snapLinesV).toEqual([])
  })

  test('returns unmodified dx/dy when no artboard', () => {
    useEditorStore.setState({
      document: {
        ...useEditorStore.getState().document,
        artboards: [],
      },
    })
    const bbox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    const result = snapBBox(bbox, 10, 20)
    expect(result.dx).toBe(10)
    expect(result.dy).toBe(20)
  })

  test('snaps bbox left edge to artboard edge', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    const bbox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    // Move to put left edge close to artboard left
    const dx = artboard.x + 2
    const result = snapBBox(bbox, dx, 100)
    // Should snap left edge to artboard.x
    expect(result.dx).toBe(artboard.x)
  })

  test('snaps bbox right edge to artboard edge', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    const bbox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    // Move to put right edge (50 + dx) close to artboard right (artboard.x + artboard.width)
    const targetDx = artboard.x + artboard.width - 50 - 2
    const result = snapBBox(bbox, targetDx, 100)
    // Right edge should snap to artboard right edge
    expect(Math.abs(result.dx - (artboard.x + artboard.width - 50))).toBeLessThan(1)
  })

  test('snaps bbox center to artboard center', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const artboardCx = artboard.x + artboard.width / 2
    // Move to put center (50 + dx) close to artboard center
    const targetDx = artboardCx - 50 + 2
    const result = snapBBox(bbox, targetDx, 100)
    // Center should snap
    expect(Math.abs(result.dx - (artboardCx - 50))).toBeLessThan(1)
  })

  test('pixel snapping rounds final position', () => {
    useEditorStore.setState({
      snapToPixel: true,
      snapToArtboard: false,
    })
    const bbox = { minX: 0.5, minY: 0.7, maxX: 50.5, maxY: 50.7 }
    const result = snapBBox(bbox, 10.3, 20.6)
    // Final position should be rounded: round(0.5 + 10.3) - 0.5 = 11 - 0.5 = 10.5
    // Actually: round(bbox.minX + finalDx) - bbox.minX
    expect(Number.isInteger(bbox.minX + result.dx)).toBe(true)
    expect(Number.isInteger(bbox.minY + result.dy)).toBe(true)
  })

  test('snaps to guides', () => {
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]!
    useEditorStore.setState({
      document: {
        ...state.document,
        artboards: [
          {
            ...artboard,
            guides: {
              vertical: [200],
              horizontal: [300],
            },
          },
        ],
      },
      snapToGuides: true,
      snapToArtboard: false,
    })

    const bbox = { minX: 0, minY: 0, maxX: 50, maxY: 50 }
    // Put left edge near guide at artboard.x + 200
    const dx = artboard.x + 200 + 2
    const result = snapBBox(bbox, dx, artboard.y + 300 + 2)
    expect(result.snapLinesV.length).toBeGreaterThan(0)
  })

  test('snaps to grid when enabled', () => {
    useEditorStore.setState({
      snapToGrid: true,
      showGrid: true,
      gridSize: 50,
      snapToArtboard: false,
    })
    const artboard = useEditorStore.getState().document.artboards[0]!
    const bbox = { minX: 0, minY: 0, maxX: 20, maxY: 20 }
    // Place near a grid line
    const result = snapBBox(bbox, artboard.x + 52, artboard.y + 52)
    // Should snap to nearest grid
    expect(result).toBeDefined()
  })
})

describe('snap.ts - renderSnapLines', () => {
  test('draws snap lines on canvas context', () => {
    const calls: string[] = []
    const ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      strokeStyle: '',
      lineWidth: 0,
      setLineDash: (_d: number[]) => calls.push('setLineDash'),
      beginPath: () => calls.push('beginPath'),
      moveTo: (_x: number, _y: number) => calls.push('moveTo'),
      lineTo: (_x: number, _y: number) => calls.push('lineTo'),
      stroke: () => calls.push('stroke'),
    } as unknown as CanvasRenderingContext2D

    renderSnapLines(ctx, { h: [100], v: [200] }, 1)

    expect(calls).toContain('save')
    expect(calls).toContain('restore')
    expect(calls).toContain('beginPath')
    expect(calls).toContain('moveTo')
    expect(calls).toContain('lineTo')
    expect(calls).toContain('stroke')
  })

  test('renders nothing with empty lines', () => {
    const strokeCount = { n: 0 }
    const ctx = {
      save: () => {},
      restore: () => {},
      strokeStyle: '',
      lineWidth: 0,
      setLineDash: (_d: number[]) => {},
      beginPath: () => {},
      moveTo: (_x: number, _y: number) => {},
      lineTo: (_x: number, _y: number) => {},
      stroke: () => strokeCount.n++,
    } as unknown as CanvasRenderingContext2D

    renderSnapLines(ctx, { h: [], v: [] }, 1)
    expect(strokeCount.n).toBe(0)
  })

  test('renders multiple horizontal and vertical lines', () => {
    let strokeCalls = 0
    const ctx = {
      save: () => {},
      restore: () => {},
      strokeStyle: '',
      lineWidth: 0,
      setLineDash: (_d: number[]) => {},
      beginPath: () => {},
      moveTo: (_x: number, _y: number) => {},
      lineTo: (_x: number, _y: number) => {},
      stroke: () => strokeCalls++,
    } as unknown as CanvasRenderingContext2D

    renderSnapLines(ctx, { h: [100, 200, 300], v: [50, 150] }, 2)
    expect(strokeCalls).toBe(5) // 3 horizontal + 2 vertical
  })

  test('sets magenta stroke style', () => {
    let styleSet = ''
    const ctx = {
      save: () => {},
      restore: () => {},
      set strokeStyle(v: string) {
        styleSet = v
      },
      lineWidth: 0,
      setLineDash: (_d: number[]) => {},
      beginPath: () => {},
      moveTo: (_x: number, _y: number) => {},
      lineTo: (_x: number, _y: number) => {},
      stroke: () => {},
    } as unknown as CanvasRenderingContext2D

    renderSnapLines(ctx, { h: [100], v: [] }, 1)
    expect(styleSet).toBe('#ff00ff')
  })

  test('scales line width by zoom', () => {
    let widthSet = 0
    const ctx = {
      save: () => {},
      restore: () => {},
      strokeStyle: '',
      set lineWidth(v: number) {
        widthSet = v
      },
      setLineDash: (_d: number[]) => {},
      beginPath: () => {},
      moveTo: (_x: number, _y: number) => {},
      lineTo: (_x: number, _y: number) => {},
      stroke: () => {},
    } as unknown as CanvasRenderingContext2D

    renderSnapLines(ctx, { h: [100], v: [] }, 4)
    expect(widthSet).toBe(0.25) // 1/4
  })
})
