import { useEditorStore } from '@/store/editor.store'
import { getRasterData, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DodgeBurnMode = 'dodge' | 'burn' | 'sponge'
export type TonalRange = 'shadows' | 'midtones' | 'highlights'
export type SpongeMode = 'saturate' | 'desaturate'

export interface DodgeBurnSettings {
  size: number
  hardness: number
  exposure: number // 0-1
  range: TonalRange
  spongeMode: SpongeMode
  spacing: number
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null
let lastStampX = 0
let lastStampY = 0
let distRemainder = 0
let strokeStarted = false

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const defaultSettings: DodgeBurnSettings = {
  size: 20,
  hardness: 0.5,
  exposure: 0.5,
  range: 'midtones',
  spongeMode: 'saturate',
  spacing: 0.25,
}

let currentSettings: DodgeBurnSettings = { ...defaultSettings }

export function getDodgeBurnSettings(): DodgeBurnSettings {
  return { ...currentSettings }
}

export function setDodgeBurnSettings(settings: Partial<DodgeBurnSettings>) {
  Object.assign(currentSettings, settings)
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Compute luminance (0-1) from RGB (0-255). */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Tonal-range weight: how strongly the adjustment applies to this luminance. */
function rangeWeight(lum: number, range: TonalRange): number {
  switch (range) {
    case 'shadows':
      return Math.max(0, 1 - lum * 3)
    case 'midtones':
      return 1 - Math.abs(lum * 2 - 1)
    case 'highlights':
      return Math.max(0, lum * 3 - 2)
  }
}

/** Convert RGB (0-255) to HSL (h 0-360, s 0-1, l 0-1). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) {
    h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  } else if (max === gn) {
    h = ((bn - rn) / d + 2) * 60
  } else {
    h = ((rn - gn) / d + 4) * 60
  }
  return [h, s, l]
}

/** Convert HSL (h 0-360, s 0-1, l 0-1) back to RGB (0-255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hn = h / 360
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ]
}

// ---------------------------------------------------------------------------
// Brush falloff
// ---------------------------------------------------------------------------

/** Compute brush alpha at normalised distance `dist` (0-1) from centre. */
function brushAlpha(dist: number, hardness: number): number {
  if (dist > 1) return 0
  if (hardness >= 1) return 1
  if (dist <= hardness) return 1
  const t = 1 - (dist - hardness) / (1 - hardness)
  return t * t * t // cubic falloff
}

// ---------------------------------------------------------------------------
// Stroke lifecycle
// ---------------------------------------------------------------------------

export function beginDodgeBurnStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  // Find selected raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  // Fallback: first raster layer
  if (!rasterLayer) {
    rasterLayer = artboard.layers.find((l) => l.type === 'raster') as RasterLayer | undefined
  }

  // Nothing to work on
  if (!rasterLayer) return null

  activeChunkId = rasterLayer.imageChunkId

  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }
  strokeStarted = false
  distRemainder = 0
  return activeChunkId
}

// ---------------------------------------------------------------------------
// Dab stamping — pixel-level dodge/burn/sponge
// ---------------------------------------------------------------------------

function stampDodgeBurn(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  mode: DodgeBurnMode,
  exposure: number,
  range: TonalRange,
  spongeMode: SpongeMode,
) {
  const { data, width, height } = imageData
  const r = Math.ceil(radius)
  const x0 = Math.max(0, Math.floor(cx - r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const x1 = Math.min(width - 1, Math.ceil(cx + r))
  const y1 = Math.min(height - 1, Math.ceil(cy + r))

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - cx
      const dy = py + 0.5 - cy
      const dist = Math.sqrt(dx * dx + dy * dy) / radius
      if (dist > 1) continue

      const alpha = brushAlpha(dist, hardness)
      if (alpha <= 0) continue

      const idx = (py * width + px) * 4
      const cr = data[idx]!
      const cg = data[idx + 1]!
      const cb = data[idx + 2]!
      const ca = data[idx + 3]!

      // Skip fully transparent pixels — nothing to adjust
      if (ca === 0) continue

      if (mode === 'sponge') {
        // Sponge: adjust saturation
        const [h, s, l] = rgbToHsl(cr, cg, cb)
        let newS: number
        if (spongeMode === 'saturate') {
          newS = s + (1 - s) * exposure * alpha
        } else {
          newS = s - s * exposure * alpha
        }
        newS = Math.max(0, Math.min(1, newS))
        const [nr, ng, nb] = hslToRgb(h, newS, l)
        data[idx] = nr
        data[idx + 1] = ng
        data[idx + 2] = nb
        // alpha channel unchanged
      } else {
        // Dodge or Burn
        const lum = luminance(cr, cg, cb)
        const rw = rangeWeight(lum, range)
        const strength = exposure * alpha * rw

        if (mode === 'dodge') {
          // Lighten: new = old + (255 - old) * strength
          data[idx] = Math.min(255, Math.round(cr + (255 - cr) * strength))
          data[idx + 1] = Math.min(255, Math.round(cg + (255 - cg) * strength))
          data[idx + 2] = Math.min(255, Math.round(cb + (255 - cb) * strength))
        } else {
          // Burn (darken): new = old - old * strength
          data[idx] = Math.max(0, Math.round(cr - cr * strength))
          data[idx + 1] = Math.max(0, Math.round(cg - cg * strength))
          data[idx + 2] = Math.max(0, Math.round(cb - cb * strength))
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Paint along points
// ---------------------------------------------------------------------------

export function paintDodgeBurn(
  points: Array<{ x: number; y: number }>,
  mode: DodgeBurnMode = 'dodge',
  range?: TonalRange,
  exposure?: number,
) {
  if (!activeChunkId) {
    if (!beginDodgeBurnStroke()) return
  }

  const imageData = getRasterData(activeChunkId!)
  if (!imageData) return

  const s = currentSettings
  const brushSize = s.size
  const radius = brushSize / 2
  const spacingPx = Math.max(1, brushSize * s.spacing)
  const hardness = s.hardness
  const exp = exposure ?? s.exposure
  const rng = range ?? s.range
  const spongeMode = s.spongeMode

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      stampDodgeBurn(imageData, pt.x, pt.y, radius, hardness, mode, exp, rng, spongeMode)
      lastStampX = pt.x
      lastStampY = pt.y
      distRemainder = 0
      strokeStarted = true
      continue
    }

    const dx = pt.x - lastStampX
    const dy = pt.y - lastStampY
    const segLen = Math.sqrt(dx * dx + dy * dy)
    if (segLen < 0.5) continue

    const ux = dx / segLen
    const uy = dy / segLen

    let d = spacingPx - distRemainder
    while (d <= segLen) {
      const sx = lastStampX + ux * d
      const sy = lastStampY + uy * d
      stampDodgeBurn(imageData, sx, sy, radius, hardness, mode, exp, rng, spongeMode)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }

  // Push modified pixels back to the render cache so the viewport reflects changes
  updateRasterCache(activeChunkId!)
}

// ---------------------------------------------------------------------------
// End stroke
// ---------------------------------------------------------------------------

export function endDodgeBurnStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory('Dodge/Burn stroke', activeChunkId, preStrokeSnapshot, afterData)
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
}
