/**
 * Website Publishing / Export (#97)
 *
 * Converts a Crossdraw document (artboards) into a static website with
 * responsive HTML pages, CSS Grid layout, and exported image assets.
 *
 * Each artboard becomes a page. Layers are positioned using CSS Grid or
 * absolute positioning. Text layers become real HTML text elements. Raster
 * and vector layers are exported as image assets.
 */

import type { DesignDocument, Artboard, Layer, TextLayer, VectorLayer, RasterLayer, GroupLayer } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WebsiteExportResult {
  html: string
  css: string
  /** Map of asset filename → placeholder Blob (in real use, rendered content). */
  assets: Map<string, Blob>
}

export interface WebsiteExportSettings {
  /** Use CSS Grid for layout (true) or absolute positioning (false). */
  useGrid: boolean
  /** Include responsive meta viewport. */
  responsive: boolean
  /** Page title. */
  title: string
  /** CSS class prefix to avoid conflicts. */
  classPrefix: string
  /** Whether to inline CSS in the HTML or keep separate. */
  inlineCSS: boolean
  /** Generate navigation between pages. */
  generateNav: boolean
}

export const DEFAULT_WEBSITE_EXPORT_SETTINGS: WebsiteExportSettings = {
  useGrid: true,
  responsive: true,
  title: 'Exported Site',
  classPrefix: 'cd',
  inlineCSS: false,
  generateNav: true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeClassName(name: string, prefix: string): string {
  return prefix + '-' + name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
}

// ── Layer → HTML ─────────────────────────────────────────────────────────────

function layerToHTML(layer: Layer, settings: WebsiteExportSettings, assets: Map<string, Blob>): string {
  const cls = sanitizeClassName(layer.name, settings.classPrefix)

  if (!layer.visible) return `<!-- hidden: ${layer.name} -->`

  if (layer.type === 'text') {
    const tl = layer as TextLayer
    const tag = tl.fontSize >= 24 ? 'h2' : tl.fontSize >= 18 ? 'h3' : 'p'
    return `<${tag} class="${cls}">${escapeHtml(tl.text)}</${tag}>`
  }

  if (layer.type === 'raster') {
    const rl = layer as RasterLayer
    const filename = `${sanitizeId(rl.name)}.png`
    // Register asset placeholder
    assets.set(filename, new Blob([], { type: 'image/png' }))
    return `<img class="${cls}" src="assets/${filename}" alt="${escapeHtml(rl.name)}" width="${rl.width}" height="${rl.height}" />`
  }

  if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    if (vl.shapeParams) {
      // Simple shape → div with CSS styling
      return `<div class="${cls}"></div>`
    }
    // Complex vector → export as SVG asset
    const filename = `${sanitizeId(vl.name)}.svg`
    assets.set(filename, new Blob([], { type: 'image/svg+xml' }))
    return `<img class="${cls}" src="assets/${filename}" alt="${escapeHtml(vl.name)}" />`
  }

  if (layer.type === 'group') {
    const gl = layer as GroupLayer
    const children = gl.children.map((c) => layerToHTML(c, settings, assets)).join('\n    ')
    return `<div class="${cls}">\n    ${children}\n  </div>`
  }

  return `<!-- unsupported: ${layer.type} "${layer.name}" -->`
}

// ── Layer → CSS ──────────────────────────────────────────────────────────────

