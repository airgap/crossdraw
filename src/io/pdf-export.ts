import { exportArtboardToBlob } from '@/io/raster-export'
import type { DesignDocument } from '@/types'

/**
 * Export artboard as a PDF with embedded PNG image.
 * Uses a minimal PDF 1.4 structure without external dependencies.
 */
export async function exportArtboardToPDF(doc: DesignDocument, artboardId?: string): Promise<Blob> {
  const artboard = artboardId
    ? doc.artboards.find((a) => a.id === artboardId)
    : doc.artboards[0]
  if (!artboard) throw new Error('No artboard found')

  // Render to PNG at 2x
  const pngBlob = await exportArtboardToBlob(doc, { format: 'png', scale: 2 }, artboardId)
  // PDF dimensions in points (1px = 0.75pt at 96dpi)
  const ptW = artboard.width * 0.75
  const ptH = artboard.height * 0.75

  // Build minimal PDF
  const objects: string[] = []
  const offsets: number[] = []
  let pos = 0

  function write(s: string) {
    objects.push(s)
    offsets.push(pos)
    pos += new TextEncoder().encode(s).length
  }

  const header = '%PDF-1.4\n'
  pos = header.length

  // Object 1: Catalog
  write(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)

  // Object 2: Pages
  write(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`)

  // Object 3: Page
  write(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Contents 4 0 R /Resources << /XObject << /Img0 5 0 R >> >> >>\nendobj\n`)

  // Object 4: Page content stream (draw image)
  const stream = `q\n${ptW} 0 0 ${ptH} 0 0 cm\n/Img0 Do\nQ`
  write(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`)

  // Object 5: Image XObject (PNG embedded as DCTDecode — we'll use FlateDecode with raw pixels)
  // For simplicity, embed as a raw RGB stream
  const bitmap = await createImageBitmap(pngBlob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  // Extract RGB bytes (PDF doesn't handle alpha in inline images easily)
  const rgbBytes = new Uint8Array(imageData.width * imageData.height * 3)
  for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
    rgbBytes[j] = imageData.data[i]!
    rgbBytes[j + 1] = imageData.data[i + 1]!
    rgbBytes[j + 2] = imageData.data[i + 2]!
  }

  // Encode as ASCII85 for PDF embedding
  const encoded = ascii85Encode(rgbBytes)
  const imgObj = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageData.width} /Height ${imageData.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCII85Decode /Length ${encoded.length} >>\nstream\n${encoded}\nendstream\nendobj\n`
  write(imgObj)

  // Cross-reference table
  const xrefPos = header.length + objects.reduce((s, o) => s + new TextEncoder().encode(o).length, 0)
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
  ]

  let cumOffset = header.length
  for (const obj of objects) {
    xref.push(String(cumOffset).padStart(10, '0') + ' 00000 n ')
    cumOffset += new TextEncoder().encode(obj).length
  }

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`

  // Assemble
  const parts = [header, ...objects, xref.join('\n') + '\n', trailer]
  return new Blob(parts, { type: 'application/pdf' })
}

function ascii85Encode(data: Uint8Array): string {
  const result: string[] = []
  for (let i = 0; i < data.length; i += 4) {
    const b0 = data[i] ?? 0
    const b1 = data[i + 1] ?? 0
    const b2 = data[i + 2] ?? 0
    const b3 = data[i + 3] ?? 0
    const n = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0

    if (n === 0 && i + 4 <= data.length) {
      result.push('z')
    } else {
      const chars: string[] = []
      let val = n
      for (let j = 4; j >= 0; j--) {
        chars[j] = String.fromCharCode(33 + (val % 85))
        val = Math.floor(val / 85)
      }
      const remaining = Math.min(data.length - i, 4)
      result.push(chars.slice(0, remaining + 1).join(''))
    }
  }
  result.push('~>')
  return result.join('')
}

export async function downloadPDF(doc: DesignDocument, filename?: string) {
  const blob = await exportArtboardToPDF(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `${doc.metadata.title}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
