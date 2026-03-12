import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { selectSame, selectInverse } from '@/tools/selection-filters'
import type { VectorLayer, TextLayer, GroupLayer, Layer, Stroke, Effect } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 200, height: 200 })
}

function artboardId(): string {
  return useEditorStore.getState().document.artboards[0]!.id
}

function layers(): Layer[] {
  return useEditorStore.getState().document.artboards[0]!.layers
}
// Suppress unused — helper available for debugging
void layers

function selection(): string[] {
  return useEditorStore.getState().selection.layerIds
}

let layerCounter = 0
function uid(): string {
  return `sf-${++layerCounter}`
}

function addVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  const layer: VectorLayer = {
    id: uid(),
    name: 'Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  const layer: TextLayer = {
    id: uid(),
    name: 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), layer)
  return layer
}

function addGroupLayer(children: Layer[], overrides: Partial<GroupLayer> = {}): GroupLayer {
  const group: GroupLayer = {
    id: uid(),
    name: 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children,
    ...overrides,
  }
  useEditorStore.getState().addLayer(artboardId(), group)
  return group
}

// ── selectSame tests ──

describe('selectSame', () => {
  beforeEach(resetStore)

  describe('fill', () => {
    it('selects all layers with the same fill color', () => {
      const red1 = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      const red2 = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      const blue = addVectorLayer({ fill: { type: 'solid', color: '#0000ff', opacity: 1 } })

      useEditorStore.getState().selectLayer(red1.id)
      selectSame('fill')

      const sel = selection()
      expect(sel).toContain(red1.id)
      expect(sel).toContain(red2.id)
      expect(sel).not.toContain(blue.id)
    })

    it('returns no change when only one layer matches', () => {
      const red = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      addVectorLayer({ fill: { type: 'solid', color: '#0000ff', opacity: 1 } })
      addVectorLayer({ fill: { type: 'solid', color: '#00ff00', opacity: 1 } })

      useEditorStore.getState().selectLayer(red.id)
      selectSame('fill')

      const sel = selection()
      expect(sel).toContain(red.id)
      expect(sel.length).toBe(1)
    })

    it('does not match non-vector layers', () => {
      const vec = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      const text = addTextLayer()

      useEditorStore.getState().selectLayer(vec.id)
      selectSame('fill')

      const sel = selection()
      expect(sel).toContain(vec.id)
      expect(sel).not.toContain(text.id)
    })

    it('does nothing with null fill on reference layer', () => {
      const noFill = addVectorLayer({ fill: null })
      addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })

      useEditorStore.getState().selectLayer(noFill.id)
      selectSame('fill')

      // refValue is undefined, function returns early
      const sel = selection()
      // Selection remains as it was (just noFill.id selected)
      expect(sel).toEqual([noFill.id])
    })

    it('matches group children', () => {
      const red1 = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      const childRed: VectorLayer = {
        id: uid(),
        name: 'Child Red',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [],
        fill: { type: 'solid', color: '#ff0000', opacity: 1 },
        stroke: null,
      }
      const childBlue: VectorLayer = {
        id: uid(),
        name: 'Child Blue',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [],
        fill: { type: 'solid', color: '#0000ff', opacity: 1 },
        stroke: null,
      }
      addGroupLayer([childRed, childBlue])

      useEditorStore.getState().selectLayer(red1.id)
      selectSame('fill')

      const sel = selection()
      expect(sel).toContain(red1.id)
      expect(sel).toContain(childRed.id)
      expect(sel).not.toContain(childBlue.id)
    })
  })

  describe('stroke', () => {
    it('selects all layers with the same stroke color', () => {
      const stroke1: Stroke = {
        width: 2,
        color: '#00ff00',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }
      const stroke2: Stroke = {
        width: 5,
        color: '#00ff00',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }
      const strokeDiff: Stroke = {
        width: 2,
        color: '#ff0000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }

      const v1 = addVectorLayer({ stroke: stroke1 })
      const v2 = addVectorLayer({ stroke: stroke2 })
      const v3 = addVectorLayer({ stroke: strokeDiff })

      useEditorStore.getState().selectLayer(v1.id)
      selectSame('stroke')

      const sel = selection()
      expect(sel).toContain(v1.id)
      expect(sel).toContain(v2.id)
      expect(sel).not.toContain(v3.id)
    })

    it('does nothing when reference layer has no stroke', () => {
      const v1 = addVectorLayer({ stroke: null })
      useEditorStore.getState().selectLayer(v1.id)
      selectSame('stroke')

      expect(selection()).toEqual([v1.id])
    })
  })

  describe('strokeWidth', () => {
    it('selects all layers with the same stroke width', () => {
      const stroke2: Stroke = {
        width: 2,
        color: '#000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }
      const stroke2b: Stroke = {
        width: 2,
        color: '#fff',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }
      const stroke5: Stroke = {
        width: 5,
        color: '#000',
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 10,
      }

      const v1 = addVectorLayer({ stroke: stroke2 })
      const v2 = addVectorLayer({ stroke: stroke2b })
      const v3 = addVectorLayer({ stroke: stroke5 })

      useEditorStore.getState().selectLayer(v1.id)
      selectSame('strokeWidth')

      const sel = selection()
      expect(sel).toContain(v1.id)
      expect(sel).toContain(v2.id)
      expect(sel).not.toContain(v3.id)
    })
  })

  describe('font', () => {
    it('selects all text layers with the same font family', () => {
      const t1 = addTextLayer({ fontFamily: 'Helvetica' })
      const t2 = addTextLayer({ fontFamily: 'Helvetica' })
      const t3 = addTextLayer({ fontFamily: 'Times New Roman' })

      useEditorStore.getState().selectLayer(t1.id)
      selectSame('font')

      const sel = selection()
      expect(sel).toContain(t1.id)
      expect(sel).toContain(t2.id)
      expect(sel).not.toContain(t3.id)
    })

    it('does not match vector layers for font', () => {
      const t1 = addTextLayer({ fontFamily: 'Helvetica' })
      const v1 = addVectorLayer()

      useEditorStore.getState().selectLayer(t1.id)
      selectSame('font')

      const sel = selection()
      expect(sel).toContain(t1.id)
      expect(sel).not.toContain(v1.id)
    })

    it('does nothing when reference layer is a vector (no font)', () => {
      const v1 = addVectorLayer()
      addTextLayer({ fontFamily: 'Helvetica' })

      useEditorStore.getState().selectLayer(v1.id)
      selectSame('font')

      // refValue is undefined for vector on 'font', function returns early
      expect(selection()).toEqual([v1.id])
    })
  })

  describe('effectType', () => {
    it('selects all layers with the same first effect type', () => {
      const blurEffect: Effect = {
        id: 'e1',
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: { kind: 'blur', radius: 5, quality: 'medium' },
      }
      const blurEffect2: Effect = {
        id: 'e2',
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: { kind: 'blur', radius: 10, quality: 'high' },
      }
      const shadowEffect: Effect = {
        id: 'e3',
        type: 'shadow',
        enabled: true,
        opacity: 1,
        params: { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.5 },
      }

      const v1 = addVectorLayer({ effects: [blurEffect] })
      const v2 = addVectorLayer({ effects: [blurEffect2] })
      const v3 = addVectorLayer({ effects: [shadowEffect] })

      useEditorStore.getState().selectLayer(v1.id)
      selectSame('effectType')

      const sel = selection()
      expect(sel).toContain(v1.id)
      expect(sel).toContain(v2.id)
      expect(sel).not.toContain(v3.id)
    })

    it('also matches text layers with same effect type', () => {
      const blurEffect: Effect = {
        id: 'e1',
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: { kind: 'blur', radius: 5, quality: 'medium' },
      }
      const blurEffect2: Effect = {
        id: 'e4',
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: { kind: 'blur', radius: 3, quality: 'low' },
      }

      const v1 = addVectorLayer({ effects: [blurEffect] })
      const t1 = addTextLayer({ effects: [blurEffect2] })

      useEditorStore.getState().selectLayer(v1.id)
      selectSame('effectType')

      const sel = selection()
      expect(sel).toContain(v1.id)
      expect(sel).toContain(t1.id)
    })

    it('does nothing when reference layer has no effects', () => {
      const v1 = addVectorLayer({ effects: [] })
      useEditorStore.getState().selectLayer(v1.id)
      selectSame('effectType')

      expect(selection()).toEqual([v1.id])
    })
  })

  describe('edge cases', () => {
    it('does nothing when no artboard', () => {
      useEditorStore.setState({
        document: { ...useEditorStore.getState().document, artboards: [] },
      })
      selectSame('fill')
      // Should not throw
    })

    it('does nothing when no selection', () => {
      addVectorLayer()
      useEditorStore.getState().deselectAll()
      selectSame('fill')

      expect(selection()).toEqual([])
    })

    it('does nothing when selected layer is not found on artboard', () => {
      addVectorLayer()
      // Set selection to a nonexistent layer
      useEditorStore.setState({ selection: { layerIds: ['nonexistent-id'] } })
      selectSame('fill')

      // Selection remains unchanged (function returns early)
      expect(selection()).toEqual(['nonexistent-id'])
    })

    it('uses the first selected layer as reference for multi-selection', () => {
      const red = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })
      const blue = addVectorLayer({ fill: { type: 'solid', color: '#0000ff', opacity: 1 } })
      const red2 = addVectorLayer({ fill: { type: 'solid', color: '#ff0000', opacity: 1 } })

      // Select both red and blue, but red is first
      useEditorStore.getState().selectLayer(red.id)
      useEditorStore.getState().selectLayer(blue.id, true)
      selectSame('fill')

      const sel = selection()
      // Should match all reds (based on first selected = red)
      expect(sel).toContain(red.id)
      expect(sel).toContain(red2.id)
      expect(sel).not.toContain(blue.id)
    })
  })
})

