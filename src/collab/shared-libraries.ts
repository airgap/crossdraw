/**
 * Shared Libraries (#93)
 *
 * Allows teams to create reusable component libraries that can be shared
 * across documents.  A SharedLibrary contains named components, each of
 * which holds serialised layer data and an optional thumbnail.
 *
 * Libraries can be exported/imported as JSON bundles for offline sharing.
 */

import { v4 as uuid } from 'uuid'
import type { Layer } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SharedComponent {
  id: string
  name: string
  /** Serialised layer tree for the component. */
  layerData: Layer
  /** Base64-encoded PNG thumbnail (optional). */
  thumbnail?: string
  /** ISO timestamp of last modification. */
  updatedAt: string
  /** Tags for search / categorisation. */
  tags: string[]
}

export interface SharedLibrary {
  id: string
  name: string
  description: string
  components: SharedComponent[]
  /** ISO timestamp of creation. */
  createdAt: string
  /** ISO timestamp of last modification. */
  updatedAt: string
  /** Library version number (incremented on every mutation). */
  version: number
}

/** JSON bundle format for import/export. */
export interface LibraryBundle {
  format: 'crossdraw-library'
  formatVersion: 1
  library: SharedLibrary
}

// ── Factory functions ────────────────────────────────────────────────────────

export function createSharedLibrary(name: string, description: string = ''): SharedLibrary {
  const now = new Date().toISOString()
  return {
    id: uuid(),
    name,
    description,
    components: [],
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export function createSharedComponent(name: string, layerData: Layer, tags: string[] = []): SharedComponent {
  return {
    id: uuid(),
    name,
    layerData,
    updatedAt: new Date().toISOString(),
    tags,
  }
}

// ── Library Manager ──────────────────────────────────────────────────────────

export class SharedLibraryManager {
  private libraries: Map<string, SharedLibrary> = new Map()

  constructor(initial?: SharedLibrary[]) {
    if (initial) {
      for (const lib of initial) {
        this.libraries.set(lib.id, lib)
      }
    }
  }

  // ── Library CRUD ──

  getLibraries(): SharedLibrary[] {
    return Array.from(this.libraries.values())
  }

  getLibrary(id: string): SharedLibrary | undefined {
    return this.libraries.get(id)
  }

  createLibrary(name: string, description: string = ''): SharedLibrary {
    const lib = createSharedLibrary(name, description)
    this.libraries.set(lib.id, lib)
    return lib
  }

  updateLibrary(id: string, updates: Partial<Pick<SharedLibrary, 'name' | 'description'>>): SharedLibrary | null {
    const lib = this.libraries.get(id)
    if (!lib) return null
    if (updates.name !== undefined) lib.name = updates.name
    if (updates.description !== undefined) lib.description = updates.description
    lib.updatedAt = new Date().toISOString()
    lib.version++
    return lib
  }

  deleteLibrary(id: string): boolean {
    return this.libraries.delete(id)
  }

  // ── Component CRUD ──

  addComponent(libraryId: string, name: string, layerData: Layer, tags: string[] = []): SharedComponent | null {
    const lib = this.libraries.get(libraryId)
    if (!lib) return null
    const comp = createSharedComponent(name, layerData, tags)
    lib.components.push(comp)
    lib.updatedAt = new Date().toISOString()
    lib.version++
    return comp
  }

  getComponent(libraryId: string, componentId: string): SharedComponent | undefined {
    const lib = this.libraries.get(libraryId)
    if (!lib) return undefined
    return lib.components.find((c) => c.id === componentId)
  }

  updateComponent(
    libraryId: string,
    componentId: string,
    updates: Partial<Pick<SharedComponent, 'name' | 'layerData' | 'thumbnail' | 'tags'>>,
  ): SharedComponent | null {
    const lib = this.libraries.get(libraryId)
    if (!lib) return null
    const comp = lib.components.find((c) => c.id === componentId)
    if (!comp) return null

    if (updates.name !== undefined) comp.name = updates.name
    if (updates.layerData !== undefined) comp.layerData = updates.layerData
    if (updates.thumbnail !== undefined) comp.thumbnail = updates.thumbnail
    if (updates.tags !== undefined) comp.tags = updates.tags
    comp.updatedAt = new Date().toISOString()
    lib.updatedAt = comp.updatedAt
    lib.version++
    return comp
  }

  removeComponent(libraryId: string, componentId: string): boolean {
    const lib = this.libraries.get(libraryId)
    if (!lib) return false
    const before = lib.components.length
    lib.components = lib.components.filter((c) => c.id !== componentId)
    if (lib.components.length < before) {
      lib.updatedAt = new Date().toISOString()
      lib.version++
      return true
    }
    return false
  }

  // ── Search ──

  searchComponents(libraryId: string, query: string): SharedComponent[] {
    const lib = this.libraries.get(libraryId)
    if (!lib) return []
    const q = query.toLowerCase()
    return lib.components.filter(
      (c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)),
    )
  }

  // ── Import / Export ──

  exportLibrary(id: string): LibraryBundle | null {
    const lib = this.libraries.get(id)
    if (!lib) return null
    return {
      format: 'crossdraw-library',
      formatVersion: 1,
      library: structuredClone(lib),
    }
  }

  importLibrary(bundle: LibraryBundle): SharedLibrary {
    const lib = structuredClone(bundle.library)
    // Assign new IDs to avoid collisions
    lib.id = uuid()
    for (const comp of lib.components) {
      comp.id = uuid()
    }
    lib.updatedAt = new Date().toISOString()
    this.libraries.set(lib.id, lib)
    return lib
  }
}
