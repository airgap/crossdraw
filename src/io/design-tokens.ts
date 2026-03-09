/**
 * Design Tokens export — extracts colors, typography, and spacing from a
 * DesignDocument and serializes them into W3C JSON, CSS custom properties,
 * SCSS variables, or a Tailwind config extension.
 */

import type { DesignDocument, Layer, TextLayer } from '@/types/document'

// ── Public types ──

export interface DesignTokenSet {
  colors: Record<string, { value: string; description?: string }>
  typography: Record<
    string,
    {
      fontFamily: string
      fontSize: number
      fontWeight: string
      lineHeight: number
      letterSpacing: number
    }
  >
  spacing: Record<string, { value: number }>
}

// ── Helpers ──

/** Slugify a human-readable name into a kebab-case token key. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Recursively collect all TextLayers from a layer tree (handles groups and
 * symbol definitions).
 */
function collectTextLayers(layers: readonly Layer[]): TextLayer[] {
  const result: TextLayer[] = []
  for (const layer of layers) {
    if (layer.type === 'text') {
      result.push(layer)
    } else if (layer.type === 'group') {
      result.push(...collectTextLayers(layer.children))
    }
  }
  return result
}

/**
 * Build an auto-generated name for a typography token based on font size.
 * Larger sizes get "heading-N", medium sizes "subheading", and smaller sizes
 * "body-text" / "caption" / "small-text".
 */
function autoNameTypography(fontSize: number, fontWeight: string, index: number, total: number): string {
  if (total === 1) return 'body-text'

  // Sort by size descending — the caller passes an index within that order.
  if (fontSize >= 32) return index === 0 ? 'display' : `heading-${index}`
  if (fontSize >= 24) return `heading-${index || 1}`
  if (fontSize >= 18) return `subheading${index > 1 ? `-${index}` : ''}`
  if (fontSize >= 14) return fontWeight === 'bold' ? 'body-bold' : 'body-text'
  if (fontSize >= 11) return 'caption'
  return 'small-text'
}

/** Deduplicate a token key by appending a numeric suffix if needed. */
function dedup(key: string, existing: Set<string>): string {
  if (!existing.has(key)) {
    existing.add(key)
    return key
  }
  let n = 2
  while (existing.has(`${key}-${n}`)) n++
  const final = `${key}-${n}`
  existing.add(final)
  return final
}

// ── Extraction ──

export function extractDesignTokens(document: DesignDocument): DesignTokenSet {
  const colors: DesignTokenSet['colors'] = {}
  const typography: DesignTokenSet['typography'] = {}
  const spacing: DesignTokenSet['spacing'] = {}

  // --- Colors from document assets ---
  const colorKeys = new Set<string>()
  for (const nc of document.assets.colors) {
    const key = dedup(slugify(nc.name) || 'color', colorKeys)
    colors[key] = {
      value: nc.value,
      ...(nc.group ? { description: `Group: ${nc.group}` } : {}),
    }
  }

  // --- Typography: scan all TextLayers across artboards ---
  const allTextLayers: TextLayer[] = []
  for (const artboard of document.artboards) {
    allTextLayers.push(...collectTextLayers(artboard.layers))
  }
  // Also scan symbol definitions
  if (document.symbols) {
    for (const sym of document.symbols) {
      allTextLayers.push(...collectTextLayers(sym.layers))
    }
  }

  // Deduplicate by (fontFamily, fontSize, fontWeight) tuple
  const seen = new Map<string, TextLayer>()
  for (const tl of allTextLayers) {
    const sig = `${tl.fontFamily}|${tl.fontSize}|${tl.fontWeight}`
    if (!seen.has(sig)) {
      seen.set(sig, tl)
    }
  }

  // Sort by fontSize descending so larger sizes get "heading" names
  const unique = [...seen.values()].sort((a, b) => b.fontSize - a.fontSize)

  const typoKeys = new Set<string>()
  for (let i = 0; i < unique.length; i++) {
    const tl = unique[i]!
    const baseName = autoNameTypography(tl.fontSize, tl.fontWeight, i, unique.length)
    const key = dedup(baseName, typoKeys)
    typography[key] = {
      fontFamily: tl.fontFamily,
      fontSize: tl.fontSize,
      fontWeight: tl.fontWeight,
      lineHeight: tl.lineHeight,
      letterSpacing: tl.letterSpacing,
    }
  }

  // --- Spacing: placeholder for future ---
  // (No direct spacing concept in the current document model.)

  return { colors, typography, spacing }
}

// ── Export formats ──

/**
 * W3C Design Tokens Community Group format.
 * @see https://design-tokens.github.io/community-group/format/
 */
