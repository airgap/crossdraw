/**
 * Figma clipboard/JSON import.
 *
 * When users copy layers in Figma and paste them, the clipboard contains
 * a JSON representation of the node tree. This module parses that JSON
 * and converts Figma node types into Crossdraw layers.
 *
 * Supported Figma node types:
 *   FRAME, GROUP, RECTANGLE, ELLIPSE, LINE, POLYGON, STAR,
 *   TEXT, COMPONENT, INSTANCE, VECTOR, BOOLEAN_OPERATION
 *
 * Also handles: fills, strokes, effects, auto-layout, constraints.
 */

import { v4 as uuid } from 'uuid'
import type {
  DesignDocument,
  Layer,
  VectorLayer,
  TextLayer,
  GroupLayer,
  SymbolInstanceLayer,
  Fill,
  Stroke,
  Segment,
  Path,
  Transform,
  Effect,
  BlendMode,
  GradientStop,
  Gradient,
  DitheringConfig,
  AutoLayoutConfig,
} from '@/types'
import { generateRectangle, generateEllipse, generatePolygon, generateStar } from '@/tools/shapes'

// ── Figma JSON types ─────────────────────────────────────────────────────────

interface FigmaColor {
  r: number // 0-1
  g: number // 0-1
  b: number // 0-1
  a: number // 0-1
}

interface FigmaGradientStop {
  position: number
  color: FigmaColor
}

interface FigmaGradientHandlePosition {
  x: number
  y: number
}

interface FigmaPaint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI'
  visible?: boolean
  opacity?: number
  color?: FigmaColor
  gradientStops?: FigmaGradientStop[]
  gradientHandlePositions?: FigmaGradientHandlePosition[]
  scaleMode?: string
  imageRef?: string
  blendMode?: string
}

interface FigmaStroke extends FigmaPaint {
  // Inherited from FigmaPaint
}

interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean
  radius: number
  color?: FigmaColor
  offset?: { x: number; y: number }
  spread?: number
  blendMode?: string
}

interface FigmaConstraints {
  horizontal: 'LEFT' | 'RIGHT' | 'LEFT_RIGHT' | 'CENTER' | 'SCALE'
  vertical: 'TOP' | 'BOTTOM' | 'TOP_BOTTOM' | 'CENTER' | 'SCALE'
}

interface FigmaTypeStyle {
  fontFamily?: string
  fontPostScriptName?: string
  fontSize?: number
  fontWeight?: number
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM'
  letterSpacing?: number
  lineHeightPx?: number
  lineHeightPercent?: number
  textDecoration?: 'NONE' | 'UNDERLINE' | 'STRIKETHROUGH'
  textCase?: 'ORIGINAL' | 'UPPER' | 'LOWER' | 'TITLE'
  italic?: boolean
}

interface FigmaNode {
  id: string
  name: string
  type: string
  visible?: boolean
  locked?: boolean
  opacity?: number
  blendMode?: string
  // Geometry
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  relativeTransform?: [[number, number, number], [number, number, number]]
  size?: { x: number; y: number }
  // Style
  fills?: FigmaPaint[]
  strokes?: FigmaStroke[]
  strokeWeight?: number
  strokeAlign?: 'INSIDE' | 'OUTSIDE' | 'CENTER'
  strokeCap?: 'NONE' | 'ROUND' | 'SQUARE'
  strokeJoin?: 'MITER' | 'BEVEL' | 'ROUND'
  strokeMiterAngle?: number
  strokeDashes?: number[]
  effects?: FigmaEffect[]
  // Shape-specific
  cornerRadius?: number
  rectangleCornerRadii?: [number, number, number, number]
  arcData?: { startingAngle: number; endingAngle: number; innerRadius: number }
  pointCount?: number
  innerRadius?: number
  // Children
  children?: FigmaNode[]
  // Text
  characters?: string
  style?: FigmaTypeStyle
  // Component
  componentId?: string
  // Auto-layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL'
  primaryAxisSizingMode?: string
  counterAxisSizingMode?: string
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  itemSpacing?: number
  layoutWrap?: string
  // Constraints
  constraints?: FigmaConstraints
  // Layout sizing
  layoutSizingHorizontal?: 'FIXED' | 'FILL' | 'HUG'
  layoutSizingVertical?: 'FIXED' | 'FILL' | 'HUG'
  // Vector paths
  fillGeometry?: Array<{ path: string; windingRule: string }>
  strokeGeometry?: Array<{ path: string; windingRule: string }>
}

