/**
 * Code Generation (#96)
 *
 * Converts layer properties to platform-specific code snippets.
 *
 * Supported targets:
 * - CSS (web styling)
 * - SwiftUI (iOS/macOS native)
 * - Android XML (Android layout)
 */

import type { Layer, VectorLayer, TextLayer, RasterLayer, GroupLayer, Fill, Stroke, Transform } from '@/types'

// ── CSS Generation ───────────────────────────────────────────────────────────

function transformToCSS(t: Transform): string[] {
  const props: string[] = []
  const transforms: string[] = []

  props.push(`left: ${t.x}px;`)
  props.push(`top: ${t.y}px;`)

  if (t.scaleX !== 1 || t.scaleY !== 1) {
    transforms.push(`scale(${t.scaleX}, ${t.scaleY})`)
  }
  if (t.rotation !== 0) {
    transforms.push(`rotate(${t.rotation}deg)`)
  }
  if (t.skewX) {
    transforms.push(`skewX(${t.skewX}deg)`)
  }
  if (t.skewY) {
    transforms.push(`skewY(${t.skewY}deg)`)
  }
  if (transforms.length > 0) {
    props.push(`transform: ${transforms.join(' ')};`)
  }

  return props
}

function fillToCSS(fill: Fill | null): string[] {
  if (!fill) return []
  if (fill.type === 'solid' && fill.color) {
    const opacity = fill.opacity < 1 ? ` /* opacity: ${fill.opacity} */` : ''
    return [`background-color: ${fill.color};${opacity}`]
  }
  if (fill.type === 'gradient' && fill.gradient) {
    const g = fill.gradient
    const stops = g.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')
    if (g.type === 'linear') {
      return [`background: linear-gradient(${g.angle ?? 0}deg, ${stops});`]
    }
    if (g.type === 'radial') {
      return [`background: radial-gradient(circle, ${stops});`]
    }
  }
  return []
}

function strokeToCSS(stroke: Stroke | null): string[] {
  if (!stroke) return []
  const props: string[] = []
  props.push(`border: ${stroke.width}px solid ${stroke.color};`)
  if (stroke.dasharray && stroke.dasharray.length > 0) {
    props.push(`/* dash: ${stroke.dasharray.join(' ')} */`)
  }
  return props
}

export function generateCSS(layer: Layer): string {
  const lines: string[] = []
  const className = layer.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
  lines.push(`.${className} {`)
  lines.push(`  position: absolute;`)

  // Transform
  lines.push(...transformToCSS(layer.transform).map((l) => `  ${l}`))

  // Opacity
  if (layer.opacity < 1) {
    lines.push(`  opacity: ${layer.opacity};`)
  }

  // Blend mode
  if (layer.blendMode !== 'normal') {
    lines.push(`  mix-blend-mode: ${layer.blendMode};`)
  }

  // Visibility
  if (!layer.visible) {
    lines.push(`  display: none;`)
  }

  // Type-specific
  if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    lines.push(...fillToCSS(vl.fill).map((l) => `  ${l}`))
    lines.push(...strokeToCSS(vl.stroke).map((l) => `  ${l}`))
    if (vl.shapeParams) {
      const sp = vl.shapeParams
      lines.push(`  width: ${sp.width}px;`)
      lines.push(`  height: ${sp.height}px;`)
      if (sp.shapeType === 'ellipse') {
        lines.push(`  border-radius: 50%;`)
      } else if (sp.cornerRadius) {
        const r =
          typeof sp.cornerRadius === 'number' ? `${sp.cornerRadius}px` : sp.cornerRadius.map((v) => `${v}px`).join(' ')
        lines.push(`  border-radius: ${r};`)
      }
    }
  }

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    lines.push(`  font-family: '${tl.fontFamily}';`)
    lines.push(`  font-size: ${tl.fontSize}px;`)
    lines.push(`  font-weight: ${tl.fontWeight};`)
    if (tl.fontStyle !== 'normal') lines.push(`  font-style: ${tl.fontStyle};`)
    lines.push(`  color: ${tl.color};`)
    lines.push(`  text-align: ${tl.textAlign};`)
    if (tl.lineHeight !== 1) lines.push(`  line-height: ${tl.lineHeight};`)
    if (tl.letterSpacing !== 0) lines.push(`  letter-spacing: ${tl.letterSpacing}px;`)
    if (tl.textDecoration && tl.textDecoration !== 'none') {
      lines.push(`  text-decoration: ${tl.textDecoration};`)
    }
    if (tl.textTransform && tl.textTransform !== 'none') {
      lines.push(`  text-transform: ${tl.textTransform};`)
    }
  }

  if (layer.type === 'raster') {
    const rl = layer as RasterLayer
    lines.push(`  width: ${rl.width}px;`)
    lines.push(`  height: ${rl.height}px;`)
  }

  lines.push(`}`)
  return lines.join('\n')
}

// ── SwiftUI Generation ───────────────────────────────────────────────────────

function hexToSwiftUIColor(hex: string): string {
  const h = hex.replace('#', '')
  return `Color(hex: "0x${h}")`
}

