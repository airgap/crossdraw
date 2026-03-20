import { v4 as uuid } from 'uuid'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { SymbolDefinition, SymbolInstanceLayer, GroupLayer, Layer } from '@/types'

// ─── Symbol Sprayer tool (Task #16) ────────────────────────────

export interface SymbolInstance {
  symbolId: string
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
}

export interface SymbolSprayerSettings {
  /** Symbol definition ID to spray (null = none selected) */
  symbolId: string | null
  /** Instances per dab (1-20) */
  density: number
  /** Spray radius around cursor */
  scatterRadius: number
  /** Size variation 0-100% */
  sizeVariation: number
  /** Rotation variation 0-360 degrees */
  rotationVariation: number
  /** Opacity variation 0-100% */
  opacityVariation: number
}

const defaultSettings: SymbolSprayerSettings = {
  symbolId: null,
  density: 3,
  scatterRadius: 40,
  sizeVariation: 30,
  rotationVariation: 0,
  opacityVariation: 0,
}

let currentSettings: SymbolSprayerSettings = { ...defaultSettings }

// Accumulated instances during a spray stroke
let sprayInstances: SymbolInstance[] = []
let spraying = false

export function getSymbolSprayerSettings(): SymbolSprayerSettings {
  return { ...currentSettings }
}

export function setSymbolSprayerSettings(partial: Partial<SymbolSprayerSettings>) {
  currentSettings = { ...currentSettings, ...partial }
}

/**
 * Begin a symbol spray stroke at (x, y) in canvas coordinates.
 */
export function beginSymbolSpray(x: number, y: number) {
  if (!currentSettings.symbolId) return
  sprayInstances = []
  spraying = true
  spraySymbols(x, y)
}

/**
 * Continue spraying symbols around (x, y).
 * Called on pointer-move during a spray stroke.
 */
export function spraySymbols(x: number, y: number) {
  if (!spraying || !currentSettings.symbolId) return

  const { symbolId, density, scatterRadius, sizeVariation, rotationVariation, opacityVariation } = currentSettings
  const count = Math.max(1, Math.min(20, Math.round(density)))

  for (let i = 0; i < count; i++) {
    // Random position within scatter radius (uniform disk)
    const angle = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * scatterRadius
    const ix = x + Math.cos(angle) * r
    const iy = y + Math.sin(angle) * r

    // Random scale variation
    const sizeVar = sizeVariation / 100
    const scale = 1 + (Math.random() * 2 - 1) * sizeVar

    // Random rotation
    const rotation = (Math.random() * rotationVariation * Math.PI) / 180

    // Random opacity variation
    const opVar = opacityVariation / 100
    const opacity = Math.max(0.1, 1 - Math.random() * opVar)

    sprayInstances.push({
      symbolId: symbolId!,
      x: ix,
      y: iy,
      scale: Math.max(0.1, scale),
      rotation,
      opacity,
    })
  }
}

/**
 * End the spray stroke: create a group layer containing all sprayed symbol instances.
 */
export function endSymbolSpray(): string | null {
  if (!spraying) return null
  spraying = false

  if (sprayInstances.length === 0) return null

  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return null

  const symbolId = sprayInstances[0]!.symbolId
  const symbolDef = (store.document.symbols ?? []).find((s) => s.id === symbolId)
  if (!symbolDef) return null

  // Convert each spray instance to a SymbolInstanceLayer
  const children: Layer[] = sprayInstances.map((inst, idx) => {
    const instanceLayer: SymbolInstanceLayer = {
      id: uuid(),
      name: `${symbolDef.name} ${idx + 1}`,
      type: 'symbol-instance',
      symbolId: inst.symbolId,
      visible: true,
      locked: false,
      opacity: inst.opacity,
      blendMode: 'normal',
      transform: {
        x: inst.x,
        y: inst.y,
        scaleX: inst.scale,
        scaleY: inst.scale,
        rotation: inst.rotation,
      },
      effects: [],
    }
    return instanceLayer
  })

  // Create a group layer containing all instances
  const groupLayer: GroupLayer = {
    id: uuid(),
    name: `${symbolDef.name} spray`,
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children,
  }

  store.addLayer(artboard.id, groupLayer)
  store.selectLayer(groupLayer.id)

  const groupId = groupLayer.id

  // Reset
  sprayInstances = []

  return groupId
}

/**
 * Get the list of available symbol definitions for the sprayer UI.
 */
export function getAvailableSymbols(): SymbolDefinition[] {
  const store = useEditorStore.getState()
  return store.document.symbols ?? []
}

/**
 * Check whether a spray stroke is currently in progress.
 */
export function isSpraying(): boolean {
  return spraying
}

/**
 * Get current instances accumulated during this spray stroke (for preview rendering).
 */
export function getSprayPreviewInstances(): SymbolInstance[] {
  return [...sprayInstances]
}
