import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import type {
  SymbolInstanceLayer,
  SymbolDefinition,
  Layer,
  VectorLayer,
  TextLayer,
  GroupLayer,
  Fill,
  Transform,
} from '@/types'

// ── Globals stubs ──────────────────────────────────────────────

const origWindow = globalThis.window
const origOffscreenCanvas = globalThis.OffscreenCanvas
const origCreateImageBitmap = globalThis.createImageBitmap

beforeAll(() => {
  // Stub window for modules that reference it at import time
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      getComputedStyle: () => ({}),
      navigator: { userAgent: '' },
      __openCanvasContextMenu: undefined,
    }
  }
  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    ;(globalThis as any).OffscreenCanvas = class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext() {
        return {
          fillRect: () => {},
          drawImage: () => {},
          save: () => {},
          restore: () => {},
          scale: () => {},
          translate: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          bezierCurveTo: () => {},
          closePath: () => {},
          rotate: () => {},
          stroke: () => {},
          fill: () => {},
          clip: () => {},
          arc: () => {},
          rect: () => {},
          clearRect: () => {},
          setTransform: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
          putImageData: () => {},
          createPattern: () => null,
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          measureText: () => ({ width: 0 }),
          fillText: () => {},
          strokeText: () => {},
          set fillStyle(_: any) {},
          set strokeStyle(_: any) {},
          set globalAlpha(_: any) {},
          set globalCompositeOperation(_: any) {},
          set lineWidth(_: any) {},
          set lineCap(_: any) {},
          set lineJoin(_: any) {},
          set font(_: any) {},
          set textAlign(_: any) {},
          set textBaseline(_: any) {},
          set shadowColor(_: any) {},
          set shadowBlur(_: any) {},
          set shadowOffsetX(_: any) {},
          set shadowOffsetY(_: any) {},
          setLineDash: () => {},
          canvas: { width: 100, height: 100 },
          convertToBlob: async () => new Blob(),
        }
      }
      convertToBlob() {
        return Promise.resolve(new Blob())
      }
    }
  }
  if (typeof globalThis.createImageBitmap === 'undefined') {
    ;(globalThis as any).createImageBitmap = async () => ({
      width: 100,
      height: 100,
      close: () => {},
    })
  }
})

afterAll(() => {
  if (origWindow === undefined) {
    delete (globalThis as any).window
  } else {
    globalThis.window = origWindow
  }
  if (origOffscreenCanvas === undefined) {
    delete (globalThis as any).OffscreenCanvas
  } else {
    globalThis.OffscreenCanvas = origOffscreenCanvas
  }
  if (origCreateImageBitmap === undefined) {
    delete (globalThis as any).createImageBitmap
  } else {
    globalThis.createImageBitmap = origCreateImageBitmap
  }
})

// ── Import after stubs ──────────────────────────────────────────

import { setCurrentColor, resolveSymbolLayers } from '@/render/viewport'

// ── Helpers ─────────────────────────────────────────────────────

function makeTransform(overrides: Partial<Transform> = {}): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }
}

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: overrides.id ?? 'v1',
    name: overrides.name ?? 'Vector',
    visible: overrides.visible ?? true,
    locked: false,
    opacity: overrides.opacity ?? 1,
    blendMode: 'normal',
    transform: overrides.transform ?? makeTransform(),
    effects: [],
    type: 'vector',
    paths: [],
    fill: null,
    stroke: null,
    ...overrides,
  } as VectorLayer
}

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: overrides.id ?? 't1',
    name: overrides.name ?? 'Text',
    visible: overrides.visible ?? true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: overrides.transform ?? makeTransform(),
    effects: [],
    type: 'text',
    text: overrides.text ?? 'Hello',
    fontFamily: 'Arial',
    fontSize: overrides.fontSize ?? 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: overrides.textAlign ?? 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000',
    ...overrides,
  } as TextLayer
}

function makeGroupLayer(children: Layer[], overrides: Partial<GroupLayer> = {}): GroupLayer {
  return {
    id: overrides.id ?? 'g1',
    name: overrides.name ?? 'Group',
    visible: overrides.visible ?? true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    effects: [],
    type: 'group',
    children,
    ...overrides,
  } as GroupLayer
}

