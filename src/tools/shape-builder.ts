import { v4 as uuid } from 'uuid'
import ClipperLib from 'clipper-lib'
import type { Segment, Path, VectorLayer, Layer } from '@/types'
import { useEditorStore } from '@/store/editor.store'
import { pathBBox } from '@/math/bbox'

// ─── Types ──────────────────────────────────────────────────

export interface RegionInfo {
  id: string
  segments: Segment[]
  sourceLayerIds: string[]
  bounds: { x: number; y: number; w: number; h: number }
}

export type RegionStatus = 'default' | 'kept' | 'removed'

export interface ShapeBuilderState {
  active: boolean
  selectedLayerIds: string[]
  regions: RegionInfo[]
  regionStatus: Map<string, RegionStatus>
  hoveredRegionId: string | null
  isDragging: boolean
  dragRegionIds: string[]
}

const SCALE = 1000 // Clipper integer precision scale

// ─── Module state ───────────────────────────────────────────

let state: ShapeBuilderState = {
  active: false,
  selectedLayerIds: [],
  regions: [],
  regionStatus: new Map(),
  hoveredRegionId: null,
  isDragging: false,
  dragRegionIds: [],
}

export function getShapeBuilderState(): ShapeBuilderState {
  return state
}

export function isShapeBuilderActive(): boolean {
  return state.active
}

// ─── Init / Teardown ────────────────────────────────────────

/**
 * Initialize the shape builder tool with the currently selected vector layers.
 * Computes intersection regions from overlapping paths.
 */
export function initShapeBuilder(selectedLayerIds: string[]): boolean {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return false

  const layers = selectedLayerIds
    .map((id) => findLayer(artboard.layers, id))
    .filter((l): l is VectorLayer => l !== null && l.type === 'vector')

  if (layers.length < 2) return false

  const regions = computeRegions(layers)
  if (regions.length === 0) return false

  state = {
    active: true,
    selectedLayerIds: layers.map((l) => l.id),
    regions,
    regionStatus: new Map(regions.map((r) => [r.id, 'default' as RegionStatus])),
    hoveredRegionId: null,
    isDragging: false,
    dragRegionIds: [],
  }

  return true
}

export function cancelShapeBuilder(): void {
  state = {
    active: false,
    selectedLayerIds: [],
    regions: [],
    regionStatus: new Map(),
    hoveredRegionId: null,
    isDragging: false,
    dragRegionIds: [],
  }
}

// ─── Region computation ─────────────────────────────────────

function findLayer(layers: Layer[], id: string): Layer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer
    if (layer.type === 'group') {
      const found = findLayer(layer.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Convert a VectorLayer's paths to Clipper integer paths,
 * applying the layer's transform (translation + scale).
 */
function layerToClipperPaths(layer: VectorLayer): ClipperLib.Paths {
  const paths: ClipperLib.Paths = []
  const t = layer.transform

  for (const path of layer.paths) {
    const cp: ClipperLib.Path = []
    let prevX = 0
    let prevY = 0

    for (const seg of path.segments) {
      if (seg.type === 'close') continue
      if (!('x' in seg)) continue

      if (seg.type === 'cubic') {
        // Sample the cubic curve for accurate polygon approximation
        const steps = 8
        for (let i = 1; i <= steps; i++) {
          const t2 = i / steps
          const mt = 1 - t2
          const px =
            mt * mt * mt * prevX + 3 * mt * mt * t2 * seg.cp1x + 3 * mt * t2 * t2 * seg.cp2x + t2 * t2 * t2 * seg.x
          const py =
            mt * mt * mt * prevY + 3 * mt * mt * t2 * seg.cp1y + 3 * mt * t2 * t2 * seg.cp2y + t2 * t2 * t2 * seg.y
          cp.push({
            X: Math.round((px * t.scaleX + t.x) * SCALE),
            Y: Math.round((py * t.scaleY + t.y) * SCALE),
          })
        }
      } else if (seg.type === 'quadratic') {
        const steps = 8
        for (let i = 1; i <= steps; i++) {
          const t2 = i / steps
          const mt = 1 - t2
          const px = mt * mt * prevX + 2 * mt * t2 * seg.cpx + t2 * t2 * seg.x
          const py = mt * mt * prevY + 2 * mt * t2 * seg.cpy + t2 * t2 * seg.y
          cp.push({
            X: Math.round((px * t.scaleX + t.x) * SCALE),
            Y: Math.round((py * t.scaleY + t.y) * SCALE),
          })
        }
      } else {
        cp.push({
          X: Math.round((seg.x * t.scaleX + t.x) * SCALE),
          Y: Math.round((seg.y * t.scaleY + t.y) * SCALE),
        })
      }

      prevX = seg.x
      prevY = seg.y
    }

    if (cp.length >= 3) paths.push(cp)
  }

  return paths
}

function clipperPathToSegments(cp: ClipperLib.Path): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < cp.length; i++) {
    const pt = cp[i]!
    const x = pt.X / SCALE
    const y = pt.Y / SCALE
    segments.push(i === 0 ? { type: 'move', x, y } : { type: 'line', x, y })
  }
  segments.push({ type: 'close' })
  return segments
}

