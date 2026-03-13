/**
 * ICC colour profile pipeline.
 *
 * Provides ICC v2/v4 header + tag table parsing, matrix-based profile
 * conversion for simple RGB profiles, and an active-profile store.
 *
 * The existing `@/io/icc-profile` module handles low-level binary header
 * parsing, PNG iCCP extraction, and preset names.  This module builds on
 * top of it by adding the actual colour-math pipeline: TRC curves,
 * matrix-based conversion, and multi-profile colour transforms.
 */

import { rgbToXyz, xyzToRgb } from './color-spaces'

// ─── Types ───────────────────────────────────────────────────

/** Rendering intent (ICC spec). */
export type RenderingIntent = 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric'

/** Parsed ICC profile with conversion data. */
export interface ICCProfileData {
  /** Human-readable description. */
  description: string
  /** ICC colour space of the profile (e.g. 'RGB', 'CMYK', 'Lab'). */
  colorSpace: string
  /** Profile Connection Space ('XYZ' or 'Lab'). */
  pcs: string
  /** Rendering intent. */
  renderingIntent: RenderingIntent
  /** Profile version (major). */
  version: number
  /** Device class (e.g. 'mntr', 'prtr', 'scnr'). */
  deviceClass: string

  // Matrix-based RGB profiles
  /** 3x3 linearisation matrix (column-major: Xr,Yr,Zr, Xg,Yg,Zg, Xb,Yb,Zb). */
  matrix?: number[]
  /** Inverse of the matrix (for PCS→device). */
  matrixInv?: number[]
  /** Tone Reproduction Curves (gamma values or 1D LUT per channel). */
  trc?: [number, number, number]

  /** Raw profile bytes (kept for re-embedding). */
  rawData?: Uint8Array
}

// ─── Parsing ─────────────────────────────────────────────────

const RENDERING_INTENTS: RenderingIntent[] = [
  'perceptual',
  'relative-colorimetric',
  'saturation',
  'absolute-colorimetric',
]

/**
 * Parse an ICC profile binary into an ICCProfileData structure.
 *
 * Supports ICC v2 and v4 headers and extracts the 3x3 colour matrix +
 * TRC gamma for simple matrix-based RGB profiles.
 */
export function parseICCProfileData(data: ArrayBuffer): ICCProfileData {
  const bytes = new Uint8Array(data)
  if (bytes.length < 128) throw new Error('ICC profile too short')

  const view = new DataView(data)

  // Version
  const versionMajor = bytes[8]!

  // Device class (bytes 12-15)
  const deviceClass = readTag(bytes, 12)
  // Colour space (bytes 16-19)
  const colorSpace = readTag(bytes, 16).trim()
  // PCS (bytes 20-23)
  const pcs = readTag(bytes, 20).trim()
  // Rendering intent (bytes 64-67)
  const intentIdx = view.getUint32(64) & 0x3
  const renderingIntent = RENDERING_INTENTS[intentIdx] ?? 'perceptual'

  // Tag table
  const tagCount = bytes.length >= 132 ? view.getUint32(128) : 0
  const tags = new Map<string, { offset: number; length: number }>()
  for (let i = 0; i < Math.min(tagCount, 100); i++) {
    const entryOff = 132 + i * 12
    if (entryOff + 12 > bytes.length) break
    const sig = readTag(bytes, entryOff)
    const offset = view.getUint32(entryOff + 4)
    const length = view.getUint32(entryOff + 8)
    tags.set(sig, { offset, length })
  }

  // Description
  let description = `ICC ${colorSpace} (${deviceClass})`
  const descTag = tags.get('desc')
  if (descTag && descTag.offset + 12 < bytes.length) {
    const off = descTag.offset + 8
    if (off + 4 <= bytes.length) {
      const asciiLen = view.getUint32(off)
      if (asciiLen > 0 && off + 4 + asciiLen <= bytes.length) {
        description = new TextDecoder('ascii').decode(bytes.slice(off + 4, off + 4 + asciiLen - 1))
      }
    }
  }

  // Matrix & TRC
  let matrix: number[] | undefined
  let matrixInv: number[] | undefined
  let trc: [number, number, number] | undefined

  if (colorSpace === 'RGB') {
    // Read rXYZ, gXYZ, bXYZ tags
    const rXYZ = readXYZTag(view, tags.get('rXYZ'))
    const gXYZ = readXYZTag(view, tags.get('gXYZ'))
    const bXYZ = readXYZTag(view, tags.get('bXYZ'))

    if (rXYZ && gXYZ && bXYZ) {
      matrix = [rXYZ[0], rXYZ[1], rXYZ[2], gXYZ[0], gXYZ[1], gXYZ[2], bXYZ[0], bXYZ[1], bXYZ[2]]
      matrixInv = invertMatrix3x3(matrix)
    }

    // Read TRC (gamma) tags
    const rTRC = readTRCGamma(view, bytes, tags.get('rTRC'))
    const gTRC = readTRCGamma(view, bytes, tags.get('gTRC'))
    const bTRC = readTRCGamma(view, bytes, tags.get('bTRC'))
    if (rTRC !== undefined && gTRC !== undefined && bTRC !== undefined) {
      trc = [rTRC, gTRC, bTRC]
    }
  }

  return {
    description,
    colorSpace,
    pcs,
    renderingIntent,
    version: versionMajor!,
    deviceClass,
    matrix,
    matrixInv,
    trc,
    rawData: bytes,
  }
}

