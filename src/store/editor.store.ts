import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { enablePatches, produce, produceWithPatches, applyPatches, type Patch } from 'immer'
import type {
  DesignDocument,
  Artboard,
  Layer,
  VectorLayer,
  GroupLayer,
  AdjustmentLayer,
  AdjustmentParams,
  ViewportState,
  SelectionState,
  Fill,
  Stroke,
  BlendMode,
  Path,
  Segment,
  Effect,
} from '@/types'
import { encodeDocument } from '@/io/file-format'
import { isElectron } from '@/io/electron-bridge'

enablePatches()

export interface HistoryEntry {
  description: string
  patches: Patch[]
  inversePatches: Patch[]
}

export interface EditorState {
  document: DesignDocument
  history: HistoryEntry[]
  historyIndex: number // points to last applied entry (-1 = empty)
  viewport: ViewportState
  selection: SelectionState
  activeTool:
    | 'select'
    | 'pen'
    | 'node'
    | 'rectangle'
    | 'ellipse'
    | 'polygon'
    | 'star'
    | 'text'
    | 'gradient'
    | 'eyedropper'
    | 'hand'
    | 'measure'
    | 'brush'
    | 'crop'
  showRulers: boolean
  showGrid: boolean
  snapEnabled: boolean
  gridSize: number
  isDirty: boolean
  filePath: string | null
  pixelPreview: boolean
  showExportModal: boolean
  activeSnapLines: { h: number[]; v: number[] } | null
  snapToGrid: boolean
  snapToGuides: boolean
  snapToLayers: boolean
  snapToArtboard: boolean
  snapToPixel: boolean
  snapThreshold: number
  touchMode: boolean
}

export interface EditorActions {
  // Document
  newDocument: (width?: number, height?: number) => void

  // Artboard
  addArtboard: (name: string, width: number, height: number) => void
  deleteArtboard: (id: string) => void
  resizeArtboard: (id: string, width: number, height: number) => void

  // Layer
  addLayer: (artboardId: string, layer: Layer) => void
  deleteLayer: (artboardId: string, layerId: string) => void
  updateLayer: (artboardId: string, layerId: string, updates: Partial<Layer>) => void
  /** Update without creating an undo entry — for live drag previews. */
  updateLayerSilent: (artboardId: string, layerId: string, updates: Partial<Layer>) => void
  setLayerVisibility: (artboardId: string, layerId: string, visible: boolean) => void
  setLayerLocked: (artboardId: string, layerId: string, locked: boolean) => void
  setLayerOpacity: (artboardId: string, layerId: string, opacity: number) => void
  setLayerBlendMode: (artboardId: string, layerId: string, mode: BlendMode) => void
  reorderLayer: (artboardId: string, layerId: string, newIndex: number) => void
  moveLayerToGroup: (artboardId: string, layerId: string, groupId: string) => void
  moveLayerOutOfGroup: (artboardId: string, layerId: string, groupId: string, targetIndex: number) => void
  duplicateLayer: (artboardId: string, layerId: string) => void

  // Path
  addPath: (artboardId: string, layerId: string, path: Path) => void
  updatePath: (artboardId: string, layerId: string, pathId: string, updates: Partial<Path>) => void
  addSegmentToPath: (artboardId: string, layerId: string, pathId: string, segment: Segment) => void

  // Fill/stroke
  setFill: (artboardId: string, layerId: string, fill: Fill | null) => void
  setStroke: (artboardId: string, layerId: string, stroke: Stroke | null) => void

  // Effects
  addEffect: (artboardId: string, layerId: string, effect: Effect) => void
  removeEffect: (artboardId: string, layerId: string, effectId: string) => void
  updateEffect: (artboardId: string, layerId: string, effectId: string, updates: Partial<Effect>) => void

  // Groups
  groupLayers: (artboardId: string, layerIds: string[]) => void
  ungroupLayer: (artboardId: string, groupId: string) => void

