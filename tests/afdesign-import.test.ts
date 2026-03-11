import { describe, test, expect } from 'bun:test'
import {
  isAfdesignFile,
  findZstdBlocks,
  findTags,
  parseAfdesignHeader,
  importAfdesign,
  extractASCIIStrings,
  reverseString,
  AFDESIGN_TAGS,
} from '@/io/afdesign-import'

// ── Helper ──

function makeAfdesignHeader(extraBytes: Uint8Array = new Uint8Array(0)): Uint8Array {
  const magic = new Uint8Array([0x00, 0xff, 0x4b, 0x41])
  const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]) // version 1
  const result = new Uint8Array(magic.length + version.length + extraBytes.length)
  result.set(magic, 0)
  result.set(version, 4)
  result.set(extraBytes, 8)
  return result
}

// ── Tests ──

describe('afdesign-import: reverseString', () => {
  test('reverses a simple string', () => {
    expect(reverseString('hello')).toBe('olleh')
  })

  test('reverses empty string', () => {
    expect(reverseString('')).toBe('')
  })

  test('reverses single character', () => {
    expect(reverseString('a')).toBe('a')
  })
})

describe('afdesign-import: AFDESIGN_TAGS', () => {
  test('contains expected tag mappings', () => {
    expect(AFDESIGN_TAGS['ephS']).toBe('Shape')
    expect(AFDESIGN_TAGS['edoN']).toBe('Node')
    expect(AFDESIGN_TAGS['txeT']).toBe('Text')
    expect(AFDESIGN_TAGS['puorG']).toBe('Group')
    expect(AFDESIGN_TAGS['egamI']).toBe('Image')
    expect(AFDESIGN_TAGS['evrC']).toBe('Curve')
    expect(AFDESIGN_TAGS['tniP']).toBe('Point')
    expect(AFDESIGN_TAGS['bmyS']).toBe('Symbol')
    expect(AFDESIGN_TAGS['rlyL']).toBe('Layer')
  })
})

describe('afdesign-import: isAfdesignFile', () => {
  test('returns true for valid magic bytes', () => {
    const data = makeAfdesignHeader()
    expect(isAfdesignFile(data)).toBe(true)
  })

  test('returns false for wrong magic bytes', () => {
    const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
    expect(isAfdesignFile(data)).toBe(false)
  })

  test('returns false for data too short', () => {
    const data = new Uint8Array([0x00, 0xff])
    expect(isAfdesignFile(data)).toBe(false)
  })

  test('returns false for empty data', () => {
    expect(isAfdesignFile(new Uint8Array(0))).toBe(false)
  })
})

describe('afdesign-import: findZstdBlocks', () => {
  test('finds no blocks in data without zstd magic', () => {
    const data = new Uint8Array(100)
    expect(findZstdBlocks(data)).toEqual([])
  })

  test('finds one zstd block', () => {
    const data = new Uint8Array(20)
    data[5] = 0x28
    data[6] = 0xb5
    data[7] = 0x2f
    data[8] = 0xfd
    const blocks = findZstdBlocks(data)
    expect(blocks).toEqual([5])
  })

  test('finds multiple zstd blocks', () => {
    const data = new Uint8Array(30)
    // Block at offset 0
    data[0] = 0x28
    data[1] = 0xb5
    data[2] = 0x2f
    data[3] = 0xfd
    // Block at offset 10
    data[10] = 0x28
    data[11] = 0xb5
    data[12] = 0x2f
    data[13] = 0xfd
    const blocks = findZstdBlocks(data)
    expect(blocks).toEqual([0, 10])
  })
})

describe('afdesign-import: findTags', () => {
  test('finds reversed tags in data', () => {
    const text = 'some data ephS more data txeT end'
    const data = new TextEncoder().encode(text)
    const tags = findTags(data)
    expect(tags.length).toBe(2)
    expect(tags[0]!.decoded).toBe('Shape')
    expect(tags[1]!.decoded).toBe('Text')
  })

  test('finds no tags in irrelevant data', () => {
    const data = new TextEncoder().encode('hello world no tags here')
    const tags = findTags(data)
    expect(tags.length).toBe(0)
  })

  test('returns tags sorted by offset', () => {
    const text = 'txeT something ephS'
    const data = new TextEncoder().encode(text)
    const tags = findTags(data)
    expect(tags.length).toBe(2)
    expect(tags[0]!.offset).toBeLessThan(tags[1]!.offset)
  })

  test('finds same tag multiple times', () => {
    const text = 'ephS data ephS more ephS'
    const data = new TextEncoder().encode(text)
    const tags = findTags(data)
    expect(tags.length).toBe(3)
    expect(tags.every((t) => t.decoded === 'Shape')).toBe(true)
  })
})

