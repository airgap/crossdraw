/**
 * Path-based text rendering for Canvas 2D that honours both variable font
 * axes *and* OpenType features — neither of which Chrome Canvas 2D exposes
 * through any CSS / context / FontFace mechanism.
 *
 * ### Why this exists
 *
 * Chrome's Canvas 2D honours exactly one OpenType variable axis — `wght`,
 * and only when the numeric weight is encoded into the `ctx.font`
 * shorthand. Every other axis (wdth, opsz, slnt, grad, custom…) is
 * silently ignored. `font-variation-settings` on the canvas, on its
 * parent, on the FontFace constructor and in `@font-face` descriptors
 * are all no-ops. (`tests/variable-font-rendering.test.ts` documents
 * every failure mode as an executable record.)
 *
 * OpenType features are a subtler trap. Chrome DOES honour
 * `font-feature-settings` baked into an `@font-face` descriptor — but
 * only when the feature actually exists in the font binary Chrome
 * loaded. Google Fonts' axis-subset response strips most OT features
 * from the WOFF2, so the exact same descriptor "works" for some
 * font/feature pairs and silently no-ops for others. Routing features
 * through fontkit instead of the native descriptor path lets us apply
 * whatever features survived subsetting uniformly, and keeps the
 * features pipeline merged with the variable-axis pipeline below.
 * (`tests/opentype-features-rendering.test.ts` documents Chrome's
 * actual behaviour and verifies the fontkit path.)
 *
 * ### The escape hatch
 *
 * fontkit can do both jobs itself:
 *
 *   • `font.getVariation({axis: value})` returns a font view whose
 *     glyph outlines reflect the axis values (via gvar delta
 *     application).
 *   • `font.layout(text, features)` runs a GSUB shaping pass over the
 *     string, returning a `GlyphRun` whose `glyphs[]` have already been
 *     substituted per the requested features and whose `positions[]`
 *     carry the advance + offset deltas from GPOS.
 *
 * Chaining the two (`font.getVariation(coords).layout(text, features)`)
 * applies both in a single pass, and every glyph's `path.commands` is a
 * plain list of moveTo / lineTo / curveTo pairs we can replay into
 * `ctx.fill()`. Bypassing the browser text stack entirely lets us drive
 * any axis and any feature.
 *
 * ### The WOFF2 problem
 *
 * Google Fonts ships WOFF2, not TTF, and fontkit's WOFF2 path is
 * fundamentally broken for variable glyph outlines:
 *
 *   • `WOFF2Font._transformGlyfTable` pre-decodes every glyph at load
 *     time *without* applying variations.
 *   • `WOFF2Glyph._decode` just returns that cached data, so variation
 *     deltas never reach the outline points.
 *   • Variations in the WOFF2 path only affect advance widths (via HVAR).
 *
 * We fix this by decompressing WOFF2 → TTF in the browser via a vendored
 * `wawoff2` Emscripten module, then handing the TTF bytes to fontkit's
 * (working) TTF path.
 *
 * ### The axis-subset trap
 *
 * Google Fonts honours axis requests in its CSS2 URL by serving an
 * axis-subsetted WOFF2: ask for `:wght@100..900` and the binary's gvar
 * table has the wght deltas *and nothing else*. When we later try to
 * drive a different axis (wdth/opsz/…), fontkit throws
 * "Invalid gvar table". `src/fonts/loader.ts` therefore now requests
 * the full axis set declared in the catalog — see `buildFontUrl` for the
 * grisly details.
 *
 * ### Caching strategy
 *
 * Loading is async and expensive; rendering must be synchronous. The
 * module exposes a `getPathText()` handle that reports `ready === false`
 * while loading is in-flight, fires a render callback when work
 * completes, and serves synchronous glyph paths once cached:
 *
 *   1. **Font decode** — WOFF2 binary → TTF → fontkit Font, cached by
 *      (family, sourceUrl). Happens once per font.
 *   2. **Variation view** — `font.getVariation(coords)`, cached by
 *      (family, sourceUrl, variationKey). One per axis tuple.
 *   3. **Glyph paths** — `glyph.path.commands` → `Path2D`, cached by
 *      (family, sourceUrl, variationKey, glyphId). Keyed on the shaped
 *      glyph id (not codepoint) so substituted forms get their own slot.
 *
 * Shaping runs (`font.layout`) are not cached directly — they're cheap
 * once the font is decoded, and the output positions/ids can differ per
 * string, feature set, and axis setting. The Path2D cache downstream is
 * what carries the heavy cost.
 */

import type { FontVariationAxis } from '@/types'
import { __testInjectFontSource, ensureFontSources, getFontBuffer, getFontSources } from './loader'

