import type { VariableCollection, VariableValue, VariableBinding } from './variable-types'
import type { Layer } from '@/types'

/**
 * Resolve a variable's value within a single collection, walking up the
 * extends chain if needed. Returns null if no value is found.
 */
function resolveInChain(
  collection: VariableCollection,
  variableId: string,
  modeId: string,
  allCollections: VariableCollection[],
  visited: Set<string>,
): VariableValue | null {
  if (visited.has(collection.id)) return null // cycle guard
  visited.add(collection.id)

  const valuesForVar = collection.values[variableId]
  if (valuesForVar) {
    const value = valuesForVar[modeId]
    if (value) return value
    // Fall back to first mode within this collection
    const firstModeId = collection.modes[0]?.id
    if (firstModeId && firstModeId !== modeId) {
      const fallback = valuesForVar[firstModeId]
      if (fallback) return fallback
    }
  }

  // Walk up inheritance chain
  if (collection.extendsCollectionId) {
    const parent = allCollections.find((c) => c.id === collection.extendsCollectionId)
    if (parent) {
      return resolveInChain(parent, variableId, modeId, allCollections, visited)
    }
  }

  return null
}

/**
 * Resolve a single variable to its value for the given active modes.
 * Falls back to the first mode if the active mode is not found.
 * Supports inheritance: if a variable is not found in the owning
 * collection's values, the extends chain is walked.
 * Returns null if the variable or collection doesn't exist.
 */
export function resolveVariable(
  collections: VariableCollection[],
  variableId: string,
  activeModeIds: Record<string, string>,
): VariableValue | null {
  for (const collection of collections) {
    // Check if this collection owns the variable directly
    const variable = collection.variables.find((v) => v.id === variableId)
    if (!variable) continue

    // Use the active mode for this collection, or fall back to the first mode
    const activeModeId = activeModeIds[collection.id] ?? collection.modes[0]?.id
    if (!activeModeId) return null

    return resolveInChain(collection, variableId, activeModeId, collections, new Set())
  }

  // Variable not found as a direct member of any collection — check if it's
  // inherited by any collection via the extends chain
  for (const collection of collections) {
    if (!collection.extendsCollectionId) continue
    // See if this variable exists somewhere in the ancestor chain
    const activeModeId = activeModeIds[collection.id] ?? collection.modes[0]?.id
    if (!activeModeId) continue
    const visited = new Set<string>()
    visited.add(collection.id)
    let parentId: string | undefined = collection.extendsCollectionId
    while (parentId) {
      if (visited.has(parentId)) break
      visited.add(parentId)
      const parent = collections.find((c) => c.id === parentId)
      if (!parent) break
      const parentVar = parent.variables.find((v) => v.id === variableId)
      if (parentVar) {
        // Found the variable in an ancestor — resolve from the child collection
        return resolveInChain(collection, variableId, activeModeId, collections, new Set())
      }
      parentId = parent.extendsCollectionId
    }
  }

  return null
}

/**
 * Resolve all variable bindings on a layer.
 * Returns a map of property path → resolved VariableValue.
 */
export function resolveLayerBindings(
  layer: Layer,
  collections: VariableCollection[],
  activeModeIds: Record<string, string>,
): Record<string, VariableValue> {
  const bindings = ('variableBindings' in layer ? layer.variableBindings : undefined) as
    | Record<string, VariableBinding>
    | undefined
  if (!bindings) return {}

  const result: Record<string, VariableValue> = {}

  for (const [path, binding] of Object.entries(bindings)) {
    const resolved = resolveVariable(collections, binding.variableId, activeModeIds)
    if (resolved) {
      result[path] = resolved
    }
  }

  return result
}

/**
 * Set a nested property value on an object using a dot-separated path.
 * Creates intermediate objects as needed. Mutates the target in-place.
 */
function setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = target

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }

  const lastPart = parts[parts.length - 1]!
  current[lastPart] = value
}

/**
 * Extract the raw value from a VariableValue for property application.
 */
function extractRawValue(varValue: VariableValue): string | number | boolean {
  return varValue.value
}

/**
 * Apply resolved variable bindings to a layer, returning a new layer copy
 * with bound properties overridden by variable values.
 * The original layer is not mutated.
 */
export function applyBindingsToLayer(layer: Layer, resolvedValues: Record<string, VariableValue>): Layer {
  if (Object.keys(resolvedValues).length === 0) return layer

  // Deep clone the layer
  const clone = JSON.parse(JSON.stringify(layer)) as Record<string, unknown>

  for (const [path, varValue] of Object.entries(resolvedValues)) {
    const raw = extractRawValue(varValue)
    setNestedValue(clone, path, raw)
  }

  return clone as unknown as Layer
}
