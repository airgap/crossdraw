import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getHandlePositions,
  hitTestHandles,
  getHandleCursor,
  isTransformDragging,
  beginTransform,
  updateTransform,
  endTransform,
  cancelTransform,
} from '@/tools/transform'
import type { BBox } from '@/math/bbox'
import { useEditorStore } from '@/store/editor.store'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ width: 500, height: 500 })
}

function addVectorLayer(artboardId: string, layerId: string, x = 0, y = 0) {
  const store = useEditorStore.getState()
  store.addLayer(artboardId, {
    id: layerId,
    name: layerId,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: `${layerId}-path`,
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
          { type: 'line', x: 100, y: 100 },
          { type: 'line', x: 0, y: 100 },
          { type: 'close' },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid', color: '#000', opacity: 1 },
    stroke: null,
  })
}

// ── Tests ──

describe('getHandleCursor', () => {
  test('returns default for null', () => {
    expect(getHandleCursor(null)).toBe('default')
  })

  test('returns correct cursor for each handle', () => {
    expect(getHandleCursor('nw')).toBe('nwse-resize')
    expect(getHandleCursor('se')).toBe('nwse-resize')
    expect(getHandleCursor('ne')).toBe('nesw-resize')
    expect(getHandleCursor('sw')).toBe('nesw-resize')
    expect(getHandleCursor('n')).toBe('ns-resize')
    expect(getHandleCursor('s')).toBe('ns-resize')
    expect(getHandleCursor('e')).toBe('ew-resize')
    expect(getHandleCursor('w')).toBe('ew-resize')
    expect(getHandleCursor('rotation')).toBe('crosshair')
    expect(getHandleCursor('body')).toBe('move')
  })
})

describe('isTransformDragging', () => {
  beforeEach(() => {
    resetStore()
    // Ensure no drag is active by calling cancelTransform
    cancelTransform()
  })

  test('returns false when no drag is active', () => {
    expect(isTransformDragging()).toBe(false)
  })

  test('returns true during active drag', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1')

    beginTransform('body', { x: 50, y: 50 }, 'layer-1', artboard.id)
    expect(isTransformDragging()).toBe(true)

    cancelTransform()
    expect(isTransformDragging()).toBe(false)
  })
})

describe('getHandlePositions', () => {
  test('computes correct positions for a 200x100 bbox', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 200, maxY: 100 }
    const handles = getHandlePositions(bbox, 1)

    expect(handles.nw).toEqual({ x: 0, y: 0 })
    expect(handles.ne).toEqual({ x: 200, y: 0 })
    expect(handles.sw).toEqual({ x: 0, y: 100 })
    expect(handles.se).toEqual({ x: 200, y: 100 })
    expect(handles.n).toEqual({ x: 100, y: 0 })
    expect(handles.s).toEqual({ x: 100, y: 100 })
    expect(handles.w).toEqual({ x: 0, y: 50 })
    expect(handles.e).toEqual({ x: 200, y: 50 })
    expect(handles.rotation).toEqual({ x: 100, y: -25 })
  })

  test('rotation handle moves closer at higher zoom', () => {
    const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const at1 = getHandlePositions(bbox, 1)
    const at4 = getHandlePositions(bbox, 4)
    // At higher zoom, rotOffset = 25/zoom is smaller, so rotation.y is closer to minY
    expect(at4.rotation.y).toBeGreaterThan(at1.rotation.y)
  })
})

describe('hitTestHandles', () => {
  const bbox: BBox = { minX: 50, minY: 50, maxX: 150, maxY: 150 }

  test('returns ne handle when near ne corner', () => {
    expect(hitTestHandles({ x: 150, y: 50 }, bbox, 1)).toBe('ne')
  })

  test('returns sw handle when near sw corner', () => {
    expect(hitTestHandles({ x: 50, y: 150 }, bbox, 1)).toBe('sw')
  })

  test('returns se handle when near se corner', () => {
    expect(hitTestHandles({ x: 150, y: 150 }, bbox, 1)).toBe('se')
  })

  test('returns w handle', () => {
    expect(hitTestHandles({ x: 50, y: 100 }, bbox, 1)).toBe('w')
  })

  test('returns e handle', () => {
    expect(hitTestHandles({ x: 150, y: 100 }, bbox, 1)).toBe('e')
  })

  test('handle radius scales with zoom', () => {
    // At very high zoom, the hit radius is small => miss a handle that's slightly away
    const result = hitTestHandles({ x: 55, y: 55 }, bbox, 100)
    // At zoom=100 the radius is 6/100 = 0.06 pixels, so (55,55) is far from (50,50)
    expect(result).toBe('body') // inside the bbox but not on a handle
  })
})

