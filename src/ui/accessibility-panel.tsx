import { useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Artboard, Layer, TextLayer } from '@/types/document'

// ── Color blindness simulation ──

type SimulationType = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia'

let activeSimulation: SimulationType = 'normal'

const SIMULATION_MATRICES: Record<Exclude<SimulationType, 'normal'>, string> = {
  protanopia: '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0',
  deuteranopia: '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0',
  achromatopsia: '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0',
}

const SVG_FILTER_ID = 'crossdraw-cb-filter'

function ensureSvgFilter(): void {
  let svg = document.getElementById('crossdraw-cb-svg') as SVGSVGElement | null
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('id', 'crossdraw-cb-svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    document.body.appendChild(svg)
  }
  svg.innerHTML = ''
}

function applySimulation(type: SimulationType): void {
  activeSimulation = type
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null
  if (!canvas) return

  if (type === 'normal') {
    canvas.style.filter = ''
    // Clean up SVG filter
    const svg = document.getElementById('crossdraw-cb-svg')
    if (svg) svg.innerHTML = ''
    return
  }

  // Create SVG filter
  ensureSvgFilter()
  const svg = document.getElementById('crossdraw-cb-svg')!
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter')
  filter.setAttribute('id', SVG_FILTER_ID)
  filter.setAttribute('color-interpolation-filters', 'linearRGB')
  const colorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix')
  colorMatrix.setAttribute('type', 'matrix')
  colorMatrix.setAttribute('values', SIMULATION_MATRICES[type])
  filter.appendChild(colorMatrix)
  defs.appendChild(filter)
  svg.appendChild(defs)

  canvas.style.filter = `url(#${SVG_FILTER_ID})`
}

// ── WCAG contrast utilities ──

/** Parse a hex color string to [r, g, b] in 0-255 range. Supports #RGB, #RGBA, #RRGGBB, #RRGGBBAA. */
function parseHexToRGB(hex: string): [number, number, number] {
  let h = hex.replace(/^#/, '')

  // Handle short forms
  if (h.length === 3 || h.length === 4) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  } else if (h.length === 8) {
    // RRGGBBAA — strip alpha
    h = h.slice(0, 6)
  }

  if (h.length !== 6) {
    return [0, 0, 0] // fallback for unparseable
  }

  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b]
}

/** Linearize a single sRGB channel value (0-255) to linear light (0-1). */
function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Compute relative luminance per WCAG 2.x. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexToRGB(hex)
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

/** Compute WCAG contrast ratio between two hex colors. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Determine if text is "large" per WCAG: >=18pt or >=14pt bold. */
function isLargeText(fontSize: number, fontWeight: string): boolean {
  // fontSize in the document is in px; 1pt = 1.333px
  const ptSize = fontSize / 1.333
  if (ptSize >= 18) return true
  if (ptSize >= 14 && fontWeight === 'bold') return true
  return false
}

// ── Scan helpers ──

interface ContrastIssue {
  layerId: string
  layerName: string
  textColor: string
  bgColor: string
  ratio: number
  large: boolean
  passAA: boolean
  passAAA: boolean
}

interface TouchTargetIssue {
  layerId: string
  layerName: string
  width: number
  height: number
}

interface ScanResults {
  contrastIssues: ContrastIssue[]
  touchTargetIssues: TouchTargetIssue[]
}

/** Recursively collect all layers from an artboard (flattening groups). */
function flattenLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    result.push(layer)
    if (layer.type === 'group') {
      result.push(...flattenLayers(layer.children))
    }
  }
  return result
}

/** Find the effective background color for a text layer. */
function findBackgroundColor(textLayer: TextLayer, _allLayers: Layer[], artboard: Artboard): string {
  // Check if there's a visible opaque layer directly behind this text layer
  const flat = flattenLayers(artboard.layers)
  const textIndex = flat.findIndex((l) => l.id === textLayer.id)

  // Walk backward through layers to find something behind the text
  for (let i = textIndex - 1; i >= 0; i--) {
    const layer = flat[i]!
    if (!layer.visible || layer.opacity < 0.5) continue

    if (layer.type === 'vector' && layer.fill?.type === 'solid' && layer.fill.color) {
      return layer.fill.color
    }
    if (layer.type === 'raster') {
      // Can't easily determine color, skip
      continue
    }
  }

  // Fall back to artboard background
  return artboard.backgroundColor
}

const INTERACTIVE_KEYWORDS = ['button', 'btn', 'link', 'icon', 'tap', 'click']

