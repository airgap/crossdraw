/**
 * RAW camera format import.
 *
 * Provides basic RAW file detection, embedded JPEG preview extraction,
 * and import via browser image decoding or TIFF-based container parsing.
 *
 * Supported formats: CR2 (Canon), NEF (Nikon), ARW (Sony), DNG (Adobe),
 * ORF (Olympus), RW2 (Panasonic), RAF (Fujifilm), PEF (Pentax).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface RAWImportSettings {
  /** Use embedded JPEG preview instead of full decode. Much faster but lower quality. */
  usePreview: boolean
  /** White balance preset. */
  whiteBalance: 'auto' | 'daylight' | 'tungsten' | 'fluorescent'
}

export const DEFAULT_RAW_SETTINGS: RAWImportSettings = {
  usePreview: false,
  whiteBalance: 'auto',
}

/** Known RAW format descriptors. */
interface RAWFormat {
  name: string
  /** Check if data matches this format. */
  detect: (view: DataView, bytes: Uint8Array) => boolean
}

// ── Detection ────────────────────────────────────────────────────────────────

const RAW_FORMATS: RAWFormat[] = [
  {
    // DNG: TIFF-based with DNGVersion tag — also check for 'DNG' in first 64 bytes
    name: 'DNG',
    detect: (view: DataView, _bytes: Uint8Array) => {
      // TIFF header (II or MM) + magic 42
      const bo = view.getUint16(0)
      if (bo !== 0x4949 && bo !== 0x4d4d) return false
      const le = bo === 0x4949
      const magic = le ? view.getUint16(2, true) : view.getUint16(2, false)
      if (magic !== 42) return false
      // Check for DNG-specific data further in (heuristic)
      const header = new TextDecoder('ascii').decode(_bytes.slice(0, 256))
      return header.includes('DNG') || header.includes('dng')
    },
  },
  {
    // CR2: Canon RAW v2 — TIFF-based with 'CR' at offset 8
    name: 'CR2',
    detect: (view: DataView, _bytes: Uint8Array) => {
      const bo = view.getUint16(0)
      if (bo !== 0x4949 && bo !== 0x4d4d) return false
      // CR2 has 'CR' at byte 8 and version 2.0 at byte 10
      if (_bytes.length < 12) return false
      return _bytes[8] === 0x43 && _bytes[9] === 0x52 // 'C', 'R'
    },
  },
  {
    // NEF: Nikon — TIFF-based, detect by checking for Nikon maker note patterns
    name: 'NEF',
    detect: (_view: DataView, bytes: Uint8Array) => {
      const bo = _view.getUint16(0)
      if (bo !== 0x4949 && bo !== 0x4d4d) return false
      const header = new TextDecoder('ascii').decode(bytes.slice(0, 256))
      return header.includes('Nikon') || header.includes('NIKON')
    },
  },
  {
    // ARW: Sony — TIFF-based
    name: 'ARW',
    detect: (_view: DataView, bytes: Uint8Array) => {
      const bo = _view.getUint16(0)
      if (bo !== 0x4949 && bo !== 0x4d4d) return false
      const header = new TextDecoder('ascii').decode(bytes.slice(0, 512))
      return header.includes('SONY') || header.includes('Sony')
    },
  },
  {
    // RAF: Fujifilm — starts with 'FUJIFILMCCD-RAW'
    name: 'RAF',
    detect: (_view: DataView, bytes: Uint8Array) => {
      if (bytes.length < 16) return false
      const magic = new TextDecoder('ascii').decode(bytes.slice(0, 16))
      return magic.startsWith('FUJIFILMCCD-RAW')
    },
  },
  {
    // ORF: Olympus — TIFF-based with specific byte order marks
    name: 'ORF',
    detect: (view: DataView, _bytes: Uint8Array) => {
      // Olympus uses 'IIRO' (0x4949, 0x524F) or 'MMOR' (0x4D4D, 0x4F52)
      const bo = view.getUint16(0)
      if (bo === 0x4949) {
        return view.getUint16(2, true) === 0x524f
      }
      if (bo === 0x4d4d) {
        return view.getUint16(2, false) === 0x4f52
      }
      return false
    },
  },
  {
    // RW2: Panasonic — TIFF-based with specific magic
    name: 'RW2',
    detect: (view: DataView) => {
      const bo = view.getUint16(0)
      if (bo !== 0x4949) return false
      return view.getUint16(2, true) === 0x0055
    },
  },
  {
    // PEF: Pentax — TIFF-based
    name: 'PEF',
    detect: (_view: DataView, bytes: Uint8Array) => {
      const bo = _view.getUint16(0)
      if (bo !== 0x4949 && bo !== 0x4d4d) return false
      const header = new TextDecoder('ascii').decode(bytes.slice(0, 512))
      return header.includes('PENTAX') || header.includes('Pentax')
    },
  },
]

