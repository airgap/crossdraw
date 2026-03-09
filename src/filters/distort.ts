/**
 * Distortion / warp effects for raster layers.
 *
 * Every function takes a source ImageData and returns a *new* ImageData with
 * the transformation applied.  Bilinear interpolation is used throughout so
 * results are smooth even at fractional pixel offsets.
 */

// ── Bilinear sampling helper ────────────────────────────────────────────────

/**
 * Sample a pixel from `src` at fractional coordinates `(x, y)` using bilinear
 * interpolation.  Coordinates are clamped to the image bounds so the caller
 * never has to worry about out-of-range values.
 *
 * Returns `[r, g, b, a]` in 0-255 range.
 */
export function bilinearSample(src: ImageData, x: number, y: number): [number, number, number, number] {
  const { width: w, height: h, data } = src

  // Clamp to valid range (half-pixel border keeps interpolation safe)
  const cx = Math.max(0, Math.min(x, w - 1))
  const cy = Math.max(0, Math.min(y, h - 1))

  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)

  const fx = cx - x0
  const fy = cy - y0

  const i00 = (y0 * w + x0) * 4
  const i10 = (y0 * w + x1) * 4
  const i01 = (y1 * w + x0) * 4
  const i11 = (y1 * w + x1) * 4

  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy

  return [
    Math.round(data[i00]! * w00 + data[i10]! * w10 + data[i01]! * w01 + data[i11]! * w11),
    Math.round(data[i00 + 1]! * w00 + data[i10 + 1]! * w10 + data[i01 + 1]! * w01 + data[i11 + 1]! * w11),
    Math.round(data[i00 + 2]! * w00 + data[i10 + 2]! * w10 + data[i01 + 2]! * w01 + data[i11 + 2]! * w11),
    Math.round(data[i00 + 3]! * w00 + data[i10 + 3]! * w10 + data[i01 + 3]! * w01 + data[i11 + 3]! * w11),
  ]
}

// ── Wave ────────────────────────────────────────────────────────────────────

/**
 * Displace pixels using a sine wave along both axes.
 *
 * @param amplitudeX  Max horizontal displacement in pixels.
 * @param amplitudeY  Max vertical displacement in pixels.
 * @param frequencyX  Horizontal wave frequency (cycles across the image width).
 * @param frequencyY  Vertical wave frequency (cycles across the image height).
 */
export function applyWave(
  src: ImageData,
  amplitudeX: number,
  amplitudeY: number,
  frequencyX: number,
  frequencyY: number,
): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const twoPi = Math.PI * 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Source coordinates: inverse-map from destination to source
      const sx = x + amplitudeX * Math.sin(twoPi * frequencyY * (y / h))
      const sy = y + amplitudeY * Math.sin(twoPi * frequencyX * (x / w))

      const [r, g, b, a] = bilinearSample(src, sx, sy)
      const idx = (y * w + x) * 4
      dd[idx] = r
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}

// ── Twirl ───────────────────────────────────────────────────────────────────

/**
 * Rotate pixels around the image centre.  The rotation angle is maximal at
 * the centre and falls off linearly to zero at `radius`.
 *
 * @param angle   Max rotation in radians at the centre.
 * @param radius  Radius of the effect in pixels.  Pixels outside this circle
 *                are unaffected.  Pass 0 to auto-use half the shortest side.
 */
export function applyTwirl(src: ImageData, angle: number, radius: number): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const cx = w / 2
  const cy = h / 2
  const r = radius > 0 ? radius : Math.min(w, h) / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      let sx: number
      let sy: number

      if (dist < r) {
        // Linear falloff: full angle at center, zero at radius
        const t = 1 - dist / r
        const theta = t * angle
        const cosT = Math.cos(theta)
        const sinT = Math.sin(theta)
        sx = cx + dx * cosT - dy * sinT
        sy = cy + dx * sinT + dy * cosT
      } else {
        sx = x
        sy = y
      }

      const [rv, g, b, a] = bilinearSample(src, sx, sy)
      const idx = (y * w + x) * 4
      dd[idx] = rv
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}

// ── Pinch / Bulge ───────────────────────────────────────────────────────────

/**
 * Pull pixels toward (positive `amount`) or push them away from (negative
 * `amount`) the image centre.
 *
 * @param amount  Strength: 1 = maximum pinch, -1 = maximum bulge.  Clamped
 *                to [-1, 1].
 */
export function applyPinch(src: ImageData, amount: number): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) / 2
  const strength = Math.max(-1, Math.min(1, amount))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      let sx: number
      let sy: number

      if (dist < radius && dist > 0) {
        const normDist = dist / radius // 0..1
        // Power curve: pinch pulls inward, bulge pushes outward
        const factor =
          strength > 0 ? Math.pow(normDist, 1 + strength) / normDist : Math.pow(normDist, 1 / (1 - strength)) / normDist

        sx = cx + dx * factor
        sy = cy + dy * factor
      } else {
        sx = x
        sy = y
      }

      const [rv, g, b, a] = bilinearSample(src, sx, sy)
      const idx = (y * w + x) * 4
      dd[idx] = rv
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}

// ── Spherize ────────────────────────────────────────────────────────────────

/**
 * Map pixels onto a sphere surface, producing a fisheye / barrel distortion
 * effect.
 *
 * @param amount  Strength: 1 = full sphere, 0 = no effect.  Can exceed 1 for
 *                extreme distortion.
 */
export function applySphereize(src: ImageData, amount: number): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) / 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Normalized coords in [-1, 1]
      const nx = (x - cx) / radius
      const ny = (y - cy) / radius
      const r2 = nx * nx + ny * ny

      let sx: number
      let sy: number

      if (r2 < 1) {
        // Sphere mapping: project onto sphere surface
        const r = Math.sqrt(r2)
        // Compute the z-height on the unit sphere
        const theta = Math.asin(Math.min(r, 1))
        // Refract through sphere: new radius based on amount
        const newR = r === 0 ? 0 : Math.tan(theta * amount) / Math.tan(amount || 0.001)
        const scale = r === 0 ? 1 : newR / r

        sx = cx + nx * scale * radius
        sy = cy + ny * scale * radius
      } else {
        sx = x
        sy = y
      }

      const [rv, g, b, a] = bilinearSample(src, sx, sy)
      const idx = (y * w + x) * 4
      dd[idx] = rv
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}
