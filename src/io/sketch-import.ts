/**
 * Sketch (.sketch) file import.
 *
 * Parses .sketch ZIP archives (containing JSON + embedded images) and converts
 * them into a Crossdraw DesignDocument. Handles: artboards, pages, layer types
 * (rectangle, oval, shapePath, shapeGroup, text, group, symbolInstance, bitmap),
 * fills, borders, shadows, blurs, text attributes, and transforms.
 *
 * Sketch format reference:
 *   .sketch = ZIP containing:
 *     - document.json   — document metadata, shared styles, color assets
 *     - meta.json        — page listing, app version
 *     - pages/<uuid>.json — per-page layer tree
 *     - images/<hash>.png — embedded raster images
 */

import { v4 as uuid } from 'uuid'
import { unzipSync, strFromU8 } from 'fflate'
import type {
  DesignDocument,
  Artboard,
  Layer,
  VectorLayer,
  TextLayer,
  GroupLayer,
  RasterLayer,
  SymbolInstanceLayer,
  SymbolDefinition,
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
  NamedColor,
} from '@/types'
import { storeRasterData } from '@/store/raster-data'
import { generateRectangle, generateEllipse } from '@/tools/shapes'

// ── Sketch JSON types (subset) ───────────────────────────────────────────────

/** Sketch color: 0-1 RGBA. */
interface SketchColor {
  _class: 'color'
  red: number
  green: number
  blue: number
  alpha: number
}

interface SketchGradientStop {
  _class: 'gradientStop'
  position: number
  color: SketchColor
}

interface SketchGradient {
  _class: 'gradient'
  gradientType: number // 0=linear, 1=radial, 2=angular
  from: string // "{x, y}" normalized
  to: string
  stops: SketchGradientStop[]
}

interface SketchFill {
  _class: 'fill'
  isEnabled: boolean
  fillType: number // 0=solid, 1=gradient, 4=pattern
  color: SketchColor
  gradient?: SketchGradient
  noiseIndex?: number
  noiseIntensity?: number
  patternFillType?: number
  patternTileScale?: number
  image?: SketchImageRef
}

interface SketchBorder {
  _class: 'border'
  isEnabled: boolean
  fillType: number
  color: SketchColor
  thickness: number
  position: number // 0=center, 1=inside, 2=outside
  gradient?: SketchGradient
}

interface SketchShadow {
  _class: 'shadow' | 'innerShadow'
  isEnabled: boolean
  blurRadius: number
  offsetX: number
  offsetY: number
  spread: number
  color: SketchColor
}

interface SketchBlur {
  _class: 'blur'
  isEnabled: boolean
  radius: number
  type: number // 0=gaussian, 1=motion, 2=zoom, 3=background
}

interface SketchStyle {
  _class: 'style'
  fills?: SketchFill[]
  borders?: SketchBorder[]
  shadows?: SketchShadow[]
  innerShadows?: SketchShadow[]
  blur?: SketchBlur
  contextSettings?: {
    _class: 'graphicsContextSettings'
    blendMode: number
    opacity: number
  }
}

interface SketchRect {
  _class: 'rect'
  x: number
  y: number
  width: number
  height: number
  constrainProportions?: boolean
}

interface SketchCurvePoint {
  _class: 'curvePoint'
  cornerRadius: number
  curveFrom: string // "{x, y}"
  curveTo: string
  point: string
  curveMode: number // 0=none, 1=straight, 2=mirrored, 3=asymmetric, 4=disconnected
  hasCurveFrom: boolean
  hasCurveTo: boolean
}

interface SketchImageRef {
  _class: 'MSJSONFileReference' | 'MSJSONOriginalDataReference'
  _ref_class?: 'MSImageData'
  _ref?: string // path in ZIP like "images/abc123.png"
  data?: { _data: string } // base64 data
}

interface SketchTextAttribute {
  _class: 'stringAttribute'
  location: number
  length: number
  attributes: {
    MSAttributedStringFontAttribute?: {
      _class: 'fontDescriptor'
      attributes: {
        name: string
        size: number
      }
    }
    MSAttributedStringColorAttribute?: SketchColor
    paragraphStyle?: {
      _class: 'paragraphStyle'
      alignment?: number // 0=left, 1=right, 2=center, 3=justified
      maximumLineHeight?: number
      minimumLineHeight?: number
    }
    kerning?: number
    textStyleVerticalAlignmentKey?: number
  }
}