// ── Blend mode mapping ───────────────────────────────────────────────────────

const FIGMA_BLEND_MODE_MAP: Record<string, BlendMode> = {
  PASS_THROUGH: 'normal',
  NORMAL: 'normal',
  DARKEN: 'darken',
  MULTIPLY: 'multiply',
  COLOR_BURN: 'color-burn',
  LIGHTEN: 'lighten',
  SCREEN: 'screen',
  COLOR_DODGE: 'color-dodge',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft-light',
  HARD_LIGHT: 'hard-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
  HUE: 'hue',
  SATURATION: 'saturation',
  COLOR: 'color',
  LUMINOSITY: 'luminosity',
}

// ── Color conversion ─────────────────────────────────────────────────────────

function figmaColorToHex(c: FigmaColor): string {
  const r = Math.round(Math.max(0, Math.min(1, c.r)) * 255)
  const g = Math.round(Math.max(0, Math.min(1, c.g)) * 255)
  const b = Math.round(Math.max(0, Math.min(1, c.b)) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function figmaColorAlpha(c: FigmaColor): number {
  return Math.max(0, Math.min(1, c.a))
}

// ── Default dithering config ─────────────────────────────────────────────────

function defaultDithering(): DitheringConfig {
  return { enabled: false, algorithm: 'none', strength: 0, seed: 0 }
}

// ── Fill conversion ──────────────────────────────────────────────────────────

function convertFigmaFill(paint: FigmaPaint): Fill | null {
  if (paint.visible === false) return null

  if (paint.type === 'SOLID' && paint.color) {
    return {
      type: 'solid',
      color: figmaColorToHex(paint.color),
      opacity: (paint.opacity ?? 1) * figmaColorAlpha(paint.color),
    }
  }

  if (
    (paint.type === 'GRADIENT_LINEAR' ||
      paint.type === 'GRADIENT_RADIAL' ||
      paint.type === 'GRADIENT_ANGULAR' ||
      paint.type === 'GRADIENT_DIAMOND') &&
    paint.gradientStops
  ) {
    return {
      type: 'gradient',
      gradient: convertFigmaGradient(paint),
      opacity: paint.opacity ?? 1,
    }
  }

  // IMAGE or unsupported — skip
  return null
}

function convertFigmaGradient(paint: FigmaPaint): Gradient {
  const typeMap: Record<string, 'linear' | 'radial' | 'conical'> = {
    GRADIENT_LINEAR: 'linear',
    GRADIENT_RADIAL: 'radial',
    GRADIENT_ANGULAR: 'conical',
    GRADIENT_DIAMOND: 'radial',
  }

  const handles = paint.gradientHandlePositions ?? []
  const p0 = handles[0] ?? { x: 0, y: 0 }
  const p1 = handles[1] ?? { x: 1, y: 1 }

  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)

  const stops: GradientStop[] = (paint.gradientStops ?? []).map((stop) => ({
    offset: stop.position,
    color: figmaColorToHex(stop.color),
    opacity: figmaColorAlpha(stop.color),
  }))

  return {
    id: uuid(),
    name: 'Figma Gradient',
    type: typeMap[paint.type] ?? 'linear',
    angle,
    x: p0.x,
    y: p0.y,
    stops,
    dithering: defaultDithering(),
  }
}

// ── Stroke conversion ────────────────────────────────────────────────────────

function convertFigmaStroke(node: FigmaNode): Stroke | null {
  if (!node.strokes || node.strokes.length === 0) return null

  // Take the first visible stroke
  const paint = node.strokes.find((s) => s.visible !== false)
  if (!paint) return null

  const color = paint.color ? figmaColorToHex(paint.color) : '#000000'
  const opacity = (paint.opacity ?? 1) * (paint.color ? figmaColorAlpha(paint.color) : 1)

  const posMap: Record<string, 'center' | 'inside' | 'outside'> = {
    INSIDE: 'inside',
    OUTSIDE: 'outside',
    CENTER: 'center',
  }

  const capMap: Record<string, 'butt' | 'round' | 'square'> = {
    NONE: 'butt',
    ROUND: 'round',
    SQUARE: 'square',
  }

  const joinMap: Record<string, 'miter' | 'bevel' | 'round'> = {
    MITER: 'miter',
    BEVEL: 'bevel',
    ROUND: 'round',
  }

  return {
    width: node.strokeWeight ?? 1,
    color,
    opacity,
    position: posMap[node.strokeAlign ?? 'CENTER'] ?? 'center',
    linecap: capMap[node.strokeCap ?? 'NONE'] ?? 'butt',
    linejoin: joinMap[node.strokeJoin ?? 'MITER'] ?? 'miter',
    miterLimit: node.strokeMiterAngle ?? 4,
    dasharray: node.strokeDashes && node.strokeDashes.length > 0 ? node.strokeDashes : undefined,
  }
}

// ── Effect conversion ────────────────────────────────────────────────────────

function convertFigmaEffect(effect: FigmaEffect): Effect | null {
  if (effect.visible === false) return null

  if (effect.type === 'DROP_SHADOW' && effect.color) {
    return {
      id: uuid(),
      type: 'drop-shadow',
      enabled: true,
      opacity: figmaColorAlpha(effect.color),
      params: {
        kind: 'shadow',
        offsetX: effect.offset?.x ?? 0,
        offsetY: effect.offset?.y ?? 0,
        blurRadius: effect.radius,
        spread: effect.spread ?? 0,
        color: figmaColorToHex(effect.color),
        opacity: figmaColorAlpha(effect.color),
      },
    }
  }

  if (effect.type === 'INNER_SHADOW' && effect.color) {
    return {
      id: uuid(),
      type: 'inner-shadow',
      enabled: true,
      opacity: figmaColorAlpha(effect.color),
      params: {
        kind: 'inner-shadow',
        offsetX: effect.offset?.x ?? 0,
        offsetY: effect.offset?.y ?? 0,
        blurRadius: effect.radius,
        color: figmaColorToHex(effect.color),
        opacity: figmaColorAlpha(effect.color),
      },
    }
  }

  if (effect.type === 'LAYER_BLUR') {
    return {
      id: uuid(),
      type: 'blur',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'blur',
        radius: effect.radius,
        quality: 'medium',
      },
    }
  }

  if (effect.type === 'BACKGROUND_BLUR') {
    return {
      id: uuid(),
      type: 'background-blur',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'background-blur',
        radius: effect.radius,
      },
    }
  }

  return null
}

