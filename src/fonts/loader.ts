/**
 * Font loading via Google Fonts CSS API.
 * Loads variable fonts when available, static weights otherwise.
 *
 * Also provides styled font variants for Canvas 2D rendering with
 * OpenType features and variable font axes via the FontFace API.
 */

import { FONT_CATALOG, type CatalogFont } from './catalog'

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

// ── Styled font variants (OpenType features on Canvas 2D) ──
//
// Canvas 2D doesn't expose font-feature-settings as a context property. But
// Chrome DOES honor that descriptor when it's baked into a CSS @font-face
// rule and the canvas references the corresponding font-family — provided
// the face is fully loaded.
//
// This module used to bake `font-variation-settings` into @font-face
// descriptors too, but every non-`wght` axis is silently ignored by Chrome
// Canvas 2D (see `tests/variable-font-rendering.test.ts` for the executable
// record of every approach we tried and how each failed). Variable-axis
// rendering now goes through src/fonts/glyph-paths.ts, which decompresses
// WOFF2 to TTF and path-fills glyphs directly, bypassing the text stack.
//
// Strategy (features only):
//  1. Each unique (family, features) tuple gets its own permanent uid alias
//     and its own <style> element. We never overwrite an existing declaration
//     — overwriting <style>.textContent briefly unregisters the face, which
//     causes canvas to flicker back to a fallback font.
//  2. We preserve every relevant descriptor (font-weight, font-style,
//     font-stretch, unicode-range) from Google Fonts' CSS. font-stretch
//     ranges are critical: without them, Chrome won't treat the face as
//     variable (which matters for the native `wght` fast path).
//  3. We explicitly preload the new face via document.fonts.load() and
//     trigger a viewport re-render once it's ready.
//  4. An LRU cap evicts old aliases so continuous feature-toggle churn
//     doesn't grow the style/font-face count without bound.

interface ParsedFontFace {
  weight: string
  style: string
  stretch?: string
  src: string
  unicodeRange?: string
}

/** Parsed @font-face data per family. */
const fontSources = new Map<string, ParsedFontFace[]>()
const fontSourcesLoading = new Set<string>()
/** Render callbacks pending until a family's source CSS finishes loading. */
const fontSourcesPending = new Map<string, Array<() => void>>()

/** Pre-fetched font binary data (URL → ArrayBuffer). */
const fontBuffers = new Map<string, ArrayBuffer>()

/** Blob URL cache (source URL → blob URL). Created once per font source. */
const blobUrls = new Map<string, string>()

/** Per-(family, settings) cache: uid + insertion order index for LRU eviction. */
interface StyledEntry {
  uid: string
  loaded: boolean
}
const styledCache = new Map<string, StyledEntry>() // key = `${family}\n${settingsKey}`
let styledCounter = 0
const STYLED_CACHE_MAX = 64

/** Optional callback the viewport registers so we can request a redraw. */
let renderCallback: (() => void) | null = null
export function setStyledFontRenderCallback(cb: (() => void) | null): void {
  renderCallback = cb
}
function requestRender(): void {
  if (renderCallback) renderCallback()
}

/** Parse @font-face rules from Google Fonts CSS text. */
function parseFontFaceCss(css: string): ParsedFontFace[] {
  const results: ParsedFontFace[] = []
  const re = /@font-face\s*\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const block = m[1]!
    const weight = block.match(/font-weight:\s*([^;]+)/)?.[1]?.trim() ?? '400'
    const style = block.match(/font-style:\s*([^;]+)/)?.[1]?.trim() ?? 'normal'
    const stretch = block.match(/font-stretch:\s*([^;]+)/)?.[1]?.trim()
    const src = block.match(/src:\s*url\(([^)]+)\)/)?.[1]?.trim()
    const ur = block.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim()
    if (src) results.push({ weight, style, stretch, src, unicodeRange: ur })
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
      // Pre-fetch binary data for blob URLs (instant styled font updates).
      // Once *all* sources are buffered, drain any pending render callbacks
      // so the viewport picks up the now-resolvable styled family.
      let remaining = parsed.length
      for (const src of parsed) {
        if (fontBuffers.has(src.src)) {
          remaining--
          continue
        }
        fetch(src.src)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            fontBuffers.set(src.src, buf)
          })
          .catch(() => {})
          .finally(() => {
            remaining--
            if (remaining === 0) {
              const pending = fontSourcesPending.get(font.f)
              if (pending) {
                fontSourcesPending.delete(font.f)
                for (const cb of pending) cb()
              }
            }
          })
      }
      if (remaining === 0) {
        const pending = fontSourcesPending.get(font.f)
        if (pending) {
          fontSourcesPending.delete(font.f)
          for (const cb of pending) cb()
        }
      }
    })
    .catch(() => {})
    .finally(() => fontSourcesLoading.delete(font.f))
}

