// ── Design Variable System Types ──

/** Supported variable types */
export type VariableType = 'color' | 'number' | 'string' | 'boolean'

/** Discriminated union for variable values by type */
export type VariableValue =
  | { type: 'color'; value: string }       // hex color string e.g. '#ff0000'
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }

/** A named mode within a collection (e.g. "Light", "Dark") */
export interface VariableMode {
  id: string
  name: string
}

/** A variable definition within a collection */
export interface Variable {
  id: string
  name: string
  type: VariableType
  description?: string
  collectionId: string
}

/** A collection of related variables with one or more modes */
export interface VariableCollection {
  id: string
  name: string
  modes: VariableMode[]
  variables: Variable[]
  /** values[variableId][modeId] → VariableValue */
  values: Record<string, Record<string, VariableValue>>
  /** Optional reference to a base collection this one inherits from */
  extendsCollectionId?: string
}

/** Binding of a layer property to a variable */
export interface VariableBinding {
  variableId: string
  collectionId: string
  /** Property path on the layer, e.g. 'fill.color', 'opacity', 'transform.x' */
  field: string
}

/** Default value for each variable type */
export function defaultVariableValue(type: VariableType): VariableValue {
  switch (type) {
    case 'color':
      return { type: 'color', value: '#000000' }
    case 'number':
      return { type: 'number', value: 0 }
    case 'string':
      return { type: 'string', value: '' }
    case 'boolean':
      return { type: 'boolean', value: false }
  }
}

/** Type guard: check if a VariableValue matches the expected VariableType */
export function isValidVariableValue(value: VariableValue, expectedType: VariableType): boolean {
  return value.type === expectedType
}

/**
 * Check if setting `extendsId` on `collectionId` would create a circular
 * inheritance chain among the given collections.
 */
export function wouldCreateCycle(
  collectionId: string,
  extendsId: string,
  allCollections: VariableCollection[],
): boolean {
  const visited = new Set<string>()
  visited.add(collectionId)
  let currentId: string | undefined = extendsId
  while (currentId) {
    if (visited.has(currentId)) return true
    visited.add(currentId)
    const col = allCollections.find((c) => c.id === currentId)
    currentId = col?.extendsCollectionId
  }
  return false
}

/**
 * Get all variables available to a collection, including inherited ones
 * from the base chain. Own variables come first, then inherited ones that
 * are not already present (by id) in the collection.
 */
export function getInheritedVariables(
  collection: VariableCollection,
  allCollections: VariableCollection[],
): Variable[] {
  const ownIds = new Set(collection.variables.map((v) => v.id))
  const inherited: Variable[] = []
  const visited = new Set<string>()
  visited.add(collection.id)

  let currentId = collection.extendsCollectionId
  while (currentId) {
    if (visited.has(currentId)) break // guard against cycles
    visited.add(currentId)
    const parent = allCollections.find((c) => c.id === currentId)
    if (!parent) break
    for (const v of parent.variables) {
      if (!ownIds.has(v.id)) {
        ownIds.add(v.id)
        inherited.push(v)
      }
    }
    currentId = parent.extendsCollectionId
  }

  return [...collection.variables, ...inherited]
}

/**
 * Resolve the effective value for a variable within a collection,
 * checking the collection itself first, then walking up the extends chain.
 * Returns null if no value is found anywhere in the chain.
 */
export function getEffectiveValue(
  collection: VariableCollection,
  variableId: string,
  modeId: string,
  allCollections: VariableCollection[],
): VariableValue | null {
  const visited = new Set<string>()
  let current: VariableCollection | undefined = collection
  while (current) {
    if (visited.has(current.id)) break // guard against cycles
    visited.add(current.id)
    const val = current.values[variableId]?.[modeId]
    if (val) return val
    if (!current.extendsCollectionId) break
    current = allCollections.find((c) => c.id === current!.extendsCollectionId)
  }
  return null
}
