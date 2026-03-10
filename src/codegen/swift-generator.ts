import type { Layer, VectorLayer, TextLayer, GroupLayer, Fill, Effect, ShadowParams, BlurParams } from '@/types'

function hexToSwiftUIColor(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const rf = (r / 255).toFixed(3)
  const gf = (g / 255).toFixed(3)
  const bf = (b / 255).toFixed(3)
  if (opacity < 1) {
    return `Color(red: ${rf}, green: ${gf}, blue: ${bf}).opacity(${opacity})`
  }
  return `Color(red: ${rf}, green: ${gf}, blue: ${bf})`
}

function fillToSwiftUI(fill: Fill): string {
  if (fill.type === 'solid' && fill.color) {
    return hexToSwiftUIColor(fill.color, fill.opacity)
  }
  if (fill.type === 'gradient' && fill.gradient) {
    const g = fill.gradient
    const stops = g.stops
      .map((s) => {
        const color = hexToSwiftUIColor(s.color, s.opacity * fill.opacity)
        return `.init(color: ${color}, location: ${s.offset.toFixed(2)})`
      })
      .join(', ')

    if (g.type === 'linear') {
      return `LinearGradient(stops: [${stops}], startPoint: .leading, endPoint: .trailing)`
    }
    if (g.type === 'radial') {
      return `RadialGradient(stops: [${stops}], center: .center, startRadius: 0, endRadius: 100)`
    }
  }
  return 'Color.clear'
}

function effectModifiers(effects: Effect[], indent: string): string[] {
  const mods: string[] = []
  for (const effect of effects) {
    if (!effect.enabled) continue
    if (effect.type === 'drop-shadow' || effect.type === 'shadow') {
      const p = effect.params as ShadowParams
      const color = hexToSwiftUIColor(p.color, p.opacity * effect.opacity)
      mods.push(`${indent}.shadow(color: ${color}, radius: ${p.blurRadius}, x: ${p.offsetX}, y: ${p.offsetY})`)
    }
    if (effect.type === 'blur') {
      const p = effect.params as BlurParams
      mods.push(`${indent}.blur(radius: ${p.radius})`)
    }
  }
  return mods
}

function generateVectorSwiftUI(layer: VectorLayer, indent: string): string {
  const lines: string[] = []
  let shape = 'Rectangle()'

  if (layer.shapeParams) {
    if (layer.shapeParams.shapeType === 'ellipse') {
      shape = 'Ellipse()'
    } else if (layer.shapeParams.shapeType === 'rectangle') {
      if (layer.shapeParams.cornerRadius !== undefined) {
        const cr =
          typeof layer.shapeParams.cornerRadius === 'number'
            ? layer.shapeParams.cornerRadius
            : layer.shapeParams.cornerRadius[0]
        shape = `RoundedRectangle(cornerRadius: ${cr})`
      }
    } else if (layer.shapeParams.shapeType === 'polygon') {
      // No built-in SwiftUI polygon; use a custom shape placeholder
      shape = `/* Polygon(sides: ${layer.shapeParams.sides ?? 5}) */ Rectangle()`
    } else if (layer.shapeParams.shapeType === 'star') {
      shape = `/* Star(points: ${layer.shapeParams.points ?? 5}) */ Rectangle()`
    }
  }

  lines.push(`${indent}${shape}`)

  // Fill
  if (layer.fill) {
    const fillValue = fillToSwiftUI(layer.fill)
    lines.push(`${indent}    .fill(${fillValue})`)
  }

  // Stroke
  if (layer.stroke) {
    const color = hexToSwiftUIColor(layer.stroke.color, layer.stroke.opacity)
    lines.push(`${indent}    .stroke(${color}, lineWidth: ${layer.stroke.width})`)
  }

  // Frame
  if (layer.shapeParams) {
    lines.push(`${indent}    .frame(width: ${layer.shapeParams.width}, height: ${layer.shapeParams.height})`)
  }

  // Position
  lines.push(`${indent}    .position(x: ${layer.transform.x}, y: ${layer.transform.y})`)

  // Rotation
  if (layer.transform.rotation !== 0) {
    lines.push(`${indent}    .rotationEffect(.degrees(${layer.transform.rotation}))`)
  }

  // Opacity
  if (layer.opacity < 1) {
    lines.push(`${indent}    .opacity(${layer.opacity})`)
  }

  // Effects
  lines.push(...effectModifiers(layer.effects, `${indent}    `))

  return lines.join('\n')
}