export function exportTokensAsJSON(tokens: DesignTokenSet): string {
  const out: Record<string, unknown> = {}

  // Colors
  if (Object.keys(tokens.colors).length > 0) {
    const colorGroup: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(tokens.colors)) {
      const token: Record<string, string> = {
        $value: val.value,
        $type: 'color',
      }
      if (val.description) token.$description = val.description
      colorGroup[key] = token
    }
    out.color = colorGroup
  }

  // Typography
  if (Object.keys(tokens.typography).length > 0) {
    const typoGroup: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(tokens.typography)) {
      typoGroup[key] = {
        $value: {
          fontFamily: val.fontFamily,
          fontSize: `${val.fontSize}px`,
          fontWeight: val.fontWeight === 'bold' ? '700' : '400',
          lineHeight: `${val.lineHeight}`,
          letterSpacing: `${val.letterSpacing}px`,
        },
        $type: 'typography',
      }
    }
    out.typography = typoGroup
  }

  // Spacing
  if (Object.keys(tokens.spacing).length > 0) {
    const spacingGroup: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(tokens.spacing)) {
      spacingGroup[key] = {
        $value: `${val.value}px`,
        $type: 'dimension',
      }
    }
    out.spacing = spacingGroup
  }

  return JSON.stringify(out, null, 2)
}

/**
 * CSS custom properties inside a `:root` block.
 */
export function exportTokensAsCSS(tokens: DesignTokenSet): string {
  const lines: string[] = [':root {']

  // Colors
  for (const [key, val] of Object.entries(tokens.colors)) {
    lines.push(`  --color-${key}: ${val.value};`)
  }

  // Typography
  for (const [key, val] of Object.entries(tokens.typography)) {
    lines.push(`  --font-${key}-family: ${val.fontFamily};`)
    lines.push(`  --font-${key}-size: ${val.fontSize}px;`)
    lines.push(`  --font-${key}-weight: ${val.fontWeight === 'bold' ? '700' : '400'};`)
    lines.push(`  --font-${key}-line-height: ${val.lineHeight};`)
    lines.push(`  --font-${key}-letter-spacing: ${val.letterSpacing}px;`)
  }

  // Spacing
  for (const [key, val] of Object.entries(tokens.spacing)) {
    lines.push(`  --spacing-${key}: ${val.value}px;`)
  }

  lines.push('}')
  return lines.join('\n') + '\n'
}

/**
 * SCSS variables.
 */
export function exportTokensAsSCSS(tokens: DesignTokenSet): string {
  const lines: string[] = ['// Design Tokens — generated by Crossdraw', '']

  // Colors
  if (Object.keys(tokens.colors).length > 0) {
    lines.push('// Colors')
    for (const [key, val] of Object.entries(tokens.colors)) {
      lines.push(`$color-${key}: ${val.value};`)
    }
    lines.push('')
  }

  // Typography
  if (Object.keys(tokens.typography).length > 0) {
    lines.push('// Typography')
    for (const [key, val] of Object.entries(tokens.typography)) {
      lines.push(`$font-${key}-family: ${val.fontFamily};`)
      lines.push(`$font-${key}-size: ${val.fontSize}px;`)
      lines.push(`$font-${key}-weight: ${val.fontWeight === 'bold' ? '700' : '400'};`)
      lines.push(`$font-${key}-line-height: ${val.lineHeight};`)
      lines.push(`$font-${key}-letter-spacing: ${val.letterSpacing}px;`)
    }
    lines.push('')
  }

  // Spacing
  if (Object.keys(tokens.spacing).length > 0) {
    lines.push('// Spacing')
    for (const [key, val] of Object.entries(tokens.spacing)) {
      lines.push(`$spacing-${key}: ${val.value}px;`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Tailwind CSS config extension (`module.exports = { theme: { extend: ... } }`).
 */
export function exportTokensAsTailwind(tokens: DesignTokenSet): string {
  const extend: Record<string, unknown> = {}

  // Colors
  if (Object.keys(tokens.colors).length > 0) {
    const colors: Record<string, string> = {}
    for (const [key, val] of Object.entries(tokens.colors)) {
      colors[key] = val.value
    }
    extend.colors = colors
  }

  // Typography → fontSize map (Tailwind uses fontSize key)
  if (Object.keys(tokens.typography).length > 0) {
    const fontSize: Record<string, [string, Record<string, string>]> = {}
    for (const [key, val] of Object.entries(tokens.typography)) {
      fontSize[key] = [
        `${val.fontSize}px`,
        {
          lineHeight: `${val.lineHeight}`,
          letterSpacing: `${val.letterSpacing}px`,
          fontWeight: val.fontWeight === 'bold' ? '700' : '400',
        },
      ]
    }
    extend.fontSize = fontSize

    // Also add fontFamily entries
    const fontFamily: Record<string, string[]> = {}
    const seenFamilies = new Set<string>()
    for (const val of Object.values(tokens.typography)) {
      if (!seenFamilies.has(val.fontFamily)) {
        seenFamilies.add(val.fontFamily)
        const familyKey = slugify(val.fontFamily) || 'sans'
        fontFamily[familyKey] = [val.fontFamily]
      }
    }
    if (Object.keys(fontFamily).length > 0) {
      extend.fontFamily = fontFamily
    }
  }

  // Spacing
  if (Object.keys(tokens.spacing).length > 0) {
    const spacing: Record<string, string> = {}
    for (const [key, val] of Object.entries(tokens.spacing)) {
      spacing[key] = `${val.value}px`
    }
    extend.spacing = spacing
  }

  // Build the config string with readable formatting
  const inner = JSON.stringify({ theme: { extend } }, null, 2)
  // Convert JSON to JS module syntax
  return `module.exports = ${inner}\n`
}

// ── Download helper ──

export function downloadTokenFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
