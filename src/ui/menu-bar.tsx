import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { getWorkspacePresets, saveWorkspacePreset, loadWorkspacePreset, resetWorkspace } from '@/ui/workspace-presets'
import { isElectron, electronOpen } from '@/io/electron-bridge'
import { openFile } from '@/io/open-file'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { batchExportSlices, downloadBatchExport } from '@/io/batch-export'
import {
  extractDesignTokens,
  exportTokensAsJSON,
  exportTokensAsCSS,
  exportTokensAsSCSS,
  exportTokensAsTailwind,
  downloadTokenFile,
} from '@/io/design-tokens'
import { importImageFromPicker } from '@/tools/import-image'
import { importPSD } from '@/io/psd-import'
import { importSketch } from '@/io/sketch-import'
import { tryImportFigmaClipboard } from '@/io/figma-import'
import { copyLayers, pasteLayers, cutLayers } from '@/tools/clipboard'
import { copyStyle, pasteStyle } from '@/tools/style-clipboard'
import { bringToFront, bringForward, sendBackward, sendToBack, flipHorizontal, flipVertical } from '@/tools/layer-ops'
import { performBooleanOp } from '@/tools/boolean-ops'
import { traceSelectedRasterLayer } from '@/tools/image-trace'
import { applyDistortFilter } from '@/filters/apply-distort'
import { applyProgressiveBlurFilter } from '@/filters/apply-progressive-blur'
import { getLayerBBox, mergeBBox } from '@/math/bbox'
import type { BBox } from '@/math/bbox'
import { toggleAnimation, isAnimationPlaying } from '@/animation/animator'
import { exportLottie, downloadLottie } from '@/io/lottie-export'

// ── Menu data types ──

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  disabled?: boolean | (() => boolean)
  divider?: boolean
  submenu?: MenuItem[]
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

// ── Helper: resolve disabled ──

function isDisabled(item: MenuItem): boolean {
  if (typeof item.disabled === 'function') return item.disabled()
  return !!item.disabled
}

// ── Build menu definitions ──

