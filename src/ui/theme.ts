/** Color properties that define a theme (excludes the name). */
export interface ThemeColors {
  // Surface hierarchy
  bgBase: string
  bgSurface: string
  bgElevated: string
  bgOverlay: string
  bgInput: string
  bgHover: string
  bgActive: string
  canvasBg: string

  // Borders
  borderSubtle: string
  borderDefault: string
  borderStrong: string

  // Text
  textPrimary: string
  textSecondary: string
  textDisabled: string
  textAccent: string

  // Accent
  accent: string
  accentHover: string
  accentActive: string
  accentDisabled: string

  // Semantic
  success: string
  warning: string
  error: string
  info: string

  // Legacy aliases (mapped for backward compat)
  bg: string
  bgPanel: string
  border: string
  borderLight: string
  textMuted: string
}

export interface Theme extends ThemeColors {
  name: string
}

// ── Color property keys (for iteration) ──

const COLOR_KEYS: (keyof ThemeColors)[] = [
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
  'bg',
  'bgPanel',
  'border',
  'borderLight',
  'textMuted',
]

export { COLOR_KEYS }

// ── Built-in themes ──

export const darkTheme: Theme = {
  name: 'dark',

  // Surface hierarchy
  bgBase: '#0e0e0e',
  bgSurface: '#161616',
  bgElevated: '#1e1e1e',
  bgOverlay: '#262626',
  bgInput: '#121212',
  bgHover: '#242424',
  bgActive: '#4a9eff',
  canvasBg: '#1a1a1a',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderDefault: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.15)',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#999999',
  textDisabled: '#555555',
  textAccent: '#4a9eff',

  // Accent
  accent: '#4a9eff',
  accentHover: '#5aadff',
  accentActive: '#3a8eef',
  accentDisabled: '#2a5a8f',

  // Semantic
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',

  // Legacy aliases
  bg: '#0e0e0e',
  bgPanel: '#161616',
  border: 'rgba(255,255,255,0.1)',
  borderLight: 'rgba(255,255,255,0.15)',
  textMuted: '#666666',
}

export const lightTheme: Theme = {
  name: 'light',

  // Surface hierarchy
  bgBase: '#f5f5f5',
  bgSurface: '#ffffff',
  bgElevated: '#ffffff',
  bgOverlay: '#ffffff',
  bgInput: '#f0f0f0',
  bgHover: '#e8e8e8',
  bgActive: '#4a9eff',
  canvasBg: '#e0e0e0',

  // Borders
  borderSubtle: 'rgba(0,0,0,0.06)',
  borderDefault: 'rgba(0,0,0,0.12)',
  borderStrong: 'rgba(0,0,0,0.2)',

  // Text
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textDisabled: '#aaaaaa',
  textAccent: '#4a9eff',

  // Accent
  accent: '#4a9eff',
  accentHover: '#3a8eef',
  accentActive: '#2a7edf',
  accentDisabled: '#9ecaff',

  // Semantic
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',

  // Legacy aliases
  bg: '#f5f5f5',
  bgPanel: '#ffffff',
  border: 'rgba(0,0,0,0.12)',
  borderLight: 'rgba(0,0,0,0.2)',
  textMuted: '#999999',
}

export const nordDarkTheme: Theme = {
  name: 'Nord Dark',

  // Surface hierarchy (Nord Polar Night)
  bgBase: '#2e3440',
  bgSurface: '#3b4252',
  bgElevated: '#434c5e',
  bgOverlay: '#4c566a',
  bgInput: '#2e3440',
  bgHover: '#434c5e',
  bgActive: '#88c0d0',
  canvasBg: '#2e3440',

  // Borders
  borderSubtle: 'rgba(216,222,233,0.06)',
  borderDefault: 'rgba(216,222,233,0.12)',
  borderStrong: 'rgba(216,222,233,0.20)',

  // Text (Nord Snow Storm)
  textPrimary: '#eceff4',
  textSecondary: '#d8dee9',
  textDisabled: '#4c566a',
  textAccent: '#88c0d0',

  // Accent (Nord Frost)
  accent: '#88c0d0',
  accentHover: '#8fbccd',
  accentActive: '#7eb3c3',
  accentDisabled: '#5a8a95',

  // Semantic (Nord Aurora)
  success: '#a3be8c',
  warning: '#ebcb8b',
  error: '#bf616a',
  info: '#81a1c1',

  // Legacy aliases
  bg: '#2e3440',
  bgPanel: '#3b4252',
  border: 'rgba(216,222,233,0.12)',
  borderLight: 'rgba(216,222,233,0.20)',
  textMuted: '#81a1c1',
}

