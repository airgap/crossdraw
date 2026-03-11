import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test'
import {
  buildUrl,
  getCloudConfig,
  setCloudConfig,
  listCloudFiles,
  uploadFile,
  downloadFile,
  updateFile,
  deleteFile,
  type CloudConfig,
  type CloudFileEntry,
} from '@/cloud/cloud-client'

// ── Mock localStorage ──

const origLocalStorage = globalThis.localStorage
const origFetchGlobal = globalThis.fetch

afterAll(() => {
  globalThis.localStorage = origLocalStorage
  globalThis.fetch = origFetchGlobal
})

const mockStorage: Record<string, string> = {}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        for (const key of Object.keys(mockStorage)) delete mockStorage[key]
      },
    },
    writable: true,
    configurable: true,
  })
}

// ── Mock fetch ──

let mockFetchResponse: { ok: boolean; status: number; statusText: string; body: unknown; isBuffer?: boolean }

const originalFetch = globalThis.fetch

function setupMockFetch() {
  ;(globalThis as any).fetch = async (_url: RequestInfo | URL, _init?: RequestInit) => {
    if (!mockFetchResponse.ok) {
      return {
        ok: false,
        status: mockFetchResponse.status,
        statusText: mockFetchResponse.statusText,
        json: async () => mockFetchResponse.body,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response
    }
    return {
      ok: true,
      status: mockFetchResponse.status,
      statusText: 'OK',
      json: async () => mockFetchResponse.body,
      arrayBuffer: async () => mockFetchResponse.body as ArrayBuffer,
    } as unknown as Response
  }
}

describe('Cloud Client - buildUrl', () => {
  test('constructs URL correctly', () => {
    expect(buildUrl('http://localhost:3000', '/api/files')).toBe('http://localhost:3000/api/files')
  })

  test('handles trailing slash', () => {
    expect(buildUrl('http://localhost:3000/', '/api/files')).toBe('http://localhost:3000/api/files')
  })

  test('handles URL with path and port', () => {
    expect(buildUrl('https://cloud.example.com:8080', '/api/files/abc')).toBe(
      'https://cloud.example.com:8080/api/files/abc',
    )
  })
})

describe('Cloud Client - Config', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  test('getCloudConfig returns defaults when storage is empty', () => {
    const config = getCloudConfig()
    expect(config.serverUrl).toBe('')
    expect(config.apiKey).toBe('')
  })

  test('setCloudConfig and getCloudConfig roundtrip', () => {
    setCloudConfig({ serverUrl: 'http://my-server:3000', apiKey: 'my-key-123' })
    const config = getCloudConfig()
    expect(config.serverUrl).toBe('http://my-server:3000')
    expect(config.apiKey).toBe('my-key-123')
  })

  test('getCloudConfig handles invalid JSON in storage', () => {
    mockStorage['crossdraw:cloud-config'] = 'not-json'
    const config = getCloudConfig()
    expect(config.serverUrl).toBe('')
    expect(config.apiKey).toBe('')
  })

  test('getCloudConfig handles partial config', () => {
    mockStorage['crossdraw:cloud-config'] = JSON.stringify({ serverUrl: 'http://test' })
    const config = getCloudConfig()
    expect(config.serverUrl).toBe('http://test')
    expect(config.apiKey).toBe('')
  })

  test('getCloudConfig handles non-string fields', () => {
    mockStorage['crossdraw:cloud-config'] = JSON.stringify({ serverUrl: 123, apiKey: true })
    const config = getCloudConfig()
    expect(config.serverUrl).toBe('')
    expect(config.apiKey).toBe('')
  })
})

