import { useEditorStore } from '@/store/editor.store'
import type { EditorState } from '@/store/editor.store'
import { copyLayers, pasteLayers, cutLayers } from '@/tools/clipboard'
import { quickExport } from '@/ui/quick-export'
import {
  bringToFront,
  bringForward,
  sendBackward,
  sendToBack,
  flipHorizontal,
  flipVertical,
  nudgeSelection,
} from '@/tools/layer-ops'
import { copyStyle, pasteStyle } from '@/tools/style-clipboard'
import { getLayerBBox, mergeBBox } from '@/math/bbox'
import type { BBox } from '@/math/bbox'
import { openFile } from '@/io/open-file'
import { usePanelLayoutStore } from '@/ui/panels/panel-layout-store'

/**
 * Keyboard shortcut registry with customization support.
 *
 * Shortcuts are identified by action ID. Each shortcut maps a key combo
 * to an action function. Users can rebind shortcuts at runtime, and
 * bindings are persisted to localStorage.
 */

export interface ShortcutBinding {
  /** Unique action identifier */
  id: string
  /** Human-readable label */
  label: string
  /** Category for the preferences UI */
  category: 'tool' | 'edit' | 'view' | 'layer'
  /** Default key combo (e.g. "v", "ctrl+z", "ctrl+shift+g") */
  defaultKey: string
  /** Current key combo (may differ from default after rebinding) */
  key: string
  /** The action to execute */
  action: () => void
}

const STORAGE_KEY = 'crossdraw:shortcuts'

let bindings: ShortcutBinding[] = []
let cleanupFn: (() => void) | null = null

/**
 * Parse a key combo string into its parts.
 * e.g. "ctrl+shift+z" → { ctrl: true, shift: true, alt: false, meta: false, key: "z" }
 */
function parseCombo(combo: string) {
  const parts = combo.toLowerCase().split('+')
  return {
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta'),
    // The key is the last part that isn't a modifier
    key: parts.filter((p) => !['ctrl', 'shift', 'alt', 'meta'].includes(p)).pop() ?? '',
  }
}

/**
 * Check if a KeyboardEvent matches a key combo string.
 */
function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const parsed = parseCombo(combo)
  const modCtrl = e.ctrlKey || e.metaKey
  const needsMod = parsed.ctrl || parsed.meta

  if (needsMod !== modCtrl) return false
  if (parsed.shift !== e.shiftKey) return false
  if (parsed.alt !== e.altKey) return false

  return e.key.toLowerCase() === parsed.key
}

/**
 * Build the default shortcut bindings.
 */
