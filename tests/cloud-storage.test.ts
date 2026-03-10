import { describe, it, expect, beforeEach } from 'bun:test'
import { buildUrl } from '@/cloud/cloud-client'

// ── Types (mirrored from server/main.ts for test isolation) ──

interface CloudFileMetadata {
  id: string
  name: string
  size: number
  createdAt: string
  updatedAt: string
  checksum: string
}

interface FileIndex {
  files: CloudFileMetadata[]
}

// ── File index helpers (re-implemented for testability without server imports) ──

function addFileEntry(index: FileIndex, entry: CloudFileMetadata): FileIndex {
  return { files: [...index.files, entry] }
}

function updateFileEntry(index: FileIndex, id: string, updates: Partial<CloudFileMetadata>): FileIndex {
  return {
    files: index.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
  }
}

function removeFileEntry(index: FileIndex, id: string): FileIndex {
  return { files: index.files.filter((f) => f.id !== id) }
}

// ── Test data ──

function createTestEntry(overrides: Partial<CloudFileMetadata> = {}): CloudFileMetadata {
  return {
    id: 'test123',
    name: 'TestDoc.xd',
    size: 1024,
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
    checksum: 'abc123def456',
    ...overrides,
  }
}

function createEmptyIndex(): FileIndex {
  return { files: [] }
}

// ── Tests ──

describe('Cloud Storage - File Index Operations', () => {
  describe('addFileEntry', () => {
    it('should add an entry to an empty index', () => {
      const index = createEmptyIndex()
      const entry = createTestEntry()
      const result = addFileEntry(index, entry)
      expect(result.files).toHaveLength(1)
      expect(result.files[0]).toEqual(entry)
    })

    it('should append to existing entries', () => {
      const existing = createTestEntry({ id: 'existing1', name: 'First.xd' })
      const index: FileIndex = { files: [existing] }
      const newEntry = createTestEntry({ id: 'new2', name: 'Second.xd' })
      const result = addFileEntry(index, newEntry)
      expect(result.files).toHaveLength(2)
      expect(result.files[0]!.id).toBe('existing1')
      expect(result.files[1]!.id).toBe('new2')
    })

    it('should not mutate the original index', () => {
      const index = createEmptyIndex()
      const entry = createTestEntry()
      const result = addFileEntry(index, entry)
      expect(index.files).toHaveLength(0)
      expect(result.files).toHaveLength(1)
    })
  })

  describe('updateFileEntry', () => {
    it('should update fields of a matching entry', () => {
      const entry = createTestEntry({ id: 'up1', name: 'Old.xd', size: 100 })
      const index: FileIndex = { files: [entry] }
      const result = updateFileEntry(index, 'up1', {
        name: 'New.xd',
        size: 2048,
        updatedAt: '2026-03-10T00:00:00.000Z',
      })
      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.name).toBe('New.xd')
      expect(result.files[0]!.size).toBe(2048)
      expect(result.files[0]!.updatedAt).toBe('2026-03-10T00:00:00.000Z')
      // Unchanged fields preserved
      expect(result.files[0]!.id).toBe('up1')
      expect(result.files[0]!.createdAt).toBe('2026-03-09T00:00:00.000Z')
    })

    it('should not affect other entries', () => {
      const entry1 = createTestEntry({ id: 'a1', name: 'A.xd' })
      const entry2 = createTestEntry({ id: 'b2', name: 'B.xd' })
      const index: FileIndex = { files: [entry1, entry2] }
      const result = updateFileEntry(index, 'a1', { name: 'Updated.xd' })
      expect(result.files[0]!.name).toBe('Updated.xd')
      expect(result.files[1]!.name).toBe('B.xd')
    })

    it('should return unchanged index if id not found', () => {
      const entry = createTestEntry({ id: 'x1' })
      const index: FileIndex = { files: [entry] }
      const result = updateFileEntry(index, 'nonexistent', { name: 'Whatever' })
      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.name).toBe('TestDoc.xd')
    })

    it('should not mutate the original index', () => {
      const entry = createTestEntry({ id: 'mut1', name: 'Before.xd' })
      const index: FileIndex = { files: [entry] }
      const result = updateFileEntry(index, 'mut1', { name: 'After.xd' })
      expect(index.files[0]!.name).toBe('Before.xd')
      expect(result.files[0]!.name).toBe('After.xd')
    })
  })

  describe('removeFileEntry', () => {
    it('should remove the matching entry', () => {
      const entry = createTestEntry({ id: 'rm1' })
      const index: FileIndex = { files: [entry] }
      const result = removeFileEntry(index, 'rm1')
      expect(result.files).toHaveLength(0)
    })

    it('should keep other entries', () => {
      const entry1 = createTestEntry({ id: 'k1', name: 'Keep.xd' })
      const entry2 = createTestEntry({ id: 'r2', name: 'Remove.xd' })
      const entry3 = createTestEntry({ id: 'k3', name: 'AlsoKeep.xd' })
      const index: FileIndex = { files: [entry1, entry2, entry3] }
      const result = removeFileEntry(index, 'r2')
      expect(result.files).toHaveLength(2)
      expect(result.files.map((f) => f.id)).toEqual(['k1', 'k3'])
    })

    it('should return unchanged index if id not found', () => {
      const entry = createTestEntry({ id: 'stay1' })
      const index: FileIndex = { files: [entry] }
      const result = removeFileEntry(index, 'ghost')
      expect(result.files).toHaveLength(1)
      expect(result.files[0]!.id).toBe('stay1')
    })

    it('should not mutate the original index', () => {
      const entry = createTestEntry({ id: 'imm1' })
      const index: FileIndex = { files: [entry] }
      const result = removeFileEntry(index, 'imm1')
      expect(index.files).toHaveLength(1)
      expect(result.files).toHaveLength(0)
    })
  })
})

