import { v4 as uuid } from 'uuid'
import type {
  DesignDocument,
  Artboard,
  Layer,
  VectorLayer,
  TextLayer,
  GroupLayer,
  Fill,
  Stroke,
  Segment,
  Path,
  Transform,
  GradientStop,
  Gradient,
  DitheringConfig,
} from '@/types'

/**
 * Parse an SVG string and convert it to a DesignDocument.
 */
export function importSVG(svgString: string): DesignDocument {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')
  const svgEl = doc.querySelector('svg')
  if (!svgEl) throw new Error('No <svg> element found')

  const width = parseFloat(svgEl.getAttribute('width') ?? '800') || 800
  const height = parseFloat(svgEl.getAttribute('height') ?? '600') || 600

  // Parse viewBox if present
  const viewBox = svgEl.getAttribute('viewBox')
  let vbW = width,
    vbH = height
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number)
    if (parts.length === 4) {
      vbW = parts[2]!
      vbH = parts[3]!
    }
  }

  // Parse CSS <style> elements for class-based styling
  const styleMap = parseSVGStyles(svgEl)

  // Parse <defs> for gradients
  const gradientMap = new Map<string, Gradient>()
  for (const defs of svgEl.querySelectorAll('defs')) {
    parseGradientDefs(defs, gradientMap)
  }

  const layers: Layer[] = []
  for (const child of svgEl.children) {
    if (child.tagName === 'defs' || child.tagName === 'style') continue
    const layer = parseSVGElement(child as SVGElement, styleMap, gradientMap)
    if (layer) layers.push(layer)
  }

  const artboard: Artboard = {
    id: uuid(),
    name: 'SVG Import',
    x: 0,
    y: 0,
    width: vbW || width,
    height: vbH || height,
    backgroundColor: '#ffffff',
    layers,
  }

  return {
    id: uuid(),
    metadata: {
      title: 'SVG Import',
      author: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      colorspace: 'srgb',
      width: artboard.width,
      height: artboard.height,
    },
    artboards: [artboard],
    assets: { gradients: [], patterns: [], colors: [] },
  }
}

/**
 * Parse <style> elements inside SVG and return a map of class -> style properties.
 */
export function parseSVGStyles(svgEl: Element): Map<string, Record<string, string>> {
  const styleMap = new Map<string, Record<string, string>>()
  for (const styleEl of svgEl.querySelectorAll('style')) {
    const css = styleEl.textContent ?? ''
    // Simple CSS parser: match .className { property: value; ... }
    const regex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(css)) !== null) {
      const className = match[1]!
      const body = match[2]!
      const props: Record<string, string> = {}
      for (const decl of body.split(';')) {
        const colonIdx = decl.indexOf(':')
        if (colonIdx === -1) continue
        const prop = decl.substring(0, colonIdx).trim()
        const val = decl.substring(colonIdx + 1).trim()
        if (prop && val) props[prop] = val
      }
      styleMap.set(className, props)
    }
  }
  return styleMap
}

function resolveClassStyles(el: SVGElement, styleMap: Map<string, Record<string, string>>): Record<string, string> {
  const classAttr = el.getAttribute('class')
  if (!classAttr) return {}
  const merged: Record<string, string> = {}
  for (const cls of classAttr.split(/\s+/)) {
    const styles = styleMap.get(cls)
    if (styles) Object.assign(merged, styles)
  }
  return merged
}

function parseInlineStyle(el: SVGElement): Record<string, string> {
  const styleAttr = el.getAttribute('style')
  if (!styleAttr) return {}
  const props: Record<string, string> = {}
  for (const decl of styleAttr.split(';')) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) continue
    const prop = decl.substring(0, colonIdx).trim()
    const val = decl.substring(colonIdx + 1).trim()
    if (prop && val) props[prop] = val
  }
  return props
}