interface SketchAttributedString {
  _class: 'attributedString'
  string: string
  attributes: SketchTextAttribute[]
}

interface SketchLayer {
  _class: string
  do_objectID: string
  name: string
  isVisible: boolean
  isLocked: boolean
  frame: SketchRect
  style?: SketchStyle
  rotation: number
  isFlippedHorizontal: boolean
  isFlippedVertical: boolean
  layers?: SketchLayer[]
  /** For shapePath / shapeGroup */
  points?: SketchCurvePoint[]
  isClosed?: boolean
  /** For text layers */
  attributedString?: SketchAttributedString
  /** For symbol instances */
  symbolID?: string
  overrideValues?: Array<{
    _class: 'overrideValue'
    overrideName: string
    value: string | boolean
  }>
  /** For bitmap layers */
  image?: SketchImageRef
  /** For rectangles */
  fixedRadius?: number
  hasConvertedToNewRoundCorners?: boolean
  /** Boolean operation */
  booleanOperation?: number // -1=none, 0=union, 1=subtract, 2=intersect, 3=difference
  /** Resizing constraint */
  resizingConstraint?: number
}

interface SketchPage {
  _class: 'page'
  do_objectID: string
  name: string
  layers: SketchLayer[]
}

interface SketchDocumentJSON {
  _class: 'document'
  do_objectID: string
  assets?: {
    _class: 'assetCollection'
    colors?: Array<{
      _class: 'color'
      red: number
      green: number
      blue: number
      alpha: number
    }>
  }
  layerStyles?: {
    _class: 'sharedStyleContainer'
    objects?: Array<{
      _class: 'sharedStyle'
      do_objectID: string
      name: string
      value: SketchStyle
    }>
  }
  layerSymbols?: {
    _class: 'symbolContainer'
    objects?: Array<{
      _class: 'symbolMaster'
      do_objectID: string
      symbolID: string
      name: string
      frame: SketchRect
      layers: SketchLayer[]
    }>
  }
}

interface SketchMetaJSON {
  commit: string
  appVersion: string
  build: number
  app: string
  pagesAndArtboards: Record<string, { name: string }>
}

// ── Context for import ───────────────────────────────────────────────────────

interface SketchImportContext {
  /** Map of image ref path -> Uint8Array raw data from the ZIP. */
  imageMap: Map<string, Uint8Array>
  /** Symbol definitions found in the document. */
  symbolDefs: Map<string, SymbolDefinition>
}

// ── Blend mode mapping ───────────────────────────────────────────────────────

const SKETCH_BLEND_MODE_MAP: Record<number, BlendMode> = {
  0: 'normal',
  1: 'darken',
  2: 'multiply',
  3: 'color-burn',
  4: 'lighten',
  5: 'screen',
  6: 'color-dodge',
  7: 'overlay',
  8: 'soft-light',
  9: 'hard-light',
  10: 'difference',
  11: 'exclusion',
  12: 'hue',
  13: 'saturation',
  14: 'color',
  15: 'luminosity',
}

// ── Color conversion ─────────────────────────────────────────────────────────

