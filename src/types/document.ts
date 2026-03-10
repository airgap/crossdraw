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
  comments?: Comment[]
  variableCollections?: import('@/variables/variable-types').VariableCollection[]
}

export interface Comment {
  id: string
  /** Canvas coordinates where the comment pin is placed */
  x: number
  y: number
  /** Associated artboard (for positioning context) */
  artboardId: string
  /** Associated layer (optional — comments can be on canvas or on a specific layer) */
  layerId?: string
  /** Comment thread */
  author: string
  text: string
  createdAt: string // ISO date
  resolved: boolean
  replies: CommentReply[]
}

export interface CommentReply {
  id: string
  author: string
  text: string
  createdAt: string
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
  format: 'png' | 'jpeg' | 'svg' | 'webp' | 'gif' | 'tiff'
  scale: number
}

export interface Breakpoint {
  id: string
  name: string       // e.g., "Mobile", "Tablet", "Desktop"
  width: number      // artboard width at this breakpoint
  icon?: string      // optional icon identifier
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
  /** Responsive breakpoints for this artboard. */
  breakpoints?: Breakpoint[]
  /** Active breakpoint ID for editing. */
  activeBreakpointId?: string
  /** Is this artboard a flow starting point? */
  flowStarting?: boolean
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
  /** Auto-layout child sizing. */
  layoutSizing?: {
    horizontal: 'fixed' | 'fill' | 'hug' // fixed=use transform width, fill=stretch to parent, hug=fit content
    vertical: 'fixed' | 'fill' | 'hug'
  }
  /** Per-breakpoint overrides. Key is breakpoint ID. */
  breakpointOverrides?: Record<string, {
    visible?: boolean
    transform?: Partial<Transform>
    /** For text layers */
    fontSize?: number
    textAlign?: 'left' | 'center' | 'right'
  }>
  /** Prototype interactions attached to this layer. */
  interactions?: Interaction[]
  /** Animation keyframes for this layer. */
  animation?: AnimationTrack
  /** Variable bindings: keys are property paths like 'fill.color', 'opacity', 'transform.x' */
  variableBindings?: Record<string, import('@/variables/variable-types').VariableBinding>
}

// --- Animation ---

export interface AnimationTrack {
  duration: number // total duration in ms
  loop: boolean
  keyframes: Keyframe[]
}

export interface Keyframe {
  id: string
  time: number // ms from start (0 to duration)
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'
  properties: KeyframeProperties
}

export interface KeyframeProperties {
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  opacity?: number
  fillColor?: string
  strokeColor?: string
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
    cornerRadius?: number | [number, number, number, number]
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
  /** Auto-layout configuration. When set, children are arranged automatically. */
  autoLayout?: AutoLayoutConfig
}

