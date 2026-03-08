import type { ICCProfile } from '@/types'

/**
 * Parse ICC profile header from binary data.
 * ICC profile spec: the first 128 bytes are the header.
 */
export function parseICCProfile(data: Uint8Array): ICCProfile {
  if (data.length < 128) throw new Error('ICC profile too short')

  // Profile/Device class (bytes 12-15)
  const deviceClass = String.fromCharCode(data[12]!, data[13]!, data[14]!, data[15]!)

  // Color space (bytes 16-19)
  const colorSpace = String.fromCharCode(data[16]!, data[17]!, data[18]!, data[19]!).trim()

  // Description: look for 'desc' tag in tag table
  // Tag table starts at byte 128. Count at 128-131.
  const tagCount = (data[128]! << 24) | (data[129]! << 16) | (data[130]! << 8) | data[131]!
  let name = `ICC ${colorSpace} (${deviceClass})`

  for (let i = 0; i < tagCount && i < 100; i++) {
    const tagOffset = 132 + i * 12
    if (tagOffset + 12 > data.length) break
    const sig = String.fromCharCode(data[tagOffset]!, data[tagOffset + 1]!, data[tagOffset + 2]!, data[tagOffset + 3]!)
    const offset =
      (data[tagOffset + 4]! << 24) | (data[tagOffset + 5]! << 16) | (data[tagOffset + 6]! << 8) | data[tagOffset + 7]!
    const length =
      (data[tagOffset + 8]! << 24) | (data[tagOffset + 9]! << 16) | (data[tagOffset + 10]! << 8) | data[tagOffset + 11]!

    if (sig === 'desc' && offset + length <= data.length) {
      // Try to extract ASCII description
      // 'desc' type: bytes 0-3 = 'desc', 4-7 = reserved, 8-11 = ASCII count, 12+ = ASCII string
      const descTypeOffset = offset + 8
      if (descTypeOffset + 4 <= data.length) {
        const asciiLen =
          (data[descTypeOffset]! << 24) |
          (data[descTypeOffset + 1]! << 16) |
          (data[descTypeOffset + 2]! << 8) |
          data[descTypeOffset + 3]!
        if (asciiLen > 0 && descTypeOffset + 4 + asciiLen <= data.length) {
          const bytes = data.slice(descTypeOffset + 4, descTypeOffset + 4 + asciiLen - 1)
          name = new TextDecoder('ascii').decode(bytes)
        }
      }
      break
    }
  }

  return { name, data }
}

/**
 * Map an ICC color space string to our colorspace type.
 */
export function iccColorSpaceToDocColorspace(iccSpace: string): 'srgb' | 'p3' | 'adobe-rgb' {
  const space = iccSpace.trim().toUpperCase()
  if (space === 'RGB') return 'srgb'
  return 'srgb'
}

/**
 * Extract ICC profile from a PNG file (iCCP chunk).
 * Returns null if no ICC profile found.
 */
export function extractICCFromPNG(data: Uint8Array): ICCProfile | null {
  // PNG signature: 8 bytes
  if (data.length < 8) return null
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) {
    if (data[i] !== sig[i]) return null
  }

  let offset = 8
  while (offset + 8 < data.length) {
    const length = (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
    const type = String.fromCharCode(data[offset + 4]!, data[offset + 5]!, data[offset + 6]!, data[offset + 7]!)

    if (type === 'iCCP') {
      // iCCP chunk: profile name (null-terminated) + compression method (1 byte) + compressed data
      const chunkData = data.slice(offset + 8, offset + 8 + length)
      let nameEnd = 0
      while (nameEnd < chunkData.length && chunkData[nameEnd] !== 0) nameEnd++
      const profileName = new TextDecoder('ascii').decode(chunkData.slice(0, nameEnd))
      // compression method at nameEnd+1 (should be 0 = zlib)
      // compressed data starts at nameEnd+2
      return { name: profileName }
    }

    if (type === 'IEND') break
    offset += 12 + length // 4 (length) + 4 (type) + length + 4 (CRC)
  }

  return null
}

/**
 * Build an iCCP PNG chunk from an ICC profile.
 * Returns the raw chunk data (without length/type/CRC framing).
 */
export function buildICCPChunkData(profile: ICCProfile): Uint8Array | null {
  if (!profile.data) return null

  const nameBytes = new TextEncoder().encode(profile.name)
  // iCCP: name + null + compression_method(0) + compressed_profile
  // For simplicity, we store uncompressed (compression method = 0 means zlib, but we'd need actual zlib)
  // This is a placeholder — real implementation would need zlib compression
  const result = new Uint8Array(nameBytes.length + 2 + profile.data.length)
  result.set(nameBytes, 0)
  result[nameBytes.length] = 0 // null terminator
  result[nameBytes.length + 1] = 0 // compression method = zlib
  result.set(profile.data, nameBytes.length + 2)
  return result
}

/**
 * Known ICC profile presets.
 */
export const ICC_PRESETS: Record<string, ICCProfile> = {
  sRGB: { name: 'sRGB IEC61966-2.1' },
  'Display P3': { name: 'Display P3' },
  'Adobe RGB': { name: 'Adobe RGB (1998)' },
}