// ─── Profile-based colour conversion ─────────────────────────

/**
 * Convert an sRGB colour through a source profile to a destination profile.
 *
 * For matrix-based RGB profiles the pipeline is:
 *   Device RGB → linearise (TRC) → multiply by source matrix → XYZ (PCS)
 *   → multiply by inverse dest matrix → apply dest inverse TRC → device RGB
 *
 * Falls back to a simple sRGB→XYZ→sRGB round-trip if profiles lack matrix data.
 */
export function convertWithProfile(
  rgb: [number, number, number],
  srcProfile: ICCProfileData | null,
  dstProfile: ICCProfileData | null,
): [number, number, number] {
  // Source profile → XYZ
  let xyz: [number, number, number]
  if (srcProfile?.matrix && srcProfile.trc) {
    const [r, g, b] = rgb
    const rl = applyTRC(r / 255, srcProfile.trc[0])
    const gl = applyTRC(g / 255, srcProfile.trc[1])
    const bl = applyTRC(b / 255, srcProfile.trc[2])
    const m = srcProfile.matrix
    xyz = [
      m[0]! * rl + m[3]! * gl + m[6]! * bl,
      m[1]! * rl + m[4]! * gl + m[7]! * bl,
      m[2]! * rl + m[5]! * gl + m[8]! * bl,
    ]
  } else {
    xyz = rgbToXyz(rgb[0], rgb[1], rgb[2])
  }

  // XYZ → destination profile
  if (dstProfile?.matrixInv && dstProfile.trc) {
    const mi = dstProfile.matrixInv
    const rl = mi[0]! * xyz[0] + mi[3]! * xyz[1] + mi[6]! * xyz[2]
    const gl = mi[1]! * xyz[0] + mi[4]! * xyz[1] + mi[7]! * xyz[2]
    const bl = mi[2]! * xyz[0] + mi[5]! * xyz[1] + mi[8]! * xyz[2]
    return [
      clamp255(applyInverseTRC(Math.max(0, rl), dstProfile.trc[0]) * 255),
      clamp255(applyInverseTRC(Math.max(0, gl), dstProfile.trc[1]) * 255),
      clamp255(applyInverseTRC(Math.max(0, bl), dstProfile.trc[2]) * 255),
    ]
  }

  return xyzToRgb(xyz[0], xyz[1], xyz[2])
}

// ─── Active profile store (singleton) ────────────────────────

export interface ActiveProfiles {
  /** The document's working colour space profile. */
  documentProfile: ICCProfileData | null
  /** The proof output device profile. */
  proofProfile: ICCProfileData | null
  /** The monitor / display profile. */
  monitorProfile: ICCProfileData | null
}

