import { describe, it, expect } from 'vitest'
import { encodeDocument, decodeDocument } from '@/io/file-format'
import type { DesignDocument } from '@/types'

function createTestDocument(): DesignDocument {
  return {
    id: 'test-doc-001',
    metadata: {
      title: 'Test Document',
      author: 'Nicole',
      created: '2026-03-07T00:00:00.000Z',
      modified: '2026-03-07T00:00:00.000Z',
      colorspace: 'srgb',
      width: 1920,
      height: 1080,
    },
    artboards: [
      {
        id: 'artboard-001',
        name: 'Main',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        backgroundColor: '#ffffff',
        layers: [
          {
            id: 'layer-001',
            name: 'Rectangle',
            type: 'vector',
            visible: true,
            locked: false,
            opacity: 0.8,
            blendMode: 'normal',
            transform: {
              x: 100,
              y: 50,
              scaleX: 1,
              scaleY: 1,
              rotation: 45,
            },
            effects: [],
            paths: [
              {
                id: 'path-001',
                segments: [
                  { type: 'move', x: 0, y: 0 },
                  { type: 'line', x: 200, y: 0 },
                  { type: 'line', x: 200, y: 100 },
                  { type: 'line', x: 0, y: 100 },
                  { type: 'close' },
                ],
                closed: true,
              },
              {
                id: 'path-002',
                segments: [
                  { type: 'move', x: 50, y: 50 },
                  {
                    type: 'cubic',
                    x: 150,
                    y: 50,
                    cp1x: 80,
                    cp1y: 0,
                    cp2x: 120,
                    cp2y: 0,
                  },
                  {
                    type: 'quadratic',
                    x: 200,
                    y: 100,
                    cpx: 175,
                    cpy: 50,
                  },
                  { type: 'close' },
                ],
                closed: true,
              },
            ],
            fill: { type: 'solid', color: '#ff0000', opacity: 1.0 },
            stroke: {
              width: 2,
              color: '#000000',
              opacity: 1.0,
              position: 'center',
              linecap: 'round',
              linejoin: 'miter',
              miterLimit: 10,
            },
          },
        ],
      },
      {
        id: 'artboard-002',
        name: 'Empty Board',
        x: 2020,
        y: 0,
        width: 800,
        height: 600,
        backgroundColor: '#f0f0f0',
        layers: [],
      },
    ],
    assets: {
      gradients: [
        {
          id: 'grad-001',
          name: 'Sunset',
          type: 'linear',
          angle: 90,
          x: 0.5,
          y: 0.5,
          stops: [
            { offset: 0, color: '#ff0000', opacity: 1 },
            { offset: 0.5, color: '#ffff00', opacity: 1 },
            { offset: 1, color: '#0000ff', opacity: 1 },
          ],
          dithering: {
            enabled: false,
            algorithm: 'none',
            strength: 0,
            seed: 0,
          },
        },
      ],
      patterns: [],
      colors: [
        { id: 'color-001', name: 'Red', value: '#ff0000', group: 'Primary' },
        { id: 'color-002', name: 'Blue', value: '#0000ff', group: 'Primary' },
      ],
    },
  }
}

describe('File format round-trip', () => {
  it('should encode and decode a document without data loss', () => {
    const original = createTestDocument()
    const encoded = encodeDocument(original)
    const decoded = decodeDocument(encoded)

    expect(decoded.id).toBe(original.id)
    expect(decoded.metadata).toEqual(original.metadata)
    expect(decoded.artboards).toHaveLength(2)
    expect(decoded.artboards[0]!.layers).toHaveLength(1)
    expect(decoded.artboards[0]!.layers[0]!.type).toBe('vector')

    const originalLayer = original.artboards[0]!.layers[0]!
    const decodedLayer = decoded.artboards[0]!.layers[0]!
    expect(decodedLayer).toEqual(originalLayer)

    expect(decoded.assets.gradients).toEqual(original.assets.gradients)
    expect(decoded.assets.colors).toEqual(original.assets.colors)
  })

  it('should preserve bezier curve data through round-trip', () => {
    const original = createTestDocument()
    const encoded = encodeDocument(original)
    const decoded = decodeDocument(encoded)

    const layer = decoded.artboards[0]!.layers[0]!
    if (layer.type !== 'vector') throw new Error('Expected vector layer')

    const cubicPath = layer.paths[1]!
    const cubicSeg = cubicPath.segments[1]!
    expect(cubicSeg.type).toBe('cubic')
    if (cubicSeg.type === 'cubic') {
      expect(cubicSeg.cp1x).toBe(80)
      expect(cubicSeg.cp1y).toBe(0)
      expect(cubicSeg.cp2x).toBe(120)
      expect(cubicSeg.cp2y).toBe(0)
      expect(cubicSeg.x).toBe(150)
      expect(cubicSeg.y).toBe(50)
    }
  })

  it('should reject files with bad magic', () => {
    const buffer = new ArrayBuffer(16)
    const bytes = new Uint8Array(buffer)
    // Write wrong magic
    for (let i = 0; i < 6; i++) bytes[i] = 'BADMAG'.charCodeAt(i)

    expect(() => decodeDocument(buffer)).toThrow('bad magic')
  })

  it('should reject files with unsupported version', () => {
    const original = createTestDocument()
    const encoded = encodeDocument(original)

    // Tamper with version field
    const view = new DataView(encoded)
    view.setUint32(6, 999, true)

    expect(() => decodeDocument(encoded)).toThrow('Unsupported .xd version')
  })

  it('should produce compact binary output', () => {
    const original = createTestDocument()
    const encoded = encodeDocument(original)
    const jsonSize = new TextEncoder().encode(JSON.stringify(original)).byteLength

    // MessagePack should be smaller than JSON
    expect(encoded.byteLength).toBeLessThan(jsonSize)
  })
})
