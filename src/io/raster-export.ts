import { segmentsToPath2D } from '@/math/path'
import { getRasterCanvas } from '@/store/raster-data'
import { applyAdjustment } from '@/effects/adjustments'
import { applyFilterLayerToCanvas } from '@/effects/filter-layer'
import { createCanvasGradient, renderBoxGradient } from '@/render/gradient'
import { renderMeshGradient } from '@/render/mesh-gradient'
import { needsPathRendering, getPathText, ensurePathTextReady } from '@/fonts/glyph-paths'
import { encodeGIF } from '@/io/gif-encoder'
import { encodeTIFF } from '@/io/tiff-encoder'
import type {
  DesignDocument,
  Layer,
  VectorLayer,
  RasterLayer,
  GroupLayer,
  AdjustmentLayer,
  FilterLayer,
  TextLayer,
} from '@/types'

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'tiff'

export interface ExportOptions {
  format: ExportFormat
  quality?: number // 0-1, for JPEG
  scale?: number // 1x, 2x (retina), etc.
}

export async function exportArtboardToBlob(
  doc: DesignDocument,
  options: ExportOptions,
  artboardId?: string,
): Promise<Blob> {
  const artboard = artboardId ? doc.artboards.find((a) => a.id === artboardId) : doc.artboards[0]

  if (!artboard) throw new Error('No artboard found')

  const scale = options.scale ?? 1
  const canvas = new OffscreenCanvas(artboard.width * scale, artboard.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  // Pre-load fonts for text layers that use variable axes or OT features
  // so getPathText() returns ready=true synchronously during render.
  const textFamilies = new Set<string>()
  collectTextFamilies(artboard.layers, textFamilies)
  if (textFamilies.size > 0) {
    await Promise.all([...textFamilies].map((f) => ensurePathTextReady(f)))
  }

  // Background
  ctx.fillStyle = artboard.backgroundColor
  ctx.fillRect(0, 0, artboard.width, artboard.height)

  // Check for adjustment or filter layers that need pixel-level processing
  const hasPixelLayers = artboard.layers.some((l) => (l.type === 'adjustment' || l.type === 'filter') && l.visible)

  if (hasPixelLayers) {
    // Render with pixel-level adjustments/filters
    for (const layer of artboard.layers) {
      if (!layer.visible) continue
      if (layer.type === 'adjustment') {
        const imageData = ctx.getImageData(0, 0, artboard.width * scale, artboard.height * scale)
        applyAdjustment(imageData, layer as AdjustmentLayer)
        ctx.putImageData(imageData, 0, 0)
      } else if (layer.type === 'filter') {
        applyFilterLayerToCanvas(ctx, layer as FilterLayer, artboard.width * scale, artboard.height * scale)
      } else {
        renderLayerWithMask(ctx, layer, artboard.width, artboard.height)
      }
    }
  } else {
    for (const layer of artboard.layers) {
      renderLayerWithMask(ctx, layer, artboard.width, artboard.height)
    }
  }

  // GIF and TIFF need pixel-level access; encode from ImageData
  if (options.format === 'gif') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const gifBytes = encodeGIF(imgData)
    return new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' })
  }

  if (options.format === 'tiff') {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const tiffBytes = encodeTIFF(imgData)
    return new Blob([tiffBytes.buffer as ArrayBuffer], { type: 'image/tiff' })
  }

  // PNG, JPEG, and WebP are natively supported by canvas
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  const mimeType = mimeMap[options.format] ?? 'image/png'
  return canvas.convertToBlob({
    type: mimeType,
    quality: options.quality ?? (options.format === 'jpeg' ? 0.92 : options.format === 'webp' ? 0.9 : undefined),
  })
}

function blendToComposite(mode: string): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : (mode as GlobalCompositeOperation)
}

