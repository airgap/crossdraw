import { describe, it, expect } from 'vitest'
import { resolveVariable, resolveLayerBindings, applyBindingsToLayer } from '@/variables/variable-resolver'
import { defaultVariableValue, isValidVariableValue } from '@/variables/variable-types'
import type {
  VariableCollection,
  VariableValue,
  VariableType,
  Variable,
  VariableMode,
} from '@/variables/variable-types'
import type { VectorLayer, TextLayer } from '@/types'

// ── Test helpers ──

function createMode(id: string, name: string): VariableMode {
  return { id, name }
}

function createVariable(id: string, name: string, type: VariableType, collectionId: string): Variable {
  return { id, name, type, collectionId }
}

function createCollection(overrides: Partial<VariableCollection> = {}): VariableCollection {
  return {
    id: 'col-1',
    name: 'Test Collection',
    modes: [createMode('mode-light', 'Light'), createMode('mode-dark', 'Dark')],
    variables: [],
    values: {},
    ...overrides,
  }
}

function createVectorLayer(id: string, overrides: Partial<VectorLayer> = {}): VectorLayer {
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
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function createTextLayer(id: string, overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id,
    name: `Text ${id}`,
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

// ── Tests ──

describe('variable-types', () => {
  describe('defaultVariableValue', () => {
    it('returns black hex for color type', () => {
      const val = defaultVariableValue('color')
      expect(val).toEqual({ type: 'color', value: '#000000' })
    })

    it('returns 0 for number type', () => {
      const val = defaultVariableValue('number')
      expect(val).toEqual({ type: 'number', value: 0 })
    })

    it('returns empty string for string type', () => {
      const val = defaultVariableValue('string')
      expect(val).toEqual({ type: 'string', value: '' })
    })

    it('returns false for boolean type', () => {
      const val = defaultVariableValue('boolean')
      expect(val).toEqual({ type: 'boolean', value: false })
    })
  })

  describe('isValidVariableValue', () => {
    it('matches color type', () => {
      expect(isValidVariableValue({ type: 'color', value: '#ff0000' }, 'color')).toBe(true)
      expect(isValidVariableValue({ type: 'number', value: 42 }, 'color')).toBe(false)
    })

    it('matches number type', () => {
      expect(isValidVariableValue({ type: 'number', value: 42 }, 'number')).toBe(true)
      expect(isValidVariableValue({ type: 'string', value: 'hi' }, 'number')).toBe(false)
    })

    it('matches string type', () => {
      expect(isValidVariableValue({ type: 'string', value: 'hello' }, 'string')).toBe(true)
      expect(isValidVariableValue({ type: 'boolean', value: true }, 'string')).toBe(false)
    })

    it('matches boolean type', () => {
      expect(isValidVariableValue({ type: 'boolean', value: true }, 'boolean')).toBe(true)
      expect(isValidVariableValue({ type: 'color', value: '#000' }, 'boolean')).toBe(false)
    })
  })
})

describe('resolveVariable', () => {
  it('resolves variable for the active mode', () => {
    const collection = createCollection({
      variables: [createVariable('var-bg', 'Background', 'color', 'col-1')],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#1a1a1a' },
        },
      },
    })

    // Active mode is "Light"
    const lightResult = resolveVariable([collection], 'var-bg', { 'col-1': 'mode-light' })
    expect(lightResult).toEqual({ type: 'color', value: '#ffffff' })

    // Active mode is "Dark"
    const darkResult = resolveVariable([collection], 'var-bg', { 'col-1': 'mode-dark' })
    expect(darkResult).toEqual({ type: 'color', value: '#1a1a1a' })
  })

  it('falls back to first mode when active mode is not found', () => {
    const collection = createCollection({
      variables: [createVariable('var-bg', 'Background', 'color', 'col-1')],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#1a1a1a' },
        },
      },
    })

    // Active mode points to a non-existent mode
    const result = resolveVariable([collection], 'var-bg', { 'col-1': 'mode-nonexistent' })
    expect(result).toEqual({ type: 'color', value: '#ffffff' })
  })

  it('falls back to first mode when no active mode is set', () => {
    const collection = createCollection({
      variables: [createVariable('var-bg', 'Background', 'color', 'col-1')],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#1a1a1a' },
        },
      },
    })

    // No active mode for this collection
    const result = resolveVariable([collection], 'var-bg', {})
    expect(result).toEqual({ type: 'color', value: '#ffffff' })
  })

  it('returns null for non-existent variable', () => {
    const collection = createCollection({
      variables: [createVariable('var-bg', 'Background', 'color', 'col-1')],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
        },
      },
    })

    const result = resolveVariable([collection], 'var-nonexistent', { 'col-1': 'mode-light' })
    expect(result).toBeNull()
  })

  it('returns null for empty collections', () => {
    const result = resolveVariable([], 'var-bg', {})
    expect(result).toBeNull()
  })

  it('resolves number variable', () => {
    const collection = createCollection({
      variables: [createVariable('var-spacing', 'Spacing', 'number', 'col-1')],
      values: {
        'var-spacing': {
          'mode-light': { type: 'number', value: 16 },
          'mode-dark': { type: 'number', value: 24 },
        },
      },
    })

    const result = resolveVariable([collection], 'var-spacing', { 'col-1': 'mode-dark' })
    expect(result).toEqual({ type: 'number', value: 24 })
  })

  it('resolves boolean variable', () => {
    const collection = createCollection({
      variables: [createVariable('var-visible', 'Show Border', 'boolean', 'col-1')],
      values: {
        'var-visible': {
          'mode-light': { type: 'boolean', value: true },
          'mode-dark': { type: 'boolean', value: false },
        },
      },
    })

    const result = resolveVariable([collection], 'var-visible', { 'col-1': 'mode-dark' })
    expect(result).toEqual({ type: 'boolean', value: false })
  })

  it('searches across multiple collections', () => {
    const col1 = createCollection({
      id: 'col-1',
      variables: [createVariable('var-a', 'A', 'color', 'col-1')],
      values: { 'var-a': { 'mode-light': { type: 'color', value: '#aaa' } } },
    })

    const col2 = createCollection({
      id: 'col-2',
      name: 'Second Collection',
      variables: [createVariable('var-b', 'B', 'number', 'col-2')],
      values: { 'var-b': { 'mode-light': { type: 'number', value: 42 } } },
    })

    expect(resolveVariable([col1, col2], 'var-b', {})).toEqual({ type: 'number', value: 42 })
  })
})