function scanArtboard(artboard: Artboard): ScanResults {
  const allLayers = flattenLayers(artboard.layers)
  const contrastIssues: ContrastIssue[] = []
  const touchTargetIssues: TouchTargetIssue[] = []

  for (const layer of allLayers) {
    if (!layer.visible) continue

    // Contrast check for text layers
    if (layer.type === 'text') {
      const textLayer = layer as TextLayer
      const textColor = textLayer.color || '#000000'
      const bgColor = findBackgroundColor(textLayer, allLayers, artboard)
      const ratio = contrastRatio(textColor, bgColor)
      const large = isLargeText(textLayer.fontSize, textLayer.fontWeight)

      const aaThreshold = large ? 3 : 4.5
      const aaaThreshold = large ? 4.5 : 7

      contrastIssues.push({
        layerId: layer.id,
        layerName: layer.name,
        textColor,
        bgColor,
        ratio,
        large,
        passAA: ratio >= aaThreshold,
        passAAA: ratio >= aaaThreshold,
      })
    }

    // Touch target check
    const nameLower = layer.name.toLowerCase()
    const isInteractive = INTERACTIVE_KEYWORDS.some((kw) => nameLower.includes(kw))
    if (isInteractive) {
      const w = Math.abs(layer.transform.scaleX) * getLayerBaseWidth(layer)
      const h = Math.abs(layer.transform.scaleY) * getLayerBaseHeight(layer)
      if (w < 44 || h < 44) {
        touchTargetIssues.push({
          layerId: layer.id,
          layerName: layer.name,
          width: Math.round(w),
          height: Math.round(h),
        })
      }
    }
  }

  return { contrastIssues, touchTargetIssues }
}

/** Get the base width of a layer before transform scaling. */
function getLayerBaseWidth(layer: Layer): number {
  switch (layer.type) {
    case 'vector':
      if (layer.shapeParams) return layer.shapeParams.width
      return computePathBoundsWidth(layer)
    case 'raster':
      return layer.width
    case 'text':
      return layer.textWidth ?? estimateTextWidth(layer)
    case 'group':
      return computeGroupWidth(layer.children)
    default:
      return 0
  }
}

/** Get the base height of a layer before transform scaling. */
function getLayerBaseHeight(layer: Layer): number {
  switch (layer.type) {
    case 'vector':
      if (layer.shapeParams) return layer.shapeParams.height
      return computePathBoundsHeight(layer)
    case 'raster':
      return layer.height
    case 'text':
      return layer.textHeight ?? layer.fontSize * layer.lineHeight
    case 'group':
      return computeGroupHeight(layer.children)
    default:
      return 0
  }
}

function computePathBoundsWidth(layer: { paths?: import('@/types/document').Path[] }): number {
  let minX = Infinity,
    maxX = -Infinity
  for (const path of layer.paths ?? []) {
    for (const seg of path.segments) {
      if ('x' in seg) {
        minX = Math.min(minX, seg.x)
        maxX = Math.max(maxX, seg.x)
      }
    }
  }
  return minX === Infinity ? 0 : maxX - minX
}

function computePathBoundsHeight(layer: { paths?: import('@/types/document').Path[] }): number {
  let minY = Infinity,
    maxY = -Infinity
  for (const path of layer.paths ?? []) {
    for (const seg of path.segments) {
      if ('y' in seg) {
        minY = Math.min(minY, seg.y)
        maxY = Math.max(maxY, seg.y)
      }
    }
  }
  return minY === Infinity ? 0 : maxY - minY
}

function estimateTextWidth(layer: TextLayer): number {
  // Rough estimate: average character width is ~0.6 * fontSize
  return layer.text.length * layer.fontSize * 0.6
}

function computeGroupWidth(children: Layer[]): number {
  let minX = Infinity,
    maxX = -Infinity
  for (const child of children) {
    const x = child.transform.x
    const w = getLayerBaseWidth(child) * Math.abs(child.transform.scaleX)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x + w)
  }
  return minX === Infinity ? 0 : maxX - minX
}

function computeGroupHeight(children: Layer[]): number {
  let minY = Infinity,
    maxY = -Infinity
  for (const child of children) {
    const y = child.transform.y
    const h = getLayerBaseHeight(child) * Math.abs(child.transform.scaleY)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + h)
  }
  return minY === Infinity ? 0 : maxY - minY
}

