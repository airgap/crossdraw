import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { isElectron, electronOpen } from '@/io/electron-bridge'
import { openFile } from '@/io/open-file'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { batchExportSlices, downloadBatchExport } from '@/io/batch-export'
import { importImageFromPicker } from '@/tools/import-image'
import { copyLayers, pasteLayers, cutLayers } from '@/tools/clipboard'
import { copyStyle, pasteStyle } from '@/tools/style-clipboard'
import { bringToFront, bringForward, sendBackward, sendToBack, flipHorizontal, flipVertical } from '@/tools/layer-ops'
import { getLayerBBox, mergeBBox } from '@/math/bbox'
import type { BBox } from '@/math/bbox'

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
        label: 'New Document',
        shortcut: '',
        action: () => store().newDocument(),
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

  const filterMenu: MenuDef = {
    label: 'Filter',
    items: [
      { label: 'Gaussian Blur\u2026', disabled: true },
      { label: 'Drop Shadow\u2026', disabled: true },
      { label: 'Inner Shadow\u2026', disabled: true },
      { label: 'Outer Glow\u2026', disabled: true },
      { label: '', divider: true },
      { label: 'Background Blur\u2026', disabled: true },
    ],
  }

  const windowMenu: MenuDef = {
    label: 'Window',
    items: [
      { label: 'Layers Panel', disabled: true },
      { label: 'Properties Panel', disabled: true },
      { label: 'Color Palette', disabled: true },
      { label: '', divider: true },
      { label: 'Reset Layout', disabled: true },
    ],
  }

  const helpMenu: MenuDef = {
    label: 'Help',
    items: [
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

  return [fileMenu, editMenu, viewMenu, layerMenu, typeMenu, filterMenu, windowMenu, helpMenu]
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
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handler)
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
            onMouseDown={() => handleMenuClick(menu.label)}
            onMouseEnter={() => handleMenuHover(menu.label)}
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
          Downloads
        </a>
      </div>
    </div>
  )
}

// ── Dropdown component ──

function MenuDropdown({ items, onItemClick }: { items: MenuItem[]; onItemClick: (item: MenuItem) => void }) {
  return (
    <div
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

  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
    </div>
  )
}
