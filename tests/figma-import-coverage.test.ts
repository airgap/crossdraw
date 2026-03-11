import { describe, test, expect } from 'bun:test'
import {
  figmaColorToHex,
  figmaColorAlpha,
  convertFigmaFill,
  convertFigmaStroke,
  convertFigmaEffect,
  buildFigmaTransform,
  convertAutoLayout,
  convertConstraints,
  convertLayoutSizing,
  parseSVGPathD,
  importFigmaClipboard,
  tryImportFigmaClipboard,
} from '@/io/figma-import'
import type { FigmaNode } from '@/io/figma-import'

// ── Cover uncovered branches and edge cases ──

describe('figma-import-coverage: color edge cases', () => {
  test('clamps color values above 1 and below 0', () => {
    expect(figmaColorToHex({ r: 2, g: -0.5, b: 0.5, a: 1 })).toBe('#ff0080')
  })

  test('alpha clamped to 0-1', () => {
    expect(figmaColorAlpha({ r: 0, g: 0, b: 0, a: 1.5 })).toBe(1)
    expect(figmaColorAlpha({ r: 0, g: 0, b: 0, a: -0.5 })).toBe(0)
  })
})

describe('figma-import-coverage: fill conversion edge cases', () => {
  test('GRADIENT_RADIAL fill', () => {
    const fill = convertFigmaFill({
      type: 'GRADIENT_RADIAL',
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      gradientHandlePositions: [
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('gradient')
    expect(fill!.gradient!.type).toBe('radial')
  })

  test('GRADIENT_ANGULAR fill', () => {
    const fill = convertFigmaFill({
      type: 'GRADIENT_ANGULAR',
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 1, b: 0, a: 1 } },
      ],
    })
    expect(fill).not.toBeNull()
    expect(fill!.gradient!.type).toBe('conical')
  })

  test('GRADIENT_DIAMOND fill', () => {
    const fill = convertFigmaFill({
      type: 'GRADIENT_DIAMOND',
      gradientStops: [
        { position: 0, color: { r: 1, g: 1, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    })
    expect(fill).not.toBeNull()
    expect(fill!.gradient!.type).toBe('radial')
  })

  test('EMOJI fill returns null', () => {
    const fill = convertFigmaFill({ type: 'EMOJI' as any })
    expect(fill).toBeNull()
  })

  test('solid fill with no opacity defaults to 1', () => {
    const fill = convertFigmaFill({
      type: 'SOLID',
      color: { r: 0, g: 1, b: 0, a: 1 },
    })
    expect(fill).not.toBeNull()
    expect(fill!.opacity).toBeCloseTo(1)
  })

  test('gradient fill with default handle positions', () => {
    const fill = convertFigmaFill({
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      // no gradientHandlePositions
    })
    expect(fill).not.toBeNull()
    expect(fill!.gradient).toBeDefined()
  })
})

describe('figma-import-coverage: stroke conversion edge cases', () => {
  test('stroke with empty strokes array', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [],
    }
    expect(convertFigmaStroke(node)).toBeNull()
  })

  test('stroke with OUTSIDE position', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokeWeight: 2,
      strokeAlign: 'OUTSIDE',
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke!.position).toBe('outside')
  })

  test('stroke defaults to center when align not specified', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokeWeight: 1,
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke!.position).toBe('center')
    expect(stroke!.linecap).toBe('butt')
    expect(stroke!.linejoin).toBe('miter')
  })

  test('stroke with no color defaults to #000000', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID' }],
      strokeWeight: 1,
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke!.color).toBe('#000000')
  })

  test('stroke with SQUARE cap', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokeWeight: 1,
      strokeCap: 'SQUARE',
      strokeJoin: 'ROUND',
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke!.linecap).toBe('square')
    expect(stroke!.linejoin).toBe('round')
  })

  test('stroke with no dashes returns undefined dasharray', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      strokeWeight: 1,
      strokeDashes: [],
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke!.dasharray).toBeUndefined()
  })
})

describe('figma-import-coverage: effect edge cases', () => {
  test('drop shadow with no offset', () => {
    const effect = convertFigmaEffect({
      type: 'DROP_SHADOW',
      radius: 10,
      color: { r: 0, g: 0, b: 0, a: 0.5 },
    })
    expect(effect).not.toBeNull()
    expect(effect!.params).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    })
  })

  test('inner shadow with no offset', () => {
    const effect = convertFigmaEffect({
      type: 'INNER_SHADOW',
      radius: 5,
      color: { r: 0, g: 0, b: 0, a: 0.5 },
    })
    expect(effect!.params).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    })
  })

  test('drop shadow with no spread defaults to 0', () => {
    const effect = convertFigmaEffect({
      type: 'DROP_SHADOW',
      radius: 10,
      color: { r: 0, g: 0, b: 0, a: 1 },
      offset: { x: 2, y: 3 },
    })
    expect(effect!.params).toMatchObject({
      spread: 0,
    })
  })

  test('DROP_SHADOW without color returns null', () => {
    const effect = convertFigmaEffect({
      type: 'DROP_SHADOW',
      radius: 10,
    })
    expect(effect).toBeNull()
  })

  test('INNER_SHADOW without color returns null', () => {
    const effect = convertFigmaEffect({
      type: 'INNER_SHADOW',
      radius: 5,
    })
    expect(effect).toBeNull()
  })
})

