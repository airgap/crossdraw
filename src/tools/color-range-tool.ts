/**
 * Color Range tool — select all pixels matching a sampled color across the entire layer.
 * Click to sample a target color, adjust fuzziness to expand/contract the selection,
 * then commit to apply the selection mask.
 */
import { colorRangeSelect, type SelectionMask } from '@/tools/raster-selection'

export interface ColorRangeSettings {
  fuzziness: number
  sampleColor: { r: number; g: number; b: number } | null
  preview: boolean
}

const settings: ColorRangeSettings = {
  fuzziness: 40,
  sampleColor: null,
  preview: true,
}

let previewMask: SelectionMask | null = null

export function getColorRangeSettings(): ColorRangeSettings {
  return { ...settings }
}

export function setColorRangeSettings(patch: Partial<ColorRangeSettings>) {
  if (patch.fuzziness !== undefined) settings.fuzziness = Math.max(0, Math.min(200, patch.fuzziness))
  if (patch.sampleColor !== undefined) settings.sampleColor = patch.sampleColor
  if (patch.preview !== undefined) settings.preview = patch.preview
}

/**
 * Sample a color from the given pixel coordinates in the image data.
 * Returns the sampled RGB color and updates internal settings.
 */
export function beginColorRangeSample(
  x: number,
  y: number,
  imageData: ImageData,
): { r: number; g: number; b: number } | null {
  const ix = Math.round(x)
  const iy = Math.round(y)
  if (ix < 0 || iy < 0 || ix >= imageData.width || iy >= imageData.height) return null

  const idx = (iy * imageData.width + ix) * 4
  const color = {
    r: imageData.data[idx]!,
    g: imageData.data[idx + 1]!,
    b: imageData.data[idx + 2]!,
  }

  settings.sampleColor = color

  // Generate preview if enabled
  if (settings.preview) {
    previewMask = colorRangeSelect(imageData, color, settings.fuzziness, 'replace')
  }

  return color
}

/**
 * Update the fuzziness and regenerate the preview mask if a color is sampled.
 */
export function updateColorRangeFuzziness(fuzziness: number, imageData?: ImageData): SelectionMask | null {
  settings.fuzziness = Math.max(0, Math.min(200, fuzziness))

  if (settings.sampleColor && settings.preview && imageData) {
    previewMask = colorRangeSelect(imageData, settings.sampleColor, settings.fuzziness, 'replace')
  }

  return previewMask
}

/**
 * Commit the color range selection with the specified mode.
 * Applies the selection mask from the currently sampled color and fuzziness.
 */
export function commitColorRange(
  imageData: ImageData,
  mode: 'replace' | 'add' | 'subtract' = 'replace',
): SelectionMask | null {
  if (!settings.sampleColor) return null
  const mask = colorRangeSelect(imageData, settings.sampleColor, settings.fuzziness, mode)
  previewMask = null
  return mask
}

/**
 * Get the current preview mask (for overlay rendering).
 */
export function getColorRangePreviewMask(): SelectionMask | null {
  return previewMask
}

/**
 * Reset the color range tool state.
 */
export function resetColorRange() {
  settings.sampleColor = null
  previewMask = null
}
