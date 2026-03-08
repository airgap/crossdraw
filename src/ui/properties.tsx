import { v4 as uuid } from 'uuid'
import { useState } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { ColorSwatch } from '@/ui/color-picker'
import type {
  VectorLayer,
  Fill,
  Stroke,
  BlendMode,
  Effect,
  BlurParams,
  ShadowParams,
  GlowParams,
  InnerShadowParams,
  BackgroundBlurParams,
  AdjustmentLayer,
  AdjustmentParams,
  LevelsParams,
  CurvesParams,
  HueSatParams,
  ColorBalanceParams,
  Layer,
  DitheringConfig,
} from '@/types'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { downloadPDF } from '@/io/pdf-export'
import {
  alignLeft,
  alignCenterH,
  alignRight,
  alignTop,
  alignMiddleV,
  alignBottom,
  distributeH,
  distributeV,
  distributeSpacingH,
  distributeSpacingV,
} from '@/tools/align'
import { importImageFromPicker } from '@/tools/import-image'
import { GradientEditor, createDefaultGradient } from '@/ui/gradient-editor'
import { applyDithering } from '@/effects/dithering'
import { performBooleanOp, offsetPath, expandStroke, simplifyPath } from '@/tools/boolean-ops'
import type { BooleanOp } from '@/tools/boolean-ops'
import { generateRectangle } from '@/tools/shapes'
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
} from 'lucide-react'

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
  width: 52,
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

const blendModes: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'soft-light',
  'hard-light',
  'color-dodge',
  'color-burn',
  'darken',
  'lighten',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

