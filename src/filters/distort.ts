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

// ── Ripple ──────────────────────────────────────────────────────────────────

/**
 * Displace pixels along one or both axes using a sine-wave ripple pattern.
 *
 * @param amplitude   Max displacement in pixels.
 * @param frequency   Number of wave cycles across the image dimension.
 * @param direction   Which axis/axes to ripple along.
 */
export function applyRipple(
  src: ImageData,
  amplitude: number,
  frequency: number,
  direction: 'horizontal' | 'vertical' | 'both',
): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const twoPi = Math.PI * 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx = x
      let sy = y

      if (direction === 'horizontal' || direction === 'both') {
        // Horizontal ripple: offset x based on y position
        sx += amplitude * Math.sin(twoPi * frequency * (y / h))
      }
      if (direction === 'vertical' || direction === 'both') {
        // Vertical ripple: offset y based on x position
        sy += amplitude * Math.sin(twoPi * frequency * (x / w))
      }

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

// ── Zigzag ──────────────────────────────────────────────────────────────────

/**
 * Radial zigzag distortion around the image centre — similar to Photoshop's
 * Zigzag filter.  Pixels are displaced radially by a sine function of their
 * distance from the centre.
 *
 * @param amount  Max radial displacement in pixels.
 * @param ridges  Number of sine-wave ridges from centre to edge.
 */
export function applyZigzag(src: ImageData, amount: number, ridges: number): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const cx = w / 2
  const cy = h / 2
  const maxR = Math.sqrt(cx * cx + cy * cy)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.sqrt(dx * dx + dy * dy)
      const theta = Math.atan2(dy, dx)

      // Radial displacement: sine of normalised distance
      const newR = r + amount * Math.sin(ridges * Math.PI * (r / maxR))

      const sx = cx + newR * Math.cos(theta)
      const sy = cy + newR * Math.sin(theta)

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

// ── Polar Coordinates ───────────────────────────────────────────────────────

/**
 * Convert between rectangular and polar coordinate spaces.
 *
 * - `rectangular-to-polar`: treats x as angle and y as radius, wrapping the
 *   image into a disc.
 * - `polar-to-rectangular`: treats angle as x and radius as y, unwrapping a
 *   disc into a flat strip.
 */
export function applyPolarCoordinates(
  src: ImageData,
  mode: 'rectangular-to-polar' | 'polar-to-rectangular',
): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const cx = w / 2
  const cy = h / 2
  const maxR = Math.max(cx, cy)
  const twoPi = Math.PI * 2

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx: number
      let sy: number

      if (mode === 'rectangular-to-polar') {
        // Map destination polar (from centre) back to source rectangular
        const dx = x - cx
        const dy = y - cy
        const r = Math.sqrt(dx * dx + dy * dy)
        const theta = Math.atan2(dy, dx)

        // angle → x position (0..2π mapped to 0..width)
        sx = ((theta + Math.PI) / twoPi) * w
        // radius → y position (0..maxR mapped to 0..height)
        sy = (r / maxR) * h
      } else {
        // polar-to-rectangular: map destination rectangular to source polar
        const angle = (x / w) * twoPi - Math.PI
        const r = (y / h) * maxR

        sx = cx + r * Math.cos(angle)
        sy = cy + r * Math.sin(angle)
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

// ── Displace ─────────────────────────────────────────────────────────────────

export type DisplaceWrap = 'tile' | 'clamp' | 'transparent'

export interface DisplaceParams {
  scaleX: number
  scaleY: number
  mapData: ImageData | null
  wrap: DisplaceWrap
}

/**
 * Displace pixels using a displacement map.
 *
 * The red channel of the map controls horizontal displacement and the green
 * channel controls vertical displacement.  A value of 128 means no offset,
 * values < 128 shift negatively, values > 128 shift positively.
 *
 * @param src    Source image.
 * @param params Displacement parameters including scale factors, map data, and
 *               wrap mode.
 */
export function applyDisplace(src: ImageData, params: DisplaceParams): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  // If no map provided, generate a default gradient map:
  // R increases left-to-right, G increases top-to-bottom
  let map: ImageData
  if (params.mapData) {
    map = params.mapData
  } else {
    map = new ImageData(w, h)
    const md = map.data
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        md[idx] = Math.round((x / Math.max(w - 1, 1)) * 255) // R = horizontal gradient
        md[idx + 1] = Math.round((y / Math.max(h - 1, 1)) * 255) // G = vertical gradient
        md[idx + 2] = 128
        md[idx + 3] = 255
      }
    }
  }

  const mw = map.width
  const mh = map.height
  const md = map.data

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sample the displacement map (tile to source dimensions)
      const mx = x % mw
      const my = y % mh
      const mi = (my * mw + mx) * 4
      const mapR = md[mi]!
      const mapG = md[mi + 1]!

      // Compute displaced source coordinates
      const srcX = x + ((mapR - 128) * params.scaleX) / 128
      const srcY = y + ((mapG - 128) * params.scaleY) / 128

      const idx = (y * w + x) * 4

      // Handle wrap modes
      if (params.wrap === 'transparent') {
        if (srcX < 0 || srcX >= w || srcY < 0 || srcY >= h) {
          dd[idx] = 0
          dd[idx + 1] = 0
          dd[idx + 2] = 0
          dd[idx + 3] = 0
          continue
        }
      }

      let fx: number
      let fy: number

      if (params.wrap === 'tile') {
        // Modulo wrap
        fx = ((srcX % w) + w) % w
        fy = ((srcY % h) + h) % h
      } else {
        // Clamp (default for 'clamp' and fallthrough for 'transparent' in-bounds)
        fx = srcX
        fy = srcY
      }

      const [r, g, b, a] = bilinearSample(src, fx, fy)
      dd[idx] = r
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}

