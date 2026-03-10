import type { Layer, VectorLayer, TextLayer, GroupLayer, Fill, Effect, ShadowParams, BlurParams } from '@/types'

function hexToFlutterColor(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (opacity < 1) {
    const a = Math.round(opacity * 255)
    return `Color.fromARGB(${a}, ${r}, ${g}, ${b})`
  }
  // Use 0xFF prefix for full alpha
  const hexUpper = hex.slice(1).toUpperCase()
  return `Color(0xFF${hexUpper})`
}

function fillToFlutterColor(fill: Fill): string {
  if (fill.type === 'solid' && fill.color) {
    return hexToFlutterColor(fill.color, fill.opacity)
  }
  return 'Colors.transparent'
}

function fillToFlutterGradient(fill: Fill, indent: string): string | null {
  if (fill.type !== 'gradient' || !fill.gradient) return null
  const g = fill.gradient
  const stops = g.stops
    .map((s) => {
      const color = hexToFlutterColor(s.color, s.opacity * fill.opacity)
      return color
    })
    .join(', ')
  const offsets = g.stops.map((s) => s.offset.toFixed(2)).join(', ')

  if (g.type === 'linear') {
    return `${indent}gradient: LinearGradient(\n${indent}  colors: [${stops}],\n${indent}  stops: [${offsets}],\n${indent}),`
  }
  if (g.type === 'radial') {
    return `${indent}gradient: RadialGradient(\n${indent}  colors: [${stops}],\n${indent}  stops: [${offsets}],\n${indent}),`
  }
  return null
}

function borderRadiusToFlutter(cornerRadius: number | [number, number, number, number]): string {
  if (typeof cornerRadius === 'number') {
    return `BorderRadius.circular(${cornerRadius})`
  }
  const [tl, tr, br, bl] = cornerRadius
  if (tl === tr && tr === br && br === bl) {
    return `BorderRadius.circular(${tl})`
  }
  return `BorderRadius.only(
      topLeft: Radius.circular(${tl}),
      topRight: Radius.circular(${tr}),
      bottomRight: Radius.circular(${br}),
      bottomLeft: Radius.circular(${bl}),
    )`
}

function shadowsToFlutter(effects: Effect[], indent: string): string | null {
  const shadows: string[] = []
  for (const effect of effects) {
    if (!effect.enabled) continue
    if (effect.type === 'drop-shadow' || effect.type === 'shadow') {
      const p = effect.params as ShadowParams
      const color = hexToFlutterColor(p.color, p.opacity * effect.opacity)
      shadows.push(`${indent}  BoxShadow(
${indent}    color: ${color},
${indent}    blurRadius: ${p.blurRadius},
${indent}    offset: Offset(${p.offsetX}, ${p.offsetY}),
${indent}    spreadRadius: ${'spread' in p ? p.spread : 0},
${indent}  ),`)
    }
  }
  if (shadows.length === 0) return null
  return `${indent}boxShadow: [\n${shadows.join('\n')}\n${indent}],`
}