describe('resolveLayerBindings', () => {
  it('resolves all bindings on a layer', () => {
    const collection = createCollection({
      variables: [
        createVariable('var-bg', 'Background', 'color', 'col-1'),
        createVariable('var-opacity', 'Opacity', 'number', 'col-1'),
      ],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#1a1a1a' },
        },
        'var-opacity': {
          'mode-light': { type: 'number', value: 1 },
          'mode-dark': { type: 'number', value: 0.8 },
        },
      },
    })

    const layer = createVectorLayer('layer-1', {
      variableBindings: {
        'fill.color': { variableId: 'var-bg', collectionId: 'col-1', field: 'fill.color' },
        opacity: { variableId: 'var-opacity', collectionId: 'col-1', field: 'opacity' },
      },
    })

    const result = resolveLayerBindings(layer, [collection], { 'col-1': 'mode-dark' })
    expect(result['fill.color']).toEqual({ type: 'color', value: '#1a1a1a' })
    expect(result['opacity']).toEqual({ type: 'number', value: 0.8 })
  })

  it('returns empty object for layer with no bindings', () => {
    const layer = createVectorLayer('layer-1')
    const result = resolveLayerBindings(layer, [], {})
    expect(result).toEqual({})
  })

  it('omits unresolvable bindings', () => {
    const collection = createCollection({
      variables: [createVariable('var-bg', 'Background', 'color', 'col-1')],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
        },
      },
    })

    const layer = createVectorLayer('layer-1', {
      variableBindings: {
        'fill.color': { variableId: 'var-bg', collectionId: 'col-1', field: 'fill.color' },
        opacity: { variableId: 'var-nonexistent', collectionId: 'col-1', field: 'opacity' },
      },
    })

    const result = resolveLayerBindings(layer, [collection], { 'col-1': 'mode-light' })
    expect(result['fill.color']).toEqual({ type: 'color', value: '#ffffff' })
    expect(result['opacity']).toBeUndefined()
  })
})