function buildDefaultBindings(): ShortcutBinding[] {
  const store = () => useEditorStore.getState()

  const toolShortcut = (id: string, label: string, key: string, tool: EditorState['activeTool']): ShortcutBinding => ({
    id,
    label,
    category: 'tool',
    defaultKey: key,
    key,
    action: () => store().setActiveTool(tool),
  })

  return [
    // Tools
    toolShortcut('tool.select', 'Select Tool', 'v', 'select'),
    toolShortcut('tool.pen', 'Pen Tool', 'p', 'pen'),
    toolShortcut('tool.rectangle', 'Rectangle Tool', 'r', 'rectangle'),
    toolShortcut('tool.ellipse', 'Ellipse Tool', 'e', 'ellipse'),
    toolShortcut('tool.polygon', 'Polygon Tool', 'y', 'polygon'),
    toolShortcut('tool.star', 'Star Tool', 'shift+s', 'star'),
    toolShortcut('tool.cloneStamp', 'Clone Stamp Tool', 's', 'clone-stamp'),
    toolShortcut('tool.text', 'Text Tool', 't', 'text'),
    toolShortcut('tool.node', 'Node Tool', 'a', 'node'),
    toolShortcut('tool.eyedropper', 'Eyedropper Tool', 'i', 'eyedropper'),
    toolShortcut('tool.hand', 'Hand Tool', 'h', 'hand'),
    toolShortcut('tool.measure', 'Measure Tool', 'u', 'measure'),
    toolShortcut('tool.brush', 'Brush Tool', 'b', 'brush'),
    toolShortcut('tool.crop', 'Crop Tool', 'shift+c', 'crop'),
    toolShortcut('tool.comment', 'Comment Tool', 'c', 'comment'),
    toolShortcut('tool.line', 'Line Tool', 'l', 'line'),
    toolShortcut('tool.pencil', 'Pencil Tool', 'n', 'pencil'),
    toolShortcut('tool.eraser', 'Eraser Tool', 'x', 'eraser'),
    toolShortcut('tool.gradient', 'Gradient Tool', 'j', 'gradient'),
    toolShortcut('tool.fill', 'Fill Bucket', 'g', 'fill'),
    toolShortcut('tool.zoom', 'Zoom Tool', 'z', 'zoom'),
    toolShortcut('tool.lasso', 'Lasso Tool', 'q', 'lasso'),
    toolShortcut('tool.marquee', 'Marquee Tool', 'm', 'marquee'),
    toolShortcut('tool.knife', 'Knife Tool', 'k', 'knife'),
    toolShortcut('tool.artboard', 'Artboard Tool', 'f', 'artboard'),
    toolShortcut('tool.slice', 'Slice Tool', 'w', 'slice'),

    // File
    {
      id: 'file.open',
      label: 'Open',
      category: 'edit',
      defaultKey: 'ctrl+o',
      key: 'ctrl+o',
      action: () => {
        openFile()
      },
    },
    {
      id: 'file.save',
      label: 'Save',
      category: 'edit',
      defaultKey: 'ctrl+s',
      key: 'ctrl+s',
      action: () => {
        store().save()
      },
    },
    {
      id: 'file.saveAs',
      label: 'Save As',
      category: 'edit',
      defaultKey: 'ctrl+shift+s',
      key: 'ctrl+shift+s',
      action: () => {
        store().saveAs()
      },
    },
    {
      id: 'file.export',
      label: 'Export',
      category: 'edit',
      defaultKey: 'ctrl+e',
      key: 'ctrl+e',
      action: () => {
        store().openExportModal()
      },
    },
    {
      id: 'file.quickExport',
      label: 'Quick Export',
      category: 'edit',
      defaultKey: 'ctrl+shift+e',
      key: 'ctrl+shift+e',
      action: () => {
        quickExport()
      },
    },

    // Edit
    {
      id: 'edit.undo',
      label: 'Undo',
      category: 'edit',
      defaultKey: 'ctrl+z',
      key: 'ctrl+z',
      action: () => store().undo(),
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      category: 'edit',
      defaultKey: 'ctrl+shift+z',
      key: 'ctrl+shift+z',
      action: () => store().redo(),
    },
    {
      id: 'edit.selectAll',
      label: 'Select All',
      category: 'edit',
      defaultKey: 'ctrl+a',
      key: 'ctrl+a',
      action: () => {
        const s = store()
        const artboard = s.document.artboards[0]
        if (artboard) {
          for (const layer of artboard.layers) {
            s.selectLayer(layer.id, true)
          }
        }
      },
    },
    {
      id: 'edit.deselect',
      label: 'Deselect',
      category: 'edit',
      defaultKey: 'escape',
      key: 'escape',
      action: () => {
        const s = store()
        if (s.activeTool === 'select') s.deselectAll()
      },
    },
    {
      id: 'edit.delete',
      label: 'Delete Selection',
      category: 'edit',
      defaultKey: 'delete',
      key: 'delete',
      action: () => {
        const s = store()
        const artboard = s.document.artboards[0]
        if (artboard && s.selection.layerIds.length > 0) {
          for (const layerId of s.selection.layerIds) {
            s.deleteLayer(artboard.id, layerId)
          }
          s.deselectAll()
        }
      },
    },

    // Layer
    {
      id: 'layer.duplicate',
      label: 'Duplicate Layer',
      category: 'layer',
      defaultKey: 'ctrl+d',
      key: 'ctrl+d',
      action: () => {
        const s = store()
        const artboard = s.document.artboards[0]
        if (artboard && s.selection.layerIds.length > 0) {
          for (const layerId of s.selection.layerIds) {
            s.duplicateLayer(artboard.id, layerId)
          }
        }
      },
    },
    {
      id: 'layer.group',
      label: 'Group Layers',
      category: 'layer',
      defaultKey: 'ctrl+g',
      key: 'ctrl+g',
      action: () => {
        const s = store()
        const artboard = s.document.artboards[0]
        if (artboard && s.selection.layerIds.length >= 2) {
          s.groupLayers(artboard.id, s.selection.layerIds)
        }
      },
    },
    {
      id: 'layer.ungroup',
      label: 'Ungroup Layers',
      category: 'layer',
      defaultKey: 'ctrl+shift+g',
      key: 'ctrl+shift+g',
      action: () => {
        const s = store()
        const artboard = s.document.artboards[0]
        if (artboard && s.selection.layerIds.length === 1) {
          const layerId = s.selection.layerIds[0]!
          const layer = artboard.layers.find((l) => l.id === layerId)
          if (layer && layer.type === 'group') {
            s.ungroupLayer(artboard.id, layerId)
          }
        }
      },
    },

    // Copy/paste
    {
      id: 'edit.copy',
      label: 'Copy',
      category: 'edit',
      defaultKey: 'ctrl+c',
      key: 'ctrl+c',
      action: () => copyLayers(),
    },
    {
      id: 'edit.paste',
      label: 'Paste',
      category: 'edit',
      defaultKey: 'ctrl+v',
      key: 'ctrl+v',
      action: () => pasteLayers(),
    },
    {
      id: 'edit.cut',
      label: 'Cut',
      category: 'edit',
      defaultKey: 'ctrl+x',
      key: 'ctrl+x',
      action: () => cutLayers(),
    },

    // Style copy/paste
    {
      id: 'edit.copyStyle',
      label: 'Copy Style',
      category: 'edit',
      defaultKey: 'ctrl+alt+c',
      key: 'ctrl+alt+c',
      action: () => copyStyle(),
    },
    {
      id: 'edit.pasteStyle',
      label: 'Paste Style',
      category: 'edit',
      defaultKey: 'ctrl+alt+v',
      key: 'ctrl+alt+v',
      action: () => pasteStyle(),
    },

    // Flip
    {
      id: 'edit.flipH',
      label: 'Flip Horizontal',
      category: 'edit',
      defaultKey: 'shift+h',
      key: 'shift+h',
      action: () => flipHorizontal(),
    },
    {
      id: 'edit.flipV',
      label: 'Flip Vertical',
      category: 'edit',
      defaultKey: 'shift+v',
      key: 'shift+v',
      action: () => flipVertical(),
    },

    // Arrow nudge
    {
      id: 'edit.nudgeLeft',
      label: 'Nudge Left',
      category: 'edit',
      defaultKey: 'arrowleft',
      key: 'arrowleft',
      action: () => nudgeSelection(-1, 0),
    },
    {
      id: 'edit.nudgeRight',
      label: 'Nudge Right',
      category: 'edit',
      defaultKey: 'arrowright',
      key: 'arrowright',
      action: () => nudgeSelection(1, 0),
    },
    {
      id: 'edit.nudgeUp',
      label: 'Nudge Up',
      category: 'edit',
      defaultKey: 'arrowup',
      key: 'arrowup',
      action: () => nudgeSelection(0, -1),
    },
    {
      id: 'edit.nudgeDown',
      label: 'Nudge Down',
      category: 'edit',
      defaultKey: 'arrowdown',
      key: 'arrowdown',
      action: () => nudgeSelection(0, 1),
    },
    {
      id: 'edit.nudgeLeftBig',
      label: 'Nudge Left 10px',
      category: 'edit',
      defaultKey: 'shift+arrowleft',
      key: 'shift+arrowleft',
      action: () => nudgeSelection(-10, 0),
    },
    {
      id: 'edit.nudgeRightBig',
      label: 'Nudge Right 10px',
      category: 'edit',
      defaultKey: 'shift+arrowright',
      key: 'shift+arrowright',
      action: () => nudgeSelection(10, 0),
    },
    {
      id: 'edit.nudgeUpBig',
      label: 'Nudge Up 10px',
      category: 'edit',
      defaultKey: 'shift+arrowup',
      key: 'shift+arrowup',
      action: () => nudgeSelection(0, -10),
    },
    {
      id: 'edit.nudgeDownBig',
      label: 'Nudge Down 10px',
      category: 'edit',
      defaultKey: 'shift+arrowdown',
      key: 'shift+arrowdown',
      action: () => nudgeSelection(0, 10),
    },

    // Layer ordering
    {
      id: 'layer.bringToFront',
      label: 'Bring to Front',
      category: 'layer',
      defaultKey: 'ctrl+shift+]',
      key: 'ctrl+shift+]',
      action: () => bringToFront(),
    },
    {
      id: 'layer.bringForward',
      label: 'Bring Forward',
      category: 'layer',
      defaultKey: 'ctrl+]',
      key: 'ctrl+]',
      action: () => bringForward(),
    },
    {
      id: 'layer.sendBackward',
      label: 'Send Backward',
      category: 'layer',
      defaultKey: 'ctrl+[',
      key: 'ctrl+[',
      action: () => sendBackward(),
    },
    {
      id: 'layer.sendToBack',
      label: 'Send to Back',
      category: 'layer',
      defaultKey: 'ctrl+shift+[',
      key: 'ctrl+shift+[',
      action: () => sendToBack(),
    },

    // View
    {
      id: 'view.zoomIn',
      label: 'Zoom In',
      category: 'view',
      defaultKey: 'ctrl+=',
      key: 'ctrl+=',
      action: () => {
        const s = store()
        s.setZoom(s.viewport.zoom * 1.25)
      },
    },
    {
      id: 'view.zoomOut',
      label: 'Zoom Out',
      category: 'view',
      defaultKey: 'ctrl+-',
      key: 'ctrl+-',
      action: () => {
        const s = store()
        s.setZoom(s.viewport.zoom / 1.25)
      },
    },
    {
      id: 'view.zoomFit',
      label: 'Zoom to Fit',
      category: 'view',
      defaultKey: 'ctrl+0',
      key: 'ctrl+0',
      action: () => {
        store().setZoom(1)
        store().setPan(0, 0)
      },
    },
    {
      id: 'view.zoomToSelection',
      label: 'Zoom to Selection',
      category: 'view',
      defaultKey: 'ctrl+shift+0',
      key: 'ctrl+shift+0',
      action: () => {
        const s = store()
        if (s.selection.layerIds.length === 0) return
        let bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        for (const artboard of s.document.artboards) {
          for (const layer of artboard.layers) {
            if (!s.selection.layerIds.includes(layer.id)) continue
            const lb = getLayerBBox(layer, artboard)
            if (lb.minX === Infinity) continue
            bbox = mergeBBox(bbox, lb)
          }
        }
        if (bbox.minX === Infinity) return
        const padding = 60
        const bw = bbox.maxX - bbox.minX
        const bh = bbox.maxY - bbox.minY
        const vw = window.innerWidth - 300 // approximate viewport width minus panels
        const vh = window.innerHeight - 40
        const zoom = Math.min((vw - padding * 2) / bw, (vh - padding * 2) / bh, 10)
        const cx = bbox.minX + bw / 2
        const cy = bbox.minY + bh / 2
        s.setZoom(zoom)
        s.setPan(vw / 2 - cx * zoom, vh / 2 - cy * zoom)
      },
    },
    {
      id: 'view.toggleGrid',
      label: 'Toggle Grid',
      category: 'view',
      defaultKey: "ctrl+'",
      key: "ctrl+'",
      action: () => store().toggleGrid(),
    },
    {
      id: 'view.toggleSnap',
      label: 'Toggle Snap',
      category: 'view',
      defaultKey: 'ctrl+;',
      key: 'ctrl+;',
      action: () => store().toggleSnap(),
    },
    {
      id: 'view.toggleRulers',
      label: 'Toggle Rulers',
      category: 'view',
      defaultKey: 'ctrl+r',
      key: 'ctrl+r',
      action: () => store().toggleRulers(),
    },
    {
      id: 'view.pixelPreview',
      label: 'Pixel Preview',
      category: 'view',
      defaultKey: 'ctrl+alt+y',
      key: 'ctrl+alt+y',
      action: () => store().togglePixelPreview(),
    },

    // Find & Replace
    {
      id: 'edit.findReplace',
      label: 'Find & Replace',
      category: 'edit',
      defaultKey: 'ctrl+f',
      key: 'ctrl+f',
      action: () => {
        usePanelLayoutStore.getState().focusTab('find-replace')
      },
    },
  ]
}