// Re-exported for browser tests that bundle this module — production code
// should never import the `__test*` symbol.
export { __testInjectFontSource }

// fontkit types — we don't depend on fontkit's published .d.ts because
// the bundled browser module ships without them. Minimal shapes only.
interface FontkitPathCommand {
  command: 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'closePath'
  args: number[]
}
interface FontkitGlyph {
  id: number
  path: { commands: FontkitPathCommand[] }
  advanceWidth: number
}
interface FontkitGlyphPosition {
  xAdvance: number
  yAdvance: number
  xOffset: number
  yOffset: number
}
interface FontkitGlyphRun {
  glyphs: FontkitGlyph[]
  positions: FontkitGlyphPosition[]
}
interface FontkitFont {
  unitsPerEm: number
  variationAxes: Record<string, unknown>
  availableFeatures: string[]
  glyphForCodePoint(cp: number): FontkitGlyph
  getVariation(coords: Record<string, number>): FontkitFont
  layout(text: string, features?: Record<string, boolean> | string[]): FontkitGlyphRun
}
type FontkitModule = {
  create(data: Uint8Array): FontkitFont
}
type Wawoff2Decompress = (buf: Uint8Array) => Promise<Uint8Array>

// ── Lazy library loaders ──

let fontkitPromise: Promise<FontkitModule> | null = null
function loadFontkit(): Promise<FontkitModule> {
  if (!fontkitPromise) {
    fontkitPromise = import('./vendor/fontkit.mjs' as string) as Promise<FontkitModule>
  }
  return fontkitPromise
}

let wawoff2Promise: Promise<Wawoff2Decompress> | null = null
function loadWawoff2(): Promise<Wawoff2Decompress> {
  if (!wawoff2Promise) {
    wawoff2Promise = import('./vendor/wawoff2-decompress.mjs' as string).then((m) => m.default as Wawoff2Decompress)
  }
  return wawoff2Promise
}

// ── Render callback (shared with loader.ts) ──

let renderCallback: (() => void) | null = null
export function setPathTextRenderCallback(cb: (() => void) | null): void {
  renderCallback = cb
}
function requestRender(): void {
  if (renderCallback) renderCallback()
}

// ── Caches ──

/** (family, sourceUrl) → base fontkit Font parsed from the decompressed TTF. */
const fontCache = new Map<string, FontkitFont>()
/** Loads in flight, so concurrent getPathText() calls don't re-decode. */
const fontLoading = new Map<string, Promise<FontkitFont>>()

/** (family, sourceUrl, variationKey) → variation view. */
const variationCache = new Map<string, FontkitFont>()

/** (family, sourceUrl, variationKey, glyphId) → rendered glyph path.
 *  Keyed on the *shaped* glyph id, so substituted forms (fi-ligature,
 *  small-cap A, fraction numerator, …) each get their own Path2D. */
const glyphCache = new Map<string, Path2D>()

const MAX_FONT_CACHE = 32
const MAX_VARIATION_CACHE = 256
const MAX_GLYPH_CACHE = 8192

function evictLRU<K, V>(map: Map<K, V>, cap: number): void {
  while (map.size > cap) {
    const first = map.keys().next().value
    if (first === undefined) break
    map.delete(first)
  }
}

// ── Source selection ──

/**
 * Google Fonts' CSS2 response is split into multiple @font-face blocks,
 * each covering a Unicode subset (latin, latin-ext, cyrillic, …). We
 * pick one source URL per family for path rendering; for text layers
 * this means non-Latin scripts may not hit the path renderer on the
 * first attempt. That's OK — the fallback is native `fillText` which
 * still renders correctly (just without non-wght axes and features).
 *
 * Selection heuristic: prefer the block whose `unicode-range` contains
 * basic Latin (covers U+0041 'A'), else fall back to the first block.
 */
function pickBasicLatinSource(family: string): string | null {
  const sources = getFontSources(family)
  if (!sources || sources.length === 0) return null
  for (const s of sources) {
    const ur = s.unicodeRange ?? ''
    if (!ur || ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+0041')) {
      return s.src
    }
  }
  return sources[0]!.src
}

// ── Font decoding ──