// ── Public accessors for the glyph-paths module ──
// These let src/fonts/glyph-paths.ts reuse this module's font buffer cache
// and source parsing instead of duplicating the Google Fonts fetch logic.

/** Get the parsed @font-face sources for a family (undefined if not yet fetched). */
export function getFontSources(family: string): ParsedFontFace[] | undefined {
  return fontSources.get(family)
}

/** Get the prefetched raw font binary (WOFF2 bytes) for a source URL. */
export function getFontBuffer(srcUrl: string): ArrayBuffer | undefined {
  return fontBuffers.get(srcUrl)
}

/** Test-only: synchronously populate a font's parsed sources and raw binary
 *  data. Lets puppeteer-driven tests exercise glyph-paths.ts without going
 *  through the catalog + Google Fonts CSS round-trip. Not used in production. */
export function __testInjectFontSource(
  family: string,
  sourceUrl: string,
  buffer: ArrayBuffer,
  unicodeRange = 'U+0000-00FF',
): void {
  fontSources.set(family, [{ weight: '100 1000', style: 'normal', src: sourceUrl, unicodeRange }])
  fontBuffers.set(sourceUrl, buffer)
}

/** Kick off fetching a font's sources if not already in progress. Returns a
 *  promise that resolves when sources + binary data are available, or rejects
 *  if the font is unknown / failed to load. */
export function ensureFontSources(family: string): Promise<void> {
  if (fontSources.has(family)) {
    // Sources parsed. Check if all binaries are loaded.
    const sources = fontSources.get(family)!
    const allBuffered = sources.every((s) => fontBuffers.has(s.src))
    if (allBuffered) return Promise.resolve()
    // Sources parsed but binaries still arriving — queue a pending callback.
    return new Promise((resolve) => {
      let pending = fontSourcesPending.get(family)
      if (!pending) {
        pending = []
        fontSourcesPending.set(family, pending)
      }
      pending.push(() => resolve())
    })
  }
  if (SYSTEM_FONTS.has(family)) return Promise.reject(new Error(`System font: ${family}`))
  const cat = catalogByFamily.get(family)
  if (!cat) return Promise.reject(new Error(`Unknown font: ${family}`))
  fetchFontSources(cat)
  return new Promise((resolve) => {
    let pending = fontSourcesPending.get(family)
    if (!pending) {
      pending = []
      fontSourcesPending.set(family, pending)
    }
    pending.push(() => resolve())
  })
}