let _activeProfiles: ActiveProfiles = {
  documentProfile: null,
  proofProfile: null,
  monitorProfile: null,
}

export function getActiveProfiles(): ActiveProfiles {
  return _activeProfiles
}

export function setActiveProfiles(profiles: Partial<ActiveProfiles>): void {
  _activeProfiles = { ..._activeProfiles, ...profiles }
}

// ─── Built-in profile presets ────────────────────────────────

/** sRGB profile data (matrix + TRC = 2.2 gamma approximation). */
export const SRGB_PROFILE: ICCProfileData = {
  description: 'sRGB IEC61966-2.1',
  colorSpace: 'RGB',
  pcs: 'XYZ',
  renderingIntent: 'perceptual',
  version: 2,
  deviceClass: 'mntr',
  matrix: [0.4124564, 0.2126729, 0.0193339, 0.3575761, 0.7151522, 0.119192, 0.1804375, 0.072175, 0.9503041],
  matrixInv: invertMatrix3x3([
    0.4124564, 0.2126729, 0.0193339, 0.3575761, 0.7151522, 0.119192, 0.1804375, 0.072175, 0.9503041,
  ]),
  trc: [2.2, 2.2, 2.2],
}

/** Adobe RGB (1998) profile (wider gamut, gamma 2.2). */
export const ADOBE_RGB_PROFILE: ICCProfileData = {
  description: 'Adobe RGB (1998)',
  colorSpace: 'RGB',
  pcs: 'XYZ',
  renderingIntent: 'relative-colorimetric',
  version: 2,
  deviceClass: 'mntr',
  matrix: [0.5767309, 0.297361, 0.0270328, 0.185554, 0.627355, 0.0706879, 0.1881852, 0.075284, 0.9911085],
  matrixInv: invertMatrix3x3([
    0.5767309, 0.297361, 0.0270328, 0.185554, 0.627355, 0.0706879, 0.1881852, 0.075284, 0.9911085,
  ]),
  trc: [2.2, 2.2, 2.2],
}

// ─── Helpers ─────────────────────────────────────────────────

function readTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
}

function readXYZTag(
  view: DataView,
  tag: { offset: number; length: number } | undefined,
): [number, number, number] | null {
  if (!tag || tag.length < 20) return null
  const off = tag.offset
  if (off + 20 > view.byteLength) return null
  // XYZ type: 'XYZ ' (4) + reserved (4) + 3 x s15Fixed16Number (4 each)
  const x = view.getInt32(off + 8) / 65536
  const y = view.getInt32(off + 12) / 65536
  const z = view.getInt32(off + 16) / 65536
  return [x, y, z]
}

function readTRCGamma(
  view: DataView,
  _bytes: Uint8Array,
  tag: { offset: number; length: number } | undefined,
): number | undefined {
  if (!tag || tag.length < 12) return undefined
  const off = tag.offset
  if (off + 12 > view.byteLength) return undefined
  // curv type: 'curv' (4) + reserved (4) + count (4) + data
  const count = view.getUint32(off + 8)
  if (count === 0) return 1.0 // identity
  if (count === 1) {
    // Single gamma value: u8Fixed8Number at off+12
    return view.getUint16(off + 12) / 256
  }
  // Multi-point curve — approximate as 2.2 for now
  return 2.2
}

/** Apply a gamma TRC: linearise a 0-1 value. */
function applyTRC(v: number, gamma: number): number {
  return Math.pow(Math.max(0, v), gamma)
}

/** Apply the inverse TRC: de-linearise a 0-1 value. */
function applyInverseTRC(v: number, gamma: number): number {
  return Math.pow(Math.max(0, v), 1 / gamma)
}

/** Invert a column-major 3x3 matrix. Returns null on singular matrices. */
function invertMatrix3x3(m: number[]): number[] | undefined {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number]
  const det = a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e)
  if (Math.abs(det) < 1e-12) return undefined
  const invDet = 1 / det
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ]
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}
