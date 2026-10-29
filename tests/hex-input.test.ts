import { describe, test, expect } from 'bun:test'
import { normalizeHex } from '@/ui/color-picker'

describe('normalizeHex', () => {
  test('accepts a full hex with or without the hash', () => {
    expect(normalizeHex('#ff0000')).toBe('#ff0000')
    expect(normalizeHex('ff0000')).toBe('#ff0000')
  })

  test('lowercases and trims', () => {
    expect(normalizeHex('  #AABBCC ')).toBe('#aabbcc')
  })

  test('expands 3-digit shorthand', () => {
    expect(normalizeHex('#f0a')).toBe('#ff00aa')
    expect(normalizeHex('fff')).toBe('#ffffff')
  })

  test('rejects incomplete or invalid input', () => {
    // Partial input while typing must not commit — the field keeps it as a draft.
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex('#')).toBeNull()
    expect(normalizeHex('#ff')).toBeNull()
    expect(normalizeHex('#ff00')).toBeNull()
    expect(normalizeHex('#ff00000')).toBeNull()
    expect(normalizeHex('#gggggg')).toBeNull()
    expect(normalizeHex('red')).toBeNull()
  })
})