/** SVG presentation attributes that inherit from parent elements per the SVG spec. */
const INHERITABLE_ATTRS = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'visibility',
  'direction',
  'letter-spacing',
  'word-spacing',
])

function getStyleAttr(el: SVGElement, attr: string, classStyles: Record<string, string>): string | null {
  // Precedence: inline style > presentation attribute > class style > inherited from ancestors
  const inlineStyles = parseInlineStyle(el)
  const direct = inlineStyles[attr] ?? el.getAttribute(attr) ?? classStyles[attr]
  if (direct != null) return resolveCurrentColor(direct, el)

  // Walk up the tree for inheritable attributes
  if (INHERITABLE_ATTRS.has(attr)) {
    let ancestor = el.parentElement as SVGElement | null
    while (ancestor) {
      const ancestorInline = parseInlineStyle(ancestor)
      const val = ancestorInline[attr] ?? ancestor.getAttribute(attr)
      if (val != null) return resolveCurrentColor(val, el)
      ancestor = ancestor.parentElement as SVGElement | null
    }
  }

  return null
}

/** Resolve `currentColor` to a concrete color value. Walks up the tree for CSS `color`. */
function resolveCurrentColor(value: string, el: SVGElement): string {
  if (value !== 'currentColor') return value
  // Look for an explicit `color` property on the element or its ancestors
  let node: SVGElement | null = el
  while (node) {
    const inline = parseInlineStyle(node)
    const c = inline['color'] ?? node.getAttribute('color')
    if (c && c !== 'currentColor') return c
    node = node.parentElement as SVGElement | null
  }
  // SVG spec: currentColor with no color property defaults to black
  return '#000000'
}

function parseSVGElement(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): Layer | null {
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'g':
      return parseGroup(el, styleMap, gradientMap)
    case 'path':
      return parsePath(el, styleMap, gradientMap)
    case 'rect':
      return parseRect(el, styleMap, gradientMap)
    case 'circle':
      return parseCircle(el, styleMap, gradientMap)
    case 'ellipse':
      return parseEllipse(el, styleMap, gradientMap)
    case 'line':
      return parseLine(el, styleMap, gradientMap)
    case 'polyline':
    case 'polygon':
      return parsePolyShape(el, tag === 'polygon', styleMap, gradientMap)
    case 'text':
      return parseText(el, styleMap)
    default:
      return null
  }
}

function parseGroup(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): GroupLayer {
  const children: Layer[] = []
  for (const child of el.children) {
    const layer = parseSVGElement(child as SVGElement, styleMap, gradientMap)
    if (layer) children.push(layer)
  }

  return {
    id: uuid(),
    name: el.getAttribute('id') ?? 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: parseFloat(el.getAttribute('opacity') ?? '1'),
    blendMode: 'normal',
    transform: parseTransformAttr(el.getAttribute('transform')),
    effects: [],
    children,
  }
}

function makeBaseLayer(el: SVGElement, name: string): Omit<VectorLayer, 'paths' | 'fill' | 'stroke' | 'type'> {
  return {
    id: uuid(),
    name: el.getAttribute('id') ?? name,
    visible: true,
    locked: false,
    opacity: parseFloat(el.getAttribute('opacity') ?? '1'),
    blendMode: 'normal',
    transform: parseTransformAttr(el.getAttribute('transform')),
    effects: [],
  }
}

