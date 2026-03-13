/**
 * Tests for miscellaneous features:
 * #76  Float pipeline
 * #77  HDR / tone mapping
 * #78  Overprint preview
 * #79  Color separations
 * #81  Font matching
 * #84  Paragraph/Character styles
 * #93  Shared libraries
 * #94  Smart animate
 * #95  Interactive components
 * #96  Code generation
 * #97  Website publishing
 * #98  LiveSketch
 */

import { describe, test, expect } from 'bun:test'

// #76 — Float Pipeline
import {
  imageDataToFloat32,
  float32ToImageData,
  applyFilterFloat32,
  createFloat32Image,
  srgbToLinear,
  linearToSrgb,
} from '@/color/float-pipeline'

// #77 — HDR
import { toneMapReinhard, toneMapACES, isHdrDisplay } from '@/color/hdr'

// #78 — Overprint
import { applyOverprintPreview, imageDataToCMYK, DEFAULT_OVERPRINT_SETTINGS } from '@/color/overprint'

// #79 — Separations
import { generateSeparationPlates, tintPlate } from '@/color/separations'

// #81 — Font matching
import { matchFont, analyseTextRegion, FONT_METRICS_DB } from '@/tools/font-match'

// #84 — Text styles
import { TextStyleManager, createDefaultCharacterStyle, createDefaultParagraphStyle } from '@/ui/text-styles'

// #93 — Shared libraries
import { SharedLibraryManager, createSharedLibrary } from '@/collab/shared-libraries'

// #94 — Smart animate
import {
  computeLayerTransition,
  buildTransitionPlan,
  computeTransitionFrame,
  DEFAULT_SMART_ANIMATE_SETTINGS,
} from '@/animation/smart-animate'

// #95 — Interactive components
import { InteractiveComponentManager, createInteractiveComponent } from '@/ui/interactive-components'

// #96 — Code generation
import { generateCSS, generateSwiftUI, generateXML } from '@/io/code-gen'

// #97 — Website export
import { exportStaticSite, DEFAULT_WEBSITE_EXPORT_SETTINGS } from '@/io/website-export'

// #98 — LiveSketch
import {
  beginLiveSketch,
  addLiveSketchPoint,
  finalizeLiveSketch,
  getLiveSketchPreview,
  setLiveSketchSettings,
  getLiveSketchSettings,
  rdpSimplify,
  fitCurves,
  DEFAULT_LIVE_SKETCH_SETTINGS,
} from '@/tools/live-sketch'

import type { Layer, VectorLayer, TextLayer, RasterLayer, GroupLayer, DesignDocument, Transform } from '@/types'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeImageData(
  width: number,
  height: number,
  fill: [number, number, number, number] = [128, 128, 128, 255],
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0]
    data[i + 1] = fill[1]
    data[i + 2] = fill[2]
    data[i + 3] = fill[3]
  }
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData
}

function makeTransform(overrides?: Partial<Transform>): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    ...overrides,
  }
}

function makeVectorLayer(overrides?: Partial<VectorLayer>): VectorLayer {
  return {
    id: 'vec-1',
    name: 'Vector',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    paths: [],
    fill: { type: 'solid', color: '#ff0000', opacity: 1 },
    stroke: {
      width: 2,
      color: '#000000',
      opacity: 1,
      position: 'center',
      linecap: 'butt',
      linejoin: 'miter',
      miterLimit: 4,
    },
    ...overrides,
  }
}

function makeTextLayer(overrides?: Partial<TextLayer>): TextLayer {
  return {
    id: 'txt-1',
    name: 'Hello',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    text: 'Hello World',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#333333',
    ...overrides,
  }
}

function makeRasterLayer(overrides?: Partial<RasterLayer>): RasterLayer {
  return {
    id: 'rast-1',
    name: 'Image',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    imageChunkId: 'chunk-1',
    width: 100,
    height: 100,
    ...overrides,
  }
}

function makeGroupLayer(children: Layer[], overrides?: Partial<GroupLayer>): GroupLayer {
  return {
    id: 'grp-1',
    name: 'Group',
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: makeTransform(),
    children,
    ...overrides,
  }
}

