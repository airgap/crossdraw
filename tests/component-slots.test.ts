import { describe, it, expect } from 'bun:test'
import { v4 as uuid } from 'uuid'
import type {
  SymbolDefinition,
  SymbolInstanceLayer,
  GroupLayer,
  VectorLayer,
  Layer,
  TextLayer,
} from '@/types'
import { resolveSymbolLayers } from '@/render/viewport'

// ─── Helpers ─────────────────────────────────────────────────

function makeVectorLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: uuid(),
    name: 'Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function makeTextLayer(text: string, overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: uuid(),
    name: text,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text,
    fontFamily: 'Arial',
    fontSize: 14,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    ...overrides,
  }
}

function makeGroupLayer(
  children: Layer[],
  overrides: Partial<GroupLayer> = {},
): GroupLayer {
  return {
    id: uuid(),
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
}

function makeSlotGroup(
  slotName: string,
  defaultChildren: Layer[],
  overrides: Partial<GroupLayer> = {},
): GroupLayer {
  return makeGroupLayer(defaultChildren, {
    name: slotName,
    isSlot: true,
    slotName,
    ...overrides,
  })
}

function makeSymbolDef(layers: Layer[], overrides: Partial<SymbolDefinition> = {}): SymbolDefinition {
  return {
    id: uuid(),
    name: 'TestSymbol',
    layers,
    width: 100,
    height: 100,
    ...overrides,
  }
}

function makeInstance(
  symbolId: string,
  overrides: Partial<SymbolInstanceLayer> = {},
): SymbolInstanceLayer {
  return {
    id: uuid(),
    name: 'Instance',
    type: 'symbol-instance',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    symbolId,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────

describe('Component Slots', () => {
  describe('marking a group as a slot', () => {
    it('should have isSlot and slotName fields on GroupLayer', () => {
      const slot = makeSlotGroup('header', [makeVectorLayer()])
      expect(slot.isSlot).toBe(true)
      expect(slot.slotName).toBe('header')
      expect(slot.type).toBe('group')
    })

    it('should default to no slot when not set', () => {
      const group = makeGroupLayer([makeVectorLayer()])
      expect(group.isSlot).toBeUndefined()
      expect(group.slotName).toBeUndefined()
    })

    it('should support slotDefaultContent field', () => {
      const defaultContent = [makeVectorLayer({ name: 'default-bg' })]
      const slot = makeSlotGroup('footer', [makeVectorLayer()], {
        slotDefaultContent: defaultContent,
      })
      expect(slot.slotDefaultContent).toHaveLength(1)
      expect(slot.slotDefaultContent![0]!.name).toBe('default-bg')
    })
  })

  describe('resolving instance with unfilled slot (uses default)', () => {
    it('should use slot group children as default when no content is injected', () => {
      const defaultChild = makeVectorLayer({ name: 'default-icon' })
      const slotGroup = makeSlotGroup('icon-slot', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])
      const instance = makeInstance(symDef.id)

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(1)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.type).toBe('group')
      expect(resolvedGroup.children).toHaveLength(1)
      expect(resolvedGroup.children[0]!.name).toBe('default-icon')
    })

    it('should use default when slotContent is empty object', () => {
      const defaultChild = makeVectorLayer({ name: 'placeholder' })
      const slotGroup = makeSlotGroup('content', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])
      const instance = makeInstance(symDef.id, { slotContent: {} })

      const resolved = resolveSymbolLayers(instance, symDef)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.children).toHaveLength(1)
      expect(resolvedGroup.children[0]!.name).toBe('placeholder')
    })

    it('should use default when slotContent has empty array for slot', () => {
      const defaultChild = makeVectorLayer({ name: 'fallback' })
      const slotGroup = makeSlotGroup('main', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])
      const instance = makeInstance(symDef.id, { slotContent: { main: [] } })

      const resolved = resolveSymbolLayers(instance, symDef)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.children).toHaveLength(1)
      expect(resolvedGroup.children[0]!.name).toBe('fallback')
    })
  })

  describe('resolving instance with filled slot', () => {
    it('should replace slot children with injected content', () => {
      const defaultChild = makeVectorLayer({ name: 'default-content' })
      const slotGroup = makeSlotGroup('body', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])

      const injectedLayer = makeTextLayer('Custom text')
      const instance = makeInstance(symDef.id, {
        slotContent: { body: [injectedLayer] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(1)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.children).toHaveLength(1)
      expect(resolvedGroup.children[0]!.type).toBe('text')
      expect((resolvedGroup.children[0] as TextLayer).text).toBe('Custom text')
    })

    it('should handle multiple injected layers in a slot', () => {
      const slotGroup = makeSlotGroup('content', [makeVectorLayer()])
      const symDef = makeSymbolDef([slotGroup])

      const layer1 = makeVectorLayer({ name: 'injected-1' })
      const layer2 = makeVectorLayer({ name: 'injected-2' })
      const layer3 = makeTextLayer('injected-3')
      const instance = makeInstance(symDef.id, {
        slotContent: { content: [layer1, layer2, layer3] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.children).toHaveLength(3)
      expect(resolvedGroup.children[0]!.name).toBe('injected-1')
      expect(resolvedGroup.children[1]!.name).toBe('injected-2')
      expect(resolvedGroup.children[2]!.name).toBe('injected-3')
    })

    it('should not affect non-slot groups', () => {
      const normalGroup = makeGroupLayer([makeVectorLayer({ name: 'normal-child' })])
      const slotGroup = makeSlotGroup('slot-a', [makeVectorLayer({ name: 'default' })])
      const symDef = makeSymbolDef([normalGroup, slotGroup])

      const injectedLayer = makeVectorLayer({ name: 'custom' })
      const instance = makeInstance(symDef.id, {
        slotContent: { 'slot-a': [injectedLayer] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(2)

      // Normal group is untouched
      const resolvedNormalGroup = resolved[0] as GroupLayer
      expect(resolvedNormalGroup.children).toHaveLength(1)
      expect(resolvedNormalGroup.children[0]!.name).toBe('normal-child')

      // Slot group has injected content
      const resolvedSlotGroup = resolved[1] as GroupLayer
      expect(resolvedSlotGroup.children).toHaveLength(1)
      expect(resolvedSlotGroup.children[0]!.name).toBe('custom')
    })
  })

  describe('clearing slot content reverts to default', () => {
    it('should revert to default children when slotContent is removed', () => {
      const defaultChild = makeVectorLayer({ name: 'original-default' })
      const slotGroup = makeSlotGroup('panel', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])

      // First, verify with injected content
      const injected = makeVectorLayer({ name: 'override' })
      const instanceFilled = makeInstance(symDef.id, {
        slotContent: { panel: [injected] },
      })
      const resolvedFilled = resolveSymbolLayers(instanceFilled, symDef)
      expect((resolvedFilled[0] as GroupLayer).children[0]!.name).toBe('override')

      // Now clear (simulate by creating instance without slotContent)
      const instanceCleared = makeInstance(symDef.id)
      const resolvedCleared = resolveSymbolLayers(instanceCleared, symDef)
      expect((resolvedCleared[0] as GroupLayer).children[0]!.name).toBe('original-default')
    })

    it('should revert specific slot while keeping others', () => {
      const slotA = makeSlotGroup('slot-a', [makeVectorLayer({ name: 'default-a' })])
      const slotB = makeSlotGroup('slot-b', [makeVectorLayer({ name: 'default-b' })])
      const symDef = makeSymbolDef([slotA, slotB])

      // Fill both slots, then clear only slot-a
      const instance = makeInstance(symDef.id, {
        slotContent: {
          'slot-b': [makeVectorLayer({ name: 'custom-b' })],
        },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      // slot-a should show default
      expect((resolved[0] as GroupLayer).children[0]!.name).toBe('default-a')
      // slot-b should show custom
      expect((resolved[1] as GroupLayer).children[0]!.name).toBe('custom-b')
    })
  })

  describe('multiple slots in one symbol', () => {
    it('should resolve multiple independent slots correctly', () => {
      const headerSlot = makeSlotGroup('header', [makeVectorLayer({ name: 'default-header' })])
      const bodySlot = makeSlotGroup('body', [makeVectorLayer({ name: 'default-body' })])
      const footerSlot = makeSlotGroup('footer', [makeVectorLayer({ name: 'default-footer' })])
      const symDef = makeSymbolDef([headerSlot, bodySlot, footerSlot])

      const instance = makeInstance(symDef.id, {
        slotContent: {
          header: [makeTextLayer('Custom Header')],
          body: [makeVectorLayer({ name: 'custom-body-1' }), makeVectorLayer({ name: 'custom-body-2' })],
          // footer left as default
        },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(3)

      // Header: custom
      const resolvedHeader = resolved[0] as GroupLayer
      expect(resolvedHeader.children).toHaveLength(1)
      expect(resolvedHeader.children[0]!.type).toBe('text')

      // Body: custom with 2 layers
      const resolvedBody = resolved[1] as GroupLayer
      expect(resolvedBody.children).toHaveLength(2)
      expect(resolvedBody.children[0]!.name).toBe('custom-body-1')
      expect(resolvedBody.children[1]!.name).toBe('custom-body-2')

      // Footer: default
      const resolvedFooter = resolved[2] as GroupLayer
      expect(resolvedFooter.children).toHaveLength(1)
      expect(resolvedFooter.children[0]!.name).toBe('default-footer')
    })

    it('should handle slots mixed with regular layers', () => {
      const regularLayer = makeVectorLayer({ name: 'bg-rect' })
      const slotGroup = makeSlotGroup('content', [makeVectorLayer({ name: 'default' })])
      const anotherRegular = makeTextLayer('title')
      const symDef = makeSymbolDef([regularLayer, slotGroup, anotherRegular])

      const instance = makeInstance(symDef.id, {
        slotContent: { content: [makeVectorLayer({ name: 'custom-content' })] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(3)
      expect(resolved[0]!.name).toBe('bg-rect')
      expect((resolved[1] as GroupLayer).children[0]!.name).toBe('custom-content')
      expect(resolved[2]!.name).toBe('title')
    })
  })

  describe('nested symbols with slots', () => {
    it('should resolve slots in nested group structures', () => {
      // Slot inside a regular group inside the symbol
      const innerSlot = makeSlotGroup('inner-slot', [makeVectorLayer({ name: 'inner-default' })])
      const outerGroup = makeGroupLayer([innerSlot], { name: 'outer-wrapper' })
      const symDef = makeSymbolDef([outerGroup])

      const instance = makeInstance(symDef.id, {
        slotContent: { 'inner-slot': [makeTextLayer('injected-inner')] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(1)
      const outer = resolved[0] as GroupLayer
      expect(outer.name).toBe('outer-wrapper')
      expect(outer.children).toHaveLength(1)

      const inner = outer.children[0] as GroupLayer
      expect(inner.isSlot).toBe(true)
      expect(inner.children).toHaveLength(1)
      expect(inner.children[0]!.type).toBe('text')
      expect((inner.children[0] as TextLayer).text).toBe('injected-inner')
    })

    it('should handle deeply nested slots', () => {
      const deepSlot = makeSlotGroup('deep', [makeVectorLayer({ name: 'deep-default' })])
      const mid = makeGroupLayer([deepSlot], { name: 'mid' })
      const top = makeGroupLayer([mid], { name: 'top' })
      const symDef = makeSymbolDef([top])

      const instance = makeInstance(symDef.id, {
        slotContent: { deep: [makeVectorLayer({ name: 'deep-custom' })] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      const topResolved = resolved[0] as GroupLayer
      const midResolved = topResolved.children[0] as GroupLayer
      const deepResolved = midResolved.children[0] as GroupLayer
      expect(deepResolved.children).toHaveLength(1)
      expect(deepResolved.children[0]!.name).toBe('deep-custom')
    })

    it('should handle slot groups that themselves contain nested slots', () => {
      // A slot whose default content contains another slot (not typical, but valid)
      const innerSlot = makeSlotGroup('inner', [makeVectorLayer({ name: 'inner-default' })])
      const outerSlot = makeSlotGroup('outer', [innerSlot, makeVectorLayer({ name: 'outer-child' })])
      const symDef = makeSymbolDef([outerSlot])

      // Only fill the inner slot, not the outer
      const instance = makeInstance(symDef.id, {
        slotContent: { inner: [makeVectorLayer({ name: 'inner-custom' })] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      const outerResolved = resolved[0] as GroupLayer
      expect(outerResolved.children).toHaveLength(2)
      // The inner slot should have its custom content
      const innerResolved = outerResolved.children[0] as GroupLayer
      expect(innerResolved.children).toHaveLength(1)
      expect(innerResolved.children[0]!.name).toBe('inner-custom')
      // The other child is unchanged
      expect(outerResolved.children[1]!.name).toBe('outer-child')
    })
  })

  describe('slot content is deep-cloned', () => {
    it('should not mutate the original injected content', () => {
      const slotGroup = makeSlotGroup('test', [makeVectorLayer({ name: 'default' })])
      const symDef = makeSymbolDef([slotGroup])

      const originalContent = [makeVectorLayer({ name: 'original' })]
      const instance = makeInstance(symDef.id, {
        slotContent: { test: originalContent },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      const resolvedGroup = resolved[0] as GroupLayer

      // Modify the resolved content
      resolvedGroup.children[0]!.name = 'modified'

      // Original should be untouched (deep clone)
      expect(originalContent[0]!.name).toBe('original')
    })

    it('should not mutate symbol definition layers', () => {
      const defaultChild = makeVectorLayer({ name: 'def-default' })
      const slotGroup = makeSlotGroup('test', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])

      // Resolve without filling the slot
      const instance = makeInstance(symDef.id)
      const resolved = resolveSymbolLayers(instance, symDef)

      // Modify the resolved layers
      ;(resolved[0] as GroupLayer).children[0]!.name = 'changed'

      // Original symbol definition should be untouched
      expect((symDef.layers[0] as GroupLayer).children[0]!.name).toBe('def-default')
    })
  })

  describe('SymbolInstanceLayer slotContent type', () => {
    it('should support slotContent field on SymbolInstanceLayer', () => {
      const instance: SymbolInstanceLayer = {
        id: 'inst-1',
        name: 'Test Instance',
        type: 'symbol-instance',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        symbolId: 'sym-1',
        slotContent: {
          header: [makeVectorLayer({ name: 'header-content' })],
          footer: [makeTextLayer('Footer text')],
        },
      }

      expect(instance.slotContent).toBeDefined()
      expect(Object.keys(instance.slotContent!)).toHaveLength(2)
      expect(instance.slotContent!['header']!).toHaveLength(1)
      expect(instance.slotContent!['footer']!).toHaveLength(1)
    })

    it('should be optional (undefined when no slots are filled)', () => {
      const instance: SymbolInstanceLayer = {
        id: 'inst-2',
        name: 'Bare Instance',
        type: 'symbol-instance',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        symbolId: 'sym-1',
      }

      expect(instance.slotContent).toBeUndefined()
    })
  })

  describe('interaction with other resolve features', () => {
    it('should apply slot content before instance overrides', () => {
      const defaultChild = makeVectorLayer({ name: 'default', opacity: 1 })
      const slotGroup = makeSlotGroup('content', [defaultChild])
      const symDef = makeSymbolDef([slotGroup])

      const injectedChild = makeVectorLayer({ name: 'injected', id: 'inj-1', opacity: 1 })
      const instance = makeInstance(symDef.id, {
        slotContent: { content: [injectedChild] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      const resolvedGroup = resolved[0] as GroupLayer
      expect(resolvedGroup.children[0]!.name).toBe('injected')
    })

    it('should work alongside component properties', () => {
      const toggleLayer = makeVectorLayer({ name: 'toggleable', id: 'toggle-1' })
      const slotGroup = makeSlotGroup('content', [makeVectorLayer({ name: 'default-content' })])
      const symDef = makeSymbolDef([toggleLayer, slotGroup], {
        componentProperties: [
          {
            id: 'show-toggle',
            name: 'Show Toggle',
            type: 'boolean',
            defaultValue: true,
            targetLayerId: 'toggle-1',
          },
        ],
      })

      const instance = makeInstance(symDef.id, {
        propertyValues: { 'show-toggle': false },
        slotContent: { content: [makeVectorLayer({ name: 'custom-content' })] },
      })

      const resolved = resolveSymbolLayers(instance, symDef)
      expect(resolved).toHaveLength(2)

      // Component property should have toggled visibility
      expect(resolved[0]!.visible).toBe(false)

      // Slot should have custom content
      expect((resolved[1] as GroupLayer).children[0]!.name).toBe('custom-content')
    })
  })
})
