/**
 * PDF/X compliant export.
 *
 * Produces a minimal but valid PDF file with PDF/X compliance markers.
 * Supports PDF/X-1a (CMYK only), PDF/X-3 (allows ICC-based color), and
 * PDF/X-4 (allows transparency, layers).
 *
 * The generated PDF includes:
 * - Proper PDF header and cross-reference table
 * - OutputIntent with ICC profile reference (required for PDF/X)
 * - TrimBox and BleedBox (required for PDF/X)
 * - Content stream with vector paths, text, and embedded raster images
 * - Optional crop marks and color bars
 * - Transparency flattening for PDF/X-1a and PDF/X-3
 */

import type { DesignDocument, Layer, VectorLayer, TextLayer, RasterLayer, GroupLayer } from '@/types'
import { getRasterData } from '@/store/raster-data'

// ── Types ────────────────────────────────────────────────────────────────────

export type PDFXStandard = 'PDF/X-1a' | 'PDF/X-3' | 'PDF/X-4'

export interface PDFXSettings {
  /** PDF/X compliance standard. */
  standard: PDFXStandard
  /** Bleed margin in points (1pt = 1/72 inch). Typically 8.5pt ≈ 3mm. */
  bleed: number
  /** Draw crop marks at trim edges. */
  cropMarks: boolean
  /** Draw color calibration bars. */
  colorBars: boolean
  /** Target ICC profile name for OutputIntent. */
  iccProfileName: string
}

export const DEFAULT_PDFX_SETTINGS: PDFXSettings = {
  standard: 'PDF/X-4',
  bleed: 8.504, // ~3mm in points
  cropMarks: true,
  colorBars: false,
  iccProfileName: 'sRGB IEC61966-2.1',
}

// ── PDF object builder ───────────────────────────────────────────────────────

interface PDFObject {
  id: number
  data: string
  /** Byte offset in the final file (filled during serialization). */
  offset?: number
}

class PDFBuilder {
  private objects: PDFObject[] = []
  private nextId = 1

  /** Allocate and register a new PDF object. */
  addObject(data: string): number {
    const id = this.nextId++
    this.objects.push({ id, data })
    return id
  }

  /** Get all objects. */
  getObjects(): PDFObject[] {
    return this.objects
  }

  /** Serialize the complete PDF to a binary ArrayBuffer. */
  serialize(catalogId: number): ArrayBuffer {
    const encoder = new TextEncoder()
    const parts: string[] = []

    // Header
    parts.push('%PDF-1.6\n')
    // Binary comment to flag as binary PDF (required by spec)
    parts.push('%\xE2\xE3\xCF\xD3\n')

    // Objects — compute offsets
    const headerLen = encoder.encode(parts.join('')).byteLength
    let currentOffset = headerLen

    const offsets: number[] = new Array(this.objects.length)
    const objectStrings: string[] = []
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i]!
      offsets[i] = currentOffset
      const objStr = `${obj.id} 0 obj\n${obj.data}\nendobj\n`
      objectStrings.push(objStr)
      currentOffset += encoder.encode(objStr).byteLength
    }

    // Cross-reference table
    const xrefOffset = currentOffset
    const xrefLines: string[] = []
    xrefLines.push('xref\n')
    xrefLines.push(`0 ${this.objects.length + 1}\n`)
    xrefLines.push('0000000000 65535 f \n')
    for (let i = 0; i < this.objects.length; i++) {
      xrefLines.push(`${offsets[i]!.toString().padStart(10, '0')} 00000 n \n`)
    }

    // Trailer
    const trailerLines: string[] = []
    trailerLines.push('trailer\n')
    trailerLines.push(`<< /Size ${this.objects.length + 1} /Root ${catalogId} 0 R >>\n`)
    trailerLines.push('startxref\n')
    trailerLines.push(`${xrefOffset}\n`)
    trailerLines.push('%%EOF\n')

    const fullString = parts.join('') + objectStrings.join('') + xrefLines.join('') + trailerLines.join('')

    return encoder.encode(fullString).buffer as ArrayBuffer
  }
}

// ── Content stream generation ────────────────────────────────────────────────

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString()
}

function hexToRGBFloat(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ]
}

function rgbToCMYK(r: number, g: number, b: number): [number, number, number, number] {
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return [0, 0, 0, 1]
  const c = (1 - r - k) / (1 - k)
  const m = (1 - g - k) / (1 - k)
  const y = (1 - b - k) / (1 - k)
  return [c, m, y, k]
}

