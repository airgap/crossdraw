import { useState } from 'react'
import { getThemePreference, setTheme, getAllThemes, type ThemePreference } from '@/ui/theme'

interface Props {
  onClose: () => void
}

export function UISettings({ onClose }: Props) {
  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference())
  const allThemes = getAllThemes()

  const handleThemeChange = (name: string) => {
    setTheme(name)
    setThemePref(name)
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

          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
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
            {allThemes
              .filter((t) => t.name !== 'dark' && t.name !== 'light')
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
        flex: 1,
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
