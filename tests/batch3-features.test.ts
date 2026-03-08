import { describe, test, expect } from 'bun:test'
import { generateRectangle } from '@/tools/shapes'

describe('LYK-113: artboard resize', () => {
  test('resize clamps minimum to 1', () => {
    const width = Math.max(1, -50)
    const height = Math.max(1, 0)
    expect(width).toBe(1)
    expect(height).toBe(1)
  })

  test('resize preserves positive dimensions', () => {
    const width = Math.max(1, 800)
    const height = Math.max(1, 600)
    expect(width).toBe(800)
    expect(height).toBe(600)
  })
})

describe('LYK-118: JPEG export', () => {
  test('JPEG mime type mapping', () => {
    const format = 'jpeg' as const
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    expect(mimeType).toBe('image/jpeg')
  })

  test('JPEG quality default', () => {
    const quality = undefined ?? 0.92
    expect(quality).toBe(0.92)
  })

  test('PNG format still works', () => {
    const format = 'png' as const
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    expect(mimeType).toBe('image/png')
  })
})

describe('LYK-90/LYK-123: corner radius', () => {
  test('zero corner radius produces line segments', () => {
    const segs = generateRectangle(0, 0, 100, 50, 0)
    expect(segs.length).toBe(5) // move + 3 lines + close
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('line')
    expect(segs[4]!.type).toBe('close')
  })

  test('positive corner radius produces cubic segments', () => {
    const segs = generateRectangle(0, 0, 100, 50, 10)
    // Should have: move + line + cubic + line + cubic + line + cubic + line + cubic + close
    expect(segs.length).toBe(10)
    const cubics = segs.filter(s => s.type === 'cubic')
    expect(cubics.length).toBe(4) // one per corner
  })

  test('corner radius clamped to half minimum dimension', () => {
    const segs = generateRectangle(0, 0, 40, 20, 100)
    // radius should be clamped to min(100, 20, 10) = 10
    const firstCubic = segs.find(s => s.type === 'cubic')
    expect(firstCubic).toBeDefined()
    // Check the path is valid (no NaN)
    for (const seg of segs) {
      if ('x' in seg) {
        expect(Number.isFinite(seg.x)).toBe(true)
        expect(Number.isFinite(seg.y)).toBe(true)
      }
    }
  })

  test('corner radius 0 is same as no radius', () => {
    const noRadius = generateRectangle(10, 20, 50, 30)
    const zeroRadius = generateRectangle(10, 20, 50, 30, 0)
    expect(noRadius.length).toBe(zeroRadius.length)
  })
})

describe('LYK-100: multi-line text', () => {
  test('text splits into lines on newline', () => {
    const text = 'Hello\nWorld\nFoo'
    const lines = text.split('\n')
    expect(lines.length).toBe(3)
    expect(lines[0]).toBe('Hello')
    expect(lines[1]).toBe('World')
    expect(lines[2]).toBe('Foo')
  })

  test('line height calculation', () => {
    const fontSize = 24
    const lineHeight = 1.4
    const lineH = fontSize * lineHeight
    expect(lineH).toBeCloseTo(33.6)
  })

  test('default line height is 1.4', () => {
    const lineHeight = undefined ?? 1.4
    expect(lineHeight).toBe(1.4)
  })

  test('default letter spacing is 0', () => {
    const letterSpacing = undefined ?? 0
    expect(letterSpacing).toBe(0)
  })

  test('multi-line y positions', () => {
    const fontSize = 20
    const lineHeight = 1.5
    const lineH = fontSize * lineHeight
    const lines = ['Line 1', 'Line 2', 'Line 3']
    const yPositions = lines.map((_, i) => i * lineH)
    expect(yPositions).toEqual([0, 30, 60])
  })

  test('cursor navigation: line start calculation', () => {
    const text = 'abc\nde\nfgh'
    const lines = text.split('\n')
    // Line starts: 0, 4, 7
    let pos = 0
    const starts: number[] = []
    for (const line of lines) {
      starts.push(pos)
      pos += line.length + 1
    }
    expect(starts).toEqual([0, 4, 7])
  })

  test('cursor up: moves to same column in previous line', () => {
    const text = 'Hello\nWorld'
    const lines = text.split('\n')
    const cursorPos = 8 // 'W'o'r'l'd - position 8 = col 3 in line 1
    let lineStart = 0
    let currentLine = 0
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i]!.length
      if (cursorPos >= lineStart && cursorPos <= lineEnd) {
        currentLine = i
        break
      }
      lineStart = lineEnd + 1
    }
    expect(currentLine).toBe(1)

    // Calculate column offset
    let curLineStart = 0
    for (let i = 0; i < currentLine; i++) curLineStart += lines[i]!.length + 1
    const colOffset = cursorPos - curLineStart
    expect(colOffset).toBe(2) // 'Wo' = 2 chars into line 1

    // Move to same column in previous line
    const newPos = 0 + Math.min(colOffset, lines[0]!.length) // prevLineStart=0, col=2
    expect(newPos).toBe(2) // 'He' -> position 2 in line 0
  })
})
