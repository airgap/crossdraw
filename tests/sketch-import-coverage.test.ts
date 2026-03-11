import { describe, test, expect } from 'bun:test'
import { zipSync, strToU8 } from 'fflate'
import {
  convertSketchFill,
  convertCurvePoints,
  extractBlendMode,
  offsetSegments,
  importSketch,
} from '@/io/sketch-import'

// ── Helper to create a minimal .sketch ZIP ──

function createSketchZip(opts: {
  pages?: Record<string, any>
  docJson?: any
  metaJson?: any
  images?: Record<string, Uint8Array>
}): ArrayBuffer {
  const files: Record<string, Uint8Array> = {}

  // document.json
  const docJson = opts.docJson ?? {
    _class: 'document',
    do_objectID: 'doc-1',
  }
  files['document.json'] = strToU8(JSON.stringify(docJson))

  // meta.json
  if (opts.metaJson) {
    files['meta.json'] = strToU8(JSON.stringify(opts.metaJson))
  }

  // pages
  if (opts.pages) {
    for (const [id, pageData] of Object.entries(opts.pages)) {
      files[`pages/${id}.json`] = strToU8(JSON.stringify(pageData))
    }
  }

  // images
  if (opts.images) {
    for (const [path, data] of Object.entries(opts.images)) {
      files[path] = data
    }
  }

  const zipped = zipSync(files)
  return zipped.buffer as ArrayBuffer
}

function mkSketchLayer(overrides: Partial<any> = {}): any {
  return {
    _class: 'rectangle',
    do_objectID: 'layer-1',
    name: 'Rectangle',
    isVisible: true,
    isLocked: false,
    frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
    rotation: 0,
    isFlippedHorizontal: false,
    isFlippedVertical: false,
    ...overrides,
  }
}

// ── Tests covering uncovered areas ──

