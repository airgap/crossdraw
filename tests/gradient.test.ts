import { describe, it, expect } from 'bun:test'
import { interpolateStops, parseHexColor, hexToRgba } from '@/render/gradient'

describe('parseHexColor', () => {
  it('parses 6-digit hex', () => {
    const { r, g, b } = parseHexColor('#ff8800')
    expect(r).toBe(255)
    expect(g).toBe(136)
    expect(b).toBe(0)
  })

  it('parses without hash', () => {
    const { r, g, b } = parseHexColor('00ff00')
    expect(r).toBe(0)
    expect(g).toBe(255)
    expect(b).toBe(0)
  })

  it('handles black', () => {
    const { r, g, b } = parseHexColor('#000000')
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })
})

describe('hexToRgba', () => {
  it('creates rgba string', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)')
  })

  it('full opacity', () => {
    expect(hexToRgba('#00ff00', 1)).toBe('rgba(0,255,0,1)')
  })
})

describe('interpolateStops', () => {
  const stops = [
    { offset: 0, r: 0, g: 0, b: 0, a: 255 },
    { offset: 1, r: 255, g: 255, b: 255, a: 255 },
  ]

  it('returns start color at t=0', () => {
    const [r, g, b] = interpolateStops(stops, 0)
    expect(r).toBe(0)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('returns end color at t=1', () => {
    const [r, g, b] = interpolateStops(stops, 1)
    expect(r).toBe(255)
    expect(g).toBe(255)
    expect(b).toBe(255)
  })

  it('interpolates midpoint', () => {
    const [r, g, b] = interpolateStops(stops, 0.5)
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(128)
  })

  it('handles three stops', () => {
    const threeStops = [
      { offset: 0, r: 255, g: 0, b: 0, a: 255 },
      { offset: 0.5, r: 0, g: 255, b: 0, a: 255 },
      { offset: 1, r: 0, g: 0, b: 255, a: 255 },
    ]
    const [r, g, b] = interpolateStops(threeStops, 0.25)
    // Midpoint between red and green
    expect(r).toBe(128)
    expect(g).toBe(128)
    expect(b).toBe(0)
  })

  it('clamps before first stop', () => {
    const [r] = interpolateStops(stops, -0.5)
    expect(r).toBe(0)
  })

  it('handles single stop', () => {
    const single = [{ offset: 0.5, r: 100, g: 100, b: 100, a: 255 }]
    const [r] = interpolateStops(single, 0)
    expect(r).toBe(100)
  })
})
