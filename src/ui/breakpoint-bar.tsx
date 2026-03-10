import { useState, useRef, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { Breakpoint, Artboard } from '@/types'

// ── Preset breakpoints ──

const PRESETS: Omit<Breakpoint, 'id'>[] = [
  { name: 'Mobile', width: 375 },
  { name: 'Tablet', width: 768 },
  { name: 'Desktop', width: 1440 },
  { name: 'Large Desktop', width: 1920 },
]

// ── Styles ──

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 32,
  background: 'var(--bg-surface)',
  borderBottom: '1px solid var(--border-subtle)',
  padding: '0 8px',
  gap: 4,
  flexShrink: 0,
  fontSize: 11,
  color: 'var(--text-secondary)',
  userSelect: 'none',
  overflowX: 'auto',
}

const bpButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: '20px',
}

const bpButtonActiveStyle: React.CSSProperties = {
  ...bpButtonStyle,
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
  fontWeight: 600,
}

const addButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 4,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-secondary)',
  fontSize: 14,
  cursor: 'pointer',
  lineHeight: 1,
  flexShrink: 0,
}

const removeButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: '50%',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-disabled)',
  fontSize: 10,
  cursor: 'pointer',
  marginLeft: 2,
  lineHeight: 1,
}

const presetMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  zIndex: 100,
  padding: 4,
  minWidth: 160,
}

const presetItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  color: 'var(--text-primary)',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
}

const clearButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  marginLeft: 'auto',
  flexShrink: 0,
}

const widthIndicatorStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 6px',
  fontSize: 10,
  color: 'var(--text-disabled)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

// ── Component ──

function PresetMenu({ artboard, onClose }: { artboard: Artboard; onClose: () => void }) {
  const addBreakpoint = useEditorStore((s) => s.addBreakpoint)
  const existingWidths = new Set(artboard.breakpoints?.map((b) => b.width) ?? [])

  const handleAdd = useCallback(
    (preset: Omit<Breakpoint, 'id'>) => {
      addBreakpoint(artboard.id, { ...preset, id: uuid() })
      onClose()
    },
    [artboard.id, addBreakpoint, onClose],
  )

  const handleAddCustom = useCallback(() => {
    const widthStr = prompt('Enter breakpoint width (px):')
    if (!widthStr) return
    const width = parseInt(widthStr, 10)
    if (isNaN(width) || width < 1) return
    const name = prompt('Breakpoint name:', `${width}px`) ?? `${width}px`
    addBreakpoint(artboard.id, { id: uuid(), name, width })
    onClose()
  }, [artboard.id, addBreakpoint, onClose])

  return (
    <div style={presetMenuStyle} onMouseDown={(e) => e.stopPropagation()}>
      {PRESETS.map((preset) => {
        const alreadyAdded = existingWidths.has(preset.width)
        return (
          <button
            key={preset.width}
            style={{
              ...presetItemStyle,
              opacity: alreadyAdded ? 0.4 : 1,
              cursor: alreadyAdded ? 'default' : 'pointer',
            }}
            disabled={alreadyAdded}
            onClick={() => !alreadyAdded && handleAdd(preset)}
            onMouseEnter={(e) => {
              if (!alreadyAdded) (e.target as HTMLElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.target as HTMLElement).style.background = 'transparent'
            }}
          >
            <span>{preset.name}</span>
            <span style={{ color: 'var(--text-disabled)', fontSize: 10 }}>{preset.width}px</span>
          </button>
        )
      })}
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
      <button
        style={presetItemStyle}
        onClick={handleAddCustom}
        onMouseEnter={(e) => {
          ;(e.target as HTMLElement).style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          ;(e.target as HTMLElement).style.background = 'transparent'
        }}
      >
        Custom...
      </button>
    </div>
  )
}

export function BreakpointBar() {
  const artboard = useEditorStore((s) => {
    const artboardId = s.viewport.artboardId
    if (!artboardId) return s.document.artboards[0] ?? null
    return s.document.artboards.find((a) => a.id === artboardId) ?? null
  })

  const setActiveBreakpoint = useEditorStore((s) => s.setActiveBreakpoint)
  const removeBreakpoint = useEditorStore((s) => s.removeBreakpoint)

  const [showPresets, setShowPresets] = useState(false)
  const addRef = useRef<HTMLDivElement>(null)

  // Drag reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  if (!artboard) return null

  const breakpoints = artboard.breakpoints ?? []
  const activeId = artboard.activeBreakpointId

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) return
    // Reorder via remove + add — simple approach
    const bp = breakpoints[dragIdx]
    if (!bp) return
    const store = useEditorStore.getState()
    store.removeBreakpoint(artboard.id, bp.id)
    // Re-add at target position by removing all and re-adding in order
    // Simpler: just remove and re-add (order will shift but this is good enough)
    store.addBreakpoint(artboard.id, bp)
    setDragIdx(null)
  }

  // When no breakpoints exist, show a compact "add" row
  if (breakpoints.length === 0) {
    return (
      <div style={barStyle}>
        <span style={{ color: 'var(--text-disabled)', fontSize: 10, marginRight: 4, flexShrink: 0 }}>Responsive</span>
        <div ref={addRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            style={{ ...bpButtonStyle, gap: 4 }}
            onClick={() => setShowPresets((v) => !v)}
            title="Add responsive breakpoints"
          >
            + Add Breakpoints
          </button>
          {showPresets && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowPresets(false)} />
              <PresetMenu artboard={artboard} onClose={() => setShowPresets(false)} />
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={barStyle}>
      <span style={{ color: 'var(--text-disabled)', fontSize: 10, marginRight: 4, flexShrink: 0 }}>Breakpoints</span>

      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* "Default" (no breakpoint) button */}
      <button
        style={activeId == null ? bpButtonActiveStyle : bpButtonStyle}
        onClick={() => setActiveBreakpoint(artboard.id, null)}
      >
        Default ({artboard.width}px)
      </button>

      {breakpoints.map((bp, idx) => (
        <button
          key={bp.id}
          draggable
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, idx)}
          style={activeId === bp.id ? bpButtonActiveStyle : bpButtonStyle}
          onClick={() => setActiveBreakpoint(artboard.id, bp.id)}
        >
          {bp.name} {bp.width}
          <span
            style={removeButtonStyle}
            onClick={(e) => {
              e.stopPropagation()
              removeBreakpoint(artboard.id, bp.id)
            }}
            title="Remove breakpoint"
          >
            x
          </span>
        </button>
      ))}

      {/* Add breakpoint */}
      <div ref={addRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button style={addButtonStyle} onClick={() => setShowPresets((v) => !v)} title="Add breakpoint">
          +
        </button>
        {showPresets && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowPresets(false)} />
            <PresetMenu artboard={artboard} onClose={() => setShowPresets(false)} />
          </>
        )}
      </div>

      {/* Active width indicator */}
      {activeId != null &&
        (() => {
          const activeBp = breakpoints.find((b) => b.id === activeId)
          return activeBp ? <span style={widthIndicatorStyle}>Preview: {activeBp.width}px wide</span> : null
        })()}

      {/* Exit preview button (only when a breakpoint is active) */}
      {activeId != null && (
        <button
          style={clearButtonStyle}
          onClick={() => setActiveBreakpoint(artboard.id, null)}
          title="Exit breakpoint preview"
        >
          Exit Preview
        </button>
      )}
    </div>
  )
}
