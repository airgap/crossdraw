import { useEditorStore } from '@/store/editor.store'
import { useCallback, useEffect, useRef, useState } from 'react'
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
        height: touchMode ? 40 : 24,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-2)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        gap: touchMode ? 'var(--space-2)' : 'var(--space-4)',
        flexShrink: 0,
      }}
    >
      {touchMode && <TouchUndoRedo />}
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

// ---------------------------------------------------------------------------
// Touch undo/redo buttons with long-press history dropdown
// ---------------------------------------------------------------------------

const LONG_PRESS_MS = 400

const touchUndoBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 32,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-input)',
  cursor: 'pointer',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

function TouchUndoRedo() {
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const canUndo = useEditorStore((s) => s.canUndo())
  const canRedo = useEditorStore((s) => s.canRedo())
  const history = useEditorStore((s) => s.history)
  const historyIndex = useEditorStore((s) => s.historyIndex)
  const [showHistory, setShowHistory] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside tap
  useEffect(() => {
    if (!showHistory) return
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [showHistory])

  const clearLongPress = useCallback(() => {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }, [])

  const handleUndoDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    didLongPressRef.current = false
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null
      didLongPressRef.current = true
      setShowHistory(true)
    }, LONG_PRESS_MS)
  }, [])

  const handleUndoUp = useCallback(() => {
    clearLongPress()
    if (!didLongPressRef.current && canUndo) {
      undo()
    }
  }, [clearLongPress, canUndo, undo])

  const handleUndoCancel = useCallback(() => {
    clearLongPress()
  }, [clearLongPress])

  const jumpTo = useCallback((targetIndex: number) => {
    const current = useEditorStore.getState().historyIndex
    const u = useEditorStore.getState().undo
    const r = useEditorStore.getState().redo
    if (targetIndex < current) {
      for (let i = current; i > targetIndex; i--) u()
    } else if (targetIndex > current) {
      for (let i = current; i < targetIndex; i++) r()
    }
    setShowHistory(false)
  }, [])

  return (
    <div ref={containerRef} style={{ display: 'flex', gap: 2, position: 'relative' }}>
      {/* Undo button — long press opens history */}
      <button
        onPointerDown={handleUndoDown}
        onPointerUp={handleUndoUp}
        onPointerCancel={handleUndoCancel}
        onPointerLeave={handleUndoCancel}
        disabled={!canUndo && !history.length}
        style={{
          ...touchUndoBtnStyle,
          color: canUndo ? 'var(--text-primary)' : 'var(--text-disabled)',
          opacity: canUndo ? 1 : 0.4,
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
        }}
        title="Undo (hold for history)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>

      {/* Redo button */}
      <button
        onPointerUp={() => canRedo && redo()}
        disabled={!canRedo}
        style={{
          ...touchUndoBtnStyle,
          color: canRedo ? 'var(--text-primary)' : 'var(--text-disabled)',
          opacity: canRedo ? 1 : 0.4,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderLeft: 'none',
        }}
        title="Redo"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </button>

      {/* History dropdown */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-lg)',
            padding: '4px 0',
            minWidth: 200,
            maxWidth: 280,
            maxHeight: 320,
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            zIndex: 1000,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Initial state */}
          <HistoryDropdownItem
            label="Initial State"
            isActive={historyIndex === -1}
            isFuture={false}
            onTap={() => jumpTo(-1)}
          />
          {history.map((entry, i) => (
            <HistoryDropdownItem
              key={i}
              label={entry.description}
              isActive={i === historyIndex}
              isFuture={i > historyIndex}
              onTap={() => jumpTo(i)}
            />
          ))}
          {history.length === 0 && (
            <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
              No history yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryDropdownItem({
  label,
  isActive,
  isFuture,
  onTap,
}: {
  label: string
  isActive: boolean
  isFuture: boolean
  onTap: () => void
}) {
  return (
    <button
      onPointerUp={onTap}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '8px 12px',
        border: 'none',
        background: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? '#fff' : isFuture ? 'var(--text-disabled)' : 'var(--text-primary)',
        opacity: isFuture ? 0.5 : 1,
        fontSize: 12,
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  )
}