function buildMenus(): MenuDef[] {
  const store = () => useEditorStore.getState()

  const fileMenu: MenuDef = {
    label: 'File',
    items: [
      {
        label: 'New Document\u2026',
        shortcut: '',
        action: () => window.dispatchEvent(new Event('crossdraw:new-document')),
      },
      {
        label: 'Open\u2026',
        shortcut: 'Ctrl+O',
        action: () => (isElectron() ? electronOpen() : openFile()),
      },
      { label: '', divider: true },
      {
        label: 'Save',
        shortcut: 'Ctrl+S',
        action: () => store().save(),
      },
      {
        label: 'Save As\u2026',
        shortcut: 'Ctrl+Shift+S',
        action: () => store().saveAs(),
      },
      { label: '', divider: true },
      {
        label: 'Import Image\u2026',
        shortcut: '',
        action: () => importImageFromPicker(),
      },
      {
        label: 'Import PSD\u2026',
        shortcut: '',
        action: async () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.psd'
          input.multiple = false
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
              const buffer = await file.arrayBuffer()
              const doc = await importPSD(buffer)
              const title = file.name.replace(/\.[^.]+$/, '') || 'PSD Import'
              doc.metadata.title = title
              useEditorStore.setState({
                document: doc,
                history: [],
                historyIndex: -1,
                selection: { layerIds: [] },
                isDirty: false,
                filePath: null,
              })
            } catch (err) {
              console.error('PSD import failed:', err)
              alert(`PSD import failed: ${err instanceof Error ? err.message : err}`)
            }
          }
          input.click()
        },
      },
      {
        label: 'Import Sketch File\u2026',
        shortcut: '',
        action: async () => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.sketch'
          input.multiple = false
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
              const buffer = await file.arrayBuffer()
              const doc = await importSketch(buffer)
              const title = file.name.replace(/\.[^.]+$/, '') || 'Sketch Import'
              doc.metadata.title = title
              useEditorStore.setState({
                document: doc,
                history: [],
                historyIndex: -1,
                selection: { layerIds: [] },
                isDirty: false,
                filePath: null,
              })
            } catch (err) {
              console.error('Sketch import failed:', err)
              alert(`Sketch import failed: ${err instanceof Error ? err.message : err}`)
            }
          }
          input.click()
        },
      },
      {
        label: 'Paste from Figma',
        shortcut: '',
        action: async () => {
          try {
            const text = await navigator.clipboard.readText()
            const doc = tryImportFigmaClipboard(text)
            if (!doc) {
              alert('No valid Figma data found in clipboard. Copy layers in Figma first, then try again.')
              return
            }
            doc.metadata.title = 'Figma Import'
            useEditorStore.setState({
              document: doc,
              history: [],
              historyIndex: -1,
              selection: { layerIds: [] },
              isDirty: false,
              filePath: null,
            })
          } catch (err) {
            console.error('Figma paste failed:', err)
            alert(`Figma paste failed: ${err instanceof Error ? err.message : err}`)
          }
        },
      },
      { label: '', divider: true },
      {
        label: 'Export SVG',
        action: () => {
          const doc = store().document
          const svg = exportArtboardToSVG(doc)
          downloadSVG(svg, `${doc.metadata.title || 'Untitled'}.svg`)
        },
      },
      {
        label: 'Export PNG',
        action: async () => {
          const doc = store().document
          const blob = await exportArtboardToBlob(doc, { format: 'png', scale: 2 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.png`)
        },
      },
      {
        label: 'Export JPEG',
        action: async () => {
          const doc = store().document
          const blob = await exportArtboardToBlob(doc, { format: 'jpeg', quality: 0.9 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.jpg`)
        },
      },
      {
        label: 'Export WebP',
        action: async () => {
          const doc = store().document
          const blob = await exportArtboardToBlob(doc, { format: 'webp', quality: 0.9 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.webp`)
        },
      },
      {
        label: 'Export GIF',
        action: async () => {
          const doc = store().document
          const blob = await exportArtboardToBlob(doc, { format: 'gif' })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.gif`)
        },
      },
      {
        label: 'Export TIFF',
        action: async () => {
          const doc = store().document
          const blob = await exportArtboardToBlob(doc, { format: 'tiff', scale: 1 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.tiff`)
        },
      },
      { label: '', divider: true },
      {
        label: 'Batch Export\u2026',
        action: async () => {
          try {
            const doc = store().document
            const results = await batchExportSlices(doc)
            await downloadBatchExport(results)
          } catch (err) {
            console.warn('Batch export:', err instanceof Error ? err.message : err)
          }
        },
      },
      { label: '', divider: true },
      {
        label: 'Export Design Tokens',
        submenu: [
          {
            label: 'JSON (W3C)',
            action: () => {
              const doc = store().document
              const tokens = extractDesignTokens(doc)
              const json = exportTokensAsJSON(tokens)
              const name = doc.metadata.title || 'Untitled'
              downloadTokenFile(json, `${name}.tokens.json`, 'application/json')
            },
          },
          {
            label: 'CSS Variables',
            action: () => {
              const doc = store().document
              const tokens = extractDesignTokens(doc)
              const css = exportTokensAsCSS(tokens)
              const name = doc.metadata.title || 'Untitled'
              downloadTokenFile(css, `${name}.tokens.css`, 'text/css')
            },
          },
          {
            label: 'SCSS Variables',
            action: () => {
              const doc = store().document
              const tokens = extractDesignTokens(doc)
              const scss = exportTokensAsSCSS(tokens)
              const name = doc.metadata.title || 'Untitled'
              downloadTokenFile(scss, `${name}.tokens.scss`, 'text/x-scss')
            },
          },
          {
            label: 'Tailwind Config',
            action: () => {
              const doc = store().document
              const tokens = extractDesignTokens(doc)
              const tw = exportTokensAsTailwind(tokens)
              const name = doc.metadata.title || 'Untitled'
              downloadTokenFile(tw, `${name}.tailwind.config.js`, 'application/javascript')
            },
          },
        ],
      },
      { label: '', divider: true },
      {
        label: 'Print / Print-Ready Export\u2026',
        shortcut: 'Ctrl+Shift+P',
        action: () => {
          window.dispatchEvent(new Event('crossdraw:show-print-dialog'))
        },
      },
      { label: '', divider: true },
      {
        label: 'Save Version\u2026',
        action: () => {
          const name = prompt('Version name:')
          if (name && name.trim()) {
            store().createVersionSnapshot(name.trim())
          }
        },
      },
      {
        label: 'Version History',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('versions')
          })
        },
      },
    ],
  }

  const editMenu: MenuDef = {
    label: 'Edit',
    items: [
      {
        label: 'Undo',
        shortcut: 'Ctrl+Z',
        action: () => store().undo(),
        disabled: () => !store().canUndo(),
      },
      {
        label: 'Redo',
        shortcut: 'Ctrl+Shift+Z',
        action: () => store().redo(),
        disabled: () => !store().canRedo(),
      },
      { label: '', divider: true },
      {
        label: 'Cut',
        shortcut: 'Ctrl+X',
        action: () => cutLayers(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Copy',
        shortcut: 'Ctrl+C',
        action: () => copyLayers(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Paste',
        shortcut: 'Ctrl+V',
        action: () => pasteLayers(),
      },
      { label: '', divider: true },
      {
        label: 'Duplicate',
        shortcut: 'Ctrl+D',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (artboard) {
            for (const layerId of s.selection.layerIds) {
              s.duplicateLayer(artboard.id, layerId)
            }
          }
        },
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Delete',
        shortcut: 'Delete',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (artboard) {
            for (const layerId of s.selection.layerIds) {
              s.deleteLayer(artboard.id, layerId)
            }
            s.deselectAll()
          }
        },
        disabled: () => store().selection.layerIds.length === 0,
      },
      { label: '', divider: true },
      {
        label: 'Select All',
        shortcut: 'Ctrl+A',
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
        label: 'Deselect',
        shortcut: 'Escape',
        action: () => store().deselectAll(),
      },
      { label: '', divider: true },
      {
        label: 'Copy Style',
        shortcut: 'Ctrl+Alt+C',
        action: () => copyStyle(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Paste Style',
        shortcut: 'Ctrl+Alt+V',
        action: () => pasteStyle(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      { label: '', divider: true },
      {
        label: 'Find & Replace\u2026',
        shortcut: 'Ctrl+F',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('find-replace')
          })
        },
      },
      { label: '', divider: true },
      {
        label: 'UI Settings\u2026',
        action: () => {
          window.dispatchEvent(new CustomEvent('crossdraw:show-settings'))
        },
      },
    ],
  }

  const viewMenu: MenuDef = {
    label: 'View',
    items: [
      {
        label: 'Zoom In',
        shortcut: 'Ctrl+=',
        action: () => {
          const s = store()
          s.setZoom(s.viewport.zoom * 1.25)
        },
      },
      {
        label: 'Zoom Out',
        shortcut: 'Ctrl+-',
        action: () => {
          const s = store()
          s.setZoom(s.viewport.zoom / 1.25)
        },
      },
      {
        label: 'Zoom to Fit',
        shortcut: 'Ctrl+0',
        action: () => {
          store().setZoom(1)
          store().setPan(0, 0)
        },
      },
      {
        label: 'Zoom to Selection',
        shortcut: 'Ctrl+Shift+0',
        action: () => {
          // Trigger the shortcut action via the registry
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
          const vw = window.innerWidth - 300
          const vh = window.innerHeight - 40
          const zoom = Math.min((vw - padding * 2) / bw, (vh - padding * 2) / bh, 10)
          const cx = bbox.minX + bw / 2
          const cy = bbox.minY + bh / 2
          s.setZoom(zoom)
          s.setPan(vw / 2 - cx * zoom, vh / 2 - cy * zoom)
        },
        disabled: () => store().selection.layerIds.length === 0,
      },
      { label: '', divider: true },
      {
        label: 'Toggle Rulers',
        shortcut: 'Ctrl+R',
        action: () => store().toggleRulers(),
      },
      {
        label: 'Toggle Grid',
        shortcut: "Ctrl+'",
        action: () => store().toggleGrid(),
      },
      {
        label: 'Toggle Snap',
        shortcut: 'Ctrl+;',
        action: () => store().toggleSnap(),
      },
      {
        label: 'Pixel Preview',
        shortcut: 'Ctrl+Alt+Y',
        action: () => store().togglePixelPreview(),
      },
      { label: '', divider: true },
      {
        label: 'Accessibility Checker',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('accessibility')
          })
        },
      },
      { label: '', divider: true },
      {
        label: isAnimationPlaying() ? 'Stop Animation' : 'Play Animation',
        shortcut: 'Ctrl+Shift+Space',
        action: () => toggleAnimation(),
      },
      {
        label: 'Animation Timeline',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('animation')
          })
        },
      },
      {
        label: 'Export Lottie\u2026',
        action: () => {
          const doc = store().document
          try {
            const lottie = exportLottie(doc, 0)
            downloadLottie(lottie, `${doc.metadata.title || 'Untitled'}-animation.json`)
          } catch (err) {
            console.warn('Lottie export:', err instanceof Error ? err.message : err)
          }
        },
      },
      { label: '', divider: true },
      {
        label: 'Preview Prototype',
        shortcut: 'Ctrl+P',
        action: () => store().openPrototypePlayer(),
      },
      {
        label: store().prototypeMode ? 'Hide Prototype Wiring' : 'Show Prototype Wiring',
        action: () => store().togglePrototypeMode(),
      },
      {
        label: 'Interactions Panel',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('interactions')
          })
        },
      },
    ],
  }

  const layerMenu: MenuDef = {
    label: 'Layer',
    items: [
      {
        label: 'Group',
        shortcut: 'Ctrl+G',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (artboard && s.selection.layerIds.length >= 2) {
            s.groupLayers(artboard.id, s.selection.layerIds)
          }
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Ungroup',
        shortcut: 'Ctrl+Shift+G',
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
        disabled: () => {
          const s = store()
          if (s.selection.layerIds.length !== 1) return true
          const artboard = s.document.artboards[0]
          if (!artboard) return true
          const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
          return !layer || layer.type !== 'group'
        },
      },
      { label: '', divider: true },
      {
        label: 'Bring to Front',
        shortcut: 'Ctrl+Shift+]',
        action: () => bringToFront(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Bring Forward',
        shortcut: 'Ctrl+]',
        action: () => bringForward(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Send Backward',
        shortcut: 'Ctrl+[',
        action: () => sendBackward(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Send to Back',
        shortcut: 'Ctrl+Shift+[',
        action: () => sendToBack(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      { label: '', divider: true },
      {
        label: 'Flip Horizontal',
        shortcut: 'Shift+H',
        action: () => flipHorizontal(),
        disabled: () => store().selection.layerIds.length === 0,
      },
      {
        label: 'Flip Vertical',
        shortcut: 'Shift+V',
        action: () => flipVertical(),
        disabled: () => store().selection.layerIds.length === 0,
      },
    ],
  }

  const typeMenu: MenuDef = {
    label: 'Type',
    items: [
      { label: 'Bold', shortcut: 'Ctrl+B', disabled: true },
      { label: 'Italic', shortcut: 'Ctrl+I', disabled: true },
      { label: 'Underline', shortcut: 'Ctrl+U', disabled: true },
      { label: '', divider: true },
      { label: 'Align Left', disabled: true },
      { label: 'Align Center', disabled: true },
      { label: 'Align Right', disabled: true },
    ],
  }

  /** Check whether the first selected layer is a raster layer. */
  const hasSelectedRaster = (): boolean => {
    const s = store()
    if (s.selection.layerIds.length === 0) return false
    const artboard = s.document.artboards[0]
    if (!artboard) return false
    const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
    return !!layer && layer.type === 'raster'
  }

  const filterMenu: MenuDef = {
    label: 'Filter',
    items: [
      { label: 'Gaussian Blur\u2026', disabled: true },
      { label: 'Drop Shadow\u2026', disabled: true },
      { label: 'Inner Shadow\u2026', disabled: true },
      { label: 'Outer Glow\u2026', disabled: true },
      { label: '', divider: true },
      { label: 'Background Blur\u2026', disabled: true },
      {
        label: 'Progressive Blur\u2026',
        action: () => applyProgressiveBlurFilter(),
        disabled: () => !hasSelectedRaster(),
      },
      { label: '', divider: true },
      {
        label: 'Noise',
        submenu: [
          {
            label: 'Add Gaussian Noise\u2026',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              s.applyFilter(artboard.id, layerId, 'gaussian-noise', {
                amount: 25,
                monochrome: false,
                seed: Date.now(),
              })
            },
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Add Uniform Noise\u2026',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              s.applyFilter(artboard.id, layerId, 'uniform-noise', {
                amount: 25,
                monochrome: false,
                seed: Date.now(),
              })
            },
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Add Film Grain\u2026',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              s.applyFilter(artboard.id, layerId, 'film-grain', {
                amount: 25,
                size: 3,
                seed: Date.now(),
              })
            },
            disabled: () => !hasSelectedRaster(),
          },
          { label: '', divider: true },
          {
            label: 'Apply Noise Fill',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              const layer = artboard.layers.find((l) => l.id === layerId)
              if (!layer || layer.type !== 'vector') return
              s.setFill(artboard.id, layerId, {
                type: 'noise',
                noise: {
                  noiseType: 'simplex',
                  scale: 50,
                  octaves: 4,
                  persistence: 0.5,
                  seed: Math.floor(Math.random() * 100000),
                  color1: '#000000',
                  color2: '#ffffff',
                },
                opacity: 1,
              })
            },
            disabled: () => {
              const s = store()
              if (s.selection.layerIds.length === 0) return true
              const artboard = s.document.artboards[0]
              if (!artboard) return true
              const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
              return !layer || layer.type !== 'vector'
            },
          },
        ],
      },
      {
        label: 'Distort',
        submenu: [
          {
            label: 'Wave\u2026',
            action: () => applyDistortFilter('wave'),
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Twirl\u2026',
            action: () => applyDistortFilter('twirl'),
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Pinch/Bulge\u2026',
            action: () => applyDistortFilter('pinch'),
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Spherize\u2026',
            action: () => applyDistortFilter('spherize'),
            disabled: () => !hasSelectedRaster(),
          },
        ],
      },
    ],
  }

  const pathMenu: MenuDef = {
    label: 'Path',
    items: [
      {
        label: 'Union',
        shortcut: 'Ctrl+Shift+U',
        action: () => performBooleanOp('union'),
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Subtract',
        action: () => performBooleanOp('subtract'),
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Intersect',
        action: () => performBooleanOp('intersect'),
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Exclude',
        action: () => performBooleanOp('xor'),
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Divide',
        action: () => performBooleanOp('divide'),
        disabled: () => store().selection.layerIds.length < 2,
      },
      { label: '', divider: true },
      {
        label: 'Trace Image\u2026',
        action: () => traceSelectedRasterLayer(),
        disabled: () => !hasSelectedRaster(),
      },
    ],
  }

  const windowMenu: MenuDef = {
    label: 'Window',
    items: [
      {
        label: 'Workspace',
        submenu: getWorkspacePresets().map((preset) => ({
          label: preset.name + (preset.builtIn ? '' : ' (custom)'),
          action: () => loadWorkspacePreset(preset.id),
        })),
      },
      {
        label: 'Save Workspace\u2026',
        action: () => {
          const name = prompt('Workspace name:')
          if (name && name.trim()) {
            saveWorkspacePreset(name.trim())
          }
        },
      },
      {
        label: 'Reset Workspace',
        action: () => resetWorkspace(),
      },
      { label: '', divider: true },
      {
        label: 'Layers Panel',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('layers')
          })
        },
      },
      {
        label: 'Properties Panel',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('properties')
          })
        },
      },
      {
        label: 'Color Palette',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('color-palette')
          })
        },
      },
      {
        label: 'History',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('history')
          })
        },
      },
      {
        label: 'Symbols',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('symbols')
          })
        },
      },
      {
        label: 'Align & Distribute',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('align')
          })
        },
      },
      { label: '', divider: true },
      {
        label: 'Variables',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('variables')
          })
        },
      },
    ],
  }

  const helpMenu: MenuDef = {
    label: 'Help',
    items: [
      {
        label: 'Preferences\u2026',
        action: () => {
          window.dispatchEvent(new CustomEvent('crossdraw:show-preferences'))
        },
      },
      {
        label: 'Keyboard Shortcuts',
        action: () => {
          // Dispatch a custom event that the shortcut preferences UI can listen for
          window.dispatchEvent(new CustomEvent('crossdraw:show-shortcuts'))
        },
      },
      { label: '', divider: true },
      {
        label: 'About Crossdraw',
        action: () => {
          alert('Crossdraw — A professional vector & raster design editor.')
        },
      },
    ],
  }

  const collabMenu: MenuDef = {
    label: 'Collaborate',
    items: [
      {
        label: 'Start Collaboration Session\u2026',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('collaboration')
          })
        },
      },
      {
        label: 'Join Session\u2026',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('collaboration')
          })
        },
      },
      { label: '', divider: true },
      {
        label: 'Leave Session',
        action: () => store().leaveCollabSession(),
        disabled: () => store().collabProvider === null,
      },
      { label: '', divider: true },
      {
        label: 'Collaboration Panel',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('collaboration')
          })
        },
      },
    ],
  }

  const aiMenu: MenuDef = {
    label: 'AI',
    items: [
      {
        label: 'AI Assistant',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('ai-assistant')
          })
        },
      },
      { label: '', divider: true },
      {
        label: 'Generate Layout\u2026',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('ai-assistant')
          })
        },
      },
      {
        label: 'Critique Design',
        action: () => {
          import('@/ui/panels/panel-layout-store').then(({ usePanelLayoutStore }) => {
            usePanelLayoutStore.getState().focusTab('ai-assistant')
          })
        },
      },
    ],
  }

  return [fileMenu, editMenu, viewMenu, layerMenu, pathMenu, typeMenu, filterMenu, aiMenu, collabMenu, windowMenu, helpMenu]
}

// ── Component ──

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const menus = useRef(buildMenus()).current

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openMenu])

  // Close on click outside
  useEffect(() => {
    if (!openMenu) return
    const handler = (e: PointerEvent | MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => {
      window.addEventListener('pointerdown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', handler)
    }
  }, [openMenu])

  const handleMenuClick = useCallback((label: string) => {
    setOpenMenu((prev) => (prev === label ? null : label))
  }, [])

  const handleMenuHover = useCallback((label: string) => {
    setOpenMenu((prev) => (prev !== null ? label : prev))
  }, [])

  const handleItemClick = useCallback((item: MenuItem) => {
    if (isDisabled(item) || !item.action) return
    setOpenMenu(null)
    item.action()
  }, [])

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Main menu"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 28,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--font-size-base)',
        userSelect: 'none',
        position: 'relative',
        zIndex: 1000,
        flexShrink: 0,
      }}
    >
      {menus.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          {/* Menu trigger button */}
          <div
            role="menuitem"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={openMenu === menu.label}
            onPointerDown={() => handleMenuClick(menu.label)}
            onMouseEnter={() => handleMenuHover(menu.label)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
                e.preventDefault()
                handleMenuClick(menu.label)
              }
            }}
            style={{
              padding: '0 10px',
              height: 28,
              display: 'flex',
              alignItems: 'center',
              cursor: 'default',
              background: openMenu === menu.label ? 'var(--bg-active)' : 'transparent',
              color: openMenu === menu.label ? '#fff' : 'var(--text-primary)',
              borderRadius: 0,
            }}
            onMouseOver={(e) => {
              if (openMenu !== menu.label) {
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
              }
            }}
            onMouseOut={(e) => {
              if (openMenu !== menu.label) {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }
            }}
          >
            {menu.label}
          </div>

          {/* Dropdown */}
          {openMenu === menu.label && <MenuDropdown items={menu.items} onItemClick={handleItemClick} />}
        </div>
      ))}
      {/* Right-aligned download link */}
      <div style={{ marginLeft: 'auto' }}>
        <a
          href="#/download"
          style={{
            padding: '0 12px',
            height: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: 'var(--font-size-base)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <svg
            width="10"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Get the apps
        </a>
      </div>
    </div>
  )
}

// ── Dropdown component ──

function MenuDropdown({ items, onItemClick }: { items: MenuItem[]; onItemClick: (item: MenuItem) => void }) {
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 28,
        left: 0,
        minWidth: 220,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
        padding: 'var(--space-1) 0',
        zIndex: 1001,
      }}
    >
      {items.map((item, i) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${i}`}
              style={{
                height: 1,
                background: 'var(--border-subtle)',
                margin: 'var(--space-1) var(--space-2)',
              }}
            />
          )
        }

        const disabled = isDisabled(item)

        return <MenuItemRow key={item.label} item={item} disabled={disabled} onClick={() => onItemClick(item)} />
      })}
    </div>
  )
}

