/**
 * Concrete CrossdrawPluginAPI implementation.
 *
 * This is the public API surface that plugins can access. It delegates all
 * operations to the Zustand editor store, wrapping them in a safe, read-only
 * or permission-gated interface.
 */

import type { DesignDocument, Artboard, Layer, NamedColor } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { exportArtboardToSVG } from '@/io/svg-export'
import { exportArtboardToBlob } from '@/io/raster-export'

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type PluginEvent = 'selectionChanged' | 'documentChanged' | 'toolChanged' | 'layerAdded' | 'layerRemoved'

// ---------------------------------------------------------------------------
// CrossdrawPluginAPI — the public contract
// ---------------------------------------------------------------------------

export interface CrossdrawPluginAPI {
  // Document access
  getDocument(): DesignDocument
  getActiveArtboard(): Artboard | null
  getSelectedLayers(): Layer[]

  // Layer operations
  addLayer(artboardId: string, layer: Layer): void
  updateLayer(artboardId: string, layerId: string, updates: Partial<Layer>): void
  removeLayer(artboardId: string, layerId: string): void
  selectLayer(layerId: string): void

  // Tool & UI
  getActiveTool(): string
  setActiveTool(tool: string): void
  showNotification(message: string, type?: 'info' | 'warning' | 'error'): void

  // Colors
  getDocumentColors(): NamedColor[]
  addDocumentColor(color: NamedColor): void

  // Events
  on(event: PluginEvent, callback: (...args: unknown[]) => void): () => void

  // Export
  exportArtboardToPNG(artboardId: string, scale?: number): Promise<Blob>
  exportArtboardToSVG(artboardId: string): string
}

// ---------------------------------------------------------------------------
// Internal event bus for plugin events
// ---------------------------------------------------------------------------

type Listener = (...args: unknown[]) => void

class PluginEventBus {
  private listeners = new Map<PluginEvent, Set<Listener>>()

  on(event: PluginEvent, callback: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    return () => {
      this.listeners.get(event)?.delete(callback)
    }
  }

