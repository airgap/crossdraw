import { describe, test, expect, beforeAll } from 'bun:test'
import { segmentsToSVGPath, segmentsToPath2D } from '@/math/path'
import type { Segment } from '@/types'

// Mock Path2D for bun:test (no DOM available)
class MockPath2D {
  private _commands: string[] = []
  constructor(svgPath?: string) {
    if (svgPath) this._commands.push(`init:${svgPath}`)
  }
  moveTo(x: number, y: number) {
    this._commands.push(`moveTo(${x},${y})`)
  }
  lineTo(x: number, y: number) {
    this._commands.push(`lineTo(${x},${y})`)
  }
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this._commands.push(`bezierCurveTo(${cp1x},${cp1y},${cp2x},${cp2y},${x},${y})`)
  }
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    this._commands.push(`quadraticCurveTo(${cpx},${cpy},${x},${y})`)
  }
  closePath() {
    this._commands.push('closePath')
  }
  addPath(path: MockPath2D) {
    this._commands.push(`addPath(${(path as any)._commands.join(';')})`)
  }
  get commands() {
    return this._commands
  }
}

beforeAll(() => {
  ;(globalThis as any).Path2D = MockPath2D
})

// ---- segmentsToSVGPath Tests ----

describe('segmentsToSVGPath', () => {
  test('returns empty string for empty segments', () => {
    expect(segmentsToSVGPath([])).toBe('')
  })

  test('converts move segment', () => {
    const result = segmentsToSVGPath([{ type: 'move', x: 10, y: 20 }])
    expect(result).toBe('M10 20')
  })

  test('converts line segment', () => {
    const result = segmentsToSVGPath([{ type: 'line', x: 30, y: 40 }])
    expect(result).toBe('L30 40')
  })

  test('converts cubic bezier segment', () => {
    const result = segmentsToSVGPath([{ type: 'cubic', x: 100, y: 100, cp1x: 20, cp1y: 30, cp2x: 80, cp2y: 90 }])
    expect(result).toBe('C20 30 80 90 100 100')
  })

  test('converts quadratic bezier segment', () => {
    const result = segmentsToSVGPath([{ type: 'quadratic', x: 100, y: 100, cpx: 50, cpy: 0 }])
    expect(result).toBe('Q50 0 100 100')
  })

  test('converts arc segment', () => {
    const result = segmentsToSVGPath([
      { type: 'arc', x: 100, y: 100, rx: 50, ry: 30, rotation: 45, largeArc: true, sweep: false },
    ])
    expect(result).toBe('A50 30 45 1 0 100 100')
  })

  test('converts arc segment with sweep=true', () => {
    const result = segmentsToSVGPath([
      { type: 'arc', x: 50, y: 50, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: true },
    ])
    expect(result).toBe('A25 25 0 0 1 50 50')
  })

  test('converts close segment', () => {
    const result = segmentsToSVGPath([{ type: 'close' }])
    expect(result).toBe('Z')
  })

  test('converts a full rectangle path', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'line', x: 0, y: 100 },
      { type: 'close' },
    ]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M0 0 L100 0 L100 100 L0 100 Z')
  })

  test('handles mixed segment types', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'quadratic', x: 100, y: 50, cpx: 75, cpy: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 100, cp1y: 75, cp2x: 75, cp2y: 100 },
      { type: 'arc', x: 0, y: 100, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
      { type: 'close' },
    ]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M0 0 L50 0 Q75 0 100 50 C100 75 75 100 100 100 A50 50 0 0 1 0 100 Z')
  })

  test('handles negative coordinates', () => {
    const segments: Segment[] = [
      { type: 'move', x: -10, y: -20 },
      { type: 'line', x: -30, y: -40 },
    ]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M-10 -20 L-30 -40')
  })

  test('handles decimal coordinates', () => {
    const segments: Segment[] = [
      { type: 'move', x: 1.5, y: 2.7 },
      { type: 'line', x: 3.14, y: 4.999 },
    ]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M1.5 2.7 L3.14 4.999')
  })

  test('handles zero coordinates', () => {
    const segments: Segment[] = [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 0, y: 0 }, { type: 'close' }]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M0 0 L0 0 Z')
  })

  test('single close only', () => {
    expect(segmentsToSVGPath([{ type: 'close' }])).toBe('Z')
  })

  test('multiple moves', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'move', x: 50, y: 50 },
    ]
    const result = segmentsToSVGPath(segments)
    expect(result).toBe('M0 0 M50 50')
  })
})

// ---- segmentsToPath2D Tests ----