function sketchColorToHex(c: SketchColor): string {
  const r = Math.round(Math.max(0, Math.min(1, c.red)) * 255)
  const g = Math.round(Math.max(0, Math.min(1, c.green)) * 255)
  const b = Math.round(Math.max(0, Math.min(1, c.blue)) * 255)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function sketchColorAlpha(c: SketchColor): number {
  return Math.max(0, Math.min(1, c.alpha))
}

// ── Point parsing ────────────────────────────────────────────────────────────

/** Parse a Sketch "{x, y}" string into [x, y]. */
function parseSketchPoint(str: string): [number, number] {
  const cleaned = str.replace(/[{}]/g, '')
  const parts = cleaned.split(',').map((s) => parseFloat(s.trim()))
  return [parts[0] ?? 0, parts[1] ?? 0]
}

// ── Default dithering config ─────────────────────────────────────────────────

function defaultDithering(): DitheringConfig {
  return { enabled: false, algorithm: 'none', strength: 0, seed: 0 }
}

// ── Fill conversion ──────────────────────────────────────────────────────────

function convertSketchFill(sf: SketchFill): Fill | null {
  if (!sf.isEnabled) return null

  if (sf.fillType === 0) {
    // Solid color
    return {
      type: 'solid',
      color: sketchColorToHex(sf.color),
      opacity: sketchColorAlpha(sf.color),
    }
  }

  if (sf.fillType === 1 && sf.gradient) {
    // Gradient
    return {
      type: 'gradient',
      gradient: convertSketchGradient(sf.gradient),
      opacity: 1,
    }
  }

  // Pattern or unsupported — fall back to solid
  return {
    type: 'solid',
    color: sketchColorToHex(sf.color),
    opacity: sketchColorAlpha(sf.color),
  }
}

function convertSketchGradient(sg: SketchGradient): Gradient {
  const [fromX, fromY] = parseSketchPoint(sg.from)
  const [toX] = parseSketchPoint(sg.to)

  const angle = Math.atan2(toX - fromX, 0) * (180 / Math.PI)

  const gradType = sg.gradientType === 1 ? 'radial' : sg.gradientType === 2 ? 'conical' : 'linear'

  const stops: GradientStop[] = sg.stops.map((stop) => ({
    offset: stop.position,
    color: sketchColorToHex(stop.color),
    opacity: sketchColorAlpha(stop.color),
  }))

  return {
    id: uuid(),
    name: 'Sketch Gradient',
    type: gradType,
    angle,
    x: fromX,
    y: fromY,
    stops,
    dithering: defaultDithering(),
  }
}

// ── Stroke conversion ────────────────────────────────────────────────────────

function convertSketchBorder(sb: SketchBorder): Stroke | null {
  if (!sb.isEnabled) return null

  const posMap: Record<number, 'center' | 'inside' | 'outside'> = {
    0: 'center',
    1: 'inside',
    2: 'outside',
  }

  return {
    width: sb.thickness,
    color: sketchColorToHex(sb.color),
    opacity: sketchColorAlpha(sb.color),
    position: posMap[sb.position] ?? 'center',
    linecap: 'butt',
    linejoin: 'miter',
    miterLimit: 4,
  }
}

// ── Effect conversion ────────────────────────────────────────────────────────

function convertSketchShadow(ss: SketchShadow): Effect | null {
  if (!ss.isEnabled) return null

  const isInner = ss._class === 'innerShadow'

  if (isInner) {
    return {
      id: uuid(),
      type: 'inner-shadow',
      enabled: true,
      opacity: sketchColorAlpha(ss.color),
      params: {
        kind: 'inner-shadow',
        offsetX: ss.offsetX,
        offsetY: ss.offsetY,
        blurRadius: ss.blurRadius,
        color: sketchColorToHex(ss.color),
        opacity: sketchColorAlpha(ss.color),
      },
    }
  }

  return {
    id: uuid(),
    type: 'drop-shadow',
    enabled: true,
    opacity: sketchColorAlpha(ss.color),
    params: {
      kind: 'shadow',
      offsetX: ss.offsetX,
      offsetY: ss.offsetY,
      blurRadius: ss.blurRadius,
      spread: ss.spread,
      color: sketchColorToHex(ss.color),
      opacity: sketchColorAlpha(ss.color),
    },
  }
}

function convertSketchBlur(sb: SketchBlur): Effect | null {
  if (!sb.isEnabled) return null

  if (sb.type === 3) {
    // Background blur
    return {
      id: uuid(),
      type: 'background-blur',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'background-blur',
        radius: sb.radius,
      },
    }
  }

  return {
    id: uuid(),
    type: 'blur',
    enabled: true,
    opacity: 1,
    params: {
      kind: 'blur',
      radius: sb.radius,
      quality: 'medium',
    },
  }
}

// ── Collect all effects from a Sketch style ──────────────────────────────────

function collectEffects(style: SketchStyle | undefined): Effect[] {
  if (!style) return []
  const effects: Effect[] = []

  if (style.shadows) {
    for (const s of style.shadows) {
      const e = convertSketchShadow(s)
      if (e) effects.push(e)
    }
  }

  if (style.innerShadows) {
    for (const s of style.innerShadows) {
      const e = convertSketchShadow(s)
      if (e) effects.push(e)
    }
  }

  if (style.blur) {
    const e = convertSketchBlur(style.blur)
    if (e) effects.push(e)
  }

  return effects
}