describe('figma-import-coverage: transform edge cases', () => {
  test('no relativeTransform and no absoluteBoundingBox', () => {
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
    })
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.rotation).toBe(0)
  })

  test('relativeTransform with rotation', () => {
    const angle = 45
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      relativeTransform: [
        [cos, -sin, 100],
        [sin, cos, 200],
      ],
    })
    expect(t.x).toBe(100)
    expect(t.y).toBe(200)
    expect(t.rotation).toBeCloseTo(45, 1)
  })

  test('relativeTransform with near-identity scale', () => {
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      relativeTransform: [
        [1.0005, 0, 0],
        [0, 0.9995, 0],
      ],
    })
    // Should round to 1
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
  })

  test('relativeTransform with negative scale (flipped)', () => {
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      relativeTransform: [
        [-1, 0, 50],
        [0, -1, 50],
      ],
    })
    // Flipped both axes
    expect(t.scaleX).not.toBe(1)
  })
})

describe('figma-import-coverage: auto-layout edge cases', () => {
  test('default values when optional fields missing', () => {
    const al = convertAutoLayout({
      id: 'test',
      name: 'Frame',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
    })
    expect(al!.gap).toBe(0)
    expect(al!.paddingTop).toBe(0)
    expect(al!.paddingRight).toBe(0)
    expect(al!.paddingBottom).toBe(0)
    expect(al!.paddingLeft).toBe(0)
    expect(al!.alignItems).toBe('start')
    expect(al!.justifyContent).toBe('start')
    expect(al!.wrap).toBe(false)
  })
})

describe('figma-import-coverage: constraints edge cases', () => {
  test('all constraint types', () => {
    const tests = [
      { h: 'LEFT', v: 'TOP', eh: 'left' as const, ev: 'top' as const },
      { h: 'RIGHT', v: 'BOTTOM', eh: 'right' as const, ev: 'bottom' as const },
      { h: 'SCALE', v: 'SCALE', eh: 'scale' as const, ev: 'scale' as const },
    ]
    for (const { h, v, eh, ev } of tests) {
      const c = convertConstraints({
        id: 'test',
        name: 'Test',
        type: 'RECTANGLE',
        constraints: { horizontal: h as any, vertical: v as any },
      })
      expect(c!.horizontal).toBe(eh)
      expect(c!.vertical).toBe(ev)
    }
  })
})

describe('figma-import-coverage: layout sizing edge cases', () => {
  test('FIXED sizing', () => {
    const ls = convertLayoutSizing({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
    })
    expect(ls!.horizontal).toBe('fixed')
    expect(ls!.vertical).toBe('fixed')
  })

  test('only horizontal sizing present', () => {
    const ls = convertLayoutSizing({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      layoutSizingHorizontal: 'HUG',
    })
    expect(ls).toBeDefined()
    expect(ls!.horizontal).toBe('hug')
    expect(ls!.vertical).toBe('fixed')
  })
})

describe('figma-import-coverage: parseSVGPathD edge cases', () => {
  test('relative cubic (c) command', () => {
    const segs = parseSVGPathD('M 0 0 c 10 20 30 40 50 60')
    expect(segs).toHaveLength(2)
    expect(segs[1]!).toMatchObject({
      type: 'cubic',
      cp1x: 10,
      cp1y: 20,
      cp2x: 30,
      cp2y: 40,
      x: 50,
      y: 60,
    })
  })

  test('relative quadratic (q) command', () => {
    const segs = parseSVGPathD('M 10 10 q 20 30 40 0')
    expect(segs).toHaveLength(2)
    expect(segs[1]!).toMatchObject({
      type: 'quadratic',
      cpx: 30,
      cpy: 40,
      x: 50,
      y: 10,
    })
  })

  test('relative h and v commands', () => {
    const segs = parseSVGPathD('M 0 0 h 50 v 30')
    expect(segs).toHaveLength(3)
    expect(segs[1]!).toMatchObject({ type: 'line', x: 50, y: 0 })
    expect(segs[2]!).toMatchObject({ type: 'line', x: 50, y: 30 })
  })

  test('Z command resets to start point', () => {
    const segs = parseSVGPathD('M 10 10 L 50 10 L 50 50 Z M 100 100 L 150 100')
    expect(segs.length).toBeGreaterThanOrEqual(5)
    // After Z, the implicit move back to start
    const closeIdx = segs.findIndex((s) => s.type === 'close')
    expect(closeIdx).toBeGreaterThan(0)
  })

  test('chained M coordinates after first pair are implicit L', () => {
    const segs = parseSVGPathD('M 0 0 10 10 20 20')
    expect(segs).toHaveLength(3)
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('line')
    expect(segs[2]!.type).toBe('line')
  })
})

