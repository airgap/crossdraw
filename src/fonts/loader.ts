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
// directly. We work around this by creating FontFace objects with the desired
// descriptors under a stable alias per family. When settings change we swap
// the FontFaces in-place using pre-fetched binary data so there's no async
// network hit — slider drags update instantly.

interface ParsedFontFace {
  weight: string
  style: string
  src: string
  unicodeRange?: string
}

type StyledDescriptors = FontFaceDescriptors & { variationSettings?: string }

/** Parsed @font-face data per family. */
const fontSources = new Map<string, ParsedFontFace[]>()
const fontSourcesLoading = new Set<string>()

/** Pre-fetched font binary data (URL → ArrayBuffer) for instant FontFace creation. */
const fontBuffers = new Map<string, ArrayBuffer>()

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
      // Pre-fetch binary data so styled FontFaces can be created from buffers
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

/** Remove all FontFace objects registered under a given uid. */
function removeFacesForUid(uid: string): void {
  for (const face of document.fonts) {
    if (face.family === uid) document.fonts.delete(face)
  }
}

/**
 * Get a font family name that renders with the given OpenType features
 * and/or variable-font axis values on Canvas 2D.
 *
 * Uses a stable uid per base family — when settings change, FontFaces are
 * swapped in-place using pre-fetched ArrayBuffers so the update is instant
 * (no network round-trip). Falls back to url() sources if buffers aren't
 * cached yet.
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

  // System fonts: use local() source
  if (SYSTEM_FONTS.has(family)) {
    const uid = existing?.uid ?? `__cd${styledCounter++}`
    if (existing) removeFacesForUid(uid)
    const desc: StyledDescriptors = { display: 'swap' as FontDisplay }
    if (featureStr) desc.featureSettings = featureStr
    if (variationStr) desc.variationSettings = variationStr
    try {
      const face = new FontFace(uid, `local("${family}")`, desc as FontFaceDescriptors)
      document.fonts.add(face)
      face.load().catch(() => {})
    } catch {
      return family
    }
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

  const uid = existing?.uid ?? `__cd${styledCounter++}`
  if (existing) removeFacesForUid(uid)

  for (const src of sources) {
    const desc: StyledDescriptors = {
      weight: src.weight,
      style: src.style,
      display: 'swap' as FontDisplay,
    }
    if (src.unicodeRange) desc.unicodeRange = src.unicodeRange
    if (featureStr) desc.featureSettings = featureStr
    if (variationStr) desc.variationSettings = variationStr
    try {
      // Use pre-fetched buffer for instant creation, fall back to url()
      const buffer = fontBuffers.get(src.src)
      const source: ArrayBuffer | string = buffer ?? `url(${src.src})`
      const face = new FontFace(uid, source, desc as FontFaceDescriptors)
      document.fonts.add(face)
      face.load().catch(() => {})
    } catch {
      // Skip this subset on error
    }
  }

  styledFamily.set(family, { uid, key: settingsKey })
  return uid
}