function parseFill(
  el: SVGElement,
  classStyles: Record<string, string>,
  gradientMap: Map<string, Gradient>,
): Fill | null {
  const fillStr = getStyleAttr(el, 'fill', classStyles)
  if (!fillStr || fillStr === 'none') return null

  // Check for gradient URL reference
  const urlMatch = fillStr.match(/url\(#([^)]+)\)/)
  if (urlMatch) {
    const gradId = urlMatch[1]!
    const grad = gradientMap.get(gradId)
    if (grad) {
      return {
        type: 'gradient',
        gradient: grad,
        opacity: parseFloat(getStyleAttr(el, 'fill-opacity', classStyles) ?? '1'),
      }
    }
  }

  return {
    type: 'solid',
    color: fillStr,
    opacity: parseFloat(getStyleAttr(el, 'fill-opacity', classStyles) ?? '1'),
  }
}

function parseStroke(el: SVGElement, classStyles: Record<string, string>): Stroke | null {
  const strokeStr = getStyleAttr(el, 'stroke', classStyles)
  if (!strokeStr || strokeStr === 'none') return null

  return {
    color: strokeStr,
    width: parseFloat(getStyleAttr(el, 'stroke-width', classStyles) ?? '1'),
    opacity: parseFloat(getStyleAttr(el, 'stroke-opacity', classStyles) ?? '1'),
    position: 'center',
    linecap: (getStyleAttr(el, 'stroke-linecap', classStyles) ?? 'butt') as Stroke['linecap'],
    linejoin: (getStyleAttr(el, 'stroke-linejoin', classStyles) ?? 'miter') as Stroke['linejoin'],
    miterLimit: parseFloat(getStyleAttr(el, 'stroke-miterlimit', classStyles) ?? '4'),
    dasharray: parseDashArray(getStyleAttr(el, 'stroke-dasharray', classStyles)),
  }
}

function parseDashArray(str: string | null): number[] | undefined {
  if (!str || str === 'none') return undefined
  const vals = str
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !isNaN(n))
  return vals.length > 0 ? vals : undefined
}

function parsePath(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const d = el.getAttribute('d') ?? ''
  const segments = parseSVGPathD(d)
  const fillRule = (el.getAttribute('fill-rule') ?? classStyles['fill-rule']) as 'nonzero' | 'evenodd' | undefined

  const path: Path = {
    id: uuid(),
    segments,
    closed: d.toLowerCase().includes('z'),
    fillRule: fillRule === 'evenodd' ? 'evenodd' : undefined,
  }

  return {
    ...makeBaseLayer(el, 'Path'),
    type: 'vector',
    paths: [path],
    fill: parseFill(el, classStyles, gradientMap),
    stroke: parseStroke(el, classStyles),
  }
}

function parseRect(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const x = parseFloat(el.getAttribute('x') ?? '0')
  const y = parseFloat(el.getAttribute('y') ?? '0')
  const w = parseFloat(el.getAttribute('width') ?? '0')
  const h = parseFloat(el.getAttribute('height') ?? '0')
  const rx = parseFloat(el.getAttribute('rx') ?? '0')
  const ry = parseFloat(el.getAttribute('ry') ?? rx.toString())

  let segments: Segment[]
  if (rx > 0 || ry > 0) {
    // Rounded rectangle via arcs
    const r = Math.min(rx, w / 2, h / 2)
    segments = [
      { type: 'move', x: x + r, y },
      { type: 'line', x: x + w - r, y },
      { type: 'arc', x: x + w, y: y + r, rx: r, ry: r, rotation: 0, largeArc: false, sweep: true },
      { type: 'line', x: x + w, y: y + h - r },
      { type: 'arc', x: x + w - r, y: y + h, rx: r, ry: r, rotation: 0, largeArc: false, sweep: true },
      { type: 'line', x: x + r, y: y + h },
      { type: 'arc', x, y: y + h - r, rx: r, ry: r, rotation: 0, largeArc: false, sweep: true },
      { type: 'line', x, y: y + r },
      { type: 'arc', x: x + r, y, rx: r, ry: r, rotation: 0, largeArc: false, sweep: true },
      { type: 'close' },
    ]
  } else {
    segments = [
      { type: 'move', x, y },
      { type: 'line', x: x + w, y },
      { type: 'line', x: x + w, y: y + h },
      { type: 'line', x, y: y + h },
      { type: 'close' },
    ]
  }

  return {
    ...makeBaseLayer(el, 'Rectangle'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed: true }],
    fill: parseFill(el, classStyles, gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'rectangle', width: w, height: h, cornerRadius: rx || undefined },
  }
}