describe('afdesign-import: parseAfdesignHeader', () => {
  test('parses valid header', () => {
    const data = makeAfdesignHeader()
    const header = parseAfdesignHeader(data)
    expect(header.magic).toBe(true)
    expect(header.version).toBe(1)
    expect(header.zstdBlockCount).toBe(0)
  })

  test('parses header with zstd blocks in body', () => {
    const extra = new Uint8Array(20)
    // Add a zstd magic at offset 10 in extra (offset 18 in full data)
    extra[10] = 0x28
    extra[11] = 0xb5
    extra[12] = 0x2f
    extra[13] = 0xfd
    const data = makeAfdesignHeader(extra)
    const header = parseAfdesignHeader(data)
    expect(header.zstdBlockCount).toBe(1)
  })

  test('version 0 for short data', () => {
    const data = new Uint8Array([0x00, 0xff, 0x4b, 0x41])
    const header = parseAfdesignHeader(data)
    expect(header.magic).toBe(true)
    expect(header.version).toBe(0)
  })

  test('non-afdesign file', () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]) // ZIP header
    const header = parseAfdesignHeader(data)
    expect(header.magic).toBe(false)
  })
})

describe('afdesign-import: extractASCIIStrings', () => {
  test('extracts printable strings', () => {
    const data = new Uint8Array([
      0x48,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "Hello"
      0x00, // separator
      0x57,
      0x6f,
      0x72,
      0x6c,
      0x64, // "World"
    ])
    const strings = extractASCIIStrings(data, 4)
    expect(strings).toEqual(['Hello', 'World'])
  })

  test('skips strings shorter than minLength', () => {
    const data = new Uint8Array([
      0x48,
      0x69, // "Hi"
      0x00,
      0x48,
      0x65,
      0x6c,
      0x6c,
      0x6f, // "Hello"
    ])
    const strings = extractASCIIStrings(data, 4)
    expect(strings).toEqual(['Hello'])
  })

  test('returns empty for non-printable data', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    expect(extractASCIIStrings(data, 4)).toEqual([])
  })

  test('handles string at end of data', () => {
    const data = new Uint8Array([
      0x00,
      0x54,
      0x65,
      0x73,
      0x74, // "Test"
    ])
    const strings = extractASCIIStrings(data, 4)
    expect(strings).toEqual(['Test'])
  })

  test('extracts with minLength 1', () => {
    const data = new Uint8Array([0x41, 0x00, 0x42])
    const strings = extractASCIIStrings(data, 1)
    expect(strings).toEqual(['A', 'B'])
  })

  test('extracts filename-like strings', () => {
    const text = 'design.afdesign'
    const bytes = new TextEncoder().encode(text)
    const data = new Uint8Array(bytes.length + 2)
    data[0] = 0x00
    data.set(bytes, 1)
    data[data.length - 1] = 0x00
    const strings = extractASCIIStrings(data, 4)
    expect(strings).toContain('design.afdesign')
  })
})

describe('afdesign-import: importAfdesign', () => {
  test('throws for non-afdesign data', async () => {
    const data = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
    await expect(importAfdesign(data)).rejects.toThrow('Not a valid .afdesign file')
  })

  test('imports valid afdesign header with defaults', async () => {
    const data = makeAfdesignHeader(new Uint8Array(100))
    const doc = await importAfdesign(data)
    expect(doc.artboards.length).toBe(1)
    expect(doc.artboards[0]!.width).toBe(1920)
    expect(doc.artboards[0]!.height).toBe(1080)
    expect(doc.artboards[0]!.layers.length).toBe(1)
    // Placeholder layer
    expect(doc.artboards[0]!.layers[0]!.type).toBe('vector')
    expect(doc.artboards[0]!.layers[0]!.name).toContain('Affinity Import')
  })

  test('extracts title from .afdesign filename in data', async () => {
    const filename = 'mydesign.afdesign'
    const filenameBytes = new TextEncoder().encode(filename)
    const extra = new Uint8Array(filenameBytes.length + 10)
    extra.set(filenameBytes, 5)
    const data = makeAfdesignHeader(extra)
    const doc = await importAfdesign(data)
    expect(doc.metadata.title).toBe('mydesign')
  })

  test('metadata has correct colorspace', async () => {
    const data = makeAfdesignHeader(new Uint8Array(50))
    const doc = await importAfdesign(data)
    expect(doc.metadata.colorspace).toBe('srgb')
    expect(doc.metadata.author).toBe('')
  })

  test('assets are empty', async () => {
    const data = makeAfdesignHeader(new Uint8Array(50))
    const doc = await importAfdesign(data)
    expect(doc.assets.gradients).toEqual([])
    expect(doc.assets.patterns).toEqual([])
    expect(doc.assets.colors).toEqual([])
  })

  test('placeholder layer has correct structure', async () => {
    // Include a zstd block so the placeholder name mentions count
    const extra = new Uint8Array(30)
    extra[10] = 0x28
    extra[11] = 0xb5
    extra[12] = 0x2f
    extra[13] = 0xfd
    const data = makeAfdesignHeader(extra)
    const doc = await importAfdesign(data)
    const placeholder = doc.artboards[0]!.layers[0]!
    if (placeholder.type === 'vector') {
      expect(placeholder.name).toContain('1 compressed blocks')
      expect(placeholder.fill).toMatchObject({ type: 'solid', color: '#cccccc', opacity: 1 })
      expect(placeholder.stroke).toBeNull()
      expect(placeholder.transform).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
    }
  })
})
