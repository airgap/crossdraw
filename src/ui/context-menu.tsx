import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { copyLayers, pasteLayers, cutLayers, hasClipboard } from '@/tools/clipboard'
import { bringToFront, bringForward, sendBackward, sendToBack, flipHorizontal, flipVertical } from '@/tools/layer-ops'

interface MenuItem {
  label: string
  shortcut?: string
  action: () => void
  disabled?: boolean
  separator?: false
}

interface Separator {
  separator: true
}

type MenuEntry = MenuItem | Separator

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
}

export function CanvasContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const selection = useEditorStore((s) => s.selection)
  const hasSelection = selection.layerIds.length > 0

  const close = useCallback(() => setMenu({ visible: false, x: 0, y: 0 }), [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close()
      }
    }
    if (menu.visible) {
      window.addEventListener('mousedown', handler)
      return () => window.removeEventListener('mousedown', handler)
    }
  }, [menu.visible, close])

  // Expose the open function via a global so viewport can trigger it
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__openCanvasContextMenu = (x: number, y: number) => {
      setMenu({ visible: true, x, y })
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__openCanvasContextMenu
    }
  }, [])

  if (!menu.visible) return null

  const entries: MenuEntry[] = [
    {
      label: 'Cut',
      shortcut: 'Ctrl+X',
      action: () => {
        cutLayers()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      action: () => {
        copyLayers()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: () => {
        pasteLayers()
        close()
      },
      disabled: !hasClipboard(),
    },
    { separator: true },
    {
      label: 'Delete',
      shortcut: 'Del',
      disabled: !hasSelection,
      action: () => {
        const store = useEditorStore.getState()
        const artboard = store.document.artboards[0]
        if (artboard) {
          for (const layerId of store.selection.layerIds) {
            store.deleteLayer(artboard.id, layerId)
          }
          store.deselectAll()
        }
        close()
      },
    },
    {
      label: 'Duplicate',
      shortcut: 'Ctrl+D',
      disabled: !hasSelection,
      action: () => {
        const store = useEditorStore.getState()
        const artboard = store.document.artboards[0]
        if (artboard) {
          for (const layerId of store.selection.layerIds) {
            store.duplicateLayer(artboard.id, layerId)
          }
        }
        close()
      },
    },
    { separator: true },
    {
      label: 'Bring to Front',
      shortcut: 'Ctrl+Shift+]',
      action: () => {
        bringToFront()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Bring Forward',
      shortcut: 'Ctrl+]',
      action: () => {
        bringForward()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Send Backward',
      shortcut: 'Ctrl+[',
      action: () => {
        sendBackward()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Send to Back',
      shortcut: 'Ctrl+Shift+[',
      action: () => {
        sendToBack()
        close()
      },
      disabled: !hasSelection,
    },
    { separator: true },
    {
      label: 'Flip Horizontal',
      shortcut: 'Shift+H',
      action: () => {
        flipHorizontal()
        close()
      },
      disabled: !hasSelection,
    },
    {
      label: 'Flip Vertical',
      shortcut: 'Shift+V',
      action: () => {
        flipVertical()
        close()
      },
      disabled: !hasSelection,
    },
    { separator: true },
    {
      label: 'Select All',
      shortcut: 'Ctrl+A',
      action: () => {
        const store = useEditorStore.getState()
        const artboard = store.document.artboards[0]
        if (artboard) {
          for (const layer of artboard.layers) {
            store.selectLayer(layer.id, true)
          }
        }
        close()
      },
    },
  ]

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-1) 0',
        minWidth: 200,
        zIndex: 9999,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
        fontSize: 'var(--font-size-base)',
        color: 'var(--text-primary)',
      }}
    >
      {entries.map((entry, i) => {
        if (entry.separator) {
          return <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--space-1) 0' }} />
        }
        return (
          <div
            key={i}
            onClick={entry.disabled ? undefined : entry.action}
            style={{
              padding: '6px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: entry.disabled ? 'default' : 'pointer',
              opacity: entry.disabled ? 0.4 : 1,
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!entry.disabled) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }}
          >
            <span>{entry.label}</span>
            {entry.shortcut && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', marginLeft: 24 }}>
                {entry.shortcut}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Trigger the context menu from the viewport canvas. */
export function openCanvasContextMenu(x: number, y: number) {
  const fn = (window as unknown as Record<string, unknown>).__openCanvasContextMenu
  if (typeof fn === 'function') {
    ;(fn as (x: number, y: number) => void)(x, y)
  }
}