/**
 * Load custom bindings from localStorage and apply them.
 */
function loadCustomBindings(defaults: ShortcutBinding[]): ShortcutBinding[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaults

    const overrides: Record<string, string> = JSON.parse(stored)
    return defaults.map((b) => ({
      ...b,
      key: overrides[b.id] ?? b.key,
    }))
  } catch {
    return defaults
  }
}

/**
 * Save current custom bindings to localStorage.
 */
function saveCustomBindings() {
  const overrides: Record<string, string> = {}
  for (const b of bindings) {
    if (b.key !== b.defaultKey) {
      overrides[b.id] = b.key
    }
  }
  if (Object.keys(overrides).length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

/**
 * Initialize the shortcut registry and attach the global keydown listener.
 */
export function initShortcuts() {
  const defaults = buildDefaultBindings()
  bindings = loadCustomBindings(defaults)

  // Clean up previous listener if re-initializing
  if (cleanupFn) cleanupFn()

  const handler = (e: KeyboardEvent) => {
    // Don't intercept when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return

    for (const binding of bindings) {
      if (matchesCombo(e, binding.key)) {
        e.preventDefault()
        binding.action()
        return
      }
    }
  }

  window.addEventListener('keydown', handler)
  cleanupFn = () => window.removeEventListener('keydown', handler)
}

/**
 * Get all current bindings (for the preferences UI).
 */
export function getBindings(): ShortcutBinding[] {
  return bindings
}

/**
 * Rebind a shortcut action to a new key combo.
 */
export function rebindShortcut(actionId: string, newKey: string) {
  const binding = bindings.find((b) => b.id === actionId)
  if (binding) {
    binding.key = newKey.toLowerCase()
    saveCustomBindings()
  }
}

/**
 * Reset a single shortcut to its default.
 */
export function resetShortcut(actionId: string) {
  const binding = bindings.find((b) => b.id === actionId)
  if (binding) {
    binding.key = binding.defaultKey
    saveCustomBindings()
  }
}

/**
 * Reset all shortcuts to defaults.
 */
export function resetAllShortcuts() {
  for (const b of bindings) {
    b.key = b.defaultKey
  }
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Convert a KeyboardEvent to a key combo string for the rebinding UI.
 */
export function eventToCombo(e: KeyboardEvent): string | null {
  // Ignore modifier-only presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')
  parts.push(e.key.toLowerCase())
  return parts.join('+')
}