describe('sketch-import-coverage: full importSketch', () => {
  test('imports minimal .sketch file with one artboard', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page 1',
      layers: [
        {
          _class: 'artboard',
          do_objectID: 'ab-1',
          name: 'Artboard 1',
          isVisible: true,
          isLocked: false,
          frame: { _class: 'rect', x: 0, y: 0, width: 800, height: 600 },
          rotation: 0,
          isFlippedHorizontal: false,
          isFlippedVertical: false,
          layers: [mkSketchLayer()],
        },
      ],
    }

    const meta = {
      commit: 'abc',
      appVersion: '99',
      build: 1,
      app: 'com.bohemiancoding.sketch3',
      pagesAndArtboards: { 'page-1': { name: 'Page 1' } },
    }

    const buf = createSketchZip({ pages: { 'page-1': page }, metaJson: meta })
    const doc = await importSketch(buf)
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.name).toBe('Artboard 1')
    expect(doc.artboards[0]!.width).toBe(800)
    expect(doc.artboards[0]!.height).toBe(600)
    expect(doc.artboards[0]!.layers.length).toBe(1)
  })

  test('top-level non-artboard layers go into page artboard', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'My Page',
      layers: [mkSketchLayer({ name: 'Loose Rect' })],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    // Non-artboard top-level layers should get a page-level artboard
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.name).toBe('My Page')
    expect(doc.artboards[0]!.layers.length).toBe(1)
  })

  test('creates default artboard when no pages found', async () => {
    const buf = createSketchZip({})
    const doc = await importSketch(buf)
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.name).toBe('Artboard 1')
  })

  test('imports named colors from document assets', async () => {
    const docJson = {
      _class: 'document',
      do_objectID: 'doc-1',
      assets: {
        _class: 'assetCollection',
        colors: [
          { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
          { _class: 'color', red: 0, green: 1, blue: 0, alpha: 1 },
        ],
      },
    }

    const buf = createSketchZip({ docJson })
    const doc = await importSketch(buf)
    expect(doc.assets.colors!.length).toBe(2)
    expect(doc.assets.colors![0]!.value).toBe('#ff0000')
    expect(doc.assets.colors![1]!.value).toBe('#00ff00')
  })

  test('imports symbol masters as symbol definitions', async () => {
    const docJson = {
      _class: 'document',
      do_objectID: 'doc-1',
      layerSymbols: {
        _class: 'symbolContainer',
        objects: [
          {
            _class: 'symbolMaster',
            do_objectID: 'sm-1',
            symbolID: 'sym-id-1',
            name: 'Button',
            frame: { _class: 'rect', x: 0, y: 0, width: 120, height: 40 },
            layers: [mkSketchLayer({ name: 'BG' })],
          },
        ],
      },
    }

    const buf = createSketchZip({ docJson })
    const doc = await importSketch(buf)
    expect(doc.symbols).toBeDefined()
    expect(doc.symbols!.length).toBe(1)
    expect(doc.symbols![0]!.name).toBe('Button')
    expect(doc.symbols![0]!.id).toBe('sym-id-1')
  })

  test('imports oval layer', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'oval',
          name: 'Circle',
          frame: { _class: 'rect', x: 50, y: 50, width: 100, height: 100 },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.shapeParams?.shapeType).toBe('ellipse')
    }
  })

  test('imports shapePath layer', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'shapePath',
          name: 'Custom Path',
          isClosed: true,
          points: [
            {
              _class: 'curvePoint',
              cornerRadius: 0,
              curveFrom: '{0, 0}',
              curveTo: '{0, 0}',
              point: '{0, 0}',
              curveMode: 1,
              hasCurveFrom: false,
              hasCurveTo: false,
            },
            {
              _class: 'curvePoint',
              cornerRadius: 0,
              curveFrom: '{1, 0}',
              curveTo: '{1, 0}',
              point: '{1, 0}',
              curveMode: 1,
              hasCurveFrom: false,
              hasCurveTo: false,
            },
            {
              _class: 'curvePoint',
              cornerRadius: 0,
              curveFrom: '{0.5, 1}',
              curveTo: '{0.5, 1}',
              point: '{0.5, 1}',
              curveMode: 1,
              hasCurveFrom: false,
              hasCurveTo: false,
            },
          ],
          frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.paths[0]!.segments.length).toBeGreaterThanOrEqual(3)
    }
  })

  test('imports shapeGroup with child shapes', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'shapeGroup',
          name: 'Shape Group',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
          layers: [
            mkSketchLayer({
              _class: 'rectangle',
              name: 'Inner Rect',
              frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
            }),
            mkSketchLayer({
              _class: 'oval',
              name: 'Inner Oval',
              frame: { _class: 'rect', x: 50, y: 50, width: 80, height: 80 },
            }),
          ],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.paths.length).toBe(2)
    }
  })

  test('imports empty shapeGroup', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'shapeGroup',
          name: 'Empty Shape Group',
          frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
          layers: [],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('vector')
    if (layer.type === 'vector') {
      expect(layer.paths.length).toBe(0)
    }
  })

  test('imports text layer', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'text',
          name: 'Hello',
          frame: { _class: 'rect', x: 10, y: 20, width: 200, height: 40 },
          attributedString: {
            _class: 'attributedString',
            string: 'Hello World',
            attributes: [
              {
                _class: 'stringAttribute',
                location: 0,
                length: 11,
                attributes: {
                  MSAttributedStringFontAttribute: {
                    _class: 'fontDescriptor',
                    attributes: { name: 'Helvetica-Bold', size: 24 },
                  },
                  MSAttributedStringColorAttribute: {
                    _class: 'color',
                    red: 1,
                    green: 0,
                    blue: 0,
                    alpha: 1,
                  },
                  paragraphStyle: {
                    _class: 'paragraphStyle',
                    alignment: 2,
                    maximumLineHeight: 30,
                  },
                  kerning: 1.5,
                },
              },
            ],
          },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('text')
    if (layer.type === 'text') {
      expect(layer.text).toBe('Hello World')
      expect(layer.fontFamily).toBe('Helvetica-Bold')
      expect(layer.fontSize).toBe(24)
      expect(layer.fontWeight).toBe('bold')
      expect(layer.color).toBe('#ff0000')
      expect(layer.textAlign).toBe('center')
      expect(layer.lineHeight).toBe(30)
      expect(layer.letterSpacing).toBe(1.5)
    }
  })

  test('imports group layer with children', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'group',
          name: 'My Group',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
          layers: [mkSketchLayer({ name: 'Child 1' }), mkSketchLayer({ name: 'Child 2' })],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('group')
    if (layer.type === 'group') {
      expect(layer.children.length).toBe(2)
    }
  })

  test('imports symbolInstance layer', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'symbolInstance',
          name: 'Button Instance',
          symbolID: 'sym-123',
          overrideValues: [{ _class: 'overrideValue', overrideName: 'visible', value: false }],
          frame: { _class: 'rect', x: 0, y: 0, width: 120, height: 40 },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('symbol-instance')
    if (layer.type === 'symbol-instance') {
      expect(layer.symbolId).toBe('sym-123')
      expect(layer.overrides).toBeDefined()
    }
  })

  test('imports bitmap layer', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'bitmap',
          name: 'Photo',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 150 },
          image: {
            _class: 'MSJSONFileReference',
            _ref_class: 'MSImageData',
            _ref: 'images/test.png',
          },
        }),
      ],
    }

    const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const buf = createSketchZip({
      pages: { 'page-1': page },
      images: { 'images/test.png': fakeImage },
    })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.type).toBe('raster')
    if (layer.type === 'raster') {
      expect(layer.width).toBe(200)
      expect(layer.height).toBe(150)
    }
  })

  test('bitmap layer with missing image still creates placeholder', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'bitmap',
          name: 'Missing Image',
          frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 100 },
          image: {
            _class: 'MSJSONFileReference',
            _ref_class: 'MSImageData',
            _ref: 'images/nonexistent.png',
          },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('raster')
  })

  test('bitmap layer with no image ref', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'bitmap',
          name: 'No Ref',
          frame: { _class: 'rect', x: 0, y: 0, width: 50, height: 50 },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('raster')
  })

  test('skips slice and hotspot layers', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({ _class: 'slice', name: 'Slice' }),
        mkSketchLayer({ _class: 'hotspot', name: 'Hotspot' }),
        mkSketchLayer({ _class: 'rectangle', name: 'Visible' }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards[0]!.layers.length).toBe(1)
    expect(doc.artboards[0]!.layers[0]!.name).toBe('Visible')
  })

  test('unknown layer with children treated as group', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'unknownType',
          name: 'Unknown',
          layers: [mkSketchLayer({ name: 'Child' })],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards[0]!.layers[0]!.type).toBe('group')
  })

  test('unknown layer without children is skipped', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'unknownType',
          name: 'Unknown',
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  test('symbolMaster top-level treated like artboard', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'symbolMaster',
          name: 'Symbol Master',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 100 },
          layers: [mkSketchLayer()],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    // symbolMaster at top level should become an artboard
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.name).toBe('Symbol Master')
  })

  test('page discovered by file listing when no meta.json', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-abc',
      name: 'Auto Page',
      layers: [mkSketchLayer()],
    }

    const buf = createSketchZip({ pages: { 'page-abc': page } })
    const doc = await importSketch(buf)
    expect(doc.artboards.length).toBeGreaterThan(0)
  })
})

