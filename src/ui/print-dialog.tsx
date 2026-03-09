import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { downloadBlob } from '@/io/raster-export'
import {
  type PrintSettings,
  DEFAULT_PRINT_SETTINGS,
  exportForPrint,
  generatePrintPreview,
  getPaperDimensions,
  calculateCanvasDimensions,
} from '@/io/print-export'

const DPI_OPTIONS = [72, 150, 300, 600]
const PAPER_SIZES: { value: PrintSettings['paperSize']; label: string }[] = [
  { value: 'a4', label: 'A4 (210 x 297 mm)' },
  { value: 'a3', label: 'A3 (297 x 420 mm)' },
  { value: 'letter', label: 'Letter (8.5 x 11 in)' },
  { value: 'legal', label: 'Legal (8.5 x 14 in)' },
  { value: 'tabloid', label: 'Tabloid (11 x 17 in)' },
  { value: 'custom', label: 'Custom' },
]

// ── Storage key ──

const STORAGE_KEY = 'crossdraw:print-settings'

function loadPrintSettings(): PrintSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_PRINT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PRINT_SETTINGS }
}

function savePrintSettings(settings: PrintSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

// ── Component ──

export function PrintDialog() {
  const [visible, setVisible] = useState(false)
  const [settings, setSettings] = useState<PrintSettings>(() => loadPrintSettings())
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doc = useEditorStore((s) => s.document)

  // Listen for show event
  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('crossdraw:show-print-dialog', handler)
    return () => window.removeEventListener('crossdraw:show-print-dialog', handler)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setVisible(false)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible])

  // Update settings helper
  const update = useCallback((partial: Partial<PrintSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }))
  }, [])

  const updateMargin = useCallback((key: keyof PrintSettings['margins'], value: number) => {
    setSettings((prev) => ({
      ...prev,
      margins: { ...prev.margins, [key]: value },
    }))
  }, [])

  // Generate preview when settings or visibility change
  useEffect(() => {
    if (!visible) return
    if (!doc.artboards[0]) return

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }

    previewTimeoutRef.current = setTimeout(async () => {
      try {
        const blob = await generatePrintPreview(doc, 0, settings, 380)
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
      } catch (err) {
        console.error('Print preview failed:', err)
      }
    }, 300)

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [
    visible,
    settings.dpi,
    settings.paperSize,
    settings.bleed,
    settings.cropMarks,
    settings.registrationMarks,
    settings.colorBars,
    settings.colorMode,
    settings.customWidth,
    settings.customHeight,
  ])

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [])

  if (!visible) return null

  const paperDims = getPaperDimensions(settings)
  const canvasDims = calculateCanvasDimensions(settings)

  const handleExport = async () => {
    setExporting(true)
    try {
      savePrintSettings(settings)
      const blob = await exportForPrint(doc, 0, settings)
      const title = doc.metadata.title || 'Untitled'
      downloadBlob(blob, `${title}-print-${settings.dpi}dpi.png`)
    } catch (err) {
      console.error('Print export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const close = () => {
    setVisible(false)
  }

  return (
    <div style={overlayStyle} onClick={close}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Print / Print-Ready Export</span>
          <button style={closeButtonStyle} onClick={close}>
            &#x2715;
          </button>
        </div>

        <div style={bodyStyle}>
          {/* Left panel: settings */}
          <div style={leftPanelStyle}>
            {/* DPI */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Resolution (DPI)</label>
              <select
                value={settings.dpi}
                onChange={(e) => update({ dpi: Number(e.target.value) })}
                style={selectStyle}
              >
                {DPI_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} DPI
                  </option>
                ))}
              </select>
            </div>

            {/* Paper Size */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Paper Size</label>
              <select
                value={settings.paperSize}
                onChange={(e) => update({ paperSize: e.target.value as PrintSettings['paperSize'] })}
                style={selectStyle}
              >
                {PAPER_SIZES.map((ps) => (
                  <option key={ps.value} value={ps.value}>
                    {ps.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom dimensions */}
            {settings.paperSize === 'custom' && (
              <div style={sectionStyle}>
                <label style={labelStyle}>Custom Size (mm)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    value={settings.customWidth ?? 210}
                    onChange={(e) => update({ customWidth: Number(e.target.value) || 210 })}
                    style={{ ...inputStyle, width: 80 }}
                    min={10}
                    placeholder="Width"
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>x</span>
                  <input
                    type="number"
                    value={settings.customHeight ?? 297}
                    onChange={(e) => update({ customHeight: Number(e.target.value) || 297 })}
                    style={{ ...inputStyle, width: 80 }}
                    min={10}
                    placeholder="Height"
                  />
                </div>
              </div>
            )}

            {/* Color Mode */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Color Mode</label>
              <select
                value={settings.colorMode}
                onChange={(e) => update({ colorMode: e.target.value as 'rgb' | 'cmyk' })}
                style={selectStyle}
              >
                <option value="rgb">RGB</option>
                <option value="cmyk">CMYK (simulated)</option>
              </select>
            </div>

            {/* Bleed */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Bleed (mm)</label>
              <input
                type="number"
                value={settings.bleed}
                onChange={(e) => update({ bleed: Math.max(0, Number(e.target.value)) })}
                style={{ ...inputStyle, width: 80 }}
                min={0}
                max={25}
                step={0.5}
              />
            </div>

            {/* Print Marks */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Print Marks</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ToggleRow label="Crop Marks" checked={settings.cropMarks} onChange={(v) => update({ cropMarks: v })} />
                <ToggleRow
                  label="Registration Marks"
                  checked={settings.registrationMarks}
                  onChange={(v) => update({ registrationMarks: v })}
                />
                <ToggleRow label="Color Bars" checked={settings.colorBars} onChange={(v) => update({ colorBars: v })} />
              </div>
            </div>

            {/* Margins */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Margins (mm)</label>
              <div style={marginsGridStyle}>
                <div style={marginFieldStyle}>
                  <span style={marginLabelStyle}>Top</span>
                  <input
                    type="number"
                    value={settings.margins.top}
                    onChange={(e) => updateMargin('top', Math.max(0, Number(e.target.value)))}
                    style={{ ...inputStyle, width: 60 }}
                    min={0}
                    step={1}
                  />
                </div>
                <div style={marginFieldStyle}>
                  <span style={marginLabelStyle}>Right</span>
                  <input
                    type="number"
                    value={settings.margins.right}
                    onChange={(e) => updateMargin('right', Math.max(0, Number(e.target.value)))}
                    style={{ ...inputStyle, width: 60 }}
                    min={0}
                    step={1}
                  />
                </div>
                <div style={marginFieldStyle}>
                  <span style={marginLabelStyle}>Bottom</span>
                  <input
                    type="number"
                    value={settings.margins.bottom}
                    onChange={(e) => updateMargin('bottom', Math.max(0, Number(e.target.value)))}
                    style={{ ...inputStyle, width: 60 }}
                    min={0}
                    step={1}
                  />
                </div>
                <div style={marginFieldStyle}>
                  <span style={marginLabelStyle}>Left</span>
                  <input
                    type="number"
                    value={settings.margins.left}
                    onChange={(e) => updateMargin('left', Math.max(0, Number(e.target.value)))}
                    style={{ ...inputStyle, width: 60 }}
                    min={0}
                    step={1}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: preview + info */}
          <div style={rightPanelStyle}>
            <div style={previewContainerStyle}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Print preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    imageRendering: 'auto',
                  }}
                />
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Generating preview...</div>
              )}
            </div>

            {/* Info */}
            <div style={infoStyle}>
              <div style={infoRowStyle}>
                <span>Paper:</span>
                <span>
                  {paperDims.width} x {paperDims.height} mm
                </span>
              </div>
              <div style={infoRowStyle}>
                <span>Output:</span>
                <span>
                  {canvasDims.trimWidth} x {canvasDims.trimHeight} px
                </span>
              </div>
              <div style={infoRowStyle}>
                <span>With bleed:</span>
                <span>
                  {canvasDims.totalWidth} x {canvasDims.totalHeight} px
                </span>
              </div>
              <div style={infoRowStyle}>
                <span>Color:</span>
                <span>{settings.colorMode.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button style={cancelButtonStyle} onClick={close}>
            Cancel
          </button>
          <button style={primaryButtonStyle} onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export Print-Ready'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Toggle Row ──

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <div
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        style={{
          width: 34,
          height: 18,
          borderRadius: 9,
          background: checked ? 'var(--accent)' : 'var(--bg-hover)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
      >
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            background: '#fff',
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            transition: 'left 0.15s',
          }}
        />
      </div>
    </label>
  )
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const modalStyle: React.CSSProperties = {
  width: 740,
  maxHeight: '90vh',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--border-subtle)',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-secondary)',
  fontSize: 16,
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
}

const leftPanelStyle: React.CSSProperties = {
  width: 300,
  borderRight: '1px solid var(--border-subtle)',
  padding: 'var(--space-3) var(--space-4)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
}

const rightPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  padding: 16,
}

const previewContainerStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-base)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  minHeight: 300,
}

const infoStyle: React.CSSProperties = {
  padding: '12px 0 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const infoRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--text-secondary)',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  padding: 'var(--space-3) var(--space-4)',
  borderTop: '1px solid var(--border-subtle)',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  paddingBottom: 'var(--space-2)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const selectStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 'var(--font-size-base)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  height: 'var(--height-input)',
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 'var(--font-size-base)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  height: 'var(--height-input)',
}

const marginsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const marginFieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const marginLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-secondary)',
  minWidth: 36,
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  fontSize: 'var(--font-size-base)',
  fontWeight: 500,
  background: 'none',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  height: 'var(--height-button)',
}

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 20px',
  fontSize: 'var(--font-size-base)',
  fontWeight: 600,
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  color: '#fff',
  cursor: 'pointer',
  height: 'var(--height-button)',
}