/** Load, decompress, and parse a font's TTF bytes into a fontkit Font. */
async function decodeFont(family: string, sourceUrl: string): Promise<FontkitFont> {
  const cacheKey = `${family}\n${sourceUrl}`
  const cached = fontCache.get(cacheKey)
  if (cached) return cached
  const inFlight = fontLoading.get(cacheKey)
  if (inFlight) return inFlight

  const loadPromise = (async () => {
    const [fontkit, decompress] = await Promise.all([loadFontkit(), loadWawoff2()])
    const buf = getFontBuffer(sourceUrl)
    if (!buf) {
      throw new Error(`Font buffer not yet prefetched: ${sourceUrl}`)
    }
    const woff2Bytes = new Uint8Array(buf)
    // Not every @font-face source is WOFF2, but Google Fonts always is.
    // Check the magic so we don't feed raw TTF through wawoff2 by accident.
    const isWoff2 =
      woff2Bytes.length > 4 &&
      woff2Bytes[0] === 0x77 &&
      woff2Bytes[1] === 0x4f &&
      woff2Bytes[2] === 0x46 &&
      woff2Bytes[3] === 0x32
    const ttfBytes = isWoff2 ? await decompress(woff2Bytes) : woff2Bytes
    const font = fontkit.create(ttfBytes)
    fontCache.set(cacheKey, font)
    evictLRU(fontCache, MAX_FONT_CACHE)
    fontLoading.delete(cacheKey)
    return font
  })()

  fontLoading.set(cacheKey, loadPromise)
  return loadPromise
}

// ── Variation views ──

function variationKey(axes: FontVariationAxis[] | undefined): string {
  if (!axes || axes.length === 0) return ''
  return axes
    .slice()
    .sort((a, b) => a.tag.localeCompare(b.tag))
    .map((a) => `${a.tag}=${a.value}`)
    .join(',')
}

function featureKey(features: Record<string, boolean> | undefined): string {
  if (!features) return ''
  const on: string[] = []
  for (const [tag, enabled] of Object.entries(features)) {
    if (enabled) on.push(tag)
  }
  if (on.length === 0) return ''
  on.sort()
  return on.join(',')
}

function getVariation(
  family: string,
  sourceUrl: string,
  font: FontkitFont,
  axes: FontVariationAxis[] | undefined,
): FontkitFont {
  if (!axes || axes.length === 0) return font
  const vkey = variationKey(axes)
  const cacheKey = `${family}\n${sourceUrl}\n${vkey}`
  const cached = variationCache.get(cacheKey)
  if (cached) return cached
  const coords: Record<string, number> = {}
  for (const a of axes) coords[a.tag] = a.value
  const view = font.getVariation(coords)
  variationCache.set(cacheKey, view)
  evictLRU(variationCache, MAX_VARIATION_CACHE)
  return view
}

// ── Glyph → Path2D conversion ──

function commandsToPath2D(commands: FontkitPathCommand[]): Path2D {
  const p = new Path2D()
  for (const cmd of commands) {
    const a = cmd.args
    switch (cmd.command) {
      case 'moveTo':
        p.moveTo(a[0]!, a[1]!)
        break
      case 'lineTo':
        p.lineTo(a[0]!, a[1]!)
        break
      case 'quadraticCurveTo':
        p.quadraticCurveTo(a[0]!, a[1]!, a[2]!, a[3]!)
        break
      case 'bezierCurveTo':
        p.bezierCurveTo(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!)
        break
      case 'closePath':
        p.closePath()
        break
    }
  }
  return p
}

function getGlyphPath(family: string, sourceUrl: string, vkey: string, glyph: FontkitGlyph): Path2D {
  const cacheKey = `${family}\n${sourceUrl}\n${vkey}\n${glyph.id}`
  const cached = glyphCache.get(cacheKey)
  if (cached) return cached
  const path = commandsToPath2D(glyph.path.commands)
  glyphCache.set(cacheKey, path)
  evictLRU(glyphCache, MAX_GLYPH_CACHE)
  return path
}

/** Convert our features map (`{tag: boolean}`) into the array form fontkit
 *  likes best — only enabled tags. */
function featuresForLayout(features: Record<string, boolean> | undefined): string[] | undefined {
  if (!features) return undefined
  const on: string[] = []
  for (const [tag, enabled] of Object.entries(features)) {
    if (enabled) on.push(tag)
  }
  return on.length > 0 ? on : undefined
}

// ── Public API: PathText handle ──

/**
 * A ready-or-pending handle for path-based text rendering. Callers check
 * `ready` before drawing; when false they fall back to `ctx.fillText` and
 * we request a render once loading resolves.
 */
export interface PathText {
  readonly ready: boolean
  /** Measure a string's advance width in px (excludes letter-spacing). */
  measureWidth(str: string): number
  /** Measure a single character's advance width in px. */
  measureChar(ch: string): number
  /**
   * Fill `str` starting at (x, y) with `y` being the text *top* (i.e.
   * matches `ctx.textBaseline = 'top'`). Letter spacing is applied in
   * pixels.
   */
  fillText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, letterSpacing: number): void
}

const NULL_PATH_TEXT: PathText = {
  ready: false,
  measureWidth: () => 0,
  measureChar: () => 0,
  fillText: () => {},
}

