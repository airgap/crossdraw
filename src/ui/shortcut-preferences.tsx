import { useState, useRef, useEffect } from 'react'
import {
  getBindings,
  rebindShortcut,
  resetShortcut,
  resetAllShortcuts,
  eventToCombo,
  type ShortcutBinding,
} from '@/ui/shortcut-registry'

interface Props {
  onClose: () => void
}

const categories: { id: ShortcutBinding['category']; label: string }[] = [
  { id: 'tool', label: 'Tools' },
  { id: 'edit', label: 'Edit' },
  { id: 'layer', label: 'Layers' },
  { id: 'view', label: 'View' },
]

export function ShortcutPreferences({ onClose }: Props) {
  const [, forceUpdate] = useState(0)
  const [rebinding, setRebinding] = useState<string | null>(null)
  const rebindRef = useRef<string | null>(null)
  rebindRef.current = rebinding

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!rebindRef.current) return
      e.preventDefault()
      e.stopPropagation()

      const combo = eventToCombo(e)
      if (!combo) return

      if (combo === 'escape') {
        setRebinding(null)
        return
      }

      rebindShortcut(rebindRef.current, combo)
      setRebinding(null)
      forceUpdate(n => n + 1)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  const bindings = getBindings()

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
          width: 480,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)' }}>
            Keyboard Shortcuts
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              onClick={() => {
                resetAllShortcuts()
                forceUpdate(n => n + 1)
              }}
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-sm)',
                padding: '4px 10px',
                cursor: 'pointer',
                height: 'var(--height-button-sm)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-input)' }}
            >
              Reset All
            </button>
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
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              {'\u00D7'}
            </button>
          </div>
        </div>

        {/* Bindings list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-4)' }}>
          {categories.map(cat => {
            const catBindings = bindings.filter(b => b.category === cat.id)
            if (catBindings.length === 0) return null

            return (
              <div key={cat.id} style={{ marginBottom: 'var(--space-3)' }}>
                <div style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  textTransform: 'uppercase',
                  color: 'var(--text-secondary)',
                  marginBottom: 6,
                  letterSpacing: '0.5px',
                }}>
                  {cat.label}
                </div>
                {catBindings.map(binding => (
                  <ShortcutRow
                    key={binding.id}
                    binding={binding}
                    isRebinding={rebinding === binding.id}
                    onStartRebind={() => setRebinding(binding.id)}
                    onReset={() => {
                      resetShortcut(binding.id)
                      forceUpdate(n => n + 1)
                    }}
                  />
                ))}
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: 'var(--space-2) var(--space-4)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
        }}>
          Click a shortcut key to rebind it. Press Escape to cancel.
        </div>
      </div>
    </div>
  )
}

function ShortcutRow({
  binding,
  isRebinding,
  onStartRebind,
  onReset,
}: {
  binding: ShortcutBinding
  isRebinding: boolean
  onStartRebind: () => void
  onReset: () => void
}) {
  const isCustom = binding.key !== binding.defaultKey

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '4px 0',
    }}>
      <span style={{
        flex: 1,
        fontSize: 'var(--font-size-base)',
        color: 'var(--text-primary)',
      }}>
        {binding.label}
      </span>
      <button
        onClick={onStartRebind}
        style={{
          minWidth: 100,
          padding: '3px 8px',
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-mono)',
          background: isRebinding ? 'var(--accent)' : 'var(--bg-input)',
          border: `1px solid ${isRebinding ? 'var(--accent)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          color: isRebinding ? '#fff' : isCustom ? 'var(--text-accent)' : 'var(--text-secondary)',
          cursor: 'pointer',
          textAlign: 'center',
          height: 'var(--height-button-sm)',
        }}
      >
        {isRebinding ? 'Press a key...' : formatCombo(binding.key)}
      </button>
      {isCustom && (
        <button
          onClick={onReset}
          title="Reset to default"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 14,
            cursor: 'pointer',
            padding: '0 2px',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
        >
          {'\u21BA'}
        </button>
      )}
    </div>
  )
}

function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map(part => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'meta') return 'Cmd'
      if (part === 'escape') return 'Esc'
      if (part === 'delete') return 'Del'
      if (part === 'backspace') return 'Bksp'
      return part.toUpperCase()
    })
    .join(' + ')
}
