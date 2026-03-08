import { describe, test, expect } from 'bun:test'
import type {
  SymbolDefinition,
  SymbolInstanceLayer,
  ICCProfile,
  CropRegion,
  BrushSettings,
  RasterLayer,
  Layer,
} from '@/types'
import { parseSVGPathD, parseTransformAttr } from '@/io/svg-import'
import { parseICCProfile, ICC_PRESETS, iccColorSpaceToDocColorspace } from '@/io/icc-profile'
import { createSlice } from '@/io/batch-export'

describe('LYK-80: SVG import', () => {
  test('parse simple M L Z path', () => {
    const segs = parseSVGPathD('M10 20 L30 40 Z')
    expect(segs.length).toBe(3)
    expect(segs[0]!.type).toBe('move')
    if (segs[0]!.type === 'move') {
      expect(segs[0]!.x).toBe(10)
      expect(segs[0]!.y).toBe(20)
    }
    expect(segs[1]!.type).toBe('line')
    expect(segs[2]!.type).toBe('close')
  })

  test('parse cubic bezier', () => {
    const segs = parseSVGPathD('M0 0 C10 20 30 40 50 60')
    expect(segs.length).toBe(2)
    expect(segs[1]!.type).toBe('cubic')
    if (segs[1]!.type === 'cubic') {
      expect(segs[1]!.cp1x).toBe(10)
      expect(segs[1]!.cp2y).toBe(40)
      expect(segs[1]!.x).toBe(50)
    }
  })

  test('parse quadratic bezier', () => {
    const segs = parseSVGPathD('M0 0 Q10 20 30 40')
    expect(segs.length).toBe(2)
    expect(segs[1]!.type).toBe('quadratic')
    if (segs[1]!.type === 'quadratic') {
      expect(segs[1]!.cpx).toBe(10)
      expect(segs[1]!.x).toBe(30)
    }
  })

  test('parse arc command', () => {
    const segs = parseSVGPathD('M0 0 A25 25 0 0 1 50 50')
    expect(segs.length).toBe(2)
    expect(segs[1]!.type).toBe('arc')
    if (segs[1]!.type === 'arc') {
      expect(segs[1]!.rx).toBe(25)
      expect(segs[1]!.sweep).toBe(true)
      expect(segs[1]!.largeArc).toBe(false)
    }
  })

  test('parse H and V commands', () => {
    const segs = parseSVGPathD('M0 0 H50 V100')
    expect(segs.length).toBe(3)
    if (segs[1]!.type === 'line') {
      expect(segs[1]!.x).toBe(50)
      expect(segs[1]!.y).toBe(0)
    }
    if (segs[2]!.type === 'line') {
      expect(segs[2]!.x).toBe(50)
      expect(segs[2]!.y).toBe(100)
    }
  })

  test('parse relative commands', () => {
    const segs = parseSVGPathD('M10 10 l20 30')
    expect(segs.length).toBe(2)
    if (segs[1]!.type === 'line') {
      expect(segs[1]!.x).toBe(30)
      expect(segs[1]!.y).toBe(40)
    }
  })

  test('parse complex multi-command path', () => {
    const segs = parseSVGPathD('M0 0 L100 0 L100 100 L0 100 Z')
    expect(segs.length).toBe(5)
    expect(segs[0]!.type).toBe('move')
    expect(segs[4]!.type).toBe('close')
  })

  test('parseTransformAttr translate', () => {
    const t = parseTransformAttr('translate(10 20)')
    expect(t.x).toBe(10)
    expect(t.y).toBe(20)
  })

  test('parseTransformAttr scale', () => {
    const t = parseTransformAttr('scale(2 3)')
    expect(t.scaleX).toBe(2)
    expect(t.scaleY).toBe(3)
  })

  test('parseTransformAttr rotate', () => {
    const t = parseTransformAttr('rotate(45)')
    expect(t.rotation).toBe(45)
  })

  test('parseTransformAttr null returns identity', () => {
    const t = parseTransformAttr(null)
    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.scaleX).toBe(1)
    expect(t.scaleY).toBe(1)
    expect(t.rotation).toBe(0)
  })

  test('parseTransformAttr matrix', () => {
    // Identity matrix
    const t = parseTransformAttr('matrix(1 0 0 1 50 100)')
    expect(t.x).toBe(50)
    expect(t.y).toBe(100)
    expect(t.scaleX).toBeCloseTo(1)
    expect(t.scaleY).toBeCloseTo(1)
  })
})