/**
 * Determine whether a text layer needs path-based rendering.
 *
 * Canvas 2D handles `wght` natively via the numeric font-weight shorthand,
 * so if the layer's only active variations are on `wght`, we can stay on
 * the fast native path. Any other axis at a non-default value — *or* any
 * OpenType feature toggled on — forces us onto the path renderer.
 * (We still feed `wght` into fontkit's variation coords when the path
 * renderer kicks in so the two paths agree.)
 */
export function needsPathRendering(variations?: FontVariationAxis[], features?: Record<string, boolean>): boolean {
  if (features) {
    for (const v of Object.values(features)) if (v) return true
  }
  if (variations) {
    for (const a of variations) {
      if (a.tag === 'wght') continue
      if (Math.abs(a.value - a.default) > 0.001) return true
    }
  }
  return false
}

/**
 * Get a handle for rendering `family` at `sizePx` with the given variable
 * axis values and OpenType features. Returns synchronously; the handle
 * reports `ready=false` while fonts/bundles are loading in the
 * background, then the registered render callback fires.
 */
export function getPathText(
  family: string,
  variations: FontVariationAxis[] | undefined,
  features: Record<string, boolean> | undefined,
  sizePx: number,
): PathText {
  const sourceUrl = pickBasicLatinSource(family)
  if (!sourceUrl) {
    // Sources not parsed yet — kick off the fetch, fallback in the meantime.
    ensureFontSources(family)
      .then(() => requestRender())
      .catch(() => {})
    return NULL_PATH_TEXT
  }
  const cacheKey = `${family}\n${sourceUrl}`
  const font = fontCache.get(cacheKey)
  if (!font) {
    // Font not yet decoded — start the pipeline. The load chain:
    //   ensureFontSources → getFontBuffer becomes non-null → decodeFont
    //     → fontCache gets an entry → requestRender → next paint succeeds
    const buffered = getFontBuffer(sourceUrl) !== undefined
    if (buffered) {
      decodeFont(family, sourceUrl)
        .then(() => requestRender())
        .catch(() => {})
    } else {
      ensureFontSources(family)
        .then(() => decodeFont(family, sourceUrl))
        .then(() => requestRender())
        .catch(() => {})
    }
    return NULL_PATH_TEXT
  }

  const variant = getVariation(family, sourceUrl, font, variations)
  const vkey = variationKey(variations)
  const fkey = featureKey(features)
  const layoutFeatures = featuresForLayout(features)
  const unitsPerEm = font.unitsPerEm
  const emToPx = sizePx / unitsPerEm

  return {
    ready: true,
    measureChar(ch) {
      // Single-codepoint measurement. Run `layout()` so any substitutions
      // that depend on features still apply, then sum the xAdvance(s) of
      // whatever glyphs came out.
      const run = variant.layout(ch, layoutFeatures)
      let adv = 0
      for (const p of run.positions) adv += p.xAdvance
      return adv * emToPx
    },
    measureWidth(str) {
      const run = variant.layout(str, layoutFeatures)
      let adv = 0
      for (const p of run.positions) adv += p.xAdvance
      return adv * emToPx
    },
    fillText(ctx, str, x, y, letterSpacing) {
      const run = variant.layout(str, layoutFeatures)
      // ctx.font metrics: 'top' baseline puts y at the text top. Glyph
      // coordinates come out of fontkit in font design units, y-up; we
      // scale by emToPx and flip Y, anchoring on the baseline which sits
      // roughly at `y + sizePx` for most Latin fonts. (This matches the
      // approximation ctx.fillText uses when textBaseline='top' — it's
      // ascent-ish, not pixel-perfect, but agrees with the native path
      // closely enough that users can't tell which renderer is live.)
      ctx.save()
      ctx.translate(x, y + sizePx)
      ctx.scale(emToPx, -emToPx)
      const lsEm = letterSpacing / emToPx
      let cursorEm = 0
      for (let i = 0; i < run.glyphs.length; i++) {
        const g = run.glyphs[i]!
        const pos = run.positions[i]!
        const path = getGlyphPath(family, sourceUrl, vkey + '\n' + fkey, g)
        ctx.save()
        ctx.translate(cursorEm + pos.xOffset, -pos.yOffset)
        ctx.fill(path)
        ctx.restore()
        cursorEm += pos.xAdvance + lsEm
      }
      ctx.restore()
    },
  }
}

/** Drop all decoded fonts and caches (e.g. for tests). */
export function clearGlyphPathCaches(): void {
  fontCache.clear()
  fontLoading.clear()
  variationCache.clear()
  glyphCache.clear()
}
