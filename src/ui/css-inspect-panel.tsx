import { useEditorStore } from '@/store/editor.store'
import { getLayerBBox } from '@/math/bbox'
import { useEffect, useState, useCallback } from 'react'
import type {
  Layer,
  VectorLayer,
  TextLayer,
  Fill,
  Stroke,
  Effect,
  ShadowParams,
  GlowParams,
  InnerShadowParams,
  Artboard,
  GroupLayer,
} from '@/types'

// ── Helpers ──

function findLayerRecursive(layers: readonly Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findLayerRecursive((l as GroupLayer).children, id)
      if (child) return child
    }
  }
  return null
}

function findParentGroup(layers: readonly Layer[], targetId: string): GroupLayer | null {
  for (const l of layers) {
    if (l.type === 'group') {
      const g = l as GroupLayer
      for (const child of g.children) {
        if (child.id === targetId) return g
      }
      const deeper = findParentGroup(g.children, targetId)
      if (deeper) return deeper
    }
  }
  return null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function colorToCSS(color: string): string {
  return color
}

function fillToCSS(fill: Fill | null): string | null {
  if (!fill) return null
  if (fill.type === 'solid' && fill.color) {
    return fill.opacity < 1 ? `${fill.color} (opacity: ${round2(fill.opacity)})` : fill.color
  }
  if (fill.type === 'gradient' && fill.gradient) {
    const g = fill.gradient
    const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
    if (g.type === 'linear') {
      return `linear-gradient(${g.angle ?? 0}deg, ${stops})`
    }
    if (g.type === 'radial') {
      return `radial-gradient(circle, ${stops})`
    }
    if (g.type === 'conical') {
      return `conic-gradient(from ${g.angle ?? 0}deg, ${stops})`
    }
    return `${g.type}-gradient(${stops})`
  }
  return null
}

function strokeToCSS(stroke: Stroke | null): string | null {
  if (!stroke) return null
  return `${stroke.width}px ${stroke.dasharray?.length ? 'dashed' : 'solid'} ${stroke.color}`
}

function effectToBoxShadow(effect: Effect): string | null {
  if (!effect.enabled) return null
  const p = effect.params
  if (p.kind === 'shadow') {
    const sp = p as ShadowParams
    return `${sp.offsetX}px ${sp.offsetY}px ${sp.blurRadius}px ${sp.spread}px ${sp.color}`
  }
  if (p.kind === 'inner-shadow') {
    const ip = p as InnerShadowParams
    return `inset ${ip.offsetX}px ${ip.offsetY}px ${ip.blurRadius}px ${ip.color}`
  }
  if (p.kind === 'glow') {
    const gp = p as GlowParams
    return `0 0 ${gp.radius}px ${gp.spread}px ${gp.color}`
  }
  return null
}

function getCornerRadiusCSS(layer: VectorLayer): string | null {
  if (!layer.shapeParams) return null
  const cr = layer.shapeParams.cornerRadius
  if (cr === undefined || cr === 0) return null
  if (typeof cr === 'number') return `${cr}px`
  return cr.map((r) => `${r}px`).join(' ')
}

interface CSSProperty {
  name: string
  value: string
}

function buildCSSProperties(layer: Layer, _artboard: Artboard): CSSProperty[] {
  const props: CSSProperty[] = []

  // Position & size
  const t = layer.transform
  props.push({ name: 'position', value: 'absolute' })
  props.push({ name: 'left', value: `${round2(t.x)}px` })
  props.push({ name: 'top', value: `${round2(t.y)}px` })

  if (t.scaleX !== 1 || t.scaleY !== 1) {
    const w = layer.type === 'raster' ? layer.width * t.scaleX : t.scaleX
    const h = layer.type === 'raster' ? layer.height * t.scaleY : t.scaleY
    if (layer.type === 'raster') {
      props.push({ name: 'width', value: `${round2(w)}px` })
      props.push({ name: 'height', value: `${round2(h)}px` })
    }
  }

  if (layer.type === 'vector' && layer.shapeParams) {
    props.push({ name: 'width', value: `${round2(layer.shapeParams.width * t.scaleX)}px` })
    props.push({ name: 'height', value: `${round2(layer.shapeParams.height * t.scaleY)}px` })
  } else if (layer.type === 'raster') {
    props.push({ name: 'width', value: `${round2(layer.width * t.scaleX)}px` })
    props.push({ name: 'height', value: `${round2(layer.height * t.scaleY)}px` })
  } else if (layer.type === 'text') {
    const tl = layer as TextLayer
    if (tl.textMode === 'area' && tl.textWidth && tl.textHeight) {
      props.push({ name: 'width', value: `${round2(tl.textWidth)}px` })
      props.push({ name: 'height', value: `${round2(tl.textHeight)}px` })
    }
  }

  if (t.rotation !== 0) {
    props.push({ name: 'transform', value: `rotate(${round2(t.rotation)}deg)` })
  }

  // Opacity
  if (layer.opacity < 1) {
    props.push({ name: 'opacity', value: `${round2(layer.opacity)}` })
  }

  // Fill & Stroke (vector layers)
  if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    const bg = fillToCSS(vl.fill)
    if (bg) props.push({ name: 'background', value: bg })

    const border = strokeToCSS(vl.stroke)
    if (border) props.push({ name: 'border', value: border })

    if (vl.shapeParams?.shapeType === 'ellipse') {
      props.push({ name: 'border-radius', value: '50%' })
    } else {
      const borderRadius = getCornerRadiusCSS(vl)
      if (borderRadius) props.push({ name: 'border-radius', value: borderRadius })
    }
  }

  // Typography (text layers)
  if (layer.type === 'text') {
    const tl = layer as TextLayer
    props.push({ name: 'font-family', value: `'${tl.fontFamily}'` })
    props.push({ name: 'font-size', value: `${tl.fontSize}px` })
    if (tl.fontWeight !== 'normal') props.push({ name: 'font-weight', value: tl.fontWeight })
    if (tl.fontStyle !== 'normal') props.push({ name: 'font-style', value: tl.fontStyle })
    props.push({ name: 'line-height', value: `${round2(tl.lineHeight)}` })
    if (tl.letterSpacing !== 0) props.push({ name: 'letter-spacing', value: `${round2(tl.letterSpacing)}px` })
    props.push({ name: 'text-align', value: tl.textAlign })
    props.push({ name: 'color', value: colorToCSS(tl.color) })
    if (tl.textDecoration && tl.textDecoration !== 'none') {
      props.push({ name: 'text-decoration', value: tl.textDecoration })
    }
    if (tl.textTransform && tl.textTransform !== 'none') {
      props.push({ name: 'text-transform', value: tl.textTransform })
    }
    if (tl.paragraphIndent) {
      props.push({ name: 'text-indent', value: `${tl.paragraphIndent}px` })
    }
  }

  // Effects -> box-shadow
  const shadows = layer.effects.map(effectToBoxShadow).filter((s): s is string => s !== null)
  if (shadows.length > 0) {
    props.push({ name: 'box-shadow', value: shadows.join(', ') })
  }

  // Blur effect -> filter
  for (const eff of layer.effects) {
    if (eff.enabled && eff.params.kind === 'blur') {
      props.push({ name: 'filter', value: `blur(${eff.params.radius}px)` })
    }
    if (eff.enabled && eff.params.kind === 'background-blur') {
      props.push({ name: 'backdrop-filter', value: `blur(${eff.params.radius}px)` })
    }
  }

  // Blend mode
  if (layer.blendMode !== 'normal') {
    props.push({ name: 'mix-blend-mode', value: layer.blendMode })
  }

  return props
}

