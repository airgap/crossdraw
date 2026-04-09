import { v4 as uuid } from 'uuid'
import { useState } from 'react'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { FontPicker } from '@/ui/font-picker'
import { getCatalogFont } from '@/fonts/loader'
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
  ProgressiveBlurParams,
  AdjustmentLayer,
  AdjustmentParams,
  LevelsParams,
  CurvesParams,
  HueSatParams,
  ColorBalanceParams,
  Layer,
  TextLayer,
  GroupLayer,
  AutoLayoutConfig,
  GridLayoutConfig,
  GridTrack,
  SymbolInstanceLayer,
  ComponentProperty,
  NoiseFillConfig,
  WiggleStrokeConfig,
  EnvelopeConfig,
  WarpPreset,
  NoiseEffectParams,
  SharpenEffectParams,
  MotionBlurEffectParams,
  RadialBlurEffectParams,
  ColorAdjustEffectParams,
  WaveEffectParams,
  TwirlEffectParams,
  PinchEffectParams,
  SpherizeEffectParams,
  FontVariationAxis,
} from '@/types'
import { WARP_PRESETS } from '@/render/envelope-distort'
import { createDefaultExtrude3DConfig } from '@/render/extrude-3d'
import type { Extrude3DConfig, MaterialConfig, LightingConfig } from '@/render/extrude-3d'
import { createDefaultAutoLayout, createDefaultGridConfig } from '@/layout/auto-layout'
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
import { GradientEditor, createDefaultGradient } from '@/ui/gradient-editor'
import { PerspectivePanel } from '@/ui/perspective-panel'
import { applyBackgroundRemovalFilter } from '@/filters/apply-background-removal'
import type { BackgroundRemovalParams } from '@/filters/background-removal'
import { generateRectangle } from '@/tools/shapes'
import { WIDTH_PRESETS, WIDTH_PRESET_LABELS, matchWidthPreset } from '@/render/variable-stroke'
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
  'pass-through',
  'dissolve',
  'darken',
  'multiply',
  'color-burn',
  'linear-burn',
  'darker-color',
  'lighten',
  'screen',
  'color-dodge',
  'linear-dodge',
  'lighter-color',
  'overlay',
  'soft-light',
  'hard-light',
  'vivid-light',
  'linear-light',
  'pin-light',
  'hard-mix',
  'difference',
  'exclusion',
  'subtract',
  'divide',
  'hue',
  'saturation',
  'color',
  'luminosity',
]

// ── Anchor Point Grid (9-point selector) ──

const ANCHOR_POINTS: { label: string; x: number; y: number }[] = [
  { label: 'TL', x: 0, y: 0 },
  { label: 'TC', x: 0.5, y: 0 },
  { label: 'TR', x: 1, y: 0 },
  { label: 'ML', x: 0, y: 0.5 },
  { label: 'MC', x: 0.5, y: 0.5 },
  { label: 'MR', x: 1, y: 0.5 },
  { label: 'BL', x: 0, y: 1 },
  { label: 'BC', x: 0.5, y: 1 },
  { label: 'BR', x: 1, y: 1 },
]

function AnchorPointGrid({
  anchorX,
  anchorY,
  onChange,
}: {
  anchorX: number
  anchorY: number
  onChange: (ax: number, ay: number) => void
}) {
  const gridContainerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 14px)',
    gridTemplateRows: 'repeat(3, 14px)',
    gap: 2,
    marginTop: 4,
    marginBottom: 4,
  }

  const dotStyle = (isActive: boolean): React.CSSProperties => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    border: `1.5px solid ${isActive ? 'var(--accent-primary, #4a7dff)' : 'var(--border-default)'}`,
    background: isActive ? 'var(--accent-primary, #4a7dff)' : 'transparent',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s',
    boxSizing: 'border-box',
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }} title="Anchor">
        A
      </span>
      <div style={gridContainerStyle}>
        {ANCHOR_POINTS.map((pt) => {
          const isActive = Math.abs(anchorX - pt.x) < 0.01 && Math.abs(anchorY - pt.y) < 0.01
          return <div key={pt.label} style={dotStyle(isActive)} title={pt.label} onClick={() => onChange(pt.x, pt.y)} />
        })}
      </div>
    </div>
  )
}