function collectFigmaEffects(node: FigmaNode): Effect[] {
  if (!node.effects) return []
  return node.effects
    .map(convertFigmaEffect)
    .filter((e): e is Effect => e !== null)
}

// ── Transform from Figma's relative transform ────────────────────────────────

function buildFigmaTransform(node: FigmaNode): Transform {
  if (node.relativeTransform) {
    const [[a, b, tx], [c, d, ty]] = node.relativeTransform
    // Extract rotation from the 2x2 matrix
    const rotation = Math.atan2(c, a) * (180 / Math.PI)
    // Extract scale
    const scaleX = Math.sqrt(a * a + c * c) * Math.sign(a || 1)
    const scaleY = Math.sqrt(b * b + d * d) * Math.sign(d || 1)

    return {
      x: tx,
      y: ty,
      scaleX: Math.abs(scaleX - 1) < 0.001 ? 1 : scaleX,
      scaleY: Math.abs(scaleY - 1) < 0.001 ? 1 : scaleY,
      rotation: Math.abs(rotation) < 0.001 ? 0 : rotation,
    }
  }

  // Fallback to absolute bounding box
  const bb = node.absoluteBoundingBox
  return {
    x: bb?.x ?? 0,
    y: bb?.y ?? 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  }
}

// ── Auto-layout conversion ───────────────────────────────────────────────────

