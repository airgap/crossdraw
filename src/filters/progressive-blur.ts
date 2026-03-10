/**
 * Progressive (directional) blur filter for raster layers.
 *
 * Supports two modes:
 *  - **linear**: blur varies from `startRadius` to `endRadius` along a direction
 *    defined by `angle`. `startPosition` / `endPosition` (0-1) control where the
 *    gradient ramp starts and ends along that axis.
 *  - **radial**: blur varies from `startRadius` at the image centre to `endRadius`
 *    at the edges.
 *
 * The implementation divides the image into bands and applies a fast iterated box
 * blur with a per-band radius, then alpha-blends between adjacent bands so the
 * transition is smooth.
 */

export interface ProgressiveBlurParams {
  kind: 'progressive-blur'
  direction: 'linear' | 'radial'
  /** Angle in degrees (0 = left-to-right, 90 = top-to-bottom). Only used in linear mode. */
  angle: number
  /** Blur radius at the start of the ramp. */
  startRadius: number
  /** Blur radius at the end of the ramp. */
  endRadius: number
  /** Normalised position (0-1) where the blur ramp begins. */
  startPosition: number
  /** Normalised position (0-1) where the blur ramp ends. */
  endPosition: number
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Apply a progressive blur to `imageData` and return a *new* ImageData with
 * the result (the original is not modified).
 */
export function applyProgressiveBlur(imageData: ImageData, params: ProgressiveBlurParams): ImageData {
  const w = imageData.width
  const h = imageData.height

  // Fast path: both radii are zero — nothing to do.
  if (params.startRadius === 0 && params.endRadius === 0) {
    return cloneImageData(imageData)
  }

  // Number of blur bands.  More bands = smoother gradient, but slower.
  const BAND_COUNT: number = 16

  // Pre-compute the blur radius for each band.
  const radii: number[] = []
  for (let b = 0; b < BAND_COUNT; b++) {
    const t = BAND_COUNT === 1 ? 0.5 : b / (BAND_COUNT - 1)
    radii.push(lerp(params.startRadius, params.endRadius, t))
  }

  // Pre-blur the image at each unique radius.
  const blurredBands: ImageData[] = radii.map((r) => {
    if (r < 0.5) {
      // Radius effectively zero — return a copy of the original.
      return cloneImageData(imageData)
    }
    return boxBlur(imageData, Math.round(r))
  })

  // Build the output by choosing — per pixel — which band (and blend factor)
  // to sample from.
  const out = cloneImageData(imageData)
  const outData = out.data

  const angleRad = (params.angle * Math.PI) / 180
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)

  const startPos = params.startPosition
  const endPos = params.endPosition
  const rangeDenom = endPos - startPos

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Compute the normalised progress `t` (0-1) along the blur ramp.
      let t: number

      if (params.direction === 'radial') {
        // Distance from centre, normalised so 1 = furthest corner.
        const cx = w / 2
        const cy = h / 2
        const maxDist = Math.sqrt(cx * cx + cy * cy)
        const dx = x - cx
        const dy = y - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        t = maxDist > 0 ? dist / maxDist : 0
      } else {
        // Project pixel onto the direction vector, normalised to 0-1.
        const nx = x / (w > 1 ? w - 1 : 1)
        const ny = y / (h > 1 ? h - 1 : 1)
        // The projection gives us a value along the angle direction.
        t = nx * cosA + ny * sinA
        // Clamp to 0-1 (projection can exceed bounds at extreme angles).
        t = Math.max(0, Math.min(1, t))
      }

      // Map through the start/end position ramp.
      let bandT: number
      if (Math.abs(rangeDenom) < 1e-9) {
        bandT = t >= startPos ? 1 : 0
      } else {
        bandT = (t - startPos) / rangeDenom
      }
      bandT = Math.max(0, Math.min(1, bandT))

      // Determine which two bands to blend between.
      const bandFloat = bandT * (BAND_COUNT - 1)
      const bandLow = Math.floor(bandFloat)
      const bandHigh = Math.min(bandLow + 1, BAND_COUNT - 1)
      const frac = bandFloat - bandLow

      const pi = (y * w + x) * 4
      const dataLow = blurredBands[bandLow]!.data
      const dataHigh = blurredBands[bandHigh]!.data

      outData[pi] = dataLow[pi]! + (dataHigh[pi]! - dataLow[pi]!) * frac
      outData[pi + 1] = dataLow[pi + 1]! + (dataHigh[pi + 1]! - dataLow[pi + 1]!) * frac
      outData[pi + 2] = dataLow[pi + 2]! + (dataHigh[pi + 2]! - dataLow[pi + 2]!) * frac
      outData[pi + 3] = dataLow[pi + 3]! + (dataHigh[pi + 3]! - dataLow[pi + 3]!) * frac
    }
  }

  return out
}

// ── Box blur (public — useful on its own) ──────────────────────

