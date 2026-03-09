import { useState } from 'react'
import { useEditorStore } from '@/store/editor.store'

export function GuidesPanel() {
  const document = useEditorStore((s) => s.document)
  const viewport = useEditorStore((s) => s.viewport)
  const addGuide = useEditorStore((s) => s.addGuide)
  const removeGuide = useEditorStore((s) => s.removeGuide)
  const updateGuide = useEditorStore((s) => s.updateGuide)
  const clearGuides = useEditorStore((s) => s.clearGuides)

  const [hInput, setHInput] = useState('')
  const [vInput, setVInput] = useState('')
  const [editingGuide, setEditingGuide] = useState<{
    axis: 'horizontal' | 'vertical'
    index: number
  } | null>(null)
  const [editValue, setEditValue] = useState('')

  const activeArtboardId = viewport.artboardId ?? document.artboards[0]?.id
  const artboard = document.artboards.find((a) => a.id === activeArtboardId)

  if (!artboard) {
    return (
      <div
        style={{
          padding: '16px 8px',
          textAlign: 'center',
          fontSize: 'var(--font-size-sm, 12px)',
          color: 'var(--text-tertiary)',
        }}
      >
        No artboard selected
      </div>
    )
  }

  const guides = artboard.guides ?? { horizontal: [], vertical: [] }
  const totalGuides = guides.horizontal.length + guides.vertical.length

  function handleAddGuide(axis: 'horizontal' | 'vertical') {
    const input = axis === 'horizontal' ? hInput : vInput
    const value = parseFloat(input)
    if (isNaN(value) || !activeArtboardId) return
    addGuide(activeArtboardId, axis, value)
    if (axis === 'horizontal') setHInput('')
    else setVInput('')
  }

  function handleAddCenterGuide(axis: 'horizontal' | 'vertical') {
    if (!activeArtboardId || !artboard) return
    const center = axis === 'horizontal' ? artboard.height / 2 : artboard.width / 2
    addGuide(activeArtboardId, axis, center)
  }

  function handleStartEdit(axis: 'horizontal' | 'vertical', index: number, currentValue: number) {
    setEditingGuide({ axis, index })
    setEditValue(String(currentValue))
  }

  function handleFinishEdit() {
    if (!editingGuide || !activeArtboardId) {
      setEditingGuide(null)
      return
    }
    const value = parseFloat(editValue)
    if (!isNaN(value)) {
      updateGuide(activeArtboardId, editingGuide.axis, editingGuide.index, value)
    }
    setEditingGuide(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleFinishEdit()
    } else if (e.key === 'Escape') {
      setEditingGuide(null)
    }
  }

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    padding: '4px 6px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: 'var(--font-size-sm, 12px)',
    outline: 'none',
  }

  const smallBtnStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 11,
    flexShrink: 0,
  }

  const accentBtnStyle: React.CSSProperties = {
    ...smallBtnStyle,
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
  }

  const deleteBtnStyle: React.CSSProperties = {
    padding: '2px 6px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 11,
    flexShrink: 0,
  }

  function renderGuideList(axis: 'horizontal' | 'vertical', values: number[]) {
    if (values.length === 0) {
      return (
        <div
          style={{
            fontSize: 'var(--font-size-sm, 12px)',
            color: 'var(--text-tertiary)',
            padding: '4px 0',
            fontStyle: 'italic',
          }}
        >
          No {axis} guides
        </div>
      )
    }

    return values.map((val, index) => {
      const isEditing = editingGuide !== null && editingGuide.axis === axis && editingGuide.index === index

      return (
        <div
          key={`${axis}-${index}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 4px',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          {isEditing ? (
            <input
              autoFocus
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={handleEditKeyDown}
              style={{
                ...inputStyle,
                width: 80,
                flex: 'none',
              }}
            />
          ) : (
            <span
              onClick={() => handleStartEdit(axis, index, val)}
              title="Click to edit position"
              style={{
                flex: 1,
                fontSize: 'var(--font-size-sm, 12px)',
                color: 'var(--text-primary)',
                cursor: 'text',
                fontFamily: 'monospace',
              }}
            >
              {val}px
            </span>
          )}

          <button
            onClick={() => {
              if (activeArtboardId) removeGuide(activeArtboardId, axis, index)
            }}
            title="Remove guide"
            style={deleteBtnStyle}
          >
            &times;
          </button>
        </div>
      )
    })
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2, 8px)' }}>
        {/* Artboard info */}
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          {artboard.name} ({artboard.width} &times; {artboard.height})
        </div>

        {/* Horizontal Guides */}
        <div style={{ marginBottom: 12 }}>
          <div style={sectionHeaderStyle}>Horizontal Guides</div>

          {renderGuideList('horizontal', guides.horizontal)}

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input
              type="number"
              placeholder="Y position"
              value={hInput}
              onChange={(e) => setHInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddGuide('horizontal')
              }}
              style={inputStyle}
            />
            <button onClick={() => handleAddGuide('horizontal')} style={accentBtnStyle} title="Add horizontal guide">
              Add
            </button>
          </div>

          <button
            onClick={() => handleAddCenterGuide('horizontal')}
            style={{ ...smallBtnStyle, width: '100%', marginTop: 4, textAlign: 'center' }}
            title={`Add guide at Y=${artboard.height / 2}`}
          >
            Add at Center (Y={artboard.height / 2})
          </button>
        </div>

        {/* Vertical Guides */}
        <div style={{ marginBottom: 12 }}>
          <div style={sectionHeaderStyle}>Vertical Guides</div>

          {renderGuideList('vertical', guides.vertical)}

          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <input
              type="number"
              placeholder="X position"
              value={vInput}
              onChange={(e) => setVInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddGuide('vertical')
              }}
              style={inputStyle}
            />
            <button onClick={() => handleAddGuide('vertical')} style={accentBtnStyle} title="Add vertical guide">
              Add
            </button>
          </div>

          <button
            onClick={() => handleAddCenterGuide('vertical')}
            style={{ ...smallBtnStyle, width: '100%', marginTop: 4, textAlign: 'center' }}
            title={`Add guide at X=${artboard.width / 2}`}
          >
            Add at Center (X={artboard.width / 2})
          </button>
        </div>

        {/* Clear All */}
        {totalGuides > 0 && (
          <button
            onClick={() => {
              if (activeArtboardId) clearGuides(activeArtboardId)
            }}
            style={{
              width: '100%',
              padding: '6px 12px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-sm, 12px)',
            }}
            title="Remove all guides from this artboard"
          >
            Clear All Guides ({totalGuides})
          </button>
        )}
      </div>
    </div>
  )
}
