import { useEditorStore } from '@/store/editor.store'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import { exportArtboardToPDF } from '@/io/pdf-export'

const STORAGE_KEY = 'crossdraw:export-settings'

export type ExportFormatType = 'png' | 'jpeg' | 'svg' | 'pdf' | 'webp'
export type ExportRegion = 'artboard' | 'selection' | 'all-artboards'

export interface ExportSettings {
  format: ExportFormatType
  scale: number
  quality: number
  transparent: boolean
  embedICC: boolean
  progressive: boolean
  svgPrecision: number
  svgMinify: boolean
  svgEmbedFonts: boolean
  pdfDPI: number
  webpLossless: boolean
  region: ExportRegion
  width: number | null
  height: number | null
  linkedDimensions: boolean
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'png',
  scale: 2,
  quality: 85,
  transparent: true,
  embedICC: false,
  progressive: false,
  svgPrecision: 2,
  svgMinify: false,
  svgEmbedFonts: false,
  pdfDPI: 150,
  webpLossless: false,
  region: 'artboard',
  width: null,
  height: null,
  linkedDimensions: true,
}

export function loadExportSettings(): ExportSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...DEFAULT_EXPORT_SETTINGS }
    return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(stored) }
  } catch {
    return { ...DEFAULT_EXPORT_SETTINGS }
  }
}

export function saveExportSettings(settings: ExportSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function getExportFilename(title: string, settings: ExportSettings): string {
  const scaleSuffix = settings.scale !== 1 ? `@${settings.scale}x` : ''
  const extMap: Record<ExportFormatType, string> = {
    png: 'png',
    jpeg: 'jpg',
    svg: 'svg',
    pdf: 'pdf',
    webp: 'webp',
  }
  return `${title || 'Untitled'}${scaleSuffix}.${extMap[settings.format]}`
}

export async function performExport(settings: ExportSettings, artboardId?: string): Promise<Blob> {
  const store = useEditorStore.getState()
  const doc = store.document
  const targetArtboardId = artboardId ?? doc.artboards[0]?.id

  switch (settings.format) {
    case 'png': {
      const blob = await exportArtboardToBlob(doc, { format: 'png', scale: settings.scale }, targetArtboardId)
      // If transparency is off, composite on white
      if (!settings.transparent) {
        return compositeOnWhite(blob)
      }
      return blob
    }
    case 'jpeg': {
      return exportArtboardToBlob(
        doc,
        { format: 'jpeg', quality: settings.quality / 100, scale: settings.scale },
        targetArtboardId,
      )
    }
    case 'webp': {
      // Use OffscreenCanvas convertToBlob with webp type
      const pngBlob = await exportArtboardToBlob(doc, { format: 'png', scale: settings.scale }, targetArtboardId)
      const bitmap = await createImageBitmap(pngBlob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      if (!settings.transparent) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      return canvas.convertToBlob({
        type: 'image/webp',
        quality: settings.webpLossless ? 1 : settings.quality / 100,
      })
    }
    case 'svg': {
      const svgString = exportArtboardToSVG(doc, targetArtboardId)
      return new Blob([svgString], { type: 'image/svg+xml' })
    }
    case 'pdf': {
      return exportArtboardToPDF(doc, targetArtboardId)
    }
    default:
      throw new Error(`Unsupported format: ${settings.format}`)
  }
}

async function compositeOnWhite(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.convertToBlob({ type: 'image/png' })
}

/**
 * Quick export: immediately export using last-used settings.
 */
export async function quickExport() {
  const settings = loadExportSettings()
  const store = useEditorStore.getState()
  const doc = store.document
  const title = doc.metadata.title || 'Untitled'
  const filename = getExportFilename(title, settings)

  try {
    const blob = await performExport(settings)
    if (settings.format === 'svg') {
      const text = await blob.text()
      downloadSVG(text, filename)
    } else {
      await downloadBlob(blob, filename)
    }
    console.log(`Quick exported: ${filename} (${formatFileSize(blob.size)})`)
  } catch (err) {
    console.error('Quick export failed:', err)
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function estimateExportDimensions(
  settings: ExportSettings,
  artboardWidth: number,
  artboardHeight: number,
): { width: number; height: number } {
  if (settings.width && settings.height) {
    return { width: settings.width, height: settings.height }
  }
  return {
    width: Math.round(artboardWidth * settings.scale),
    height: Math.round(artboardHeight * settings.scale),
  }
}
