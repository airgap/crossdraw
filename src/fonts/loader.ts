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
// Canvas 2D doesn't support font-feature-settings or font-variation-settings
// directly. We work around this by creating new FontFace objects with the
// desired featureSettings / variationSettings descriptors and a unique family
// name. When Canvas resolves ctx.font, it picks up the descriptors from the
// matching FontFace, so features and axes are applied at render time.

interface ParsedFontFace {
  weight: string
  style: string
  src: string
  unicodeRange?: string
}

/** Parsed @font-face data per family. */
const fontSources = new Map<string, ParsedFontFace[]>()
const fontSourcesLoading = new Set<string>()

/** Cache: "family|features|variations" → unique family name. */
const styledCache = new Map<string, string>()
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

/** Fetch and cache the parsed @font-face source URLs for a font. */
function fetchFontSources(font: CatalogFont): void {
  if (fontSources.has(font.f) || fontSourcesLoading.has(font.f)) return
  if (SYSTEM_FONTS.has(font.f)) return

  fontSourcesLoading.add(font.f)
  fetch(buildFontUrl(font))
    .then((r) => r.text())
    .then((css) => {
      fontSources.set(font.f, parseFontFaceCss(css))
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

/**
 * Get a font family name that renders with the given OpenType features
 * and/or variable-font axis values on Canvas 2D.
 *
 * Creates dynamic FontFace objects (with featureSettings / variationSettings
 * descriptors) on first call for each unique combination, then caches the
 * result. Returns the original family as a fallback while font sources are
 * still loading.
 */
export function getStyledFontFamily(
  family: string,
  features?: Record<string, boolean>,
  variations?: FontVariationAxis[],
): string {
  const featureStr = features && Object.keys(features).length > 0 ? formatFeatures(features) : ''
  const variationStr = variations && variations.length > 0 ? formatVariations(variations) : ''
  if (!featureStr && !variationStr) return family

  const cacheKey = `${family}|${featureStr}|${variationStr}`
  const cached = styledCache.get(cacheKey)
  if (cached) return cached

  // FontFaceDescriptors includes variationSettings in the spec but TS lib may lag
  type Descriptors = FontFaceDescriptors & { variationSettings?: string }

  // System fonts: use local() source
  if (SYSTEM_FONTS.has(family)) {
    const uid = `__cd${styledCounter++}`
    const desc: Descriptors = { display: 'swap' as FontDisplay }
    if (featureStr) desc.featureSettings = featureStr
    if (variationStr) desc.variationSettings = variationStr
    try {
      const face = new FontFace(uid, `local("${family}")`, desc as FontFaceDescriptors)
      document.fonts.add(face)
      face.load().catch(() => {})
    } catch {
      return family
    }
    styledCache.set(cacheKey, uid)
    return uid
  }

  // Web fonts: need parsed source data
  const sources = fontSources.get(family)
  if (!sources) {
    // Trigger fetch so it's ready on the next render
    const cat = catalogByFamily.get(family)
    if (cat) fetchFontSources(cat)
    return family
  }

  const uid = `__cd${styledCounter++}`
  for (const src of sources) {
    const desc: Descriptors = {
      weight: src.weight,
      style: src.style,
      display: 'swap' as FontDisplay,
    }
    if (src.unicodeRange) desc.unicodeRange = src.unicodeRange
    if (featureStr) desc.featureSettings = featureStr
    if (variationStr) desc.variationSettings = variationStr
    try {
      const face = new FontFace(uid, `url(${src.src})`, desc as FontFaceDescriptors)
      document.fonts.add(face)
      face.load().catch(() => {})
    } catch {
      // Skip this subset on error
    }
  }

  styledCache.set(cacheKey, uid)
  return uid
}

/**
 * Invalidate styled font cache entries for a family.
 * Call when the user changes features/axes so stale entries are dropped.
 */
export function invalidateStyledFonts(family: string): void {
  for (const [key, uid] of styledCache) {
    if (key.startsWith(family + '|')) {
      // Remove FontFace objects for this uid
      for (const face of document.fonts) {
        if (face.family === uid) {
          document.fonts.delete(face)
        }
      }
      styledCache.delete(key)
    }
  }
}