function convertAutoLayout(node: FigmaNode): AutoLayoutConfig | undefined {
  if (!node.layoutMode) return undefined

  const justifyMap: Record<string, 'start' | 'center' | 'end' | 'space-between'> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
    SPACE_BETWEEN: 'space-between',
  }

  const alignMap: Record<string, 'start' | 'center' | 'end' | 'stretch'> = {
    MIN: 'start',
    CENTER: 'center',
    MAX: 'end',
  }

  return {
    direction: node.layoutMode === 'HORIZONTAL' ? 'horizontal' : 'vertical',
    gap: node.itemSpacing ?? 0,
    paddingTop: node.paddingTop ?? 0,
    paddingRight: node.paddingRight ?? 0,
    paddingBottom: node.paddingBottom ?? 0,
    paddingLeft: node.paddingLeft ?? 0,
    alignItems: alignMap[node.counterAxisAlignItems ?? 'MIN'] ?? 'start',
    justifyContent: justifyMap[node.primaryAxisAlignItems ?? 'MIN'] ?? 'start',
    wrap: node.layoutWrap === 'WRAP',
  }
}

// ── Constraints conversion ───────────────────────────────────────────────────

function convertConstraints(
  node: FigmaNode,
): { horizontal: 'left' | 'right' | 'left-right' | 'center' | 'scale'; vertical: 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale' } | undefined {
  if (!node.constraints) return undefined

  const hMap: Record<string, 'left' | 'right' | 'left-right' | 'center' | 'scale'> = {
    LEFT: 'left',
    RIGHT: 'right',
    LEFT_RIGHT: 'left-right',
    CENTER: 'center',
    SCALE: 'scale',
  }

  const vMap: Record<string, 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale'> = {
    TOP: 'top',
    BOTTOM: 'bottom',
    TOP_BOTTOM: 'top-bottom',
    CENTER: 'center',
    SCALE: 'scale',
  }

  return {
    horizontal: hMap[node.constraints.horizontal] ?? 'left',
    vertical: vMap[node.constraints.vertical] ?? 'top',
  }
}

// ── Layout sizing conversion ─────────────────────────────────────────────────

function convertLayoutSizing(
  node: FigmaNode,
): { horizontal: 'fixed' | 'fill' | 'hug'; vertical: 'fixed' | 'fill' | 'hug' } | undefined {
  if (!node.layoutSizingHorizontal && !node.layoutSizingVertical) return undefined

  const sizeMap: Record<string, 'fixed' | 'fill' | 'hug'> = {
    FIXED: 'fixed',
    FILL: 'fill',
    HUG: 'hug',
  }

  return {
    horizontal: sizeMap[node.layoutSizingHorizontal ?? 'FIXED'] ?? 'fixed',
    vertical: sizeMap[node.layoutSizingVertical ?? 'FIXED'] ?? 'fixed',
  }
}

// ── Node conversion ──────────────────────────────────────────────────────────

function convertFigmaNode(node: FigmaNode, parentTransform?: { x: number; y: number }): Layer | null {
  // Skip invisible nodes
  if (node.visible === false) return null

  switch (node.type) {
    case 'FRAME':
    case 'GROUP':
    case 'COMPONENT':
    case 'COMPONENT_SET':
    case 'SECTION':
      return convertFrameOrGroup(node, parentTransform)
    case 'RECTANGLE':
      return convertRectangle(node, parentTransform)
    case 'ELLIPSE':
      return convertEllipseNode(node, parentTransform)
    case 'LINE':
      return convertLine(node, parentTransform)
    case 'REGULAR_POLYGON':
      return convertPolygon(node, parentTransform)
    case 'STAR':
      return convertStarNode(node, parentTransform)
    case 'TEXT':
      return convertTextNode(node, parentTransform)
    case 'INSTANCE':
      return convertInstance(node, parentTransform)
    case 'VECTOR':
    case 'BOOLEAN_OPERATION':
      return convertVector(node, parentTransform)
    default:
      // Try as group if has children
      if (node.children && node.children.length > 0) {
        return convertFrameOrGroup(node, parentTransform)
      }
      return null
  }
}