function parseCircle(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const cx = parseFloat(el.getAttribute('cx') ?? '0')
  const cy = parseFloat(el.getAttribute('cy') ?? '0')
  const r = parseFloat(el.getAttribute('r') ?? '0')

  // Approximate circle as 4 cubic Bezier arcs
  const segments = circleToSegments(cx, cy, r, r)

  return {
    ...makeBaseLayer(el, 'Circle'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed: true }],
    fill: parseFill(el, classStyles, gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'ellipse', width: r * 2, height: r * 2 },
  }
}

function parseEllipse(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const cx = parseFloat(el.getAttribute('cx') ?? '0')
  const cy = parseFloat(el.getAttribute('cy') ?? '0')
  const rx = parseFloat(el.getAttribute('rx') ?? '0')
  const ry = parseFloat(el.getAttribute('ry') ?? '0')

  const segments = circleToSegments(cx, cy, rx, ry)

  return {
    ...makeBaseLayer(el, 'Ellipse'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed: true }],
    fill: parseFill(el, classStyles, gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'ellipse', width: rx * 2, height: ry * 2 },
  }
}

function circleToSegments(cx: number, cy: number, rx: number, ry: number): Segment[] {
  // 4 cubic Bezier curves approximation (kappa = 0.5522847498)
  const k = 0.5522847498
  const kx = rx * k
  const ky = ry * k
  return [
    { type: 'move', x: cx + rx, y: cy },
    { type: 'cubic', x: cx, y: cy - ry, cp1x: cx + rx, cp1y: cy - ky, cp2x: cx + kx, cp2y: cy - ry },
    { type: 'cubic', x: cx - rx, y: cy, cp1x: cx - kx, cp1y: cy - ry, cp2x: cx - rx, cp2y: cy - ky },
    { type: 'cubic', x: cx, y: cy + ry, cp1x: cx - rx, cp1y: cy + ky, cp2x: cx - kx, cp2y: cy + ry },
    { type: 'cubic', x: cx + rx, y: cy, cp1x: cx + kx, cp1y: cy + ry, cp2x: cx + rx, cp2y: cy + ky },
    { type: 'close' },
  ]
}

function parseLine(
  el: SVGElement,
  styleMap: Map<string, Record<string, string>>,
  _gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const x1 = parseFloat(el.getAttribute('x1') ?? '0')
  const y1 = parseFloat(el.getAttribute('y1') ?? '0')
  const x2 = parseFloat(el.getAttribute('x2') ?? '0')
  const y2 = parseFloat(el.getAttribute('y2') ?? '0')

  return {
    ...makeBaseLayer(el, 'Line'),
    type: 'vector',
    paths: [
      {
        id: uuid(),
        segments: [
          { type: 'move', x: x1, y: y1 },
          { type: 'line', x: x2, y: y2 },
        ],
        closed: false,
      },
    ],
    fill: null,
    stroke: parseStroke(el, classStyles),
  }
}

function parsePolyShape(
  el: SVGElement,
  closed: boolean,
  styleMap: Map<string, Record<string, string>>,
  gradientMap: Map<string, Gradient>,
): VectorLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const pointsStr = el.getAttribute('points') ?? ''
  const coords = pointsStr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const segments: Segment[] = []

  for (let i = 0; i < coords.length - 1; i += 2) {
    const x = coords[i]!
    const y = coords[i + 1]!
    segments.push(i === 0 ? { type: 'move', x, y } : { type: 'line', x, y })
  }
  if (closed) segments.push({ type: 'close' })

  return {
    ...makeBaseLayer(el, closed ? 'Polygon' : 'Polyline'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed }],
    fill: closed ? parseFill(el, classStyles, gradientMap) : null,
    stroke: parseStroke(el, classStyles),
  }
}

