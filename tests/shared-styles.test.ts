import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '@/store/editor.store'
import type { TextStyle, ColorStyle, EffectStyle, TextLayer, VectorLayer, Effect } from '@/types'

// ── Helpers ──

function resetStore() {
  useEditorStore.getState().newDocument({ title: 'Test', width: 800, height: 600 })
}

function getDoc() {
  return useEditorStore.getState().document
}

function artboardId(): string {
  return getDoc().artboards[0]!.id
}

function createTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    name: 'Test Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: 'Hello',
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.5,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

function createVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: 'vec-1',
    name: 'Test Vector',
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
}

function makeEffect(id: string): Effect {
  return {
    id,
    type: 'blur',
    enabled: true,
    opacity: 1,
    params: { kind: 'blur', radius: 5, quality: 'medium' },
  }
}

// ── Tests ──

describe('Shared Styles', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('Text Styles', () => {
    it('should create a text style from layer properties', () => {
      const store = useEditorStore.getState()
      const textLayer = createTextLayer({ fontFamily: 'Roboto', fontSize: 24, color: '#333333' })
      store.addLayer(artboardId(), textLayer)
      store.selectLayer(textLayer.id)

      const style: TextStyle = {
        id: 'ts-1',
        name: 'Heading',
        fontFamily: 'Roboto',
        fontSize: 24,
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.5,
        letterSpacing: 0,
        color: '#333333',
      }
      store.addTextStyle(style)

      const doc = getDoc()
      expect(doc.styles).toBeDefined()
      expect(doc.styles!.textStyles).toHaveLength(1)
      expect(doc.styles!.textStyles[0]!.name).toBe('Heading')
      expect(doc.styles!.textStyles[0]!.fontFamily).toBe('Roboto')
      expect(doc.styles!.textStyles[0]!.fontSize).toBe(24)
      expect(doc.styles!.textStyles[0]!.color).toBe('#333333')
    })

    it('should apply a text style to a layer', () => {
      const store = useEditorStore.getState()

      const style: TextStyle = {
        id: 'ts-1',
        name: 'Body',
        fontFamily: 'Georgia',
        fontSize: 14,
        fontWeight: 'bold',
        fontStyle: 'italic',
        lineHeight: 1.8,
        letterSpacing: 0.5,
        color: '#112233',
      }
      store.addTextStyle(style)

      const textLayer = createTextLayer({ id: 'tl-apply' })
      store.addLayer(artboardId(), textLayer)

      store.applyTextStyle('tl-apply', artboardId(), 'ts-1')

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'tl-apply') as TextLayer
      expect(layer.textStyleId).toBe('ts-1')
      expect(layer.fontFamily).toBe('Georgia')
      expect(layer.fontSize).toBe(14)
      expect(layer.fontWeight).toBe('bold')
      expect(layer.fontStyle).toBe('italic')
      expect(layer.lineHeight).toBe(1.8)
      expect(layer.letterSpacing).toBe(0.5)
      expect(layer.color).toBe('#112233')
    })

    it('should propagate text style updates to linked layers', () => {
      const store = useEditorStore.getState()

      const style: TextStyle = {
        id: 'ts-prop',
        name: 'Link Style',
        fontFamily: 'Arial',
        fontSize: 12,
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.2,
        letterSpacing: 0,
        color: '#000000',
      }
      store.addTextStyle(style)

      // Add two text layers linked to the same style
      const tl1 = createTextLayer({ id: 'tl-1' })
      const tl2 = createTextLayer({ id: 'tl-2' })
      store.addLayer(artboardId(), tl1)
      store.addLayer(artboardId(), tl2)

      store.applyTextStyle('tl-1', artboardId(), 'ts-prop')
      store.applyTextStyle('tl-2', artboardId(), 'ts-prop')

      // Update the style
      store.updateTextStyle('ts-prop', { fontSize: 20, color: '#ff0000' })

      const doc = getDoc()
      const layer1 = doc.artboards[0]!.layers.find((l) => l.id === 'tl-1') as TextLayer
      const layer2 = doc.artboards[0]!.layers.find((l) => l.id === 'tl-2') as TextLayer

      expect(layer1.fontSize).toBe(20)
      expect(layer1.color).toBe('#ff0000')
      expect(layer2.fontSize).toBe(20)
      expect(layer2.color).toBe('#ff0000')

      // Style itself should be updated
      expect(doc.styles!.textStyles[0]!.fontSize).toBe(20)
      expect(doc.styles!.textStyles[0]!.color).toBe('#ff0000')
    })

    it('should detach text style preserving properties', () => {
      const store = useEditorStore.getState()

      const style: TextStyle = {
        id: 'ts-detach',
        name: 'Detach Test',
        fontFamily: 'Courier',
        fontSize: 18,
        fontWeight: 'bold',
        fontStyle: 'normal',
        lineHeight: 2.0,
        letterSpacing: 1,
        color: '#aabbcc',
      }
      store.addTextStyle(style)

      const tl = createTextLayer({ id: 'tl-detach' })
      store.addLayer(artboardId(), tl)
      store.applyTextStyle('tl-detach', artboardId(), 'ts-detach')

      // Verify style is applied
      let doc = getDoc()
      let layer = doc.artboards[0]!.layers.find((l) => l.id === 'tl-detach') as TextLayer
      expect(layer.textStyleId).toBe('ts-detach')
      expect(layer.fontFamily).toBe('Courier')

      // Detach
      store.detachTextStyle('tl-detach', artboardId())

      doc = getDoc()
      layer = doc.artboards[0]!.layers.find((l) => l.id === 'tl-detach') as TextLayer
      expect(layer.textStyleId).toBeUndefined()
      // Properties should remain
      expect(layer.fontFamily).toBe('Courier')
      expect(layer.fontSize).toBe(18)
      expect(layer.fontWeight).toBe('bold')
      expect(layer.color).toBe('#aabbcc')
    })
  })

  describe('Color Styles', () => {
    it('should apply a color style to a vector layer', () => {
      const store = useEditorStore.getState()

      const style: ColorStyle = {
        id: 'cs-1',
        name: 'Primary Red',
        color: '#ee0000',
        opacity: 0.9,
      }
      store.addColorStyle(style)

      const vec = createVectorLayer({ id: 'vec-cs' })
      store.addLayer(artboardId(), vec)

      store.applyColorStyle('vec-cs', artboardId(), 'cs-1')

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-cs') as VectorLayer
      expect(layer.fillStyleId).toBe('cs-1')
      expect(layer.fill!.color).toBe('#ee0000')
      expect(layer.fill!.opacity).toBe(0.9)
    })

    it('should propagate color style updates to linked layers', () => {
      const store = useEditorStore.getState()

      const style: ColorStyle = {
        id: 'cs-prop',
        name: 'Brand Blue',
        color: '#0000ff',
        opacity: 1,
      }
      store.addColorStyle(style)

      const vec = createVectorLayer({ id: 'vec-prop' })
      store.addLayer(artboardId(), vec)
      store.applyColorStyle('vec-prop', artboardId(), 'cs-prop')

      store.updateColorStyle('cs-prop', { color: '#00ff00', opacity: 0.5 })

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-prop') as VectorLayer
      expect(layer.fill!.color).toBe('#00ff00')
      expect(layer.fill!.opacity).toBe(0.5)
    })

    it('should detach color style preserving fill properties', () => {
      const store = useEditorStore.getState()

      const style: ColorStyle = { id: 'cs-det', name: 'Detach Color', color: '#abcdef', opacity: 0.7 }
      store.addColorStyle(style)

      const vec = createVectorLayer({ id: 'vec-det' })
      store.addLayer(artboardId(), vec)
      store.applyColorStyle('vec-det', artboardId(), 'cs-det')
      store.detachColorStyle('vec-det', artboardId())

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-det') as VectorLayer
      expect(layer.fillStyleId).toBeUndefined()
      expect(layer.fill!.color).toBe('#abcdef')
      expect(layer.fill!.opacity).toBe(0.7)
    })
  })

  describe('Effect Styles', () => {
    it('should apply an effect style to a layer', () => {
      const store = useEditorStore.getState()

      const effects: Effect[] = [makeEffect('e1'), makeEffect('e2')]
      const style: EffectStyle = {
        id: 'es-1',
        name: 'Blur Set',
        effects,
      }
      store.addEffectStyle(style)

      const vec = createVectorLayer({ id: 'vec-es' })
      store.addLayer(artboardId(), vec)

      store.applyEffectStyle('vec-es', artboardId(), 'es-1')

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-es') as VectorLayer
      expect(layer.effectStyleId).toBe('es-1')
      expect(layer.effects).toHaveLength(2)
      expect(layer.effects[0]!.type).toBe('blur')
    })

    it('should propagate effect style updates to linked layers', () => {
      const store = useEditorStore.getState()

      const style: EffectStyle = {
        id: 'es-prop',
        name: 'Shadow Set',
        effects: [makeEffect('e-orig')],
      }
      store.addEffectStyle(style)

      const vec = createVectorLayer({ id: 'vec-es-prop' })
      store.addLayer(artboardId(), vec)
      store.applyEffectStyle('vec-es-prop', artboardId(), 'es-prop')

      const newEffects: Effect[] = [
        makeEffect('e-new-1'),
        {
          id: 'e-new-2',
          type: 'shadow',
          enabled: true,
          opacity: 0.5,
          params: { kind: 'shadow', offsetX: 2, offsetY: 2, blurRadius: 4, spread: 0, color: '#000', opacity: 0.3 },
        },
      ]
      store.updateEffectStyle('es-prop', { effects: newEffects })

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-es-prop') as VectorLayer
      expect(layer.effects).toHaveLength(2)
      expect(layer.effects[1]!.type).toBe('shadow')
    })

    it('should detach effect style preserving effects', () => {
      const store = useEditorStore.getState()

      const style: EffectStyle = {
        id: 'es-det',
        name: 'Detach Effect',
        effects: [makeEffect('e-det')],
      }
      store.addEffectStyle(style)

      const vec = createVectorLayer({ id: 'vec-det-e' })
      store.addLayer(artboardId(), vec)
      store.applyEffectStyle('vec-det-e', artboardId(), 'es-det')
      store.detachEffectStyle('vec-det-e', artboardId())

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-det-e') as VectorLayer
      expect(layer.effectStyleId).toBeUndefined()
      expect(layer.effects).toHaveLength(1)
    })
  })

  describe('Style removal', () => {
    it('should remove a text style and detach from all linked layers', () => {
      const store = useEditorStore.getState()

      const style: TextStyle = {
        id: 'ts-rm',
        name: 'Remove Me',
        fontFamily: 'Helvetica',
        fontSize: 16,
        fontWeight: 'normal',
        fontStyle: 'normal',
        lineHeight: 1.4,
        letterSpacing: 0,
        color: '#000000',
      }
      store.addTextStyle(style)

      const tl = createTextLayer({ id: 'tl-rm' })
      store.addLayer(artboardId(), tl)
      store.applyTextStyle('tl-rm', artboardId(), 'ts-rm')

      store.removeTextStyle('ts-rm')

      const doc = getDoc()
      expect(doc.styles!.textStyles).toHaveLength(0)
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'tl-rm') as TextLayer
      expect(layer.textStyleId).toBeUndefined()
      // Properties should still be there from the last apply
      expect(layer.fontFamily).toBe('Helvetica')
    })
  })

  describe('Dev Mode', () => {
    it('should toggle dev mode', () => {
      const store = useEditorStore.getState()
      expect(store.devMode).toBe(false)

      store.toggleDevMode()
      expect(useEditorStore.getState().devMode).toBe(true)

      store.toggleDevMode()
      expect(useEditorStore.getState().devMode).toBe(false)
    })

    it('should set readyForDev on artboard', () => {
      const store = useEditorStore.getState()
      const abId = artboardId()

      store.setReadyForDev(abId, true)
      expect(getDoc().artboards[0]!.readyForDev).toBe(true)

      store.setReadyForDev(abId, false)
      expect(getDoc().artboards[0]!.readyForDev).toBe(false)
    })

    it('should set dev annotation on a layer', () => {
      const store = useEditorStore.getState()
      const vec = createVectorLayer({ id: 'vec-ann' })
      store.addLayer(artboardId(), vec)

      store.setDevAnnotation('vec-ann', artboardId(), 'Use 8px padding')

      const doc = getDoc()
      const layer = doc.artboards[0]!.layers.find((l) => l.id === 'vec-ann')!
      expect(layer.devAnnotation).toBe('Use 8px padding')

      // Clear annotation
      store.setDevAnnotation('vec-ann', artboardId(), '')
      const doc2 = getDoc()
      const layer2 = doc2.artboards[0]!.layers.find((l) => l.id === 'vec-ann')!
      expect(layer2.devAnnotation).toBeUndefined()
    })
  })
})