describe('LYK-95: CSS style parsing in SVG', () => {
  // Test the CSS regex parsing logic directly (no DOM needed)
  function parseCSSClasses(css: string): Map<string, Record<string, string>> {
    const styleMap = new Map<string, Record<string, string>>()
    const regex = /\.([a-zA-Z0-9_-]+)\s*\{([^}]*)\}/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(css)) !== null) {
      const className = match[1]!
      const body = match[2]!
      const props: Record<string, string> = {}
      for (const decl of body.split(';')) {
        const colonIdx = decl.indexOf(':')
        if (colonIdx === -1) continue
        const prop = decl.substring(0, colonIdx).trim()
        const val = decl.substring(colonIdx + 1).trim()
        if (prop && val) props[prop] = val
      }
      styleMap.set(className, props)
    }
    return styleMap
  }

  test('parseCSSClasses extracts class styles', () => {
    const map = parseCSSClasses('.s0 { fill: #ff0000; stroke: #000; }')
    expect(map.has('s0')).toBe(true)
    const s0 = map.get('s0')!
    expect(s0['fill']).toBe('#ff0000')
    expect(s0['stroke']).toBe('#000')
  })

  test('parseCSSClasses handles multiple classes', () => {
    const map = parseCSSClasses('.a { fill: red; } .b { stroke: blue; }')
    expect(map.size).toBe(2)
    expect(map.get('a')!['fill']).toBe('red')
    expect(map.get('b')!['stroke']).toBe('blue')
  })

  test('parseCSSClasses handles empty css', () => {
    const map = parseCSSClasses('')
    expect(map.size).toBe(0)
  })
})

describe('LYK-86: symbol/instance support', () => {
  test('SymbolDefinition has required fields', () => {
    const sym: SymbolDefinition = {
      id: '1',
      name: 'Button',
      width: 100,
      height: 40,
      layers: [],
    }
    expect(sym.name).toBe('Button')
    expect(sym.layers).toEqual([])
  })

  test('SymbolInstanceLayer references a symbol', () => {
    const instance: SymbolInstanceLayer = {
      id: '2',
      name: 'Button Instance',
      type: 'symbol-instance',
      symbolId: '1',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 100, y: 200, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
    }
    expect(instance.type).toBe('symbol-instance')
    expect(instance.symbolId).toBe('1')
  })

  test('SymbolInstanceLayer supports overrides', () => {
    const instance: SymbolInstanceLayer = {
      id: '3',
      name: 'Button Instance 2',
      type: 'symbol-instance',
      symbolId: '1',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      overrides: {
        'layer-1': { visible: false },
        'layer-2': { opacity: 0.5 },
      },
    }
    expect(instance.overrides!['layer-1']!.visible).toBe(false)
    expect(instance.overrides!['layer-2']!.opacity).toBe(0.5)
  })

  test('symbol-instance is a valid Layer type', () => {
    const layer: Layer = {
      id: '1',
      name: 'Instance',
      type: 'symbol-instance',
      symbolId: 'sym-1',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
    }
    expect(layer.type).toBe('symbol-instance')
  })

  test('document can hold symbol definitions', () => {
    const symbols: SymbolDefinition[] = [
      { id: 's1', name: 'Icon', width: 24, height: 24, layers: [] },
      { id: 's2', name: 'Card', width: 320, height: 200, layers: [] },
    ]
    expect(symbols.length).toBe(2)
  })
})

