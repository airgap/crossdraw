import { describe, test, expect, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { importSVG, parseTransformAttr, parseSVGPathD } from '@/io/svg-import'
import type { VectorLayer, Layer } from '@/types'
import { readFileSync } from 'fs'

// Provide DOMParser for bun:test environment
beforeAll(() => {
  const dom = new JSDOM('')
  ;(globalThis as any).DOMParser = dom.window.DOMParser
})

const coswallSVG = readFileSync('/raid/lyku/apps/webui/src/assets/platforms/coswall.svg', 'utf-8')

// ── Expected data from the source SVG ────────────────────────────────

interface ExpectedCircle {
  cx: number
  cy: number
  r: number
  fill: string | null // null = gradient fill
  opacity: number
  strokeColor?: string
  strokeWidth?: number
}

const expectedCircles: ExpectedCircle[] = [
  // Black hole backgrounds (gradient fills)
  { cx: 12, cy: 12, r: 11, fill: null, opacity: 1 },
  { cx: 12, cy: 12, r: 11, fill: null, opacity: 1 },
  // Gravitational lensing ring
  { cx: 12, cy: 12, r: 6, fill: 'none', opacity: 0.6, strokeColor: '#6b7db3', strokeWidth: 0.5 },
  // Event horizon
  { cx: 12, cy: 12, r: 3, fill: '#000', opacity: 1 },
  // Stars twinkling around
  { cx: 4, cy: 5, r: 0.6, fill: '#fff', opacity: 0.9 },
  { cx: 19, cy: 4, r: 0.4, fill: '#9bb0ff', opacity: 0.8 },
  { cx: 20, cy: 18, r: 0.5, fill: '#fff', opacity: 0.7 },
  { cx: 5, cy: 19, r: 0.4, fill: '#b0c4ff', opacity: 0.8 },
  { cx: 8, cy: 3, r: 0.3, fill: '#fff', opacity: 0.6 },
  { cx: 16, cy: 20, r: 0.35, fill: '#9bb0ff', opacity: 0.7 },
  { cx: 3, cy: 12, r: 0.4, fill: '#fff', opacity: 0.5 },
  { cx: 21, cy: 10, r: 0.3, fill: '#b0c4ff', opacity: 0.6 },
  // Distant stars
  { cx: 6, cy: 8, r: 0.2, fill: '#fff', opacity: 0.4 },
  { cx: 17, cy: 7, r: 0.25, fill: '#fff', opacity: 0.5 },
  { cx: 18, cy: 14, r: 0.2, fill: '#9bb0ff', opacity: 0.4 },
  { cx: 7, cy: 16, r: 0.25, fill: '#fff', opacity: 0.5 },
]

const expectedEllipse = {
  cx: 12,
  cy: 12,
  rx: 8,
  ry: 3,
  rotation: -20,
  rotationCenterX: 12,
  rotationCenterY: 12,
  strokeColor: '#9bb0ff',
  strokeWidth: 0.8,
  opacity: 0.4,
}

// ── Helper: extract center from bezier circle segments ───────────────

function extractCircleCenter(layer: VectorLayer): { cx: number; cy: number; r: number } {
  const path = layer.paths[0]!
  const segs = path.segments

  // First segment is a 'move' to (cx + rx, cy)
  const move = segs[0]!
  if (move.type !== 'move') throw new Error('Expected move segment')

  // For a bezier circle: move point is (cx+rx, cy)
  // Third cubic ends at (cx-rx, cy) — from that we can derive cx and rx
  const cubic1 = segs[1]
  const cubic3 = segs[3]
  if (!cubic1 || cubic1.type !== 'cubic' || !cubic3 || cubic3.type !== 'cubic') {
    throw new Error('Expected cubic segments for circle')
  }

  // move.x = cx + rx, cubic3 ends at (cx - rx, cy + ry) but for circles ry=rx
  // Actually: cubic1 ends at (cx, cy-ry), cubic3 ends at (cx, cy+ry)
  // So cx = cubic1.x = cubic3.x for a circle
  // cy - ry = cubic1.y, cy + ry = cubic3.y → cy = (cubic1.y + cubic3.y) / 2
  const cx = cubic1.x
  const cy = (cubic1.y + cubic3.y) / 2
  const rx = move.x - cx

  return { cx, cy, r: rx }
}

function extractEllipseCenter(layer: VectorLayer): { cx: number; cy: number; rx: number; ry: number } {
  const path = layer.paths[0]!
  const segs = path.segments

  const move = segs[0]!
  if (move.type !== 'move') throw new Error('Expected move segment')

  const cubic1 = segs[1]
  const cubic2 = segs[2]
  const cubic3 = segs[3]
  if (!cubic1 || cubic1.type !== 'cubic') throw new Error('Expected cubic')
  if (!cubic2 || cubic2.type !== 'cubic') throw new Error('Expected cubic')
  if (!cubic3 || cubic3.type !== 'cubic') throw new Error('Expected cubic')

  // move: (cx+rx, cy), cubic1: (cx, cy-ry), cubic2: (cx-rx, cy), cubic3: (cx, cy+ry)
  const cx = cubic1.x
  const cy = (cubic1.y + cubic3.y) / 2
  const rx = move.x - cx
  const ry = cy - cubic1.y

  return { cx, cy, rx, ry }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SVG import preserves positions (coswall.svg)', () => {
  let doc: ReturnType<typeof importSVG>
  let layers: Layer[]

  beforeAll(() => {
    doc = importSVG(coswallSVG)
    layers = doc.artboards[0]!.layers
  })

  test('artboard dimensions match viewBox', () => {
    const artboard = doc.artboards[0]!
    expect(artboard.width).toBe(24)
    expect(artboard.height).toBe(24)
  })

  test('correct number of layers imported', () => {
    // 16 circles + 1 ellipse = 17 shape elements (comments are ignored)
    expect(layers.length).toBe(17)
  })

  // Test every circle's center position is preserved
  describe('circle positions', () => {
    // Circles are layers 0-2 (first two are the big circles, third is lensing ring),
    // then the ellipse is layer 3, then layer 4 is event horizon, then stars
    // Actually let's just find all circle layers and the ellipse

    test('each circle center and radius matches the source SVG', () => {
      const circleLayers = layers.filter(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width === l.shapeParams.height,
      )

      expect(circleLayers.length).toBe(expectedCircles.length)

      for (let i = 0; i < circleLayers.length; i++) {
        const layer = circleLayers[i]!
        const expected = expectedCircles[i]!
        const { cx, cy, r } = extractCircleCenter(layer)

        expect(cx).toBeCloseTo(expected.cx, 5)
        expect(cy).toBeCloseTo(expected.cy, 5)
        expect(r).toBeCloseTo(expected.r, 5)
      }
    })

    // Individually test key stars to catch any position shift
    const starTests: [string, number, number, number, number][] = [
      ['star at (4,5)', 4, 5, 0.6, 0.9],
      ['star at (19,4)', 19, 4, 0.4, 0.8],
      ['star at (20,18)', 20, 18, 0.5, 0.7],
      ['star at (5,19)', 5, 19, 0.4, 0.8],
      ['star at (3,12)', 3, 12, 0.4, 0.5],
      ['star at (21,10)', 21, 10, 0.3, 0.6],
      ['distant star at (6,8)', 6, 8, 0.2, 0.4],
      ['distant star at (17,7)', 17, 7, 0.25, 0.5],
      ['distant star at (18,14)', 18, 14, 0.2, 0.4],
      ['distant star at (7,16)', 7, 16, 0.25, 0.5],
    ]

    for (const [name, ecx, ecy, er, eOpacity] of starTests) {
      test(`${name} position preserved`, () => {
        const circleLayers = layers.filter(
          (l): l is VectorLayer => l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse',
        )

        const match = circleLayers.find((l) => {
          const { cx, cy, r } = extractCircleCenter(l)
          return Math.abs(cx - ecx) < 0.01 && Math.abs(cy - ecy) < 0.01 && Math.abs(r - er) < 0.01
        })

        expect(match).toBeDefined()
        expect(match!.opacity).toBeCloseTo(eOpacity, 5)
      })
    }
  })

  describe('ellipse (lensing ring)', () => {
    test('ellipse center preserved at (12, 12)', () => {
      const ellipseLayers = layers.filter(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      )

      expect(ellipseLayers.length).toBe(1)
      const ellipse = ellipseLayers[0]!
      const { cx, cy, rx, ry } = extractEllipseCenter(ellipse)

      expect(cx).toBeCloseTo(expectedEllipse.cx, 5)
      expect(cy).toBeCloseTo(expectedEllipse.cy, 5)
      expect(rx).toBeCloseTo(expectedEllipse.rx, 5)
      expect(ry).toBeCloseTo(expectedEllipse.ry, 5)
    })

    test('ellipse dimensions preserved (rx=8, ry=3)', () => {
      const ellipse = layers.find(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      ) as VectorLayer

      expect(ellipse.shapeParams!.width).toBe(16) // 2 * rx
      expect(ellipse.shapeParams!.height).toBe(6) // 2 * ry
    })

    test('ellipse opacity preserved', () => {
      const ellipse = layers.find(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      ) as VectorLayer

      expect(ellipse.opacity).toBeCloseTo(expectedEllipse.opacity, 5)
    })

    test('ellipse rotation is -20 degrees', () => {
      const ellipse = layers.find(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      ) as VectorLayer

      expect(ellipse.transform.rotation).toBeCloseTo(-20, 5)
    })

    test('ellipse stroke preserved', () => {
      const ellipse = layers.find(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      ) as VectorLayer

      expect(ellipse.stroke).not.toBeNull()
      expect(ellipse.stroke!.color).toBe(expectedEllipse.strokeColor)
      expect(ellipse.stroke!.width).toBeCloseTo(expectedEllipse.strokeWidth, 5)
    })
  })

  describe('transforms do not shift positions', () => {
    test('circles have identity transform (x=0, y=0)', () => {
      const circleLayers = layers.filter(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width === l.shapeParams.height,
      )

      for (const layer of circleLayers) {
        expect(layer.transform.x).toBe(0)
        expect(layer.transform.y).toBe(0)
        expect(layer.transform.scaleX).toBe(1)
        expect(layer.transform.scaleY).toBe(1)
        expect(layer.transform.rotation).toBe(0)
      }
    })

    test('ellipse rotation center is baked into transform correctly', () => {
      // SVG: rotate(-20 12 12) means rotate around (12,12)
      // This is equivalent to translate(12,12) rotate(-20) translate(-12,-12)
      // The path data has the ellipse centered at (12,12), so if the rotation
      // is around (12,12), the center should not shift.
      //
      // If the rotation center is NOT handled, the ellipse path center (12,12)
      // will be rotated around (0,0) by -20 degrees, moving it to a wrong position.
      const ellipse = layers.find(
        (l): l is VectorLayer =>
          l.type === 'vector' && l.shapeParams?.shapeType === 'ellipse' && l.shapeParams.width !== l.shapeParams.height,
      ) as VectorLayer

      // The path segments should still have the ellipse centered at (12,12)
      const { cx, cy } = extractEllipseCenter(ellipse)
      expect(cx).toBeCloseTo(12, 3)
      expect(cy).toBeCloseTo(12, 3)
    })
  })

  describe('fill colors preserved', () => {
    test('gradient fills reference gradient IDs', () => {
      const gradientLayers = layers.filter((l): l is VectorLayer => l.type === 'vector' && l.fill?.type === 'gradient')
      // Two circles use url(#blackhole) and url(#glow)
      expect(gradientLayers.length).toBe(2)
    })

    test('solid fill colors preserved', () => {
      const solidFillLayers = layers.filter((l): l is VectorLayer => l.type === 'vector' && l.fill?.type === 'solid')

      const fillColors = solidFillLayers.map((l) => (l.fill?.type === 'solid' ? l.fill.color : null))

      // Event horizon is #000, stars are #fff, #9bb0ff, #b0c4ff
      expect(fillColors).toContain('#000')
      expect(fillColors).toContain('#fff')
      expect(fillColors).toContain('#9bb0ff')
      expect(fillColors).toContain('#b0c4ff')
    })

    test('stroke-only circle has no fill', () => {
      // Gravitational lensing ring: fill="none" stroke="#6b7db3"
      const lensingRing = layers.find(
        (l): l is VectorLayer => l.type === 'vector' && l.stroke?.color === '#6b7db3',
      ) as VectorLayer

      expect(lensingRing).toBeDefined()
      expect(lensingRing.fill).toBeNull()
      expect(lensingRing.stroke!.width).toBeCloseTo(0.5, 5)

      const { cx, cy, r } = extractCircleCenter(lensingRing)
      expect(cx).toBeCloseTo(12, 5)
      expect(cy).toBeCloseTo(12, 5)
      expect(r).toBeCloseTo(6, 5)
    })
  })

  describe('gradient stops preserved', () => {
    test('radial gradient stop offsets are in 0-1 range', () => {
      const gradLayers = layers.filter((l): l is VectorLayer => l.type === 'vector' && l.fill?.type === 'gradient')

      for (const layer of gradLayers) {
        if (layer.fill?.type !== 'gradient') continue
        for (const stop of layer.fill.gradient!.stops) {
          expect(stop.offset).toBeGreaterThanOrEqual(0)
          expect(stop.offset).toBeLessThanOrEqual(1)
        }
      }
    })
  })
})

