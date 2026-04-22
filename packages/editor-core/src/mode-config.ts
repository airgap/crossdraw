/**
 * Editor mode configuration.
 * Restricts which tools and panels are visible based on context.
 */

export type EditorMode = 'full' | 'pngtuber' | 'attachment'

export interface ModeConfig {
  /** Tools visible in the toolbar */
  tools: string[]
  /** Panel tabs to show */
  panels: string[]
  /** Whether to show the menu bar */
  menuBar: boolean
  /** Whether to show the status bar */
  statusBar: boolean
  /** Whether to show the breakpoint bar */
  breakpointBar: boolean
  /** Whether to show the tool options bar */
  toolOptionsBar: boolean
  /** Maximum file size in bytes (0 = unlimited) */
  maxFileSize: number
}

const FULL_MODE: ModeConfig = {
  tools: [
    'select',
    'direct-select',
    'pen',
    'pencil',
    'rectangle',
    'ellipse',
    'polygon',
    'star',
    'text',
    'artboard',
    'hand',
    'zoom',
    'eyedropper',
    'paint-bucket',
    'eraser',
    'brush',
    'shape-builder',
    'blend',
    'slice',
    'measure',
  ],
  panels: [
    'layers',
    'properties',
    'history',
    'symbols',
    'variables',
    'styles',
    'preferences',
    'dev-mode',
    'cloud',
    'library',
    'pngtuber',
  ],
  menuBar: true,
  statusBar: true,
  breakpointBar: true,
  toolOptionsBar: true,
  maxFileSize: 0,
}

const PNGTUBER_MODE: ModeConfig = {
  tools: [
    'select',
    'direct-select',
    'pen',
    'pencil',
    'rectangle',
    'ellipse',
    'polygon',
    'star',
    'text',
    'hand',
    'zoom',
    'eyedropper',
    'paint-bucket',
    'eraser',
    'brush',
  ],
  panels: ['layers', 'properties', 'pngtuber'],
  menuBar: false,
  statusBar: false,
  breakpointBar: false,
  toolOptionsBar: true,
  maxFileSize: 2_000_000, // 2MB default for avatars
}

// Optimized for quick edits before upload: crop, draw, annotate, redact.
// No side panels; canvas gets the whole viewport.
const ATTACHMENT_MODE: ModeConfig = {
  tools: [
    'select',
    'hand',
    'zoom',
    'crop',
    'eyedropper',
    'brush',
    'pencil',
    'line',
    'eraser',
    'fill',
    'text',
    'rectangle',
    'ellipse',
  ],
  panels: [],
  menuBar: false,
  statusBar: false,
  breakpointBar: false,
  toolOptionsBar: true,
  maxFileSize: 25_000_000,
}

export function getModeConfig(mode: EditorMode, overrides?: Partial<ModeConfig>): ModeConfig {
  const base =
    mode === 'pngtuber' ? { ...PNGTUBER_MODE } : mode === 'attachment' ? { ...ATTACHMENT_MODE } : { ...FULL_MODE }
  if (overrides) {
    return { ...base, ...overrides }
  }
  return base
}