/**
 * Detect whether the data is a known RAW camera format.
 */
export function isRAWFile(data: ArrayBuffer): boolean {
  if (data.byteLength < 16) return false
  const view = new DataView(data, 0, Math.min(data.byteLength, 512))
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 512))
  return RAW_FORMATS.some((fmt) => fmt.detect(view, bytes))
}

/**
 * Get the detected RAW format name, or null if not recognized.
 */
export function detectRAWFormat(data: ArrayBuffer): string | null {
  if (data.byteLength < 16) return null
  const view = new DataView(data, 0, Math.min(data.byteLength, 512))
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 512))
  for (const fmt of RAW_FORMATS) {
    if (fmt.detect(view, bytes)) return fmt.name
  }
  return null
}

// ── JPEG preview extraction ──────────────────────────────────────────────────

/**
 * Extract embedded JPEG thumbnail from a RAW file.
 *
 * Most RAW formats embed a full-size JPEG preview. We scan for the JPEG
 * SOI marker (0xFF 0xD8) and EOI marker (0xFF 0xD9) to extract it.
 */
export function extractRAWPreview(data: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(data)

  // Find the first JPEG SOI (0xFFD8) — skip the very first bytes
  // since TIFF headers can coincidentally have similar values
  let jpegStart = -1
  for (let i = 12; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8) {
      jpegStart = i
      break
    }
  }
  if (jpegStart === -1) {
    throw new Error('No embedded JPEG preview found in RAW file')
  }

  // Find the corresponding JPEG EOI (0xFFD9)
  let jpegEnd = -1
  for (let i = jpegStart + 2; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      jpegEnd = i + 2
      break
    }
  }
  if (jpegEnd === -1) {
    // If no EOI found, take everything from SOI to end
    jpegEnd = bytes.length
  }

  return bytes.slice(jpegStart, jpegEnd)
}

// ── White balance multipliers ────────────────────────────────────────────────

const WB_MULTIPLIERS: Record<string, [number, number, number]> = {
  auto: [1.0, 1.0, 1.0], // no adjustment
  daylight: [1.0, 1.0, 0.95], // slightly warm
  tungsten: [0.85, 0.92, 1.15], // cool down warm tungsten light
  fluorescent: [0.92, 1.0, 1.05], // slight green correction
}

/**
 * Apply white balance correction to image data in-place.
 */
function applyWhiteBalance(imageData: ImageData, preset: RAWImportSettings['whiteBalance']): void {
  if (preset === 'auto') return // no-op for auto

  const [rMul, gMul, bMul] = WB_MULTIPLIERS[preset] ?? WB_MULTIPLIERS.auto!
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.round(d[i]! * rMul))
    d[i + 1] = Math.min(255, Math.round(d[i + 1]! * gMul))
    d[i + 2] = Math.min(255, Math.round(d[i + 2]! * bMul))
    // alpha unchanged
  }
}

// ── Main import ──────────────────────────────────────────────────────────────

/**
 * Import a RAW camera file and return ImageData.
 *
 * Strategy:
 * 1. If `usePreview` is set, extract and decode the embedded JPEG preview.
 * 2. Otherwise, try to decode the raw data via `createImageBitmap` (works
 *    if the browser/runtime supports the format natively).
 * 3. As fallback, extract the embedded JPEG preview.
 *
 * White balance correction is applied after decoding.
 */
export async function importRAW(
  data: ArrayBuffer,
  settings: RAWImportSettings = DEFAULT_RAW_SETTINGS,
): Promise<ImageData> {
  let imageData: ImageData

  if (settings.usePreview) {
    imageData = await decodePreview(data)
  } else {
    // Try native decode first
    try {
      const blob = new Blob([data])
      const bitmap = await createImageBitmap(blob)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      bitmap.close()
    } catch {
      // Fallback to embedded preview
      imageData = await decodePreview(data)
    }
  }

  // Apply white balance
  applyWhiteBalance(imageData, settings.whiteBalance)

  return imageData
}

/**
 * Decode the embedded JPEG preview from a RAW file.
 */
async function decodePreview(data: ArrayBuffer): Promise<ImageData> {
  const jpegBytes = extractRAWPreview(data)
  const blob = new Blob([jpegBytes.buffer as ArrayBuffer], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()
  return imageData
}