function layerToCSS(layer: Layer, settings: WebsiteExportSettings, artboard: Artboard): string {
  const cls = sanitizeClassName(layer.name, settings.classPrefix)
  const props: string[] = []

  if (!layer.visible) return ''

  if (settings.useGrid) {
    // Grid item positioning based on relative position
    const colStart = Math.max(1, Math.round((layer.transform.x / artboard.width) * 12) + 1)
    const rowStart = Math.max(1, Math.round((layer.transform.y / artboard.height) * 12) + 1)
    props.push(`grid-column: ${colStart}`)
    props.push(`grid-row: ${rowStart}`)
  } else {
    props.push(`position: absolute`)
    props.push(`left: ${layer.transform.x}px`)
    props.push(`top: ${layer.transform.y}px`)
  }

  if (layer.opacity < 1) {
    props.push(`opacity: ${layer.opacity}`)
  }

  if (layer.transform.rotation !== 0) {
    props.push(`transform: rotate(${layer.transform.rotation}deg)`)
  }

  // Type-specific
  if (layer.type === 'text') {
    const tl = layer as TextLayer
    props.push(`font-family: '${tl.fontFamily}', sans-serif`)
    props.push(`font-size: ${tl.fontSize}px`)
    props.push(`font-weight: ${tl.fontWeight}`)
    props.push(`color: ${tl.color}`)
    props.push(`text-align: ${tl.textAlign}`)
    if (tl.lineHeight !== 1) props.push(`line-height: ${tl.lineHeight}`)
    if (tl.letterSpacing !== 0) props.push(`letter-spacing: ${tl.letterSpacing}px`)
  }

  if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    if (vl.shapeParams) {
      props.push(`width: ${vl.shapeParams.width}px`)
      props.push(`height: ${vl.shapeParams.height}px`)
      if (vl.fill?.color) props.push(`background-color: ${vl.fill.color}`)
      if (vl.shapeParams.shapeType === 'ellipse') props.push(`border-radius: 50%`)
      if (vl.shapeParams.cornerRadius) {
        const r =
          typeof vl.shapeParams.cornerRadius === 'number'
            ? `${vl.shapeParams.cornerRadius}px`
            : vl.shapeParams.cornerRadius.map((v) => `${v}px`).join(' ')
        props.push(`border-radius: ${r}`)
      }
    }
    if (vl.stroke) {
      props.push(`border: ${vl.stroke.width}px solid ${vl.stroke.color}`)
    }
  }

  if (layer.type === 'raster') {
    props.push(`max-width: 100%`)
    props.push(`height: auto`)
  }

  if (layer.type === 'group') {
    const gl = layer as GroupLayer
    if (settings.useGrid) {
      props.push(`display: grid`)
      props.push(`grid-template-columns: repeat(12, 1fr)`)
    } else {
      props.push(`position: relative`)
    }
    // Recurse into children CSS
    const childCSS: string[] = []
    for (const child of gl.children) {
      const css = layerToCSS(child, settings, artboard)
      if (css) childCSS.push(css)
    }
    const thisCSS = `.${cls} {\n  ${props.map((p) => p + ';').join('\n  ')}\n}`
    return [thisCSS, ...childCSS].join('\n\n')
  }

  if (props.length === 0) return ''
  return `.${cls} {\n  ${props.map((p) => p + ';').join('\n  ')}\n}`
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Export a Crossdraw document as a static website.
 *
 * Returns the HTML, CSS, and a map of asset references.
 */
export function exportStaticSite(
  document: DesignDocument,
  settings: WebsiteExportSettings = DEFAULT_WEBSITE_EXPORT_SETTINGS,
): WebsiteExportResult {
  const assets = new Map<string, Blob>()
  const cssBlocks: string[] = []
  const htmlPages: string[] = []

  // Reset / base styles
  cssBlocks.push(`* { margin: 0; padding: 0; box-sizing: border-box; }`)
  cssBlocks.push(`body { font-family: system-ui, sans-serif; }`)

  // Navigation
  if (settings.generateNav && document.artboards.length > 1) {
    const navItems = document.artboards
      .map((ab) => `<a href="#${sanitizeId(ab.name)}">${escapeHtml(ab.name)}</a>`)
      .join(' | ')
    htmlPages.push(`<nav class="${settings.classPrefix}-nav">${navItems}</nav>`)
    cssBlocks.push(`.${settings.classPrefix}-nav { padding: 16px; background: #f5f5f5; text-align: center; }`)
    cssBlocks.push(`.${settings.classPrefix}-nav a { margin: 0 8px; color: #333; text-decoration: none; }`)
  }

  // Each artboard → section
  for (const artboard of document.artboards) {
    const sectionId = sanitizeId(artboard.name)
    const sectionClass = sanitizeClassName(artboard.name, settings.classPrefix)

    // Section CSS
    const sectionProps: string[] = [
      `max-width: ${artboard.width}px`,
      `margin: 0 auto`,
      `padding: 20px`,
      `background-color: ${artboard.backgroundColor}`,
      `min-height: ${artboard.height}px`,
    ]

    if (settings.useGrid) {
      sectionProps.push(`display: grid`)
      sectionProps.push(`grid-template-columns: repeat(12, 1fr)`)
      sectionProps.push(`gap: 8px`)
    } else {
      sectionProps.push(`position: relative`)
    }

    cssBlocks.push(`.${sectionClass} {\n  ${sectionProps.map((p) => p + ';').join('\n  ')}\n}`)

    // Layer CSS
    for (const layer of artboard.layers) {
      const css = layerToCSS(layer, settings, artboard)
      if (css) cssBlocks.push(css)
    }

    // Layer HTML
    const layerHTML = artboard.layers.map((l) => layerToHTML(l, settings, assets)).join('\n    ')

    htmlPages.push(`<section id="${sectionId}" class="${sectionClass}">\n    ${layerHTML}\n  </section>`)
  }

  // Compose final HTML
  const css = cssBlocks.join('\n\n')
  const styleTag = settings.inlineCSS ? `<style>\n${css}\n</style>` : `<link rel="stylesheet" href="styles.css" />`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  ${settings.responsive ? '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' : ''}
  <title>${escapeHtml(settings.title)}</title>
  ${styleTag}
</head>
<body>
  ${htmlPages.join('\n  ')}
</body>
</html>`

  return { html, css, assets }
}

// ── HTML escape ──────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
