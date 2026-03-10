import { useState, useMemo } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, PNGTuberTag } from '@/types'
import { encodeDocument } from '@/io/file-format'

const PART_TAGS: (PNGTuberTag | 'none')[] = ['none', 'head', 'eyes', 'mouth', 'body', 'accessory', 'background', 'effect']
const REQUIRED_TAGS: PNGTuberTag[] = ['head', 'eyes', 'mouth', 'body']

function collectAllLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    result.push(layer)
    if (layer.type === 'group') {
      result.push(...collectAllLayers(layer.children))
    }
  }
  return result
}

interface ValidationWarning {
  type: 'missing-tag' | 'no-unique-layers'
  message: string
}

function computeValidation(
  allLayers: Layer[],
  expressions: string[],
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  // Check for required tags
  for (const tag of REQUIRED_TAGS) {
    const hasTag = allLayers.some((l) => l.pngtuberTag === tag)
    if (!hasTag) {
      warnings.push({
        type: 'missing-tag',
        message: `No ${tag} layer tagged`,
      })
    }
  }

  // Check each expression has at least one unique layer
  for (const expr of expressions) {
    const hasUniqueLayers = allLayers.some(
      (l) => l.pngtuberTag && l.pngtuberExpression === expr,
    )
    if (!hasUniqueLayers) {
      warnings.push({
        type: 'no-unique-layers',
        message: `Expression '${expr}' has no unique layers`,
      })
    }
  }

  return warnings
}

