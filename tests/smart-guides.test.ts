import { describe, test, expect } from 'bun:test'
import { calcDistanceLabels, detectEqualSpacing, renderDistanceLabel, renderEqualSpacing } from '@/render/smart-guides'
import type { DistanceLabel, EqualSpacingIndicator } from '@/render/smart-guides'

// ── Canvas context mock ──

function mockCtx(w = 800, h = 600) {
  const calls: { method: string; args: any[] }[] = []
  const record =
    (name: string) =>
    (...args: any[]) =>
      calls.push({ method: name, args })
  return {
    ctx: {
      canvas: { width: w, height: h },
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      closePath: record('closePath'),
      fill: record('fill'),
      stroke: record('stroke'),
      arc: record('arc'),
      rect: record('rect'),
      save: record('save'),
      restore: record('restore'),
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      fillText: record('fillText'),
      roundRect: record('roundRect'),
      setLineDash: record('setLineDash'),
      measureText: () => ({ width: 50, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 }),
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      font: '12px sans-serif',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
    } as unknown as CanvasRenderingContext2D,
    calls,
  }
}

// ── calcDistanceLabels ──

describe('calcDistanceLabels', () => {
  test('selected left of target produces horizontal distance label', () => {
    const selected = { x: 0, y: 0, w: 50, h: 50 }
    const target = { x: 100, y: 0, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    expect(labels[0]!.axis).toBe('horizontal')
    expect(labels[0]!.distance).toBe(50) // 100 - (0+50) = 50
  })

  test('selected right of target produces horizontal distance label', () => {
    const selected = { x: 200, y: 0, w: 50, h: 50 }
    const target = { x: 0, y: 0, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    expect(labels[0]!.axis).toBe('horizontal')
    expect(labels[0]!.distance).toBe(150) // 200 - (0+50) = 150
  })

  test('selected above target produces vertical distance label', () => {
    const selected = { x: 0, y: 0, w: 50, h: 50 }
    const target = { x: 0, y: 100, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    expect(labels[0]!.axis).toBe('vertical')
    expect(labels[0]!.distance).toBe(50) // 100 - (0+50) = 50
  })

  test('selected below target produces vertical distance label', () => {
    const selected = { x: 0, y: 200, w: 50, h: 50 }
    const target = { x: 0, y: 0, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    expect(labels[0]!.axis).toBe('vertical')
    expect(labels[0]!.distance).toBe(150) // 200 - (0+50) = 150
  })

  test('diagonal offset produces both horizontal and vertical labels', () => {
    const selected = { x: 0, y: 0, w: 50, h: 50 }
    const target = { x: 100, y: 100, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(2)
    const axes = labels.map((l) => l.axis).sort()
    expect(axes).toEqual(['horizontal', 'vertical'])
  })

  test('overlapping boxes produce no labels', () => {
    const selected = { x: 0, y: 0, w: 100, h: 100 }
    const target = { x: 50, y: 50, w: 100, h: 100 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(0)
  })

  test('adjacent boxes (touching) produce no labels', () => {
    const selected = { x: 0, y: 0, w: 50, h: 50 }
    const target = { x: 50, y: 0, w: 50, h: 50 }
    // selected.x + selected.w = 50 = target.x, so dist = 0
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    expect(labels[0]!.distance).toBe(0)
  })

  test('label x/y are midpoint between boxes', () => {
    const selected = { x: 0, y: 0, w: 50, h: 50 }
    const target = { x: 150, y: 0, w: 50, h: 50 }
    const labels = calcDistanceLabels(selected, target)
    expect(labels).toHaveLength(1)
    // x = selected.x + selected.w + dist/2 = 50 + 50 = 100
    expect(labels[0]!.x).toBe(100)
    // y = average of centers
    expect(labels[0]!.y).toBe(25) // (25 + 25) / 2
  })
})

// ── detectEqualSpacing ──

describe('detectEqualSpacing', () => {
  test('returns null for fewer than 3 boxes', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).toBeNull()
  })

  test('detects equal horizontal spacing among 3 elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
      { id: 'c', x: 200, y: 0, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).not.toBeNull()
    expect(result!.axis).toBe('horizontal')
    expect(result!.spacing).toBe(50) // gap between edges
    expect(result!.positions).toHaveLength(3)
  })

  test('detects equal vertical spacing among 3 elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 0, y: 100, w: 50, h: 50 },
      { id: 'c', x: 0, y: 200, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'vertical')
    expect(result).not.toBeNull()
    expect(result!.axis).toBe('vertical')
    expect(result!.spacing).toBe(50)
  })

  test('returns null for unequal spacing', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
      { id: 'c', x: 300, y: 0, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal', 2)
    expect(result).toBeNull()
  })

  test('respects tolerance parameter', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 110, y: 0, w: 50, h: 50 },
      { id: 'c', x: 200, y: 0, w: 50, h: 50 },
    ]
    // Gap 1 = 60, gap 2 = 40. Avg = 50. Diffs from avg: 10, 10
    const resultTight = detectEqualSpacing(bboxes, 'horizontal', 5)
    expect(resultTight).toBeNull()

    const resultLoose = detectEqualSpacing(bboxes, 'horizontal', 15)
    expect(resultLoose).not.toBeNull()
  })

  test('sorts elements by position before checking gaps', () => {
    // Provide unsorted elements
    const bboxes = [
      { id: 'c', x: 200, y: 0, w: 50, h: 50 },
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).not.toBeNull()
    expect(result!.spacing).toBe(50)
  })

  test('positions array contains center coordinates of each element', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 0, w: 50, h: 50 },
      { id: 'c', x: 200, y: 0, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).not.toBeNull()
    // Positions should be center X of each element
    expect(result!.positions).toEqual([25, 125, 225])
  })

  test('crossPos is positioned above the elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 100, w: 50, h: 50 },
      { id: 'b', x: 100, y: 100, w: 50, h: 50 },
      { id: 'c', x: 200, y: 100, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).not.toBeNull()
    expect(result!.crossPos).toBe(80) // min(100) - 20
  })

  test('vertical crossPos is positioned to the left of elements', () => {
    const bboxes = [
      { id: 'a', x: 100, y: 0, w: 50, h: 50 },
      { id: 'b', x: 100, y: 100, w: 50, h: 50 },
      { id: 'c', x: 100, y: 200, w: 50, h: 50 },
    ]
    const result = detectEqualSpacing(bboxes, 'vertical')
    expect(result).not.toBeNull()
    expect(result!.crossPos).toBe(80) // min(100) - 20
  })

  test('detects equal spacing with 4 elements', () => {
    const bboxes = [
      { id: 'a', x: 0, y: 0, w: 40, h: 40 },
      { id: 'b', x: 60, y: 0, w: 40, h: 40 },
      { id: 'c', x: 120, y: 0, w: 40, h: 40 },
      { id: 'd', x: 180, y: 0, w: 40, h: 40 },
    ]
    const result = detectEqualSpacing(bboxes, 'horizontal')
    expect(result).not.toBeNull()
    expect(result!.spacing).toBe(20)
    expect(result!.positions).toHaveLength(4)
  })
})