function makeSymbolDef(overrides: Partial<SymbolDefinition> = {}): SymbolDefinition {
  return {
    id: 'sym1',
    name: 'Button',
    layers: overrides.layers ?? [makeVectorLayer({ id: 'bg' }), makeTextLayer({ id: 'label', text: 'Click' })],
    width: 200,
    height: 40,
    ...overrides,
  }
}

function makeSymbolInstance(overrides: Partial<SymbolInstanceLayer> = {}): SymbolInstanceLayer {
  return {
    id: 'inst1',
    name: 'Button Instance',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    effects: [],
    type: 'symbol-instance',
    symbolId: 'sym1',
    ...overrides,
  } as SymbolInstanceLayer
}

// ── Tests ───────────────────────────────────────────────────────

describe('viewport — setCurrentColor', () => {
  test('is a function export', () => {
    expect(typeof setCurrentColor).toBe('function')
  })

  test('accepts a color string without throwing', () => {
    expect(() => setCurrentColor('#ff0000')).not.toThrow()
  })

  test('can set to named color', () => {
    expect(() => setCurrentColor('red')).not.toThrow()
  })

  test('can set to currentColor keyword (no-op but valid)', () => {
    expect(() => setCurrentColor('currentColor')).not.toThrow()
  })
})

describe('viewport — resolveSymbolLayers', () => {
  test('is a function export', () => {
    expect(typeof resolveSymbolLayers).toBe('function')
  })

  test('returns deep copy of symbol layers', () => {
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)

    expect(result.length).toBe(2)
    // Verify deep copy — not same references
    expect(result[0]).not.toBe(symDef.layers[0])
    expect(result[1]).not.toBe(symDef.layers[1])
  })

  test('preserves layer types', () => {
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)

    expect(result[0]!.type).toBe('vector')
    expect(result[1]!.type).toBe('text')
  })

  test('preserves layer ids', () => {
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)

    expect(result[0]!.id).toBe('bg')
    expect(result[1]!.id).toBe('label')
  })

  test('applies boolean component property to hide layer', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'showIcon',
          name: 'Show Icon',
          type: 'boolean',
          defaultValue: true,
          targetLayerId: 'bg',
        },
      ],
    })
    const instance = makeSymbolInstance({
      propertyValues: { showIcon: false },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.visible).toBe(false)
  })

  test('applies boolean component property string "true"', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'showIcon',
          name: 'Show Icon',
          type: 'boolean',
          defaultValue: false,
          targetLayerId: 'bg',
        },
      ],
    })
    const instance = makeSymbolInstance({
      propertyValues: { showIcon: 'true' },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.visible).toBe(true)
  })

  test('applies text component property', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'labelText',
          name: 'Label',
          type: 'text',
          defaultValue: 'Default',
          targetLayerId: 'label',
        },
      ],
    })
    const instance = makeSymbolInstance({
      propertyValues: { labelText: 'Sign Up' },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[1] as TextLayer).text).toBe('Sign Up')
  })

  test('uses default component property value when no instance override', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'labelText',
          name: 'Label',
          type: 'text',
          defaultValue: 'Default',
          targetLayerId: 'label',
        },
      ],
    })
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[1] as TextLayer).text).toBe('Default')
  })

  test('applies variant property values', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'labelText',
          name: 'Label',
          type: 'text',
          defaultValue: 'Normal',
          targetLayerId: 'label',
        },
      ],
      variants: [
        {
          id: 'v-hover',
          name: 'Hover',
          propertyValues: { labelText: 'Hovering' },
          layerOverrides: {},
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'Hover' })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[1] as TextLayer).text).toBe('Hovering')
  })

  test('instance propertyValues override variant propertyValues', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'labelText',
          name: 'Label',
          type: 'text',
          defaultValue: 'Normal',
          targetLayerId: 'label',
        },
      ],
      variants: [
        {
          id: 'v-hover',
          name: 'Hover',
          propertyValues: { labelText: 'Hovering' },
          layerOverrides: {},
        },
      ],
    })
    const instance = makeSymbolInstance({
      activeVariant: 'Hover',
      propertyValues: { labelText: 'Custom' },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[1] as TextLayer).text).toBe('Custom')
  })

  test('applies variant layerOverrides — visibility', () => {
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v-disabled',
          name: 'Disabled',
          propertyValues: {},
          layerOverrides: {
            bg: { visible: false },
          },
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'Disabled' })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.visible).toBe(false)
  })

  test('applies variant layerOverrides — opacity', () => {
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v-dim',
          name: 'Dim',
          propertyValues: {},
          layerOverrides: {
            bg: { opacity: 0.5 },
          },
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'Dim' })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.opacity).toBe(0.5)
  })

  test('applies variant layerOverrides — fill on vector layer', () => {
    const fill: Fill = { type: 'solid', color: '#ff0000', opacity: 1 }
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v-red',
          name: 'Red',
          propertyValues: {},
          layerOverrides: {
            bg: { fill },
          },
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'Red' })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[0] as VectorLayer).fill).toEqual(fill)
  })

  test('applies variant layerOverrides — text on text layer', () => {
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v-alt',
          name: 'Alt',
          propertyValues: {},
          layerOverrides: {
            label: { text: 'Alt Text' },
          },
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'Alt' })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[1] as TextLayer).text).toBe('Alt Text')
  })

  test('applies instance overrides (per-layer)', () => {
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance({
      overrides: {
        bg: { visible: false, opacity: 0.3 },
      },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.visible).toBe(false)
    expect(result[0]!.opacity).toBe(0.3)
  })

  test('instance overrides fill on vector layer', () => {
    const fill: Fill = { type: 'solid', color: '#00ff00', opacity: 0.8 }
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance({
      overrides: {
        bg: { fill },
      },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect((result[0] as VectorLayer).fill).toEqual(fill)
  })

  test('handles non-existent variant gracefully', () => {
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v1',
          name: 'Hover',
          propertyValues: {},
          layerOverrides: {},
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'NonExistent' })
    const result = resolveSymbolLayers(instance, symDef)
    // Should return layers with no variant overrides applied
    expect(result.length).toBe(2)
    expect(result[0]!.visible).toBe(true)
  })

  test('handles non-existent targetLayerId in component property', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        {
          id: 'prop1',
          name: 'Prop',
          type: 'boolean',
          defaultValue: false,
          targetLayerId: 'nonExistentLayer',
        },
      ],
    })
    const instance = makeSymbolInstance()
    // Should not throw
    expect(() => resolveSymbolLayers(instance, symDef)).not.toThrow()
  })

  test('handles non-existent layerId in variant layerOverrides', () => {
    const symDef = makeSymbolDef({
      variants: [
        {
          id: 'v1',
          name: 'V',
          propertyValues: {},
          layerOverrides: { nonExistentLayer: { visible: false } },
        },
      ],
    })
    const instance = makeSymbolInstance({ activeVariant: 'V' })
    expect(() => resolveSymbolLayers(instance, symDef)).not.toThrow()
  })

  test('handles non-existent layerId in instance overrides', () => {
    const symDef = makeSymbolDef()
    const instance = makeSymbolInstance({
      overrides: { nonExistentLayer: { opacity: 0.5 } },
    })
    expect(() => resolveSymbolLayers(instance, symDef)).not.toThrow()
  })

  test('resolves slot content in group layers', () => {
    const slotGroup = makeGroupLayer([makeTextLayer({ id: 'default-child', text: 'Default' })], {
      id: 'slot1',
      isSlot: true,
      slotName: 'content',
    } as any)
    const symDef = makeSymbolDef({
      layers: [slotGroup],
    })
    const injected: Layer[] = [makeTextLayer({ id: 'injected', text: 'Injected Content' })]
    const instance = makeSymbolInstance({
      slotContent: { content: injected },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.type).toBe('group')
    const group = result[0]! as GroupLayer
    expect(group.children.length).toBe(1)
    expect((group.children[0] as TextLayer).text).toBe('Injected Content')
  })

  test('keeps default slot content when no injection', () => {
    const slotGroup = makeGroupLayer([makeTextLayer({ id: 'default-child', text: 'Default' })], {
      id: 'slot1',
      isSlot: true,
      slotName: 'content',
    } as any)
    const symDef = makeSymbolDef({
      layers: [slotGroup],
    })
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)
    const group = result[0] as GroupLayer
    expect(group.children.length).toBe(1)
    expect((group.children[0] as TextLayer).text).toBe('Default')
  })

  test('keeps default slot content when slotContent entry is empty array', () => {
    const slotGroup = makeGroupLayer([makeTextLayer({ id: 'default-child', text: 'Default' })], {
      id: 'slot1',
      isSlot: true,
      slotName: 'content',
    } as any)
    const symDef = makeSymbolDef({
      layers: [slotGroup],
    })
    const instance = makeSymbolInstance({
      slotContent: { content: [] },
    })
    const result = resolveSymbolLayers(instance, symDef)
    const group = result[0] as GroupLayer
    expect(group.children.length).toBe(1)
    expect((group.children[0] as TextLayer).text).toBe('Default')
  })

  test('handles empty layers in symbol definition', () => {
    const symDef = makeSymbolDef({ layers: [] })
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)
    expect(result).toEqual([])
  })

  test('handles symbol with no componentProperties', () => {
    const symDef = makeSymbolDef()
    delete (symDef as any).componentProperties
    const instance = makeSymbolInstance()
    const result = resolveSymbolLayers(instance, symDef)
    expect(result.length).toBe(2)
  })

  test('handles symbol with no variants', () => {
    const symDef = makeSymbolDef()
    delete (symDef as any).variants
    const instance = makeSymbolInstance({ activeVariant: 'SomeVariant' })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result.length).toBe(2)
  })

  test('nested group layers are indexed and overridable', () => {
    const inner = makeVectorLayer({ id: 'inner-vec' })
    const group = makeGroupLayer([inner], { id: 'outer-group' })
    const symDef = makeSymbolDef({ layers: [group] })
    const instance = makeSymbolInstance({
      overrides: {
        'inner-vec': { visible: false },
      },
    })
    const result = resolveSymbolLayers(instance, symDef)
    const g = result[0] as GroupLayer
    expect(g.children[0]!.visible).toBe(false)
  })

  test('multiple component properties applied in order', () => {
    const symDef = makeSymbolDef({
      componentProperties: [
        { id: 'showBg', name: 'Show BG', type: 'boolean', defaultValue: true, targetLayerId: 'bg' },
        { id: 'labelText', name: 'Label', type: 'text', defaultValue: 'Default', targetLayerId: 'label' },
      ],
    })
    const instance = makeSymbolInstance({
      propertyValues: { showBg: false, labelText: 'Updated' },
    })
    const result = resolveSymbolLayers(instance, symDef)
    expect(result[0]!.visible).toBe(false)
    expect((result[1]! as TextLayer).text).toBe('Updated')
  })

  test('slot content is deep cloned', () => {
    const slotGroup = makeGroupLayer([], {
      id: 'slot1',
      isSlot: true,
      slotName: 'main',
    } as any)
    const injectedLayer = makeVectorLayer({ id: 'injected-v' })
    const symDef = makeSymbolDef({ layers: [slotGroup] })
    const instance = makeSymbolInstance({
      slotContent: { main: [injectedLayer] },
    })
    const result = resolveSymbolLayers(instance, symDef)
    const g = result[0] as GroupLayer
    // The injected layer should be a deep clone
    expect(g.children[0]).not.toBe(injectedLayer)
    expect(g.children[0]!.id).toBe('injected-v')
  })
})

describe('viewport — module exports', () => {
  test('exports Viewport component', async () => {
    const mod = await import('@/render/viewport')
    expect(typeof mod.Viewport).toBe('function')
  })

  test('exports setCurrentColor function', async () => {
    const mod = await import('@/render/viewport')
    expect(typeof mod.setCurrentColor).toBe('function')
  })

  test('exports resolveSymbolLayers function', async () => {
    const mod = await import('@/render/viewport')
    expect(typeof mod.resolveSymbolLayers).toBe('function')
  })
})