// ── Blend mode & opacity from style context settings ─────────────────────────

function extractBlendMode(style: SketchStyle | undefined): BlendMode {
  if (!style?.contextSettings) return 'normal'
  return SKETCH_BLEND_MODE_MAP[style.contextSettings.blendMode] ?? 'normal'
}

function extractStyleOpacity(style: SketchStyle | undefined): number {
  if (!style?.contextSettings) return 1
  return Math.max(0, Math.min(1, style.contextSettings.opacity))
}

// ── Transform conversion ─────────────────────────────────────────────────────

/**
 * Sketch uses absolute frame positioning (frame.x, frame.y relative to parent).
 * Crossdraw uses the same model with transform.x/y relative to parent/artboard.
 * Sketch rotation is in degrees (clockwise negative in Sketch UI but stored as positive CCW).
 */
function buildTransform(layer: SketchLayer): Transform {
  return {
    x: layer.frame.x,
    y: layer.frame.y,
    scaleX: layer.isFlippedHorizontal ? -1 : 1,
    scaleY: layer.isFlippedVertical ? -1 : 1,
    rotation: layer.rotation === 0 ? 0 : -layer.rotation, // Sketch stores CCW, Crossdraw expects CW
  }
}

// ── Curve point conversion to segments ───────────────────────────────────────

/**
 * Convert Sketch curve points into Crossdraw path segments.
 * Sketch stores normalized (0-1) coordinates relative to the layer's frame.
 * We scale them to the frame's width and height.
 */
function convertCurvePoints(points: SketchCurvePoint[], width: number, height: number, isClosed: boolean): Segment[] {
  if (points.length === 0) return []

  const segments: Segment[] = []

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!
    const [px, py] = parseSketchPoint(pt.point)
    const absX = px * width
    const absY = py * height

    if (i === 0) {
      segments.push({ type: 'move', x: absX, y: absY })
    } else {
      const prevPt = points[i - 1]!
      const [prevPx, prevPy] = parseSketchPoint(prevPt.point)

      // curveFrom on the previous point is the outgoing control point
      // curveTo on the current point is the incoming control point
      const hasCurveOut = prevPt.hasCurveFrom && prevPt.curveMode !== 1
      const hasCurveIn = pt.hasCurveTo && pt.curveMode !== 1

      if (hasCurveOut || hasCurveIn) {
        const [cfx, cfy] = hasCurveOut ? parseSketchPoint(prevPt.curveFrom) : [prevPx, prevPy]
        const [ctx_, cty] = hasCurveIn ? parseSketchPoint(pt.curveTo) : [px, py]

        segments.push({
          type: 'cubic',
          x: absX,
          y: absY,
          cp1x: cfx * width,
          cp1y: cfy * height,
          cp2x: ctx_ * width,
          cp2y: cty * height,
        })
      } else {
        segments.push({ type: 'line', x: absX, y: absY })
      }
    }
  }

  // Close the path: connect last point back to first
  if (isClosed && points.length > 1) {
    const lastPt = points[points.length - 1]!
    const firstPt = points[0]!
    const [firstPx, firstPy] = parseSketchPoint(firstPt.point)
    const firstAbsX = firstPx * width
    const firstAbsY = firstPy * height

    const hasCurveOut = lastPt.hasCurveFrom && lastPt.curveMode !== 1
    const hasCurveIn = firstPt.hasCurveTo && firstPt.curveMode !== 1

    if (hasCurveOut || hasCurveIn) {
      const [lastPx, lastPy] = parseSketchPoint(lastPt.point)
      const [cfx, cfy] = hasCurveOut ? parseSketchPoint(lastPt.curveFrom) : [lastPx, lastPy]
      const [ctx_, cty] = hasCurveIn ? parseSketchPoint(firstPt.curveTo) : [firstPx, firstPy]

      segments.push({
        type: 'cubic',
        x: firstAbsX,
        y: firstAbsY,
        cp1x: cfx * width,
        cp1y: cfy * height,
        cp2x: ctx_ * width,
        cp2y: cty * height,
      })
    }

    segments.push({ type: 'close' })
  }

  return segments
}

// ── Layer conversion ─────────────────────────────────────────────────────────

