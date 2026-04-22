import { useEffect, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Viewport } from '@/render/viewport'
import { Toolbar } from '@/ui/toolbar'
import { CanvasContextMenu } from '@/ui/context-menu'
import { StatusBar } from '@/ui/status-bar'
import { MenuBar } from '@/ui/menu-bar'
import { setupKeyboardShortcuts } from '@/ui/keyboard'
import { PanelShell } from '@/ui/panels/panel-shell'
import { ToolOptionsBar } from '@/ui/tool-options-bar'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'
import { decodeDocument, encodeDocument } from '@/io/file-format'
import { exportArtboardToBlob } from '@/io/raster-export'
import type { RasterLayer } from '@/types'
import {
  EMBED_FLAG_PARAM,
  EMBED_MODE_PARAM,
  type EditorMode,
  type ExportFormat,
  type FrameMessage,
  type HostMessage,
} from './embed-protocol'

// Mirrors packages/editor-core/src/mode-config.ts so the iframe can self-configure
// without pulling in the host-side package. Keep in sync if the source changes.
interface ModeConfig {
  tools: string[]
  panels: string[]
  menuBar: boolean
  statusBar: boolean
  breakpointBar: boolean
  toolOptionsBar: boolean
  maxFileSize: number
}

const FULL_MODE: ModeConfig = {
  tools: [
    'select',
    'direct-select',
    'pen',
    'pencil',
    'rectangle',
    'ellipse',
    'polygon',
    'star',
    'text',
    'artboard',
    'hand',
    'zoom',
    'eyedropper',
    'paint-bucket',
    'eraser',
    'brush',
    'shape-builder',
    'blend',
    'slice',
    'measure',
  ],
  panels: [
    'layers',
    'properties',
    'history',
    'symbols',
    'variables',
    'styles',
    'preferences',
    'dev-mode',
    'cloud',
    'library',
    'pngtuber',
  ],
  menuBar: true,
  statusBar: true,
  breakpointBar: true,
  toolOptionsBar: true,
  maxFileSize: 0,
}

const PNGTUBER_MODE: ModeConfig = {
  tools: [
    'select',
    'direct-select',
    'pen',
    'pencil',
    'rectangle',
    'ellipse',
    'polygon',
    'star',
    'text',
    'hand',
    'zoom',
    'eyedropper',
    'paint-bucket',
    'eraser',
    'brush',
  ],
  panels: ['layers', 'properties', 'pngtuber'],
  menuBar: false,
  statusBar: false,
  breakpointBar: false,
  toolOptionsBar: true,
  maxFileSize: 2_000_000,
}

const ATTACHMENT_MODE: ModeConfig = {
  tools: [
    'select',
    'hand',
    'zoom',
    'crop',
    'eyedropper',
    'brush',
    'pencil',
    'line',
    'eraser',
    'fill',
    'text',
    'rectangle',
    'ellipse',
  ],
  panels: [],
  menuBar: false,
  statusBar: false,
  breakpointBar: false,
  toolOptionsBar: true,
  maxFileSize: 25_000_000,
}

function getModeConfig(mode: EditorMode): ModeConfig {
  if (mode === 'pngtuber') return PNGTUBER_MODE
  if (mode === 'attachment') return ATTACHMENT_MODE
  return FULL_MODE
}

function toUint8(bytes: ArrayBuffer | Uint8Array | number[]): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes)
  return new Uint8Array(bytes)
}

function post(msg: FrameMessage, targetOrigin = '*') {
  window.parent.postMessage(msg, targetOrigin)
}

async function loadImageIntoDocument(bytes: Uint8Array, name?: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer])
  const bitmap = await createImageBitmap(blob)
  const w = bitmap.width
  const h = bitmap.height
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  bitmap.close()

  const chunkId = uuid()
  storeRasterData(chunkId, imageData)

  const store = useEditorStore.getState()
  store.newDocument({ title: name ?? 'Attachment', width: w, height: h })

  const artboard = getActiveArtboard()
  if (!artboard) return false

  const layer: RasterLayer = {
    id: uuid(),
    name: name ?? 'Image',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: w,
    height: h,
  }
  store.addLayer(artboard.id, layer)
  store.selectLayer(layer.id)
  useEditorStore.setState({ isDirty: false })
  return true
}

async function exportCurrentArtboard(format: ExportFormat = 'png', quality?: number, scale = 1) {
  const doc = useEditorStore.getState().document
  const blob = await exportArtboardToBlob(doc, { format, quality, scale })
  const buf = await blob.arrayBuffer()
  return { bytes: Array.from(new Uint8Array(buf)), mimeType: blob.type || `image/${format}` }
}

function resolveInitialMode(): EditorMode {
  const params = new URLSearchParams(window.location.search)
  const raw = params.get(EMBED_MODE_PARAM)
  if (raw === 'pngtuber' || raw === 'attachment' || raw === 'full') return raw
  return 'full'
}

/** Parent origin discovered from the first inbound message (kept for replies). */
let parentOrigin = '*'

