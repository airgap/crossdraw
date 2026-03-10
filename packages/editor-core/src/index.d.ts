import type { CrossdrawThemeTokens } from './theme-contract'
import type { EditorMode, ModeConfig } from './mode-config'

export type { CrossdrawThemeTokens } from './theme-contract'
export type { EditorMode, ModeConfig } from './mode-config'
export { TOKEN_TO_CSS_VAR, applyThemeTokens } from './theme-contract'
export { getModeConfig } from './mode-config'

export interface CrossdrawEditorConfig {
  mode?: EditorMode
  theme?: Partial<CrossdrawThemeTokens>
  maxFileSize?: number
  onSave?: (buffer: ArrayBuffer) => void
  onLoad?: () => Promise<ArrayBuffer | null>
  modeOverrides?: Partial<ModeConfig>
  initialDocument?: ArrayBuffer
}

export interface CrossdrawEditorInstance {
  destroy: () => void
  setTheme: (tokens: Partial<CrossdrawThemeTokens>) => void
  getDocument: () => Promise<ArrayBuffer>
  loadDocument: (buffer: ArrayBuffer) => void
  getModeConfig: () => ModeConfig
}

export declare function mount(
  element: HTMLElement,
  config?: CrossdrawEditorConfig,
): Promise<CrossdrawEditorInstance>
