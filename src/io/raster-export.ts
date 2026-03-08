import { segmentsToPath2D } from '@/math/path'
import { getRasterCanvas } from '@/store/raster-data'
import { applyAdjustment } from '@/effects/adjustments'
import { createCanvasGradient, renderBoxGradient } from '@/render/gradient'
import type { DesignDocument, Layer, VectorLayer, RasterLayer, GroupLayer, AdjustmentLayer, TextLayer } from '@/types'

export type ExportFormat = 'png' | 'jpeg'

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
  const artboard = artboardId
    ? doc.artboards.find((a) => a.id === artboardId)
    : doc.artboards[0]

  if (!artboard) throw new Error('No artboard found')

  const scale = options.scale ?? 1
  const canvas = new OffscreenCanvas(
    artboard.width * scale,
    artboard.height * scale,
  )
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)

  // Background
  ctx.fillStyle = artboard.backgroundColor
  ctx.fillRect(0, 0, artboard.width, artboard.height)

  // Check for adjustment layers
  const hasAdjustments = artboard.layers.some((l) => l.type === 'adjustment' && l.visible)

  if (hasAdjustments) {
    // Render with pixel-level adjustments
    for (const layer of artboard.layers) {
      if (!layer.visible) continue
      if (layer.type === 'adjustment') {
        const imageData = ctx.getImageData(0, 0, artboard.width * scale, artboard.height * scale)
        applyAdjustment(imageData, layer as AdjustmentLayer)
        ctx.putImageData(imageData, 0, 0)
      } else {
        renderLayerWithMask(ctx, layer, artboard.width, artboard.height)
      }
    }
  } else {
    for (const layer of artboard.layers) {
      renderLayerWithMask(ctx, layer, artboard.width, artboard.height)
    }
  }

  const mimeType = options.format === 'jpeg' ? 'image/jpeg' : 'image/png'
  return canvas.convertToBlob({
    type: mimeType,
    quality: options.quality ?? (options.format === 'jpeg' ? 0.92 : undefined),
  })
}

function blendToComposite(mode: string): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : mode as GlobalCompositeOperation
}

function renderLayerWithMask(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: Layer,
  artboardW: number,
  artboardH: number,
) {
  if (!layer.visible) return
  if (layer.type === 'adjustment') return

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

function renderVectorLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: VectorLayer,
) {
  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  // Compute bounding box for gradient sizing
  let bboxW = 100, bboxH = 100
  if (layer.fill?.type === 'gradient' && layer.fill.gradient) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
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
        if (grad.type === 'box') {
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

function renderRasterLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: RasterLayer,
) {
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

function renderGroupLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  group: GroupLayer,
) {
  for (const child of group.children) {
    renderLayer(ctx, child)
  }
}

function renderTextLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: TextLayer,
) {
  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  const style = layer.fontStyle === 'italic' ? 'italic ' : ''
  const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
  ctx.font = `${style}${weight}${layer.fontSize}px ${layer.fontFamily}`
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
  ctx.textAlign = layer.textAlign ?? 'left'

  const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
  const lines = layer.text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i]!, 0, i * lineH)
  }
  ctx.restore()
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