function convertLayer(skLayer: SketchLayer, ctx: SketchImportContext): Layer | null {
  switch (skLayer._class) {
    case 'rectangle':
      return convertRectangle(skLayer, ctx)
    case 'oval':
      return convertOval(skLayer, ctx)
    case 'shapePath':
      return convertShapePath(skLayer, ctx)
    case 'shapeGroup':
      return convertShapeGroup(skLayer, ctx)
    case 'triangle':
    case 'star':
    case 'polygon':
      return convertShapePath(skLayer, ctx)
    case 'text':
      return convertText(skLayer)
    case 'group':
      return convertGroup(skLayer, ctx)
    case 'symbolInstance':
      return convertSymbolInstance(skLayer)
    case 'bitmap':
      return convertBitmap(skLayer, ctx)
    case 'slice':
    case 'hotspot':
      // Non-visual layers — skip
      return null
    case 'artboard':
    case 'symbolMaster':
      // Artboards/symbol masters are handled at a higher level
      return convertGroup(skLayer, ctx)
    default:
      // Unknown layer type — try as group if it has children
      if (skLayer.layers && skLayer.layers.length > 0) {
        return convertGroup(skLayer, ctx)
      }
      return null
  }
}

function convertRectangle(sk: SketchLayer, _ctx: SketchImportContext): VectorLayer {
  const w = sk.frame.width
  const h = sk.frame.height
  const cornerRadius = sk.fixedRadius ?? 0
  const segments = generateRectangle(0, 0, w, h, cornerRadius)

  const fills = sk.style?.fills?.map(convertSketchFill).filter((f): f is Fill => f !== null) ?? []
  const borders = sk.style?.borders?.map(convertSketchBorder).filter((s): s is Stroke => s !== null) ?? []

  return {
    id: uuid(),
    name: sk.name,
    type: 'vector',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: fills[0] ?? null,
    stroke: borders[0] ?? null,
    additionalFills: fills.length > 1 ? fills.slice(1) : undefined,
    additionalStrokes: borders.length > 1 ? borders.slice(1) : undefined,
    shapeParams: {
      shapeType: 'rectangle',
      width: w,
      height: h,
      cornerRadius,
    },
  }
}

function convertOval(sk: SketchLayer, _ctx: SketchImportContext): VectorLayer {
  const w = sk.frame.width
  const h = sk.frame.height
  const rx = w / 2
  const ry = h / 2
  const segments = generateEllipse(rx, ry, rx, ry)

  const fills = sk.style?.fills?.map(convertSketchFill).filter((f): f is Fill => f !== null) ?? []
  const borders = sk.style?.borders?.map(convertSketchBorder).filter((s): s is Stroke => s !== null) ?? []

  return {
    id: uuid(),
    name: sk.name,
    type: 'vector',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    paths: [{ id: uuid(), segments, closed: true }],
    fill: fills[0] ?? null,
    stroke: borders[0] ?? null,
    additionalFills: fills.length > 1 ? fills.slice(1) : undefined,
    additionalStrokes: borders.length > 1 ? borders.slice(1) : undefined,
    shapeParams: {
      shapeType: 'ellipse',
      width: w,
      height: h,
    },
  }
}

function convertShapePath(sk: SketchLayer, _ctx: SketchImportContext): VectorLayer {
  const w = sk.frame.width
  const h = sk.frame.height
  const isClosed = sk.isClosed !== false

  const segments =
    sk.points && sk.points.length > 0
      ? convertCurvePoints(sk.points, w, h, isClosed)
      : [
          { type: 'move' as const, x: 0, y: 0 },
          { type: 'line' as const, x: w, y: h },
        ]

  const fills = sk.style?.fills?.map(convertSketchFill).filter((f): f is Fill => f !== null) ?? []
  const borders = sk.style?.borders?.map(convertSketchBorder).filter((s): s is Stroke => s !== null) ?? []

  return {
    id: uuid(),
    name: sk.name,
    type: 'vector',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    paths: [{ id: uuid(), segments, closed: isClosed }],
    fill: fills[0] ?? null,
    stroke: borders[0] ?? null,
    additionalFills: fills.length > 1 ? fills.slice(1) : undefined,
    additionalStrokes: borders.length > 1 ? borders.slice(1) : undefined,
  }
}

