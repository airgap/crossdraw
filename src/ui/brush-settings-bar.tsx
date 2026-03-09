import { useState, useEffect } from 'react'
import { getBrushSettings, setBrushSettings } from '@/tools/brush'
import { useEditorStore } from '@/store/editor.store'

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 80, accentColor: 'var(--accent)' }}
      />
      <span style={{ minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
        {format ? format(value) : value}
      </span>
    </label>
  )
}

export function BrushSettingsBar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const [settings, setSettings] = useState(getBrushSettings)

  // Sync from external changes
  useEffect(() => {
    setSettings(getBrushSettings())
  }, [activeTool])

  if (activeTool !== 'brush') return null

  const update = (patch: Partial<typeof settings>) => {
    setBrushSettings(patch)
    setSettings({ ...settings, ...patch })
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '4px 12px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      <Slider label="Size" value={settings.size} min={1} max={200} step={1} format={(v) => `${v}px`} onChange={(v) => update({ size: v })} />
      <Slider
        label="Hardness"
        value={settings.hardness}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ hardness: v })}
      />
      <Slider
        label="Opacity"
        value={settings.opacity}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ opacity: v })}
      />
      <Slider
        label="Flow"
        value={settings.flow}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ flow: v })}
      />
      <Slider
        label="Spacing"
        value={settings.spacing}
        min={0.05}
        max={2}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ spacing: v })}
      />
    </div>
  )
}