function parseText(el: SVGElement, styleMap: Map<string, Record<string, string>>): TextLayer {
  const classStyles = resolveClassStyles(el, styleMap)
  const x = parseFloat(el.getAttribute('x') ?? '0')
  const y = parseFloat(el.getAttribute('y') ?? '0')
  const text = el.textContent ?? ''

  return {
    id: uuid(),
    name: el.getAttribute('id') ?? 'Text',
    type: 'text',
    visible: true,
    locked: false,
    opacity: parseFloat(el.getAttribute('opacity') ?? '1'),
    blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text,
    fontFamily: getStyleAttr(el, 'font-family', classStyles) ?? 'Arial',
    fontSize: parseFloat(getStyleAttr(el, 'font-size', classStyles) ?? '16'),
    fontWeight: getStyleAttr(el, 'font-weight', classStyles) === 'bold' ? 'bold' : 'normal',
    fontStyle: getStyleAttr(el, 'font-style', classStyles) === 'italic' ? 'italic' : 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: getStyleAttr(el, 'fill', classStyles) ?? '#000000',
  }
}

// --- SVG Path `d` attribute parser ---

export function parseSVGPathD(d: string): Segment[] {
  const segments: Segment[] = []
  // Tokenize: split into commands with their parameters
  const tokens = tokenizePathD(d)
  let cx = 0,
    cy = 0 // current point
  let startX = 0,
    startY = 0 // start of current subpath
  // Track last control point for S/T smooth curve reflection
  let lastCp2x = 0,
    lastCp2y = 0 // last cubic cp2
  let lastQpx = 0,
    lastQpy = 0 // last quadratic cp
  let lastCmd = ''

  for (const token of tokens) {
    const cmd = token.cmd
    const args = token.args
    const isRelative = cmd === cmd.toLowerCase()
    const CMD = cmd.toUpperCase()

    switch (CMD) {
      case 'M': {
        for (let i = 0; i < args.length; i += 2) {
          let x = args[i]!,
            y = args[i + 1]!
          if (isRelative) {
            x += cx
            y += cy
          }
          if (i === 0) {
            segments.push({ type: 'move', x, y })
            startX = x
            startY = y
          } else {
            segments.push({ type: 'line', x, y })
          }
          cx = x
          cy = y
        }
        break
      }
      case 'L': {
        for (let i = 0; i < args.length; i += 2) {
          let x = args[i]!,
            y = args[i + 1]!
          if (isRelative) {
            x += cx
            y += cy
          }
          segments.push({ type: 'line', x, y })
          cx = x
          cy = y
        }
        break
      }
      case 'H': {
        for (const val of args) {
          const x = isRelative ? cx + val : val
          segments.push({ type: 'line', x, y: cy })
          cx = x
        }
        break
      }
      case 'V': {
        for (const val of args) {
          const y = isRelative ? cy + val : val
          segments.push({ type: 'line', x: cx, y })
          cy = y
        }
        break
      }
      case 'C': {
        for (let i = 0; i < args.length; i += 6) {
          let cp1x = args[i]!,
            cp1y = args[i + 1]!
          let cp2x = args[i + 2]!,
            cp2y = args[i + 3]!
          let x = args[i + 4]!,
            y = args[i + 5]!
          if (isRelative) {
            cp1x += cx
            cp1y += cy
            cp2x += cx
            cp2y += cy
            x += cx
            y += cy
          }
          segments.push({ type: 'cubic', x, y, cp1x, cp1y, cp2x, cp2y })
          lastCp2x = cp2x
          lastCp2y = cp2y
          cx = x
          cy = y
        }
        break
      }
      case 'S': {
        // Smooth cubic: reflects previous cp2 to get cp1
        for (let i = 0; i < args.length; i += 4) {
          let cp2x = args[i]!,
            cp2y = args[i + 1]!
          let x = args[i + 2]!,
            y = args[i + 3]!
          if (isRelative) {
            cp2x += cx
            cp2y += cy
            x += cx
            y += cy
          }
          // cp1 is reflection of last cp2 around current point
          let cp1x: number, cp1y: number
          if (lastCmd === 'C' || lastCmd === 'S') {
            cp1x = 2 * cx - lastCp2x
            cp1y = 2 * cy - lastCp2y
          } else {
            cp1x = cx
            cp1y = cy
          }
          segments.push({ type: 'cubic', x, y, cp1x, cp1y, cp2x, cp2y })
          lastCp2x = cp2x
          lastCp2y = cp2y
          cx = x
          cy = y
        }
        break
      }
      case 'Q': {
        for (let i = 0; i < args.length; i += 4) {
          let cpx = args[i]!,
            cpy = args[i + 1]!
          let x = args[i + 2]!,
            y = args[i + 3]!
          if (isRelative) {
            cpx += cx
            cpy += cy
            x += cx
            y += cy
          }
          segments.push({ type: 'quadratic', x, y, cpx, cpy })
          lastQpx = cpx
          lastQpy = cpy
          cx = x
          cy = y
        }
        break
      }
      case 'T': {
        // Smooth quadratic: reflects previous control point
        for (let i = 0; i < args.length; i += 2) {
          let x = args[i]!,
            y = args[i + 1]!
          if (isRelative) {
            x += cx
            y += cy
          }
          let cpx: number, cpy: number
          if (lastCmd === 'Q' || lastCmd === 'T') {
            cpx = 2 * cx - lastQpx
            cpy = 2 * cy - lastQpy
          } else {
            cpx = cx
            cpy = cy
          }
          segments.push({ type: 'quadratic', x, y, cpx, cpy })
          lastQpx = cpx
          lastQpy = cpy
          cx = x
          cy = y
        }
        break
      }
      case 'A': {
        for (let i = 0; i < args.length; i += 7) {
          const rx = args[i]!,
            ry = args[i + 1]!
          const rotation = args[i + 2]!
          const largeArc = args[i + 3]! !== 0
          const sweep = args[i + 4]! !== 0
          let x = args[i + 5]!,
            y = args[i + 6]!
          if (isRelative) {
            x += cx
            y += cy
          }
          segments.push({ type: 'arc', x, y, rx, ry, rotation, largeArc, sweep })
          cx = x
          cy = y
        }
        break
      }
      case 'Z': {
        segments.push({ type: 'close' })
        cx = startX
        cy = startY
        break
      }
    }
    lastCmd = CMD
  }

  return segments
}

