import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { getWorkspacePresets, saveWorkspacePreset, loadWorkspacePreset, resetWorkspace } from '@/ui/workspace-presets'
import { isElectron, electronOpen } from '@/io/electron-bridge'
import { openFile, openFileAsDocument } from '@/io/open-file'
import { copyLayers, pasteLayers, cutLayers } from '@/tools/clipboard'
import { copyStyle, pasteStyle } from '@/tools/style-clipboard'
import { bringToFront, bringForward, sendBackward, sendToBack, flipHorizontal, flipVertical } from '@/tools/layer-ops'
import { getLayerBBox, mergeBBox } from '@/math/bbox'
import type { BBox } from '@/math/bbox'
import { toggleAnimation, isAnimationPlaying } from '@/animation/animator'
import type { RenameLayerInfo } from '@/ai/prompt-templates'

import { UserProfile } from '@/ui/user-profile'
import { usePanelLayoutStore } from '@/ui/panels/panel-layout-store'
import { isAIEnabled } from '@/ui/panels/panel-registry'
import type { TextLayer } from '@/types'
import { addToast } from '@/ui/toast'
import { getRecentFiles, clearRecentFiles } from '@/io/recent-files'
import { decodeDocument } from '@/io/file-format'
import { resetOnboarding } from '@/ui/onboarding'

// ── Lazy imports — loaded on-demand when menu items are clicked ──

const lazyImport = {
  svgExport: () => import('@/io/svg-export'),
  rasterExport: () => import('@/io/raster-export'),
  batchExport: () => import('@/io/batch-export'),
  designTokens: () => import('@/io/design-tokens'),
  importImage: () => import('@/tools/import-image'),
  psdImport: () => import('@/io/psd-import'),
  sketchImport: () => import('@/io/sketch-import'),
  figmaImport: () => import('@/io/figma-import'),
  booleanOps: () => import('@/tools/boolean-ops'),
  imageTrace: () => import('@/tools/image-trace'),
  applyDistort: () => import('@/filters/apply-distort'),
  applyProgressiveBlur: () => import('@/filters/apply-progressive-blur'),
  applyFilters: () => import('@/filters/apply-filters'),
  applyBgRemoval: () => import('@/filters/apply-background-removal'),
  lottieExport: () => import('@/io/lottie-export'),
  repeater: () => import('@/tools/repeater'),
  pathOps: () => import('@/tools/path-ops'),
  aiService: () => import('@/ai/ai-service'),
  selectionFilters: () => import('@/tools/selection-filters'),
  compoundPaths: () => import('@/tools/compound-paths'),
  clippingMask: () => import('@/tools/clipping-mask'),
  frequencySeparation: () => import('@/tools/frequency-separation'),
  symbolSprayer: () => import('@/tools/symbol-sprayer'),
  blendTool: () => import('@/tools/blend-tool'),
  vectorBrushes: () => import('@/tools/vector-brushes'),
  selectSky: () => import('@/tools/select-sky'),
  focusArea: () => import('@/tools/focus-area'),
}

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

// ── Helpers ──

/**
 * Collect layer metadata for AI bulk rename. Recursively collects from groups.
 */
function collectLayerInfos(layers: import('@/types').Layer[]): RenameLayerInfo[] {
  const result: RenameLayerInfo[] = []
  for (const layer of layers) {
    let details = ''
    if (layer.type === 'text') {
      details = `text="${layer.text}", font=${layer.fontFamily} ${layer.fontSize}px, color=${layer.color}`
    } else if (layer.type === 'vector') {
      const fillColor = layer.fill?.color ?? 'none'
      const strokeColor = layer.stroke?.color ?? 'none'
      details = `fill=${fillColor}, stroke=${strokeColor}, pos=(${layer.transform.x}, ${layer.transform.y})`
    } else if (layer.type === 'group') {
      details = `${layer.children.length} children`
    } else if (layer.type === 'raster') {
      details = `${layer.width}x${layer.height}`
    } else {
      details = `pos=(${layer.transform.x}, ${layer.transform.y})`
    }

    result.push({ id: layer.id, name: layer.name, type: layer.type, details })

    if (layer.type === 'group') {
      result.push(...collectLayerInfos(layer.children))
    }
  }
  return result
}

// ── Open a recent file by path (shared between splash & menu) ──

async function openRecentFilePath(path: string) {
  const api = window.electronAPI
  if (api) {
    try {
      const data = await api.fileRead(path)
      const ext = path.split('.').pop()?.toLowerCase()

      if (ext === 'xd') {
        const doc = decodeDocument(data)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
          filePath: path,
        })
      } else {
        const name = path.split(/[/\\]/).pop() || 'file'
        const mimeMap: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          svg: 'image/svg+xml',
          psd: 'application/octet-stream',
        }
        const file = new File([data], name, { type: mimeMap[ext || ''] || '' })
        await openFileAsDocument(file)
      }
    } catch (err) {
      console.error('Failed to open recent file:', err)
      addToast(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
  } else {
    await openFile()
  }
}

// ── Build "Open Recent" submenu items ──

