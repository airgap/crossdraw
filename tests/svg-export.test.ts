import { describe, it, expect } from 'vitest'
import { exportArtboardToSVG } from '@/io/svg-export'
import type { DesignDocument, VectorLayer } from '@/types'

function createTestDoc(layers: VectorLayer[]): DesignDocument {
  return {
    id: 'doc-1',
    metadata: {
      title: 'Test',
      author: '',
      created: '',
      modified: '',
      colorspace: 'srgb',
      width: 800,
      height: 600,
    },
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

describe('SVG export', () => {
  it('should export a basic rectangle path', () => {
    const doc = createTestDoc([
      {
        id: 'l1',
        name: 'Rect',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'p1',
            segments: [
              { type: 'move', x: 10, y: 10 },
              { type: 'line', x: 100, y: 10 },
              { type: 'line', x: 100, y: 80 },
              { type: 'line', x: 10, y: 80 },
              { type: 'close' },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid', color: '#ff0000', opacity: 1 },
        stroke: null,
      },
    ])

    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('<svg')
    expect(svg).toContain('width="800"')
    expect(svg).toContain('height="600"')
    expect(svg).toContain('fill="#ff0000"')
    expect(svg).toContain('M10 10')
    expect(svg).toContain('Z')
  })

  it('should include stroke attributes', () => {
    const doc = createTestDoc([
      {
        id: 'l1',
        name: 'Stroked',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'p1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 50, y: 50 },
            ],
            closed: false,
          },
        ],
        fill: null,
        stroke: {
          color: '#00ff00',
          width: 3,
          opacity: 0.8,
          position: 'center',
          linecap: 'round',
          linejoin: 'round',
          miterLimit: 4,
        },
      },
    ])

    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('stroke="#00ff00"')
    expect(svg).toContain('stroke-width="3"')
    expect(svg).toContain('stroke-opacity="0.8"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('fill="none"')
  })

  it('should apply transform group when layer has non-identity transform', () => {
    const doc = createTestDoc([
      {
        id: 'l1',
        name: 'Transformed',
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 0.5,
        blendMode: 'normal',
        transform: { x: 10, y: 20, scaleX: 2, scaleY: 1, rotation: 45 },
        effects: [],
        paths: [
          {
            id: 'p1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 50, y: 0 },
            ],
            closed: false,
          },
        ],
        fill: { type: 'solid', color: '#000', opacity: 1 },
        stroke: null,
      },
    ])

    const svg = exportArtboardToSVG(doc)
    expect(svg).toContain('translate(10 20)')
    expect(svg).toContain('scale(2 1)')
    expect(svg).toContain('rotate(45)')
    expect(svg).toContain('opacity="0.5"')
  })

  it('should skip invisible layers', () => {
    const doc = createTestDoc([
      {
        id: 'l1',
        name: 'Hidden',
        type: 'vector',
        visible: false,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'p1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 50, y: 50 },
            ],
            closed: false,
          },
        ],
        fill: { type: 'solid', color: '#ff0000', opacity: 1 },
        stroke: null,
      },
    ])

    const svg = exportArtboardToSVG(doc)
    expect(svg).not.toContain('<path')
  })
})