describe('sketch-import-coverage: shapeGroup with curve points child', () => {
  test('shapeGroup child with points gets offset segments', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'shapeGroup',
          name: 'Curved Group',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 200 },
          layers: [
            mkSketchLayer({
              _class: 'shapePath',
              name: 'Custom',
              frame: { _class: 'rect', x: 10, y: 20, width: 80, height: 80 },
              isClosed: true,
              points: [
                {
                  _class: 'curvePoint',
                  cornerRadius: 0,
                  curveFrom: '{0, 0}',
                  curveTo: '{0, 0}',
                  point: '{0, 0}',
                  curveMode: 1,
                  hasCurveFrom: false,
                  hasCurveTo: false,
                },
                {
                  _class: 'curvePoint',
                  cornerRadius: 0,
                  curveFrom: '{1, 0}',
                  curveTo: '{1, 0}',
                  point: '{1, 0}',
                  curveMode: 1,
                  hasCurveFrom: false,
                  hasCurveTo: false,
                },
                {
                  _class: 'curvePoint',
                  cornerRadius: 0,
                  curveFrom: '{1, 1}',
                  curveTo: '{1, 1}',
                  point: '{1, 1}',
                  curveMode: 1,
                  hasCurveFrom: false,
                  hasCurveTo: false,
                },
              ],
            }),
          ],
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'vector') {
      expect(layer.paths.length).toBe(1)
      // First segment should be offset by child frame x=10, y=20
      const firstSeg = layer.paths[0]!.segments[0]!
      if (firstSeg.type === 'move') {
        expect(firstSeg.x).toBe(10) // 0*80 + 10
        expect(firstSeg.y).toBe(20) // 0*80 + 20
      }
    }
  })
})

