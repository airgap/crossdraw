import { exportArtboardToBlob } from '@/io/raster-export'
import { exportArtboardToSVG } from '@/io/svg-export'
import type { DesignDocument, ExportSlice, Artboard } from '@/types'

export interface BatchExportResult {
  name: string
  format: string
  scale: number
  blob: Blob
}

/**
 * Export all slices from an artboard as individual files.
 */
export async function batchExportSlices(
  doc: DesignDocument,
  artboardId?: string,
): Promise<BatchExportResult[]> {
  const artboard = artboardId
    ? doc.artboards.find(a => a.id === artboardId)
    : doc.artboards[0]

  if (!artboard) throw new Error('No artboard found')
  if (!artboard.slices || artboard.slices.length === 0) {
    throw new Error('No export slices defined')
  }

  const results: BatchExportResult[] = []

  for (const slice of artboard.slices) {
    const blob = await exportSlice(doc, artboard, slice)
    results.push({
      name: slice.name,
      format: slice.format,
      scale: slice.scale,
      blob,
    })
  }

  return results
}

async function exportSlice(
  doc: DesignDocument,
  artboard: Artboard,
  slice: ExportSlice,
): Promise<Blob> {
  if (slice.format === 'svg') {
    // For SVG we export the full artboard (slicing individual SVG regions is complex)
    const svgString = exportArtboardToSVG(doc, artboard.id)
    return new Blob([svgString], { type: 'image/svg+xml' })
  }

  // For raster formats, export the artboard and crop to slice region
  const fullBlob = await exportArtboardToBlob(
    doc,
    { format: slice.format === 'jpeg' ? 'jpeg' : 'png', scale: slice.scale },
    artboard.id,
  )

  // If slice covers entire artboard, return as-is
  if (
    slice.x === 0 && slice.y === 0 &&
    slice.width === artboard.width && slice.height === artboard.height
  ) {
    return fullBlob
  }

  // Crop to slice region using OffscreenCanvas
  const bitmap = await createImageBitmap(fullBlob)
  const scale = slice.scale
  const cropCanvas = new OffscreenCanvas(slice.width * scale, slice.height * scale)
  const ctx = cropCanvas.getContext('2d')!
  ctx.drawImage(
    bitmap,
    slice.x * scale, slice.y * scale,
    slice.width * scale, slice.height * scale,
    0, 0,
    slice.width * scale, slice.height * scale,
  )
  bitmap.close()

  return cropCanvas.convertToBlob({
    type: slice.format === 'jpeg' ? 'image/jpeg' : 'image/png',
    quality: slice.format === 'jpeg' ? 0.92 : undefined,
  })
}

/**
 * Download all batch export results as individual files.
 */
export async function downloadBatchExport(results: BatchExportResult[]) {
  for (const result of results) {
    const ext = result.format
    const suffix = result.scale !== 1 ? `@${result.scale}x` : ''
    const filename = `${result.name}${suffix}.${ext}`
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}

/**
 * Add a slice to an artboard.
 */
export function createSlice(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'svg' = 'png',
  scale = 1,
): ExportSlice {
  return {
    id: crypto.randomUUID(),
    name,
    x, y, width, height,
    format,
    scale,
  }
}
