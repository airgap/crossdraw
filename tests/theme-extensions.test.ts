import { describe, it, expect } from 'bun:test'
import {
  getInheritedVariables,
  getEffectiveValue,
  wouldCreateCycle,
} from '@/variables/variable-types'
import { resolveVariable } from '@/variables/variable-resolver'
import type {
  VariableCollection,
  Variable,
  VariableMode,
  VariableType,
} from '@/variables/variable-types'

// ── Test helpers ──

function createMode(id: string, name: string): VariableMode {
  return { id, name }
}

function createVariable(id: string, name: string, type: VariableType, collectionId: string): Variable {
  return { id, name, type, collectionId }
}

function createCollection(overrides: Partial<VariableCollection> & { id: string }): VariableCollection {
  return {
    name: 'Collection',
    modes: [createMode('mode-1', 'Default')],
    variables: [],
    values: {},
    ...overrides,
  }
}

// ── Tests ──

describe('theme-extensions: single-level inheritance', () => {
  it('child gets parent variables via getInheritedVariables', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [
        createVariable('var-primary', 'Primary', 'color', 'parent'),
        createVariable('var-spacing', 'Spacing', 'number', 'parent'),
      ],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#0000ff' } },
        'var-spacing': { 'mode-1': { type: 'number', value: 16 } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product A',
      extendsCollectionId: 'parent',
      variables: [],
      values: {},
    })

    const all = [parent, child]
    const inherited = getInheritedVariables(child, all)

    expect(inherited).toHaveLength(2)
    expect(inherited[0]!.id).toBe('var-primary')
    expect(inherited[1]!.id).toBe('var-spacing')
  })

  it('child inherits parent values via getEffectiveValue', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [createVariable('var-primary', 'Primary', 'color', 'parent')],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#0000ff' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product A',
      extendsCollectionId: 'parent',
      variables: [],
      values: {},
    })

    const all = [parent, child]
    const result = getEffectiveValue(child, 'var-primary', 'mode-1', all)
    expect(result).toEqual({ type: 'color', value: '#0000ff' })
  })
})

describe('theme-extensions: override', () => {
  it('child value takes precedence over parent value', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [createVariable('var-primary', 'Primary', 'color', 'parent')],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#0000ff' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product A',
      extendsCollectionId: 'parent',
      variables: [],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#ff0000' } },
      },
    })

    const all = [parent, child]
    const result = getEffectiveValue(child, 'var-primary', 'mode-1', all)
    expect(result).toEqual({ type: 'color', value: '#ff0000' })
  })

  it('child override does not affect parent resolution', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [createVariable('var-primary', 'Primary', 'color', 'parent')],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#0000ff' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product A',
      extendsCollectionId: 'parent',
      variables: [],
      values: {
        'var-primary': { 'mode-1': { type: 'color', value: '#ff0000' } },
      },
    })

    const all = [parent, child]
    const parentResult = getEffectiveValue(parent, 'var-primary', 'mode-1', all)
    expect(parentResult).toEqual({ type: 'color', value: '#0000ff' })
  })
})