export interface AutoLayoutConfig {
  direction: 'horizontal' | 'vertical'
  gap: number // spacing between children
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  alignItems: 'start' | 'center' | 'end' | 'stretch' // cross-axis alignment
  justifyContent: 'start' | 'center' | 'end' | 'space-between' // main-axis distribution
  wrap: boolean // wrap to next line
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
  /** Text mode: 'point' for click-to-place (default), 'area' for bounded text box. */
  textMode?: 'point' | 'area'
  /** Bounding box width for area text (only used when textMode === 'area'). */
  textWidth?: number
  /** Bounding box height for area text (only used when textMode === 'area'). */
  textHeight?: number
  /** OpenType feature settings. Keys are 4-character OT tags (e.g. 'liga', 'smcp', 'onum'). */
  openTypeFeatures?: Record<string, boolean>
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

export interface NoiseFillConfig {
  noiseType: 'perlin' | 'simplex' | 'cellular' | 'white'
  scale: number
  octaves: number
  persistence: number
  seed: number
  color1: string
  color2: string
}

export interface Fill {
  type: 'solid' | 'gradient' | 'pattern' | 'noise'
  color?: string
  gradient?: Gradient
  pattern?: Pattern
  noise?: NoiseFillConfig
  opacity: number
}

export interface WiggleStrokeConfig {
  enabled: boolean
  amplitude: number
  frequency: number
  seed: number
  taperStart: number
  taperEnd: number
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
  /** Variable width profile. Each entry is [position (0-1 along path), width multiplier]. */
  widthProfile?: [number, number][]
  /** Wiggle / hand-drawn stroke displacement. */
  wiggle?: WiggleStrokeConfig
}

export interface MeshPoint {
  x: number // position 0-1 (within bounding box)
  y: number // position 0-1
  color: string // hex color at this point
  opacity: number // 0-1
}

export interface MeshGradientData {
  rows: number // grid rows (2-8)
  cols: number // grid columns (2-8)
  points: MeshPoint[] // rows * cols control points
}

export interface Gradient {
  id: string
  name: string
  type: 'linear' | 'radial' | 'conical' | 'box' | 'mesh'
  angle?: number
  x: number
  y: number
  radius?: number
  stops: GradientStop[]
  dithering: DitheringConfig
  /** Mesh gradient data (only used when type === 'mesh'). */
  mesh?: MeshGradientData
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

export interface ProgressiveBlurParams {
  kind: 'progressive-blur'
  direction: 'linear' | 'radial'
  angle: number
  startRadius: number
  endRadius: number
  startPosition: number
  endPosition: number
}

export interface Effect {
  id: string
  type: 'blur' | 'shadow' | 'drop-shadow' | 'distort' | 'glow' | 'outer-glow' | 'inner-shadow' | 'background-blur' | 'progressive-blur'
  enabled: boolean
  opacity: number
  params: BlurParams | ShadowParams | DistortParams | GlowParams | InnerShadowParams | BackgroundBlurParams | ProgressiveBlurParams
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

export interface ComponentProperty {
  id: string
  name: string
  type: 'boolean' | 'text' | 'instance-swap' | 'enum'
  /** Default value */
  defaultValue: string | boolean
  /** For enum type: list of allowed values */
  options?: string[]
  /** Layer ID this property controls (for boolean: visibility, for text: text content) */
  targetLayerId?: string
}

export interface SymbolVariant {
  id: string
  name: string // e.g., "Hover", "Pressed", "Disabled"
  /** Property values that define this variant */
  propertyValues: Record<string, string | boolean>
  /** Layer overrides specific to this variant */
  layerOverrides: Record<
    string,
    Partial<{
      visible: boolean
      opacity: number
      fill: Fill | null
      text: string
    }>
  >
}

export interface SymbolDefinition {
  id: string
  name: string
  layers: Layer[]
  width: number
  height: number
  /** Component properties that can be overridden per instance. */
  componentProperties?: ComponentProperty[]
  /** Named variants (e.g., "State=Hover", "Size=Large"). */
  variants?: SymbolVariant[]
}

export interface SymbolInstanceLayer extends BaseLayer {
  type: 'symbol-instance'
  symbolId: string
  /** Override properties per nested layer id. */
  overrides?: Record<string, Partial<{ visible: boolean; opacity: number; fill: Fill | null }>>
  /** Component property values for this instance. */
  propertyValues?: Record<string, string | boolean>
  /** Active variant name. */
  activeVariant?: string
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

// --- Prototype interactions ---

export interface Interaction {
  id: string
  trigger: 'click' | 'hover' | 'press' | 'drag'
  action: InteractionAction
}

export type InteractionAction =
  | { type: 'navigate'; targetArtboardId: string; transition: Transition }
  | { type: 'overlay'; targetArtboardId: string; position: 'center' | 'top' | 'bottom'; transition: Transition }
  | { type: 'scroll-to'; targetLayerId: string }
  | { type: 'back'; transition: Transition }
  | { type: 'url'; url: string }

export interface Transition {
  type: 'instant' | 'dissolve' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'push-left' | 'push-right'
  duration: number // ms
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
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
