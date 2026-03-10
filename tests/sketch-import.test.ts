import { describe, it, expect } from 'vitest'
import {
  sketchColorToHex,
  sketchColorAlpha,
  parseSketchPoint,
  convertSketchFill,
  convertSketchBorder,
  convertSketchShadow,
  convertSketchBlur,
  convertCurvePoints,
  buildTransform,
  extractBlendMode,
  collectEffects,
  offsetSegments,
} from '@/io/sketch-import'
import {
  figmaColorToHex,
  figmaColorAlpha,
  convertFigmaFill,
  convertFigmaEffect,
  buildFigmaTransform,
  convertAutoLayout,
  convertConstraints,
  convertLayoutSizing,
  parseSVGPathD,
  importFigmaClipboard,
  tryImportFigmaClipboard,
  convertFigmaStroke,
} from '@/io/figma-import'
import type { FigmaNode } from '@/io/figma-import'

// ═══════════════════════════════════════════════════════════════════════
// Sketch Import Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Sketch Import — Color Conversion', () => {
  it('converts Sketch RGBA to hex', () => {
    expect(sketchColorToHex({ _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 })).toBe('#ff0000')
    expect(sketchColorToHex({ _class: 'color', red: 0, green: 0.5, blue: 1, alpha: 1 })).toBe('#0080ff')
    expect(sketchColorToHex({ _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 })).toBe('#000000')
    expect(sketchColorToHex({ _class: 'color', red: 1, green: 1, blue: 1, alpha: 1 })).toBe('#ffffff')
  })

  it('extracts alpha correctly', () => {
    expect(sketchColorAlpha({ _class: 'color', red: 0, green: 0, blue: 0, alpha: 0.5 })).toBe(0.5)
    expect(sketchColorAlpha({ _class: 'color', red: 0, green: 0, blue: 0, alpha: 0 })).toBe(0)
    expect(sketchColorAlpha({ _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 })).toBe(1)
  })

  it('clamps color values to 0-1', () => {
    expect(sketchColorToHex({ _class: 'color', red: 2, green: -1, blue: 0.5, alpha: 1 })).toBe('#ff0080')
    expect(sketchColorAlpha({ _class: 'color', red: 0, green: 0, blue: 0, alpha: 1.5 })).toBe(1)
    expect(sketchColorAlpha({ _class: 'color', red: 0, green: 0, blue: 0, alpha: -0.5 })).toBe(0)
  })
})

describe('Sketch Import — Point Parsing', () => {
  it('parses "{x, y}" format', () => {
    expect(parseSketchPoint('{0.5, 0.25}')).toEqual([0.5, 0.25])
    expect(parseSketchPoint('{0, 0}')).toEqual([0, 0])
    expect(parseSketchPoint('{1, 1}')).toEqual([1, 1])
  })

  it('handles whitespace variations', () => {
    expect(parseSketchPoint('{0.5,0.25}')).toEqual([0.5, 0.25])
    expect(parseSketchPoint('{ 0.5 , 0.25 }')).toEqual([0.5, 0.25])
  })
})

describe('Sketch Import — Fill Conversion', () => {
  it('converts solid fill', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: true,
      fillType: 0,
      color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 0.8 },
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('solid')
    expect(fill!.color).toBe('#ff0000')
    expect(fill!.opacity).toBeCloseTo(0.8)
  })

  it('returns null for disabled fills', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: false,
      fillType: 0,
      color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
    })
    expect(fill).toBeNull()
  })

  it('converts gradient fill', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: true,
      fillType: 1,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      gradient: {
        _class: 'gradient',
        gradientType: 0,
        from: '{0, 0}',
        to: '{1, 1}',
        stops: [
          { _class: 'gradientStop', position: 0, color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 } },
          { _class: 'gradientStop', position: 1, color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 } },
        ],
      },
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('gradient')
    expect(fill!.gradient).toBeDefined()
    expect(fill!.gradient!.type).toBe('linear')
    expect(fill!.gradient!.stops).toHaveLength(2)
    expect(fill!.gradient!.stops[0]!.color).toBe('#ff0000')
    expect(fill!.gradient!.stops[1]!.color).toBe('#0000ff')
  })

  it('converts radial gradient', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: true,
      fillType: 1,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      gradient: {
        _class: 'gradient',
        gradientType: 1,
        from: '{0.5, 0.5}',
        to: '{1, 0.5}',
        stops: [
          { _class: 'gradientStop', position: 0, color: { _class: 'color', red: 1, green: 1, blue: 1, alpha: 1 } },
          { _class: 'gradientStop', position: 1, color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 } },
        ],
      },
    })
    expect(fill!.gradient!.type).toBe('radial')
  })
})

