export interface CrossdrawThemeTokens {
  bgBase: string
  bgSurface: string
  bgElevated: string
  bgOverlay: string
  bgInput: string
  bgHover: string
  bgActive: string
  canvasBg: string
  borderSubtle: string
  borderDefault: string
  borderStrong: string
  textPrimary: string
  textSecondary: string
  textDisabled: string
  textAccent: string
  accent: string
  accentHover: string
  accentActive: string
  accentDisabled: string
  success: string
  warning: string
  error: string
  info: string
}

export declare const TOKEN_TO_CSS_VAR: Record<keyof CrossdrawThemeTokens, string>

export declare function applyThemeTokens(
  element: HTMLElement,
  tokens: Partial<CrossdrawThemeTokens>,
): void
