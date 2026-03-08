/**
 * Plugin runtime — loads, manages, and sandboxes plugins.
 */

import type { PluginManifest, PluginPermission } from './manifest'
import type { PluginAPI, PluginEventType, PluginEventMap } from './api'
import { createScopedAPI } from './api'

export type PluginStatus = 'loading' | 'active' | 'inactive' | 'error'

export interface PluginInstance {
  manifest: PluginManifest
  status: PluginStatus
  error?: string
  /** Cleanup function returned by plugin's activate() */
  deactivate?: () => void
}

/**
 * Simple event emitter for plugin events.
 */
export class PluginEventEmitter {
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  on<T extends PluginEventType>(event: T, callback: (event: PluginEventMap[T]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as (event: unknown) => void)
    return () => {
      this.listeners.get(event)?.delete(callback as (event: unknown) => void)
    }
  }

  once<T extends PluginEventType>(event: T, callback: (event: PluginEventMap[T]) => void): void {
    const unsub = this.on(event, (e) => {
      unsub()
      callback(e)
    })
  }

  emit<T extends PluginEventType>(event: T, data: PluginEventMap[T]): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data)
        } catch (e) {
          console.error(`Plugin event handler error for ${event}:`, e)
        }
      }
    }
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

/**
 * Plugin runtime manager.
 * Manages plugin lifecycle: load, activate, deactivate, unload.
 */
export class PluginRuntime {
  private plugins = new Map<string, PluginInstance>()
  private emitter = new PluginEventEmitter()
  private fullAPI: PluginAPI | null = null

  /**
   * Set the full API implementation that plugins will use.
   */
  setAPI(api: PluginAPI): void {
    this.fullAPI = api
  }

  /**
   * Get the event emitter (used internally to dispatch events to plugins).
   */
  getEmitter(): PluginEventEmitter {
    return this.emitter
  }

  /**
   * Register a plugin from its manifest.
   */
  register(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already registered`)
    }
    this.plugins.set(manifest.id, {
      manifest,
      status: 'inactive',
    })
  }

  /**
   * Activate a registered plugin.
   * In a real implementation, this would load the plugin's main JS in a sandboxed Worker.
   * Here we simulate the lifecycle.
   */
  activate(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" not found`)
    }
    if (instance.status === 'active') return

    if (!this.fullAPI) {
      throw new Error('Plugin API not initialized')
    }

    instance.status = 'loading'

    try {
      // Create permission-scoped API for this plugin
      createScopedAPI(this.fullAPI, instance.manifest.permissions)

      // In production: load main JS in Worker/iframe, pass scopedAPI as message interface
      // For now, just mark as active
      instance.status = 'active'
      instance.error = undefined
    } catch (e) {
      instance.status = 'error'
      instance.error = e instanceof Error ? e.message : String(e)
    }
  }

  /**
   * Deactivate a plugin.
   */
  deactivate(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return
    if (instance.status !== 'active') return

    try {
      instance.deactivate?.()
    } catch {
      // Ignore cleanup errors
    }

    instance.status = 'inactive'
    instance.deactivate = undefined
  }

  /**
   * Unregister a plugin completely.
   */
  unregister(pluginId: string): void {
    this.deactivate(pluginId)
    this.plugins.delete(pluginId)
  }

  /**
   * Get a plugin instance by ID.
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get all registered plugins.
   */
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get plugins filtered by status.
   */
  getPluginsByStatus(status: PluginStatus): PluginInstance[] {
    return this.getAllPlugins().filter((p) => p.status === status)
  }

  /**
   * Check if a plugin has a specific permission.
   */
  hasPermission(pluginId: string, permission: PluginPermission): boolean {
    const instance = this.plugins.get(pluginId)
    if (!instance) return false
    return instance.manifest.permissions.includes(permission)
  }

  /**
   * Get all tool contributions from active plugins.
   */
  getToolContributions(): Array<{
    pluginId: string
    tool: NonNullable<PluginManifest['contributes']>['tools'] extends (infer T)[] | undefined ? T : never
  }> {
    const tools: Array<{ pluginId: string; tool: { id: string; label: string; icon?: string; shortcut?: string } }> = []
    for (const [id, instance] of this.plugins) {
      if (instance.status !== 'active') continue
      for (const tool of instance.manifest.contributes?.tools ?? []) {
        tools.push({ pluginId: id, tool })
      }
    }
    return tools
  }

  /**
   * Get all panel contributions from active plugins.
   */
  getPanelContributions(): Array<{ pluginId: string; panel: { id: string; label: string; location?: string } }> {
    const panels: Array<{ pluginId: string; panel: { id: string; label: string; location?: string } }> = []
    for (const [id, instance] of this.plugins) {
      if (instance.status !== 'active') continue
      for (const panel of instance.manifest.contributes?.panels ?? []) {
        panels.push({ pluginId: id, panel })
      }
    }
    return panels
  }

  /**
   * Get all importer contributions from active plugins.
   */
  getImporterForExtension(
    ext: string,
  ): { pluginId: string; importer: { id: string; extensions: string[]; label: string } } | null {
    for (const [id, instance] of this.plugins) {
      if (instance.status !== 'active') continue
      for (const importer of instance.manifest.contributes?.importers ?? []) {
        if (importer.extensions.includes(ext)) {
          return { pluginId: id, importer }
        }
      }
    }
    return null
  }

  /**
   * Dispose all plugins and clean up.
   */
  dispose(): void {
    for (const id of this.plugins.keys()) {
      this.deactivate(id)
    }
    this.plugins.clear()
    this.emitter.removeAllListeners()
  }
}

/**
 * Singleton runtime instance.
 */
let runtimeInstance: PluginRuntime | null = null

export function getPluginRuntime(): PluginRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new PluginRuntime()
  }
  return runtimeInstance
}
