import { v4 as uuid } from 'uuid'
import type { Segment, VectorLayer } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ─── Spiral parameters ──────────────────────────────────────

/** Number of full rotations. */
const TURNS = 3
/** Decay factor: 1.0 = Archimedean (linear), other values = logarithmic. */
const DECAY = 1.0
/** Whether the spiral winds clockwise. */
const CLOCKWISE = true
/** Number of cubic bezier segments per full turn. */
const SEGMENTS_PER_TURN = 8

// ─── Module state ────────────────────────────────────────────

interface SpiralState {
  active: boolean
  centerX: number // artboard-local
  centerY: number // artboard-local
  radius: number
  artboardId: string
  layerId: string | null
}

const initialState: SpiralState = {
  active: false,
  centerX: 0,
  centerY: 0,
  radius: 0,
  artboardId: '',
  layerId: null,
}

let state: SpiralState = { ...initialState }

// ─── Exports ─────────────────────────────────────────────────

export function getSpiralPreview(): {
  cx: number
  cy: number
  segments: Segment[]
} | null {
  if (!state.active || state.radius < 1) return null
  return {
    cx: state.centerX,
    cy: state.centerY,
    segments: generateSpiralSegments(state.centerX, state.centerY, state.radius),
  }
}

export function resetSpiral() {
  state = { ...initialState }
}

// ─── Spiral geometry ─────────────────────────────────────────

/**
 * Generate cubic bezier segments approximating an Archimedean (or logarithmic)
 * spiral from center outward.
 *
 * Parametric formula (Archimedean, decay=1):
 *   r(theta) = outerRadius * (theta / maxTheta)
 *
 * For logarithmic (decay != 1):
 *   r(theta) = outerRadius * (theta / maxTheta) ^ decay
 *
 * We sample many points along the spiral and fit cubic bezier curves through
 * consecutive groups of 4 points using Catmull-Rom to cubic conversion.
 */
function generateSpiralSegments(cx: number, cy: number, outerRadius: number): Segment[] {
  const totalSegments = TURNS * SEGMENTS_PER_TURN
  const maxTheta = TURNS * 2 * Math.PI
  const direction = CLOCKWISE ? 1 : -1

  // Sample points along the spiral (one per bezier segment + 1 for the last point)
  const sampleCount = totalSegments + 1
  const pts: Array<{ x: number; y: number }> = []

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1) // 0 to 1
    const theta = t * maxTheta * direction

    // Radius at this angle
    let r: number
    if (DECAY === 1.0) {
      r = outerRadius * t // Archimedean
    } else {
      r = outerRadius * Math.pow(t, DECAY)
    }

    pts.push({
      x: cx + r * Math.cos(theta),
      y: cy + r * Math.sin(theta),
    })
  }

  // Build cubic bezier segments from the sampled polyline.
  // Use Catmull-Rom spline fitting: for each pair of consecutive points,
  // compute control points from surrounding points.
  const segments: Segment[] = []
  segments.push({ type: 'move', x: pts[0]!.x, y: pts[0]!.y })

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!

    // Catmull-Rom to cubic bezier control points
    // cp1 = p1 + (p2 - p0) / 6
    // cp2 = p2 - (p3 - p1) / 6
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    segments.push({
      type: 'cubic',
      cp1x,
      cp1y,
      cp2x,
      cp2y,
      x: p2.x,
      y: p2.y,
    })
  }

  return segments
}

// ─── Event handlers ──────────────────────────────────────────

export function spiralMouseDown(docX: number, docY: number, artboardId: string, artboardX: number, artboardY: number) {
  state.active = true
  state.centerX = docX - artboardX
  state.centerY = docY - artboardY
  state.radius = 0
  state.artboardId = artboardId
  state.layerId = null
}

export function spiralMouseDrag(docX: number, docY: number) {
  if (!state.active) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return

  const localX = docX - artboard.x
  const localY = docY - artboard.y
  const dx = localX - state.centerX
  const dy = localY - state.centerY
  state.radius = Math.sqrt(dx * dx + dy * dy)

  if (state.radius < 2) return

  const segments = generateSpiralSegments(state.centerX, state.centerY, state.radius)

  if (!state.layerId) {
    // Create vector layer on first meaningful drag
    const layer: VectorLayer = {
      id: uuid(),
      name: `Spiral ${artboard.layers.length + 1}`,
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      },
      effects: [],
      paths: [{ id: uuid(), segments, closed: false }],
      fill: null,
      stroke: {
        width: 2,
        color: '#000000',
        opacity: 1,
        position: 'center',
        linecap: 'round',
        linejoin: 'round',
        miterLimit: 10,
      },
    }
    store.addLayer(state.artboardId, layer)
    state.layerId = layer.id
    store.selectLayer(layer.id)
  } else {
    // Update existing layer during drag
    store.updateLayerSilent(state.artboardId, state.layerId, {
      paths: [{ id: uuid(), segments, closed: false }],
    } as Partial<VectorLayer>)
  }
}

export function spiralMouseUp() {
  if (!state.active) return
  useEditorStore.getState().setActiveSnapLines(null)
  state.active = false
  state.layerId = null
}

export function isSpiralDragging(): boolean {
  return state.active
}
