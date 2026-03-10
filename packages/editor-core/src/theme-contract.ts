/**
 * Theme contract: the canonical set of CSS custom properties
 * that Crossdraw uses for theming. Any host (Lyku, standalone, etc.)
 * can map their own tokens onto this contract.
 */

export interface CrossdrawThemeTokens {
  // ── Surface hierarchy ──
  bgBase: string
  bgSurface: string
  bgElevated: string
  bgOverlay: string
  bgInput: string
  bgHover: string
  bgActive: string
  canvasBg: string

  // ── Borders ──
  borderSubtle: string
  borderDefault: string
  borderStrong: string

  // ── Text ──
  textPrimary: string
  textSecondary: string
  textDisabled: string
  textAccent: string

  // ── Accent ──
  accent: string
  accentHover: string
  accentActive: string
  accentDisabled: string

  // ── Semantic ──
  success: string
  warning: string
  error: string
  info: string
}

/** CSS variable name for each theme token */
export const TOKEN_TO_CSS_VAR: Record<keyof CrossdrawThemeTokens, string> = {
  bgBase: '--bg-base',
  bgSurface: '--bg-surface',
  bgElevated: '--bg-elevated',
  bgOverlay: '--bg-overlay',
  bgInput: '--bg-input',
  bgHover: '--bg-hover',
  bgActive: '--bg-active',
  canvasBg: '--canvas-bg',
  borderSubtle: '--border-subtle',
  borderDefault: '--border-default',
  borderStrong: '--border-strong',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textDisabled: '--text-disabled',
  textAccent: '--text-accent',
  accent: '--accent',
  accentHover: '--accent-hover',
  accentActive: '--accent-active',
  accentDisabled: '--accent-disabled',
  success: '--success',
  warning: '--warning',
  error: '--error',
  info: '--info',
}

/** Apply theme tokens as CSS custom properties on a DOM element. */
export function applyThemeTokens(element: HTMLElement, tokens: Partial<CrossdrawThemeTokens>) {
  for (const [key, value] of Object.entries(tokens)) {
    const cssVar = TOKEN_TO_CSS_VAR[key as keyof CrossdrawThemeTokens]
    if (cssVar && value) {
      element.style.setProperty(cssVar, value)
    }
  }

  // Also set legacy aliases that existing Crossdraw CSS references
  if (tokens.bgBase) {
    element.style.setProperty('--bg', tokens.bgBase)
  }
  if (tokens.bgSurface) {
    element.style.setProperty('--bg-panel', tokens.bgSurface)
  }
  if (tokens.borderDefault) {
    element.style.setProperty('--border', tokens.borderDefault)
  }
  if (tokens.borderStrong) {
    element.style.setProperty('--border-light', tokens.borderStrong)
  }
  if (tokens.textSecondary) {
    element.style.setProperty('--text-muted', tokens.textSecondary)
  }
}