function clipperExecute(subject: ClipperLib.Paths, clip: ClipperLib.Paths, clipType: number): ClipperLib.Paths {
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true)
  clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
  const solution: ClipperLib.Paths = []
  clipper.Execute(clipType, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return solution
}

function bboxFromSegments(segments: Segment[]): { x: number; y: number; w: number; h: number } {
  const bbox = pathBBox(segments)
  return {
    x: bbox.minX,
    y: bbox.minY,
    w: bbox.maxX - bbox.minX,
    h: bbox.maxY - bbox.minY,
  }
}

/**
 * Compute all unique regions formed by overlapping vector layers.
 *
 * For N layers, we compute:
 * 1. The pairwise intersections between all layer pairs
 * 2. The exclusive (non-overlapping) portions of each layer
 *
 * This decomposes the union of all shapes into discrete, non-overlapping regions.
 */
export function computeRegions(layers: VectorLayer[]): RegionInfo[] {
  if (layers.length < 2) return []

  const regions: RegionInfo[] = []
  const allClipperPaths = layers.map((l) => layerToClipperPaths(l))

  // For each pair of layers, compute their intersection region
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const intersection = clipperExecute(allClipperPaths[i]!, allClipperPaths[j]!, ClipperLib.ClipType.ctIntersection)

      for (const cp of intersection) {
        if (cp.length < 3) continue
        const segments = clipperPathToSegments(cp)
        regions.push({
          id: uuid(),
          segments,
          sourceLayerIds: [layers[i]!.id, layers[j]!.id],
          bounds: bboxFromSegments(segments),
        })
      }
    }
  }

  // For each layer, compute the part that doesn't overlap with any other layer
  for (let i = 0; i < layers.length; i++) {
    let remaining = allClipperPaths[i]!

    for (let j = 0; j < layers.length; j++) {
      if (i === j) continue
      const diff = clipperExecute(remaining, allClipperPaths[j]!, ClipperLib.ClipType.ctDifference)
      remaining = diff
    }

    for (const cp of remaining) {
      if (cp.length < 3) continue
      const segments = clipperPathToSegments(cp)
      regions.push({
        id: uuid(),
        segments,
        sourceLayerIds: [layers[i]!.id],
        bounds: bboxFromSegments(segments),
      })
    }
  }

  return regions
}

// ─── Hit testing ────────────────────────────────────────────

/**
 * Determine which region contains the given point.
 * Uses winding-number point-in-polygon test.
 */
export function hitTestRegion(x: number, y: number, regions: RegionInfo[]): RegionInfo | null {
  for (const region of regions) {
    // Quick bounds check
    const b = region.bounds
    if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue

    if (pointInPolygon(x, y, region.segments)) {
      return region
    }
  }
  return null
}

/**
 * Winding-number point-in-polygon test for our Segment format.
 * Handles move, line, and close segments (curves are already linearized).
 */
function pointInPolygon(px: number, py: number, segments: Segment[]): boolean {
  let winding = 0
  let firstX = 0
  let firstY = 0
  let curX = 0
  let curY = 0

  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        firstX = seg.x
        firstY = seg.y
        curX = seg.x
        curY = seg.y
        break
      case 'line':
        winding += windingEdge(px, py, curX, curY, seg.x, seg.y)
        curX = seg.x
        curY = seg.y
        break
      case 'close':
        winding += windingEdge(px, py, curX, curY, firstX, firstY)
        curX = firstX
        curY = firstY
        break
    }
  }

  return winding !== 0
}