describe('beginTransform / updateTransform / endTransform', () => {
  beforeEach(() => {
    resetStore()
    cancelTransform()
  })

  test('beginTransform with invalid artboard does nothing', () => {
    beginTransform('body', { x: 0, y: 0 }, 'layer-1', 'nonexistent-artboard')
    expect(isTransformDragging()).toBe(false)
  })

  test('beginTransform with invalid layer does nothing', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    beginTransform('body', { x: 0, y: 0 }, 'nonexistent-layer', artboard.id)
    expect(isTransformDragging()).toBe(false)
  })

  test('updateTransform without active drag does nothing', () => {
    // Should not throw
    updateTransform({ x: 100, y: 100 })
  })

  test('body drag translates the layer', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 10, 20)

    beginTransform('body', { x: 50, y: 50 }, 'layer-1', artboard.id)
    updateTransform({ x: 60, y: 70 })

    const store = useEditorStore.getState()
    const ab = store.document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    // Translation should have moved by roughly (10, 20) from original
    expect(layer.transform.x).toBeGreaterThan(10)
    expect(layer.transform.y).toBeGreaterThan(20)

    endTransform()
    expect(isTransformDragging()).toBe(false)
  })

  test('endTransform with no drag does nothing', () => {
    // Should not throw
    endTransform()
  })

  test('endTransform without artboard cleans up drag', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)
    beginTransform('body', { x: 0, y: 0 }, 'layer-1', artboard.id)

    // Remove the artboard from the store
    const store = useEditorStore.getState()
    store.newDocument({ width: 100, height: 100 })

    endTransform()
    expect(isTransformDragging()).toBe(false)
  })

  test('cancelTransform restores original transform', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 10, 20)

    beginTransform('body', { x: 50, y: 50 }, 'layer-1', artboard.id)
    updateTransform({ x: 200, y: 200 })
    cancelTransform()

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    expect(layer.transform.x).toBe(10)
    expect(layer.transform.y).toBe(20)
    expect(isTransformDragging()).toBe(false)
  })

  test('cancelTransform without active drag does nothing', () => {
    cancelTransform()
    expect(isTransformDragging()).toBe(false)
  })

  test('scale handle se changes scaleX and scaleY', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('se', { x: 100, y: 100 }, 'layer-1', artboard.id)
    updateTransform({ x: 200, y: 200 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    expect(layer.transform.scaleX).toBeGreaterThan(1)
    expect(layer.transform.scaleY).toBeGreaterThan(1)

    endTransform()
  })

  test('rotation handle changes rotation', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('rotation', { x: 50, y: -25 }, 'layer-1', artboard.id)
    updateTransform({ x: 100, y: 0 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    expect(layer.transform.rotation).not.toBe(0)

    endTransform()
  })

  test('shift key constrains rotation to 15 degree increments', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('rotation', { x: 50, y: -25 }, 'layer-1', artboard.id)
    updateTransform({ x: 100, y: 0 }, true)

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    // Rotation should be a multiple of 15
    expect(layer.transform.rotation % 15).toBeCloseTo(0, 5)

    endTransform()
  })

  test('shift key constrains aspect ratio on corner handles', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('se', { x: 100, y: 100 }, 'layer-1', artboard.id)
    updateTransform({ x: 200, y: 150 }, true)

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    // With aspect ratio lock, scaleX and scaleY should match (original ratio was 1:1)
    expect(layer.transform.scaleX).toBeCloseTo(layer.transform.scaleY, 5)

    endTransform()
  })

  test('edge handle n only changes scaleY', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('n', { x: 50, y: 0 }, 'layer-1', artboard.id)
    updateTransform({ x: 50, y: -50 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    // scaleX should remain 1, scaleY should change
    expect(layer.transform.scaleX).toBe(1)
    expect(layer.transform.scaleY).not.toBe(1)

    endTransform()
  })

  test('edge handle e only changes scaleX', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('e', { x: 100, y: 50 }, 'layer-1', artboard.id)
    updateTransform({ x: 200, y: 50 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    expect(layer.transform.scaleX).toBeGreaterThan(1)
    expect(layer.transform.scaleY).toBe(1)

    endTransform()
  })

  test('edge handle w changes scaleX in reverse', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 50, 0)

    beginTransform('w', { x: 50, y: 50 }, 'layer-1', artboard.id)
    updateTransform({ x: 0, y: 50 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    // Dragging w handle left should increase scaleX
    expect(layer.transform.scaleX).toBeGreaterThan(1)

    endTransform()
  })

  test('edge handle s only changes scaleY', () => {
    const artboard = useEditorStore.getState().document.artboards[0]!
    addVectorLayer(artboard.id, 'layer-1', 0, 0)

    beginTransform('s', { x: 50, y: 100 }, 'layer-1', artboard.id)
    updateTransform({ x: 50, y: 200 })

    const ab = useEditorStore.getState().document.artboards[0]!
    const layer = ab.layers.find((l) => l.id === 'layer-1')!
    expect(layer.transform.scaleX).toBe(1)
    expect(layer.transform.scaleY).toBeGreaterThan(1)

    endTransform()
  })
})