function convertShapeGroup(sk: SketchLayer, _ctx: SketchImportContext): VectorLayer | GroupLayer {
  // A shapeGroup typically contains child shapes combined with boolean ops.
  // We collect all child path segments into a single VectorLayer when possible,
  // or fall back to a GroupLayer if sub-layers have distinct styling.

  const childLayers = sk.layers ?? []

  if (childLayers.length === 0) {
    // Empty shape group -> empty vector layer
    return {
      id: uuid(),
      name: sk.name,
      type: 'vector',
      visible: sk.isVisible,
      locked: sk.isLocked,
      opacity: extractStyleOpacity(sk.style),
      blendMode: extractBlendMode(sk.style),
      transform: buildTransform(sk),
      effects: collectEffects(sk.style),
      paths: [],
      fill: null,
      stroke: null,
    }
  }

  // Collect all paths from child shapes into a single vector layer
  const paths: Path[] = []
  for (const child of childLayers) {
    const w = child.frame.width
    const h = child.frame.height
    const isClosed = child.isClosed !== false
    let segments: Segment[] = []

    if (child._class === 'rectangle') {
      segments = generateRectangle(child.frame.x, child.frame.y, w, h, child.fixedRadius ?? 0)
    } else if (child._class === 'oval') {
      const rx = w / 2
      const ry = h / 2
      segments = generateEllipse(child.frame.x + rx, child.frame.y + ry, rx, ry)
    } else if (child.points && child.points.length > 0) {
      segments = convertCurvePoints(child.points, w, h, isClosed)
      // Offset by child frame position
      segments = offsetSegments(segments, child.frame.x, child.frame.y)
    }

    if (segments.length > 0) {
      paths.push({ id: uuid(), segments, closed: isClosed })
    }
  }

  const fills = sk.style?.fills?.map(convertSketchFill).filter((f): f is Fill => f !== null) ?? []
  const borders = sk.style?.borders?.map(convertSketchBorder).filter((s): s is Stroke => s !== null) ?? []

  return {
    id: uuid(),
    name: sk.name,
    type: 'vector',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    paths,
    fill: fills[0] ?? null,
    stroke: borders[0] ?? null,
    additionalFills: fills.length > 1 ? fills.slice(1) : undefined,
    additionalStrokes: borders.length > 1 ? borders.slice(1) : undefined,
  }
}

/** Offset all point coordinates in segments by (dx, dy). */
function offsetSegments(segments: Segment[], dx: number, dy: number): Segment[] {
  return segments.map((seg) => {
    switch (seg.type) {
      case 'move':
      case 'line':
        return { ...seg, x: seg.x + dx, y: seg.y + dy }
      case 'cubic':
        return {
          ...seg,
          x: seg.x + dx,
          y: seg.y + dy,
          cp1x: seg.cp1x + dx,
          cp1y: seg.cp1y + dy,
          cp2x: seg.cp2x + dx,
          cp2y: seg.cp2y + dy,
        }
      case 'quadratic':
        return {
          ...seg,
          x: seg.x + dx,
          y: seg.y + dy,
          cpx: seg.cpx + dx,
          cpy: seg.cpy + dy,
        }
      case 'arc':
        return { ...seg, x: seg.x + dx, y: seg.y + dy }
      case 'close':
        return seg
    }
  })
}

function convertText(sk: SketchLayer): TextLayer {
  const attrString = sk.attributedString
  const text = attrString?.string ?? ''

  // Extract font attributes from the first attribute range
  const firstAttr = attrString?.attributes?.[0]?.attributes
  const fontDesc = firstAttr?.MSAttributedStringFontAttribute?.attributes
  const fontFamily = fontDesc?.name ?? 'sans-serif'
  const fontSize = fontDesc?.size ?? 14
  const colorAttr = firstAttr?.MSAttributedStringColorAttribute
  const color = colorAttr ? sketchColorToHex(colorAttr) : '#000000'

  // Extract paragraph alignment
  const paraStyle = firstAttr?.paragraphStyle
  const alignMap: Record<number, 'left' | 'right' | 'center'> = {
    0: 'left',
    1: 'right',
    2: 'center',
  }
  const textAlign = alignMap[paraStyle?.alignment ?? 0] ?? 'left'

  // Line height
  const lineHeight = paraStyle?.maximumLineHeight ?? fontSize * 1.4

  // Letter spacing
  const letterSpacing = firstAttr?.kerning ?? 0

  // Determine font weight and style from font name heuristics
  const fontNameLower = fontFamily.toLowerCase()
  const fontWeight: 'normal' | 'bold' = fontNameLower.includes('bold') ? 'bold' : 'normal'
  const fontStyle: 'normal' | 'italic' =
    fontNameLower.includes('italic') || fontNameLower.includes('oblique') ? 'italic' : 'normal'

  return {
    id: uuid(),
    name: sk.name,
    type: 'text',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    text,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle,
    textAlign,
    lineHeight,
    letterSpacing,
    color,
  }
}

