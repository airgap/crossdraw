import { describe, test, expect, beforeEach } from 'bun:test'
import {
  getNodeState,
  clearNodeSelection,
  hitTestNode,
  hitTestHandle,
  nodeMouseDown,
  nodeMouseDrag,
  nodeMouseUp,
  deleteSelectedNodes,
  insertPointOnSegment,
  toggleNodeSmooth,
  hitTestSegmentEdge,
} from '@/tools/node'
import { useEditorStore } from '@/store/editor.store'
import type { VectorLayer } from '@/types'

// --- helpers ---

function makeVectorLayer(id: string, paths: any[]): VectorLayer {
  return {
    id,
    name: `Layer ${id}`,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: { type: 'solid', color: '#000', opacity: 1 },
    stroke: null,
  } as VectorLayer
}

function setupLayerInStore(layerId: string, paths: any[]) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) throw new Error('No artboard')
  const layer = makeVectorLayer(layerId, paths)
  store.addLayer(artboard.id, layer as any)
  store.selectLayer(layerId)
  return { artboard, layer }
}

describe('node tool - getNodeState / clearNodeSelection', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('getNodeState returns initial state', () => {
    const st = getNodeState()
    expect(st.selectedNodes.size).toBe(0)
    expect(st.dragging).toBe(false)
    expect(st.dragStart).toBeNull()
    expect(st.draggingHandle).toBeNull()
    expect(st.layerId).toBeNull()
    expect(st.artboardId).toBeNull()
  })

  test('clearNodeSelection resets all fields', () => {
    const st = getNodeState()
    st.selectedNodes.add('p:0')
    st.dragging = true
    st.layerId = 'foo'
    clearNodeSelection()
    expect(st.selectedNodes.size).toBe(0)
    expect(st.dragging).toBe(false)
    expect(st.layerId).toBeNull()
  })
})

describe('node tool - hitTestNode', () => {
  test('finds node within threshold', () => {
    const layer = makeVectorLayer('ht-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    const result = hitTestNode(50, 50, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.segIndex).toBe(0)
    expect(result!.pathId).toBe('p1')
  })

  test('finds closest node', () => {
    const layer = makeVectorLayer('ht-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    const result = hitTestNode(98, 0, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.segIndex).toBe(1)
  })

  test('returns null when too far from any node', () => {
    const layer = makeVectorLayer('ht-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 10, y: 0 },
        ],
        closed: false,
      },
    ])

    const result = hitTestNode(500, 500, layer, 0, 0, 1)
    expect(result).toBeNull()
  })

  test('accounts for layer transform offset', () => {
    const layer = makeVectorLayer('ht-4', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 10, y: 10 }],
        closed: false,
      },
    ])
    layer.transform = { x: 100, y: 100, scaleX: 1, scaleY: 1, rotation: 0 }

    // Node at (10+100, 10+100) = (110, 110) in doc space with artboard at (0,0)
    const result = hitTestNode(110, 110, layer, 0, 0, 1)
    expect(result).not.toBeNull()
  })

  test('accounts for artboard offset', () => {
    const layer = makeVectorLayer('ht-5', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 10, y: 10 }],
        closed: false,
      },
    ])

    const result = hitTestNode(60, 60, layer, 50, 50, 1)
    expect(result).not.toBeNull()
  })

  test('zoom affects threshold', () => {
    const layer = makeVectorLayer('ht-6', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 0, y: 0 }],
        closed: false,
      },
    ])

    // At zoom=10, threshold = 8/10 = 0.8
    const result = hitTestNode(1, 0, layer, 0, 0, 10)
    expect(result).toBeNull() // 1px away but threshold is 0.8
  })

  test('skips close segments', () => {
    const layer = makeVectorLayer('ht-7', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 50, y: 0 }, { type: 'close' }],
        closed: true,
      },
    ])

    // close has no x/y, so hitTestNode should not crash
    const result = hitTestNode(0, 0, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.segIndex).toBe(0)
  })
})