describe('figma-import-coverage: full import edge cases', () => {
  test('imports LINE node', () => {
    const json = JSON.stringify({
      id: 'line-1',
      name: 'My Line',
      type: 'LINE',
      visible: true,
      size: { x: 100, y: 0 },
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
  })

  test('imports REGULAR_POLYGON node', () => {
    const json = JSON.stringify({
      id: 'poly-1',
      name: 'Triangle',
      type: 'REGULAR_POLYGON',
      visible: true,
      size: { x: 100, y: 100 },
      pointCount: 3,
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.shapeParams?.shapeType).toBe('polygon')
      expect(layer.shapeParams?.sides).toBe(3)
    }
  })

  test('imports STAR node', () => {
    const json = JSON.stringify({
      id: 'star-1',
      name: 'Star',
      type: 'STAR',
      visible: true,
      size: { x: 100, y: 100 },
      pointCount: 5,
      innerRadius: 0.4,
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.shapeParams?.shapeType).toBe('star')
      expect(layer.shapeParams?.points).toBe(5)
    }
  })

  test('imports VECTOR node with fillGeometry', () => {
    const json = JSON.stringify({
      id: 'vec-1',
      name: 'Vector Path',
      type: 'VECTOR',
      visible: true,
      size: { x: 100, y: 100 },
      fillGeometry: [{ path: 'M 0 0 L 100 0 L 100 100 Z', windingRule: 'EVENODD' }],
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.paths.length).toBe(1)
      expect(layer.paths[0]!.fillRule).toBe('evenodd')
    }
  })

  test('imports BOOLEAN_OPERATION with children as group', () => {
    const json = JSON.stringify({
      id: 'bool-1',
      name: 'Boolean',
      type: 'BOOLEAN_OPERATION',
      visible: true,
      size: { x: 100, y: 100 },
      children: [
        { id: 'c1', name: 'R1', type: 'RECTANGLE', visible: true, size: { x: 50, y: 50 } },
        { id: 'c2', name: 'R2', type: 'RECTANGLE', visible: true, size: { x: 50, y: 50 } },
      ],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    // Boolean operation with children and no fillGeometry -> group
    expect(layer.type).toBe('group')
  })

  test('imports SECTION node like a frame/group', () => {
    const json = JSON.stringify({
      id: 'sec-1',
      name: 'Section',
      type: 'SECTION',
      visible: true,
      size: { x: 400, y: 400 },
      children: [{ id: 'c1', name: 'R1', type: 'RECTANGLE', visible: true, size: { x: 100, y: 100 } }],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('group')
  })

  test('imports COMPONENT_SET node as group', () => {
    const json = JSON.stringify({
      id: 'cs-1',
      name: 'ComponentSet',
      type: 'COMPONENT_SET',
      visible: true,
      size: { x: 200, y: 200 },
      children: [],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('group')
  })

  test('invisible node is skipped', () => {
    const json = JSON.stringify({
      id: 'invis-1',
      name: 'Hidden',
      type: 'RECTANGLE',
      visible: false,
      size: { x: 100, y: 100 },
    })
    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  test('unknown node type without children returns null', () => {
    const json = JSON.stringify({
      id: 'unk-1',
      name: 'Unknown',
      type: 'UNKNOWN_THING',
      visible: true,
      size: { x: 100, y: 100 },
    })
    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  test('unknown node with children is treated as group', () => {
    const json = JSON.stringify({
      id: 'unk-grp',
      name: 'UnknownGroup',
      type: 'UNKNOWN_CONTAINER',
      visible: true,
      size: { x: 100, y: 100 },
      children: [{ id: 'c1', name: 'Rect', type: 'RECTANGLE', visible: true, size: { x: 50, y: 50 } }],
    })
    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.layers.length).toBe(1)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('group')
  })

  test('artboard size from size property', () => {
    const json = JSON.stringify({
      id: 'sized',
      name: 'Sized',
      type: 'RECTANGLE',
      visible: true,
      size: { x: 500, y: 300 },
    })
    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.width).toBe(500)
    expect(doc.artboards[0]!.height).toBe(300)
  })

  test('default artboard size when no dimensions', () => {
    const json = JSON.stringify({
      id: 'nosize',
      name: 'NoSize',
      type: 'RECTANGLE',
      visible: true,
    })
    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.width).toBe(1920)
    expect(doc.artboards[0]!.height).toBe(1080)
  })

  test('text node with decoration and text case', () => {
    const json = JSON.stringify({
      id: 'text-deco',
      name: 'Decorated',
      type: 'TEXT',
      visible: true,
      size: { x: 200, y: 40 },
      characters: 'Hello',
      style: {
        fontFamily: 'Arial',
        fontSize: 16,
        textDecoration: 'UNDERLINE',
        textCase: 'UPPER',
        italic: true,
      },
      fills: [],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('text')
    if (layer.type === 'text') {
      expect(layer.textDecoration).toBe('underline')
      expect(layer.textTransform).toBe('uppercase')
      expect(layer.fontStyle).toBe('italic')
    }
  })

  test('text node with STRIKETHROUGH decoration', () => {
    const json = JSON.stringify({
      id: 'text-strike',
      name: 'Strike',
      type: 'TEXT',
      visible: true,
      size: { x: 200, y: 40 },
      characters: 'Strike',
      style: {
        fontFamily: 'Arial',
        fontSize: 16,
        textDecoration: 'STRIKETHROUGH',
        textCase: 'LOWER',
      },
      fills: [],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'text') {
      expect(layer.textDecoration).toBe('line-through')
      expect(layer.textTransform).toBe('lowercase')
    }
  })

  test('text node with TITLE case', () => {
    const json = JSON.stringify({
      id: 'text-title',
      name: 'Title',
      type: 'TEXT',
      visible: true,
      size: { x: 200, y: 40 },
      characters: 'title',
      style: {
        fontFamily: 'Arial',
        fontSize: 16,
        textCase: 'TITLE',
      },
      fills: [],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'text') {
      expect(layer.textTransform).toBe('capitalize')
    }
  })

  test('text node with RIGHT and JUSTIFIED alignment', () => {
    for (const align of ['RIGHT', 'JUSTIFIED']) {
      const json = JSON.stringify({
        id: `text-${align}`,
        name: align,
        type: 'TEXT',
        visible: true,
        size: { x: 200, y: 40 },
        characters: 'text',
        style: { fontFamily: 'Arial', fontSize: 16, textAlignHorizontal: align },
        fills: [],
      })
      const doc = importFigmaClipboard(json)
      const layer = doc.artboards[0]!.layers[0]!
      if (layer.type === 'text') {
        if (align === 'RIGHT') expect(layer.textAlign).toBe('right')
        if (align === 'JUSTIFIED') expect(layer.textAlign).toBe('left')
      }
    }
  })

  test('multiple fills with additional fills', () => {
    const json = JSON.stringify({
      id: 'multi-fill',
      name: 'MultiFill',
      type: 'RECTANGLE',
      visible: true,
      size: { x: 100, y: 100 },
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
        { type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 } },
        { type: 'SOLID', color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'vector') {
      expect(layer.fill).not.toBeNull()
      expect(layer.additionalFills).toBeDefined()
      expect(layer.additionalFills!.length).toBe(2)
    }
  })

  test('tryImportFigmaClipboard with invalid JSON returns null', () => {
    expect(tryImportFigmaClipboard('{ invalid json')).toBeNull()
  })

  test('node with blend mode mappings', () => {
    const modes = ['MULTIPLY', 'SCREEN', 'OVERLAY', 'DARKEN', 'LIGHTEN']
    for (const bm of modes) {
      const json = JSON.stringify({
        id: `bm-${bm}`,
        name: bm,
        type: 'RECTANGLE',
        visible: true,
        size: { x: 50, y: 50 },
        blendMode: bm,
      })
      const doc = importFigmaClipboard(json)
      const layer = doc.artboards[0]!.layers[0]!
      expect(layer.blendMode).toBeDefined()
    }
  })

  test('VECTOR node with no fillGeometry creates rect placeholder', () => {
    const json = JSON.stringify({
      id: 'vec-nopath',
      name: 'Empty Vector',
      type: 'VECTOR',
      visible: true,
      size: { x: 80, y: 60 },
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.paths.length).toBe(1)
    }
  })

  test('ELLIPSE with rectangle corner radii', () => {
    const json = JSON.stringify({
      id: 'rect-radii',
      name: 'RoundRect',
      type: 'RECTANGLE',
      visible: true,
      size: { x: 100, y: 50 },
      rectangleCornerRadii: [10, 10, 10, 10],
    })
    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'vector') {
      expect(layer.shapeParams?.cornerRadius).toEqual([10, 10, 10, 10])
    }
  })
})
