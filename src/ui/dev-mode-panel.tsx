import { useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, GroupLayer, VectorLayer, TextLayer, Artboard } from '@/types'
import { getLayerBBox } from '@/math/bbox'

// ── Helpers ──

function findLayerDeep(layers: readonly Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findLayerDeep((l as GroupLayer).children, id)
      if (child) return child
    }
  }
  return null
}

function collectAnnotatedLayers(layers: readonly Layer[]): { layer: Layer; annotation: string }[] {
  const result: { layer: Layer; annotation: string }[] = []
  for (const layer of layers) {
    if (layer.devAnnotation) {
      result.push({ layer, annotation: layer.devAnnotation })
    }
    if (layer.type === 'group') {
      result.push(...collectAnnotatedLayers((layer as GroupLayer).children))
    }
  }
  return result
}

function collectVisibleNamedLayers(layers: readonly Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    if (layer.visible && layer.name && !layer.name.startsWith('Layer')) {
      result.push(layer)
    }
    if (layer.type === 'group') {
      result.push(...collectVisibleNamedLayers((layer as GroupLayer).children))
    }
  }
  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function layerCSS(layer: Layer, artboard: Artboard): Record<string, string> {
  const css: Record<string, string> = {}
  const t = layer.transform

  // Position
  css['position'] = 'absolute'
  css['left'] = `${round2(t.x)}px`
  css['top'] = `${round2(t.y)}px`

  // Size from bounding box
  const bbox = getLayerBBox(layer, artboard)
  if (bbox.minX !== Infinity) {
    css['width'] = `${round2(bbox.maxX - bbox.minX)}px`
    css['height'] = `${round2(bbox.maxY - bbox.minY)}px`
  }

  // Opacity
  if (layer.opacity < 1) {
    css['opacity'] = `${round2(layer.opacity)}`
  }

  // Rotation
  if (t.rotation !== 0) {
    css['transform'] = `rotate(${round2(t.rotation)}deg)`
  }

  // Type-specific properties
  if (layer.type === 'vector') {
    const vec = layer as VectorLayer
    if (vec.fill?.type === 'solid' && vec.fill.color) {
      css['background'] = vec.fill.color
    }
    if (vec.stroke) {
      css['border'] = `${vec.stroke.width}px solid ${vec.stroke.color}`
    }
    if (vec.shapeParams?.cornerRadius !== undefined) {
      const cr = vec.shapeParams.cornerRadius
      css['border-radius'] = typeof cr === 'number' ? `${cr}px` : cr.map((v) => `${v}px`).join(' ')
    }
  }

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    css['font-family'] = tl.fontFamily
    css['font-size'] = `${tl.fontSize}px`
    css['font-weight'] = tl.fontWeight
    css['font-style'] = tl.fontStyle
    css['line-height'] = `${tl.lineHeight}`
    css['letter-spacing'] = `${tl.letterSpacing}px`
    css['color'] = tl.color
    css['text-align'] = tl.textAlign
  }

  // Effects
  const shadows = (layer.effects ?? [])
    .filter((e) => e.enabled && (e.type === 'shadow' || e.type === 'drop-shadow'))
    .map((e) => {
      const p = e.params as { kind: 'shadow'; offsetX: number; offsetY: number; blurRadius: number; color: string }
      return `${p.offsetX}px ${p.offsetY}px ${p.blurRadius}px ${p.color}`
    })
  if (shadows.length > 0) {
    css['box-shadow'] = shadows.join(', ')
  }

  return css
}

// ── Spacing display ──

function SpacingInfo({ layer, artboard }: { layer: Layer; artboard: Artboard }) {
  const bbox = getLayerBBox(layer, artboard)
  if (bbox.minX === Infinity) return null

  const top = round2(bbox.minY)
  const left = round2(bbox.minX)
  const right = round2(artboard.width - bbox.maxX)
  const bottom = round2(artboard.height - bbox.maxY)

  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
      <strong style={{ color: 'var(--text-primary)' }}>Spacing to artboard edges:</strong>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginTop: 4 }}>
        <span>Top: {top}px</span>
        <span>Right: {right}px</span>
        <span>Bottom: {bottom}px</span>
        <span>Left: {left}px</span>
      </div>
    </div>
  )
}

// ── CSS Properties display ──

function CSSProperties({ layer, artboard }: { layer: Layer; artboard: Artboard }) {
  const css = layerCSS(layer, artboard)
  const entries = Object.entries(css)

  if (entries.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ color: 'var(--text-primary)', fontSize: 11 }}>CSS Properties:</strong>
      <pre
        style={{
          margin: '4px 0 0',
          padding: 8,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          fontSize: 10,
          lineHeight: 1.6,
          color: 'var(--text-primary)',
          whiteSpace: 'pre-wrap',
          overflow: 'auto',
          maxHeight: 200,
        }}
      >
        {entries.map(([k, v]) => `${k}: ${v};`).join('\n')}
      </pre>
    </div>
  )
}

// ── Annotation editor ──

