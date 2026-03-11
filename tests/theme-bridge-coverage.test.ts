import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origDocument = (globalThis as any).document
const origGetComputedStyle = (globalThis as any).getComputedStyle
const origMutationObserver = globalThis.MutationObserver
const origRequestAnimationFrame = globalThis.requestAnimationFrame

afterAll(() => {
  if (origDocument !== undefined) {
    ;(globalThis as any).document = origDocument
  } else {
    delete (globalThis as any).document
  }
  if (origGetComputedStyle !== undefined) {
    ;(globalThis as any).getComputedStyle = origGetComputedStyle
  } else {
    delete (globalThis as any).getComputedStyle
  }
  if (origMutationObserver !== undefined) {
    globalThis.MutationObserver = origMutationObserver
  } else {
    delete (globalThis as any).MutationObserver
  }
  if (origRequestAnimationFrame !== undefined) {
    globalThis.requestAnimationFrame = origRequestAnimationFrame
  } else {
    delete (globalThis as any).requestAnimationFrame
  }
})

// Set up a minimal DOM environment for theme-bridge tests
const cssVars: Record<string, string> = {}

;(globalThis as any).document = {
  documentElement: {
    style: {},
  },
}

// Mock getComputedStyle — always set to ensure our version is used
;(globalThis as any).getComputedStyle = (_el: any) => ({
  getPropertyValue: (prop: string) => cssVars[prop] ?? '',
})

// Mock MutationObserver
if (typeof globalThis.MutationObserver === 'undefined') {
  ;(globalThis as any).MutationObserver = class MockMutationObserver {
    callback: Function
    observing: boolean = false

    constructor(callback: Function) {
      this.callback = callback
    }

    observe(_target: any, _options: any) {
      this.observing = true
    }

    disconnect() {
      this.observing = false
    }
  }
}

// Mock requestAnimationFrame
if (typeof globalThis.requestAnimationFrame === 'undefined') {
  ;(globalThis as any).requestAnimationFrame = (cb: Function) => {
    cb()
    return 0
  }
}

import { lykuThemeToCrossdraw, watchLykuTheme } from '../packages/svelte-wrapper/src/theme-bridge'

describe('lykuThemeToCrossdraw', () => {
  beforeEach(() => {
    // Clear mock CSS variables
    for (const key of Object.keys(cssVars)) {
      delete cssVars[key]
    }
  })

  test('returns empty tokens when no CSS variables set', () => {
    const tokens = lykuThemeToCrossdraw()
    expect(typeof tokens).toBe('object')
    expect(Object.keys(tokens).length).toBe(0)
  })

  test('maps --bg-primary to bgBase', () => {
    cssVars['--bg-primary'] = '#1a1a2e'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.bgBase).toBe('#1a1a2e')
  })

  test('maps --bg-secondary to bgSurface', () => {
    cssVars['--bg-secondary'] = '#222244'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.bgSurface).toBe('#222244')
  })

  test('maps --accent-primary to accent', () => {
    cssVars['--accent-primary'] = '#ff6b6b'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.accent).toBe('#ff6b6b')
  })

  test('maps --text-primary to textPrimary', () => {
    cssVars['--text-primary'] = '#ffffff'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.textPrimary).toBe('#ffffff')
  })

  test('maps --text-secondary to textSecondary', () => {
    cssVars['--text-secondary'] = '#aaaaaa'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.textSecondary).toBe('#aaaaaa')
  })

  test('maps semantic status variables', () => {
    cssVars['--status-success'] = '#00ff00'
    cssVars['--status-warning'] = '#ffff00'
    cssVars['--status-error'] = '#ff0000'
    cssVars['--status-info'] = '#0000ff'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.success).toBe('#00ff00')
    expect(tokens.warning).toBe('#ffff00')
    expect(tokens.error).toBe('#ff0000')
    expect(tokens.info).toBe('#0000ff')
  })

  test('maps border variables', () => {
    cssVars['--border-primary'] = '#333'
    cssVars['--border-secondary'] = '#222'
    cssVars['--border-accent'] = '#444'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.borderDefault).toBe('#333')
    expect(tokens.borderSubtle).toBe('#222')
    expect(tokens.borderStrong).toBe('#444')
  })

  test('maps hover/active accent variables', () => {
    cssVars['--clickable-color-hover'] = '#ff8080'
    cssVars['--accent-secondary'] = '#cc4444'
    cssVars['--accent-tertiary'] = '#884444'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.accentHover).toBe('#ff8080')
    expect(tokens.accentActive).toBe('#cc4444')
    expect(tokens.accentDisabled).toBe('#884444')
  })

  test('maps background variations', () => {
    cssVars['--bg-tertiary'] = '#333366'
    cssVars['--bg-card'] = '#444488'
    cssVars['--bg-hover'] = '#555599'
    cssVars['--bg-active'] = '#6666aa'
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.bgElevated).toBe('#333366')
    expect(tokens.bgOverlay).toBe('#444488')
    expect(tokens.bgHover).toBe('#555599')
    expect(tokens.bgActive).toBe('#6666aa')
  })

  test('accepts custom root element', () => {
    const customEl = {} as any
    // getComputedStyle is mocked globally, so it'll work the same
    cssVars['--bg-primary'] = '#custom'
    const tokens = lykuThemeToCrossdraw(customEl)
    expect(tokens.bgBase).toBe('#custom')
  })

  test('skips empty/unset CSS variables', () => {
    cssVars['--bg-primary'] = '#111'
    // --bg-secondary is not set => should not appear
    const tokens = lykuThemeToCrossdraw()
    expect(tokens.bgBase).toBe('#111')
    expect(tokens.bgSurface).toBeUndefined()
  })
})

describe('watchLykuTheme', () => {
  test('returns a disconnect function', () => {
    const disconnect = watchLykuTheme(() => {})
    expect(typeof disconnect).toBe('function')
    disconnect()
  })

  test('creates a MutationObserver', () => {
    let observerCreated = false
    const origMO = globalThis.MutationObserver
    ;(globalThis as any).MutationObserver = class extends origMO {
      constructor(cb: MutationCallback) {
        super(cb)
        observerCreated = true
      }
    }

    const disconnect = watchLykuTheme(() => {})
    expect(observerCreated).toBe(true)
    disconnect()
    ;(globalThis as any).MutationObserver = origMO
  })

  test('disconnect stops observing', () => {
    let disconnected = false
    const origMO = globalThis.MutationObserver
    ;(globalThis as any).MutationObserver = class extends origMO {
      disconnect() {
        disconnected = true
        super.disconnect()
      }
    }

    const stop = watchLykuTheme(() => {})
    stop()
    expect(disconnected).toBe(true)
    ;(globalThis as any).MutationObserver = origMO
  })
})
