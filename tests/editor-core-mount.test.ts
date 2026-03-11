import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

// Save originals
const origDocument = globalThis.document
const origLocalStorage = globalThis.localStorage

afterAll(() => {
  if (origDocument !== undefined) {
    globalThis.document = origDocument
  } else {
    delete (globalThis as any).document
  }
  if (origLocalStorage !== undefined) {
    globalThis.localStorage = origLocalStorage
  } else {
    delete (globalThis as any).localStorage
  }
})

// Polyfill DOM APIs required by editor-core mount
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = {
    createElement: (tag: string) => ({
      tagName: tag,
      style: {
        _props: {} as Record<string, string>,
        get position() {
          return this._props.position || ''
        },
        set position(v: string) {
          this._props.position = v
        },
        get overflow() {
          return this._props.overflow || ''
        },
        set overflow(v: string) {
          this._props.overflow = v
        },
        setProperty(name: string, value: string) {
          this._props[name] = value
        },
        getPropertyValue(name: string) {
          return this._props[name] || ''
        },
      },
      setAttribute(name: string, value: string) {
        ;(this as any)[`__attr_${name}`] = value
      },
      getAttribute(name: string) {
        return (this as any)[`__attr_${name}`] ?? null
      },
      removeAttribute(name: string) {
        delete (this as any)[`__attr_${name}`]
      },
      children: [] as any[],
      appendChild(child: any) {
        this.children.push(child)
        return child
      },
    }),
    documentElement: {
      style: {
        _props: {} as Record<string, string>,
        setProperty(name: string, value: string) {
          this._props[name] = value
        },
        getPropertyValue(name: string) {
          return this._props[name] || ''
        },
      },
    },
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

// Test theme-contract and mode-config which are re-exported from editor-core
import { TOKEN_TO_CSS_VAR, applyThemeTokens } from '../packages/editor-core/src/theme-contract'
import { getModeConfig } from '../packages/editor-core/src/mode-config'

describe('editor-core exports', () => {
  test('TOKEN_TO_CSS_VAR is exported and has entries', () => {
    expect(TOKEN_TO_CSS_VAR).toBeDefined()
    expect(Object.keys(TOKEN_TO_CSS_VAR).length).toBeGreaterThan(0)
  })

  test('applyThemeTokens is a function', () => {
    expect(typeof applyThemeTokens).toBe('function')
  })

  test('getModeConfig is a function', () => {
    expect(typeof getModeConfig).toBe('function')
  })
})

describe('applyThemeTokens', () => {
  let element: any

  beforeEach(() => {
    element = {
      style: {
        _props: {} as Record<string, string>,
        setProperty(name: string, value: string) {
          this._props[name] = value
        },
        getPropertyValue(name: string) {
          return this._props[name] || ''
        },
      },
    }
  })

  test('applies bgBase token', () => {
    applyThemeTokens(element, { bgBase: '#1a1a2e' })
    expect(element.style._props['--bg-base']).toBe('#1a1a2e')
  })

  test('applies legacy alias --bg for bgBase', () => {
    applyThemeTokens(element, { bgBase: '#1a1a2e' })
    expect(element.style._props['--bg']).toBe('#1a1a2e')
  })

  test('applies bgSurface and legacy --bg-panel', () => {
    applyThemeTokens(element, { bgSurface: '#222244' })
    expect(element.style._props['--bg-surface']).toBe('#222244')
    expect(element.style._props['--bg-panel']).toBe('#222244')
  })

  test('applies borderDefault and legacy --border', () => {
    applyThemeTokens(element, { borderDefault: '#333' })
    expect(element.style._props['--border-default']).toBe('#333')
    expect(element.style._props['--border']).toBe('#333')
  })

  test('applies borderStrong and legacy --border-light', () => {
    applyThemeTokens(element, { borderStrong: '#444' })
    expect(element.style._props['--border-strong']).toBe('#444')
    expect(element.style._props['--border-light']).toBe('#444')
  })

  test('applies textSecondary and legacy --text-muted', () => {
    applyThemeTokens(element, { textSecondary: '#999' })
    expect(element.style._props['--text-secondary']).toBe('#999')
    expect(element.style._props['--text-muted']).toBe('#999')
  })

  test('applies multiple tokens at once', () => {
    applyThemeTokens(element, {
      accent: '#ff6b6b',
      accentHover: '#ff8080',
      success: '#00ff00',
      warning: '#ffff00',
      error: '#ff0000',
      info: '#0000ff',
    })
    expect(element.style._props['--accent']).toBe('#ff6b6b')
    expect(element.style._props['--accent-hover']).toBe('#ff8080')
    expect(element.style._props['--success']).toBe('#00ff00')
    expect(element.style._props['--warning']).toBe('#ffff00')
    expect(element.style._props['--error']).toBe('#ff0000')
    expect(element.style._props['--info']).toBe('#0000ff')
  })

  test('skips undefined/empty token values', () => {
    applyThemeTokens(element, { bgBase: '', accent: '#ff0000' })
    expect(element.style._props['--bg-base']).toBeUndefined()
    expect(element.style._props['--accent']).toBe('#ff0000')
  })

  test('applies all surface tokens', () => {
    applyThemeTokens(element, {
      bgElevated: '#111',
      bgOverlay: '#222',
      bgInput: '#333',
      bgHover: '#444',
      bgActive: '#555',
      canvasBg: '#666',
    })
    expect(element.style._props['--bg-elevated']).toBe('#111')
    expect(element.style._props['--bg-overlay']).toBe('#222')
    expect(element.style._props['--bg-input']).toBe('#333')
    expect(element.style._props['--bg-hover']).toBe('#444')
    expect(element.style._props['--bg-active']).toBe('#555')
    expect(element.style._props['--canvas-bg']).toBe('#666')
  })

  test('applies text and accent tokens', () => {
    applyThemeTokens(element, {
      textPrimary: '#fff',
      textDisabled: '#666',
      textAccent: '#ff0',
      accentActive: '#ff00ff',
      accentDisabled: '#880088',
      borderSubtle: '#1a1a1a',
    })
    expect(element.style._props['--text-primary']).toBe('#fff')
    expect(element.style._props['--text-disabled']).toBe('#666')
    expect(element.style._props['--text-accent']).toBe('#ff0')
    expect(element.style._props['--accent-active']).toBe('#ff00ff')
    expect(element.style._props['--accent-disabled']).toBe('#880088')
    expect(element.style._props['--border-subtle']).toBe('#1a1a1a')
  })

  test('handles empty tokens object', () => {
    applyThemeTokens(element, {})
    expect(Object.keys(element.style._props).length).toBe(0)
  })
})

describe('getModeConfig', () => {
  test('full mode returns all tools', () => {
    const config = getModeConfig('full')
    expect(config.tools.length).toBeGreaterThan(15)
  })

  test('pngtuber mode returns limited tools', () => {
    const config = getModeConfig('pngtuber')
    expect(config.tools.length).toBeLessThan(getModeConfig('full').tools.length)
  })

  test('mode config with overrides', () => {
    const config = getModeConfig('full', { maxFileSize: 1000 })
    expect(config.maxFileSize).toBe(1000)
    expect(config.menuBar).toBe(true) // not overridden
  })

  test('each call returns a new object', () => {
    const c1 = getModeConfig('full')
    const c2 = getModeConfig('full')
    expect(c1).not.toBe(c2)
    expect(c1).toEqual(c2)
  })
})