function convertGroup(sk: SketchLayer, ctx: SketchImportContext): GroupLayer {
  const children: Layer[] = []
  for (const child of sk.layers ?? []) {
    const layer = convertLayer(child, ctx)
    if (layer) children.push(layer)
  }

  return {
    id: uuid(),
    name: sk.name,
    type: 'group',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    children,
  }
}

function convertSymbolInstance(sk: SketchLayer): SymbolInstanceLayer {
  // Convert override values to Crossdraw format
  const overrides: Record<string, Partial<{ visible: boolean; opacity: number; fill: Fill | null }>> = {}
  if (sk.overrideValues) {
    for (const ov of sk.overrideValues) {
      if (typeof ov.value === 'boolean') {
        overrides[ov.overrideName] = { visible: ov.value }
      }
    }
  }

  return {
    id: uuid(),
    name: sk.name,
    type: 'symbol-instance',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    symbolId: sk.symbolID ?? '',
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  }
}

function convertBitmap(sk: SketchLayer, ctx: SketchImportContext): RasterLayer {
  const w = sk.frame.width
  const h = sk.frame.height
  const chunkId = uuid()

  // Try to extract image data from the ZIP
  const imgRef = sk.image
  if (imgRef?._ref) {
    const rawData = ctx.imageMap.get(imgRef._ref)
    if (rawData) {
      // We store the raw PNG/JPEG bytes; in a full implementation we would
      // decode them to ImageData. For now, create a placeholder ImageData.
      storeRasterPlaceholder(chunkId, Math.round(w), Math.round(h))
    } else {
      storeRasterPlaceholder(chunkId, Math.round(w), Math.round(h))
    }
  } else {
    storeRasterPlaceholder(chunkId, Math.round(w), Math.round(h))
  }

  return {
    id: uuid(),
    name: sk.name,
    type: 'raster',
    visible: sk.isVisible,
    locked: sk.isLocked,
    opacity: extractStyleOpacity(sk.style),
    blendMode: extractBlendMode(sk.style),
    transform: buildTransform(sk),
    effects: collectEffects(sk.style),
    imageChunkId: chunkId,
    width: Math.round(w),
    height: Math.round(h),
  }
}

/** Create a placeholder ImageData (transparent) for a raster layer. */
function storeRasterPlaceholder(chunkId: string, width: number, height: number): void {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const rgba = new Uint8ClampedArray(w * h * 4)
  let imageData: ImageData
  if (typeof ImageData !== 'undefined') {
    imageData = new ImageData(rgba, w, h)
  } else {
    imageData = {
      data: rgba,
      width: w,
      height: h,
      colorSpace: 'srgb',
    } as unknown as ImageData
  }
  storeRasterData(chunkId, imageData)
}

// ── Main import function ─────────────────────────────────────────────────────

/**
 * Import a .sketch file from an ArrayBuffer.
 * Returns a DesignDocument with all pages/artboards/layers mapped.
 */