function windingEdge(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  if (y1 <= py) {
    if (y2 > py) {
      // Upward crossing
      const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1)
      if (cross > 0) return 1
    }
  } else {
    if (y2 <= py) {
      // Downward crossing
      const cross = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1)
      if (cross < 0) return -1
    }
  }
  return 0
}

// ─── Region operations ──────────────────────────────────────

/**
 * Merge multiple regions into a single combined region using Clipper union.
 */
export function mergeRegions(regionIds: string[], allRegions: RegionInfo[]): RegionInfo | null {
  const toMerge = allRegions.filter((r) => regionIds.includes(r.id))
  if (toMerge.length === 0) return null
  if (toMerge.length === 1) return toMerge[0]!

  // Convert all regions to clipper paths and union them
  let combined: ClipperLib.Paths = segmentsToClipperPath(toMerge[0]!.segments)

  for (let i = 1; i < toMerge.length; i++) {
    const nextPaths = segmentsToClipperPath(toMerge[i]!.segments)
    combined = clipperExecute(combined, nextPaths, ClipperLib.ClipType.ctUnion)
  }

  if (combined.length === 0) return null

  const allSourceIds = new Set<string>()
  for (const r of toMerge) {
    for (const id of r.sourceLayerIds) {
      allSourceIds.add(id)
    }
  }

  // Take the first (largest) result polygon
  const segments = clipperPathToSegments(combined[0]!)
  return {
    id: uuid(),
    segments,
    sourceLayerIds: Array.from(allSourceIds),
    bounds: bboxFromSegments(segments),
  }
}

function segmentsToClipperPath(segments: Segment[]): ClipperLib.Paths {
  const cp: ClipperLib.Path = []
  for (const seg of segments) {
    if ('x' in seg) {
      cp.push({ X: Math.round(seg.x * SCALE), Y: Math.round(seg.y * SCALE) })
    }
  }
  return cp.length >= 3 ? [cp] : []
}

/**
 * Remove a region from the result set — marks it as removed.
 */
export function removeRegion(regionId: string, allRegions: RegionInfo[]): RegionInfo[] {
  return allRegions.filter((r) => r.id !== regionId)
}

// ─── Interaction handlers ───────────────────────────────────

export function shapeBuilderHover(x: number, y: number): void {
  if (!state.active) return
  const hit = hitTestRegion(x, y, state.regions)
  state.hoveredRegionId = hit ? hit.id : null
}

export function shapeBuilderMouseDown(x: number, y: number, altKey: boolean): void {
  if (!state.active) return

  const hit = hitTestRegion(x, y, state.regions)
  if (!hit) return

  if (altKey) {
    // Alt+click removes a region
    state.regionStatus.set(hit.id, 'removed')
  } else {
    // Normal click keeps/selects a region
    state.regionStatus.set(hit.id, 'kept')
    state.isDragging = true
    state.dragRegionIds = [hit.id]
  }
}

export function shapeBuilderMouseDrag(x: number, y: number): void {
  if (!state.active || !state.isDragging) return

  const hit = hitTestRegion(x, y, state.regions)
  if (hit && !state.dragRegionIds.includes(hit.id)) {
    state.dragRegionIds.push(hit.id)
    state.regionStatus.set(hit.id, 'kept')
  }

  state.hoveredRegionId = hit ? hit.id : null
}

export function shapeBuilderMouseUp(): void {
  if (!state.active) return

  // If we dragged across multiple regions, merge them
  if (state.isDragging && state.dragRegionIds.length > 1) {
    const merged = mergeRegions(state.dragRegionIds, state.regions)
    if (merged) {
      // Remove the source regions and add the merged one
      state.regions = state.regions.filter((r) => !state.dragRegionIds.includes(r.id))
      state.regions.push(merged)

      // Clean up status map
      for (const id of state.dragRegionIds) {
        state.regionStatus.delete(id)
      }
      state.regionStatus.set(merged.id, 'kept')
    }
  }

  state.isDragging = false
  state.dragRegionIds = []
}

// ─── Finalization ───────────────────────────────────────────

/**
 * Finalize the shape builder: create new VectorLayer(s) from kept regions
 * and remove the source layers.
 */
