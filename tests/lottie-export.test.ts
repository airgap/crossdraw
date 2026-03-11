import { describe, test, expect } from 'bun:test'
import { exportLottie } from '@/io/lottie-export'
import type { DesignDocument, VectorLayer, GroupLayer, Keyframe } from '@/types'

function mkTransform(overrides?: Partial<VectorLayer['transform']>) {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides }
}

function mkKeyframe(time: number, easing: Keyframe['easing'], props: Partial<Keyframe['properties']> = {}): Keyframe {
  return {
    id: `kf-${time}`,
    time,
    easing,
    properties: props,
  }
}

function createDoc(layers: any[]): DesignDocument {
  return {
    id: 'doc-1',
    metadata: { title: 'Test', author: '', created: '', modified: '', colorspace: 'srgb', width: 800, height: 600 },
    artboards: [
      {
        id: 'ab-1',
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        layers,
      },
    ],
    assets: { gradients: [], patterns: [], colors: [] },
  }
}

function mkAnimatedLayer(keyframes: Keyframe[], duration: number = 2000): VectorLayer {
  return {
    id: 'v1',
    name: 'Animated',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: mkTransform({ x: 50, y: 50 }),
    effects: [],
    paths: [],
    fill: null,
    stroke: null,
    animation: {
      keyframes,
      duration,
      loop: false,
    },
  }
}

// ── Tests ──

