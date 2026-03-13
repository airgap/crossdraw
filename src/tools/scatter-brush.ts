/**
 * Scatter / Texture / Dual Brush settings and helpers.
 *
 * These extend the basic BrushSettings with randomised scatter, procedural
 * texture masks and dual-brush compositing.
 */

// ── Types ──

export interface ScatterBrushSettings {
  scatterX: number // 0-500 (percentage) — random offset perpendicular to stroke
  scatterY: number // 0-500
  count: number // dabs per stamp position (1-16)
  countJitter: number // 0-100 (percentage)
  sizeJitter: number // 0-100 (percentage) random size variation
  angleJitter: number // 0-360 degrees random rotation
  roundnessJitter: number // 0-100 (percentage)
  textureEnabled: boolean
  texturePattern: TexturePatternType
  textureScale: number // 10-1000 (percentage)
  textureDepth: number // 0-100 (percentage)
  dualBrushEnabled: boolean
  dualBrushSize: number
  dualBrushSpacing: number
  dualBrushScatter: number
}

export type TexturePatternType = 'noise' | 'canvas' | 'burlap' | 'brick' | 'crosshatch'

export const defaultScatterSettings: ScatterBrushSettings = {
  scatterX: 0,
  scatterY: 0,
  count: 1,
  countJitter: 0,
  sizeJitter: 0,
  angleJitter: 0,
  roundnessJitter: 0,
  textureEnabled: false,
  texturePattern: 'noise',
  textureScale: 100,
  textureDepth: 50,
  dualBrushEnabled: false,
  dualBrushSize: 10,
  dualBrushSpacing: 0.25,
  dualBrushScatter: 0,
}

let currentScatter: ScatterBrushSettings = { ...defaultScatterSettings }

// ── Getters / Setters ──

export function getScatterSettings(): ScatterBrushSettings {
  return { ...currentScatter }
}

export function setScatterSettings(patch: Partial<ScatterBrushSettings>) {
  Object.assign(currentScatter, patch)
}

// ── Seeded PRNG (xorshift32) for deterministic scatter in tests ──

let _seed = 42
export function setSeed(s: number) {
  _seed = s | 0 || 1
}

function nextRandom(): number {
  _seed ^= _seed << 13
  _seed ^= _seed >> 17
  _seed ^= _seed << 5
  return ((_seed >>> 0) % 10000) / 10000
}

/** Random in [-1, 1] */
function signedRandom(): number {
  return nextRandom() * 2 - 1
}

// ── Core: compute scatter dabs ──

export interface ScatterDab {
  x: number
  y: number
  size: number // multiplier relative to base size (0..∞)
  angle: number // radians
  roundness: number // 0..1 (1 = perfect circle)
}

/**
 * Given a brush position, compute actual dab placements with scatter / jitter
 * applied. Returns an array of dab descriptors.
 */
export function computeScatterDabs(
  x: number,
  y: number,
  settings: ScatterBrushSettings,
  baseBrushSize = 10,
): ScatterDab[] {
  const dabs: ScatterDab[] = []
  const jitteredCount = Math.max(
    1,
    Math.round(settings.count + (settings.countJitter / 100) * settings.count * signedRandom()),
  )

  for (let i = 0; i < jitteredCount; i++) {
    // Scatter offsets as percentage of brush size
    const ox = (settings.scatterX / 100) * baseBrushSize * signedRandom()
    const oy = (settings.scatterY / 100) * baseBrushSize * signedRandom()

    // Size jitter: random scale between (1 - jitter%) and (1 + jitter%)
    const sizeScale = 1 + (settings.sizeJitter / 100) * signedRandom()
    const clampedSize = Math.max(0.1, sizeScale)

    // Angle jitter in radians
    const angleDeg = settings.angleJitter * nextRandom()
    const angleRad = (angleDeg * Math.PI) / 180

    // Roundness jitter: base 1.0, reduced by jitter
    const roundness = Math.max(0, Math.min(1, 1 - (settings.roundnessJitter / 100) * nextRandom()))

    dabs.push({
      x: x + ox,
      y: y + oy,
      size: clampedSize,
      angle: angleRad,
      roundness,
    })
  }

  return dabs
}

