import { describe, it, expect } from 'vitest'
import { layerMatrix2x2, invertLayerPoint, rotateTransformAboutLocalPoint } from '@/math/layer-transform'
import { transformLocalBBox } from '@/math/bbox'
import type { Transform } from '@/types'

const base: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }

describe('layerMatrix2x2', () => {
  it('is identity for the default transform', () => {
    const m = layerMatrix2x2(base)
    expect(m.a).toBeCloseTo(1)
    expect(m.b).toBeCloseTo(0)
    expect(m.c).toBeCloseTo(0)
    expect(m.d).toBeCloseTo(1)
  })

  it('is a plain scale matrix when only scaled', () => {
    const m = layerMatrix2x2({ ...base, scaleX: 2, scaleY: 3 })
    expect(m.a).toBeCloseTo(2)
    expect(m.b).toBeCloseTo(0)
    expect(m.c).toBeCloseTo(0)
    expect(m.d).toBeCloseTo(3)
  })

  it('keeps a non-uniformly scaled rectangle rigid under rotation (no shear)', () => {
    // Rotation applies after scale, so the columns of the matrix (the images
    // of the local x/y axes) must stay perpendicular.
    const m = layerMatrix2x2({ ...base, scaleX: 3, scaleY: 1, rotation: 30 })
    const dot = m.a * m.c + m.b * m.d
    expect(dot).toBeCloseTo(0, 10)
    // Axis lengths must equal the scale factors — pure rotation of scaled axes.
    expect(Math.hypot(m.a, m.b)).toBeCloseTo(3)
    expect(Math.hypot(m.c, m.d)).toBeCloseTo(1)
  })

  it('rotates points counter-clockwise-positive in canvas convention', () => {
    const m = layerMatrix2x2({ ...base, rotation: 90 })
    // (1, 0) → (0, 1) under a 90° canvas rotation (y-down screen space)
    expect(m.a).toBeCloseTo(0)
    expect(m.b).toBeCloseTo(1)
  })
})

describe('invertLayerPoint', () => {
  it('round-trips a point through a rotated, scaled, skewed transform', () => {
    const t: Transform = { x: 40, y: -10, scaleX: 2, scaleY: 0.5, rotation: 37, skewX: 15 }
    const m = layerMatrix2x2(t)
    const local = { x: 12, y: 34 }
    const world = { x: m.a * local.x + m.c * local.y, y: m.b * local.x + m.d * local.y }
    const back = invertLayerPoint(t, world.x, world.y)
    expect(back.x).toBeCloseTo(local.x)
    expect(back.y).toBeCloseTo(local.y)
  })

  it('returns the input unchanged for a degenerate (zero-scale) transform', () => {
    const p = invertLayerPoint({ ...base, scaleX: 0, scaleY: 0 }, 5, 7)
    expect(p.x).toBe(5)
    expect(p.y).toBe(7)
  })
})

describe('rotateTransformAboutLocalPoint', () => {
  it('keeps the pivot world position fixed while rotating', () => {
    const t: Transform = { x: 100, y: 50, scaleX: 2, scaleY: 1, rotation: 0 }
    const pivot = { x: 50, y: 25 } // local center of a 100x50 shape
    const rotated = rotateTransformAboutLocalPoint(t, pivot.x, pivot.y, 45)

    const m0 = layerMatrix2x2(t)
    const m1 = layerMatrix2x2(rotated)
    const w0 = { x: t.x + m0.a * pivot.x + m0.c * pivot.y, y: t.y + m0.b * pivot.x + m0.d * pivot.y }
    const w1 = {
      x: rotated.x + m1.a * pivot.x + m1.c * pivot.y,
      y: rotated.y + m1.b * pivot.x + m1.d * pivot.y,
    }
    expect(rotated.rotation).toBe(45)
    expect(w1.x).toBeCloseTo(w0.x)
    expect(w1.y).toBeCloseTo(w0.y)
  })

  it('is a no-op on x/y when the rotation does not change', () => {
    const t: Transform = { x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 30 }
    const same = rotateTransformAboutLocalPoint(t, 50, 50, 30)
    expect(same.x).toBeCloseTo(10)
    expect(same.y).toBeCloseTo(20)
  })

  it('composes: rotating in two steps equals rotating once', () => {
    const t: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 2, rotation: 0 }
    const oneStep = rotateTransformAboutLocalPoint(t, 40, 30, 90)
    const twoStep = rotateTransformAboutLocalPoint(rotateTransformAboutLocalPoint(t, 40, 30, 45), 40, 30, 90)
    expect(twoStep.x).toBeCloseTo(oneStep.x)
    expect(twoStep.y).toBeCloseTo(oneStep.y)
    expect(twoStep.rotation).toBe(oneStep.rotation)
  })
})

describe('transformLocalBBox with rotation', () => {
  it('bounds a rotated rectangle by its rotated corners', () => {
    // 100x50 rect rotated 90° about the origin: corners land in x ∈ [-50, 0], y ∈ [0, 100]
    const bbox = transformLocalBBox({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, { ...base, rotation: 90 }, 0, 0)
    expect(bbox.minX).toBeCloseTo(-50)
    expect(bbox.maxX).toBeCloseTo(0)
    expect(bbox.minY).toBeCloseTo(0)
    expect(bbox.maxY).toBeCloseTo(100)
  })

  it('matches the old behavior for unrotated layers', () => {
    const bbox = transformLocalBBox(
      { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      { ...base, x: 10, y: 20, scaleX: 2 },
      5,
      5,
    )
    expect(bbox.minX).toBeCloseTo(15)
    expect(bbox.minY).toBeCloseTo(25)
    expect(bbox.maxX).toBeCloseTo(215)
    expect(bbox.maxY).toBeCloseTo(75)
  })

  it('grows with the diagonal for a 45° rotation', () => {
    const bbox = transformLocalBBox({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, { ...base, rotation: 45 }, 0, 0)
    const size = 100 * Math.SQRT2
    expect(bbox.maxX - bbox.minX).toBeCloseTo(size)
    expect(bbox.maxY - bbox.minY).toBeCloseTo(size)
  })
})
