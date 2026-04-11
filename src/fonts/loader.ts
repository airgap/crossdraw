/**
 * Font loading via Google Fonts CSS API.
 * Loads variable fonts when available, static weights otherwise.
 *
 * Also exposes accessors the path-based text renderer
 * (src/fonts/glyph-paths.ts) uses to reach the raw WOFF2 binaries — that
 * module handles both variable axes and OpenType features by going
 * through fontkit.
 *
 * Why route features through fontkit when Chrome's `@font-face
 * font-feature-settings` descriptor actually does apply? Two reasons:
 *
 *   1. Google Fonts' axis-subset response silently strips most OT
 *      features from the WOFF2 binary. Even if we bake the descriptor
 *      into CSS correctly, Chrome has nothing to apply at shape time
 *      for features that got subsetted out — so the same code path
 *      succeeds for some font/feature pairs and silently fails for
 *      others. fontkit's `layout()` on the decoded TTF operates on
 *      *whatever* survived, identically across all callers.
 *
 *   2. Variable axes other than `wght` can't be driven through any
 *      Canvas 2D API at all — `tests/variable-font-rendering.test.ts`
 *      documents every approach that fails. Since we already have a
 *      fontkit-based path for axes, routing features through the same
 *      path unifies them and keeps the code honest.
 *
 * `tests/opentype-features-rendering.test.ts` documents Chrome's
 * actual behaviour and verifies the glyph-paths pipeline renders
 * feature substitutions correctly.
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

/** Build the Google Fonts CSS2 URL for a font.
 *
 * For variable fonts we request *every* axis from the catalog, not just
 * `wght`. Reason: Google Fonts serves an axis-subsetted WOFF2 per request,
 * and the binary literally drops the `gvar` deltas for unrequested axes.
 * If we only ask for `wght`, fontkit's variation processor later throws
 * "Invalid gvar table" when path-based rendering (src/fonts/glyph-paths.ts)
 * tries to drive `wdth`/`opsz`/etc. The extra bytes are a fair price for
 * making the entire path-rendering pipeline work on any non-wght axis.
 *
 * Google Fonts CSS2 API axis ordering rules: lowercase tags first
 * (alphabetical), then uppercase tags (alphabetical); `ital`, when
 * present, sits at the front of the lowercase group.
 */
function buildFontUrl(font: CatalogFont): string {
  const family = font.f.replace(/ /g, '+')
  const allAxes = font.a ?? []
  const wghtAxis = allAxes.find(([tag]) => tag === 'wght')

  if (wghtAxis) {
    // Variable font. Split axes into lowercase/uppercase groups and sort
    // each alphabetically. `ital` is handled separately so the italic
    // ranges can be paired with the other axis ranges below.
    const lower = allAxes
      .filter(([tag]) => tag !== 'ital' && tag === tag.toLowerCase())
      .sort((a, b) => a[0].localeCompare(b[0]))
    const upper = allAxes.filter(([tag]) => tag !== tag.toLowerCase()).sort((a, b) => a[0].localeCompare(b[0]))
    const ordered = [...lower, ...upper]
    const hasItal = font.i && allAxes.some(([tag]) => tag === 'ital')

    const tagsPart = hasItal ? ['ital', ...ordered.map(([t]) => t)].join(',') : ordered.map(([t]) => t).join(',')
    const rangesPart = ordered.map(([, min, max]) => `${min}..${max}`).join(',')

    if (hasItal) {
      // One tuple per italic value (0 and 1), each with the full axis ranges.
      return `https://fonts.googleapis.com/css2?family=${family}:${tagsPart}@0,${rangesPart};1,${rangesPart}&display=swap`
    }
    return `https://fonts.googleapis.com/css2?family=${family}:${tagsPart}@${rangesPart}&display=swap`
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

  // Pre-fetch font CSS sources + binary so the path renderer is ready the
  // moment a text layer needs variable axes or OT features.
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

// ── Font source parsing (shared with src/fonts/glyph-paths.ts) ──
//
// Google Fonts' CSS response is parsed once per family into a list of
// @font-face rules; each rule's binary payload is fetched and cached. The
// path-based text renderer (glyph-paths.ts) consumes both the parsed
// descriptor list and the raw bytes to drive fontkit.

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
      // Pre-fetch binary data so the glyph-paths renderer can decode the
      // font synchronously on its next call. Once *all* sources are
      // buffered, drain any pending callbacks waiting on this family.
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
