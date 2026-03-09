import { useState } from 'react'

const R2_BASE = 'https://pub-50f4e082f1ed4208bd1324f74564a835.r2.dev'

interface Release {
  name: string
  platform: string
  arch: string
  icon: string
  filename: string
  type: 'desktop' | 'server'
}

const releases: Release[] = [
  // Desktop (Electron)
  { name: 'Linux x64', platform: 'Linux', arch: 'x64', icon: '🐧', filename: 'Crossdraw.AppImage', type: 'desktop' },
  { name: 'Linux x64 (deb)', platform: 'Linux', arch: 'x64', icon: '🐧', filename: 'Crossdraw.deb', type: 'desktop' },
  { name: 'macOS arm64', platform: 'macOS', arch: 'arm64', icon: '🍎', filename: 'Crossdraw.dmg', type: 'desktop' },
  // Server
  { name: 'Server Linux x64', platform: 'Linux', arch: 'x64', icon: '🖥️', filename: 'crossdraw-server-linux-x64', type: 'server' },
  { name: 'Server Linux arm64', platform: 'Linux', arch: 'arm64', icon: '🖥️', filename: 'crossdraw-server-linux-arm64', type: 'server' },
  { name: 'Server macOS x64', platform: 'macOS', arch: 'x64', icon: '🍎', filename: 'crossdraw-server-darwin-x64', type: 'server' },
  { name: 'Server macOS arm64', platform: 'macOS', arch: 'arm64', icon: '🍎', filename: 'crossdraw-server-darwin-arm64', type: 'server' },
  { name: 'Server Windows x64', platform: 'Windows', arch: 'x64', icon: '🪟', filename: 'crossdraw-server-windows-x64.exe', type: 'server' },
]

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'Windows'
  if (ua.includes('mac')) return 'macOS'
  return 'Linux'
}

export function DownloadPage() {
  const [hovered, setHovered] = useState<string | null>(null)
  const platform = detectPlatform()

  const desktopReleases = releases.filter((r) => r.type === 'desktop')
  const serverReleases = releases.filter((r) => r.type === 'server')

  const recommended = desktopReleases.find((r) => r.platform === platform) ?? desktopReleases[0]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid #222',
        }}
      >
        <a
          href="/"
          style={{
            color: '#fff',
            textDecoration: 'none',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Crossdraw
        </a>
        <a
          href="/"
          style={{ color: '#888', textDecoration: 'none', fontSize: 14 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
        >
          Open Editor
        </a>
      </nav>

      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '80px 32px 40px' }}>
        <h1
          style={{
            fontSize: 48,
            fontWeight: 800,
            margin: 0,
            letterSpacing: '-0.03em',
            color: '#fff',
          }}
        >
          Download Crossdraw
        </h1>
        <p style={{ fontSize: 18, color: '#888', marginTop: 12, maxWidth: 500, marginInline: 'auto' }}>
          Vector &amp; raster design editor. Desktop app or standalone server.
        </p>
      </div>

      {/* Recommended */}
      {recommended && (
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <a
            href={`${R2_BASE}/${recommended.filename}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 40px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 18,
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563eb')}
          >
            <span style={{ fontSize: 24 }}>{recommended.icon}</span>
            Download for {recommended.platform}
          </a>
          <div style={{ color: '#666', fontSize: 13, marginTop: 8 }}>{recommended.filename}</div>
        </div>
      )}

      {/* Desktop section */}
      <div style={{ maxWidth: 800, marginInline: 'auto', padding: '0 32px' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 16 }}>Desktop App</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {desktopReleases.map((r) => (
            <DownloadCard
              key={r.filename}
              release={r}
              hovered={hovered === r.filename}
              onHover={setHovered}
            />
          ))}
        </div>

        {/* Server section */}
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 48, marginBottom: 16 }}>
          Standalone Server
        </h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Single-binary web server with embedded assets. Run it anywhere, access Crossdraw from your browser.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {serverReleases.map((r) => (
            <DownloadCard
              key={r.filename}
              release={r}
              hovered={hovered === r.filename}
              onHover={setHovered}
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          padding: '60px 32px 32px',
          color: '#555',
          fontSize: 13,
        }}
      >
        Built by airgap
      </div>
    </div>
  )
}

function DownloadCard({
  release,
  hovered,
  onHover,
}: {
  release: Release
  hovered: boolean
  onHover: (f: string | null) => void
}) {
  return (
    <a
      href={`${R2_BASE}/${release.filename}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: hovered ? '#1a1a1a' : '#111',
        border: '1px solid',
        borderColor: hovered ? '#333' : '#1a1a1a',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#e0e0e0',
        transition: 'all 0.15s',
      }}
      onMouseEnter={() => onHover(release.filename)}
      onMouseLeave={() => onHover(null)}
    >
      <span style={{ fontSize: 28 }}>{release.icon}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{release.name}</div>
        <div style={{ color: '#666', fontSize: 12 }}>{release.filename}</div>
      </div>
    </a>
  )
}
