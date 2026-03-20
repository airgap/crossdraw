import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { Breakpoint } from '@/types'
import { getBrushSettings, setBrushSettings } from '@/tools/brush'
import { getScatterSettings, setScatterSettings } from '@/tools/scatter-brush'
import type { ScatterBrushSettings, TexturePatternType } from '@/tools/scatter-brush'
import { getAllPresets, applyPreset } from '@/tools/brush-presets'
import { getEraserSettings, setEraserSettings } from '@/tools/eraser'
import { getDodgeBurnSettings, setDodgeBurnSettings } from '@/tools/dodge-burn'
import type { TonalRange, SpongeMode } from '@/tools/dodge-burn'
import { getSmudgeSettings, setSmudgeSettings } from '@/tools/smudge'
import { getMixerBrushSettings, setMixerBrushSettings } from '@/tools/mixer-brush'
import { getHealingBrushSettings, setHealingBrushSettings } from '@/tools/healing-brush'
import { getRasterGradientSettings, setRasterGradientSettings } from '@/tools/raster-gradient'
import type { RasterGradientType } from '@/tools/raster-gradient'
import { getColorRangeSettings, setColorRangeSettings } from '@/tools/color-range-tool'
import { getSharpenBlurSettings, setSharpenBlurSettings } from '@/tools/sharpen-blur-brush'
import type { SharpenBlurMode } from '@/tools/sharpen-blur-brush'
import { getRedEyeSettings, setRedEyeSettings } from '@/tools/red-eye'
import { getSymmetrySettings, setSymmetrySettings } from '@/tools/symmetry'
import { getPolygonalLassoSettings, setPolygonalLassoSettings } from '@/tools/polygonal-lasso'
import { getMagneticLassoSettings, setMagneticLassoSettings } from '@/tools/magnetic-lasso'
import { getContentAwareFillSettings, setContentAwareFillSettings } from '@/tools/content-aware-fill'
import { getContentAwareMoveSettings, setContentAwareMoveSettings } from '@/tools/content-aware-move'
import { getContentAwareScaleSettings, setContentAwareScaleSettings } from '@/tools/content-aware-scale'
import type { ContentAwareMoveMode, ContentAwareAdaptation } from '@/tools/content-aware-move'
import { getQuickSelectionSettings, setQuickSelectionSettings } from '@/tools/quick-selection'
import { getPressureMapping, setPressureMapping } from '@/tools/pressure'
import { getSpotHealingSettings, setSpotHealingSettings } from '@/tools/spot-healing'
import type { SpotHealingSettings } from '@/tools/spot-healing'
import { getPatchSettings, setPatchSettings } from '@/tools/patch-tool'
import type { PatchSettings } from '@/tools/patch-tool'
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
import {
  getRefineEdgeSettings,
  updateRefineEdge,
  enterRefineEdge,
  exitRefineEdge,
  isRefineEdgeActive,
} from '@/tools/refine-edge'
import type { RefineEdgeViewMode } from '@/tools/refine-edge'
import { getPerspectiveSettings, setPerspectiveSettings } from '@/tools/perspective-transform'
import { getLiquifySettings, setLiquifySettings } from '@/tools/liquify'
import type { LiquifyMode } from '@/tools/liquify'
import { getMeshWarpSettings, setMeshWarpSettings } from '@/tools/mesh-warp'
import { getPuppetWarpSettings, setPuppetWarpSettings } from '@/tools/puppet-warp'
import { getPerspectiveWarpSettings, setPerspectiveWarpSettings } from '@/tools/perspective-warp'
import { getCageTransformSettings, setCageTransformSettings } from '@/tools/cage-transform'
import { getPixelDrawSettings, setPixelDrawSettings } from '@/tools/pixel-draw'

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

