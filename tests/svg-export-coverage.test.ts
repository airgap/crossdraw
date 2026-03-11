import { describe, test, expect } from 'bun:test'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'
import type { DesignDocument, VectorLayer, GroupLayer, TextLayer, RasterLayer, Layer, Gradient } from '@/types'

function createDoc(layers: Layer[], opts?: { bgColor?: string }): DesignDocument {
  return {
    id: 'doc-1',
    metadata: {
      title: 'Test',
      author: '',
      created: '',
      modified: '',
      colorspace: 'srgb',
      width: 200,
      height: 200,
    },
    artboards: [
      {
        id: 'ab-1',
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        backgroundColor: opts?.bgColor ?? '#ffffff',
        layers,
      },
    ],
    assets: { gradients: [], patterns: [], colors: [] },
  }
}

function mkTransform(overrides?: Partial<VectorLayer['transform']>) {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides }
}

function mkVectorLayer(overrides: Partial<VectorLayer>): VectorLayer {
  return {
    id: 'v1',
    name: 'Vec',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: mkTransform(),
    effects: [],
    paths: [
      {
        id: 'p1',
        segments: [
          { type: 'move', x: 0, y: 0 },
          { type: 'line', x: 10, y: 10 },
        ],
        closed: false,
      },
    ],
    fill: null,
    stroke: null,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe('svg-export coverage', () => {
  test('throws if no artboard found', () => {
    const doc: DesignDocument = {
      id: 'doc-1',
      metadata: { title: '', author: '', created: '', modified: '', colorspace: 'srgb', width: 100, height: 100 },
      artboards: [],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    expect(() => exportArtboardToSVG(doc)).toThrow('No artboard found')
  })

  test('throws for non-existent artboardId', () => {
    const doc = createDoc([])
    expect(() => exportArtboardToSVG(doc, 'nonexistent-id')).toThrow('No artboard found')
  })

  test('exports with specific artboardId', () => {
    const doc: DesignDocument = {
      id: 'doc-1',
      metadata: { title: '', author: '', created: '', modified: '', colorspace: 'srgb', width: 100, height: 100 },
      artboards: [
        { id: 'ab-1', name: 'A', x: 0, y: 0, width: 100, height: 100, backgroundColor: '#fff', layers: [] },
        { id: 'ab-2', name: 'B', x: 0, y: 0, width: 300, height: 300, backgroundColor: '#000', layers: [] },
      ],
      assets: { gradients: [], patterns: [], colors: [] },
    }
    const svg = exportArtboardToSVG(doc, 'ab-2')
    expect(svg).toContain('width="300"')
    expect(svg).toContain('height="300"')
  })

  // ── Gradient types (conical, box, mesh fallbacks) lines 69-71 ──

  test('conical gradient type is skipped (no defs emitted)', () => {
    const gradient: Gradient = {
      id: 'g1',
      name: 'Conical',
      type: 'conical',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    // Conical gradients get a defs block but no gradient element inside
    expect(svg).toContain('<defs>')
    expect(svg).not.toContain('<linearGradient')
    expect(svg).not.toContain('<radialGradient')
    // Fill falls back to first stop color
    expect(svg).toContain('fill="#ff0000"')
  })

  test('box gradient type falls back to first stop color', () => {
    const gradient: Gradient = {
      id: 'g2',
      name: 'Box',
      type: 'box',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#00ff00', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="#00ff00"')
  })

  test('mesh gradient type falls back to first stop color', () => {
    const gradient: Gradient = {
      id: 'g3',
      name: 'Mesh',
      type: 'mesh',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#aabbcc', opacity: 1 },
        { offset: 1, color: '#ddeeff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="#aabbcc"')
  })

  // ── gradientUnits=userSpaceOnUse line 81 ──

  test('gradientUnits=userSpaceOnUse is emitted', () => {
    const gradient: Gradient = {
      id: 'g4',
      name: 'UspGrad',
      type: 'linear',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      gradientUnits: 'userSpaceOnUse',
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('gradientUnits="userSpaceOnUse"')
  })

  // ── gradientTransform lines 85-90 ──

  test('gradientTransform with translate, rotate, and scale', () => {
    const gradient: Gradient = {
      id: 'g5',
      name: 'Transformed',
      type: 'linear',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      gradientTransform: {
        translateX: 10,
        translateY: 20,
        rotate: 45,
        scaleX: 2,
        scaleY: 3,
      },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('gradientTransform=')
    expect(svg).toContain('translate(10 20)')
    expect(svg).toContain('rotate(45)')
    expect(svg).toContain('scale(2 3)')
  })

  test('gradientTransform with only translate', () => {
    const gradient: Gradient = {
      id: 'g6',
      name: 'TranslateOnly',
      type: 'radial',
      angle: 0,
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
      gradientTransform: {
        translateX: 5,
        translateY: 0,
      },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('translate(5 0)')
  })

  // ── radial gradient export line 62-67 ──

  test('radial gradient is exported correctly', () => {
    const gradient: Gradient = {
      id: 'grad-r',
      name: 'Radial',
      type: 'radial',
      angle: 0,
      x: 0.5,
      y: 0.5,
      radius: 0.7,
      stops: [
        { offset: 0, color: '#ffffff', opacity: 1 },
        { offset: 1, color: '#000000', opacity: 0.5 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<radialGradient')
    expect(svg).toContain('cx="0.5"')
    expect(svg).toContain('cy="0.5"')
    expect(svg).toContain('r="0.7"')
    expect(svg).toContain('stop-opacity="0.5"')
  })

  // ── Stop opacity < 1 on linear gradient (line 42) ──

  test('stop-opacity is emitted when < 1', () => {
    const gradient: Gradient = {
      id: 'grad-opacity',
      name: 'WithOpacity',
      type: 'linear',
      angle: 90,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 0.3 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('stop-opacity="0.3"')
  })

  // ── text layer rendering (lines 381-407) ──

  test('text layer renders <text> element', () => {
    const textLayer: TextLayer = {
      id: 't1',
      name: 'Text',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform({ x: 10, y: 20 }),
      effects: [],
      text: 'Hello World',
      fontFamily: 'Arial',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000000',
    }
    const doc = createDoc([textLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<text')
    expect(svg).toContain('x="10"')
    expect(svg).toContain('y="20"')
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('font-family="Arial"')
    expect(svg).toContain('font-size="16"')
    expect(svg).toContain('Hello World')
    expect(svg).toContain('dominant-baseline="text-before-edge"')
  })

  test('text layer with bold and italic', () => {
    const textLayer: TextLayer = {
      id: 't2',
      name: 'BoldItalic',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 0.7,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      text: 'Styled',
      fontFamily: 'Helvetica',
      fontSize: 24,
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAlign: 'left',
      lineHeight: 1.5,
      letterSpacing: 0,
      color: '#ff0000',
    }
    const doc = createDoc([textLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('font-weight="bold"')
    expect(svg).toContain('font-style="italic"')
    expect(svg).toContain('opacity="0.7"')
  })

  test('text layer with scale and rotation transforms', () => {
    const textLayer: TextLayer = {
      id: 't3',
      name: 'Rotated',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform({ scaleX: 2, scaleY: 3, rotation: 45 }),
      effects: [],
      text: 'Transformed',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000',
    }
    const doc = createDoc([textLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('transform="scale(2 3) rotate(45)"')
  })

  test('text layer with openTypeFeatures', () => {
    const textLayer: TextLayer = {
      id: 't4',
      name: 'OTFeatures',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      text: 'Features',
      fontFamily: 'Arial',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000',
      openTypeFeatures: { liga: true, kern: false },
    }
    const doc = createDoc([textLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('font-feature-settings:')
    expect(svg).toContain('"liga" 1')
    expect(svg).toContain('"kern" 0')
  })

  // ── Group layer rendering (lines 135-146) ──

  test('group layer renders <g> with transform and opacity', () => {
    const child = mkVectorLayer({
      id: 'child1',
      fill: { type: 'solid', color: '#00ff00', opacity: 1 },
    })
    const group: GroupLayer = {
      id: 'grp1',
      name: 'Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 0.5,
      blendMode: 'normal',
      transform: mkTransform({ x: 50, y: 50 }),
      effects: [],
      children: [child],
    }
    const doc = createDoc([group])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<g')
    expect(svg).toContain('translate(50 50)')
    expect(svg).toContain('opacity="0.5"')
    expect(svg).toContain('</g>')
  })

  test('hidden group layer is skipped', () => {
    const group: GroupLayer = {
      id: 'grp2',
      name: 'Hidden Group',
      type: 'group',
      visible: false,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      children: [mkVectorLayer({ id: 'innerChild', fill: { type: 'solid', color: '#123456', opacity: 1 } })],
    }
    const doc = createDoc([group])
    const svg = exportArtboardToSVG(doc)
    expect(svg).not.toContain('Hidden Group')
    expect(svg).not.toContain('#123456')
  })

  // ── vector layer with mask (lines 161-178) ──

  test('vector layer with vector mask emits clipPath', () => {
    const layer = mkVectorLayer({
      id: 'masked-layer',
      transform: mkTransform({ x: 10, y: 10 }),
      opacity: 0.8,
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      mask: {
        id: 'mask-layer',
        name: 'Mask',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: mkTransform(),
        effects: [],
        paths: [
          {
            id: 'mp1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 50, y: 0 },
              { type: 'line', x: 50, y: 50 },
              { type: 'close' },
            ],
            closed: true,
          },
        ],
        fill: null,
        stroke: null,
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<clipPath')
    expect(svg).toContain('clip-path="url(#clip-masked-layer)"')
  })

  // ── gradient fill with opacity < 1 (lines 190, 194) ──

  test('gradient fill with opacity < 1 emits fill-opacity', () => {
    const gradient: Gradient = {
      id: 'grad-op',
      name: 'GradOp',
      type: 'linear',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 0.5 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="url(#grad-op)"')
    expect(svg).toContain('fill-opacity="0.5"')
  })

  // ── conical gradient in fill falls back to first stop (line 195-199) ──

  test('conical gradient fill falls back to first stop color', () => {
    const gradient: Gradient = {
      id: 'grad-con',
      name: 'Conical',
      type: 'conical',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [
        { offset: 0, color: '#abcdef', opacity: 1 },
        { offset: 1, color: '#000000', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="#abcdef"')
  })

  // ── fill type 'none' (empty fill object with no color) (line 200-202) ──

  test('fill with unknown type renders fill=none', () => {
    const layer = mkVectorLayer({
      fill: { type: 'pattern' as any, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="none"')
  })

  // ── null fill renders fill=none (line 203-205) ──

  test('null fill renders fill=none', () => {
    const layer = mkVectorLayer({ fill: null })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="none"')
  })

  // ── evenodd fill-rule (line 184) ──

  test('evenodd fill-rule is emitted', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      paths: [
        {
          id: 'p1',
          segments: [
            { type: 'move', x: 0, y: 0 },
            { type: 'line', x: 10, y: 10 },
          ],
          closed: false,
          fillRule: 'evenodd',
        },
      ],
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill-rule="evenodd"')
  })

  // ── solid fill with opacity < 1 (line 189) ──

  test('solid fill with opacity < 1 emits fill-opacity', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 0.3 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill-opacity="0.3"')
  })

  // ── stroke with dasharray (lines 213-215) ──

  test('stroke with dasharray is emitted', () => {
    const layer = mkVectorLayer({
      fill: null,
      stroke: {
        color: '#000000',
        width: 2,
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
        dasharray: [5, 3, 2],
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('stroke-dasharray="5 3 2"')
  })

  // ── nested group gradient collection (lines 96-104) ──

  test('collects gradients from nested groups', () => {
    const gradient: Gradient = {
      id: 'nested-grad',
      name: 'Nested',
      type: 'linear',
      angle: 0,
      x: 0,
      y: 0,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const innerLayer = mkVectorLayer({
      id: 'inner',
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const group: GroupLayer = {
      id: 'g1',
      name: 'Outer',
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
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<defs>')
    expect(svg).toContain('<linearGradient id="nested-grad"')
  })

  // ── XML escaping in fill color (line 409-411) ──

  test('escapes special characters in fill color and text', () => {
    const textLayer: TextLayer = {
      id: 't-esc',
      name: 'Escape',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      text: 'A & B < C > D "E"',
      fontFamily: 'Arial',
      fontSize: 14,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.4,
      letterSpacing: 0,
      color: '#000',
    }
    const doc = createDoc([textLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('A &amp; B &lt; C &gt; D &quot;E&quot;')
  })

  // ── Group with identity transform (no transform attr) ──

  test('group with identity transform has no transform attr', () => {
    const child = mkVectorLayer({ fill: { type: 'solid', color: '#000', opacity: 1 } })
    const group: GroupLayer = {
      id: 'g-id',
      name: 'G',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      children: [child],
    }
    const doc = createDoc([group])
    const svg = exportArtboardToSVG(doc)
    // Identity transform group at full opacity shouldn't have transform/opacity attrs
    expect(svg).toContain('<g>')
    expect(svg).not.toContain('translate(0 0)')
  })

  // ── Vector layer at identity transform (no wrapping <g>) ──

  test('vector at identity transform does not wrap in <g>', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      opacity: 1,
      transform: mkTransform(),
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    // Should have path directly without a wrapping <g>
    expect(svg).toContain('<path ')
    // Count <g> tags — should only be from the <g> in background rect context
    const gOpenTags = svg.match(/<g[\s>]/g)
    expect(gOpenTags).toBeNull() // no <g> tags for identity vector
  })

  // ── Gradient with no stops has no stop-opacity ──

  test('gradient stop at full opacity omits stop-opacity', () => {
    const gradient: Gradient = {
      id: 'full-op',
      name: 'FullOp',
      type: 'linear',
      angle: 0,
      x: 0,
      y: 0,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).not.toContain('stop-opacity')
  })

  // ── Raster layer export (lines 129-130, 227-256) ──

  test('raster layer renders <image> element with base64 PNG data', () => {
    // Mock OffscreenCanvas and getRasterCanvas
    const origOC = globalThis.OffscreenCanvas
    const mockCtx = {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: () => {},
    }
    // @ts-ignore
    globalThis.OffscreenCanvas = class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext() {
        return mockCtx
      }
    }

    // Store raster data so getRasterCanvas returns a canvas
    const { storeRasterData } = require('@/store/raster-data')
    const chunkId = 'raster-test-chunk'
    const fakeImageData = {
      data: new Uint8ClampedArray(4 * 4 * 4), // 4x4 RGBA
      width: 4,
      height: 4,
      colorSpace: 'srgb',
    } as unknown as ImageData
    storeRasterData(chunkId, fakeImageData)

    const rasterLayer: RasterLayer = {
      id: 'r1',
      name: 'Raster',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 0.8,
      blendMode: 'normal',
      transform: mkTransform({ x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 45 }),
      effects: [],
      imageChunkId: chunkId,
      width: 4,
      height: 4,
    }
    const doc = createDoc([rasterLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<image')
    expect(svg).toContain('x="10"')
    expect(svg).toContain('y="20"')
    expect(svg).toContain('width="4"')
    expect(svg).toContain('height="4"')
    expect(svg).toContain('opacity="0.8"')
    expect(svg).toContain('scale(2 3)')
    expect(svg).toContain('rotate(45)')
    expect(svg).toContain('href="data:image/png;base64,')

    // Cleanup
    const { deleteRasterData } = require('@/store/raster-data')
    deleteRasterData(chunkId)
    if (origOC !== undefined) {
      globalThis.OffscreenCanvas = origOC
    } else {
      delete (globalThis as any).OffscreenCanvas
    }
  })

  test('raster layer at identity transform omits transform attr', () => {
    const origOC = globalThis.OffscreenCanvas
    const mockCtx = {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: () => {},
    }
    // @ts-ignore
    globalThis.OffscreenCanvas = class {
      width: number
      height: number
      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }
      getContext() {
        return mockCtx
      }
    }

    const { storeRasterData, deleteRasterData } = require('@/store/raster-data')
    const chunkId = 'raster-identity-chunk'
    const fakeImageData = {
      data: new Uint8ClampedArray(2 * 2 * 4),
      width: 2,
      height: 2,
      colorSpace: 'srgb',
    } as unknown as ImageData
    storeRasterData(chunkId, fakeImageData)

    const rasterLayer: RasterLayer = {
      id: 'r2',
      name: 'RasterId',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(), // identity
      effects: [],
      imageChunkId: chunkId,
      width: 2,
      height: 2,
    }
    const doc = createDoc([rasterLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<image')
    expect(svg).not.toContain('opacity=')
    // No transform attr for identity
    expect(svg).not.toContain('transform=')

    deleteRasterData(chunkId)
    if (origOC !== undefined) {
      globalThis.OffscreenCanvas = origOC
    } else {
      delete (globalThis as any).OffscreenCanvas
    }
  })

  test('hidden raster layer is skipped', () => {
    const rasterLayer: RasterLayer = {
      id: 'r-hidden',
      name: 'HiddenRaster',
      type: 'raster',
      visible: false,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform(),
      effects: [],
      imageChunkId: 'no-chunk',
      width: 10,
      height: 10,
    }
    const doc = createDoc([rasterLayer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).not.toContain('<image')
  })

  // ── Vector layer with stroke props (lines 207-216) ──

  test('vector layer with full stroke properties', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      stroke: {
        color: '#0000ff',
        width: 3,
        opacity: 0.5,
        position: 'center',
        linecap: 'round',
        linejoin: 'bevel',
        miterLimit: 4,
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('stroke="#0000ff"')
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('stroke-opacity="0.5"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('stroke-linejoin="bevel"')
  })

  test('vector layer with stroke at full opacity omits stroke-opacity', () => {
    const layer = mkVectorLayer({
      fill: null,
      stroke: {
        color: '#000000',
        width: 1,
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('stroke="#000000"')
    expect(svg).not.toContain('stroke-opacity')
  })

  test('vector layer with stroke and empty dasharray omits dasharray', () => {
    const layer = mkVectorLayer({
      fill: null,
      stroke: {
        color: '#000000',
        width: 1,
        opacity: 1,
        position: 'center',
        linecap: 'butt',
        linejoin: 'miter',
        miterLimit: 4,
        dasharray: [],
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).not.toContain('stroke-dasharray')
  })

  // ── Vector layer with transform wrapping (lines 148-224) ──

  test('vector layer with transform wraps in <g>', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      transform: mkTransform({ x: 50, y: 50 }),
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<g ')
    expect(svg).toContain('translate(50 50)')
    expect(svg).toContain('</g>')
  })

  test('vector layer with opacity < 1 wraps in <g> with opacity', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      opacity: 0.3,
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<g ')
    expect(svg).toContain('opacity="0.3"')
  })

  test('vector layer with scale transform wraps correctly', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      transform: mkTransform({ scaleX: 2, scaleY: 0.5 }),
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('scale(2 0.5)')
  })

  test('vector layer with rotation transform wraps correctly', () => {
    const layer = mkVectorLayer({
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      transform: mkTransform({ rotation: 90 }),
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('rotate(90)')
  })

  // ── Gradient fill with radial gradient ref (lines 190-194) ──

  test('radial gradient fill emits url ref with fill-opacity', () => {
    const gradient: Gradient = {
      id: 'radial-ref',
      name: 'RadRef',
      type: 'radial',
      angle: 0,
      x: 0.5,
      y: 0.5,
      radius: 0.5,
      stops: [
        { offset: 0, color: '#ff0000', opacity: 1 },
        { offset: 1, color: '#0000ff', opacity: 1 },
      ],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 0.7 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('fill="url(#radial-ref)"')
    expect(svg).toContain('fill-opacity="0.7"')
  })

  // ── Box gradient with no stops fallback (lines 195-199) ──

  test('box gradient fill with no stops falls back to #000000', () => {
    const gradient: Gradient = {
      id: 'box-empty',
      name: 'Box',
      type: 'box',
      angle: 0,
      x: 0.5,
      y: 0.5,
      stops: [],
      dithering: { enabled: false, algorithm: 'none', strength: 0, seed: 0 },
    }
    const layer = mkVectorLayer({
      fill: { type: 'gradient', gradient, opacity: 1 },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    // stops[0]?.color ?? '#000000'
    expect(svg).toContain('fill="#000000"')
  })

  // ── downloadSVG (lines 413-421) ──

  test('downloadSVG creates and clicks a download link', () => {
    const origDoc = globalThis.document
    const origURL = globalThis.URL

    let clickedHref = ''
    let clickedDownload = ''
    let revokedUrl = ''

    // @ts-ignore
    globalThis.document = {
      createElement: () =>
        ({
          href: '',
          download: '',
          click() {
            clickedHref = this.href
            clickedDownload = this.download
          },
        }) as any,
    }
    // @ts-ignore
    globalThis.URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: (url: string) => {
        revokedUrl = url
      },
    }

    downloadSVG('<svg></svg>', 'test.svg')
    expect(clickedHref).toBe('blob:mock-url')
    expect(clickedDownload).toBe('test.svg')
    expect(revokedUrl).toBe('blob:mock-url')

    globalThis.document = origDoc
    globalThis.URL = origURL
  })

  test('downloadSVG uses default filename when not specified', () => {
    const origDoc = globalThis.document
    const origURL = globalThis.URL

    let downloadName = ''
    // @ts-ignore
    globalThis.document = {
      createElement: () =>
        ({
          href: '',
          download: '',
          click() {
            downloadName = this.download
          },
        }) as any,
    }
    // @ts-ignore
    globalThis.URL = {
      createObjectURL: () => 'blob:url',
      revokeObjectURL: () => {},
    }

    downloadSVG('<svg></svg>')
    expect(downloadName).toBe('export.svg')

    globalThis.document = origDoc
    globalThis.URL = origURL
  })

  // ── Group layer with nested group and scale transform ──

  test('nested groups render correct hierarchy', () => {
    const innerLayer = mkVectorLayer({
      id: 'inner-vec',
      fill: { type: 'solid', color: '#00ff00', opacity: 1 },
    })
    const innerGroup: GroupLayer = {
      id: 'inner-grp',
      name: 'Inner Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform({ x: 5, y: 5 }),
      effects: [],
      children: [innerLayer],
    }
    const outerGroup: GroupLayer = {
      id: 'outer-grp',
      name: 'Outer Group',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 0.9,
      blendMode: 'normal',
      transform: mkTransform({ x: 10, y: 10 }),
      effects: [],
      children: [innerGroup],
    }
    const doc = createDoc([outerGroup])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('translate(10 10)')
    expect(svg).toContain('translate(5 5)')
    expect(svg).toContain('opacity="0.9"')
    // Inner group at opacity 1 should not have opacity attr
    // Both groups should open and close
    const gCount = (svg.match(/<g[\s>]/g) || []).length
    expect(gCount).toBeGreaterThanOrEqual(2)
  })

  // ── Group with scale and rotation transforms ──

  test('group with scale and rotation transforms', () => {
    const child = mkVectorLayer({ id: 'c1', fill: { type: 'solid', color: '#000', opacity: 1 } })
    const group: GroupLayer = {
      id: 'g-complex',
      name: 'Complex',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: mkTransform({ scaleX: 2, scaleY: 3, rotation: 90 }),
      effects: [],
      children: [child],
    }
    const doc = createDoc([group])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('scale(2 3)')
    expect(svg).toContain('rotate(90)')
  })

  // ── Multiple layers in artboard ──

  test('multiple layers render in order', () => {
    const l1 = mkVectorLayer({ id: 'v-first', fill: { type: 'solid', color: '#111111', opacity: 1 } })
    const l2 = mkVectorLayer({ id: 'v-second', fill: { type: 'solid', color: '#222222', opacity: 1 } })
    const doc = createDoc([l1, l2])
    const svg = exportArtboardToSVG(doc)
    const idx1 = svg.indexOf('#111111')
    const idx2 = svg.indexOf('#222222')
    expect(idx1).toBeLessThan(idx2)
  })

  // ── Vector with mask but no wrapping group (identity transform, full opacity) ──

  test('vector layer with mask at identity transform still clips correctly', () => {
    const layer = mkVectorLayer({
      id: 'masked-identity',
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      mask: {
        id: 'mask-id',
        name: 'Mask',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: mkTransform(),
        effects: [],
        paths: [
          {
            id: 'mp1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 10, y: 10 },
            ],
            closed: false,
          },
        ],
        fill: null,
        stroke: null,
      },
    })
    const doc = createDoc([layer])
    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<clipPath')
    expect(svg).toContain('id="clip-masked-identity"')
  })
})
