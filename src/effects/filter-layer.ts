import { applyEffects } from '@/effects/render-effects'
import { getFilterGPU } from '@/effects/filter-gpu'
import { computeRangeMask, applyRangeMask } from '@/effects/range-masks'
import type { FilterLayer, LevelsParams, CurvesParams, HueSatParams, ColorBalanceParams, Effect } from '@/types'

function isAdjustmentFilter(kind: string): kind is 'levels' | 'curves' | 'hue-sat' | 'color-balance' {
  return kind === 'levels' || kind === 'curves' || kind === 'hue-sat' || kind === 'color-balance'
}

/**
 * Apply a FilterLayer to the current state of an offscreen canvas context.
 *
 * Adjustment-type filters (levels, curves, hue-sat, color-balance) are
 * processed on the GPU via WebGL2 fragment shaders when available, with a
 * CPU fallback for environments without WebGL2.
 *
 * Effect-type filters route through the existing applyEffects pipeline.
 */
export function applyFilterLayerToCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: FilterLayer,
  width: number,
  height: number,
) {
  const params = layer.filterParams
  const kind = params.kind

  // If a range mask is configured, snapshot original pixels before applying the filter
  const hasRangeMask = !!layer.rangeMask
  let originalImageData: ImageData | undefined
  if (hasRangeMask) {
    originalImageData = ctx.getImageData(0, 0, width, height)
  }

  if (kind && isAdjustmentFilter(kind)) {
    // Try GPU path first
    const gpu = getFilterGPU()
    if (gpu && !hasRangeMask) {
      // GPU path — render to WebGL canvas then composite back
      const source = ctx.canvas
      let result: OffscreenCanvas
      switch (kind) {
        case 'levels':
          result = gpu.applyLevels(source, params as LevelsParams)
          break
        case 'curves':
          result = gpu.applyCurves(source, params as CurvesParams)
          break
        case 'hue-sat':
          result = gpu.applyHueSat(source, params as HueSatParams)
          break
        case 'color-balance':
          result = gpu.applyColorBalance(source, params as ColorBalanceParams)
          break
      }
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(result, 0, 0)
      return
    }

    // CPU fallback (also used when range mask needs original pixel data)
    const imageData = ctx.getImageData(0, 0, width, height)
    const d = imageData.data
    switch (kind) {
      case 'levels': {
        const p = params as LevelsParams
        const range = p.whitePoint - p.blackPoint
        if (range > 0) {
          const invGamma = 1 / Math.max(0.01, p.gamma)
          for (let i = 0; i < d.length; i += 4) {
            for (let c = 0; c < 3; c++) {
              let v = (d[i + c]! - p.blackPoint) / range
              v = Math.max(0, Math.min(1, v))
              v = Math.pow(v, invGamma)
              d[i + c] = Math.round(v * 255)
            }
          }
        }
        break
      }
      case 'curves': {
        const p = params as CurvesParams
        // Build LUT from control points via linear interpolation
        const sorted = [...p.points].sort((a, b) => a[0] - b[0])
        if (sorted.length > 0) {
          if (sorted[0]![0] > 0) sorted.unshift([0, 0])
          if (sorted[sorted.length - 1]![0] < 255) sorted.push([255, 255])
          const lut = new Uint8Array(256)
          let seg = 0
          for (let i = 0; i < 256; i++) {
            while (seg < sorted.length - 2 && sorted[seg + 1]![0] < i) seg++
            const [x0, y0] = sorted[seg]!
            const [x1, y1] = sorted[seg + 1]!
            const t = x1 === x0 ? 0 : (i - x0) / (x1 - x0)
            lut[i] = Math.round(Math.max(0, Math.min(255, y0 + t * (y1 - y0))))
          }
          for (let i = 0; i < d.length; i += 4) {
            d[i] = lut[d[i]!]!
            d[i + 1] = lut[d[i + 1]!]!
            d[i + 2] = lut[d[i + 2]!]!
          }
        }
        break
      }
      case 'hue-sat': {
        const p = params as HueSatParams
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]! / 255,
            g = d[i + 1]! / 255,
            b = d[i + 2]! / 255
          const max = Math.max(r, g, b),
            min = Math.min(r, g, b)
          let h = 0,
            s = 0
          const l = (max + min) / 2
          if (max !== min) {
            const dd = max - min
            s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min)
            if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) / 6
            else if (max === g) h = ((b - r) / dd + 2) / 6
            else h = ((r - g) / dd + 4) / 6
          }
          const nh = (h + p.hue / 360 + 1) % 1
          const ns = Math.max(0, Math.min(1, s + p.saturation / 100))
          const nl = Math.max(0, Math.min(1, l + p.lightness / 100))
          if (ns === 0) {
            const v = Math.round(nl * 255)
            d[i] = v
            d[i + 1] = v
            d[i + 2] = v
          } else {
            const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns
            const pp = 2 * nl - q
            const hue2rgb = (t: number) => {
              if (t < 0) t += 1
              if (t > 1) t -= 1
              if (t < 1 / 6) return pp + (q - pp) * 6 * t
              if (t < 1 / 2) return q
              if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6
              return pp
            }
            d[i] = Math.round(hue2rgb(nh + 1 / 3) * 255)
            d[i + 1] = Math.round(hue2rgb(nh) * 255)
            d[i + 2] = Math.round(hue2rgb(nh - 1 / 3) * 255)
          }
        }
        break
      }
      case 'color-balance': {
        const p = params as ColorBalanceParams
        for (let i = 0; i < d.length; i += 4) {
          const lum = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) / 255
          const shadowW = Math.max(0, 1 - lum * 3)
          const highlightW = Math.max(0, lum * 3 - 2)
          const midW = 1 - shadowW - highlightW
          const shift = p.shadows * shadowW + p.midtones * midW + p.highlights * highlightW
          d[i] = Math.max(0, Math.min(255, d[i]! + shift))
          d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! - shift * 0.5))
          d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! - shift * 0.5))
        }
        break
      }
    }

    // Apply range mask blending if configured
    if (hasRangeMask && originalImageData) {
      const mask = computeRangeMask(originalImageData, layer.rangeMask!)
      const blended = applyRangeMask(originalImageData, imageData, mask)
      ctx.putImageData(blended, 0, 0)
    } else {
      ctx.putImageData(imageData, 0, 0)
    }
  } else if (kind) {
    // Effect-type filter: route through applyEffects with a synthetic Effect
    const syntheticEffect: Effect = {
      id: layer.id,
      type: kind as Effect['type'],
      enabled: true,
      opacity: layer.opacity,
      params: params as Effect['params'],
    }
    // Snapshot current canvas into an OffscreenCanvas
    const snapshot = new OffscreenCanvas(width, height)
    snapshot.getContext('2d')!.drawImage(ctx.canvas, 0, 0)
    const result = applyEffects(snapshot, [syntheticEffect])
    // Clear and draw result back (result may be larger due to effect padding)
    ctx.clearRect(0, 0, width, height)
    const dx = (result.width - width) / 2
    const dy = (result.height - height) / 2
    ctx.drawImage(result, -dx, -dy)

    // Apply range mask blending if configured
    if (hasRangeMask && originalImageData) {
      const filteredImageData = ctx.getImageData(0, 0, width, height)
      const mask = computeRangeMask(originalImageData, layer.rangeMask!)
      const blended = applyRangeMask(originalImageData, filteredImageData, mask)
      ctx.putImageData(blended, 0, 0)
    }
  }
}