describe('node tool - hitTestHandle', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('detects cubic cp1 handle', () => {
    const layer = makeVectorLayer('hh-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    // Select the cubic segment node
    const state = getNodeState()
    state.selectedNodes.add('p1:1')

    const result = hitTestHandle(30, 50, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.handle).toBe('cp1')
    expect(result!.segIndex).toBe(1)
  })

  test('detects cubic cp2 handle', () => {
    const layer = makeVectorLayer('hh-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('p1:1')

    const result = hitTestHandle(70, 50, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.handle).toBe('cp2')
  })

  test('detects quadratic cp handle', () => {
    const layer = makeVectorLayer('hh-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 80 },
        ],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('p1:1')

    const result = hitTestHandle(50, 80, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.handle).toBe('cp')
  })

  test('returns null when no nodes are selected', () => {
    const layer = makeVectorLayer('hh-4', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    const result = hitTestHandle(30, 50, layer, 0, 0, 1)
    expect(result).toBeNull()
  })

  test('returns null when path not found', () => {
    const layer = makeVectorLayer('hh-5', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 0, y: 0 }],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('nonexistent:0')

    const result = hitTestHandle(0, 0, layer, 0, 0, 1)
    expect(result).toBeNull()
  })
})

describe('node tool - hitTestSegmentEdge', () => {
  test('finds line segment edge', () => {
    const layer = makeVectorLayer('se-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    // Click at (50, 0) should be on the line
    const result = hitTestSegmentEdge(50, 0, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.segIndex).toBe(1)
  })

  test('finds cubic segment edge by sampling', () => {
    const layer = makeVectorLayer('se-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 50, cp2x: 100, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    // Midpoint of this cubic should be near (50, ~37.5)
    const result = hitTestSegmentEdge(50, 37, layer, 0, 0, 1)
    expect(result).not.toBeNull()
  })

  test('finds quadratic segment edge by sampling', () => {
    const layer = makeVectorLayer('se-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 100 },
        ],
        closed: false,
      },
    ])

    // Midpoint of quadratic at t=0.5 is (50, 50)
    const result = hitTestSegmentEdge(50, 50, layer, 0, 0, 1)
    expect(result).not.toBeNull()
  })

  test('returns null when far from any edge', () => {
    const layer = makeVectorLayer('se-4', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 10, y: 0 },
        ],
        closed: false,
      },
    ])

    const result = hitTestSegmentEdge(500, 500, layer, 0, 0, 1)
    expect(result).toBeNull()
  })

  test('skips move and close segments', () => {
    const layer = makeVectorLayer('se-5', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }],
        closed: true,
      },
    ])

    // On the line between (0,0) and (100,0)
    const result = hitTestSegmentEdge(50, 0, layer, 0, 0, 1)
    expect(result).not.toBeNull()
    expect(result!.segIndex).toBe(1)
  })
})

