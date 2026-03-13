/**
 * Lens Blur / Depth of Field filter for raster layers.
 *
 * Simulates optical bokeh/defocus blur using a polygon-shaped kernel.
 * The kernel represents the aperture shape (e.g. hexagonal for 6 blades)
 * and convolves the image to produce characteristic bokeh highlights.
 *
 * Parameters:
 *  - `radius`: size of the blur kernel in pixels
 *  - `bladeCount`: number of aperture blades (3-12, typical 5-8)
 *  - `rotation`: rotation of the aperture polygon in degrees
 *  - `brightness`: boost factor for specular highlights (0 = no boost)
 *  - `threshold`: brightness threshold above which highlights are boosted (0-255)
 *
 * For large radii the image is downscaled, blurred, then upscaled for performance.
 */

export interface LensBlurParams {
  /** Blur radius in pixels (0 = no blur). */
  radius: number
  /** Number of aperture blades (3-12). */
  bladeCount: number
  /** Rotation of the aperture polygon in degrees. */
  rotation: number
  /** Brightness boost for specular highlights (0 = none). */
  brightness: number
  /** Only boost pixels whose luminance exceeds this threshold (0-255). */
  threshold: number
}

/**
 * Apply a lens blur (bokeh) effect to `imageData`.
 *
 * @returns A new ImageData with the blurred result.
 */
export function applyLensBlur(imageData: ImageData, params: LensBlurParams): ImageData {
  const { radius, bladeCount, rotation, brightness, threshold } = params

  if (radius <= 0) {
    const copy = createImageData(imageData.width, imageData.height)
    copy.data.set(imageData.data)
    return copy
  }

  // For large radii, use downscale optimisation
  const DOWNSCALE_THRESHOLD = 12
  if (radius > DOWNSCALE_THRESHOLD) {
    return applyLensBlurDownscaled(imageData, params)
  }

  return applyLensBlurDirect(imageData, radius, bladeCount, rotation, brightness, threshold)
}

// ── Kernel generation ───────────────────────────────────────

/**
 * Generate a polygon-shaped bokeh kernel.
 * Returns a flat Float32Array of size (2*r+1)^2 where values inside the polygon are 1
 * and outside are 0, along with the sum for normalisation.
 */
export function generateBokehKernel(
  radius: number,
  bladeCount: number,
  rotationDeg: number,
): { kernel: Float32Array; size: number; sum: number } {
  const r = Math.max(1, Math.round(radius))
  const size = 2 * r + 1
  const kernel = new Float32Array(size * size)
  const rotRad = (rotationDeg * Math.PI) / 180
  const sides = Math.max(3, Math.min(12, Math.round(bladeCount)))

  // Pre-compute polygon vertices
  const angleStep = (2 * Math.PI) / sides
  const vertices: { x: number; y: number }[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotRad + i * angleStep
    vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r })
  }

  let sum = 0

  for (let ky = 0; ky < size; ky++) {
    const py = ky - r
    for (let kx = 0; kx < size; kx++) {
      const px = kx - r

      if (isInsidePolygon(px, py, vertices)) {
        kernel[ky * size + kx] = 1
        sum += 1
      }
    }
  }

  // Edge case: if somehow nothing is inside, set center pixel
  if (sum === 0) {
    kernel[r * size + r] = 1
    sum = 1
  }

  return { kernel, size, sum }
}

/**
 * Point-in-convex-polygon test using cross-product winding.
 * Works for convex polygons (aperture shapes are always convex).
 */
function isInsidePolygon(px: number, py: number, vertices: { x: number; y: number }[]): boolean {
  const n = vertices.length
  let positive = 0
  let negative = 0

  for (let i = 0; i < n; i++) {
    const v1 = vertices[i]!
    const v2 = vertices[(i + 1) % n]!
    const cross = (v2.x - v1.x) * (py - v1.y) - (v2.y - v1.y) * (px - v1.x)
    if (cross > 0) positive++
    else if (cross < 0) negative++
    // If we have both positive and negative, the point is outside
    if (positive > 0 && negative > 0) return false
  }

  return true
}

// ── Direct convolution ──────────────────────────────────────