function makeDocument(layers?: Layer[]): DesignDocument {
  return {
    id: 'doc-1',
    metadata: {
      title: 'Test Doc',
      author: 'Test',
      created: '2025-01-01T00:00:00Z',
      modified: '2025-01-01T00:00:00Z',
      colorspace: 'srgb',
      width: 800,
      height: 600,
    },
    artboards: [
      {
        id: 'ab-1',
        name: 'Page 1',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        backgroundColor: '#ffffff',
        layers: layers ?? [makeTextLayer(), makeVectorLayer()],
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// #76 — Float Pipeline
// ══════════════════════════════════════════════════════════════════════════════

describe('#76 — Float Pipeline', () => {
  test('srgbToLinear and linearToSrgb are inverse for 0', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(linearToSrgb(0)).toBe(0)
  })

  test('srgbToLinear and linearToSrgb are inverse for 1', () => {
    expect(Math.abs(linearToSrgb(srgbToLinear(1)) - 1)).toBeLessThan(0.001)
  })

  test('srgbToLinear(0.5) returns correct value', () => {
    const linear = srgbToLinear(0.5)
    expect(linear).toBeGreaterThan(0.2)
    expect(linear).toBeLessThan(0.3)
  })

  test('createFloat32Image returns correctly sized data', () => {
    const img = createFloat32Image(10, 20)
    expect(img.width).toBe(10)
    expect(img.height).toBe(20)
    expect(img.channels).toBe(4)
    expect(img.data.length).toBe(10 * 20 * 4)
  })

  test('imageDataToFloat32 converts uint8 to linear float', () => {
    const img = makeImageData(2, 2, [255, 0, 128, 255])
    const f32 = imageDataToFloat32(img)
    expect(f32.width).toBe(2)
    expect(f32.height).toBe(2)
    expect(f32.data[0]).toBeCloseTo(1.0, 1) // R=255 → ~1.0 linear
    expect(f32.data[1]).toBeCloseTo(0.0, 1) // G=0 → 0.0 linear
    expect(f32.data[3]).toBeCloseTo(1.0, 1) // A=255 → 1.0
  })

  test('float32ToImageData converts back to uint8 sRGB', () => {
    const img = makeImageData(2, 2, [200, 100, 50, 255])
    const f32 = imageDataToFloat32(img)
    const back = float32ToImageData(f32)
    // Should round-trip within +-1 due to rounding
    expect(Math.abs(back.data[0]! - 200)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.data[1]! - 100)).toBeLessThanOrEqual(1)
    expect(Math.abs(back.data[2]! - 50)).toBeLessThanOrEqual(1)
    expect(back.data[3]).toBe(255)
  })

  test('applyFilterFloat32 applies filter in float space', () => {
    const img = createFloat32Image(2, 2)
    img.data[0] = 0.5
    img.data[1] = 0.5
    img.data[2] = 0.5
    img.data[3] = 1.0

    const brightened = applyFilterFloat32(img, (input) => {
      const out = createFloat32Image(input.width, input.height)
      for (let i = 0; i < input.data.length; i++) {
        out.data[i] = input.data[i]! * 2
      }
      return out
    })

    expect(brightened.data[0]).toBeCloseTo(1.0, 5)
  })

  test('float32ToImageData handles HDR values > 1.0', () => {
    const img = createFloat32Image(1, 1)
    img.data[0] = 5.0 // HDR red
    img.data[1] = 0.0
    img.data[2] = 0.0
    img.data[3] = 1.0

    const result = float32ToImageData(img)
    // HDR value should be tone-mapped, resulting in a value < 255 but > 200
    expect(result.data[0]).toBeGreaterThan(200)
    expect(result.data[0]).toBeLessThanOrEqual(255)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #77 — HDR / Tone Mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('#77 — HDR / Tone Mapping', () => {
  test('toneMapReinhard maps HDR values to displayable range', () => {
    const img = createFloat32Image(2, 1)
    // Pixel 1: HDR bright
    img.data[0] = 10.0
    img.data[1] = 5.0
    img.data[2] = 1.0
    img.data[3] = 1.0
    // Pixel 2: normal
    img.data[4] = 0.5
    img.data[5] = 0.5
    img.data[6] = 0.5
    img.data[7] = 1.0

    const result = toneMapReinhard(img, 0)
    expect(result.width).toBe(2)
    expect(result.height).toBe(1)
    // All output values should be 0-255
    for (let i = 0; i < result.data.length; i++) {
      expect(result.data[i]).toBeGreaterThanOrEqual(0)
      expect(result.data[i]).toBeLessThanOrEqual(255)
    }
  })

  test('toneMapReinhard exposure shifts brightness', () => {
    const img = createFloat32Image(1, 1)
    img.data[0] = 0.5
    img.data[1] = 0.5
    img.data[2] = 0.5
    img.data[3] = 1.0

    const dark = toneMapReinhard(img, -2)
    const bright = toneMapReinhard(img, 2)

    expect(bright.data[0]!).toBeGreaterThan(dark.data[0]!)
  })

  test('toneMapACES maps HDR to displayable range', () => {
    const img = createFloat32Image(1, 1)
    img.data[0] = 20.0
    img.data[1] = 10.0
    img.data[2] = 0.1
    img.data[3] = 1.0

    const result = toneMapACES(img)
    expect(result.data[0]!).toBeGreaterThan(0)
    expect(result.data[0]!).toBeLessThanOrEqual(255)
    expect(result.data[1]!).toBeGreaterThan(0)
    expect(result.data[2]!).toBeGreaterThan(0)
  })

  test('toneMapACES preserves near-zero values', () => {
    const img = createFloat32Image(1, 1)
    img.data[0] = 0.01
    img.data[1] = 0.01
    img.data[2] = 0.01
    img.data[3] = 1.0

    const result = toneMapACES(img)
    expect(result.data[0]!).toBeGreaterThan(0)
    expect(result.data[0]!).toBeLessThan(50)
  })

  test('isHdrDisplay returns boolean', () => {
    const result = isHdrDisplay()
    expect(typeof result).toBe('boolean')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #78 — Overprint Preview
// ══════════════════════════════════════════════════════════════════════════════

describe('#78 — Overprint Preview', () => {
  test('imageDataToCMYK converts pure red correctly', () => {
    const img = makeImageData(1, 1, [255, 0, 0, 255])
    const cmyk = imageDataToCMYK(img)
    expect(cmyk.width).toBe(1)
    expect(cmyk.height).toBe(1)
    // Pure red: C=0, M=1, Y=1, K=0
    expect(cmyk.data[0]).toBeCloseTo(0, 1) // C
    expect(cmyk.data[1]).toBeCloseTo(1, 1) // M
    expect(cmyk.data[2]).toBeCloseTo(1, 1) // Y
    expect(cmyk.data[3]).toBeCloseTo(0, 1) // K
  })

  test('imageDataToCMYK converts pure black correctly', () => {
    const img = makeImageData(1, 1, [0, 0, 0, 255])
    const cmyk = imageDataToCMYK(img)
    expect(cmyk.data[3]).toBeCloseTo(1, 1) // K=1
  })

  test('applyOverprintPreview darkens when inks combine', () => {
    const bg = makeImageData(1, 1, [0, 255, 255, 255]) // cyan in RGB
    const fg = imageDataToCMYK(makeImageData(1, 1, [255, 0, 255, 255])) // magenta in RGB

    const result = applyOverprintPreview(bg, fg, DEFAULT_OVERPRINT_SETTINGS)
    // Overprint of cyan + magenta → should be darker than either alone
    // The combined pixel should have less brightness than the background
    const bgLum = 0.299 * 0 + 0.587 * 255 + 0.114 * 255
    const resultLum = 0.299 * result.data[0]! + 0.587 * result.data[1]! + 0.114 * result.data[2]!
    expect(resultLum).toBeLessThanOrEqual(bgLum)
  })

  test('applyOverprintPreview preserves alpha', () => {
    const bg = makeImageData(1, 1, [100, 100, 100, 200])
    const fg = imageDataToCMYK(makeImageData(1, 1, [200, 200, 200, 255]))
    const result = applyOverprintPreview(bg, fg, DEFAULT_OVERPRINT_SETTINGS)
    expect(result.data[3]).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #79 — Color Separations
// ══════════════════════════════════════════════════════════════════════════════

describe('#79 — Color Separations', () => {
  test('generateSeparationPlates returns 4 plates', () => {
    const img = makeImageData(4, 4)
    const plates = generateSeparationPlates(img)
    expect(plates.cyan).toBeTruthy()
    expect(plates.magenta).toBeTruthy()
    expect(plates.yellow).toBeTruthy()
    expect(plates.black).toBeTruthy()
  })

  test('plates have same dimensions as input', () => {
    const img = makeImageData(10, 20)
    const plates = generateSeparationPlates(img)
    expect(plates.cyan.width).toBe(10)
    expect(plates.cyan.height).toBe(20)
    expect(plates.black.width).toBe(10)
    expect(plates.black.height).toBe(20)
  })

  test('pure red produces no cyan', () => {
    const img = makeImageData(1, 1, [255, 0, 0, 255])
    const plates = generateSeparationPlates(img)
    expect(plates.cyan.data[0]).toBe(0)
  })

  test('pure black produces high K plate value', () => {
    const img = makeImageData(1, 1, [0, 0, 0, 255])
    const plates = generateSeparationPlates(img)
    expect(plates.black.data[0]!).toBeGreaterThan(100)
  })

  test('pure white produces no ink on any plate', () => {
    const img = makeImageData(1, 1, [255, 255, 255, 255])
    const plates = generateSeparationPlates(img)
    expect(plates.cyan.data[0]).toBe(0)
    expect(plates.magenta.data[0]).toBe(0)
    expect(plates.yellow.data[0]).toBe(0)
    expect(plates.black.data[0]).toBe(0)
  })

  test('tintPlate colours the grayscale plate', () => {
    const img = makeImageData(1, 1, [0, 0, 0, 255])
    const plates = generateSeparationPlates(img)
    const tinted = tintPlate(plates.cyan, [0, 255, 255])
    // Black → high density on K but low on C, so cyan tint should be dim
    expect(tinted.data[0]!).toBeGreaterThanOrEqual(0)
    expect(tinted.data[3]).toBe(255)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #81 — Font Matching
// ══════════════════════════════════════════════════════════════════════════════

describe('#81 — Font Matching', () => {
  test('FONT_METRICS_DB has entries', () => {
    expect(FONT_METRICS_DB.length).toBeGreaterThan(10)
  })

  test('analyseTextRegion returns valid metrics', () => {
    // Create a simple image with some dark pixels (simulating text)
    const width = 20
    const height = 20
    const data = new Uint8ClampedArray(width * height * 4)
    // Draw a horizontal bar (simulating text)
    for (let y = 5; y < 15; y++) {
      for (let x = 2; x < 18; x++) {
        const idx = (y * width + x) * 4
        data[idx] = 0 // dark
        data[idx + 1] = 0
        data[idx + 2] = 0
        data[idx + 3] = 255
      }
    }
    // Fill rest with white
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] !== 255) {
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
        data[i + 3] = 255
      }
    }
    const img = { data, width, height, colorSpace: 'srgb' } as unknown as ImageData

    const result = analyseTextRegion(img, { x: 0, y: 0, width: 20, height: 20 })
    expect(result.xHeightRatio).toBeGreaterThan(0)
    expect(result.xHeightRatio).toBeLessThanOrEqual(1)
    expect(result.strokeContrast).toBeGreaterThan(0)
    expect(typeof result.hasSerifs).toBe('boolean')
    expect(result.aspectRatio).toBeGreaterThan(0)
    expect(result.weightClass).toBeGreaterThanOrEqual(1)
    expect(result.weightClass).toBeLessThanOrEqual(9)
  })

  test('matchFont returns results', async () => {
    const img = makeImageData(20, 20, [0, 0, 0, 255])
    const results = await matchFont(img, { x: 0, y: 0, width: 20, height: 20 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.confidence).toBeGreaterThan(0)
    expect(typeof results[0]!.family).toBe('string')
  })

  test('matchFont respects maxResults setting', async () => {
    const img = makeImageData(20, 20, [0, 0, 0, 255])
    const results = await matchFont(img, { x: 0, y: 0, width: 20, height: 20 }, { maxResults: 3, minConfidence: 0 })
    expect(results.length).toBeLessThanOrEqual(3)
  })

  test('matchFont results are sorted by confidence descending', async () => {
    const img = makeImageData(20, 20, [0, 0, 0, 255])
    const results = await matchFont(img, { x: 0, y: 0, width: 20, height: 20 }, { maxResults: 10, minConfidence: 0 })
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.confidence).toBeLessThanOrEqual(results[i - 1]!.confidence)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #84 — Paragraph/Character Styles
// ══════════════════════════════════════════════════════════════════════════════

describe('#84 — Paragraph/Character Styles', () => {
  test('createDefaultCharacterStyle returns valid defaults', () => {
    const style = createDefaultCharacterStyle('Body')
    expect(style.name).toBe('Body')
    expect(style.fontFamily).toBe('Arial')
    expect(style.fontSize).toBe(16)
    expect(style.id).toBeTruthy()
  })

  test('createDefaultParagraphStyle returns valid defaults', () => {
    const style = createDefaultParagraphStyle('Normal')
    expect(style.name).toBe('Normal')
    expect(style.alignment).toBe('left')
    expect(style.lineHeight).toBe(1.2)
  })

  test('TextStyleManager CRUD for character styles', () => {
    const mgr = new TextStyleManager()

    // Create
    const s1 = mgr.createCharacterStyle('Heading', { fontSize: 24, fontWeight: 'bold' })
    expect(s1.name).toBe('Heading')
    expect(s1.fontSize).toBe(24)

    // Read
    expect(mgr.getCharacterStyles().length).toBe(1)
    expect(mgr.getCharacterStyle(s1.id)?.name).toBe('Heading')

    // Update
    const updated = mgr.updateCharacterStyle(s1.id, { fontSize: 32 })
    expect(updated?.fontSize).toBe(32)

    // Delete
    expect(mgr.deleteCharacterStyle(s1.id)).toBe(true)
    expect(mgr.getCharacterStyles().length).toBe(0)
  })

  test('TextStyleManager CRUD for paragraph styles', () => {
    const mgr = new TextStyleManager()

    const s1 = mgr.createParagraphStyle('Body', { lineHeight: 1.5 })
    expect(s1.lineHeight).toBe(1.5)

    const s2 = mgr.createParagraphStyle('Quote', { indent: 20 })
    expect(mgr.getParagraphStyles().length).toBe(2)

    const updated = mgr.updateParagraphStyle(s1.id, { spaceBefore: 10 })
    expect(updated?.spaceBefore).toBe(10)

    expect(mgr.deleteParagraphStyle(s2.id)).toBe(true)
    expect(mgr.getParagraphStyles().length).toBe(1)
  })

  test('TextStyleManager serializes and deserializes', () => {
    const mgr = new TextStyleManager()
    mgr.createCharacterStyle('H1', { fontSize: 36 })
    mgr.createParagraphStyle('Body')

    const json = mgr.toJSON()
    const restored = TextStyleManager.fromJSON(json)

    expect(restored.getCharacterStyles().length).toBe(1)
    expect(restored.getParagraphStyles().length).toBe(1)
    expect(restored.getCharacterStyles()[0]!.fontSize).toBe(36)
  })

  test('TextStyleManager update returns null for missing id', () => {
    const mgr = new TextStyleManager()
    expect(mgr.updateCharacterStyle('nonexistent', { fontSize: 20 })).toBeNull()
    expect(mgr.updateParagraphStyle('nonexistent', { indent: 10 })).toBeNull()
  })

  test('TextStyleManager delete returns false for missing id', () => {
    const mgr = new TextStyleManager()
    expect(mgr.deleteCharacterStyle('nonexistent')).toBe(false)
    expect(mgr.deleteParagraphStyle('nonexistent')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #93 — Shared Libraries
// ══════════════════════════════════════════════════════════════════════════════

describe('#93 — Shared Libraries', () => {
  const sampleLayer = makeVectorLayer()

  test('createSharedLibrary creates a valid library', () => {
    const lib = createSharedLibrary('Icons', 'Icon components')
    expect(lib.name).toBe('Icons')
    expect(lib.description).toBe('Icon components')
    expect(lib.components).toEqual([])
    expect(lib.version).toBe(1)
  })

  test('SharedLibraryManager CRUD for libraries', () => {
    const mgr = new SharedLibraryManager()

    const lib = mgr.createLibrary('UI Kit')
    expect(mgr.getLibraries().length).toBe(1)

    const updated = mgr.updateLibrary(lib.id, { name: 'Design System' })
    expect(updated?.name).toBe('Design System')
    expect(updated?.version).toBe(2)

    expect(mgr.deleteLibrary(lib.id)).toBe(true)
    expect(mgr.getLibraries().length).toBe(0)
  })

  test('SharedLibraryManager CRUD for components', () => {
    const mgr = new SharedLibraryManager()
    const lib = mgr.createLibrary('Components')

    const comp = mgr.addComponent(lib.id, 'Button', sampleLayer, ['ui', 'button'])
    expect(comp?.name).toBe('Button')
    expect(comp?.tags).toEqual(['ui', 'button'])

    const retrieved = mgr.getComponent(lib.id, comp!.id)
    expect(retrieved?.name).toBe('Button')

    const updated = mgr.updateComponent(lib.id, comp!.id, { name: 'Primary Button' })
    expect(updated?.name).toBe('Primary Button')

    expect(mgr.removeComponent(lib.id, comp!.id)).toBe(true)
    expect(mgr.getLibrary(lib.id)?.components.length).toBe(0)
  })

  test('SharedLibraryManager search components', () => {
    const mgr = new SharedLibraryManager()
    const lib = mgr.createLibrary('Search Test')
    mgr.addComponent(lib.id, 'Button Primary', sampleLayer, ['ui'])
    mgr.addComponent(lib.id, 'Icon Star', sampleLayer, ['icon'])
    mgr.addComponent(lib.id, 'Button Secondary', sampleLayer, ['ui'])

    const buttonResults = mgr.searchComponents(lib.id, 'Button')
    expect(buttonResults.length).toBe(2)

    const iconResults = mgr.searchComponents(lib.id, 'icon')
    expect(iconResults.length).toBe(1)
  })

  test('SharedLibraryManager export and import', () => {
    const mgr = new SharedLibraryManager()
    const lib = mgr.createLibrary('Export Test')
    mgr.addComponent(lib.id, 'Widget', sampleLayer)

    const bundle = mgr.exportLibrary(lib.id)
    expect(bundle).not.toBeNull()
    expect(bundle!.format).toBe('crossdraw-library')

    // Import into a new manager
    const mgr2 = new SharedLibraryManager()
    const imported = mgr2.importLibrary(bundle!)
    expect(imported.name).toBe('Export Test')
    expect(imported.components.length).toBe(1)
    // Should have new IDs
    expect(imported.id).not.toBe(lib.id)
  })

  test('addComponent returns null for unknown library', () => {
    const mgr = new SharedLibraryManager()
    expect(mgr.addComponent('fake-id', 'X', sampleLayer)).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #94 — Smart Animate
// ══════════════════════════════════════════════════════════════════════════════

describe('#94 — Smart Animate', () => {
  test('computeLayerTransition at t=0 returns from state', () => {
    const from = makeVectorLayer({ transform: makeTransform({ x: 0, y: 0 }), opacity: 1 })
    const to = makeVectorLayer({ transform: makeTransform({ x: 100, y: 200 }), opacity: 0.5 })

    const result = computeLayerTransition(from, to, 0)
    expect(result.x).toBeCloseTo(0, 0)
    expect(result.y).toBeCloseTo(0, 0)
    expect(result.opacity).toBeCloseTo(1, 1)
  })

  test('computeLayerTransition at t=1 returns to state', () => {
    const from = makeVectorLayer({ transform: makeTransform({ x: 0, y: 0 }), opacity: 1 })
    const to = makeVectorLayer({ transform: makeTransform({ x: 100, y: 200 }), opacity: 0.5 })

    const result = computeLayerTransition(from, to, 1)
    expect(result.x).toBeCloseTo(100, 0)
    expect(result.y).toBeCloseTo(200, 0)
    expect(result.opacity).toBeCloseTo(0.5, 1)
  })

  test('computeLayerTransition at t=0.5 interpolates midpoint', () => {
    const from = makeVectorLayer({
      transform: makeTransform({ x: 0, y: 0, rotation: 0 }),
      opacity: 0,
    })
    const to = makeVectorLayer({
      transform: makeTransform({ x: 100, y: 100, rotation: 90 }),
      opacity: 1,
    })

    const result = computeLayerTransition(from, to, 0.5, {
      ...DEFAULT_SMART_ANIMATE_SETTINGS,
      easing: 'linear',
    })
    expect(result.x).toBeCloseTo(50, 0)
    expect(result.y).toBeCloseTo(50, 0)
    expect(result.opacity).toBeCloseTo(0.5, 1)
    expect(result.rotation).toBeCloseTo(45, 0)
  })

  test('buildTransitionPlan matches layers by name', () => {
    const from = [
      makeVectorLayer({ name: 'Header', transform: makeTransform({ x: 0 }) }),
      makeTextLayer({ name: 'Title', transform: makeTransform({ x: 10 }) }),
    ]
    const to = [
      makeVectorLayer({ name: 'Header', transform: makeTransform({ x: 100 }) }),
      makeTextLayer({ name: 'Subtitle', transform: makeTransform({ x: 50 }) }),
    ]

    const plan = buildTransitionPlan(from, to, { ...DEFAULT_SMART_ANIMATE_SETTINGS, matchByName: true })
    expect(plan.matches.length).toBe(1) // Header matches
    expect(plan.appearances.length).toBe(2) // Title exits, Subtitle enters
  })

  test('computeTransitionFrame returns states for all layers', () => {
    const from = [makeVectorLayer({ name: 'A', transform: makeTransform({ x: 0 }), opacity: 1 })]
    const to = [makeVectorLayer({ name: 'A', transform: makeTransform({ x: 100 }), opacity: 1 })]

    const plan = buildTransitionPlan(from, to)
    const states = computeTransitionFrame(plan, 0.5, { ...DEFAULT_SMART_ANIMATE_SETTINGS, easing: 'linear' })

    expect(states.length).toBe(1)
    expect(states[0]!.x).toBeCloseTo(50, 0)
  })

  test('computeTransitionFrame fades in/out unmatched layers', () => {
    const from: Layer[] = [makeVectorLayer({ name: 'A', opacity: 1 })]
    const to: Layer[] = [makeVectorLayer({ name: 'B', opacity: 1 })]

    const plan = buildTransitionPlan(from, to)
    const states = computeTransitionFrame(plan, 0.5, { ...DEFAULT_SMART_ANIMATE_SETTINGS, easing: 'linear' })

    // A should be fading out, B should be fading in
    expect(states.length).toBe(2)
    const exitState = states.find((s) => s.name === 'A')
    const enterState = states.find((s) => s.name === 'B')
    expect(exitState!.opacity).toBeCloseTo(0.5, 1)
    expect(enterState!.opacity).toBeCloseTo(0.5, 1)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #95 — Interactive Components
// ══════════════════════════════════════════════════════════════════════════════

describe('#95 — Interactive Components', () => {
  test('createInteractiveComponent creates with default state', () => {
    const comp = createInteractiveComponent('Button')
    expect(comp.name).toBe('Button')
    expect(comp.states.length).toBe(1)
    expect(comp.states[0]!.name).toBe('Default')
    expect(comp.defaultState).toBe(comp.states[0]!.id)
  })

  test('InteractiveComponentManager CRUD', () => {
    const mgr = new InteractiveComponentManager()

    const comp = mgr.createComponent('Toggle')
    expect(mgr.getComponents().length).toBe(1)

    const retrieved = mgr.getComponent(comp.id)
    expect(retrieved?.name).toBe('Toggle')

    expect(mgr.deleteComponent(comp.id)).toBe(true)
    expect(mgr.getComponents().length).toBe(0)
  })

  test('addState and removeState', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Card')

    const hoverState = mgr.addState(comp.id, 'Hover', { 'layer-1': true })
    expect(hoverState?.name).toBe('Hover')
    expect(comp.states.length).toBe(2)

    expect(mgr.removeState(comp.id, hoverState!.id)).toBe(true)
    expect(comp.states.length).toBe(1)
  })

  test('cannot remove default state', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Chip')

    expect(mgr.removeState(comp.id, comp.defaultState)).toBe(false)
  })

  test('addTrigger and removeTrigger', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Button')
    const hover = mgr.addState(comp.id, 'Hover')!

    const trigger = mgr.addTrigger(comp.id, 'hover', hover.id)
    expect(trigger?.type).toBe('hover')
    expect(trigger?.targetState).toBe(hover.id)

    expect(mgr.removeTrigger(comp.id, trigger!.id)).toBe(true)
    expect(comp.triggers.length).toBe(0)
  })

  test('addTrigger validates target state exists', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Test')

    const result = mgr.addTrigger(comp.id, 'click', 'nonexistent-state')
    expect(result).toBeNull()
  })

  test('resolveState returns layer visibility', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Tab')
    const vis = { 'tab-1': true, 'tab-2': false }
    const state = mgr.addState(comp.id, 'Tab 1', vis)!

    const resolved = mgr.resolveState(comp.id, state.id)
    expect(resolved).toEqual(vis)
  })

  test('getNextState finds matching trigger', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Btn')
    const pressed = mgr.addState(comp.id, 'Pressed')!
    mgr.addTrigger(comp.id, 'press', pressed.id)

    const next = mgr.getNextState(comp.id, comp.defaultState, 'press')
    expect(next).toBe(pressed.id)
  })

  test('removeState also removes triggers pointing to it', () => {
    const mgr = new InteractiveComponentManager()
    const comp = mgr.createComponent('Btn')
    const hover = mgr.addState(comp.id, 'Hover')!
    mgr.addTrigger(comp.id, 'hover', hover.id)

    mgr.removeState(comp.id, hover.id)
    expect(comp.triggers.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #96 — Code Generation
// ══════════════════════════════════════════════════════════════════════════════

describe('#96 — Code Generation', () => {
  test('generateCSS for text layer', () => {
    const layer = makeTextLayer()
    const css = generateCSS(layer)
    expect(css).toContain('font-family')
    expect(css).toContain('font-size: 16px')
    expect(css).toContain('color: #333333')
    expect(css).toContain('position: absolute')
  })

  test('generateCSS for vector layer with shape', () => {
    const layer = makeVectorLayer({
      shapeParams: { shapeType: 'rectangle', width: 200, height: 100, cornerRadius: 8 },
    })
    const css = generateCSS(layer)
    expect(css).toContain('width: 200px')
    expect(css).toContain('height: 100px')
    expect(css).toContain('border-radius: 8px')
    expect(css).toContain('background-color: #ff0000')
  })

  test('generateCSS for ellipse shape', () => {
    const layer = makeVectorLayer({
      shapeParams: { shapeType: 'ellipse', width: 50, height: 50 },
    })
    const css = generateCSS(layer)
    expect(css).toContain('border-radius: 50%')
  })

  test('generateCSS includes opacity when < 1', () => {
    const layer = makeTextLayer({ opacity: 0.5 })
    const css = generateCSS(layer)
    expect(css).toContain('opacity: 0.5')
  })

  test('generateCSS includes blend mode when not normal', () => {
    const layer = makeVectorLayer({ blendMode: 'multiply' })
    const css = generateCSS(layer)
    expect(css).toContain('mix-blend-mode: multiply')
  })

  test('generateCSS for hidden layer', () => {
    const layer = makeTextLayer({ visible: false })
    const css = generateCSS(layer)
    expect(css).toContain('display: none')
  })

  test('generateSwiftUI for text layer', () => {
    const layer = makeTextLayer({ fontWeight: 'bold', fontStyle: 'italic' })
    const swift = generateSwiftUI(layer)
    expect(swift).toContain('Text("Hello World")')
    expect(swift).toContain('.fontWeight(.bold)')
    expect(swift).toContain('.italic()')
    expect(swift).toContain('.font(.custom("Arial"')
  })

  test('generateSwiftUI for rectangle', () => {
    const layer = makeVectorLayer({
      shapeParams: { shapeType: 'rectangle', width: 100, height: 50, cornerRadius: 10 },
    })
    const swift = generateSwiftUI(layer)
    expect(swift).toContain('RoundedRectangle(cornerRadius: 10)')
    expect(swift).toContain('.fill(')
    expect(swift).toContain('.frame(width: 100, height: 50)')
  })

  test('generateSwiftUI for ellipse', () => {
    const layer = makeVectorLayer({
      shapeParams: { shapeType: 'ellipse', width: 60, height: 60 },
    })
    const swift = generateSwiftUI(layer)
    expect(swift).toContain('Ellipse()')
  })

  test('generateSwiftUI for raster layer', () => {
    const layer = makeRasterLayer()
    const swift = generateSwiftUI(layer)
    expect(swift).toContain('Image(')
    expect(swift).toContain('.resizable()')
  })

  test('generateXML for text layer', () => {
    const layer = makeTextLayer()
    const xml = generateXML(layer)
    expect(xml).toContain('<TextView')
    expect(xml).toContain('android:text="Hello World"')
    expect(xml).toContain('android:textSize="16sp"')
    expect(xml).toContain('android:fontFamily="Arial"')
  })

  test('generateXML for vector layer', () => {
    const layer = makeVectorLayer({
      shapeParams: { shapeType: 'rectangle', width: 100, height: 50 },
    })
    const xml = generateXML(layer)
    expect(xml).toContain('<View')
    expect(xml).toContain('android:layout_width="100dp"')
    expect(xml).toContain('android:layout_height="50dp"')
  })

  test('generateXML for raster layer', () => {
    const layer = makeRasterLayer()
    const xml = generateXML(layer)
    expect(xml).toContain('<ImageView')
    expect(xml).toContain('android:src=')
  })

  test('generateXML for group layer', () => {
    const layer = makeGroupLayer([makeTextLayer()])
    const xml = generateXML(layer)
    expect(xml).toContain('<FrameLayout')
    expect(xml).toContain('</FrameLayout>')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #97 — Website Publishing
// ══════════════════════════════════════════════════════════════════════════════

describe('#97 — Website Publishing', () => {
  test('exportStaticSite returns html, css, and assets', () => {
    const doc = makeDocument()
    const result = exportStaticSite(doc)
    expect(typeof result.html).toBe('string')
    expect(typeof result.css).toBe('string')
    expect(result.assets instanceof Map).toBe(true)
  })

  test('exported HTML is valid structure', () => {
    const doc = makeDocument()
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<!DOCTYPE html>')
    expect(result.html).toContain('<html')
    expect(result.html).toContain('</html>')
    expect(result.html).toContain('<head>')
    expect(result.html).toContain('<body>')
  })

  test('exported HTML includes responsive viewport', () => {
    const doc = makeDocument()
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, responsive: true })
    expect(result.html).toContain('viewport')
  })

  test('exported HTML includes page title', () => {
    const doc = makeDocument()
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, title: 'My Site' })
    expect(result.html).toContain('<title>My Site</title>')
  })

  test('text layers become HTML text elements', () => {
    const doc = makeDocument([makeTextLayer({ text: 'Welcome', fontSize: 24 })])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('Welcome')
    expect(result.html).toMatch(/<h[2-3][^>]*>Welcome<\/h[2-3]>/)
  })

  test('raster layers create asset references', () => {
    const doc = makeDocument([makeRasterLayer({ name: 'photo' })])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<img')
    expect(result.html).toContain('assets/')
    expect(result.assets.size).toBeGreaterThan(0)
  })

  test('CSS includes font styling for text layers', () => {
    const doc = makeDocument([makeTextLayer({ fontFamily: 'Georgia' })])
    const result = exportStaticSite(doc)
    expect(result.css).toContain('Georgia')
    expect(result.css).toContain('font-family')
  })

  test('inline CSS mode embeds style in HTML', () => {
    const doc = makeDocument([makeTextLayer()])
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, inlineCSS: true })
    expect(result.html).toContain('<style>')
    expect(result.html).not.toContain('stylesheet')
  })

  test('hidden layers produce comments', () => {
    const doc = makeDocument([makeTextLayer({ visible: false, name: 'Hidden' })])
    const result = exportStaticSite(doc)
    expect(result.html).toContain('<!-- hidden: Hidden -->')
  })

  test('navigation is generated for multi-artboard docs', () => {
    const doc = makeDocument()
    doc.artboards.push({
      id: 'ab-2',
      name: 'Page 2',
      x: 0,
      y: 600,
      width: 800,
      height: 600,
      backgroundColor: '#eeeeee',
      layers: [],
    })
    const result = exportStaticSite(doc, { ...DEFAULT_WEBSITE_EXPORT_SETTINGS, generateNav: true })
    expect(result.html).toContain('<nav')
    expect(result.html).toContain('Page 1')
    expect(result.html).toContain('Page 2')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// #98 — LiveSketch
// ══════════════════════════════════════════════════════════════════════════════

describe('#98 — LiveSketch', () => {
  test('DEFAULT_LIVE_SKETCH_SETTINGS has reasonable defaults', () => {
    expect(DEFAULT_LIVE_SKETCH_SETTINGS.smoothingLevel).toBeGreaterThan(0)
    expect(DEFAULT_LIVE_SKETCH_SETTINGS.mergeWindow).toBeGreaterThan(0)
    expect(typeof DEFAULT_LIVE_SKETCH_SETTINGS.snapToGeometry).toBe('boolean')
    expect(DEFAULT_LIVE_SKETCH_SETTINGS.connectDistance).toBeGreaterThan(0)
  })

  test('setLiveSketchSettings and getLiveSketchSettings', () => {
    setLiveSketchSettings({ smoothingLevel: 5.0 })
    expect(getLiveSketchSettings().smoothingLevel).toBe(5.0)
    // Restore default
    setLiveSketchSettings({ smoothingLevel: DEFAULT_LIVE_SKETCH_SETTINGS.smoothingLevel })
  })

  test('rdpSimplify reduces point count', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.1 },
      { x: 2, y: -0.1 },
      { x: 3, y: 0.05 },
      { x: 4, y: 0 },
      { x: 5, y: -0.05 },
      { x: 10, y: 0 },
    ]
    const simplified = rdpSimplify(points, 0.5)
    expect(simplified.length).toBeLessThan(points.length)
    // Should keep first and last
    expect(simplified[0]).toEqual({ x: 0, y: 0 })
    expect(simplified[simplified.length - 1]).toEqual({ x: 10, y: 0 })
  })

  test('rdpSimplify with 2 points returns them unchanged', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]
    const result = rdpSimplify(points, 1)
    expect(result.length).toBe(2)
  })

  test('fitCurves returns segments for a simple path', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 0 },
    ]
    const segments = fitCurves(points, 4)
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments[0]!.type).toBe('move')
  })

  test('fitCurves handles 2 points with line segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ]
    const segments = fitCurves(points, 4)
    expect(segments.length).toBe(2)
    expect(segments[0]!.type).toBe('move')
    expect(segments[1]!.type).toBe('line')
  })

  test('finalizeLiveSketch returns null for insufficient points', () => {
    beginLiveSketch(0, 0)
    // Only 1 point, not enough
    const result = finalizeLiveSketch()
    expect(result).toBeNull()
  })

  test('beginLiveSketch → addPoints → finalizeLiveSketch produces a path', () => {
    beginLiveSketch(0, 0)
    for (let i = 1; i <= 20; i++) {
      addLiveSketchPoint(i * 5, Math.sin(i) * 10)
    }
    const path = finalizeLiveSketch()
    expect(path).not.toBeNull()
    expect(path!.segments.length).toBeGreaterThanOrEqual(2)
    expect(path!.segments[0]!.type).toBe('move')
    expect(path!.id).toBeTruthy()
    expect(path!.closed).toBe(false)
  })

  test('getLiveSketchPreview returns simplified points during drawing', () => {
    beginLiveSketch(0, 0)
    addLiveSketchPoint(10, 0)
    addLiveSketchPoint(20, 0)
    addLiveSketchPoint(30, 0)

    const preview = getLiveSketchPreview()
    expect(preview.length).toBeGreaterThanOrEqual(2)

    // Clean up
    finalizeLiveSketch()
  })

  test('fitCurves produces cubic segments for curved paths', () => {
    const points = []
    for (let i = 0; i <= 20; i++) {
      points.push({ x: i * 10, y: Math.sin(i * 0.5) * 50 })
    }
    const segments = fitCurves(points, 2)
    const cubics = segments.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBeGreaterThan(0)
  })
})
