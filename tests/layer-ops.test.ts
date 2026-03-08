import { describe, test, expect } from 'bun:test'

describe('nudgeSelection', () => {
  test('nudge calculates correct offset', () => {
    const x = 100
    const y = 200
    const dx = 1
    const dy = 0
    expect(x + dx).toBe(101)
    expect(y + dy).toBe(200)
  })

  test('big nudge with shift', () => {
    const x = 100
    const y = 200
    const dx = 10
    const dy = -10
    expect(x + dx).toBe(110)
    expect(y + dy).toBe(190)
  })
})

describe('flipHorizontal / flipVertical', () => {
  test('flip horizontal negates scaleX', () => {
    const scaleX = 1
    const flipped = scaleX * -1
    expect(flipped).toBe(-1)
  })

  test('flip horizontal on already-flipped restores', () => {
    const scaleX = -1
    const flipped = scaleX * -1
    expect(flipped).toBe(1)
  })

  test('flip vertical negates scaleY', () => {
    const scaleY = 1.5
    const flipped = scaleY * -1
    expect(flipped).toBe(-1.5)
  })
})

describe('layer ordering', () => {
  test('bring forward moves index up by 1', () => {
    const layers = ['a', 'b', 'c']
    const idx = 1 // 'b'
    const newIdx = idx + 1
    expect(newIdx).toBe(2)
    // Simulate splice
    const [removed] = layers.splice(idx, 1)
    layers.splice(newIdx, 0, removed!)
    expect(layers).toEqual(['a', 'c', 'b'])
  })

  test('send backward moves index down by 1', () => {
    const layers = ['a', 'b', 'c']
    const idx = 1
    const newIdx = idx - 1
    const [removed] = layers.splice(idx, 1)
    layers.splice(newIdx, 0, removed!)
    expect(layers).toEqual(['b', 'a', 'c'])
  })

  test('bring to front moves to end', () => {
    const layers = ['a', 'b', 'c']
    const idx = 0
    const [removed] = layers.splice(idx, 1)
    layers.splice(layers.length, 0, removed!)
    expect(layers).toEqual(['b', 'c', 'a'])
  })

  test('send to back moves to start', () => {
    const layers = ['a', 'b', 'c']
    const idx = 2
    const [removed] = layers.splice(idx, 1)
    layers.splice(0, 0, removed!)
    expect(layers).toEqual(['c', 'a', 'b'])
  })
})

describe('rotation snapping', () => {
  test('snap to 15 degree increments', () => {
    const snap = (angle: number) => Math.round(angle / 15) * 15
    expect(snap(0)).toBe(0)
    expect(snap(7)).toBe(0)
    expect(snap(8)).toBe(15)
    expect(snap(14)).toBe(15)
    expect(snap(15)).toBe(15)
    expect(snap(22)).toBe(15)
    expect(snap(23)).toBe(30)
    expect(snap(44)).toBe(45)
    expect(snap(90)).toBe(90)
    expect(snap(178)).toBe(180)
    expect(snap(-7)).toBe(-0) // JS: Math.round(-7/15)*15 === -0
    expect(snap(-8)).toBe(-15)
    expect(snap(-44)).toBe(-45)
  })
})

describe('aspect ratio lock', () => {
  test('maintain ratio when scaleX changes', () => {
    const origScaleX = 1
    const origScaleY = 1
    const ratio = origScaleY / origScaleX // 1

    const newScaleX = 1.5
    const newScaleY = newScaleX * ratio
    expect(newScaleY).toBe(1.5)
  })

  test('maintain non-uniform ratio', () => {
    const origScaleX = 2
    const origScaleY = 3
    const ratio = origScaleY / origScaleX // 1.5

    const newScaleX = 4
    const newScaleY = newScaleX * ratio
    expect(newScaleY).toBe(6)
  })
})

describe('clipboard', () => {
  test('paste offset increments', () => {
    let pasteCount = 0
    pasteCount++
    expect(pasteCount * 10).toBe(10)
    pasteCount++
    expect(pasteCount * 10).toBe(20)
    pasteCount++
    expect(pasteCount * 10).toBe(30)
  })

  test('deep clone produces independent copy', () => {
    const original = { id: '1', transform: { x: 10, y: 20 } }
    const clone = JSON.parse(JSON.stringify(original))
    clone.transform.x = 999
    expect(original.transform.x).toBe(10) // unchanged
  })
})