function generateTextSwiftUI(layer: TextLayer, indent: string): string {
  const lines: string[] = []
  const escapedText = layer.text.replace(/"/g, '\\"')

  lines.push(`${indent}Text("${escapedText}")`)
  lines.push(
    `${indent}    .font(.system(size: ${layer.fontSize}, weight: ${layer.fontWeight === 'bold' ? '.bold' : '.regular'}))`,
  )

  if (layer.fontStyle === 'italic') {
    lines.push(`${indent}    .italic()`)
  }

  if (layer.color) {
    const color = hexToSwiftUIColor(layer.color, 1)
    lines.push(`${indent}    .foregroundColor(${color})`)
  }

  // Text align
  if (layer.textAlign === 'center') {
    lines.push(`${indent}    .multilineTextAlignment(.center)`)
  } else if (layer.textAlign === 'right') {
    lines.push(`${indent}    .multilineTextAlignment(.trailing)`)
  }

  // Line spacing
  if (layer.lineHeight !== 1) {
    const spacing = (layer.lineHeight - 1) * layer.fontSize
    lines.push(`${indent}    .lineSpacing(${Math.round(spacing)})`)
  }

  // Letter spacing
  if (layer.letterSpacing !== 0) {
    lines.push(`${indent}    .tracking(${layer.letterSpacing})`)
  }

  // Text decoration
  if (layer.textDecoration === 'underline') {
    lines.push(`${indent}    .underline()`)
  } else if (layer.textDecoration === 'line-through') {
    lines.push(`${indent}    .strikethrough()`)
  }

  // Text transform
  if (layer.textTransform === 'uppercase') {
    lines.push(`${indent}    .textCase(.uppercase)`)
  } else if (layer.textTransform === 'lowercase') {
    lines.push(`${indent}    .textCase(.lowercase)`)
  }

  // Position
  lines.push(`${indent}    .position(x: ${layer.transform.x}, y: ${layer.transform.y})`)

  if (layer.opacity < 1) {
    lines.push(`${indent}    .opacity(${layer.opacity})`)
  }

  lines.push(...effectModifiers(layer.effects, `${indent}    `))

  return lines.join('\n')
}

function generateGroupSwiftUI(layer: GroupLayer, indent: string): string {
  const auto = (layer as any).autoLayout as { direction?: string; gap?: number; alignItems?: string } | undefined

  let stack = 'ZStack'
  let alignment = ''
  let spacing = ''

  if (auto) {
    if (auto.direction === 'column') {
      stack = 'VStack'
    } else {
      stack = 'HStack'
    }
    if (auto.gap !== undefined) {
      spacing = `spacing: ${auto.gap}`
    }
    if (auto.alignItems === 'center') {
      alignment = alignment ? `, alignment: .center` : `alignment: .center`
    } else if (auto.alignItems === 'flex-start') {
      alignment = `alignment: .leading`
    } else if (auto.alignItems === 'flex-end') {
      alignment = `alignment: .trailing`
    }
  }

  const params = [spacing, alignment].filter(Boolean).join(', ')
  const header = params ? `${stack}(${params})` : `${stack}`

  const children = layer.children.map((child) => generateSwiftUIBody(child, indent + '    ')).join('\n')

  const lines: string[] = []
  lines.push(`${indent}${header} {`)
  lines.push(children)
  lines.push(`${indent}}`)

  if (layer.opacity < 1) {
    lines.push(`${indent}.opacity(${layer.opacity})`)
  }

  lines.push(...effectModifiers(layer.effects, `${indent}`))

  return lines.join('\n')
}

function generateSwiftUIBody(layer: Layer, indent: string = ''): string {
  switch (layer.type) {
    case 'vector':
      return generateVectorSwiftUI(layer, indent)
    case 'text':
      return generateTextSwiftUI(layer, indent)
    case 'group':
      return generateGroupSwiftUI(layer, indent)
    default:
      return `${indent}// Unsupported layer type: ${layer.type}`
  }
}

function sanitizeViewName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '')
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Layer' + cleaned
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function generateSwiftUI(layer: Layer): string {
  const viewName = sanitizeViewName(layer.name)
  const body = generateSwiftUIBody(layer, '        ')

  return `struct ${viewName}: View {
    var body: some View {
${body}
    }
}`
}
