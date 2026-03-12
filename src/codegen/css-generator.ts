import type {
  Layer,
  VectorLayer,
  TextLayer,
  GroupLayer,
  Fill,
  Stroke,
  Effect,
  ShadowParams,
  BlurParams,
  GlowParams,
  InnerShadowParams,
} from '@/types'

export interface CSSOptions {
  units?: 'px' | 'rem'
  includePosition?: boolean
  remBase?: number
}

const DEFAULT_OPTIONS: Required<CSSOptions> = {
  units: 'px',
  includePosition: true,
  remBase: 16,
}

function u(value: number, opts: Required<CSSOptions>): string {
  if (opts.units === 'rem') {
    return `${(value / opts.remBase).toFixed(4).replace(/\.?0+$/, '')}rem`
  }
  return `${Math.round(value * 100) / 100}px`
}

function hexToRGBA(hex: string, opacity: number): string {
  if (opacity >= 1) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function fillToCSS(fill: Fill): string {
  if (fill.type === 'solid' && fill.color) {
    return hexToRGBA(fill.color, fill.opacity)
  }
  if (fill.type === 'gradient' && fill.gradient) {
    const g = fill.gradient
    const stops = g.stops
      .map((s) => {
        const color = hexToRGBA(s.color, s.opacity * fill.opacity)
        return `${color} ${Math.round(s.offset * 100)}%`
      })
      .join(', ')

    if (g.type === 'linear') {
      const angle = g.angle ?? 0
      return `linear-gradient(${angle}deg, ${stops})`
    }
    if (g.type === 'radial') {
      return `radial-gradient(circle, ${stops})`
    }
    if (g.type === 'conical') {
      const angle = g.angle ?? 0
      return `conic-gradient(from ${angle}deg, ${stops})`
    }
  }
  return 'transparent'
}

function strokeToCSS(stroke: Stroke): string {
  const color = hexToRGBA(stroke.color, stroke.opacity)
  let style = 'solid'
  if (stroke.dasharray && stroke.dasharray.length > 0) {
    style = 'dashed'
  }
  return `${stroke.width}px ${style} ${color}`
}

function effectsToCSS(effects: Effect[], opts: Required<CSSOptions>): Record<string, string> {
  const props: Record<string, string> = {}
  const boxShadows: string[] = []
  const filters: string[] = []

  for (const effect of effects) {
    if (!effect.enabled) continue

    if (effect.type === 'drop-shadow' || effect.type === 'shadow') {
      const p = effect.params as ShadowParams
      const color = hexToRGBA(p.color, p.opacity * effect.opacity)
      const spread = 'spread' in p ? ` ${u(p.spread, opts)}` : ''
      boxShadows.push(`${u(p.offsetX, opts)} ${u(p.offsetY, opts)} ${u(p.blurRadius, opts)}${spread} ${color}`)
    }

    if (effect.type === 'inner-shadow') {
      const p = effect.params as InnerShadowParams
      const color = hexToRGBA(p.color, p.opacity * effect.opacity)
      boxShadows.push(`inset ${u(p.offsetX, opts)} ${u(p.offsetY, opts)} ${u(p.blurRadius, opts)} ${color}`)
    }

    if (effect.type === 'blur') {
      const p = effect.params as BlurParams
      filters.push(`blur(${u(p.radius, opts)})`)
    }

    if (effect.type === 'glow' || effect.type === 'outer-glow') {
      const p = effect.params as GlowParams
      const color = hexToRGBA(p.color, p.opacity * effect.opacity)
      boxShadows.push(`0 0 ${u(p.radius, opts)} ${u(p.spread, opts)} ${color}`)
    }
  }

  if (boxShadows.length > 0) {
    props['box-shadow'] = boxShadows.join(', ')
  }
  if (filters.length > 0) {
    props['filter'] = filters.join(' ')
  }

  return props
}

function cornerRadiusToCSS(
  cornerRadius: number | [number, number, number, number],
  opts: Required<CSSOptions>,
): string {
  if (typeof cornerRadius === 'number') {
    return u(cornerRadius, opts)
  }
  const [tl, tr, br, bl] = cornerRadius
  if (tl === tr && tr === br && br === bl) {
    return u(tl, opts)
  }
  return `${u(tl, opts)} ${u(tr, opts)} ${u(br, opts)} ${u(bl, opts)}`
}

function generateVectorCSS(layer: VectorLayer, opts: Required<CSSOptions>): Record<string, string> {
  const props: Record<string, string> = {}

  // Dimensions
  if (layer.shapeParams) {
    props['width'] = u(layer.shapeParams.width, opts)
    props['height'] = u(layer.shapeParams.height, opts)

    // Border radius
    if (layer.shapeParams.cornerRadius !== undefined) {
      props['border-radius'] = cornerRadiusToCSS(layer.shapeParams.cornerRadius, opts)
    }

    // Ellipse
    if (layer.shapeParams.shapeType === 'ellipse') {
      props['border-radius'] = '50%'
    }
  } else {
    // Use transform scale as proxy for dimensions
    const w = Math.abs(layer.transform.scaleX)
    const h = Math.abs(layer.transform.scaleY)
    if (w > 0 && h > 0) {
      props['width'] = u(w, opts)
      props['height'] = u(h, opts)
    }
  }

  // Fill
  if (layer.fill) {
    const fillValue = fillToCSS(layer.fill)
    if (layer.fill.type === 'gradient') {
      props['background'] = fillValue
    } else {
      props['background-color'] = fillValue
    }
  }

  // Additional fills (rendered as layered backgrounds)
  if (layer.additionalFills && layer.additionalFills.length > 0 && layer.fill) {
    const allFills = [layer.fill, ...layer.additionalFills]
    const backgrounds = allFills.map(fillToCSS).reverse()
    props['background'] = backgrounds.join(', ')
  }

  // Stroke
  if (layer.stroke) {
    props['border'] = strokeToCSS(layer.stroke)
    if (layer.stroke.position === 'inside') {
      props['box-sizing'] = 'border-box'
    }
  }

  return props
}

function generateTextCSS(layer: TextLayer, opts: Required<CSSOptions>): Record<string, string> {
  const props: Record<string, string> = {}

  props['font-family'] = `'${layer.fontFamily}', sans-serif`
  props['font-size'] = u(layer.fontSize, opts)

  if (layer.fontWeight !== 'normal') {
    props['font-weight'] = layer.fontWeight
  }
  if (layer.fontStyle !== 'normal') {
    props['font-style'] = layer.fontStyle
  }

  props['text-align'] = layer.textAlign
  props['line-height'] = String(layer.lineHeight)

  if (layer.letterSpacing !== 0) {
    props['letter-spacing'] = u(layer.letterSpacing, opts)
  }

  if (layer.color) {
    props['color'] = layer.color
  }

  if (layer.textDecoration && layer.textDecoration !== 'none') {
    props['text-decoration'] = layer.textDecoration
  }
  if (layer.textTransform && layer.textTransform !== 'none') {
    props['text-transform'] = layer.textTransform
  }

  if (layer.paragraphIndent && layer.paragraphIndent > 0) {
    props['text-indent'] = u(layer.paragraphIndent, opts)
  }

  // Area text dimensions
  if (layer.textMode === 'area') {
    if (layer.textWidth) props['width'] = u(layer.textWidth, opts)
    if (layer.textHeight) props['height'] = u(layer.textHeight, opts)
    props['overflow'] = 'hidden'
  }

  return props
}

function generateGroupCSS(layer: GroupLayer, opts: Required<CSSOptions>): Record<string, string> {
  const props: Record<string, string> = {}

  // Check if the group has auto-layout properties (cast to any for future-proofing)
  const auto = (layer as any).autoLayout as
    | {
        direction?: 'row' | 'column'
        gap?: number
        paddingTop?: number
        paddingRight?: number
        paddingBottom?: number
        paddingLeft?: number
        alignItems?: string
        justifyContent?: string
        wrap?: boolean
      }
    | undefined

  if (auto) {
    props['display'] = 'flex'
    if (auto.direction) {
      props['flex-direction'] = auto.direction
    }
    if (auto.gap !== undefined) {
      props['gap'] = u(auto.gap, opts)
    }
    if (
      auto.paddingTop !== undefined ||
      auto.paddingRight !== undefined ||
      auto.paddingBottom !== undefined ||
      auto.paddingLeft !== undefined
    ) {
      const pt = auto.paddingTop ?? 0
      const pr = auto.paddingRight ?? 0
      const pb = auto.paddingBottom ?? 0
      const pl = auto.paddingLeft ?? 0
      if (pt === pr && pr === pb && pb === pl) {
        props['padding'] = u(pt, opts)
      } else {
        props['padding'] = `${u(pt, opts)} ${u(pr, opts)} ${u(pb, opts)} ${u(pl, opts)}`
      }
    }
    if (auto.alignItems) {
      props['align-items'] = auto.alignItems
    }
    if (auto.justifyContent) {
      props['justify-content'] = auto.justifyContent
    }
    if (auto.wrap) {
      props['flex-wrap'] = 'wrap'
    }
  }

  return props
}

function propsToString(props: Record<string, string>, indent: string = '  '): string {
  return Object.entries(props)
    .map(([key, value]) => `${indent}${key}: ${value};`)
    .join('\n')
}

function sanitizeClassName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'layer'
  )
}

