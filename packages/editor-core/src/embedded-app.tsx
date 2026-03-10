/**
 * Embedded editor app — a trimmed version of the main App component
 * that respects mode restrictions for library consumers.
 */

import { useEffect, useState } from 'react'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ToolOptionsBar } from '@/ui/tool-options-bar'
import { useEditorStore } from '@/store/editor.store'
import { decodeDocument } from '@/io/file-format'
import { encodeDocument } from '@/io/file-format'
import type { ModeConfig } from './mode-config'

interface EmbeddedAppProps {
  modeConfig: ModeConfig
  initialDocument?: ArrayBuffer
  onSave?: (buffer: ArrayBuffer) => void
  onLoad?: () => Promise<ArrayBuffer | null>
}

export function EmbeddedApp({ modeConfig, initialDocument, onSave, onLoad }: EmbeddedAppProps) {
  const [ready, setReady] = useState(false)

  // Load initial document or create a default one
  useEffect(() => {
    const store = useEditorStore.getState()
    if (initialDocument) {
      try {
        const doc = decodeDocument(initialDocument)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
          filePath: null,
        })
      } catch {
        store.newDocument({ title: 'Untitled', width: 512, height: 512, colorspace: 'srgb', backgroundColor: '#ffffff', dpi: 72 })
      }
    } else {
      store.newDocument({ title: 'Untitled', width: 512, height: 512, colorspace: 'srgb', backgroundColor: '#ffffff', dpi: 72 })
    }

    // Enable PNGtuber mode if applicable
    if (modeConfig.panels.includes('pngtuber') && !modeConfig.panels.includes('dev-mode')) {
      store.setPNGTuberEnabled?.(true)
    }

    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Set up keyboard shortcuts
  useEffect(() => {
    if (ready) setupKeyboardShortcuts()
  }, [ready])

  // Wire up save/load callbacks
  useEffect(() => {
    if (!onSave) return

    const handleSave = () => {
      const doc = useEditorStore.getState().document
      const buffer = encodeDocument(doc)
      onSave(buffer)
    }

    window.addEventListener('crossdraw:embedded-save', handleSave)
    return () => window.removeEventListener('crossdraw:embedded-save', handleSave)
  }, [onSave])

  useEffect(() => {
    if (!onLoad) return

    const handleLoad = async () => {
      const buffer = await onLoad()
      if (buffer) {
        const doc = decodeDocument(buffer)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
          filePath: null,
        })
      }
    }

    window.addEventListener('crossdraw:embedded-load', handleLoad)
    return () => window.removeEventListener('crossdraw:embedded-load', handleLoad)
  }, [onLoad])

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--bg-base, #0e0e0e)',
          color: 'var(--text-secondary, #999)',
          fontFamily: 'var(--font-body, sans-serif)',
          fontSize: '12px',
        }}
      >
        Loading editor...
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--bg-base, #0e0e0e)',
        color: 'var(--text-primary, #e0e0e0)',
        fontFamily: 'var(--font-body, sans-serif)',
        fontSize: 'var(--font-size-base, 12px)',
      }}
    >
      {modeConfig.menuBar && <MenuBar />}
      {modeConfig.toolOptionsBar && <ToolOptionsBar />}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Toolbar modeConfig={modeConfig} />
        <PanelShell modeConfig={modeConfig}>
          <Viewport />
        </PanelShell>
      </div>
      {modeConfig.statusBar && <StatusBar />}
      <CanvasContextMenu />

      {/* Embedded save button for pngtuber mode */}
      {onSave && !modeConfig.menuBar && (
        <button
          onClick={() => window.dispatchEvent(new Event('crossdraw:embedded-save'))}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '6px 16px',
            background: 'var(--accent, #4a9eff)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md, 4px)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm, 11px)',
            fontWeight: 600,
            zIndex: 1000,
          }}
        >
          Save
        </button>
      )}
    </div>
  )
}
