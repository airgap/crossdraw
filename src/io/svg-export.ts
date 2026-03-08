import { segmentsToSVGPath } from '@/math/path'
import { getRasterCanvas } from '@/store/raster-data'
import type { DesignDocument, VectorLayer, TextLayer, RasterLayer, GroupLayer, Layer, Gradient } from '@/types'

export function exportArtboardToSVG(doc: DesignDocument, artboardId?: string): string {
  const artboard = artboardId ? doc.artboards.find((a) => a.id === artboardId) : doc.artboards[0]

  if (!artboard) throw new Error('No artboard found')

  const lines: string[] = []
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">`,
  )

  // Collect gradient definitions (recursively)
  const gradients: Gradient[] = []
  collectGradients(artboard.layers, gradients)

  if (gradients.length > 0) {
    lines.push('  <defs>')
    for (const grad of gradients) {
      renderGradientDef(lines, grad, artboard.width, artboard.height)
    }
    lines.push('  </defs>')
  }

  // Background
  lines.push(
    `  <rect width="${artboard.width}" height="${artboard.height}" fill="${escapeXml(artboard.backgroundColor)}" />`,
  )

  for (const layer of artboard.layers) {
    renderLayerSVG(lines, layer, '  ')
  }

  lines.push('</svg>')
  return lines.join('\n')
}

function renderGradientDef(lines: string[], grad: Gradient, _artboardW: number, _artboardH: number) {
  const stopLines = grad.stops.map((s) => {
    const opacity = s.opacity < 1 ? ` stop-opacity="${s.opacity}"` : ''
    return `      <stop offset="${s.offset}" stop-color="${escapeXml(s.color)}"${opacity} />`
  })

  const gtAttrs = buildGradientTransformAttrs(grad)

  switch (grad.type) {
    case 'linear': {
      const angle = ((grad.angle ?? 0) * Math.PI) / 180
      const cx = grad.x
      const cy = grad.y
      const dx = Math.cos(angle) * 0.5
      const dy = Math.sin(angle) * 0.5
      lines.push(
        `    <linearGradient id="${grad.id}" x1="${cx - dx}" y1="${cy - dy}" x2="${cx + dx}" y2="${cy + dy}"${gtAttrs}>`,
      )
      lines.push(...stopLines)
      lines.push('    </linearGradient>')
      break
    }
    case 'radial': {
      const r = grad.radius ?? 0.5
      lines.push(`    <radialGradient id="${grad.id}" cx="${grad.x}" cy="${grad.y}" r="${r}"${gtAttrs}>`)
      lines.push(...stopLines)
      lines.push('    </radialGradient>')
      break
    }
    case 'conical':
    case 'box':
      // SVG doesn't natively support conical/box gradients; fallback to first stop color
      // (or could rasterize to image, but that's out of scope)
      break
  }
}

function buildGradientTransformAttrs(grad: Gradient): string {
  const parts: string[] = []
  if (grad.gradientUnits === 'userSpaceOnUse') {
    parts.push(` gradientUnits="userSpaceOnUse"`)
  }
  const gt = grad.gradientTransform
  if (gt) {
    const transforms: string[] = []
    if (gt.translateX || gt.translateY) transforms.push(`translate(${gt.translateX ?? 0} ${gt.translateY ?? 0})`)
    if (gt.rotate) transforms.push(`rotate(${gt.rotate})`)
    if (gt.scaleX !== undefined || gt.scaleY !== undefined)
      transforms.push(`scale(${gt.scaleX ?? 1} ${gt.scaleY ?? 1})`)
    if (transforms.length > 0) parts.push(` gradientTransform="${transforms.join(' ')}"`)
  }
  return parts.join('')
}

/** Recursively collect all gradient fills from layers. */
function collectGradients(layers: Layer[], out: Gradient[]) {
  for (const layer of layers) {
    if (layer.type === 'vector' && layer.fill?.type === 'gradient' && layer.fill.gradient) {
      out.push(layer.fill.gradient)
    }
    if (layer.type === 'group') {
      collectGradients(layer.children, out)
    }
  }
}

/** Build SVG transform attribute parts from a layer transform. */
function buildTransformParts(t: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }): string[] {
  const parts: string[] = []
  if (t.x !== 0 || t.y !== 0) parts.push(`translate(${t.x} ${t.y})`)
  if (t.scaleX !== 1 || t.scaleY !== 1) parts.push(`scale(${t.scaleX} ${t.scaleY})`)
  if (t.rotation) parts.push(`rotate(${t.rotation})`)
  return parts
}

/** Dispatch to the correct renderer for a layer type. */
function renderLayerSVG(lines: string[], layer: Layer, indent: string) {
  if (!layer.visible) return
  switch (layer.type) {
    case 'vector':
      renderVectorLayerSVG(lines, layer, indent)
      break
    case 'group':
      renderGroupLayerSVG(lines, layer, indent)
      break
    case 'text':
      renderTextLayerSVG(lines, layer)
      break
    case 'raster':
      renderRasterLayerSVG(lines, layer)
      break
  }
}