function applyLensBlurDirect(
  imageData: ImageData,
  radius: number,
  bladeCount: number,
  rotationDeg: number,
  brightness: number,
  threshold: number,
): ImageData {
  const { width, height } = imageData
  const src = imageData.data
  const { kernel, size, sum } = generateBokehKernel(radius, bladeCount, rotationDeg)
  const r = (size - 1) / 2

  // Pre-process: apply brightness boost to highlights (work in float)
  const srcFloat = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4
    const red = src[idx]!
    const green = src[idx + 1]!
    const blue = src[idx + 2]!
    const alpha = src[idx + 3]!

    // Compute luminance (fast approximation)
    const lum = 0.299 * red + 0.587 * green + 0.114 * blue
    const boost = lum > threshold && brightness > 0 ? 1 + brightness : 1

    srcFloat[idx] = red * boost
    srcFloat[idx + 1] = green * boost
    srcFloat[idx + 2] = blue * boost
    srcFloat[idx + 3] = alpha
  }

  const out = createImageData(width, height)
  const dst = out.data
  const invSum = 1 / sum

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rAcc = 0
      let gAcc = 0
      let bAcc = 0
      let aAcc = 0

      for (let ky = 0; ky < size; ky++) {
        const sy = y + ky - r
        if (sy < 0 || sy >= height) continue

        for (let kx = 0; kx < size; kx++) {
          const kVal = kernel[ky * size + kx]!
          if (kVal === 0) continue

          const sx = x + kx - r
          if (sx < 0 || sx >= width) continue

          const sidx = (sy * width + sx) * 4
          rAcc += srcFloat[sidx]! * kVal
          gAcc += srcFloat[sidx + 1]! * kVal
          bAcc += srcFloat[sidx + 2]! * kVal
          aAcc += srcFloat[sidx + 3]! * kVal
        }
      }

      const didx = (y * width + x) * 4
      dst[didx] = Math.min(255, Math.max(0, Math.round(rAcc * invSum)))
      dst[didx + 1] = Math.min(255, Math.max(0, Math.round(gAcc * invSum)))
      dst[didx + 2] = Math.min(255, Math.max(0, Math.round(bAcc * invSum)))
      dst[didx + 3] = Math.min(255, Math.max(0, Math.round(aAcc * invSum)))
    }
  }

  return out
}

// ── Downscale optimisation for large radii ──────────────────

function applyLensBlurDownscaled(imageData: ImageData, params: LensBlurParams): ImageData {
  const { width, height } = imageData
  const { radius, bladeCount, rotation, brightness, threshold } = params

  // Calculate scale factor: aim for an effective radius around 8-10
  const targetRadius = 8
  const scale = Math.max(0.125, targetRadius / radius)
  const scaledW = Math.max(1, Math.round(width * scale))
  const scaledH = Math.max(1, Math.round(height * scale))
  const scaledRadius = Math.max(1, Math.round(radius * scale))

  // Downscale
  const small = downscale(imageData, scaledW, scaledH)

  // Apply blur at reduced resolution
  const blurred = applyLensBlurDirect(small, scaledRadius, bladeCount, rotation, brightness, threshold)

  // Upscale back
  return upscale(blurred, width, height)
}

function downscale(src: ImageData, dstW: number, dstH: number): ImageData {
  const dst = createImageData(dstW, dstH)
  const sW = src.width
  const sH = src.height
  const sData = src.data
  const dData = dst.data

  const xRatio = sW / dstW
  const yRatio = sH / dstH

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      // Area-average sampling
      const x0 = dx * xRatio
      const y0 = dy * yRatio
      const x1 = Math.min(sW, (dx + 1) * xRatio)
      const y1 = Math.min(sH, (dy + 1) * yRatio)

      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0

      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          if (sx >= 0 && sx < sW && sy >= 0 && sy < sH) {
            const idx = (sy * sW + sx) * 4
            rSum += sData[idx]!
            gSum += sData[idx + 1]!
            bSum += sData[idx + 2]!
            aSum += sData[idx + 3]!
            count++
          }
        }
      }

      if (count > 0) {
        const didx = (dy * dstW + dx) * 4
        dData[didx] = Math.round(rSum / count)
        dData[didx + 1] = Math.round(gSum / count)
        dData[didx + 2] = Math.round(bSum / count)
        dData[didx + 3] = Math.round(aSum / count)
      }
    }
  }

  return dst
}

function upscale(src: ImageData, dstW: number, dstH: number): ImageData {
  const dst = createImageData(dstW, dstH)
  const sW = src.width
  const sH = src.height
  const sData = src.data
  const dData = dst.data

  const xRatio = (sW - 1) / Math.max(1, dstW - 1)
  const yRatio = (sH - 1) / Math.max(1, dstH - 1)

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = dy * yRatio
    const sy0 = Math.floor(srcY)
    const sy1 = Math.min(sH - 1, sy0 + 1)
    const fy = srcY - sy0

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = dx * xRatio
      const sx0 = Math.floor(srcX)
      const sx1 = Math.min(sW - 1, sx0 + 1)
      const fx = srcX - sx0

      // Bilinear interpolation
      const i00 = (sy0 * sW + sx0) * 4
      const i10 = (sy0 * sW + sx1) * 4
      const i01 = (sy1 * sW + sx0) * 4
      const i11 = (sy1 * sW + sx1) * 4

      const didx = (dy * dstW + dx) * 4
      for (let c = 0; c < 4; c++) {
        const top = sData[i00 + c]! * (1 - fx) + sData[i10 + c]! * fx
        const bot = sData[i01 + c]! * (1 - fx) + sData[i11 + c]! * fx
        dData[didx + c] = Math.round(top * (1 - fy) + bot * fy)
      }
    }
  }

  return dst
}

// ── Internal helpers ────────────────────────────────────────

function createImageData(w: number, h: number): ImageData {
  if (typeof globalThis.ImageData === 'function') {
    return new ImageData(w, h)
  }
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as ImageData
}
