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
