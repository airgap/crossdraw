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
 * Structured CSS selector entry parsed from <style> blocks.
 * Supports class (.cls), element (rect), ID (#myId), and descendant (g rect) selectors.
 */
export interface CSSRule {
  /** Original selector string for debugging. */
  selector: string
  /** Type of selector match strategy. */
  type: 'class' | 'element' | 'id' | 'descendant'
  /** For class selectors: the class name (without dot). */
  className?: string
  /** For element selectors: the tag name (lowercased). */
  tagName?: string
  /** For ID selectors: the id (without hash). */
  idName?: string
  /**
   * For descendant selectors: the ancestor tag and the descendant tag.
   * We use simplified matching: the last part determines the target element,
   * and we check that any ancestor matches the first part.
   */
  ancestorTag?: string
  descendantTag?: string
  /** Also support descendant with class or id as the last part. */
  descendantClass?: string
  descendantId?: string
  /** The CSS properties. */
  properties: Record<string, string>
}

/**
 * Internal context passed through all parsing functions to avoid
 * threading many maps through every call site.
 */
interface ParseContext {
  styleMap: Map<string, Record<string, string>>
  gradientMap: Map<string, Gradient>
  symbolMap: Map<string, Element>
  elementByIdMap: Map<string, Element>
  clipPathMap: Map<string, Element>
  maskMap: Map<string, Element>
}

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

  // Parse <defs> for gradients, symbols, clipPaths, and masks
  const gradientMap = new Map<string, Gradient>()
  const symbolMap = new Map<string, Element>()
  const clipPathMap = new Map<string, Element>()
  const maskMap = new Map<string, Element>()
  for (const defs of svgEl.querySelectorAll('defs')) {
    parseGradientDefs(defs, gradientMap)
    parseSymbolDefs(defs, symbolMap)
    parseClipPathDefs(defs, clipPathMap)
    parseMaskDefs(defs, maskMap)
  }
  // Also collect top-level <symbol> elements (they can appear outside <defs>)
  for (const sym of svgEl.querySelectorAll('symbol')) {
    const id = sym.getAttribute('id')
    if (id && !symbolMap.has(id)) symbolMap.set(id, sym)
  }

  // Build a map of all elements by id for <use> referencing non-symbol elements
  const elementByIdMap = new Map<string, Element>()
  for (const el of svgEl.querySelectorAll('[id]')) {
    const id = el.getAttribute('id')
    if (id) elementByIdMap.set(id, el)
  }

  const ctx: ParseContext = { styleMap, gradientMap, symbolMap, elementByIdMap, clipPathMap, maskMap }

  const layers: Layer[] = []
  for (const child of svgEl.children) {
    if (child.tagName === 'defs' || child.tagName === 'style') continue
    const layer = parseSVGElement(child as SVGElement, ctx)
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
  let node: SVGElement | null = el
  while (node) {
    const inline = parseInlineStyle(node)
    const c = inline['color'] ?? node.getAttribute('color')
    if (c && c !== 'currentColor') return c
    node = node.parentElement as SVGElement | null
  }
  return '#000000'
}

/**
 * Extract the referenced id from a url(#id) attribute value.
 */
function extractUrlId(value: string | null): string | null {
  if (!value) return null
  const m = value.match(/url\(\s*#([^)]+)\s*\)/)
  return m ? m[1]! : null
}

/**
 * Resolve a clip-path or mask reference on an element and attach it to the layer.
 */
function applyClipAndMask(el: SVGElement, layer: Layer, ctx: ParseContext): void {
  const clipPathAttr = el.getAttribute('clip-path') ?? parseInlineStyle(el)['clip-path'] ?? null
  const clipId = extractUrlId(clipPathAttr)
  if (clipId) {
    const clipEl = ctx.clipPathMap.get(clipId)
    if (clipEl) {
      const maskLayer = parseClipOrMaskElement(clipEl, ctx)
      if (maskLayer) {
        layer.mask = maskLayer
      }
    }
  }

  const maskAttr = el.getAttribute('mask') ?? parseInlineStyle(el)['mask'] ?? null
  const maskId = extractUrlId(maskAttr)
  if (maskId) {
    const maskEl = ctx.maskMap.get(maskId)
    if (maskEl) {
      const maskLayer = parseClipOrMaskElement(maskEl, ctx)
      if (maskLayer) {
        layer.mask = maskLayer
      }
    }
  }
}

/**
 * Parse a <clipPath> or <mask> element's children into a single Layer
 * suitable for use as the `mask` field on BaseLayer.
 */
function parseClipOrMaskElement(el: Element, ctx: ParseContext): Layer | null {
  const children: Layer[] = []
  for (const child of el.children) {
    const childTag = child.tagName.toLowerCase()
    if (childTag === 'desc' || childTag === 'title' || childTag === 'metadata') continue
    const layer = parseSVGElement(child as SVGElement, ctx)
    if (layer) children.push(layer)
  }

  if (children.length === 0) return null
  if (children.length === 1) return children[0]!

  return {
    id: uuid(),
    name: el.getAttribute('id') ?? 'Clip/Mask',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children,
  } as GroupLayer
}

function parseSVGElement(el: SVGElement, ctx: ParseContext): Layer | null {
  const tag = el.tagName.toLowerCase()

  let layer: Layer | null = null
  switch (tag) {
    case 'g':
      layer = parseGroup(el, ctx)
      break
    case 'path':
      layer = parsePath(el, ctx)
      break
    case 'rect':
      layer = parseRect(el, ctx)
      break
    case 'circle':
      layer = parseCircle(el, ctx)
      break
    case 'ellipse':
      layer = parseEllipse(el, ctx)
      break
    case 'line':
      layer = parseLine(el, ctx)
      break
    case 'polyline':
    case 'polygon':
      layer = parsePolyShape(el, tag === 'polygon', ctx)
      break
    case 'text':
      layer = parseText(el, ctx)
      break
    case 'use':
      layer = parseUse(el, ctx)
      break
    default:
      return null
  }

  if (layer) {
    applyClipAndMask(el, layer, ctx)
  }

  return layer
}

function parseGroup(el: SVGElement, ctx: ParseContext): GroupLayer | null {
  const children: Layer[] = []
  for (const child of el.children) {
    const layer = parseSVGElement(child as SVGElement, ctx)
    if (layer) children.push(layer)
  }

  if (children.length === 0) return null

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

function parsePath(el: SVGElement, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
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
    fill: parseFill(el, classStyles, ctx.gradientMap),
    stroke: parseStroke(el, classStyles),
  }
}

function parseRect(el: SVGElement, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
  const x = parseFloat(el.getAttribute('x') ?? '0')
  const y = parseFloat(el.getAttribute('y') ?? '0')
  const w = parseFloat(el.getAttribute('width') ?? '0')
  const h = parseFloat(el.getAttribute('height') ?? '0')
  const rx = parseFloat(el.getAttribute('rx') ?? '0')
  const ry = parseFloat(el.getAttribute('ry') ?? rx.toString())

  let segments: Segment[]
  if (rx > 0 || ry > 0) {
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
    fill: parseFill(el, classStyles, ctx.gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'rectangle', width: w, height: h, cornerRadius: rx || undefined },
  }
}

function parseCircle(el: SVGElement, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
  const cx = parseFloat(el.getAttribute('cx') ?? '0')
  const cy = parseFloat(el.getAttribute('cy') ?? '0')
  const r = parseFloat(el.getAttribute('r') ?? '0')

  const segments = circleToSegments(cx, cy, r, r)

  return {
    ...makeBaseLayer(el, 'Circle'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed: true }],
    fill: parseFill(el, classStyles, ctx.gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'ellipse', width: r * 2, height: r * 2 },
  }
}

function parseEllipse(el: SVGElement, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
  const cx = parseFloat(el.getAttribute('cx') ?? '0')
  const cy = parseFloat(el.getAttribute('cy') ?? '0')
  const rx = parseFloat(el.getAttribute('rx') ?? '0')
  const ry = parseFloat(el.getAttribute('ry') ?? '0')

  const segments = circleToSegments(cx, cy, rx, ry)

  return {
    ...makeBaseLayer(el, 'Ellipse'),
    type: 'vector',
    paths: [{ id: uuid(), segments, closed: true }],
    fill: parseFill(el, classStyles, ctx.gradientMap),
    stroke: parseStroke(el, classStyles),
    shapeParams: { shapeType: 'ellipse', width: rx * 2, height: ry * 2 },
  }
}

function circleToSegments(cx: number, cy: number, rx: number, ry: number): Segment[] {
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

function parseLine(el: SVGElement, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
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

function parsePolyShape(el: SVGElement, closed: boolean, ctx: ParseContext): VectorLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
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
    fill: closed ? parseFill(el, classStyles, ctx.gradientMap) : null,
    stroke: parseStroke(el, classStyles),
  }
}

function parseText(el: SVGElement, ctx: ParseContext): TextLayer {
  const classStyles = resolveClassStyles(el, ctx.styleMap)
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

// --- <use> / <symbol> support ---

/**
 * Parse <symbol> definitions from a <defs> element and store them in the map.
 */
function parseSymbolDefs(defs: Element, symbolMap: Map<string, Element>): void {
  for (const sym of defs.querySelectorAll('symbol')) {
    const id = sym.getAttribute('id')
    if (id) symbolMap.set(id, sym)
  }
}

/**
 * Parse a <use> element by resolving its href to a <symbol> or any other element,
 * cloning the referenced element's content, and applying the <use> element's
 * x/y/width/height as transform offsets (and viewBox scaling for symbols).
 */
function parseUse(el: SVGElement, ctx: ParseContext): Layer | null {
  // Resolve the referenced element id from href or xlink:href
  const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
  if (!href) return null
  const refId = href.startsWith('#') ? href.slice(1) : href

  // Positional offsets from the <use> element
  const useX = parseFloat(el.getAttribute('x') ?? '0')
  const useY = parseFloat(el.getAttribute('y') ?? '0')
  const useWidth = el.getAttribute('width') ? parseFloat(el.getAttribute('width')!) : null
  const useHeight = el.getAttribute('height') ? parseFloat(el.getAttribute('height')!) : null

  // Check if reference is a <symbol>
  const symbolEl = ctx.symbolMap.get(refId)
  if (symbolEl) {
    return parseUseSymbol(el, symbolEl, useX, useY, useWidth, useHeight, ctx)
  }

  // Otherwise look up any element by id (g, rect, path, circle, etc.)
  const refEl = ctx.elementByIdMap.get(refId)
  if (!refEl) return null

  return parseUseElement(el, refEl as SVGElement, useX, useY, ctx)
}

/**
 * Handle <use> referencing a <symbol>.
 */
function parseUseSymbol(
  useEl: SVGElement,
  symbolEl: Element,
  useX: number,
  useY: number,
  useWidth: number | null,
  useHeight: number | null,
  ctx: ParseContext,
): GroupLayer {
  const children: Layer[] = []
  for (const child of symbolEl.children) {
    const childTag = child.tagName.toLowerCase()
    if (childTag === 'desc' || childTag === 'title' || childTag === 'metadata') continue
    const layer = parseSVGElement(child as SVGElement, ctx)
    if (layer) children.push(layer)
  }

  const useTransform = parseTransformAttr(useEl.getAttribute('transform'))

  // Check for viewBox on the symbol to compute scaling
  const viewBox = symbolEl.getAttribute('viewBox')
  let scaleX = 1
  let scaleY = 1
  if (viewBox && (useWidth !== null || useHeight !== null)) {
    const vbParts = viewBox.split(/[\s,]+/).map(Number)
    if (vbParts.length === 4) {
      const vbW = vbParts[2]!
      const vbH = vbParts[3]!
      if (vbW > 0 && useWidth !== null) scaleX = useWidth / vbW
      if (vbH > 0 && useHeight !== null) scaleY = useHeight / vbH
    }
  }

  const finalTransform: Transform = {
    x: useTransform.x + useX,
    y: useTransform.y + useY,
    scaleX: useTransform.scaleX * scaleX,
    scaleY: useTransform.scaleY * scaleY,
    rotation: useTransform.rotation,
  }
  if (useTransform.skewX) finalTransform.skewX = useTransform.skewX
  if (useTransform.skewY) finalTransform.skewY = useTransform.skewY

  return {
    id: uuid(),
    name: useEl.getAttribute('id') ?? symbolEl.getAttribute('id') ?? 'Symbol Instance',
    type: 'group',
    visible: true,
    locked: false,
    opacity: parseFloat(useEl.getAttribute('opacity') ?? '1'),
    blendMode: 'normal',
    transform: finalTransform,
    effects: [],
    children,
  }
}

/**
 * Handle <use> referencing a regular element (g, rect, path, etc.).
 */
function parseUseElement(
  useEl: SVGElement,
  refEl: SVGElement,
  useX: number,
  useY: number,
  ctx: ParseContext,
): Layer | null {
  const layer = parseSVGElement(refEl, ctx)
  if (!layer) return null

  const cloned = deepCloneLayer(layer)

  const useTransform = parseTransformAttr(useEl.getAttribute('transform'))
  cloned.transform = {
    x: cloned.transform.x + useX + useTransform.x,
    y: cloned.transform.y + useY + useTransform.y,
    scaleX: cloned.transform.scaleX * useTransform.scaleX,
    scaleY: cloned.transform.scaleY * useTransform.scaleY,
    rotation: cloned.transform.rotation + useTransform.rotation,
  }

  const useId = useEl.getAttribute('id')
  if (useId) cloned.name = useId

  const useOpacity = useEl.getAttribute('opacity')
  if (useOpacity) cloned.opacity = parseFloat(useOpacity)

  return cloned
}

/**
 * Deep clone a Layer, assigning fresh UUIDs to it and all nested children/paths.
 */
function deepCloneLayer(layer: Layer): Layer {
  const cloned = { ...layer, id: uuid() }

  if (cloned.type === 'group') {
    ;(cloned as GroupLayer).children = (cloned as GroupLayer).children.map((c) => deepCloneLayer(c))
  }
  if (cloned.type === 'vector') {
    ;(cloned as VectorLayer).paths = (cloned as VectorLayer).paths.map((p) => ({
      ...p,
      id: uuid(),
      segments: [...p.segments],
    }))
  }
  if (cloned.mask) {
    cloned.mask = deepCloneLayer(cloned.mask)
  }

  return cloned
}

// --- <clipPath> / <mask> defs parsing ---

function parseClipPathDefs(defs: Element, clipPathMap: Map<string, Element>): void {
  for (const cp of defs.querySelectorAll('clipPath')) {
    const id = cp.getAttribute('id')
    if (id) clipPathMap.set(id, cp)
  }
}

function parseMaskDefs(defs: Element, maskMap: Map<string, Element>): void {
  for (const m of defs.querySelectorAll('mask')) {
    const id = m.getAttribute('id')
    if (id) maskMap.set(id, m)
  }
}

// --- SVG Path `d` attribute parser ---

export function parseSVGPathD(d: string): Segment[] {
  const segments: Segment[] = []
  const tokens = tokenizePathD(d)
  let cx = 0,
    cy = 0
  let startX = 0,
    startY = 0
  let lastCp2x = 0,
    lastCp2y = 0
  let lastQpx = 0,
    lastQpy = 0
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
    if (d[i] === '+' || d[i] === '-') i++
    let hasDot = false
    let hasDigit = false
    while (i < len && ((d[i]! >= '0' && d[i]! <= '9') || d[i] === '.')) {
      if (d[i] === '.') {
        if (hasDot) break
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

    const args: number[] = []
    const isArc = currentCmd === 'A' || currentCmd === 'a'

    if (isArc) {
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

export function parseTransformAttr(attr: string | null): Transform {
  const identity: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
  if (!attr) return identity

  let m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]

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

    m = multiplyMatrix(m, fm)
  }

  return decomposeMatrix(m)
}

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

function decomposeMatrix(m: [number, number, number, number, number, number]): Transform {
  const [a, b, c, d, e, f] = m

  const scaleX = Math.sqrt(a * a + b * b)
  const rotation = Math.atan2(b, a)

  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const rc = cos * c + sin * d
  const rd = -sin * c + cos * d
  const scaleY = rd
  const skewX = scaleY !== 0 ? Math.atan(rc / scaleY) * (180 / Math.PI) : 0

  const result: Transform = {
    x: e,
    y: f,
    scaleX,
    scaleY: Math.abs(scaleY),
    rotation: rotation * (180 / Math.PI),
  }

  if (Math.abs(skewX) > 1e-6) {
    result.skewX = skewX
  }

  return result
}

// --- Gradient defs parser ---
// --- Gradient defs parser ---

function parseGradientDefs(defs: Element, gradientMap: Map<string, Gradient>) {
  // First pass: collect all gradient elements without resolving inheritance
  const rawGradients = new Map<string, { el: Element; type: 'linear' | 'radial' }>()

  for (const el of defs.querySelectorAll('linearGradient')) {
    const id = el.getAttribute('id')
    if (!id) continue
    rawGradients.set(id, { el, type: 'linear' })
  }

  for (const el of defs.querySelectorAll('radialGradient')) {
    const id = el.getAttribute('id')
    if (!id) continue
    rawGradients.set(id, { el, type: 'radial' })
  }

  // Second pass: resolve inheritance and build gradient objects
  for (const [id, { el, type }] of rawGradients) {
    resolveGradient(id, el, type, rawGradients, gradientMap)
  }
}

/**
 * Resolve a gradient, following href/xlink:href inheritance chains.
 * Caches the result in gradientMap to avoid re-resolving.
 */
function resolveGradient(
  id: string,
  el: Element,
  type: 'linear' | 'radial',
  rawGradients: Map<string, { el: Element; type: 'linear' | 'radial' }>,
  gradientMap: Map<string, Gradient>,
): Gradient {
  // Already resolved
  const cached = gradientMap.get(id)
  if (cached) return cached

  const defaultDithering: DitheringConfig = { enabled: false, algorithm: 'none', strength: 0, seed: 0 }

  // Resolve inheritance via href or xlink:href
  let inherited: Gradient | null = null
  const href = el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
  if (href && href.startsWith('#')) {
    const refId = href.slice(1)
    const ref = rawGradients.get(refId)
    if (ref && refId !== id) {
      inherited = resolveGradient(refId, ref.el, ref.type, rawGradients, gradientMap)
    }
  }

  // Parse stops — use own stops if present, otherwise inherit
  let stops = parseGradientStops(el)
  if (stops.length === 0 && inherited) {
    stops = [...inherited.stops]
  }

  // Parse gradientUnits
  const unitsAttr = el.getAttribute('gradientUnits')
  const gradientUnits: 'objectBoundingBox' | 'userSpaceOnUse' | undefined =
    unitsAttr === 'userSpaceOnUse'
      ? 'userSpaceOnUse'
      : unitsAttr === 'objectBoundingBox'
        ? 'objectBoundingBox'
        : inherited?.gradientUnits

  // Parse gradientTransform
  const gtAttr = el.getAttribute('gradientTransform')
  let gradientTransform = inherited?.gradientTransform
  if (gtAttr) {
    const parsed = parseTransformAttr(gtAttr)
    gradientTransform = {
      rotate: parsed.rotation !== 0 ? parsed.rotation : undefined,
      scaleX: parsed.scaleX !== 1 ? parsed.scaleX : undefined,
      scaleY: parsed.scaleY !== 1 ? parsed.scaleY : undefined,
      translateX: parsed.x !== 0 ? parsed.x : undefined,
      translateY: parsed.y !== 0 ? parsed.y : undefined,
    }
    // Clean up if all values are undefined
    if (
      gradientTransform.rotate === undefined &&
      gradientTransform.scaleX === undefined &&
      gradientTransform.scaleY === undefined &&
      gradientTransform.translateX === undefined &&
      gradientTransform.translateY === undefined
    ) {
      gradientTransform = undefined
    }
  }

  let gradient: Gradient

  if (type === 'linear') {
    // Parse x1, y1, x2, y2 — fall back to inherited values, then SVG defaults
    const x1 = parseFloatAttr(el, 'x1') ?? inherited?.x ?? 0
    const y1 = parseFloatAttr(el, 'y1') ?? inherited?.y ?? 0
    const x2 = parseFloatAttr(el, 'x2') ?? 1
    const y2 = parseFloatAttr(el, 'y2') ?? 0

    // Compute angle from the direction vector (x1,y1) -> (x2,y2)
    const dx = x2 - x1
    const dy = y2 - y1
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)

    gradient = {
      id,
      name: id,
      type: 'linear',
      x: x1,
      y: y1,
      angle,
      stops,
      dithering: defaultDithering,
      ...(gradientUnits ? { gradientUnits } : {}),
      ...(gradientTransform ? { gradientTransform } : {}),
    }
  } else {
    // radialGradient
    const cx = parseFloatAttr(el, 'cx') ?? inherited?.x ?? 0.5
    const cy = parseFloatAttr(el, 'cy') ?? inherited?.y ?? 0.5
    const r = parseFloatAttr(el, 'r') ?? inherited?.radius ?? 0.5

    // Focal point: fx/fy default to cx/cy per SVG spec
    const fx = parseFloatAttr(el, 'fx') ?? cx
    const fy = parseFloatAttr(el, 'fy') ?? cy

    gradient = {
      id,
      name: id,
      type: 'radial',
      x: fx,
      y: fy,
      radius: r,
      stops,
      dithering: defaultDithering,
      ...(gradientUnits ? { gradientUnits } : {}),
      ...(gradientTransform ? { gradientTransform } : {}),
    }
  }

  gradientMap.set(id, gradient)
  return gradient
}

/** Parse a float attribute, returning null if not present. */
function parseFloatAttr(el: Element, attr: string): number | null {
  const val = el.getAttribute(attr)
  if (val === null) return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function parseGradientStops(el: Element): GradientStop[] {
  const stops: GradientStop[] = []
  for (const stop of el.querySelectorAll('stop')) {
    const offsetStr = stop.getAttribute('offset') ?? '0'
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
