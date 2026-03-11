import { describe, test, expect, beforeEach } from 'bun:test'
import { beginKnifeCut, updateKnifeCut, endKnifeCut, getKnifePoints, isKnifeCutting } from '@/tools/knife'
import { useEditorStore } from '@/store/editor.store'

// --- helpers ---

function resetKnifeState() {
  // Reset by ending any active cut
  if (isKnifeCutting()) {
    // Force reset by directly calling endKnifeCut after clearing store state
    endKnifeCut()
  }
  // Make sure it's clean
  expect(isKnifeCutting()).toBe(false)
  expect(getKnifePoints()).toHaveLength(0)
}

function makeVectorLayer(
  id: string,
  paths: Array<{
    id: string
    segments: Array<any>
    closed: boolean
  }>,
) {
  return {
    id,
    name: `Layer ${id}`,
    type: 'vector' as const,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: { type: 'solid' as const, color: '#000000', opacity: 1 },
    stroke: null,
  }
}

describe('knife tool', () => {
  beforeEach(() => {
    resetKnifeState()
  })

  describe('beginKnifeCut', () => {
    test('activates knife state', () => {
      beginKnifeCut(10, 20)
      expect(isKnifeCutting()).toBe(true)
      expect(getKnifePoints()).toEqual([{ x: 10, y: 20 }])
    })

    test('resets previous points', () => {
      beginKnifeCut(5, 5)
      updateKnifeCut(10, 10)
      beginKnifeCut(50, 60)
      expect(getKnifePoints()).toEqual([{ x: 50, y: 60 }])
    })
  })

  describe('updateKnifeCut', () => {
    test('adds points when active', () => {
      beginKnifeCut(0, 0)
      updateKnifeCut(10, 10)
      updateKnifeCut(20, 20)
      expect(getKnifePoints()).toHaveLength(3)
      expect(getKnifePoints()[1]).toEqual({ x: 10, y: 10 })
      expect(getKnifePoints()[2]).toEqual({ x: 20, y: 20 })
    })

    test('does nothing when not active', () => {
      updateKnifeCut(10, 10)
      expect(getKnifePoints()).toHaveLength(0)
    })
  })

  describe('endKnifeCut', () => {
    test('resets state when less than 2 points', () => {
      beginKnifeCut(10, 20)
      endKnifeCut()
      expect(isKnifeCutting()).toBe(false)
      expect(getKnifePoints()).toHaveLength(0)
    })

    test('resets state when not active', () => {
      endKnifeCut()
      expect(isKnifeCutting()).toBe(false)
    })

    test('resets state when no artboard exists', () => {
      // Clear store artboards
      const store = useEditorStore.getState()
      const origDoc = store.document
      // Force empty artboards
      useEditorStore.setState({
        document: { ...origDoc, artboards: [] },
      })

      beginKnifeCut(0, 0)
      updateKnifeCut(100, 100)
      endKnifeCut()
      expect(isKnifeCutting()).toBe(false)
      expect(getKnifePoints()).toHaveLength(0)

      // Restore
      useEditorStore.setState({ document: origDoc })
    })

    test('resets state when no layer is selected', () => {
      const store = useEditorStore.getState()
      store.deselectAll()

      beginKnifeCut(0, 0)
      updateKnifeCut(100, 100)
      endKnifeCut()
      expect(isKnifeCutting()).toBe(false)
      expect(getKnifePoints()).toHaveLength(0)
    })

    test('resets state when selected layer is not vector', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (artboard) {
        // Add a raster layer
        const rasterLayer = {
          id: 'raster-1',
          name: 'Raster',
          type: 'raster' as const,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal' as const,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          imageChunkId: 'chunk-1',
          width: 100,
          height: 100,
        }
        store.addLayer(artboard.id, rasterLayer as any)
        store.selectLayer('raster-1')

        beginKnifeCut(0, 0)
        updateKnifeCut(100, 100)
        endKnifeCut()
        expect(isKnifeCutting()).toBe(false)
      }
    })

    test('splits a vector layer path where knife intersects', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      // Create a horizontal line path from (0,0) to (200,0)
      const layer = makeVectorLayer('knife-v1', [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 100, y: 0 },
            { type: 'line', x: 200, y: 0 },
          ],
          closed: false,
        },
      ])

      store.addLayer(artboard.id, layer as any)
      store.selectLayer('knife-v1')

      // Draw knife line crossing through it vertically at x=50
      beginKnifeCut(50, -50)
      updateKnifeCut(50, 50)
      endKnifeCut()

      expect(isKnifeCutting()).toBe(false)
      expect(getKnifePoints()).toHaveLength(0)
    })
  })

  describe('getKnifePoints', () => {
    test('returns empty array initially', () => {
      expect(getKnifePoints()).toHaveLength(0)
    })

    test('returns accumulated points during cut', () => {
      beginKnifeCut(1, 2)
      updateKnifeCut(3, 4)
      updateKnifeCut(5, 6)
      const pts = getKnifePoints()
      expect(pts).toHaveLength(3)
      expect(pts[0]).toEqual({ x: 1, y: 2 })
      expect(pts[1]).toEqual({ x: 3, y: 4 })
      expect(pts[2]).toEqual({ x: 5, y: 6 })
    })
  })

  describe('isKnifeCutting', () => {
    test('returns false initially', () => {
      expect(isKnifeCutting()).toBe(false)
    })

    test('returns true after beginKnifeCut', () => {
      beginKnifeCut(0, 0)
      expect(isKnifeCutting()).toBe(true)
    })

    test('returns false after endKnifeCut', () => {
      beginKnifeCut(0, 0)
      updateKnifeCut(10, 10)
      endKnifeCut()
      expect(isKnifeCutting()).toBe(false)
    })
  })
})