export function PropertiesPanel() {
  const selection = useEditorStore((s) => s.selection)
  const setFill = useEditorStore((s) => s.setFill)
  const setStroke = useEditorStore((s) => s.setStroke)
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const addEffect = useEditorStore((s) => s.addEffect)
  const removeEffect = useEditorStore((s) => s.removeEffect)
  const updateEffect = useEditorStore((s) => s.updateEffect)
  const setLayerMask = useEditorStore((s) => s.setLayerMask)
  const removeLayerMask = useEditorStore((s) => s.removeLayerMask)
  const resizeArtboard = useEditorStore((s) => s.resizeArtboard)
  const setAutoLayout = useEditorStore((s) => s.setAutoLayout)
  const setLayoutSizing = useEditorStore((s) => s.setLayoutSizing)
  const runAutoLayout = useEditorStore((s) => s.runAutoLayout)

  const artboard = getActiveArtboard()
  const selectedLayer = artboard?.layers.find((l) => selection.layerIds.includes(l.id))

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

            {/* Filter layer params — show first for filter layers */}
            {selectedLayer.type === 'filter' && artboard && (
              <FilterLayerSection
                artboardId={artboard.id}
                layer={selectedLayer as import('@/types').FilterLayer}
                updateLayer={updateLayer}
              />
            )}

            {/* Adjustment layer params — show first for adjustment layers */}
            {selectedLayer.type === 'adjustment' && artboard && (
              <AdjustmentSection
                artboardId={artboard.id}
                layer={selectedLayer as AdjustmentLayer}
                updateLayer={updateLayer}
              />
            )}

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
              {/* Anchor Point Grid */}
              <AnchorPointGrid
                anchorX={selectedLayer.transform.anchorX ?? 0.5}
                anchorY={selectedLayer.transform.anchorY ?? 0.5}
                onChange={(ax, ay) => {
                  if (!artboard) return
                  updateLayer(artboard.id, selectedLayer.id, {
                    transform: { ...selectedLayer.transform, anchorX: ax, anchorY: ay },
                  })
                }}
              />
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

            {/* Auto Layout (group layers only) */}
            {selectedLayer.type === 'group' && artboard && (
              <AutoLayoutSection
                group={selectedLayer as GroupLayer}
                artboardId={artboard.id}
                setAutoLayout={setAutoLayout}
                setLayoutSizing={setLayoutSizing}
                runAutoLayout={runAutoLayout}
              />
            )}

            {/* Layout Sizing (when inside an auto-layout parent) */}
            {artboard &&
              (() => {
                const parentGroup = findParentAutoLayoutGroup(artboard.layers, selectedLayer.id)
                if (!parentGroup) return null
                return (
                  <div style={sectionStyle}>
                    <div style={labelStyle}>Layout Sizing</div>
                    <div style={rowStyle}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>H</span>
                      <select
                        style={{ ...inputStyle, width: 'auto', flex: 1 }}
                        value={selectedLayer.layoutSizing?.horizontal ?? 'fixed'}
                        onChange={(e) => {
                          const val = e.target.value as 'fixed' | 'fill' | 'hug'
                          setLayoutSizing(artboard.id, selectedLayer.id, {
                            horizontal: val,
                            vertical: selectedLayer.layoutSizing?.vertical ?? 'fixed',
                          })
                        }}
                      >
                        <option value="fixed">Fixed</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>V</span>
                      <select
                        style={{ ...inputStyle, width: 'auto', flex: 1 }}
                        value={selectedLayer.layoutSizing?.vertical ?? 'fixed'}
                        onChange={(e) => {
                          const val = e.target.value as 'fixed' | 'fill' | 'hug'
                          setLayoutSizing(artboard.id, selectedLayer.id, {
                            horizontal: selectedLayer.layoutSizing?.horizontal ?? 'fixed',
                            vertical: val,
                          })
                        }}
                      >
                        <option value="fixed">Fixed</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                    </div>
                  </div>
                )
              })()}

            {/* Text properties */}
            {selectedLayer.type === 'text' && artboard && (
              <div style={sectionStyle}>
                <div style={labelStyle}>Text</div>
                <input
                  style={{ ...inputStyle, marginBottom: 4 }}
                  value={selectedLayer.text}
                  onChange={(e) => updateLayer(artboard.id, selectedLayer.id, { text: e.target.value } as any)}
                />
                <FontPicker
                  value={selectedLayer.fontFamily}
                  weight={
                    selectedLayer.fontWeight === 'bold'
                      ? 700
                      : selectedLayer.fontWeight === 'normal'
                        ? 400
                        : Number(selectedLayer.fontWeight) || 400
                  }
                  onFamilyChange={(family) => updateLayer(artboard.id, selectedLayer.id, { fontFamily: family } as any)}
                  onWeightChange={(w) =>
                    updateLayer(artboard.id, selectedLayer.id, {
                      fontWeight: w === 400 ? 'normal' : w === 700 ? 'bold' : String(w),
                    } as any)
                  }
                />
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
                {selectedLayer.textMode === 'area' && (
                  <>
                    <div style={rowStyle}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Mode</span>
                      <span style={{ fontSize: 10, color: 'var(--text-primary)' }}>Area Text</span>
                    </div>
                    <div style={rowStyle}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>W</span>
                      <input
                        type="number"
                        min="10"
                        step="1"
                        style={smallInputStyle}
                        value={Math.round(selectedLayer.textWidth ?? 100)}
                        onChange={(e) =>
                          updateLayer(artboard.id, selectedLayer.id, { textWidth: Number(e.target.value) } as any)
                        }
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>H</span>
                      <input
                        type="number"
                        min="10"
                        step="1"
                        style={smallInputStyle}
                        value={Math.round(selectedLayer.textHeight ?? 100)}
                        onChange={(e) =>
                          updateLayer(artboard.id, selectedLayer.id, { textHeight: Number(e.target.value) } as any)
                        }
                      />
                    </div>
                    <div style={rowStyle}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Cols</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        style={{ ...smallInputStyle, width: 40 }}
                        value={selectedLayer.columns ?? 1}
                        onChange={(e) =>
                          updateLayer(artboard.id, selectedLayer.id, { columns: Number(e.target.value) } as any)
                        }
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Gap</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        style={{ ...smallInputStyle, width: 40 }}
                        value={selectedLayer.columnGap ?? 16}
                        onChange={(e) =>
                          updateLayer(artboard.id, selectedLayer.id, { columnGap: Number(e.target.value) } as any)
                        }
                      />
                    </div>
                  </>
                )}
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Dir</span>
                  {(['horizontal', 'vertical'] as const).map((o) => (
                    <button
                      key={o}
                      style={{
                        ...btnStyle,
                        fontWeight: (selectedLayer.textOrientation ?? 'horizontal') === o ? 700 : 400,
                        background: (selectedLayer.textOrientation ?? 'horizontal') === o ? 'var(--accent)' : undefined,
                        color: (selectedLayer.textOrientation ?? 'horizontal') === o ? '#fff' : undefined,
                        fontSize: 9,
                      }}
                      onClick={() => updateLayer(artboard.id, selectedLayer.id, { textOrientation: o } as any)}
                    >
                      {o === 'horizontal' ? 'H' : 'V'}
                    </button>
                  ))}
                </div>
                {selectedLayer.textMode === 'area' && (
                  <div style={rowStyle}>
                    <label
                      style={{
                        fontSize: 10,
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLayer.opticalMarginAlignment ?? false}
                        onChange={(e) =>
                          updateLayer(artboard.id, selectedLayer.id, {
                            opticalMarginAlignment: e.target.checked,
                          } as any)
                        }
                      />
                      Optical Margins
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* OpenType Features (text only) */}
            {selectedLayer.type === 'text' && artboard && (
              <OpenTypeFeaturesSection artboardId={artboard.id} layer={selectedLayer} />
            )}

            {/* Variable Font Axes (text only, variable fonts) */}
            {selectedLayer.type === 'text' && artboard && (
              <VariableAxesSection artboardId={artboard.id} layer={selectedLayer} />
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
                    value={
                      typeof selectedLayer.shapeParams.cornerRadius === 'number'
                        ? selectedLayer.shapeParams.cornerRadius
                        : (selectedLayer.shapeParams.cornerRadius?.[0] ?? 0)
                    }
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
                    value={
                      typeof selectedLayer.shapeParams.cornerRadius === 'number'
                        ? selectedLayer.shapeParams.cornerRadius
                        : (selectedLayer.shapeParams.cornerRadius?.[0] ?? 0)
                    }
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

            {/* Envelope distortion (vector only) */}
            {selectedLayer.type === 'vector' && artboard && (
              <EnvelopeSection artboardId={artboard.id} layer={selectedLayer} updateLayer={updateLayer} />
            )}

            {/* 3D Extrusion (vector only) */}
            {selectedLayer.type === 'vector' && artboard && (
              <Extrude3DSection artboardId={artboard.id} layer={selectedLayer} updateLayer={updateLayer} />
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

            {/* Background Removal (raster only) */}
            {selectedLayer.type === 'raster' && artboard && <BackgroundRemovalSection />}

            {/* Symbol instance component properties */}
            {selectedLayer.type === 'symbol-instance' && artboard && (
              <SymbolInstanceSection artboardId={artboard.id} layer={selectedLayer as SymbolInstanceLayer} />
            )}

            {/* Mask */}
            {artboard && (
              <MaskSection
                artboardId={artboard.id}
                layer={selectedLayer}
                setLayerMask={setLayerMask}
                removeLayerMask={removeLayerMask}
                updateLayer={updateLayer}
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
            <PerspectivePanel />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#666', textAlign: 'center', paddingTop: 20 }}>No artboard</div>
        )}
      </div>
    </div>
  )
}

// ─── Variable Font Axes section ───────────────────────────────

/** Human-readable names for registered + common custom axes. */
const AXIS_NAMES: Record<string, string> = {
  wght: 'Weight',
  wdth: 'Width',
  ital: 'Italic',
  slnt: 'Slant',
  opsz: 'Optical Size',
  GRAD: 'Grade',
  CASL: 'Casual',
  CRSV: 'Cursive',
  MONO: 'Mono',
  ROND: 'Roundness',
  SHRP: 'Sharpness',
  SOFT: 'Softness',
  WONK: 'Wonkiness',
  XOPQ: 'Thick Stroke',
  YOPQ: 'Thin Stroke',
  XTRA: 'Counter Width',
  YTAS: 'Ascender Height',
  YTDE: 'Descender Depth',
  YTFI: 'Figure Height',
  YTLC: 'Lowercase Height',
  YTUC: 'Uppercase Height',
  FLAR: 'Flare',
  VOLM: 'Volume',
}

function VariableAxesSection({ artboardId, layer }: { artboardId: string; layer: TextLayer }) {
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const [expanded, setExpanded] = useState(false)
  const catalogFont = getCatalogFont(layer.fontFamily)

  // All hooks must be above this line — early returns below
  const axes = catalogFont?.a?.filter(([tag]) => tag !== 'wght') ?? []
  if (axes.length === 0) return null

  const layerAxes = layer.fontVariationAxes ?? []

  function getAxisValue(tag: string, defaultVal: number): number {
    const found = layerAxes.find((a) => a.tag === tag)
    return found ? found.value : defaultVal
  }

  function setAxisValue(tag: string, name: string, min: number, max: number, defaultVal: number, value: number) {
    const clamped = Math.max(min, Math.min(max, value))
    const updated = [...layerAxes]
    const idx = updated.findIndex((a) => a.tag === tag)
    const axis: FontVariationAxis = { tag, name, min, max, default: defaultVal, value: clamped }
    if (idx >= 0) {
      updated[idx] = axis
    } else {
      updated.push(axis)
    }
    updateLayer(artboardId, layer.id, { fontVariationAxes: updated } as any)
  }

  function resetAll() {
    updateLayer(artboardId, layer.id, { fontVariationAxes: [] } as any)
  }

  const activeCount = layerAxes.filter((a) => {
    const cat = axes.find(([t]) => t === a.tag)
    return cat && a.value !== cat[3]
  }).length

  return (
    <div style={sectionStyle}>
      <div
        style={{ ...labelStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            fontSize: 8,
            display: 'inline-block',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          {'\u25B6'}
        </span>
        Variable Axes
        {activeCount > 0 && (
          <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 'auto' }}>{activeCount} set</span>
        )}
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          {axes.map(([tag, min, max, def]) => {
            const name = AXIS_NAMES[tag] ?? tag
            const value = getAxisValue(tag, def)
            const step = max - min > 10 ? 1 : 0.1
            return (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{ fontSize: 10, color: 'var(--text-secondary)', width: 55, flexShrink: 0 }}
                  title={`${tag} (${min}–${max}, default ${def})`}
                >
                  {name.length > 8 ? name.slice(0, 7) + '\u2026' : name}
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  style={{ flex: 1, height: 14, cursor: 'pointer' }}
                  onChange={(e) => setAxisValue(tag, name, min, max, def, Number(e.target.value))}
                  onDoubleClick={() => setAxisValue(tag, name, min, max, def, def)}
                  title="Double-click to reset"
                />
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={Math.round(value * 10) / 10}
                  style={{ ...smallInputStyle, width: 48 }}
                  onChange={(e) => setAxisValue(tag, name, min, max, def, Number(e.target.value))}
                />
              </div>
            )
          })}
          {activeCount > 0 && (
            <button style={{ ...btnStyle, fontSize: 9, alignSelf: 'flex-start', marginTop: 2 }} onClick={resetAll}>
              Reset All
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── OpenType Features section ────────────────────────────────

/** Common OpenType feature tags with human-readable labels. */
const OPENTYPE_FEATURES: { tag: string; label: string }[] = [
  { tag: 'liga', label: 'Standard Ligatures' },
  { tag: 'dlig', label: 'Discretionary Ligatures' },
  { tag: 'smcp', label: 'Small Caps' },
  { tag: 'c2sc', label: 'Caps to Small Caps' },
  { tag: 'onum', label: 'Oldstyle Numerals' },
  { tag: 'lnum', label: 'Lining Numerals' },
  { tag: 'tnum', label: 'Tabular Numerals' },
  { tag: 'pnum', label: 'Proportional Numerals' },
  { tag: 'frac', label: 'Fractions' },
  { tag: 'swsh', label: 'Swash' },
  { tag: 'ss01', label: 'Stylistic Set 1' },
  { tag: 'ss02', label: 'Stylistic Set 2' },
  { tag: 'ss03', label: 'Stylistic Set 3' },
  { tag: 'ss04', label: 'Stylistic Set 4' },
  { tag: 'ss05', label: 'Stylistic Set 5' },
  { tag: 'ss06', label: 'Stylistic Set 6' },
  { tag: 'ss07', label: 'Stylistic Set 7' },
  { tag: 'ss08', label: 'Stylistic Set 8' },
  { tag: 'ss09', label: 'Stylistic Set 9' },
  { tag: 'ss10', label: 'Stylistic Set 10' },
  { tag: 'ss11', label: 'Stylistic Set 11' },
  { tag: 'ss12', label: 'Stylistic Set 12' },
  { tag: 'ss13', label: 'Stylistic Set 13' },
  { tag: 'ss14', label: 'Stylistic Set 14' },
  { tag: 'ss15', label: 'Stylistic Set 15' },
  { tag: 'ss16', label: 'Stylistic Set 16' },
  { tag: 'ss17', label: 'Stylistic Set 17' },
  { tag: 'ss18', label: 'Stylistic Set 18' },
  { tag: 'ss19', label: 'Stylistic Set 19' },
  { tag: 'ss20', label: 'Stylistic Set 20' },
]

function OpenTypeFeaturesSection({ artboardId, layer }: { artboardId: string; layer: TextLayer }) {
  const [expanded, setExpanded] = useState(false)
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const features = layer.openTypeFeatures ?? {}

  // Count how many features are currently enabled
  const enabledCount = Object.values(features).filter(Boolean).length

  function toggleFeature(tag: string) {
    const current = features[tag] ?? false
    const updated = { ...features, [tag]: !current }
    // Remove entries that are false to keep the object clean
    if (!updated[tag]) delete updated[tag]
    updateLayer(artboardId, layer.id, { openTypeFeatures: updated } as any)
  }

  const toggleStyle: React.CSSProperties = {
    width: 28,
    height: 16,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.15s',
    padding: 0,
    flexShrink: 0,
  }

  const thumbStyle: React.CSSProperties = {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    transition: 'left 0.15s',
  }

  return (
    <div style={sectionStyle}>
      <div
        style={{ ...labelStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span
          style={{
            fontSize: 8,
            display: 'inline-block',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        >
          {'\u25B6'}
        </span>
        OpenType Features
        {enabledCount > 0 && (
          <span style={{ fontSize: 9, color: 'var(--accent)', marginLeft: 'auto' }}>{enabledCount} on</span>
        )}
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
          {OPENTYPE_FEATURES.map(({ tag, label }) => {
            const isOn = features[tag] ?? false
            return (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  style={{
                    ...toggleStyle,
                    background: isOn ? 'var(--accent)' : '#444',
                  }}
                  onClick={() => toggleFeature(tag)}
                  title={`${tag} - ${label}`}
                >
                  <div style={{ ...thumbStyle, left: isOn ? 14 : 2 }} />
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-primary)', flex: 1 }}>{label}</span>
                <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{tag}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Fill section ─────────────────────────────────────────────

function createDefaultNoiseFill(): NoiseFillConfig {
  return {
    noiseType: 'simplex',
    scale: 50,
    octaves: 4,
    persistence: 0.5,
    seed: Math.floor(Math.random() * 100000),
    color1: '#000000',
    color2: '#ffffff',
  }
}

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

  function switchToNoise() {
    setFill(artboardId, layer.id, {
      type: 'noise',
      noise: createDefaultNoiseFill(),
      opacity: fill?.opacity ?? 1,
    })
  }

  function updateNoise(updates: Partial<NoiseFillConfig>) {
    if (!fill || fill.type !== 'noise' || !fill.noise) return
    setFill(artboardId, layer.id, {
      ...fill,
      noise: { ...fill.noise, ...updates },
    })
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Fill</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {fill ? (
            <>
              {fill.type !== 'gradient' && (
                <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={switchToGradient}>
                  Gradient
                </button>
              )}
              {fill.type !== 'solid' && (
                <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={switchToSolid}>
                  Solid
                </button>
              )}
              {fill.type !== 'noise' && (
                <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={switchToNoise}>
                  Noise
                </button>
              )}
              <button
                style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
                onClick={() => setFill(artboardId, layer.id, null)}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      </div>
      {!fill && (
        <div style={rowStyle}>
          <div
            onClick={() => setFill(artboardId, layer.id, { type: 'solid', color: '#000000', opacity: 1 })}
            title="Add fill"
            style={{
              width: 24,
              height: 24,
              borderRadius: 3,
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
              backgroundImage:
                'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>No fill</span>
        </div>
      )}
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
      {fill && fill.type === 'noise' && fill.noise && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Type</span>
            <select
              style={{ ...inputStyle, width: 'auto', flex: 1 }}
              value={fill.noise.noiseType}
              onChange={(e) => updateNoise({ noiseType: e.target.value as NoiseFillConfig['noiseType'] })}
            >
              <option value="simplex">Simplex</option>
              <option value="perlin">Perlin</option>
              <option value="cellular">Cellular</option>
              <option value="white">White</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Scale</span>
            <input
              type="range"
              min="1"
              max="500"
              style={{ flex: 1 }}
              value={fill.noise.scale}
              onChange={(e) => updateNoise({ scale: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fill.noise.scale}</span>
          </div>
          {fill.noise.noiseType !== 'white' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Octaves</span>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  style={{ flex: 1 }}
                  value={fill.noise.octaves}
                  onChange={(e) => updateNoise({ octaves: Number(e.target.value) })}
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fill.noise.octaves}</span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Persist</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round(fill.noise.persistence * 100)}
                  onChange={(e) => updateNoise({ persistence: Number(e.target.value) / 100 })}
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {Math.round(fill.noise.persistence * 100)}%
                </span>
              </div>
            </>
          )}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Seed</span>
            <input
              type="number"
              style={{ ...smallInputStyle, flex: 1 }}
              value={fill.noise.seed}
              onChange={(e) => updateNoise({ seed: Number(e.target.value) })}
            />
            <button
              style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
              onClick={() => updateNoise({ seed: Math.floor(Math.random() * 100000) })}
            >
              Random
            </button>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Color 1</span>
            <ColorSwatch color={fill.noise.color1} opacity={1} onChange={(hex) => updateNoise({ color1: hex })} />
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              value={fill.noise.color1}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  updateNoise({ color1: e.target.value })
                }
              }}
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Color 2</span>
            <ColorSwatch color={fill.noise.color2} opacity={1} onChange={(hex) => updateNoise({ color2: hex })} />
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              value={fill.noise.color2}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  updateNoise({ color2: e.target.value })
                }
              }}
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 40 }}>Alpha</span>
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

const DASH_PRESETS: { key: string; label: string; value: number[] }[] = [
  { key: 'solid', label: 'Solid', value: [] },
  { key: 'dashed', label: 'Dashed', value: [10, 5] },
  { key: 'dotted', label: 'Dotted', value: [2, 4] },
  { key: 'dash-dot', label: 'Dash-dot', value: [10, 5, 2, 5] },
  { key: 'long-dash', label: 'Long dash', value: [20, 10] },
]

function dashPatternKey(dasharray?: number[]): string {
  if (!dasharray || dasharray.length === 0) return 'solid'
  const match = DASH_PRESETS.find(
    (p) => p.value.length === dasharray.length && p.value.every((v, i) => v === dasharray[i]),
  )
  return match ? match.key : 'solid'
}

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
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Profile</span>
            <select
              style={{ ...inputStyle, width: 'auto', flex: 1 }}
              value={matchWidthPreset(stroke.widthProfile) ?? 'none'}
              onChange={(e) => {
                const key = e.target.value
                if (key === 'none') {
                  setStroke(artboardId, layer.id, { ...stroke, widthProfile: undefined })
                } else {
                  const preset = WIDTH_PRESETS[key]
                  if (preset) {
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      widthProfile: preset.map((p) => [...p] as [number, number]),
                    })
                  }
                }
              }}
            >
              <option value="none">None</option>
              {Object.keys(WIDTH_PRESETS).map((key) => (
                <option key={key} value={key}>
                  {WIDTH_PRESET_LABELS[key] ?? key}
                </option>
              ))}
            </select>
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
          {stroke.linejoin === 'miter' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Miter</span>
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                style={smallInputStyle}
                value={stroke.miterLimit}
                onChange={(e) =>
                  setStroke(artboardId, layer.id, {
                    ...stroke,
                    miterLimit: Math.max(1, Math.min(20, Number(e.target.value))),
                  })
                }
              />
            </div>
          )}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Dash</span>
            <select
              style={{ ...inputStyle, width: 'auto', flex: 1 }}
              value={dashPatternKey(stroke.dasharray)}
              onChange={(e) => {
                const preset = DASH_PRESETS.find((p) => p.key === e.target.value)
                if (preset) {
                  setStroke(artboardId, layer.id, {
                    ...stroke,
                    dasharray: preset.value.length ? [...preset.value] : undefined,
                  })
                }
              }}
            >
              {DASH_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Alpha</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round(stroke.opacity * 100)}
              onChange={(e) => setStroke(artboardId, layer.id, { ...stroke, opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(stroke.opacity * 100)}%
            </span>
          </div>
          {/* Wiggle / hand-drawn stroke */}
          <div style={rowStyle}>
            <label
              style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <input
                type="checkbox"
                checked={stroke.wiggle?.enabled ?? false}
                onChange={(e) => {
                  const enabled = e.target.checked
                  const wiggle: WiggleStrokeConfig = stroke.wiggle
                    ? { ...stroke.wiggle, enabled }
                    : { enabled, amplitude: 4, frequency: 10, seed: 0, taperStart: 0, taperEnd: 0 }
                  setStroke(artboardId, layer.id, { ...stroke, wiggle })
                }}
              />
              Wiggle
            </label>
          </div>
          {stroke.wiggle?.enabled && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 42 }}>Amp</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  style={{ flex: 1 }}
                  value={stroke.wiggle.amplitude}
                  onChange={(e) =>
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      wiggle: { ...stroke.wiggle!, amplitude: Number(e.target.value) },
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {stroke.wiggle.amplitude}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 42 }}>Freq</span>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  style={{ flex: 1 }}
                  value={stroke.wiggle.frequency}
                  onChange={(e) =>
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      wiggle: { ...stroke.wiggle!, frequency: Number(e.target.value) },
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {stroke.wiggle.frequency}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 42 }}>Seed</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  style={smallInputStyle}
                  value={stroke.wiggle.seed}
                  onChange={(e) =>
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      wiggle: { ...stroke.wiggle!, seed: Math.max(0, Math.floor(Number(e.target.value))) },
                    })
                  }
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 42 }}>Taper S</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  style={{ flex: 1 }}
                  value={stroke.wiggle.taperStart}
                  onChange={(e) =>
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      wiggle: { ...stroke.wiggle!, taperStart: Number(e.target.value) },
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {stroke.wiggle.taperStart.toFixed(2)}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 42 }}>Taper E</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  style={{ flex: 1 }}
                  value={stroke.wiggle.taperEnd}
                  onChange={(e) =>
                    setStroke(artboardId, layer.id, {
                      ...stroke,
                      wiggle: { ...stroke.wiggle!, taperEnd: Number(e.target.value) },
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {stroke.wiggle.taperEnd.toFixed(2)}
                </span>
              </div>
            </>
          )}
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

// ─── Filter Layer section ─────────────────────────────────────

const FILTER_KIND_LABELS: Record<string, string> = {
  blur: 'Gaussian Blur',
  shadow: 'Drop Shadow',
  'inner-shadow': 'Inner Shadow',
  glow: 'Outer Glow',
  'background-blur': 'Background Blur',
  'progressive-blur': 'Progressive Blur',
  noise: 'Noise',
  sharpen: 'Sharpen',
  'motion-blur': 'Motion Blur',
  'radial-blur': 'Radial Blur',
  'color-adjust': 'Color Adjust',
  wave: 'Wave',
  twirl: 'Twirl',
  pinch: 'Pinch',
  spherize: 'Spherize',
  levels: 'Levels',
  curves: 'Curves',
  'hue-sat': 'Hue/Saturation',
  'color-balance': 'Color Balance',
}

function FilterLayerSection({
  artboardId,
  layer,
  updateLayer,
}: {
  artboardId: string
  layer: import('@/types').FilterLayer
  updateLayer: (a: string, l: string, u: Partial<Layer>) => void
}) {
  const fp = layer.filterParams
  const updateFP = (changes: Partial<import('@/types').FilterParams>) => {
    updateLayer(artboardId, layer.id, { filterParams: { ...fp, ...changes } } as Partial<Layer>)
  }

  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>{(fp.kind && FILTER_KIND_LABELS[fp.kind]) ?? fp.kind} Filter</div>

      {/* Blur */}
      {fp.kind === 'blur' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.radius ?? 4}
              onChange={(e) => updateFP({ radius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.radius ?? 4}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Quality</span>
            <select
              style={inputStyle}
              value={fp.quality ?? 'medium'}
              onChange={(e) => updateFP({ quality: e.target.value as 'low' | 'medium' | 'high' })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </>
      )}

      {/* Shadow / Drop Shadow */}
      {fp.kind === 'shadow' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>X</span>
            <input
              type="number"
              style={smallInputStyle}
              value={fp.offsetX ?? 4}
              onChange={(e) => updateFP({ offsetX: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Y</span>
            <input
              type="number"
              style={smallInputStyle}
              value={fp.offsetY ?? 4}
              onChange={(e) => updateFP({ offsetY: Number(e.target.value) })}
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Blur</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.blurRadius ?? 8}
              onChange={(e) => updateFP({ blurRadius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.blurRadius ?? 8}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Spread</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.spread ?? 0}
              onChange={(e) => updateFP({ spread: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.spread ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Color</span>
            <ColorSwatch color={fp.color ?? '#000000'} onChange={(c) => updateFP({ color: c })} />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.opacity ?? 0.5) * 100)}
              onChange={(e) => updateFP({ opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round((fp.opacity ?? 0.5) * 100)}%
            </span>
          </div>
        </>
      )}

      {/* Inner Shadow */}
      {fp.kind === 'inner-shadow' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>X</span>
            <input
              type="number"
              style={smallInputStyle}
              value={fp.offsetX ?? 2}
              onChange={(e) => updateFP({ offsetX: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Y</span>
            <input
              type="number"
              style={smallInputStyle}
              value={fp.offsetY ?? 2}
              onChange={(e) => updateFP({ offsetY: Number(e.target.value) })}
            />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Blur</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.blurRadius ?? 4}
              onChange={(e) => updateFP({ blurRadius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.blurRadius ?? 4}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Color</span>
            <ColorSwatch color={fp.color ?? '#000000'} onChange={(c) => updateFP({ color: c })} />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.opacity ?? 0.5) * 100)}
              onChange={(e) => updateFP({ opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round((fp.opacity ?? 0.5) * 100)}%
            </span>
          </div>
        </>
      )}

      {/* Outer Glow */}
      {fp.kind === 'glow' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.radius ?? 8}
              onChange={(e) => updateFP({ radius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.radius ?? 8}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Spread</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.spread ?? 0}
              onChange={(e) => updateFP({ spread: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.spread ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Color</span>
            <ColorSwatch color={fp.color ?? '#ffffff'} onChange={(c) => updateFP({ color: c })} />
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Opacity</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.opacity ?? 0.75) * 100)}
              onChange={(e) => updateFP({ opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round((fp.opacity ?? 0.75) * 100)}%
            </span>
          </div>
        </>
      )}

      {/* Background Blur */}
      {fp.kind === 'background-blur' && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
          <input
            type="range"
            min="0"
            max="50"
            style={{ flex: 1 }}
            value={fp.radius ?? 10}
            onChange={(e) => updateFP({ radius: Number(e.target.value) })}
          />
          <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.radius ?? 10}</span>
        </div>
      )}

      {/* Progressive Blur */}
      {fp.kind === 'progressive-blur' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Dir</span>
            <select
              style={inputStyle}
              value={fp.direction ?? 'linear'}
              onChange={(e) => updateFP({ direction: e.target.value as 'linear' | 'radial' })}
            >
              <option value="linear">Linear</option>
              <option value="radial">Radial</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Angle</span>
            <input
              type="range"
              min="0"
              max="360"
              style={{ flex: 1 }}
              value={fp.angle ?? 0}
              onChange={(e) => updateFP({ angle: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.angle ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Start R</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.startRadius ?? 0}
              onChange={(e) => updateFP({ startRadius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.startRadius ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>End R</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.endRadius ?? 20}
              onChange={(e) => updateFP({ endRadius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.endRadius ?? 20}</span>
          </div>
        </>
      )}

      {/* Noise */}
      {fp.kind === 'noise' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Type</span>
            <select
              style={inputStyle}
              value={fp.noiseType ?? 'gaussian'}
              onChange={(e) => updateFP({ noiseType: e.target.value as 'gaussian' | 'uniform' | 'film-grain' })}
            >
              <option value="gaussian">Gaussian</option>
              <option value="uniform">Uniform</option>
              <option value="film-grain">Film Grain</option>
            </select>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={fp.amount ?? 25}
              onChange={(e) => updateFP({ amount: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.amount ?? 25}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Mono</span>
            <input
              type="checkbox"
              checked={fp.monochrome ?? false}
              onChange={(e) => updateFP({ monochrome: e.target.checked })}
            />
          </div>
        </>
      )}

      {/* Sharpen */}
      {fp.kind === 'sharpen' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
            <input
              type="range"
              min="0"
              max="500"
              step="10"
              style={{ flex: 1 }}
              value={Math.round((fp.amount ?? 1.5) * 100)}
              onChange={(e) => updateFP({ amount: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.amount ?? 1.5).toFixed(1)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
            <input
              type="range"
              min="0"
              max="10"
              style={{ flex: 1 }}
              value={fp.radius ?? 1}
              onChange={(e) => updateFP({ radius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.radius ?? 1}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Thresh</span>
            <input
              type="range"
              min="0"
              max="255"
              style={{ flex: 1 }}
              value={fp.threshold ?? 0}
              onChange={(e) => updateFP({ threshold: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.threshold ?? 0}</span>
          </div>
        </>
      )}

      {/* Motion Blur */}
      {fp.kind === 'motion-blur' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Angle</span>
            <input
              type="range"
              min="0"
              max="360"
              style={{ flex: 1 }}
              value={fp.angle ?? 0}
              onChange={(e) => updateFP({ angle: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.angle ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Dist</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.distance ?? 10}
              onChange={(e) => updateFP({ distance: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.distance ?? 10}</span>
          </div>
        </>
      )}

      {/* Radial Blur */}
      {fp.kind === 'radial-blur' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>CX</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.centerX ?? 0.5) * 100)}
              onChange={(e) => updateFP({ centerX: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.centerX ?? 0.5).toFixed(2)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>CY</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.centerY ?? 0.5) * 100)}
              onChange={(e) => updateFP({ centerY: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.centerY ?? 0.5).toFixed(2)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
            <input
              type="range"
              min="0"
              max="50"
              style={{ flex: 1 }}
              value={fp.amount ?? 10}
              onChange={(e) => updateFP({ amount: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.amount ?? 10}</span>
          </div>
        </>
      )}

      {/* Color Adjust */}
      {fp.kind === 'color-adjust' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Type</span>
            <select
              style={inputStyle}
              value={fp.adjustType ?? 'posterize'}
              onChange={(e) => updateFP({ adjustType: e.target.value as any })}
            >
              <option value="posterize">Posterize</option>
              <option value="threshold">Threshold</option>
              <option value="invert">Invert</option>
              <option value="desaturate">Desaturate</option>
              <option value="vibrance">Vibrance</option>
              <option value="channel-mixer">Channel Mixer</option>
            </select>
          </div>
          {fp.adjustType === 'posterize' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Levels</span>
              <input
                type="range"
                min="2"
                max="32"
                style={{ flex: 1 }}
                value={fp.levels ?? 4}
                onChange={(e) => updateFP({ levels: Number(e.target.value) })}
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.levels ?? 4}</span>
            </div>
          )}
          {fp.adjustType === 'threshold' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Value</span>
              <input
                type="range"
                min="0"
                max="255"
                style={{ flex: 1 }}
                value={fp.thresholdValue ?? 128}
                onChange={(e) => updateFP({ thresholdValue: Number(e.target.value) })}
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                {fp.thresholdValue ?? 128}
              </span>
            </div>
          )}
          {fp.adjustType === 'vibrance' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
              <input
                type="range"
                min="0"
                max="100"
                style={{ flex: 1 }}
                value={fp.vibranceAmount ?? 50}
                onChange={(e) => updateFP({ vibranceAmount: Number(e.target.value) })}
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                {fp.vibranceAmount ?? 50}
              </span>
            </div>
          )}
        </>
      )}

      {/* Distort: Wave */}
      {fp.kind === 'wave' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amp X</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={fp.amplitudeX ?? 10}
              onChange={(e) => updateFP({ amplitudeX: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.amplitudeX ?? 10}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amp Y</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={fp.amplitudeY ?? 10}
              onChange={(e) => updateFP({ amplitudeY: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.amplitudeY ?? 10}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Freq X</span>
            <input
              type="range"
              min="1"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.frequencyX ?? 0.05) * 1000)}
              onChange={(e) => updateFP({ frequencyX: Number(e.target.value) / 1000 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.frequencyX ?? 0.05).toFixed(3)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Freq Y</span>
            <input
              type="range"
              min="1"
              max="100"
              style={{ flex: 1 }}
              value={Math.round((fp.frequencyY ?? 0.05) * 1000)}
              onChange={(e) => updateFP({ frequencyY: Number(e.target.value) / 1000 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.frequencyY ?? 0.05).toFixed(3)}
            </span>
          </div>
        </>
      )}

      {/* Distort: Twirl */}
      {fp.kind === 'twirl' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Angle</span>
            <input
              type="range"
              min="0"
              max="628"
              style={{ flex: 1 }}
              value={Math.round((fp.angle ?? Math.PI / 2) * 100)}
              onChange={(e) => updateFP({ angle: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.angle ?? Math.PI / 2).toFixed(2)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
            <input
              type="range"
              min="0"
              max="500"
              style={{ flex: 1 }}
              value={fp.radius ?? 0}
              onChange={(e) => updateFP({ radius: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.radius ?? 0}</span>
          </div>
        </>
      )}

      {/* Distort: Pinch */}
      {fp.kind === 'pinch' && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
          <input
            type="range"
            min="-100"
            max="100"
            style={{ flex: 1 }}
            value={Math.round((fp.amount ?? 0.5) * 100)}
            onChange={(e) => updateFP({ amount: Number(e.target.value) / 100 })}
          />
          <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
            {(fp.amount ?? 0.5).toFixed(2)}
          </span>
        </div>
      )}

      {/* Distort: Spherize */}
      {fp.kind === 'spherize' && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
          <input
            type="range"
            min="0"
            max="200"
            style={{ flex: 1 }}
            value={Math.round((fp.amount ?? 1) * 100)}
            onChange={(e) => updateFP({ amount: Number(e.target.value) / 100 })}
          />
          <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
            {(fp.amount ?? 1).toFixed(2)}
          </span>
        </div>
      )}

      {/* Adjustment: Levels */}
      {fp.kind === 'levels' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Black</span>
            <input
              type="range"
              min="0"
              max="254"
              style={{ flex: 1 }}
              value={fp.blackPoint ?? 0}
              onChange={(e) => updateFP({ blackPoint: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.blackPoint ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>White</span>
            <input
              type="range"
              min="1"
              max="255"
              style={{ flex: 1 }}
              value={fp.whitePoint ?? 255}
              onChange={(e) => updateFP({ whitePoint: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>{fp.whitePoint ?? 255}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Gamma</span>
            <input
              type="range"
              min="10"
              max="300"
              style={{ flex: 1 }}
              value={Math.round((fp.gamma ?? 1.0) * 100)}
              onChange={(e) => updateFP({ gamma: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {(fp.gamma ?? 1.0).toFixed(2)}
            </span>
          </div>
        </>
      )}

      {/* Adjustment: Curves */}
      {fp.kind === 'curves' && (
        <>
          {(
            fp.points ??
            ([
              [0, 0],
              [128, 128],
              [255, 255],
            ] as [number, number][])
          ).map(([input, output]: [number, number], i: number) => (
            <div key={i} style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>In</span>
              <input
                type="number"
                min="0"
                max="255"
                style={smallInputStyle}
                value={input}
                onChange={(e) => {
                  const pts = (
                    fp.points ??
                    ([
                      [0, 0],
                      [128, 128],
                      [255, 255],
                    ] as [number, number][])
                  ).map((p: [number, number]) => [...p] as [number, number])
                  pts[i] = [Number(e.target.value), pts[i]![1]]
                  updateFP({ points: pts })
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
                  const pts = (
                    fp.points ??
                    ([
                      [0, 0],
                      [128, 128],
                      [255, 255],
                    ] as [number, number][])
                  ).map((p: [number, number]) => [...p] as [number, number])
                  pts[i] = [pts[i]![0], Number(e.target.value)]
                  updateFP({ points: pts })
                }}
              />
            </div>
          ))}
        </>
      )}

      {/* Adjustment: Hue/Saturation */}
      {fp.kind === 'hue-sat' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Hue</span>
            <input
              type="range"
              min="-180"
              max="180"
              style={{ flex: 1 }}
              value={fp.hue ?? 0}
              onChange={(e) => updateFP({ hue: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.hue ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Sat</span>
            <input
              type="range"
              min="-100"
              max="100"
              style={{ flex: 1 }}
              value={fp.saturation ?? 0}
              onChange={(e) => updateFP({ saturation: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.saturation ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Light</span>
            <input
              type="range"
              min="-100"
              max="100"
              style={{ flex: 1 }}
              value={fp.lightness ?? 0}
              onChange={(e) => updateFP({ lightness: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.lightness ?? 0}</span>
          </div>
        </>
      )}

      {/* Adjustment: Color Balance */}
      {fp.kind === 'color-balance' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Shadows</span>
            <input
              type="range"
              min="-100"
              max="100"
              style={{ flex: 1 }}
              value={fp.shadows ?? 0}
              onChange={(e) => updateFP({ shadows: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.shadows ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Mids</span>
            <input
              type="range"
              min="-100"
              max="100"
              style={{ flex: 1 }}
              value={fp.midtones ?? 0}
              onChange={(e) => updateFP({ midtones: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.midtones ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Highs</span>
            <input
              type="range"
              min="-100"
              max="100"
              style={{ flex: 1 }}
              value={fp.highlights ?? 0}
              onChange={(e) => updateFP({ highlights: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{fp.highlights ?? 0}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Mask section ─────────────────────────────────────────────

function MaskSection({
  artboardId,
  layer,
  setLayerMask,
  removeLayerMask,
  updateLayer,
}: {
  artboardId: string
  layer: Layer
  setLayerMask: (a: string, l: string, m: Layer) => void
  removeLayerMask: (a: string, l: string) => void
  updateLayer: (a: string, l: string, u: Partial<Layer>) => void
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

  const maskType = layer.maskType ?? 'vector'

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
        <>
          <div style={{ fontSize: 10, color: '#aaa' }}>
            {maskType === 'alpha'
              ? 'Alpha (luminance) mask'
              : layer.mask!.type === 'vector'
                ? 'Vector mask'
                : 'Raster mask'}{' '}
            applied
          </div>
          <div style={{ ...rowStyle, marginTop: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30 }}>Type</span>
            {(['vector', 'alpha'] as const).map((mt) => (
              <button
                key={mt}
                style={{
                  ...btnStyle,
                  fontSize: 9,
                  fontWeight: maskType === mt ? 700 : 400,
                  background: maskType === mt ? 'var(--accent)' : undefined,
                  color: maskType === mt ? '#fff' : undefined,
                }}
                onClick={() => updateLayer(artboardId, layer.id, { maskType: mt } as any)}
              >
                {mt === 'vector' ? 'Vector' : 'Alpha'}
              </button>
            ))}
          </div>
        </>
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

const EFFECT_LABELS: Record<string, string> = {
  blur: 'Blur',
  shadow: 'Drop Shadow',
  glow: 'Outer Glow',
  'inner-shadow': 'Inner Shadow',
  'background-blur': 'BG Blur',
  'progressive-blur': 'Progressive Blur',
  noise: 'Noise',
  sharpen: 'Sharpen',
  'motion-blur': 'Motion Blur',
  'radial-blur': 'Radial Blur',
  'color-adjust': 'Color Adjust',
  wave: 'Wave',
  twirl: 'Twirl',
  pinch: 'Pinch',
  spherize: 'Spherize',
}

function effectLabel(kind: string): string {
  return EFFECT_LABELS[kind] ?? kind
}

function EffectsSection({
  artboardId,
  layer,
  addEffect,
  removeEffect,
  updateEffect,
}: {
  artboardId: string
  layer: { id: string; effects?: Effect[] }
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

  function handleAddProgressiveBlur() {
    const effect: Effect = {
      id: uuid(),
      type: 'progressive-blur',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'progressive-blur',
        direction: 'linear',
        angle: 90,
        startRadius: 0,
        endRadius: 20,
        startPosition: 0,
        endPosition: 1,
      } as ProgressiveBlurParams,
    }
    addEffect(artboardId, layer.id, effect)
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Effects</span>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddBlur}>
            +Blur
          </button>
          <button style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }} onClick={handleAddProgressiveBlur}>
            +ProgBlur
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
      {(layer.effects ?? []).map((effect) => (
        <div key={effect.id} style={{ marginTop: 4, padding: 4, background: '#222', borderRadius: 3, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#ccc' }}>
              <input
                type="checkbox"
                checked={effect.enabled}
                onChange={(e) => updateEffect(artboardId, layer.id, effect.id, { enabled: e.target.checked })}
              />
              {effectLabel(effect.params.kind)}
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
          {effect.params.kind === 'progressive-blur' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Direction</span>
                <select
                  style={{ ...inputStyle, width: 'auto', flex: 1 }}
                  value={(effect.params as ProgressiveBlurParams).direction}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: {
                        ...effect.params,
                        direction: e.target.value as 'linear' | 'radial',
                      } as ProgressiveBlurParams,
                    })
                  }
                >
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              {(effect.params as ProgressiveBlurParams).direction === 'linear' && (
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Angle</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    style={{ flex: 1 }}
                    value={(effect.params as ProgressiveBlurParams).angle}
                    onChange={(e) =>
                      updateEffect(artboardId, layer.id, effect.id, {
                        params: {
                          ...effect.params,
                          angle: Number(e.target.value),
                        } as ProgressiveBlurParams,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                    {(effect.params as ProgressiveBlurParams).angle}&deg;
                  </span>
                </div>
              )}
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Start R</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  style={{ flex: 1 }}
                  value={(effect.params as ProgressiveBlurParams).startRadius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: {
                        ...effect.params,
                        startRadius: Number(e.target.value),
                      } as ProgressiveBlurParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as ProgressiveBlurParams).startRadius}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>End R</span>
                <input
                  type="range"
                  min="0"
                  max="50"
                  style={{ flex: 1 }}
                  value={(effect.params as ProgressiveBlurParams).endRadius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: {
                        ...effect.params,
                        endRadius: Number(e.target.value),
                      } as ProgressiveBlurParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as ProgressiveBlurParams).endRadius}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Start P</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as ProgressiveBlurParams).startPosition * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: {
                        ...effect.params,
                        startPosition: Number(e.target.value) / 100,
                      } as ProgressiveBlurParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {Math.round((effect.params as ProgressiveBlurParams).startPosition * 100)}%
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>End P</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as ProgressiveBlurParams).endPosition * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: {
                        ...effect.params,
                        endPosition: Number(e.target.value) / 100,
                      } as ProgressiveBlurParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {Math.round((effect.params as ProgressiveBlurParams).endPosition * 100)}%
                </span>
              </div>
            </>
          )}
          {effect.params.kind === 'noise' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Type</span>
                <select
                  style={{ ...inputStyle, width: 'auto', flex: 1 }}
                  value={(effect.params as NoiseEffectParams).noiseType}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, noiseType: e.target.value } as NoiseEffectParams,
                    })
                  }
                >
                  <option value="gaussian">Gaussian</option>
                  <option value="uniform">Uniform</option>
                  <option value="film-grain">Film Grain</option>
                </select>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Amount</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={(effect.params as NoiseEffectParams).amount}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, amount: Number(e.target.value) } as NoiseEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as NoiseEffectParams).amount}
                </span>
              </div>
              <div style={rowStyle}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={(effect.params as NoiseEffectParams).monochrome}
                    onChange={(e) =>
                      updateEffect(artboardId, layer.id, effect.id, {
                        params: { ...effect.params, monochrome: e.target.checked } as NoiseEffectParams,
                      })
                    }
                  />
                  Mono
                </label>
              </div>
            </>
          )}
          {effect.params.kind === 'sharpen' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
                <input
                  type="range"
                  min="0"
                  max="500"
                  style={{ flex: 1 }}
                  value={(effect.params as SharpenEffectParams).amount}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, amount: Number(e.target.value) } as SharpenEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {(effect.params as SharpenEffectParams).amount}%
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Radius</span>
                <input
                  type="range"
                  min="1"
                  max="10"
                  style={{ flex: 1 }}
                  value={(effect.params as SharpenEffectParams).radius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, radius: Number(e.target.value) } as SharpenEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as SharpenEffectParams).radius}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Threshold</span>
                <input
                  type="range"
                  min="0"
                  max="255"
                  style={{ flex: 1 }}
                  value={(effect.params as SharpenEffectParams).threshold}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, threshold: Number(e.target.value) } as SharpenEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as SharpenEffectParams).threshold}
                </span>
              </div>
            </>
          )}
          {effect.params.kind === 'motion-blur' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Angle</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  style={{ flex: 1 }}
                  value={(effect.params as MotionBlurEffectParams).angle}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, angle: Number(e.target.value) } as MotionBlurEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {(effect.params as MotionBlurEffectParams).angle}&deg;
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Distance</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  style={{ flex: 1 }}
                  value={(effect.params as MotionBlurEffectParams).distance}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, distance: Number(e.target.value) } as MotionBlurEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as MotionBlurEffectParams).distance}
                </span>
              </div>
            </>
          )}
          {effect.params.kind === 'radial-blur' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  style={{ flex: 1 }}
                  value={(effect.params as RadialBlurEffectParams).amount}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, amount: Number(e.target.value) } as RadialBlurEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as RadialBlurEffectParams).amount}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>cX</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as RadialBlurEffectParams).centerX * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, centerX: Number(e.target.value) / 100 } as RadialBlurEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 20 }}>cY</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as RadialBlurEffectParams).centerY * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, centerY: Number(e.target.value) / 100 } as RadialBlurEffectParams,
                    })
                  }
                />
              </div>
            </>
          )}
          {effect.params.kind === 'color-adjust' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Type</span>
                <select
                  style={{ ...inputStyle, width: 'auto', flex: 1 }}
                  value={(effect.params as ColorAdjustEffectParams).adjustType}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, adjustType: e.target.value } as ColorAdjustEffectParams,
                    })
                  }
                >
                  <option value="posterize">Posterize</option>
                  <option value="threshold">Threshold</option>
                  <option value="invert">Invert</option>
                  <option value="desaturate">Desaturate</option>
                  <option value="vibrance">Vibrance</option>
                  <option value="channel-mixer">Channel Mixer</option>
                </select>
              </div>
              {(effect.params as ColorAdjustEffectParams).adjustType === 'posterize' && (
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Levels</span>
                  <input
                    type="range"
                    min="2"
                    max="32"
                    style={{ flex: 1 }}
                    value={(effect.params as ColorAdjustEffectParams).levels ?? 4}
                    onChange={(e) =>
                      updateEffect(artboardId, layer.id, effect.id, {
                        params: { ...effect.params, levels: Number(e.target.value) } as ColorAdjustEffectParams,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                    {(effect.params as ColorAdjustEffectParams).levels ?? 4}
                  </span>
                </div>
              )}
              {(effect.params as ColorAdjustEffectParams).adjustType === 'threshold' && (
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Value</span>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    style={{ flex: 1 }}
                    value={(effect.params as ColorAdjustEffectParams).thresholdValue ?? 128}
                    onChange={(e) =>
                      updateEffect(artboardId, layer.id, effect.id, {
                        params: { ...effect.params, thresholdValue: Number(e.target.value) } as ColorAdjustEffectParams,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                    {(effect.params as ColorAdjustEffectParams).thresholdValue ?? 128}
                  </span>
                </div>
              )}
              {(effect.params as ColorAdjustEffectParams).adjustType === 'vibrance' && (
                <div style={rowStyle}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    style={{ flex: 1 }}
                    value={(effect.params as ColorAdjustEffectParams).vibranceAmount ?? 50}
                    onChange={(e) =>
                      updateEffect(artboardId, layer.id, effect.id, {
                        params: { ...effect.params, vibranceAmount: Number(e.target.value) } as ColorAdjustEffectParams,
                      })
                    }
                  />
                  <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                    {(effect.params as ColorAdjustEffectParams).vibranceAmount ?? 50}
                  </span>
                </div>
              )}
            </>
          )}
          {effect.params.kind === 'wave' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Amp X</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={(effect.params as WaveEffectParams).amplitudeX}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, amplitudeX: Number(e.target.value) } as WaveEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as WaveEffectParams).amplitudeX}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Amp Y</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  style={{ flex: 1 }}
                  value={(effect.params as WaveEffectParams).amplitudeY}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, amplitudeY: Number(e.target.value) } as WaveEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 24, textAlign: 'right' }}>
                  {(effect.params as WaveEffectParams).amplitudeY}
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Freq X</span>
                <input
                  type="range"
                  min="1"
                  max="50"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as WaveEffectParams).frequencyX * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, frequencyX: Number(e.target.value) / 100 } as WaveEffectParams,
                    })
                  }
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Freq Y</span>
                <input
                  type="range"
                  min="1"
                  max="50"
                  style={{ flex: 1 }}
                  value={Math.round((effect.params as WaveEffectParams).frequencyY * 100)}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, frequencyY: Number(e.target.value) / 100 } as WaveEffectParams,
                    })
                  }
                />
              </div>
            </>
          )}
          {effect.params.kind === 'twirl' && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Angle</span>
                <input
                  type="range"
                  min="-720"
                  max="720"
                  style={{ flex: 1 }}
                  value={(effect.params as TwirlEffectParams).angle}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, angle: Number(e.target.value) } as TwirlEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {(effect.params as TwirlEffectParams).angle}&deg;
                </span>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 36 }}>Radius</span>
                <input
                  type="range"
                  min="10"
                  max="500"
                  style={{ flex: 1 }}
                  value={(effect.params as TwirlEffectParams).radius}
                  onChange={(e) =>
                    updateEffect(artboardId, layer.id, effect.id, {
                      params: { ...effect.params, radius: Number(e.target.value) } as TwirlEffectParams,
                    })
                  }
                />
                <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                  {(effect.params as TwirlEffectParams).radius}
                </span>
              </div>
            </>
          )}
          {effect.params.kind === 'pinch' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
              <input
                type="range"
                min="-100"
                max="100"
                style={{ flex: 1 }}
                value={Math.round((effect.params as PinchEffectParams).amount * 100)}
                onChange={(e) =>
                  updateEffect(artboardId, layer.id, effect.id, {
                    params: { ...effect.params, amount: Number(e.target.value) / 100 } as PinchEffectParams,
                  })
                }
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                {Math.round((effect.params as PinchEffectParams).amount * 100)}%
              </span>
            </div>
          )}
          {effect.params.kind === 'spherize' && (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 48 }}>Amount</span>
              <input
                type="range"
                min="-100"
                max="100"
                style={{ flex: 1 }}
                value={Math.round((effect.params as SpherizeEffectParams).amount * 100)}
                onChange={(e) =>
                  updateEffect(artboardId, layer.id, effect.id, {
                    params: { ...effect.params, amount: Number(e.target.value) / 100 } as SpherizeEffectParams,
                  })
                }
              />
              <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
                {Math.round((effect.params as SpherizeEffectParams).amount * 100)}%
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Symbol Instance Section ─────────────────────────────────

