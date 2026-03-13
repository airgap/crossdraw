/**
 * Puppet Warp tool — Pin-based deformation using Moving Least Squares (MLS).
 *
 * The user places pins on the image and drags them to deform it.  The MLS
 * rigid deformation algorithm computes a smooth, rotation-aware warp that
 * minimises distortion while honouring all pin constraints.
 *
 * Reference: Schaefer, McPhail, Warren — "Image Deformation Using Moving
 * Least Squares" (2006).
 */

import { bilinearSample } from '@/filters/distort'
import { getRasterData, updateRasterCache, storeRasterData } from '@/store/raster-data'
import { useEditorStore } from '@/store/editor.store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PuppetPin {
  id: string
  x: number
  y: number
  originalX: number
  originalY: number
}

export interface PuppetWarpState {
  active: boolean
  pins: PuppetPin[]
  /** Chunk ID of the raster layer */
  chunkId: string | null
  /** Original image snapshot */
  originalSnapshot: ImageData | null
  /** Next pin ID counter */
  nextPinId: number
}

export interface PuppetWarpSettings {
  /** Rigidity exponent (alpha): higher = more rigid */
  rigidity: number
  /** Mesh density for preview (not used in final apply, but controls preview fidelity) */
  meshDensity: number
}

// ── Module state ─────────────────────────────────────────────────────────────

const state: PuppetWarpState = {
  active: false,
  pins: [],
  chunkId: null,
  originalSnapshot: null,
  nextPinId: 1,
}

const defaultSettings: PuppetWarpSettings = {
  rigidity: 1.0,
  meshDensity: 50,
}

let currentSettings: PuppetWarpSettings = { ...defaultSettings }

// ── Settings ─────────────────────────────────────────────────────────────────

export function getPuppetWarpSettings(): PuppetWarpSettings {
  return { ...currentSettings }
}

export function setPuppetWarpSettings(patch: Partial<PuppetWarpSettings>): void {
  Object.assign(currentSettings, patch)
}

// ── Query ────────────────────────────────────────────────────────────────────

export function isPuppetWarpActive(): boolean {
  return state.active
}

export function getPuppetPins(): PuppetPin[] {
  return state.pins.map((p) => ({ ...p }))
}

// ── Pin management ───────────────────────────────────────────────────────────

export function addPin(x: number, y: number): string {
  const id = `pin_${state.nextPinId++}`
  state.pins.push({ id, x, y, originalX: x, originalY: y })
  return id
}

export function removePin(id: string): void {
  state.pins = state.pins.filter((p) => p.id !== id)
}

export function movePin(id: string, x: number, y: number): void {
  const pin = state.pins.find((p) => p.id === id)
  if (pin) {
    pin.x = x
    pin.y = y
  }
}

// ── MLS Rigid Deformation ────────────────────────────────────────────────────

/**
 * Compute the MLS rigid deformation for a single point.
 *
 * Given source pins p_i and deformed pins q_i, compute where point v maps to.
 * Uses the rigid formulation which preserves local rotations.
 *
 * @param vx Source point x
 * @param vy Source point y
 * @param pins Array of pins with original and current positions
 * @param alpha Rigidity exponent (controls weight falloff)
 * @returns [destX, destY]
 */
export function mlsRigidDeformation(vx: number, vy: number, pins: PuppetPin[], alpha: number): [number, number] {
  if (pins.length === 0) return [vx, vy]
  if (pins.length === 1) {
    // Single pin: pure translation
    const p = pins[0]!
    return [vx + (p.x - p.originalX), vy + (p.y - p.originalY)]
  }

  // Compute weights: wi = 1 / |pi - v|^(2*alpha)
  const weights: number[] = []
  let totalWeight = 0

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!
    const dx = pin.originalX - vx
    const dy = pin.originalY - vy
    const dist2 = dx * dx + dy * dy

    if (dist2 < 1e-10) {
      // Point is exactly at a pin — return the pin's deformed position
      return [pin.x, pin.y]
    }

    const w = 1 / Math.pow(dist2, alpha)
    weights.push(w)
    totalWeight += w
  }

  // Weighted centroids
  let pStarX = 0
  let pStarY = 0
  let qStarX = 0
  let qStarY = 0

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!
    const w = weights[i]!
    pStarX += w * pin.originalX
    pStarY += w * pin.originalY
    qStarX += w * pin.x
    qStarY += w * pin.y
  }

  pStarX /= totalWeight
  pStarY /= totalWeight
  qStarX /= totalWeight
  qStarY /= totalWeight

  // Compute the optimal rotation via the rigid MLS formulation
  // fr(v) = |fr(v)| * (v - p*) * M^(-1) / |(v - p*) * M^(-1)| + q*
  // where M = sum_i(wi * pHat_i^T * pHat_i) (the moment matrix)

  // pHat_i = pi - p*, qHat_i = qi - q*
  let sumA = 0 // For rotation: sum(wi * (pHat . qHat))
  let sumB = 0 // For rotation: sum(wi * (pHat x qHat))

  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!
    const w = weights[i]!

    const phx = pin.originalX - pStarX
    const phy = pin.originalY - pStarY
    const qhx = pin.x - qStarX
    const qhy = pin.y - qStarY

    // Dot product (for cos of rotation)
    sumA += w * (phx * qhx + phy * qhy)
    // Cross product (for sin of rotation)
    sumB += w * (phx * qhy - phy * qhx)
  }

  // Length of (sumA, sumB) gives us the rotation matrix
  const len = Math.sqrt(sumA * sumA + sumB * sumB)
  if (len < 1e-12) {
    // Degenerate: just translate
    return [vx - pStarX + qStarX, vy - pStarY + qStarY]
  }

  const cosR = sumA / len
  const sinR = sumB / len

  // Apply: rotate (v - p*) and translate by q*
  const dvx = vx - pStarX
  const dvy = vy - pStarY

  return [cosR * dvx - sinR * dvy + qStarX, sinR * dvx + cosR * dvy + qStarY]
}