// ── Glass ────────────────────────────────────────────────────────────────────

export type GlassTexture = 'frosted' | 'blocks' | 'tiny-lens'

export interface GlassParams {
  distortion: number
  smoothness: number
  texture: GlassTexture
  scale: number
}

/**
 * Simple seeded PRNG (xorshift32) for deterministic texture generation.
 */
function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return ((s >>> 0) / 0xffffffff) * 255
  }
}

/**
 * Box-blur a single-channel buffer in place.
 */
function boxBlur(buf: Float64Array, w: number, h: number, radius: number): void {
  if (radius <= 0) return
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float64Array(buf.length)

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.max(0, Math.min(w - 1, x + dx))
        sum += buf[y * w + nx]!
        count++
      }
      tmp[y * w + x] = sum / count
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.max(0, Math.min(h - 1, y + dy))
        sum += tmp[ny * w + x]!
        count++
      }
      buf[y * w + x] = sum / count
    }
  }
}

/**
 * Generate a texture map for the Glass filter.
 *
 * Returns a Float64Array of length w*h with values centred around 128.
 */
export function generateGlassTexture(
  w: number,
  h: number,
  texture: GlassTexture,
  smoothness: number,
  scale: number,
): Float64Array {
  const buf = new Float64Array(w * h)
  const rng = seededRandom(42)

  switch (texture) {
    case 'frosted': {
      // Random noise, then smooth with box blur
      for (let i = 0; i < buf.length; i++) {
        buf[i] = rng()
      }
      boxBlur(buf, w, h, smoothness)
      break
    }
    case 'blocks': {
      // Grid of uniform rectangles
      const blockSize = Math.max(2, Math.round(scale))
      // Pre-compute a random value per block
      const cols = Math.ceil(w / blockSize)
      const rows = Math.ceil(h / blockSize)
      const blockValues = new Float64Array(cols * rows)
      for (let i = 0; i < blockValues.length; i++) {
        blockValues[i] = rng()
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const bx = Math.floor(x / blockSize)
          const by = Math.floor(y / blockSize)
          buf[y * w + x] = blockValues[by * cols + bx]!
        }
      }
      break
    }
    case 'tiny-lens': {
      // Tiled circular lens patterns
      const lensRadius = Math.max(2, Math.round(scale))
      const diameter = lensRadius * 2
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Position within the current lens tile
          const lx = (((x % diameter) + diameter) % diameter) - lensRadius
          const ly = (((y % diameter) + diameter) % diameter) - lensRadius
          const dist = Math.sqrt(lx * lx + ly * ly)
          if (dist < lensRadius) {
            // Spherical lens displacement: stronger at edges, zero at centre
            const normalized = dist / lensRadius
            buf[y * w + x] = 128 + (normalized * normalized - 0.5) * 255
          } else {
            buf[y * w + x] = 128 // no displacement outside lens
          }
        }
      }
      break
    }
  }

  return buf
}

/**
 * Apply a Glass distortion effect, simulating a textured glass surface.
 *
 * A procedural texture map is generated based on the `texture` type and used
 * as a displacement map.  `distortion` controls the strength and `smoothness`
 * blurs the frosted texture.  `scale` affects the size of blocks / lenses.
 */
export function applyGlass(src: ImageData, params: GlassParams): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  const tex = generateGlassTexture(w, h, params.texture, params.smoothness, params.scale)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = tex[y * w + x]!
      const srcX = x + ((t - 128) * params.distortion) / 128
      const srcY = y + ((t - 128) * params.distortion) / 128

      const [r, g, b, a] = bilinearSample(src, srcX, srcY)
      const idx = (y * w + x) * 4
      dd[idx] = r
      dd[idx + 1] = g
      dd[idx + 2] = b
      dd[idx + 3] = a
    }
  }

  return dst
}