function getNodeSize(node: FigmaNode): { width: number; height: number } {
  if (node.size) return { width: node.size.x, height: node.size.y }
  if (node.absoluteBoundingBox) return { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
  return { width: 100, height: 100 }
}

function getFills(node: FigmaNode): { primary: Fill | null; additional: Fill[] } {
  if (!node.fills || node.fills.length === 0) return { primary: null, additional: [] }

  const converted = node.fills
    .map(convertFigmaFill)
    .filter((f): f is Fill => f !== null)

  return {
    primary: converted[0] ?? null,
    additional: converted.slice(1),
  }
}

function commonLayerProps(node: FigmaNode, _parentTransform?: { x: number; y: number }) {
  return {
    visible: node.visible !== false,
    locked: node.locked ?? false,
    opacity: node.opacity ?? 1,
    blendMode: (FIGMA_BLEND_MODE_MAP[node.blendMode ?? 'NORMAL'] ?? 'normal') as BlendMode,
    transform: buildFigmaTransform(node),
    effects: collectFigmaEffects(node),
    constraints: convertConstraints(node),
    layoutSizing: convertLayoutSizing(node),
  }
}

function convertFrameOrGroup(node: FigmaNode, parentTransform?: { x: number; y: number }): GroupLayer {
  const children: Layer[] = []
  for (const child of node.children ?? []) {
    const layer = convertFigmaNode(child)
    if (layer) children.push(layer)
  }

  const props = commonLayerProps(node, parentTransform)
  const autoLayout = convertAutoLayout(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'group',
    ...props,
    children,
    autoLayout,
  }
}

function convertRectangle(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer {
  const { width, height } = getNodeSize(node)
  const cornerRadius = node.rectangleCornerRadii ?? node.cornerRadius ?? 0
  const segments = generateRectangle(0, 0, width, height, cornerRadius)
  const { primary, additional } = getFills(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
    shapeParams: {
      shapeType: 'rectangle',
      width,
      height,
      cornerRadius,
    },
  }
}

function convertEllipseNode(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer {
  const { width, height } = getNodeSize(node)
  const rx = width / 2
  const ry = height / 2
  const segments = generateEllipse(rx, ry, rx, ry)
  const { primary, additional } = getFills(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
    shapeParams: {
      shapeType: 'ellipse',
      width,
      height,
    },
  }
}

function convertLine(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer {
  const { width } = getNodeSize(node)
  const segments: Segment[] = [
    { type: 'move', x: 0, y: 0 },
    { type: 'line', x: width, y: 0 },
  ]
  const { primary, additional } = getFills(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths: [{ id: uuid(), segments, closed: false }],
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
  }
}

function convertPolygon(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer {
  const { width, height } = getNodeSize(node)
  const sides = node.pointCount ?? 3
  const radius = Math.min(width, height) / 2
  const segments = generatePolygon(width / 2, height / 2, radius, sides)
  const { primary, additional } = getFills(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
    shapeParams: {
      shapeType: 'polygon',
      width,
      height,
      sides,
    },
  }
}

function convertStarNode(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer {
  const { width, height } = getNodeSize(node)
  const points = node.pointCount ?? 5
  const innerRatio = node.innerRadius ?? 0.382
  const outerRadius = Math.min(width, height) / 2
  const segments = generateStar(width / 2, height / 2, outerRadius, innerRatio, points)
  const { primary, additional } = getFills(node)

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
    shapeParams: {
      shapeType: 'star',
      width,
      height,
      points,
      innerRatio,
    },
  }
}

function convertTextNode(node: FigmaNode, parentTransform?: { x: number; y: number }): TextLayer {
  const text = node.characters ?? ''
  const style = node.style

  const fontFamily = style?.fontFamily ?? 'sans-serif'
  const fontSize = style?.fontSize ?? 14
  const fontWeight: 'normal' | 'bold' = (style?.fontWeight ?? 400) >= 600 ? 'bold' : 'normal'
  const fontStyle: 'normal' | 'italic' = style?.italic ? 'italic' : 'normal'

  const alignMap: Record<string, 'left' | 'center' | 'right'> = {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right',
    JUSTIFIED: 'left',
  }
  const textAlign = alignMap[style?.textAlignHorizontal ?? 'LEFT'] ?? 'left'

  const lineHeight = style?.lineHeightPx ?? fontSize * 1.4
  const letterSpacing = style?.letterSpacing ?? 0

  // Get text color from fills
  const textFills = node.fills ?? []
  const firstFill = textFills.find((f) => f.visible !== false && f.type === 'SOLID')
  const color = firstFill?.color ? figmaColorToHex(firstFill.color) : '#000000'

  // Text decoration
  const decoMap: Record<string, 'none' | 'underline' | 'line-through'> = {
    NONE: 'none',
    UNDERLINE: 'underline',
    STRIKETHROUGH: 'line-through',
  }
  const textDecoration = decoMap[style?.textDecoration ?? 'NONE'] ?? 'none'

  // Text transform
  const caseMap: Record<string, 'none' | 'uppercase' | 'lowercase' | 'capitalize'> = {
    ORIGINAL: 'none',
    UPPER: 'uppercase',
    LOWER: 'lowercase',
    TITLE: 'capitalize',
  }
  const textTransform = caseMap[style?.textCase ?? 'ORIGINAL'] ?? 'none'

  return {
    id: uuid(),
    name: node.name,
    type: 'text',
    ...commonLayerProps(node, parentTransform),
    text,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    textAlign,
    lineHeight,
    letterSpacing,
    color,
    textDecoration: textDecoration !== 'none' ? textDecoration : undefined,
    textTransform: textTransform !== 'none' ? textTransform : undefined,
  }
}

function convertInstance(node: FigmaNode, parentTransform?: { x: number; y: number }): SymbolInstanceLayer {
  return {
    id: uuid(),
    name: node.name,
    type: 'symbol-instance',
    ...commonLayerProps(node, parentTransform),
    symbolId: node.componentId ?? '',
  }
}

function convertVector(node: FigmaNode, parentTransform?: { x: number; y: number }): VectorLayer | GroupLayer {
  const { width, height } = getNodeSize(node)
  const paths: Path[] = []

  // Try to extract paths from fillGeometry
  if (node.fillGeometry) {
    for (const geo of node.fillGeometry) {
      const segments = parseSVGPathD(geo.path)
      if (segments.length > 0) {
        paths.push({
          id: uuid(),
          segments,
          closed: true,
          fillRule: geo.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero',
        })
      }
    }
  }

  // If no fill geometry, create a simple rect placeholder
  if (paths.length === 0) {
    paths.push({
      id: uuid(),
      segments: generateRectangle(0, 0, width, height),
      closed: true,
    })
  }

  const { primary, additional } = getFills(node)

  // If this is a BOOLEAN_OPERATION with children, also convert children as a fallback
  if (node.type === 'BOOLEAN_OPERATION' && node.children && node.children.length > 0 && paths.length <= 1) {
    const children: Layer[] = []
    for (const child of node.children) {
      const layer = convertFigmaNode(child)
      if (layer) children.push(layer)
    }
    if (children.length > 0) {
      return {
        id: uuid(),
        name: node.name,
        type: 'group',
        ...commonLayerProps(node, parentTransform),
        children,
      }
    }
  }

  return {
    id: uuid(),
    name: node.name,
    type: 'vector',
    ...commonLayerProps(node, parentTransform),
    paths,
    fill: primary,
    stroke: convertFigmaStroke(node),
    additionalFills: additional.length > 0 ? additional : undefined,
  }
}

// ── SVG path `d` attribute parser (minimal, for Figma fillGeometry) ──────────

function parseSVGPathD(d: string): Segment[] {
  const segments: Segment[] = []
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g)
  if (!tokens) return segments

  let i = 0
  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0

  function num(): number {
    return parseFloat(tokens![i++] ?? '0')
  }

  while (i < tokens.length) {
    const cmd = tokens[i]!
    i++

    switch (cmd) {
      case 'M':
        curX = num()
        curY = num()
        startX = curX
        startY = curY
        segments.push({ type: 'move', x: curX, y: curY })
        // Subsequent coordinate pairs are implicit line-to
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX = num()
          curY = num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'm': {
        curX += num()
        curY += num()
        startX = curX
        startY = curY
        segments.push({ type: 'move', x: curX, y: curY })
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX += num()
          curY += num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      }
      case 'L':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX = num()
          curY = num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'l':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX += num()
          curY += num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'H':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX = num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'h':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curX += num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'V':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curY = num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'v':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          curY += num()
          segments.push({ type: 'line', x: curX, y: curY })
        }
        break
      case 'C':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          const cp1x = num()
          const cp1y = num()
          const cp2x = num()
          const cp2y = num()
          curX = num()
          curY = num()
          segments.push({ type: 'cubic', x: curX, y: curY, cp1x, cp1y, cp2x, cp2y })
        }
        break
      case 'c':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          const cp1x = curX + num()
          const cp1y = curY + num()
          const cp2x = curX + num()
          const cp2y = curY + num()
          curX += num()
          curY += num()
          segments.push({ type: 'cubic', x: curX, y: curY, cp1x, cp1y, cp2x, cp2y })
        }
        break
      case 'Q':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          const cpx = num()
          const cpy = num()
          curX = num()
          curY = num()
          segments.push({ type: 'quadratic', x: curX, y: curY, cpx, cpy })
        }
        break
      case 'q':
        while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i]!)) {
          const cpx = curX + num()
          const cpy = curY + num()
          curX += num()
          curY += num()
          segments.push({ type: 'quadratic', x: curX, y: curY, cpx, cpy })
        }
        break
      case 'Z':
      case 'z':
        segments.push({ type: 'close' })
        curX = startX
        curY = startY
        break
      default:
        // Skip unknown commands
        break
    }
  }

  return segments
}