function renderGroupLayerSVG(lines: string[], group: GroupLayer, indent: string) {
  const transforms = buildTransformParts(group.transform)
  const attrs: string[] = []
  if (transforms.length > 0) attrs.push(`transform="${transforms.join(' ')}"`)
  if (group.opacity < 1) attrs.push(`opacity="${group.opacity}"`)

  lines.push(`${indent}<g${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>`)
  for (const child of group.children) {
    renderLayerSVG(lines, child, indent + '  ')
  }
  lines.push(`${indent}</g>`)
}

function renderVectorLayerSVG(lines: string[], layer: VectorLayer, baseIndent: string = '  ') {
  const transforms = buildTransformParts(layer.transform)

  const hasGroup = transforms.length > 0 || layer.opacity < 1
  const groupAttrs: string[] = []
  if (transforms.length > 0) groupAttrs.push(`transform="${transforms.join(' ')}"`)
  if (layer.opacity < 1) groupAttrs.push(`opacity="${layer.opacity}"`)

  if (hasGroup) {
    lines.push(`${baseIndent}<g ${groupAttrs.join(' ')}>`)
  }

  // ClipPath: if layer has a vector mask, emit a clipPath def
  if (layer.mask && layer.mask.type === 'vector') {
    const clipId = `clip-${layer.id}`
    const maskLayer = layer.mask
    lines.push(`${baseIndent}<defs><clipPath id="${clipId}">`)
    for (const mp of maskLayer.paths) {
      lines.push(`${baseIndent}  <path d="${segmentsToSVGPath(mp.segments)}" />`)
    }
    lines.push(`${baseIndent}</clipPath></defs>`)
    if (hasGroup) {
      // Need to add clip-path to the group
      // Search backwards for the <g> we just opened
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i]?.includes('<g ')) {
          lines[i] = lines[i]!.replace('<g ', `<g clip-path="url(#${clipId})" `)
          break
        }
      }
    }
  }

  for (const path of layer.paths) {
    const d = segmentsToSVGPath(path.segments)
    const attrs: string[] = [`d="${d}"`]
    if (path.fillRule === 'evenodd') attrs.push('fill-rule="evenodd"')

    if (layer.fill) {
      if (layer.fill.type === 'solid' && layer.fill.color) {
        attrs.push(`fill="${escapeXml(layer.fill.color)}"`)
        if (layer.fill.opacity < 1) attrs.push(`fill-opacity="${layer.fill.opacity}"`)
      } else if (layer.fill.type === 'gradient' && layer.fill.gradient) {
        const grad = layer.fill.gradient
        if (grad.type === 'linear' || grad.type === 'radial') {
          attrs.push(`fill="url(#${grad.id})"`)
          if (layer.fill.opacity < 1) attrs.push(`fill-opacity="${layer.fill.opacity}"`)
        } else {
          // Conical/box: fallback to first stop color
          const fallback = grad.stops[0]?.color ?? '#000000'
          attrs.push(`fill="${escapeXml(fallback)}"`)
        }
      } else {
        attrs.push('fill="none"')
      }
    } else {
      attrs.push('fill="none"')
    }

    if (layer.stroke) {
      attrs.push(`stroke="${escapeXml(layer.stroke.color)}"`)
      attrs.push(`stroke-width="${layer.stroke.width}"`)
      if (layer.stroke.opacity < 1) attrs.push(`stroke-opacity="${layer.stroke.opacity}"`)
      attrs.push(`stroke-linecap="${layer.stroke.linecap}"`)
      attrs.push(`stroke-linejoin="${layer.stroke.linejoin}"`)
      if (layer.stroke.dasharray && layer.stroke.dasharray.length > 0) {
        attrs.push(`stroke-dasharray="${layer.stroke.dasharray.join(' ')}"`)
      }
    }

    const indent = hasGroup ? baseIndent + '  ' : baseIndent
    lines.push(`${indent}<path ${attrs.join(' ')} />`)
  }

  if (hasGroup) {
    lines.push(`${baseIndent}</g>`)
  }
}

function renderRasterLayerSVG(lines: string[], layer: RasterLayer) {
  const canvas = getRasterCanvas(layer.imageChunkId)
  if (!canvas) return

  // Convert to base64 data URL
  const tempCanvas = new OffscreenCanvas(layer.width, layer.height)
  const ctx = tempCanvas.getContext('2d')!
  ctx.drawImage(canvas, 0, 0)

  // Use canvas to get data URL synchronously via a regular canvas
  // OffscreenCanvas doesn't have toDataURL, so we encode the pixel data manually
  const imageData = ctx.getImageData(0, 0, layer.width, layer.height)
  const dataUrl = imageDataToBase64PNG(imageData, layer.width, layer.height)

  const t = layer.transform
  const attrs: string[] = []
  attrs.push(`x="${t.x}"`)
  attrs.push(`y="${t.y}"`)
  attrs.push(`width="${layer.width}"`)
  attrs.push(`height="${layer.height}"`)
  if (layer.opacity < 1) attrs.push(`opacity="${layer.opacity}"`)

  const transforms: string[] = []
  if (t.scaleX !== 1 || t.scaleY !== 1) transforms.push(`scale(${t.scaleX} ${t.scaleY})`)
  if (t.rotation) transforms.push(`rotate(${t.rotation})`)
  if (transforms.length > 0) attrs.push(`transform="${transforms.join(' ')}"`)

  attrs.push(`href="${dataUrl}"`)
  lines.push(`  <image ${attrs.join(' ')} />`)
}