describe('parseTransformAttr rotate with center', () => {
  test('rotate(angle cx cy) decomposes correctly', () => {
    // rotate(-20 12 12) = translate(12,12) rotate(-20) translate(-12,-12)
    const t = parseTransformAttr('rotate(-20 12 12)')
    expect(t.rotation).toBeCloseTo(-20, 5)
    // The translate component should account for the rotation center
    // After decomposition: the transform should include the translation
    // that results from rotating around (12,12) instead of the origin.
    // tx = cx - cx*cos(a) + cy*sin(a)
    // ty = cy - cx*sin(a) - cy*cos(a)
    const a = (-20 * Math.PI) / 180
    // tx = cx*(1-cos(a)) + cy*sin(a), ty = cy*(1-cos(a)) - cx*sin(a)
    const expectedTx = 12 * (1 - Math.cos(a)) + 12 * Math.sin(a)
    const expectedTy = 12 * (1 - Math.cos(a)) - 12 * Math.sin(a)
    expect(t.x).toBeCloseTo(expectedTx, 3)
    expect(t.y).toBeCloseTo(expectedTy, 3)
  })

  test('rotate(45 0 0) same as rotate(45)', () => {
    const t = parseTransformAttr('rotate(45 0 0)')
    expect(t.rotation).toBeCloseTo(45, 5)
    expect(t.x).toBeCloseTo(0, 5)
    expect(t.y).toBeCloseTo(0, 5)
  })

  test('rotate(90 5 5) correctly offsets', () => {
    const t = parseTransformAttr('rotate(90 5 5)')
    expect(t.rotation).toBeCloseTo(90, 5)
    // translate(5,5) rotate(90) translate(-5,-5)
    // tx = 5 - 5*cos(90) + 5*sin(90) = 5 - 0 + 5 = 10
    // ty = 5 + 5*sin(90) - 5*cos(90) = 5 + 5 - 0 = 10
    // Wait, let me recalculate properly:
    // rotate(90, 5, 5) on point (x,y):
    //   x' = cos(90)*(x-5) - sin(90)*(y-5) + 5
    //   y' = sin(90)*(x-5) + cos(90)*(y-5) + 5
    // As a translation in the transform:
    //   tx = 5 - 5*cos(90) + 5*sin(90) = 5 + 5 = 10
    //   ty = 5 - 5*sin(90) - 5*cos(90) = 5 - 5 = 0
    // Wait: matrix form of rotate(a, cx, cy) is:
    //   translate(cx, cy) * rotate(a) * translate(-cx, -cy)
    // = [cos(a), -sin(a), cx*(1-cos(a)) + cy*sin(a)]
    //   [sin(a),  cos(a), cy*(1-cos(a)) - cx*sin(a)]
    // For a=90, cx=5, cy=5:
    //   tx = 5*(1-0) + 5*1 = 10
    //   ty = 5*(1-0) - 5*1 = 0
    expect(t.x).toBeCloseTo(10, 3)
    expect(t.y).toBeCloseTo(0, 3)
  })
})

