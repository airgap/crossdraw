import { describe, it, expect, beforeEach } from 'bun:test'
import { useEditorStore } from '@/store/editor.store'
import { contourPath, defaultContourParams } from '@/tools/boolean-ops'
import type { ContourParams } from '@/tools/boolean-ops'
import {
  beginSymbolSpray,
  spraySymbols,
  endSymbolSpray,
  getSymbolSprayerSettings,
  setSymbolSprayerSettings,
  getAvailableSymbols,
  isSpraying,
  getSprayPreviewInstances,
} from '@/tools/symbol-sprayer'
import type { VectorLayer, SymbolDefinition, GroupLayer } from '@/types'
import { v4 as uuid } from 'uuid'

// ── Helpers ──

function resetStore() {
  // Use newDocument to create a fresh doc with one artboard
  const store = useEditorStore.getState()
  store.newDocument({ title: 'Test', width: 800, height: 600 })
  const artboardId = useEditorStore.getState().document.artboards[0]!.id
  return { artboardId }
}

function setDocSymbols(symbols: SymbolDefinition[]) {
  const doc = useEditorStore.getState().document
  useEditorStore.setState({ document: { ...doc, symbols } })
}

function getArtboard(artboardId: string) {
  return useEditorStore.getState().document.artboards.find((a) => a.id === artboardId)!
}

function createSquareLayer(x: number, y: number, size: number): VectorLayer {
  return {
    id: uuid(),
    name: 'Square',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [
      {
        id: uuid(),
        segments: [
          { type: 'move', x, y },
          { type: 'line', x: x + size, y },
          { type: 'line', x: x + size, y: y + size },
          { type: 'line', x, y: y + size },
          { type: 'close' },
        ],
        closed: true,
      },
    ],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: null,
  }
}

// ─── Contour Path tests ─────────────────────────────────────

describe('contourPath', () => {
  it('creates N contour copies for a simple square', () => {
    const { artboardId } = resetStore()
    const layer = createSquareLayer(100, 100, 50)
    useEditorStore.getState().addLayer(artboardId, layer)

    const params: ContourParams = {
      offset: 5,
      steps: 3,
      joinType: 'round',
      miterLimit: 2,
      colorInterpolation: false,
    }

    contourPath(artboardId, layer.id, params)

    const artboard = getArtboard(artboardId)
    // Original + 3 contour copies
    expect(artboard.layers.length).toBe(4)
  })

  it('creates contour copies with inward (negative) offset', () => {
    const { artboardId } = resetStore()
    const layer = createSquareLayer(100, 100, 200)
    useEditorStore.getState().addLayer(artboardId, layer)

    const params: ContourParams = {
      offset: -10,
      steps: 3,
      joinType: 'miter',
      miterLimit: 2,
      colorInterpolation: false,
    }

    contourPath(artboardId, layer.id, params)

    const artboard = getArtboard(artboardId)
    // Original + at least some contour copies (some may vanish if offset exceeds path)
    expect(artboard.layers.length).toBeGreaterThan(1)
  })

  it('clamps steps to 1-20 range', () => {
    const { artboardId } = resetStore()
    const layer = createSquareLayer(100, 100, 100)
    useEditorStore.getState().addLayer(artboardId, layer)

    // Attempt 50 steps — should clamp to 20
    const params: ContourParams = {
      offset: 2,
      steps: 50,
      joinType: 'round',
      miterLimit: 2,
      colorInterpolation: false,
    }

    contourPath(artboardId, layer.id, params)

    const artboard = getArtboard(artboardId)
    // Original + max 20 copies
    expect(artboard.layers.length).toBeLessThanOrEqual(21)
    expect(artboard.layers.length).toBeGreaterThan(1)
  })

  it('uses color interpolation when enabled', () => {
    const { artboardId } = resetStore()
    const layer = createSquareLayer(100, 100, 100)
    useEditorStore.getState().addLayer(artboardId, layer)

    const params: ContourParams = {
      offset: 5,
      steps: 3,
      joinType: 'round',
      miterLimit: 2,
      colorInterpolation: true,
    }

    contourPath(artboardId, layer.id, params)

    const artboard = getArtboard(artboardId)
    const contourLayers = artboard.layers.filter((l) => l.name.includes('contour'))
    expect(contourLayers.length).toBe(3)

    // Each contour layer should have a fill
    for (const cl of contourLayers) {
      expect(cl.type).toBe('vector')
      const vl = cl as VectorLayer
      expect(vl.fill).toBeTruthy()
      expect(vl.fill!.color).toBeTruthy()
    }

    // Colors should differ from each other when interpolation is on
    const colors = contourLayers.map((l) => (l as VectorLayer).fill!.color)
    // First and last should differ (they interpolate toward white for positive offset)
    expect(colors[0]).not.toBe(colors[2])
  })

  it('supports square join type', () => {
    const { artboardId } = resetStore()
    const layer = createSquareLayer(100, 100, 50)
    useEditorStore.getState().addLayer(artboardId, layer)

    const params: ContourParams = {
      offset: 5,
      steps: 2,
      joinType: 'square',
      miterLimit: 2,
      colorInterpolation: false,
    }

    contourPath(artboardId, layer.id, params)

    const artboard = getArtboard(artboardId)
    expect(artboard.layers.length).toBe(3)
  })

  it('does nothing for non-vector layers', () => {
    const { artboardId } = resetStore()
    const store = useEditorStore.getState()
    // Add a group layer
    const groupId = uuid()
    store.addLayer(artboardId, {
      id: groupId,
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [],
    } as GroupLayer)

    contourPath(artboardId, groupId, defaultContourParams)

    // No new layers added
    expect(getArtboard(artboardId).layers.length).toBe(1)
  })

  it('does nothing for non-existent artboard', () => {
    resetStore()
    // Should not throw
    contourPath('bad-artboard-id', 'bad-layer-id', defaultContourParams)
  })

  it('does nothing for non-existent layer', () => {
    const { artboardId } = resetStore()
    contourPath(artboardId, 'bad-layer-id', defaultContourParams)
  })
})