function buildRecentFilesSubmenu(): MenuItem[] {
  const recent = getRecentFiles().slice(0, 10)

  if (recent.length === 0) {
    return [{ label: 'No Recent Files', disabled: true }]
  }

  const items: MenuItem[] = recent.map((entry) => ({
    label: entry.name || entry.path.split(/[/\\]/).pop() || 'Untitled',
    action: () => openRecentFilePath(entry.path),
  }))

  items.push({ label: '', divider: true })
  items.push({
    label: 'Clear Recent Files',
    action: () => clearRecentFiles(),
  })

  return items
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
      {
        label: 'Open Recent',
        submenu: buildRecentFilesSubmenu(),
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
        action: async () => {
          const m = await lazyImport.importImage()
          m.importImageFromPicker()
        },
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
              const { importPSD } = await lazyImport.psdImport()
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
              addToast(`PSD import failed: ${err instanceof Error ? err.message : err}`, 'error')
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
              const { importSketch } = await lazyImport.sketchImport()
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
              addToast(`Sketch import failed: ${err instanceof Error ? err.message : err}`, 'error')
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
            const { tryImportFigmaClipboard } = await lazyImport.figmaImport()
            const doc = tryImportFigmaClipboard(text)
            if (!doc) {
              addToast('No valid Figma data found in clipboard. Copy layers in Figma first, then try again.', 'warning')
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
            addToast(`Figma paste failed: ${err instanceof Error ? err.message : err}`, 'error')
          }
        },
      },
      { label: '', divider: true },
      {
        label: 'Export SVG',
        action: async () => {
          const { exportArtboardToSVG, downloadSVG } = await lazyImport.svgExport()
          const doc = store().document
          const svg = exportArtboardToSVG(doc)
          downloadSVG(svg, `${doc.metadata.title || 'Untitled'}.svg`)
        },
      },
      {
        label: 'Export PNG',
        action: async () => {
          const doc = store().document
          const { exportArtboardToBlob, downloadBlob } = await lazyImport.rasterExport()
          const blob = await exportArtboardToBlob(doc, { format: 'png', scale: 2 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.png`)
        },
      },
      {
        label: 'Export JPEG',
        action: async () => {
          const doc = store().document
          const { exportArtboardToBlob, downloadBlob } = await lazyImport.rasterExport()
          const blob = await exportArtboardToBlob(doc, { format: 'jpeg', quality: 0.9 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.jpg`)
        },
      },
      {
        label: 'Export WebP',
        action: async () => {
          const doc = store().document
          const { exportArtboardToBlob, downloadBlob } = await lazyImport.rasterExport()
          const blob = await exportArtboardToBlob(doc, { format: 'webp', quality: 0.9 })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.webp`)
        },
      },
      {
        label: 'Export GIF',
        action: async () => {
          const doc = store().document
          const { exportArtboardToBlob, downloadBlob } = await lazyImport.rasterExport()
          const blob = await exportArtboardToBlob(doc, { format: 'gif' })
          downloadBlob(blob, `${doc.metadata.title || 'Untitled'}.gif`)
        },
      },
      {
        label: 'Export TIFF',
        action: async () => {
          const doc = store().document
          const { exportArtboardToBlob, downloadBlob } = await lazyImport.rasterExport()
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
            const { batchExportSlices, downloadBatchExport } = await lazyImport.batchExport()
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
            action: async () => {
              const doc = store().document
              const dt = await lazyImport.designTokens()
              const tokens = dt.extractDesignTokens(doc)
              const json = dt.exportTokensAsJSON(tokens)
              const name = doc.metadata.title || 'Untitled'
              dt.downloadTokenFile(json, `${name}.tokens.json`, 'application/json')
            },
          },
          {
            label: 'CSS Variables',
            action: async () => {
              const doc = store().document
              const dt = await lazyImport.designTokens()
              const tokens = dt.extractDesignTokens(doc)
              const css = dt.exportTokensAsCSS(tokens)
              const name = doc.metadata.title || 'Untitled'
              dt.downloadTokenFile(css, `${name}.tokens.css`, 'text/css')
            },
          },
          {
            label: 'SCSS Variables',
            action: async () => {
              const doc = store().document
              const dt = await lazyImport.designTokens()
              const tokens = dt.extractDesignTokens(doc)
              const scss = dt.exportTokensAsSCSS(tokens)
              const name = doc.metadata.title || 'Untitled'
              dt.downloadTokenFile(scss, `${name}.tokens.scss`, 'text/x-scss')
            },
          },
          {
            label: 'Tailwind Config',
            action: async () => {
              const doc = store().document
              const dt = await lazyImport.designTokens()
              const tokens = dt.extractDesignTokens(doc)
              const tw = dt.exportTokensAsTailwind(tokens)
              const name = doc.metadata.title || 'Untitled'
              dt.downloadTokenFile(tw, `${name}.tailwind.config.js`, 'application/javascript')
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
          usePanelLayoutStore.getState().focusTab('versions')
        },
      },
      { label: '', divider: true },
      {
        label: 'Save to Cloud',
        action: () => {
          window.dispatchEvent(new Event('crossdraw:cloud-save'))
        },
      },
      {
        label: 'Open from Cloud\u2026',
        action: () => {
          usePanelLayoutStore.getState().focusTab('cloud-files')
        },
      },
      {
        label: 'Cloud Files',
        action: () => {
          usePanelLayoutStore.getState().focusTab('cloud-files')
        },
      },
      {
        label: 'Share Prototype\u2026',
        action: () => {
          window.dispatchEvent(new Event('crossdraw:share-prototype'))
        },
      },
      { label: '', divider: true },
      {
        label: 'Publish Library\u2026',
        action: () => {
          window.dispatchEvent(new Event('crossdraw:publish-library'))
          usePanelLayoutStore.getState().focusTab('libraries')
        },
      },
      {
        label: 'Libraries',
        action: () => {
          usePanelLayoutStore.getState().focusTab('libraries')
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
        label: 'Select Same',
        submenu: [
          {
            label: 'Same Fill Color',
            action: async () => {
              const m = await lazyImport.selectionFilters()
              m.selectSame('fill')
            },
            disabled: () => store().selection.layerIds.length === 0,
          },
          {
            label: 'Same Stroke Color',
            action: async () => {
              const m = await lazyImport.selectionFilters()
              m.selectSame('stroke')
            },
            disabled: () => store().selection.layerIds.length === 0,
          },
          {
            label: 'Same Stroke Width',
            action: async () => {
              const m = await lazyImport.selectionFilters()
              m.selectSame('strokeWidth')
            },
            disabled: () => store().selection.layerIds.length === 0,
          },
          {
            label: 'Same Font',
            action: async () => {
              const m = await lazyImport.selectionFilters()
              m.selectSame('font')
            },
            disabled: () => store().selection.layerIds.length === 0,
          },
          {
            label: 'Same Effect Type',
            action: async () => {
              const m = await lazyImport.selectionFilters()
              m.selectSame('effectType')
            },
            disabled: () => store().selection.layerIds.length === 0,
          },
        ],
      },
      {
        label: 'Select Inverse',
        shortcut: 'Ctrl+Shift+I',
        action: async () => {
          const m = await lazyImport.selectionFilters()
          m.selectInverse()
        },
      },
      { label: '', divider: true },
      {
        label: 'Sky',
        action: async () => {
          const s = store()
          const layerId = s.selection.layerIds[0]
          if (!layerId) return
          const artboard = s.document.artboards[0]
          if (!artboard) return
          const layer = artboard.layers.find((l) => l.id === layerId)
          if (!layer || layer.type !== 'raster') return
          const { getRasterData: getRD } = await import('@/store/raster-data')
          const imageData = getRD(layer.imageChunkId)
          if (!imageData) return
          const m = await lazyImport.selectSky()
          m.performSelectSky(imageData)
        },
        disabled: () => !hasSelectedRaster(),
      },
      {
        label: 'Focus Area\u2026',
        action: async () => {
          const s = store()
          const layerId = s.selection.layerIds[0]
          if (!layerId) return
          const artboard = s.document.artboards[0]
          if (!artboard) return
          const layer = artboard.layers.find((l) => l.id === layerId)
          if (!layer || layer.type !== 'raster') return
          const { getRasterData: getRD } = await import('@/store/raster-data')
          const imageData = getRD(layer.imageChunkId)
          if (!imageData) return
          const m = await lazyImport.focusArea()
          m.performFocusAreaSelect(imageData)
        },
        disabled: () => !hasSelectedRaster(),
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
          usePanelLayoutStore.getState().focusTab('find-replace')
        },
      },
      { label: '', divider: true },
      {
        label: 'AI Rename Layers\u2026',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || artboard.layers.length === 0) return

          const layerInfos = collectLayerInfos(artboard.layers)
          try {
            const { bulkRenameLayers: aiBulkRename } = await lazyImport.aiService()
            const renames = await aiBulkRename(layerInfos)
            s.bulkRenameLayers(
              artboard.id,
              renames.map((r) => ({ layerId: r.id, newName: r.newName })),
            )
          } catch (err) {
            console.error('AI rename failed:', err)
          }
        },
        disabled: () => {
          const artboard = store().document.artboards[0]
          return !artboard || artboard.layers.length === 0
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
        label: 'Toggle Perspective Grid',
        shortcut: '',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (artboard) s.togglePerspectiveGrid(artboard.id)
        },
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
          usePanelLayoutStore.getState().focusTab('accessibility')
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
          usePanelLayoutStore.getState().focusTab('animation')
        },
      },
      {
        label: 'Export Lottie\u2026',
        action: async () => {
          const doc = store().document
          try {
            const { exportLottie, downloadLottie } = await lazyImport.lottieExport()
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
          usePanelLayoutStore.getState().focusTab('interactions')
        },
      },
      { label: '', divider: true },
      {
        label: 'Toggle Dev Mode',
        shortcut: 'Ctrl+Shift+D',
        action: () => store().toggleDevMode(),
      },
      { label: '', divider: true },
      {
        label: store().document.pngtuber?.enabled ? 'Disable PNGtuber Mode' : 'Enable PNGtuber Mode',
        action: () => {
          const current = store().document.pngtuber?.enabled ?? false
          store().setPNGTuberEnabled(!current)
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
      { label: '', divider: true },
      {
        label: 'New Fill Layer',
        submenu: [
          {
            label: 'Solid Color...',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (artboard) s.addFillLayer(artboard.id, 'solid', { color: '#ffffff' })
            },
            disabled: () => !store().document.artboards[0],
          },
          {
            label: 'Gradient...',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (artboard)
                s.addFillLayer(artboard.id, 'gradient', {
                  gradient: {
                    id: crypto.randomUUID(),
                    name: 'Fill Gradient',
                    type: 'linear',
                    angle: 0,
                    x: 0,
                    y: 0,
                    stops: [
                      { offset: 0, color: '#000000', opacity: 1 },
                      { offset: 1, color: '#ffffff', opacity: 1 },
                    ],
                    dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
                  },
                })
            },
            disabled: () => !store().document.artboards[0],
          },
          {
            label: 'Pattern...',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (artboard) s.addFillLayer(artboard.id, 'pattern', { patternScale: 1 })
            },
            disabled: () => !store().document.artboards[0],
          },
        ],
      },
      {
        label: 'New Clone Layer',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard) return
          const layerId = s.selection.layerIds[0]
          if (!layerId) return
          s.addCloneLayer(artboard.id, layerId)
        },
        disabled: () => {
          const s = store()
          return !s.document.artboards[0] || s.selection.layerIds.length === 0
        },
      },
      { label: '', divider: true },
      {
        label: 'Smart Objects',
        submenu: [
          {
            label: 'Convert to Smart Object',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              s.convertToSmartObject(artboard.id, layerId)
            },
            disabled: () => {
              const s = store()
              if (!s.document.artboards[0] || s.selection.layerIds.length === 0) return true
              const artboard = s.document.artboards[0]!
              const layerId = s.selection.layerIds[0]!
              const layer = artboard.layers.find((l) => l.id === layerId)
              return !layer || layer.type === 'smart-object'
            },
          },
          {
            label: 'Edit Contents',
            action: () => {
              // Editing smart object contents would open a sub-document
              // This is a UI entry point; actual editing is handled by the smart-object module
            },
            disabled: () => {
              const s = store()
              if (!s.document.artboards[0] || s.selection.layerIds.length === 0) return true
              const artboard = s.document.artboards[0]!
              const layerId = s.selection.layerIds[0]!
              const layer = artboard.layers.find((l) => l.id === layerId)
              return !layer || layer.type !== 'smart-object'
            },
          },
          {
            label: 'Rasterize',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              s.rasterizeSmartObject(artboard.id, layerId)
            },
            disabled: () => {
              const s = store()
              if (!s.document.artboards[0] || s.selection.layerIds.length === 0) return true
              const artboard = s.document.artboards[0]!
              const layerId = s.selection.layerIds[0]!
              const layer = artboard.layers.find((l) => l.id === layerId)
              return !layer || layer.type !== 'smart-object'
            },
          },
        ],
      },
    ],
  }

  const getSelectedTextLayer = (): TextLayer | null => {
    const s = store()
    const artboard = s.document.artboards[0]
    if (!artboard) return null
    const layerId = s.selection.layerIds[0]
    if (!layerId) return null
    const layer = artboard.layers.find((l) => l.id === layerId)
    return layer?.type === 'text' ? (layer as TextLayer) : null
  }

  const hasSelectedText = (): boolean => getSelectedTextLayer() !== null

  const updateSelectedText = (updates: Partial<TextLayer>) => {
    const s = store()
    const artboard = s.document.artboards[0]
    if (!artboard) return
    const layerId = s.selection.layerIds[0]
    if (!layerId) return
    s.updateLayer(artboard.id, layerId, updates as any)
  }

  const typeMenu: MenuDef = {
    label: 'Type',
    items: [
      {
        label: 'Bold',
        shortcut: 'Ctrl+B',
        action: () => {
          const tl = getSelectedTextLayer()
          if (!tl) return
          updateSelectedText({ fontWeight: tl.fontWeight === 'bold' ? 'normal' : 'bold' })
        },
        disabled: () => !hasSelectedText(),
      },
      {
        label: 'Italic',
        shortcut: 'Ctrl+I',
        action: () => {
          const tl = getSelectedTextLayer()
          if (!tl) return
          updateSelectedText({ fontStyle: tl.fontStyle === 'italic' ? 'normal' : 'italic' })
        },
        disabled: () => !hasSelectedText(),
      },
      {
        label: 'Underline',
        shortcut: 'Ctrl+U',
        action: () => {
          const tl = getSelectedTextLayer()
          if (!tl) return
          updateSelectedText({ textDecoration: tl.textDecoration === 'underline' ? 'none' : 'underline' })
        },
        disabled: () => !hasSelectedText(),
      },
      { label: '', divider: true },
      {
        label: 'Align Left',
        action: () => updateSelectedText({ textAlign: 'left' }),
        disabled: () => !hasSelectedText(),
      },
      {
        label: 'Align Center',
        action: () => updateSelectedText({ textAlign: 'center' }),
        disabled: () => !hasSelectedText(),
      },
      {
        label: 'Align Right',
        action: () => updateSelectedText({ textAlign: 'right' }),
        disabled: () => !hasSelectedText(),
      },
      { label: '', divider: true },
      {
        label: 'Vertical Text',
        action: () => {
          const tl = getSelectedTextLayer()
          if (!tl) return
          updateSelectedText({
            textOrientation: tl.textOrientation === 'vertical' ? 'horizontal' : 'vertical',
          })
        },
        disabled: () => !hasSelectedText(),
      },
      {
        label: 'Optical Margins',
        action: () => {
          const tl = getSelectedTextLayer()
          if (!tl) return
          updateSelectedText({
            opticalMarginAlignment: !tl.opticalMarginAlignment,
          })
        },
        disabled: () => !hasSelectedText(),
      },
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

  const hasSelectedVector = (): boolean => {
    const s = store()
    if (s.selection.layerIds.length === 0) return false
    const artboard = s.document.artboards[0]
    if (!artboard) return false
    const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
    return !!layer && layer.type === 'vector'
  }

  const addFilterLayerToArtboard = (filterKind: string, customParams?: Partial<import('@/types').FilterParams>) => {
    const s = store()
    const artboard = s.document.artboards[0]
    if (!artboard) return
    if ('addFilterLayer' in s) {
      ;(s as any).addFilterLayer(artboard.id, filterKind, customParams)
    }
  }

  const filterMenu: MenuDef = {
    label: 'Filter',
    items: [
      {
        label: 'Gaussian Blur\u2026',
        action: () => addFilterLayerToArtboard('blur', { radius: 4, quality: 'medium' }),
        disabled: false,
      },
      {
        label: 'Drop Shadow\u2026',
        action: () =>
          addFilterLayerToArtboard('shadow', {
            offsetX: 4,
            offsetY: 4,
            blurRadius: 8,
            spread: 0,
            color: '#000000',
            opacity: 0.5,
          }),
        disabled: false,
      },
      {
        label: 'Inner Shadow\u2026',
        action: () =>
          addFilterLayerToArtboard('inner-shadow', {
            offsetX: 2,
            offsetY: 2,
            blurRadius: 4,
            color: '#000000',
            opacity: 0.5,
          }),
        disabled: false,
      },
      {
        label: 'Outer Glow\u2026',
        action: () =>
          addFilterLayerToArtboard('glow', {
            radius: 8,
            spread: 0,
            color: '#ffffff',
            opacity: 0.75,
          }),
        disabled: false,
      },
      { label: '', divider: true },
      {
        label: 'Background Blur\u2026',
        action: () => addFilterLayerToArtboard('background-blur', { radius: 10 }),
        disabled: false,
      },
      {
        label: 'Progressive Blur\u2026',
        action: () =>
          addFilterLayerToArtboard('progressive-blur', {
            direction: 'linear',
            angle: 0,
            startRadius: 0,
            endRadius: 20,
            startPosition: 0,
            endPosition: 1,
          }),
        disabled: false,
      },
      { label: '', divider: true },
      {
        label: 'Noise',
        submenu: [
          {
            label: 'Gaussian Noise',
            action: () =>
              addFilterLayerToArtboard('noise', {
                noiseType: 'gaussian',
                amount: 25,
                monochrome: false,
                seed: Date.now(),
              }),
          },
          {
            label: 'Uniform Noise',
            action: () =>
              addFilterLayerToArtboard('noise', {
                noiseType: 'uniform',
                amount: 25,
                monochrome: false,
                seed: Date.now(),
              }),
          },
          {
            label: 'Film Grain',
            action: () =>
              addFilterLayerToArtboard('noise', {
                noiseType: 'film-grain',
                amount: 25,
                monochrome: false,
                seed: Date.now(),
                size: 3,
              }),
          },
          { label: '', divider: true },
          {
            label: 'Noise Fill',
            action: () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard) return
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
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
            disabled: () => !hasSelectedVector(),
          },
        ],
      },
      {
        label: 'Distort',
        submenu: [
          {
            label: 'Wave',
            action: () =>
              addFilterLayerToArtboard('wave', {
                amplitudeX: 10,
                amplitudeY: 10,
                frequencyX: 0.05,
                frequencyY: 0.05,
              }),
          },
          {
            label: 'Twirl',
            action: () => addFilterLayerToArtboard('twirl', { angle: Math.PI / 2, radius: 0 }),
          },
          {
            label: 'Pinch/Bulge',
            action: () => addFilterLayerToArtboard('pinch', { amount: 0.5 }),
          },
          {
            label: 'Spherize',
            action: () => addFilterLayerToArtboard('spherize', { amount: 1 }),
          },
        ],
      },
      {
        label: 'Sharpen',
        submenu: [
          {
            label: 'Sharpen',
            action: () => addFilterLayerToArtboard('sharpen', { amount: 1.5, radius: 1, threshold: 0 }),
          },
          {
            label: 'Unsharp Mask',
            action: () => addFilterLayerToArtboard('sharpen', { amount: 0.8, radius: 2, threshold: 4 }),
          },
        ],
      },
      {
        label: 'Blur',
        submenu: [
          {
            label: 'Motion Blur',
            action: () => addFilterLayerToArtboard('motion-blur', { angle: 0, distance: 10 }),
          },
          {
            label: 'Radial Blur',
            action: () => addFilterLayerToArtboard('radial-blur', { centerX: 0.5, centerY: 0.5, amount: 10 }),
          },
        ],
      },
      {
        label: 'Adjustments',
        submenu: [
          {
            label: 'Levels',
            action: () => addFilterLayerToArtboard('levels', { blackPoint: 0, whitePoint: 255, gamma: 1.0 }),
          },
          {
            label: 'Curves',
            action: () =>
              addFilterLayerToArtboard('curves', {
                points: [
                  [0, 0],
                  [128, 128],
                  [255, 255],
                ],
              }),
          },
          {
            label: 'Hue/Saturation',
            action: () => addFilterLayerToArtboard('hue-sat', { hue: 0, saturation: 0, lightness: 0 }),
          },
          {
            label: 'Color Balance',
            action: () => addFilterLayerToArtboard('color-balance', { shadows: 0, midtones: 0, highlights: 0 }),
          },
          { label: '', divider: true },
          {
            label: 'Posterize',
            action: () => addFilterLayerToArtboard('color-adjust', { adjustType: 'posterize', levels: 4 }),
          },
          {
            label: 'Threshold',
            action: () => addFilterLayerToArtboard('color-adjust', { adjustType: 'threshold', thresholdValue: 128 }),
          },
          {
            label: 'Invert',
            action: () => addFilterLayerToArtboard('color-adjust', { adjustType: 'invert' }),
          },
          {
            label: 'Desaturate',
            action: () => addFilterLayerToArtboard('color-adjust', { adjustType: 'desaturate' }),
          },
          {
            label: 'Vibrance',
            action: () => addFilterLayerToArtboard('color-adjust', { adjustType: 'vibrance', vibranceAmount: 50 }),
          },
          {
            label: 'Channel Mixer',
            action: () =>
              addFilterLayerToArtboard('color-adjust', {
                adjustType: 'channel-mixer',
                channelMatrix: { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 },
              }),
          },
        ],
      },
      { label: '', divider: true },
      {
        label: 'Other',
        submenu: [
          {
            label: 'Frequency Separation\u2026',
            action: async () => {
              const s = store()
              const layerId = s.selection.layerIds[0]
              if (!layerId) return
              const m = await lazyImport.frequencySeparation()
              m.performFrequencySeparation(layerId)
            },
            disabled: () => !hasSelectedRaster(),
          },
        ],
      },
      { label: '', divider: true },
      {
        label: 'Remove Background',
        submenu: [
          {
            label: 'Color Match',
            action: async () => {
              const m = await lazyImport.applyBgRemoval()
              m.applyBackgroundRemovalFilter({ method: 'color' })
            },
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Edge Detection',
            action: async () => {
              const m = await lazyImport.applyBgRemoval()
              m.applyBackgroundRemovalFilter({ method: 'edge' })
            },
            disabled: () => !hasSelectedRaster(),
          },
          {
            label: 'Threshold',
            action: async () => {
              const m = await lazyImport.applyBgRemoval()
              m.applyBackgroundRemovalFilter({ method: 'threshold' })
            },
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
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('union')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Subtract',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('subtract')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Intersect',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('intersect')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Exclude',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('xor')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Divide',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('divide')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Trim',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('trim')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Merge',
        action: async () => {
          const m = await lazyImport.booleanOps()
          m.performBooleanOp('merge')
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      { label: '', divider: true },
      {
        label: 'Offset Path\u2026',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const deltaStr = prompt('Offset amount in pixels (positive = expand, negative = contract):', '10')
          if (!deltaStr) return
          const delta = parseFloat(deltaStr)
          if (isNaN(delta)) return
          const m = await lazyImport.booleanOps()
          m.offsetPath(artboard.id, layerId, delta)
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Contour Path\u2026',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const offsetStr = prompt('Offset per step (px, positive=outward, negative=inward):', '5')
          if (!offsetStr) return
          const offset = parseFloat(offsetStr)
          if (isNaN(offset)) return
          const stepsStr = prompt('Number of contour steps (1-20):', '5')
          if (!stepsStr) return
          const steps = parseInt(stepsStr, 10)
          if (isNaN(steps) || steps < 1) return
          const joinStr = prompt('Join type (miter / round / square):', 'round')
          if (!joinStr) return
          const joinType = joinStr.trim().toLowerCase()
          if (joinType !== 'miter' && joinType !== 'round' && joinType !== 'square') return
          const m = await lazyImport.booleanOps()
          m.contourPath(artboard.id, layerId, {
            offset,
            steps: Math.min(20, steps),
            joinType: joinType as import('@/tools/boolean-ops').ContourJoinType,
            miterLimit: 2,
            colorInterpolation: false,
          })
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Expand Stroke',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const m = await lazyImport.booleanOps()
          m.expandStroke(artboard.id, layerId)
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Simplify Path',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const m = await lazyImport.booleanOps()
          m.simplifyPath(artboard.id, layerId)
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Flatten Curves',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const m = await lazyImport.pathOps()
          m.flattenCurves(artboard.id, layerId)
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Join Paths',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length < 2) return
          const m = await lazyImport.pathOps()
          m.joinPaths(artboard.id, s.selection.layerIds)
        },
        disabled: () => {
          const s = store()
          if (s.selection.layerIds.length < 2) return true
          const artboard = s.document.artboards[0]
          if (!artboard) return true
          const vectorCount = s.selection.layerIds.filter((id) => {
            const l = artboard.layers.find((la) => la.id === id)
            return l?.type === 'vector'
          }).length
          return vectorCount < 2
        },
      },
      {
        label: 'Break at Intersections',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length < 2) return
          const m = await lazyImport.pathOps()
          m.breakAtIntersections(artboard.id, s.selection.layerIds)
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      { label: '', divider: true },
      {
        label: 'Shape Builder Tool',
        shortcut: 'Shift+M',
        action: () => store().setActiveTool('shape-builder'),
      },
      { label: '', divider: true },
      {
        label: 'Make Compound Path',
        shortcut: 'Ctrl+8',
        action: async () => {
          const m = await lazyImport.compoundPaths()
          m.makeCompoundPath()
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Release Compound Path',
        shortcut: 'Ctrl+Shift+8',
        action: async () => {
          const m = await lazyImport.compoundPaths()
          m.releaseCompoundPath()
        },
        disabled: () => {
          const s = store()
          if (s.selection.layerIds.length !== 1) return true
          const artboard = s.document.artboards[0]
          if (!artboard) return true
          const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
          return !layer || layer.type !== 'vector' || (layer as import('@/types').VectorLayer).paths.length < 2
        },
      },
      { label: '', divider: true },
      {
        label: 'Make Clipping Mask',
        shortcut: 'Ctrl+7',
        action: async () => {
          const m = await lazyImport.clippingMask()
          m.makeClippingMask()
        },
        disabled: () => store().selection.layerIds.length < 2,
      },
      {
        label: 'Release Clipping Mask',
        shortcut: 'Ctrl+Shift+7',
        action: async () => {
          const m = await lazyImport.clippingMask()
          m.releaseClippingMask()
        },
        disabled: () => {
          const s = store()
          if (s.selection.layerIds.length !== 1) return true
          const artboard = s.document.artboards[0]
          if (!artboard) return true
          const layer = artboard.layers.find((l) => l.id === s.selection.layerIds[0])
          return !layer || !layer.mask
        },
      },
      { label: '', divider: true },
      {
        label: 'Trace Image\u2026',
        action: async () => {
          const m = await lazyImport.imageTrace()
          m.traceSelectedRasterLayer()
        },
        disabled: () => !hasSelectedRaster(),
      },
      { label: '', divider: true },
      {
        label: 'Blend\u2026',
        submenu: [
          {
            label: 'Blend (Linear)\u2026',
            action: async () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard || s.selection.layerIds.length !== 2) return
              const stepsStr = prompt('Number of blend steps:', '5')
              if (!stepsStr) return
              const steps = parseInt(stepsStr, 10)
              if (isNaN(steps) || steps < 1) return
              const m = await lazyImport.blendTool()
              m.performBlend(steps, 'linear')
            },
            disabled: () => store().selection.layerIds.length !== 2,
          },
          {
            label: 'Blend (Smooth)\u2026',
            action: async () => {
              const s = store()
              const artboard = s.document.artboards[0]
              if (!artboard || s.selection.layerIds.length !== 2) return
              const stepsStr = prompt('Number of blend steps:', '5')
              if (!stepsStr) return
              const steps = parseInt(stepsStr, 10)
              if (isNaN(steps) || steps < 1) return
              const m = await lazyImport.blendTool()
              m.performBlend(steps, 'smooth')
            },
            disabled: () => store().selection.layerIds.length !== 2,
          },
          {
            label: 'Blend Tool',
            action: () => store().setActiveTool('blend'),
          },
        ],
      },
      {
        label: 'Vector Brushes',
        submenu: [
          {
            label: 'Pattern Brush',
            action: async () => {
              const m = await lazyImport.vectorBrushes()
              m.setVectorBrushSettings({ type: 'pattern' })
            },
          },
          {
            label: 'Art Brush',
            action: async () => {
              const m = await lazyImport.vectorBrushes()
              m.setVectorBrushSettings({ type: 'art' })
            },
          },
          {
            label: 'Scatter Brush',
            action: async () => {
              const m = await lazyImport.vectorBrushes()
              m.setVectorBrushSettings({ type: 'scatter' })
            },
          },
          {
            label: 'Calligraphic Brush',
            action: async () => {
              const m = await lazyImport.vectorBrushes()
              m.setVectorBrushSettings({ type: 'calligraphic' })
            },
          },
        ],
      },
      {
        label: 'Symbol Sprayer',
        shortcut: 'Shift+S',
        action: () => store().setActiveTool('symbol-sprayer'),
      },
      { label: '', divider: true },
      {
        label: 'Envelope Distort\u2026',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const layer = artboard.layers.find((l) => l.id === layerId)
          if (!layer || layer.type !== 'vector') return
          const presetStr = prompt(
            'Envelope preset (arc, arch, bulge, flag, wave, fish, rise, squeeze, twist, none):',
            layer.envelope?.preset ?? 'arc',
          )
          if (!presetStr) return
          const preset = presetStr.trim().toLowerCase()
          const validPresets = ['arc', 'arch', 'bulge', 'flag', 'wave', 'fish', 'rise', 'squeeze', 'twist', 'none']
          if (!validPresets.includes(preset)) return
          const bendStr = prompt('Bend (-100 to 100):', String(Math.round((layer.envelope?.bend ?? 0.5) * 100)))
          if (!bendStr) return
          const bend = Math.max(-100, Math.min(100, parseInt(bendStr, 10))) / 100
          s.updateLayer(artboard.id, layerId, {
            envelope: {
              preset: preset as import('@/types').WarpPreset,
              bend,
              horizontalDistortion: layer.envelope?.horizontalDistortion ?? 0,
              verticalDistortion: layer.envelope?.verticalDistortion ?? 0,
            },
          } as Partial<import('@/types').Layer>)
        },
        disabled: () => !hasSelectedVector(),
      },
      {
        label: 'Extrude 3D\u2026',
        action: () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!
          const layer = artboard.layers.find((l) => l.id === layerId)
          if (!layer || layer.type !== 'vector') return
          const vl = layer as import('@/types').VectorLayer
          if (vl.extrude3d) {
            // Toggle off
            s.updateLayer(artboard.id, layerId, { extrude3d: undefined } as Partial<import('@/types').Layer>)
          } else {
            // Enable with defaults
            import('@/render/extrude-3d').then(({ createDefaultExtrude3DConfig }) => {
              s.updateLayer(artboard.id, layerId, {
                extrude3d: createDefaultExtrude3DConfig(),
              } as Partial<import('@/types').Layer>)
            })
          }
        },
        disabled: () => !hasSelectedVector(),
      },
      { label: '', divider: true },
      {
        label: 'Repeat\u2026',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || s.selection.layerIds.length !== 1) return
          const layerId = s.selection.layerIds[0]!

          const modeStr = prompt('Repeat mode (linear / radial / grid):', 'linear')
          if (!modeStr) return
          const mode = modeStr.trim().toLowerCase()
          if (mode !== 'linear' && mode !== 'radial' && mode !== 'grid') {
            addToast('Invalid mode. Use "linear", "radial", or "grid".', 'warning')
            return
          }

          const countStr = prompt('Number of copies:', '5')
          if (!countStr) return
          const count = parseInt(countStr, 10)
          if (isNaN(count) || count < 1) return

          const { createDefaultRepeaterConfig } = await lazyImport.repeater()
          const config = createDefaultRepeaterConfig()
          config.mode = mode
          config.count = count

          s.createRepeater(artboard.id, layerId, config)
        },
        disabled: () => store().selection.layerIds.length !== 1,
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
          usePanelLayoutStore.getState().focusTab('layers')
        },
      },
      {
        label: 'Properties Panel',
        action: () => {
          usePanelLayoutStore.getState().focusTab('properties')
        },
      },
      {
        label: 'Color Palette',
        action: () => {
          usePanelLayoutStore.getState().focusTab('color-palette')
        },
      },
      {
        label: 'History',
        action: () => {
          usePanelLayoutStore.getState().focusTab('history')
        },
      },
      {
        label: 'Symbols',
        action: () => {
          usePanelLayoutStore.getState().focusTab('symbols')
        },
      },
      {
        label: 'Align & Distribute',
        action: () => {
          usePanelLayoutStore.getState().focusTab('align')
        },
      },
      { label: '', divider: true },
      {
        label: 'Variables',
        action: () => {
          usePanelLayoutStore.getState().focusTab('variables')
        },
      },
      {
        label: 'Styles',
        action: () => {
          usePanelLayoutStore.getState().focusTab('styles')
        },
      },
      {
        label: 'Libraries',
        action: () => {
          usePanelLayoutStore.getState().focusTab('libraries')
        },
      },
      {
        label: 'Dev Mode',
        action: () => {
          usePanelLayoutStore.getState().focusTab('dev-mode')
        },
      },
      { label: '', divider: true },
      {
        label: 'PNGtuber',
        action: () => {
          usePanelLayoutStore.getState().focusTab('pngtuber')
        },
      },
      {
        label: 'PNGtuber Preview',
        action: () => {
          usePanelLayoutStore.getState().focusTab('pngtuber-preview')
        },
      },
      { label: '', divider: true },
      {
        label: '3D Layers',
        action: () => {
          usePanelLayoutStore.getState().focusTab('layer-3d')
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
        label: 'Getting Started',
        action: () => {
          resetOnboarding()
          window.dispatchEvent(new CustomEvent('crossdraw:show-onboarding'))
        },
      },
      { label: '', divider: true },
      {
        label: 'About Crossdraw',
        action: () => {
          addToast('Crossdraw — A professional vector & raster design editor.', 'info')
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
          usePanelLayoutStore.getState().focusTab('collaboration')
        },
      },
      {
        label: 'Join Session\u2026',
        action: () => {
          usePanelLayoutStore.getState().focusTab('collaboration')
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
          usePanelLayoutStore.getState().focusTab('collaboration')
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
          usePanelLayoutStore.getState().focusTab('ai-assistant')
        },
      },
      { label: '', divider: true },
      {
        label: 'Generate Layout\u2026',
        action: () => {
          usePanelLayoutStore.getState().focusTab('ai-assistant')
        },
      },
      {
        label: 'Critique Design',
        action: () => {
          usePanelLayoutStore.getState().focusTab('ai-assistant')
        },
      },
      { label: '', divider: true },
      {
        label: 'Rename Layers\u2026',
        action: async () => {
          const s = store()
          const artboard = s.document.artboards[0]
          if (!artboard || artboard.layers.length === 0) return

          const layerInfos = collectLayerInfos(artboard.layers)
          try {
            const { bulkRenameLayers: aiBulkRename } = await lazyImport.aiService()
            const renames = await aiBulkRename(layerInfos)
            s.bulkRenameLayers(
              artboard.id,
              renames.map((r) => ({ layerId: r.id, newName: r.newName })),
            )
          } catch (err) {
            console.error('AI rename failed:', err)
          }
        },
        disabled: () => {
          const artboard = store().document.artboards[0]
          return !artboard || artboard.layers.length === 0
        },
      },
    ],
  }

  const allMenus = [
    fileMenu,
    editMenu,
    viewMenu,
    layerMenu,
    pathMenu,
    typeMenu,
    filterMenu,
    ...(isAIEnabled() ? [aiMenu] : []),
    collabMenu,
    windowMenu,
    helpMenu,
  ]

  // Strip AI-specific items from menus when AI is disabled
  if (!isAIEnabled()) {
    for (const menu of allMenus) {
      menu.items = menu.items.filter((item) => !item.label.startsWith('AI '))
      // Collapse consecutive dividers
      menu.items = menu.items.filter((item, i, arr) => !item.divider || !arr[i - 1]?.divider)
    }
  }

  return allMenus
}

// ── Component ──

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [menuVersion, setMenuVersion] = useState(0)
  const menus = useRef(buildMenus())
  // Rebuild menus when AI toggle changes
  useEffect(() => {
    const handler = () => {
      menus.current = buildMenus()
      setMenuVersion((v) => v + 1)
    }
    window.addEventListener('crossdraw:ai-toggled', handler)
    return () => window.removeEventListener('crossdraw:ai-toggled', handler)
  }, [])
  void menuVersion // used to trigger re-render

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
      {menus.current.map((menu) => (
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
      {/* Right-aligned actions */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
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
            borderRadius: 'var(--radius-sm)',
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
        <UserProfile />
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