// ── Procedural texture patterns ──

/**
 * Generate a procedural texture mask as a Float32Array (values 0..1).
 * The array is row-major, width * height floats.
 */
export function generateTexturePattern(
  type: TexturePatternType,
  width: number,
  height: number,
  scale: number,
): Float32Array {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const buf = new Float32Array(w * h)
  const s = Math.max(0.01, scale / 100) // normalise percentage

  switch (type) {
    case 'noise':
      fillNoise(buf, w, h, s)
      break
    case 'canvas':
      fillCanvas(buf, w, h, s)
      break
    case 'burlap':
      fillBurlap(buf, w, h, s)
      break
    case 'brick':
      fillBrick(buf, w, h, s)
      break
    case 'crosshatch':
      fillCrosshatch(buf, w, h, s)
      break
  }

  return buf
}

function fillNoise(buf: Float32Array, _w: number, _h: number, _s: number) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] = nextRandom()
  }
  // w, h already encoded in buf.length; scale is for texture tiling in render
  void _s
  void _w
  void _h
}

function fillCanvas(buf: Float32Array, w: number, h: number, s: number) {
  // Woven canvas texture — alternating light/dark based on grid
  const gridSize = Math.max(1, Math.round(4 * s))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / gridSize) % 2
      const gy = Math.floor(y / gridSize) % 2
      buf[y * w + x] = gx === gy ? 0.8 + nextRandom() * 0.2 : 0.3 + nextRandom() * 0.2
    }
  }
}

function fillBurlap(buf: Float32Array, w: number, h: number, s: number) {
  // Coarse cross-thread with more variation
  const gridSize = Math.max(1, Math.round(6 * s))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tx = (x % gridSize) / gridSize
      const ty = (y % gridSize) / gridSize
      const thread = Math.abs(Math.sin(tx * Math.PI)) * Math.abs(Math.sin(ty * Math.PI))
      buf[y * w + x] = thread * 0.7 + nextRandom() * 0.3
    }
  }
}

function fillBrick(buf: Float32Array, w: number, h: number, s: number) {
  const bw = Math.max(2, Math.round(12 * s))
  const bh = Math.max(2, Math.round(6 * s))
  const mortarW = Math.max(1, Math.round(s))
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / bh)
    const yInBrick = y % bh
    const offset = row % 2 === 0 ? 0 : Math.floor(bw / 2)
    for (let x = 0; x < w; x++) {
      const xShifted = (x + offset) % bw
      const isMortar = yInBrick < mortarW || xShifted < mortarW
      buf[y * w + x] = isMortar ? 0.2 + nextRandom() * 0.1 : 0.7 + nextRandom() * 0.3
    }
  }
}

function fillCrosshatch(buf: Float32Array, w: number, h: number, s: number) {
  const lineSpacing = Math.max(2, Math.round(8 * s))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d1 = (x + y) % lineSpacing
      const d2 = (x - y + 1000 * lineSpacing) % lineSpacing
      const onLine = d1 < 1 || d2 < 1
      buf[y * w + x] = onLine ? 0.15 + nextRandom() * 0.1 : 0.85 + nextRandom() * 0.15
    }
  }
}

// ── Texture application ──

/**
 * Multiply a circular dab mask with a texture pattern.
 * Both inputs and output are Float32Array of the same dimensions (w * h).
 * `depth` is 0..100: 0 = texture has no effect, 100 = full texture modulation.
 */
export function applyTextureToDab(dabMask: Float32Array, texturePattern: Float32Array, depth: number): Float32Array {
  const len = Math.min(dabMask.length, texturePattern.length)
  const out = new Float32Array(len)
  const d = Math.max(0, Math.min(100, depth)) / 100

  for (let i = 0; i < len; i++) {
    // Linear interpolation: full dab at depth=0, dab*texture at depth=100
    const texVal = texturePattern[i]!
    out[i] = dabMask[i]! * (1 - d + d * texVal)
  }

  return out
}
