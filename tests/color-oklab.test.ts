import { describe, test, expect } from 'bun:test'
import {
  rgbaToOklab,
  oklabToRgba,
  hexToOklab,
  oklabToHex,
  rgbaToHsva,
  hsvaToRgba,
  hexToHsva,
  hsvaToHex,
} from '@/math/color'
import type { RGBA, OkLAB } from '@/math/color'

describe('OkLAB conversions', () => {
  test('white round-trips', () => {
    const white: RGBA = { r: 255, g: 255, b: 255, a: 1 }
    const lab = rgbaToOklab(white)
    expect(lab.L).toBeCloseTo(1, 2)
    expect(lab.a).toBeCloseTo(0, 2)
    expect(lab.b).toBeCloseTo(0, 2)
    const back = oklabToRgba(lab)
    expect(back.r).toBe(255)
    expect(back.g).toBe(255)
    expect(back.b).toBe(255)
  })

  test('black round-trips', () => {
    const black: RGBA = { r: 0, g: 0, b: 0, a: 1 }
    const lab = rgbaToOklab(black)
    expect(lab.L).toBeCloseTo(0, 2)
    expect(lab.a).toBeCloseTo(0, 2)
    expect(lab.b).toBeCloseTo(0, 2)
    const back = oklabToRgba(lab)
    expect(back.r).toBe(0)
    expect(back.g).toBe(0)
    expect(back.b).toBe(0)
  })

  test('mid-gray round-trips', () => {
    const gray: RGBA = { r: 128, g: 128, b: 128, a: 1 }
    const lab = rgbaToOklab(gray)
    // Mid-gray should have near-zero a,b
    expect(Math.abs(lab.a)).toBeLessThan(0.01)
    expect(Math.abs(lab.b)).toBeLessThan(0.01)
    const back = oklabToRgba(lab)
    expect(Math.abs(back.r - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.g - 128)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.b - 128)).toBeLessThanOrEqual(1)
  })

  test('red round-trips', () => {
    const red: RGBA = { r: 255, g: 0, b: 0, a: 1 }
    const lab = rgbaToOklab(red)
    // Red should have positive L, positive a, positive b
    expect(lab.L).toBeGreaterThan(0.5)
    expect(lab.a).toBeGreaterThan(0.1)
    expect(lab.b).toBeGreaterThan(0.05)
    const back = oklabToRgba(lab)
    expect(Math.abs(back.r - 255)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.g - 0)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.b - 0)).toBeLessThanOrEqual(1)
  })

  test('arbitrary color round-trips within 1 unit', () => {
    const colors: RGBA[] = [
      { r: 100, g: 200, b: 50, a: 1 },
      { r: 50, g: 50, b: 200, a: 1 },
      { r: 200, g: 100, b: 150, a: 1 },
      { r: 10, g: 10, b: 10, a: 1 },
      { r: 245, g: 245, b: 245, a: 1 },
    ]
    for (const c of colors) {
      const lab = rgbaToOklab(c)
      const back = oklabToRgba(lab)
      expect(Math.abs(back.r - c.r)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.g - c.g)).toBeLessThanOrEqual(1)
      expect(Math.abs(back.b - c.b)).toBeLessThanOrEqual(1)
    }
  })

  test('gamut clamping keeps values in 0-255', () => {
    // Out-of-gamut OkLAB value
    const outOfGamut: OkLAB = { L: 0.9, a: 0.4, b: 0.4 }
    const rgba = oklabToRgba(outOfGamut)
    expect(rgba.r).toBeGreaterThanOrEqual(0)
    expect(rgba.r).toBeLessThanOrEqual(255)
    expect(rgba.g).toBeGreaterThanOrEqual(0)
    expect(rgba.g).toBeLessThanOrEqual(255)
    expect(rgba.b).toBeGreaterThanOrEqual(0)
    expect(rgba.b).toBeLessThanOrEqual(255)
  })

  test('hex convenience wrappers', () => {
    const lab = hexToOklab('#ff8000')
    expect(lab.L).toBeGreaterThan(0)
    const hex = oklabToHex(lab)
    expect(hex).toBe('#ff8000')
  })
})

describe('HSVA conversions', () => {
  test('red round-trips', () => {
    const red: RGBA = { r: 255, g: 0, b: 0, a: 1 }
    const hsva = rgbaToHsva(red)
    expect(hsva.h).toBeCloseTo(0, 0)
    expect(hsva.s).toBeCloseTo(100, 0)
    expect(hsva.v).toBeCloseTo(100, 0)
    const back = hsvaToRgba(hsva)
    expect(back.r).toBe(255)
    expect(back.g).toBe(0)
    expect(back.b).toBe(0)
  })

  test('white has v=100 s=0', () => {
    const hsva = rgbaToHsva({ r: 255, g: 255, b: 255, a: 1 })
    expect(hsva.s).toBeCloseTo(0, 0)
    expect(hsva.v).toBeCloseTo(100, 0)
  })

  test('black has v=0', () => {
    const hsva = rgbaToHsva({ r: 0, g: 0, b: 0, a: 1 })
    expect(hsva.v).toBeCloseTo(0, 0)
  })

  test('hex convenience wrappers', () => {
    const hsva = hexToHsva('#00ff00')
    expect(hsva.h).toBeCloseTo(120, 0)
    expect(hsva.s).toBeCloseTo(100, 0)
    expect(hsva.v).toBeCloseTo(100, 0)
    expect(hsvaToHex(hsva)).toBe('#00ff00')
  })

  test('preserves alpha', () => {
    const hsva = rgbaToHsva({ r: 128, g: 64, b: 32, a: 0.5 })
    expect(hsva.a).toBe(0.5)
    const back = hsvaToRgba(hsva)
    expect(back.a).toBe(0.5)
  })
})