interface PathToken {
  cmd: string
  args: number[]
}

/**
 * Tokenize an SVG path `d` string into command+args tokens.
 *
 * Handles tricky SVG path spec edge cases:
 *   - Numbers separated only by a second decimal point: ".5.5" → [0.5, 0.5]
 *   - Arc flag compression: "0 00-4.5-1.5" → [0, 0, 0, -4.5, -1.5]
 *   - Scientific notation: "1e-5"
 *   - Negative sign as separator: "10-20" → [10, -20]
 */
function tokenizePathD(d: string): PathToken[] {
  const tokens: PathToken[] = []
  let i = 0
  const len = d.length
  let currentCmd = ''

  function skipWhitespaceComma() {
    while (i < len && (d[i] === ' ' || d[i] === '\t' || d[i] === '\n' || d[i] === '\r' || d[i] === ',')) i++
  }

  function parseNumber(): number | null {
    skipWhitespaceComma()
    if (i >= len) return null
    const start = i
    // Optional sign
    if (d[i] === '+' || d[i] === '-') i++
    // Integer or decimal part
    let hasDot = false
    let hasDigit = false
    while (i < len && ((d[i]! >= '0' && d[i]! <= '9') || d[i] === '.')) {
      if (d[i] === '.') {
        if (hasDot) break // second dot starts new number
        hasDot = true
      } else {
        hasDigit = true
      }
      i++
    }
    if (!hasDigit && !hasDot) {
      i = start
      return null
    }
    if (!hasDigit) {
      i = start
      return null
    }
    // Optional exponent
    if (i < len && (d[i] === 'e' || d[i] === 'E')) {
      i++
      if (i < len && (d[i] === '+' || d[i] === '-')) i++
      while (i < len && d[i]! >= '0' && d[i]! <= '9') i++
    }
    return parseFloat(d.substring(start, i))
  }

  function parseFlag(): number | null {
    skipWhitespaceComma()
    if (i < len && (d[i] === '0' || d[i] === '1')) {
      return parseInt(d[i++]!)
    }
    return null
  }

  while (i < len) {
    skipWhitespaceComma()
    if (i >= len) break

    const ch = d[i]!
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      currentCmd = ch
      i++
      if (ch === 'Z' || ch === 'z') {
        tokens.push({ cmd: currentCmd, args: [] })
        continue
      }
    }

    // Parse arguments for the current command
    const args: number[] = []
    const isArc = currentCmd === 'A' || currentCmd === 'a'

    if (isArc) {
      // Arc: (rx ry rotation large-arc-flag sweep-flag x y)+
      while (true) {
        const saved = i
        const rx = parseNumber()
        if (rx === null) {
          i = saved
          break
        }
        const ry = parseNumber()
        if (ry === null) {
          i = saved
          break
        }
        const rotation = parseNumber()
        if (rotation === null) {
          i = saved
          break
        }
        const largeArc = parseFlag()
        if (largeArc === null) {
          i = saved
          break
        }
        const sweep = parseFlag()
        if (sweep === null) {
          i = saved
          break
        }
        const x = parseNumber()
        if (x === null) {
          i = saved
          break
        }
        const y = parseNumber()
        if (y === null) {
          i = saved
          break
        }
        args.push(rx, ry, rotation, largeArc, sweep, x, y)
      }
    } else {
      // Non-arc commands: just parse numbers
      while (true) {
        const saved = i
        const n = parseNumber()
        if (n === null) {
          i = saved
          break
        }
        args.push(n)
      }
    }

    if (args.length > 0) {
      tokens.push({ cmd: currentCmd, args })
    }
  }

  return tokens
}

