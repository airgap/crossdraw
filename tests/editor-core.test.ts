import { describe, test, expect } from 'bun:test'
import { TOKEN_TO_CSS_VAR, getModeConfig, type CrossdrawThemeTokens } from '../packages/editor-core/src/index'

describe('theme-contract', () => {
  test('TOKEN_TO_CSS_VAR maps all token keys', () => {
    const tokenKeys: (keyof CrossdrawThemeTokens)[] = [
      'bgBase',
      'bgSurface',
      'bgElevated',
      'bgOverlay',
      'bgInput',
      'bgHover',
      'bgActive',
      'canvasBg',
      'borderSubtle',
      'borderDefault',
      'borderStrong',
      'textPrimary',
      'textSecondary',
      'textDisabled',
      'textAccent',
      'accent',
      'accentHover',
      'accentActive',
      'accentDisabled',
      'success',
      'warning',
      'error',
      'info',
    ]
    for (const key of tokenKeys) {
      expect(TOKEN_TO_CSS_VAR[key]).toBeDefined()
      expect(TOKEN_TO_CSS_VAR[key]).toMatch(/^--/)
    }
  })

  test('all CSS variable names are unique', () => {
    const values = Object.values(TOKEN_TO_CSS_VAR)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })

  test('CSS var names follow kebab-case convention', () => {
    for (const cssVar of Object.values(TOKEN_TO_CSS_VAR)) {
      expect(cssVar).toMatch(/^--[a-z]+(-[a-z]+)*$/)
    }
  })
})

describe('mode-config', () => {
  test('full mode includes all standard tools', () => {
    const config = getModeConfig('full')
    expect(config.tools).toContain('select')
    expect(config.tools).toContain('pen')
    expect(config.tools).toContain('rectangle')
    expect(config.tools).toContain('text')
    expect(config.tools).toContain('shape-builder')
    expect(config.tools).toContain('blend')
    expect(config.menuBar).toBe(true)
    expect(config.statusBar).toBe(true)
    expect(config.maxFileSize).toBe(0) // unlimited
  })

  test('pngtuber mode hides irrelevant tools', () => {
    const config = getModeConfig('pngtuber')
    expect(config.tools).toContain('select')
    expect(config.tools).toContain('pen')
    expect(config.tools).toContain('brush')
    expect(config.tools).not.toContain('shape-builder')
    expect(config.tools).not.toContain('blend')
    expect(config.tools).not.toContain('slice')
    expect(config.tools).not.toContain('measure')
  })

  test('pngtuber mode restricts panels', () => {
    const config = getModeConfig('pngtuber')
    expect(config.panels).toContain('layers')
    expect(config.panels).toContain('properties')
    expect(config.panels).toContain('pngtuber')
    expect(config.panels).not.toContain('dev-mode')
    expect(config.panels).not.toContain('cloud')
    expect(config.panels).not.toContain('library')
    expect(config.panels).not.toContain('variables')
  })

  test('pngtuber mode hides menu bar and status bar', () => {
    const config = getModeConfig('pngtuber')
    expect(config.menuBar).toBe(false)
    expect(config.statusBar).toBe(false)
  })

  test('pngtuber mode has 2MB default file size limit', () => {
    const config = getModeConfig('pngtuber')
    expect(config.maxFileSize).toBe(2_000_000)
  })

  test('overrides are applied on top of base config', () => {
    const config = getModeConfig('pngtuber', { maxFileSize: 5_000_000, menuBar: true })
    expect(config.maxFileSize).toBe(5_000_000)
    expect(config.menuBar).toBe(true)
    // Non-overridden values preserved
    expect(config.statusBar).toBe(false)
  })

  test('full mode overrides work', () => {
    const config = getModeConfig('full', { maxFileSize: 10_000_000 })
    expect(config.maxFileSize).toBe(10_000_000)
    expect(config.menuBar).toBe(true)
  })

  test('full mode includes all panel types', () => {
    const config = getModeConfig('full')
    expect(config.panels).toContain('layers')
    expect(config.panels).toContain('properties')
    expect(config.panels).toContain('history')
    expect(config.panels).toContain('symbols')
    expect(config.panels).toContain('variables')
    expect(config.panels).toContain('styles')
    expect(config.panels).toContain('preferences')
    expect(config.panels).toContain('dev-mode')
    expect(config.panels).toContain('pngtuber')
  })

  test('mode config returns a copy (immutable)', () => {
    const config1 = getModeConfig('pngtuber')
    const config2 = getModeConfig('pngtuber')
    expect(config1).not.toBe(config2)
    expect(config1).toEqual(config2)
  })
})
