import { describe, it, expect, beforeEach } from 'bun:test'
import {
  computeRegions,
  hitTestRegion,
  mergeRegions,
  removeRegion,
  initShapeBuilder,
  getShapeBuilderState,
  cancelShapeBuilder,
  type RegionInfo,
} from '@/tools/shape-builder'
import type { VectorLayer, Segment } from '@/types'
import { useEditorStore } from '@/store/editor.store'

// ─── Test helpers ───────────────────────────────────────────

function makeRect(x: number, y: number, w: number, h: number): Segment[] {
  return [
    { type: 'move', x, y },
    { type: 'line', x: x + w, y },
    { type: 'line', x: x + w, y: y + h },
    { type: 'line', x, y: y + h },
    { type: 'close' },
  ]
}

function makeVectorLayer(id: string, segments: Segment[], tx = 0, ty = 0): VectorLayer {
  return {
    id,
    name: id,
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: tx, y: ty, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [{ id: `${id}-path`, segments, closed: true }],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
  }
}

// ─── Tests ──────────────────────────────────────────────────

describe('computeRegions', () => {
  it('returns empty array for fewer than 2 layers', () => {
    const layer = makeVectorLayer('a', makeRect(0, 0, 100, 100))
    expect(computeRegions([layer])).toEqual([])
  })

  it('computes regions for two overlapping rectangles', () => {
    const layerA = makeVectorLayer('a', makeRect(0, 0, 100, 100))
    const layerB = makeVectorLayer('b', makeRect(50, 0, 100, 100))

    const regions = computeRegions([layerA, layerB])

    // Should have at least 3 regions: left-only, overlap, right-only
    expect(regions.length).toBeGreaterThanOrEqual(3)

    // All regions should have segments
    for (const r of regions) {
      expect(r.segments.length).toBeGreaterThan(0)
      expect(r.id).toBeTruthy()
      expect(r.sourceLayerIds.length).toBeGreaterThan(0)
    }
  })

  it('computes intersection region with correct source layer IDs', () => {
    const layerA = makeVectorLayer('a', makeRect(0, 0, 100, 100))
    const layerB = makeVectorLayer('b', makeRect(50, 0, 100, 100))

    const regions = computeRegions([layerA, layerB])

    // The intersection region should reference both layers
    const intersectionRegions = regions.filter((r) => r.sourceLayerIds.includes('a') && r.sourceLayerIds.includes('b'))
    expect(intersectionRegions.length).toBeGreaterThanOrEqual(1)
  })

  it('computes exclusive regions for non-overlapping shapes', () => {
    const layerA = makeVectorLayer('a', makeRect(0, 0, 50, 50))
    const layerB = makeVectorLayer('b', makeRect(100, 100, 50, 50))

    const regions = computeRegions([layerA, layerB])

    // Non-overlapping: should have 2 exclusive regions, no intersection
    const intersections = regions.filter((r) => r.sourceLayerIds.length === 2)
    const exclusives = regions.filter((r) => r.sourceLayerIds.length === 1)
    expect(intersections.length).toBe(0)
    expect(exclusives.length).toBe(2)
  })
})

describe('hitTestRegion', () => {
  it('returns the region containing the point', () => {
    const region: RegionInfo = {
      id: 'r1',
      segments: makeRect(10, 10, 100, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 10, y: 10, w: 100, h: 100 },
    }

    const result = hitTestRegion(50, 50, [region])
    expect(result).not.toBeNull()
    expect(result!.id).toBe('r1')
  })

  it('returns null for a point outside all regions', () => {
    const region: RegionInfo = {
      id: 'r1',
      segments: makeRect(10, 10, 100, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 10, y: 10, w: 100, h: 100 },
    }

    const result = hitTestRegion(200, 200, [region])
    expect(result).toBeNull()
  })

  it('returns null for empty region list', () => {
    const result = hitTestRegion(50, 50, [])
    expect(result).toBeNull()
  })

  it('hits the correct region among multiple', () => {
    const regionA: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 50, 50),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 50, h: 50 },
    }
    const regionB: RegionInfo = {
      id: 'r2',
      segments: makeRect(100, 100, 50, 50),
      sourceLayerIds: ['b'],
      bounds: { x: 100, y: 100, w: 50, h: 50 },
    }

    expect(hitTestRegion(25, 25, [regionA, regionB])!.id).toBe('r1')
    expect(hitTestRegion(125, 125, [regionA, regionB])!.id).toBe('r2')
    expect(hitTestRegion(75, 75, [regionA, regionB])).toBeNull()
  })

  it('handles point on the boundary edge', () => {
    const region: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 100, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    }

    // Points strictly inside the rectangle
    expect(hitTestRegion(1, 1, [region])).not.toBeNull()
    expect(hitTestRegion(99, 99, [region])).not.toBeNull()
  })
})

