/**
 * CMYK colour editing mode.
 *
 * Allows documents to be converted between RGB and CMYK working colour
 * spaces.  All internal colours remain stored as hex strings; the CMYK
 * representation is computed on demand and converted back on commit.
 */

import type { DesignDocument, Layer, Fill, Stroke, Gradient, GradientStop } from '@/types'
import { rgbToCmyk, cmykToRgb, hexToRgb, rgbToHex } from './color-spaces'

// ─── CMYK colour type ────────────────────────────────────────

/** CMYK colour with 0-100 percentage ranges. */
export interface CMYKColor {
  c: number // 0-100
  m: number // 0-100
  y: number // 0-100
  k: number // 0-100
}

/** Document colour mode. */
export type ColorMode = 'rgb' | 'cmyk'

// ─── Conversion helpers ──────────────────────────────────────

/** Convert a hex string to CMYKColor (0-100). */
export function hexToCMYK(hex: string): CMYKColor {
  const [r, g, b] = hexToRgb(hex)
  const [c, m, y, k] = rgbToCmyk(r, g, b)
  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  }
}

/** Convert a CMYKColor (0-100) to hex string. */
export function cmykToHex(cmyk: CMYKColor): string {
  const [r, g, b] = cmykToRgb(cmyk.c / 100, cmyk.m / 100, cmyk.y / 100, cmyk.k / 100)
  return rgbToHex(r, g, b)
}

// ─── Document conversion ─────────────────────────────────────

/**
 * Convert all colours in a document to their CMYK-round-tripped equivalents.
 *
 * This simulates how colours will shift when interpreted as CMYK. The
 * document data remains in RGB hex internally — this pass simply applies
 * the lossy RGB→CMYK→RGB round-trip to every colour so the user can see
 * how their artwork would look in CMYK.
 */
export function convertDocumentToCMYK(doc: DesignDocument): DesignDocument {
  return mapDocumentColors(doc, roundTripCMYK)
}

/**
 * Re-interpret all document colours as clean RGB (identity — no conversion
 * needed since the data is already stored as RGB hex).
 *
 * This is effectively a no-op but is included for symmetry so callers can
 * toggle between modes.  If the document was previously pushed through
 * `convertDocumentToCMYK`, calling this restores nothing (the round-trip
 * is lossy); the caller should keep the original document around.
 */
export function convertDocumentToRGB(doc: DesignDocument): DesignDocument {
  // Identity — colours are already stored as hex RGB.
  return structuredClone(doc)
}

// ─── CMYK slider values ──────────────────────────────────────

/** Build an array of CMYK slider descriptors for a given hex colour. */
export function cmykSliders(hex: string): { label: string; channel: keyof CMYKColor; value: number }[] {
  const cmyk = hexToCMYK(hex)
  return [
    { label: 'C', channel: 'c', value: cmyk.c },
    { label: 'M', channel: 'm', value: cmyk.m },
    { label: 'Y', channel: 'y', value: cmyk.y },
    { label: 'K', channel: 'k', value: cmyk.k },
  ]
}

/**
 * Apply a single CMYK slider change and return the new hex colour.
 */
export function applyCMYKSliderChange(currentHex: string, channel: keyof CMYKColor, value: number): string {
  const cmyk = hexToCMYK(currentHex)
  cmyk[channel] = Math.max(0, Math.min(100, Math.round(value)))
  return cmykToHex(cmyk)
}

// ─── Internal: deep colour mapping ──────────────────────────

function roundTripCMYK(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const [c, m, y, k] = rgbToCmyk(r, g, b)
  const [r2, g2, b2] = cmykToRgb(c, m, y, k)
  return rgbToHex(r2, g2, b2)
}

function mapColor(color: string | undefined, fn: (hex: string) => string): string | undefined {
  if (!color) return color
  if (!color.startsWith('#')) return color
  return fn(color)
}

function mapFill(fill: Fill | null | undefined, fn: (hex: string) => string): Fill | null | undefined {
  if (!fill) return fill
  const mapped: Fill = { ...fill }
  if (mapped.color) mapped.color = mapColor(mapped.color, fn)
  if (mapped.gradient) mapped.gradient = mapGradient(mapped.gradient, fn)
  return mapped
}

function mapStroke(stroke: Stroke | null | undefined, fn: (hex: string) => string): Stroke | null | undefined {
  if (!stroke) return stroke
  return { ...stroke, color: fn(stroke.color) }
}

function mapGradientStop(stop: GradientStop, fn: (hex: string) => string): GradientStop {
  return { ...stop, color: fn(stop.color) }
}

function mapGradient(gradient: Gradient, fn: (hex: string) => string): Gradient {
  return {
    ...gradient,
    stops: gradient.stops.map((s) => mapGradientStop(s, fn)),
  }
}

function mapLayer(layer: Layer, fn: (hex: string) => string): Layer {
  const base = { ...layer } as Record<string, unknown>

  // Vector layer
  if (layer.type === 'vector') {
    const v = { ...layer }
    v.fill = mapFill(v.fill, fn) as Fill | null
    v.stroke = mapStroke(v.stroke, fn) as Stroke | null
    if (v.additionalFills) v.additionalFills = v.additionalFills.map((f) => mapFill(f, fn) as Fill)
    if (v.additionalStrokes) v.additionalStrokes = v.additionalStrokes.map((s) => mapStroke(s, fn) as Stroke)
    return v
  }

  // Text layer
  if (layer.type === 'text') {
    const t = { ...layer }
    t.color = fn(t.color)
    if (t.characterStyles) {
      t.characterStyles = t.characterStyles.map((cs) => ({
        ...cs,
        color: cs.color ? fn(cs.color) : cs.color,
      }))
    }
    return t
  }

  // Fill layer
  if (layer.type === 'fill') {
    const f = { ...layer }
    if (f.color) f.color = fn(f.color)
    if (f.gradient) f.gradient = mapGradient(f.gradient, fn)
    return f
  }

  // Group layer
  if (layer.type === 'group') {
    const g = { ...layer }
    g.children = g.children.map((c) => mapLayer(c, fn))
    return g
  }

  // Passthrough for raster, adjustment, filter, etc.
  return base as unknown as Layer
}

function mapDocumentColors(doc: DesignDocument, fn: (hex: string) => string): DesignDocument {
  const result = structuredClone(doc)

  for (const artboard of result.artboards) {
    artboard.backgroundColor = fn(artboard.backgroundColor)
    artboard.layers = artboard.layers.map((l) => mapLayer(l, fn))
  }

  if (result.assets.colors) {
    result.assets.colors = result.assets.colors.map((c) => ({
      ...c,
      value: fn(c.value),
    }))
  }

  if (result.assets.gradients) {
    result.assets.gradients = result.assets.gradients.map((g) => mapGradient(g, fn))
  }

  return result
}