export function finalizeShapeBuilder(): void {
  if (!state.active) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  // Collect kept regions (anything not 'removed')
  const keptRegions = state.regions.filter((r) => {
    const status = state.regionStatus.get(r.id)
    return status !== 'removed'
  })

  if (keptRegions.length === 0) {
    cancelShapeBuilder()
    return
  }

  // Get styling from the first source layer
  const firstSourceId = state.selectedLayerIds[0]
  const firstSource = firstSourceId ? (findLayer(artboard.layers, firstSourceId) as VectorLayer | null) : null

  // Merge all kept regions into one combined path set
  const allSegments: Segment[][] = keptRegions.map((r) => r.segments)
  const paths: Path[] = allSegments.map((segs) => ({
    id: uuid(),
    segments: segs,
    closed: true,
  }))

  const resultLayer: VectorLayer = {
    id: uuid(),
    name: 'Shape Builder result',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: firstSource?.fill ? { ...firstSource.fill } : { type: 'solid', color: '#000000', opacity: 1 },
    stroke: firstSource?.stroke ? { ...firstSource.stroke } : null,
  }

  // Add result and remove originals
  store.addLayer(artboard.id, resultLayer)
  for (const layerId of state.selectedLayerIds) {
    store.deleteLayer(artboard.id, layerId)
  }
  store.selectLayer(resultLayer.id)

  cancelShapeBuilder()
}

/**
 * Finalize the shape builder with specific kept region IDs,
 * for programmatic use and testing.
 */
export function finalizeShapeBuilderWithRegions(keptRegionIds: string[], artboardId: string): VectorLayer | null {
  if (!state.active) return null

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return null

  const keptRegions = state.regions.filter((r) => keptRegionIds.includes(r.id))
  if (keptRegions.length === 0) return null

  const firstSourceId = state.selectedLayerIds[0]
  const firstSource = firstSourceId ? (findLayer(artboard.layers, firstSourceId) as VectorLayer | null) : null

  const paths: Path[] = keptRegions.map((r) => ({
    id: uuid(),
    segments: r.segments,
    closed: true,
  }))

  const resultLayer: VectorLayer = {
    id: uuid(),
    name: 'Shape Builder result',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths,
    fill: firstSource?.fill ? { ...firstSource.fill } : { type: 'solid', color: '#000000', opacity: 1 },
    stroke: firstSource?.stroke ? { ...firstSource.stroke } : null,
  }

  // Add result and remove originals
  store.addLayer(artboardId, resultLayer)
  for (const layerId of state.selectedLayerIds) {
    store.deleteLayer(artboardId, layerId)
  }
  store.selectLayer(resultLayer.id)

  cancelShapeBuilder()
  return resultLayer
}

// ─── Render helpers ─────────────────────────────────────────

/**
 * Render shape builder overlays on the canvas.
 * Called from the viewport render loop when the shape-builder tool is active.
 */
export function renderShapeBuilderOverlay(ctx: CanvasRenderingContext2D, zoom: number): void {
  if (!state.active) return

  for (const region of state.regions) {
    const status = state.regionStatus.get(region.id)
    const isHovered = region.id === state.hoveredRegionId

    // Build the path
    ctx.beginPath()
    for (const seg of region.segments) {
      switch (seg.type) {
        case 'move':
          ctx.moveTo(seg.x, seg.y)
          break
        case 'line':
          ctx.lineTo(seg.x, seg.y)
          break
        case 'close':
          ctx.closePath()
          break
      }
    }

    // Fill based on status
    if (status === 'kept') {
      ctx.fillStyle = 'rgba(0, 200, 100, 0.35)'
    } else if (status === 'removed') {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.35)'
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(74, 125, 255, 0.25)'
    } else {
      ctx.fillStyle = 'rgba(128, 128, 128, 0.12)'
    }
    ctx.fill()

    // Stroke outline
    ctx.strokeStyle =
      status === 'kept'
        ? 'rgba(0, 200, 100, 0.8)'
        : status === 'removed'
          ? 'rgba(255, 60, 60, 0.8)'
          : isHovered
            ? 'rgba(74, 125, 255, 0.8)'
            : 'rgba(128, 128, 128, 0.4)'
    ctx.lineWidth = (isHovered ? 2 : 1) / zoom
    ctx.stroke()
  }
}