// ── Color swatch ──

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: 2,
        border: '1px solid var(--border-default)',
        backgroundColor: color,
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  )
}

// ── Badge ──

function Badge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 3,
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        background: pass ? '#2ea043' : '#cf222e',
        lineHeight: '16px',
      }}
    >
      {label}
    </span>
  )
}

// ── Panel component ──

export function AccessibilityPanel() {
  const [results, setResults] = useState<ScanResults | null>(null)
  const [simulation, setSimulation] = useState<SimulationType>(activeSimulation)

  const handleScan = useCallback(() => {
    const state = useEditorStore.getState()
    const artboard = state.document.artboards[0]
    if (!artboard) {
      setResults({ contrastIssues: [], touchTargetIssues: [] })
      return
    }
    setResults(scanArtboard(artboard))
  }, [])

  const handleSelectLayer = useCallback((layerId: string) => {
    const store = useEditorStore.getState()
    store.deselectAll()
    store.selectLayer(layerId, false)
  }, [])

  const handleSimulationChange = useCallback((type: SimulationType) => {
    setSimulation(type)
    applySimulation(type)
  }, [])

  const totalIssues = results
    ? results.contrastIssues.filter((c) => !c.passAA).length + results.touchTargetIssues.length
    : 0

  const contrastFailCount = results ? results.contrastIssues.filter((c) => !c.passAA).length : 0
  const touchFailCount = results ? results.touchTargetIssues.length : 0

  return (
    <div
      style={{
        padding: 'var(--space-2, 8px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        fontSize: 12,
        color: 'var(--text-primary)',
        overflowY: 'auto',
      }}
    >
      {/* Summary & Refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleScan}
          style={{
            padding: '4px 10px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'var(--accent)',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Scan
        </button>
        {results && (
          <span style={{ fontSize: 11, color: totalIssues > 0 ? '#cf222e' : '#2ea043', fontWeight: 600 }}>
            {totalIssues === 0 ? 'No issues found' : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`}
          </span>
        )}
      </div>

      {results && totalIssues > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: '16px' }}>
          {contrastFailCount > 0 && (
            <div>
              {contrastFailCount} contrast issue{contrastFailCount !== 1 ? 's' : ''}
            </div>
          )}
          {touchFailCount > 0 && (
            <div>
              {touchFailCount} touch target issue{touchFailCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Color Blindness Simulation */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Color Blindness Simulation
        </div>
        <select
          value={simulation}
          onChange={(e) => handleSimulationChange(e.target.value as SimulationType)}
          style={{
            width: '100%',
            padding: '4px 6px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: 'var(--bg-input, var(--bg-surface))',
            color: 'var(--text-primary)',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          <option value="normal">Normal Vision</option>
          <option value="protanopia">Protanopia (no red)</option>
          <option value="deuteranopia">Deuteranopia (no green)</option>
          <option value="tritanopia">Tritanopia (no blue)</option>
          <option value="achromatopsia">Achromatopsia (total)</option>
        </select>
      </div>

      {/* Contrast Checker */}
      {results && results.contrastIssues.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Contrast Checker
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.contrastIssues.map((issue) => (
              <div
                key={issue.layerId}
                onClick={() => handleSelectLayer(issue.layerId)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  cursor: 'pointer',
                  background: 'var(--bg-surface)',
                }}
                onMouseOver={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
                }}
                onMouseOut={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 4,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {issue.layerName}
                  </span>
                  {issue.large && (
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0 }}>LARGE</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <ColorSwatch color={issue.textColor} />
                  <span style={{ color: 'var(--text-secondary)' }}>on</span>
                  <ColorSwatch color={issue.bgColor} />
                  <span
                    style={{
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {issue.ratio.toFixed(2)}:1
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                    <Badge pass={issue.passAA} label="AA" />
                    <Badge pass={issue.passAAA} label="AAA" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results && results.contrastIssues.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          No text layers found on this artboard.
        </div>
      )}

      {/* Touch Target Checker */}
      {results && results.touchTargetIssues.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Touch Targets (&lt;44x44px)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {results.touchTargetIssues.map((issue) => (
              <div
                key={issue.layerId}
                onClick={() => handleSelectLayer(issue.layerId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  cursor: 'pointer',
                  background: 'var(--bg-surface)',
                  fontSize: 11,
                }}
                onMouseOver={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
                }}
                onMouseOut={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {issue.layerName}
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 10,
                    color: '#cf222e',
                    fontWeight: 600,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  {issue.width}x{issue.height}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
