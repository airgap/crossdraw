import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData, getRasterData, syncCanvasToImageData, updateRasterCache } from '@/store/raster-data'
import type { RasterLayer } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RasterGradientType = 'linear' | 'radial' | 'angular'
export type RasterGradientMode = 'foreground-background' | 'foreground-transparent' | 'custom'

export interface RasterGradientSettings {
  type: RasterGradientType
  mode: RasterGradientMode
  foreground: string // hex color
  background: string // hex color
  opacity: number // 0-1
  dither: boolean // add subtle noise to prevent banding
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const defaultSettings: RasterGradientSettings = {
  type: 'linear',
  mode: 'foreground-background',
  foreground: '#000000',
  background: '#ffffff',
  opacity: 1,
  dither: true,
}

let currentSettings: RasterGradientSettings = { ...defaultSettings }

let activeChunkId: string | null = null
let preStrokeSnapshot: ImageData | null = null

let dragging = false
let startX = 0
let startY = 0

// ---------------------------------------------------------------------------
// Settings accessors
// ---------------------------------------------------------------------------

export function getRasterGradientSettings(): RasterGradientSettings {
  return { ...currentSettings }
}

export function setRasterGradientSettings(settings: Partial<RasterGradientSettings>) {
  Object.assign(currentSettings, settings)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16) || 0,
    g: parseInt(h.substring(2, 4), 16) || 0,
    b: parseInt(h.substring(4, 6), 16) || 0,
  }
}

/** Constrain an angle (radians) to the nearest 45-degree increment. */
function snapAngle(dx: number, dy: number): { dx: number; dy: number } {
  const angle = Math.atan2(dy, dx)
  const dist = Math.sqrt(dx * dx + dy * dy)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return {
    dx: Math.cos(snapped) * dist,
    dy: Math.sin(snapped) * dist,
  }
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Begin a raster gradient drag. Finds or creates a raster layer (same pattern
 * as brush.ts beginStroke), snapshots for undo, and stores the start point.
 */
export function beginRasterGradient(docX: number, docY: number) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  // Find or create a raster layer
  let rasterLayer: RasterLayer | undefined
  const selectedId = store.selection.layerIds[0]
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster') rasterLayer = layer as RasterLayer
  }

  if (!rasterLayer) {
    const chunkId = uuid()
    const w = artboard.width
    const h = artboard.height
    storeRasterData(chunkId, new ImageData(w, h))

    rasterLayer = {
      id: uuid(),
      name: 'Gradient Layer',
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
    preStrokeSnapshot = new ImageData(new Uint8ClampedArray(existing.data), existing.width, existing.height)
  } else {
    preStrokeSnapshot = null
  }

  dragging = true
  startX = docX
  startY = docY
}

/**
 * Update the raster gradient as the user drags. Recomputes the entire gradient
 * from the snapshot so each update replaces the previous preview.
 */
export function updateRasterGradient(docX: number, docY: number, shift: boolean) {
  if (!dragging || !activeChunkId) return

  let endX = docX
  let endY = docY

  // Constrain angle to 45-degree increments when shift is held
  if (shift) {
    const snapped = snapAngle(endX - startX, endY - startY)
    endX = startX + snapped.dx
    endY = startY + snapped.dy
  }

  const imageData = getRasterData(activeChunkId)
  if (!imageData) return

  const { width, height, data } = imageData

  // Restore from snapshot so each drag update replaces previous
  if (preStrokeSnapshot) {
    data.set(preStrokeSnapshot.data)
  }

  const fg = parseHex(currentSettings.foreground)
  const bg = parseHex(currentSettings.background)
  const opacity = currentSettings.opacity
  const gradType = currentSettings.type
  const mode = currentSettings.mode
  const dither = currentSettings.dither

  const dx = endX - startX
  const dy = endY - startY
  const len = Math.sqrt(dx * dx + dy * dy)

  // Avoid division by zero — no visible gradient if start === end
  if (len < 0.5) return

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let t: number

      if (gradType === 'linear') {
        // Project pixel onto the start-to-end line, normalize to 0-1
        const vpx = px - startX
        const vpy = py - startY
        t = (vpx * dx + vpy * dy) / (len * len)
        t = Math.max(0, Math.min(1, t))
      } else if (gradType === 'radial') {
        // Distance from start / distance from start to end, clamped 0-1
        const distX = px - startX
        const distY = py - startY
        const dist = Math.sqrt(distX * distX + distY * distY)
        t = Math.max(0, Math.min(1, dist / len))
      } else {
        // angular
        const apx = px - startX
        const apy = py - startY
        let angle = Math.atan2(apy, apx) - Math.atan2(dy, dx)
        // Normalize to [0, 2*PI)
        if (angle < 0) angle += Math.PI * 2
        t = angle / (Math.PI * 2)
      }

      const idx = (py * width + px) * 4

      let r: number, g: number, b: number, a: number

      if (mode === 'foreground-transparent') {
        r = fg.r
        g = fg.g
        b = fg.b
        // Alpha lerps from opacity to 0
        a = opacity * (1 - t)
      } else {
        // foreground-background (and custom falls back to this)
        r = Math.round(fg.r + (bg.r - fg.r) * t)
        g = Math.round(fg.g + (bg.g - fg.g) * t)
        b = Math.round(fg.b + (bg.b - fg.b) * t)
        a = opacity
      }

      // Dither: add ±1 random noise to each channel to prevent banding
      if (dither) {
        const nr = Math.round(Math.random() * 2 - 1)
        r = Math.max(0, Math.min(255, r + nr))
        g = Math.max(0, Math.min(255, g + nr))
        b = Math.max(0, Math.min(255, b + nr))
      }

      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = Math.round(a * 255)
    }
  }

  // Sync to OffscreenCanvas for live preview
  updateRasterCache(activeChunkId)
}

/**
 * Finalize the raster gradient — sync canvas to ImageData and push undo.
 */
export function endRasterGradient() {
  if (!dragging || !activeChunkId) {
    dragging = false
    return
  }

  syncCanvasToImageData(activeChunkId)

  // Push undo entry
  if (preStrokeSnapshot) {
    const afterData = getRasterData(activeChunkId)
    if (afterData) {
      useEditorStore.getState().pushRasterHistory('Raster gradient', activeChunkId, preStrokeSnapshot, afterData)
    }
  }

  preStrokeSnapshot = null
  activeChunkId = null
  dragging = false
}

/**
 * Returns true if a raster gradient drag is currently in progress.
 */
export function isRasterGradientDragging(): boolean {
  return dragging
}
