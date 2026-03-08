import { describe, test, expect } from 'bun:test'
import type { TextLayer, VectorLayer } from '@/types'
import {
  isAfdesignFile, reverseString, findZstdBlocks,
  parseAfdesignHeader, AFDESIGN_TAGS, extractASCIIStrings, findTags,
} from '@/io/afdesign-import'
import {
  applyConstraints, DEFAULT_CONSTRAINTS,
  type Constraints,
} from '@/tools/constraints'
import {
  getPointOnPolyline, polylineLength, flattenSegments, layoutTextOnPath,
  type TextOnPathConfig,
} from '@/tools/text-on-path'
import {
  calcDistanceLabels, detectEqualSpacing,
  type DistanceLabel, type EqualSpacingIndicator,
} from '@/render/smart-guides'
import { getScrollThumbPosition } from '@/ui/scrollbars'
import { calcMinimapViewport } from '@/ui/minimap'

describe('LYK-81: afdesign import', () => {
  test('isAfdesignFile detects magic bytes', () => {
    const valid = new Uint8Array([0x00, 0xFF, 0x4B, 0x41, 0, 0, 0, 0])
    expect(isAfdesignFile(valid)).toBe(true)
    const invalid = new Uint8Array([0x89, 0x50, 0x4E, 0x47])
    expect(isAfdesignFile(invalid)).toBe(false)
  })

  test('isAfdesignFile rejects short data', () => {
    expect(isAfdesignFile(new Uint8Array([0x00, 0xFF]))).toBe(false)
  })

  test('reverseString works correctly', () => {
    expect(reverseString('ephS')).toBe('Shpe')
    expect(reverseString('edoN')).toBe('Node')
    expect(reverseString('txeT')).toBe('Text')
  })

  test('AFDESIGN_TAGS has expected entries', () => {
    expect(AFDESIGN_TAGS['ephS']).toBe('Shape')
    expect(AFDESIGN_TAGS['edoN']).toBe('Node')
    expect(AFDESIGN_TAGS['bmyS']).toBe('Symbol')
    expect(AFDESIGN_TAGS['PCCI']).toBe('ICC Profile')
  })

  test('findZstdBlocks finds compressed blocks', () => {
    const data = new Uint8Array(20)
    data[5] = 0x28; data[6] = 0xB5; data[7] = 0x2F; data[8] = 0xFD
    data[14] = 0x28; data[15] = 0xB5; data[16] = 0x2F; data[17] = 0xFD // second block - need index 14+3 < 20
    const blocks = findZstdBlocks(data)
    expect(blocks.length).toBe(2)
    expect(blocks[0]).toBe(5)
    expect(blocks[1]).toBe(14)
  })

  test('parseAfdesignHeader extracts version and block count', () => {
    const data = new Uint8Array(20)
    data[0] = 0x00; data[1] = 0xFF; data[2] = 0x4B; data[3] = 0x41
    data[4] = 2; data[5] = 0; data[6] = 0; data[7] = 0 // version 2
    const header = parseAfdesignHeader(data)
    expect(header.magic).toBe(true)
    expect(header.version).toBe(2)
  })

  test('extractASCIIStrings finds printable strings', () => {
    const text = 'hello\x00world\x00ab' // "ab" is too short with minLength 4
    const bytes = new TextEncoder().encode(text)
    const strings = extractASCIIStrings(bytes, 4)
    expect(strings).toContain('hello')
    expect(strings).toContain('world')
    expect(strings).not.toContain('ab')
  })

  test('findTags finds reversed tag names', () => {
    const text = 'some data ephS more data edoN end'
    const bytes = new TextEncoder().encode(text)
    const tags = findTags(bytes)
    expect(tags.length).toBe(2)
    expect(tags[0]!.decoded).toBe('Shape')
    expect(tags[1]!.decoded).toBe('Node')
  })
})

