/**
 * Plugin manifest describes a plugin's metadata, permissions, and entry points.
 */

export interface PluginManifest {
  /** Unique plugin identifier (reverse-domain, e.g., "com.example.my-plugin") */
  id: string
  /** Display name */
  name: string
  /** Semantic version (e.g., "1.0.0") */
  version: string
  /** Minimum editor version required */
  minEditorVersion?: string
  /** Short description */
  description?: string
  /** Author name */
  author?: string
  /** Plugin homepage or repository URL */
  url?: string

  /** Permissions the plugin requests */
  permissions: PluginPermission[]

  /** Entry point JS file (relative to plugin directory) */
  main: string

  /** Plugin capabilities */
  contributes?: {
    /** Custom tools to add to toolbar */
    tools?: PluginToolContribution[]
    /** Custom panels to add to sidebar */
    panels?: PluginPanelContribution[]
    /** File format importers */
    importers?: PluginImporterContribution[]
    /** File format exporters */
    exporters?: PluginExporterContribution[]
    /** Custom effects/filters */
    effects?: PluginEffectContribution[]
    /** Menu items */
    menuItems?: PluginMenuItemContribution[]
  }
}

export type PluginPermission =
  | 'document:read'
  | 'document:write'
  | 'selection:read'
  | 'selection:write'
  | 'viewport:read'
  | 'viewport:write'
  | 'ui:dialogs'
  | 'ui:panels'
  | 'events:subscribe'
  | 'canvas:overlay'

export interface PluginToolContribution {
  id: string
  label: string
  icon?: string
  shortcut?: string
}

export interface PluginPanelContribution {
  id: string
  label: string
  icon?: string
  /** Panel location: 'left' | 'right' | 'bottom' */
  location?: 'left' | 'right' | 'bottom'
}

export interface PluginImporterContribution {
  id: string
  /** File extensions this importer handles (e.g., [".sketch", ".xd"]) */
  extensions: string[]
  label: string
}

export interface PluginExporterContribution {
  id: string
  /** Output format label (e.g., "Sketch", "TIFF") */
  format: string
  label: string
}

export interface PluginEffectContribution {
  id: string
  label: string
  category?: string
}

export interface PluginMenuItemContribution {
  id: string
  label: string
  /** Menu path (e.g., "Edit/Transform", "Filter/Custom") */
  menuPath: string
  shortcut?: string
}

/**
 * Validate a plugin manifest.
 */
export function validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] }
  }

  const m = manifest as Record<string, unknown>

  if (typeof m.id !== 'string' || m.id.length === 0) {
    errors.push('Missing or invalid "id" field')
  }
  if (typeof m.name !== 'string' || m.name.length === 0) {
    errors.push('Missing or invalid "name" field')
  }
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) {
    errors.push('Missing or invalid "version" field (must be semver)')
  }
  if (!Array.isArray(m.permissions)) {
    errors.push('Missing "permissions" array')
  }
  if (typeof m.main !== 'string' || m.main.length === 0) {
    errors.push('Missing or invalid "main" entry point')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Parse a plugin manifest from JSON string.
 */
export function parseManifest(json: string): PluginManifest {
  const parsed = JSON.parse(json)
  const result = validateManifest(parsed)
  if (!result.valid) {
    throw new Error(`Invalid plugin manifest: ${result.errors.join(', ')}`)
  }
  return parsed as PluginManifest
}