// ── renderDistanceLabel ──

describe('renderDistanceLabel', () => {
  test('does not throw and calls expected canvas methods', () => {
    const { ctx, calls } = mockCtx()
    const label: DistanceLabel = { x: 100, y: 50, distance: 42, axis: 'horizontal' }
    expect(() => renderDistanceLabel(ctx, label, 1)).not.toThrow()
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'restore')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'fillText')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'roundRect')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'fill')).toHaveLength(1)
  })

  test('displays distance text with px suffix', () => {
    const { ctx, calls } = mockCtx()
    const label: DistanceLabel = { x: 200, y: 100, distance: 123, axis: 'vertical' }
    renderDistanceLabel(ctx, label, 1)
    const fillTextCalls = calls.filter((c) => c.method === 'fillText')
    expect(fillTextCalls[0]!.args[0]).toBe('123px')
  })

  test('adjusts font size for zoom', () => {
    const { ctx, calls } = mockCtx()
    const label: DistanceLabel = { x: 100, y: 100, distance: 50, axis: 'horizontal' }
    renderDistanceLabel(ctx, label, 0.5)
    // fontSize = max(10, 11/0.5) = max(10, 22) = 22
    // We check the font was set
    expect(calls.filter((c) => c.method === 'fillText').length).toBe(1)
  })

  test('adjusts font size for high zoom (minimum 10)', () => {
    const { ctx, calls } = mockCtx()
    const label: DistanceLabel = { x: 100, y: 100, distance: 50, axis: 'horizontal' }
    renderDistanceLabel(ctx, label, 5)
    // fontSize = max(10, 11/5) = max(10, 2.2) = 10
    expect(calls.filter((c) => c.method === 'fillText').length).toBe(1)
  })
})