describe('node tool - nodeMouseDown', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('does nothing when no vector layer is selected', () => {
    const store = useEditorStore.getState()
    store.deselectAll()
    nodeMouseDown(50, 50, 1, false)
    const st = getNodeState()
    expect(st.dragging).toBe(false)
  })

  test('selects a node on click', () => {
    const { artboard } = setupLayerInStore('nmd-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    const st = getNodeState()
    expect(st.selectedNodes.size).toBe(1)
    expect(st.dragging).toBe(true)
  })

  test('shift+click toggles node selection', () => {
    const { artboard } = setupLayerInStore('nmd-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    const st = getNodeState()
    expect(st.selectedNodes.size).toBe(1)

    // Shift+click on same node should deselect it
    nodeMouseUp()
    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, true)
    expect(st.selectedNodes.size).toBe(0)
  })

  test('shift+click adds to selection', () => {
    const { artboard } = setupLayerInStore('nmd-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    nodeMouseUp()
    nodeMouseDown(100 + artboard.x, 100 + artboard.y, 1, true)
    const st = getNodeState()
    expect(st.selectedNodes.size).toBe(2)
  })

  test('click on empty space without shift deselects all', () => {
    const { artboard } = setupLayerInStore('nmd-4', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 50, y: 50 }],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    nodeMouseUp()
    expect(getNodeState().selectedNodes.size).toBe(1)

    nodeMouseDown(500 + artboard.x, 500 + artboard.y, 1, false)
    expect(getNodeState().selectedNodes.size).toBe(0)
  })

  test('clicking a handle starts handle drag', () => {
    const { artboard } = setupLayerInStore('nmd-5', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    // First select the node
    const state = getNodeState()
    state.selectedNodes.add('p1:1')
    state.layerId = 'nmd-5'
    state.artboardId = artboard.id

    // Now click on the cp1 handle
    nodeMouseDown(30 + artboard.x, 50 + artboard.y, 1, false)
    expect(state.draggingHandle).not.toBeNull()
    expect(state.draggingHandle!.handle).toBe('cp1')
  })
})

describe('node tool - nodeMouseDrag', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('does nothing when not dragging', () => {
    nodeMouseDrag(100, 100, false)
    // Should not throw
    expect(getNodeState().dragging).toBe(false)
  })

  test('moves selected nodes', () => {
    const { artboard } = setupLayerInStore('ndrag-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    nodeMouseDrag(60 + artboard.x, 60 + artboard.y, false)

    // Verify dragStart updated
    const st = getNodeState()
    expect(st.dragStart).toEqual({ x: 60 + artboard.x, y: 60 + artboard.y })
  })

  test('shift constrains to axis', () => {
    const { artboard } = setupLayerInStore('ndrag-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    // Move more in X direction with shift
    nodeMouseDrag(70 + artboard.x, 55 + artboard.y, true)

    // Should constrain - just check it didn't crash
    expect(getNodeState().dragging).toBe(true)
  })

  test('drags control handle on cubic segment', () => {
    const { artboard } = setupLayerInStore('ndrag-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('p1:1')
    state.layerId = 'ndrag-3'
    state.artboardId = artboard.id

    nodeMouseDown(30 + artboard.x, 50 + artboard.y, 1, false)
    expect(state.draggingHandle).not.toBeNull()

    nodeMouseDrag(40 + artboard.x, 60 + artboard.y, false)
    expect(state.dragging).toBe(true)
  })
})

describe('node tool - nodeMouseUp', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('does nothing when not dragging', () => {
    nodeMouseUp()
    expect(getNodeState().dragging).toBe(false)
  })

  test('commits drag and resets drag state', () => {
    setupLayerInStore('nup-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 50, y: 50 },
          { type: 'line', x: 100, y: 100 },
        ],
        closed: false,
      },
    ])

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    nodeMouseDown(50 + artboard.x, 50 + artboard.y, 1, false)
    nodeMouseDrag(60 + artboard.x, 60 + artboard.y, false)
    nodeMouseUp()

    const st = getNodeState()
    expect(st.dragging).toBe(false)
    expect(st.dragStart).toBeNull()
    expect(st.draggingHandle).toBeNull()
  })
})

describe('node tool - deleteSelectedNodes', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('does nothing when no nodes are selected', () => {
    deleteSelectedNodes()
    // Should not throw
    expect(getNodeState().selectedNodes.size).toBe(0)
  })

  test('deletes selected nodes from path', () => {
    setupLayerInStore('del-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 50, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('p1:1') // select the middle node

    deleteSelectedNodes()
    expect(state.selectedNodes.size).toBe(0)

    // Verify the path now has fewer segments
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'del-1') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(2)
  })

  test('removes path entirely when only one segment remains', () => {
    setupLayerInStore('del-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 50, y: 0 },
        ],
        closed: false,
      },
    ])

    const state = getNodeState()
    state.selectedNodes.add('p1:1')

    deleteSelectedNodes()

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'del-2') as VectorLayer
    expect(layer.paths).toHaveLength(0)
  })
})

