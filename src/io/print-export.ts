import { exportArtboardToBlob } from '@/io/raster-export'
import type { DesignDocument } from '@/types'

// ── Paper sizes in mm ──

const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
  tabloid: { width: 279.4, height: 431.8 },
}

// ── Types ──

export interface PrintSettings {
  dpi: number // 72, 150, 300, 600
  colorMode: 'rgb' | 'cmyk' // CMYK for print
  bleed: number // bleed margin in mm (typically 3mm)
  cropMarks: boolean // draw crop marks at corners
  registrationMarks: boolean // draw registration marks
  colorBars: boolean // draw color calibration bars
  paperSize: 'a4' | 'a3' | 'letter' | 'legal' | 'tabloid' | 'custom'
  customWidth?: number // mm
  customHeight?: number // mm
  margins: { top: number; right: number; bottom: number; left: number } // mm
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  dpi: 300,
  colorMode: 'cmyk',
  bleed: 3,
  cropMarks: true,
  registrationMarks: true,
  colorBars: false,
  paperSize: 'a4',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
}

// ── Helpers ──

/** Convert mm to pixels at a given DPI. */
function mmToPx(mm: number, dpi: number): number {
  return (mm / 25.4) * dpi
}

/** Get paper dimensions in mm. */
export function getPaperDimensions(settings: PrintSettings): { width: number; height: number } {
  if (settings.paperSize === 'custom') {
    return {
      width: settings.customWidth ?? 210,
      height: settings.customHeight ?? 297,
    }
  }
  return PAPER_SIZES[settings.paperSize] ?? PAPER_SIZES.a4!
}

/** Calculate the full canvas size in pixels including bleed. */
export function calculateCanvasDimensions(settings: PrintSettings): {
  totalWidth: number
  totalHeight: number
  trimWidth: number
  trimHeight: number
  bleedPx: number
} {
  const paper = getPaperDimensions(settings)
  const bleedPx = mmToPx(settings.bleed, settings.dpi)
  const trimWidth = mmToPx(paper.width, settings.dpi)
  const trimHeight = mmToPx(paper.height, settings.dpi)

  return {
    totalWidth: Math.ceil(trimWidth + bleedPx * 2),
    totalHeight: Math.ceil(trimHeight + bleedPx * 2),
    trimWidth: Math.ceil(trimWidth),
    trimHeight: Math.ceil(trimHeight),
    bleedPx,
  }
}

// ── Crop marks ──

function drawCropMarks(
  ctx: OffscreenCanvasRenderingContext2D,
  bleedPx: number,
  trimWidth: number,
  trimHeight: number,
  dpi: number,
) {
  const lineWidth = (0.25 / 72) * dpi // 0.25pt in pixels
  const markLen = mmToPx(3, dpi) // 3mm long
  const offset = mmToPx(3, dpi) // 3mm offset from trim edge

  ctx.save()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'butt'

  const trimLeft = bleedPx
  const trimTop = bleedPx
  const trimRight = bleedPx + trimWidth
  const trimBottom = bleedPx + trimHeight

  // Top-left corner
  ctx.beginPath()
  ctx.moveTo(trimLeft - offset - markLen, trimTop)
  ctx.lineTo(trimLeft - offset, trimTop)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(trimLeft, trimTop - offset - markLen)
  ctx.lineTo(trimLeft, trimTop - offset)
  ctx.stroke()

  // Top-right corner
  ctx.beginPath()
  ctx.moveTo(trimRight + offset, trimTop)
  ctx.lineTo(trimRight + offset + markLen, trimTop)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(trimRight, trimTop - offset - markLen)
  ctx.lineTo(trimRight, trimTop - offset)
  ctx.stroke()

  // Bottom-left corner
  ctx.beginPath()
  ctx.moveTo(trimLeft - offset - markLen, trimBottom)
  ctx.lineTo(trimLeft - offset, trimBottom)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(trimLeft, trimBottom + offset)
  ctx.lineTo(trimLeft, trimBottom + offset + markLen)
  ctx.stroke()

  // Bottom-right corner
  ctx.beginPath()
  ctx.moveTo(trimRight + offset, trimBottom)
  ctx.lineTo(trimRight + offset + markLen, trimBottom)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(trimRight, trimBottom + offset)
  ctx.lineTo(trimRight, trimBottom + offset + markLen)
  ctx.stroke()

  ctx.restore()
}

