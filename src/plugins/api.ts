/**
 * Plugin API surface — the public interface exposed to plugins.
 * Plugins run sandboxed and interact with the editor through this API.
 */

import type { DesignDocument, Artboard, Layer, Fill, Stroke, ViewportState } from '@/types'
import type { PluginPermission } from './manifest'

// --- Event types ---

export type PluginEventType =
  | 'selectionChange'
  | 'documentChange'
  | 'toolChange'
  | 'viewportChange'
  | 'layerAdd'
  | 'layerDelete'
  | 'layerUpdate'

export interface PluginEvent {
  type: PluginEventType
  timestamp: number
}

export interface SelectionChangeEvent extends PluginEvent {
  type: 'selectionChange'
  layerIds: string[]
}

export interface DocumentChangeEvent extends PluginEvent {
  type: 'documentChange'
  description: string
}

export interface ToolChangeEvent extends PluginEvent {
  type: 'toolChange'
  tool: string
}

export interface ViewportChangeEvent extends PluginEvent {
  type: 'viewportChange'
  viewport: ViewportState
}

export type PluginEventMap = {
  selectionChange: SelectionChangeEvent
  documentChange: DocumentChangeEvent
  toolChange: ToolChangeEvent
  viewportChange: ViewportChangeEvent
  layerAdd: PluginEvent & { layerId: string; artboardId: string }
  layerDelete: PluginEvent & { layerId: string; artboardId: string }
  layerUpdate: PluginEvent & { layerId: string; artboardId: string }
}

type EventCallback<T extends PluginEventType> = (event: PluginEventMap[T]) => void

// --- API interfaces ---

export interface DocumentAPI {
  /** Get the full document (read-only snapshot). */
  getDocument(): Readonly<DesignDocument>
  /** Get a specific artboard by ID. */
  getArtboard(id: string): Readonly<Artboard> | null
  /** Get all artboards. */
  getArtboards(): ReadonlyArray<Readonly<Artboard>>
  /** Get a specific layer by ID. */
  getLayer(artboardId: string, layerId: string): Readonly<Layer> | null
  /** Add a layer to an artboard. */
  addLayer(artboardId: string, layer: Layer): void
  /** Update layer properties. */
  updateLayer(artboardId: string, layerId: string, updates: Partial<Layer>): void
  /** Delete a layer. */
  deleteLayer(artboardId: string, layerId: string): void
  /** Set fill on a vector layer. */
  setFill(artboardId: string, layerId: string, fill: Fill | null): void
  /** Set stroke on a vector layer. */
  setStroke(artboardId: string, layerId: string, stroke: Stroke | null): void
}

export interface SelectionAPI {
  /** Get currently selected layer IDs. */
  getSelection(): string[]
  /** Select a layer (optionally add to selection). */
  selectLayer(layerId: string, multiselect?: boolean): void
  /** Deselect all layers. */
  deselectAll(): void
}

export interface ViewportAPI {
  /** Get current viewport state. */
  getViewport(): ViewportState
  /** Set zoom level. */
  setZoom(zoom: number): void
  /** Pan to specific coordinates. */
  setPan(x: number, y: number): void
  /** Zoom to fit all content. */
  zoomToFit(): void
  /** Scroll to a specific layer. */
  scrollToLayer(layerId: string): void
}

export interface UIDialogOptions {
  title: string
  message?: string
  buttons?: Array<{ label: string; value: string; primary?: boolean }>
}

export interface UIDialogResult {
  button: string
}

export interface UIAPI {
  /** Show a dialog/modal. */
  showDialog(options: UIDialogOptions): Promise<UIDialogResult>
  /** Show a toast notification. */
  showToast(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void
  /** Register a panel to render. */
  registerPanel(panelId: string, render: () => string): void
}

export interface EventsAPI {
  /** Subscribe to an event. Returns unsubscribe function. */
  on<T extends PluginEventType>(event: T, callback: EventCallback<T>): () => void
  /** Subscribe to an event once. */
  once<T extends PluginEventType>(event: T, callback: EventCallback<T>): void
}

export interface CanvasOverlayAPI {
  /** Register a custom overlay renderer. */
  registerOverlay(id: string, render: (ctx: CanvasRenderingContext2D, zoom: number) => void): void
  /** Remove a registered overlay. */
  removeOverlay(id: string): void
}

/**
 * Full plugin API surface.
 */
export interface PluginAPI {
  document: DocumentAPI
  selection: SelectionAPI
  viewport: ViewportAPI
  ui: UIAPI
  events: EventsAPI
  canvas: CanvasOverlayAPI
}

/**
 * Create a permission-scoped plugin API.
 * Only API methods matching granted permissions are available.
 */
export function createScopedAPI(fullAPI: PluginAPI, permissions: PluginPermission[]): Partial<PluginAPI> {
  const scoped: Partial<PluginAPI> = {}

  if (permissions.includes('document:read') || permissions.includes('document:write')) {
    const docAPI = { ...fullAPI.document }
    if (!permissions.includes('document:write')) {
      // Read-only: remove mutating methods
      docAPI.addLayer = () => {
        throw new Error('Permission denied: document:write')
      }
      docAPI.updateLayer = () => {
        throw new Error('Permission denied: document:write')
      }
      docAPI.deleteLayer = () => {
        throw new Error('Permission denied: document:write')
      }
      docAPI.setFill = () => {
        throw new Error('Permission denied: document:write')
      }
      docAPI.setStroke = () => {
        throw new Error('Permission denied: document:write')
      }
    }
    scoped.document = docAPI
  }

  if (permissions.includes('selection:read') || permissions.includes('selection:write')) {
    const selAPI = { ...fullAPI.selection }
    if (!permissions.includes('selection:write')) {
      selAPI.selectLayer = () => {
        throw new Error('Permission denied: selection:write')
      }
      selAPI.deselectAll = () => {
        throw new Error('Permission denied: selection:write')
      }
    }
    scoped.selection = selAPI
  }

  if (permissions.includes('viewport:read') || permissions.includes('viewport:write')) {
    const vpAPI = { ...fullAPI.viewport }
    if (!permissions.includes('viewport:write')) {
      vpAPI.setZoom = () => {
        throw new Error('Permission denied: viewport:write')
      }
      vpAPI.setPan = () => {
        throw new Error('Permission denied: viewport:write')
      }
      vpAPI.zoomToFit = () => {
        throw new Error('Permission denied: viewport:write')
      }
      vpAPI.scrollToLayer = () => {
        throw new Error('Permission denied: viewport:write')
      }
    }
    scoped.viewport = vpAPI
  }

  if (permissions.includes('ui:dialogs') || permissions.includes('ui:panels')) {
    scoped.ui = fullAPI.ui
  }

  if (permissions.includes('events:subscribe')) {
    scoped.events = fullAPI.events
  }

  if (permissions.includes('canvas:overlay')) {
    scoped.canvas = fullAPI.canvas
  }

  return scoped
}
