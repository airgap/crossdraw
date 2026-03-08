import { describe, test, expect } from 'bun:test'
import { migrateData, canMigrate, registerMigrator } from '@/io/migrations'

describe('migrations', () => {
  test('canMigrate returns true for registered version range', () => {
    expect(canMigrate(1, 2)).toBe(true)
  })

  test('canMigrate returns false for unregistered version', () => {
    expect(canMigrate(0, 2)).toBe(false)
  })

  test('canMigrate returns true for same version (no migration needed)', () => {
    expect(canMigrate(3, 3)).toBe(true)
  })

  test('migrateData v1→v2 preserves data (no-op migration)', () => {
    const input = {
      metadata: { title: 'Test', createdAt: Date.now(), modifiedAt: Date.now() },
      artboards: [{ id: 'a1', name: 'Artboard 1', width: 800, height: 600, layers: [] }],
    }
    const result = migrateData({ ...input }, 1, 2)
    expect(result.metadata).toEqual(input.metadata)
    expect(result.artboards).toEqual(input.artboards)
  })

  test('migrateData throws for missing migrator', () => {
    expect(() => migrateData({}, 0, 2)).toThrow('No migrator registered')
  })

  test('registerMigrator and sequential migration works', () => {
    // Register a test migrator for 10→11
    registerMigrator(10, (data) => ({
      ...data,
      migratedFrom10: true,
    }))
    registerMigrator(11, (data) => ({
      ...data,
      migratedFrom11: true,
    }))

    expect(canMigrate(10, 12)).toBe(true)

    const result = migrateData({ original: true }, 10, 12)
    expect(result.original).toBe(true)
    expect(result.migratedFrom10).toBe(true)
    expect(result.migratedFrom11).toBe(true)
  })
})
