/**
 * Maps Lyku theme CSS variables to Crossdraw theme tokens.
 *
 * Lyku uses: --bg-primary, --bg-secondary, --accent-primary, etc.
 * Crossdraw uses: --bg-base, --bg-surface, --accent, etc.
 *
 * This bridge reads Lyku's computed styles and returns a CrossdrawThemeTokens
 * object that can be passed to the editor's mount() config.
 */

import type { CrossdrawThemeTokens } from '../../editor-core/src/theme-contract'

/**
 * Static mapping from Lyku CSS variable names → Crossdraw token keys.
 * We read Lyku's variables from the DOM and produce Crossdraw tokens.
 */
const LYKU_TO_CROSSDRAW: Array<{
  lykuVar: string
  crossdrawKey: keyof CrossdrawThemeTokens
}> = [
  // Backgrounds
  { lykuVar: '--bg-primary', crossdrawKey: 'bgBase' },
  { lykuVar: '--bg-secondary', crossdrawKey: 'bgSurface' },
  { lykuVar: '--bg-tertiary', crossdrawKey: 'bgElevated' },
  { lykuVar: '--bg-card', crossdrawKey: 'bgOverlay' },
  { lykuVar: '--bg-secondary', crossdrawKey: 'bgInput' },
  { lykuVar: '--bg-hover', crossdrawKey: 'bgHover' },
  { lykuVar: '--bg-active', crossdrawKey: 'bgActive' },
  { lykuVar: '--bg-primary', crossdrawKey: 'canvasBg' },

  // Borders
  { lykuVar: '--border-secondary', crossdrawKey: 'borderSubtle' },
  { lykuVar: '--border-primary', crossdrawKey: 'borderDefault' },
  { lykuVar: '--border-accent', crossdrawKey: 'borderStrong' },

  // Text
  { lykuVar: '--text-primary', crossdrawKey: 'textPrimary' },
  { lykuVar: '--text-secondary', crossdrawKey: 'textSecondary' },
  { lykuVar: '--text-tertiary', crossdrawKey: 'textDisabled' },
  { lykuVar: '--accent-primary', crossdrawKey: 'textAccent' },

  // Accent
  { lykuVar: '--accent-primary', crossdrawKey: 'accent' },
  { lykuVar: '--clickable-color-hover', crossdrawKey: 'accentHover' },
  { lykuVar: '--accent-secondary', crossdrawKey: 'accentActive' },
  { lykuVar: '--accent-tertiary', crossdrawKey: 'accentDisabled' },

  // Semantic
  { lykuVar: '--status-success', crossdrawKey: 'success' },
  { lykuVar: '--status-warning', crossdrawKey: 'warning' },
  { lykuVar: '--status-error', crossdrawKey: 'error' },
  { lykuVar: '--status-info', crossdrawKey: 'info' },
]

/**
 * Read Lyku theme variables from the DOM and return Crossdraw tokens.
 * Call this whenever the Lyku theme changes to get updated tokens.
 */
export function lykuThemeToCrossdraw(
  rootElement?: HTMLElement,
): Partial<CrossdrawThemeTokens> {
  const el = rootElement ?? document.documentElement
  const computed = getComputedStyle(el)
  const tokens: Partial<CrossdrawThemeTokens> = {}

  for (const mapping of LYKU_TO_CROSSDRAW) {
    const value = computed.getPropertyValue(mapping.lykuVar).trim()
    if (value) {
      tokens[mapping.crossdrawKey] = value
    }
  }

  return tokens
}

/**
 * Create a MutationObserver that watches for Lyku theme changes
 * (data-theme / data-mode attribute changes on <html>) and calls
 * the provided callback with updated Crossdraw tokens.
 */
export function watchLykuTheme(
  callback: (tokens: Partial<CrossdrawThemeTokens>) => void,
): () => void {
  const observer = new MutationObserver(() => {
    // Small delay to let CSS variables settle after theme switch
    requestAnimationFrame(() => {
      callback(lykuThemeToCrossdraw())
    })
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-mode', 'class', 'style'],
  })

  return () => observer.disconnect()
}