// ── LYK-155: S/T smooth curve path commands ──────────────────────────

describe('S/T smooth curve commands', () => {
  test('S (smooth cubic) reflects previous cp2', () => {
    // C creates cubic with cp2 at (20,20), endpoint at (40,0)
    // S reflects cp2 around (40,0) → cp1 = (60,-20), then cp2=(60,20), end=(80,0)
    const segs = parseSVGPathD('M0 0 C10 20 20 20 40 0 S60 20 80 0')
    expect(segs.length).toBe(3) // move, cubic, cubic
    expect(segs[2]!.type).toBe('cubic')
    if (segs[2]!.type === 'cubic') {
      // Reflected cp1 = 2*(40,0) - (20,20) = (60,-20)
      expect(segs[2]!.cp1x).toBeCloseTo(60, 5)
      expect(segs[2]!.cp1y).toBeCloseTo(-20, 5)
      expect(segs[2]!.cp2x).toBeCloseTo(60, 5)
      expect(segs[2]!.cp2y).toBeCloseTo(20, 5)
      expect(segs[2]!.x).toBeCloseTo(80, 5)
      expect(segs[2]!.y).toBeCloseTo(0, 5)
    }
  })

  test('S without preceding C uses current point as cp1', () => {
    const segs = parseSVGPathD('M10 10 S30 30 50 10')
    expect(segs.length).toBe(2) // move, cubic
    if (segs[1]!.type === 'cubic') {
      // No prior cubic → cp1 = current point (10,10)
      expect(segs[1]!.cp1x).toBeCloseTo(10, 5)
      expect(segs[1]!.cp1y).toBeCloseTo(10, 5)
    }
  })

  test('s (relative smooth cubic)', () => {
    const segs = parseSVGPathD('M0 0 C10 20 20 20 40 0 s20 20 40 0')
    expect(segs.length).toBe(3)
    if (segs[2]!.type === 'cubic') {
      // cp2 relative: (40+20, 0+20) = (60, 20)
      // end relative: (40+40, 0+0) = (80, 0)
      // reflected cp1: 2*(40,0) - (20,20) = (60, -20)
      expect(segs[2]!.cp1x).toBeCloseTo(60, 5)
      expect(segs[2]!.cp1y).toBeCloseTo(-20, 5)
      expect(segs[2]!.cp2x).toBeCloseTo(60, 5)
      expect(segs[2]!.cp2y).toBeCloseTo(20, 5)
      expect(segs[2]!.x).toBeCloseTo(80, 5)
      expect(segs[2]!.y).toBeCloseTo(0, 5)
    }
  })

  test('T (smooth quadratic) reflects previous cp', () => {
    // Q: cp=(5,10), end=(10,0). T: end=(20,0)
    // Reflected cp = 2*(10,0) - (5,10) = (15,-10)
    const segs = parseSVGPathD('M0 0 Q5 10 10 0 T20 0')
    expect(segs.length).toBe(3) // move, quadratic, quadratic
    expect(segs[2]!.type).toBe('quadratic')
    if (segs[2]!.type === 'quadratic') {
      expect(segs[2]!.cpx).toBeCloseTo(15, 5)
      expect(segs[2]!.cpy).toBeCloseTo(-10, 5)
      expect(segs[2]!.x).toBeCloseTo(20, 5)
      expect(segs[2]!.y).toBeCloseTo(0, 5)
    }
  })

  test('T without preceding Q uses current point', () => {
    const segs = parseSVGPathD('M10 10 T30 10')
    expect(segs.length).toBe(2)
    if (segs[1]!.type === 'quadratic') {
      expect(segs[1]!.cpx).toBeCloseTo(10, 5)
      expect(segs[1]!.cpy).toBeCloseTo(10, 5)
    }
  })

  test('chained T commands reflect progressively', () => {
    const segs = parseSVGPathD('M0 0 Q5 10 10 0 T20 0 T30 0')
    expect(segs.length).toBe(4) // move, Q, T, T
    // First T: cp = 2*(10,0) - (5,10) = (15,-10)
    if (segs[2]!.type === 'quadratic') {
      expect(segs[2]!.cpx).toBeCloseTo(15, 5)
      expect(segs[2]!.cpy).toBeCloseTo(-10, 5)
    }
    // Second T: cp = 2*(20,0) - (15,-10) = (25,10)
    if (segs[3]!.type === 'quadratic') {
      expect(segs[3]!.cpx).toBeCloseTo(25, 5)
      expect(segs[3]!.cpy).toBeCloseTo(10, 5)
    }
  })

  test('chained S commands reflect progressively', () => {
    const segs = parseSVGPathD('M0 0 C0 10 10 10 20 0 S30 10 40 0 S50 10 60 0')
    expect(segs.length).toBe(4) // move, C, S, S
    // First S: cp1 = 2*(20,0) - (10,10) = (30,-10)
    if (segs[2]!.type === 'cubic') {
      expect(segs[2]!.cp1x).toBeCloseTo(30, 5)
      expect(segs[2]!.cp1y).toBeCloseTo(-10, 5)
    }
    // Second S: cp1 = 2*(40,0) - (30,10) = (50,-10)
    if (segs[3]!.type === 'cubic') {
      expect(segs[3]!.cp1x).toBeCloseTo(50, 5)
      expect(segs[3]!.cp1y).toBeCloseTo(-10, 5)
    }
  })
})

