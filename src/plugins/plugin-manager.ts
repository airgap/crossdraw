/**
 * Plugin Manager — high-level API for registering, enabling, and disabling plugins.
 *
 * Sits on top of PluginRuntime and CrossdrawPluginAPI, providing the interface
 * that the UI (settings panel, menu bar) interacts with.
 */

import type { CrossdrawPluginAPI } from './plugin-api'
import { createCrossdrawPluginAPI, startPluginEventForwarding } from './plugin-api'
import { runPluginInSandbox } from './plugin-sandbox'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PluginManifest {
  /** Unique plugin identifier */
  id: string
  /** Display name */
  name: string
  /** Semantic version */
  version: string
  /** Short description */
  description: string
  /** Author name or email */
  author: string
  /** Relative path to JS entry-point file */
  entryPoint: string
}

export interface LoadedPlugin {
  manifest: PluginManifest
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface PluginEntry {
  manifest: PluginManifest
  enabled: boolean
  /** The init function provided at registration time */
  initFn: ((api: CrossdrawPluginAPI) => void) | null
  /** Cleanup function returned by the init, if any */
  cleanupFn: (() => void) | null
}

const plugins = new Map<string, PluginEntry>()

/** Lazily created, shared API instance */
let sharedAPI: CrossdrawPluginAPI | null = null
let eventForwardingStarted = false

function getSharedAPI(): CrossdrawPluginAPI {
  if (!sharedAPI) {
    sharedAPI = createCrossdrawPluginAPI()
    if (!eventForwardingStarted) {
      startPluginEventForwarding()
      eventForwardingStarted = true
    }
  }
  return sharedAPI
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a plugin with its manifest and initialisation function.
 *
 * The plugin is NOT activated until `enablePlugin()` is called.
 */
export function registerPlugin(manifest: PluginManifest, initFn: (api: CrossdrawPluginAPI) => void): void {
  if (plugins.has(manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already registered`)
  }
  plugins.set(manifest.id, {
    manifest,
    enabled: false,
    initFn,
    cleanupFn: null,
  })
}

/**
 * Register and immediately activate a plugin from raw source code.
 * The code is executed inside a sandbox with only the CrossdrawPluginAPI exposed.
 */
export function registerPluginFromSource(manifest: PluginManifest, code: string): void {
  if (plugins.has(manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already registered`)
  }
  const entry: PluginEntry = {
    manifest,
    enabled: false,
    initFn: (api) => runPluginInSandbox(code, api),
    cleanupFn: null,
  }
  plugins.set(manifest.id, entry)
}

/**
 * Unregister a plugin. Disables it first if currently enabled.
 */
export function unregisterPlugin(id: string): void {
  const entry = plugins.get(id)
  if (!entry) return
  if (entry.enabled) {
    disablePlugin(id)
  }
  plugins.delete(id)
}

/**
 * Return a snapshot of all loaded plugins.
 */
export function getLoadedPlugins(): LoadedPlugin[] {
  return Array.from(plugins.values()).map((e) => ({
    manifest: { ...e.manifest },
    enabled: e.enabled,
  }))
}

/**
 * Enable (activate) a registered plugin.
 * Calls the plugin's init function with the shared API.
 */
export function enablePlugin(id: string): void {
  const entry = plugins.get(id)
  if (!entry) {
    throw new Error(`Plugin "${id}" is not registered`)
  }
  if (entry.enabled) return

  const api = getSharedAPI()

  try {
    if (entry.initFn) {
      const result = entry.initFn(api) as unknown
      if (typeof result === 'function') {
        entry.cleanupFn = result as () => void
      }
    }
    entry.enabled = true
  } catch (err) {
    console.error(`[PluginManager] Failed to enable plugin "${id}":`, err)
    throw err
  }
}

/**
 * Disable (deactivate) a registered plugin.
 * Calls the cleanup function if the plugin returned one during init.
 */
export function disablePlugin(id: string): void {
  const entry = plugins.get(id)
  if (!entry) return
  if (!entry.enabled) return

  try {
    entry.cleanupFn?.()
  } catch (err) {
    console.error(`[PluginManager] Cleanup error for plugin "${id}":`, err)
  }

  entry.cleanupFn = null
  entry.enabled = false
}

/**
 * Check whether a plugin is currently enabled.
 */
export function isPluginEnabled(id: string): boolean {
  return plugins.get(id)?.enabled ?? false
}

/**
 * Get a single plugin entry by ID, or undefined if not registered.
 */
export function getPlugin(id: string): LoadedPlugin | undefined {
  const entry = plugins.get(id)
  if (!entry) return undefined
  return { manifest: { ...entry.manifest }, enabled: entry.enabled }
}

/**
 * Remove all plugins. Useful for tests or full teardown.
 */
export function clearAllPlugins(): void {
  for (const id of plugins.keys()) {
    unregisterPlugin(id)
  }
}
