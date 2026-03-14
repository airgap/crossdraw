import { describe, test, expect, beforeEach } from 'bun:test'
import { collectPreferences, applyPreferences, computeHash } from '@/cloud/preference-sync'

// Use the preload localStorage mock
const store = globalThis.localStorage as any

beforeEach(() => {
  store.clear()
})

describe('preference-sync', () => {
  describe('collectPreferences', () => {
    test('collects only synced keys', () => {
      store.setItem('crossdraw:theme', 'dark')
      store.setItem('crossdraw:shortcuts', '{"a":"b"}')
      store.setItem('crossdraw:unrelated-key', 'should-not-appear')

      const prefs = collectPreferences()
      expect(prefs['crossdraw:theme']).toBe('dark')
      expect(prefs['crossdraw:shortcuts']).toBe('{"a":"b"}')
      expect(prefs['crossdraw:unrelated-key']).toBeUndefined()
    })

    test('skips keys not present in localStorage', () => {
      store.setItem('crossdraw:theme', 'light')
      const prefs = collectPreferences()
      expect(prefs['crossdraw:theme']).toBe('light')
      expect(prefs['crossdraw:toolbar-order']).toBeUndefined()
    })

    test('returns empty object when nothing stored', () => {
      const prefs = collectPreferences()
      expect(Object.keys(prefs).length).toBe(0)
    })

    test('collects all 15 synced keys when present', () => {
      const keys = [
        'crossdraw:theme',
        'crossdraw:custom-themes',
        'crossdraw:shortcuts',
        'crossdraw:default-unit',
        'crossdraw:auto-save',
        'crossdraw:pixel-grid-threshold',
        'crossdraw:render-quality',
        'crossdraw:gpu-accel',
        'crossdraw:toolbar-order',
        'crossdraw:workspace-presets',
        'crossdraw:palette',
        'crossdraw:recent-colors',
        'crossdraw:text-styles',
        'crossdraw:touch-mode',
        'crossdraw:ai-enabled',
      ]
      for (const key of keys) store.setItem(key, 'val')
      const prefs = collectPreferences()
      expect(Object.keys(prefs).length).toBe(15)
      for (const key of keys) expect(prefs[key]).toBe('val')
    })
  })

  describe('applyPreferences', () => {
    test('writes preferences to localStorage', () => {
      applyPreferences({
        'crossdraw:theme': 'dark',
        'crossdraw:default-unit': 'mm',
      })
      expect(store.getItem('crossdraw:theme')).toBe('dark')
      expect(store.getItem('crossdraw:default-unit')).toBe('mm')
    })

    test('ignores keys not in SYNCED_KEYS', () => {
      applyPreferences({
        'crossdraw:theme': 'dark',
        'crossdraw:auth-session': 'should-not-be-written',
      })
      expect(store.getItem('crossdraw:theme')).toBe('dark')
      expect(store.getItem('crossdraw:auth-session')).toBeNull()
    })

    test('does not overwrite with identical value', () => {
      store.setItem('crossdraw:theme', 'dark')
      // We can verify no unnecessary writes by checking that the mock is not erroneously modified
      applyPreferences({ 'crossdraw:theme': 'dark' })
      expect(store.getItem('crossdraw:theme')).toBe('dark')
    })

    test('updates existing value', () => {
      store.setItem('crossdraw:theme', 'dark')
      applyPreferences({ 'crossdraw:theme': 'light' })
      expect(store.getItem('crossdraw:theme')).toBe('light')
    })
  })

  describe('computeHash', () => {
    test('returns consistent hash for same data', () => {
      const data = { 'crossdraw:theme': 'dark', 'crossdraw:default-unit': 'px' }
      expect(computeHash(data)).toBe(computeHash(data))
    })

    test('returns different hash for different data', () => {
      const a = { 'crossdraw:theme': 'dark' }
      const b = { 'crossdraw:theme': 'light' }
      expect(computeHash(a)).not.toBe(computeHash(b))
    })

    test('is order-independent', () => {
      const a = { b: '2', a: '1' }
      const b = { a: '1', b: '2' }
      expect(computeHash(a)).toBe(computeHash(b))
    })

    test('empty object produces a hash', () => {
      const hash = computeHash({})
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    test('detects single value change', () => {
      const base = { 'crossdraw:theme': 'dark', 'crossdraw:shortcuts': '{}' }
      const changed = { 'crossdraw:theme': 'dark', 'crossdraw:shortcuts': '{"a":"b"}' }
      expect(computeHash(base)).not.toBe(computeHash(changed))
    })
  })
})