// ── Single menu item row ──

function MenuItemRow({ item, disabled, onClick }: { item: MenuItem; disabled: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hasSubmenu = !!item.submenu && item.submenu.length > 0

  return (
    <div
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      aria-haspopup={hasSubmenu ? 'true' : undefined}
      onPointerDown={(e) => {
        e.preventDefault()
        if (!disabled && !hasSubmenu) onClick()
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled && !hasSubmenu) {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '5px 16px',
        cursor: disabled ? 'default' : 'pointer',
        background: hovered && !disabled ? 'var(--bg-hover)' : 'transparent',
        color: disabled ? 'var(--text-disabled)' : hovered ? 'var(--text-primary)' : 'var(--text-primary)',
        fontSize: 'var(--font-size-base)',
        whiteSpace: 'nowrap',
        position: hasSubmenu ? 'relative' : undefined,
      }}
    >
      <span>{item.label}</span>
      {item.shortcut && (
        <span
          style={{
            marginLeft: 32,
            color: disabled ? 'var(--text-disabled)' : 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {item.shortcut}
        </span>
      )}
      {hasSubmenu && (
        <span
          style={{
            marginLeft: 32,
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          &#9656;
        </span>
      )}
      {/* Submenu flyout */}
      {hasSubmenu && hovered && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 0,
            left: '100%',
            minWidth: 180,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
            padding: 'var(--space-1) 0',
            zIndex: 1002,
          }}
        >
          {item.submenu!.map((sub) => {
            const subDisabled = isDisabled(sub)
            return (
              <MenuItemRow
                key={sub.label}
                item={sub}
                disabled={subDisabled}
                onClick={() => {
                  if (!subDisabled && sub.action) {
                    onClick() // closes the top-level menu
                    sub.action()
                  }
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