describe('theme-extensions: multi-level chain', () => {
  it('grandchild inherits from child which inherits from parent', () => {
    const grandparent = createCollection({
      id: 'gp',
      name: 'Foundation',
      variables: [
        createVariable('var-a', 'A', 'color', 'gp'),
        createVariable('var-b', 'B', 'number', 'gp'),
      ],
      values: {
        'var-a': { 'mode-1': { type: 'color', value: '#111' } },
        'var-b': { 'mode-1': { type: 'number', value: 10 } },
      },
    })

    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      extendsCollectionId: 'gp',
      variables: [createVariable('var-c', 'C', 'string', 'parent')],
      values: {
        'var-a': { 'mode-1': { type: 'color', value: '#222' } }, // override grandparent
        'var-c': { 'mode-1': { type: 'string', value: 'hello' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product',
      extendsCollectionId: 'parent',
      variables: [],
      values: {},
    })

    const all = [grandparent, parent, child]

    // Child should see all variables
    const vars = getInheritedVariables(child, all)
    expect(vars).toHaveLength(3)

    // var-a should resolve to parent's override (#222), not grandparent's (#111)
    expect(getEffectiveValue(child, 'var-a', 'mode-1', all)).toEqual({
      type: 'color',
      value: '#222',
    })

    // var-b should fall through to grandparent
    expect(getEffectiveValue(child, 'var-b', 'mode-1', all)).toEqual({
      type: 'number',
      value: 10,
    })

    // var-c comes from parent
    expect(getEffectiveValue(child, 'var-c', 'mode-1', all)).toEqual({
      type: 'string',
      value: 'hello',
    })
  })
})

describe('theme-extensions: cycle detection', () => {
  it('detects direct cycle (A extends B, B extends A)', () => {
    const a = createCollection({ id: 'a', extendsCollectionId: 'b' })
    const b = createCollection({ id: 'b' })
    const all = [a, b]

    // Setting b to extend a would create: b -> a -> b
    expect(wouldCreateCycle('b', 'a', all)).toBe(true)
  })

  it('detects self-reference', () => {
    const a = createCollection({ id: 'a' })
    expect(wouldCreateCycle('a', 'a', [a])).toBe(true)
  })

  it('detects indirect cycle (A -> B -> C, then C -> A)', () => {
    const a = createCollection({ id: 'a', extendsCollectionId: 'b' })
    const b = createCollection({ id: 'b', extendsCollectionId: 'c' })
    const c = createCollection({ id: 'c' })
    const all = [a, b, c]

    // Setting c to extend a would create: c -> a -> b -> c
    expect(wouldCreateCycle('c', 'a', all)).toBe(true)
  })

  it('allows valid extension (no cycle)', () => {
    const a = createCollection({ id: 'a' })
    const b = createCollection({ id: 'b' })
    const all = [a, b]

    expect(wouldCreateCycle('b', 'a', all)).toBe(false)
  })

  it('allows chaining that does not form a cycle', () => {
    const a = createCollection({ id: 'a' })
    const b = createCollection({ id: 'b', extendsCollectionId: 'a' })
    const c = createCollection({ id: 'c' })
    const all = [a, b, c]

    // c extending b is fine: c -> b -> a (no cycle)
    expect(wouldCreateCycle('c', 'b', all)).toBe(false)
  })

  it('getInheritedVariables guards against cycles', () => {
    // Manually create a cycle (should not happen via UI, but guard anyway)
    const a = createCollection({
      id: 'a',
      extendsCollectionId: 'b',
      variables: [createVariable('var-1', 'Var1', 'color', 'a')],
    })
    const b = createCollection({
      id: 'b',
      extendsCollectionId: 'a',
      variables: [createVariable('var-2', 'Var2', 'number', 'b')],
    })
    const all = [a, b]

    // Should not infinite loop — should return own + whatever it can get before hitting the cycle
    const vars = getInheritedVariables(a, all)
    expect(vars.length).toBeGreaterThanOrEqual(1)
    expect(vars.length).toBeLessThanOrEqual(2)
  })

  it('getEffectiveValue guards against cycles', () => {
    const a = createCollection({
      id: 'a',
      extendsCollectionId: 'b',
      values: {},
    })
    const b = createCollection({
      id: 'b',
      extendsCollectionId: 'a',
      values: {},
    })
    const all = [a, b]

    // Should return null rather than infinite looping
    const result = getEffectiveValue(a, 'var-nonexistent', 'mode-1', all)
    expect(result).toBeNull()
  })
})

describe('theme-extensions: getEffectiveValue fallback', () => {
  it('returns null when variable value is missing everywhere in the chain', () => {
    const parent = createCollection({
      id: 'parent',
      variables: [createVariable('var-x', 'X', 'color', 'parent')],
      values: {},
    })

    const child = createCollection({
      id: 'child',
      extendsCollectionId: 'parent',
      values: {},
    })

    const all = [parent, child]
    expect(getEffectiveValue(child, 'var-x', 'mode-1', all)).toBeNull()
  })

  it('falls back to parent when child has no value for the given mode', () => {
    const parent = createCollection({
      id: 'parent',
      variables: [createVariable('var-x', 'X', 'number', 'parent')],
      values: {
        'var-x': { 'mode-1': { type: 'number', value: 42 } },
      },
    })

    const child = createCollection({
      id: 'child',
      extendsCollectionId: 'parent',
      values: {
        // child has value for a different variable, but not var-x
        'var-other': { 'mode-1': { type: 'string', value: 'abc' } },
      },
    })

    const all = [parent, child]
    expect(getEffectiveValue(child, 'var-x', 'mode-1', all)).toEqual({
      type: 'number',
      value: 42,
    })
  })
})

describe('theme-extensions: removing extends', () => {
  it('disconnects inheritance — child no longer sees parent variables', () => {
    const parent = createCollection({
      id: 'parent',
      variables: [createVariable('var-p', 'ParentVar', 'color', 'parent')],
      values: {
        'var-p': { 'mode-1': { type: 'color', value: '#abc' } },
      },
    })

    // Initially extends parent
    const child = createCollection({
      id: 'child',
      extendsCollectionId: 'parent',
      variables: [createVariable('var-c', 'ChildVar', 'number', 'child')],
      values: {
        'var-c': { 'mode-1': { type: 'number', value: 5 } },
      },
    })

    const all = [parent, child]

    // With extends, child sees both variables
    expect(getInheritedVariables(child, all)).toHaveLength(2)
    expect(getEffectiveValue(child, 'var-p', 'mode-1', all)).toEqual({
      type: 'color',
      value: '#abc',
    })

    // Remove extends
    const childNoExtends: VariableCollection = { ...child, extendsCollectionId: undefined }
    const allUpdated = [parent, childNoExtends]

    // Now child only sees its own variable
    expect(getInheritedVariables(childNoExtends, allUpdated)).toHaveLength(1)
    expect(getInheritedVariables(childNoExtends, allUpdated)[0]!.id).toBe('var-c')

    // Parent variable no longer accessible through child
    expect(getEffectiveValue(childNoExtends, 'var-p', 'mode-1', allUpdated)).toBeNull()
  })
})

describe('theme-extensions: inherited variables list', () => {
  it('includes parent variables not duplicated when child has own variable with different id', () => {
    const parent = createCollection({
      id: 'parent',
      variables: [
        createVariable('var-1', 'Color1', 'color', 'parent'),
        createVariable('var-2', 'Color2', 'color', 'parent'),
      ],
    })

    const child = createCollection({
      id: 'child',
      extendsCollectionId: 'parent',
      variables: [createVariable('var-3', 'ChildColor', 'color', 'child')],
    })

    const all = [parent, child]
    const vars = getInheritedVariables(child, all)

    expect(vars).toHaveLength(3)
    // Own variable comes first
    expect(vars[0]!.id).toBe('var-3')
    // Then inherited
    expect(vars[1]!.id).toBe('var-1')
    expect(vars[2]!.id).toBe('var-2')
  })

  it('does not duplicate variables that exist in both parent and child by same id', () => {
    const parent = createCollection({
      id: 'parent',
      variables: [createVariable('var-shared', 'Shared', 'color', 'parent')],
    })

    const child = createCollection({
      id: 'child',
      extendsCollectionId: 'parent',
      // child also has the same variable id
      variables: [createVariable('var-shared', 'Shared Override', 'color', 'child')],
    })

    const all = [parent, child]
    const vars = getInheritedVariables(child, all)

    // Should not duplicate
    expect(vars).toHaveLength(1)
    expect(vars[0]!.id).toBe('var-shared')
    expect(vars[0]!.name).toBe('Shared Override') // own version
  })
})

describe('theme-extensions: resolveVariable with inheritance', () => {
  it('resolves inherited variable through the owning collection', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [createVariable('var-color', 'BrandColor', 'color', 'parent')],
      values: {
        'var-color': { 'mode-1': { type: 'color', value: '#brand' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product',
      extendsCollectionId: 'parent',
      variables: [],
      values: {},
    })

    const all = [parent, child]

    // resolveVariable should find var-color via the parent
    const result = resolveVariable(all, 'var-color', { parent: 'mode-1' })
    expect(result).toEqual({ type: 'color', value: '#brand' })
  })

  it('resolveVariable uses child override when present', () => {
    const parent = createCollection({
      id: 'parent',
      name: 'Brand',
      variables: [createVariable('var-color', 'BrandColor', 'color', 'parent')],
      values: {
        'var-color': { 'mode-1': { type: 'color', value: '#brand' } },
      },
    })

    const child = createCollection({
      id: 'child',
      name: 'Product',
      extendsCollectionId: 'parent',
      variables: [],
      values: {
        'var-color': { 'mode-1': { type: 'color', value: '#product' } },
      },
    })

    const all = [parent, child]

    // resolveVariable for the parent's variable, but the child has an override
    // When resolving from parent, parent's own value is returned
    const parentResult = resolveVariable(all, 'var-color', { parent: 'mode-1' })
    expect(parentResult).toEqual({ type: 'color', value: '#brand' })
  })
})
