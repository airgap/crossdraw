import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData, getRasterData, getRasterCanvasCtx, syncCanvasToImageData } from '@/store/raster-data'
import type { RasterLayer, BrushSettings } from '@/types'

const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined'

const defaultBrush: BrushSettings = {
  size: 10,
  hardness: 0.8,
  opacity: 1,
  flow: 1,
  color: '#000000',
  spacing: 0.25,
}

let currentBrush: BrushSettings = { ...defaultBrush }

// Dab cache — OffscreenCanvas for GPU-accelerated stamping
let cachedDabCanvas: OffscreenCanvas | null = null
let cachedDabKey = ''

function getDabCacheKey(size: number, hardness: number, color: string, opacity: number): string {
  return `${size.toFixed(2)}_${hardness.toFixed(2)}_${color}_${opacity.toFixed(3)}`
}

function getCachedDabCanvas(size: number, hardness: number, color: string, opacity: number): OffscreenCanvas {
  const key = getDabCacheKey(size, hardness, color, opacity)
  if (cachedDabCanvas && cachedDabKey === key) return cachedDabCanvas
  cachedDabCanvas = createDabCanvas(size, hardness, color, opacity)
  cachedDabKey = key
  return cachedDabCanvas
}

function createDabCanvas(size: number, hardness: number, color: string, opacity: number): OffscreenCanvas {
  const dim = Math.max(1, Math.ceil(size))
  const canvas = new OffscreenCanvas(dim, dim)
  const ctx = canvas.getContext('2d')!
  const center = dim / 2
  const rgb = parseColor(color)

  if (hardness >= 1) {
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`
    ctx.beginPath()
    ctx.arc(center, center, size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    // Radial gradient with smooth Gaussian-like falloff.
    // hardness controls where the solid core ends and the falloff begins.
    // Multiple stops approximate a smooth curve rather than a linear ramp.
    const grad = ctx.createRadialGradient(center, center, 0, center, center, size / 2)
    const h = hardness
    const rgba = (a: number) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a * opacity})`

    if (h > 0) {
      grad.addColorStop(0, rgba(1))
      grad.addColorStop(h, rgba(1))
    } else {
      grad.addColorStop(0, rgba(1))
    }
    // Smooth curve from solid to transparent using Gaussian-like falloff
    const fadeStart = Math.max(h, 0.001)
    const steps = 8
    for (let i = 1; i <= steps; i++) {
      const t = i / steps // 0..1 within the fade zone
      const r = fadeStart + (1 - fadeStart) * t
      // (1-t)^3 — drops quickly from center for a genuinely soft airbrush
      const alpha = (1 - t) * (1 - t) * (1 - t)
      grad.addColorStop(Math.min(r, 1), rgba(alpha))
    }
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, dim, dim)
  }

  return canvas
}

export function getBrushSettings(): BrushSettings {
  return { ...currentBrush }
}

export function setBrushSettings(settings: Partial<BrushSettings>) {
  Object.assign(currentBrush, settings)
  cachedDabCanvas = null
}

/**
 * Generate a circular brush dab as ImageData (kept for tests/compat).
 */
export function createBrushDab(size: number, hardness: number, color: string, opacity: number): ImageData {
  const dim = Math.ceil(size)
  const center = dim / 2
  const r = parseColor(color)
  const pixels = new Uint8ClampedArray(dim * dim * 4)

  for (let y = 0; y < dim; y++) {
    for (let x = 0; x < dim; x++) {
      const dx = x + 0.5 - center
      const dy = y + 0.5 - center
      const dist = Math.sqrt(dx * dx + dy * dy) / (size / 2)
      if (dist > 1) continue

      let alpha: number
      if (hardness >= 1) {
        alpha = 1
      } else {
        const fade = dist <= hardness ? 1 : 1 - ((dist - hardness) / (1 - hardness))
        alpha = fade * fade * fade // cubic falloff
      }
      alpha *= opacity

      const idx = (y * dim + x) * 4
      pixels[idx] = r.r
      pixels[idx + 1] = r.g
      pixels[idx + 2] = r.b
      pixels[idx + 3] = Math.round(alpha * 255)
    }
  }

  return new ImageData(pixels, dim, dim)
}

function parseColor(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
}

// Track current stroke state
let activeChunkId: string | null = null
/** Snapshot of ImageData before the stroke started, for undo */
let preStrokeSnapshot: ImageData | null = null
/** Last point stamped — prevents double-stamping at segment boundaries */
let lastStampX = 0
let lastStampY = 0
/** Distance remainder from last segment for consistent spacing */
let distRemainder = 0
let strokeStarted = false

/**
 * Ensure a raster layer exists and return its chunk ID.
 * Call at stroke start.
 */
export function beginStroke(): string | null {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return null

  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer
  }

  if (!rasterLayer) {
    const chunkId = uuid()
    const w = artboard.width
    const h = artboard.height
    storeRasterData(chunkId, new ImageData(w, h))

    rasterLayer = {
      id: uuid(),
      name: 'Paint Layer',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: chunkId,
      width: w,
      height: h,
    }
    store.addLayer(artboard.id, rasterLayer)
    store.selectLayer(rasterLayer.id)
  }

  activeChunkId = rasterLayer.imageChunkId
  // Snapshot raster data before painting for undo
  const existing = getRasterData(activeChunkId)
  if (existing) {
    preStrokeSnapshot = new ImageData(
      new Uint8ClampedArray(existing.data),
      existing.width,
      existing.height,
    )
  } else {
    preStrokeSnapshot = null
  }
  strokeStarted = false
  distRemainder = 0
  return activeChunkId
}