function CheckboxInput({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <span style={groupStyle}>
      <span style={labelStyle}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)' }}
      />
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

function BrushPresetPicker({ onApply }: { onApply: () => void }) {
  const presets = getAllPresets()
  return (
    <SelectInput
      label="Preset"
      value=""
      options={[{ value: '', label: '\u2014 Presets \u2014' }, ...presets.map((p) => ({ value: p.id, label: p.name }))]}
      onChange={(v) => {
        if (v) {
          applyPreset(v)
          onApply()
        }
      }}
    />
  )
}

function ScatterOptions() {
  const [scatter, setLocal] = useState(getScatterSettings)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setLocal(getScatterSettings())
  }, [])
  const update = useCallback((patch: Partial<ScatterBrushSettings>) => {
    setScatterSettings(patch)
    setLocal((prev) => ({ ...prev, ...patch }))
  }, [])
  const texturePatterns: { value: string; label: string }[] = [
    { value: 'noise', label: 'Noise' },
    { value: 'canvas', label: 'Canvas' },
    { value: 'burlap', label: 'Burlap' },
    { value: 'brick', label: 'Brick' },
    { value: 'crosshatch', label: 'Crosshatch' },
  ]
  return (
    <>
      <span style={groupStyle}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            ...smallInputStyle,
            padding: '2px 8px',
            cursor: 'pointer',
            fontWeight: open ? 700 : 400,
            background: open ? 'var(--accent)' : 'var(--bg-input)',
            color: open ? '#fff' : 'var(--text-primary)',
          }}
        >
          Scatter
        </button>
      </span>
      {open && (
        <>
          <SliderInput
            label="Scatter X"
            value={scatter.scatterX}
            min={0}
            max={500}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => update({ scatterX: v })}
          />
          <SliderInput
            label="Scatter Y"
            value={scatter.scatterY}
            min={0}
            max={500}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => update({ scatterY: v })}
          />
          <NumberInput label="Count" value={scatter.count} min={1} max={16} onChange={(v) => update({ count: v })} />
          <SliderInput
            label="Count Jitter"
            value={scatter.countJitter}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => update({ countJitter: v })}
          />
          <SliderInput
            label="Size Jitter"
            value={scatter.sizeJitter}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => update({ sizeJitter: v })}
          />
          <SliderInput
            label="Angle Jitter"
            value={scatter.angleJitter}
            min={0}
            max={360}
            step={5}
            format={(v) => `${v}\u00b0`}
            onChange={(v) => update({ angleJitter: v })}
          />
          <SliderInput
            label="Roundness Jitter"
            value={scatter.roundnessJitter}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v}%`}
            onChange={(v) => update({ roundnessJitter: v })}
          />
          <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
          <CheckboxInput
            label="Texture"
            checked={scatter.textureEnabled}
            onChange={(v) => update({ textureEnabled: v })}
          />
          {scatter.textureEnabled && (
            <>
              <SelectInput
                label="Pattern"
                value={scatter.texturePattern}
                options={texturePatterns}
                onChange={(v) => update({ texturePattern: v as TexturePatternType })}
              />
              <SliderInput
                label="Scale"
                value={scatter.textureScale}
                min={10}
                max={1000}
                step={10}
                format={(v) => `${v}%`}
                onChange={(v) => update({ textureScale: v })}
              />
              <SliderInput
                label="Depth"
                value={scatter.textureDepth}
                min={0}
                max={100}
                step={5}
                format={(v) => `${v}%`}
                onChange={(v) => update({ textureDepth: v })}
              />
            </>
          )}
          <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
          <CheckboxInput
            label="Dual Brush"
            checked={scatter.dualBrushEnabled}
            onChange={(v) => update({ dualBrushEnabled: v })}
          />
          {scatter.dualBrushEnabled && (
            <>
              <NumberInput
                label="Dual Size"
                value={scatter.dualBrushSize}
                min={1}
                max={200}
                onChange={(v) => update({ dualBrushSize: v })}
              />
              <SliderInput
                label="Dual Spacing"
                value={scatter.dualBrushSpacing}
                min={0.05}
                max={2}
                step={0.05}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => update({ dualBrushSpacing: v })}
              />
              <SliderInput
                label="Dual Scatter"
                value={scatter.dualBrushScatter}
                min={0}
                max={500}
                step={5}
                format={(v) => `${v}%`}
                onChange={(v) => update({ dualBrushScatter: v })}
              />
            </>
          )}
        </>
      )}
    </>
  )
}

function BrushOptions() {
  const [settings, setSettings] = useState(getBrushSettings)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    setSettings(getBrushSettings())
  }, [])

  const update = useCallback((patch: Partial<typeof settings>) => {
    setBrushSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const handlePresetApply = useCallback(() => {
    setSettings(getBrushSettings())
    forceUpdate((n) => n + 1)
  }, [])

  return (
    <>
      <BrushPresetPicker onApply={handlePresetApply} />
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
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
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
      <ScatterOptions />
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

function PixelDrawOptions() {
  const [settings, setSettings] = useState(getPixelDrawSettings)

  useEffect(() => {
    setSettings(getPixelDrawSettings())
  }, [])

  const update = useCallback((patch: Partial<typeof settings>) => {
    setPixelDrawSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Pixel Size"
        value={settings.pixelSize}
        min={1}
        max={64}
        onChange={(v) => update({ pixelSize: v })}
      />
      <SliderInput
        label="Opacity"
        value={settings.opacity}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ opacity: v })}
      />
    </>
  )
}

function PressureOptions() {
  const [mapping, setMapping] = useState(getPressureMapping)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setMapping(getPressureMapping())
  }, [])

  const update = useCallback((patch: Partial<typeof mapping>) => {
    setPressureMapping(patch)
    setMapping((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <span style={groupStyle}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={mapping.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
          Pressure
        </label>
        {mapping.enabled && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 10,
              padding: '0 2px',
            }}
          >
            {expanded ? '\u25B4' : '\u25BE'}
          </button>
        )}
      </span>
      {mapping.enabled && expanded && (
        <>
          <SliderInput
            label="Size Min"
            value={mapping.sizeMin}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ sizeMin: v })}
          />
          <SliderInput
            label="Size Max"
            value={mapping.sizeMax}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ sizeMax: v })}
          />
          <SliderInput
            label="Opacity Min"
            value={mapping.opacityMin}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ opacityMin: v })}
          />
          <SliderInput
            label="Opacity Max"
            value={mapping.opacityMax}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ opacityMax: v })}
          />
          <SliderInput
            label="Flow Min"
            value={mapping.flowMin}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ flowMin: v })}
          />
          <SliderInput
            label="Flow Max"
            value={mapping.flowMax}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => update({ flowMax: v })}
          />
        </>
      )}
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
  'polygonal-lasso': 'Polygonal Lasso',
  'magnetic-lasso': 'Magnetic Lasso',
  marquee: 'Marquee',
  knife: 'Knife',
  node: 'Node',
  artboard: 'Artboard',
  slice: 'Slice',
  dodge: 'Dodge',
  burn: 'Burn',
  sponge: 'Sponge',
  smudge: 'Smudge',
  'healing-brush': 'Healing Brush',
  'color-range': 'Color Range',
  'sharpen-brush': 'Sharpen Brush',
  'blur-brush': 'Blur Brush',
  'red-eye': 'Red Eye Removal',
  'spot-healing': 'Spot Healing Brush',
  patch: 'Patch',
  'content-aware-fill': 'Content-Aware Fill',
  'content-aware-move': 'Content-Aware Move',
  'content-aware-scale': 'Content-Aware Scale',
  'quick-selection': 'Quick Selection',
  'mixer-brush': 'Mixer Brush',
  'perspective-transform': 'Perspective Transform',
  liquify: 'Liquify',
  'mesh-warp': 'Mesh Warp',
  'puppet-warp': 'Puppet Warp',
  'perspective-warp': 'Perspective Warp',
  'cage-transform': 'Cage Transform',
}

function SharpenBlurBrushOptions() {
  const [settings, setSettings] = useState(getSharpenBlurSettings)
  useEffect(() => {
    setSettings(getSharpenBlurSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setSharpenBlurSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Mode"
        value={settings.mode}
        options={[
          { value: 'sharpen', label: 'Sharpen' },
          { value: 'blur', label: 'Blur' },
        ]}
        onChange={(v) => update({ mode: v as SharpenBlurMode })}
      />
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Strength"
        value={settings.strength}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ strength: v })}
      />
      <SliderInput
        label="Hardness"
        value={settings.hardness}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ hardness: v })}
      />
    </>
  )
}

function RedEyeOptions() {
  const [settings, setSettings] = useState(getRedEyeSettings)
  useEffect(() => {
    setSettings(getRedEyeSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setRedEyeSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Pupil Size"
        value={settings.pupilSize}
        min={5}
        max={100}
        onChange={(v) => update({ pupilSize: v })}
      />
      <SliderInput
        label="Darken"
        value={settings.darkenAmount}
        min={0.1}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ darkenAmount: v })}
      />
    </>
  )
}

function QuickSelectionOptions() {
  const [settings, setSettings] = useState(getQuickSelectionSettings)
  useEffect(() => {
    setSettings(getQuickSelectionSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setQuickSelectionSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Brush Size"
        value={settings.brushSize}
        min={1}
        max={500}
        onChange={(v) => update({ brushSize: v })}
      />
      <CheckboxInput label="Auto-Enhance" checked={settings.autoEnhance} onChange={(v) => update({ autoEnhance: v })} />
      <CheckboxInput
        label="Sample All Layers"
        checked={settings.sampleAllLayers}
        onChange={(v) => update({ sampleAllLayers: v })}
      />
    </>
  )
}

function SymmetryOptions() {
  const [settings, setSettings] = useState(getSymmetrySettings)
  useEffect(() => {
    setSettings(getSymmetrySettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setSymmetrySettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={settings.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
        Symmetry
      </label>
      <NumberInput label="Axes" value={settings.axes} min={2} max={32} onChange={(v) => update({ axes: v })} />
      <NumberInput label="Angle" value={settings.angle} min={0} max={360} onChange={(v) => update({ angle: v })} />
    </>
  )
}

function PolygonalLassoOptions() {
  const [settings, setSettings] = useState(getPolygonalLassoSettings)
  useEffect(() => {
    setSettings(getPolygonalLassoSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setPolygonalLassoSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput
        label="Feather"
        value={settings.feather}
        min={0}
        max={100}
        onChange={(v) => update({ feather: v })}
      />
      <CheckboxInput label="Anti-alias" checked={settings.antiAlias} onChange={(v) => update({ antiAlias: v })} />
    </>
  )
}

function MagneticLassoOptions() {
  const [settings, setSettings] = useState(getMagneticLassoSettings)
  useEffect(() => {
    setSettings(getMagneticLassoSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setMagneticLassoSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Width" value={settings.width} min={1} max={40} onChange={(v) => update({ width: v })} />
      <SliderInput
        label="Contrast"
        value={settings.contrast}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ contrast: v })}
      />
      <NumberInput
        label="Frequency"
        value={settings.frequency}
        min={0}
        max={200}
        onChange={(v) => update({ frequency: v })}
      />
      <NumberInput
        label="Feather"
        value={settings.feather}
        min={0}
        max={100}
        onChange={(v) => update({ feather: v })}
      />
    </>
  )
}

function DodgeBurnOptions() {
  const [settings, setSettings] = useState(getDodgeBurnSettings)
  useEffect(() => {
    setSettings(getDodgeBurnSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setDodgeBurnSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Exposure"
        value={settings.exposure}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ exposure: v })}
      />
      <SelectInput
        label="Range"
        value={settings.range}
        options={[
          { value: 'shadows', label: 'Shadows' },
          { value: 'midtones', label: 'Midtones' },
          { value: 'highlights', label: 'Highlights' },
        ]}
        onChange={(v) => update({ range: v as TonalRange })}
      />
    </>
  )
}

function SpongeOptions() {
  const [settings, setSettings] = useState(getDodgeBurnSettings)
  useEffect(() => {
    setSettings(getDodgeBurnSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setDodgeBurnSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Flow"
        value={settings.exposure}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ exposure: v })}
      />
      <SelectInput
        label="Mode"
        value={settings.spongeMode}
        options={[
          { value: 'saturate', label: 'Saturate' },
          { value: 'desaturate', label: 'Desaturate' },
        ]}
        onChange={(v) => update({ spongeMode: v as SpongeMode })}
      />
    </>
  )
}

function SmudgeOptions() {
  const [settings, setSettings] = useState(getSmudgeSettings)
  useEffect(() => {
    setSettings(getSmudgeSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setSmudgeSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Strength"
        value={settings.strength}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ strength: v })}
      />
    </>
  )
}

function HealingBrushOptions() {
  const [settings, setSettings] = useState(getHealingBrushSettings)
  useEffect(() => {
    setSettings(getHealingBrushSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setHealingBrushSettings(patch)
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

function ColorRangeOptions() {
  const [settings, setSettings] = useState(getColorRangeSettings)
  useEffect(() => {
    setSettings(getColorRangeSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setColorRangeSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SliderInput
        label="Fuzziness"
        value={settings.fuzziness}
        min={0}
        max={200}
        step={1}
        onChange={(v) => update({ fuzziness: v })}
      />
      <span style={groupStyle}>
        <span style={labelStyle}>Preview</span>
        <input
          type="checkbox"
          checked={settings.preview}
          onChange={(e) => update({ preview: e.target.checked })}
          style={{ accentColor: 'var(--accent)' }}
        />
      </span>
      {settings.sampleColor && (
        <span style={groupStyle}>
          <span style={labelStyle}>Color</span>
          <span
            style={{
              display: 'inline-block',
              width: 20,
              height: 16,
              borderRadius: 3,
              border: '1px solid var(--border-color)',
              background: `rgb(${settings.sampleColor.r},${settings.sampleColor.g},${settings.sampleColor.b})`,
            }}
          />
        </span>
      )}
      <span style={{ color: 'var(--text-disabled)', fontSize: 10 }}>Click canvas to sample color</span>
    </>
  )
}

function RasterGradientOptions() {
  const [settings, setSettings] = useState(getRasterGradientSettings)
  useEffect(() => {
    setSettings(getRasterGradientSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setRasterGradientSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Type"
        value={settings.type}
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
          { value: 'angular', label: 'Angular' },
        ]}
        onChange={(v) => update({ type: v as RasterGradientType })}
      />
      <ColorSwatch label="FG" value={settings.foreground} onChange={(v) => update({ foreground: v })} />
      <ColorSwatch label="BG" value={settings.background} onChange={(v) => update({ background: v })} />
    </>
  )
}

function ContentAwareFillOptions() {
  const [settings, setSettings] = useState(getContentAwareFillSettings)
  useEffect(() => {
    setSettings(getContentAwareFillSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setContentAwareFillSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Sample"
        value={settings.sampleArea}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'custom', label: 'Custom' },
        ]}
        onChange={(v) => update({ sampleArea: v as 'auto' | 'custom' })}
      />
      <SliderInput
        label="Blend"
        value={settings.blendAmount}
        min={0}
        max={50}
        step={1}
        onChange={(v) => update({ blendAmount: v })}
      />
      <SliderInput
        label="Color Adapt"
        value={settings.colorAdaptation}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ colorAdaptation: v })}
      />
    </>
  )
}

function ContentAwareMoveOptions() {
  const [settings, setSettings] = useState(getContentAwareMoveSettings)
  useEffect(() => {
    setSettings(getContentAwareMoveSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setContentAwareMoveSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Mode"
        value={settings.mode}
        options={[
          { value: 'move', label: 'Move' },
          { value: 'extend', label: 'Extend' },
        ]}
        onChange={(v) => update({ mode: v as ContentAwareMoveMode })}
      />
      <SelectInput
        label="Adaptation"
        value={settings.adaptation}
        options={[
          { value: 'very-strict', label: 'Very Strict' },
          { value: 'strict', label: 'Strict' },
          { value: 'medium', label: 'Medium' },
          { value: 'loose', label: 'Loose' },
          { value: 'very-loose', label: 'Very Loose' },
        ]}
        onChange={(v) => update({ adaptation: v as ContentAwareAdaptation })}
      />
    </>
  )
}

function ContentAwareScaleOptions() {
  const [settings, setSettings] = useState(getContentAwareScaleSettings)
  useEffect(() => {
    setSettings(getContentAwareScaleSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setContentAwareScaleSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <CheckboxInput
        label="Protect Selection"
        checked={settings.protectMask}
        onChange={(v) => update({ protectMask: v })}
      />
    </>
  )
}

function MixerBrushOptions() {
  const [settings, setSettings] = useState(getMixerBrushSettings)
  useEffect(() => {
    setSettings(getMixerBrushSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setMixerBrushSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Size" value={settings.size} min={1} max={200} onChange={(v) => update({ size: v })} />
      <SliderInput
        label="Wet"
        value={settings.wet}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ wet: v })}
      />
      <SliderInput
        label="Load"
        value={settings.load}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ load: v })}
      />
      <SliderInput
        label="Mix"
        value={settings.mix}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ mix: v })}
      />
      <SliderInput
        label="Flow"
        value={settings.flow}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ flow: v })}
      />
    </>
  )
}

function SpotHealingOptions() {
  const [settings, setSettings] = useState(getSpotHealingSettings)
  useEffect(() => {
    setSettings(getSpotHealingSettings())
  }, [])
  const update = useCallback((patch: Partial<SpotHealingSettings>) => {
    setSpotHealingSettings(patch)
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
      <SelectInput
        label="Type"
        value={settings.type}
        options={[
          { value: 'proximity-match', label: 'Proximity Match' },
          { value: 'create-texture', label: 'Create Texture' },
        ]}
        onChange={(v) => update({ type: v as SpotHealingSettings['type'] })}
      />
    </>
  )
}

function PatchToolOptions() {
  const [settings, setSettings] = useState(getPatchSettings)
  useEffect(() => {
    setSettings(getPatchSettings())
  }, [])
  const update = useCallback((patch: Partial<PatchSettings>) => {
    setPatchSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Mode"
        value={settings.mode}
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'content-aware', label: 'Content-Aware' },
        ]}
        onChange={(v) => update({ mode: v as PatchSettings['mode'] })}
      />
      <NumberInput
        label="Diffusion"
        value={settings.diffusion}
        min={1}
        max={10}
        onChange={(v) => update({ diffusion: v })}
      />
    </>
  )
}

// ── Refine Edge options ──

function RefineEdgeOptions() {
  const [settings, setSettings] = useState(getRefineEdgeSettings)
  const refineEdgeActive = useEditorStore((s) => s.refineEdgeActive)
  const toggleRefineEdge = useEditorStore((s) => s.toggleRefineEdge)

  // Enter/exit refine edge workspace on toggle
  useEffect(() => {
    if (refineEdgeActive && !isRefineEdgeActive()) {
      enterRefineEdge()
      setSettings(getRefineEdgeSettings())
    } else if (!refineEdgeActive && isRefineEdgeActive()) {
      exitRefineEdge(false)
    }
  }, [refineEdgeActive])

  const update = useCallback((patch: Partial<ReturnType<typeof getRefineEdgeSettings>>) => {
    updateRefineEdge(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const handleApply = useCallback(() => {
    exitRefineEdge(true)
    toggleRefineEdge()
  }, [toggleRefineEdge])

  const handleCancel = useCallback(() => {
    exitRefineEdge(false)
    toggleRefineEdge()
  }, [toggleRefineEdge])

  if (!refineEdgeActive) return null

  return (
    <>
      <SliderInput
        label="Smooth"
        value={settings.smooth}
        min={0}
        max={100}
        step={1}
        onChange={(v) => update({ smooth: v })}
      />
      <SliderInput
        label="Feather"
        value={settings.feather}
        min={0}
        max={250}
        step={1}
        format={(v) => `${v}px`}
        onChange={(v) => update({ feather: v })}
      />
      <SliderInput
        label="Contrast"
        value={settings.contrast}
        min={0}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ contrast: v })}
      />
      <SliderInput
        label="Shift"
        value={settings.shift}
        min={-100}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => update({ shift: v })}
      />
      <CheckboxInput
        label="Decontaminate"
        checked={settings.decontaminate}
        onChange={(v) => update({ decontaminate: v })}
      />
      {settings.decontaminate && (
        <SliderInput
          label="Amount"
          value={settings.decontaminateAmount}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => update({ decontaminateAmount: v })}
        />
      )}
      <SelectInput
        label="View"
        value={settings.viewMode}
        options={[
          { value: 'marching-ants', label: 'Marching Ants' },
          { value: 'overlay', label: 'Overlay' },
          { value: 'on-black', label: 'On Black' },
          { value: 'on-white', label: 'On White' },
          { value: 'black-white', label: 'Black & White' },
          { value: 'on-layers', label: 'On Layers' },
        ]}
        onChange={(v) => update({ viewMode: v as RefineEdgeViewMode })}
      />
      <button
        onClick={handleApply}
        style={{
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 4,
          padding: '2px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        OK
      </button>
      <button
        onClick={handleCancel}
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 4,
          padding: '2px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </>
  )
}

// ── Perspective Transform options ──

function PerspectiveTransformOptions() {
  const [settings, setSettings] = useState(getPerspectiveSettings)
  useEffect(() => {
    setSettings(getPerspectiveSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setPerspectiveSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <CheckboxInput label="Show Grid" checked={settings.showGrid} onChange={(v) => update({ showGrid: v })} />
      <NumberInput
        label="Grid Divisions"
        value={settings.gridDivisions}
        min={1}
        max={20}
        onChange={(v) => update({ gridDivisions: v })}
      />
      <SelectInput
        label="Interpolation"
        value={settings.interpolation}
        options={[
          { value: 'bilinear', label: 'Bilinear' },
          { value: 'nearest', label: 'Nearest' },
        ]}
        onChange={(v) => update({ interpolation: v as 'bilinear' | 'nearest' })}
      />
    </>
  )
}

// ── Liquify options ──

function LiquifyOptions() {
  const [settings, setSettings] = useState(getLiquifySettings)
  useEffect(() => {
    setSettings(getLiquifySettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setLiquifySettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SelectInput
        label="Mode"
        value={settings.mode}
        options={[
          { value: 'push', label: 'Forward Warp' },
          { value: 'twirl-cw', label: 'Twirl CW' },
          { value: 'twirl-ccw', label: 'Twirl CCW' },
          { value: 'bloat', label: 'Bloat' },
          { value: 'pinch', label: 'Pucker' },
          { value: 'smooth', label: 'Smooth' },
          { value: 'reconstruct', label: 'Reconstruct' },
        ]}
        onChange={(v) => update({ mode: v as LiquifyMode })}
      />
      <NumberInput
        label="Size"
        value={settings.brushSize}
        min={1}
        max={500}
        onChange={(v) => update({ brushSize: v })}
      />
      <SliderInput
        label="Pressure"
        value={settings.brushPressure}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ brushPressure: v })}
      />
      <SliderInput
        label="Rate"
        value={settings.brushRate}
        min={0.01}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => update({ brushRate: v })}
      />
    </>
  )
}

// ── Mesh Warp options ──

function MeshWarpOptions() {
  const [settings, setSettings] = useState(getMeshWarpSettings)
  useEffect(() => {
    setSettings(getMeshWarpSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setMeshWarpSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <NumberInput label="Rows" value={settings.gridRows} min={1} max={20} onChange={(v) => update({ gridRows: v })} />
      <NumberInput label="Cols" value={settings.gridCols} min={1} max={20} onChange={(v) => update({ gridCols: v })} />
      <CheckboxInput label="Show Grid" checked={settings.showGrid} onChange={(v) => update({ showGrid: v })} />
    </>
  )
}

// ── Puppet Warp options ──

function PuppetWarpOptions() {
  const [settings, setSettings] = useState(getPuppetWarpSettings)
  useEffect(() => {
    setSettings(getPuppetWarpSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setPuppetWarpSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <SliderInput
        label="Rigidity"
        value={settings.rigidity}
        min={0.1}
        max={3}
        step={0.1}
        format={(v) => v.toFixed(1)}
        onChange={(v) => update({ rigidity: v })}
      />
      <NumberInput
        label="Mesh Density"
        value={settings.meshDensity}
        min={10}
        max={200}
        onChange={(v) => update({ meshDensity: v })}
      />
    </>
  )
}

// ── Perspective Warp options ──

function PerspectiveWarpOptions() {
  const [settings, setSettings] = useState(getPerspectiveWarpSettings)
  useEffect(() => {
    setSettings(getPerspectiveWarpSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setPerspectiveWarpSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <CheckboxInput label="Show Grid" checked={settings.showGrid} onChange={(v) => update({ showGrid: v })} />
      <NumberInput
        label="Grid Divisions"
        value={settings.gridDivisions}
        min={1}
        max={20}
        onChange={(v) => update({ gridDivisions: v })}
      />
    </>
  )
}

// ── Cage Transform options ──

function CageTransformOptions() {
  const [settings, setSettings] = useState(getCageTransformSettings)
  useEffect(() => {
    setSettings(getCageTransformSettings())
  }, [])
  const update = useCallback((patch: Partial<typeof settings>) => {
    setCageTransformSettings(patch)
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  return (
    <>
      <CheckboxInput label="Show Cage" checked={settings.showCage} onChange={(v) => update({ showCage: v })} />
    </>
  )
}

// ── Main component ──

export function ToolOptionsBar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const refineEdgeActive = useEditorStore((s) => s.refineEdgeActive)

  const toolName = refineEdgeActive ? 'Select & Mask' : (toolLabels[activeTool] ?? activeTool)

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
      options = (
        <>
          <BrushOptions />
          <PressureOptions />
          <SymmetryOptions />
        </>
      )
      break
    case 'eraser':
      options = (
        <>
          <EraserOptions />
          <PressureOptions />
          <SymmetryOptions />
        </>
      )
      break
    case 'pixel-draw':
      options = <PixelDrawOptions />
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
      options = (
        <>
          <GradientOptions />
          <RasterGradientOptions />
        </>
      )
      break
    case 'dodge':
    case 'burn':
      options = <DodgeBurnOptions />
      break
    case 'sponge':
      options = <SpongeOptions />
      break
    case 'smudge':
      options = <SmudgeOptions />
      break
    case 'mixer-brush':
      options = <MixerBrushOptions />
      break
    case 'healing-brush':
      options = <HealingBrushOptions />
      break
    case 'color-range':
      options = <ColorRangeOptions />
      break
    case 'polygonal-lasso':
      options = <PolygonalLassoOptions />
      break
    case 'magnetic-lasso':
      options = <MagneticLassoOptions />
      break
    case 'sharpen-brush':
    case 'blur-brush':
      options = <SharpenBlurBrushOptions />
      break
    case 'red-eye':
      options = <RedEyeOptions />
      break
    case 'content-aware-fill':
      options = <ContentAwareFillOptions />
      break
    case 'content-aware-move':
      options = <ContentAwareMoveOptions />
      break
    case 'content-aware-scale':
      options = <ContentAwareScaleOptions />
      break
    case 'quick-selection':
      options = <QuickSelectionOptions />
      break
    case 'spot-healing':
      options = <SpotHealingOptions />
      break
    case 'patch':
      options = <PatchToolOptions />
      break
    case 'perspective-transform':
      options = <PerspectiveTransformOptions />
      break
    case 'liquify':
      options = <LiquifyOptions />
      break
    case 'mesh-warp':
      options = <MeshWarpOptions />
      break
    case 'puppet-warp':
      options = <PuppetWarpOptions />
      break
    case 'perspective-warp':
      options = <PerspectiveWarpOptions />
      break
    case 'cage-transform':
      options = <CageTransformOptions />
      break
    default:
      break
  }

  // Refine Edge workspace overrides normal tool options
  if (refineEdgeActive) {
    options = <RefineEdgeOptions />
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
      <span style={{ flex: 1 }} />
      <BreakpointSection />
      <span style={{ width: 1, height: 16, background: 'var(--border-subtle)', flexShrink: 0 }} />
      <SnapDropdown />
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Breakpoint section — inline responsive breakpoint controls
// ---------------------------------------------------------------------------

const BP_PRESETS: Omit<Breakpoint, 'id'>[] = [
  { name: 'Mobile', width: 375 },
  { name: 'Tablet', width: 768 },
  { name: 'Desktop', width: 1440 },
  { name: 'Large Desktop', width: 1920 },
]

const bpChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '1px 6px',
  borderRadius: 3,
  border: '1px solid var(--border-color)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 10,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: '18px',
}

const bpChipActiveStyle: React.CSSProperties = {
  ...bpChipStyle,
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
  fontWeight: 600,
}

function BreakpointSection() {
  const artboard = useEditorStore((s) => {
    const artboardId = s.viewport.artboardId
    if (!artboardId) return getActiveArtboard()
    return s.document.artboards.find((a) => a.id === artboardId) ?? null
  })
  const setActiveBreakpoint = useEditorStore((s) => s.setActiveBreakpoint)
  const removeBreakpoint = useEditorStore((s) => s.removeBreakpoint)
  const addBreakpoint = useEditorStore((s) => s.addBreakpoint)
  const [showPresets, setShowPresets] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!showPresets) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setShowPresets(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPresets(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [showPresets])

  useEffect(() => {
    if (showPresets && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [showPresets])

  if (!artboard) return null

  const breakpoints = artboard.breakpoints ?? []
  const activeId = artboard.activeBreakpointId
  const existingWidths = new Set(breakpoints.map((b) => b.width))

  const presetMenuRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 10px',
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text-primary)',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {breakpoints.length > 0 && (
        <>
          <span style={{ color: 'var(--text-disabled)', fontSize: 9 }}>BP</span>
          <button
            style={activeId == null ? bpChipActiveStyle : bpChipStyle}
            onClick={() => setActiveBreakpoint(artboard.id, null)}
          >
            {artboard.width}
          </button>
          {breakpoints.map((bp) => (
            <button
              key={bp.id}
              style={activeId === bp.id ? bpChipActiveStyle : bpChipStyle}
              onClick={() => setActiveBreakpoint(artboard.id, bp.id)}
            >
              {bp.name} {bp.width}
              <span
                style={{
                  marginLeft: 2,
                  fontSize: 8,
                  opacity: 0.6,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  removeBreakpoint(artboard.id, bp.id)
                }}
                title="Remove"
              >
                x
              </span>
            </button>
          ))}
        </>
      )}
      <button
        ref={btnRef}
        onClick={() => setShowPresets((v) => !v)}
        title="Add breakpoint"
        className="cd-hoverable"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: 3,
          border: '1px solid var(--border-color)',
          background: 'none',
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        +
      </button>
      {showPresets &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '4px 0',
              minWidth: 180,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 10000,
            }}
          >
            {BP_PRESETS.map((preset) => {
              const exists = existingWidths.has(preset.width)
              return (
                <button
                  key={preset.width}
                  className="cd-hoverable"
                  style={{ ...presetMenuRow, opacity: exists ? 0.4 : 1, cursor: exists ? 'default' : 'pointer' }}
                  disabled={exists}
                  onClick={() => {
                    if (!exists) {
                      addBreakpoint(artboard.id, { ...preset, id: uuid() })
                      setShowPresets(false)
                    }
                  }}
                >
                  <span>{preset.name}</span>
                  <span style={{ color: 'var(--text-disabled)', fontSize: 10 }}>{preset.width}px</span>
                </button>
              )
            })}
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
            <button
              className="cd-hoverable"
              style={presetMenuRow}
              onClick={() => {
                const widthStr = prompt('Enter breakpoint width (px):')
                if (!widthStr) return
                const width = parseInt(widthStr, 10)
                if (isNaN(width) || width < 1) return
                const name = prompt('Breakpoint name:', `${width}px`) ?? `${width}px`
                addBreakpoint(artboard.id, { id: uuid(), name, width })
                setShowPresets(false)
              }}
            >
              Custom...
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Snap dropdown — master toggle + granular settings
// ---------------------------------------------------------------------------

const magnetSvg = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2v6a6 6 0 0 0 12 0V2" />
    <line x1="6" y1="2" x2="6" y2="6" />
    <line x1="18" y1="2" x2="18" y2="6" />
    <line x1="2" y1="2" x2="10" y2="2" />
    <line x1="14" y1="2" x2="22" y2="2" />
  </svg>
)

function SnapDropdown() {
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const toggleSnap = useEditorStore((s) => s.toggleSnap)
  const snapToGrid = useEditorStore((s) => s.snapToGrid)
  const snapToGuides = useEditorStore((s) => s.snapToGuides)
  const snapToLayers = useEditorStore((s) => s.snapToLayers)
  const snapToArtboard = useEditorStore((s) => s.snapToArtboard)
  const snapToPixel = useEditorStore((s) => s.snapToPixel)
  const snapThreshold = useEditorStore((s) => s.snapThreshold)
  const toggleSnapToGrid = useEditorStore((s) => s.toggleSnapToGrid)
  const toggleSnapToGuides = useEditorStore((s) => s.toggleSnapToGuides)
  const toggleSnapToLayers = useEditorStore((s) => s.toggleSnapToLayers)
  const toggleSnapToArtboard = useEditorStore((s) => s.toggleSnapToArtboard)
  const toggleSnapToPixel = useEditorStore((s) => s.toggleSnapToPixel)
  const setSnapThreshold = useEditorStore((s) => s.setSnapThreshold)
  const gridSize = useEditorStore((s) => s.gridSize)
  const setGridSize = useEditorStore((s) => s.setGridSize)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setOpen(false)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.right - 220 })
    }
  }, [open])

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: 11,
    color: 'var(--text-primary)',
    border: 'none',
    background: 'transparent',
    width: '100%',
    textAlign: 'left',
  }

  const checkStyle: React.CSSProperties = {
    accentColor: 'var(--accent)',
    width: 13,
    height: 13,
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div style={{ flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        title="Snapping settings"
        className="cd-hoverable"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          borderRadius: 4,
          padding: '2px 6px',
          cursor: 'pointer',
          fontSize: 11,
          color: snapEnabled ? 'var(--accent)' : 'var(--text-disabled)',
          height: 24,
        }}
      >
        {magnetSvg}
        <span style={{ fontWeight: 500 }}>Snap</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style={{ opacity: 0.5 }}>
          <path d="M1 2.5L4 5.5L7 2.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={ref}
            style={{
              position: 'fixed',
              top: dropPos.top,
              left: Math.max(0, dropPos.left),
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px 0',
              minWidth: 220,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 10000,
            }}
          >
            {/* Master toggle */}
            <label className="cd-hoverable" style={rowStyle}>
              <input type="checkbox" checked={snapEnabled} onChange={toggleSnap} style={checkStyle} />
              <span style={{ fontWeight: 600 }}>Enable Snapping</span>
            </label>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Snap targets */}
            <div
              style={{
                padding: '4px 12px 2px',
                fontSize: 9,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              Snap To
            </div>
            <label className="cd-hoverable" style={{ ...rowStyle, opacity: snapEnabled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={toggleSnapToGrid}
                disabled={!snapEnabled}
                style={checkStyle}
              />
              <span>Grid</span>
            </label>
            <label className="cd-hoverable" style={{ ...rowStyle, opacity: snapEnabled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={snapToGuides}
                onChange={toggleSnapToGuides}
                disabled={!snapEnabled}
                style={checkStyle}
              />
              <span>Guides</span>
            </label>
            <label className="cd-hoverable" style={{ ...rowStyle, opacity: snapEnabled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={snapToLayers}
                onChange={toggleSnapToLayers}
                disabled={!snapEnabled}
                style={checkStyle}
              />
              <span>Layer Edges & Centers</span>
            </label>
            <label className="cd-hoverable" style={{ ...rowStyle, opacity: snapEnabled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={snapToArtboard}
                onChange={toggleSnapToArtboard}
                disabled={!snapEnabled}
                style={checkStyle}
              />
              <span>Artboard Edges</span>
            </label>
            <label className="cd-hoverable" style={{ ...rowStyle, opacity: snapEnabled ? 1 : 0.4 }}>
              <input
                type="checkbox"
                checked={snapToPixel}
                onChange={toggleSnapToPixel}
                disabled={!snapEnabled}
                style={checkStyle}
              />
              <span>Pixel Grid</span>
            </label>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Threshold */}
            <div
              style={{
                padding: '4px 12px 2px',
                fontSize: 9,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              Settings
            </div>
            <div style={{ ...rowStyle, cursor: 'default' }}>
              <span style={{ minWidth: 70 }}>Threshold</span>
              <input
                type="range"
                min={1}
                max={20}
                value={snapThreshold}
                onChange={(e) => setSnapThreshold(Number(e.target.value))}
                disabled={!snapEnabled}
                style={{
                  flex: 1,
                  height: 14,
                  cursor: snapEnabled ? 'pointer' : 'default',
                  accentColor: 'var(--accent)',
                }}
              />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', minWidth: 22, textAlign: 'right' }}>
                {snapThreshold}px
              </span>
            </div>
            <div style={{ ...rowStyle, cursor: 'default' }}>
              <span style={{ minWidth: 70 }}>Grid Size</span>
              <input
                type="number"
                min={1}
                max={200}
                value={gridSize}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1) setGridSize(v)
                }}
                style={{
                  ...smallInputStyle,
                  width: 50,
                  textAlign: 'center',
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>px</span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