describe('LYK-111: constraints and pinning', () => {
  const makeLayer = (x: number, y: number): VectorLayer => ({
    id: '1', name: 'Test', type: 'vector', visible: true, locked: false,
    opacity: 1, blendMode: 'normal',
    transform: { x, y, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [], paths: [], fill: null, stroke: null,
    shapeParams: { shapeType: 'rectangle', width: 100, height: 50 },
  })

  test('left constraint keeps x position', () => {
    const layer = makeLayer(50, 50)
    const result = applyConstraints(layer, { horizontal: 'left', vertical: 'top' }, 800, 600, 1200, 600)
    expect(result.x).toBe(50)
  })

  test('right constraint adjusts x for new width', () => {
    const layer = makeLayer(700, 50)
    const result = applyConstraints(layer, { horizontal: 'right', vertical: 'top' }, 800, 600, 1200, 600)
    expect(result.x).toBe(1100) // newWidth - (oldWidth - x) = 1200 - (800 - 700) = 1100
  })

  test('scale constraint scales proportionally', () => {
    const layer = makeLayer(400, 300)
    const result = applyConstraints(layer, { horizontal: 'scale', vertical: 'scale' }, 800, 600, 1600, 1200)
    expect(result.x).toBe(800) // 400/800 * 1600
    expect(result.y).toBe(600)
    expect(result.scaleX).toBe(2) // 1600/800
  })

  test('DEFAULT_CONSTRAINTS is left-top', () => {
    expect(DEFAULT_CONSTRAINTS.horizontal).toBe('left')
    expect(DEFAULT_CONSTRAINTS.vertical).toBe('top')
  })

  test('BaseLayer supports constraints field', () => {
    const layer = makeLayer(0, 0)
    layer.constraints = { horizontal: 'center', vertical: 'center' }
    expect(layer.constraints.horizontal).toBe('center')
  })
})

describe('LYK-110: text on path', () => {
  test('polylineLength calculates correctly', () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 4 }]
    expect(polylineLength(points)).toBe(5)
  })

  test('polylineLength of multi-segment path', () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(polylineLength(points)).toBe(20)
  })

  test('getPointOnPolyline at start', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const pt = getPointOnPolyline(points, 0)!
    expect(pt.x).toBe(0)
    expect(pt.y).toBe(0)
    expect(pt.angle).toBe(0) // horizontal
  })

  test('getPointOnPolyline at midpoint', () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const pt = getPointOnPolyline(points, 50)!
    expect(pt.x).toBe(50)
    expect(pt.y).toBe(0)
  })

  test('getPointOnPolyline returns null for single point', () => {
    expect(getPointOnPolyline([{ x: 0, y: 0 }], 10)).toBeNull()
  })

  test('flattenSegments handles move and line', () => {
    const segments = [
      { type: 'move' as const, x: 0, y: 0 },
      { type: 'line' as const, x: 100, y: 0 },
      { type: 'line' as const, x: 100, y: 100 },
    ]
    const points = flattenSegments(segments)
    expect(points.length).toBe(3)
    expect(points[2]!.x).toBe(100)
    expect(points[2]!.y).toBe(100)
  })

  test('flattenSegments approximates cubic bezier', () => {
    const segments = [
      { type: 'move' as const, x: 0, y: 0 },
      { type: 'cubic' as const, x: 100, y: 0, cp1x: 25, cp1y: 50, cp2x: 75, cp2y: 50 },
    ]
    const points = flattenSegments(segments, 10)
    expect(points.length).toBe(11) // 1 move + 10 bezier samples
    // End point should be (100, 0)
    expect(points[points.length - 1]!.x).toBeCloseTo(100)
    expect(points[points.length - 1]!.y).toBeCloseTo(0)
  })

  test('layoutTextOnPath places characters along path', () => {
    const segments = [
      { type: 'move' as const, x: 0, y: 0 },
      { type: 'line' as const, x: 500, y: 0 },
    ]
    const config: TextOnPathConfig = {
      pathReference: 'p1', pathOffset: 0,
      pathAlign: 'left', flipSide: false, perpendicularOffset: 0,
    }
    const chars = layoutTextOnPath('Hello', segments, config, 16)
    expect(chars.length).toBe(5)
    // Characters should be evenly spaced along x
    expect(chars[0]!.char).toBe('H')
    expect(chars[1]!.x).toBeGreaterThan(chars[0]!.x)
  })

  test('TextLayer supports pathReference', () => {
    const layer: TextLayer = {
      id: '1', name: 'Path Text', type: 'text',
      visible: true, locked: false, opacity: 1, blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [], text: 'Hello',
      fontFamily: 'Arial', fontSize: 16, fontWeight: 'normal',
      fontStyle: 'normal', textAlign: 'left', lineHeight: 1.4,
      letterSpacing: 0, color: '#000',
      pathReference: 'path-layer-1', pathOffset: 0.5,
    }
    expect(layer.pathReference).toBe('path-layer-1')
    expect(layer.pathOffset).toBe(0.5)
  })
})

describe('LYK-124: symbols UI operations', () => {
  test('symbol definition can hold layers', () => {
    const sym = {
      id: 's1', name: 'Button', width: 200, height: 50,
      layers: [
        { id: 'l1', name: 'BG', type: 'vector' },
        { id: 'l2', name: 'Label', type: 'text' },
      ],
    }
    expect(sym.layers.length).toBe(2)
  })

  test('document symbols array stores definitions', () => {
    const doc = {
      symbols: [
        { id: 's1', name: 'Icon', width: 24, height: 24, layers: [] },
        { id: 's2', name: 'Card', width: 300, height: 200, layers: [] },
      ],
    }
    expect(doc.symbols.length).toBe(2)
    expect(doc.symbols[0]!.name).toBe('Icon')
  })
})