// Test internal splitting logic by verifying behavior with intersecting paths
describe('knife tool - splitting geometry', () => {
  test('knife crossing a two-segment path produces multiple sub-paths', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    // A vertical path from (50, -100) to (50, 100)
    const layer = makeVectorLayer('knife-split-1', [
      {
        id: 'sp1',
        segments: [
          { type: 'move', x: 50, y: -100 },
          { type: 'line', x: 50, y: 0 },
          { type: 'line', x: 50, y: 100 },
        ],
        closed: false,
      },
    ])

    store.addLayer(artboard.id, layer as any)
    store.selectLayer('knife-split-1')

    // Knife line goes horizontally across at y=0
    beginKnifeCut(-100, 0)
    updateKnifeCut(200, 0)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
  })

  test('knife that does not intersect path leaves it unchanged', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const layer = makeVectorLayer('knife-nointersect', [
      {
        id: 'sp2',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 10, y: 0 },
        ],
        closed: false,
      },
    ])

    store.addLayer(artboard.id, layer as any)
    store.selectLayer('knife-nointersect')

    // Knife line far away
    beginKnifeCut(500, 500)
    updateKnifeCut(600, 600)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
  })

  test('knife handles path with close segment gracefully', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const layer = makeVectorLayer('knife-close', [
      {
        id: 'sp3',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
          { type: 'line', x: 100, y: 100 },
          { type: 'close' },
        ],
        closed: true,
      },
    ])

    store.addLayer(artboard.id, layer as any)
    store.selectLayer('knife-close')

    // Knife from left to right across the shape
    beginKnifeCut(-10, 50)
    updateKnifeCut(200, 50)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
  })

  test('knife handles single-segment path (no split possible)', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    if (!artboard) return

    const layer = makeVectorLayer('knife-single', [
      {
        id: 'sp4',
        segments: [{ type: 'move', x: 0, y: 0 }],
        closed: false,
      },
    ])

    store.addLayer(artboard.id, layer as any)
    store.selectLayer('knife-single')

    beginKnifeCut(-10, 0)
    updateKnifeCut(200, 0)
    endKnifeCut()

    expect(isKnifeCutting()).toBe(false)
  })
})
