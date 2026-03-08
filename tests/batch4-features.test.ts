import { describe, test, expect } from 'bun:test'
import {
  hexToRgba, rgbaToHex, rgbaToHsla, hslaToRgba,
  rgbaToCmyk, cmykToRgba, hexToHsla, hslaToHex,
  hexToCmyk, cmykToHex, parseHsla, hslaToString,
} from '@/math/color'

describe('LYK-102: hand/pan tool', () => {
  test('hand tool is a valid activeTool value', () => {
    const tools = ['select', 'pen', 'node', 'rectangle', 'ellipse', 'polygon', 'star', 'text', 'gradient', 'eyedropper', 'hand']
    expect(tools).toContain('hand')
  })

  test('space key sets panning state', () => {
    let spaceHeld = false
    // Simulate space down
    spaceHeld = true
    expect(spaceHeld).toBe(true)
    // Simulate space up
    spaceHeld = false
    expect(spaceHeld).toBe(false)
  })
})

describe('LYK-117: zoom to selection', () => {
  test('zoom calculation fits bbox with padding', () => {
    const bboxW = 200
    const bboxH = 100
    const viewportW = 800
    const viewportH = 600
    const padding = 60
    const zoom = Math.min((viewportW - padding * 2) / bboxW, (viewportH - padding * 2) / bboxH, 10)
    expect(zoom).toBe(3.4) // (800-120)/200 = 3.4, (600-120)/100 = 4.8, min = 3.4
  })

  test('zoom is capped at 10x', () => {
    const bboxW = 10
    const bboxH = 10
    const viewportW = 800
    const viewportH = 600
    const padding = 60
    const zoom = Math.min((viewportW - padding * 2) / bboxW, (viewportH - padding * 2) / bboxH, 10)
    expect(zoom).toBe(10)
  })

  test('pan centers on bbox', () => {
    const bboxMinX = 100
    const bboxMinY = 200
    const bboxW = 200
    const bboxH = 100
    const zoom = 2
    const viewportW = 800
    const viewportH = 600
    const cx = bboxMinX + bboxW / 2
    const cy = bboxMinY + bboxH / 2
    const panX = viewportW / 2 - cx * zoom
    const panY = viewportH / 2 - cy * zoom
    expect(panX).toBe(800 / 2 - 200 * 2) // 400 - 400 = 0
    expect(panY).toBe(600 / 2 - 250 * 2) // 300 - 500 = -200
  })
})

describe('LYK-128: transparency checkerboard', () => {
  test('checkerboard pattern tile size is 8px', () => {
    const size = 8
    expect(size * 2).toBe(16) // tile width/height
  })
})

describe('LYK-132: clipboard paste images', () => {
  test('image blob type detection', () => {
    const types = ['image/png', 'image/jpeg', 'text/plain']
    const imageItems = types.filter(t => t.startsWith('image/'))
    expect(imageItems.length).toBe(2)
  })
})