describe('LYK-135: viewport scrollbars', () => {
  test('getScrollThumbPosition at origin', () => {
    const { position, size } = getScrollThumbPosition(0, 1000, 1920, 1)
    expect(size).toBeGreaterThan(0)
    expect(position).toBeGreaterThanOrEqual(0)
  })

  test('thumb size decreases with larger content', () => {
    const small = getScrollThumbPosition(0, 1000, 500, 1)
    const large = getScrollThumbPosition(0, 1000, 5000, 1)
    expect(large.size).toBeLessThan(small.size)
  })

  test('thumb size has minimum of 30px', () => {
    const { size } = getScrollThumbPosition(0, 100, 100000, 1)
    expect(size).toBeGreaterThanOrEqual(30)
  })

  test('zoom affects thumb size', () => {
    const z1 = getScrollThumbPosition(0, 1000, 1920, 1)
    const z4 = getScrollThumbPosition(0, 1000, 1920, 4)
    expect(z4.size).toBeLessThan(z1.size)
  })
})

describe('LYK-138: mini-map', () => {
  test('calcMinimapViewport returns viewport rect', () => {
    const vp = calcMinimapViewport(1920, 1080, 1000, 600, 1, 0, 0, 150, 100)
    expect(vp.w).toBeGreaterThan(0)
    expect(vp.h).toBeGreaterThan(0)
  })

  test('higher zoom makes viewport rect smaller', () => {
    const z1 = calcMinimapViewport(1920, 1080, 1000, 600, 1, 0, 0, 150, 100)
    const z4 = calcMinimapViewport(1920, 1080, 1000, 600, 4, 0, 0, 150, 100)
    expect(z4.w).toBeLessThan(z1.w)
    expect(z4.h).toBeLessThan(z1.h)
  })

  test('panning shifts viewport rect', () => {
    const v1 = calcMinimapViewport(1920, 1080, 1000, 600, 1, 0, 0, 150, 100)
    const v2 = calcMinimapViewport(1920, 1080, 1000, 600, 1, -200, -100, 150, 100)
    expect(v2.x).toBeGreaterThan(v1.x)
    expect(v2.y).toBeGreaterThan(v1.y)
  })
})

describe('LYK-139: smart guides polish', () => {
  test('calcDistanceLabels for horizontally separated boxes', () => {
    const a = { x: 0, y: 50, w: 100, h: 50 }
    const b = { x: 200, y: 50, w: 100, h: 50 }
    const labels = calcDistanceLabels(a, b)
    expect(labels.length).toBeGreaterThan(0)
    const hLabel = labels.find(l => l.axis === 'horizontal')!
    expect(hLabel.distance).toBe(100) // gap between 100 and 200
  })

  test('calcDistanceLabels for vertically separated boxes', () => {
    const a = { x: 50, y: 0, w: 100, h: 50 }
    const b = { x: 50, y: 100, w: 100, h: 50 }
    const labels = calcDistanceLabels(a, b)
    const vLabel = labels.find(l => l.axis === 'vertical')!
    expect(vLabel.distance).toBe(50) // gap between 50 and 100
  })

  test('detectEqualSpacing with 3 equally-spaced elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
      { id: 'c', x: 200, y: 0, w: 50, h: 50 },
    ]
    const indicator = detectEqualSpacing(bboxes, 'horizontal')!
    expect(indicator).not.toBeNull()
    expect(indicator.spacing).toBe(50)
    expect(indicator.positions.length).toBe(3)
  })

  test('detectEqualSpacing returns null for unequal spacing', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
      { id: 'c', x: 300, y: 0, w: 50, h: 50 },
    ]
    const indicator = detectEqualSpacing(bboxes, 'horizontal')
    expect(indicator).toBeNull()
  })

  test('detectEqualSpacing returns null for fewer than 3 elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
    ]
    expect(detectEqualSpacing(bboxes, 'horizontal')).toBeNull()
  })

  test('detectEqualSpacing works vertically', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 30 },
      { id: 'b', x: 0, y: 50, w: 50, h: 30 },
      { id: 'c', x: 0, y: 100, w: 50, h: 30 },
    ]
    const indicator = detectEqualSpacing(bboxes, 'vertical')!
    expect(indicator).not.toBeNull()
    expect(indicator.spacing).toBe(20) // gap between 30 and 50, then 80 and 100
    expect(indicator.axis).toBe('vertical')
  })
})
