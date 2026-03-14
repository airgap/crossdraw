import { useState } from 'react'

const R2_BASE = '/releases'

const apkMime = 'application/vnd.android.package-archive'

function triggerDownload(filename: string, btn?: HTMLElement | null) {
  if (btn) btn.textContent = 'Downloading…'
  const url = `${R2_BASE}/${filename}`
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const mime = filename.endsWith('.apk') ? apkMime : 'application/octet-stream'
      const blob = new Blob([buf], { type: mime })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
      }, 1000)
      if (btn) btn.textContent = 'Done!'
    })
    .catch(() => {
      if (btn) btn.textContent = 'Failed — try direct link'
      // Fallback: direct navigation
      window.location.href = url
    })
}

// ── SVG Icons ──

function LinuxIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.5 2c-1.7 0-3.2 1.8-3.8 3.3-.4 1-.6 2.2-.4 3.3.1.5.3 1 .5 1.5-.5.8-.9 1.7-1.1 2.6-.3 1.1-.3 2.3.1 3.3.2.5.5 1 .9 1.3-.1.4-.2.8-.1 1.2.1.6.5 1.1 1 1.4.5.4 1.1.6 1.7.6h.2c.5 0 1-.1 1.5-.4.4.3.9.4 1.4.4h.2c.6 0 1.2-.2 1.7-.6.5-.3.8-.8 1-1.4.1-.4 0-.8-.1-1.2.4-.3.7-.8.9-1.3.4-1 .4-2.2.1-3.3-.2-.9-.6-1.8-1.1-2.6.2-.5.4-1 .5-1.5.2-1.1 0-2.3-.4-3.3C15.7 3.8 14.2 2 12.5 2zm0 1.5c.9 0 1.9 1.2 2.3 2.4.3.8.4 1.6.3 2.4 0 .2-.1.5-.2.7-.4-.4-.8-.7-1.3-.9-.5-.2-1-.3-1.6-.2-.5 0-1 .1-1.4.3-.5.2-.9.5-1.2.9-.1-.2-.2-.5-.2-.7-.1-.8 0-1.6.3-2.4.4-1.2 1.4-2.4 2.3-2.5h.7z" />
    </svg>
  )
}

function AppleIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  )
}

function ServerIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="18" r="1" fill="currentColor" />
    </svg>
  )
}

function AndroidIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V7H6v11zM3.5 7C2.67 7 2 7.67 2 8.5v7c0 .83.67 1.5 1.5 1.5S5 16.33 5 15.5v-7C5 7.67 4.33 7 3.5 7zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85.55 12.95.25 12 .25s-1.85.3-2.64.88L7.88.65c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.3 1.3C7.17 3.6 6.2 5.19 6.05 7h11.9c-.15-1.81-1.12-3.4-2.42-4.34zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  )
}

function WindowsIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zM11.5 12.5H21v8l-9.5-1.3v-6.7z" />
    </svg>
  )
}

function MonitorIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

function VSCodeIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.583 2.002L9.29 8.266 4.566 4.784 2 5.97v12.06l2.566 1.186 4.724-3.482 8.293 6.264L22 20.09V3.91l-4.417-1.908zM17.5 17.41l-5.5-4.16v-.5l5.5-4.16v8.82zM4.5 14.52V9.48L7.6 12l-3.1 2.52z" />
    </svg>
  )
}

function EIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 5h14M5 12h10M5 19h14" />
    </svg>
  )
}

interface Release {
  name: string
  platform: string
  arch: string
  icon: (props: { size?: number }) => JSX.Element
  filename: string
  type: 'desktop' | 'server' | 'mobile' | 'extension'
}

const releases: Release[] = [
  // Desktop (Electron)
  {
    name: 'Linux x64',
    platform: 'Linux',
    arch: 'x64',
    icon: LinuxIcon,
    filename: 'Crossdraw-0.1.0.AppImage',
    type: 'desktop',
  },
  {
    name: 'Linux x64 (deb)',
    platform: 'Linux',
    arch: 'x64',
    icon: LinuxIcon,
    filename: 'crossdraw_0.1.0_amd64.deb',
    type: 'desktop',
  },
  {
    name: 'macOS arm64',
    platform: 'macOS',
    arch: 'arm64',
    icon: AppleIcon,
    filename: 'Crossdraw-0.1.0-arm64.dmg',
    type: 'desktop',
  },
  {
    name: 'macOS x64',
    platform: 'macOS',
    arch: 'x64',
    icon: AppleIcon,
    filename: 'Crossdraw-0.1.0.dmg',
    type: 'desktop',
  },
  {
    name: 'Windows x64',
    platform: 'Windows',
    arch: 'x64',
    icon: WindowsIcon,
    filename: 'Crossdraw-Setup-0.1.0.exe',
    type: 'desktop',
  },
  {
    name: 'Windows arm64',
    platform: 'Windows',
    arch: 'arm64',
    icon: WindowsIcon,
    filename: 'Crossdraw-Setup-0.1.0-arm64.exe',
    type: 'desktop',
  },
  {
    name: 'Windows Portable',
    platform: 'Windows',
    arch: 'x64',
    icon: WindowsIcon,
    filename: 'Crossdraw-0.1.0-portable.exe',
    type: 'desktop',
  },
  // Mobile
  {
    name: 'Android',
    platform: 'Android',
    arch: 'universal',
    icon: AndroidIcon,
    filename: 'crossdraw.apk',
    type: 'mobile',
  },
  // Server
  {
    name: 'Server Linux x64',
    platform: 'Linux',
    arch: 'x64',
    icon: ServerIcon,
    filename: 'crossdraw-server-linux-x64',
    type: 'server',
  },
  {
    name: 'Server Linux arm64',
    platform: 'Linux',
    arch: 'arm64',
    icon: ServerIcon,
    filename: 'crossdraw-server-linux-arm64',
    type: 'server',
  },
  {
    name: 'Server macOS x64',
    platform: 'macOS',
    arch: 'x64',
    icon: ServerIcon,
    filename: 'crossdraw-server-darwin-x64',
    type: 'server',
  },
  {
    name: 'Server macOS arm64',
    platform: 'macOS',
    arch: 'arm64',
    icon: ServerIcon,
    filename: 'crossdraw-server-darwin-arm64',
    type: 'server',
  },
  {
    name: 'Server Windows x64',
    platform: 'Windows',
    arch: 'x64',
    icon: ServerIcon,
    filename: 'crossdraw-server-windows-x64.exe',
    type: 'server',
  },
  // Extensions
  {
    name: 'VS Code Extension',
    platform: 'Any',
    arch: 'universal',
    icon: VSCodeIcon,
    filename: 'crossdraw-vscode-0.1.0.vsix',
    type: 'extension',
  },
  {
    name: 'E IDE (built-in)',
    platform: 'Any',
    arch: 'universal',
    icon: EIcon,
    filename: '',
    type: 'extension',
  },
]

