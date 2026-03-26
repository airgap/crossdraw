import { useState, useCallback, useRef } from 'react'
import {
  getThemePreference,
  setTheme,
  getAllThemes,
  isBuiltinTheme,
  getCanvasBg,
  getCanvasBgOverride,
  setCanvasBgOverride,
  clearCanvasBgOverride,
  type ThemePreference,
} from '@/ui/theme'
import { getToolbarOrder, saveToolbarOrder, resetToolbarOrder, toolLabel } from '@/ui/toolbar'

interface Props {
  onClose: () => void
}

export function UISettings({ onClose }: Props) {
  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference())
  const [canvasBg, setCanvasBgLocal] = useState(getCanvasBg)
  const [hasOverride, setHasOverride] = useState(() => getCanvasBgOverride() !== null)
  const allThemes = getAllThemes()

  const handleThemeChange = (name: string) => {
    setTheme(name)
    setThemePref(name)
    // Update canvas bg display if no override
    if (!getCanvasBgOverride()) {
      setCanvasBgLocal(getCanvasBg())
    }
  }

  const handleCanvasBgChange = (color: string) => {
    setCanvasBgOverride(color)
    setCanvasBgLocal(color)
    setHasOverride(true)
  }

  const handleCanvasBgReset = () => {
    clearCanvasBgOverride()
    setCanvasBgLocal(getCanvasBg())
    setHasOverride(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          width: 380,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            UI Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            {'\u00D7'}
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-4)' }}>
          {/* Theme section */}
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginBottom: 8,
              letterSpacing: '0.5px',
            }}
          >
            Theme
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
            <ThemeOption
              label="System"
              active={themePref === 'system'}
              preview={{ bg: '#0e0e0e', surface: '#f5f5f5', text: '#e0e0e0' }}
              onClick={() => handleThemeChange('system')}
            />
            <ThemeOption
              label="Dark"
              active={themePref === 'dark'}
              preview={{ bg: '#0e0e0e', surface: '#161616', text: '#e0e0e0' }}
              onClick={() => handleThemeChange('dark')}
            />
            <ThemeOption
              label="Light"
              active={themePref === 'light'}
              preview={{ bg: '#f5f5f5', surface: '#ffffff', text: '#1a1a1a' }}
              onClick={() => handleThemeChange('light')}
            />
            <ThemeOption
              label="Nord Dark"
              active={themePref === 'Nord Dark'}
              preview={{ bg: '#2e3440', surface: '#3b4252', text: '#eceff4' }}
              onClick={() => handleThemeChange('Nord Dark')}
            />
            <ThemeOption
              label="Nord Light"
              active={themePref === 'Nord Light'}
              preview={{ bg: '#eceff4', surface: '#e5e9f0', text: '#2e3440' }}
              onClick={() => handleThemeChange('Nord Light')}
            />
            <ThemeOption
              label="Black"
              active={themePref === 'Black'}
              preview={{ bg: '#000000', surface: '#0a0a0a', text: '#e0e0e0' }}
              onClick={() => handleThemeChange('Black')}
            />
            {allThemes
              .filter((t) => !isBuiltinTheme(t.name))
              .map((t) => (
                <ThemeOption
                  key={t.name}
                  label={t.name}
                  active={themePref === t.name}
                  preview={{ bg: t.bgBase, surface: t.bgSurface, text: t.textPrimary }}
                  onClick={() => handleThemeChange(t.name)}
                />
              ))}
          </div>

          {/* Canvas background */}
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-4)',
              marginBottom: 8,
              letterSpacing: '0.5px',
            }}
          >
            Canvas Background
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              type="color"
              value={canvasBg}
              onChange={(e) => handleCanvasBgChange(e.target.value)}
              style={{
                width: 28,
                height: 28,
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: 0,
                cursor: 'pointer',
                background: 'none',
              }}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', flex: 1 }}>{canvasBg}</span>
            {hasOverride && (
              <button
                onClick={handleCanvasBgReset}
                style={{
                  padding: '3px 8px',
                  fontSize: 10,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Scroll behavior hint */}
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-4)',
              marginBottom: 8,
              letterSpacing: '0.5px',
            }}
          >
            Scroll Behavior
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>Scroll</span>
              <span>Zoom in / out</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>Shift + Scroll</span>
              <span>Pan left / right</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ color: 'var(--text-primary)' }}>Ctrl + Scroll</span>
              <span>Pan up / down</span>
            </div>
          </div>

          {/* Toolbar order section */}
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-4)',
              marginBottom: 8,
              letterSpacing: '0.5px',
            }}
          >
            Toolbar Order
          </div>
          <ToolbarOrderEditor />
        </div>
      </div>
    </div>
  )
}