/**
 * Encode ImageData to a base64 PNG data URL.
 * Uses a minimal PNG encoder (uncompressed) for environments without canvas.toDataURL.
 */
function imageDataToBase64PNG(imageData: ImageData, width: number, height: number): string {
  // Build raw RGBA rows with filter byte
  const raw: number[] = []
  for (let y = 0; y < height; y++) {
    raw.push(0) // filter: none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      raw.push(imageData.data[i]!, imageData.data[i + 1]!, imageData.data[i + 2]!, imageData.data[i + 3]!)
    }
  }
  // Use deflate-less approach: store blocks (no compression)
  const deflated = deflateStore(new Uint8Array(raw))

  const crc32Table = buildCrc32Table()
  const png: number[] = []

  // PNG signature
  png.push(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)

  // IHDR
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  writeChunk(png, 'IHDR', ihdr, crc32Table)

  // IDAT
  writeChunk(png, 'IDAT', deflated, crc32Table)

  // IEND
  writeChunk(png, 'IEND', new Uint8Array(0), crc32Table)

  // Convert to base64
  const bytes = new Uint8Array(png)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return 'data:image/png;base64,' + btoa(binary)
}

function deflateStore(data: Uint8Array): Uint8Array {
  // zlib header + uncompressed DEFLATE blocks
  const maxBlock = 65535
  const numBlocks = Math.ceil(data.length / maxBlock) || 1
  const out = new Uint8Array(2 + data.length + numBlocks * 5 + 4) // zlib header + blocks + adler32
  let pos = 0
  out[pos++] = 0x78 // CMF
  out[pos++] = 0x01 // FLG
  let remaining = data.length
  let offset = 0
  while (remaining > 0) {
    const blockLen = Math.min(remaining, maxBlock)
    const last = remaining <= maxBlock ? 1 : 0
    out[pos++] = last
    out[pos++] = blockLen & 0xff
    out[pos++] = (blockLen >> 8) & 0xff
    out[pos++] = ~blockLen & 0xff
    out[pos++] = (~blockLen >> 8) & 0xff
    out.set(data.subarray(offset, offset + blockLen), pos)
    pos += blockLen
    offset += blockLen
    remaining -= blockLen
  }
  // Adler-32
  let a = 1,
    b = 0
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]!) % 65521
    b = (b + a) % 65521
  }
  const adler = ((b << 16) | a) >>> 0
  out[pos++] = (adler >> 24) & 0xff
  out[pos++] = (adler >> 16) & 0xff
  out[pos++] = (adler >> 8) & 0xff
  out[pos++] = adler & 0xff
  return out.subarray(0, pos)
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
}

function crc32(data: Uint8Array, table: Uint32Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function writeChunk(out: number[], type: string, data: Uint8Array, table: Uint32Array) {
  // Length (4 bytes big-endian)
  const len = data.length
  out.push((len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff)
  // Type (4 ASCII bytes)
  const typeBytes = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)])
  out.push(...typeBytes)
  // Data
  out.push(...data)
  // CRC over type + data
  const crcData = new Uint8Array(4 + data.length)
  crcData.set(typeBytes, 0)
  crcData.set(data, 4)
  const c = crc32(crcData, table)
  out.push((c >> 24) & 0xff, (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff)
}

function renderTextLayerSVG(lines: string[], layer: TextLayer) {
  const t = layer.transform
  const attrs: string[] = []
  attrs.push(`x="${t.x}"`)
  attrs.push(`y="${t.y}"`)
  attrs.push(`fill="${escapeXml(layer.color)}"`)
  attrs.push(`font-family="${escapeXml(layer.fontFamily)}"`)
  attrs.push(`font-size="${layer.fontSize}"`)
  if (layer.fontWeight === 'bold') attrs.push('font-weight="bold"')
  if (layer.fontStyle === 'italic') attrs.push('font-style="italic"')
  if (layer.opacity < 1) attrs.push(`opacity="${layer.opacity}"`)

  const transforms: string[] = []
  if (t.scaleX !== 1 || t.scaleY !== 1) transforms.push(`scale(${t.scaleX} ${t.scaleY})`)
  if (t.rotation) transforms.push(`rotate(${t.rotation})`)
  if (transforms.length > 0) attrs.push(`transform="${transforms.join(' ')}"`)

  lines.push(`  <text ${attrs.join(' ')} dominant-baseline="text-before-edge">${escapeXml(layer.text)}</text>`)
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function downloadSVG(svgString: string, filename = 'export.svg') {
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
