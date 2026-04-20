import { useEffect, useState } from 'react'

const HOMEPAGE = 'https://crossdraw.app'
const SOURCE = 'https://github.com/airgap/crossdraw'

export function AboutModal() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('crossdraw:show-about', handler)
    return () => window.removeEventListener('crossdraw:show-about', handler)
  }, [])

  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  if (!visible) return null

  const close = () => setVisible(false)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '32px',
          maxWidth: 440,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          textAlign: 'center',
        }}
      >
        <h1
          id="about-title"
          style={{
            margin: '0 0 4px',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.5px',
          }}
        >
          Crossdraw
        </h1>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            marginBottom: 16,
          }}
        >
          Version {__APP_VERSION__}
        </div>
        <p
          style={{
            margin: '0 0 24px',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}
        >
          A professional vector &amp; raster design editor.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 24,
            fontSize: 13,
          }}
        >
          <a href={HOMEPAGE} target="_blank" rel="noreferrer" style={linkStyle}>
            crossdraw.app
          </a>
          <a href={SOURCE} target="_blank" rel="noreferrer" style={linkStyle}>
            Source on GitHub
          </a>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 16,
            fontSize: 11,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          Bundled fonts are licensed under the SIL Open Font License 1.1 or Apache License 2.0. See{' '}
          <a href="https://fonts.google.com/attribution" target="_blank" rel="noreferrer" style={linkStyle}>
            fonts.google.com/attribution
          </a>
          .
        </div>

        <button
          onClick={close}
          style={{
            marginTop: 24,
            background: 'var(--accent)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '6px 24px',
            borderRadius: 'var(--radius-md, 6px)',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)',
  textDecoration: 'none',
}
