import { useEditorStore } from '@/store/editor.store'
import { useEffect, useRef, useState } from 'react'
import { UserProfile } from '@/ui/user-profile'

const statusBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'var(--font-size-xs)',
  padding: '0 var(--space-1)',
  borderRadius: 'var(--radius-sm)',
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200, 400, 800]

export function StatusBar() {
  const viewport = useEditorStore((s) => s.viewport)
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const activeTool = useEditorStore((s) => s.activeTool)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setPan = useEditorStore((s) => s.setPan)
  const zoomToFit = useEditorStore((s) => s.zoomToFit)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const toggleSnap = useEditorStore((s) => s.toggleSnap)
  const isDirty = useEditorStore((s) => s.isDirty)
  const touchMode = useEditorStore((s) => s.touchMode)
  const toggleTouchMode = useEditorStore((s) => s.toggleTouchMode)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [editingZoom, setEditingZoom] = useState(false)
  const [zoomInput, setZoomInput] = useState('')
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth)
  const settingsRef = useRef<HTMLDivElement>(null)
  const zoomDropdownRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  // Track portrait orientation
  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)')
    const handler = (e: MediaQueryListEvent) => setPortrait(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const docX = (e.clientX - viewport.panX) / viewport.zoom
        const docY = (e.clientY - viewport.panY) / viewport.zoom
        setCursorPos({ x: Math.round(docX), y: Math.round(docY) })
      })
    }
    window.addEventListener('mousemove', handler)
    return () => {
      window.removeEventListener('mousemove', handler)
      cancelAnimationFrame(rafRef.current)
    }
  }, [viewport.panX, viewport.panY, viewport.zoom])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [settingsOpen])

  // Close zoom dropdown when clicking outside or pressing Escape
  useEffect(() => {
    if (!zoomDropdownOpen) return
    const handleClick = (e: MouseEvent) => {
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(e.target as Node)) {
        setZoomDropdownOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomDropdownOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [zoomDropdownOpen])

  const layerCount = document.artboards.reduce((sum, a) => sum + a.layers.length, 0)
  const selCount = selection.layerIds.length

  return (
    <div
      style={{
        height: 24,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        gap: 'var(--space-4)',
        flexShrink: 0,
      }}
    >
      {!portrait && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: isDirty ? 'var(--warning)' : 'var(--success)',
          }}
          title={isDirty ? 'Document has unsaved changes' : 'All changes saved'}
        >
          <span style={{ fontSize: 8, lineHeight: 1 }}>●</span>
          {isDirty ? 'Unsaved' : 'Saved'}
        </span>
      )}
      {!portrait && (
        <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.2px' }}>
          X: {cursorPos.x} Y: {cursorPos.y}
        </span>
      )}
      <button
        onClick={() => setZoom(viewport.zoom / 1.25)}
        className="cd-hoverable"
        style={{ ...statusBtnStyle, color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}
      >
        -
      </button>
      <div ref={zoomDropdownRef} style={{ position: 'relative' }}>
        {editingZoom ? (
          <input
            autoFocus
            style={{
              width: 42,
              fontSize: 'var(--font-size-xs)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 var(--space-1)',
              textAlign: 'center',
              height: 18,
            }}
            value={zoomInput}
            onChange={(e) => setZoomInput(e.target.value)}
            onBlur={() => {
              const val = parseInt(zoomInput, 10)
              if (!isNaN(val) && val > 0) setZoom(val / 100)
              setEditingZoom(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = parseInt(zoomInput, 10)
                if (!isNaN(val) && val > 0) setZoom(val / 100)
                setEditingZoom(false)
              } else if (e.key === 'Escape') {
                setEditingZoom(false)
              }
            }}
          />
        ) : (
          <span
            style={{
              cursor: 'pointer',
              minWidth: 36,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              borderRadius: 'var(--radius-sm)',
              padding: '0 2px',
            }}
            onClick={() => setZoomDropdownOpen(!zoomDropdownOpen)}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setZoomDropdownOpen(false)
              setEditingZoom(true)
              setZoomInput(String(Math.round(viewport.zoom * 100)))
            }}
            className="cd-hoverable"
          >
            {Math.round(viewport.zoom * 100)}%
          </span>
        )}
        {zoomDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: 4,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '4px 0',
              minWidth: 140,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 1000,
            }}
          >
            {ZOOM_PRESETS.map((preset) => {
              const currentZoomPct = Math.round(viewport.zoom * 100)
              const isActive = currentZoomPct === preset
              return (
                <button
                  key={preset}
                  onClick={() => {
                    setZoom(preset / 100)
                    setZoomDropdownOpen(false)
                  }}
                  className="cd-hoverable"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    padding: '5px 12px',
                    border: 'none',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                    gap: 8,
                  }}
                >
                  <span style={{ width: 14, textAlign: 'center', fontSize: 10 }}>{isActive ? '\u2713' : ''}</span>
                  {preset}%
                </button>
              )
            })}
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <button
              onClick={() => {
                const canvas = window.document.querySelector<HTMLElement>('#canvas, [data-viewport]')
                if (canvas) {
                  const rect = canvas.getBoundingClientRect()
                  zoomToFit(rect.width, rect.height)
                }
                setZoomDropdownOpen(false)
              }}
              className="cd-hoverable"
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '5px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
                gap: 8,
              }}
            >
              <span style={{ width: 14 }} />
              Fit to Window
            </button>
            <button
              onClick={() => {
                setZoomDropdownOpen(false)
                setEditingZoom(true)
                setZoomInput(String(Math.round(viewport.zoom * 100)))
              }}
              className="cd-hoverable"
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '5px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
                gap: 8,
              }}
            >
              <span style={{ width: 14 }} />
              Custom...
            </button>
          </div>
        )}
      </div>
      <button
        onClick={() => setZoom(viewport.zoom * 1.25)}
        className="cd-hoverable"
        style={{ ...statusBtnStyle, color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}
      >
        +
      </button>
      {!portrait && (
        <button
          onClick={() => {
            setZoom(1)
            setPan(0, 0)
          }}
          title="Reset zoom"
          className="cd-hoverable"
          style={{ ...statusBtnStyle, color: 'var(--text-secondary)', fontSize: 9 }}
        >
          1:1
        </button>
      )}
      {!portrait && (
        <button
          onClick={toggleSnap}
          title={snapEnabled ? 'Snapping enabled (click to disable)' : 'Snapping disabled (click to enable)'}
          className="cd-hoverable"
          style={{
            ...statusBtnStyle,
            color: snapEnabled ? 'var(--accent)' : 'var(--text-secondary)',
            opacity: snapEnabled ? 1 : 0.5,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1C8.55 1 9 1.45 9 2V5.17C9.93 5.5 10.69 6.13 11.12 6.96L13.5 5.59C13.98 5.31 14.59 5.48 14.87 5.96C15.15 6.44 14.98 7.05 14.5 7.33L12.15 8.68C12.22 9.1 12.22 9.53 12.15 9.95L14.5 11.3C14.98 11.58 15.15 12.19 14.87 12.67C14.59 13.15 13.98 13.32 13.5 13.04L11.12 11.67C10.69 12.5 9.93 13.13 9 13.46V15.63C9 16.18 8.55 16.63 8 16.63C7.45 16.63 7 16.18 7 15.63V13.46C6.07 13.13 5.31 12.5 4.88 11.67L2.5 13.04C2.02 13.32 1.41 13.15 1.13 12.67C0.85 12.19 1.02 11.58 1.5 11.3L3.85 9.95C3.78 9.53 3.78 9.1 3.85 8.68L1.5 7.33C1.02 7.05 0.85 6.44 1.13 5.96C1.41 5.48 2.02 5.31 2.5 5.59L4.88 6.96C5.31 6.13 6.07 5.5 7 5.17V2C7 1.45 7.45 1 8 1ZM8 7.5C6.9 7.5 6 8.4 6 9.5C6 10.6 6.9 11.5 8 11.5C9.1 11.5 10 10.6 10 9.5C10 8.4 9.1 7.5 8 7.5Z" />
          </svg>
        </button>
      )}
      {!portrait && (
        <span style={{ fontWeight: 'var(--font-weight-medium)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {activeTool}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {!portrait && <span>{selCount > 0 ? `${selCount} selected` : `${layerCount} layers`}</span>}
      {!portrait && (
        <span>
          {document.artboards.length} artboard{document.artboards.length !== 1 ? 's' : ''}
        </span>
      )}

      <UserProfile />

      {/* Settings gear button with dropdown */}
      <div ref={settingsRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          title="Settings"
          className="cd-hoverable"
          style={{
            ...statusBtnStyle,
            color: settingsOpen ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {settingsOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 4,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px 0',
              minWidth: 180,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 1000,
            }}
          >
            <label
              className="cd-hoverable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 11,
                color: 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                checked={touchMode}
                onChange={toggleTouchMode}
                style={{ accentColor: 'var(--accent)', width: 14, height: 14, cursor: 'pointer' }}
              />
              <span>Touch Mode</span>
              {touchMode && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginLeft: 'auto', color: 'var(--accent)' }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </label>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            <div style={{ padding: '4px 12px', fontSize: 9, color: 'var(--text-secondary)' }}>
              Enable touch gestures, pinch-to-zoom,{'\n'}
              stylus pressure, and enlarged hit targets.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