/**
 * Paint dabs along points directly onto the OffscreenCanvas (GPU-accelerated).
 * Tracks distance accumulator across calls for consistent spacing without
 * double-stamping at segment boundaries.
 */
export function paintStroke(points: Array<{ x: number; y: number }>, brush?: Partial<BrushSettings>, pressure = 1) {
  // Validate active chunk's layer still exists in the current document
  if (activeChunkId) {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]
    const layerExists = artboard?.layers.some((l) => l.type === 'raster' && (l as RasterLayer).imageChunkId === activeChunkId)
    if (!layerExists) activeChunkId = null
  }
  if (!activeChunkId) {
    if (!beginStroke()) return
  }

  const raw = { ...currentBrush, ...brush }
  const p = Math.max(0, Math.min(1, pressure))
  const b = {
    ...raw,
    size: raw.size * (0.3 + 0.7 * p),
    opacity: raw.opacity * p,
  }

  const dabSize = Math.max(1, Math.ceil(b.size))
  const halfDab = dabSize / 2
  const spacingPx = Math.max(1, b.size * b.spacing)

  if (hasOffscreenCanvas) {
    const ctx = getRasterCanvasCtx(activeChunkId!)
    if (!ctx) return
    const dabCanvas = getCachedDabCanvas(b.size, b.hardness, b.color, b.opacity * b.flow)
    stampPoints(points, spacingPx, halfDab, (x, y) => {
      ctx.drawImage(dabCanvas, x - halfDab, y - halfDab)
    })
  } else {
    // Fallback: ImageData compositing (for bun test / non-browser)
    const imageData = getRasterData(activeChunkId!)
    if (!imageData) return
    const dab = createBrushDab(b.size, b.hardness, b.color, b.opacity * b.flow)
    stampPoints(points, spacingPx, halfDab, (x, y) => {
      stampDab(imageData, dab, dabSize, x - halfDab, y - halfDab)
    })
  }
}

/**
 * Walk along points with consistent spacing, calling stamp() at each dab position.
 * Tracks state across incremental calls to avoid double-stamping at boundaries.
 */
function stampPoints(
  points: Array<{ x: number; y: number }>,
  spacingPx: number,
  _halfDab: number,
  stamp: (x: number, y: number) => void,
) {
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!

    if (!strokeStarted) {
      // First dab of the entire stroke
      stamp(pt.x, pt.y)
      lastStampX = pt.x
      lastStampY = pt.y
      distRemainder = 0
      strokeStarted = true
      continue
    }

    // Walk from lastStamp to this point with spacing
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
      stamp(sx, sy)
      d += spacingPx
    }
    distRemainder = segLen - (d - spacingPx)
    lastStampX = pt.x
    lastStampY = pt.y
  }
}

function stampDab(target: ImageData, dab: ImageData, dabSize: number, ox: number, oy: number) {
  const ix = Math.round(ox)
  const iy = Math.round(oy)
  for (let dy = 0; dy < dabSize; dy++) {
    for (let dx = 0; dx < dabSize; dx++) {
      const tx = ix + dx
      const ty = iy + dy
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue
      const dabIdx = (dy * dabSize + dx) * 4
      const tgtIdx = (ty * target.width + tx) * 4
      const dabAlpha = dab.data[dabIdx + 3]! / 255
      if (dabAlpha === 0) continue
      const tgtAlpha = target.data[tgtIdx + 3]! / 255
      const outAlpha = dabAlpha + tgtAlpha * (1 - dabAlpha)
      if (outAlpha === 0) continue
      target.data[tgtIdx] = Math.round((dab.data[dabIdx]! * dabAlpha + target.data[tgtIdx]! * tgtAlpha * (1 - dabAlpha)) / outAlpha)
      target.data[tgtIdx + 1] = Math.round((dab.data[dabIdx + 1]! * dabAlpha + target.data[tgtIdx + 1]! * tgtAlpha * (1 - dabAlpha)) / outAlpha)
      target.data[tgtIdx + 2] = Math.round((dab.data[dabIdx + 2]! * dabAlpha + target.data[tgtIdx + 2]! * tgtAlpha * (1 - dabAlpha)) / outAlpha)
      target.data[tgtIdx + 3] = Math.round(outAlpha * 255)
    }
  }
}

/**
 * Finalize the stroke — sync the OffscreenCanvas back to ImageData for serialization.
 */
export function endStroke() {
  if (activeChunkId) {
    syncCanvasToImageData(activeChunkId)
    // Push undo entry — only the dirty region will be stored
    if (preStrokeSnapshot) {
      const afterData = getRasterData(activeChunkId)
      if (afterData) {
        useEditorStore.getState().pushRasterHistory(
          'Brush stroke',
          activeChunkId,
          preStrokeSnapshot,
          afterData,
        )
      }
    }
    preStrokeSnapshot = null
    activeChunkId = null
  }
  strokeStarted = false
  distRemainder = 0
}