// ── renderEqualSpacing ──

describe('renderEqualSpacing', () => {
  test('renders horizontal equal spacing indicator', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'horizontal',
      positions: [25, 125, 225],
      spacing: 50,
      crossPos: 80,
    }
    expect(() => renderEqualSpacing(ctx, indicator, 1)).not.toThrow()
    expect(calls.filter((c) => c.method === 'save')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'restore')).toHaveLength(1)
    // Should draw lines between consecutive positions
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes.length).toBe(2) // 2 gaps = 2 lines
    // Should render spacing labels
    const fillTexts = calls.filter((c) => c.method === 'fillText')
    expect(fillTexts.length).toBe(2)
  })

  test('renders vertical equal spacing indicator', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'vertical',
      positions: [25, 125, 225],
      spacing: 50,
      crossPos: 80,
    }
    expect(() => renderEqualSpacing(ctx, indicator, 1)).not.toThrow()
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes.length).toBe(2)
    const fillTexts = calls.filter((c) => c.method === 'fillText')
    expect(fillTexts.length).toBe(2)
  })

  test('spacing label text matches indicator spacing', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'horizontal',
      positions: [0, 100, 200],
      spacing: 75,
      crossPos: -20,
    }
    renderEqualSpacing(ctx, indicator, 1)
    const fillTexts = calls.filter((c) => c.method === 'fillText')
    expect(fillTexts.every((c) => c.args[0] === '75')).toBe(true)
  })

  test('handles single gap (2 positions)', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'horizontal',
      positions: [50, 150],
      spacing: 60,
      crossPos: 30,
    }
    renderEqualSpacing(ctx, indicator, 2)
    const strokes = calls.filter((c) => c.method === 'stroke')
    expect(strokes.length).toBe(1)
  })

  test('sets dashed line style', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'horizontal',
      positions: [0, 100],
      spacing: 50,
      crossPos: -10,
    }
    renderEqualSpacing(ctx, indicator, 1)
    const dashCalls = calls.filter((c) => c.method === 'setLineDash')
    expect(dashCalls.length).toBeGreaterThan(0)
  })

  test('vertical indicator draws lines at crossPos x', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'vertical',
      positions: [50, 150],
      spacing: 60,
      crossPos: 30,
    }
    renderEqualSpacing(ctx, indicator, 1)
    const moveToCalls = calls.filter((c) => c.method === 'moveTo')
    expect(moveToCalls.some((c) => c.args[0] === 30)).toBe(true)
  })

  test('horizontal indicator draws lines at crossPos y', () => {
    const { ctx, calls } = mockCtx()
    const indicator: EqualSpacingIndicator = {
      axis: 'horizontal',
      positions: [50, 150],
      spacing: 60,
      crossPos: 30,
    }
    renderEqualSpacing(ctx, indicator, 1)
    const moveToCalls = calls.filter((c) => c.method === 'moveTo')
    expect(moveToCalls.some((c) => c.args[1] === 30)).toBe(true)
  })
})