function AnnotationEditor({ layerId, artboardId }: { layerId: string; artboardId: string }) {
  const document = useEditorStore((s) => s.document)
  const setDevAnnotation = useEditorStore((s) => s.setDevAnnotation)
  const artboard = document.artboards.find((a) => a.id === artboardId)
  const layer = artboard ? findLayerDeep(artboard.layers, layerId) : null
  const [text, setText] = useState(layer?.devAnnotation ?? '')

  const handleSave = useCallback(() => {
    setDevAnnotation(layerId, artboardId, text)
  }, [layerId, artboardId, text, setDevAnnotation])

  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ color: 'var(--text-primary)', fontSize: 11 }}>Developer Note:</strong>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add annotation..."
          style={{
            flex: 1,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 3,
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button
          onClick={handleSave}
          style={{
            background: 'var(--bg-active)',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 3,
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

// ── Annotations list ──

function AnnotationsList({ artboard }: { artboard: Artboard }) {
  const annotated = collectAnnotatedLayers(artboard.layers)

  if (annotated.length === 0) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>No annotations in this artboard</div>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ color: 'var(--text-primary)', fontSize: 11 }}>Annotations:</strong>
      {annotated.map(({ layer, annotation }) => (
        <div
          key={layer.id}
          style={{
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: 11,
          }}
        >
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{layer.name}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{annotation}</div>
        </div>
      ))}
    </div>
  )
}

// ── Simplified layer tree ──

function SimplifiedLayerTree({ artboard }: { artboard: Artboard }) {
  const namedLayers = collectVisibleNamedLayers(artboard.layers)
  const selectLayer = useEditorStore((s) => s.selectLayer)

  return (
    <div style={{ marginTop: 8 }}>
      <strong style={{ color: 'var(--text-primary)', fontSize: 11 }}>Named Layers:</strong>
      {namedLayers.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>No named layers</div>
      ) : (
        namedLayers.map((layer) => (
          <div
            key={layer.id}
            onClick={() => selectLayer(layer.id)}
            style={{
              padding: '3px 4px',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-primary)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>
              {layer.type === 'text' ? 'T' : layer.type === 'vector' ? 'V' : layer.type === 'group' ? 'G' : 'R'}
            </span>
            {layer.name}
          </div>
        ))
      )}
    </div>
  )
}

// ── Ready-for-dev artboard list ──

function ReadyForDevArtboards() {
  const artboards = useEditorStore((s) => s.document.artboards)
  const setReadyForDev = useEditorStore((s) => s.setReadyForDev)

  return (
    <div style={{ marginBottom: 12 }}>
      <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>Artboards</strong>
      {artboards.map((artboard) => (
        <div
          key={artboard.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <input
            type="checkbox"
            checked={!!artboard.readyForDev}
            onChange={(e) => setReadyForDev(artboard.id, e.target.checked)}
            title="Mark as ready for development"
          />
          <span style={{ fontSize: 11, color: 'var(--text-primary)', flex: 1 }}>{artboard.name}</span>
          {artboard.readyForDev && (
            <span
              style={{
                fontSize: 10,
                color: '#22c55e',
                fontWeight: 600,
                padding: '1px 6px',
                border: '1px solid #22c55e',
                borderRadius: 8,
              }}
            >
              Ready
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main panel ──

export function DevModePanel() {
  const devMode = useEditorStore((s) => s.devMode)
  const devModeReadOnly = useEditorStore((s) => s.devModeReadOnly)
  const toggleDevMode = useEditorStore((s) => s.toggleDevMode)
  const toggleDevModeReadOnly = useEditorStore((s) => s.toggleDevModeReadOnly)
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)

  const artboard = document.artboards[0] ?? null
  const selectedLayerId = selection.layerIds[0] ?? null
  const selectedLayer = artboard && selectedLayerId ? findLayerDeep(artboard.layers, selectedLayerId) : null

  // Style references
  const textStyles = document.styles?.textStyles ?? []
  const colorStyles = document.styles?.colorStyles ?? []
  const effectStyles = document.styles?.effectStyles ?? []

  const linkedTextStyle = selectedLayer?.textStyleId ? textStyles.find((s) => s.id === selectedLayer.textStyleId) : null
  const linkedColorStyle = selectedLayer?.fillStyleId
    ? colorStyles.find((s) => s.id === selectedLayer.fillStyleId)
    : null
  const linkedEffectStyle = selectedLayer?.effectStyleId
    ? effectStyles.find((s) => s.id === selectedLayer.effectStyleId)
    : null

  return (
    <div
      style={{
        padding: 12,
        fontSize: 12,
        color: 'var(--text-primary)',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        Dev Mode
      </h3>

      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
          <input type="checkbox" checked={devMode} onChange={toggleDevMode} />
          Enable Dev Mode
        </label>
      </div>

      {devMode && (
        <>
          {/* Read-only toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="checkbox" checked={devModeReadOnly} onChange={toggleDevModeReadOnly} />
              Read-only (disable editing tools)
            </label>
          </div>

          {/* Ready for dev artboards */}
          <ReadyForDevArtboards />

          {/* Selected layer info */}
          {selectedLayer && artboard && (
            <div
              style={{
                marginTop: 12,
                padding: 8,
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {selectedLayer.name}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 6 }}>
                  ({selectedLayer.type})
                </span>
              </div>

              {/* Design token references */}
              {(linkedTextStyle || linkedColorStyle || linkedEffectStyle) && (
                <div style={{ marginTop: 6 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 11 }}>Design Tokens:</strong>
                  {linkedTextStyle && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Text: {linkedTextStyle.name}
                    </div>
                  )}
                  {linkedColorStyle && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Color: {linkedColorStyle.name}
                    </div>
                  )}
                  {linkedEffectStyle && (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Effect: {linkedEffectStyle.name}
                    </div>
                  )}
                </div>
              )}

              <CSSProperties layer={selectedLayer} artboard={artboard} />
              <SpacingInfo layer={selectedLayer} artboard={artboard} />
              <AnnotationEditor layerId={selectedLayer.id} artboardId={artboard.id} />
            </div>
          )}

          {/* Annotations list */}
          {artboard && <AnnotationsList artboard={artboard} />}

          {/* Simplified layer tree */}
          {artboard && <SimplifiedLayerTree artboard={artboard} />}
        </>
      )}

      {!devMode && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          Enable Dev Mode to view developer handoff information, CSS properties, spacing, and annotations.
        </div>
      )}
    </div>
  )
}
