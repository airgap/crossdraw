/**
 * Handles pasting text styles captured by the Crossdraw Chrome extension.
 *
 * The extension copies a JSON payload to the clipboard with:
 *   - text content
 *   - full computed CSS text styling
 *   - font variation axes
 *   - OpenType feature settings
 *
 * This module detects that payload and creates a properly styled text layer.
 */

import { v4 as uuid } from 'uuid'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { TextLayer, FontVariationAxis } from '@/types'
import { getCatalogFont } from '@/ui/font-picker'
import { loadFont } from '@/fonts/loader'

interface CrossdrawTextPayload {
  _crossdraw: 'text-style'
  version: number
  text: string
  style: {
    fontFamily?: string
    fontSize?: string
    fontWeight?: string
    fontWeightNumeric?: number
    fontStyle?: string
    fontSizePx?: number
    color?: string
    colorRGBA?: { r: number; g: number; b: number; a: number } | null
    textAlign?: string
    textDecoration?: string
    textTransform?: string
    letterSpacing?: string
    letterSpacingPx?: number
    wordSpacing?: string
    wordSpacingPx?: number
    lineHeight?: string
    lineHeightRatio?: number
    fontVariationSettings?: string
    fontFeatureSettings?: string
    fontKerning?: string
    textOrientation?: string
    writingMode?: string
    textIndent?: string
    textShadow?: string
  }
  variationAxes?: Array<{ tag: string; value: number }>
  openTypeFeatures?: Record<string, boolean>
  sourceUrl?: string
}

/** Try to parse a Crossdraw text-style payload from clipboard text. Returns null if not our format. */
function parsePayload(text: string): CrossdrawTextPayload | null {
  try {
    const obj = JSON.parse(text)
    if (obj?._crossdraw === 'text-style' && obj.version >= 1) {
      return obj
    }
  } catch {
    // Not JSON — not our format
  }
  return null
}

/** Resolve the best font family from the CSS font-family string. */
function resolveFontFamily(cssFontFamily: string): string {
  // CSS font-family is comma-separated, e.g. '"Inter", "Helvetica Neue", sans-serif'
  const families = cssFontFamily.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, ''))

  // Try to find each in our Google Fonts catalog
  for (const family of families) {
    const catalogFont = getCatalogFont(family)
    if (catalogFont) {
      // Kick off loading
      loadFont(catalogFont)
      return family
    }
  }

  // Fallback: use the first specified family even if we don't have it
  return families[0] || 'sans-serif'
}

/** Convert RGBA to hex color string. */
function rgbaToHex(rgba: { r: number; g: number; b: number; a: number }): string {
  const r = rgba.r.toString(16).padStart(2, '0')
  const g = rgba.g.toString(16).padStart(2, '0')
  const b = rgba.b.toString(16).padStart(2, '0')
  if (rgba.a < 1) {
    const a = Math.round(rgba.a * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${r}${g}${b}${a}`
  }
  return `#${r}${g}${b}`
}

/**
 * Attempt to paste from the Crossdraw Chrome extension clipboard format.
 * Returns true if a text layer was created, false if the clipboard didn't contain our format.
 */
export async function pasteWebTextStyle(): Promise<boolean> {
  let clipText: string
  try {
    clipText = await navigator.clipboard.readText()
  } catch {
    return false
  }

  const payload = parsePayload(clipText)
  if (!payload) return false

  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return false

  const s = payload.style

  // Resolve font
  const fontFamily = s.fontFamily ? resolveFontFamily(s.fontFamily) : 'sans-serif'

  // Resolve weight
  const weight = s.fontWeightNumeric ?? 400
  const fontWeight: 'normal' | 'bold' = weight <= 400 ? 'normal' : weight >= 700 ? 'bold' : 'normal'

  // Resolve color
  let color = '#000000'
  if (s.colorRGBA && s.colorRGBA.r !== undefined) {
    color = rgbaToHex(s.colorRGBA)
  } else if (s.color) {
    color = s.color
  }

  // Build variation axes
  const fontVariationAxes: FontVariationAxis[] = []
  if (payload.variationAxes && payload.variationAxes.length > 0) {
    for (const axis of payload.variationAxes) {
      fontVariationAxes.push({
        tag: axis.tag,
        name: axis.tag, // We don't have the full name from the extension
        min: 0,
        max: 1000,
        default: axis.value,
        value: axis.value,
      })
    }
  }
  // Also include the weight as an axis if numeric and not already present
  if (weight !== 400 && !fontVariationAxes.some((a) => a.tag === 'wght')) {
    fontVariationAxes.push({
      tag: 'wght',
      name: 'Weight',
      min: 100,
      max: 900,
      default: 400,
      value: weight,
    })
  }

  // Build OpenType features
  const openTypeFeatures: Record<string, boolean> = {}
  if (payload.openTypeFeatures) {
    for (const [tag, enabled] of Object.entries(payload.openTypeFeatures)) {
      openTypeFeatures[tag] = !!enabled
    }
  }

  // Resolve text properties
  const textAlign = (['left', 'center', 'right'].includes(s.textAlign ?? '') ? s.textAlign : 'left') as
    | 'left'
    | 'center'
    | 'right'

  const textDecoration = (
    ['underline', 'line-through'].includes(s.textDecoration?.split(' ')[0] ?? '')
      ? s.textDecoration!.split(' ')[0]
      : 'none'
  ) as 'none' | 'underline' | 'line-through'

  const textTransform = (
    ['uppercase', 'lowercase', 'capitalize'].includes(s.textTransform ?? '') ? s.textTransform : 'none'
  ) as 'none' | 'uppercase' | 'lowercase' | 'capitalize'

  const textOrientation = s.writingMode === 'vertical-rl' || s.writingMode === 'vertical-lr' ? 'vertical' : 'horizontal'

  const layer: TextLayer = {
    id: uuid(),
    name: `Web Text`,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text: payload.text || 'Pasted text',
    fontFamily,
    fontSize: s.fontSizePx ?? 16,
    fontWeight,
    fontStyle: s.fontStyle === 'italic' ? 'italic' : 'normal',
    textAlign,
    lineHeight: s.lineHeightRatio ?? 1.4,
    letterSpacing: s.letterSpacingPx ?? 0,
    color,
    textDecoration,
    textTransform,
    textOrientation,
    ...(fontVariationAxes.length > 0 ? { fontVariationAxes } : {}),
    ...(Object.keys(openTypeFeatures).length > 0 ? { openTypeFeatures } : {}),
  }

  store.addLayer(artboard.id, layer)
  store.selectLayer(layer.id)

  return true
}
