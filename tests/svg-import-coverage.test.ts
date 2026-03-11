import { describe, test, expect, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { importSVG, parseSVGStyles, parseSVGPathD, parseTransformAttr } from '@/io/svg-import'
import type { VectorLayer, GroupLayer, TextLayer } from '@/types'

// Provide DOMParser for bun:test environment
let _dom: JSDOM
beforeAll(() => {
  _dom = new JSDOM('')
  ;(globalThis as any).DOMParser = _dom.window.DOMParser
})

// ── Helper ──

function svgWrap(inner: string, w = 100, h = 100): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`
}

// ── Tests targeting uncovered lines ──

describe('svg-import-coverage: clip-path and mask (lines 262-321)', () => {
  test('clip-path on an element via url() reference', () => {
    const svg = svgWrap(`
      <defs>
        <clipPath id="myClip">
          <rect x="0" y="0" width="50" height="50"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="red" clip-path="url(#myClip)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.mask).toBeDefined()
  })

  test('mask on an element via url() reference', () => {
    const svg = svgWrap(`
      <defs>
        <mask id="myMask">
          <rect x="0" y="0" width="50" height="50" fill="white"/>
        </mask>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="blue" mask="url(#myMask)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.mask).toBeDefined()
  })

  test('clipPath with multiple children creates a group mask', () => {
    const svg = svgWrap(`
      <defs>
        <clipPath id="multiClip">
          <rect x="0" y="0" width="25" height="25"/>
          <circle cx="50" cy="50" r="20"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="green" clip-path="url(#multiClip)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.mask).toBeDefined()
    expect(layer.mask!.type).toBe('group')
    if (layer.mask!.type === 'group') {
      expect(layer.mask!.children.length).toBe(2)
    }
  })

  test('clipPath with no valid children produces no mask', () => {
    const svg = svgWrap(`
      <defs>
        <clipPath id="emptyClip">
          <desc>Not a shape</desc>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="red" clip-path="url(#emptyClip)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.mask).toBeUndefined()
  })

  test('clip-path specified in inline style', () => {
    const svg = svgWrap(`
      <defs>
        <clipPath id="styleClip">
          <rect x="0" y="0" width="50" height="50"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="red" style="clip-path: url(#styleClip)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.mask).toBeDefined()
  })
})

