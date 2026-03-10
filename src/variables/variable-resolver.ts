import type { VariableCollection, VariableValue, VariableBinding } from './variable-types'
import type { Layer } from '@/types'

/**
 * Resolve a single variable to its value for the given active modes.
 * Falls back to the first mode if the active mode is not found.
 * Returns null if the variable or collection doesn't exist.
 */
export function resolveVariable(
  collections: VariableCollection[],
  variableId: string,
  activeModeIds: Record<string, string>,
): VariableValue | null {
  for (const collection of collections) {
    const variable = collection.variables.find((v) => v.id === variableId)
    if (!variable) continue

    const valuesForVar = collection.values[variableId]
    if (!valuesForVar) return null

    // Use the active mode for this collection, or fall back to the first mode
    const activeModeId = activeModeIds[collection.id] ?? collection.modes[0]?.id
    if (!activeModeId) return null

    const value = valuesForVar[activeModeId]
    if (value) return value

    // Fall back to first mode
    const firstModeId = collection.modes[0]?.id
    if (firstModeId) {
      return valuesForVar[firstModeId] ?? null
    }

    return null
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
export function applyBindingsToLayer(
  layer: Layer,
  resolvedValues: Record<string, VariableValue>,
): Layer {
  if (Object.keys(resolvedValues).length === 0) return layer

  // Deep clone the layer
  const clone = JSON.parse(JSON.stringify(layer)) as Record<string, unknown>

  for (const [path, varValue] of Object.entries(resolvedValues)) {
    const raw = extractRawValue(varValue)
    setNestedValue(clone, path, raw)
  }

  return clone as unknown as Layer
}