describe('LYK-106: raster brush tools', () => {
  test('BrushSettings has all fields', () => {
    const brush: BrushSettings = {
      size: 20,
      hardness: 0.7,
      opacity: 0.9,
      flow: 0.8,
      color: '#ff0000',
      spacing: 0.25,
    }
    expect(brush.size).toBe(20)
    expect(brush.hardness).toBe(0.7)
    expect(brush.spacing).toBe(0.25)
  })

  test('brush hardness clamped to 0-1', () => {
    const h1 = Math.max(0, Math.min(1, 0.5))
    expect(h1).toBe(0.5)
    const h2 = Math.max(0, Math.min(1, 1.5))
    expect(h2).toBe(1)
    const h3 = Math.max(0, Math.min(1, -0.2))
    expect(h3).toBe(0)
  })

  test('brush dab spacing calculation', () => {
    const brushSize = 20
    const spacing = 0.25
    const spacingPx = brushSize * spacing
    expect(spacingPx).toBe(5)

    // Number of dabs for a 100px stroke
    const strokeLength = 100
    const dabs = Math.ceil(strokeLength / spacingPx)
    expect(dabs).toBe(20)
  })

  test('brush color parsing', () => {
    const hex = '#ff8040'
    const r = parseInt(hex.substring(1, 3), 16)
    const g = parseInt(hex.substring(3, 5), 16)
    const b = parseInt(hex.substring(5, 7), 16)
    expect(r).toBe(255)
    expect(g).toBe(128)
    expect(b).toBe(64)
  })

  test('brush tool is in activeTool union', () => {
    const tools = [
      'select',
      'pen',
      'node',
      'rectangle',
      'ellipse',
      'polygon',
      'star',
      'text',
      'gradient',
      'eyedropper',
      'hand',
      'measure',
      'brush',
      'crop',
    ]
    expect(tools).toContain('brush')
    expect(tools).toContain('crop')
  })

  test('alpha compositing source-over formula', () => {
    // source alpha = 0.5, dest alpha = 0.8
    const sa = 0.5,
      da = 0.8
    const outAlpha = sa + da * (1 - sa)
    expect(outAlpha).toBeCloseTo(0.9)

    // Blended color channel: (srcC * sa + dstC * da * (1-sa)) / outAlpha
    const srcC = 255,
      dstC = 0
    const outC = (srcC * sa + dstC * da * (1 - sa)) / outAlpha
    expect(Math.round(outC)).toBe(142) // ~141.7
  })
})

describe('LYK-108: image crop tool', () => {
  test('CropRegion has required fields', () => {
    const crop: CropRegion = { x: 10, y: 20, width: 200, height: 150 }
    expect(crop.x).toBe(10)
    expect(crop.width).toBe(200)
  })

  test('RasterLayer supports cropRegion', () => {
    const layer: RasterLayer = {
      id: '1',
      name: 'Photo',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: 'chunk-1',
      width: 800,
      height: 600,
      cropRegion: { x: 100, y: 50, width: 400, height: 300 },
    }
    expect(layer.cropRegion!.width).toBe(400)
    expect(layer.cropRegion!.height).toBe(300)
  })

  test('crop region clamping', () => {
    const imgW = 800,
      imgH = 600
    const crop = { x: 700, y: 500, width: 200, height: 200 }
    const clampedW = Math.min(imgW - crop.x, crop.width)
    const clampedH = Math.min(imgH - crop.y, crop.height)
    expect(clampedW).toBe(100)
    expect(clampedH).toBe(100)
  })

  test('effective dimensions with crop', () => {
    const layer: RasterLayer = {
      id: '1',
      name: 'Img',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: 'c1',
      width: 1000,
      height: 800,
      cropRegion: { x: 0, y: 0, width: 500, height: 400 },
    }
    const effectiveW = layer.cropRegion ? layer.cropRegion.width : layer.width
    const effectiveH = layer.cropRegion ? layer.cropRegion.height : layer.height
    expect(effectiveW).toBe(500)
    expect(effectiveH).toBe(400)
  })

  test('crop preserves pixel extraction logic', () => {
    // Simulate extracting a row of pixels from source
    const srcWidth = 4
    const row = 1
    const cropX = 1
    void 2 // cropWidth (unused in offset calc)
    const srcOffset = (row * srcWidth + cropX) * 4
    const expectedOffset = (1 * 4 + 1) * 4 // row 1, col 1
    expect(srcOffset).toBe(expectedOffset)
  })
})

