import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { getBrushSettings, setBrushSettings } from '@/tools/brush'
import { getEraserSettings, setEraserSettings } from '@/tools/eraser'
import {
  getShapeDefaults,
  setShapeDefaults,
  getLineDefaults,
  setLineDefaults,
  getPenDefaults,
  setPenDefaults,
  getTextDefaults,
  setTextDefaults,
  getGradientDefaults,
  setGradientDefaults,
  getFillDefaults,
  setFillDefaults,
  getZoomMode,
  setZoomMode,
} from '@/ui/tool-options-state'

// ── Shared styles ──

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 32,
  background: 'var(--bg-surface)',
  borderBottom: '1px solid var(--border-subtle)',
  padding: '0 8px',
  gap: 8,
  flexShrink: 0,
  fontSize: 11,
  color: 'var(--text-secondary)',
  userSelect: 'none',
  overflowX: 'auto',
}

const smallInputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  padding: '2px 4px',
  fontSize: 11,
}

const groupStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
}

// ── Small reusable inputs ──

function NumberInput({
  label,
  value,
  min,
  max,
  step,
  width,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  width?: number
  onChange: (v: number) => void
}) {
  return (
    <span style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value))))}
        style={{ ...smallInputStyle, width: width ?? 52 }}
      />
    </span>
  )
}

function SliderInput({
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
    <span style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 70, accentColor: 'var(--accent)' }}
      />
      <span
        style={{
          minWidth: 28,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-primary)',
          fontSize: 11,
        }}
      >
        {format ? format(value) : value}
      </span>
    </span>
  )
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <span style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 24,
          height: 20,
          padding: 0,
          border: '1px solid var(--border-color)',
          borderRadius: 3,
          cursor: 'pointer',
          background: 'none',
        }}
      />
    </span>
  )
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <span style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...smallInputStyle, padding: '2px 4px', cursor: 'pointer' }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}

// ── Tool-specific option panels ──

function RectangleOptions() {
  const [defaults, setDefaults] = useState(getShapeDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getShapeDefaults>>) => {
    setShapeDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <NumberInput
      label="Corner Radius"
      value={defaults.cornerRadius}
      min={0}
      max={200}
      onChange={(v) => update({ cornerRadius: v })}
    />
  )
}

function PolygonOptions() {
  const [defaults, setDefaults] = useState(getShapeDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getShapeDefaults>>) => {
    setShapeDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <NumberInput
      label="Sides"
      value={defaults.polygonSides}
      min={3}
      max={12}
      onChange={(v) => update({ polygonSides: v })}
    />
  )
}

function StarOptions() {
  const [defaults, setDefaults] = useState(getShapeDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getShapeDefaults>>) => {
    setShapeDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Points"
        value={defaults.starPoints}
        min={3}
        max={12}
        onChange={(v) => update({ starPoints: v })}
      />
      <SliderInput
        label="Inner Ratio"
        value={defaults.starInnerRatio}
        min={0.1}
        max={0.95}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ starInnerRatio: v })}
      />
    </>
  )
}

function PenPencilOptions() {
  const [defaults, setDefaults] = useState(getPenDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getPenDefaults>>) => {
    setPenDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Stroke Width"
        value={defaults.strokeWidth}
        min={0.5}
        max={50}
        step={0.5}
        onChange={(v) => update({ strokeWidth: v })}
      />
      <ColorSwatch label="Stroke" value={defaults.strokeColor} onChange={(v) => update({ strokeColor: v })} />
    </>
  )
}

function LineOptions() {
  const [defaults, setDefaults] = useState(getLineDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getLineDefaults>>) => {
    setLineDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Stroke Width"
        value={defaults.strokeWidth}
        min={0.5}
        max={50}
        step={0.5}
        onChange={(v) => update({ strokeWidth: v })}
      />
      <ColorSwatch label="Stroke" value={defaults.strokeColor} onChange={(v) => update({ strokeColor: v })} />
    </>
  )
}

function BrushOptions() {
  const [settings, setSettings] = useState(getBrushSettings)

  useEffect(() => {
    setSettings(getBrushSettings())
  }, [])

  const update = useCallback((patch: Partial<typeof settings>) => {
    setBrushSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Hardness"
        value={settings.hardness}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ hardness: v })}
      />
      <SliderInput
        label="Opacity"
        value={settings.opacity}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ opacity: v })}
      />
      <SliderInput
        label="Flow"
        value={settings.flow}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ flow: v })}
      />
      <SliderInput
        label="Spacing"
        value={settings.spacing}
        min={0.05}
        max={2}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ spacing: v })}
      />
    </>
  )
}