function SymbolInstanceSection({ artboardId, layer }: { artboardId: string; layer: SymbolInstanceLayer }) {
  const symbols = useEditorStore((s) => s.document.symbols ?? [])
  const setInstanceProperty = useEditorStore((s) => s.setInstanceProperty)
  const setInstanceVariant = useEditorStore((s) => s.setInstanceVariant)

  const symbolDef = symbols.find((s) => s.id === layer.symbolId)
  if (!symbolDef) {
    return (
      <div style={sectionStyle}>
        <div style={labelStyle}>Symbol Instance</div>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Symbol not found (ID: {layer.symbolId.slice(0, 8)}...)
        </div>
      </div>
    )
  }

  const props = symbolDef.componentProperties ?? []
  const variants = symbolDef.variants ?? []

  function getEffectiveValue(prop: ComponentProperty): string | boolean {
    // Instance override takes priority
    if (layer.propertyValues && prop.id in layer.propertyValues) {
      return layer.propertyValues[prop.id]!
    }
    // Then variant defaults
    if (layer.activeVariant && variants.length > 0) {
      const variant = variants.find((v) => v.name === layer.activeVariant)
      if (variant && prop.id in variant.propertyValues) {
        return variant.propertyValues[prop.id]!
      }
    }
    return prop.defaultValue
  }

  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>Symbol: {symbolDef.name}</div>
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6 }}>
        {Math.round(symbolDef.width)} x {Math.round(symbolDef.height)} &middot; {symbolDef.layers.length} layer
        {symbolDef.layers.length !== 1 ? 's' : ''}
      </div>

      {/* Variant switcher */}
      {variants.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>Variant</div>
          <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <button
              onClick={() => setInstanceVariant(artboardId, layer.id, '')}
              style={{
                padding: '3px 8px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: !layer.activeVariant ? 'var(--accent)' : 'var(--bg-elevated)',
                color: !layer.activeVariant ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              Default
            </button>
            {variants.map((v) => (
              <button
                key={v.id}
                onClick={() => setInstanceVariant(artboardId, layer.id, v.name)}
                style={{
                  padding: '3px 8px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: layer.activeVariant === v.name ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: layer.activeVariant === v.name ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Component properties */}
      {props.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
            Properties
          </div>
          {props.map((prop) => {
            const value = getEffectiveValue(prop)
            return (
              <div key={prop.id} style={rowStyle}>
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-secondary)',
                    width: 70,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                  title={prop.name}
                >
                  {prop.name}
                </span>

                {prop.type === 'boolean' && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={value === true || value === 'true'}
                      onChange={(e) => setInstanceProperty(artboardId, layer.id, prop.id, e.target.checked)}
                    />
                    {value === true || value === 'true' ? 'On' : 'Off'}
                  </label>
                )}

                {prop.type === 'text' && (
                  <input
                    type="text"
                    style={{ ...inputStyle, flex: 1 }}
                    value={String(value)}
                    onChange={(e) => setInstanceProperty(artboardId, layer.id, prop.id, e.target.value)}
                  />
                )}

                {prop.type === 'enum' && (
                  <select
                    style={{ ...inputStyle, flex: 1 }}
                    value={String(value)}
                    onChange={(e) => setInstanceProperty(artboardId, layer.id, prop.id, e.target.value)}
                  >
                    {(prop.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {prop.type === 'instance-swap' && (
                  <select
                    style={{ ...inputStyle, flex: 1 }}
                    value={String(value)}
                    onChange={(e) => setInstanceProperty(artboardId, layer.id, prop.id, e.target.value)}
                  >
                    <option value="">None</option>
                    {symbols.map((sym) => (
                      <option key={sym.id} value={sym.id}>
                        {sym.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Show message when no properties or variants */}
      {props.length === 0 && variants.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          No component properties or variants defined. Edit the symbol in the Symbols panel to add them.
        </div>
      )}
    </div>
  )
}

// ─── Auto Layout helpers ──────────────────────────────────────

function findParentAutoLayoutGroup(layers: Layer[], layerId: string): GroupLayer | null {
  for (const layer of layers) {
    if (layer.type === 'group') {
      if (layer.children.some((c) => c.id === layerId) && layer.autoLayout) {
        return layer as GroupLayer
      }
      const found = findParentAutoLayoutGroup(layer.children, layerId)
      if (found) return found
    }
  }
  return null
}

const toggleBtnStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '2px 6px',
  fontSize: 10,
  minWidth: 28,
  textAlign: 'center',
}

const activeBtnStyle: React.CSSProperties = {
  ...toggleBtnStyle,
  background: 'var(--accent-primary, #4a7dff)',
  color: '#fff',
  borderColor: 'var(--accent-primary, #4a7dff)',
}

function AutoLayoutSection({
  group,
  artboardId,
  setAutoLayout,
  setLayoutSizing,
}: {
  group: GroupLayer
  artboardId: string
  setAutoLayout: (aid: string, lid: string, cfg: AutoLayoutConfig | null) => void
  setLayoutSizing: (
    aid: string,
    lid: string,
    s: { horizontal: 'fixed' | 'fill' | 'hug'; vertical: 'fixed' | 'fill' | 'hug' } | undefined,
  ) => void
  runAutoLayout: (aid: string, gid: string) => void
}) {
  const config = group.autoLayout
  const isEnabled = !!config
  const [linkedPadding, setLinkedPadding] = useState(true)
  const updateLayer = useEditorStore((s) => s.updateLayer)

  const isGrid = config?.layoutMode === 'grid'
  const gridConfig = config?.gridConfig

  function updateConfig(partial: Partial<AutoLayoutConfig>) {
    if (!config) return
    setAutoLayout(artboardId, group.id, { ...config, ...partial })
  }

  function updateGridConfig(partial: Partial<GridLayoutConfig>) {
    if (!config || !gridConfig) return
    setAutoLayout(artboardId, group.id, { ...config, gridConfig: { ...gridConfig, ...partial } })
  }

  function updateTrack(axis: 'columns' | 'rows', index: number, partial: Partial<GridTrack>) {
    if (!gridConfig) return
    const tracks = [...gridConfig[axis]]
    tracks[index] = { ...tracks[index]!, ...partial }
    updateGridConfig({ [axis]: tracks })
  }

  function addTrack(axis: 'columns' | 'rows') {
    if (!gridConfig) return
    updateGridConfig({ [axis]: [...gridConfig[axis], { size: 1, unit: 'fr' as const }] })
  }

  function removeTrack(axis: 'columns' | 'rows', index: number) {
    if (!gridConfig) return
    const tracks = gridConfig[axis].filter((_, i) => i !== index)
    if (tracks.length === 0) return // don't allow removing all tracks
    updateGridConfig({ [axis]: tracks })
  }

  function handlePaddingChange(key: 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft', value: number) {
    if (!config) return
    if (linkedPadding) {
      setAutoLayout(artboardId, group.id, {
        ...config,
        paddingTop: value,
        paddingRight: value,
        paddingBottom: value,
        paddingLeft: value,
      })
    } else {
      updateConfig({ [key]: value })
    }
  }

  return (
    <div style={sectionStyle}>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Auto Layout</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setAutoLayout(artboardId, group.id, e.target.checked ? createDefaultAutoLayout() : null)}
          />
          <span style={{ fontSize: 10, fontWeight: 'normal', textTransform: 'none', color: 'var(--text-secondary)' }}>
            {isEnabled ? 'On' : 'Off'}
          </span>
        </label>
      </div>
      {config && (
        <>
          {/* Layout Mode Toggle: Flex / Grid */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Mode</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                style={!isGrid ? activeBtnStyle : toggleBtnStyle}
                onClick={() => updateConfig({ layoutMode: 'flex' })}
                title="Flex layout"
              >
                Flex
              </button>
              <button
                style={isGrid ? activeBtnStyle : toggleBtnStyle}
                onClick={() =>
                  updateConfig({ layoutMode: 'grid', gridConfig: gridConfig ?? createDefaultGridConfig() })
                }
                title="Grid layout"
              >
                Grid
              </button>
            </div>
          </div>

          {/* Shared: Padding */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Padding</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
              <input type="checkbox" checked={linkedPadding} onChange={(e) => setLinkedPadding(e.target.checked)} />
              <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Link</span>
            </label>
          </div>
          {linkedPadding ? (
            <div style={rowStyle}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>All</span>
              <input
                type="number"
                style={smallInputStyle}
                value={config.paddingTop}
                min={0}
                onChange={(e) => handlePaddingChange('paddingTop', Math.max(0, Number(e.target.value)))}
              />
            </div>
          ) : (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>T</span>
                <input
                  type="number"
                  style={{ ...smallInputStyle, width: 40 }}
                  value={config.paddingTop}
                  min={0}
                  onChange={(e) => handlePaddingChange('paddingTop', Math.max(0, Number(e.target.value)))}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>R</span>
                <input
                  type="number"
                  style={{ ...smallInputStyle, width: 40 }}
                  value={config.paddingRight}
                  min={0}
                  onChange={(e) => handlePaddingChange('paddingRight', Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>B</span>
                <input
                  type="number"
                  style={{ ...smallInputStyle, width: 40 }}
                  value={config.paddingBottom}
                  min={0}
                  onChange={(e) => handlePaddingChange('paddingBottom', Math.max(0, Number(e.target.value)))}
                />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 14 }}>L</span>
                <input
                  type="number"
                  style={{ ...smallInputStyle, width: 40 }}
                  value={config.paddingLeft}
                  min={0}
                  onChange={(e) => handlePaddingChange('paddingLeft', Math.max(0, Number(e.target.value)))}
                />
              </div>
            </>
          )}

          {/* ─── Flex-specific controls ─── */}
          {!isGrid && (
            <>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Direction</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    style={config.direction === 'horizontal' ? activeBtnStyle : toggleBtnStyle}
                    onClick={() => updateConfig({ direction: 'horizontal' })}
                    title="Horizontal"
                  >
                    H
                  </button>
                  <button
                    style={config.direction === 'vertical' ? activeBtnStyle : toggleBtnStyle}
                    onClick={() => updateConfig({ direction: 'vertical' })}
                    title="Vertical"
                  >
                    V
                  </button>
                </div>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Gap</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={config.gap}
                  min={0}
                  onChange={(e) => updateConfig({ gap: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Align</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['start', 'center', 'end', 'stretch'] as const).map((a) => (
                    <button
                      key={a}
                      style={config.alignItems === a ? activeBtnStyle : toggleBtnStyle}
                      onClick={() => updateConfig({ alignItems: a })}
                      title={`Align ${a}`}
                    >
                      {a[0]!.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Justify</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['start', 'center', 'end', 'space-between'] as const).map((j) => (
                    <button
                      key={j}
                      style={config.justifyContent === j ? activeBtnStyle : toggleBtnStyle}
                      onClick={() => updateConfig({ justifyContent: j })}
                      title={j}
                    >
                      {j === 'space-between' ? 'SB' : j[0]!.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Wrap</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.wrap}
                    onChange={(e) => updateConfig({ wrap: e.target.checked })}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{config.wrap ? 'On' : 'Off'}</span>
                </label>
              </div>
            </>
          )}

          {/* ─── Grid-specific controls ─── */}
          {isGrid && gridConfig && (
            <>
              {/* Columns */}
              <div style={{ marginTop: 4 }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>Columns</span>
                  <button style={{ ...btnStyle, padding: '1px 6px', fontSize: 9 }} onClick={() => addTrack('columns')}>
                    +
                  </button>
                </div>
                {gridConfig.columns.map((track, i) => (
                  <div key={`col-${i}`} style={{ display: 'flex', gap: 2, marginBottom: 2, alignItems: 'center' }}>
                    <input
                      type="number"
                      style={{ ...smallInputStyle, width: 40 }}
                      value={track.size}
                      min={0}
                      step={track.unit === 'fr' ? 1 : 10}
                      onChange={(e) => updateTrack('columns', i, { size: Math.max(0, Number(e.target.value)) })}
                    />
                    <select
                      style={{ ...inputStyle, width: 44, fontSize: 9, padding: '1px 2px' }}
                      value={track.unit}
                      onChange={(e) => updateTrack('columns', i, { unit: e.target.value as 'px' | 'fr' | 'auto' })}
                    >
                      <option value="fr">fr</option>
                      <option value="px">px</option>
                      <option value="auto">auto</option>
                    </select>
                    {gridConfig.columns.length > 1 && (
                      <button
                        style={{ ...btnStyle, padding: '1px 4px', fontSize: 9, color: 'var(--text-tertiary)' }}
                        onClick={() => removeTrack('columns', i)}
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Rows */}
              <div style={{ marginTop: 4 }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}
                >
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>Rows</span>
                  <button style={{ ...btnStyle, padding: '1px 6px', fontSize: 9 }} onClick={() => addTrack('rows')}>
                    +
                  </button>
                </div>
                {gridConfig.rows.map((track, i) => (
                  <div key={`row-${i}`} style={{ display: 'flex', gap: 2, marginBottom: 2, alignItems: 'center' }}>
                    <input
                      type="number"
                      style={{ ...smallInputStyle, width: 40 }}
                      value={track.size}
                      min={0}
                      step={track.unit === 'fr' ? 1 : 10}
                      onChange={(e) => updateTrack('rows', i, { size: Math.max(0, Number(e.target.value)) })}
                    />
                    <select
                      style={{ ...inputStyle, width: 44, fontSize: 9, padding: '1px 2px' }}
                      value={track.unit}
                      onChange={(e) => updateTrack('rows', i, { unit: e.target.value as 'px' | 'fr' | 'auto' })}
                    >
                      <option value="fr">fr</option>
                      <option value="px">px</option>
                      <option value="auto">auto</option>
                    </select>
                    {gridConfig.rows.length > 1 && (
                      <button
                        style={{ ...btnStyle, padding: '1px 4px', fontSize: 9, color: 'var(--text-tertiary)' }}
                        onClick={() => removeTrack('rows', i)}
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Column Gap / Row Gap */}
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Col Gap</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={gridConfig.columnGap}
                  min={0}
                  onChange={(e) => updateGridConfig({ columnGap: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Row Gap</span>
                <input
                  type="number"
                  style={smallInputStyle}
                  value={gridConfig.rowGap}
                  min={0}
                  onChange={(e) => updateGridConfig({ rowGap: Math.max(0, Number(e.target.value)) })}
                />
              </div>

              {/* Align Items */}
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Align</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['start', 'center', 'end', 'stretch'] as const).map((a) => (
                    <button
                      key={a}
                      style={gridConfig.alignItems === a ? activeBtnStyle : toggleBtnStyle}
                      onClick={() => updateGridConfig({ alignItems: a })}
                      title={`Align ${a}`}
                    >
                      {a[0]!.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Justify Items */}
              <div style={rowStyle}>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Justify</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['start', 'center', 'end', 'stretch'] as const).map((j) => (
                    <button
                      key={j}
                      style={gridConfig.justifyItems === j ? activeBtnStyle : toggleBtnStyle}
                      onClick={() => updateGridConfig({ justifyItems: j })}
                      title={`Justify ${j}`}
                    >
                      {j[0]!.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Child Sizing + Grid Placement */}
          {group.children.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                {isGrid ? 'Child Placement' : 'Child Sizing'}
              </div>
              {group.children
                .filter((c) => c.visible)
                .map((child) => (
                  <div
                    key={child.id}
                    style={{ marginBottom: 4, padding: '2px 4px', background: '#222', borderRadius: 3, fontSize: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: isGrid ? 2 : 0 }}>
                      <span
                        style={{
                          color: 'var(--text-secondary)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={child.name}
                      >
                        {child.name}
                      </span>
                      <select
                        style={{ ...inputStyle, width: 52, fontSize: 9, padding: '1px 2px' }}
                        value={child.layoutSizing?.horizontal ?? 'fixed'}
                        onChange={(e) => {
                          setLayoutSizing(artboardId, child.id, {
                            horizontal: e.target.value as 'fixed' | 'fill' | 'hug',
                            vertical: child.layoutSizing?.vertical ?? 'fixed',
                          })
                        }}
                        title="Horizontal sizing"
                      >
                        <option value="fixed">Fix</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                      <select
                        style={{ ...inputStyle, width: 52, fontSize: 9, padding: '1px 2px' }}
                        value={child.layoutSizing?.vertical ?? 'fixed'}
                        onChange={(e) => {
                          setLayoutSizing(artboardId, child.id, {
                            horizontal: child.layoutSizing?.horizontal ?? 'fixed',
                            vertical: e.target.value as 'fixed' | 'fill' | 'hug',
                          })
                        }}
                        title="Vertical sizing"
                      >
                        <option value="fixed">Fix</option>
                        <option value="fill">Fill</option>
                        <option value="hug">Hug</option>
                      </select>
                    </div>
                    {/* Grid placement inputs per child */}
                    {isGrid && (
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 22 }}>Col</span>
                        <input
                          type="number"
                          style={{ ...smallInputStyle, width: 32, fontSize: 9, padding: '1px 2px' }}
                          value={child.gridPlacement?.column ?? ''}
                          placeholder="-"
                          min={0}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '') {
                              updateLayer(artboardId, child.id, { gridPlacement: undefined } as Partial<Layer>)
                            } else {
                              const gp = child.gridPlacement ?? { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }
                              updateLayer(artboardId, child.id, {
                                gridPlacement: { ...gp, column: Math.max(0, Number(val)) },
                              } as Partial<Layer>)
                            }
                          }}
                          title="Grid column (0-based)"
                        />
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 22 }}>Row</span>
                        <input
                          type="number"
                          style={{ ...smallInputStyle, width: 32, fontSize: 9, padding: '1px 2px' }}
                          value={child.gridPlacement?.row ?? ''}
                          placeholder="-"
                          min={0}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '') {
                              updateLayer(artboardId, child.id, { gridPlacement: undefined } as Partial<Layer>)
                            } else {
                              const gp = child.gridPlacement ?? { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }
                              updateLayer(artboardId, child.id, {
                                gridPlacement: { ...gp, row: Math.max(0, Number(val)) },
                              } as Partial<Layer>)
                            }
                          }}
                          title="Grid row (0-based)"
                        />
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 22 }}>CSpn</span>
                        <input
                          type="number"
                          style={{ ...smallInputStyle, width: 32, fontSize: 9, padding: '1px 2px' }}
                          value={child.gridPlacement?.columnSpan ?? 1}
                          min={1}
                          onChange={(e) => {
                            const gp = child.gridPlacement ?? { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }
                            updateLayer(artboardId, child.id, {
                              gridPlacement: { ...gp, columnSpan: Math.max(1, Number(e.target.value)) },
                            } as Partial<Layer>)
                          }}
                          title="Column span"
                        />
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', width: 22 }}>RSpn</span>
                        <input
                          type="number"
                          style={{ ...smallInputStyle, width: 32, fontSize: 9, padding: '1px 2px' }}
                          value={child.gridPlacement?.rowSpan ?? 1}
                          min={1}
                          onChange={(e) => {
                            const gp = child.gridPlacement ?? { column: 0, row: 0, columnSpan: 1, rowSpan: 1 }
                            updateLayer(artboardId, child.id, {
                              gridPlacement: { ...gp, rowSpan: Math.max(1, Number(e.target.value)) },
                            } as Partial<Layer>)
                          }}
                          title="Row span"
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Envelope Distort section ──────────────────────────────────

function EnvelopeSection({
  artboardId,
  layer,
  updateLayer,
}: {
  artboardId: string
  layer: VectorLayer
  updateLayer: (a: string, l: string, u: Partial<Layer>) => void
}) {
  const envelope: EnvelopeConfig = layer.envelope ?? {
    preset: 'none',
    bend: 0,
    horizontalDistortion: 0,
    verticalDistortion: 0,
  }

  const setEnvelope = (updates: Partial<EnvelopeConfig>) => {
    updateLayer(artboardId, layer.id, {
      envelope: { ...envelope, ...updates },
    } as Partial<Layer>)
  }

  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>Envelope</div>
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Preset</span>
        <select
          style={{ ...inputStyle, flex: 1 }}
          value={envelope.preset}
          onChange={(e) => setEnvelope({ preset: e.target.value as WarpPreset })}
        >
          {WARP_PRESETS.map((p) => (
            <option key={p} value={p}>
              {p === 'none' ? 'None' : p[0]!.toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {envelope.preset !== 'none' && (
        <>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Bend</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(envelope.bend * 100)}
              onChange={(e) => setEnvelope({ bend: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(envelope.bend * 100)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>H Dist</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(envelope.horizontalDistortion * 100)}
              onChange={(e) => setEnvelope({ horizontalDistortion: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(envelope.horizontalDistortion * 100)}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>V Dist</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(envelope.verticalDistortion * 100)}
              onChange={(e) => setEnvelope({ verticalDistortion: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(envelope.verticalDistortion * 100)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── 3D Extrusion section ──────────────────────────────────────

function Extrude3DSection({
  artboardId,
  layer,
  updateLayer,
}: {
  artboardId: string
  layer: VectorLayer
  updateLayer: (a: string, l: string, u: Partial<Layer>) => void
}) {
  const [expanded, setExpanded] = useState(!!layer.extrude3d)

  const config: Extrude3DConfig = layer.extrude3d ?? createDefaultExtrude3DConfig()

  const enabled = !!layer.extrude3d

  const setConfig = (updates: Partial<Extrude3DConfig>) => {
    updateLayer(artboardId, layer.id, {
      extrude3d: { ...config, ...updates },
    } as Partial<Layer>)
  }

  const setMaterial = (updates: Partial<MaterialConfig>) => {
    setConfig({ material: { ...config.material, ...updates } })
  }

  const setLighting = (updates: Partial<LightingConfig>) => {
    setConfig({ lighting: { ...config.lighting, ...updates } })
  }

  const toggleEnabled = () => {
    if (enabled) {
      updateLayer(artboardId, layer.id, { extrude3d: undefined } as Partial<Layer>)
    } else {
      updateLayer(artboardId, layer.id, {
        extrude3d: createDefaultExtrude3DConfig(),
      } as Partial<Layer>)
      setExpanded(true)
    }
  }

  return (
    <div style={sectionStyle}>
      <div
        style={{ ...labelStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontSize: 10 }}>{expanded ? '\u25BC' : '\u25B6'}</span>
        3D Extrusion
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            e.stopPropagation()
            toggleEnabled()
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: 'auto' }}
        />
      </div>
      {expanded && enabled && (
        <>
          {/* Depth */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Depth</span>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              style={{ flex: 1 }}
              value={config.depth}
              onChange={(e) => setConfig({ depth: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.depth)}
            </span>
          </div>

          {/* Rotation X */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Rotate X</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              style={{ flex: 1 }}
              value={config.rotateX}
              onChange={(e) => setConfig({ rotateX: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.rotateX)}
            </span>
          </div>

          {/* Rotation Y */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Rotate Y</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              style={{ flex: 1 }}
              value={config.rotateY}
              onChange={(e) => setConfig({ rotateY: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.rotateY)}
            </span>
          </div>

          {/* Rotation Z */}
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Rotate Z</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              style={{ flex: 1 }}
              value={config.rotateZ}
              onChange={(e) => setConfig({ rotateZ: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.rotateZ)}
            </span>
          </div>

          {/* Material */}
          <div style={{ ...labelStyle, fontSize: 9, marginTop: 6, marginBottom: 2 }}>Material</div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Color</span>
            <input
              type="color"
              value={config.material.color}
              onChange={(e) => setMaterial({ color: e.target.value })}
              style={{ width: 28, height: 22, border: 'none', padding: 0, cursor: 'pointer' }}
            />
          </div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Shininess</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={config.material.shininess}
              onChange={(e) => setMaterial({ shininess: Number(e.target.value) })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.material.shininess)}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Roughness</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(config.material.roughness * 100)}
              onChange={(e) => setMaterial({ roughness: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {Math.round(config.material.roughness * 100)}
            </span>
          </div>

          {/* Lighting */}
          <div style={{ ...labelStyle, fontSize: 9, marginTop: 6, marginBottom: 2 }}>Lighting</div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Dir X</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(config.lighting.direction.x * 100)}
              onChange={(e) =>
                setLighting({ direction: { ...config.lighting.direction, x: Number(e.target.value) / 100 } })
              }
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {config.lighting.direction.x.toFixed(2)}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Dir Y</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(config.lighting.direction.y * 100)}
              onChange={(e) =>
                setLighting({ direction: { ...config.lighting.direction, y: Number(e.target.value) / 100 } })
              }
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {config.lighting.direction.y.toFixed(2)}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Dir Z</span>
            <input
              type="range"
              min="-100"
              max="100"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(config.lighting.direction.z * 100)}
              onChange={(e) =>
                setLighting({ direction: { ...config.lighting.direction, z: Number(e.target.value) / 100 } })
              }
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {config.lighting.direction.z.toFixed(2)}
            </span>
          </div>

          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 60 }}>Intensity</span>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              style={{ flex: 1 }}
              value={Math.round(config.lighting.intensity * 100)}
              onChange={(e) => setLighting({ intensity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 30, textAlign: 'right' }}>
              {config.lighting.intensity.toFixed(2)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Background Removal Section ───────────────────────────────

function BackgroundRemovalSection() {
  const [method, setMethod] = useState<BackgroundRemovalParams['method']>('color')
  const [tolerance, setTolerance] = useState(30)
  const [edgeStrength, setEdgeStrength] = useState(1.0)
  const [feather, setFeather] = useState(2)

  const handleApply = () => {
    applyBackgroundRemovalFilter({
      method,
      tolerance,
      edgeStrength,
      feather,
    })
  }

  return (
    <div style={sectionStyle}>
      <div style={labelStyle}>Remove Background</div>

      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Method</span>
        <select
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
          value={method}
          onChange={(e) => setMethod(e.target.value as BackgroundRemovalParams['method'])}
        >
          <option value="color">Color Match</option>
          <option value="edge">Edge Detection</option>
          <option value="threshold">Threshold</option>
        </select>
      </div>

      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Tolerance</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          style={{ flex: 1 }}
          value={tolerance}
          onChange={(e) => setTolerance(Number(e.target.value))}
        />
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{tolerance}</span>
      </div>

      {method === 'edge' && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Edge Str.</span>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            style={{ flex: 1 }}
            value={edgeStrength}
            onChange={(e) => setEdgeStrength(Number(e.target.value))}
          />
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>
            {edgeStrength.toFixed(1)}
          </span>
        </div>
      )}

      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 50 }}>Feather</span>
        <input
          type="range"
          min="0"
          max="20"
          step="1"
          style={{ flex: 1 }}
          value={feather}
          onChange={(e) => setFeather(Number(e.target.value))}
        />
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 24, textAlign: 'right' }}>{feather}px</span>
      </div>

      <button style={{ ...btnStyle, width: '100%', marginTop: 4 }} onClick={handleApply}>
        Remove Background
      </button>
    </div>
  )
}