/**
 * Fast box blur approximation using three iterated passes (horizontal +
 * vertical).  Returns a *new* ImageData.
 */
export function boxBlur(imageData: ImageData, radius: number): ImageData {
  if (radius <= 0) return cloneImageData(imageData)

  const w = imageData.width
  const h = imageData.height
  const src = new Uint8ClampedArray(imageData.data)
  const dst = new Uint8ClampedArray(src.length)

  // Three iterations of box blur approximate a Gaussian nicely.
  const passes = 3
  let input = src
  let output = dst

  for (let p = 0; p < passes; p++) {
    boxBlurH(input, output, w, h, radius)
    // Swap buffers, then do vertical pass.
    const t = input
    input = output
    output = t
    boxBlurV(input, output, w, h, radius)
    // Swap again for next iteration.
    const t2 = input
    input = output
    output = t2
  }

  // `input` now points to the final result (last swap left it there).
  const result = createImageData(w, h)
  result.data.set(input)
  return result
}

// ── Internal helpers ───────────────────────────────────────────

/** Create an ImageData instance, with a fallback for non-browser environments. */
function createImageData(w: number, h: number): ImageData {
  if (typeof globalThis.ImageData === 'function') {
    return new ImageData(w, h)
  }
  // Fallback for test environments (e.g. Bun) where ImageData is not defined.
  return {
    data: new Uint8ClampedArray(w * h * 4),
    width: w,
    height: h,
    colorSpace: 'srgb',
  } as ImageData
}

function cloneImageData(img: ImageData): ImageData {
  const clone = createImageData(img.width, img.height)
  clone.data.set(img.data)
  return clone
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Horizontal box blur pass. Reads from `src`, writes to `dst`. */
function boxBlurH(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const diam = radius * 2 + 1
  const invDiam = 1 / diam

  for (let y = 0; y < h; y++) {
    let rSum = 0
    let gSum = 0
    let bSum = 0
    let aSum = 0

    // Initialise window — clamp at left edge.
    for (let dx = -radius; dx <= radius; dx++) {
      const xi = Math.max(0, Math.min(w - 1, dx))
      const pi = (y * w + xi) * 4
      rSum += src[pi]!
      gSum += src[pi + 1]!
      bSum += src[pi + 2]!
      aSum += src[pi + 3]!
    }

    const rowOff = y * w * 4
    dst[rowOff] = rSum * invDiam
    dst[rowOff + 1] = gSum * invDiam
    dst[rowOff + 2] = bSum * invDiam
    dst[rowOff + 3] = aSum * invDiam

    for (let x = 1; x < w; x++) {
      const addX = Math.min(x + radius, w - 1)
      const subX = Math.max(x - radius - 1, 0)
      const addP = (y * w + addX) * 4
      const subP = (y * w + subX) * 4

      rSum += src[addP]! - src[subP]!
      gSum += src[addP + 1]! - src[subP + 1]!
      bSum += src[addP + 2]! - src[subP + 2]!
      aSum += src[addP + 3]! - src[subP + 3]!

      const pi = rowOff + x * 4
      dst[pi] = rSum * invDiam
      dst[pi + 1] = gSum * invDiam
      dst[pi + 2] = bSum * invDiam
      dst[pi + 3] = aSum * invDiam
    }
  }
}

/** Vertical box blur pass. Reads from `src`, writes to `dst`. */
function boxBlurV(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  const diam = radius * 2 + 1
  const invDiam = 1 / diam

  for (let x = 0; x < w; x++) {
    let rSum = 0
    let gSum = 0
    let bSum = 0
    let aSum = 0

    // Initialise window — clamp at top edge.
    for (let dy = -radius; dy <= radius; dy++) {
      const yi = Math.max(0, Math.min(h - 1, dy))
      const pi = (yi * w + x) * 4
      rSum += src[pi]!
      gSum += src[pi + 1]!
      bSum += src[pi + 2]!
      aSum += src[pi + 3]!
    }

    const ci = x * 4
    dst[ci] = rSum * invDiam
    dst[ci + 1] = gSum * invDiam
    dst[ci + 2] = bSum * invDiam
    dst[ci + 3] = aSum * invDiam

    for (let y = 1; y < h; y++) {
      const addY = Math.min(y + radius, h - 1)
      const subY = Math.max(y - radius - 1, 0)
      const addP = (addY * w + x) * 4
      const subP = (subY * w + x) * 4

      rSum += src[addP]! - src[subP]!
      gSum += src[addP + 1]! - src[subP + 1]!
      bSum += src[addP + 2]! - src[subP + 2]!
      aSum += src[addP + 3]! - src[subP + 3]!

      const pi = (y * w + x) * 4
      dst[pi] = rSum * invDiam
      dst[pi + 1] = gSum * invDiam
      dst[pi + 2] = bSum * invDiam
      dst[pi + 3] = aSum * invDiam
    }
  }
}