function EraserOptions() {
  const [settings, setSettings] = useState(getEraserSettings)

  useEffect(() => {
    setSettings(getEraserSettings())
  }, [])

  const update = useCallback((patch: Partial<typeof settings>) => {
    setEraserSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Hardness"
        value={settings.hardness}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ hardness: v })}
      />
    </>
  )
}

function TextOptions() {
  const [defaults, setDefaults] = useState(getTextDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getTextDefaults>>) => {
    setTextDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  const fontFamilies = [
    { value: 'sans-serif', label: 'Sans Serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'monospace', label: 'Monospace' },
    { value: 'Arial', label: 'Arial' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Georgia', label: 'Georgia' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Courier New', label: 'Courier New' },
  ]

  return (
    <>
      <SelectInput
        label="Font"
        value={defaults.fontFamily}
        options={fontFamilies}
        onChange={(v) => update({ fontFamily: v })}
      />
      <NumberInput label="Size" value={defaults.fontSize} min={6} max={200} onChange={(v) => update({ fontSize: v })} />
    </>
  )
}

function ZoomOptions() {
  const [mode, setMode] = useState(getZoomMode)
  const update = useCallback((v: 'in' | 'out') => {
    setZoomMode(v)
    setMode(v)
  }, [])

  return (
    <span style={groupStyle}>
      <span style={labelStyle}>Mode</span>
      <button
        onClick={() => update('in')}
        style={{
          ...smallInputStyle,
          padding: '2px 8px',
          cursor: 'pointer',
          fontWeight: mode === 'in' ? 700 : 400,
          background: mode === 'in' ? 'var(--accent)' : 'var(--bg-input)',
          color: mode === 'in' ? '#fff' : 'var(--text-primary)',
        }}
      >
        Zoom In
      </button>
      <button
        onClick={() => update('out')}
        style={{
          ...smallInputStyle,
          padding: '2px 8px',
          cursor: 'pointer',
          fontWeight: mode === 'out' ? 700 : 400,
          background: mode === 'out' ? 'var(--accent)' : 'var(--bg-input)',
          color: mode === 'out' ? '#fff' : 'var(--text-primary)',
        }}
      >
        Zoom Out
      </button>
    </span>
  )
}

function FillOptions() {
  const [defaults, setDefaults] = useState(getFillDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getFillDefaults>>) => {
    setFillDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return <ColorSwatch label="Fill Color" value={defaults.fillColor} onChange={(v) => update({ fillColor: v })} />
}

function GradientOptions() {
  const [defaults, setDefaults] = useState(getGradientDefaults)
  const update = useCallback((patch: Partial<ReturnType<typeof getGradientDefaults>>) => {
    setGradientDefaults(patch)
    setDefaults((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <SelectInput
      label="Type"
      value={defaults.gradientType}
      options={[
        { value: 'linear', label: 'Linear' },
        { value: 'radial', label: 'Radial' },
      ]}
      onChange={(v) => update({ gradientType: v as 'linear' | 'radial' })}
    />
  )
}

// ── Tool name labels ──

const toolLabels: Record<string, string> = {
  select: 'Select',
  move: 'Move',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  pen: 'Pen',
  pencil: 'Pencil',
  line: 'Line',
  brush: 'Brush',
  eraser: 'Eraser',
  text: 'Text',
  zoom: 'Zoom',
  fill: 'Fill',
  gradient: 'Gradient',
  eyedropper: 'Eyedropper',
  hand: 'Hand',
  measure: 'Measure',
  crop: 'Crop',
  lasso: 'Lasso',
  marquee: 'Marquee',
  knife: 'Knife',
  node: 'Node',
  artboard: 'Artboard',
  slice: 'Slice',
}

// ── Main component ──

export function ToolOptionsBar() {
  const activeTool = useEditorStore((s) => s.activeTool)

  const toolName = toolLabels[activeTool] ?? activeTool

  let options: React.ReactNode = null

  switch (activeTool) {
    case 'rectangle':
      options = <RectangleOptions />
      break
    case 'polygon':
      options = <PolygonOptions />
      break
    case 'star':
      options = <StarOptions />
      break
    case 'pen':
    case 'pencil':
      options = <PenPencilOptions />
      break
    case 'line':
      options = <LineOptions />
      break
    case 'brush':
      options = <BrushOptions />
      break
    case 'eraser':
      options = <EraserOptions />
      break
    case 'text':
      options = <TextOptions />
      break
    case 'zoom':
      options = <ZoomOptions />
      break
    case 'fill':
      options = <FillOptions />
      break
    case 'gradient':
      options = <GradientOptions />
      break
    default:
      break
  }

  return (
    <div style={barStyle}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 11, marginRight: 4 }}>{toolName}</span>
      {options !== null ? (
        <>
          <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
          {options}
        </>
      ) : (
        <span style={{ color: 'var(--text-disabled)', fontSize: 11 }}>No tool options</span>
      )}
    </div>
  )
}
