import type { FontVariationAxis, TextLayer } from '@/types'

// ── Well-known registered axis tags ────────────────────────────

/** Map of registered OpenType axis tags to human-readable names. */
const REGISTERED_AXES: Record<string, string> = {
  wght: 'Weight',
  wdth: 'Width',
  ital: 'Italic',
  slnt: 'Slant',
  opsz: 'Optical Size',
}

// ── Query font axes ────────────────────────────────────────────

/**
 * Query the available variation axes for a given font family.
 *
 * Uses `document.fonts.check()` and the FontFace API when available,
 * otherwise returns default registered axes as a fallback.
 *
 * @param fontFamily - CSS font family name (e.g., 'Inter', 'Roboto Flex')
 * @returns Array of available axes with their ranges and defaults
 */
export function queryFontAxes(fontFamily: string): FontVariationAxis[] {
  // Try the FontFace API (only available in browsers with variable font support)
  if (typeof document !== 'undefined' && document.fonts) {
    const axes: FontVariationAxis[] = []

    // Iterate through loaded font faces to find matching ones
    for (const face of document.fonts) {
      if (face.family.replace(/['"]/g, '') !== fontFamily.replace(/['"]/g, '')) continue

      // The `variationAxes` property is available on some implementations
      const faceAny = face as unknown as Record<string, unknown>
      if (faceAny.variationAxes && Array.isArray(faceAny.variationAxes)) {
        for (const axis of faceAny.variationAxes as Array<{
          tag: string
          name: string
          minimum: number
          maximum: number
          defaultValue: number
        }>) {
          axes.push({
            tag: axis.tag,
            name: axis.name || REGISTERED_AXES[axis.tag] || axis.tag,
            min: axis.minimum,
            max: axis.maximum,
            default: axis.defaultValue,
            value: axis.defaultValue,
          })
        }
        return axes
      }
    }
  }

  // Fallback: return common registered axes with standard ranges
  return getDefaultAxes()
}

/**
 * Returns a set of default variable font axes based on the OpenType spec.
 * Useful as a fallback when the FontFace API does not expose axis metadata.
 */
export function getDefaultAxes(): FontVariationAxis[] {
  return [
    { tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400, value: 400 },
    { tag: 'wdth', name: 'Width', min: 75, max: 125, default: 100, value: 100 },
    { tag: 'ital', name: 'Italic', min: 0, max: 1, default: 0, value: 0 },
    { tag: 'slnt', name: 'Slant', min: -90, max: 90, default: 0, value: 0 },
    { tag: 'opsz', name: 'Optical Size', min: 8, max: 144, default: 14, value: 14 },
  ]
}

// ── Format variation settings ──────────────────────────────────

/**
 * Format an array of font variation axes into a CSS `font-variation-settings` string.
 *
 * Example output: `"'wght' 700, 'wdth' 85"`
 *
 * Only includes axes whose value differs from the default to keep the string compact.
 * If `includeAll` is true, includes every axis regardless.
 */
export function formatVariationSettings(axes: FontVariationAxis[], includeAll = false): string {
  const parts: string[] = []
  for (const axis of axes) {
    if (includeAll || axis.value !== axis.default) {
      parts.push(`'${axis.tag}' ${axis.value}`)
    }
  }
  return parts.join(', ')
}

// ── Apply to canvas context ────────────────────────────────────

/**
 * Apply font variation settings to a Canvas 2D rendering context.
 *
 * This modifies the `ctx.font` property to include the CSS `font-variation-settings`
 * equivalent by constructing a proper font string with variation values.
 *
 * @param ctx - Canvas 2D or OffscreenCanvas rendering context
 * @param layer - The TextLayer whose font to configure
 */
export function applyFontVariations(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
): void {
  const axes = layer.fontVariationAxes
  if (!axes || axes.length === 0) return

  // Build font-variation-settings string
  const variationStr = formatVariationSettings(axes, true)

  // Canvas 2D supports font-variation-settings via the extended font string syntax.
  // We set the font string using the CSS shorthand and the canvas will pick it up.
  const style = layer.fontStyle === 'italic' ? 'italic' : 'normal'
  const weight = getWeightFromAxes(axes, layer.fontWeight)
  const width = getWidthFromAxes(axes)
  const size = layer.fontSize

  // Build the font string with variation settings
  // The canvas API uses CSS font shorthand — we can embed variation settings via
  // the font property and then set fontVariationSettings on the context if supported
  ctx.font = `${style} ${weight} ${width}% ${size}px ${layer.fontFamily}`

  // Modern browsers support fontVariationSettings on CanvasRenderingContext2D
  const ctxAny = ctx as unknown as Record<string, unknown>
  if ('fontVariationSettings' in ctx || ctxAny.fontVariationSettings !== undefined) {
    ctxAny.fontVariationSettings = variationStr
  }
}

/**
 * Get the numeric weight value from axes if present, otherwise return the layer's fontWeight.
 */
function getWeightFromAxes(axes: FontVariationAxis[], fallback: 'normal' | 'bold'): number {
  const weightAxis = axes.find((a) => a.tag === 'wght')
  if (weightAxis) return weightAxis.value
  return fallback === 'bold' ? 700 : 400
}

/**
 * Get the width percentage from axes if present, otherwise return 100.
 */
function getWidthFromAxes(axes: FontVariationAxis[]): number {
  const widthAxis = axes.find((a) => a.tag === 'wdth')
  if (widthAxis) return widthAxis.value
  return 100
}

/**
 * Clamp an axis value to its allowed range.
 */
export function clampAxisValue(axis: FontVariationAxis, value: number): number {
  return Math.max(axis.min, Math.min(axis.max, value))
}

/**
 * Update a single axis value within a TextLayer's fontVariationAxes array.
 * Returns a new array (immutable update).
 */
export function updateAxisValue(axes: FontVariationAxis[], tag: string, value: number): FontVariationAxis[] {
  return axes.map((axis) => {
    if (axis.tag !== tag) return axis
    return { ...axis, value: clampAxisValue(axis, value) }
  })
}

/**
 * Reset all axis values to their defaults.
 */
export function resetAxes(axes: FontVariationAxis[]): FontVariationAxis[] {
  return axes.map((axis) => ({ ...axis, value: axis.default }))
}
