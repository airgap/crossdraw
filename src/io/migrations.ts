/**
 * File format migration framework.
 *
 * Each migrator transforms the deserialized payload from version N to N+1.
 * On load: check version, apply migrations sequentially until current.
 */

export type Migrator = (data: Record<string, unknown>) => Record<string, unknown>

const migrators = new Map<number, Migrator>()

/**
 * Register a migrator for a specific version transition.
 * `fromVersion` is the version the data is currently at.
 * The migrator should return data compatible with `fromVersion + 1`.
 */
export function registerMigrator(fromVersion: number, migrator: Migrator) {
  migrators.set(fromVersion, migrator)
}

/**
 * Apply all necessary migrations to bring data from `fromVersion` to `targetVersion`.
 */
export function migrateData(
  data: Record<string, unknown>,
  fromVersion: number,
  targetVersion: number,
): Record<string, unknown> {
  let current = data
  for (let v = fromVersion; v < targetVersion; v++) {
    const migrator = migrators.get(v)
    if (!migrator) {
      throw new Error(
        `No migrator registered for version ${v} → ${v + 1}. ` +
          `Cannot open file saved with format version ${fromVersion}.`,
      )
    }
    current = migrator(current)
  }
  return current
}

/**
 * Check if migrations are available for a given version range.
 */
export function canMigrate(fromVersion: number, targetVersion: number): boolean {
  for (let v = fromVersion; v < targetVersion; v++) {
    if (!migrators.has(v)) return false
  }
  return true
}

// ─── Register built-in migrations ────────────────────────────

// v1 → v2: Example migration (add TextLayer support to older docs)
registerMigrator(1, (data) => {
  // v1 documents don't have text layers, but the schema is backwards-compatible.
  // Just bump — no data transformation needed for this version.
  return data
})

// ─── v2 → v3: Convert old effects system to filter layers ───

/** Map effect type to a human-readable filter layer name. */
function effectTypeName(effectType: string): string {
  const names: Record<string, string> = {
    blur: 'Blur',
    shadow: 'Shadow',
    'drop-shadow': 'Drop Shadow',
    distort: 'Distort',
    glow: 'Glow',
    'outer-glow': 'Outer Glow',
    'inner-shadow': 'Inner Shadow',
    'background-blur': 'Background Blur',
    'progressive-blur': 'Progressive Blur',
    noise: 'Noise',
    sharpen: 'Sharpen',
    'motion-blur': 'Motion Blur',
    'radial-blur': 'Radial Blur',
    'color-adjust': 'Color Adjust',
    wave: 'Wave',
    twirl: 'Twirl',
    pinch: 'Pinch',
    spherize: 'Spherize',
  }
  return names[effectType] ?? effectType
}

/** Default transform for newly created filter layers. */
function defaultTransform(): Record<string, unknown> {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
}

/**
 * Recursively process an array of layers:
 * - Convert AdjustmentLayer (type:'adjustment') → type:'filter' with filterParams
 * - Convert per-layer effects[] → sibling filter layers inserted above
 */
function migrateLayersV2toV3(layers: unknown[]): unknown[] {
  const result: unknown[] = []

  for (const rawLayer of layers) {
    const layer = rawLayer as Record<string, unknown>

    // Recurse into group children first
    if (layer.type === 'group' && Array.isArray(layer.children)) {
      layer.children = migrateLayersV2toV3(layer.children as unknown[])
    }

    // Recurse into mask if present
    if (layer.mask && typeof layer.mask === 'object') {
      const maskArr = migrateLayersV2toV3([layer.mask])
      // migrateLayersV2toV3 might return multiple layers if the mask had effects,
      // but a mask is a single layer — just take the last one (the original, post-migration)
      layer.mask = maskArr[maskArr.length - 1]
    }

    // 1) Convert AdjustmentLayer → filter layer
    if (layer.type === 'adjustment') {
      const adjType = layer.adjustmentType as string | undefined
      const params = layer.params as Record<string, unknown> | undefined

      layer.type = 'filter'

      if (adjType && params) {
        layer.filterParams = { kind: adjType, ...params }
      }

      delete layer.adjustmentType
      delete layer.params
    }

    // 2) Convert effects[] → sibling filter layers inserted above this layer
    const effects = layer.effects as unknown[] | undefined
    if (Array.isArray(effects) && effects.length > 0) {
      for (const rawEffect of effects) {
        const effect = rawEffect as Record<string, unknown>
        const filterLayer: Record<string, unknown> = {
          type: 'filter',
          id: (effect.id as string) + '-filter',
          name: effectTypeName(effect.type as string),
          filterParams: effect.params,
          visible: effect.enabled ?? true,
          opacity: typeof effect.opacity === 'number' ? effect.opacity : 1,
          locked: false,
          blendMode: 'normal',
          transform: defaultTransform(),
          effects: [],
        }
        result.push(filterLayer)
      }
      // Remove the effects array from the source layer
      delete layer.effects
    }

    result.push(layer)
  }

  return result
}

registerMigrator(2, (data) => {
  const artboards = data.artboards as unknown[] | undefined
  if (!Array.isArray(artboards)) return data

  for (const rawArtboard of artboards) {
    const artboard = rawArtboard as Record<string, unknown>
    if (Array.isArray(artboard.layers)) {
      artboard.layers = migrateLayersV2toV3(artboard.layers as unknown[])
    }
  }

  return data
})