function renderLayerWithMask(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: Layer,
  artboardW: number,
  artboardH: number,
) {
  if (!layer.visible) return
  if (layer.type === 'adjustment' || layer.type === 'filter') return

  if (layer.mask && layer.mask.type === 'vector') {
    const temp = new OffscreenCanvas(artboardW, artboardH)
    const tempCtx = temp.getContext('2d')!
    // Set up clip from mask
    const maskT = layer.mask.transform
    tempCtx.save()
    tempCtx.translate(maskT.x, maskT.y)
    tempCtx.scale(maskT.scaleX, maskT.scaleY)
    if (maskT.rotation) tempCtx.rotate((maskT.rotation * Math.PI) / 180)
    for (const path of layer.mask.paths) {
      tempCtx.clip(segmentsToPath2D(path.segments))
    }
    tempCtx.restore()
    // Render layer content within clip
    renderLayerContent(tempCtx, layer)
    // Composite onto main canvas
    ctx.save()
    ctx.globalCompositeOperation = blendToComposite(layer.blendMode)
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(temp, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  } else {
    renderLayer(ctx, layer)
  }
}

function renderLayer(ctx: OffscreenCanvasRenderingContext2D, layer: Layer) {
  if (!layer.visible) return

  ctx.save()
  ctx.globalCompositeOperation = blendToComposite(layer.blendMode)
  ctx.globalAlpha = layer.opacity

  switch (layer.type) {
    case 'vector':
      renderVectorLayer(ctx, layer)
      break
    case 'raster':
      renderRasterLayer(ctx, layer)
      break
    case 'group':
      renderGroupLayer(ctx, layer)
      break
    case 'text':
      renderTextLayer(ctx, layer as TextLayer)
      break
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

function renderLayerContent(ctx: OffscreenCanvasRenderingContext2D, layer: Layer) {
  switch (layer.type) {
    case 'vector':
      renderVectorLayer(ctx, layer as VectorLayer)
      break
    case 'raster':
      renderRasterLayer(ctx, layer as RasterLayer)
      break
    case 'group':
      for (const child of (layer as GroupLayer).children) {
        if (child.visible) renderLayerContent(ctx, child)
      }
      break
    case 'text':
      renderTextLayer(ctx, layer as TextLayer)
      break
  }
}

function renderVectorLayer(ctx: OffscreenCanvasRenderingContext2D, layer: VectorLayer) {
  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  // Compute bounding box for gradient sizing
  let bboxX = 0,
    bboxY = 0,
    bboxW = 100,
    bboxH = 100
  if (layer.fill?.type === 'gradient' && layer.fill.gradient) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const p of layer.paths) {
      for (const seg of p.segments) {
        if ('x' in seg) {
          if (seg.x < minX) minX = seg.x
          if (seg.x > maxX) maxX = seg.x
          if (seg.y < minY) minY = seg.y
          if (seg.y > maxY) maxY = seg.y
        }
      }
    }
    if (minX !== Infinity) {
      bboxX = minX
      bboxY = minY
      bboxW = maxX - minX || 100
      bboxH = maxY - minY || 100
    }
  }

  for (const path of layer.paths) {
    const path2d = segmentsToPath2D(path.segments)

    if (layer.fill) {
      ctx.globalAlpha = layer.opacity * layer.fill.opacity
      if (layer.fill.type === 'solid' && layer.fill.color) {
        ctx.fillStyle = layer.fill.color
        ctx.fill(path2d)
      } else if (layer.fill.type === 'gradient' && layer.fill.gradient) {
        const grad = layer.fill.gradient
        if (grad.type === 'mesh' && grad.mesh) {
          ctx.save()
          ctx.clip(path2d)
          renderMeshGradient(ctx as unknown as CanvasRenderingContext2D, grad.mesh, {
            x: bboxX,
            y: bboxY,
            width: bboxW,
            height: bboxH,
          })
          ctx.restore()
        } else if (grad.type === 'box') {
          const boxCanvas = renderBoxGradient(ctx, grad, bboxW, bboxH)
          ctx.save()
          ctx.clip(path2d)
          ctx.drawImage(boxCanvas, 0, 0)
          ctx.restore()
        } else {
          const canvasGrad = createCanvasGradient(ctx, grad, bboxW, bboxH)
          if (canvasGrad) {
            ctx.fillStyle = canvasGrad
            ctx.fill(path2d)
          }
        }
      }
    }

    if (layer.stroke) {
      ctx.strokeStyle = layer.stroke.color
      ctx.lineWidth = layer.stroke.width
      ctx.lineCap = layer.stroke.linecap
      ctx.lineJoin = layer.stroke.linejoin
      ctx.globalAlpha = layer.opacity * layer.stroke.opacity
      if (layer.stroke.dasharray) ctx.setLineDash(layer.stroke.dasharray)
      ctx.stroke(path2d)
      ctx.setLineDash([])
    }
  }

  ctx.restore()
}

function renderRasterLayer(ctx: OffscreenCanvasRenderingContext2D, layer: RasterLayer) {
  const rasterCanvas = getRasterCanvas(layer.imageChunkId)
  if (!rasterCanvas) return

  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
  ctx.drawImage(rasterCanvas, 0, 0)
  ctx.restore()
}

function renderGroupLayer(ctx: OffscreenCanvasRenderingContext2D, group: GroupLayer) {
  const hasGroupFilters = group.children.some((c) => (c.type === 'adjustment' || c.type === 'filter') && c.visible)

  if (hasGroupFilters) {
    // Need offscreen compositing for pixel-level operations within the group
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    const offscreen = new OffscreenCanvas(w, h)
    const offCtx = offscreen.getContext('2d')!

    for (const child of group.children) {
      if (!child.visible) continue
      if (child.type === 'adjustment') {
        const imageData = offCtx.getImageData(0, 0, w, h)
        applyAdjustment(imageData, child as AdjustmentLayer)
        offCtx.putImageData(imageData, 0, 0)
      } else if (child.type === 'filter') {
        applyFilterLayerToCanvas(offCtx, child as FilterLayer, w, h)
      } else {
        renderLayer(offCtx, child)
      }
    }

    ctx.drawImage(offscreen, 0, 0)
  } else {
    for (const child of group.children) {
      renderLayer(ctx, child)
    }
  }
}

function renderTextLayer(ctx: OffscreenCanvasRenderingContext2D, layer: TextLayer) {
  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  const style = layer.fontStyle === 'italic' ? 'italic ' : ''
  // Prefer wght axis value when present, fall back to fontWeight
  const wghtAxisEntry = layer.fontVariationAxes?.find((a: { tag: string; value: number }) => a.tag === 'wght')
  const rawWeight = wghtAxisEntry ? String(Math.round(wghtAxisEntry.value)) : (layer.fontWeight ?? 'normal')
  const weight = rawWeight === 'normal' ? '' : rawWeight === 'bold' ? 'bold ' : `${rawWeight} `

  const family = layer.fontFamily.includes(' ') ? `"${layer.fontFamily}"` : layer.fontFamily
  ctx.font = `${style}${weight}${layer.fontSize}px ${family}`
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
  ctx.textAlign = layer.textAlign ?? 'left'

  const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
  const letterSp = layer.letterSpacing ?? 0

  // Path-based rendering for variable axes and OpenType features
  let pathAxes = layer.fontVariationAxes
  if (pathAxes && !pathAxes.some((a: { tag: string }) => a.tag === 'wght')) {
    const wVal = rawWeight === 'bold' ? 700 : rawWeight === 'normal' ? 400 : Number(rawWeight) || 400
    pathAxes = [...pathAxes, { tag: 'wght', name: 'Weight', min: 100, max: 1000, default: 400, value: wVal }]
  }
  const pathText = needsPathRendering(layer.fontVariationAxes, layer.openTypeFeatures)
    ? getPathText(layer.fontFamily, pathAxes, layer.openTypeFeatures, layer.fontSize)
    : null
  const pathReady = pathText !== null && pathText.ready

  const lines = layer.text.split('\n')
  const align = layer.textAlign ?? 'left'
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const y = i * lineH
    if (pathReady && pathText) {
      const w = pathText.measureWidth(line) + Math.max(0, line.length - 1) * letterSp
      const x = align === 'center' ? -w / 2 : align === 'right' ? -w : 0
      pathText.fillText(ctx as unknown as CanvasRenderingContext2D, line, x, y, letterSp)
    } else if (letterSp === 0) {
      ctx.fillText(line, 0, y)
    } else {
      let x = 0
      for (const ch of line) {
        ctx.fillText(ch, x, y)
        x += ctx.measureText(ch).width + letterSp
      }
    }
  }
  ctx.restore()
}

function collectTextFamilies(layers: Layer[], out: Set<string>) {
  for (const layer of layers) {
    if (layer.type === 'text' && layer.visible) {
      const tl = layer as TextLayer
      if (needsPathRendering(tl.fontVariationAxes, tl.openTypeFeatures)) {
        out.add(tl.fontFamily)
      }
    } else if (layer.type === 'group' && layer.visible) {
      collectTextFamilies((layer as GroupLayer).children, out)
    }
  }
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