describe('sketch-import-coverage: offsetSegments for quadratic and arc', () => {
  test('offsets quadratic segment', () => {
    const result = offsetSegments(
      [
        {
          type: 'quadratic',
          x: 50,
          y: 50,
          cpx: 25,
          cpy: 0,
        },
      ],
      10,
      20,
    )
    expect(result[0]).toMatchObject({
      type: 'quadratic',
      x: 60,
      y: 70,
      cpx: 35,
      cpy: 20,
    })
  })

  test('offsets arc segment', () => {
    const result = offsetSegments(
      [
        {
          type: 'arc',
          x: 100,
          y: 100,
          rx: 50,
          ry: 50,
          rotation: 0,
          largeArc: false,
          sweep: true,
        },
      ],
      5,
      10,
    )
    expect(result[0]).toMatchObject({
      type: 'arc',
      x: 105,
      y: 110,
    })
  })
})

describe('sketch-import-coverage: fill conversion pattern fallback', () => {
  test('fillType 4 (pattern) falls back to solid', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: true,
      fillType: 4,
      color: { _class: 'color', red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
    })
    expect(fill).not.toBeNull()
    expect(fill!.type).toBe('solid')
    expect(fill!.color).toBe('#808080')
  })
})

describe('sketch-import-coverage: conical gradient', () => {
  test('gradient type 2 is conical', () => {
    const fill = convertSketchFill({
      _class: 'fill',
      isEnabled: true,
      fillType: 1,
      color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
      gradient: {
        _class: 'gradient',
        gradientType: 2,
        from: '{0.5, 0.5}',
        to: '{1, 0.5}',
        stops: [
          {
            _class: 'gradientStop',
            position: 0,
            color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
          },
          {
            _class: 'gradientStop',
            position: 1,
            color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 },
          },
        ],
      },
    })
    expect(fill!.gradient!.type).toBe('conical')
  })
})

describe('sketch-import-coverage: text with italic font name', () => {
  test('italic in font name heuristic', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'text',
          name: 'Italic Text',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 40 },
          attributedString: {
            _class: 'attributedString',
            string: 'Italic',
            attributes: [
              {
                _class: 'stringAttribute',
                location: 0,
                length: 6,
                attributes: {
                  MSAttributedStringFontAttribute: {
                    _class: 'fontDescriptor',
                    attributes: { name: 'Helvetica-Oblique', size: 14 },
                  },
                },
              },
            ],
          },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'text') {
      expect(layer.fontStyle).toBe('italic')
    }
  })
})

describe('sketch-import-coverage: text with no attributed string', () => {
  test('text with no attributedString uses defaults', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'text',
          name: 'Plain',
          frame: { _class: 'rect', x: 0, y: 0, width: 200, height: 40 },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'text') {
      expect(layer.text).toBe('')
      expect(layer.fontFamily).toBe('sans-serif')
      expect(layer.fontSize).toBe(14)
    }
  })
})

