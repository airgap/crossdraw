import type { Layer, Fill, ShadowParams, BlurParams } from '@/types'

export interface ReactOptions {
  styling: 'inline' | 'tailwind' | 'styled-components'
}

const DEFAULT_OPTIONS: ReactOptions = {
  styling: 'inline',
}

function sanitizeComponentName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '')
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Layer' + cleaned
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
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
      return `linear-gradient(${g.angle ?? 0}deg, ${stops})`
    }
    if (g.type === 'radial') {
      return `radial-gradient(circle, ${stops})`
    }
  }
  return 'transparent'
}

// ── Inline style generation ──

function buildInlineStyle(layer: Layer): Record<string, string | number> {
  const style: Record<string, string | number> = {}

  // Position
  style.position = 'absolute'
  style.left = layer.transform.x
  style.top = layer.transform.y

  if (layer.opacity < 1) {
    style.opacity = Math.round(layer.opacity * 100) / 100
  }

  if (layer.transform.rotation !== 0) {
    style.transform = `rotate(${layer.transform.rotation}deg)`
  }

  if (layer.blendMode !== 'normal') {
    style.mixBlendMode = layer.blendMode
  }

  switch (layer.type) {
    case 'vector': {
      if (layer.shapeParams) {
        style.width = layer.shapeParams.width
        style.height = layer.shapeParams.height
        if (layer.shapeParams.cornerRadius !== undefined) {
          if (typeof layer.shapeParams.cornerRadius === 'number') {
            style.borderRadius = layer.shapeParams.cornerRadius
          } else {
            const [tl, tr, br, bl] = layer.shapeParams.cornerRadius
            style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`
          }
        }
        if (layer.shapeParams.shapeType === 'ellipse') {
          style.borderRadius = '50%'
        }
      }
      if (layer.fill) {
        const fillValue = fillToCSS(layer.fill)
        if (layer.fill.type === 'gradient') {
          style.background = fillValue
        } else {
          style.backgroundColor = fillValue
        }
      }
      if (layer.stroke) {
        const color = hexToRGBA(layer.stroke.color, layer.stroke.opacity)
        const strokeStyle = layer.stroke.dasharray?.length ? 'dashed' : 'solid'
        style.border = `${layer.stroke.width}px ${strokeStyle} ${color}`
      }
      break
    }
    case 'text': {
      style.fontFamily = `'${layer.fontFamily}', sans-serif`
      style.fontSize = layer.fontSize
      if (layer.fontWeight !== 'normal') style.fontWeight = layer.fontWeight
      if (layer.fontStyle !== 'normal') style.fontStyle = layer.fontStyle
      style.textAlign = layer.textAlign
      style.lineHeight = layer.lineHeight
      if (layer.letterSpacing !== 0) style.letterSpacing = layer.letterSpacing
      if (layer.color) style.color = layer.color
      if (layer.textDecoration && layer.textDecoration !== 'none')
        style.textDecoration = layer.textDecoration
      if (layer.textTransform && layer.textTransform !== 'none')
        style.textTransform = layer.textTransform
      break
    }
    case 'group': {
      const auto = (layer as any).autoLayout as
        | { direction?: string; gap?: number; alignItems?: string; justifyContent?: string; wrap?: boolean; paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number }
        | undefined
      if (auto) {
        style.display = 'flex'
        if (auto.direction) style.flexDirection = auto.direction
        if (auto.gap !== undefined) style.gap = auto.gap
        if (auto.alignItems) style.alignItems = auto.alignItems
        if (auto.justifyContent) style.justifyContent = auto.justifyContent
        if (auto.wrap) style.flexWrap = 'wrap'
        if (auto.paddingTop !== undefined || auto.paddingRight !== undefined || auto.paddingBottom !== undefined || auto.paddingLeft !== undefined) {
          const pt = auto.paddingTop ?? 0
          const pr = auto.paddingRight ?? 0
          const pb = auto.paddingBottom ?? 0
          const pl = auto.paddingLeft ?? 0
          style.padding = `${pt}px ${pr}px ${pb}px ${pl}px`
        }
      }
      break
    }
  }

  // Effects
  for (const effect of layer.effects) {
    if (!effect.enabled) continue
    if (effect.type === 'drop-shadow' || effect.type === 'shadow') {
      const p = effect.params as ShadowParams
      const color = hexToRGBA(p.color, p.opacity * effect.opacity)
      const spread = 'spread' in p ? ` ${p.spread}px` : ''
      style.boxShadow = `${p.offsetX}px ${p.offsetY}px ${p.blurRadius}px${spread} ${color}`
    }
    if (effect.type === 'blur') {
      const p = effect.params as BlurParams
      style.filter = `blur(${p.radius}px)`
    }
  }

  return style
}

function styleObjectToJSX(style: Record<string, string | number>, indent: string): string {
  const entries = Object.entries(style)
  if (entries.length === 0) return '{{}}'
  const lines = entries.map(([key, value]) => {
    const jsValue = typeof value === 'number' ? String(value) : `'${value}'`
    return `${indent}  ${key}: ${jsValue},`
  })
  return `{\{\n${lines.join('\n')}\n${indent}\}\}`
}

// ── Tailwind class mapping ──

function hexToTailwindColor(hex: string): string | null {
  // Common Tailwind color mappings
  const colors: Record<string, string> = {
    '#000000': 'black',
    '#ffffff': 'white',
    '#ef4444': 'red-500',
    '#f97316': 'orange-500',
    '#eab308': 'yellow-500',
    '#22c55e': 'green-500',
    '#3b82f6': 'blue-500',
    '#6366f1': 'indigo-500',
    '#8b5cf6': 'violet-500',
    '#a855f7': 'purple-500',
    '#ec4899': 'pink-500',
    '#6b7280': 'gray-500',
    '#f3f4f6': 'gray-100',
    '#e5e7eb': 'gray-200',
    '#d1d5db': 'gray-300',
    '#9ca3af': 'gray-400',
    '#4b5563': 'gray-600',
    '#374151': 'gray-700',
    '#1f2937': 'gray-800',
    '#111827': 'gray-900',
  }
  return colors[hex.toLowerCase()] ?? null
}

function sizeToPx(value: number): string {
  // Tailwind spacing scale
  const scale: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2',
    10: '2.5', 12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6',
    28: '7', 32: '8', 36: '9', 40: '10', 44: '11', 48: '12',
    56: '14', 64: '16', 80: '20', 96: '24', 112: '28',
    128: '32', 144: '36', 160: '40', 176: '44', 192: '48',
    208: '52', 224: '56', 240: '60', 256: '64', 288: '72',
    320: '80', 384: '96',
  }
  return scale[value] ?? `[${value}px]`
}

function buildTailwindClasses(layer: Layer): string[] {
  const classes: string[] = []

  classes.push('absolute')
  classes.push(`left-${sizeToPx(layer.transform.x)}`)
  classes.push(`top-${sizeToPx(layer.transform.y)}`)

  if (layer.opacity < 1) {
    classes.push(`opacity-${Math.round(layer.opacity * 100)}`)
  }

  if (layer.transform.rotation !== 0) {
    classes.push(`rotate-[${layer.transform.rotation}deg]`)
  }

  switch (layer.type) {
    case 'vector': {
      if (layer.shapeParams) {
        classes.push(`w-${sizeToPx(layer.shapeParams.width)}`)
        classes.push(`h-${sizeToPx(layer.shapeParams.height)}`)
        if (layer.shapeParams.cornerRadius !== undefined) {
          if (typeof layer.shapeParams.cornerRadius === 'number') {
            const r = layer.shapeParams.cornerRadius
            if (r <= 2) classes.push('rounded-sm')
            else if (r <= 4) classes.push('rounded')
            else if (r <= 6) classes.push('rounded-md')
            else if (r <= 8) classes.push('rounded-lg')
            else if (r <= 12) classes.push('rounded-xl')
            else if (r <= 16) classes.push('rounded-2xl')
            else if (r <= 24) classes.push('rounded-3xl')
            else classes.push(`rounded-[${r}px]`)
          } else {
            const [tl, tr, br, bl] = layer.shapeParams.cornerRadius
            classes.push(`rounded-tl-[${tl}px]`, `rounded-tr-[${tr}px]`, `rounded-br-[${br}px]`, `rounded-bl-[${bl}px]`)
          }
        }
        if (layer.shapeParams.shapeType === 'ellipse') {
          classes.push('rounded-full')
        }
      }
      if (layer.fill?.type === 'solid' && layer.fill.color) {
        const tw = hexToTailwindColor(layer.fill.color)
        if (tw) classes.push(`bg-${tw}`)
        else classes.push(`bg-[${layer.fill.color}]`)
      }
      if (layer.stroke) {
        classes.push(`border-${layer.stroke.width === 1 ? '' : `[${layer.stroke.width}px]`}`.replace('border-', layer.stroke.width === 1 ? 'border' : `border-[${layer.stroke.width}px]`))
        const tw = hexToTailwindColor(layer.stroke.color)
        if (tw) classes.push(`border-${tw}`)
        else classes.push(`border-[${layer.stroke.color}]`)
      }
      break
    }
    case 'text': {
      classes.push(`text-[${layer.fontSize}px]`)
      if (layer.fontWeight === 'bold') classes.push('font-bold')
      if (layer.fontStyle === 'italic') classes.push('italic')
      if (layer.textAlign === 'center') classes.push('text-center')
      else if (layer.textAlign === 'right') classes.push('text-right')
      if (layer.color) {
        const tw = hexToTailwindColor(layer.color)
        if (tw) classes.push(`text-${tw}`)
        else classes.push(`text-[${layer.color}]`)
      }
      if (layer.lineHeight !== 1) {
        classes.push(`leading-[${layer.lineHeight}]`)
      }
      if (layer.letterSpacing !== 0) {
        classes.push(`tracking-[${layer.letterSpacing}px]`)
      }
      if (layer.textDecoration === 'underline') classes.push('underline')
      if (layer.textDecoration === 'line-through') classes.push('line-through')
      if (layer.textTransform === 'uppercase') classes.push('uppercase')
      if (layer.textTransform === 'lowercase') classes.push('lowercase')
      if (layer.textTransform === 'capitalize') classes.push('capitalize')
      break
    }
    case 'group': {
      const auto = (layer as any).autoLayout as
        | { direction?: string; gap?: number; alignItems?: string; justifyContent?: string; wrap?: boolean }
        | undefined
      if (auto) {
        classes.push('flex')
        if (auto.direction === 'column') classes.push('flex-col')
        if (auto.gap !== undefined) classes.push(`gap-${sizeToPx(auto.gap)}`)
        if (auto.alignItems === 'center') classes.push('items-center')
        else if (auto.alignItems === 'flex-end') classes.push('items-end')
        else if (auto.alignItems === 'stretch') classes.push('items-stretch')
        if (auto.justifyContent === 'center') classes.push('justify-center')
        else if (auto.justifyContent === 'flex-end') classes.push('justify-end')
        else if (auto.justifyContent === 'space-between') classes.push('justify-between')
        else if (auto.justifyContent === 'space-around') classes.push('justify-around')
        if (auto.wrap) classes.push('flex-wrap')
      }
      break
    }
  }

  return classes
}

// ── Styled-components ──

function buildStyledCSS(layer: Layer): string {
  const style = buildInlineStyle(layer)
  const lines: string[] = []
  for (const [key, value] of Object.entries(style)) {
    // Convert camelCase to kebab-case
    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    const cssValue = typeof value === 'number' ? `${value}px` : value
    lines.push(`  ${cssKey}: ${cssValue};`)
  }
  return lines.join('\n')
}

// ── Main generator ──

function renderInlineJSX(layer: Layer, indent: string = ''): string {
  const style = buildInlineStyle(layer)
  const styleStr = styleObjectToJSX(style, indent + '  ')

  switch (layer.type) {
    case 'text':
      return `${indent}<p style={${styleStr}}>\n${indent}  ${layer.text}\n${indent}</p>`
    case 'group': {
      const children = layer.children
        .map((child) => renderInlineJSX(child, indent + '  '))
        .join('\n')
      return `${indent}<div style={${styleStr}}>\n${children}\n${indent}</div>`
    }
    default:
      return `${indent}<div style={${styleStr}} />`
  }
}

function renderTailwindJSX(layer: Layer, indent: string = ''): string {
  const classes = buildTailwindClasses(layer)
  const classStr = classes.join(' ')

  switch (layer.type) {
    case 'text':
      return `${indent}<p className="${classStr}">\n${indent}  ${layer.text}\n${indent}</p>`
    case 'group': {
      const children = layer.children
        .map((child) => renderTailwindJSX(child, indent + '  '))
        .join('\n')
      return `${indent}<div className="${classStr}">\n${children}\n${indent}</div>`
    }
    default:
      return `${indent}<div className="${classStr}" />`
  }
}

function renderStyledComponents(layer: Layer, indent: string = ''): string {
  const componentName = sanitizeComponentName(layer.name)
  const styledCSS = buildStyledCSS(layer)

  let styledDef = `const Styled${componentName} = styled.div\`\n${styledCSS}\n\`;\n\n`

  switch (layer.type) {
    case 'text':
      styledDef = `const Styled${componentName} = styled.p\`\n${styledCSS}\n\`;\n\n`
      return `${styledDef}${indent}<Styled${componentName}>\n${indent}  ${layer.text}\n${indent}</Styled${componentName}>`
    case 'group': {
      const children = layer.children
        .map((child) => renderStyledComponents(child, indent + '  '))
        .join('\n')
      return `${styledDef}${indent}<Styled${componentName}>\n${children}\n${indent}</Styled${componentName}>`
    }
    default:
      return `${styledDef}${indent}<Styled${componentName} />`
  }
}

export function generateReact(layer: Layer, options?: Partial<ReactOptions>): string {
  const opts: ReactOptions = { ...DEFAULT_OPTIONS, ...options }
  const componentName = sanitizeComponentName(layer.name)

  let body: string
  switch (opts.styling) {
    case 'tailwind':
      body = renderTailwindJSX(layer, '    ')
      break
    case 'styled-components':
      body = renderStyledComponents(layer, '    ')
      break
    case 'inline':
    default:
      body = renderInlineJSX(layer, '    ')
      break
  }

  return `function ${componentName}() {\n  return (\n${body}\n  );\n}`
}