function detectPlatform(): string {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'Android'
  if (ua.includes('win')) return 'Windows'
  if (ua.includes('mac')) return 'macOS'
  return 'Linux'
}

export function DownloadPage() {
  const [hovered, setHovered] = useState<string | null>(null)
  const platform = detectPlatform()

  const desktopReleases = releases.filter((r) => r.type === 'desktop')
  const mobileReleases = releases.filter((r) => r.type === 'mobile')
  const serverReleases = releases.filter((r) => r.type === 'server')
  const extensionReleases = releases.filter((r) => r.type === 'extension')

  const recommended =
    desktopReleases.find((r) => r.platform === platform) ??
    mobileReleases.find((r) => r.platform === platform) ??
    desktopReleases[0]

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
          Vector &amp; raster design editor. Desktop app, mobile, or standalone server.
        </p>
      </div>

      {/* Recommended */}
      {recommended && (
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <button
            onClick={(e) => triggerDownload(recommended.filename, e.currentTarget)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 40px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              fontWeight: 600,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#1d4ed8')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#2563eb')}
          >
            <recommended.icon size={24} />
            Download for {recommended.platform}
          </button>
          <div style={{ color: '#666', fontSize: 13, marginTop: 8 }}>{recommended.filename}</div>
        </div>
      )}

      {/* Desktop section */}
      <div style={{ maxWidth: 800, marginInline: 'auto', padding: '0 32px' }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MonitorIcon size={22} />
          Desktop App
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {desktopReleases.map((r) => (
            <DownloadCard key={r.filename} release={r} hovered={hovered === r.filename} onHover={setHovered} />
          ))}
        </div>

        {/* Mobile section */}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            marginTop: 48,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <svg
            width="20"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
          Mobile
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {mobileReleases.map((r) => (
            <DownloadCard key={r.filename} release={r} hovered={hovered === r.filename} onHover={setHovered} />
          ))}
        </div>

        {/* Server section */}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            marginTop: 48,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ServerIcon size={22} />
          Standalone Server
        </h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Single-binary web server with embedded assets. Run it anywhere, access Crossdraw from your browser.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {serverReleases.map((r) => (
            <DownloadCard key={r.filename} release={r} hovered={hovered === r.filename} onHover={setHovered} />
          ))}
        </div>

        {/* Extensions section */}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            marginTop: 48,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2v6.5M12 2L9 5M12 2l3 3" />
            <rect x="3" y="8.5" width="18" height="13" rx="2" />
            <path d="M8 15h8" />
          </svg>
          Editor Extensions
        </h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Edit image assets directly inside your IDE with multiplayer support. Install via{' '}
          <code style={{ background: '#1a1a1a', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>
            code --install-extension crossdraw-vscode-0.1.0.vsix
          </code>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {extensionReleases.map((r) => (
            <DownloadCard key={r.filename || r.name} release={r} hovered={hovered === (r.filename || r.name)} onHover={setHovered} />
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
  const Icon = release.icon
  const isBuiltIn = !release.filename
  const key = release.filename || release.name
  return (
    <button
      onClick={(e) => {
        if (isBuiltIn) return
        triggerDownload(release.filename, e.currentTarget)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: hovered ? '#1a1a1a' : '#111',
        border: '1px solid',
        borderColor: hovered ? '#333' : '#1a1a1a',
        borderRadius: 8,
        cursor: isBuiltIn ? 'default' : 'pointer',
        color: '#e0e0e0',
        transition: 'all 0.15s',
        width: '100%',
        textAlign: 'left',
      }}
      onMouseEnter={() => onHover(key)}
      onMouseLeave={() => onHover(null)}
    >
      <Icon size={28} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{release.name}</div>
        <div style={{ color: '#666', fontSize: 12 }}>{isBuiltIn ? 'Built-in — no install needed' : release.filename}</div>
      </div>
    </button>
  )
}