describe('Sketch Import — Border Conversion', () => {
  it('converts enabled border', () => {
    const stroke = convertSketchBorder({
      _class: 'border',
      isEnabled: true,
      fillType: 0,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      thickness: 2,
      position: 0,
    })
    expect(stroke).not.toBeNull()
    expect(stroke!.width).toBe(2)
    expect(stroke!.color).toBe('#000000')
    expect(stroke!.position).toBe('center')
  })

  it('maps border positions correctly', () => {
    const inside = convertSketchBorder({
      _class: 'border',
      isEnabled: true,
      fillType: 0,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      thickness: 1,
      position: 1,
    })
    expect(inside!.position).toBe('inside')

    const outside = convertSketchBorder({
      _class: 'border',
      isEnabled: true,
      fillType: 0,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      thickness: 1,
      position: 2,
    })
    expect(outside!.position).toBe('outside')
  })

  it('returns null for disabled border', () => {
    const stroke = convertSketchBorder({
      _class: 'border',
      isEnabled: false,
      fillType: 0,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      thickness: 1,
      position: 0,
    })
    expect(stroke).toBeNull()
  })
})

describe('Sketch Import — Shadow/Blur Conversion', () => {
  it('converts drop shadow', () => {
    const effect = convertSketchShadow({
      _class: 'shadow',
      isEnabled: true,
      blurRadius: 10,
      offsetX: 5,
      offsetY: 5,
      spread: 2,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 0.5 },
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('drop-shadow')
    expect(effect!.params).toMatchObject({
      kind: 'shadow',
      offsetX: 5,
      offsetY: 5,
      blurRadius: 10,
      spread: 2,
    })
  })

  it('converts inner shadow', () => {
    const effect = convertSketchShadow({
      _class: 'innerShadow',
      isEnabled: true,
      blurRadius: 8,
      offsetX: 2,
      offsetY: 2,
      spread: 0,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 0.3 },
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('inner-shadow')
    expect(effect!.params).toMatchObject({
      kind: 'inner-shadow',
      offsetX: 2,
      offsetY: 2,
      blurRadius: 8,
    })
  })

  it('returns null for disabled shadow', () => {
    expect(
      convertSketchShadow({
        _class: 'shadow',
        isEnabled: false,
        blurRadius: 10,
        offsetX: 0,
        offsetY: 0,
        spread: 0,
        color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      }),
    ).toBeNull()
  })

  it('converts gaussian blur', () => {
    const effect = convertSketchBlur({
      _class: 'blur',
      isEnabled: true,
      radius: 15,
      type: 0,
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('blur')
    expect(effect!.params).toMatchObject({
      kind: 'blur',
      radius: 15,
    })
  })

  it('converts background blur', () => {
    const effect = convertSketchBlur({
      _class: 'blur',
      isEnabled: true,
      radius: 20,
      type: 3,
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('background-blur')
    expect(effect!.params).toMatchObject({
      kind: 'background-blur',
      radius: 20,
    })
  })
})

describe('Sketch Import — Transform Conversion', () => {
  it('builds transform from Sketch layer frame', () => {
    const t = buildTransform({
      _class: 'rectangle',
      do_objectID: 'test',
      name: 'Rect',
      isVisible: true,
      isLocked: false,
      frame: { _class: 'rect', x: 100, y: 200, width: 300, height: 400 },
      rotation: 0,
      isFlippedHorizontal: false,
      isFlippedVertical: false,
    })
    expect(t.x).toBe(100)
    expect(t.y).toBe(200)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.rotation).toBe(0)
  })

  it('handles flipped layers', () => {
    const t = buildTransform({
      _class: 'rectangle',
      do_objectID: 'test',
      name: 'Rect',
      isVisible: true,
      isLocked: false,
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
      rotation: 0,
      isFlippedHorizontal: true,
      isFlippedVertical: true,
    })
    expect(t.scaleX).toBe(-1)
    expect(t.scaleY).toBe(-1)
  })

  it('handles rotation (CCW to CW conversion)', () => {
    const t = buildTransform({
      _class: 'rectangle',
      do_objectID: 'test',
      name: 'Rect',
      isVisible: true,
      isLocked: false,
      frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
      rotation: 45,
      isFlippedHorizontal: false,
      isFlippedVertical: false,
    })
    expect(t.rotation).toBe(-45)
  })
})

describe('Sketch Import — Blend Mode', () => {
  it('maps known blend modes', () => {
    expect(extractBlendMode({ _class: 'style', contextSettings: { _class: 'graphicsContextSettings', blendMode: 0, opacity: 1 } })).toBe('normal')
    expect(extractBlendMode({ _class: 'style', contextSettings: { _class: 'graphicsContextSettings', blendMode: 2, opacity: 1 } })).toBe('multiply')
    expect(extractBlendMode({ _class: 'style', contextSettings: { _class: 'graphicsContextSettings', blendMode: 5, opacity: 1 } })).toBe('screen')
    expect(extractBlendMode({ _class: 'style', contextSettings: { _class: 'graphicsContextSettings', blendMode: 7, opacity: 1 } })).toBe('overlay')
  })

  it('defaults to normal for missing context settings', () => {
    expect(extractBlendMode(undefined)).toBe('normal')
    expect(extractBlendMode({ _class: 'style' })).toBe('normal')
  })
})

describe('Sketch Import — Effects Collection', () => {
  it('collects shadows, inner shadows, and blur into effects array', () => {
    const effects = collectEffects({
      _class: 'style',
      shadows: [
        {
          _class: 'shadow',
          isEnabled: true,
          blurRadius: 4,
          offsetX: 0,
          offsetY: 2,
          spread: 0,
          color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 0.25 },
        },
      ],
      innerShadows: [
        {
          _class: 'innerShadow',
          isEnabled: true,
          blurRadius: 3,
          offsetX: 0,
          offsetY: 1,
          spread: 0,
          color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 0.15 },
        },
      ],
      blur: {
        _class: 'blur',
        isEnabled: true,
        radius: 5,
        type: 0,
      },
    })

    expect(effects).toHaveLength(3)
    expect(effects[0]!.type).toBe('drop-shadow')
    expect(effects[1]!.type).toBe('inner-shadow')
    expect(effects[2]!.type).toBe('blur')
  })

  it('skips disabled effects', () => {
    const effects = collectEffects({
      _class: 'style',
      shadows: [
        {
          _class: 'shadow',
          isEnabled: false,
          blurRadius: 4,
          offsetX: 0,
          offsetY: 2,
          spread: 0,
          color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
        },
      ],
    })
    expect(effects).toHaveLength(0)
  })
})

describe('Sketch Import — Curve Points', () => {
  it('converts straight line points', () => {
    const segments = convertCurvePoints(
      [
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{0, 0}',
          curveTo: '{0, 0}',
          point: '{0, 0}',
          curveMode: 1,
          hasCurveFrom: false,
          hasCurveTo: false,
        },
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{1, 0}',
          curveTo: '{1, 0}',
          point: '{1, 0}',
          curveMode: 1,
          hasCurveFrom: false,
          hasCurveTo: false,
        },
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{1, 1}',
          curveTo: '{1, 1}',
          point: '{1, 1}',
          curveMode: 1,
          hasCurveFrom: false,
          hasCurveTo: false,
        },
      ],
      100,
      100,
      true,
    )

    expect(segments[0]).toMatchObject({ type: 'move', x: 0, y: 0 })
    expect(segments[1]).toMatchObject({ type: 'line', x: 100, y: 0 })
    expect(segments[2]).toMatchObject({ type: 'line', x: 100, y: 100 })
    // Should have a close segment
    expect(segments.some((s) => s.type === 'close')).toBe(true)
  })

  it('converts cubic curve points', () => {
    const segments = convertCurvePoints(
      [
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{0.5, 0}',
          curveTo: '{0, 0}',
          point: '{0, 0}',
          curveMode: 2,
          hasCurveFrom: true,
          hasCurveTo: false,
        },
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{1, 1}',
          curveTo: '{0.5, 1}',
          point: '{1, 1}',
          curveMode: 2,
          hasCurveFrom: false,
          hasCurveTo: true,
        },
      ],
      200,
      200,
      false,
    )

    expect(segments[0]).toMatchObject({ type: 'move', x: 0, y: 0 })
    expect(segments[1]!.type).toBe('cubic')
    if (segments[1]!.type === 'cubic') {
      expect(segments[1]!.cp1x).toBe(100) // 0.5 * 200
      expect(segments[1]!.cp1y).toBe(0) // 0 * 200
      expect(segments[1]!.cp2x).toBe(100) // 0.5 * 200
      expect(segments[1]!.cp2y).toBe(200) // 1 * 200
      expect(segments[1]!.x).toBe(200)
      expect(segments[1]!.y).toBe(200)
    }
  })

  it('handles empty points array', () => {
    const segments = convertCurvePoints([], 100, 100, true)
    expect(segments).toHaveLength(0)
  })
})