describe('sketch-import-coverage: layer with multiple fills and borders', () => {
  test('multiple fills and borders on a rectangle', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          style: {
            _class: 'style',
            fills: [
              {
                _class: 'fill',
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 1, green: 0, blue: 0, alpha: 1 },
              },
              {
                _class: 'fill',
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 1, blue: 0, alpha: 0.5 },
              },
            ],
            borders: [
              {
                _class: 'border',
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0, blue: 0, alpha: 1 },
                thickness: 2,
                position: 0,
              },
              {
                _class: 'border',
                isEnabled: true,
                fillType: 0,
                color: { _class: 'color', red: 0, green: 0, blue: 1, alpha: 1 },
                thickness: 1,
                position: 2,
              },
            ],
          },
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'vector') {
      expect(layer.fill).not.toBeNull()
      expect(layer.additionalFills).toBeDefined()
      expect(layer.additionalFills!.length).toBe(1)
      expect(layer.stroke).not.toBeNull()
      expect(layer.additionalStrokes).toBeDefined()
      expect(layer.additionalStrokes!.length).toBe(1)
    }
  })
})

describe('sketch-import-coverage: blend mode edge cases', () => {
  test('all Sketch blend modes are mapped', () => {
    const modes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    for (const m of modes) {
      const bm = extractBlendMode({
        _class: 'style',
        contextSettings: { _class: 'graphicsContextSettings', blendMode: m, opacity: 1 },
      })
      expect(bm).toBeDefined()
      expect(typeof bm).toBe('string')
    }
  })

  test('unknown blend mode defaults to normal', () => {
    const bm = extractBlendMode({
      _class: 'style',
      contextSettings: { _class: 'graphicsContextSettings', blendMode: 99, opacity: 1 },
    })
    expect(bm).toBe('normal')
  })
})

describe('sketch-import-coverage: shapePath without points', () => {
  test('shapePath with no points creates fallback line', async () => {
    const page = {
      _class: 'page',
      do_objectID: 'page-1',
      name: 'Page',
      layers: [
        mkSketchLayer({
          _class: 'shapePath',
          name: 'No Points',
          frame: { _class: 'rect', x: 0, y: 0, width: 100, height: 50 },
          points: [],
          isClosed: false,
        }),
      ],
    }

    const buf = createSketchZip({ pages: { 'page-1': page } })
    const doc = await importSketch(buf)
    const layer = doc.artboards[0]!.layers[0]!
    if (layer.type === 'vector') {
      expect(layer.paths[0]!.segments.length).toBe(2)
      expect(layer.paths[0]!.segments[0]!).toMatchObject({ type: 'move', x: 0, y: 0 })
      expect(layer.paths[0]!.segments[1]!).toMatchObject({ type: 'line', x: 100, y: 50 })
    }
  })
})

describe('sketch-import-coverage: curve points with closing cubic', () => {
  test('closing segment with curves creates cubic back to start', () => {
    const segments = convertCurvePoints(
      [
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{0.3, 0}',
          curveTo: '{0, 0}',
          point: '{0, 0}',
          curveMode: 2,
          hasCurveFrom: true,
          hasCurveTo: false,
        },
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{1, 0.3}',
          curveTo: '{0.7, 0}',
          point: '{1, 0}',
          curveMode: 2,
          hasCurveFrom: true,
          hasCurveTo: true,
        },
        {
          _class: 'curvePoint',
          cornerRadius: 0,
          curveFrom: '{0.7, 1}',
          curveTo: '{1, 0.7}',
          point: '{1, 1}',
          curveMode: 2,
          hasCurveFrom: true,
          hasCurveTo: true,
        },
      ],
      100,
      100,
      true,
    )

    // Should end with a cubic back to start point + close
    const lastNonClose = segments[segments.length - 2]
    expect(lastNonClose?.type).toBe('cubic')
    expect(segments[segments.length - 1]?.type).toBe('close')
  })
})
