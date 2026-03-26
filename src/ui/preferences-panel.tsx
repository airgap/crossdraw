import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { getThemePreference, setTheme, getAllThemes, isBuiltinTheme, type ThemePreference } from '@/ui/theme'
import { isAIEnabled, setAIEnabled } from '@/ui/panels/panel-registry'

// ── localStorage helpers ──

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function savePref<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

// ── Reusable setting-row components ──

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-tertiary)',
  marginBottom: 4,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 600,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 0',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-base, 12px)',
  color: 'var(--text-primary)',
  flex: 1,
  whiteSpace: 'nowrap',
}

const selectStyle: React.CSSProperties = {
  height: 'var(--height-input, 24px)',
  padding: '0 4px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm, 3px)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm, 11px)',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 80,
}

const numberInputStyle: React.CSSProperties = {
  height: 'var(--height-input, 24px)',
  width: 60,
  padding: '0 4px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm, 3px)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm, 11px)',
  outline: 'none',
  textAlign: 'right' as const,
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: checked ? 'var(--accent)' : 'var(--border-default)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          transition: 'left 0.15s',
        }}
      />
    </div>
  )
}

// ── Main component ──

export function PreferencesPanel() {
  // Theme
  const [themePref, setThemePref] = useState<ThemePreference>(getThemePreference)
  const [allThemes, setAllThemes] = useState(getAllThemes)

  // General prefs
  const [defaultUnit, setDefaultUnit] = useState(() => loadPref('crossdraw:default-unit', 'px'))
  const [autoSave, setAutoSave] = useState(() => loadPref('crossdraw:auto-save', 'off'))

  // Canvas — from store
  const gridSize = useEditorStore((s) => s.gridSize)
  const snapToGrid = useEditorStore((s) => s.snapToGrid)
  const snapToGuides = useEditorStore((s) => s.snapToGuides)
  const snapToLayers = useEditorStore((s) => s.snapToLayers)
  const setGridSize = useEditorStore((s) => s.setGridSize)
  const toggleSnapToGrid = useEditorStore((s) => s.toggleSnapToGrid)
  const toggleSnapToGuides = useEditorStore((s) => s.toggleSnapToGuides)
  const toggleSnapToLayers = useEditorStore((s) => s.toggleSnapToLayers)

  // Canvas — local pref
  const [pixelGridThreshold, setPixelGridThreshold] = useState(() => loadPref('crossdraw:pixel-grid-threshold', 8))

  // AI toggle
  const [aiOn, setAiOn] = useState(isAIEnabled)

  // Performance prefs
  const [renderQuality, setRenderQuality] = useState(() => loadPref('crossdraw:render-quality', 'medium'))
  const [gpuAccel, setGpuAccel] = useState(() => loadPref('crossdraw:gpu-accel', true))

  // Sync theme state when it changes externally
  useEffect(() => {
    const handler = () => setThemePref(getThemePreference())
    const themesHandler = () => setAllThemes(getAllThemes())
    window.addEventListener('crossdraw:theme-changed', handler)
    window.addEventListener('crossdraw:themes-changed', themesHandler)
    return () => {
      window.removeEventListener('crossdraw:theme-changed', handler)
      window.removeEventListener('crossdraw:themes-changed', themesHandler)
    }
  }, [])

  const handleThemeChange = useCallback((value: string) => {
    setTheme(value)
    setThemePref(value)
  }, [])

  const handleUnitChange = useCallback((value: string) => {
    setDefaultUnit(value)
    savePref('crossdraw:default-unit', value)
  }, [])

  const handleAutoSaveChange = useCallback((value: string) => {
    setAutoSave(value)
    savePref('crossdraw:auto-save', value)
  }, [])

  const handlePixelGridThreshold = useCallback((value: number) => {
    const clamped = Math.max(1, Math.min(64, value))
    setPixelGridThreshold(clamped)
    savePref('crossdraw:pixel-grid-threshold', clamped)
  }, [])

  const handleRenderQuality = useCallback((value: string) => {
    setRenderQuality(value)
    savePref('crossdraw:render-quality', value)
  }, [])

  const handleGpuAccel = useCallback((value: boolean) => {
    setGpuAccel(value)
    savePref('crossdraw:gpu-accel', value)
  }, [])

  const handleAIToggle = useCallback((value: boolean) => {
    setAiOn(value)
    setAIEnabled(value)
    window.dispatchEvent(new Event('crossdraw:ai-toggled'))
  }, [])

  return (
    <div
      style={{
        padding: 'var(--space-2, 8px)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 'var(--font-size-base, 12px)',
        overflow: 'auto',
      }}
    >
      {/* ── General ── */}
      <div style={sectionHeaderStyle}>General</div>

      <div style={rowStyle}>
        <span style={labelStyle}>Theme</span>
        <select value={themePref} onChange={(e) => handleThemeChange(e.target.value)} style={selectStyle}>
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="Nord Dark">Nord Dark</option>
          <option value="Nord Light">Nord Light</option>
          <option value="Darker">Darker</option>
          <option value="Black">Black</option>
          {allThemes
            .filter((t) => !isBuiltinTheme(t.name))
            .map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Default unit</span>
        <select value={defaultUnit} onChange={(e) => handleUnitChange(e.target.value)} style={selectStyle}>
          <option value="px">px</option>
          <option value="pt">pt</option>
          <option value="mm">mm</option>
          <option value="in">in</option>
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Auto-save interval</span>
        <select value={autoSave} onChange={(e) => handleAutoSaveChange(e.target.value)} style={selectStyle}>
          <option value="off">Off</option>
          <option value="60">1 min</option>
          <option value="300">5 min</option>
          <option value="600">10 min</option>
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>AI features</span>
        <ToggleSwitch checked={aiOn} onChange={handleAIToggle} />
      </div>

      {/* ── Canvas ── */}
      <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>Canvas</div>

      <div style={rowStyle}>
        <span style={labelStyle}>Grid size</span>
        <input
          type="number"
          min={1}
          max={256}
          value={gridSize}
          onChange={(e) => setGridSize(Number(e.target.value) || 1)}
          style={numberInputStyle}
        />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Snap to grid</span>
        <ToggleSwitch checked={snapToGrid} onChange={toggleSnapToGrid} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Snap to guides</span>
        <ToggleSwitch checked={snapToGuides} onChange={toggleSnapToGuides} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Snap to layers</span>
        <ToggleSwitch checked={snapToLayers} onChange={toggleSnapToLayers} />
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>Show pixel grid at zoom</span>
        <input
          type="number"
          min={1}
          max={64}
          value={pixelGridThreshold}
          onChange={(e) => handlePixelGridThreshold(Number(e.target.value) || 8)}
          style={numberInputStyle}
        />
      </div>

      {/* ── Performance ── */}
      <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>Performance</div>

      <div style={rowStyle}>
        <span style={labelStyle}>Rendering quality</span>
        <select value={renderQuality} onChange={(e) => handleRenderQuality(e.target.value)} style={selectStyle}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div style={rowStyle}>
        <span style={labelStyle}>GPU acceleration</span>
        <ToggleSwitch checked={gpuAccel} onChange={handleGpuAccel} />
      </div>
    </div>
  )
}