function generateVectorFlutter(layer: VectorLayer, indent: string): string {
  const lines: string[] = []
  const decorationParts: string[] = []
  const innerIndent = indent + '    '

  // Color/gradient
  if (layer.fill) {
    if (layer.fill.type === 'gradient' && layer.fill.gradient) {
      const grad = fillToFlutterGradient(layer.fill, innerIndent)
      if (grad) decorationParts.push(grad)
    } else {
      decorationParts.push(`${innerIndent}color: ${fillToFlutterColor(layer.fill)},`)
    }
  }

  // Border radius
  if (layer.shapeParams) {
    if (layer.shapeParams.shapeType === 'ellipse') {
      decorationParts.push(`${innerIndent}shape: BoxShape.circle,`)
    } else if (layer.shapeParams.cornerRadius !== undefined) {
      decorationParts.push(`${innerIndent}borderRadius: ${borderRadiusToFlutter(layer.shapeParams.cornerRadius)},`)
    }
  }

  // Border
  if (layer.stroke) {
    const color = hexToFlutterColor(layer.stroke.color, layer.stroke.opacity)
    decorationParts.push(`${innerIndent}border: Border.all(color: ${color}, width: ${layer.stroke.width}),`)
  }

  // Shadows
  const shadowStr = shadowsToFlutter(layer.effects, innerIndent)
  if (shadowStr) decorationParts.push(shadowStr)

  // Build Container
  lines.push(`${indent}Container(`)

  // Size
  if (layer.shapeParams) {
    lines.push(`${indent}  width: ${layer.shapeParams.width},`)
    lines.push(`${indent}  height: ${layer.shapeParams.height},`)
  }

  if (decorationParts.length > 0) {
    lines.push(`${indent}  decoration: BoxDecoration(`)
    lines.push(decorationParts.join('\n'))
    lines.push(`${indent}  ),`)
  }

  lines.push(`${indent})`)

  // Wrap in Transform if needed
  let result = lines.join('\n')

  if (layer.transform.rotation !== 0) {
    result = `${indent}Transform.rotate(\n${indent}  angle: ${((layer.transform.rotation * Math.PI) / 180).toFixed(4)},\n${indent}  child: ${result.trimStart()},\n${indent})`
  }

  if (layer.opacity < 1) {
    result = `${indent}Opacity(\n${indent}  opacity: ${layer.opacity},\n${indent}  child: ${result.trimStart()},\n${indent})`
  }

  // Blur
  for (const effect of layer.effects) {
    if (!effect.enabled) continue
    if (effect.type === 'blur') {
      const p = effect.params as BlurParams
      result = `${indent}ImageFiltered(\n${indent}  imageFilter: ImageFilter.blur(sigmaX: ${p.radius}, sigmaY: ${p.radius}),\n${indent}  child: ${result.trimStart()},\n${indent})`
    }
  }

  return result
}