// --- Transform attribute parser ---

/**
 * Parse an SVG transform attribute string into a decomposed Transform.
 * Supports chained transforms: "translate(10,20) rotate(45) scale(2)"
 * All functions are composed left-to-right via matrix multiplication,
 * then decomposed into translate, scale, rotation.
 */
export function parseTransformAttr(attr: string | null): Transform {
  const identity: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
  if (!attr) return identity

  // Accumulate as a 3x2 affine matrix [a, b, c, d, e, f]
  // Represents: | a c e |
  //             | b d f |
  //             | 0 0 1 |
  let m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]

  // Match all transform functions in order
  const fnRegex = /(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^)]*)\)/gi
  let match: RegExpExecArray | null
  while ((match = fnRegex.exec(attr)) !== null) {
    const fn = match[1]!.toLowerCase()
    const nums = match[2]!.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)
    const args = nums ? nums.map(Number) : []

    let fm: [number, number, number, number, number, number]

    switch (fn) {
      case 'translate': {
        const tx = args[0] ?? 0
        const ty = args[1] ?? 0
        fm = [1, 0, 0, 1, tx, ty]
        break
      }
      case 'scale': {
        const sx = args[0] ?? 1
        const sy = args[1] ?? sx
        fm = [sx, 0, 0, sy, 0, 0]
        break
      }
      case 'rotate': {
        const angle = args[0] ?? 0
        const rcx = args[1] ?? 0
        const rcy = args[2] ?? 0
        const rad = (angle * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        if (rcx !== 0 || rcy !== 0) {
          // rotate(a, cx, cy) = translate(cx,cy) * rotate(a) * translate(-cx,-cy)
          fm = [cos, sin, -sin, cos, rcx * (1 - cos) + rcy * sin, rcy * (1 - cos) - rcx * sin]
        } else {
          fm = [cos, sin, -sin, cos, 0, 0]
        }
        break
      }
      case 'skewx': {
        const rad = ((args[0] ?? 0) * Math.PI) / 180
        fm = [1, 0, Math.tan(rad), 1, 0, 0]
        break
      }
      case 'skewy': {
        const rad = ((args[0] ?? 0) * Math.PI) / 180
        fm = [1, Math.tan(rad), 0, 1, 0, 0]
        break
      }
      case 'matrix': {
        fm = [args[0] ?? 1, args[1] ?? 0, args[2] ?? 0, args[3] ?? 1, args[4] ?? 0, args[5] ?? 0]
        break
      }
      default:
        continue
    }

    // Multiply: m = m * fm
    m = multiplyMatrix(m, fm)
  }

  return decomposeMatrix(m)
}