export const nordLightTheme: Theme = {
  name: 'Nord Light',

  // Surface hierarchy (Nord Snow Storm)
  bgBase: '#eceff4',
  bgSurface: '#e5e9f0',
  bgElevated: '#ffffff',
  bgOverlay: '#ffffff',
  bgInput: '#e5e9f0',
  bgHover: '#d8dee9',
  bgActive: '#5e81ac',
  canvasBg: '#d8dee9',

  // Borders
  borderSubtle: 'rgba(46,52,64,0.08)',
  borderDefault: 'rgba(46,52,64,0.15)',
  borderStrong: 'rgba(46,52,64,0.25)',

  // Text (Nord Polar Night)
  textPrimary: '#2e3440',
  textSecondary: '#4c566a',
  textDisabled: '#a0a8b6',
  textAccent: '#5e81ac',

  // Accent (Nord Frost — darker for light bg contrast)
  accent: '#5e81ac',
  accentHover: '#6d8fb5',
  accentActive: '#4f7199',
  accentDisabled: '#9eb3cc',

  // Semantic (Nord Aurora)
  success: '#a3be8c',
  warning: '#d08770',
  error: '#bf616a',
  info: '#81a1c1',

  // Legacy aliases
  bg: '#eceff4',
  bgPanel: '#e5e9f0',
  border: 'rgba(46,52,64,0.15)',
  borderLight: 'rgba(46,52,64,0.25)',
  textMuted: '#81a1c1',
}

export const blackTheme: Theme = {
  name: 'Black',

  // Surface hierarchy (true black for OLED)
  bgBase: '#000000',
  bgSurface: '#0a0a0a',
  bgElevated: '#141414',
  bgOverlay: '#1a1a1a',
  bgInput: '#0a0a0a',
  bgHover: '#1a1a1a',
  bgActive: '#4a9eff',
  canvasBg: '#000000',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderDefault: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.15)',

  // Text
  textPrimary: '#e0e0e0',
  textSecondary: '#888888',
  textDisabled: '#444444',
  textAccent: '#4a9eff',

  // Accent
  accent: '#4a9eff',
  accentHover: '#5aadff',
  accentActive: '#3a8eef',
  accentDisabled: '#2a5a8f',

  // Semantic
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',

  // Legacy aliases
  bg: '#000000',
  bgPanel: '#0a0a0a',
  border: 'rgba(255,255,255,0.10)',
  borderLight: 'rgba(255,255,255,0.15)',
  textMuted: '#555555',
}

const BUILTIN_NAMES = new Set(['dark', 'light', 'Nord Dark', 'Nord Light', 'Black'])

export function isBuiltinTheme(name: string): boolean {
  return BUILTIN_NAMES.has(name)
}

// ── Storage keys ──

const THEME_STORAGE_KEY = 'crossdraw:theme'
const CUSTOM_THEMES_KEY = 'crossdraw:custom-themes'
const CANVAS_BG_KEY = 'crossdraw:canvas-bg-override'

// ── Accent color derivation ──

function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return null
  const r = parseInt(m[1]!, 16) / 255
  const g = parseInt(m[2]!, 16) / 255
  const b = parseInt(m[3]!, 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Derive accent variant colors from a base accent hex color. */
export function deriveAccentColors(baseHex: string): {
  accent: string
  accentHover: string
  accentActive: string
  accentDisabled: string
} {
  const hsl = hexToHSL(baseHex)
  if (!hsl) return { accent: baseHex, accentHover: baseHex, accentActive: baseHex, accentDisabled: baseHex }
  return {
    accent: baseHex,
    accentHover: hslToHex(hsl.h, Math.min(1, hsl.s * 1.1), Math.min(0.95, hsl.l + 0.07)),
    accentActive: hslToHex(hsl.h, hsl.s, Math.max(0.05, hsl.l - 0.07)),
    accentDisabled: hslToHex(hsl.h, hsl.s * 0.5, hsl.l * 0.7),
  }
}

/** Apply a custom accent color to a theme, returning a new theme. */
export function applyAccentToTheme(theme: Theme, accentHex: string): Theme {
  const accents = deriveAccentColors(accentHex)
  return {
    ...theme,
    ...accents,
    bgActive: accents.accent,
    textAccent: accents.accent,
  }
}

// ── Custom theme CRUD ──

function loadCustomThemes(): Theme[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Theme[]
  } catch {
    return []
  }
}

function saveCustomThemes(themes: Theme[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes))
  } catch {
    /* ignore */
  }
}

let customThemes: Theme[] = loadCustomThemes()

export function getCustomThemes(): Theme[] {
  return customThemes
}

