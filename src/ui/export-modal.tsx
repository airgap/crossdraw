import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { downloadSVG } from '@/io/svg-export'
import {
  type ExportSettings,
  type ExportFormatType,
  type ExportRegion,
  loadExportSettings,
  saveExportSettings,
  performExport,
  formatFileSize,
  estimateExportDimensions,
} from '@/ui/quick-export'
import { FocusTrap } from '@/ui/focus-trap'

const FORMAT_TABS: ExportFormatType[] = ['png', 'jpeg', 'svg', 'pdf', 'webp']
const SCALE_OPTIONS = [0.5, 1, 2, 3, 4]
const DPI_OPTIONS = [72, 150, 300]
const SVG_PRECISION_OPTIONS = [1, 2, 3, 4, 5, 6]

export function ExportModal() {
  const showExportModal = useEditorStore((s) => s.showExportModal)
  const closeExportModal = useEditorStore((s) => s.closeExportModal)
  const doc = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)

  const [settings, setSettings] = useState<ExportSettings>(() => loadExportSettings())
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState<number>(0)
  const [exporting, setExporting] = useState(false)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const artboard = getActiveArtboard()
  const artboardW = artboard?.width ?? 1920
  const artboardH = artboard?.height ?? 1080

  const dims = estimateExportDimensions(settings, artboardW, artboardH)

  // Update settings helper
  const update = useCallback(
    (partial: Partial<ExportSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial }

        // Handle linked dimensions
        if (next.linkedDimensions && partial.width && prev.width) {
          const ratio = artboardH / artboardW
          next.height = Math.round(partial.width * ratio)
        } else if (next.linkedDimensions && partial.height && prev.height) {
          const ratio = artboardW / artboardH
          next.width = Math.round(partial.height * ratio)
        }

        return next
      })
    },
    [artboardW, artboardH],
  )

  // Generate preview when settings change
  useEffect(() => {
    if (!showExportModal) return
    if (!artboard) return

    // Debounce preview generation
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }

    previewTimeoutRef.current = setTimeout(async () => {
      try {
        // Generate a small preview
        const previewScale = Math.min(1, 300 / Math.max(artboardW, artboardH))
        let previewBlob: Blob

        if (settings.format === 'svg') {
          // For SVG, render as PNG for preview
          previewBlob = await exportArtboardToBlob(doc, { format: 'png', scale: previewScale }, artboard.id)
        } else if (settings.format === 'pdf') {
          previewBlob = await exportArtboardToBlob(doc, { format: 'png', scale: previewScale }, artboard.id)
        } else {
          previewBlob = await exportArtboardToBlob(doc, { format: 'png', scale: previewScale }, artboard.id)
        }

        // Also generate actual-size blob for file size estimate
        const actualBlob = await performExport(settings, artboard.id)
        setPreviewSize(actualBlob.size)

        // Set preview URL
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        const url = URL.createObjectURL(previewBlob)
        setPreviewUrl(url)
      } catch (err) {
        console.error('Preview generation failed:', err)
      }
    }, 200)

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [
    showExportModal,
    settings.format,
    settings.scale,
    settings.quality,
    settings.transparent,
    settings.webpLossless,
    settings.pdfDPI,
  ])

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [])

  if (!showExportModal) return null

  const handleExport = async () => {
    if (!artboard) return
    setExporting(true)
    try {
      saveExportSettings(settings)
      const blob = await performExport(settings, artboard.id)
      const title = doc.metadata.title || 'Untitled'
      const scaleSuffix = settings.scale !== 1 ? `@${settings.scale}x` : ''
      const extMap: Record<ExportFormatType, string> = {
        png: 'png',
        jpeg: 'jpg',
        svg: 'svg',
        pdf: 'pdf',
        webp: 'webp',
      }
      const filename = `${title}${scaleSuffix}.${extMap[settings.format]}`

      if (settings.format === 'svg') {
        const text = await blob.text()
        downloadSVG(text, filename)
      } else {
        downloadBlob(blob, filename)
      }
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!artboard) return
    if (settings.format === 'svg' || settings.format === 'pdf') {
      console.warn('Copy to clipboard only supports raster formats')
      return
    }
    setExporting(true)
    try {
      saveExportSettings(settings)
      // Always copy as PNG for clipboard
      const blob = await exportArtboardToBlob(doc, { format: 'png', scale: settings.scale }, artboard.id)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      console.log('Copied to clipboard')
    } catch (err) {
      console.error('Copy to clipboard failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const canCopyToClipboard = settings.format !== 'svg' && settings.format !== 'pdf'

  return (
    <div style={overlayStyle} onClick={closeExportModal}>
      <FocusTrap onEscape={closeExportModal}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={headerStyle}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Export</span>
            <button style={closeButtonStyle} onClick={closeExportModal}>
              &#x2715;
            </button>
          </div>

          <div style={bodyStyle}>
            {/* Left panel: options */}
            <div style={leftPanelStyle}>
              {/* Format tabs */}
              <div style={sectionStyle}>
                <label style={labelStyle}>Format</label>
                <div style={tabRowStyle}>
                  {FORMAT_TABS.map((fmt) => (
                    <button
                      key={fmt}
                      style={{
                        ...tabButtonStyle,
                        ...(settings.format === fmt ? tabButtonActiveStyle : {}),
                      }}
                      onClick={() => update({ format: fmt })}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format-specific options */}
              {settings.format === 'png' && (
                <PNGOptions
                  settings={settings}
                  update={update}
                  dims={dims}
                  artboardW={artboardW}
                  artboardH={artboardH}
                />
              )}
              {settings.format === 'jpeg' && <JPEGOptions settings={settings} update={update} />}
              {settings.format === 'svg' && <SVGOptions settings={settings} update={update} />}
              {settings.format === 'pdf' && <PDFOptions settings={settings} update={update} />}
              {settings.format === 'webp' && <WebPOptions settings={settings} update={update} />}

              {/* Export region */}
              <div style={sectionStyle}>
                <label style={labelStyle}>Export Region</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(
                    [
                      ['artboard', 'Full Artboard'],
                      ['selection', 'Selection'],
                      ['all-artboards', 'All Artboards'],
                    ] as [ExportRegion, string][]
                  ).map(([value, label]) => (
                    <label key={value} style={radioLabelStyle}>
                      <input
                        type="radio"
                        name="export-region"
                        checked={settings.region === value}
                        onChange={() => update({ region: value })}
                        disabled={value === 'selection' && selection.layerIds.length === 0}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Right panel: preview */}
            <div style={rightPanelStyle}>
              <div style={previewContainerStyle}>
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Export preview"
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

              {/* File size estimate */}
              <div style={fileSizeStyle}>
                {previewSize > 0 && (
                  <>
                    <span>Estimated size: {formatFileSize(previewSize)}</span>
                    <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>
                      {dims.width} x {dims.height}px
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div style={footerStyle}>
            <button style={cancelButtonStyle} onClick={closeExportModal}>
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {canCopyToClipboard && (
                <button style={secondaryButtonStyle} onClick={handleCopyToClipboard} disabled={exporting}>
                  Copy to Clipboard
                </button>
              )}
              <button style={primaryButtonStyle} onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting...' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}

// ────────────────────── Format Option Sub-Components ──────────────────────

function PNGOptions({
  settings,
  update,
  dims,
}: {
  settings: ExportSettings
  update: (p: Partial<ExportSettings>) => void
  dims: { width: number; height: number }
  artboardW: number
  artboardH: number
}) {
  return (
    <>
      <div style={sectionStyle}>
        <label style={labelStyle}>Scale</label>
        <select
          value={settings.scale}
          onChange={(e) => update({ scale: Number(e.target.value), width: null, height: null })}
          style={selectStyle}
        >
          {SCALE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Dimensions</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number"
            value={settings.width ?? dims.width}
            onChange={(e) => update({ width: Number(e.target.value) || null })}
            style={{ ...inputStyle, width: 80 }}
            min={1}
          />
          <button
            style={{
              ...linkButtonStyle,
              color: settings.linkedDimensions ? 'var(--accent)' : 'var(--text-muted)',
            }}
            onClick={() => update({ linkedDimensions: !settings.linkedDimensions })}
            title={settings.linkedDimensions ? 'Linked' : 'Unlinked'}
          >
            {settings.linkedDimensions ? '\u{1F517}' : '\u2013'}
          </button>
          <input
            type="number"
            value={settings.height ?? dims.height}
            onChange={(e) => update({ height: Number(e.target.value) || null })}
            style={{ ...inputStyle, width: 80 }}
            min={1}
          />
        </div>
      </div>

      <div style={sectionStyle}>
        <ToggleRow label="Transparency" checked={settings.transparent} onChange={(v) => update({ transparent: v })} />
      </div>

      <div style={sectionStyle}>
        <ToggleRow label="Embed ICC Profile" checked={settings.embedICC} onChange={(v) => update({ embedICC: v })} />
      </div>
    </>
  )
}

function JPEGOptions({ settings, update }: { settings: ExportSettings; update: (p: Partial<ExportSettings>) => void }) {
  return (
    <>
      <div style={sectionStyle}>
        <label style={labelStyle}>Quality: {settings.quality}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.quality}
            onChange={(e) => update({ quality: Number(e.target.value) })}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>
            {settings.quality}
          </span>
        </div>
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Scale</label>
        <select value={settings.scale} onChange={(e) => update({ scale: Number(e.target.value) })} style={selectStyle}>
          {SCALE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <ToggleRow label="Progressive" checked={settings.progressive} onChange={(v) => update({ progressive: v })} />
      </div>
    </>
  )
}

function SVGOptions({ settings, update }: { settings: ExportSettings; update: (p: Partial<ExportSettings>) => void }) {
  return (
    <>
      <div style={sectionStyle}>
        <label style={labelStyle}>Decimal Precision</label>
        <select
          value={settings.svgPrecision}
          onChange={(e) => update({ svgPrecision: Number(e.target.value) })}
          style={selectStyle}
        >
          {SVG_PRECISION_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <ToggleRow label="Minify" checked={settings.svgMinify} onChange={(v) => update({ svgMinify: v })} />
      </div>

      <div style={sectionStyle}>
        <ToggleRow
          label="Embed Fonts"
          checked={settings.svgEmbedFonts}
          onChange={(v) => update({ svgEmbedFonts: v })}
        />
      </div>
    </>
  )
}

function PDFOptions({ settings, update }: { settings: ExportSettings; update: (p: Partial<ExportSettings>) => void }) {
  return (
    <div style={sectionStyle}>
      <label style={labelStyle}>DPI</label>
      <select value={settings.pdfDPI} onChange={(e) => update({ pdfDPI: Number(e.target.value) })} style={selectStyle}>
        {DPI_OPTIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  )
}

function WebPOptions({ settings, update }: { settings: ExportSettings; update: (p: Partial<ExportSettings>) => void }) {
  return (
    <>
      <div style={sectionStyle}>
        <label style={labelStyle}>Quality: {settings.quality}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.quality}
            onChange={(e) => update({ quality: Number(e.target.value) })}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
            disabled={settings.webpLossless}
          />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 28, textAlign: 'right' }}>
            {settings.webpLossless ? '--' : settings.quality}
          </span>
        </div>
      </div>

      <div style={sectionStyle}>
        <ToggleRow label="Lossless" checked={settings.webpLossless} onChange={(v) => update({ webpLossless: v })} />
      </div>

      <div style={sectionStyle}>
        <label style={labelStyle}>Scale</label>
        <select value={settings.scale} onChange={(e) => update({ scale: Number(e.target.value) })} style={selectStyle}>
          {SCALE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </div>
    </>
  )
}

// ────────────────────── Toggle Row Component ──────────────────────

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

// ────────────────────── Styles ──────────────────────

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
  width: 700,
  height: 500,
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
  width: 280,
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
  // Checkerboard pattern for transparency
  backgroundImage: `
    linear-gradient(45deg, var(--border-subtle) 25%, transparent 25%),
    linear-gradient(-45deg, var(--border-subtle) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--border-subtle) 75%),
    linear-gradient(-45deg, transparent 75%, var(--border-subtle) 75%)
  `,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
}

const fileSizeStyle: React.CSSProperties = {
  padding: '8px 0 0',
  fontSize: 12,
  color: 'var(--text-secondary)',
  textAlign: 'center',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
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

const tabRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 2,
}

const tabButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 4px',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  background: 'var(--bg-input)',
  color: 'var(--text-secondary)',
  transition: 'all 0.15s',
}

const tabButtonActiveStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
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

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
  padding: '2px 4px',
}

const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--text-primary)',
  cursor: 'pointer',
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: '7px 16px',
  fontSize: 'var(--font-size-base)',
  fontWeight: 500,
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
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