/** Multiply two 3x2 affine matrices. */
function multiplyMatrix(
  a: [number, number, number, number, number, number],
  b: [number, number, number, number, number, number],
): [number, number, number, number, number, number] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/** Decompose a 3x2 affine matrix into translate, scale, rotation. */
function decomposeMatrix(m: [number, number, number, number, number, number]): Transform {
  const [a, b, c, d, e, f] = m
  return {
    x: e,
    y: f,
    scaleX: Math.sqrt(a * a + b * b),
    scaleY: Math.sqrt(c * c + d * d),
    rotation: Math.atan2(b, a) * (180 / Math.PI),
  }
}

// --- Gradient defs parser ---

function parseGradientDefs(defs: Element, gradientMap: Map<string, Gradient>) {
  for (const el of defs.querySelectorAll('linearGradient')) {
    const id = el.getAttribute('id')
    if (!id) continue
    const stops = parseGradientStops(el)
    const defaultDithering: DitheringConfig = { enabled: false, algorithm: 'none', strength: 0, seed: 0 }

    gradientMap.set(id, {
      id,
      name: id,
      type: 'linear',
      x: parseFloat(el.getAttribute('x1') ?? '0'),
      y: parseFloat(el.getAttribute('y1') ?? '0'),
      angle: 0,
      stops,
      dithering: defaultDithering,
    })
  }

  for (const el of defs.querySelectorAll('radialGradient')) {
    const id = el.getAttribute('id')
    if (!id) continue
    const stops = parseGradientStops(el)
    const defaultDithering: DitheringConfig = { enabled: false, algorithm: 'none', strength: 0, seed: 0 }

    gradientMap.set(id, {
      id,
      name: id,
      type: 'radial',
      x: parseFloat(el.getAttribute('cx') ?? '0.5'),
      y: parseFloat(el.getAttribute('cy') ?? '0.5'),
      radius: parseFloat(el.getAttribute('r') ?? '0.5'),
      stops,
      dithering: defaultDithering,
    })
  }
}

function parseGradientStops(el: Element): GradientStop[] {
  const stops: GradientStop[] = []
  for (const stop of el.querySelectorAll('stop')) {
    const offsetStr = stop.getAttribute('offset') ?? '0'
    // Normalize percentage values (e.g. "40%" → 0.4) to 0–1 range
    let offset = parseFloat(offsetStr)
    if (offsetStr.includes('%')) {
      offset /= 100
    }
    const color = stop.getAttribute('stop-color') ?? '#000000'
    const opacity = parseFloat(stop.getAttribute('stop-opacity') ?? '1')
    stops.push({ offset, color, opacity })
  }
  return stops
}

/**
 * Import an SVG file from a File object.
 */
export async function importSVGFile(file: File): Promise<DesignDocument> {
  const text = await file.text()
  return importSVG(text)
}