function ThemeOption({
  label,
  active,
  preview,
  onClick,
}: {
  label: string
  active: boolean
  preview: { bg: string; surface: string; text: string }
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 'var(--space-2)',
        background: active ? 'var(--accent)' : 'var(--bg-input)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-2)',
      }}
    >
      {/* Mini preview */}
      <div
        style={{
          width: '100%',
          height: 48,
          background: preview.bg,
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          padding: 6,
        }}
      >
        <div style={{ width: 20, height: 32, background: preview.surface, borderRadius: 2 }} />
        <div
          style={{
            flex: 1,
            height: 32,
            background: preview.surface,
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 4px',
            gap: 3,
          }}
        >
          <div style={{ height: 3, width: '80%', background: preview.text, borderRadius: 1, opacity: 0.6 }} />
          <div style={{ height: 3, width: '50%', background: preview.text, borderRadius: 1, opacity: 0.4 }} />
        </div>
      </div>
      <span
        style={{
          fontSize: 'var(--font-size-sm)',
          color: active ? '#fff' : 'var(--text-primary)',
          fontWeight: active ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
        }}
      >
        {label}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Toolbar order editor — drag to reorder
// ---------------------------------------------------------------------------

function itemLabel(token: string): string {
  if (token === 'separator') return '── separator ──'
  if (token === 'shapes') return 'Shapes'
  return toolLabel(token)
}

function ToolbarOrderEditor() {
  const [order, setOrder] = useState(getToolbarOrder)
  const dragIdx = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const commit = useCallback((newOrder: string[]) => {
    setOrder(newOrder)
    saveToolbarOrder(newOrder)
  }, [])

  const handleReset = useCallback(() => {
    resetToolbarOrder()
    setOrder(getToolbarOrder())
  }, [])

  const moveItem = useCallback(
    (from: number, to: number) => {
      if (from === to) return
      const next = [...order]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      commit(next)
    },
    [order, commit],
  )

  const handleDragStart = useCallback((idx: number) => {
    dragIdx.current = idx
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback(
    (idx: number) => {
      if (dragIdx.current !== null && dragIdx.current !== idx) {
        moveItem(dragIdx.current, idx)
      }
      dragIdx.current = null
      setDragOverIdx(null)
    },
    [moveItem],
  )

  const handleDragEnd = useCallback(() => {
    dragIdx.current = null
    setDragOverIdx(null)
  }, [])

  return (
    <div>
      <div
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-input)',
        }}
      >
        {order.map((token, idx) => {
          const isSep = token === 'separator'
          return (
            <div
              key={`${token}-${idx}`}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 8px',
                fontSize: 11,
                color: isSep ? 'var(--text-disabled)' : 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
                background: dragOverIdx === idx ? 'var(--bg-hover)' : 'transparent',
                cursor: 'grab',
                userSelect: 'none',
              }}
            >
              {/* Drag handle */}
              <span style={{ color: 'var(--text-disabled)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>{'⠿'}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {itemLabel(token)}
              </span>
              {/* Move up/down buttons */}
              <button
                onClick={() => idx > 0 && moveItem(idx, idx - 1)}
                disabled={idx === 0}
                style={{
                  background: 'none',
                  border: 'none',
                  color: idx === 0 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  cursor: idx === 0 ? 'default' : 'pointer',
                  fontSize: 10,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
                title="Move up"
              >
                {'\u25B2'}
              </button>
              <button
                onClick={() => idx < order.length - 1 && moveItem(idx, idx + 1)}
                disabled={idx === order.length - 1}
                style={{
                  background: 'none',
                  border: 'none',
                  color: idx === order.length - 1 ? 'var(--text-disabled)' : 'var(--text-secondary)',
                  cursor: idx === order.length - 1 ? 'default' : 'pointer',
                  fontSize: 10,
                  padding: '0 2px',
                  lineHeight: 1,
                }}
                title="Move down"
              >
                {'\u25BC'}
              </button>
            </div>
          )
        })}
      </div>
      <button
        onClick={handleReset}
        style={{
          marginTop: 8,
          padding: '4px 10px',
          fontSize: 11,
          background: 'var(--bg-input)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
      >
        Reset to Default
      </button>
    </div>
  )
}