export function EmbedApp() {
  const [mode, setMode] = useState<EditorMode>(resolveInitialMode)
  const modeConfig = getModeConfig(mode)
  const [ready, setReady] = useState(false)
  const [imageName, setImageName] = useState<string | undefined>(undefined)
  const announcedReady = useRef(false)

  useEffect(() => {
    if (ready) return
    // Start with a transparent 512x512 canvas so the editor is interactive
    // before the host ships an initial image.
    const store = useEditorStore.getState()
    store.newDocument({
      title: 'Embed',
      width: 512,
      height: 512,
      colorspace: 'srgb',
      backgroundColor: '#ffffff',
      dpi: 72,
    })
    setupKeyboardShortcuts()
    setReady(true)
  }, [ready])

  // Broadcast ready once the React tree has mounted and the store is primed.
  useEffect(() => {
    if (!ready || announcedReady.current) return
    announcedReady.current = true
    post({ type: 'crossdraw:ready' })
  }, [ready])

  // Forward dirty-state changes to the host so it can enable a Save CTA.
  useEffect(() => {
    let last = useEditorStore.getState().isDirty
    return useEditorStore.subscribe((state) => {
      if (state.isDirty !== last) {
        last = state.isDirty
        post({ type: 'crossdraw:dirty-changed', payload: { dirty: last } }, parentOrigin)
      }
    })
  }, [])

  // Handle inbound messages from the host.
  useEffect(() => {
    const handler = async (event: MessageEvent<HostMessage>) => {
      const data = event.data
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
      if (!data.type.startsWith('crossdraw:')) return

      // Remember origin of the first parent message for targeted replies.
      if (parentOrigin === '*' && event.origin && event.origin !== 'null') {
        parentOrigin = event.origin
      }

      switch (data.type) {
        case 'crossdraw:config': {
          if (data.payload?.mode) setMode(data.payload.mode)
          if (data.payload?.theme) {
            for (const [k, v] of Object.entries(data.payload.theme)) {
              document.documentElement.style.setProperty(k, v)
            }
          }
          break
        }
        case 'crossdraw:load-image': {
          const bytes = toUint8(data.payload.bytes)
          setImageName(data.payload.name)
          await loadImageIntoDocument(bytes, data.payload.name)
          break
        }
        case 'crossdraw:load': {
          const bytes = toUint8(data.payload.buffer).buffer as ArrayBuffer
          const doc = decodeDocument(bytes)
          useEditorStore.setState({
            document: doc,
            history: [],
            historyIndex: -1,
            selection: { layerIds: [] },
            isDirty: false,
            filePath: null,
          })
          break
        }
        case 'crossdraw:export-image': {
          const { bytes, mimeType } = await exportCurrentArtboard(
            data.payload?.format ?? 'png',
            data.payload?.quality,
            data.payload?.scale ?? 1,
          )
          post({ type: 'crossdraw:exported', payload: { bytes, mimeType } }, parentOrigin)
          break
        }
        case 'crossdraw:export': {
          const doc = useEditorStore.getState().document
          const buffer = encodeDocument(doc)
          post({ type: 'crossdraw:save', payload: { buffer: Array.from(new Uint8Array(buffer)) } }, parentOrigin)
          break
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const onDone = async () => {
    const { bytes, mimeType } = await exportCurrentArtboard('png')
    post({ type: 'crossdraw:save-image', payload: { bytes, mimeType, name: imageName } }, parentOrigin)
  }

  const onCancel = () => post({ type: 'crossdraw:cancel' }, parentOrigin)

  if (!ready) {
    return <div style={loadingStyle}>Loading editor…</div>
  }

  return (
    <div style={rootStyle}>
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

      {mode === 'attachment' && (
        <div style={ctaBarStyle}>
          <button style={cancelBtnStyle} onClick={onCancel}>
            Cancel
          </button>
          <button style={doneBtnStyle} onClick={onDone}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--bg-base, #0e0e0e)',
  color: 'var(--text-primary, #e0e0e0)',
  fontFamily: 'var(--font-body, sans-serif)',
  fontSize: 'var(--font-size-base, 12px)',
}

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  background: 'var(--bg-base, #0e0e0e)',
  color: 'var(--text-secondary, #999)',
  fontFamily: 'var(--font-body, sans-serif)',
  fontSize: 12,
}

const ctaBarStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  display: 'flex',
  gap: 8,
  zIndex: 1000,
}

const doneBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: 'var(--accent, #4a9eff)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-md, 6px)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
}

const cancelBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'var(--bg-secondary, rgba(0,0,0,0.35))',
  color: 'var(--text-primary, #e0e0e0)',
  border: '1px solid var(--border-color, rgba(255,255,255,0.12))',
  borderRadius: 'var(--radius-md, 6px)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
}

export function isEmbedMode(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get(EMBED_FLAG_PARAM) === 'true' || params.get(EMBED_FLAG_PARAM) === '1'
}