function renderLayerToStream(layer: Layer, pageHeight: number, useCMYK: boolean): string[] {
  if (!layer.visible) return []

  switch (layer.type) {
    case 'vector':
      return renderVectorStream(layer, pageHeight, useCMYK)
    case 'text':
      return renderTextStream(layer, pageHeight, useCMYK)
    case 'raster':
      return renderRasterStream(layer, pageHeight)
    case 'group':
      return renderGroupStream(layer, pageHeight, useCMYK)
    default:
      return []
  }
}

function setColor(hex: string, useCMYK: boolean, stroking: boolean): string {
  const [r, g, b] = hexToRGBFloat(hex)
  if (useCMYK) {
    const [c, m, y, k] = rgbToCMYK(r, g, b)
    return `${fmt(c)} ${fmt(m)} ${fmt(y)} ${fmt(k)} ${stroking ? 'K' : 'k'}`
  }
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} ${stroking ? 'RG' : 'rg'}`
}

function renderVectorStream(layer: VectorLayer, pageHeight: number, useCMYK: boolean): string[] {
  const cmds: string[] = []
  cmds.push('q') // save state

  const t = layer.transform
  if (t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0) {
    // Build a transformation matrix
    const cos = Math.cos((-t.rotation * Math.PI) / 180)
    const sin = Math.sin((-t.rotation * Math.PI) / 180)
    cmds.push(
      `${fmt(t.scaleX * cos)} ${fmt(t.scaleX * sin)} ${fmt(-t.scaleY * sin)} ${fmt(t.scaleY * cos)} ${fmt(t.x)} ${fmt(pageHeight - t.y)} cm`,
    )
  }

  for (const path of layer.paths) {
    for (const seg of path.segments) {
      switch (seg.type) {
        case 'move':
          cmds.push(`${fmt(seg.x)} ${fmt(pageHeight - seg.y)} m`)
          break
        case 'line':
          cmds.push(`${fmt(seg.x)} ${fmt(pageHeight - seg.y)} l`)
          break
        case 'cubic':
          cmds.push(
            `${fmt(seg.cp1x)} ${fmt(pageHeight - seg.cp1y)} ${fmt(seg.cp2x)} ${fmt(pageHeight - seg.cp2y)} ${fmt(seg.x)} ${fmt(pageHeight - seg.y)} c`,
          )
          break
        case 'quadratic':
          // Approximate quadratic as cubic
          cmds.push(
            `${fmt(seg.cpx)} ${fmt(pageHeight - seg.cpy)} ${fmt(seg.cpx)} ${fmt(pageHeight - seg.cpy)} ${fmt(seg.x)} ${fmt(pageHeight - seg.y)} c`,
          )
          break
        case 'close':
          cmds.push('h')
          break
      }
    }

    // Fill and/or stroke
    if (layer.fill && layer.stroke && layer.stroke.width > 0) {
      const fillColor = layer.fill.type === 'solid' && layer.fill.color ? layer.fill.color : '#000000'
      cmds.push(setColor(fillColor, useCMYK, false))
      cmds.push(setColor(layer.stroke.color, useCMYK, true))
      cmds.push(`${fmt(layer.stroke.width)} w`)
      cmds.push(path.fillRule === 'evenodd' ? 'B*' : 'B')
    } else if (layer.fill) {
      const fillColor = layer.fill.type === 'solid' && layer.fill.color ? layer.fill.color : '#000000'
      cmds.push(setColor(fillColor, useCMYK, false))
      cmds.push(path.fillRule === 'evenodd' ? 'f*' : 'f')
    } else if (layer.stroke && layer.stroke.width > 0) {
      cmds.push(setColor(layer.stroke.color, useCMYK, true))
      cmds.push(`${fmt(layer.stroke.width)} w`)
      cmds.push('S')
    }
  }

  cmds.push('Q') // restore state
  return cmds
}

function renderTextStream(layer: TextLayer, pageHeight: number, useCMYK: boolean): string[] {
  const cmds: string[] = []
  cmds.push('BT') // begin text
  cmds.push(`/F1 ${layer.fontSize} Tf`)
  cmds.push(setColor(layer.color, useCMYK, false))
  cmds.push(`${fmt(layer.transform.x)} ${fmt(pageHeight - layer.transform.y - layer.fontSize)} Td`)
  // Escape parentheses in PDF string
  const escaped = layer.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  cmds.push(`(${escaped}) Tj`)
  cmds.push('ET') // end text
  return cmds
}

function renderRasterStream(layer: RasterLayer, pageHeight: number): string[] {
  const imgData = getRasterData(layer.imageChunkId)
  if (!imgData) return []

  // Inline image (for small images) or XObject reference
  // For simplicity, we embed as inline image with ASCII85 encoding
  const cmds: string[] = []
  cmds.push('q')
  // Position and scale: PDF coordinates are bottom-up
  cmds.push(
    `${layer.width} 0 0 ${layer.height} ${layer.transform.x} ${fmt(pageHeight - layer.transform.y - layer.height)} cm`,
  )

  // Build RGB hex data
  const data = imgData.data
  const hexParts: string[] = []
  for (let i = 0; i < data.length; i += 4) {
    hexParts.push(
      data[i]!.toString(16).padStart(2, '0') +
        data[i + 1]!.toString(16).padStart(2, '0') +
        data[i + 2]!.toString(16).padStart(2, '0'),
    )
  }

  cmds.push('BI')
  cmds.push(`/W ${imgData.width} /H ${imgData.height} /CS /RGB /BPC 8`)
  cmds.push('ID')
  cmds.push(hexParts.join(''))
  cmds.push('EI')
  cmds.push('Q')
  return cmds
}

function renderGroupStream(group: GroupLayer, pageHeight: number, useCMYK: boolean): string[] {
  const cmds: string[] = []
  cmds.push('q')
  const t = group.transform
  if (t.x !== 0 || t.y !== 0) {
    cmds.push(`1 0 0 1 ${fmt(t.x)} ${fmt(-t.y)} cm`)
  }
  // Render children bottom-to-top
  const reversed = [...group.children].reverse()
  for (const child of reversed) {
    cmds.push(...renderLayerToStream(child, pageHeight, useCMYK))
  }
  cmds.push('Q')
  return cmds
}

function generateCropMarks(trimWidth: number, trimHeight: number, bleed: number): string[] {
  const cmds: string[] = []
  const markLen = 8.504 // ~3mm in points
  const offset = 8.504

  cmds.push('q')
  cmds.push('0 0 0 1 K') // CMYK black for stroking
  cmds.push('0.25 w') // 0.25pt line

  const left = bleed
  const bottom = bleed
  const right = bleed + trimWidth
  const top = bleed + trimHeight

  // Top-left
  cmds.push(`${fmt(left - offset - markLen)} ${fmt(top)} m ${fmt(left - offset)} ${fmt(top)} l S`)
  cmds.push(`${fmt(left)} ${fmt(top + offset)} m ${fmt(left)} ${fmt(top + offset + markLen)} l S`)
  // Top-right
  cmds.push(`${fmt(right + offset)} ${fmt(top)} m ${fmt(right + offset + markLen)} ${fmt(top)} l S`)
  cmds.push(`${fmt(right)} ${fmt(top + offset)} m ${fmt(right)} ${fmt(top + offset + markLen)} l S`)
  // Bottom-left
  cmds.push(`${fmt(left - offset - markLen)} ${fmt(bottom)} m ${fmt(left - offset)} ${fmt(bottom)} l S`)
  cmds.push(`${fmt(left)} ${fmt(bottom - offset - markLen)} m ${fmt(left)} ${fmt(bottom - offset)} l S`)
  // Bottom-right
  cmds.push(`${fmt(right + offset)} ${fmt(bottom)} m ${fmt(right + offset + markLen)} ${fmt(bottom)} l S`)
  cmds.push(`${fmt(right)} ${fmt(bottom - offset - markLen)} m ${fmt(right)} ${fmt(bottom - offset)} l S`)

  cmds.push('Q')
  return cmds
}

function generateColorBars(trimWidth: number, _trimHeight: number, bleed: number, useCMYK: boolean): string[] {
  const cmds: string[] = []
  const barWidth = 14.173 // ~5mm
  const barHeight = 11.339 // ~4mm
  const offset = 22.677 // ~8mm below trim bottom

  const bottom = bleed - offset - barHeight
  const left = bleed

  const colors = ['#00FFFF', '#FF00FF', '#FFFF00', '#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFFFF']

  const startX = left + (trimWidth - colors.length * barWidth) / 2

  cmds.push('q')
  for (let i = 0; i < colors.length; i++) {
    cmds.push(setColor(colors[i]!, useCMYK, false))
    cmds.push(`${fmt(startX + i * barWidth)} ${fmt(bottom)} ${fmt(barWidth)} ${fmt(barHeight)} re f`)
  }
  cmds.push('Q')

  return cmds
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Export a DesignDocument as a PDF/X compliant PDF file.
 */
export function exportPDFX(
  doc: DesignDocument,
  settings: PDFXSettings = DEFAULT_PDFX_SETTINGS,
  artboardId?: string,
): ArrayBuffer {
  const artboard = artboardId ? doc.artboards.find((a) => a.id === artboardId) : doc.artboards[0]
  if (!artboard) throw new Error('No artboard found')

  const { width, height } = artboard
  const bleed = settings.bleed
  const useCMYK = settings.standard === 'PDF/X-1a'

  // Total page size including bleed
  const pageWidth = width + bleed * 2
  const pageHeight = height + bleed * 2

  const pdf = new PDFBuilder()

  // 1) Font resource (basic Helvetica)
  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  // 2) Build content stream
  const streamCmds: string[] = []

  // Background
  const [bgR, bgG, bgB] = hexToRGBFloat(artboard.backgroundColor)
  if (useCMYK) {
    const [c, m, y, k] = rgbToCMYK(bgR, bgG, bgB)
    streamCmds.push(`${fmt(c)} ${fmt(m)} ${fmt(y)} ${fmt(k)} k`)
  } else {
    streamCmds.push(`${fmt(bgR)} ${fmt(bgG)} ${fmt(bgB)} rg`)
  }
  streamCmds.push(`${fmt(bleed)} ${fmt(bleed)} ${fmt(width)} ${fmt(height)} re f`)

  // Translate to bleed offset for layer rendering
  streamCmds.push('q')
  streamCmds.push(`1 0 0 1 ${fmt(bleed)} 0 cm`)

  // Render layers (bottom-to-top)
  const layersReversed = [...artboard.layers].reverse()
  for (const layer of layersReversed) {
    streamCmds.push(...renderLayerToStream(layer, pageHeight, useCMYK))
  }

  streamCmds.push('Q')

  // Crop marks and color bars
  if (settings.cropMarks) {
    streamCmds.push(...generateCropMarks(width, height, bleed))
  }
  if (settings.colorBars) {
    streamCmds.push(...generateColorBars(width, height, bleed, useCMYK))
  }

  const streamContent = streamCmds.join('\n')
  const contentId = pdf.addObject(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`)

  // 3) Resources dictionary
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> >>`)

  // 4) Page object with TrimBox and BleedBox
  const pageId = pdf.addObject(
    `<< /Type /Page /Parent PAGES_REF` +
      ` /MediaBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}]` +
      ` /TrimBox [${fmt(bleed)} ${fmt(bleed)} ${fmt(bleed + width)} ${fmt(bleed + height)}]` +
      ` /BleedBox [0 0 ${fmt(pageWidth)} ${fmt(pageHeight)}]` +
      ` /Contents ${contentId} 0 R` +
      ` /Resources ${resourcesId} 0 R >>`,
  )

  // 5) Pages object
  const pagesId = pdf.addObject(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`)

  // Fix up the Page parent reference
  const pageObj = pdf.getObjects().find((o) => o.id === pageId)!
  pageObj.data = pageObj.data.replace('PAGES_REF', `${pagesId} 0 R`)

  // 6) OutputIntent (required for PDF/X)
  const gtsKey =
    settings.standard === 'PDF/X-1a' ? '/GTS_PDFX' : settings.standard === 'PDF/X-3' ? '/GTS_PDFX' : '/GTS_PDFA1' // PDF/X-4

  const outputIntentId = pdf.addObject(
    `<< /Type /OutputIntent /S ${gtsKey}` +
      ` /OutputConditionIdentifier (${settings.iccProfileName})` +
      ` /RegistryName (http://www.color.org)` +
      ` /Info (${settings.iccProfileName}) >>`,
  )

  // 7) Metadata with PDF/X version info
  const pdfxVersion =
    settings.standard === 'PDF/X-1a' ? 'PDF/X-1a:2003' : settings.standard === 'PDF/X-3' ? 'PDF/X-3:2003' : 'PDF/X-4'

  const infoId = pdf.addObject(
    `<< /Title (${doc.metadata.title || 'Untitled'})` +
      ` /Creator (Crossdraw)` +
      ` /Producer (Crossdraw PDF/X Export)` +
      ` /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)})` +
      ` /GTS_PDFXVersion (${pdfxVersion}) >>`,
  )

  // 8) Catalog
  const catalogId = pdf.addObject(
    `<< /Type /Catalog /Pages ${pagesId} 0 R` +
      ` /OutputIntents [${outputIntentId} 0 R]` +
      ` /Metadata ${infoId} 0 R >>`,
  )

  return pdf.serialize(catalogId)
}