// ── Registration marks ──

function drawRegistrationMarks(
  ctx: OffscreenCanvasRenderingContext2D,
  bleedPx: number,
  trimWidth: number,
  trimHeight: number,
  dpi: number,
) {
  const lineWidth = (0.25 / 72) * dpi
  const radius = mmToPx(2, dpi) // 2mm radius bullseye
  const offset = mmToPx(5, dpi) // offset from trim edge

  const trimLeft = bleedPx
  const trimTop = bleedPx
  const trimRight = bleedPx + trimWidth
  const trimBottom = bleedPx + trimHeight

  const midX = (trimLeft + trimRight) / 2
  const midY = (trimTop + trimBottom) / 2

  const positions = [
    { x: midX, y: trimTop - offset }, // top center
    { x: midX, y: trimBottom + offset }, // bottom center
    { x: trimLeft - offset, y: midY }, // left center
    { x: trimRight + offset, y: midY }, // right center
  ]

  ctx.save()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = lineWidth

  for (const pos of positions) {
    // Outer circle
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
    ctx.stroke()

    // Inner circle
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2)
    ctx.stroke()

    // Crosshair
    ctx.beginPath()
    ctx.moveTo(pos.x - radius, pos.y)
    ctx.lineTo(pos.x + radius, pos.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y - radius)
    ctx.lineTo(pos.x, pos.y + radius)
    ctx.stroke()
  }

  ctx.restore()
}

// ── Color bars ──

function drawColorBars(
  ctx: OffscreenCanvasRenderingContext2D,
  bleedPx: number,
  trimWidth: number,
  trimHeight: number,
  dpi: number,
) {
  const barHeight = mmToPx(4, dpi)
  const barWidth = mmToPx(5, dpi)
  const offset = mmToPx(8, dpi) // below bottom trim edge

  const trimLeft = bleedPx
  const trimBottom = bleedPx + trimHeight

  // Color bar swatches: C, M, Y, K, R, G, B + grayscale steps
  const colors = [
    '#00FFFF', // Cyan
    '#FF00FF', // Magenta
    '#FFFF00', // Yellow
    '#000000', // Black
    '#FF0000', // Red
    '#00FF00', // Green
    '#0000FF', // Blue
    '#FFFFFF', // White
    '#CCCCCC', // Light gray
    '#999999', // Mid gray
    '#666666', // Dark gray
    '#333333', // Near black
  ]

  const startX = trimLeft + (trimWidth - colors.length * barWidth) / 2
  const y = trimBottom + offset

  ctx.save()
  for (let i = 0; i < colors.length; i++) {
    ctx.fillStyle = colors[i]!
    ctx.fillRect(startX + i * barWidth, y, barWidth, barHeight)
    // Outline
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = (0.25 / 72) * dpi
    ctx.strokeRect(startX + i * barWidth, y, barWidth, barHeight)
  }
  ctx.restore()
}

// ── Simple RGB-to-CMYK pixel transform ──

function applySimulatedCMYK(imageData: ImageData) {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255
    const g = data[i + 1]! / 255
    const b = data[i + 2]! / 255

    const k = 1 - Math.max(r, g, b)
    if (k >= 1) {
      // Pure black
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      continue
    }

    const c = (1 - r - k) / (1 - k)
    const m = (1 - g - k) / (1 - k)
    const y = (1 - b - k) / (1 - k)

    // Convert back to RGB for display/export
    data[i] = Math.round((1 - c) * (1 - k) * 255)
    data[i + 1] = Math.round((1 - m) * (1 - k) * 255)
    data[i + 2] = Math.round((1 - y) * (1 - k) * 255)
    // Alpha stays the same
  }
}