function generateTextFlutter(layer: TextLayer, indent: string): string {
  const lines: string[] = []
  const escapedText = layer.text.replace(/'/g, "\\'")

  const styleParts: string[] = []
  styleParts.push(`${indent}    fontSize: ${layer.fontSize},`)
  styleParts.push(`${indent}    fontFamily: '${layer.fontFamily}',`)
  if (layer.fontWeight === 'bold') {
    styleParts.push(`${indent}    fontWeight: FontWeight.bold,`)
  }
  if (layer.fontStyle === 'italic') {
    styleParts.push(`${indent}    fontStyle: FontStyle.italic,`)
  }
  if (layer.color) {
    styleParts.push(`${indent}    color: ${hexToFlutterColor(layer.color, 1)},`)
  }
  if (layer.letterSpacing !== 0) {
    styleParts.push(`${indent}    letterSpacing: ${layer.letterSpacing},`)
  }
  if (layer.lineHeight !== 1) {
    styleParts.push(`${indent}    height: ${layer.lineHeight},`)
  }
  if (layer.textDecoration === 'underline') {
    styleParts.push(`${indent}    decoration: TextDecoration.underline,`)
  } else if (layer.textDecoration === 'line-through') {
    styleParts.push(`${indent}    decoration: TextDecoration.lineThrough,`)
  }

  // Text align
  let textAlign = 'TextAlign.left'
  if (layer.textAlign === 'center') textAlign = 'TextAlign.center'
  else if (layer.textAlign === 'right') textAlign = 'TextAlign.right'

  lines.push(`${indent}Text(`)
  lines.push(`${indent}  '${escapedText}',`)
  lines.push(`${indent}  textAlign: ${textAlign},`)
  lines.push(`${indent}  style: TextStyle(`)
  lines.push(styleParts.join('\n'))
  lines.push(`${indent}  ),`)
  lines.push(`${indent})`)

  let result = lines.join('\n')

  if (layer.opacity < 1) {
    result = `${indent}Opacity(\n${indent}  opacity: ${layer.opacity},\n${indent}  child: ${result.trimStart()},\n${indent})`
  }

  return result
}

function generateGroupFlutter(layer: GroupLayer, indent: string): string {
  const auto = (layer as any).autoLayout as
    | {
        direction?: string
        gap?: number
        alignItems?: string
        justifyContent?: string
        paddingTop?: number
        paddingRight?: number
        paddingBottom?: number
        paddingLeft?: number
      }
    | undefined

  const childIndent = indent + '    '
  const children = layer.children.map((child) => generateFlutterBody(child, childIndent)).join(',\n')

  if (auto) {
    const isColumn = auto.direction === 'column'
    const widgetName = isColumn ? 'Column' : 'Row'

    // Main axis alignment
    let mainAxis = 'MainAxisAlignment.start'
    if (auto.justifyContent === 'center') mainAxis = 'MainAxisAlignment.center'
    else if (auto.justifyContent === 'flex-end') mainAxis = 'MainAxisAlignment.end'
    else if (auto.justifyContent === 'space-between') mainAxis = 'MainAxisAlignment.spaceBetween'
    else if (auto.justifyContent === 'space-around') mainAxis = 'MainAxisAlignment.spaceAround'

    // Cross axis alignment
    let crossAxis = 'CrossAxisAlignment.start'
    if (auto.alignItems === 'center') crossAxis = 'CrossAxisAlignment.center'
    else if (auto.alignItems === 'flex-end') crossAxis = 'CrossAxisAlignment.end'
    else if (auto.alignItems === 'stretch') crossAxis = 'CrossAxisAlignment.stretch'

    const lines: string[] = []

    // Wrap in Padding if needed
    const pt = auto.paddingTop ?? 0
    const pr = auto.paddingRight ?? 0
    const pb = auto.paddingBottom ?? 0
    const pl = auto.paddingLeft ?? 0
    const hasPadding = pt > 0 || pr > 0 || pb > 0 || pl > 0

    if (hasPadding) {
      lines.push(`${indent}Padding(`)
      lines.push(`${indent}  padding: EdgeInsets.fromLTRB(${pl}, ${pt}, ${pr}, ${pb}),`)
      lines.push(`${indent}  child: ${widgetName}(`)
    } else {
      lines.push(`${indent}${widgetName}(`)
    }

    const innerIndent = hasPadding ? `${indent}    ` : `${indent}  `
    lines.push(`${innerIndent}mainAxisAlignment: ${mainAxis},`)
    lines.push(`${innerIndent}crossAxisAlignment: ${crossAxis},`)

    // Insert SizedBox spacers for gap
    if (auto.gap && auto.gap > 0) {
      const spacer = isColumn ? `SizedBox(height: ${auto.gap})` : `SizedBox(width: ${auto.gap})`
      const spacedChildren = layer.children
        .map((child) => generateFlutterBody(child, innerIndent + '  '))
        .join(`,\n${innerIndent}  ${spacer},\n`)
      lines.push(`${innerIndent}children: [`)
      lines.push(spacedChildren)
      lines.push(`${innerIndent}],`)
    } else {
      lines.push(`${innerIndent}children: [`)
      lines.push(children)
      lines.push(`${innerIndent}],`)
    }

    if (hasPadding) {
      lines.push(`${indent}  ),`)
      lines.push(`${indent})`)
    } else {
      lines.push(`${indent})`)
    }

    return lines.join('\n')
  }

  // No auto-layout: use Stack
  const lines: string[] = []
  lines.push(`${indent}Stack(`)
  lines.push(`${indent}  children: [`)
  lines.push(children)
  lines.push(`${indent}  ],`)
  lines.push(`${indent})`)
  return lines.join('\n')
}

function generateFlutterBody(layer: Layer, indent: string = ''): string {
  switch (layer.type) {
    case 'vector':
      return generateVectorFlutter(layer, indent)
    case 'text':
      return generateTextFlutter(layer, indent)
    case 'group':
      return generateGroupFlutter(layer, indent)
    default:
      return `${indent}// Unsupported layer type: ${layer.type}`
  }
}

function sanitizeWidgetName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '')
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Layer' + cleaned
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

export function generateFlutter(layer: Layer): string {
  const widgetName = sanitizeWidgetName(layer.name)
  const body = generateFlutterBody(layer, '    ')

  return `class ${widgetName} extends StatelessWidget {
  const ${widgetName}({super.key});

  @override
  Widget build(BuildContext context) {
    return ${body.trimStart()};
  }
}`
}