export function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const setFill = useEditorStore((s) => s.setFill)
  const setStroke = useEditorStore((s) => s.setStroke)
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const addEffect = useEditorStore((s) => s.addEffect)
  const removeEffect = useEditorStore((s) => s.removeEffect)
  const updateEffect = useEditorStore((s) => s.updateEffect)
  const addAdjustmentLayer = useEditorStore((s) => s.addAdjustmentLayer)
  const setLayerMask = useEditorStore((s) => s.setLayerMask)
  const removeLayerMask = useEditorStore((s) => s.removeLayerMask)
  const resizeArtboard = useEditorStore((s) => s.resizeArtboard)

  const artboard = document.artboards[0]
  const selectedLayer = artboard?.layers.find((l) => selection.layerIds.includes(l.id))

  const [ditheringConfig, setDitheringConfig] = useState<DitheringConfig>({
    enabled: false,
    algorithm: 'none',
    strength: 0.5,
    seed: 0,
  })
  const [showDithering, setShowDithering] = useState(false)

  function handleExportSVG() {
    const svg = exportArtboardToSVG(document)
    downloadSVG(svg, `${document.metadata.title}.svg`)
  }

  async function handleExportPNG() {
    const blob = await exportArtboardToBlob(document, { format: 'png', scale: 2 })
    if (ditheringConfig.enabled && ditheringConfig.algorithm !== 'none') {
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      applyDithering(imageData, ditheringConfig)
      ctx.putImageData(imageData, 0, 0)
      const ditheredBlob = await canvas.convertToBlob({ type: 'image/png' })
      downloadBlob(ditheredBlob, `${document.metadata.title}.png`)
    } else {
      downloadBlob(blob, `${document.metadata.title}.png`)
    }
  }

  async function handleExportJPEG() {
    const blob = await exportArtboardToBlob(document, { format: 'jpeg', quality: 0.92, scale: 2 })
    downloadBlob(blob, `${document.metadata.title}.jpg`)
  }

  async function handleExportPDF() {
    await downloadPDF(document)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Header provided by Sidebar wrapper */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {selectedLayer ? (
          <>
            {/* Name */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Layer</div>
              <input
                style={inputStyle}
                value={selectedLayer.name}
                onChange={(e) => {
                  if (!artboard) return
                  updateLayer(artboard.id, selectedLayer.id, { name: e.target.value })
                }}
              />
            </div>

            {/* Transform */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Transform</div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>X</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round(selectedLayer.transform.x * 100) / 100}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, x: Number(e.target.value) },
                    })
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>Y</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round(selectedLayer.transform.y * 100) / 100}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, y: Number(e.target.value) },
                    })
                  }}
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>W</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round(selectedLayer.transform.scaleX * 100)}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, scaleX: Number(e.target.value) / 100 },
                    })
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>H</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round(selectedLayer.transform.scaleY * 100)}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, scaleY: Number(e.target.value) / 100 },
                    })
                  }}
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>R</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round(selectedLayer.transform.rotation * 10) / 10}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, rotation: Number(e.target.value) },
                    })
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>deg</span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }} title="Skew X">
                  sX
                </span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round((selectedLayer.transform.skewX ?? 0) * 10) / 10}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, skewX: Number(e.target.value) },
                    })
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }} title="Skew Y">
                  sY
                </span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={Math.round((selectedLayer.transform.skewY ?? 0) * 10) / 10}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      transform: { ...selectedLayer.transform, skewY: Number(e.target.value) },
                    })
                  }}
                />
              </div>
            </div>

            {/* Appearance */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Appearance</div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Opacity</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round(selectedLayer.opacity * 100)}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      opacity: Number(e.target.value) / 100,
                    })
                  }}
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {Math.round(selectedLayer.opacity * 100)}%
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Blend</span>
                <select
                  style={{ ...inputStyle, width: 'auto', flex: 1 }}
                  value={selectedLayer.blendMode}
                  onChange={(e) => {
                    if (!artboard) return
                    updateLayer(artboard.id, selectedLayer.id, {
                      blendMode: e.target.value as BlendMode,
                    })
                  }}
                >
                  {blendModes.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Align & Distribute (1+ layers with Alt, 2+ without) */}
            {selection.layerIds.length >= 1 && <AlignSection selectionCount={selection.layerIds.length} />}

            {/* Text properties */}
            {selectedLayer.type === 'text' && artboard && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Text</div>
                <input
                  style={{ ...inputStyle, marginBottom: 4 }}
                  value={selectedLayer.text}
                  onChange={(e) => updateLayer(artboard.id, selectedLayer.id, { text: e.target.value } as any)}
                />
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Font</span>
                  <select
                    style={{ ...inputStyle, width: 'auto', flex: 1 }}
                    value={selectedLayer.fontFamily}
                    onChange={(e) => updateLayer(artboard.id, selectedLayer.id, { fontFamily: e.target.value } as any)}
                  >
                    {[
                      'sans-serif',
                      'serif',
                      'monospace',
                      'Arial',
                      'Georgia',
                      'Times New Roman',
                      'Courier New',
                      'Verdana',
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Size</span>
                  <input
                    type="number"
                    min="6"
                    max="200"
                    style={smallInputStyle}
                    value={selectedLayer.fontSize}
                    onChange={(e) =>
                      updateLayer(artboard.id, selectedLayer.id, { fontSize: Number(e.target.value) } as any)
                    }
                  />
                  <button
                    style={{ ...btnStyle, fontSize: 9, fontWeight: selectedLayer.fontWeight === 'bold' ? 700 : 400 }}
                    onClick={() =>
                      updateLayer(artboard.id, selectedLayer.id, {
                        fontWeight: selectedLayer.fontWeight === 'bold' ? 'normal' : 'bold',
                      } as any)
                    }
                  >
                    B
                  </button>
                  <button
                    style={{
                      ...btnStyle,
                      fontSize: 9,
                      fontStyle: selectedLayer.fontStyle === 'italic' ? 'italic' : 'normal',
                    }}
                    onClick={() =>
                      updateLayer(artboard.id, selectedLayer.id, {
                        fontStyle: selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic',
                      } as any)
                    }
                  >
                    I
                  </button>
                </div>
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Color</span>
                  <ColorSwatch
                    color={selectedLayer.color}
                    onChange={(hex) => updateLayer(artboard.id, selectedLayer.id, { color: hex } as any)}
                  />
                </div>
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>LH</span>
                  <input
                    type="number"
                    min="0.5"
                    max="4"
                    step="0.1"
                    style={smallInputStyle}
                    value={selectedLayer.lineHeight ?? 1.4}
                    onChange={(e) =>
                      updateLayer(artboard.id, selectedLayer.id, { lineHeight: Number(e.target.value) } as any)
                    }
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>LS</span>
                  <input
                    type="number"
                    min="-5"
                    max="20"
                    step="0.5"
                    style={smallInputStyle}
                    value={selectedLayer.letterSpacing ?? 0}
                    onChange={(e) =>
                      updateLayer(artboard.id, selectedLayer.id, { letterSpacing: Number(e.target.value) } as any)
                    }
                  />
                </div>
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Align</span>
                  {(['left', 'center', 'right'] as const).map((a) => (
                    <button
                      key={a}
                      style={{
                        ...btnStyle,
                        fontWeight: (selectedLayer.textAlign ?? 'left') === a ? 700 : 400,
                        background: (selectedLayer.textAlign ?? 'left') === a ? 'var(--accent)' : undefined,
                        color: (selectedLayer.textAlign ?? 'left') === a ? '#fff' : undefined,
                      }}
                      onClick={() => updateLayer(artboard.id, selectedLayer.id, { textAlign: a } as any)}
                    >
                      {a === 'left' ? (
                        <AlignLeft size={12} />
                      ) : a === 'center' ? (
                        <AlignCenter size={12} />
                      ) : (
                        <AlignRight size={12} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Corner radius (rectangle shapes only) */}
            {selectedLayer.type === 'vector' && artboard && selectedLayer.shapeParams?.shapeType === 'rectangle' && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Corner Radius</div>
                <div style={rowStyle}>
                  <input
                    type="range"
                    min="0"
                    max={Math.floor(
                      Math.min(Math.abs(selectedLayer.shapeParams.width), Math.abs(selectedLayer.shapeParams.height)) /
                        2,
                    )}
                    style={{ flex: 1 }}
                    value={selectedLayer.shapeParams.cornerRadius ?? 0}
                    onChange={(e) => {
                      const r = Number(e.target.value)
                      const sp = selectedLayer.shapeParams!
                      const newSegments = generateRectangle(0, 0, sp.width, sp.height, r)
                      updateLayer(artboard.id, selectedLayer.id, {
                        shapeParams: { ...sp, cornerRadius: r },
                        paths: [{ id: selectedLayer.paths[0]?.id ?? uuid(), segments: newSegments, closed: true }],
                      } as any)
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    style={{ ...smallInputStyle, width: 40 }}
                    value={selectedLayer.shapeParams.cornerRadius ?? 0}
                    onChange={(e) => {
                      const r = Math.max(0, Number(e.target.value))
                      const sp = selectedLayer.shapeParams!
                      const newSegments = generateRectangle(0, 0, sp.width, sp.height, r)
                      updateLayer(artboard.id, selectedLayer.id, {
                        shapeParams: { ...sp, cornerRadius: r },
                        paths: [{ id: selectedLayer.paths[0]?.id ?? uuid(), segments: newSegments, closed: true }],
                      } as any)
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>px</span>
                </div>
              </div>
            )}

            {/* Fill & Stroke (vector only) */}
            {selectedLayer.type === 'vector' && artboard && (
              <>
                <FillSection artboardId={artboard.id} layer={selectedLayer} setFill={setFill} />
                <StrokeSection artboardId={artboard.id} layer={selectedLayer} setStroke={setStroke} />
              </>
            )}

            {/* Effects */}
            {artboard && (
              <EffectsSection
                artboardId={artboard.id}
                layer={selectedLayer}
                addEffect={addEffect}
                removeEffect={removeEffect}
                updateEffect={updateEffect}
              />
            )}

            {/* Adjustment layer params */}
            {selectedLayer.type === 'adjustment' && artboard && (
              <AdjustmentSection
                artboardId={artboard.id}
                layer={selectedLayer as AdjustmentLayer}
                updateLayer={updateLayer}
              />
            )}

            {/* Mask */}
            {artboard && (
              <MaskSection
                artboardId={artboard.id}
                layer={selectedLayer}
                setLayerMask={setLayerMask}
                removeLayerMask={removeLayerMask}
              />
            )}
          </>
        ) : artboard ? (
          <div style={sectionStyle}>
            <div style={labelStyle}>Artboard</div>
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Name</span>
              <span style={{ fontSize: 11 }}>{artboard.name}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>W</span>
              <input
                type="number"
                min="1"
                max="16384"
                style={smallInputStyle}
                value={artboard.width}
                onChange={(e) => resizeArtboard(artboard.id, Math.max(1, Number(e.target.value)), artboard.height)}
              />
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>H</span>
              <input
                type="number"
                min="1"
                max="16384"
                style={smallInputStyle}
                value={artboard.height}
                onChange={(e) => resizeArtboard(artboard.id, artboard.width, Math.max(1, Number(e.target.value)))}
              />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 20 }}>No artboard</div>
        )}

        {/* Actions */}
        <div style={{ ...sectionStyle, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
          <div style={labelStyle}>Actions</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button style={btnStyle} onClick={() => importImageFromPicker()}>
              Import Image
            </button>
            <button style={btnStyle} onClick={handleExportSVG}>
              Export SVG
            </button>
            <button style={btnStyle} onClick={handleExportPNG}>
              Export PNG
            </button>
            <button style={btnStyle} onClick={handleExportJPEG}>
              Export JPEG
            </button>
            <button style={btnStyle} onClick={handleExportPDF}>
              Export PDF
            </button>
          </div>
          <div style={{ ...labelStyle, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Export Dithering</span>
              <button
                style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
                onClick={() => setShowDithering(!showDithering)}
              >
                {showDithering ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {showDithering && <DitheringSection config={ditheringConfig} onChange={setDitheringConfig} />}
          {/* Boolean ops (need 2+ vector layers selected) */}
          {selection.layerIds.length >= 2 && (
            <>
              <div style={{ ...labelStyle, marginTop: 8 }}>Boolean</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {(['union', 'subtract', 'intersect', 'xor', 'divide'] as BooleanOp[]).map((op) => (
                  <button key={op} style={btnStyle} onClick={() => performBooleanOp(op)}>
                    {op[0]!.toUpperCase() + op.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}
          {/* Path ops (need 1 vector layer selected) */}
          {selectedLayer?.type === 'vector' && artboard && (
            <>
              <div style={{ ...labelStyle, marginTop: 8 }}>Path Ops</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={btnStyle} onClick={() => offsetPath(artboard.id, selectedLayer.id, 5)}>
                  Offset +5
                </button>
                <button style={btnStyle} onClick={() => offsetPath(artboard.id, selectedLayer.id, -5)}>
                  Offset -5
                </button>
                {selectedLayer.stroke && (
                  <button style={btnStyle} onClick={() => expandStroke(artboard.id, selectedLayer.id)}>
                    Expand Stroke
                  </button>
                )}
                <button style={btnStyle} onClick={() => simplifyPath(artboard.id, selectedLayer.id, 2)}>
                  Simplify
                </button>
              </div>
            </>
          )}
          {artboard && (
            <>
              <div style={{ ...labelStyle, marginTop: 8 }}>Adjustments</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button style={btnStyle} onClick={() => addAdjustmentLayer(artboard.id, 'levels')}>
                  +Levels
                </button>
                <button style={btnStyle} onClick={() => addAdjustmentLayer(artboard.id, 'curves')}>
                  +Curves
                </button>
                <button style={btnStyle} onClick={() => addAdjustmentLayer(artboard.id, 'hue-sat')}>
                  +Hue/Sat
                </button>
                <button style={btnStyle} onClick={() => addAdjustmentLayer(artboard.id, 'color-balance')}>
                  +Color Bal
                </button>
              </div>
            </>
          )}
          {/* Artboard management */}
          <div style={{ ...labelStyle, marginTop: 8 }}>Artboards</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              style={btnStyle}
              onClick={() => {
                const name = `Artboard ${document.artboards.length + 1}`
                useEditorStore.getState().addArtboard(name, document.metadata.width, document.metadata.height)
              }}
            >
              +New
            </button>
            {artboard && document.artboards.length > 1 && (
              <button style={btnStyle} onClick={() => useEditorStore.getState().deleteArtboard(artboard.id)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Fill section ─────────────────────────────────────────────

function FillSection({
  artboardId,
  layer,
  setFill,
}: {
  artboardId: string
  layer: VectorLayer
  setFill: (a: string, l: string, f: Fill | null) => void
}) {
  const fill = layer.fill

  function switchToGradient() {
    setFill(artboardId, layer.id, {
      type: 'gradient',
      gradient: createDefaultGradient(),
      opacity: fill?.opacity ?? 1,
    })
  }

  function switchToSolid() {
    setFill(artboardId, layer.id, {
      type: 'solid',
      color: '#000000',
      opacity: fill?.opacity ?? 1,
    })
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Fill</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {fill ? (
            <>
              {fill.type === 'solid' && (
                <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={switchToGradient}>
                  Gradient
                </button>
              )}
              {fill.type === 'gradient' && (
                <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={switchToSolid}>
                  Solid
                </button>
              )}
              <button
                style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
                onClick={() => setFill(artboardId, layer.id, null)}
              >
                Remove
              </button>
            </>
          ) : (
            <button
              style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
              onClick={() => setFill(artboardId, layer.id, { type: 'solid', color: '#000000', opacity: 1 })}
            >
              Add
            </button>
          )}
        </div>
      </div>
      {fill && fill.type === 'solid' && (
        <>
          <div style={rowStyle}>
            <ColorSwatch
              color={fill.color ?? '#000000'}
              opacity={fill.opacity}
              onChange={(hex, a) => setFill(artboardId, layer.id, { ...fill, color: hex, opacity: a })}
            />
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              value={fill.color ?? '#000000'}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  setFill(artboardId, layer.id, { ...fill, color: e.target.value })
                }
              }}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(fill.opacity * 100)}%
            </span>
          </div>
        </>
      )}
      {fill && fill.type === 'gradient' && fill.gradient && (
        <>
          <GradientEditor
            gradient={fill.gradient}
            onChange={(g) => setFill(artboardId, layer.id, { ...fill, gradient: g })}
          />
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Alpha</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round(fill.opacity * 100)}
              onChange={(e) => setFill(artboardId, layer.id, { ...fill, opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(fill.opacity * 100)}%
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Stroke section ───────────────────────────────────────────

function StrokeSection({
  artboardId,
  layer,
  setStroke,
}: {
  artboardId: string
  layer: VectorLayer
  setStroke: (a: string, l: string, s: Stroke | null) => void
}) {
  const stroke = layer.stroke

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Stroke</span>
        {stroke ? (
          <button
            style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
            onClick={() => setStroke(artboardId, layer.id, null)}
          >
            Remove
          </button>
        ) : (
          <button
            style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
            onClick={() =>
              setStroke(artboardId, layer.id, {
                color: '#000000',
                width: 2,
                opacity: 1,
                position: 'center',
                linecap: 'round',
                linejoin: 'round',
                miterLimit: 4,
              })
            }
          >
            Add
          </button>
        )}
      </div>
      {stroke && (
        <>
          <div style={rowStyle}>
            <ColorSwatch
              color={stroke.color}
              opacity={stroke.opacity}
              onChange={(hex, a) => setStroke(artboardId, layer.id, { ...stroke, color: hex, opacity: a })}
            />
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              value={stroke.color}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  setStroke(artboardId, layer.id, { ...stroke, color: e.target.value })
                }
              }}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(stroke.opacity * 100)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Width</span>
            <input
              type="number"
              min="0.5"
              max="100"
              step="0.5"
              style={smallInputStyle}
              value={stroke.width}
              onChange={(e) =>
                setStroke(artboardId, layer.id, { ...stroke, width: Math.max(0.5, Number(e.target.value)) })
              }
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>px</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Pos</span>
            <select
              style={{ ...inputStyle, width: 'auto' }}
              value={stroke.position ?? 'center'}
              onChange={(e) =>
                setStroke(artboardId, layer.id, { ...stroke, position: e.target.value as Stroke['position'] })
              }
            >
              <option value="center">Center</option>
              <option value="inside">Inside</option>
              <option value="outside">Outside</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Cap</span>
            <select
              style={{ ...inputStyle, width: 'auto' }}
              value={stroke.linecap}
              onChange={(e) =>
                setStroke(artboardId, layer.id, { ...stroke, linecap: e.target.value as Stroke['linecap'] })
              }
            >
              <option value="butt">Butt</option>
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 24 }}>Join</span>
            <select
              style={{ ...inputStyle, width: 'auto' }}
              value={stroke.linejoin}
              onChange={(e) =>
                setStroke(artboardId, layer.id, { ...stroke, linejoin: e.target.value as Stroke['linejoin'] })
              }
            >
              <option value="miter">Miter</option>
              <option value="bevel">Bevel</option>
              <option value="round">Round</option>
            </select>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Dithering section ───────────────────────────────────────

const ditheringAlgorithms: DitheringConfig['algorithm'][] = [
  'none',
  'bayer',
  'floyd-steinberg',
  'atkinson',
  'jarvis',
  'stucki',
]

function DitheringSection({ config, onChange }: { config: DitheringConfig; onChange: (c: DitheringConfig) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={rowStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) =>
              onChange({
                ...config,
                enabled: e.target.checked,
                algorithm: e.target.checked && config.algorithm === 'none' ? 'floyd-steinberg' : config.algorithm,
              })
            }
          />
          Enable
        </label>
      </div>
      {config.enabled && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Algo</span>
            <select
              style={{ ...inputStyle, width: 'auto', flex: 1 }}
              value={config.algorithm}
              onChange={(e) => onChange({ ...config, algorithm: e.target.value as DitheringConfig['algorithm'] })}
            >
              {ditheringAlgorithms.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Strength</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round(config.strength * 100)}
              onChange={(e) => onChange({ ...config, strength: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(config.strength * 100)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Seed</span>
            <input
              type="number"
              min="0"
              style={smallInputStyle}
              value={config.seed}
              onChange={(e) => onChange({ ...config, seed: Number(e.target.value) })}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Adjustment section ──────────────────────────────────────

function AdjustmentSection({
  artboardId,
  layer,
  updateLayer,
}: {
  artboardId: string
  layer: AdjustmentLayer
  updateLayer: (a: string, l: string, u: Partial<Layer>) => void
}) {
  const updateParams = (newParams: AdjustmentParams['params']) => {
    updateLayer(artboardId, layer.id, { params: newParams } as Partial<Layer>)
  }

  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>{layer.adjustmentType} Params</div>

      {layer.adjustmentType === 'levels' && (
        <LevelsControls params={layer.params as LevelsParams} onChange={updateParams} />
      )}
      {layer.adjustmentType === 'curves' && (
        <CurvesControls params={layer.params as CurvesParams} onChange={updateParams} />
      )}
      {layer.adjustmentType === 'hue-sat' && (
        <HueSatControls params={layer.params as HueSatParams} onChange={updateParams} />
      )}
      {layer.adjustmentType === 'color-balance' && (
        <ColorBalanceControls params={layer.params as ColorBalanceParams} onChange={updateParams} />
      )}
    </div>
  )
}

function LevelsControls({ params, onChange }: { params: LevelsParams; onChange: (p: LevelsParams) => void }) {
  return (
    <>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Black</span>
        <input
          type="range"
          min="0"
          max="254"
          style={{ flex: 1 }}
          value={params.blackPoint}
          onChange={(e) => onChange({ ...params, blackPoint: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{params.blackPoint}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>White</span>
        <input
          type="range"
          min="1"
          max="255"
          style={{ flex: 1 }}
          value={params.whitePoint}
          onChange={(e) => onChange({ ...params, whitePoint: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{params.whitePoint}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Gamma</span>
        <input
          type="range"
          min="10"
          max="300"
          style={{ flex: 1 }}
          value={Math.round(params.gamma * 100)}
          onChange={(e) => onChange({ ...params, gamma: Number(e.target.value) / 100 })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.gamma.toFixed(2)}</span>
      </div>
    </>
  )
}

function CurvesControls({ params, onChange }: { params: CurvesParams; onChange: (p: CurvesParams) => void }) {
  return (
    <>
      {params.points.map(([input, output], i) => (
        <div key={i} style={rowStyle}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>In</span>
          <input
            type="number"
            min="0"
            max="255"
            style={smallInputStyle}
            value={input}
            onChange={(e) => {
              const pts = params.points.map((p) => [...p] as [number, number])
              pts[i] = [Number(e.target.value), pts[i]![1]]
              onChange({ ...params, points: pts })
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>Out</span>
          <input
            type="number"
            min="0"
            max="255"
            style={smallInputStyle}
            value={output}
            onChange={(e) => {
              const pts = params.points.map((p) => [...p] as [number, number])
              pts[i] = [pts[i]![0], Number(e.target.value)]
              onChange({ ...params, points: pts })
            }}
          />
        </div>
      ))}
    </>
  )
}

function HueSatControls({ params, onChange }: { params: HueSatParams; onChange: (p: HueSatParams) => void }) {
  return (
    <>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Hue</span>
        <input
          type="range"
          min="-180"
          max="180"
          style={{ flex: 1 }}
          value={params.hue}
          onChange={(e) => onChange({ ...params, hue: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.hue}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Sat</span>
        <input
          type="range"
          min="-100"
          max="100"
          style={{ flex: 1 }}
          value={params.saturation}
          onChange={(e) => onChange({ ...params, saturation: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.saturation}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Light</span>
        <input
          type="range"
          min="-100"
          max="100"
          style={{ flex: 1 }}
          value={params.lightness}
          onChange={(e) => onChange({ ...params, lightness: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.lightness}</span>
      </div>
    </>
  )
}

function ColorBalanceControls({
  params,
  onChange,
}: {
  params: ColorBalanceParams
  onChange: (p: ColorBalanceParams) => void
}) {
  return (
    <>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Shadows</span>
        <input
          type="range"
          min="-100"
          max="100"
          style={{ flex: 1 }}
          value={params.shadows}
          onChange={(e) => onChange({ ...params, shadows: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.shadows}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Mids</span>
        <input
          type="range"
          min="-100"
          max="100"
          style={{ flex: 1 }}
          value={params.midtones}
          onChange={(e) => onChange({ ...params, midtones: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.midtones}</span>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Highs</span>
        <input
          type="range"
          min="-100"
          max="100"
          style={{ flex: 1 }}
          value={params.highlights}
          onChange={(e) => onChange({ ...params, highlights: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{params.highlights}</span>
      </div>
    </>
  )
}

// ─── Mask section ─────────────────────────────────────────────

function MaskSection({
  artboardId,
  layer,
  setLayerMask,
  removeLayerMask,
}: {
  artboardId: string
  layer: Layer
  setLayerMask: (a: string, l: string, m: Layer) => void
  removeLayerMask: (a: string, l: string) => void
}) {
  const hasMask = !!layer.mask

  function handleAddMask() {
    const mask: VectorLayer = {
      id: uuid(),
      name: 'Mask',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [
        {
          id: uuid(),
          closed: true,
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 200, y: 0 },
            { type: 'line', x: 200, y: 200 },
            { type: 'line', x: 0, y: 200 },
            { type: 'close' },
          ],
        },
      ],
      fill: { type: 'solid', color: '#ffffff', opacity: 1 },
      stroke: null,
    }
    setLayerMask(artboardId, layer.id, mask)
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Mask</span>
        {hasMask ? (
          <button
            style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
            onClick={() => removeLayerMask(artboardId, layer.id)}
          >
            Remove
          </button>
        ) : (
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddMask}>
            Add Mask
          </button>
        )}
      </div>
      {hasMask && (
        <div style={{ fontSize: 10, color: '#aaa' }}>
          {layer.mask!.type === 'vector' ? 'Vector mask' : 'Raster mask'} applied
        </div>
      )}
    </div>
  )
}

// ─── Align section ───────────────────────────────────────────

const alignBtnStyle: React.CSSProperties = {
  ...btnStyle,
  width: 28,
  height: 24,
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
}

function AlignSection({ selectionCount }: { selectionCount: number }) {
  const [altMode, setAltMode] = useState(false)

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Align</span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 9,
            color: 'var(--text-secondary)',
            fontWeight: 400,
            textTransform: 'none',
          }}
        >
          <input type="checkbox" checked={altMode} onChange={(e) => setAltMode(e.target.checked)} />
          To artboard
        </label>
      </div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
        <button style={alignBtnStyle} onClick={() => alignLeft(altMode)} title="Align Left">
          <AlignStartVertical size={14} strokeWidth={1.75} />
        </button>
        <button style={alignBtnStyle} onClick={() => alignCenterH(altMode)} title="Align Center H">
          <AlignCenterVertical size={14} strokeWidth={1.75} />
        </button>
        <button style={alignBtnStyle} onClick={() => alignRight(altMode)} title="Align Right">
          <AlignEndVertical size={14} strokeWidth={1.75} />
        </button>
        <button style={alignBtnStyle} onClick={() => alignTop(altMode)} title="Align Top">
          <AlignStartHorizontal size={14} strokeWidth={1.75} />
        </button>
        <button style={alignBtnStyle} onClick={() => alignMiddleV(altMode)} title="Align Middle V">
          <AlignCenterHorizontal size={14} strokeWidth={1.75} />
        </button>
        <button style={alignBtnStyle} onClick={() => alignBottom(altMode)} title="Align Bottom">
          <AlignEndHorizontal size={14} strokeWidth={1.75} />
        </button>
      </div>
      {selectionCount >= 3 && (
        <>
          <div style={{ ...labelStyle, marginTop: 4 }}>Distribute</div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button style={{ ...btnStyle, fontSize: 9 }} onClick={distributeH}>
              H Centers
            </button>
            <button style={{ ...btnStyle, fontSize: 9 }} onClick={distributeV}>
              V Centers
            </button>
            <button style={{ ...btnStyle, fontSize: 9 }} onClick={distributeSpacingH}>
              H Spacing
            </button>
            <button style={{ ...btnStyle, fontSize: 9 }} onClick={distributeSpacingV}>
              V Spacing
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Effects section ──────────────────────────────────────────

function EffectsSection({
  artboardId,
  layer,
  addEffect,
  removeEffect,
  updateEffect,
}: {
  artboardId: string
  layer: { id: string; effects: Effect[] }
  addEffect: (a: string, l: string, e: Effect) => void
  removeEffect: (a: string, l: string, eId: string) => void
  updateEffect: (a: string, l: string, eId: string, u: Partial<Effect>) => void
}) {
  function handleAddBlur() {
    const effect: Effect = {
      id: uuid(),
      type: 'blur',
      enabled: true,
      opacity: 1,
      params: { kind: 'blur', radius: 4, quality: 'medium' } as BlurParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  function handleAddShadow() {
    const effect: Effect = {
      id: uuid(),
      type: 'drop-shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'shadow',
        offsetX: 4,
        offsetY: 4,
        blurRadius: 8,
        spread: 0,
        color: '#00000088',
        opacity: 0.5,
      } as ShadowParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  function handleAddInnerShadow() {
    const effect: Effect = {
      id: uuid(),
      type: 'inner-shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'inner-shadow',
        offsetX: 2,
        offsetY: 2,
        blurRadius: 6,
        color: '#00000088',
        opacity: 0.5,
      } as InnerShadowParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  function handleAddBackgroundBlur() {
    const effect: Effect = {
      id: uuid(),
      type: 'background-blur',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'background-blur',
        radius: 10,
      } as BackgroundBlurParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  function handleAddGlow() {
    const effect: Effect = {
      id: uuid(),
      type: 'outer-glow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'glow',
        radius: 8,
        spread: 0,
        color: '#ffcc0088',
        opacity: 0.8,
      } as GlowParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Effects</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddBlur}>
            +Blur
          </button>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddShadow}>
            +Shadow
          </button>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddGlow}>
            +Glow
          </button>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddInnerShadow}>
            +Inner
          </button>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddBackgroundBlur}>
            +BGBlur
          </button>
        </div>
      </div>
      {layer.effects.map((effect) => (
        <div key={effect.id} style={{ marginTop: 4, padding: 4, background: '#222', borderRadius: 3, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ccc' }}>
              <input
                type="checkbox"
                checked={effect.enabled}
                onChange={(e) => updateEffect(artboardId, layer.id, effect.id, { enabled: e.target.checked })}
              />
              {effect.params.kind === 'blur'
                ? 'Blur'
                : effect.params.kind === 'glow'
                  ? 'Outer Glow'
                  : effect.params.kind === 'inner-shadow'
                    ? 'Inner Shadow'
                    : effect.params.kind === 'background-blur'
                      ? 'BG Blur'
                      : 'Drop Shadow'}
            </label>
            <button
              style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
              onClick={() => removeEffect(artboardId, layer.id, effect.id)}
            >
              ×
            </button>
          </div>
          {effect.params.kind === 'blur' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Radius</span>
              <input
                type="range"
                min="0"
                max="50"
                style={{ flex: 1 }}
                value={(effect.params as BlurParams).radius}
                onChange={(e) =>
                  updateEffect(artboardId, layer.id, effect.id, {
                    params: { ...effect.params, radius: Number(e.target.value) } as BlurParams,
                  })
                }
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                {(effect.params as BlurParams).radius}
              </span>
            </div>
          )}
          {effect.params.kind === 'shadow' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Blur</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  style={{ flex: 1 }}
                  value={(effect.params as ShadowParams).blurRadius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, blurRadius: Number(e.target.value) } as ShadowParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as ShadowParams).blurRadius}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>X</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={(effect.params as ShadowParams).offsetX}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, offsetX: Number(e.target.value) } as ShadowParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>Y</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={(effect.params as ShadowParams).offsetY}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, offsetY: Number(e.target.value) } as ShadowParams,
                    })
                  }
                />
              </div>
            </>
          )}
          {effect.params.kind === 'glow' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Radius</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  style={{ flex: 1 }}
                  value={(effect.params as GlowParams).radius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, radius: Number(e.target.value) } as GlowParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as GlowParams).radius}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Color</span>
                <input
                  type="color"
                  style={{ width: 24, height: 20, padding: 0, border: 'none' }}
                  value={(effect.params as GlowParams).color.slice(0, 7)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, color: e.target.value } as GlowParams,
                    })
                  }
                />
              </div>
            </>
          )}
          {effect.params.kind === 'inner-shadow' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Blur</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  style={{ flex: 1 }}
                  value={(effect.params as InnerShadowParams).blurRadius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, blurRadius: Number(e.target.value) } as InnerShadowParams,
                    })
                  }
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>X</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={(effect.params as InnerShadowParams).offsetX}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, offsetX: Number(e.target.value) } as InnerShadowParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>Y</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={(effect.params as InnerShadowParams).offsetY}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, offsetY: Number(e.target.value) } as InnerShadowParams,
                    })
                  }
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Color</span>
                <input
                  type="color"
                  style={{ width: 24, height: 20, padding: 0, border: 'none' }}
                  value={(effect.params as InnerShadowParams).color.slice(0, 7)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, color: e.target.value } as InnerShadowParams,
                    })
                  }
                />
              </div>
            </>
          )}
          {effect.params.kind === 'background-blur' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Radius</span>
              <input
                type="range"
                min="0"
                max="50"
                style={{ flex: 1 }}
                value={(effect.params as BackgroundBlurParams).radius}
                onChange={(e) =>
                  updateEffect(artboardId, layer.id, effect.id, {
                    params: { ...effect.params, radius: Number(e.target.value) } as BackgroundBlurParams,
                  })
                }
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                {(effect.params as BackgroundBlurParams).radius}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