// ── Main export function ──

export async function exportForPrint(
  document: DesignDocument,
  artboardIndex: number,
  settings: PrintSettings,
): Promise<Blob> {
  const artboard = document.artboards[artboardIndex]
  if (!artboard) throw new Error(`Artboard at index ${artboardIndex} not found`)

  const { totalWidth, totalHeight, trimWidth, trimHeight, bleedPx } = calculateCanvasDimensions(settings)

  // Calculate the marks area needed (extend canvas further for marks outside bleed)
  const marksMargin = mmToPx(12, settings.dpi) // extra room for marks
  const canvasWidth = totalWidth + (settings.cropMarks || settings.registrationMarks ? marksMargin * 2 : 0)
  const canvasHeight =
    totalHeight +
    (settings.cropMarks || settings.registrationMarks ? marksMargin * 2 : 0) +
    (settings.colorBars ? mmToPx(16, settings.dpi) : 0)

  const canvas = new OffscreenCanvas(Math.ceil(canvasWidth), Math.ceil(canvasHeight))
  const ctx = canvas.getContext('2d')!

  // Fill with white (paper)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  // Offset for marks margin
  const offsetX = settings.cropMarks || settings.registrationMarks ? marksMargin : 0
  const offsetY = settings.cropMarks || settings.registrationMarks ? marksMargin : 0

  // Render the artboard content into the trim area (with bleed extending beyond)
  // First, render the artboard at high res
  const scaleX = trimWidth / artboard.width
  const scaleY = trimHeight / artboard.height
  const artboardScale = Math.min(scaleX, scaleY)

  // Render artboard at the needed DPI scale
  const artboardBlob = await exportArtboardToBlob(document, { format: 'png', scale: artboardScale }, artboard.id)

  // Draw the artboard content onto the print canvas
  const artboardBitmap = await createImageBitmap(artboardBlob)

  // Position: center the artboard in the trim area
  const contentX = offsetX + bleedPx + (trimWidth - artboardBitmap.width) / 2
  const contentY = offsetY + bleedPx + (trimHeight - artboardBitmap.height) / 2

  ctx.drawImage(artboardBitmap, contentX, contentY)
  artboardBitmap.close()

  // Draw print marks (relative to the offset)
  if (settings.cropMarks) {
    drawCropMarks(ctx, offsetX + bleedPx, trimWidth, trimHeight, settings.dpi)
  }

  if (settings.registrationMarks) {
    drawRegistrationMarks(ctx, offsetX + bleedPx, trimWidth, trimHeight, settings.dpi)
  }

  if (settings.colorBars) {
    drawColorBars(ctx, offsetX + bleedPx, trimWidth, trimHeight, settings.dpi)
  }

  // Apply CMYK simulation if requested
  if (settings.colorMode === 'cmyk') {
    const imageData = ctx.getImageData(0, 0, Math.ceil(canvasWidth), Math.ceil(canvasHeight))
    applySimulatedCMYK(imageData)
    ctx.putImageData(imageData, 0, 0)
  }

  // Export as high-quality PNG
  return canvas.convertToBlob({ type: 'image/png' })
}

// ── Preview generation (lower resolution for dialog preview) ──

export async function generatePrintPreview(
  document: DesignDocument,
  artboardIndex: number,
  settings: PrintSettings,
  _maxPreviewWidth: number = 400,
): Promise<Blob> {
  // Use a lower DPI for preview to keep it fast
  const previewSettings: PrintSettings = {
    ...settings,
    dpi: 72,
  }
  return exportForPrint(document, artboardIndex, previewSettings)
}