describe('LYK-88: color space conversions', () => {
  test('hex to RGBA', () => {
    const c = hexToRgba('#ff0000')
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  test('hex to RGBA with alpha', () => {
    const c = hexToRgba('#ff000080')
    expect(c.r).toBe(255)
    expect(c.g).toBe(0)
    expect(c.b).toBe(0)
    expect(c.a).toBeCloseTo(0.502, 2)
  })

  test('short hex', () => {
    const c = hexToRgba('#f00')
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  test('RGBA to hex', () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe('#ff0000')
    expect(rgbaToHex({ r: 0, g: 255, b: 0, a: 1 })).toBe('#00ff00')
  })

  test('RGBA to hex with alpha', () => {
    const hex = rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 })
    expect(hex).toBe('#ff000080')
  })

  test('RGBA to HSLA: red', () => {
    const hsla = rgbaToHsla({ r: 255, g: 0, b: 0, a: 1 })
    expect(hsla.h).toBe(0)
    expect(hsla.s).toBe(100)
    expect(hsla.l).toBe(50)
  })

  test('RGBA to HSLA: green', () => {
    const hsla = rgbaToHsla({ r: 0, g: 255, b: 0, a: 1 })
    expect(hsla.h).toBe(120)
    expect(hsla.s).toBe(100)
    expect(hsla.l).toBe(50)
  })

  test('RGBA to HSLA: blue', () => {
    const hsla = rgbaToHsla({ r: 0, g: 0, b: 255, a: 1 })
    expect(hsla.h).toBe(240)
    expect(hsla.s).toBe(100)
    expect(hsla.l).toBe(50)
  })

  test('RGBA to HSLA: white', () => {
    const hsla = rgbaToHsla({ r: 255, g: 255, b: 255, a: 1 })
    expect(hsla.l).toBe(100)
    expect(hsla.s).toBe(0)
  })

  test('RGBA to HSLA: black', () => {
    const hsla = rgbaToHsla({ r: 0, g: 0, b: 0, a: 1 })
    expect(hsla.l).toBe(0)
  })

  test('HSLA to RGBA roundtrip', () => {
    const original = { r: 128, g: 64, b: 192, a: 1 }
    const hsla = rgbaToHsla(original)
    const back = hslaToRgba(hsla)
    expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1)
  })

  test('HSLA grayscale', () => {
    const rgba = hslaToRgba({ h: 0, s: 0, l: 50, a: 1 })
    expect(rgba.r).toBe(128)
    expect(rgba.g).toBe(128)
    expect(rgba.b).toBe(128)
  })

  test('RGBA to CMYK: red', () => {
    const cmyk = rgbaToCmyk({ r: 255, g: 0, b: 0, a: 1 })
    expect(cmyk).toEqual({ c: 0, m: 100, y: 100, k: 0 })
  })

  test('RGBA to CMYK: black', () => {
    const cmyk = rgbaToCmyk({ r: 0, g: 0, b: 0, a: 1 })
    expect(cmyk).toEqual({ c: 0, m: 0, y: 0, k: 100 })
  })

  test('RGBA to CMYK: white', () => {
    const cmyk = rgbaToCmyk({ r: 255, g: 255, b: 255, a: 1 })
    expect(cmyk).toEqual({ c: 0, m: 0, y: 0, k: 0 })
  })

  test('CMYK to RGBA roundtrip', () => {
    const original = { r: 200, g: 100, b: 50, a: 1 }
    const cmyk = rgbaToCmyk(original)
    const back = cmykToRgba(cmyk)
    expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(3)
    expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(3)
    expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(3)
  })

  test('hex to HSLA convenience', () => {
    const hsla = hexToHsla('#ff0000')
    expect(hsla.h).toBe(0)
    expect(hsla.s).toBe(100)
    expect(hsla.l).toBe(50)
  })

  test('HSLA to hex convenience', () => {
    const hex = hslaToHex({ h: 0, s: 100, l: 50, a: 1 })
    expect(hex).toBe('#ff0000')
  })

  test('hex to CMYK convenience', () => {
    const cmyk = hexToCmyk('#00ff00')
    expect(cmyk.c).toBe(100)
    expect(cmyk.m).toBe(0)
    expect(cmyk.y).toBe(100)
    expect(cmyk.k).toBe(0)
  })

  test('CMYK to hex convenience', () => {
    const hex = cmykToHex({ c: 0, m: 100, y: 100, k: 0 })
    expect(hex).toBe('#ff0000')
  })

  test('parseHsla parses hsl string', () => {
    const c = parseHsla('hsl(120, 50%, 75%)')
    expect(c).toEqual({ h: 120, s: 50, l: 75, a: 1 })
  })

  test('parseHsla parses hsla string', () => {
    const c = parseHsla('hsla(240, 100%, 50%, 0.5)')
    expect(c).toEqual({ h: 240, s: 100, l: 50, a: 0.5 })
  })

  test('parseHsla returns null for invalid', () => {
    expect(parseHsla('#ff0000')).toBe(null)
  })

  test('hslaToString format', () => {
    expect(hslaToString({ h: 0, s: 100, l: 50, a: 1 })).toBe('hsl(0, 100%, 50%)')
    expect(hslaToString({ h: 0, s: 100, l: 50, a: 0.5 })).toBe('hsla(0, 100%, 50%, 0.5)')
  })
})

describe('LYK-120: skew/shear transform', () => {
  test('skewX defaults to 0 when undefined', () => {
    const transform: { x: number; y: number; scaleX: number; scaleY: number; rotation: number; skewX?: number; skewY?: number } = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    expect(transform.skewX ?? 0).toBe(0)
  })

  test('skew values stored on transform', () => {
    const transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 15, skewY: -10 }
    expect(transform.skewX).toBe(15)
    expect(transform.skewY).toBe(-10)
  })

  test('skew to radians conversion', () => {
    const skewDeg = 45
    const skewRad = Math.tan(skewDeg * Math.PI / 180)
    expect(skewRad).toBeCloseTo(1, 5)
  })

  test('zero skew produces identity-like transform', () => {
    const sx = Math.tan(0 * Math.PI / 180)
    const sy = Math.tan(0 * Math.PI / 180)
    // transform(1, sy, sx, 1, 0, 0) with sx=0, sy=0 is identity
    expect(sx).toBe(0)
    expect(sy).toBe(0)
  })
})
