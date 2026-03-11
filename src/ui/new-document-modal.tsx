import { useState, useCallback, useEffect, useRef } from 'react'
import { FocusTrap } from '@/ui/focus-trap'

interface NewDocumentSettings {
  title: string
  width: number
  height: number
  unit: 'px' | 'in' | 'cm' | 'mm'
  dpi: number
  colorspace: 'srgb' | 'p3' | 'adobe-rgb'
  backgroundColor: string
  transparentBackground: boolean
}

const PRESETS: { label: string; group: string; w: number; h: number; dpi: number }[] = [
  // Screen
  { label: 'HD (1920 × 1080)', group: 'Screen', w: 1920, h: 1080, dpi: 72 },
  { label: '4K (3840 × 2160)', group: 'Screen', w: 3840, h: 2160, dpi: 72 },
  { label: 'iPhone 15 (1179 × 2556)', group: 'Screen', w: 1179, h: 2556, dpi: 72 },
  { label: 'iPad (2048 × 2732)', group: 'Screen', w: 2048, h: 2732, dpi: 72 },
  { label: 'Instagram Post (1080 × 1080)', group: 'Social', w: 1080, h: 1080, dpi: 72 },
  { label: 'Instagram Story (1080 × 1920)', group: 'Social', w: 1080, h: 1920, dpi: 72 },
  { label: 'Twitter/X Header (1500 × 500)', group: 'Social', w: 1500, h: 500, dpi: 72 },
  // Print (stored as px at given DPI)
  { label: 'A4 (210 × 297 mm)', group: 'Print', w: 2480, h: 3508, dpi: 300 },
  { label: 'A3 (297 × 420 mm)', group: 'Print', w: 3508, h: 4961, dpi: 300 },
  { label: 'Letter (8.5 × 11 in)', group: 'Print', w: 2550, h: 3300, dpi: 300 },
  { label: 'Tabloid (11 × 17 in)', group: 'Print', w: 3300, h: 5100, dpi: 300 },
  // Icon
  { label: 'App Icon (1024 × 1024)', group: 'Icon', w: 1024, h: 1024, dpi: 72 },
  { label: 'Favicon (64 × 64)', group: 'Icon', w: 64, h: 64, dpi: 72 },
]

const DPI_OPTIONS = [72, 96, 150, 300, 600]
const UNITS: { value: NewDocumentSettings['unit']; label: string }[] = [
  { value: 'px', label: 'Pixels' },
  { value: 'in', label: 'Inches' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'mm', label: 'Millimeters' },
]
const COLORSPACES: { value: NewDocumentSettings['colorspace']; label: string }[] = [
  { value: 'srgb', label: 'sRGB' },
  { value: 'p3', label: 'Display P3' },
  { value: 'adobe-rgb', label: 'Adobe RGB' },
]

function pxToUnit(px: number, unit: NewDocumentSettings['unit'], dpi: number): number {
  switch (unit) {
    case 'px':
      return px
    case 'in':
      return px / dpi
    case 'cm':
      return (px / dpi) * 2.54
    case 'mm':
      return (px / dpi) * 25.4
  }
}

function unitToPx(val: number, unit: NewDocumentSettings['unit'], dpi: number): number {
  switch (unit) {
    case 'px':
      return Math.round(val)
    case 'in':
      return Math.round(val * dpi)
    case 'cm':
      return Math.round((val / 2.54) * dpi)
    case 'mm':
      return Math.round((val / 25.4) * dpi)
  }
}

function formatUnitValue(px: number, unit: NewDocumentSettings['unit'], dpi: number): string {
  const val = pxToUnit(px, unit, dpi)
  if (unit === 'px') return String(val)
  return val.toFixed(2)
}