// ── LYK-156: Chained/multiple transforms ─────────────────────────────

describe('chained transforms', () => {
  test('translate then rotate', () => {
    const t = parseTransformAttr('translate(100, 50) rotate(90)')
    // Matrix: translate(100,50) * rotate(90)
    // [1 0 100] * [0 -1 0]   = [0 -1 100]
    // [0 1  50]   [1  0 0]     [1  0  50]
    expect(t.x).toBeCloseTo(100, 3)
    expect(t.y).toBeCloseTo(50, 3)
    expect(t.rotation).toBeCloseTo(90, 3)
    expect(t.scaleX).toBeCloseTo(1, 3)
    expect(t.scaleY).toBeCloseTo(1, 3)
  })

  test('scale then translate', () => {
    const t = parseTransformAttr('scale(2) translate(10, 20)')
    // Matrix: scale(2) * translate(10,20)
    // [2 0 0] * [1 0 10]   = [2 0 20]
    // [0 2 0]   [0 1 20]     [0 2 40]
    expect(t.x).toBeCloseTo(20, 3)
    expect(t.y).toBeCloseTo(40, 3)
    expect(t.scaleX).toBeCloseTo(2, 3)
    expect(t.scaleY).toBeCloseTo(2, 3)
  })

  test('translate then scale then rotate', () => {
    const t = parseTransformAttr('translate(10, 0) scale(3) rotate(45)')
    // translate(10,0) * scale(3) * rotate(45)
    // scale * rotation gives scaleX=scaleY=3, rotation=45
    // translate is (10,0)
    expect(t.x).toBeCloseTo(10, 3)
    expect(t.y).toBeCloseTo(0, 3)
    expect(t.scaleX).toBeCloseTo(3, 3)
    expect(t.scaleY).toBeCloseTo(3, 3)
    expect(t.rotation).toBeCloseTo(45, 3)
  })

  test('rotate then translate', () => {
    const t = parseTransformAttr('rotate(90) translate(10, 0)')
    // rotate(90) * translate(10,0)
    // [0 -1 0] * [1 0 10]   = [0 -1 0]    wait:
    // [1  0 0]   [0 1  0]     [1  0 10]
    // Actually matrix multiply with our convention:
    // rotate(90): a=cos90≈0, b=sin90=1, c=-sin90=-1, d=cos90≈0
    // m = [0, 1, -1, 0, 0, 0]
    // translate(10,0): [1, 0, 0, 1, 10, 0]
    // result: [0*1+(-1)*0, 1*1+0*0, 0*0+(-1)*1, 1*0+0*1, 0*10+(-1)*0+0, 1*10+0*0+0]
    //       = [0, 1, -1, 0, 0, 10]
    // So tx=0, ty=10, rotation=90
    expect(t.x).toBeCloseTo(0, 3)
    expect(t.y).toBeCloseTo(10, 3)
    expect(t.rotation).toBeCloseTo(90, 3)
  })

  test('single translate still works', () => {
    const t = parseTransformAttr('translate(42, 17)')
    expect(t.x).toBeCloseTo(42, 5)
    expect(t.y).toBeCloseTo(17, 5)
    expect(t.rotation).toBe(0)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
  })

  test('single scale still works', () => {
    const t = parseTransformAttr('scale(2 3)')
    expect(t.scaleX).toBeCloseTo(2, 5)
    expect(t.scaleY).toBeCloseTo(3, 5)
  })

  test('single rotate still works', () => {
    const t = parseTransformAttr('rotate(45)')
    expect(t.rotation).toBeCloseTo(45, 5)
  })

  test('identity matrix still works', () => {
    const t = parseTransformAttr('matrix(1 0 0 1 50 100)')
    expect(t.x).toBeCloseTo(50, 5)
    expect(t.y).toBeCloseTo(100, 5)
    expect(t.scaleX).toBeCloseTo(1, 3)
    expect(t.scaleY).toBeCloseTo(1, 3)
  })

  test('null returns identity', () => {
    const t = parseTransformAttr(null)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.rotation).toBe(0)
  })

  test('skewX is parsed', () => {
    const t = parseTransformAttr('skewX(30)')
    // skewX(30) matrix: [1, 0, tan(30°), 1, 0, 0]
    // Decomposition: scaleX = sqrt(1+0) = 1, scaleY = sqrt(tan²(30)+1)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
  })

  test('skewY is parsed', () => {
    const t = parseTransformAttr('skewY(30)')
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
  })
})