/**
 * Apply puppet warp deformation to an ImageData.
 *
 * Uses inverse mapping: for each destination pixel, find the source via
 * inverse MLS. Since MLS is not trivially invertible, we use the forward
 * mapping from original pins to deformed pins, then swap their roles for
 * the inverse.
 */
export function applyPuppetWarp(src: ImageData, pins: PuppetPin[]): ImageData {
  const { width: w, height: h } = src
  const dst = new ImageData(w, h)
  const dd = dst.data

  if (pins.length === 0) {
    dd.set(src.data)
    return dst
  }

  const alpha = currentSettings.rigidity

  // For inverse mapping, swap original and current positions
  const inversePins: PuppetPin[] = pins.map((p) => ({
    ...p,
    originalX: p.x,
    originalY: p.y,
    x: p.originalX,
    y: p.originalY,
  }))

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [sx, sy] = mlsRigidDeformation(x, y, inversePins, alpha)

      if (sx >= -0.5 && sx < w - 0.5 && sy >= -0.5 && sy < h - 0.5) {
        const [r, g, b, a] = bilinearSample(src, sx, sy)
        const idx = (y * w + x) * 4
        dd[idx] = r
        dd[idx + 1] = g
        dd[idx + 2] = b
        dd[idx + 3] = a
      }
    }
  }

  return dst
}

// ── Tool lifecycle ───────────────────────────────────────────────────────────

/**
 * Begin a puppet warp session on the current raster layer.
 */
export function beginPuppetWarp(): boolean {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return false

  const selectedId = store.selection.layerIds[0]
  let chunkId: string | null = null
  if (selectedId) {
    const layer = artboard.layers.find((l) => l.id === selectedId)
    if (layer?.type === 'raster' && 'imageChunkId' in layer) {
      chunkId = (layer as { imageChunkId: string }).imageChunkId
    }
  }

  if (!chunkId) {
    const raster = artboard.layers.find((l) => l.type === 'raster')
    if (raster && 'imageChunkId' in raster) {
      chunkId = (raster as { imageChunkId: string }).imageChunkId
    }
  }

  if (!chunkId) return false

  const imgData = getRasterData(chunkId)
  if (!imgData) return false

  state.originalSnapshot = new ImageData(new Uint8ClampedArray(imgData.data), imgData.width, imgData.height)
  state.chunkId = chunkId
  state.pins = []
  state.nextPinId = 1
  state.active = true

  return true
}

/**
 * Commit the puppet warp: apply warped image to raster data with undo.
 */
export function commitPuppetWarp(): boolean {
  if (!state.active || !state.chunkId || !state.originalSnapshot) return false

  const result = applyPuppetWarp(state.originalSnapshot, state.pins)

  storeRasterData(state.chunkId, result)
  updateRasterCache(state.chunkId)

  useEditorStore.getState().pushRasterHistory('Puppet warp', state.chunkId, state.originalSnapshot, result)

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.pins = []

  return true
}

/**
 * Cancel the puppet warp, restoring the original image.
 */
export function cancelPuppetWarp(): void {
  if (state.chunkId && state.originalSnapshot) {
    storeRasterData(state.chunkId, state.originalSnapshot)
    updateRasterCache(state.chunkId)
  }

  state.active = false
  state.chunkId = null
  state.originalSnapshot = null
  state.pins = []
}
