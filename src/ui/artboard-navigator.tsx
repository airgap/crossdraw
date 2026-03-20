import { useState, useCallback } from 'react'
import { produce } from 'immer'
import { useEditorStore } from '@/store/editor.store'
import type { DesignDocument } from '@/types'

export function ArtboardNavigator() {
  const artboards = useEditorStore((s) => s.document.artboards)
  const viewport = useEditorStore((s) => s.viewport)
  const showRulers = useEditorStore((s) => s.showRulers)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const addArtboard = useEditorStore((s) => s.addArtboard)
  const deleteArtboard = useEditorStore((s) => s.deleteArtboard)
  const addInfiniteArtboard = useEditorStore((s) => s.addInfiniteArtboard)
  const switchTab = useEditorStore((s) => s.switchTab)
  const setPan = useEditorStore((s) => s.setPan)
  const setZoom = useEditorStore((s) => s.setZoom)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const renameArtboard = useCallback((id: string, name: string) => {
    const store = useEditorStore.getState()
    useEditorStore.setState({
      document: produce(store.document, (draft: DesignDocument) => {
        const ab = draft.artboards.find((a) => a.id === id)
        if (ab) ab.name = name
      }),
      isDirty: true,
    })
  }, [])

  function handleStartRename(artboardId: string, currentName: string) {
    setEditingId(artboardId)
    setEditName(currentName)
  }

  function handleFinishRename(artboardId: string) {
    const trimmed = editName.trim()
    if (trimmed) {
      const artboard = artboards.find((a) => a.id === artboardId)
      if (artboard && trimmed !== artboard.name) {
        renameArtboard(artboardId, trimmed)
      }
    }
    setEditingId(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, artboardId: string) {
    if (e.key === 'Enter') {
      handleFinishRename(artboardId)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  function handleAddArtboard() {
    const count = artboards.length
    addArtboard(`Artboard ${count + 1}`, 1920, 1080)
  }

  function handleAddInfiniteArtboard() {
    const count = artboards.filter((a) => a.isInfinite).length
    addInfiniteArtboard(`Infinite Canvas ${count + 1}`)
  }

  /**
   * Pan the viewport so the given artboard is centered on screen.
   * Uses the current canvas element dimensions for calculation.
   */
  function panToArtboard(artboard: { x: number; y: number; width: number; height: number }) {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const rulerSize = showRulers ? 20 : 0
    const availW = rect.width - rulerSize
    const availH = rect.height - rulerSize
    const zoom = viewport.zoom

    // Center the artboard in the available viewport area
    const centerX = artboard.x + artboard.width / 2
    const centerY = artboard.y + artboard.height / 2
    const panX = rulerSize + availW / 2 - centerX * zoom
    const panY = rulerSize + availH / 2 - centerY * zoom
    setPan(panX, panY)
  }

  /**
   * Zoom-to-fit: adjust zoom so the artboard fills ~80% of the viewport, then center it.
   */
  function zoomToFitArtboard(artboard: { x: number; y: number; width: number; height: number }) {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const rulerSize = showRulers ? 20 : 0
    const availW = rect.width - rulerSize
    const availH = rect.height - rulerSize
    if (availW <= 0 || availH <= 0) return

    const scale = Math.min((availW * 0.8) / artboard.width, (availH * 0.8) / artboard.height, 10)
    setZoom(scale)

    // After setting zoom, compute pan to center
    const centerX = artboard.x + artboard.width / 2
    const centerY = artboard.y + artboard.height / 2
    const panX = rulerSize + availW / 2 - centerX * scale
    const panY = rulerSize + availH / 2 - centerY * scale
    setPan(panX, panY)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Add Artboard button */}
      <div style={{ padding: 'var(--space-2, 8px)' }}>
        <button
          onClick={handleAddArtboard}
          style={{
            width: '100%',
            padding: '6px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'var(--accent)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm, 12px)',
          }}
        >
          Add Artboard
        </button>
        <button
          onClick={handleAddInfiniteArtboard}
          style={{
            width: '100%',
            marginTop: 4,
            padding: '6px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm, 12px)',
          }}
        >
          ∞ Add Infinite Canvas
        </button>
      </div>

      {/* Artboards list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1, 4px)' }}>
        {artboards.length === 0 && (
          <div
            style={{
              padding: '16px 8px',
              textAlign: 'center',
              fontSize: 'var(--font-size-sm, 12px)',
              color: 'var(--text-tertiary)',
            }}
          >
            No artboards
          </div>
        )}

        {artboards.map((ab) => {
          const isActive = ab.isInfinite ? activeTabId === ab.id : viewport.artboardId === ab.id

          return (
            <div
              key={ab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm, 4px)',
                marginBottom: 2,
                background: isActive ? 'var(--bg-selected, rgba(59,130,246,0.12))' : 'transparent',
                borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onClick={() => (ab.isInfinite ? switchTab(ab.id) : panToArtboard(ab))}
              onDoubleClick={() => (ab.isInfinite ? undefined : zoomToFitArtboard(ab))}
              onMouseEnter={(e) => {
                if (!isActive) {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = isActive
                  ? 'var(--bg-selected, rgba(59,130,246,0.12))'
                  : 'transparent'
              }}
            >
              {/* Artboard name + info */}
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                {editingId === ab.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleFinishRename(ab.id)}
                    onKeyDown={(e) => handleRenameKeyDown(e, ab.id)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '2px 4px',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm, 4px)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--font-size-sm, 12px)',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartRename(ab.id, ab.name)
                    }}
                    title="Click to rename"
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-size-sm, 12px)',
                      color: 'var(--text-primary)',
                      cursor: 'text',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ab.isInfinite && <span style={{ marginRight: 4 }}>∞</span>}
                    {ab.name}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {ab.isInfinite ? 'Infinite' : `${ab.width} x ${ab.height}`} &middot; ({Math.round(ab.x)},{' '}
                  {Math.round(ab.y)})
                </span>
              </div>

              {/* Delete button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteArtboard(ab.id)
                }}
                disabled={artboards.length <= 1}
                title={artboards.length <= 1 ? 'Cannot delete the only artboard' : 'Delete artboard'}
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  background: 'transparent',
                  color: artboards.length <= 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  cursor: artboards.length <= 1 ? 'default' : 'pointer',
                  fontSize: 11,
                  flexShrink: 0,
                  opacity: artboards.length <= 1 ? 0.4 : 1,
                }}
              >
                Delete
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
