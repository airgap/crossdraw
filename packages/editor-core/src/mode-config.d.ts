export type EditorMode = 'full' | 'pngtuber'

export interface ModeConfig {
  tools: string[]
  panels: string[]
  menuBar: boolean
  statusBar: boolean
  breakpointBar: boolean
  toolOptionsBar: boolean
  maxFileSize: number
}

export declare function getModeConfig(
  mode: EditorMode,
  overrides?: Partial<ModeConfig>,
): ModeConfig
