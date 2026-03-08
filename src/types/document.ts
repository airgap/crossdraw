export interface DesignDocument {
  id: string
  metadata: DocumentMetadata
  artboards: Artboard[]
  assets: {
    gradients: Gradient[]
    patterns: Pattern[]
    colors: NamedColor[]
  }
  symbols?: SymbolDefinition[]
}

export interface DocumentMetadata {
  title: string
  author: string
  created: string // ISO8601
  modified: string
  colorspace: 'srgb' | 'p3' | 'adobe-rgb'
  width: number
  height: number
  iccProfile?: ICCProfile
}

export interface ExportSlice {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  format: 'png' | 'jpeg' | 'svg'
  scale: number
}

export interface Artboard {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  backgroundColor: string
  layers: Layer[]
  guides?: {
    horizontal: number[]
    vertical: number[]
  }
  /** Export slices for batch export. */
  slices?: ExportSlice[]
}

export type Layer = VectorLayer | RasterLayer | GroupLayer | AdjustmentLayer | TextLayer | SymbolInstanceLayer

export interface BaseLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  transform: Transform
  effects: Effect[]
  mask?: Layer
  constraints?: {
    horizontal: 'left' | 'right' | 'left-right' | 'center' | 'scale'
    vertical: 'top' | 'bottom' | 'top-bottom' | 'center' | 'scale'
  }
}

export interface VectorLayer extends BaseLayer {
  type: 'vector'
  paths: Path[]
  fill: Fill | null
  stroke: Stroke | null
  /** Additional fills rendered in order (below the primary fill). */
  additionalFills?: Fill[]
  /** Additional strokes rendered in order (below the primary stroke). */
  additionalStrokes?: Stroke[]
  /** Shape metadata for parametric regeneration. */
  shapeParams?: {
    shapeType: 'rectangle' | 'ellipse' | 'polygon' | 'star'
    width: number
    height: number
    cornerRadius?: number
    sides?: number
    points?: number
    innerRatio?: number
  }
}

export interface RasterLayer extends BaseLayer {
  type: 'raster'
  /** Key into the raster data store (pixel data stored outside Immer) */
  imageChunkId: string
  width: number
  height: number
  /** Crop region (pixels are kept, only the visible area changes). */
  cropRegion?: CropRegion
}

export interface GroupLayer extends BaseLayer {
  type: 'group'
  children: Layer[]
}

// Adjustment layer params — discriminated union, no `any`
export interface LevelsParams {
  blackPoint: number
  whitePoint: number
  gamma: number
}
export interface CurvesParams {
  points: [number, number][]
}
export interface HueSatParams {
  hue: number
  saturation: number
  lightness: number
}
export interface ColorBalanceParams {
  shadows: number
  midtones: number
  highlights: number
}

export type AdjustmentParams =
  | { adjustmentType: 'levels'; params: LevelsParams }
  | { adjustmentType: 'curves'; params: CurvesParams }
  | { adjustmentType: 'hue-sat'; params: HueSatParams }
  | { adjustmentType: 'color-balance'; params: ColorBalanceParams }

export type AdjustmentLayer = BaseLayer & { type: 'adjustment' } & AdjustmentParams

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  color: string
  /** Text decoration (underline, strikethrough). */
  textDecoration?: 'none' | 'underline' | 'line-through'
  /** Text transform (uppercase, lowercase). */
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  /** Paragraph indent in pixels. */
  paragraphIndent?: number
  /** Paragraph spacing in pixels (extra space after each paragraph). */
  paragraphSpacing?: number
  /** Character style overrides for rich text ranges. */
  characterStyles?: CharacterStyleRange[]
  /** Text-on-path: reference to a vector layer's path. */
  pathReference?: string | null
  /** Position along the path (0-1). */
  pathOffset?: number
}

export interface CharacterStyleRange {
  start: number
  end: number
  fontFamily?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  color?: string
  textDecoration?: 'none' | 'underline' | 'line-through'
}

export interface Path {
  id: string
  segments: Segment[] // canonical source of truth
  closed: boolean
  fillRule?: 'nonzero' | 'evenodd'
}