  // Adjustment layers
  addAdjustmentLayer: (artboardId: string, adjustmentType: AdjustmentParams['adjustmentType']) => void

  // Masks
  setLayerMask: (artboardId: string, layerId: string, mask: Layer) => void
  removeLayerMask: (artboardId: string, layerId: string) => void

  // Selection
  selectLayer: (layerId: string, multiselect?: boolean) => void
  deselectAll: () => void

  // Viewport
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  setActiveTool: (tool: EditorState['activeTool']) => void
  toggleRulers: () => void
  toggleGrid: () => void
  toggleSnap: () => void
  setGridSize: (size: number) => void
  addGuide: (artboardId: string, axis: 'horizontal' | 'vertical', position: number) => void
  removeGuide: (artboardId: string, axis: 'horizontal' | 'vertical', index: number) => void
  updateGuide: (artboardId: string, axis: 'horizontal' | 'vertical', index: number, position: number) => void

  // Undo/redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Dirty
  setDirty: (dirty: boolean) => void

  // File save
  save: () => Promise<void>
  saveAs: () => Promise<void>

  // Pixel preview
  togglePixelPreview: () => void

  // Snap lines (transient)
  setActiveSnapLines: (lines: { h: number[]; v: number[] } | null) => void

  // Granular snap toggles
  toggleSnapToGrid: () => void
  toggleSnapToGuides: () => void
  toggleSnapToLayers: () => void
  toggleSnapToArtboard: () => void
  toggleSnapToPixel: () => void

  // Export modal
  openExportModal: () => void
  closeExportModal: () => void

  // Touch mode
  toggleTouchMode: () => void
}