export function getAllThemes(): Theme[] {
  return [darkTheme, lightTheme, nordDarkTheme, nordLightTheme, blackTheme, ...customThemes]
}

const builtinThemes: Record<string, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  'Nord Dark': nordDarkTheme,
  'Nord Light': nordLightTheme,
  Black: blackTheme,
}

export function getThemeByName(name: string): Theme | undefined {
  return builtinThemes[name] ?? customThemes.find((t) => t.name === name)
}

export function saveCustomTheme(theme: Theme): void {
  const idx = customThemes.findIndex((t) => t.name === theme.name)
  if (idx >= 0) {
    customThemes[idx] = theme
  } else {
    customThemes.push(theme)
  }
  saveCustomThemes(customThemes)
  window.dispatchEvent(new Event('crossdraw:themes-changed'))
}

export function deleteCustomTheme(name: string): boolean {
  if (isBuiltinTheme(name)) return false
  const idx = customThemes.findIndex((t) => t.name === name)
  if (idx < 0) return false
  customThemes.splice(idx, 1)
  saveCustomThemes(customThemes)
  // If we deleted the active theme, fall back to dark
  if (currentTheme.name === name) {
    setTheme('dark')
  }
  window.dispatchEvent(new Event('crossdraw:themes-changed'))
  return true
}

export function duplicateTheme(sourceName: string, newName: string): Theme | null {
  const source = getThemeByName(sourceName)
  if (!source) return null
  const duplicate: Theme = { ...source, name: newName }
  saveCustomTheme(duplicate)
  return duplicate
}

// ── Theme import/export ──

export interface ThemeFile {
  version: 1
  theme: Theme
}

export function exportTheme(theme: Theme): string {
  const file: ThemeFile = { version: 1, theme }
  return JSON.stringify(file, null, 2)
}

export function importTheme(json: string): Theme | null {
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null

    // Support both { version, theme } wrapper and raw Theme object
    const themeData: any = parsed.theme ?? parsed
    if (!themeData.name || typeof themeData.name !== 'string') return null

    // Validate all color keys exist
    for (const key of COLOR_KEYS) {
      if (typeof themeData[key] !== 'string') return null
    }

    const theme: Theme = { name: themeData.name } as Theme
    for (const key of COLOR_KEYS) {
      ;(theme as any)[key] = themeData[key]
    }

    // Prevent overwriting built-in names — suffix with " (imported)"
    if (isBuiltinTheme(theme.name)) {
      theme.name = `${theme.name} (imported)`
    }

    saveCustomTheme(theme)
    return theme
  } catch {
    return null
  }
}

// ── System theme preference (prefers-color-scheme) ──

export type ThemePreference = 'dark' | 'light' | 'system' | string

let systemMediaQuery: MediaQueryList | null = null
let systemMediaHandler: ((e: MediaQueryListEvent) => void) | null = null

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

function resolvePreference(pref: ThemePreference): Theme {
  if (pref === 'system') {
    const sysName = getSystemTheme()
    return sysName === 'light' ? lightTheme : darkTheme
  }
  return getThemeByName(pref) ?? darkTheme
}

function setupSystemListener() {
  if (typeof window === 'undefined' || !window.matchMedia) return
  if (systemMediaQuery) return // already set up

  systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemMediaHandler = () => {
    if (currentPreference === 'system') {
      currentTheme = resolvePreference('system')
      applyThemeToDOM(currentTheme)
      window.dispatchEvent(new Event('crossdraw:theme-changed'))
    }
  }
  systemMediaQuery.addEventListener('change', systemMediaHandler)
}

// ── Active state ──

function loadSavedPreference(): ThemePreference {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved) return saved
  }
  return 'dark'
}

let currentPreference: ThemePreference = loadSavedPreference()
let currentTheme: Theme = resolvePreference(currentPreference)

export function getTheme(): Theme {
  return currentTheme
}

export function getThemeName(): string {
  return currentTheme.name
}

export function getThemePreference(): ThemePreference {
  return currentPreference
}

export function setTheme(preference: ThemePreference) {
  currentPreference = preference
  currentTheme = resolvePreference(preference)

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  }

  applyThemeToDOM(currentTheme)
  window.dispatchEvent(new Event('crossdraw:theme-changed'))

  // Set up system listener if needed
  if (preference === 'system') {
    setupSystemListener()
  }
}

export function toggleTheme() {
  if (currentPreference === 'system') {
    // If system, toggle to explicit opposite of what system resolved to
    setTheme(currentTheme.name === 'dark' ? 'light' : 'dark')
  } else {
    setTheme(currentTheme.name === 'dark' ? 'light' : 'dark')
  }
}

// ── Canvas background override ──

