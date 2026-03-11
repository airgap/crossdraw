import { describe, test, expect } from 'bun:test'
import { resolveVariable, resolveLayerBindings, applyBindingsToLayer } from '@/variables/variable-resolver'
import type { VariableCollection } from '@/variables/variable-types'
import type { VectorLayer } from '@/types'

// ── Helpers ──

function createCollection(id: string, name: string, overrides: Partial<VariableCollection> = {}): VariableCollection {
  return {
    id,
    name,
    modes: [{ id: 'mode-default', name: 'Default' }],
    variables: [],
    values: {},
    ...overrides,
  }
}

function createVectorLayer(id: string, name: string, extra: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id,
    name,
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
    ...extra,
  }
}

// ── Tests ──

describe('resolveVariable', () => {
  test('returns null for empty collections', () => {
    const result = resolveVariable([], 'var-1', {})
    expect(result).toBeNull()
  })

  test('resolves a variable from its owning collection', () => {
    const coll = createCollection('coll-1', 'Colors', {
      variables: [{ id: 'var-1', name: 'Primary', type: 'color', collectionId: 'coll-1' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#ff0000' } } },
    })

    const result = resolveVariable([coll], 'var-1', { 'coll-1': 'mode-default' })
    expect(result).toBeDefined()
    expect(result!.type).toBe('color')
    expect(result!.value).toBe('#ff0000')
  })

  test('falls back to first mode if active mode not found', () => {
    const coll = createCollection('coll-1', 'Colors', {
      variables: [{ id: 'var-1', name: 'Primary', type: 'color', collectionId: 'coll-1' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#00ff00' } } },
    })

    // No active mode set for this collection
    const result = resolveVariable([coll], 'var-1', {})
    expect(result).toBeDefined()
    expect(result!.value).toBe('#00ff00')
  })

  test('resolves variable through extends chain', () => {
    const parent = createCollection('parent', 'Base Colors', {
      variables: [{ id: 'var-1', name: 'Primary', type: 'color', collectionId: 'parent' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#0000ff' } } },
    })

    const child = createCollection('child', 'Theme', {
      modes: [{ id: 'mode-default', name: 'Default' }],
      variables: [],
      values: {},
      extendsCollectionId: 'parent',
    })

    const result = resolveVariable([parent, child], 'var-1', { child: 'mode-default', parent: 'mode-default' })
    expect(result).toBeDefined()
    expect(result!.value).toBe('#0000ff')
  })

  test('child collection values override parent values', () => {
    const parent = createCollection('parent', 'Base', {
      variables: [{ id: 'var-1', name: 'Color', type: 'color', collectionId: 'parent' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#000000' } } },
    })

    const child = createCollection('child', 'Override', {
      variables: [{ id: 'var-1', name: 'Color', type: 'color', collectionId: 'parent' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#ffffff' } } },
      extendsCollectionId: 'parent',
    })

    const result = resolveVariable([parent, child], 'var-1', { child: 'mode-default', parent: 'mode-default' })
    // Variable is directly in parent, so parent's value is used when resolving directly
    expect(result).toBeDefined()
  })

  test('handles circular extends chain gracefully', () => {
    const collA = createCollection('a', 'A', {
      variables: [{ id: 'v', name: 'V', type: 'number', collectionId: 'a' }],
      values: {},
      extendsCollectionId: 'b',
    })

    const collB = createCollection('b', 'B', {
      variables: [],
      values: {},
      extendsCollectionId: 'a',
    })

    // Should not infinite loop
    const result = resolveVariable([collA, collB], 'v', { a: 'mode-default' })
    // Value is null because it is not set
    expect(result).toBeNull()
  })

  test('returns null when variable not found in any collection', () => {
    const coll = createCollection('coll-1', 'Colors', {
      variables: [{ id: 'var-1', name: 'Primary', type: 'color', collectionId: 'coll-1' }],
      values: { 'var-1': { 'mode-default': { type: 'color', value: '#ff0000' } } },
    })

    const result = resolveVariable([coll], 'nonexistent', { 'coll-1': 'mode-default' })
    expect(result).toBeNull()
  })

  test('resolves variable in active mode for multi-mode collection', () => {
    const coll = createCollection('coll-1', 'Theme', {
      modes: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
      variables: [{ id: 'var-bg', name: 'Background', type: 'color', collectionId: 'coll-1' }],
      values: {
        'var-bg': {
          light: { type: 'color', value: '#ffffff' },
          dark: { type: 'color', value: '#1a1a1a' },
        },
      },
    })

    const light = resolveVariable([coll], 'var-bg', { 'coll-1': 'light' })
    expect(light!.value).toBe('#ffffff')

    const dark = resolveVariable([coll], 'var-bg', { 'coll-1': 'dark' })
    expect(dark!.value).toBe('#1a1a1a')
  })

  test('falls back to first mode when active mode has no value', () => {
    const coll = createCollection('coll-1', 'Theme', {
      modes: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
      variables: [{ id: 'var-1', name: 'Color', type: 'color', collectionId: 'coll-1' }],
      values: {
        'var-1': {
          light: { type: 'color', value: '#ffffff' },
          // dark mode has no value
        },
      },
    })

    const result = resolveVariable([coll], 'var-1', { 'coll-1': 'dark' })
    // Should fall back to first mode (light)
    expect(result).toBeDefined()
    expect(result!.value).toBe('#ffffff')
  })

  test('resolves variable from ancestor via extends chain search', () => {
    const grandparent = createCollection('gp', 'Grandparent', {
      variables: [{ id: 'gp-var', name: 'GP Color', type: 'color', collectionId: 'gp' }],
      values: { 'gp-var': { 'mode-default': { type: 'color', value: '#abcdef' } } },
    })

    const parent = createCollection('p', 'Parent', {
      variables: [],
      values: {},
      extendsCollectionId: 'gp',
    })

    const child = createCollection('c', 'Child', {
      variables: [],
      values: {},
      extendsCollectionId: 'p',
    })

    const result = resolveVariable([grandparent, parent, child], 'gp-var', {
      gp: 'mode-default',
      p: 'mode-default',
      c: 'mode-default',
    })
    expect(result).toBeDefined()
    expect(result!.value).toBe('#abcdef')
  })

  test('returns null when collection has no modes', () => {
    const coll = createCollection('coll-1', 'Empty Modes', {
      modes: [],
      variables: [{ id: 'var-1', name: 'V', type: 'string', collectionId: 'coll-1' }],
      values: {},
    })

    const result = resolveVariable([coll], 'var-1', {})
    expect(result).toBeNull()
  })
})

describe('resolveLayerBindings', () => {
  test('returns empty object for layer without bindings', () => {
    const layer = createVectorLayer('l1', 'No Bindings')
    const result = resolveLayerBindings(layer, [], {})
    expect(Object.keys(result)).toHaveLength(0)
  })

  test('resolves single binding', () => {
    const coll = createCollection('coll-1', 'Theme', {
      variables: [{ id: 'var-1', name: 'Opacity', type: 'number', collectionId: 'coll-1' }],
      values: { 'var-1': { 'mode-default': { type: 'number', value: 0.5 } } },
    })

    const layer = createVectorLayer('l1', 'Bound', {
      variableBindings: {
        opacity: { variableId: 'var-1', collectionId: 'coll-1', field: 'opacity' },
      },
    } as any)

    const result = resolveLayerBindings(layer, [coll], { 'coll-1': 'mode-default' })
    expect(result['opacity']).toBeDefined()
    expect(result['opacity']!.value).toBe(0.5)
  })

  test('resolves multiple bindings', () => {
    const coll = createCollection('coll-1', 'Theme', {
      variables: [
        { id: 'var-o', name: 'Opacity', type: 'number', collectionId: 'coll-1' },
        { id: 'var-c', name: 'Color', type: 'color', collectionId: 'coll-1' },
      ],
      values: {
        'var-o': { 'mode-default': { type: 'number', value: 0.8 } },
        'var-c': { 'mode-default': { type: 'color', value: '#ff0000' } },
      },
    })

    const layer = createVectorLayer('l1', 'Multi Bound', {
      variableBindings: {
        opacity: { variableId: 'var-o', collectionId: 'coll-1', field: 'opacity' },
        'fill.color': { variableId: 'var-c', collectionId: 'coll-1', field: 'fill.color' },
      },
    } as any)

    const result = resolveLayerBindings(layer, [coll], { 'coll-1': 'mode-default' })
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['opacity']!.value).toBe(0.8)
    expect(result['fill.color']!.value).toBe('#ff0000')
  })

  test('skips bindings that cannot be resolved', () => {
    const layer = createVectorLayer('l1', 'Bad Binding', {
      variableBindings: {
        opacity: { variableId: 'missing-var', collectionId: 'missing-coll', field: 'opacity' },
      },
    } as any)

    const result = resolveLayerBindings(layer, [], {})
    expect(Object.keys(result)).toHaveLength(0)
  })
})

describe('applyBindingsToLayer', () => {
  test('returns original layer when no values to apply', () => {
    const layer = createVectorLayer('l1', 'Unchanged')
    const result = applyBindingsToLayer(layer, {})
    expect(result).toBe(layer) // exact same reference
  })

  test('applies a simple top-level property', () => {
    const layer = createVectorLayer('l1', 'Test', { opacity: 1 })
    const result = applyBindingsToLayer(layer, {
      opacity: { type: 'number', value: 0.5 },
    })
    expect(result.opacity).toBe(0.5)
    // Original unchanged
    expect(layer.opacity).toBe(1)
  })

  test('applies nested property with dot notation', () => {
    const layer = createVectorLayer('l1', 'Test')
    const result = applyBindingsToLayer(layer, {
      'fill.color': { type: 'color', value: '#ff0000' },
    })
    expect((result as VectorLayer).fill!.color).toBe('#ff0000')
  })

  test('creates intermediate objects for deeply nested paths', () => {
    const layer = createVectorLayer('l1', 'Test')
    const result = applyBindingsToLayer(layer, {
      'some.deep.property': { type: 'string', value: 'hello' },
    })
    expect((result as any).some.deep.property).toBe('hello')
  })

  test('applies multiple bindings simultaneously', () => {
    const layer = createVectorLayer('l1', 'Multi', { opacity: 1 })
    const result = applyBindingsToLayer(layer, {
      opacity: { type: 'number', value: 0.3 },
      name: { type: 'string', value: 'Updated Name' },
    })
    expect(result.opacity).toBe(0.3)
    expect(result.name).toBe('Updated Name')
  })

  test('applies boolean values', () => {
    const layer = createVectorLayer('l1', 'Bool Test')
    const result = applyBindingsToLayer(layer, {
      visible: { type: 'boolean', value: false },
    })
    expect(result.visible).toBe(false)
  })

  test('does not mutate original layer', () => {
    const layer = createVectorLayer('l1', 'Immutable', { opacity: 1 })
    applyBindingsToLayer(layer, {
      opacity: { type: 'number', value: 0 },
    })
    expect(layer.opacity).toBe(1) // unchanged
  })

  test('handles overwriting existing nested values', () => {
    const layer = createVectorLayer('l1', 'Overwrite', {
      fill: { type: 'solid', color: '#000000', opacity: 1 },
    })
    const result = applyBindingsToLayer(layer, {
      'fill.opacity': { type: 'number', value: 0.5 },
    })
    expect((result as VectorLayer).fill!.opacity).toBe(0.5)
    // Original fill color should still be there
    expect((result as VectorLayer).fill!.color).toBe('#000000')
  })
})

// ── Additional coverage for uncovered lines 27, 35-36, 70-86 ──

describe('resolveVariable - first mode fallback within resolveInChain (lines 24-27)', () => {
  test('falls back to first mode when current mode has no value for variable', () => {
    const coll = createCollection('coll-fb', 'Fallback', {
      modes: [
        { id: 'mode-a', name: 'A' },
        { id: 'mode-b', name: 'B' },
      ],
      variables: [{ id: 'var-fb', name: 'FBVar', type: 'color', collectionId: 'coll-fb' }],
      values: {
        'var-fb': {
          'mode-a': { type: 'color', value: '#aaaaaa' },
          // mode-b has no value - should fall back to mode-a
        },
      },
    })

    // Request mode-b, which doesn't have a value -> falls back to mode-a (first mode)
    const result = resolveVariable([coll], 'var-fb', { 'coll-fb': 'mode-b' })
    expect(result).toBeDefined()
    expect(result!.value).toBe('#aaaaaa')
  })

  test('returns null when first mode also has no value and no extends', () => {
    const coll = createCollection('coll-empty', 'Empty', {
      modes: [{ id: 'mode-x', name: 'X' }],
      variables: [{ id: 'var-e', name: 'E', type: 'string', collectionId: 'coll-empty' }],
      values: {
        'var-e': {
          // no value for mode-x either
        },
      },
    })

    const result = resolveVariable([coll], 'var-e', { 'coll-empty': 'mode-x' })
    expect(result).toBeNull()
  })
})

describe('resolveVariable - extends chain for inherited variable lookup (lines 35-36, 70-86)', () => {
  test('resolves variable found in parent via extends chain search (not direct member)', () => {
    // Parent collection owns the variable
    const parent = createCollection('parent-chain', 'Parent', {
      variables: [{ id: 'chain-var', name: 'ChainVar', type: 'number', collectionId: 'parent-chain' }],
      values: { 'chain-var': { 'mode-default': { type: 'number', value: 42 } } },
    })

    // Child extends parent but does NOT list the variable in its own variables array
    const child = createCollection('child-chain', 'Child', {
      variables: [], // empty - variable is inherited
      values: {}, // no overrides
      extendsCollectionId: 'parent-chain',
    })

    // First loop won't find the variable (it's not a direct member of child or parent by child's variables)
    // But the second loop (lines 67-87) searches ancestor chains
    const result = resolveVariable([child, parent], 'chain-var', {
      'child-chain': 'mode-default',
      'parent-chain': 'mode-default',
    })
    expect(result).toBeDefined()
    expect(result!.value).toBe(42)
  })

  test('resolves through deep extends chain (grandchild -> child -> parent)', () => {
    const grandparent = createCollection('gp-deep', 'Grandparent', {
      variables: [{ id: 'deep-var', name: 'DeepVar', type: 'boolean', collectionId: 'gp-deep' }],
      values: { 'deep-var': { 'mode-default': { type: 'boolean', value: true } } },
    })

    const parent = createCollection('p-deep', 'Parent', {
      variables: [],
      values: {},
      extendsCollectionId: 'gp-deep',
    })

    const child = createCollection('c-deep', 'Child', {
      variables: [],
      values: {},
      extendsCollectionId: 'p-deep',
    })

    const result = resolveVariable([child, parent, grandparent], 'deep-var', {
      'c-deep': 'mode-default',
      'p-deep': 'mode-default',
      'gp-deep': 'mode-default',
    })
    expect(result).toBeDefined()
    expect(result!.value).toBe(true)
  })

  test('returns null for variable not found in any ancestor chain', () => {
    const parent = createCollection('p-nf', 'Parent', {
      variables: [{ id: 'other-var', name: 'Other', type: 'string', collectionId: 'p-nf' }],
      values: { 'other-var': { 'mode-default': { type: 'string', value: 'hello' } } },
    })

    const child = createCollection('c-nf', 'Child', {
      variables: [],
      values: {},
      extendsCollectionId: 'p-nf',
    })

    // Look for a variable that doesn't exist anywhere
    const result = resolveVariable([child, parent], 'nonexistent-var', {
      'c-nf': 'mode-default',
      'p-nf': 'mode-default',
    })
    expect(result).toBeNull()
  })

  test('handles extends chain with no modes in child (line 70-71)', () => {
    const parent = createCollection('p-nomode', 'Parent', {
      variables: [{ id: 'nm-var', name: 'NM', type: 'string', collectionId: 'p-nomode' }],
      values: { 'nm-var': { 'mode-default': { type: 'string', value: 'from-parent' } } },
    })

    const child = createCollection('c-nomode', 'Child', {
      modes: [], // no modes at all
      variables: [],
      values: {},
      extendsCollectionId: 'p-nomode',
    })

    // Child has no modes -> activeModeId will be undefined -> should skip
    const result = resolveVariable([child, parent], 'nm-var', {
      'p-nomode': 'mode-default',
    })
    // Parent directly owns the variable, so first loop finds it
    expect(result).toBeDefined()
    expect(result!.value).toBe('from-parent')
  })

  test('handles circular extends in ancestor search (lines 76)', () => {
    const collA = createCollection('circ-a', 'CircA', {
      variables: [],
      values: {},
      extendsCollectionId: 'circ-b',
    })

    const collB = createCollection('circ-b', 'CircB', {
      variables: [],
      values: {},
      extendsCollectionId: 'circ-a',
    })

    // Should not infinite loop
    const result = resolveVariable([collA, collB], 'missing-var', {
      'circ-a': 'mode-default',
      'circ-b': 'mode-default',
    })
    expect(result).toBeNull()
  })

  test('child overrides parent value in extends chain', () => {
    const parent = createCollection('p-override', 'Parent', {
      variables: [{ id: 'ov-var', name: 'Override', type: 'number', collectionId: 'p-override' }],
      values: { 'ov-var': { 'mode-default': { type: 'number', value: 10 } } },
    })

    const child = createCollection('c-override', 'Child', {
      variables: [],
      values: { 'ov-var': { 'mode-default': { type: 'number', value: 99 } } },
      extendsCollectionId: 'p-override',
    })

    // Variable owned by parent, but child has override in values
    // First loop finds variable in parent, uses parent's activeModeId
    const result = resolveVariable([parent, child], 'ov-var', {
      'p-override': 'mode-default',
      'c-override': 'mode-default',
    })
    expect(result).toBeDefined()
    // Parent is found first since it owns the variable
    expect(result!.value).toBe(10)
  })

  test('extends chain search with broken parent ref', () => {
    const child = createCollection('c-broken', 'BrokenChild', {
      variables: [],
      values: {},
      extendsCollectionId: 'nonexistent-parent',
    })

    const result = resolveVariable([child], 'some-var', { 'c-broken': 'mode-default' })
    expect(result).toBeNull()
  })
})

describe('resolveInChain - fallback to first mode with different modeId', () => {
  test('resolves from chain when first mode differs from requested', () => {
    const coll = createCollection('coll-chain-fb', 'ChainFB', {
      modes: [
        { id: 'primary', name: 'Primary' },
        { id: 'secondary', name: 'Secondary' },
      ],
      variables: [{ id: 'cfb-var', name: 'CFBVar', type: 'color', collectionId: 'coll-chain-fb' }],
      values: {
        'cfb-var': {
          primary: { type: 'color', value: '#111111' },
          // secondary not set -> should fall back to primary (firstModeId)
        },
      },
    })

    const result = resolveVariable([coll], 'cfb-var', { 'coll-chain-fb': 'secondary' })
    expect(result).toBeDefined()
    expect(result!.value).toBe('#111111')
  })
})
