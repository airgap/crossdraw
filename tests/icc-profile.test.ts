import { describe, it, expect } from 'bun:test'
import {
  parseICCProfile,
  iccColorSpaceToDocColorspace,
  extractICCFromPNG,
  buildICCPChunkData,
  ICC_PRESETS,
} from '@/io/icc-profile'

function buildMinimalICCHeader(opts?: { deviceClass?: string; colorSpace?: string }): Uint8Array {
  const header = new Uint8Array(132) // 128 header + 4 for tag count

  // Device class at bytes 12-15
  const dc = opts?.deviceClass ?? 'mntr'
  for (let i = 0; i < 4; i++) header[12 + i] = dc.charCodeAt(i)

  // Color space at bytes 16-19
  const cs = opts?.colorSpace ?? 'RGB '
  for (let i = 0; i < 4; i++) header[16 + i] = cs.charCodeAt(i)

  // Tag count at bytes 128-131: 0 tags
  header[128] = 0
  header[129] = 0
  header[130] = 0
  header[131] = 0

  return header
}

function buildICCWithDescTag(name: string): Uint8Array {
  // We need: 128 header + 4 tag-count + 12 tag-entry + desc data
  const nameBytes = new TextEncoder().encode(name)
  const descDataSize = 4 + 4 + 4 + nameBytes.length + 1 // type(desc=4) + reserved(4) + asciiLen(4) + name + null
  const tagDataOffset = 132 + 12 // after header + count + 1 entry
  const totalSize = tagDataOffset + descDataSize

  const data = new Uint8Array(totalSize)

  // Device class
  const dc = 'mntr'
  for (let i = 0; i < 4; i++) data[12 + i] = dc.charCodeAt(i)
  // Color space
  const cs = 'RGB '
  for (let i = 0; i < 4; i++) data[16 + i] = cs.charCodeAt(i)

  // Tag count = 1
  data[131] = 1

  // Tag entry at offset 132:
  // sig = 'desc'
  data[132] = 'd'.charCodeAt(0)
  data[133] = 'e'.charCodeAt(0)
  data[134] = 's'.charCodeAt(0)
  data[135] = 'c'.charCodeAt(0)

  // offset (big-endian u32) = tagDataOffset
  data[136] = (tagDataOffset >> 24) & 0xff
  data[137] = (tagDataOffset >> 16) & 0xff
  data[138] = (tagDataOffset >> 8) & 0xff
  data[139] = tagDataOffset & 0xff

  // length (big-endian u32) = descDataSize
  data[140] = (descDataSize >> 24) & 0xff
  data[141] = (descDataSize >> 16) & 0xff
  data[142] = (descDataSize >> 8) & 0xff
  data[143] = descDataSize & 0xff

  // desc data: type='desc' (4 bytes), reserved(4 bytes), asciiLen(4 bytes), asciiString
  let pos = tagDataOffset
  // type tag 'desc'
  data[pos++] = 'd'.charCodeAt(0)
  data[pos++] = 'e'.charCodeAt(0)
  data[pos++] = 's'.charCodeAt(0)
  data[pos++] = 'c'.charCodeAt(0)
  // reserved 4 bytes
  pos += 4

  // ASCII count (includes null terminator) - big-endian u32
  const asciiLen = nameBytes.length + 1
  data[pos] = (asciiLen >> 24) & 0xff
  data[pos + 1] = (asciiLen >> 16) & 0xff
  data[pos + 2] = (asciiLen >> 8) & 0xff
  data[pos + 3] = asciiLen & 0xff
  pos += 4

  // ASCII string (without null)
  for (let i = 0; i < nameBytes.length; i++) {
    data[pos + i] = nameBytes[i]!
  }
  // null terminator is already 0

  return data
}