export function NewDocumentModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (settings: {
    title: string
    width: number
    height: number
    colorspace: 'srgb' | 'p3' | 'adobe-rgb'
    backgroundColor: string
    dpi: number
  }) => void
}) {
  const [settings, setSettings] = useState<NewDocumentSettings>({
    title: 'Untitled',
    width: 1920,
    height: 1080,
    unit: 'px',
    dpi: 72,
    colorspace: 'srgb',
    backgroundColor: '#ffffff',
    transparentBackground: false,
  })
  const [linked, setLinked] = useState(true)
  const aspectRatio = useRef(settings.width / settings.height)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.select()
  }, [])

  // Enter to create (Escape is handled by FocusTrap onEscape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleCreate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const update = useCallback((partial: Partial<NewDocumentSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      return next
    })
  }, [])

  const setWidth = useCallback(
    (pxW: number) => {
      setSettings((prev) => {
        const w = Math.max(1, Math.min(16384, pxW))
        const h = linked ? Math.max(1, Math.round(w / aspectRatio.current)) : prev.height
        return { ...prev, width: w, height: h }
      })
    },
    [linked],
  )

  const setHeight = useCallback(
    (pxH: number) => {
      setSettings((prev) => {
        const h = Math.max(1, Math.min(16384, pxH))
        const w = linked ? Math.max(1, Math.round(h * aspectRatio.current)) : prev.width
        return { ...prev, width: w, height: h }
      })
    },
    [linked],
  )

  const applyPreset = useCallback((preset: (typeof PRESETS)[number]) => {
    setSettings((prev) => ({
      ...prev,
      width: preset.w,
      height: preset.h,
      dpi: preset.dpi,
    }))
    aspectRatio.current = preset.w / preset.h
  }, [])

  const swapDimensions = useCallback(() => {
    setSettings((prev) => {
      aspectRatio.current = prev.height / prev.width
      return { ...prev, width: prev.height, height: prev.width }
    })
  }, [])

  const handleCreate = () => {
    onCreate({
      title: settings.title || 'Untitled',
      width: settings.width,
      height: settings.height,
      colorspace: settings.colorspace,
      backgroundColor: settings.transparentBackground ? 'transparent' : settings.backgroundColor,
      dpi: settings.dpi,
    })
  }

  // Group presets
  const groups = new Map<string, typeof PRESETS>()
  for (const p of PRESETS) {
    if (!groups.has(p.group)) groups.set(p.group, [])
    groups.get(p.group)!.push(p)
  }

  const widthDisplay = formatUnitValue(settings.width, settings.unit, settings.dpi)
  const heightDisplay = formatUnitValue(settings.height, settings.unit, settings.dpi)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10000,
        fontFamily: 'var(--font-body)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <FocusTrap onEscape={onClose}>
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 12px)',
          width: 560,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>New Document</h2>
          <button onClick={onClose} style={closeBtnStyle}>
            &times;
          </button>
        </div>

        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Title */}
          <Field label="Name">
            <input
              ref={titleRef}
              type="text"
              value={settings.title}
              onChange={(e) => update({ title: e.target.value })}
              style={inputStyle}
            />
          </Field>

          {/* Presets */}
          <Field label="Preset">
            <select
              onChange={(e) => {
                const idx = parseInt(e.target.value)
                if (!isNaN(idx)) applyPreset(PRESETS[idx]!)
              }}
              style={inputStyle}
              defaultValue=""
            >
              <option value="" disabled>
                Choose a preset...
              </option>
              {[...groups.entries()].map(([group, presets]) => (
                <optgroup key={group} label={group}>
                  {presets.map((p) => {
                    const idx = PRESETS.indexOf(p)
                    return (
                      <option key={idx} value={idx}>
                        {p.label}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </Field>

          {/* Dimensions */}
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Width</label>
                <input
                  type="number"
                  value={widthDisplay}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    if (!isNaN(val)) setWidth(unitToPx(val, settings.unit, settings.dpi))
                  }}
                  onBlur={() => {
                    aspectRatio.current = settings.width / settings.height
                  }}
                  min={1}
                  style={inputStyle}
                />
              </div>

              {/* Link / Swap buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 4 }}>
                <button
                  onClick={() => {
                    setLinked(!linked)
                    aspectRatio.current = settings.width / settings.height
                  }}
                  title={linked ? 'Unlink dimensions' : 'Link dimensions'}
                  style={{
                    ...iconBtnStyle,
                    color: linked ? 'var(--accent)' : 'var(--text-tertiary)',
                  }}
                >
                  {linked ? '🔗' : '⛓️‍💥'}
                </button>
                <button onClick={swapDimensions} title="Swap width and height" style={iconBtnStyle}>
                  ⇅
                </button>
              </div>

              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Height</label>
                <input
                  type="number"
                  value={heightDisplay}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    if (!isNaN(val)) setHeight(unitToPx(val, settings.unit, settings.dpi))
                  }}
                  onBlur={() => {
                    aspectRatio.current = settings.width / settings.height
                  }}
                  min={1}
                  style={inputStyle}
                />
              </div>

              <div style={{ width: 100 }}>
                <label style={labelStyle}>Units</label>
                <select
                  value={settings.unit}
                  onChange={(e) => update({ unit: e.target.value as NewDocumentSettings['unit'] })}
                  style={inputStyle}
                >
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {settings.width} × {settings.height} px
            </div>
          </div>

          {/* DPI */}
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <Field label="Resolution (DPI)">
                <select
                  value={settings.dpi}
                  onChange={(e) => update({ dpi: parseInt(e.target.value) })}
                  style={inputStyle}
                >
                  {DPI_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} DPI
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="Color Space">
                <select
                  value={settings.colorspace}
                  onChange={(e) => update({ colorspace: e.target.value as NewDocumentSettings['colorspace'] })}
                  style={inputStyle}
                >
                  {COLORSPACES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {/* Background */}
          <div>
            <label style={labelStyle}>Background</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.transparentBackground}
                  onChange={(e) => update({ transparentBackground: e.target.checked })}
                />
                Transparent
              </label>
              {!settings.transparentBackground && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                  <input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(e) => update({ backgroundColor: e.target.value })}
                    style={{
                      width: 28,
                      height: 28,
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 4,
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  />
                  <input
                    type="text"
                    value={settings.backgroundColor}
                    onChange={(e) => update({ backgroundColor: e.target.value })}
                    style={{ ...inputStyle, width: 90, fontFamily: 'monospace' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: Math.min(200, settings.width > settings.height ? 200 : 200 * (settings.width / settings.height)),
                height: Math.min(
                  200,
                  settings.height > settings.width ? 200 : 200 * (settings.height / settings.width),
                ),
                background: settings.transparentBackground
                  ? 'repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 0 0 / 16px 16px'
                  : settings.backgroundColor,
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button onClick={onClose} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button onClick={handleCreate} style={primaryBtnStyle}>
              Create
            </button>
          </div>
        </div>
      </div>
      </FocusTrap>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  fontSize: 13,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg-base)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  cursor: 'pointer',
  color: 'var(--text-tertiary)',
  padding: '0 4px',
  lineHeight: 1,
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  padding: '2px 4px',
  lineHeight: 1,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 24px',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: 'var(--font-body)',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 24px',
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
}