function loadCanvasBgOverride(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(CANVAS_BG_KEY)
}

let canvasBgOverride: string | null = loadCanvasBgOverride()

/** Returns the effective canvas background (override or theme default). */
export function getCanvasBg(): string {
  return canvasBgOverride ?? currentTheme.canvasBg
}

/** Returns the override value, or null if using theme default. */
export function getCanvasBgOverride(): string | null {
  return canvasBgOverride
}

/** Set a custom canvas background, independent of theme. */
export function setCanvasBgOverride(color: string) {
  canvasBgOverride = color
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(CANVAS_BG_KEY, color)
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--canvas-bg', color)
  }
  window.dispatchEvent(new Event('crossdraw:theme-changed'))
}

/** Clear the override, reverting to the theme's default canvas background. */
export function clearCanvasBgOverride() {
  canvasBgOverride = null
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CANVAS_BG_KEY)
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--canvas-bg', currentTheme.canvasBg)
  }
  window.dispatchEvent(new Event('crossdraw:theme-changed'))
}

// ── DOM application ──

function applyThemeToDOM(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  // Surface hierarchy
  root.style.setProperty('--bg-base', theme.bgBase)
  root.style.setProperty('--bg-surface', theme.bgSurface)
  root.style.setProperty('--bg-elevated', theme.bgElevated)
  root.style.setProperty('--bg-overlay', theme.bgOverlay)
  root.style.setProperty('--bg-input', theme.bgInput)
  root.style.setProperty('--bg-hover', theme.bgHover)
  root.style.setProperty('--bg-active', theme.bgActive)
  root.style.setProperty('--canvas-bg', canvasBgOverride ?? theme.canvasBg)

  // Borders
  root.style.setProperty('--border-subtle', theme.borderSubtle)
  root.style.setProperty('--border-default', theme.borderDefault)
  root.style.setProperty('--border-strong', theme.borderStrong)

  // Text
  root.style.setProperty('--text-primary', theme.textPrimary)
  root.style.setProperty('--text-secondary', theme.textSecondary)
  root.style.setProperty('--text-disabled', theme.textDisabled)
  root.style.setProperty('--text-accent', theme.textAccent)

  // Accent
  root.style.setProperty('--accent', theme.accent)
  root.style.setProperty('--accent-hover', theme.accentHover)
  root.style.setProperty('--accent-active', theme.accentActive)
  root.style.setProperty('--accent-disabled', theme.accentDisabled)

  // Semantic
  root.style.setProperty('--success', theme.success)
  root.style.setProperty('--warning', theme.warning)
  root.style.setProperty('--error', theme.error)
  root.style.setProperty('--info', theme.info)

  // Legacy aliases (so existing var(--bg), var(--bg-panel), etc. still work)
  root.style.setProperty('--bg', theme.bg)
  root.style.setProperty('--bg-panel', theme.bgPanel)
  root.style.setProperty('--border', theme.border)
  root.style.setProperty('--border-light', theme.borderLight)
  root.style.setProperty('--text-muted', theme.textMuted)

  // Typography system
  root.style.setProperty('--font-body', "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif")
  root.style.setProperty('--font-mono', "'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace")
  root.style.setProperty('--font-size-xs', '10px')
  root.style.setProperty('--font-size-sm', '11px')
  root.style.setProperty('--font-size-base', '12px')
  root.style.setProperty('--font-size-lg', '13px')
  root.style.setProperty('--font-weight-normal', '400')
  root.style.setProperty('--font-weight-medium', '500')
  root.style.setProperty('--font-weight-semibold', '600')

  // Spacing system (4px grid)
  root.style.setProperty('--space-1', '4px')
  root.style.setProperty('--space-2', '8px')
  root.style.setProperty('--space-3', '12px')
  root.style.setProperty('--space-4', '16px')
  root.style.setProperty('--space-6', '24px')
  root.style.setProperty('--space-8', '32px')

  // Component sizes
  root.style.setProperty('--height-input', '24px')
  root.style.setProperty('--height-button-sm', '24px')
  root.style.setProperty('--height-button', '28px')
  root.style.setProperty('--height-toolbar', '32px')
  root.style.setProperty('--height-panel-header', '28px')
  root.style.setProperty('--radius-sm', '3px')
  root.style.setProperty('--radius-md', '4px')
  root.style.setProperty('--radius-lg', '6px')

  // Also set body background
  document.body.style.background = theme.bgBase
  document.body.style.color = theme.textPrimary
}

// ── Initialize ──

if (typeof document !== 'undefined') {
  applyThemeToDOM(currentTheme)
  if (currentPreference === 'system') {
    setupSystemListener()
  }
}