describe('Cloud Client - API Methods', () => {
  beforeEach(() => {
    setupMockFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const testConfig: CloudConfig = { serverUrl: 'http://localhost:3000', apiKey: 'test-key' }

  describe('listCloudFiles', () => {
    test('returns list of files on success', async () => {
      const files: CloudFileEntry[] = [
        { id: '1', name: 'file1.xd', size: 1024, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: '2', name: 'file2.xd', size: 2048, createdAt: '2026-01-02', updatedAt: '2026-01-02' },
      ]
      mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: files }

      const result = await listCloudFiles(testConfig)
      expect(result).toHaveLength(2)
      expect(result[0]!.id).toBe('1')
      expect(result[1]!.name).toBe('file2.xd')
    })

    test('throws on error response', async () => {
      mockFetchResponse = { ok: false, status: 500, statusText: 'Internal Server Error', body: {} }
      await expect(listCloudFiles(testConfig)).rejects.toThrow('Failed to list files')
    })
  })

  describe('uploadFile', () => {
    test('uploads file and returns entry', async () => {
      const entry: CloudFileEntry = {
        id: 'new-1',
        name: 'upload.xd',
        size: 512,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }
      mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: entry }

      const result = await uploadFile('upload.xd', new ArrayBuffer(512), testConfig)
      expect(result.id).toBe('new-1')
      expect(result.name).toBe('upload.xd')
    })

    test('throws on error response', async () => {
      mockFetchResponse = { ok: false, status: 413, statusText: 'Payload Too Large', body: {} }
      await expect(uploadFile('big.xd', new ArrayBuffer(0), testConfig)).rejects.toThrow('Failed to upload file')
    })
  })

  describe('downloadFile', () => {
    test('downloads file as ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(100)
      mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: buffer }

      const result = await downloadFile('file-1', testConfig)
      expect(result).toBeDefined()
      expect(result instanceof ArrayBuffer).toBe(true)
    })

    test('throws on error response', async () => {
      mockFetchResponse = { ok: false, status: 404, statusText: 'Not Found', body: {} }
      await expect(downloadFile('missing', testConfig)).rejects.toThrow('Failed to download file')
    })
  })

  describe('updateFile', () => {
    test('updates file and returns entry', async () => {
      const entry: CloudFileEntry = {
        id: 'upd-1',
        name: 'updated.xd',
        size: 1024,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      }
      mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: entry }

      const result = await updateFile('upd-1', new ArrayBuffer(1024), testConfig)
      expect(result.id).toBe('upd-1')
      expect(result.updatedAt).toBe('2026-01-02')
    })

    test('throws on error response', async () => {
      mockFetchResponse = { ok: false, status: 403, statusText: 'Forbidden', body: {} }
      await expect(updateFile('upd-1', new ArrayBuffer(0), testConfig)).rejects.toThrow('Failed to update file')
    })
  })

  describe('deleteFile', () => {
    test('deletes file without error', async () => {
      mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: null }
      await expect(deleteFile('del-1', testConfig)).resolves.toBeUndefined()
    })

    test('throws on error response', async () => {
      mockFetchResponse = { ok: false, status: 404, statusText: 'Not Found', body: {} }
      await expect(deleteFile('missing', testConfig)).rejects.toThrow('Failed to delete file')
    })
  })
})

describe('Cloud Client - API without explicit config', () => {
  beforeEach(() => {
    setupMockFetch()
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    // Set up a config in localStorage
    setCloudConfig({ serverUrl: 'http://test:4000', apiKey: 'stored-key' })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('listCloudFiles uses stored config', async () => {
    mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: [] }
    const result = await listCloudFiles()
    expect(result).toEqual([])
  })

  test('uploadFile uses stored config', async () => {
    const entry: CloudFileEntry = { id: 'x', name: 'x.xd', size: 1, createdAt: '', updatedAt: '' }
    mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: entry }
    const result = await uploadFile('x.xd', new ArrayBuffer(1))
    expect(result.id).toBe('x')
  })

  test('downloadFile uses stored config', async () => {
    mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: new ArrayBuffer(10) }
    const result = await downloadFile('f1')
    expect(result).toBeDefined()
  })

  test('updateFile uses stored config', async () => {
    const entry: CloudFileEntry = { id: 'u', name: 'u.xd', size: 1, createdAt: '', updatedAt: '' }
    mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: entry }
    const result = await updateFile('u', new ArrayBuffer(1))
    expect(result.id).toBe('u')
  })

  test('deleteFile uses stored config', async () => {
    mockFetchResponse = { ok: true, status: 200, statusText: 'OK', body: null }
    await expect(deleteFile('d1')).resolves.toBeUndefined()
  })
})