describe('Sketch Import — Segment Offset', () => {
  it('offsets move and line segments', () => {
    const result = offsetSegments(
      [
        { type: 'move', x: 0, y: 0 },
        { type: 'line', x: 100, y: 100 },
        { type: 'close' },
      ],
      50,
      25,
    )
    expect(result[0]).toMatchObject({ type: 'move', x: 50, y: 25 })
    expect(result[1]).toMatchObject({ type: 'line', x: 150, y: 125 })
    expect(result[2]).toMatchObject({ type: 'close' })
  })

  it('offsets cubic segment control points', () => {
    const result = offsetSegments(
      [
        {
          type: 'cubic',
          x: 100,
          y: 100,
          cp1x: 30,
          cp1y: 0,
          cp2x: 70,
          cp2y: 100,
        },
      ],
      10,
      20,
    )
    expect(result[0]).toMatchObject({
      type: 'cubic',
      x: 110,
      y: 120,
      cp1x: 40,
      cp1y: 20,
      cp2x: 80,
      cp2y: 120,
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Figma Import Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Figma Import — Color Conversion', () => {
  it('converts Figma RGBA to hex', () => {
    expect(figmaColorToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(figmaColorToHex({ r: 0, g: 0.5, b: 1, a: 1 })).toBe('#0080ff')
    expect(figmaColorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000')
  })

  it('extracts alpha', () => {
    expect(figmaColorAlpha({ r: 0, g: 0, b: 0, a: 0.5 })).toBe(0.5)
    expect(figmaColorAlpha({ r: 0, g: 0, b: 0, a: 0 })).toBe(0)
  })
})

describe('Figma Import — Fill Conversion', () => {
  it('converts solid fill', () => {
    const fill = convertFigmaFill({
      type: 'SOLID',
      color: { r: 0, g: 0.5, b: 1, a: 0.8 },
      opacity: 1,
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('solid')
    expect(fill!.color).toBe('#0080ff')
    expect(fill!.opacity).toBeCloseTo(0.8)
  })

  it('returns null for invisible fills', () => {
    const fill = convertFigmaFill({
      type: 'SOLID',
      visible: false,
      color: { r: 1, g: 0, b: 0, a: 1 },
    })
    expect(fill).toBeNull()
  })

  it('converts linear gradient fill', () => {
    const fill = convertFigmaFill({
      type: 'GRADIENT_LINEAR',
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      gradientHandlePositions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('gradient')
    expect(fill!.gradient!.type).toBe('linear')
    expect(fill!.gradient!.stops).toHaveLength(2)
  })

  it('returns null for IMAGE fills', () => {
    const fill = convertFigmaFill({
      type: 'IMAGE',
      imageRef: 'some-ref',
    })
    expect(fill).toBeNull()
  })
})

describe('Figma Import — Effect Conversion', () => {
  it('converts drop shadow', () => {
    const effect = convertFigmaEffect({
      type: 'DROP_SHADOW',
      radius: 10,
      color: { r: 0, g: 0, b: 0, a: 0.5 },
      offset: { x: 4, y: 4 },
      spread: 2,
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('drop-shadow')
    expect(effect!.params).toMatchObject({
      kind: 'shadow',
      offsetX: 4,
      offsetY: 4,
      blurRadius: 10,
      spread: 2,
    })
  })

  it('converts inner shadow', () => {
    const effect = convertFigmaEffect({
      type: 'INNER_SHADOW',
      radius: 5,
      color: { r: 0, g: 0, b: 0, a: 0.3 },
      offset: { x: 0, y: 2 },
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('inner-shadow')
  })

  it('converts layer blur', () => {
    const effect = convertFigmaEffect({
      type: 'LAYER_BLUR',
      radius: 8,
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('blur')
    expect(effect!.params).toMatchObject({ kind: 'blur', radius: 8 })
  })

  it('converts background blur', () => {
    const effect = convertFigmaEffect({
      type: 'BACKGROUND_BLUR',
      radius: 20,
    })
    expect(effect).not.toBeNull()
    expect(effect!.type).toBe('background-blur')
    expect(effect!.params).toMatchObject({ kind: 'background-blur', radius: 20 })
  })

  it('returns null for invisible effects', () => {
    expect(
      convertFigmaEffect({
        type: 'DROP_SHADOW',
        visible: false,
        radius: 10,
        color: { r: 0, g: 0, b: 0, a: 1 },
      }),
    ).toBeNull()
  })
})

describe('Figma Import — Transform', () => {
  it('extracts translation from relativeTransform', () => {
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      relativeTransform: [
        [1, 0, 150],
        [0, 1, 200],
      ],
      size: { x: 100, y: 50 },
    })
    expect(t.x).toBe(150)
    expect(t.y).toBe(200)
    expect(t.rotation).toBe(0)
  })

  it('falls back to absoluteBoundingBox', () => {
    const t = buildFigmaTransform({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      absoluteBoundingBox: { x: 50, y: 75, width: 100, height: 100 },
    })
    expect(t.x).toBe(50)
    expect(t.y).toBe(75)
  })
})

describe('Figma Import — Auto Layout', () => {
  it('converts horizontal auto-layout', () => {
    const al = convertAutoLayout({
      id: 'test',
      name: 'Frame',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      itemSpacing: 12,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
    })
    expect(al).toBeDefined()
    expect(al!.direction).toBe('horizontal')
    expect(al!.gap).toBe(12)
    expect(al!.paddingTop).toBe(16)
    expect(al!.paddingRight).toBe(16)
    expect(al!.paddingBottom).toBe(16)
    expect(al!.paddingLeft).toBe(16)
    expect(al!.justifyContent).toBe('center')
    expect(al!.alignItems).toBe('center')
  })

  it('converts vertical auto-layout with space-between', () => {
    const al = convertAutoLayout({
      id: 'test',
      name: 'Frame',
      type: 'FRAME',
      layoutMode: 'VERTICAL',
      itemSpacing: 8,
      primaryAxisAlignItems: 'SPACE_BETWEEN',
      counterAxisAlignItems: 'MAX',
    })
    expect(al!.direction).toBe('vertical')
    expect(al!.justifyContent).toBe('space-between')
    expect(al!.alignItems).toBe('end')
  })

  it('returns undefined for non-auto-layout nodes', () => {
    const al = convertAutoLayout({
      id: 'test',
      name: 'Group',
      type: 'GROUP',
    })
    expect(al).toBeUndefined()
  })

  it('handles wrap mode', () => {
    const al = convertAutoLayout({
      id: 'test',
      name: 'Frame',
      type: 'FRAME',
      layoutMode: 'HORIZONTAL',
      layoutWrap: 'WRAP',
    })
    expect(al!.wrap).toBe(true)
  })
})

describe('Figma Import — Constraints', () => {
  it('converts constraints', () => {
    const c = convertConstraints({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      constraints: { horizontal: 'LEFT_RIGHT', vertical: 'CENTER' },
    })
    expect(c).toEqual({
      horizontal: 'left-right',
      vertical: 'center',
    })
  })

  it('returns undefined when no constraints', () => {
    expect(convertConstraints({ id: 'test', name: 'Test', type: 'RECTANGLE' })).toBeUndefined()
  })
})

describe('Figma Import — Layout Sizing', () => {
  it('converts layout sizing', () => {
    const ls = convertLayoutSizing({
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'HUG',
    })
    expect(ls).toEqual({
      horizontal: 'fill',
      vertical: 'hug',
    })
  })

  it('returns undefined when no sizing', () => {
    expect(convertLayoutSizing({ id: 'test', name: 'Test', type: 'RECTANGLE' })).toBeUndefined()
  })
})

describe('Figma Import — SVG Path D Parser', () => {
  it('parses M L Z commands', () => {
    const segs = parseSVGPathD('M 0 0 L 100 0 L 100 100 L 0 100 Z')
    expect(segs).toHaveLength(5)
    expect(segs[0]).toMatchObject({ type: 'move', x: 0, y: 0 })
    expect(segs[1]).toMatchObject({ type: 'line', x: 100, y: 0 })
    expect(segs[2]).toMatchObject({ type: 'line', x: 100, y: 100 })
    expect(segs[3]).toMatchObject({ type: 'line', x: 0, y: 100 })
    expect(segs[4]).toMatchObject({ type: 'close' })
  })

  it('parses relative m l z commands', () => {
    const segs = parseSVGPathD('m 10 10 l 50 0 l 0 50 z')
    expect(segs).toHaveLength(4)
    expect(segs[0]).toMatchObject({ type: 'move', x: 10, y: 10 })
    expect(segs[1]).toMatchObject({ type: 'line', x: 60, y: 10 })
    expect(segs[2]).toMatchObject({ type: 'line', x: 60, y: 60 })
    expect(segs[3]).toMatchObject({ type: 'close' })
  })

  it('parses C (cubic bezier) commands', () => {
    const segs = parseSVGPathD('M 0 0 C 10 20 30 40 50 60')
    expect(segs).toHaveLength(2)
    expect(segs[1]).toMatchObject({
      type: 'cubic',
      cp1x: 10,
      cp1y: 20,
      cp2x: 30,
      cp2y: 40,
      x: 50,
      y: 60,
    })
  })

  it('parses Q (quadratic) commands', () => {
    const segs = parseSVGPathD('M 0 0 Q 50 0 100 100')
    expect(segs).toHaveLength(2)
    expect(segs[1]).toMatchObject({
      type: 'quadratic',
      cpx: 50,
      cpy: 0,
      x: 100,
      y: 100,
    })
  })

  it('parses H and V commands', () => {
    const segs = parseSVGPathD('M 0 0 H 100 V 50')
    expect(segs).toHaveLength(3)
    expect(segs[1]).toMatchObject({ type: 'line', x: 100, y: 0 })
    expect(segs[2]).toMatchObject({ type: 'line', x: 100, y: 50 })
  })

  it('handles empty string', () => {
    expect(parseSVGPathD('')).toHaveLength(0)
  })
})

describe('Figma Import — Full Clipboard Import', () => {
  it('imports a simple rectangle node', () => {
    const json = JSON.stringify({
      id: 'rect-1',
      name: 'My Rectangle',
      type: 'RECTANGLE',
      visible: true,
      opacity: 0.9,
      blendMode: 'NORMAL',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 100 },
      size: { x: 200, y: 100 },
      fills: [{ type: 'SOLID', color: { r: 0, g: 0.5, b: 1, a: 1 } }],
      strokes: [],
      effects: [],
      cornerRadius: 8,
    })

    const doc = importFigmaClipboard(json)
    expect(doc.artboards).toHaveLength(1)
    expect(doc.artboards[0]!.layers).toHaveLength(1)

    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    expect(layer.name).toBe('My Rectangle')
    if (layer.type === 'vector') {
      expect(layer.fill).not.toBeNull()
      expect(layer.fill!.color).toBe('#0080ff')
      expect(layer.shapeParams?.shapeType).toBe('rectangle')
      expect(layer.shapeParams?.cornerRadius).toBe(8)
    }
  })

  it('imports a text node', () => {
    const json = JSON.stringify({
      id: 'text-1',
      name: 'Heading',
      type: 'TEXT',
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 300, height: 40 },
      size: { x: 300, y: 40 },
      characters: 'Hello World',
      style: {
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: 700,
        textAlignHorizontal: 'CENTER',
        letterSpacing: 0.5,
        lineHeightPx: 32,
        italic: false,
      },
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 } }],
    })

    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('text')
    if (layer.type === 'text') {
      expect(layer.text).toBe('Hello World')
      expect(layer.fontFamily).toBe('Inter')
      expect(layer.fontSize).toBe(24)
      expect(layer.fontWeight).toBe('bold')
      expect(layer.textAlign).toBe('center')
      expect(layer.letterSpacing).toBe(0.5)
    }
  })

  it('imports a frame with auto-layout and children', () => {
    const json = JSON.stringify({
      id: 'frame-1',
      name: 'Auto Layout Frame',
      type: 'FRAME',
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 200 },
      size: { x: 400, y: 200 },
      layoutMode: 'HORIZONTAL',
      itemSpacing: 16,
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 10,
      paddingBottom: 10,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
      children: [
        {
          id: 'child-1',
          name: 'Child Rect',
          type: 'RECTANGLE',
          visible: true,
          absoluteBoundingBox: { x: 20, y: 10, width: 100, height: 50 },
          size: { x: 100, y: 50 },
          fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
        },
      ],
    })

    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('group')
    if (layer.type === 'group') {
      expect(layer.autoLayout).toBeDefined()
      expect(layer.autoLayout!.direction).toBe('horizontal')
      expect(layer.autoLayout!.gap).toBe(16)
      expect(layer.children).toHaveLength(1)
      expect(layer.children[0]!.name).toBe('Child Rect')
    }
  })

  it('imports an array of nodes', () => {
    const json = JSON.stringify([
      { id: '1', name: 'Rect 1', type: 'RECTANGLE', visible: true, size: { x: 100, y: 100 } },
      { id: '2', name: 'Rect 2', type: 'RECTANGLE', visible: true, size: { x: 200, y: 200 } },
    ])

    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.layers).toHaveLength(2)
  })

  it('imports a nodes object wrapper', () => {
    const json = JSON.stringify({
      nodes: [
        { id: '1', name: 'Test', type: 'ELLIPSE', visible: true, size: { x: 50, y: 50 } },
      ],
    })

    const doc = importFigmaClipboard(json)
    expect(doc.artboards[0]!.layers).toHaveLength(1)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('vector')
  })
})

describe('Figma Import — tryImportFigmaClipboard', () => {
  it('returns null for non-JSON text', () => {
    expect(tryImportFigmaClipboard('Hello World')).toBeNull()
    expect(tryImportFigmaClipboard('')).toBeNull()
  })

  it('returns null for JSON without type/name', () => {
    expect(tryImportFigmaClipboard('{"foo": "bar"}')).toBeNull()
  })

  it('parses valid Figma JSON', () => {
    const json = JSON.stringify({
      id: '1',
      name: 'Test',
      type: 'RECTANGLE',
      size: { x: 100, y: 100 },
    })
    const doc = tryImportFigmaClipboard(json)
    expect(doc).not.toBeNull()
    expect(doc!.artboards).toHaveLength(1)
  })
})

describe('Figma Import — Instance Conversion', () => {
  it('converts INSTANCE node to symbol-instance layer', () => {
    const json = JSON.stringify({
      id: 'inst-1',
      name: 'Button Instance',
      type: 'INSTANCE',
      visible: true,
      componentId: 'comp-abc',
      size: { x: 120, y: 40 },
    })

    const doc = importFigmaClipboard(json)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('symbol-instance')
    if (layer.type === 'symbol-instance') {
      expect(layer.symbolId).toBe('comp-abc')
    }
  })
})

describe('Figma Import — Stroke Conversion', () => {
  it('converts stroke with inside position', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
      strokeWeight: 3,
      strokeAlign: 'INSIDE',
      strokeCap: 'ROUND',
      strokeJoin: 'BEVEL',
      strokeDashes: [5, 3],
    }
    const stroke = convertFigmaStroke(node)
    expect(stroke).not.toBeNull()
    expect(stroke!.width).toBe(3)
    expect(stroke!.color).toBe('#ff0000')
    expect(stroke!.position).toBe('inside')
    expect(stroke!.linecap).toBe('round')
    expect(stroke!.linejoin).toBe('bevel')
    expect(stroke!.dasharray).toEqual([5, 3])
  })

  it('returns null when no strokes', () => {
    const node: FigmaNode = { id: 'test', name: 'Test', type: 'RECTANGLE' }
    expect(convertFigmaStroke(node)).toBeNull()
  })

  it('skips invisible strokes', () => {
    const node: FigmaNode = {
      id: 'test',
      name: 'Test',
      type: 'RECTANGLE',
      strokes: [{ type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } }],
      strokeWeight: 2,
    }
    expect(convertFigmaStroke(node)).toBeNull()
  })
})