// ── Main import functions ────────────────────────────────────────────────────

/**
 * Import pasted Figma JSON data.
 * Figma clipboard data is typically a JSON array of nodes or a single node.
 */
export function importFigmaClipboard(jsonString: string): DesignDocument {
  const parsed = JSON.parse(jsonString) as FigmaNode | FigmaNode[] | { nodes: FigmaNode[] }

  let nodes: FigmaNode[]
  if (Array.isArray(parsed)) {
    nodes = parsed
  } else if ('nodes' in parsed && Array.isArray(parsed.nodes)) {
    nodes = parsed.nodes
  } else {
    nodes = [parsed as FigmaNode]
  }

  const layers: Layer[] = []
  for (const node of nodes) {
    const layer = convertFigmaNode(node)
    if (layer) layers.push(layer)
  }

  // Determine artboard size from nodes
  let maxWidth = 0
  let maxHeight = 0
  for (const node of nodes) {
    if (node.absoluteBoundingBox) {
      maxWidth = Math.max(maxWidth, node.absoluteBoundingBox.width)
      maxHeight = Math.max(maxHeight, node.absoluteBoundingBox.height)
    } else if (node.size) {
      maxWidth = Math.max(maxWidth, node.size.x)
      maxHeight = Math.max(maxHeight, node.size.y)
    }
  }
  if (maxWidth === 0) maxWidth = 1920
  if (maxHeight === 0) maxHeight = 1080

  const now = new Date().toISOString()

  return {
    id: uuid(),
    metadata: {
      title: 'Figma Import',
      author: '',
      created: now,
      modified: now,
      colorspace: 'srgb',
      width: maxWidth,
      height: maxHeight,
    },
    artboards: [
      {
        id: uuid(),
        name: 'Figma Import',
        x: 0,
        y: 0,
        width: maxWidth,
        height: maxHeight,
        backgroundColor: '#ffffff',
        layers,
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

/**
 * Try to parse clipboard text as Figma JSON and import it.
 * Returns null if the text doesn't look like Figma data.
 */
export function tryImportFigmaClipboard(text: string): DesignDocument | null {
  try {
    // Basic heuristic: Figma JSON contains node types
    if (!text.includes('"type"') || !text.includes('"name"')) return null
    // Must look like JSON
    const trimmed = text.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null

    return importFigmaClipboard(text)
  } catch {
    return null
  }
}

// ── Re-export for testing ────────────────────────────────────────────────────

export {
  figmaColorToHex,
  figmaColorAlpha,
  convertFigmaFill,
  convertFigmaStroke,
  convertFigmaEffect,
  buildFigmaTransform,
  convertAutoLayout,
  convertConstraints,
  convertLayoutSizing,
  parseSVGPathD,
}

export type { FigmaNode, FigmaColor, FigmaPaint, FigmaEffect }