export function PNGTuberPanel() {
  const document = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)
  const setPNGTuberEnabled = useEditorStore((s) => s.setPNGTuberEnabled)
  const addExpression = useEditorStore((s) => s.addExpression)
  const removeExpression = useEditorStore((s) => s.removeExpression)
  const setDefaultExpression = useEditorStore((s) => s.setDefaultExpression)
  const setLayerPNGTuberTag = useEditorStore((s) => s.setLayerPNGTuberTag)
  const setLayerExpression = useEditorStore((s) => s.setLayerExpression)
  const setLayerParallaxDepth = useEditorStore((s) => s.setLayerParallaxDepth)

  const [newExpressionName, setNewExpressionName] = useState('')
  const [renamingExpr, setRenamingExpr] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const config = document.pngtuber
  const enabled = config?.enabled ?? false
  const expressions = config?.expressions ?? ['idle', 'talking', 'happy', 'sad', 'surprised']
  const defaultExpression = config?.defaultExpression ?? 'idle'

  // Collect all layers from all artboards for validation
  const allLayers = useMemo(() => {
    const layers: Layer[] = []
    for (const ab of document.artboards) {
      layers.push(...collectAllLayers(ab.layers))
    }
    return layers
  }, [document.artboards])

  // Find selected layer
  const selectedLayerId = selection.layerIds[0]
  const selectedLayer = useMemo(() => {
    if (!selectedLayerId) return undefined
    for (const ab of document.artboards) {
      const found = findLayerDeep(ab.layers, selectedLayerId)
      if (found) return found
    }
    return undefined
  }, [selectedLayerId, document.artboards])

  // Find which artboard the selected layer belongs to
  const selectedArtboardId = useMemo(() => {
    if (!selectedLayerId) return undefined
    for (const ab of document.artboards) {
      if (findLayerDeep(ab.layers, selectedLayerId)) return ab.id
    }
    return undefined
  }, [selectedLayerId, document.artboards])

  // Compute file size estimate
  const fileSizeBytes = useMemo(() => {
    try {
      const encoded = encodeDocument(document)
      return encoded.byteLength
    } catch {
      return 0
    }
  }, [document])

  const maxFileSize = config?.maxFileSize ?? 2 * 1024 * 1024
  const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2)
  const maxFileSizeMB = (maxFileSize / (1024 * 1024)).toFixed(1)
  const fileSizeOverLimit = fileSizeBytes > maxFileSize

  // Validation
  const warnings = useMemo(
    () => (enabled ? computeValidation(allLayers, expressions) : []),
    [enabled, allLayers, expressions],
  )

  const sectionStyle: React.CSSProperties = {
    padding: '8px',
    borderBottom: '1px solid var(--border-color, #333)',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--font-size-sm, 12px)',
    color: 'var(--text-secondary, #aaa)',
    marginBottom: '4px',
    display: 'block',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    fontSize: 'var(--font-size-sm, 12px)',
    background: 'var(--input-bg, #2a2a2a)',
    color: 'var(--text-primary, #eee)',
    border: '1px solid var(--border-color, #444)',
    borderRadius: '3px',
    boxSizing: 'border-box',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 'var(--font-size-sm, 12px)',
    background: 'var(--button-bg, #3a3a3a)',
    color: 'var(--text-primary, #eee)',
    border: '1px solid var(--border-color, #444)',
    borderRadius: '3px',
    cursor: 'pointer',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
  }

  return (
    <div style={{ fontSize: 'var(--font-size-sm, 12px)', color: 'var(--text-primary, #eee)' }}>
      {/* Enable/Disable Toggle */}
      <div style={sectionStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setPNGTuberEnabled(e.target.checked)}
          />
          <span style={{ fontWeight: 'bold' }}>PNGtuber Mode</span>
        </label>
      </div>

      {enabled && (
        <>
          {/* Expression List Manager */}
          <div style={sectionStyle}>
            <span style={{ ...labelStyle, fontWeight: 'bold' }}>Expressions</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {expressions.map((expr) => (
                <div key={expr} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {renamingExpr === expr ? (
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => setRenamingExpr(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const trimmed = renameValue.trim().toLowerCase()
                          if (trimmed && trimmed !== expr && !expressions.includes(trimmed)) {
                            // Remove old, add new, update layers referencing it
                            removeExpression(expr)
                            addExpression(trimmed)
                            if (defaultExpression === expr) {
                              setDefaultExpression(trimmed)
                            }
                          }
                          setRenamingExpr(null)
                        } else if (e.key === 'Escape') {
                          setRenamingExpr(null)
                        }
                      }}
                      autoFocus
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        borderRadius: '2px',
                        background: defaultExpression === expr ? 'var(--accent-bg, #3366cc)' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onDoubleClick={() => {
                        setRenamingExpr(expr)
                        setRenameValue(expr)
                      }}
                      onClick={() => setDefaultExpression(expr)}
                      title={
                        defaultExpression === expr
                          ? 'Default expression (double-click to rename)'
                          : 'Click to set as default, double-click to rename'
                      }
                    >
                      {expr}
                      {defaultExpression === expr && ' (default)'}
                    </span>
                  )}
                  <button
                    style={{ ...buttonStyle, padding: '2px 6px', fontSize: '10px' }}
                    onClick={() => removeExpression(expr)}
                    title="Remove expression"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="New expression name..."
                value={newExpressionName}
                onChange={(e) => setNewExpressionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newExpressionName.trim()) {
                    addExpression(newExpressionName)
                    setNewExpressionName('')
                  }
                }}
              />
              <button
                style={buttonStyle}
                onClick={() => {
                  if (newExpressionName.trim()) {
                    addExpression(newExpressionName)
                    setNewExpressionName('')
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Per-Layer Controls */}
          {selectedLayer && selectedArtboardId && (
            <div style={sectionStyle}>
              <span style={{ ...labelStyle, fontWeight: 'bold' }}>
                Layer: {selectedLayer.name}
              </span>

              {/* Part Tag */}
              <div style={{ marginBottom: '6px' }}>
                <span style={labelStyle}>Part Tag</span>
                <select
                  style={selectStyle}
                  value={selectedLayer.pngtuberTag ?? 'none'}
                  onChange={(e) => {
                    const val = e.target.value as PNGTuberTag | 'none'
                    setLayerPNGTuberTag(
                      selectedArtboardId,
                      selectedLayer.id,
                      val === 'none' ? undefined : val,
                    )
                  }}
                >
                  {PART_TAGS.map((tag) => (
                    <option key={tag} value={tag}>
                      {tag === 'none' ? '(none)' : tag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expression Assignment */}
              <div style={{ marginBottom: '6px' }}>
                <span style={labelStyle}>Expression</span>
                <select
                  style={selectStyle}
                  value={selectedLayer.pngtuberExpression ?? 'all'}
                  onChange={(e) => {
                    const val = e.target.value
                    setLayerExpression(
                      selectedArtboardId,
                      selectedLayer.id,
                      val === 'all' ? undefined : val,
                    )
                  }}
                >
                  <option value="all">All expressions</option>
                  {expressions.map((expr) => (
                    <option key={expr} value={expr}>
                      {expr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Parallax Depth */}
              <div style={{ marginBottom: '6px' }}>
                <span style={labelStyle}>
                  Parallax Depth: {(selectedLayer.parallaxDepth ?? 0).toFixed(2)}
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={selectedLayer.parallaxDepth ?? 0}
                  onChange={(e) => {
                    setLayerParallaxDepth(
                      selectedArtboardId,
                      selectedLayer.id,
                      parseFloat(e.target.value),
                    )
                  }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-tertiary, #666)' }}>
                  <span>Background (0)</span>
                  <span>Foreground (1)</span>
                </div>
              </div>
            </div>
          )}

          {!selectedLayer && (
            <div style={{ ...sectionStyle, color: 'var(--text-tertiary, #666)', textAlign: 'center' }}>
              Select a layer to configure PNGtuber properties
            </div>
          )}

          {/* File Size Indicator */}
          <div style={sectionStyle}>
            <span style={{ ...labelStyle, fontWeight: 'bold' }}>File Size</span>
            <div
              style={{
                padding: '4px 6px',
                borderRadius: '3px',
                background: fileSizeOverLimit ? 'var(--error-bg, #4a1515)' : 'var(--success-bg, #1a3a1a)',
                color: fileSizeOverLimit ? 'var(--error-color, #ff6666)' : 'var(--success-color, #88cc88)',
              }}
            >
              {fileSizeMB} MB / {maxFileSizeMB} MB recommended max
            </div>
          </div>

          {/* Validation Warnings */}
          {warnings.length > 0 && (
            <div style={sectionStyle}>
              <span style={{ ...labelStyle, fontWeight: 'bold' }}>Warnings</span>
              {warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    padding: '4px 6px',
                    marginBottom: '2px',
                    borderRadius: '3px',
                    background: 'var(--warning-bg, #3a3515)',
                    color: 'var(--warning-color, #ccaa44)',
                    fontSize: '11px',
                  }}
                >
                  {w.message}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Recursively find a layer by ID. */
function findLayerDeep(layers: Layer[], layerId: string): Layer | undefined {
  for (const layer of layers) {
    if (layer.id === layerId) return layer
    if (layer.type === 'group') {
      const found = findLayerDeep(layer.children, layerId)
      if (found) return found
    }
  }
  return undefined
}