describe('lottie-export: exportLottie', () => {
  test('throws for invalid artboard index', () => {
    const doc = createDoc([])
    expect(() => exportLottie(doc, 5)).toThrow('Artboard index 5 not found')
  })

  test('exports with no animated layers (default 3s duration)', () => {
    const layer: VectorLayer = {
      id: 'v1',
      name: 'Static',
      type: 'vector',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    expect(lottie.v).toBe('5.7.0')
    expect(lottie.fr).toBe(30)
    expect(lottie.w).toBe(800)
    expect(lottie.h).toBe(600)
    expect(lottie.layers).toHaveLength(0) // No animated layers
  })

  test('exports layer with single keyframe (no animation)', () => {
    const kf = mkKeyframe(0, 'linear', { x: 100, y: 200 })
    const layer = mkAnimatedLayer([kf])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    expect(lottie.layers).toHaveLength(1)
    const ll = lottie.layers[0]
    // Single keyframe = not animated
    expect(ll.ks.p.a).toBe(0) // not animated
    expect(ll.ks.p.k).toEqual([100, 200, 0])
  })

  test('exports layer with multiple keyframes (animated)', () => {
    const kf1 = mkKeyframe(0, 'linear', { x: 0, y: 0 })
    const kf2 = mkKeyframe(1000, 'ease-in', { x: 100, y: 200 })
    const layer = mkAnimatedLayer([kf1, kf2])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ks.p.a).toBe(1) // animated
    expect(ll.ks.p.k.length).toBe(2) // 2 keyframe entries
    // First keyframe
    expect(ll.ks.p.k[0].t).toBe(0)
    expect(ll.ks.p.k[0].s).toEqual([0, 0, 0])
    expect(ll.ks.p.k[0].e).toEqual([100, 200, 0])
    // Last keyframe (hold)
    expect(ll.ks.p.k[1].t).toBe(30) // 1000ms at 30fps = 30 frames
    expect(ll.ks.p.k[1].s).toEqual([100, 200, 0])
    expect(ll.ks.p.k[1].e).toBeUndefined() // no end on last keyframe
  })

  test('all easing types produce valid handles', () => {
    const easings: Keyframe['easing'][] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']
    for (const easing of easings) {
      const kf1 = mkKeyframe(0, easing, { x: 0 })
      const kf2 = mkKeyframe(500, easing, { x: 100 })
      const layer = mkAnimatedLayer([kf1, kf2], 1000)
      const doc = createDoc([layer])
      const lottie = exportLottie(doc) as any
      const ll = lottie.layers[0]
      expect(ll.ks.p.k[0].i).toBeDefined()
      expect(ll.ks.p.k[0].o).toBeDefined()
    }
  })

  test('scale keyframes use percentage (x100)', () => {
    const kf1 = mkKeyframe(0, 'linear', { scaleX: 1, scaleY: 1 })
    const kf2 = mkKeyframe(1000, 'linear', { scaleX: 2, scaleY: 0.5 })
    const layer = mkAnimatedLayer([kf1, kf2])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ks.s.a).toBe(1) // animated
    expect(ll.ks.s.k[0].s).toEqual([100, 100, 0])
    expect(ll.ks.s.k[0].e).toEqual([200, 50, 0])
  })

  test('rotation keyframes', () => {
    const kf1 = mkKeyframe(0, 'linear', { rotation: 0 })
    const kf2 = mkKeyframe(1000, 'linear', { rotation: 360 })
    const layer = mkAnimatedLayer([kf1, kf2])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ks.r.a).toBe(1)
    expect(ll.ks.r.k[0].s).toEqual([0])
    expect(ll.ks.r.k[0].e).toEqual([360])
  })

  test('opacity keyframes use percentage (x100)', () => {
    const kf1 = mkKeyframe(0, 'linear', { opacity: 1 })
    const kf2 = mkKeyframe(1000, 'linear', { opacity: 0.5 })
    const layer = mkAnimatedLayer([kf1, kf2])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ks.o.a).toBe(1)
    expect(ll.ks.o.k[0].s).toEqual([100])
    expect(ll.ks.o.k[0].e).toEqual([50])
  })

  test('layer with empty keyframes is not collected as animated', () => {
    const layer = mkAnimatedLayer([])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    // Empty keyframes array means not animated
    expect(lottie.layers).toHaveLength(0)
  })

  test('max duration determines total frames', () => {
    const kf1 = mkKeyframe(0, 'linear', { x: 0 })
    const kf2 = mkKeyframe(5000, 'linear', { x: 100 })
    const layer = mkAnimatedLayer([kf1, kf2], 5000)
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    expect(lottie.op).toBe(150) // 5s * 30fps
  })

  test('keyframes default to layer transform values', () => {
    const kf1 = mkKeyframe(0, 'linear', {}) // no properties set
    const layer = mkAnimatedLayer([kf1])
    layer.transform = mkTransform({ x: 42, y: 17, scaleX: 2, scaleY: 3, rotation: 90 })
    layer.opacity = 0.7
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ks.p.k).toEqual([42, 17, 0])
    expect(ll.ks.s.k).toEqual([200, 300, 0])
    expect(ll.ks.r.k).toBe(90)
    expect(ll.ks.o.k).toBe(70)
  })

  test('animated layers collected from nested groups', () => {
    const kf = mkKeyframe(0, 'linear', { x: 10 })
    const innerLayer = mkAnimatedLayer([kf, mkKeyframe(500, 'linear', { x: 100 })], 500)
    innerLayer.name = 'Inner'

    const group: GroupLayer = {
      id: 'g1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      children: [innerLayer],
    }

    const doc = createDoc([group])
    const lottie = exportLottie(doc) as any
    expect(lottie.layers).toHaveLength(1)
    expect(lottie.layers[0].nm).toBe('Inner')
  })

  test('multiple animated layers', () => {
    const layer1 = mkAnimatedLayer([mkKeyframe(0, 'linear', { x: 0 }), mkKeyframe(1000, 'linear', { x: 100 })], 1000)
    layer1.name = 'Layer 1'
    layer1.id = 'l1'

    const layer2 = mkAnimatedLayer(
      [mkKeyframe(0, 'ease-out', { y: 0 }), mkKeyframe(2000, 'ease-out', { y: 200 })],
      2000,
    )
    layer2.name = 'Layer 2'
    layer2.id = 'l2'

    const doc = createDoc([layer1, layer2])
    const lottie = exportLottie(doc) as any
    expect(lottie.layers).toHaveLength(2)
    expect(lottie.op).toBe(60) // max duration 2s * 30fps
  })

  test('lottie structure has correct top-level fields', () => {
    const layer = mkAnimatedLayer([mkKeyframe(0, 'linear', {})])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    expect(lottie.v).toBe('5.7.0')
    expect(lottie.fr).toBe(30)
    expect(lottie.ip).toBe(0)
    expect(lottie.nm).toBe('Artboard 1')
    expect(lottie.ddd).toBe(0)
    expect(lottie.assets).toEqual([])
  })

  test('layer structure has correct fields', () => {
    const layer = mkAnimatedLayer([mkKeyframe(0, 'linear', {}), mkKeyframe(1000, 'linear', { x: 50 })], 1000)
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const ll = lottie.layers[0]
    expect(ll.ddd).toBe(0)
    expect(ll.ind).toBe(0)
    expect(ll.ty).toBe(4) // shape layer
    expect(ll.nm).toBe('Animated')
    expect(ll.sr).toBe(1)
    expect(ll.ao).toBe(0)
    expect(ll.ip).toBe(0)
    expect(ll.op).toBe(30) // 1000ms at 30fps
    expect(ll.st).toBe(0)
    expect(ll.bm).toBe(0)
    expect(ll.ks.a).toEqual({ a: 0, k: [0, 0, 0] }) // anchor point
  })

  test('spring easing produces valid handles', () => {
    const kf1 = mkKeyframe(0, 'spring', { x: 0 })
    const kf2 = mkKeyframe(1000, 'spring', { x: 100 })
    const layer = mkAnimatedLayer([kf1, kf2])
    const doc = createDoc([layer])
    const lottie = exportLottie(doc) as any
    const kfData = lottie.layers[0].ks.p.k[0]
    // Spring easing should have y > 1 for overshoot
    expect(kfData.i.y[0]).toBeGreaterThan(1)
  })
})
