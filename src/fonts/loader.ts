/**
 * Font loading via Google Fonts CSS API.
 * Loads variable fonts when available, static weights otherwise.
 *
 * Also provides styled font variants for Canvas 2D rendering with
 * OpenType features and variable font axes via the FontFace API.
 */

import { FONT_CATALOG, type CatalogFont } from './catalog'
import type { FontVariationAxis } from '@/types'

const loaded = new Set<string>()
const loading = new Map<string, Promise<void>>()

// ── Catalog lookup (shared across modules) ──

const catalogByFamily = new Map<string, CatalogFont>()
for (const f of FONT_CATALOG) catalogByFamily.set(f.f, f)

export function getCatalogFont(family: string): CatalogFont | undefined {
  return catalogByFamily.get(family)
}

/** Build the Google Fonts CSS2 URL for a font. */
function buildFontUrl(font: CatalogFont): string {
  const family = font.f.replace(/ /g, '+')
  const wghtAxis = font.a?.find(([tag]) => tag === 'wght')

  if (wghtAxis) {
    // Variable font — request full weight range
    const italAxis = font.a?.find(([tag]) => tag === 'ital')
    if (italAxis && font.i) {
      return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,${wghtAxis[1]}..${wghtAxis[2]};1,${wghtAxis[1]}..${wghtAxis[2]}&display=swap`
    }
    return `https://fonts.googleapis.com/css2?family=${family}:wght@${wghtAxis[1]}..${wghtAxis[2]}&display=swap`
  }

  // Static font — request available weights
  const weights = font.w.length > 0 ? font.w : [400]
  if (font.i) {
    const normal = weights.map((w) => `0,${w}`).join(';')
    const italic = weights.map((w) => `1,${w}`).join(';')
    return `https://fonts.googleapis.com/css2?family=${family}:ital,wght@${normal};${italic}&display=swap`
  }
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(';')}&display=swap`
}

/** Inject a <link> stylesheet for a Google Font. Returns when the font is ready. */
export function loadFont(font: CatalogFont): Promise<void> {
  const key = font.f
  if (loaded.has(key)) return Promise.resolve()

  const existing = loading.get(key)
  if (existing) return existing

  // Pre-fetch font CSS sources so styled variants are available instantly
  fetchFontSources(font)

  const promise = new Promise<void>((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = buildFontUrl(font)
    link.onload = () => {
      loaded.add(key)
      loading.delete(key)
      resolve()
    }
    link.onerror = () => {
      // Still resolve — font just won't render with the right face
      loading.delete(key)
      resolve()
    }
    document.head.appendChild(link)
  })

  loading.set(key, promise)
  return promise
}

/** Check if a font has been loaded or is a system font. */
export function isFontLoaded(family: string): boolean {
  return loaded.has(family) || SYSTEM_FONTS.has(family)
}

/** Preload a batch of fonts (e.g. the top N popular fonts). */
export function preloadFonts(fonts: CatalogFont[], count: number): void {
  const toLoad = fonts.slice(0, count)
  for (const font of toLoad) {
    loadFont(font)
  }
}

/** Scan a document for text layers and load all referenced fonts. */
export function loadDocumentFonts(doc: {
  artboards: Array<{ layers: Array<{ type: string; fontFamily?: string }> }>
}): void {
  const families = new Set<string>()
  function walk(layers: Array<{ type: string; fontFamily?: string; children?: any[] }>) {
    for (const layer of layers) {
      if (layer.type === 'text' && layer.fontFamily) {
        families.add(layer.fontFamily)
      }
      if ((layer as any).children) walk((layer as any).children)
    }
  }
  for (const artboard of doc.artboards) {
    walk(artboard.layers)
  }
  for (const family of families) {
    if (isFontLoaded(family)) continue
    const cat = catalogByFamily.get(family)
    if (cat) loadFont(cat)
  }
}

/** System fonts that don't need loading. */
const SYSTEM_FONTS = new Set([
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Palatino Linotype',
  'Lucida Console',
  'Tahoma',
  'Segoe UI',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
])

// ── Styled font variants (OpenType features + variable axes on Canvas 2D) ──
//
// Canvas 2D doesn't support font-feature-settings or font-variation-settings.
// The JS FontFace() constructor also ignores variationSettings — it's not a
// supported descriptor. CSS @font-face rules DO support both descriptors, so
// we inject <style> elements with @font-face rules under a stable alias per
// family. Pre-fetched font buffers are served via blob URLs so there's no
// network delay when slider values change.

interface ParsedFontFace {
  weight: string
  style: string
  src: string
  unicodeRange?: string
}

/** Parsed @font-face data per family. */
const fontSources = new Map<string, ParsedFontFace[]>()
const fontSourcesLoading = new Set<string>()

/** Pre-fetched font binary data (URL → ArrayBuffer). */
const fontBuffers = new Map<string, ArrayBuffer>()

/** Blob URL cache (source URL → blob URL). Created once per font source. */
const blobUrls = new Map<string, string>()

/** Stable uid + current settings key per base family. */
const styledFamily = new Map<string, { uid: string; key: string }>()
let styledCounter = 0

/** Parse @font-face rules from Google Fonts CSS text. */
function parseFontFaceCss(css: string): ParsedFontFace[] {
  const results: ParsedFontFace[] = []
  const re = /@font-face\s*\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const block = m[1]!
    const weight = block.match(/font-weight:\s*([^;]+)/)?.[1]?.trim() ?? '400'
    const style = block.match(/font-style:\s*([^;]+)/)?.[1]?.trim() ?? 'normal'
    const src = block.match(/src:\s*url\(([^)]+)\)/)?.[1]?.trim()
    const ur = block.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim()
    if (src) results.push({ weight, style, src, unicodeRange: ur })
  }
  return results
}

/** Fetch and cache the parsed @font-face source URLs + binary data for a font. */
function fetchFontSources(font: CatalogFont): void {
  if (fontSources.has(font.f) || fontSourcesLoading.has(font.f)) return
  if (SYSTEM_FONTS.has(font.f)) return

  fontSourcesLoading.add(font.f)
  fetch(buildFontUrl(font))
    .then((r) => r.text())
    .then((css) => {
      const parsed = parseFontFaceCss(css)
      fontSources.set(font.f, parsed)
      // Pre-fetch binary data for blob URLs (instant styled font updates)
      for (const src of parsed) {
        if (!fontBuffers.has(src.src)) {
          fetch(src.src)
            .then((r) => r.arrayBuffer())
            .then((buf) => fontBuffers.set(src.src, buf))
            .catch(() => {})
        }
      }
    })
    .catch(() => {})
    .finally(() => fontSourcesLoading.delete(font.f))
}

/** Build a CSS font-feature-settings string from a features map. */
function formatFeatures(features: Record<string, boolean>): string {
  const parts: string[] = []
  for (const [tag, on] of Object.entries(features)) {
    if (on) parts.push(`"${tag}" 1`)
  }
  return parts.join(', ')
}

/** Build a CSS font-variation-settings string from axes. */
function formatVariations(axes: FontVariationAxis[]): string {
  return axes.map((a) => `"${a.tag}" ${a.value}`).join(', ')
}

/** Get or create a blob URL for a pre-fetched font source. */
function getBlobUrl(srcUrl: string): string | null {
  const existing = blobUrls.get(srcUrl)
  if (existing) return existing
  const buffer = fontBuffers.get(srcUrl)
  if (!buffer) return null
  const url = URL.createObjectURL(new Blob([buffer], { type: 'font/woff2' }))
  blobUrls.set(srcUrl, url)
  return url
}

/** Inject or update a <style> element with @font-face rules. */
function injectFontStyle(uid: string, cssText: string): void {
  const elId = `__cd-${uid}`
  let el = document.getElementById(elId) as HTMLStyleElement | null
  if (el) {
    el.textContent = cssText
  } else {
    el = document.createElement('style')
    el.id = elId
    el.textContent = cssText
    document.head.appendChild(el)
  }
}

/**
 * Get a font family name that renders with the given OpenType features
 * and/or variable-font axis values on Canvas 2D.
 *
 * Injects CSS @font-face rules (which support font-variation-settings,
 * unlike the JS FontFace API) under a stable alias. Pre-fetched font
 * buffers are served via blob URLs for instant slider updates.
 */
export function getStyledFontFamily(
  family: string,
  features?: Record<string, boolean>,
  variations?: FontVariationAxis[],
): string {
  const featureStr = features && Object.keys(features).length > 0 ? formatFeatures(features) : ''
  const variationStr = variations && variations.length > 0 ? formatVariations(variations) : ''
  if (!featureStr && !variationStr) return family

  const settingsKey = `${featureStr}|${variationStr}`
  const existing = styledFamily.get(family)

  // Same settings as last time — return cached uid
  if (existing && existing.key === settingsKey) return existing.uid

  const uid = existing?.uid ?? `__cd${styledCounter++}`

  // Build extra CSS descriptors
  let extras = ''
  if (featureStr) extras += `  font-feature-settings: ${featureStr};\n`
  if (variationStr) extras += `  font-variation-settings: ${variationStr};\n`

  // System fonts: local() source
  if (SYSTEM_FONTS.has(family)) {
    injectFontStyle(
      uid,
      `@font-face {\n  font-family: '${uid}';\n  src: local('${family}');\n  font-display: swap;\n${extras}}`,
    )
    styledFamily.set(family, { uid, key: settingsKey })
    return uid
  }

  // Web fonts: need parsed source data
  const sources = fontSources.get(family)
  if (!sources) {
    const cat = catalogByFamily.get(family)
    if (cat) fetchFontSources(cat)
    return family
  }

  const rules = sources
    .map((src) => {
      const url = getBlobUrl(src.src) ?? src.src
      let css = `@font-face {\n  font-family: '${uid}';\n  src: url('${url}');\n`
      css += `  font-weight: ${src.weight};\n  font-style: ${src.style};\n  font-display: swap;\n`
      if (src.unicodeRange) css += `  unicode-range: ${src.unicodeRange};\n`
      css += extras
      css += '}'
      return css
    })
    .join('\n')

  injectFontStyle(uid, rules)
  styledFamily.set(family, { uid, key: settingsKey })
  return uid
}