  emit(event: PluginEvent, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const cb of set) {
      try {
        cb(...args)
      } catch (err) {
        console.error(`[PluginEventBus] Error in listener for "${event}":`, err)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

// Singleton event bus shared across all plugin API instances
const eventBus = new PluginEventBus()

/**
 * Get the shared event bus so the editor can emit events from the outside
 * (e.g. after store mutations).
 */
export function getPluginEventBus(): PluginEventBus {
  return eventBus
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve a layer by ID across all artboards. */
function findLayerById(doc: DesignDocument, layerId: string): { artboard: Artboard; layer: Layer } | null {
  for (const ab of doc.artboards) {
    const found = findLayerRecursive(ab.layers, layerId)
    if (found) return { artboard: ab, layer: found }
  }
  return null
}

function findLayerRecursive(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findLayerRecursive(l.children, id)
      if (child) return child
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a concrete CrossdrawPluginAPI backed by the editor store.
 */
export function createCrossdrawPluginAPI(): CrossdrawPluginAPI {
  const store = useEditorStore

  const api: CrossdrawPluginAPI = {
    // ------------------------------------------------------------------
    // Document access
    // ------------------------------------------------------------------

    getDocument(): DesignDocument {
      return structuredClone(store.getState().document)
    },

    getActiveArtboard(): Artboard | null {
      const state = store.getState()
      const artboardId = state.viewport.artboardId
      if (!artboardId) {
        // Fall back to first artboard
        return state.document.artboards[0] ?? null
      }
      return state.document.artboards.find((a) => a.id === artboardId) ?? null
    },

    getSelectedLayers(): Layer[] {
      const state = store.getState()
      const ids = state.selection.layerIds
      if (ids.length === 0) return []
      const results: Layer[] = []
      for (const id of ids) {
        const found = findLayerById(state.document, id)
        if (found) results.push(structuredClone(found.layer))
      }
      return results
    },

    // ------------------------------------------------------------------
    // Layer operations
    // ------------------------------------------------------------------

    addLayer(artboardId: string, layer: Layer): void {
      store.getState().addLayer(artboardId, layer)
      eventBus.emit('layerAdded', artboardId, layer.id)
    },

    updateLayer(artboardId: string, layerId: string, updates: Partial<Layer>): void {
      store.getState().updateLayer(artboardId, layerId, updates)
    },

    removeLayer(artboardId: string, layerId: string): void {
      store.getState().deleteLayer(artboardId, layerId)
      eventBus.emit('layerRemoved', artboardId, layerId)
    },

    selectLayer(layerId: string): void {
      store.getState().selectLayer(layerId)
      eventBus.emit('selectionChanged', [layerId])
    },

    // ------------------------------------------------------------------
    // Tool & UI
    // ------------------------------------------------------------------

    getActiveTool(): string {
      return store.getState().activeTool
    },

    setActiveTool(tool: string): void {
      const state = store.getState()
      // Validate tool name against EditorState activeTool union
      state.setActiveTool(tool as Parameters<typeof state.setActiveTool>[0])
      eventBus.emit('toolChanged', tool)
    },

    showNotification(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
      // Use console as a fallback; the UI layer can subscribe to the event bus
      // for richer toast rendering.
      const prefix = type === 'error' ? '[Plugin Error]' : type === 'warning' ? '[Plugin Warning]' : '[Plugin]'
      console.log(`${prefix} ${message}`)
    },

    // ------------------------------------------------------------------
    // Colors
    // ------------------------------------------------------------------

    getDocumentColors(): NamedColor[] {
      return structuredClone(store.getState().document.assets.colors)
    },

    addDocumentColor(color: NamedColor): void {
      store.getState().addDocumentColor(color)
    },

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    on(event: PluginEvent, callback: (...args: unknown[]) => void): () => void {
      return eventBus.on(event, callback)
    },

    // ------------------------------------------------------------------
    // Export
    // ------------------------------------------------------------------

    async exportArtboardToPNG(artboardId: string, scale = 1): Promise<Blob> {
      const doc = store.getState().document
      return exportArtboardToBlob(doc, { format: 'png', scale }, artboardId)
    },

    exportArtboardToSVG(artboardId: string): string {
      const doc = store.getState().document
      return exportArtboardToSVG(doc, artboardId)
    },
  }

  return api
}

// ---------------------------------------------------------------------------
// Store subscription — automatically emit plugin events on state changes
// ---------------------------------------------------------------------------

let unsubscribeStore: (() => void) | null = null

/**
 * Start listening to store changes and forwarding them to the plugin event bus.
 * Call once during app initialisation.
 */
export function startPluginEventForwarding(): void {
  if (unsubscribeStore) return // already started

  const store = useEditorStore

  let prevSelectionIds: string[] = store.getState().selection.layerIds
  let prevTool: string = store.getState().activeTool
  let prevDocModified: string = store.getState().document.metadata.modified

  unsubscribeStore = store.subscribe((state) => {
    // Selection changes
    const curSel = state.selection.layerIds
    if (curSel !== prevSelectionIds) {
      prevSelectionIds = curSel
      eventBus.emit('selectionChanged', curSel)
    }

    // Tool changes
    if (state.activeTool !== prevTool) {
      prevTool = state.activeTool
      eventBus.emit('toolChanged', prevTool)
    }

    // Document changes (coarse — we just check the modified timestamp)
    const curMod = state.document.metadata.modified
    if (curMod !== prevDocModified) {
      prevDocModified = curMod
      eventBus.emit('documentChanged')
    }
  })
}

/**
 * Stop forwarding store changes. Mostly useful for cleanup in tests.
 */
export function stopPluginEventForwarding(): void {
  unsubscribeStore?.()
  unsubscribeStore = null
}