describe('parseICCProfile', () => {
  it('should throw if data is too short', () => {
    const shortData = new Uint8Array(50)
    expect(() => parseICCProfile(shortData)).toThrow('ICC profile too short')
  })

  it('should parse device class and color space from header', () => {
    const data = buildMinimalICCHeader({
      deviceClass: 'scnr',
      colorSpace: 'CMYK',
    })
    const profile = parseICCProfile(data)

    expect(profile.name).toContain('CMYK')
    expect(profile.name).toContain('scnr')
    expect(profile.data).toBe(data)
  })

  it('should return default name when no desc tag', () => {
    const data = buildMinimalICCHeader({ colorSpace: 'RGB ' })
    const profile = parseICCProfile(data)

    expect(profile.name).toBe('ICC RGB (mntr)')
    expect(profile.data).toBe(data)
  })

  it('should extract ASCII description from desc tag', () => {
    const data = buildICCWithDescTag('sRGB IEC61966-2.1')
    const profile = parseICCProfile(data)

    expect(profile.name).toBe('sRGB IEC61966-2.1')
  })

  it('should handle desc tag with short name', () => {
    const data = buildICCWithDescTag('P3')
    const profile = parseICCProfile(data)

    expect(profile.name).toBe('P3')
  })

  it('should handle exactly 128 bytes with zero tag count', () => {
    const data = new Uint8Array(132)
    const cs = 'LAB '
    for (let i = 0; i < 4; i++) data[16 + i] = cs.charCodeAt(i)
    const dc = 'prtr'
    for (let i = 0; i < 4; i++) data[12 + i] = dc.charCodeAt(i)
    data[131] = 0 // 0 tags

    const profile = parseICCProfile(data)
    expect(profile.name).toBe('ICC LAB (prtr)')
  })

  it('should handle tag count exceeding 100 gracefully', () => {
    // Set tag count to 200 but only provide minimal data
    const data = new Uint8Array(200)
    const cs = 'RGB '
    for (let i = 0; i < 4; i++) data[16 + i] = cs.charCodeAt(i)
    const dc = 'mntr'
    for (let i = 0; i < 4; i++) data[12 + i] = dc.charCodeAt(i)

    // Big-endian 200 at offset 128
    data[131] = 200

    // Should not crash, just give default name
    const profile = parseICCProfile(data)
    expect(profile.name).toContain('RGB')
  })
})

describe('iccColorSpaceToDocColorspace', () => {
  it('should return srgb for RGB', () => {
    expect(iccColorSpaceToDocColorspace('RGB')).toBe('srgb')
  })

  it('should return srgb for trimmed "RGB "', () => {
    expect(iccColorSpaceToDocColorspace('RGB ')).toBe('srgb')
  })

  it('should return srgb for lowercase "rgb"', () => {
    expect(iccColorSpaceToDocColorspace('rgb')).toBe('srgb')
  })

  it('should return srgb for unknown colour spaces', () => {
    expect(iccColorSpaceToDocColorspace('CMYK')).toBe('srgb')
    expect(iccColorSpaceToDocColorspace('LAB')).toBe('srgb')
  })
})

describe('extractICCFromPNG', () => {
  it('should return null for data shorter than 8 bytes', () => {
    expect(extractICCFromPNG(new Uint8Array(5))).toBeNull()
  })

  it('should return null for non-PNG data', () => {
    const data = new Uint8Array(100)
    data[0] = 0xff // JPEG signature
    data[1] = 0xd8
    expect(extractICCFromPNG(data)).toBeNull()
  })

  it('should return null for PNG without iCCP chunk', () => {
    // Valid PNG signature + IHDR chunk + IEND chunk
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const data = new Uint8Array(sig.length + 12 + 13 + 12) // sig + IHDR(12 header + 13 data) + IEND(12)
    for (let i = 0; i < 8; i++) data[i] = sig[i]!

    // IHDR chunk: length=13
    data[8] = 0
    data[9] = 0
    data[10] = 0
    data[11] = 13
    // type = "IHDR"
    data[12] = 'I'.charCodeAt(0)
    data[13] = 'H'.charCodeAt(0)
    data[14] = 'D'.charCodeAt(0)
    data[15] = 'R'.charCodeAt(0)
    // IHDR data (13 bytes) + CRC (4 bytes) = skip to offset 8 + 12 + 13 + 4 = 37

    // IEND chunk at the end
    const iendOff = 8 + 4 + 4 + 13 + 4
    data[iendOff] = 0
    data[iendOff + 1] = 0
    data[iendOff + 2] = 0
    data[iendOff + 3] = 0 // length = 0
    data[iendOff + 4] = 'I'.charCodeAt(0)
    data[iendOff + 5] = 'E'.charCodeAt(0)
    data[iendOff + 6] = 'N'.charCodeAt(0)
    data[iendOff + 7] = 'D'.charCodeAt(0)

    expect(extractICCFromPNG(data)).toBeNull()
  })

  it('should extract profile name from iCCP chunk', () => {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    // iCCP chunk: "sRGB" + null + compression method + compressed data (dummy)
    const profileName = 'sRGB'
    const nameBytes = new TextEncoder().encode(profileName)
    const chunkDataLen = nameBytes.length + 1 + 1 + 4 // name + null + compressionMethod + some data

    const totalSize = 8 + 4 + 4 + chunkDataLen + 4 // sig + length + type + data + CRC
    const data = new Uint8Array(totalSize)
    for (let i = 0; i < 8; i++) data[i] = sig[i]!

    // Chunk length (big-endian)
    let off = 8
    data[off] = (chunkDataLen >> 24) & 0xff
    data[off + 1] = (chunkDataLen >> 16) & 0xff
    data[off + 2] = (chunkDataLen >> 8) & 0xff
    data[off + 3] = chunkDataLen & 0xff
    off += 4

    // Chunk type "iCCP"
    data[off] = 'i'.charCodeAt(0)
    data[off + 1] = 'C'.charCodeAt(0)
    data[off + 2] = 'C'.charCodeAt(0)
    data[off + 3] = 'P'.charCodeAt(0)
    off += 4

    // Profile name + null
    for (let i = 0; i < nameBytes.length; i++) {
      data[off + i] = nameBytes[i]!
    }
    off += nameBytes.length
    data[off] = 0 // null terminator
    off += 1
    // Compression method
    data[off] = 0
    off += 1

    const result = extractICCFromPNG(data)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('sRGB')
  })
})