export type Segment =
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | {
      type: 'cubic'
      x: number
      y: number
      cp1x: number
      cp1y: number
      cp2x: number
      cp2y: number
    }
  | { type: 'quadratic'; x: number; y: number; cpx: number; cpy: number }
  | {
      type: 'arc'
      x: number
      y: number
      rx: number
      ry: number
      rotation: number
      largeArc: boolean
      sweep: boolean
    }
  | { type: 'close' }

export interface Fill {
  type: 'solid' | 'gradient' | 'pattern'
  color?: string
  gradient?: Gradient
  pattern?: Pattern
  opacity: number
}

export interface Stroke {
  width: number
  color: string
  opacity: number
  position: 'center' | 'inside' | 'outside'
  dasharray?: number[]
  linecap: 'butt' | 'round' | 'square'
  linejoin: 'miter' | 'bevel' | 'round'
  miterLimit: number
}

export interface Gradient {
  id: string
  name: string
  type: 'linear' | 'radial' | 'conical' | 'box'
  angle?: number
  x: number
  y: number
  radius?: number
  stops: GradientStop[]
  dithering: DitheringConfig
  /** Optional transform applied to the gradient (rotate, scale, skew). */
  gradientTransform?: {
    rotate?: number // degrees
    scaleX?: number
    scaleY?: number
    translateX?: number
    translateY?: number
  }
  /** SVG gradientUnits: 'objectBoundingBox' (default) or 'userSpaceOnUse'. */
  gradientUnits?: 'objectBoundingBox' | 'userSpaceOnUse'
}

export interface GradientStop {
  offset: number // 0-1
  color: string
  opacity: number
}

export interface DitheringConfig {
  enabled: boolean
  algorithm: 'none' | 'bayer' | 'floyd-steinberg' | 'atkinson' | 'jarvis' | 'stucki'
  strength: number // 0-1
  seed: number
}

export interface Effect {
  id: string
  type: 'blur' | 'shadow' | 'drop-shadow' | 'distort' | 'glow' | 'outer-glow' | 'inner-shadow' | 'background-blur'
  enabled: boolean
  opacity: number
  params: BlurParams | ShadowParams | DistortParams | GlowParams | InnerShadowParams | BackgroundBlurParams
}

export interface GlowParams {
  kind: 'glow'
  radius: number
  spread: number
  color: string
  opacity: number
}

export interface InnerShadowParams {
  kind: 'inner-shadow'
  offsetX: number
  offsetY: number
  blurRadius: number
  color: string
  opacity: number
}

export interface BackgroundBlurParams {
  kind: 'background-blur'
  radius: number
}

export interface BlurParams {
  kind: 'blur'
  radius: number
  quality: 'low' | 'medium' | 'high'
}

export interface ShadowParams {
  kind: 'shadow'
  offsetX: number
  offsetY: number
  blurRadius: number
  spread: number
  color: string
  opacity: number
}

export interface DistortParams {
  kind: 'distort'
  distortType: 'warp' | 'wave' | 'twist'
  intensity: number
  scale: number
}

export interface Transform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  skewX?: number
  skewY?: number
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'color-dodge'
  | 'color-burn'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface Pattern {
  id: string
  name: string
  imageChunkId: string
  scale: number
}

export interface NamedColor {
  id: string
  name: string
  value: string
  group?: string
}

// --- Symbols / Instances ---

export interface SymbolDefinition {
  id: string
  name: string
  layers: Layer[]
  width: number
  height: number
}

export interface SymbolInstanceLayer extends BaseLayer {
  type: 'symbol-instance'
  symbolId: string
  /** Override properties per nested layer id. */
  overrides?: Record<string, Partial<{ visible: boolean; opacity: number; fill: Fill | null }>>
}

// --- ICC Color Profile ---

export interface ICCProfile {
  name: string
  data?: Uint8Array
}

// --- Raster crop region ---

export interface CropRegion {
  x: number
  y: number
  width: number
  height: number
}

// --- Brush settings ---

export interface BrushSettings {
  size: number // diameter in pixels
  hardness: number // 0-1 (0 = soft, 1 = hard)
  opacity: number // 0-1
  flow: number // 0-1
  color: string // hex color
  spacing: number // 0.1-2.0 (fraction of brush size between dabs)
}

export interface ViewportState {
  zoom: number // 0.1 to 10.0
  panX: number
  panY: number
  artboardId: string | null
}

export interface SelectionState {
  layerIds: string[]
  pathIds?: string[]
}