describe('svg-import-coverage: <use> element (lines 658-805)', () => {
  test('<use> referencing a <symbol> with viewBox', () => {
    const svg = svgWrap(`
      <defs>
        <symbol id="icon" viewBox="0 0 24 24">
          <rect x="0" y="0" width="24" height="24" fill="red"/>
        </symbol>
      </defs>
      <use href="#icon" x="10" y="10" width="48" height="48"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as GroupLayer
    expect(layer.type).toBe('group')
    expect(layer.transform.x).toBe(10)
    expect(layer.transform.y).toBe(10)
    expect(layer.transform.scaleX).toBe(2) // 48/24
    expect(layer.transform.scaleY).toBe(2)
  })

  test('<use> referencing a <symbol> without viewBox (no scaling)', () => {
    const svg = svgWrap(`
      <defs>
        <symbol id="noVB">
          <circle cx="10" cy="10" r="5" fill="blue"/>
        </symbol>
      </defs>
      <use href="#noVB" x="5" y="5"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as GroupLayer
    expect(layer.type).toBe('group')
    expect(layer.transform.x).toBe(5)
    expect(layer.transform.y).toBe(5)
    expect(layer.transform.scaleX).toBe(1)
    expect(layer.transform.scaleY).toBe(1)
  })

  test('<use> referencing a regular element by id', () => {
    const svg = svgWrap(`
      <defs>
        <rect id="myRect" x="0" y="0" width="30" height="30" fill="green"/>
      </defs>
      <use href="#myRect" x="20" y="20"/>
    `)
    const doc = importSVG(svg)
    const layers = doc.artboards[0]!.layers
    // The <use> should create a layer offset by x=20, y=20
    expect(layers.length).toBeGreaterThanOrEqual(1)
    const useLayer = layers.find((l) => l.transform.x === 20 && l.transform.y === 20)
    expect(useLayer).toBeDefined()
  })

  test('<use> with xlink:href', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
      <defs>
        <circle id="xlinkCircle" cx="10" cy="10" r="5" fill="red"/>
      </defs>
      <use xlink:href="#xlinkCircle" x="10" y="10"/>
    </svg>`
    const doc = importSVG(svg)
    expect(doc.artboards[0]!.layers.length).toBeGreaterThanOrEqual(1)
  })

  test('<use> with no href returns null (no extra layers)', () => {
    const svg = svgWrap(`
      <use x="10" y="10"/>
    `)
    const doc = importSVG(svg)
    // Should have no layers from the <use> since href is missing
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  test('<use> referencing nonexistent id returns null', () => {
    const svg = svgWrap(`
      <use href="#doesNotExist" x="10" y="10"/>
    `)
    const doc = importSVG(svg)
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  test('<use> element with transform attribute', () => {
    const svg = svgWrap(`
      <defs>
        <symbol id="symTrans" viewBox="0 0 10 10">
          <rect x="0" y="0" width="10" height="10" fill="orange"/>
        </symbol>
      </defs>
      <use href="#symTrans" x="5" y="5" width="20" height="20" transform="scale(2)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.transform.scaleX).toBe(4) // scale(2) * (20/10)
  })

  test('<use> referencing element gets cloned with fresh ids', () => {
    const svg = svgWrap(`
      <defs>
        <rect id="cloneMe" x="0" y="0" width="10" height="10" fill="purple"/>
      </defs>
      <use href="#cloneMe" x="0" y="0"/>
      <use href="#cloneMe" x="20" y="0"/>
    `)
    const doc = importSVG(svg)
    const layers = doc.artboards[0]!.layers
    expect(layers.length).toBe(2)
    // Each should have a unique id
    expect(layers[0]!.id).not.toBe(layers[1]!.id)
  })

  test('<use> element with id overrides name, with opacity', () => {
    const svg = svgWrap(`
      <defs>
        <rect id="origRect" x="0" y="0" width="10" height="10" fill="red"/>
      </defs>
      <use id="myUse" href="#origRect" x="0" y="0" opacity="0.5"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.name).toBe('myUse')
    expect(layer.opacity).toBeCloseTo(0.5)
  })
})

describe('svg-import-coverage: <line> element (lines 355-356)', () => {
  test('parses <line> element', () => {
    const svg = svgWrap(`<line x1="10" y1="20" x2="80" y2="90" stroke="black" stroke-width="2"/>`)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.type).toBe('vector')
    expect(layer.paths[0]!.segments.length).toBe(2)
    expect(layer.paths[0]!.segments[0]!).toMatchObject({ type: 'move', x: 10, y: 20 })
    expect(layer.paths[0]!.segments[1]!).toMatchObject({ type: 'line', x: 80, y: 90 })
  })
})

describe('svg-import-coverage: <polyline>/<polygon> (lines 421)', () => {
  test('parses <polyline> element', () => {
    const svg = svgWrap(`<polyline points="10,10 50,90 90,10" fill="none" stroke="red"/>`)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.type).toBe('vector')
    expect(layer.paths[0]!.segments.length).toBe(3)
    expect(layer.paths[0]!.closed).toBe(false)
  })

  test('parses <polygon> element', () => {
    const svg = svgWrap(`<polygon points="50,5 90,90 10,90" fill="green"/>`)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.type).toBe('vector')
    expect(layer.paths[0]!.closed).toBe(true)
    // polygon has close segment
    const segs = layer.paths[0]!.segments
    expect(segs[segs.length - 1]!.type).toBe('close')
  })
})

describe('svg-import-coverage: <text> element', () => {
  test('parses <text> element with font attributes', () => {
    const svg = svgWrap(`
      <text x="10" y="20" fill="red" font-family="Helvetica" font-size="24" font-weight="bold" font-style="italic">Hello</text>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as TextLayer
    expect(layer.type).toBe('text')
    expect(layer.text).toBe('Hello')
    expect(layer.fontFamily).toBe('Helvetica')
    expect(layer.fontSize).toBe(24)
    expect(layer.fontWeight).toBe('bold')
    expect(layer.fontStyle).toBe('italic')
    expect(layer.color).toBe('red')
  })

  test('text with nested <tspan> elements', () => {
    const svg = svgWrap(`
      <text x="10" y="20" fill="black"><tspan>Part 1</tspan> <tspan>Part 2</tspan></text>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as TextLayer
    expect(layer.type).toBe('text')
    expect(layer.text).toContain('Part 1')
    expect(layer.text).toContain('Part 2')
  })
})

describe('svg-import-coverage: parseSVGPathD arc commands (lines 1061-1133)', () => {
  test('A (absolute arc) command', () => {
    const segs = parseSVGPathD('M10 80 A25 25 0 0 1 50 80')
    // Should have move and arc segments
    expect(segs.length).toBeGreaterThanOrEqual(2)
    expect(segs[0]!.type).toBe('move')
    // Arc may be converted to cubics or kept as arc
    const nonMove = segs.slice(1)
    expect(nonMove.length).toBeGreaterThan(0)
  })

  test('a (relative arc) command', () => {
    const segs = parseSVGPathD('M10 80 a25 25 0 0 1 40 0')
    expect(segs.length).toBeGreaterThanOrEqual(2)
  })

  test('arc with large-arc and sweep flags', () => {
    const segs = parseSVGPathD('M10 80 A25 25 0 1 0 50 80')
    expect(segs.length).toBeGreaterThanOrEqual(2)
  })

  test('multiple arcs in a row', () => {
    const segs = parseSVGPathD('M0 0 A10 10 0 0 1 20 0 A10 10 0 0 1 40 0')
    expect(segs.length).toBeGreaterThanOrEqual(3)
  })
})

describe('svg-import-coverage: parseFlag (lines 1072-1078)', () => {
  test('parseFlag handles compact arc notation', () => {
    // Compact notation: A25 25 0 01 50 80 (flags without whitespace)
    const segs = parseSVGPathD('M10 80 A25 25 0 01 50 80')
    expect(segs.length).toBeGreaterThanOrEqual(2)
  })
})

describe('svg-import-coverage: parseSVGStyles CSS class selectors', () => {
  test('CSS class selector applies fill', () => {
    const svg = svgWrap(`
      <style>.red-box { fill: red; }</style>
      <rect class="red-box" x="0" y="0" width="50" height="50"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill).not.toBeNull()
    if (layer.fill?.type === 'solid') {
      expect(layer.fill.color).toBe('red')
    }
  })

  test('CSS class selector applies stroke', () => {
    const svg = svgWrap(`
      <style>.stroked { stroke: blue; stroke-width: 3; }</style>
      <rect class="stroked" x="0" y="0" width="50" height="50"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.stroke).not.toBeNull()
    expect(layer.stroke!.color).toBe('blue')
    expect(layer.stroke!.width).toBeCloseTo(3)
  })

  test('CSS with multiple classes on one element', () => {
    const svg = svgWrap(`
      <style>.a { fill: red; } .b { stroke: blue; stroke-width: 2; }</style>
      <rect class="a b" x="0" y="0" width="50" height="50"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill).not.toBeNull()
    expect(layer.stroke).not.toBeNull()
  })

  test('parseSVGStyles returns map of class -> properties', () => {
    const dom = new JSDOM(
      `<svg xmlns="http://www.w3.org/2000/svg"><style>.cls1 { fill: red; stroke: blue; } .cls2 { opacity: 0.5; }</style></svg>`,
    )
    const svgEl = dom.window.document.querySelector('svg')!
    const map = parseSVGStyles(svgEl)
    expect(map.get('cls1')).toEqual({ fill: 'red', stroke: 'blue' })
    expect(map.get('cls2')).toEqual({ opacity: '0.5' })
  })
})

describe('svg-import-coverage: gradient defs with inheritance (lines 1314-1357)', () => {
  test('gradient with href inheritance', () => {
    const svg = svgWrap(`
      <defs>
        <linearGradient id="base">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
        <linearGradient id="child" href="#base" x1="0" y1="0" x2="1" y2="0"/>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#child)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill).not.toBeNull()
    expect(layer.fill?.type).toBe('gradient')
    expect(layer.fill?.gradient?.stops.length).toBe(2)
    expect(layer.fill?.gradient?.stops[0]!.color).toBe('red')
  })

  test('gradient with gradientUnits=userSpaceOnUse', () => {
    const svg = svgWrap(`
      <defs>
        <linearGradient id="usu" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#usu)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill?.gradient?.gradientUnits).toBe('userSpaceOnUse')
  })

  test('gradient with gradientTransform', () => {
    const svg = svgWrap(`
      <defs>
        <linearGradient id="gt" gradientTransform="rotate(45)" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#gt)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill?.gradient?.gradientTransform).toBeDefined()
    expect(layer.fill?.gradient?.gradientTransform?.rotate).toBeCloseTo(45, 1)
  })

  test('radialGradient with fx/fy focal point', () => {
    const svg = svgWrap(`
      <defs>
        <radialGradient id="rg" cx="0.5" cy="0.5" r="0.5" fx="0.3" fy="0.3">
          <stop offset="0" stop-color="white"/>
          <stop offset="1" stop-color="black"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#rg)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill?.gradient?.type).toBe('radial')
    expect(layer.fill?.gradient?.x).toBeCloseTo(0.3) // fx
    expect(layer.fill?.gradient?.y).toBeCloseTo(0.3) // fy
    expect(layer.fill?.gradient?.radius).toBeCloseTo(0.5)
  })

  test('gradient stop offset as percentage', () => {
    const svg = svgWrap(`
      <defs>
        <linearGradient id="pct" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="red"/>
          <stop offset="50%" stop-color="green"/>
          <stop offset="100%" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#pct)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    const stops = layer.fill?.gradient?.stops
    expect(stops).toBeDefined()
    expect(stops![0]!.offset).toBeCloseTo(0)
    expect(stops![1]!.offset).toBeCloseTo(0.5)
    expect(stops![2]!.offset).toBeCloseTo(1)
  })

  test('gradient with xlink:href inheritance', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
      <defs>
        <linearGradient id="xlinkBase">
          <stop offset="0" stop-color="yellow"/>
          <stop offset="1" stop-color="purple"/>
        </linearGradient>
        <linearGradient id="xlinkChild" xlink:href="#xlinkBase" x1="0" y1="0" x2="1" y2="1"/>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#xlinkChild)"/>
    </svg>`
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill?.gradient?.stops.length).toBe(2)
  })
})

describe('svg-import-coverage: deep clone layer (lines 789-807)', () => {
  test('deep clone creates unique ids for nested groups', () => {
    const svg = svgWrap(`
      <defs>
        <g id="cloneGroup">
          <rect x="0" y="0" width="10" height="10" fill="red"/>
          <g>
            <circle cx="5" cy="5" r="3" fill="blue"/>
          </g>
        </g>
      </defs>
      <use href="#cloneGroup" x="0" y="0"/>
      <use href="#cloneGroup" x="50" y="0"/>
    `)
    const doc = importSVG(svg)
    const layers = doc.artboards[0]!.layers
    expect(layers.length).toBe(2)
    expect(layers[0]!.id).not.toBe(layers[1]!.id)
  })
})

describe('svg-import-coverage: clipPath/mask defs parsing (lines 811-823)', () => {
  test('mask defs are parsed from <defs>', () => {
    const svg = svgWrap(`
      <defs>
        <mask id="testMask">
          <rect x="0" y="0" width="100" height="100" fill="white"/>
        </mask>
      </defs>
      <circle cx="50" cy="50" r="40" fill="red" mask="url(#testMask)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]!
    expect(layer.mask).toBeDefined()
  })
})

describe('svg-import-coverage: importSVG edge cases', () => {
  test('SVG with no width/height but viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300">
      <rect x="0" y="0" width="100" height="100" fill="red"/>
    </svg>`
    const doc = importSVG(svg)
    expect(doc.artboards[0]!.width).toBe(500)
    expect(doc.artboards[0]!.height).toBe(300)
  })

  test('SVG with no viewBox or dimensions defaults', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="50" height="50" fill="red"/>
    </svg>`
    const doc = importSVG(svg)
    // Should have some default dimensions
    expect(doc.artboards[0]!.width).toBeGreaterThan(0)
    expect(doc.artboards[0]!.height).toBeGreaterThan(0)
  })

  test('SVG with percentage width/height', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 200 200">
      <rect x="0" y="0" width="50" height="50" fill="red"/>
    </svg>`
    const doc = importSVG(svg)
    // Falls back to viewBox dimensions
    expect(doc.artboards[0]!.width).toBe(200)
  })

  test('SVG with unknown element tags are skipped', () => {
    const svg = svgWrap(`
      <foreignObject x="0" y="0" width="50" height="50">
        <div>Hello</div>
      </foreignObject>
      <rect x="0" y="0" width="50" height="50" fill="red"/>
    `)
    const doc = importSVG(svg)
    // foreignObject should be skipped, only rect should remain
    expect(doc.artboards[0]!.layers.length).toBe(1)
  })

  test('parseSVGPathD with implicit line after M', () => {
    const segs = parseSVGPathD('M0 0 10 10 20 0')
    // After M with extra coords, they become implicit L
    expect(segs.length).toBe(3)
    expect(segs[1]!.type).toBe('line')
    expect(segs[2]!.type).toBe('line')
  })

  test('parseSVGPathD with implicit line after relative m', () => {
    const segs = parseSVGPathD('m0 0 10 10 20 0')
    expect(segs.length).toBe(3)
    expect(segs[1]!.type).toBe('line')
    expect(segs[2]!.type).toBe('line')
    expect(segs[2]!).toMatchObject({ type: 'line', x: 30, y: 10 })
  })
})

describe('svg-import-coverage: decomposeMatrix with skew (line 1261)', () => {
  test('skewX transform produces skewX in result', () => {
    const t = parseTransformAttr('skewX(30)')
    // skewX should be approximately 30 degrees
    expect(t.skewX).toBeDefined()
    expect(Math.abs(t.skewX!)).toBeGreaterThan(0)
  })
})

describe('svg-import-coverage: element fill via currentColor', () => {
  test('currentColor resolves up the tree', () => {
    const svg = svgWrap(`
      <g color="blue">
        <rect x="0" y="0" width="50" height="50" fill="currentColor"/>
      </g>
    `)
    const doc = importSVG(svg)
    const group = doc.artboards[0]!.layers[0]! as GroupLayer
    const layer = group.children[0]! as VectorLayer
    expect(layer.fill?.type).toBe('solid')
    if (layer.fill?.type === 'solid') {
      expect(layer.fill.color).toBe('blue')
    }
  })
})

describe('svg-import-coverage: gradient with gradientUnits=objectBoundingBox', () => {
  test('gradient with objectBoundingBox units', () => {
    const svg = svgWrap(`
      <defs>
        <linearGradient id="obb" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="red"/>
          <stop offset="1" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#obb)"/>
    `)
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0]! as VectorLayer
    expect(layer.fill?.gradient?.gradientUnits).toBe('objectBoundingBox')
  })
})