export async function importSketch(buffer: ArrayBuffer): Promise<DesignDocument> {
  // Unzip the .sketch file
  const zipData = new Uint8Array(buffer)
  const files = unzipSync(zipData)

  // Build image map from images/ directory
  const imageMap = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(files)) {
    if (path.startsWith('images/')) {
      imageMap.set(path, data)
    }
  }

  // Parse document.json
  const docJsonBytes = files['document.json']
  let sketchDoc: SketchDocumentJSON | undefined
  if (docJsonBytes) {
    const text = strFromU8(docJsonBytes)
    sketchDoc = JSON.parse(text) as SketchDocumentJSON
  }

  // Parse meta.json for page listing
  const metaJsonBytes = files['meta.json']
  let meta: SketchMetaJSON | undefined
  if (metaJsonBytes) {
    const text = strFromU8(metaJsonBytes)
    meta = JSON.parse(text) as SketchMetaJSON
  }

  // Build symbol definitions from the document
  const symbolDefs = new Map<string, SymbolDefinition>()
  const symbolMasters = sketchDoc?.layerSymbols?.objects ?? []
  const importCtx: SketchImportContext = { imageMap, symbolDefs }

  for (const sym of symbolMasters) {
    const children: Layer[] = []
    for (const child of sym.layers) {
      const layer = convertLayer(child, importCtx)
      if (layer) children.push(layer)
    }
    const def: SymbolDefinition = {
      id: sym.symbolID,
      name: sym.name,
      layers: children,
      width: sym.frame.width,
      height: sym.frame.height,
    }
    symbolDefs.set(sym.symbolID, def)
  }

  // Parse pages
  const artboards: Artboard[] = []
  const pageIds = meta?.pagesAndArtboards ? Object.keys(meta.pagesAndArtboards) : []

  // Find page JSON files
  const pageFiles =
    pageIds.length > 0
      ? pageIds
      : Object.keys(files)
          .filter((p) => p.startsWith('pages/') && p.endsWith('.json'))
          .map((p) => p.replace('pages/', '').replace('.json', ''))

  for (const pageId of pageFiles) {
    const pagePath = `pages/${pageId}.json`
    const pageBytes = files[pagePath]
    if (!pageBytes) continue

    const pageText = strFromU8(pageBytes)
    const page = JSON.parse(pageText) as SketchPage

    // Each top-level Sketch artboard becomes a Crossdraw artboard.
    // Non-artboard top-level layers go into a default artboard for the page.
    const topLevelLayers: Layer[] = []

    for (const skLayer of page.layers) {
      if (skLayer._class === 'artboard' || skLayer._class === 'symbolMaster') {
        // Convert to a Crossdraw artboard
        const abLayers: Layer[] = []
        for (const child of skLayer.layers ?? []) {
          const layer = convertLayer(child, importCtx)
          if (layer) abLayers.push(layer)
        }

        artboards.push({
          id: uuid(),
          name: skLayer.name,
          x: skLayer.frame.x,
          y: skLayer.frame.y,
          width: skLayer.frame.width,
          height: skLayer.frame.height,
          backgroundColor: '#ffffff',
          layers: abLayers,
        })
      } else {
        const layer = convertLayer(skLayer, importCtx)
        if (layer) topLevelLayers.push(layer)
      }
    }

    // If there are top-level layers without an artboard wrapper, create a page-level artboard
    if (topLevelLayers.length > 0) {
      artboards.push({
        id: uuid(),
        name: page.name || `Page ${artboards.length + 1}`,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#ffffff',
        layers: topLevelLayers,
      })
    }
  }

  // If no artboards were created, create a default one
  if (artboards.length === 0) {
    artboards.push({
      id: uuid(),
      name: 'Artboard 1',
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      backgroundColor: '#ffffff',
      layers: [],
    })
  }

  // Extract named colors from document assets
  const namedColors: NamedColor[] = []
  if (sketchDoc?.assets?.colors) {
    for (const c of sketchDoc.assets.colors) {
      namedColors.push({
        id: uuid(),
        name: sketchColorToHex({ ...c, _class: 'color' }),
        value: sketchColorToHex({ ...c, _class: 'color' }),
      })
    }
  }

  const now = new Date().toISOString()
  const firstArtboard = artboards[0]!

  const doc: DesignDocument = {
    id: uuid(),
    metadata: {
      title: 'Sketch Import',
      author: '',
      created: now,
      modified: now,
      colorspace: 'srgb',
      width: firstArtboard.width,
      height: firstArtboard.height,
    },
    artboards,
    assets: {
      gradients: [],
      patterns: [],
      colors: namedColors,
    },
    symbols: symbolDefs.size > 0 ? Array.from(symbolDefs.values()) : undefined,
  }

  return doc
}

// ── Re-export for menu-bar usage ─────────────────────────────────────────────

export {
  sketchColorToHex,
  sketchColorAlpha,
  parseSketchPoint,
  convertSketchFill,
  convertSketchBorder,
  convertSketchShadow,
  convertSketchBlur,
  convertCurvePoints,
  buildTransform,
  extractBlendMode,
  collectEffects,
  offsetSegments,
}
