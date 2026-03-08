/**
 * E2E SVG round-trip tests using real-world open-source SVG fixtures.
 *
 * Fixture sources & licenses:
 *   si-*        — Simple Icons (CC0)         https://github.com/simple-icons/simple-icons
 *   feather-*   — Feather Icons (MIT)        https://github.com/feathericons/feather
 *   phosphor-*  — Phosphor Icons (MIT)       https://github.com/phosphor-icons/core
 *   bs-*        — Bootstrap Icons (MIT)      https://github.com/twbs/icons
 *   lucide-*    — Lucide Icons (ISC)         https://github.com/lucide-icons/lucide
 *   lyku-*      — Lyku project assets
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { importSVG } from '@/io/svg-import'
import { exportArtboardToSVG } from '@/io/svg-export'
import { encodeDocument, decodeDocument } from '@/io/file-format'
import { segmentsToSVGPath } from '@/math/path'
import type { VectorLayer, Layer, DesignDocument } from '@/types'

beforeAll(() => {
  const dom = new JSDOM('')
  ;(globalThis as any).DOMParser = dom.window.DOMParser
})

// ── Load all fixtures ────────────────────────────────────────────────

const FIXTURES_DIR = join(__dirname, 'fixtures', 'svg')
const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort()

const fixtures: Record<string, string> = {}
for (const file of fixtureFiles) {
  fixtures[file.replace('.svg', '')] = readFileSync(join(FIXTURES_DIR, file), 'utf-8')
}

// ── Helpers ──────────────────────────────────────────────────────────

function collectVectorLayers(layers: Layer[]): VectorLayer[] {
  const result: VectorLayer[] = []
  for (const l of layers) {
    if (l.type === 'vector') result.push(l)
    if (l.type === 'group') result.push(...collectVectorLayers(l.children))
  }
  return result
}

function collectAllLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const l of layers) {
    result.push(l)
    if (l.type === 'group') result.push(...collectAllLayers(l.children))
  }
  return result
}

function roundTripDesign(doc: DesignDocument): DesignDocument {
  return decodeDocument(encodeDocument(doc))
}

// ── Test: every fixture imports without throwing ─────────────────────

describe('SVG fixtures: import succeeds', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: imports without error`, () => {
      const doc = importSVG(svg)
      expect(doc.artboards.length).toBeGreaterThanOrEqual(1)
      expect(doc.artboards[0]!.width).toBeGreaterThan(0)
      expect(doc.artboards[0]!.height).toBeGreaterThan(0)
    })
  }
})

// ── Test: every fixture produces at least one layer ──────────────────

describe('SVG fixtures: produces layers', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: has at least one layer`, () => {
      const doc = importSVG(svg)
      const all = collectAllLayers(doc.artboards[0]!.layers)
      expect(all.length).toBeGreaterThanOrEqual(1)
    })
  }
})

// ── Test: no layer has fill="currentColor" as a literal string ───────

describe('SVG fixtures: currentColor resolved', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    if (!svg.includes('currentColor')) continue
    test(`${name}: currentColor resolved to concrete color`, () => {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      for (const v of vecs) {
        if (v.fill?.type === 'solid') {
          expect(v.fill.color).not.toBe('currentColor')
        }
        if (v.stroke) {
          expect(v.stroke.color).not.toBe('currentColor')
        }
      }
    })
  }
})

// ── Test: export produces valid SVG with no currentColor ─────────────

describe('SVG fixtures: export produces clean SVG', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: exports valid SVG`, () => {
      const doc = importSVG(svg)
      const exported = exportArtboardToSVG(doc)
      expect(exported).toContain('<svg')
      expect(exported).toContain('</svg>')
      expect(exported).not.toContain('currentColor')
      expect(exported).not.toContain('undefined')
      expect(exported).not.toContain('NaN')
    })
  }
})

// ── Test: all vector layers have valid path segments ─────────────────

describe('SVG fixtures: path segments valid', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: all segments have valid coordinates`, () => {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      for (const v of vecs) {
        for (const path of v.paths) {
          expect(path.segments.length).toBeGreaterThan(0)
          for (const seg of path.segments) {
            if ('x' in seg) {
              expect(isFinite(seg.x)).toBe(true)
              expect(isFinite(seg.y)).toBe(true)
            }
            if (seg.type === 'cubic') {
              expect(isFinite(seg.cp1x)).toBe(true)
              expect(isFinite(seg.cp1y)).toBe(true)
              expect(isFinite(seg.cp2x)).toBe(true)
              expect(isFinite(seg.cp2y)).toBe(true)
            }
            if (seg.type === 'arc') {
              expect(isFinite(seg.rx)).toBe(true)
              expect(isFinite(seg.ry)).toBe(true)
            }
          }
        }
      }
    })
  }
})

// ── Test: path d strings survive import→export→re-parse ──────────────

describe('SVG fixtures: path data round-trip', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: segment→d→segment round-trip stable`, () => {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      const { parseSVGPathD } = require('@/io/svg-import')

      for (const v of vecs) {
        for (const path of v.paths) {
          const d = segmentsToSVGPath(path.segments)
          const reparsed = parseSVGPathD(d)
          expect(reparsed.length).toBe(path.segments.length)

          for (let i = 0; i < path.segments.length; i++) {
            expect(reparsed[i]!.type).toBe(path.segments[i]!.type)
          }
        }
      }
    })
  }
})

// ── Test: export→reimport preserves layer count ──────────────────────

describe('SVG fixtures: double round-trip layer count', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: export→reimport has >= original vector count`, () => {
      const doc1 = importSVG(svg)
      const exported = exportArtboardToSVG(doc1)
      const doc2 = importSVG(exported)

      const vecs1 = collectVectorLayers(doc1.artboards[0]!.layers)
      const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)

      // doc2 may have +1 from the background rect export adds
      expect(vecs2.length).toBeGreaterThanOrEqual(vecs1.length)
    })
  }
})

// ── Test: .design binary round-trip produces identical export ────────

describe('SVG fixtures: .design binary round-trip', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: import→encode→decode→export matches direct export`, () => {
      const doc1 = importSVG(svg)
      const doc2 = roundTripDesign(doc1)
      const svg1 = exportArtboardToSVG(doc1)
      const svg2 = exportArtboardToSVG(doc2)
      expect(svg2).toBe(svg1)
    })
  }
})

// ── Test: export→reimport preserves all original path data ───────────

describe('SVG fixtures: path data survives double round-trip', () => {
  for (const [name, svg] of Object.entries(fixtures)) {
    test(`${name}: all original paths found after export→reimport`, () => {
      const doc1 = importSVG(svg)
      const exported = exportArtboardToSVG(doc1)
      const doc2 = importSVG(exported)

      const vecs1 = collectVectorLayers(doc1.artboards[0]!.layers)
      const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)

      // Every original path d should exist in the reimported doc
      for (const v1 of vecs1) {
        const d1 = segmentsToSVGPath(v1.paths[0]!.segments)
        const match = vecs2.find((v2) => segmentsToSVGPath(v2.paths[0]!.segments) === d1)
        expect(match).toBeDefined()
      }
    })
  }
})

// ── Feature-specific tests ───────────────────────────────────────────

describe('SVG fixtures: Simple Icons (complex bezier paths)', () => {
  const siFixtures = Object.entries(fixtures).filter(([n]) => n.startsWith('si-'))

  test('all Simple Icons have a single vector layer with cubics', () => {
    for (const [, svg] of siFixtures) {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      expect(vecs.length).toBeGreaterThanOrEqual(1)

      // Simple Icons paths are complex — should have cubic segments
      const allSegs = vecs.flatMap((v) => v.paths.flatMap((p) => p.segments))
      const hasCubics = allSegs.some((s) => s.type === 'cubic')
      expect(hasCubics).toBe(true)
    }
  })

  test('Simple Icons viewBox is 24x24', () => {
    for (const [, svg] of siFixtures) {
      const doc = importSVG(svg)
      expect(doc.artboards[0]!.width).toBe(24)
      expect(doc.artboards[0]!.height).toBe(24)
    }
  })
})

describe('SVG fixtures: Feather Icons (stroke-based)', () => {
  const featherFixtures = Object.entries(fixtures).filter(([n]) => n.startsWith('feather-'))

  test('all Feather Icons have strokes and no fills', () => {
    for (const [, svg] of featherFixtures) {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)

      for (const v of vecs) {
        // Feather uses stroke="currentColor" fill="none"
        expect(v.fill).toBeNull()
        expect(v.stroke).not.toBeNull()
        expect(v.stroke!.color).not.toBe('currentColor')
        expect(v.stroke!.linecap).toBe('round')
        expect(v.stroke!.linejoin).toBe('round')
      }
    }
  })

  test('Feather stroke properties preserved in export', () => {
    for (const [, svg] of featherFixtures) {
      const doc = importSVG(svg)
      const exported = exportArtboardToSVG(doc)
      expect(exported).toContain('stroke-linecap="round"')
      expect(exported).toContain('stroke-linejoin="round"')
      expect(exported).toContain('stroke-width="2"')
    }
  })
})

describe('SVG fixtures: Phosphor duotone (opacity layers)', () => {
  const phosphorFixtures = Object.entries(fixtures).filter(([n]) => n.startsWith('phosphor-'))

  test('Phosphor duotone icons have paths with opacity < 1', () => {
    for (const [, svg] of phosphorFixtures) {
      const doc = importSVG(svg)
      const allLayers = collectAllLayers(doc.artboards[0]!.layers)
      const hasSubOpacity = allLayers.some((l) => l.opacity < 1)
      expect(hasSubOpacity).toBe(true)
    }
  })

  test('Phosphor viewBox is 256x256', () => {
    for (const [, svg] of phosphorFixtures) {
      const doc = importSVG(svg)
      expect(doc.artboards[0]!.width).toBe(256)
      expect(doc.artboards[0]!.height).toBe(256)
    }
  })
})

describe('SVG fixtures: Bootstrap Icons (16x16, compound paths)', () => {
  const bsFixtures = Object.entries(fixtures).filter(([n]) => n.startsWith('bs-'))

  test('Bootstrap Icons viewBox is 16x16', () => {
    for (const [, svg] of bsFixtures) {
      const doc = importSVG(svg)
      expect(doc.artboards[0]!.width).toBe(16)
      expect(doc.artboards[0]!.height).toBe(16)
    }
  })

  test('Bootstrap Icons fill resolved from currentColor', () => {
    for (const [, svg] of bsFixtures) {
      const doc = importSVG(svg)
      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      for (const v of vecs) {
        if (v.fill?.type === 'solid') {
          expect(v.fill.color).toBe('#000000')
        }
      }
    }
  })
})

describe('SVG fixtures: Lyku assets (groups, transforms, gradients)', () => {
  test('lyku-ios: group with matrix scale preserved', () => {
    const doc = importSVG(fixtures['lyku-ios']!)
    const layers = doc.artboards[0]!.layers
    const group = layers.find((l) => l.type === 'group')!
    expect(group.type).toBe('group')
    expect(group.transform.scaleX).toBeCloseTo(0.472, 2)
    expect(group.transform.scaleY).toBeCloseTo(0.472, 2)

    // Export preserves scale
    const exported = exportArtboardToSVG(doc)
    expect(exported).toContain('scale(')
    // All 3 paths present (frame + 2 apple logo parts)
    const pathCount = (exported.match(/<path /g) || []).length
    expect(pathCount).toBe(3)
  })

  test('lyku-coswall: circles and ellipses with gradients', () => {
    const doc = importSVG(fixtures['lyku-coswall']!)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    expect(vecs.length).toBeGreaterThan(5)

    const gradientLayers = vecs.filter((v) => v.fill?.type === 'gradient')
    expect(gradientLayers.length).toBeGreaterThanOrEqual(1)
  })

  test('lyku-gamepad: currentColor fill is black', () => {
    const doc = importSVG(fixtures['lyku-gamepad']!)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    expect(vecs.length).toBeGreaterThanOrEqual(1)
    expect(vecs[0]!.fill?.type).toBe('solid')
    if (vecs[0]!.fill?.type === 'solid') {
      expect(vecs[0]!.fill.color).toBe('#000000')
    }
  })

  test('lyku-linux: complex path icon preserved', () => {
    const doc = importSVG(fixtures['lyku-linux']!)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    expect(vecs.length).toBeGreaterThanOrEqual(1)

    // Should have path segments and a fill
    const totalSegs = vecs.reduce((sum, v) => sum + v.paths[0]!.segments.length, 0)
    expect(totalSegs).toBeGreaterThan(10)
  })
})

describe('SVG fixtures: Lucide Icons (stroke-based, ISC)', () => {
  const lucideFixtures = Object.entries(fixtures).filter(([n]) => n.startsWith('lucide-'))

  test('Lucide Icons have strokes and proper viewBox', () => {
    for (const [, svg] of lucideFixtures) {
      const doc = importSVG(svg)
      expect(doc.artboards[0]!.width).toBe(24)
      expect(doc.artboards[0]!.height).toBe(24)

      const vecs = collectVectorLayers(doc.artboards[0]!.layers)
      for (const v of vecs) {
        expect(v.stroke).not.toBeNull()
      }
    }
  })
})