describe('buildICCPChunkData', () => {
  it('should return null if profile has no data', () => {
    const profile = { name: 'sRGB' }
    expect(buildICCPChunkData(profile)).toBeNull()
  })

  it('should build chunk data with name, null, compression method, and profile data', () => {
    const profileData = new Uint8Array([1, 2, 3, 4, 5])
    const profile = { name: 'TestProfile', data: profileData }
    const result = buildICCPChunkData(profile)

    expect(result).not.toBeNull()
    const nameBytes = new TextEncoder().encode('TestProfile')
    const expectedLen = nameBytes.length + 2 + profileData.length
    expect(result!.length).toBe(expectedLen)

    // Check name
    for (let i = 0; i < nameBytes.length; i++) {
      expect(result![i]).toBe(nameBytes[i]!)
    }

    // Check null terminator
    expect(result![nameBytes.length]).toBe(0)
    // Check compression method
    expect(result![nameBytes.length + 1]).toBe(0)

    // Check profile data
    for (let i = 0; i < profileData.length; i++) {
      expect(result![nameBytes.length + 2 + i]).toBe(profileData[i]!)
    }
  })

  it('should handle empty name', () => {
    const profileData = new Uint8Array([10, 20])
    const profile = { name: '', data: profileData }
    const result = buildICCPChunkData(profile)

    expect(result).not.toBeNull()
    // 0 (name) + 0 (null) + 0 (compression) + 2 (data)
    expect(result!.length).toBe(2 + profileData.length)
    expect(result![0]).toBe(0) // null terminator
    expect(result![1]).toBe(0) // compression method
  })
})

describe('ICC_PRESETS', () => {
  it('should have sRGB preset', () => {
    expect(ICC_PRESETS.sRGB).toBeDefined()
    expect(ICC_PRESETS.sRGB!.name).toBe('sRGB IEC61966-2.1')
  })

  it('should have Display P3 preset', () => {
    expect(ICC_PRESETS['Display P3']).toBeDefined()
    expect(ICC_PRESETS['Display P3']!.name).toBe('Display P3')
  })

  it('should have Adobe RGB preset', () => {
    expect(ICC_PRESETS['Adobe RGB']).toBeDefined()
    expect(ICC_PRESETS['Adobe RGB']!.name).toBe('Adobe RGB (1998)')
  })

  it('presets should not have data by default', () => {
    expect(ICC_PRESETS.sRGB!.data).toBeUndefined()
    expect(ICC_PRESETS['Display P3']!.data).toBeUndefined()
    expect(ICC_PRESETS['Adobe RGB']!.data).toBeUndefined()
  })
})
