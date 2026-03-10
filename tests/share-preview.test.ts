import { describe, it, expect } from 'bun:test'
import { createHash } from 'crypto'
import { buildUrl } from '@/cloud/cloud-client'

// ── Types (mirrored from server/main.ts for test isolation) ──

interface ShareMetadata {
  slug: string
  name: string
  passwordHash: string | null
  expiresAt: string | null
  viewCount: number
  createdAt: string
}

interface ShareIndex {
  shares: ShareMetadata[]
}

// ── Re-implemented helpers for testability without server imports ──

function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let slug = ''
  for (let i = 0; i < 10; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)]
  }
  return slug
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function isShareExpired(share: ShareMetadata): boolean {
  if (!share.expiresAt) return false
  return new Date(share.expiresAt).getTime() < Date.now()
}

// ── Test data factories ──

function createTestShare(overrides: Partial<ShareMetadata> = {}): ShareMetadata {
  return {
    slug: 'abc1234567',
    name: 'Test Design',
    passwordHash: null,
    expiresAt: null,
    viewCount: 0,
    createdAt: '2026-03-09T00:00:00.000Z',
    ...overrides,
  }
}

function createEmptyShareIndex(): ShareIndex {
  return { shares: [] }
}

// ── Tests ──

describe('Share Preview', () => {
  describe('Slug generation', () => {
    it('should generate a 10-character slug', () => {
      const slug = generateSlug()
      expect(slug.length).toBe(10)
    })

    it('should only contain lowercase alphanumeric characters', () => {
      for (let i = 0; i < 50; i++) {
        const slug = generateSlug()
        expect(slug).toMatch(/^[a-z0-9]+$/)
      }
    })

    it('should generate unique slugs', () => {
      const slugs = new Set<string>()
      for (let i = 0; i < 200; i++) {
        slugs.add(generateSlug())
      }
      // With 10 chars of 36 possible, collisions are extremely unlikely
      // but we allow a tiny margin
      expect(slugs.size).toBeGreaterThanOrEqual(195)
    })

    it('should not generate empty slugs', () => {
      for (let i = 0; i < 50; i++) {
        const slug = generateSlug()
        expect(slug.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Share metadata structure', () => {
    it('should create valid share metadata with defaults', () => {
      const share = createTestShare()
      expect(share.slug).toBe('abc1234567')
      expect(share.name).toBe('Test Design')
      expect(share.passwordHash).toBeNull()
      expect(share.expiresAt).toBeNull()
      expect(share.viewCount).toBe(0)
      expect(share.createdAt).toBe('2026-03-09T00:00:00.000Z')
    })

    it('should support password-protected shares', () => {
      const hash = hashPassword('secret123')
      const share = createTestShare({ passwordHash: hash })
      expect(share.passwordHash).not.toBeNull()
      expect(share.passwordHash!.length).toBe(64) // SHA-256 hex
    })

    it('should support expiry dates', () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      const share = createTestShare({ expiresAt: futureDate })
      expect(share.expiresAt).not.toBeNull()
      expect(new Date(share.expiresAt!).getTime()).toBeGreaterThan(Date.now())
    })

    it('should track view count', () => {
      const share = createTestShare({ viewCount: 42 })
      expect(share.viewCount).toBe(42)
    })

    it('should store the document name', () => {
      const share = createTestShare({ name: 'My App Prototype' })
      expect(share.name).toBe('My App Prototype')
    })
  })

  describe('Password hashing', () => {
    it('should produce consistent hashes for the same password', () => {
      const hash1 = hashPassword('test')
      const hash2 = hashPassword('test')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hashes for different passwords', () => {
      const hash1 = hashPassword('password1')
      const hash2 = hashPassword('password2')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce a 64-character hex string (SHA-256)', () => {
      const hash = hashPassword('hello')
      expect(hash.length).toBe(64)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it('should hash empty strings', () => {
      const hash = hashPassword('')
      expect(hash.length).toBe(64)
    })

    it('should handle special characters', () => {
      const hash = hashPassword('p@$$w0rd!#%^&*()')
      expect(hash.length).toBe(64)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })

    it('should handle unicode characters', () => {
      const hash = hashPassword('\u00e9\u00e0\u00fc\u00f1')
      expect(hash.length).toBe(64)
    })
  })

  describe('Expiry date validation', () => {
    it('should consider a share without expiresAt as not expired', () => {
      const share = createTestShare({ expiresAt: null })
      expect(isShareExpired(share)).toBe(false)
    })

    it('should consider a future date as not expired', () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString()
      const share = createTestShare({ expiresAt: futureDate })
      expect(isShareExpired(share)).toBe(false)
    })

    it('should consider a past date as expired', () => {
      const pastDate = new Date(Date.now() - 86400000).toISOString()
      const share = createTestShare({ expiresAt: pastDate })
      expect(isShareExpired(share)).toBe(true)
    })

    it('should consider a date far in the past as expired', () => {
      const share = createTestShare({ expiresAt: '2020-01-01T00:00:00.000Z' })
      expect(isShareExpired(share)).toBe(true)
    })

    it('should consider a date far in the future as not expired', () => {
      const share = createTestShare({ expiresAt: '2099-12-31T23:59:59.000Z' })
      expect(isShareExpired(share)).toBe(false)
    })
  })

  describe('View count tracking', () => {
    it('should start at zero', () => {
      const share = createTestShare()
      expect(share.viewCount).toBe(0)
    })

    it('should increment view count', () => {
      const share = createTestShare({ viewCount: 0 })
      share.viewCount++
      expect(share.viewCount).toBe(1)
      share.viewCount++
      expect(share.viewCount).toBe(2)
    })

    it('should track large view counts', () => {
      const share = createTestShare({ viewCount: 999999 })
      expect(share.viewCount).toBe(999999)
    })
  })

  describe('Share index operations', () => {
    it('should start with an empty shares array', () => {
      const index = createEmptyShareIndex()
      expect(index.shares).toEqual([])
      expect(index.shares.length).toBe(0)
    })

    it('should add a share to the index', () => {
      const index = createEmptyShareIndex()
      const share = createTestShare()
      index.shares.push(share)
      expect(index.shares.length).toBe(1)
      expect(index.shares[0]!.slug).toBe('abc1234567')
    })

    it('should remove a share from the index', () => {
      const index = createEmptyShareIndex()
      index.shares.push(createTestShare({ slug: 'slug1' }))
      index.shares.push(createTestShare({ slug: 'slug2' }))
      expect(index.shares.length).toBe(2)

      index.shares = index.shares.filter((s) => s.slug !== 'slug1')
      expect(index.shares.length).toBe(1)
      expect(index.shares[0]!.slug).toBe('slug2')
    })

    it('should find a share by slug', () => {
      const index = createEmptyShareIndex()
      index.shares.push(createTestShare({ slug: 'aaa' }))
      index.shares.push(createTestShare({ slug: 'bbb', name: 'Second' }))
      index.shares.push(createTestShare({ slug: 'ccc' }))

      const found = index.shares.find((s) => s.slug === 'bbb')
      expect(found).toBeDefined()
      expect(found!.name).toBe('Second')
    })

    it('should filter out expired shares', () => {
      const index = createEmptyShareIndex()
      index.shares.push(createTestShare({ slug: 'active1', expiresAt: null }))
      index.shares.push(
        createTestShare({
          slug: 'expired1',
          expiresAt: '2020-01-01T00:00:00.000Z',
        }),
      )
      index.shares.push(
        createTestShare({
          slug: 'active2',
          expiresAt: '2099-12-31T23:59:59.000Z',
        }),
      )

      const active = index.shares.filter((s) => !isShareExpired(s))
      expect(active.length).toBe(2)
      expect(active[0]!.slug).toBe('active1')
      expect(active[1]!.slug).toBe('active2')
    })
  })

  describe('Share URL building', () => {
    it('should build correct share URLs', () => {
      const url = buildUrl('http://localhost:3000', '/share/abc123')
      expect(url).toBe('http://localhost:3000/share/abc123')
    })

    it('should handle trailing slashes in server URL', () => {
      const url = buildUrl('http://localhost:3000/', '/share/abc123')
      expect(url).toBe('http://localhost:3000/share/abc123')
    })

    it('should handle API share URLs', () => {
      const url = buildUrl('https://my-server.com', '/api/shares/xyz789')
      expect(url).toBe('https://my-server.com/api/shares/xyz789')
    })

    it('should handle view URLs', () => {
      const url = buildUrl('https://my-server.com', '/api/shares/xyz789/view')
      expect(url).toBe('https://my-server.com/api/shares/xyz789/view')
    })
  })

  describe('Share metadata JSON serialization', () => {
    it('should round-trip through JSON correctly', () => {
      const share = createTestShare({
        slug: 'roundtrip1',
        name: 'Round Trip Test',
        passwordHash: hashPassword('test'),
        expiresAt: '2099-06-15T12:00:00.000Z',
        viewCount: 7,
      })

      const json = JSON.stringify(share)
      const restored = JSON.parse(json) as ShareMetadata
      expect(restored.slug).toBe('roundtrip1')
      expect(restored.name).toBe('Round Trip Test')
      expect(restored.passwordHash).toBe(share.passwordHash)
      expect(restored.expiresAt).toBe('2099-06-15T12:00:00.000Z')
      expect(restored.viewCount).toBe(7)
    })

    it('should serialize null values correctly', () => {
      const share = createTestShare({ passwordHash: null, expiresAt: null })
      const json = JSON.stringify(share)
      const restored = JSON.parse(json) as ShareMetadata
      expect(restored.passwordHash).toBeNull()
      expect(restored.expiresAt).toBeNull()
    })
  })
})