describe('applyBindingsToLayer', () => {
  it('does not mutate original layer', () => {
    const layer = createVectorLayer('layer-1', {
      fill: { type: 'solid', color: '#000000', opacity: 1 },
    })

    const resolved: Record<string, VariableValue> = {
      'fill.color': { type: 'color', value: '#ff0000' },
    }

    const result = applyBindingsToLayer(layer, resolved)

    // Original is unchanged
    expect(layer.fill?.color).toBe('#000000')
    // Result has the override
    expect((result as VectorLayer).fill?.color).toBe('#ff0000')
  })

  it('returns same layer reference when no values to apply', () => {
    const layer = createVectorLayer('layer-1')
    const result = applyBindingsToLayer(layer, {})
    expect(result).toBe(layer)
  })

  it('applies color binding to fill.color', () => {
    const layer = createVectorLayer('layer-1', {
      fill: { type: 'solid', color: '#000000', opacity: 1 },
    })

    const resolved: Record<string, VariableValue> = {
      'fill.color': { type: 'color', value: '#00ff00' },
    }

    const result = applyBindingsToLayer(layer, resolved) as VectorLayer
    expect(result.fill?.color).toBe('#00ff00')
    expect(result.fill?.opacity).toBe(1) // other props preserved
  })

  it('applies number binding to opacity', () => {
    const layer = createVectorLayer('layer-1', { opacity: 1 })

    const resolved: Record<string, VariableValue> = {
      opacity: { type: 'number', value: 0.5 },
    }

    const result = applyBindingsToLayer(layer, resolved)
    expect(result.opacity).toBe(0.5)
  })

  it('applies boolean binding to visible', () => {
    const layer = createVectorLayer('layer-1', { visible: true })

    const resolved: Record<string, VariableValue> = {
      visible: { type: 'boolean', value: false },
    }

    const result = applyBindingsToLayer(layer, resolved)
    expect(result.visible).toBe(false)
  })

  it('applies transform.x binding', () => {
    const layer = createVectorLayer('layer-1', {
      transform: { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0 },
    })

    const resolved: Record<string, VariableValue> = {
      'transform.x': { type: 'number', value: 100 },
    }

    const result = applyBindingsToLayer(layer, resolved)
    expect(result.transform.x).toBe(100)
    expect(result.transform.y).toBe(20) // preserved
  })

  it('applies multiple bindings at once', () => {
    const layer = createVectorLayer('layer-1', {
      fill: { type: 'solid', color: '#000000', opacity: 1 },
      opacity: 1,
      visible: true,
    })

    const resolved: Record<string, VariableValue> = {
      'fill.color': { type: 'color', value: '#ff0000' },
      opacity: { type: 'number', value: 0.75 },
      visible: { type: 'boolean', value: false },
    }

    const result = applyBindingsToLayer(layer, resolved) as VectorLayer
    expect(result.fill?.color).toBe('#ff0000')
    expect(result.opacity).toBe(0.75)
    expect(result.visible).toBe(false)
  })

  it('applies string binding to text layer', () => {
    const layer = createTextLayer('text-1', { text: 'Original' })

    const resolved: Record<string, VariableValue> = {
      text: { type: 'string', value: 'Updated text' },
    }

    const result = applyBindingsToLayer(layer, resolved) as TextLayer
    expect(result.text).toBe('Updated text')
  })
})

describe('collection/mode CRUD logic', () => {
  it('creates a collection with default mode and empty variables', () => {
    const collection = createCollection({
      variables: [],
      values: {},
      modes: [createMode('m-1', 'Default')],
    })

    expect(collection.modes).toHaveLength(1)
    expect(collection.modes[0]!.name).toBe('Default')
    expect(collection.variables).toHaveLength(0)
  })

  it('adds variables to a collection', () => {
    const collection = createCollection({
      variables: [
        createVariable('v-1', 'Primary', 'color', 'col-1'),
        createVariable('v-2', 'Spacing', 'number', 'col-1'),
      ],
      values: {
        'v-1': {
          'mode-light': { type: 'color', value: '#0000ff' },
          'mode-dark': { type: 'color', value: '#8888ff' },
        },
        'v-2': {
          'mode-light': { type: 'number', value: 8 },
          'mode-dark': { type: 'number', value: 12 },
        },
      },
    })

    expect(collection.variables).toHaveLength(2)
    expect(collection.variables[0]!.type).toBe('color')
    expect(collection.variables[1]!.type).toBe('number')
  })

  it('removes a variable and its values', () => {
    const collection = createCollection({
      variables: [
        createVariable('v-1', 'Primary', 'color', 'col-1'),
        createVariable('v-2', 'Spacing', 'number', 'col-1'),
      ],
      values: {
        'v-1': { 'mode-light': { type: 'color', value: '#0000ff' } },
        'v-2': { 'mode-light': { type: 'number', value: 8 } },
      },
    })

    // Simulate removal
    const filtered = collection.variables.filter((v) => v.id !== 'v-1')
    const newValues = { ...collection.values }
    delete newValues['v-1']

    expect(filtered).toHaveLength(1)
    expect(filtered[0]!.id).toBe('v-2')
    expect(newValues['v-1']).toBeUndefined()
    expect(newValues['v-2']).toBeDefined()
  })

  it('removes a mode and cleans up values', () => {
    const collection = createCollection({
      variables: [createVariable('v-1', 'Primary', 'color', 'col-1')],
      values: {
        'v-1': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#000000' },
        },
      },
    })

    // Simulate removing dark mode
    const filteredModes = collection.modes.filter((m) => m.id !== 'mode-dark')
    const cleanedValues: Record<string, Record<string, VariableValue>> = {}
    for (const [varId, modeValues] of Object.entries(collection.values)) {
      const cleaned: Record<string, VariableValue> = {}
      for (const [modeId, val] of Object.entries(modeValues)) {
        if (modeId !== 'mode-dark') cleaned[modeId] = val
      }
      cleanedValues[varId] = cleaned
    }

    expect(filteredModes).toHaveLength(1)
    expect(filteredModes[0]!.id).toBe('mode-light')
    expect(cleanedValues['v-1']!['mode-dark']).toBeUndefined()
    expect(cleanedValues['v-1']!['mode-light']).toBeDefined()
  })

  it('adds a new mode', () => {
    const collection = createCollection()
    const newMode = createMode('mode-high-contrast', 'High Contrast')
    const updatedModes = [...collection.modes, newMode]

    expect(updatedModes).toHaveLength(3)
    expect(updatedModes[2]!.name).toBe('High Contrast')
  })

  it('renames a collection', () => {
    const collection = createCollection({ name: 'Colors' })
    const renamed = { ...collection, name: 'Brand Colors' }
    expect(renamed.name).toBe('Brand Colors')
  })
})

