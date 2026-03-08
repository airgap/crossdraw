export interface Theme {
  name: 'dark' | 'light'

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

const THEME_STORAGE_KEY = 'crossdraw:theme'

function loadSavedTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light') return lightTheme
  }
  return darkTheme
}

let currentTheme: Theme = loadSavedTheme()

export function getTheme(): Theme {
  return currentTheme
}

export function getThemeName(): 'dark' | 'light' {
  return currentTheme.name
}

export function setTheme(theme: 'dark' | 'light') {
  currentTheme = theme === 'dark' ? darkTheme : lightTheme
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  applyThemeToDOM(currentTheme)
}

export function toggleTheme() {
  setTheme(currentTheme.name === 'dark' ? 'light' : 'dark')
}

function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement

  // Surface hierarchy
  root.style.setProperty('--bg-base', theme.bgBase)
  root.style.setProperty('--bg-surface', theme.bgSurface)
  root.style.setProperty('--bg-elevated', theme.bgElevated)
  root.style.setProperty('--bg-overlay', theme.bgOverlay)
  root.style.setProperty('--bg-input', theme.bgInput)
  root.style.setProperty('--bg-hover', theme.bgHover)
  root.style.setProperty('--bg-active', theme.bgActive)
  root.style.setProperty('--canvas-bg', theme.canvasBg)

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

// Initialize on load
if (typeof document !== 'undefined') {
  applyThemeToDOM(currentTheme)
}
