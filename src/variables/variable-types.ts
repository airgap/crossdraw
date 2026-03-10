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