describe('variable value type validation', () => {
  it('validates color values', () => {
    expect(isValidVariableValue({ type: 'color', value: '#ff0000' }, 'color')).toBe(true)
    expect(isValidVariableValue({ type: 'number', value: 42 }, 'color')).toBe(false)
    expect(isValidVariableValue({ type: 'string', value: '#ff0000' }, 'color')).toBe(false)
    expect(isValidVariableValue({ type: 'boolean', value: true }, 'color')).toBe(false)
  })

  it('validates number values', () => {
    expect(isValidVariableValue({ type: 'number', value: 0 }, 'number')).toBe(true)
    expect(isValidVariableValue({ type: 'number', value: -3.14 }, 'number')).toBe(true)
    expect(isValidVariableValue({ type: 'color', value: '#000' }, 'number')).toBe(false)
  })

  it('validates string values', () => {
    expect(isValidVariableValue({ type: 'string', value: '' }, 'string')).toBe(true)
    expect(isValidVariableValue({ type: 'string', value: 'hello world' }, 'string')).toBe(true)
    expect(isValidVariableValue({ type: 'number', value: 0 }, 'string')).toBe(false)
  })

  it('validates boolean values', () => {
    expect(isValidVariableValue({ type: 'boolean', value: true }, 'boolean')).toBe(true)
    expect(isValidVariableValue({ type: 'boolean', value: false }, 'boolean')).toBe(true)
    expect(isValidVariableValue({ type: 'string', value: 'true' }, 'boolean')).toBe(false)
  })
})

describe('end-to-end: resolve and apply', () => {
  it('resolves and applies dark mode color to a layer', () => {
    const collection = createCollection({
      variables: [
        createVariable('var-bg', 'Background', 'color', 'col-1'),
        createVariable('var-opacity', 'Opacity', 'number', 'col-1'),
      ],
      values: {
        'var-bg': {
          'mode-light': { type: 'color', value: '#ffffff' },
          'mode-dark': { type: 'color', value: '#1a1a1a' },
        },
        'var-opacity': {
          'mode-light': { type: 'number', value: 1 },
          'mode-dark': { type: 'number', value: 0.9 },
        },
      },
    })

    const layer = createVectorLayer('layer-1', {
      fill: { type: 'solid', color: '#000000', opacity: 1 },
      opacity: 1,
      variableBindings: {
        'fill.color': { variableId: 'var-bg', collectionId: 'col-1', field: 'fill.color' },
        opacity: { variableId: 'var-opacity', collectionId: 'col-1', field: 'opacity' },
      },
    })

    const resolved = resolveLayerBindings(layer, [collection], { 'col-1': 'mode-dark' })
    const applied = applyBindingsToLayer(layer, resolved) as VectorLayer

    expect(applied.fill?.color).toBe('#1a1a1a')
    expect(applied.opacity).toBe(0.9)
    // Original is unchanged
    expect(layer.fill?.color).toBe('#000000')
    expect(layer.opacity).toBe(1)
  })

  it('handles missing bindings gracefully', () => {
    const layer = createVectorLayer('layer-1', {
      variableBindings: {
        'fill.color': { variableId: 'var-nonexistent', collectionId: 'col-1', field: 'fill.color' },
      },
    })

    const resolved = resolveLayerBindings(layer, [], {})
    expect(Object.keys(resolved)).toHaveLength(0)

    const applied = applyBindingsToLayer(layer, resolved)
    // Should return the same layer since nothing to apply
    expect(applied).toBe(layer)
  })
})