// ── Styles ──

const monoFont = "'SF Mono', 'Fira Code', 'Consolas', monospace"

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-tertiary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '2px 0',
  fontFamily: monoFont,
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 2,
}

const propNameStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
  flexShrink: 0,
  marginRight: 8,
}

const propValueStyle: React.CSSProperties = {
  color: 'var(--text-primary)',
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// ── Components ──

function PropertyRow({ name, value }: { name: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(`${name}: ${value};`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }, [name, value])

  return (
    <div
      onClick={handleClick}
      style={{
        ...rowStyle,
        background: copied ? 'rgba(74, 125, 255, 0.15)' : 'transparent',
      }}
      title={`Click to copy: ${name}: ${value};`}
    >
      <span style={propNameStyle}>{name}:</span>
      <span style={propValueStyle}>{copied ? 'Copied!' : value}</span>
    </div>
  )
}

function BoxModelDiagram({ layer, artboard }: { layer: Layer; artboard: Artboard }) {
  const bbox = getLayerBBox(layer, artboard)
  const w = round2(bbox.maxX - bbox.minX)
  const h = round2(bbox.maxY - bbox.minY)
  const strokeWidth =
    layer.type === 'vector' && (layer as VectorLayer).stroke ? (layer as VectorLayer).stroke!.width : 0
  const parentGroup = findParentGroup(artboard.layers, layer.id)

  // Margin = gap to parent edges
  const margin = { top: 0, right: 0, bottom: 0, left: 0 }
  if (parentGroup) {
    const parentBBox = getLayerBBox(parentGroup, artboard)
    margin.top = round2(bbox.minY - parentBBox.minY)
    margin.right = round2(parentBBox.maxX - bbox.maxX)
    margin.bottom = round2(parentBBox.maxY - bbox.maxY)
    margin.left = round2(bbox.minX - parentBBox.minX)
  } else {
    // Distance to artboard edges
    margin.top = round2(bbox.minY - artboard.y)
    margin.right = round2(artboard.x + artboard.width - bbox.maxX)
    margin.bottom = round2(artboard.y + artboard.height - bbox.maxY)
    margin.left = round2(bbox.minX - artboard.x)
  }

  const boxW = 180
  const boxH = 120
  const borderThickness = strokeWidth > 0 ? 12 : 0
  const marginThickness = 14

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      <div
        style={{
          position: 'relative',
          width: boxW + marginThickness * 2,
          height: boxH + marginThickness * 2,
          fontSize: 9,
          fontFamily: monoFont,
          textAlign: 'center',
        }}
      >
        {/* Margin (orange) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(246, 178, 107, 0.25)',
            border: '1px solid rgba(246, 178, 107, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 1,
            borderRadius: 2,
          }}
        >
          <span style={{ color: 'rgb(246, 178, 107)', fontSize: 8 }}>{margin.top}</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '0 1px' }}>
            <span style={{ color: 'rgb(246, 178, 107)', fontSize: 8 }}>{margin.left}</span>
            <span style={{ color: 'rgb(246, 178, 107)', fontSize: 8 }}>{margin.right}</span>
          </div>
          <span style={{ color: 'rgb(246, 178, 107)', fontSize: 8 }}>{margin.bottom}</span>
        </div>

        {/* Border (yellow) */}
        <div
          style={{
            position: 'absolute',
            top: marginThickness,
            left: marginThickness,
            right: marginThickness,
            bottom: marginThickness,
            background: borderThickness > 0 ? 'rgba(252, 229, 105, 0.25)' : 'transparent',
            border: borderThickness > 0 ? '1px solid rgba(252, 229, 105, 0.5)' : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 1,
          }}
        >
          {borderThickness > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 1,
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'rgb(252, 229, 105)',
                fontSize: 8,
              }}
            >
              {strokeWidth}px
            </span>
          )}

          {/* Content (blue) */}
          <div
            style={{
              position: 'absolute',
              inset: borderThickness > 0 ? 10 : 0,
              background: 'rgba(107, 165, 246, 0.25)',
              border: '1px solid rgba(107, 165, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1,
            }}
          >
            <span style={{ color: 'rgb(107, 165, 246)', fontSize: 10, fontWeight: 600 }}>
              {round2(w)} x {round2(h)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpacingSection({ layer, artboard }: { layer: Layer; artboard: Artboard }) {
  const bbox = getLayerBBox(layer, artboard)

  // Distance to artboard edges
  const toTop = round2(bbox.minY - artboard.y)
  const toRight = round2(artboard.x + artboard.width - bbox.maxX)
  const toBottom = round2(artboard.y + artboard.height - bbox.maxY)
  const toLeft = round2(bbox.minX - artboard.x)

  // Distance to nearest sibling in each direction
  const siblings = artboard.layers.filter((l) => l.id !== layer.id && l.visible)

  let nearestUp: { name: string; dist: number } | null = null
  let nearestDown: { name: string; dist: number } | null = null
  let nearestLeft: { name: string; dist: number } | null = null
  let nearestRight: { name: string; dist: number } | null = null

  for (const sib of siblings) {
    const sb = getLayerBBox(sib, artboard)
    // Above
    if (sb.maxY <= bbox.minY) {
      const d = round2(bbox.minY - sb.maxY)
      if (!nearestUp || d < nearestUp.dist) nearestUp = { name: sib.name, dist: d }
    }
    // Below
    if (sb.minY >= bbox.maxY) {
      const d = round2(sb.minY - bbox.maxY)
      if (!nearestDown || d < nearestDown.dist) nearestDown = { name: sib.name, dist: d }
    }
    // Left
    if (sb.maxX <= bbox.minX) {
      const d = round2(bbox.minX - sb.maxX)
      if (!nearestLeft || d < nearestLeft.dist) nearestLeft = { name: sib.name, dist: d }
    }
    // Right
    if (sb.minX >= bbox.maxX) {
      const d = round2(sb.minX - bbox.maxX)
      if (!nearestRight || d < nearestRight.dist) nearestRight = { name: sib.name, dist: d }
    }
  }

  return (
    <div>
      <div style={sectionLabelStyle}>Spacing to Artboard</div>
      <PropertyRow name="top" value={`${toTop}px`} />
      <PropertyRow name="right" value={`${toRight}px`} />
      <PropertyRow name="bottom" value={`${toBottom}px`} />
      <PropertyRow name="left" value={`${toLeft}px`} />

      {(nearestUp || nearestDown || nearestLeft || nearestRight) && (
        <>
          <div style={{ ...sectionLabelStyle, marginTop: 8 }}>Nearest Siblings</div>
          {nearestUp && <PropertyRow name={`up (${nearestUp.name})`} value={`${nearestUp.dist}px`} />}
          {nearestDown && <PropertyRow name={`down (${nearestDown.name})`} value={`${nearestDown.dist}px`} />}
          {nearestLeft && <PropertyRow name={`left (${nearestLeft.name})`} value={`${nearestLeft.dist}px`} />}
          {nearestRight && <PropertyRow name={`right (${nearestRight.name})`} value={`${nearestRight.dist}px`} />}
        </>
      )}
    </div>
  )
}

// ── Main Panel ──

export function CSSInspectPanel() {
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const setShowInspectOverlay = useEditorStore((s) => s.setShowInspectOverlay)
  const [allCopied, setAllCopied] = useState(false)

  // Enable overlay when panel mounts, disable on unmount
  useEffect(() => {
    setShowInspectOverlay(true)
    return () => setShowInspectOverlay(false)
  }, [setShowInspectOverlay])

  const artboard = document.artboards[0]
  const layerId = selection.layerIds[0]
  const selectedLayer = artboard && layerId ? findLayerRecursive(artboard.layers, layerId) : null

  const cssProps = selectedLayer && artboard ? buildCSSProperties(selectedLayer, artboard) : []
  const cssBlock = cssProps.map((p) => `  ${p.name}: ${p.value};`).join('\n')
  const fullCSS = selectedLayer ? `.${selectedLayer.name.replace(/\s+/g, '-').toLowerCase()} {\n${cssBlock}\n}` : ''

  const copyAll = useCallback(() => {
    if (!fullCSS) return
    navigator.clipboard.writeText(fullCSS).then(() => {
      setAllCopied(true)
      setTimeout(() => setAllCopied(false), 1500)
    })
  }, [fullCSS])

  if (!artboard) {
    return (
      <div style={{ padding: 'var(--space-2, 8px)', color: 'var(--text-tertiary)', fontSize: 12 }}>No artboard</div>
    )
  }

  if (!selectedLayer) {
    return (
      <div style={{ padding: 'var(--space-2, 8px)', color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
        Select a layer to inspect CSS properties
      </div>
    )
  }

  // Group CSS properties by category for display
  const positionProps = cssProps.filter((p) =>
    ['position', 'left', 'top', 'width', 'height', 'transform'].includes(p.name),
  )
  const typographyProps = cssProps.filter((p) =>
    [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'line-height',
      'letter-spacing',
      'text-align',
      'color',
      'text-decoration',
      'text-transform',
      'text-indent',
    ].includes(p.name),
  )
  const visualProps = cssProps.filter((p) =>
    [
      'background',
      'border',
      'border-radius',
      'opacity',
      'box-shadow',
      'filter',
      'backdrop-filter',
      'mix-blend-mode',
    ].includes(p.name),
  )

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
      {/* Header with Copy All */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{selectedLayer.name}</span>
        <button
          onClick={copyAll}
          style={{
            padding: '3px 8px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer',
            fontSize: 10,
            background: allCopied ? 'var(--accent)' : 'transparent',
            color: allCopied ? '#fff' : 'var(--text-secondary)',
          }}
        >
          {allCopied ? 'Copied!' : 'Copy All'}
        </button>
      </div>

      {/* Box Model */}
      <div>
        <div style={sectionLabelStyle}>Box Model</div>
        <BoxModelDiagram layer={selectedLayer} artboard={artboard} />
      </div>

      {/* Position & Size */}
      {positionProps.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>Position & Size</div>
          {positionProps.map((p) => (
            <PropertyRow key={p.name} name={p.name} value={p.value} />
          ))}
        </div>
      )}

      {/* Typography */}
      {typographyProps.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>Typography</div>
          {typographyProps.map((p) => (
            <PropertyRow key={p.name} name={p.name} value={p.value} />
          ))}
        </div>
      )}

      {/* Fill & Stroke */}
      {visualProps.length > 0 && (
        <div>
          <div style={sectionLabelStyle}>Fill & Stroke</div>
          {visualProps.map((p) => (
            <PropertyRow key={p.name} name={p.name} value={p.value} />
          ))}
        </div>
      )}

      {/* Spacing */}
      <SpacingSection layer={selectedLayer} artboard={artboard} />

      {/* Raw CSS preview */}
      <div>
        <div style={sectionLabelStyle}>CSS Output</div>
        <pre
          style={{
            fontFamily: monoFont,
            fontSize: 10,
            color: 'var(--text-secondary)',
            background: 'var(--bg-tertiary, rgba(0,0,0,0.1))',
            padding: 8,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 160,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {fullCSS}
        </pre>
      </div>
    </div>
  )
}