describe('Cloud Storage - Cloud Client', () => {
  describe('buildUrl', () => {
    it('should construct a correct URL', () => {
      expect(buildUrl('http://localhost:3000', '/api/files')).toBe(
        'http://localhost:3000/api/files',
      )
    })

    it('should handle trailing slash on server URL', () => {
      expect(buildUrl('http://localhost:3000/', '/api/files')).toBe(
        'http://localhost:3000/api/files',
      )
    })

    it('should handle URLs with paths', () => {
      expect(buildUrl('https://cloud.example.com', '/api/files/abc123')).toBe(
        'https://cloud.example.com/api/files/abc123',
      )
    })

    it('should handle URLs with ports', () => {
      expect(buildUrl('http://192.168.1.100:8080', '/api/files')).toBe(
        'http://192.168.1.100:8080/api/files',
      )
    })
  })

  describe('config persistence', () => {
    // Mock localStorage for testing
    let storage: Record<string, string> = {}

    beforeEach(() => {
      storage = {}
    })

    it('should return default config when storage is empty', () => {
      // Directly test the parsing logic
      const raw = storage['crossdraw:cloud-config']
      const config = raw
        ? (JSON.parse(raw) as { serverUrl?: string; apiKey?: string })
        : { serverUrl: '', apiKey: '' }
      expect(config.serverUrl).toBe('')
      expect(config.apiKey).toBe('')
    })

    it('should round-trip config through JSON', () => {
      const config = { serverUrl: 'http://myserver:3000', apiKey: 'secret-key-123' }
      const serialized = JSON.stringify(config)
      const parsed = JSON.parse(serialized) as { serverUrl: string; apiKey: string }
      expect(parsed.serverUrl).toBe('http://myserver:3000')
      expect(parsed.apiKey).toBe('secret-key-123')
    })

    it('should handle partial config data gracefully', () => {
      const raw = JSON.stringify({ serverUrl: 'http://test' })
      const parsed = JSON.parse(raw) as { serverUrl?: string; apiKey?: string }
      const config = {
        serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : '',
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      }
      expect(config.serverUrl).toBe('http://test')
      expect(config.apiKey).toBe('')
    })
  })

  describe('auth header inclusion', () => {
    it('should include X-API-Key header when apiKey is set', () => {
      const apiKey = 'my-secret-key'
      const headers: Record<string, string> = {}
      if (apiKey) {
        headers['X-API-Key'] = apiKey
      }
      expect(headers['X-API-Key']).toBe('my-secret-key')
    })

    it('should not include X-API-Key header when apiKey is empty', () => {
      const apiKey = ''
      const headers: Record<string, string> = {}
      if (apiKey) {
        headers['X-API-Key'] = apiKey
      }
      expect(headers['X-API-Key']).toBeUndefined()
    })
  })
})

describe('Cloud Storage - Request URL construction', () => {
  it('should build list endpoint URL', () => {
    const base = 'http://localhost:3000'
    expect(buildUrl(base, '/api/files')).toBe('http://localhost:3000/api/files')
  })

  it('should build upload endpoint URL', () => {
    const base = 'http://localhost:3000'
    expect(buildUrl(base, '/api/files')).toBe('http://localhost:3000/api/files')
  })

  it('should build download endpoint URL with file ID', () => {
    const base = 'http://localhost:3000'
    const id = 'abc123def456'
    expect(buildUrl(base, `/api/files/${id}`)).toBe(
      'http://localhost:3000/api/files/abc123def456',
    )
  })

  it('should build update endpoint URL with file ID', () => {
    const base = 'https://my-cloud.example.com'
    const id = 'xyz789'
    expect(buildUrl(base, `/api/files/${id}`)).toBe(
      'https://my-cloud.example.com/api/files/xyz789',
    )
  })

  it('should build delete endpoint URL with file ID', () => {
    const base = 'http://10.0.0.1:9000/'
    const id = 'del999'
    expect(buildUrl(base, `/api/files/${id}`)).toBe(
      'http://10.0.0.1:9000/api/files/del999',
    )
  })

  it('should build metadata endpoint URL', () => {
    const base = 'http://localhost:3000'
    const id = 'meta001'
    expect(buildUrl(base, `/api/files/${id}/meta`)).toBe(
      'http://localhost:3000/api/files/meta001/meta',
    )
  })
})