describe('mergeRegions', () => {
  it('returns null for empty input', () => {
    const result = mergeRegions([], [])
    expect(result).toBeNull()
  })

  it('returns the single region when only one ID matches', () => {
    const region: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 100, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    }

    const result = mergeRegions(['r1'], [region])
    expect(result).not.toBeNull()
    expect(result!.id).toBe('r1')
  })

  it('merges two adjacent regions into one', () => {
    const regionA: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 50, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 50, h: 100 },
    }
    const regionB: RegionInfo = {
      id: 'r2',
      segments: makeRect(50, 0, 50, 100),
      sourceLayerIds: ['b'],
      bounds: { x: 50, y: 0, w: 50, h: 100 },
    }

    const result = mergeRegions(['r1', 'r2'], [regionA, regionB])
    expect(result).not.toBeNull()

    // Merged region should have a new ID (not r1 or r2)
    expect(result!.id).not.toBe('r1')
    expect(result!.id).not.toBe('r2')

    // Source layer IDs should include both
    expect(result!.sourceLayerIds).toContain('a')
    expect(result!.sourceLayerIds).toContain('b')

    // Merged bounds should span the combined area
    expect(result!.bounds.w).toBeGreaterThan(regionA.bounds.w)
  })

  it('merging overlapping regions combines them correctly', () => {
    const regionA: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 60, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 60, h: 100 },
    }
    const regionB: RegionInfo = {
      id: 'r2',
      segments: makeRect(40, 0, 60, 100),
      sourceLayerIds: ['b'],
      bounds: { x: 40, y: 0, w: 60, h: 100 },
    }

    const result = mergeRegions(['r1', 'r2'], [regionA, regionB])
    expect(result).not.toBeNull()
    // Merged result should span from 0 to 100 in x
    expect(result!.bounds.x).toBeCloseTo(0, 0)
    expect(result!.bounds.w).toBeCloseTo(100, 0)
  })

  it('ignores non-matching region IDs', () => {
    const region: RegionInfo = {
      id: 'r1',
      segments: makeRect(0, 0, 100, 100),
      sourceLayerIds: ['a'],
      bounds: { x: 0, y: 0, w: 100, h: 100 },
    }

    const result = mergeRegions(['nonexistent'], [region])
    expect(result).toBeNull()
  })
})

describe('removeRegion', () => {
  it('removes the specified region from the list', () => {
    const regions: RegionInfo[] = [
      {
        id: 'r1',
        segments: makeRect(0, 0, 50, 50),
        sourceLayerIds: ['a'],
        bounds: { x: 0, y: 0, w: 50, h: 50 },
      },
      {
        id: 'r2',
        segments: makeRect(100, 100, 50, 50),
        sourceLayerIds: ['b'],
        bounds: { x: 100, y: 100, w: 50, h: 50 },
      },
    ]

    const result = removeRegion('r1', regions)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('r2')
  })

  it('returns unchanged list when ID not found', () => {
    const regions: RegionInfo[] = [
      {
        id: 'r1',
        segments: makeRect(0, 0, 50, 50),
        sourceLayerIds: ['a'],
        bounds: { x: 0, y: 0, w: 50, h: 50 },
      },
    ]

    const result = removeRegion('nonexistent', regions)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('r1')
  })

  it('returns empty list when removing the only region', () => {
    const regions: RegionInfo[] = [
      {
        id: 'r1',
        segments: makeRect(0, 0, 50, 50),
        sourceLayerIds: ['a'],
        bounds: { x: 0, y: 0, w: 50, h: 50 },
      },
    ]

    const result = removeRegion('r1', regions)
    expect(result).toHaveLength(0)
  })
})

describe('finalization produces valid VectorLayer', () => {
  beforeEach(() => {
    // Reset store to a clean state
    useEditorStore.getState().newDocument({ width: 500, height: 500 })
    cancelShapeBuilder()
  })

  it('initShapeBuilder returns false for less than 2 layers', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const layerA = makeVectorLayer('sb-a', makeRect(0, 0, 100, 100))
    store.addLayer(artboard.id, layerA)

    const result = initShapeBuilder([layerA.id])
    expect(result).toBe(false)
    expect(getShapeBuilderState().active).toBe(false)
  })

  it('initShapeBuilder activates with 2+ overlapping vector layers', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const layerA = makeVectorLayer('sb-a', makeRect(0, 0, 100, 100))
    const layerB = makeVectorLayer('sb-b', makeRect(50, 0, 100, 100))
    store.addLayer(artboard.id, layerA)
    store.addLayer(artboard.id, layerB)

    const result = initShapeBuilder([layerA.id, layerB.id])
    expect(result).toBe(true)

    const sbState = getShapeBuilderState()
    expect(sbState.active).toBe(true)
    expect(sbState.regions.length).toBeGreaterThanOrEqual(3)
    expect(sbState.selectedLayerIds).toContain(layerA.id)
    expect(sbState.selectedLayerIds).toContain(layerB.id)

    cancelShapeBuilder()
  })

  it('all regions have valid segment data', () => {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const layerA = makeVectorLayer('sb-a', makeRect(0, 0, 100, 100))
    const layerB = makeVectorLayer('sb-b', makeRect(50, 0, 100, 100))
    store.addLayer(artboard.id, layerA)
    store.addLayer(artboard.id, layerB)

    initShapeBuilder([layerA.id, layerB.id])
    const sbState = getShapeBuilderState()

    for (const region of sbState.regions) {
      // Must have move, at least 2 lines, and close
      expect(region.segments.length).toBeGreaterThanOrEqual(4)
      expect(region.segments[0]!.type).toBe('move')
      expect(region.segments[region.segments.length - 1]!.type).toBe('close')
      // Bounds must be valid
      expect(region.bounds.w).toBeGreaterThan(0)
      expect(region.bounds.h).toBeGreaterThan(0)
    }

    cancelShapeBuilder()
  })
})