export function generateCSS(layer: Layer, options?: CSSOptions): string {
  const opts: Required<CSSOptions> = { ...DEFAULT_OPTIONS, ...options }
  let props: Record<string, string> = {}

  // Position
  if (opts.includePosition) {
    props['position'] = 'absolute'
    props['left'] = u(layer.transform.x, opts)
    props['top'] = u(layer.transform.y, opts)
  }

  // Opacity
  if (layer.opacity < 1) {
    props['opacity'] = String(Math.round(layer.opacity * 100) / 100)
  }

  // Rotation
  if (layer.transform.rotation !== 0) {
    props['transform'] = `rotate(${layer.transform.rotation}deg)`
  }

  // Skew
  const skews: string[] = []
  if (layer.transform.skewX) skews.push(`skewX(${layer.transform.skewX}deg)`)
  if (layer.transform.skewY) skews.push(`skewY(${layer.transform.skewY}deg)`)
  if (skews.length > 0) {
    const existing = props['transform'] ? props['transform'] + ' ' : ''
    props['transform'] = existing + skews.join(' ')
  }

  // Type-specific props
  switch (layer.type) {
    case 'vector':
      props = { ...props, ...generateVectorCSS(layer, opts) }
      break
    case 'text':
      props = { ...props, ...generateTextCSS(layer, opts) }
      break
    case 'group':
      props = { ...props, ...generateGroupCSS(layer, opts) }
      break
    default:
      break
  }

  // Effects
  if ((layer.effects ?? []).length > 0) {
    const effectProps = effectsToCSS(layer.effects ?? [], opts)
    props = { ...props, ...effectProps }
  }

  // Blend mode
  if (layer.blendMode !== 'normal') {
    props['mix-blend-mode'] = layer.blendMode
  }

  const className = sanitizeClassName(layer.name)
  return `.${className} {\n${propsToString(props)}\n}`
}