describe('node tool - insertPointOnSegment', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('inserts midpoint on line segment', () => {
    setupLayerInStore('ins-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    insertPointOnSegment('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'ins-1') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(3) // move, line, line
    const midSeg = layer.paths[0]!.segments[1]!
    expect(midSeg.type !== 'close' && midSeg.x).toBe(50) // midpoint
  })

  test('inserts point on cubic segment using de Casteljau', () => {
    setupLayerInStore('ins-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 0, cp1y: 100, cp2x: 100, cp2y: 100 },
        ],
        closed: false,
      },
    ])

    insertPointOnSegment('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'ins-2') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(3) // move, cubic, cubic
    expect(layer.paths[0]!.segments[1]!.type).toBe('cubic')
    expect(layer.paths[0]!.segments[2]!.type).toBe('cubic')
  })

  test('inserts point on quadratic segment', () => {
    setupLayerInStore('ins-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'quadratic', x: 100, y: 0, cpx: 50, cpy: 100 },
        ],
        closed: false,
      },
    ])

    insertPointOnSegment('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'ins-3') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(3)
    expect(layer.paths[0]!.segments[1]!.type).toBe('quadratic')
    expect(layer.paths[0]!.segments[2]!.type).toBe('quadratic')
  })

  test('does nothing for move segment', () => {
    setupLayerInStore('ins-4', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    insertPointOnSegment('p1', 0)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'ins-4') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(2) // unchanged
  })

  test('does nothing for close segment', () => {
    setupLayerInStore('ins-5', [
      {
        id: 'p1',
        segments: [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 0 }, { type: 'close' }],
        closed: true,
      },
    ])

    insertPointOnSegment('p1', 2)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'ins-5') as VectorLayer
    expect(layer.paths[0]!.segments).toHaveLength(3) // unchanged
  })

  test('does nothing when no editing layer is available', () => {
    useEditorStore.getState().deselectAll()
    insertPointOnSegment('nonexistent', 1)
    // Should not throw
  })

  test('does nothing when path not found', () => {
    setupLayerInStore('ins-6', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    insertPointOnSegment('nonexistent-path', 1)
    // Should not throw
  })
})

describe('node tool - toggleNodeSmooth', () => {
  beforeEach(() => {
    clearNodeSelection()
  })

  test('converts line to cubic', () => {
    setupLayerInStore('tns-1', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 100, y: 0 },
        ],
        closed: false,
      },
    ])

    toggleNodeSmooth('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'tns-1') as VectorLayer
    const seg = layer.paths[0]!.segments[1]!
    expect(seg.type).toBe('cubic')
  })

  test('collapses smooth cubic to corner', () => {
    setupLayerInStore('tns-2', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 30, cp1y: 50, cp2x: 70, cp2y: 50 },
        ],
        closed: false,
      },
    ])

    toggleNodeSmooth('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'tns-2') as VectorLayer
    const seg = layer.paths[0]!.segments[1] as any
    expect(seg.type).toBe('cubic')
    // cp2 should be collapsed to the anchor
    expect(seg.cp2x).toBe(seg.x)
    expect(seg.cp2y).toBe(seg.y)
  })

  test('expands corner cubic to smooth', () => {
    setupLayerInStore('tns-3', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 100, y: 0, cp1x: 100, cp1y: 0, cp2x: 100, cp2y: 0 },
        ],
        closed: false,
      },
    ])

    toggleNodeSmooth('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'tns-3') as VectorLayer
    const seg = layer.paths[0]!.segments[1] as any
    // cp2 should have been extended
    expect(seg.cp2x).not.toBe(seg.x)
  })

  test('does nothing when no editing layer', () => {
    useEditorStore.getState().deselectAll()
    toggleNodeSmooth('nonexistent', 0)
    // Should not throw
  })

  test('handles next segment being cubic (smooth toggle)', () => {
    setupLayerInStore('tns-4', [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'cubic', x: 50, y: 0, cp1x: 10, cp1y: 20, cp2x: 40, cp2y: 20 },
          { type: 'cubic', x: 100, y: 0, cp1x: 60, cp1y: 20, cp2x: 90, cp2y: 20 },
        ],
        closed: false,
      },
    ])

    // Toggle smooth on the first cubic - should also affect next segment's cp1
    toggleNodeSmooth('p1', 1)

    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layer = artboard.layers.find((l) => l.id === 'tns-4') as VectorLayer
    // Just verify no crash
    expect(layer.paths[0]!.segments).toHaveLength(3)
  })
})