export function generateSwiftUI(layer: Layer): string {
  const lines: string[] = []

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    lines.push(`Text("${tl.text}")`)
    lines.push(`  .font(.custom("${tl.fontFamily}", size: ${tl.fontSize}))`)
    if (tl.fontWeight === 'bold') lines.push(`  .fontWeight(.bold)`)
    if (tl.fontStyle === 'italic') lines.push(`  .italic()`)
    lines.push(`  .foregroundColor(${hexToSwiftUIColor(tl.color)})`)
    if (tl.letterSpacing !== 0) lines.push(`  .tracking(${tl.letterSpacing})`)
    if (tl.lineHeight !== 1) lines.push(`  .lineSpacing(${Math.round((tl.lineHeight - 1) * tl.fontSize)})`)
    const alignment = tl.textAlign === 'center' ? '.center' : tl.textAlign === 'right' ? '.trailing' : '.leading'
    lines.push(`  .multilineTextAlignment(${alignment})`)
  } else if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    if (vl.shapeParams?.shapeType === 'ellipse') {
      lines.push(`Ellipse()`)
    } else if (vl.shapeParams?.shapeType === 'rectangle') {
      const radius = typeof vl.shapeParams.cornerRadius === 'number' ? vl.shapeParams.cornerRadius : 0
      if (radius > 0) {
        lines.push(`RoundedRectangle(cornerRadius: ${radius})`)
      } else {
        lines.push(`Rectangle()`)
      }
    } else {
      lines.push(`Path { /* custom path */ }`)
    }

    if (vl.fill?.color) {
      lines.push(`  .fill(${hexToSwiftUIColor(vl.fill.color)})`)
    }
    if (vl.stroke) {
      lines.push(`  .stroke(${hexToSwiftUIColor(vl.stroke.color)}, lineWidth: ${vl.stroke.width})`)
    }
    if (vl.shapeParams) {
      lines.push(`  .frame(width: ${vl.shapeParams.width}, height: ${vl.shapeParams.height})`)
    }
  } else if (layer.type === 'raster') {
    const rl = layer as RasterLayer
    lines.push(`Image("${rl.name}")`)
    lines.push(`  .resizable()`)
    lines.push(`  .frame(width: ${rl.width}, height: ${rl.height})`)
  } else if (layer.type === 'group') {
    lines.push(`ZStack {`)
    const gl = layer as GroupLayer
    for (const child of gl.children) {
      lines.push(`  // ${child.name}`)
    }
    lines.push(`}`)
  } else {
    lines.push(`// Unsupported layer type: ${layer.type}`)
  }

  // Common modifiers
  if (layer.opacity < 1) {
    lines.push(`  .opacity(${layer.opacity})`)
  }
  const t = layer.transform
  if (t.rotation !== 0) {
    lines.push(`  .rotationEffect(.degrees(${t.rotation}))`)
  }
  lines.push(`  .offset(x: ${t.x}, y: ${t.y})`)

  return lines.join('\n')
}

// ── Android XML Generation ───────────────────────────────────────────────────

function hexToAndroidColor(hex: string): string {
  // Android uses #AARRGGBB format
  const h = hex.replace('#', '')
  return `#FF${h.toUpperCase()}`
}

export function generateXML(layer: Layer): string {
  const lines: string[] = []

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    lines.push(`<TextView`)
    lines.push(`  android:layout_width="wrap_content"`)
    lines.push(`  android:layout_height="wrap_content"`)
    lines.push(`  android:text="${tl.text}"`)
    lines.push(`  android:fontFamily="${tl.fontFamily}"`)
    lines.push(`  android:textSize="${tl.fontSize}sp"`)
    lines.push(`  android:textColor="${hexToAndroidColor(tl.color)}"`)
    if (tl.fontWeight === 'bold') lines.push(`  android:textStyle="bold"`)
    const gravity = tl.textAlign === 'center' ? 'center' : tl.textAlign === 'right' ? 'end' : 'start'
    lines.push(`  android:gravity="${gravity}"`)
    if (tl.letterSpacing !== 0) lines.push(`  android:letterSpacing="${(tl.letterSpacing / tl.fontSize).toFixed(2)}"`)
    if (layer.opacity < 1) lines.push(`  android:alpha="${layer.opacity}"`)
    const t = layer.transform
    if (t.rotation !== 0) lines.push(`  android:rotation="${t.rotation}"`)
    lines.push(`  android:translationX="${t.x}dp"`)
    lines.push(`  android:translationY="${t.y}dp"`)
    lines.push(`/>`)
  } else if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    lines.push(`<View`)
    lines.push(`  android:layout_width="${vl.shapeParams?.width ?? 100}dp"`)
    lines.push(`  android:layout_height="${vl.shapeParams?.height ?? 100}dp"`)
    if (vl.fill?.color) {
      lines.push(`  android:background="${hexToAndroidColor(vl.fill.color)}"`)
    }
    if (layer.opacity < 1) lines.push(`  android:alpha="${layer.opacity}"`)
    const t = layer.transform
    if (t.rotation !== 0) lines.push(`  android:rotation="${t.rotation}"`)
    lines.push(`  android:translationX="${t.x}dp"`)
    lines.push(`  android:translationY="${t.y}dp"`)
    lines.push(`/>`)
  } else if (layer.type === 'raster') {
    const rl = layer as RasterLayer
    lines.push(`<ImageView`)
    lines.push(`  android:layout_width="${rl.width}dp"`)
    lines.push(`  android:layout_height="${rl.height}dp"`)
    lines.push(`  android:src="@drawable/${rl.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}"`)
    if (layer.opacity < 1) lines.push(`  android:alpha="${layer.opacity}"`)
    const t = layer.transform
    if (t.rotation !== 0) lines.push(`  android:rotation="${t.rotation}"`)
    lines.push(`  android:translationX="${t.x}dp"`)
    lines.push(`  android:translationY="${t.y}dp"`)
    lines.push(`/>`)
  } else if (layer.type === 'group') {
    const gl = layer as GroupLayer
    lines.push(`<FrameLayout`)
    lines.push(`  android:layout_width="wrap_content"`)
    lines.push(`  android:layout_height="wrap_content">`)
    for (const child of gl.children) {
      lines.push(`  <!-- ${child.name} -->`)
    }
    lines.push(`</FrameLayout>`)
  } else {
    lines.push(`<!-- Unsupported layer type: ${layer.type} -->`)
  }

  return lines.join('\n')
}
