/**
 * Brush Presets Library — save / load brush configurations with built-in
 * and custom presets, persisted to localStorage.
 */

import type { BrushSettings } from '@/types'
import type { ScatterBrushSettings } from '@/tools/scatter-brush'
import { defaultScatterSettings, setScatterSettings } from '@/tools/scatter-brush'
import { setBrushSettings } from '@/tools/brush'

// ── Types ──

export type BrushPresetCategory = 'basic' | 'artistic' | 'texture' | 'custom'

export interface BrushPreset {
  id: string
  name: string
  category: BrushPresetCategory
  settings: BrushSettings & ScatterBrushSettings
}

// ── Storage key ──

const STORAGE_KEY = 'crossdraw:brush-presets'

// ── Built-in presets ──

function makePreset(
  id: string,
  name: string,
  category: BrushPresetCategory,
  brush: Partial<BrushSettings>,
  scatter?: Partial<ScatterBrushSettings>,
): BrushPreset {
  return {
    id,
    name,
    category,
    settings: {
      size: 10,
      hardness: 0.8,
      opacity: 1,
      flow: 1,
      color: '#000000',
      spacing: 0.25,
      ...defaultScatterSettings,
      ...brush,
      ...scatter,
    },
  }
}

const builtInPresets: BrushPreset[] = [
  // ── Basic ──
  makePreset('builtin-hard-round', 'Hard Round', 'basic', {
    size: 10,
    hardness: 1,
    opacity: 1,
    flow: 1,
    spacing: 0.15,
  }),
  makePreset('builtin-soft-round', 'Soft Round', 'basic', {
    size: 20,
    hardness: 0,
    opacity: 0.8,
    flow: 0.8,
    spacing: 0.2,
  }),
  makePreset('builtin-airbrush', 'Airbrush', 'basic', {
    size: 40,
    hardness: 0,
    opacity: 0.3,
    flow: 0.15,
    spacing: 0.1,
  }),
  makePreset('builtin-pixel', 'Pixel', 'basic', {
    size: 1,
    hardness: 1,
    opacity: 1,
    flow: 1,
    spacing: 1,
  }),

  // ── Artistic ──
  makePreset(
    'builtin-chalk',
    'Chalk',
    'artistic',
    { size: 18, hardness: 0.6, opacity: 0.7, flow: 0.5, spacing: 0.15 },
    { sizeJitter: 20, scatterX: 30, scatterY: 30, textureEnabled: true, texturePattern: 'canvas', textureDepth: 60 },
  ),
  makePreset(
    'builtin-charcoal',
    'Charcoal',
    'artistic',
    { size: 24, hardness: 0.3, opacity: 0.65, flow: 0.45, spacing: 0.12 },
    {
      sizeJitter: 15,
      angleJitter: 45,
      textureEnabled: true,
      texturePattern: 'burlap',
      textureDepth: 70,
      roundnessJitter: 30,
    },
  ),
  makePreset(
    'builtin-ink',
    'Ink',
    'artistic',
    { size: 6, hardness: 0.9, opacity: 1, flow: 1, spacing: 0.08 },
    { sizeJitter: 5 },
  ),
  makePreset(
    'builtin-watercolor',
    'Watercolor',
    'artistic',
    { size: 30, hardness: 0.1, opacity: 0.4, flow: 0.25, spacing: 0.1 },
    { sizeJitter: 25, scatterX: 15, scatterY: 15 },
  ),
  makePreset(
    'builtin-marker',
    'Marker',
    'artistic',
    { size: 14, hardness: 0.7, opacity: 0.85, flow: 0.9, spacing: 0.1 },
    { angleJitter: 5 },
  ),
  makePreset(
    'builtin-oil-paint',
    'Oil Paint',
    'artistic',
    { size: 22, hardness: 0.5, opacity: 0.9, flow: 0.7, spacing: 0.15 },
    { sizeJitter: 10, roundnessJitter: 20, textureEnabled: true, texturePattern: 'canvas', textureDepth: 40 },
  ),

  // ── Texture ──
  makePreset(
    'builtin-spatter',
    'Spatter',
    'texture',
    { size: 30, hardness: 0.8, opacity: 0.9, flow: 0.8, spacing: 0.4 },
    { scatterX: 200, scatterY: 200, count: 4, countJitter: 50, sizeJitter: 60 },
  ),
  makePreset(
    'builtin-stipple',
    'Stipple',
    'texture',
    { size: 4, hardness: 1, opacity: 0.9, flow: 1, spacing: 0.8 },
    { scatterX: 300, scatterY: 300, count: 6, countJitter: 40, sizeJitter: 40 },
  ),
]

export function getBuiltInPresets(): BrushPreset[] {
  return builtInPresets.map((p) => ({ ...p, settings: { ...p.settings } }))
}

// ── Custom presets (localStorage) ──

export function getCustomPresets(): BrushPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as BrushPreset[]
  } catch {
    return []
  }
}

function saveCustomPresets(presets: BrushPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export function savePreset(preset: BrushPreset) {
  const list = getCustomPresets()
  const idx = list.findIndex((p) => p.id === preset.id)
  if (idx >= 0) {
    list[idx] = preset
  } else {
    list.push(preset)
  }
  saveCustomPresets(list)
}

export function deletePreset(id: string) {
  const list = getCustomPresets().filter((p) => p.id !== id)
  saveCustomPresets(list)
}

// ── Apply ──

export function getAllPresets(): BrushPreset[] {
  return [...getBuiltInPresets(), ...getCustomPresets()]
}

/**
 * Apply a preset by id — updates both brush and scatter settings.
 * Returns true if the preset was found and applied.
 */
export function applyPreset(id: string): boolean {
  const preset = getAllPresets().find((p) => p.id === id)
  if (!preset) return false

  const { size, hardness, opacity, flow, color, spacing, ...scatter } = preset.settings
  setBrushSettings({ size, hardness, opacity, flow, color, spacing })
  setScatterSettings(scatter)
  return true
}

// ── Import / Export ──

export function exportPresets(): string {
  return JSON.stringify(getCustomPresets(), null, 2)
}

export function importPresets(json: string): number {
  const parsed = JSON.parse(json)
  if (!Array.isArray(parsed)) throw new Error('Expected an array of presets')

  const existing = getCustomPresets()
  let added = 0

  for (const item of parsed) {
    if (!item || typeof item !== 'object' || !item.id || !item.name || !item.settings) continue
    // Ensure category is 'custom' for imported presets
    const preset: BrushPreset = {
      id: item.id,
      name: item.name,
      category: 'custom',
      settings: {
        ...defaultScatterSettings,
        size: 10,
        hardness: 0.8,
        opacity: 1,
        flow: 1,
        color: '#000000',
        spacing: 0.25,
        ...item.settings,
      },
    }
    const idx = existing.findIndex((p) => p.id === preset.id)
    if (idx >= 0) {
      existing[idx] = preset
    } else {
      existing.push(preset)
    }
    added++
  }

  saveCustomPresets(existing)
  return added
}