describe('segmentsToPath2D', () => {
  test('returns a Path2D for empty segments', () => {
    const path = segmentsToPath2D([]) as unknown as MockPath2D
    expect(path.commands.length).toBe(0)
  })

  test('handles move segment', () => {
    const path = segmentsToPath2D([{ type: 'move', x: 10, y: 20 }]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(10,20)')
  })

  test('handles line segment', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 100 },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(0,0)')
    expect(path.commands).toContain('lineTo(100,100)')
  })

  test('handles cubic bezier segment', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 0, y: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 20, cp1y: 30, cp2x: 80, cp2y: 90 },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(0,0)')
    expect(path.commands).toContain('bezierCurveTo(20,30,80,90,100,100)')
  })

  test('handles quadratic bezier segment', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 0, y: 0 },
      { type: 'quadratic', x: 100, y: 100, cpx: 50, cpy: 0 },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(0,0)')
    expect(path.commands).toContain('quadraticCurveTo(50,0,100,100)')
  })

  test('handles arc segment via addPath with SVG path string', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 0, y: 0 },
      { type: 'arc', x: 100, y: 0, rx: 50, ry: 50, rotation: 0, largeArc: true, sweep: true },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(0,0)')
    // Arc uses addPath with SVG path string
    const arcCmd = path.commands.find((c: string) => c.startsWith('addPath'))
    expect(arcCmd).toBeDefined()
    expect(arcCmd).toContain('A50 50 0 1 1 100 0')
  })

  test('handles arc with largeArc=false, sweep=false', () => {
    const path = segmentsToPath2D([
      { type: 'arc', x: 50, y: 50, rx: 25, ry: 25, rotation: 0, largeArc: false, sweep: false },
    ]) as unknown as MockPath2D
    const arcCmd = path.commands.find((c: string) => c.startsWith('addPath'))
    expect(arcCmd).toBeDefined()
    expect(arcCmd).toContain('A25 25 0 0 0 50 50')
  })

  test('handles close segment', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 100, y: 0 },
      { type: 'line', x: 100, y: 100 },
      { type: 'close' },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(0,0)')
    expect(path.commands).toContain('lineTo(100,0)')
    expect(path.commands).toContain('lineTo(100,100)')
    expect(path.commands).toContain('closePath')
  })

  test('handles full complex path with all segment types', () => {
    const segments: Segment[] = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 50, y: 0 },
      { type: 'quadratic', x: 100, y: 50, cpx: 75, cpy: 0 },
      { type: 'cubic', x: 100, y: 100, cp1x: 100, cp1y: 75, cp2x: 75, cp2y: 100 },
      { type: 'arc', x: 0, y: 100, rx: 50, ry: 50, rotation: 0, largeArc: false, sweep: true },
      { type: 'close' },
    ]
    const path = segmentsToPath2D(segments) as unknown as MockPath2D
    expect(path.commands.length).toBe(6) // move, line, quad, cubic, addPath(arc), close
    expect(path.commands[0]).toBe('moveTo(0,0)')
    expect(path.commands[1]).toBe('lineTo(50,0)')
    expect(path.commands[2]).toBe('quadraticCurveTo(75,0,100,50)')
    expect(path.commands[3]).toBe('bezierCurveTo(100,75,75,100,100,100)')
    expect(path.commands[4]).toContain('addPath')
    expect(path.commands[5]).toBe('closePath')
  })

  test('handles negative coordinates', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: -10, y: -20 },
      { type: 'line', x: -30, y: -40 },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(-10,-20)')
    expect(path.commands).toContain('lineTo(-30,-40)')
  })

  test('handles arc with rotation', () => {
    const path = segmentsToPath2D([
      { type: 'arc', x: 100, y: 100, rx: 50, ry: 30, rotation: 45, largeArc: true, sweep: false },
    ]) as unknown as MockPath2D
    const arcCmd = path.commands.find((c: string) => c.startsWith('addPath'))
    expect(arcCmd).toBeDefined()
    expect(arcCmd).toContain('A50 30 45 1 0 100 100')
  })

  test('produces same commands for same input', () => {
    const segments: Segment[] = [{ type: 'move', x: 0, y: 0 }, { type: 'line', x: 100, y: 100 }, { type: 'close' }]
    const path1 = segmentsToPath2D(segments) as unknown as MockPath2D
    const path2 = segmentsToPath2D(segments) as unknown as MockPath2D
    expect(path1.commands).toEqual(path2.commands)
  })

  test('handles decimal coordinates in Path2D', () => {
    const path = segmentsToPath2D([
      { type: 'move', x: 1.5, y: 2.7 },
      { type: 'line', x: 3.14, y: 4.999 },
    ]) as unknown as MockPath2D
    expect(path.commands).toContain('moveTo(1.5,2.7)')
    expect(path.commands).toContain('lineTo(3.14,4.999)')
  })
})