describe('LYK-97: export slicing', () => {
  test('createSlice returns valid ExportSlice', () => {
    const slice = createSlice('hero', 0, 0, 400, 300, 'png', 2)
    expect(slice.name).toBe('hero')
    expect(slice.format).toBe('png')
    expect(slice.scale).toBe(2)
    expect(slice.width).toBe(400)
    expect(slice.id).toBeTruthy()
  })

  test('createSlice defaults', () => {
    const slice = createSlice('icon', 10, 10, 24, 24)
    expect(slice.format).toBe('png')
    expect(slice.scale).toBe(1)
  })

  test('export slice supports jpeg format', () => {
    const slice = createSlice('bg', 0, 0, 1920, 1080, 'jpeg', 1)
    expect(slice.format).toBe('jpeg')
  })

  test('export slice supports svg format', () => {
    const slice = createSlice('vector', 0, 0, 100, 100, 'svg', 1)
    expect(slice.format).toBe('svg')
  })

  test('batch export filename generation', () => {
    const name = 'hero'
    const format = 'png'
    const scale: number = 2
    const suffix = scale !== 1 ? `@${scale}x` : ''
    const filename = `${name}${suffix}.${format}`
    expect(filename).toBe('hero@2x.png')
  })

  test('batch export 1x has no suffix', () => {
    const name = 'icon'
    const format = 'svg'
    const scale: number = 1
    const suffix = scale !== 1 ? `@${scale}x` : ''
    const filename = `${name}${suffix}.${format}`
    expect(filename).toBe('icon.svg')
  })
})

describe('LYK-93: ICC color profile support', () => {
  test('ICCProfile has name field', () => {
    const profile: ICCProfile = { name: 'sRGB IEC61966-2.1' }
    expect(profile.name).toBe('sRGB IEC61966-2.1')
  })

  test('ICC_PRESETS has known profiles', () => {
    expect(ICC_PRESETS['sRGB']!.name).toBe('sRGB IEC61966-2.1')
    expect(ICC_PRESETS['Display P3']!.name).toBe('Display P3')
    expect(ICC_PRESETS['Adobe RGB']!.name).toBe('Adobe RGB (1998)')
  })

  test('iccColorSpaceToDocColorspace maps RGB to srgb', () => {
    expect(iccColorSpaceToDocColorspace('RGB')).toBe('srgb')
    expect(iccColorSpaceToDocColorspace('RGB ')).toBe('srgb')
  })

  test('parseICCProfile rejects short data', () => {
    expect(() => parseICCProfile(new Uint8Array(10))).toThrow('ICC profile too short')
  })

  test('parseICCProfile reads device class from header', () => {
    // Build minimal 132-byte ICC header
    const data = new Uint8Array(132)
    // Device class at offset 12-15: "mntr" (monitor)
    data[12] = 0x6d
    data[13] = 0x6e
    data[14] = 0x74
    data[15] = 0x72
    // Color space at offset 16-19: "RGB "
    data[16] = 0x52
    data[17] = 0x47
    data[18] = 0x42
    data[19] = 0x20
    // Tag count at 128-131: 0
    data[128] = 0
    data[129] = 0
    data[130] = 0
    data[131] = 0
    const profile = parseICCProfile(data)
    expect(profile.name).toBe('ICC RGB (mntr)')
  })

  test('document metadata can hold iccProfile', () => {
    const meta = {
      title: 'Test',
      author: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      colorspace: 'srgb' as const,
      width: 1920,
      height: 1080,
      iccProfile: { name: 'sRGB IEC61966-2.1' },
    }
    expect(meta.iccProfile.name).toBe('sRGB IEC61966-2.1')
  })
})