// ── selectInverse tests ──

describe('selectInverse', () => {
  beforeEach(resetStore)

  it('selects all unselected layers', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()
    const v3 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    selectInverse()

    const sel = selection()
    expect(sel).not.toContain(v1.id)
    expect(sel).toContain(v2.id)
    expect(sel).toContain(v3.id)
  })

  it('deselects all when everything was selected', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()

    useEditorStore.getState().selectLayer(v1.id)
    useEditorStore.getState().selectLayer(v2.id, true)
    selectInverse()

    expect(selection()).toEqual([])
  })

  it('selects all when nothing was selected', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()

    useEditorStore.getState().deselectAll()
    selectInverse()

    const sel = selection()
    expect(sel).toContain(v1.id)
    expect(sel).toContain(v2.id)
  })

  it('includes group children in inverse', () => {
    const v1 = addVectorLayer()
    const childA: VectorLayer = {
      id: uid(),
      name: 'Child A',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const childB: VectorLayer = {
      id: uid(),
      name: 'Child B',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const group = addGroupLayer([childA, childB])

    // Select only v1
    useEditorStore.getState().selectLayer(v1.id)
    selectInverse()

    const sel = selection()
    expect(sel).not.toContain(v1.id)
    // Group itself + its children should be in the inverse
    expect(sel).toContain(group.id)
    expect(sel).toContain(childA.id)
    expect(sel).toContain(childB.id)
  })

  it('excludes selected group children from inverse', () => {
    const childA: VectorLayer = {
      id: uid(),
      name: 'Child A',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const childB: VectorLayer = {
      id: uid(),
      name: 'Child B',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const group = addGroupLayer([childA, childB])

    // Select childA directly
    useEditorStore.setState({ selection: { layerIds: [childA.id] } })
    selectInverse()

    const sel = selection()
    expect(sel).not.toContain(childA.id)
    expect(sel).toContain(childB.id)
    expect(sel).toContain(group.id)
  })

  it('does nothing with no artboard', () => {
    useEditorStore.setState({
      document: { ...useEditorStore.getState().document, artboards: [] },
    })
    selectInverse()
    // Should not throw
  })

  it('handles empty artboard with no layers', () => {
    // Default artboard has no layers
    selectInverse()
    expect(selection()).toEqual([])
  })

  it('double inverse restores original selection', () => {
    const v1 = addVectorLayer()
    const v2 = addVectorLayer()
    const v3 = addVectorLayer()

    useEditorStore.getState().selectLayer(v2.id)
    selectInverse()
    selectInverse()

    const sel = selection()
    // After two inverses, should be back to v2 only
    expect(sel).toContain(v2.id)
    expect(sel).not.toContain(v1.id)
    expect(sel).not.toContain(v3.id)
  })
})
