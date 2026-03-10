import { useEditorStore } from '@/store/editor.store'
import { createDefaultPerspectiveConfig, type PerspectiveMode } from '@/render/perspective-grid'
import type { PerspectiveConfig } from '@/types'

const sectionStyle: React.CSSProperties = {
  marginBottom: 12,
  borderBottom: '1px solid var(--border-subtle)',
  paddingBottom: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  marginBottom: 4,
  fontWeight: 'var(--font-weight-semibold)',
  letterSpacing: '0.3px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-1)',
  marginBottom: 'var(--space-1)',
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
  padding: '2px 4px',
  width: '100%',
  height: 'var(--height-input)',
}

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 60,
}

const btnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-xs)',
  padding: '3px 8px',
  cursor: 'pointer',
  height: 'var(--height-button-sm)',
}

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--accent-primary, #4a7dff)',
  color: '#fff',
  borderColor: 'var(--accent-primary, #4a7dff)',
}

const MODES: { label: string; value: PerspectiveMode | 'off' }[] = [
  { label: 'Off', value: 'off' },
  { label: '1-Point', value: '1-point' },
  { label: '2-Point', value: '2-point' },
  { label: '3-Point', value: '3-point' },
]

export function PerspectivePanel() {
  const artboard = useEditorStore((s) => s.document.artboards[0])
  const setPerspectiveGrid = useEditorStore((s) => s.setPerspectiveGrid)

  if (!artboard) return null

  const config = artboard.perspectiveGrid
  const activeMode: PerspectiveMode | 'off' = config ? config.mode : 'off'

  function handleModeChange(mode: PerspectiveMode | 'off') {
    if (!artboard) return
    if (mode === 'off') {
      setPerspectiveGrid(artboard.id, null)
    } else {
      const newConfig = createDefaultPerspectiveConfig(artboard.width, artboard.height, mode)
      // Preserve existing settings when switching modes
      if (config) {
        newConfig.gridDensity = config.gridDensity
        newConfig.opacity = config.opacity
        newConfig.color = config.color
        newConfig.horizonY = config.horizonY
      }
      setPerspectiveGrid(artboard.id, newConfig)
    }
  }

  function updateConfig(updates: Partial<PerspectiveConfig>) {
    if (!artboard || !config) return
    setPerspectiveGrid(artboard.id, { ...config, ...updates })
  }

  return (
    <div style={{ padding: 8 }}>
      <div style={sectionStyle}>
        <div style={labelStyle}>Perspective Grid</div>
        <div style={{ ...rowStyle, flexWrap: 'wrap' }}>
          {MODES.map((m) => (
            <button
              key={m.value}
              style={activeMode === m.value ? activeBtnStyle : btnStyle}
              onClick={() => handleModeChange(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {config && (
        <>
          <div style={sectionStyle}>
            <div style={labelStyle}>Grid Density</div>
            <div style={rowStyle}>
              <input
                type="range"
                min={4}
                max={40}
                step={1}
                value={config.gridDensity}
                onChange={(e) => updateConfig({ gridDensity: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                  minWidth: 24,
                  textAlign: 'right',
                }}
              >
                {config.gridDensity}
              </span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Opacity</div>
            <div style={rowStyle}>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={config.opacity}
                onChange={(e) => updateConfig({ opacity: Number(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                  minWidth: 36,
                  textAlign: 'right',
                }}
              >
                {Math.round(config.opacity * 100)}%
              </span>
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Grid Color</div>
            <div style={rowStyle}>
              <input
                type="color"
                value={config.color}
                onChange={(e) => updateConfig({ color: e.target.value })}
                style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer' }}
              />
              <input
                type="text"
                value={config.color}
                onChange={(e) => {
                  const val = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    updateConfig({ color: val })
                  }
                }}
                style={smallInputStyle}
              />
            </div>
          </div>

          <div style={sectionStyle}>
            <div style={labelStyle}>Horizon Y</div>
            <div style={rowStyle}>
              <input
                type="number"
                value={Math.round(config.horizonY)}
                onChange={(e) => updateConfig({ horizonY: Number(e.target.value) })}
                style={smallInputStyle}
              />
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>px</span>
            </div>
          </div>

          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
            Drag VP circles on the canvas to reposition vanishing points.
          </div>
        </>
      )}
    </div>
  )
}