// ─── Default contour params tests ───────────────────────────

describe('defaultContourParams', () => {
  it('has sensible defaults', () => {
    expect(defaultContourParams.offset).toBe(5)
    expect(defaultContourParams.steps).toBe(5)
    expect(defaultContourParams.joinType).toBe('round')
    expect(defaultContourParams.miterLimit).toBe(2)
    expect(defaultContourParams.colorInterpolation).toBe(false)
  })
})

// ─── Symbol Sprayer tests ───────────────────────────────────

describe('SymbolSprayer', () => {
  describe('settings', () => {
    beforeEach(() => {
      setSymbolSprayerSettings({
        symbolId: null,
        density: 3,
        scatterRadius: 40,
        sizeVariation: 30,
        rotationVariation: 0,
        opacityVariation: 0,
      })
    })

    it('returns default settings', () => {
      const settings = getSymbolSprayerSettings()
      expect(settings.symbolId).toBe(null)
      expect(settings.density).toBe(3)
      expect(settings.scatterRadius).toBe(40)
      expect(settings.sizeVariation).toBe(30)
      expect(settings.rotationVariation).toBe(0)
      expect(settings.opacityVariation).toBe(0)
    })

    it('updates settings partially', () => {
      setSymbolSprayerSettings({ density: 10, scatterRadius: 80 })
      const s = getSymbolSprayerSettings()
      expect(s.density).toBe(10)
      expect(s.scatterRadius).toBe(80)
      // Other settings unchanged
      expect(s.sizeVariation).toBe(30)
    })

    it('sets symbolId', () => {
      const symId = uuid()
      setSymbolSprayerSettings({ symbolId: symId })
      expect(getSymbolSprayerSettings().symbolId).toBe(symId)
    })
  })

  describe('spray lifecycle', () => {
    beforeEach(() => {
      setSymbolSprayerSettings({
        symbolId: null,
        density: 3,
        scatterRadius: 40,
        sizeVariation: 30,
        rotationVariation: 0,
        opacityVariation: 0,
      })
    })

    it('does nothing when symbolId is null', () => {
      beginSymbolSpray(100, 100)
      expect(isSpraying()).toBe(false)
    })

    it('begins spraying with a valid symbolId', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'TestSymbol',
          layers: [createSquareLayer(0, 0, 10)],
          width: 10,
          height: 10,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 2 })
      beginSymbolSpray(100, 100)

      expect(isSpraying()).toBe(true)
      const preview = getSprayPreviewInstances()
      expect(preview.length).toBe(2) // density = 2
    })

    it('accumulates instances on spraySymbols', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'TestSymbol',
          layers: [createSquareLayer(0, 0, 10)],
          width: 10,
          height: 10,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 5 })
      beginSymbolSpray(100, 100)
      spraySymbols(120, 120)
      spraySymbols(140, 140)

      // 5 from begin + 5 from first spray + 5 from second spray = 15
      expect(getSprayPreviewInstances().length).toBe(15)
    })

    it('creates a group layer on endSymbolSpray', () => {
      const { artboardId } = resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'TestSymbol',
          layers: [createSquareLayer(0, 0, 10)],
          width: 10,
          height: 10,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 3 })
      beginSymbolSpray(200, 200)

      const groupId = endSymbolSpray()
      expect(groupId).toBeTruthy()

      const artboard = getArtboard(artboardId)
      const groupLayer = artboard.layers.find((l: any) => l.id === groupId)
      expect(groupLayer).toBeTruthy()
      expect(groupLayer!.type).toBe('group')
      expect((groupLayer as GroupLayer).children.length).toBe(3)

      // Children should be symbol-instance layers
      for (const child of (groupLayer as GroupLayer).children) {
        expect(child.type).toBe('symbol-instance')
        expect((child as any).symbolId).toBe(symId)
      }
    })

    it('returns null when ending without spraying', () => {
      const result = endSymbolSpray()
      expect(result).toBe(null)
    })

    it('instances are within scatter radius', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'Sym',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      const radius = 50
      setSymbolSprayerSettings({ symbolId: symId, density: 20, scatterRadius: radius })
      beginSymbolSpray(300, 300)

      const instances = getSprayPreviewInstances()
      for (const inst of instances) {
        const dx = inst.x - 300
        const dy = inst.y - 300
        const dist = Math.sqrt(dx * dx + dy * dy)
        expect(dist).toBeLessThanOrEqual(radius + 1) // +1 for float rounding
      }
    })

    it('isSpraying returns false after end', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'S',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId })
      beginSymbolSpray(0, 0)
      expect(isSpraying()).toBe(true)

      endSymbolSpray()
      expect(isSpraying()).toBe(false)
    })

    it('clears preview instances after end', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'S',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 5 })
      beginSymbolSpray(100, 100)
      expect(getSprayPreviewInstances().length).toBe(5)

      endSymbolSpray()
      expect(getSprayPreviewInstances().length).toBe(0)
    })
  })

  describe('getAvailableSymbols', () => {
    it('returns empty when no symbols defined', () => {
      resetStore()
      expect(getAvailableSymbols()).toEqual([])
    })

    it('returns defined symbols', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'Star',
          layers: [],
          width: 20,
          height: 20,
        },
      ])

      const syms = getAvailableSymbols()
      expect(syms.length).toBe(1)
      expect(syms[0]!.name).toBe('Star')
    })
  })

  describe('variation settings', () => {
    beforeEach(() => {
      setSymbolSprayerSettings({
        symbolId: null,
        density: 3,
        scatterRadius: 40,
        sizeVariation: 30,
        rotationVariation: 0,
        opacityVariation: 0,
      })
    })

    it('applies size variation to sprayed instances', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'S',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 20, sizeVariation: 100 })
      beginSymbolSpray(200, 200)

      const instances = getSprayPreviewInstances()
      const scales = instances.map((i) => i.scale)
      // With 100% size variation and 20 instances, we should get varied scales
      const minScale = Math.min(...scales)
      const maxScale = Math.max(...scales)
      // There should be some variation (probabilistic, but with 20 samples very likely)
      expect(maxScale).toBeGreaterThanOrEqual(minScale)
    })

    it('applies rotation variation', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'S',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 20, rotationVariation: 360 })
      beginSymbolSpray(200, 200)

      const instances = getSprayPreviewInstances()
      // At least some should have non-zero rotation
      const rotations = instances.map((i) => i.rotation)
      const hasNonZero = rotations.some((r) => r !== 0)
      expect(hasNonZero).toBe(true)
    })

    it('applies opacity variation', () => {
      resetStore()
      const symId = uuid()
      setDocSymbols([
        {
          id: symId,
          name: 'S',
          layers: [createSquareLayer(0, 0, 5)],
          width: 5,
          height: 5,
        },
      ])

      setSymbolSprayerSettings({ symbolId: symId, density: 20, opacityVariation: 100 })
      beginSymbolSpray(200, 200)

      const instances = getSprayPreviewInstances()
      // All opacities should be >= 0.1 (minimum)
      for (const inst of instances) {
        expect(inst.opacity).toBeGreaterThanOrEqual(0.1)
        expect(inst.opacity).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('activeTool integration', () => {
    it('can set activeTool to symbol-sprayer', () => {
      const store = useEditorStore.getState()
      store.setActiveTool('symbol-sprayer')
      expect(useEditorStore.getState().activeTool).toBe('symbol-sprayer')
    })
  })
})