function createDefaultDocument(width = 1920, height = 1080): DesignDocument {
  const artboardId = uuid()
  return {
    id: uuid(),
    metadata: {
      title: 'Untitled',
      author: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      colorspace: 'srgb',
      width,
      height,
    },
    artboards: [
      {
        id: artboardId,
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width,
        height,
        backgroundColor: '#ffffff',
        layers: [],
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

function createDefaultVectorLayer(name = 'Layer'): VectorLayer {
  return {
    id: uuid(),
    name,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}

const MAX_HISTORY = 200

export const useEditorStore = create<EditorState & EditorActions>()((set, get) => {
  /**
   * Apply a mutation to `document` via Immer, record patches for undo/redo.
   */
  function mutateDocument(description: string, recipe: (draft: DesignDocument) => void) {
    const state = get()
    const [nextDoc, patches, inversePatches] = produceWithPatches(state.document, recipe)
    if (patches.length === 0) return // no-op

    // Truncate any future history (if we undid and then made a new change)
    const history = state.history.slice(0, state.historyIndex + 1)
    history.push({ description, patches, inversePatches })

    // Cap history length
    const overflow = history.length - MAX_HISTORY
    const trimmedHistory = overflow > 0 ? history.slice(overflow) : history
    const newIndex = trimmedHistory.length - 1

    set({
      document: nextDoc,
      history: trimmedHistory,
      historyIndex: newIndex,
      isDirty: true,
    })
  }

  function findArtboard(doc: DesignDocument, artboardId: string): Artboard | undefined {
    return doc.artboards.find((a) => a.id === artboardId)
  }

  function findLayerIndex(artboard: Artboard, layerId: string): number {
    return artboard.layers.findIndex((l) => l.id === layerId)
  }

  return {
    // Initial state
    document: createDefaultDocument(),
    history: [],
    historyIndex: -1,
    viewport: { zoom: 1, panX: 0, panY: 0, artboardId: null },
    selection: { layerIds: [] },
    activeTool: 'select',
    showRulers: true,
    showGrid: false,
    snapEnabled: true,
    gridSize: 8,
    isDirty: false,
    filePath: null,
    pixelPreview: false,
    showExportModal: false,
    activeSnapLines: null,
    snapToGrid: true,
    snapToGuides: true,
    snapToLayers: true,
    snapToArtboard: true,
    snapToPixel: false,
    snapThreshold: 5,
    touchMode: (() => {
      try {
        const stored = localStorage.getItem('crossdraw:touch-mode')
        if (stored !== null) return stored === 'true'
        // Auto-detect touch capability
        return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
      } catch {
        return false
      }
    })(),

    // Document
    newDocument(width, height) {
      set({
        document: createDefaultDocument(width, height),
        history: [],
        historyIndex: -1,
        selection: { layerIds: [] },
        isDirty: false,
        filePath: null,
      })
    },

    // Artboard
    addArtboard(name, width, height) {
      mutateDocument(`Add artboard "${name}"`, (draft) => {
        const lastArtboard = draft.artboards[draft.artboards.length - 1]
        const x = lastArtboard ? lastArtboard.x + lastArtboard.width + 100 : 0
        draft.artboards.push({
          id: uuid(),
          name,
          x,
          y: 0,
          width,
          height,
          backgroundColor: '#ffffff',
          layers: [],
        })
      })
    },

    deleteArtboard(id) {
      mutateDocument('Delete artboard', (draft) => {
        draft.artboards = draft.artboards.filter((a) => a.id !== id)
      })
    },

    resizeArtboard(id, width, height) {
      mutateDocument('Resize artboard', (draft) => {
        const artboard = findArtboard(draft, id)
        if (artboard) {
          artboard.width = Math.max(1, width)
          artboard.height = Math.max(1, height)
        }
      })
    },

    // Layer
    addLayer(artboardId, layer) {
      mutateDocument(`Add layer "${layer.name}"`, (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (artboard) artboard.layers.push(layer)
      })
    },

    deleteLayer(artboardId, layerId) {
      mutateDocument('Delete layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (artboard) {
          artboard.layers = artboard.layers.filter((l) => l.id !== layerId)
        }
      })
    },

    updateLayer(artboardId, layerId, updates) {
      mutateDocument('Update layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = findLayerIndex(artboard, layerId)
        if (idx !== -1) {
          Object.assign(artboard.layers[idx]!, updates)
        }
      })
    },

    updateLayerSilent(artboardId, layerId, updates) {
      const doc = produce(get().document, (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = findLayerIndex(artboard, layerId)
        if (idx !== -1) {
          Object.assign(artboard.layers[idx]!, updates)
        }
      })
      set({ document: doc })
    },

    setLayerVisibility(artboardId, layerId, visible) {
      mutateDocument(visible ? 'Show layer' : 'Hide layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.visible = visible
      })
    },

    setLayerLocked(artboardId, layerId, locked) {
      mutateDocument(locked ? 'Lock layer' : 'Unlock layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.locked = locked
      })
    },

    setLayerOpacity(artboardId, layerId, opacity) {
      mutateDocument('Set layer opacity', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.opacity = opacity
      })
    },

    setLayerBlendMode(artboardId, layerId, mode) {
      mutateDocument('Set blend mode', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.blendMode = mode
      })
    },

    reorderLayer(artboardId, layerId, newIndex) {
      mutateDocument('Reorder layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = findLayerIndex(artboard, layerId)
        if (idx === -1) return
        const [layer] = artboard.layers.splice(idx, 1)
        artboard.layers.splice(newIndex, 0, layer!)
      })
    },

    moveLayerToGroup(artboardId, layerId, groupId) {
      mutateDocument('Move layer into group', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = findLayerIndex(artboard, layerId)
        if (idx === -1) return
        const group = artboard.layers.find((l) => l.id === groupId)
        if (!group || group.type !== 'group') return
        // Prevent circular: can't move a group into itself or its descendants
        if (layerId === groupId) return
        const layer = artboard.layers[idx]!
        if (layer.type === 'group') {
          const containsGroup = (g: GroupLayer, targetId: string): boolean => {
            for (const c of g.children) {
              if (c.id === targetId) return true
              if (c.type === 'group' && containsGroup(c as GroupLayer, targetId)) return true
            }
            return false
          }
          if (containsGroup(layer as GroupLayer, groupId)) return
        }
        const [removed] = artboard.layers.splice(idx, 1)
        group.children.push(removed!)
      })
    },

    moveLayerOutOfGroup(artboardId, layerId, groupId, targetIndex) {
      mutateDocument('Move layer out of group', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const group = artboard.layers.find((l) => l.id === groupId)
        if (!group || group.type !== 'group') return
        const childIdx = group.children.findIndex((c) => c.id === layerId)
        if (childIdx === -1) return
        const [removed] = group.children.splice(childIdx, 1)
        artboard.layers.splice(targetIndex, 0, removed!)
      })
    },

    duplicateLayer(artboardId, layerId) {
      mutateDocument('Duplicate layer', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = findLayerIndex(artboard, layerId)
        if (idx === -1) return
        const original = artboard.layers[idx]!
        const clone = JSON.parse(JSON.stringify(original))
        // Assign new IDs recursively
        function reId(layer: Layer) {
          layer.id = uuid()
          if (layer.type === 'group') {
            for (const child of layer.children) reId(child)
          }
        }
        reId(clone)
        clone.name = `${original.name} Copy`
        artboard.layers.splice(idx + 1, 0, clone)
      })
    },

    // Path
    addPath(artboardId, layerId, path) {
      mutateDocument('Add path', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer && layer.type === 'vector') {
          layer.paths.push(path)
        }
      })
    },

    updatePath(artboardId, layerId, pathId, updates) {
      mutateDocument('Update path', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer && layer.type === 'vector') {
          const path = layer.paths.find((p) => p.id === pathId)
          if (path) Object.assign(path, updates)
        }
      })
    },

    addSegmentToPath(artboardId, layerId, pathId, segment) {
      mutateDocument('Add segment', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer && layer.type === 'vector') {
          const path = layer.paths.find((p) => p.id === pathId)
          if (path) path.segments.push(segment)
        }
      })
    },

    // Fill/stroke
    setFill(artboardId, layerId, fill) {
      mutateDocument('Set fill', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer && layer.type === 'vector') {
          layer.fill = fill
        }
      })
    },

    setStroke(artboardId, layerId, stroke) {
      mutateDocument('Set stroke', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer && layer.type === 'vector') {
          layer.stroke = stroke
        }
      })
    },

    // Effects
    addEffect(artboardId, layerId, effect) {
      mutateDocument('Add effect', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.effects.push(effect)
      })
    },

    removeEffect(artboardId, layerId, effectId) {
      mutateDocument('Remove effect', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) {
          layer.effects = layer.effects.filter((e) => e.id !== effectId)
        }
      })
    },

    updateEffect(artboardId, layerId, effectId, updates) {
      mutateDocument('Update effect', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (!layer) return
        const effect = layer.effects.find((e) => e.id === effectId)
        if (effect) Object.assign(effect, updates)
      })
    },

    // Groups
    groupLayers(artboardId, layerIds) {
      mutateDocument('Group layers', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard || layerIds.length < 2) return

        const indices = layerIds
          .map((id) => artboard.layers.findIndex((l) => l.id === id))
          .filter((i) => i !== -1)
          .sort((a, b) => a - b)

        if (indices.length < 2) return

        const children = indices.map((i) => artboard.layers[i]!)
        const group: GroupLayer = {
          id: uuid(),
          name: 'Group',
          type: 'group',
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          effects: [],
          children: [...children],
        }

        // Remove grouped layers (reverse order to keep indices stable)
        for (let i = indices.length - 1; i >= 0; i--) {
          artboard.layers.splice(indices[i]!, 1)
        }
        // Insert group at position of the first selected layer
        artboard.layers.splice(indices[0]!, 0, group)
      })
    },

    ungroupLayer(artboardId, groupId) {
      mutateDocument('Ungroup', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const idx = artboard.layers.findIndex((l) => l.id === groupId)
        if (idx === -1) return
        const group = artboard.layers[idx]!
        if (group.type !== 'group') return
        // Replace group with its children
        artboard.layers.splice(idx, 1, ...group.children)
      })
    },

    // Adjustment layers
    addAdjustmentLayer(artboardId, adjustmentType) {
      const defaults: Record<AdjustmentParams['adjustmentType'], AdjustmentParams> = {
        levels: { adjustmentType: 'levels', params: { blackPoint: 0, whitePoint: 255, gamma: 1 } },
        curves: {
          adjustmentType: 'curves',
          params: {
            points: [
              [0, 0],
              [128, 128],
              [255, 255],
            ],
          },
        },
        'hue-sat': { adjustmentType: 'hue-sat', params: { hue: 0, saturation: 0, lightness: 0 } },
        'color-balance': { adjustmentType: 'color-balance', params: { shadows: 0, midtones: 0, highlights: 0 } },
      }
      const adj = defaults[adjustmentType]!
      const layer: AdjustmentLayer = {
        id: uuid(),
        name: `${adjustmentType} adjustment`,
        type: 'adjustment',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        ...adj,
      }
      mutateDocument(`Add ${adjustmentType} adjustment`, (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (artboard) artboard.layers.push(layer)
      })
    },

    // Masks
    setLayerMask(artboardId, layerId, mask) {
      mutateDocument('Set layer mask', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) layer.mask = mask
      })
    },

    removeLayerMask(artboardId, layerId) {
      mutateDocument('Remove layer mask', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        const layer = artboard.layers.find((l) => l.id === layerId)
        if (layer) delete layer.mask
      })
    },

    // Selection
    selectLayer(layerId, multiselect = false) {
      set((state) => ({
        selection: {
          layerIds: multiselect
            ? state.selection.layerIds.includes(layerId)
              ? state.selection.layerIds.filter((id) => id !== layerId)
              : [...state.selection.layerIds, layerId]
            : [layerId],
        },
      }))
    },

    deselectAll() {
      set({ selection: { layerIds: [] } })
    },

    // Viewport
    setZoom(zoom) {
      set({ viewport: { ...get().viewport, zoom: Math.max(0.1, Math.min(10, zoom)) } })
    },

    setPan(x, y) {
      set({ viewport: { ...get().viewport, panX: x, panY: y } })
    },

    setActiveTool(tool) {
      set({ activeTool: tool })
    },

    toggleRulers() {
      set({ showRulers: !get().showRulers })
    },
    toggleGrid() {
      set({ showGrid: !get().showGrid })
    },
    toggleSnap() {
      set({ snapEnabled: !get().snapEnabled })
    },
    setGridSize(size) {
      set({ gridSize: Math.max(1, size) })
    },

    addGuide(artboardId, axis, position) {
      mutateDocument('Add guide', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard) return
        if (!artboard.guides) artboard.guides = { horizontal: [], vertical: [] }
        artboard.guides[axis].push(position)
      })
    },

    removeGuide(artboardId, axis, index) {
      mutateDocument('Remove guide', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard?.guides) return
        artboard.guides[axis].splice(index, 1)
      })
    },

    updateGuide(artboardId, axis, index, position) {
      mutateDocument('Move guide', (draft) => {
        const artboard = findArtboard(draft, artboardId)
        if (!artboard?.guides) return
        artboard.guides[axis][index] = position
      })
    },

    // Undo/redo
    undo() {
      const { history, historyIndex, document } = get()
      if (historyIndex < 0) return
      const entry = history[historyIndex]!
      const nextDoc = applyPatches(document, entry.inversePatches)
      set({
        document: nextDoc,
        historyIndex: historyIndex - 1,
        isDirty: true,
      })
    },

    redo() {
      const { history, historyIndex, document } = get()
      if (historyIndex >= history.length - 1) return
      const entry = history[historyIndex + 1]!
      const nextDoc = applyPatches(document, entry.patches)
      set({
        document: nextDoc,
        historyIndex: historyIndex + 1,
        isDirty: true,
      })
    },

    canUndo() {
      return get().historyIndex >= 0
    },

    canRedo() {
      const { history, historyIndex } = get()
      return historyIndex < history.length - 1
    },

    setDirty(dirty) {
      set({ isDirty: dirty })
    },

    async save() {
      const state = get()
      const doc = state.document

      if (isElectron()) {
        const api = window.electronAPI!
        if (state.filePath) {
          // Save to known path
          try {
            const buffer = encodeDocument(doc)
            await api.fileSave(state.filePath, buffer)
            set({ isDirty: false })
          } catch (err) {
            console.error('Failed to save:', err)
            alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        } else {
          // No path yet — fall through to saveAs
          await get().saveAs()
        }
      } else {
        // Browser: use File System Access API or download fallback
        try {
          const buffer = encodeDocument(doc)
          const suggestedName = `${doc.metadata.title || 'Untitled'}.design`
          if ('showSaveFilePicker' in window) {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName,
              types: [
                {
                  description: 'Design files',
                  accept: { 'application/octet-stream': ['.design'] },
                },
              ],
            })
            const writable = await handle.createWritable()
            await writable.write(buffer)
            await writable.close()
            set({ isDirty: false })
          } else {
            // Download fallback
            const blob = new Blob([buffer], { type: 'application/octet-stream' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = suggestedName
            a.click()
            URL.revokeObjectURL(url)
            set({ isDirty: false })
          }
        } catch (err) {
          // User cancelled the picker — not an error
          if (err instanceof Error && err.name === 'AbortError') return
          console.error('Failed to save:', err)
        }
      }
    },

    async saveAs() {
      const state = get()
      const doc = state.document

      if (isElectron()) {
        const api = window.electronAPI!
        try {
          const newPath = await api.fileSaveDialog()
          if (!newPath) return // user cancelled
          const buffer = encodeDocument(doc)
          await api.fileSave(newPath, buffer)
          set({ filePath: newPath, isDirty: false })
        } catch (err) {
          console.error('Failed to save:', err)
          alert(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }
      } else {
        // Browser: always use showSaveFilePicker / download fallback
        try {
          const buffer = encodeDocument(doc)
          const suggestedName = `${doc.metadata.title || 'Untitled'}.design`
          if ('showSaveFilePicker' in window) {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName,
              types: [
                {
                  description: 'Design files',
                  accept: { 'application/octet-stream': ['.design'] },
                },
              ],
            })
            const writable = await handle.createWritable()
            await writable.write(buffer)
            await writable.close()
            set({ isDirty: false })
          } else {
            const blob = new Blob([buffer], { type: 'application/octet-stream' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = suggestedName
            a.click()
            URL.revokeObjectURL(url)
            set({ isDirty: false })
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return
          console.error('Failed to save:', err)
        }
      }
    },

    togglePixelPreview() {
      set({ pixelPreview: !get().pixelPreview })
    },

    setActiveSnapLines(lines) {
      set({ activeSnapLines: lines })
    },

    toggleSnapToGrid() {
      set({ snapToGrid: !get().snapToGrid })
    },
    toggleSnapToGuides() {
      set({ snapToGuides: !get().snapToGuides })
    },
    toggleSnapToLayers() {
      set({ snapToLayers: !get().snapToLayers })
    },
    toggleSnapToArtboard() {
      set({ snapToArtboard: !get().snapToArtboard })
    },
    toggleSnapToPixel() {
      set({ snapToPixel: !get().snapToPixel })
    },

    openExportModal() {
      set({ showExportModal: true })
    },
    closeExportModal() {
      set({ showExportModal: false })
    },

    toggleTouchMode() {
      const next = !get().touchMode
      set({ touchMode: next })
      try {
        localStorage.setItem('crossdraw:touch-mode', String(next))
      } catch {}
      // Toggle CSS class on root element
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('touch-mode', next)
      }
    },
  }
})

export { createDefaultVectorLayer }