/** Build a CSS font-feature-settings string from a features map. */
function formatFeatures(features: Record<string, boolean>): string {
  const parts: string[] = []
  for (const [tag, on] of Object.entries(features)) {
    if (on) parts.push(`"${tag}" 1`)
  }
  return parts.join(', ')
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

/** Inject a *new* <style> element with @font-face rules. Never overwrites. */
function injectFontStyle(uid: string, cssText: string): void {
  const elId = `__cd-${uid}`
  if (document.getElementById(elId)) return
  const el = document.createElement('style')
  el.id = elId
  el.textContent = cssText
  document.head.appendChild(el)
}

/** Drop a styled alias's <style> element so the browser can free its face. */
function removeFontStyle(uid: string): void {
  const el = document.getElementById(`__cd-${uid}`)
  if (el) el.remove()
}

/** Trim styledCache down to STYLED_CACHE_MAX (Map preserves insertion order). */
function evictOldStyledEntries(): void {
  while (styledCache.size > STYLED_CACHE_MAX) {
    const oldestKey = styledCache.keys().next().value
    if (oldestKey === undefined) break
    const entry = styledCache.get(oldestKey)!
    styledCache.delete(oldestKey)
    removeFontStyle(entry.uid)
  }
}

/**
 * Get a font family name that renders with the given OpenType features on
 * Canvas 2D.
 *
 * Each unique feature set gets its own permanent CSS alias. Returns the base
 * family while the new alias is still loading; once ready, requests a
 * viewport re-render via the registered render callback.
 *
 * Note: variable-font axes are NOT handled here — see src/fonts/glyph-paths.ts
 * for the path-based renderer that drives them.
 */
export function getStyledFontFamily(family: string, features?: Record<string, boolean>): string {
  const featureStr = features && Object.keys(features).length > 0 ? formatFeatures(features) : ''
  if (!featureStr) return family

  const cacheKey = `${family}\n${featureStr}`
  const cached = styledCache.get(cacheKey)
  if (cached) {
    // Refresh LRU position
    styledCache.delete(cacheKey)
    styledCache.set(cacheKey, cached)
    return cached.loaded ? cached.uid : family
  }

  const extras = `  font-feature-settings: ${featureStr};\n`

  const uid = `__cd${styledCounter++}`
  const entry: StyledEntry = { uid, loaded: false }

  // System fonts: local() source — load is effectively instant
  if (SYSTEM_FONTS.has(family)) {
    injectFontStyle(
      uid,
      `@font-face {\n  font-family: '${uid}';\n  src: local('${family}');\n  font-display: block;\n${extras}}`,
    )
    styledCache.set(cacheKey, entry)
    evictOldStyledEntries()
    // Wait for the new face to be fully registered before reporting success
    document.fonts
      .load(`16px '${uid}'`)
      .then(() => {
        entry.loaded = true
        requestRender()
      })
      .catch(() => {
        entry.loaded = true
        requestRender()
      })
    return family
  }

  // Web fonts: need parsed source data
  const sources = fontSources.get(family)
  if (!sources) {
    const cat = catalogByFamily.get(family)
    if (cat) {
      fetchFontSources(cat)
      // Re-attempt once sources land so the styled alias materializes without
      // requiring the user to wiggle the slider.
      let pending = fontSourcesPending.get(family)
      if (!pending) {
        pending = []
        fontSourcesPending.set(family, pending)
      }
      pending.push(() => {
        // Drop the no-op cache entry so the next call rebuilds with real CSS
        styledCache.delete(cacheKey)
        requestRender()
      })
    }
    return family
  }

  const rules = sources
    .map((src) => {
      const url = getBlobUrl(src.src) ?? src.src
      let css = `@font-face {\n  font-family: '${uid}';\n  src: url('${url}') format('woff2');\n`
      css += `  font-weight: ${src.weight};\n  font-style: ${src.style};\n  font-display: block;\n`
      if (src.stretch) css += `  font-stretch: ${src.stretch};\n`
      if (src.unicodeRange) css += `  unicode-range: ${src.unicodeRange};\n`
      css += extras
      css += '}'
      return css
    })
    .join('\n')

  injectFontStyle(uid, rules)
  styledCache.set(cacheKey, entry)
  evictOldStyledEntries()

  // The face is registered but the browser may not have decoded the buffer
  // yet. document.fonts.load() forces it and resolves once the alias is
  // usable on canvas. We trigger a re-render so the viewport picks it up.
  document.fonts
    .load(`16px '${uid}'`)
    .then(() => {
      entry.loaded = true
      requestRender()
    })
    .catch(() => {
      entry.loaded = true
      requestRender()
    })

  return family
}