// ── LYK-157: Inline style attribute ──────────────────────────────────

describe('inline style attribute', () => {
  test('style="fill:red" is read', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="0" y="0" width="50" height="50" style="fill:#ff0000"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill).not.toBeNull()
    expect(layer.fill!.type).toBe('solid')
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('#ff0000')
    }
  })

  test('inline style overrides presentation attribute', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="0" y="0" width="50" height="50" fill="blue" style="fill:green"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill!.type).toBe('solid')
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('green')
    }
  })

  test('inline style overrides class style', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <style>.box { fill: blue; }</style>
      <rect class="box" x="0" y="0" width="50" height="50" style="fill:orange"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('orange')
    }
  })

  test('inline style with multiple properties', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="0" y="0" width="50" height="50" style="fill:#123456;stroke:#abcdef;stroke-width:3"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('#123456')
    }
    expect(layer.stroke).not.toBeNull()
    expect(layer.stroke!.color).toBe('#abcdef')
    expect(layer.stroke!.width).toBeCloseTo(3, 5)
  })

  test('inline style fill:none produces null fill', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <circle cx="50" cy="50" r="20" style="fill:none;stroke:black"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill).toBeNull()
    expect(layer.stroke).not.toBeNull()
  })

  test('presentation attribute used when no inline style', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect x="0" y="0" width="50" height="50" fill="purple"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('purple')
    }
  })
})
