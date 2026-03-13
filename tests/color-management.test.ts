import { describe, it, expect } from 'bun:test'

// ── Color spaces ─────────────────────────────────────────────

import {
  rgbToCmyk,
  cmykToRgb,
  rgbToXyz,
  xyzToRgb,
  xyzToLab,
  labToXyz,
  rgbToLab,
  labToRgb,
  deltaE76,
  rgbToHsl,
  hslToRgb,
  hexToRgb,
  rgbToHex,
} from '@/color/color-spaces'

// ── CMYK mode ────────────────────────────────────────────────

import {
  hexToCMYK,
  cmykToHex,
  convertDocumentToCMYK,
  convertDocumentToRGB,
  cmykSliders,
  applyCMYKSliderChange,
} from '@/color/cmyk-mode'
import type { CMYKColor } from '@/color/cmyk-mode'

// ── ICC profile ──────────────────────────────────────────────

import {
  parseICCProfileData,
  convertWithProfile,
  getActiveProfiles,
  setActiveProfiles,
  SRGB_PROFILE,
  ADOBE_RGB_PROFILE,
} from '@/color/icc-profile'
// ── Soft proofing ────────────────────────────────────────────

import {
  applySoftProof,
  computeGamutWarning,
  applyGamutWarningOverlay,
  defaultSoftProofSettings,
} from '@/color/soft-proof'

// ── Spot colours ─────────────────────────────────────────────

import {
  PANTONE_COATED,
  findClosestSpotColor,
  searchSpotColors,
  findSpotColorsInRange,
  createSpotSwatch,
  tintedSpotRgb,
} from '@/color/spot-colors'

import type { DesignDocument } from '@/types'

// ── ImageData polyfill ───────────────────────────────────────

function makeImageData(w: number, h: number, fill?: [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0]
      data[i + 1] = fill[1]
      data[i + 2] = fill[2]
      data[i + 3] = fill[3]
    }
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData
}

// ══════════════════════════════════════════════════════════════
// Color space conversions
// ══════════════════════════════════════════════════════════════

describe('Color space conversions', () => {
  // ── RGB ↔ CMYK ───────────────────────────────────────────

  describe('rgbToCmyk / cmykToRgb', () => {
    it('should convert pure red', () => {
      const [c, m, y, k] = rgbToCmyk(255, 0, 0)
      expect(c).toBeCloseTo(0, 2)
      expect(m).toBeCloseTo(1, 2)
      expect(y).toBeCloseTo(1, 2)
      expect(k).toBeCloseTo(0, 2)
    })

    it('should convert pure green', () => {
      const [c, m, y, k] = rgbToCmyk(0, 255, 0)
      expect(c).toBeCloseTo(1, 2)
      expect(m).toBeCloseTo(0, 2)
      expect(y).toBeCloseTo(1, 2)
      expect(k).toBeCloseTo(0, 2)
    })

    it('should convert pure blue', () => {
      const [c, m, y, k] = rgbToCmyk(0, 0, 255)
      expect(c).toBeCloseTo(1, 2)
      expect(m).toBeCloseTo(1, 2)
      expect(y).toBeCloseTo(0, 2)
      expect(k).toBeCloseTo(0, 2)
    })

    it('should convert black', () => {
      const [c, m, y, k] = rgbToCmyk(0, 0, 0)
      expect(c).toBe(0)
      expect(m).toBe(0)
      expect(y).toBe(0)
      expect(k).toBe(1)
    })

    it('should convert white', () => {
      const [c, m, y, k] = rgbToCmyk(255, 255, 255)
      expect(c).toBeCloseTo(0, 2)
      expect(m).toBeCloseTo(0, 2)
      expect(y).toBeCloseTo(0, 2)
      expect(k).toBeCloseTo(0, 2)
    })

    it('should round-trip primary colours', () => {
      for (const [r, g, b] of [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
        [0, 255, 255],
        [255, 0, 255],
        [255, 255, 255],
        [0, 0, 0],
      ] as [number, number, number][]) {
        const cmyk = rgbToCmyk(r, g, b)
        const [r2, g2, b2] = cmykToRgb(...cmyk)
        expect(r2).toBe(r)
        expect(g2).toBe(g)
        expect(b2).toBe(b)
      }
    })

    it('should handle mid-grey', () => {
      const [c, m, y, k] = rgbToCmyk(128, 128, 128)
      expect(c).toBeCloseTo(0, 1)
      expect(m).toBeCloseTo(0, 1)
      expect(y).toBeCloseTo(0, 1)
      expect(k).toBeCloseTo(0.498, 1)
    })

    it('should clamp output of cmykToRgb', () => {
      const [r, g, b] = cmykToRgb(0, 0, 0, 0)
      expect(r).toBe(255)
      expect(g).toBe(255)
      expect(b).toBe(255)
    })
  })

  // ── RGB ↔ XYZ ────────────────────────────────────────────

  describe('rgbToXyz / xyzToRgb', () => {
    it('should convert white to D65 white point', () => {
      const [x, y, z] = rgbToXyz(255, 255, 255)
      expect(x).toBeCloseTo(0.9505, 2)
      expect(y).toBeCloseTo(1.0, 2)
      expect(z).toBeCloseTo(1.089, 2)
    })

    it('should convert black to (0,0,0)', () => {
      const [x, y, z] = rgbToXyz(0, 0, 0)
      expect(x).toBeCloseTo(0, 4)
      expect(y).toBeCloseTo(0, 4)
      expect(z).toBeCloseTo(0, 4)
    })

    it('should round-trip sRGB white', () => {
      const xyz = rgbToXyz(255, 255, 255)
      const [r, g, b] = xyzToRgb(...xyz)
      expect(r).toBe(255)
      expect(g).toBe(255)
      expect(b).toBe(255)
    })

    it('should round-trip sRGB primary colours', () => {
      for (const [r, g, b] of [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ] as [number, number, number][]) {
        const xyz = rgbToXyz(r, g, b)
        const [r2, g2, b2] = xyzToRgb(...xyz)
        expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1)
      }
    })

    it('should handle mid-grey', () => {
      const [_x, y, _z] = rgbToXyz(128, 128, 128)
      // Mid-grey luminance is around 0.216
      expect(y).toBeGreaterThan(0.2)
      expect(y).toBeLessThan(0.25)
    })
  })

  // ── XYZ ↔ Lab ────────────────────────────────────────────

  describe('xyzToLab / labToXyz', () => {
    it('should convert D65 white to L=100, a=0, b=0', () => {
      const [L, a, b] = xyzToLab(0.95047, 1.0, 1.08883)
      expect(L).toBeCloseTo(100, 1)
      expect(Math.abs(a)).toBeLessThan(0.01)
      expect(Math.abs(b)).toBeLessThan(0.01)
    })

    it('should convert black to L=0, a=0, b=0', () => {
      const [L, a, b] = xyzToLab(0, 0, 0)
      expect(L).toBeCloseTo(0, 1)
      expect(a).toBeCloseTo(0, 1)
      expect(b).toBeCloseTo(0, 1)
    })

    it('should round-trip XYZ→Lab→XYZ', () => {
      const xyz: [number, number, number] = [0.4, 0.3, 0.5]
      const lab = xyzToLab(...xyz)
      const [x2, y2, z2] = labToXyz(...lab)
      expect(x2).toBeCloseTo(xyz[0], 3)
      expect(y2).toBeCloseTo(xyz[1], 3)
      expect(z2).toBeCloseTo(xyz[2], 3)
    })
  })

  // ── RGB ↔ Lab ────────────────────────────────────────────

  describe('rgbToLab / labToRgb', () => {
    it('should convert white to L≈100', () => {
      const [L] = rgbToLab(255, 255, 255)
      expect(L).toBeCloseTo(100, 0)
    })

    it('should convert black to L≈0', () => {
      const [L] = rgbToLab(0, 0, 0)
      expect(L).toBeCloseTo(0, 0)
    })

    it('should have positive a* for red', () => {
      const [, a] = rgbToLab(255, 0, 0)
      expect(a).toBeGreaterThan(50)
    })

    it('should have negative a* for green', () => {
      const [, a] = rgbToLab(0, 255, 0)
      expect(a).toBeLessThan(-50)
    })

    it('should round-trip common colours within tolerance', () => {
      const colours = [
        [200, 100, 50],
        [50, 150, 200],
        [128, 128, 128],
        [10, 10, 10],
        [245, 245, 245],
      ] as [number, number, number][]

      for (const [r, g, b] of colours) {
        const lab = rgbToLab(r, g, b)
        const [r2, g2, b2] = labToRgb(...lab)
        expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1)
      }
    })
  })

  // ── Delta E ───────────────────────────────────────────────

  describe('deltaE76', () => {
    it('should return 0 for identical colours', () => {
      expect(deltaE76(50, 20, -30, 50, 20, -30)).toBe(0)
    })

    it('should return correct distance for simple difference', () => {
      // Only L differs by 10
      expect(deltaE76(50, 0, 0, 60, 0, 0)).toBeCloseTo(10, 5)
    })

    it('should be symmetric', () => {
      const d1 = deltaE76(50, 20, -30, 70, -10, 40)
      const d2 = deltaE76(70, -10, 40, 50, 20, -30)
      expect(d1).toBeCloseTo(d2, 10)
    })

    it('should detect perceptually different colours', () => {
      // ΔE > 2.3 is a "just noticeable difference"
      const [L1, a1, b1] = rgbToLab(255, 0, 0)
      const [L2, a2, b2] = rgbToLab(0, 0, 255)
      expect(deltaE76(L1, a1, b1, L2, a2, b2)).toBeGreaterThan(50)
    })
  })

  // ── RGB ↔ HSL ────────────────────────────────────────────

  describe('rgbToHsl / hslToRgb', () => {
    it('should convert red to h=0, s=1, l=0.5', () => {
      const [h, s, l] = rgbToHsl(255, 0, 0)
      expect(h).toBeCloseTo(0, 0)
      expect(s).toBeCloseTo(1, 2)
      expect(l).toBeCloseTo(0.5, 2)
    })

    it('should convert white to l=1', () => {
      const [_h, _s, l] = rgbToHsl(255, 255, 255)
      expect(l).toBeCloseTo(1, 2)
    })

    it('should convert black to l=0', () => {
      const [_h, _s, l] = rgbToHsl(0, 0, 0)
      expect(l).toBeCloseTo(0, 2)
    })

    it('should round-trip common colours', () => {
      for (const [r, g, b] of [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [128, 64, 192],
      ] as [number, number, number][]) {
        const hsl = rgbToHsl(r, g, b)
        const [r2, g2, b2] = hslToRgb(...hsl)
        expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1)
        expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1)
        expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1)
      }
    })

    it('should handle achromatic (grey)', () => {
      const [_h, s, l] = rgbToHsl(128, 128, 128)
      expect(s).toBe(0)
      expect(l).toBeCloseTo(128 / 255, 2)
    })
  })

  // ── Hex ───────────────────────────────────────────────────

  describe('hexToRgb / rgbToHex', () => {
    it('should parse 6-digit hex', () => {
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
      expect(hexToRgb('#00ff00')).toEqual([0, 255, 0])
      expect(hexToRgb('#0000ff')).toEqual([0, 0, 255])
    })

    it('should parse 3-digit hex', () => {
      expect(hexToRgb('#f00')).toEqual([255, 0, 0])
    })

    it('should handle no hash prefix', () => {
      expect(hexToRgb('ff8040')).toEqual([255, 128, 64])
    })

    it('should produce lowercase hex', () => {
      expect(rgbToHex(255, 128, 64)).toBe('#ff8040')
    })

    it('should round-trip', () => {
      const hex = '#3a7fbc'
      const rgb = hexToRgb(hex)
      expect(rgbToHex(...rgb)).toBe(hex)
    })
  })
})

// ══════════════════════════════════════════════════════════════
// CMYK editing mode
// ══════════════════════════════════════════════════════════════

describe('CMYK mode', () => {
  describe('hexToCMYK / cmykToHex', () => {
    it('should convert red hex to CMYK', () => {
      const cmyk = hexToCMYK('#ff0000')
      expect(cmyk.c).toBe(0)
      expect(cmyk.m).toBe(100)
      expect(cmyk.y).toBe(100)
      expect(cmyk.k).toBe(0)
    })

    it('should convert black hex', () => {
      const cmyk = hexToCMYK('#000000')
      expect(cmyk.k).toBe(100)
    })

    it('should round-trip via cmykToHex', () => {
      const cmyk: CMYKColor = { c: 0, m: 100, y: 100, k: 0 }
      expect(cmykToHex(cmyk)).toBe('#ff0000')
    })
  })

  describe('cmykSliders', () => {
    it('should return 4 sliders', () => {
      const sliders = cmykSliders('#ff0000')
      expect(sliders).toHaveLength(4)
      expect(sliders.map((s) => s.channel)).toEqual(['c', 'm', 'y', 'k'])
    })
  })

  describe('applyCMYKSliderChange', () => {
    it('should change a single CMYK channel', () => {
      const result = applyCMYKSliderChange('#ff0000', 'k', 50)
      // Adding 50% K to pure red should darken it
      const cmyk = hexToCMYK(result)
      expect(cmyk.k).toBe(50)
    })

    it('should clamp values to 0-100', () => {
      // Start with a colour where C is already 50
      const base = cmykToHex({ c: 50, m: 0, y: 0, k: 0 })
      const result = applyCMYKSliderChange(base, 'c', 150)
      // 150 is clamped to 100 — same as setting C=100 explicitly
      const expected = cmykToHex({ c: 100, m: 0, y: 0, k: 0 })
      expect(result).toBe(expected)
    })
  })

  describe('convertDocumentToCMYK', () => {
    it('should round-trip document colours through CMYK', () => {
      const doc: DesignDocument = {
        id: 'test',
        metadata: {
          title: 'Test',
          author: 'test',
          created: '',
          modified: '',
          colorspace: 'srgb',
          width: 100,
          height: 100,
        },
        artboards: [
          {
            id: 'ab1',
            name: 'Artboard 1',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            backgroundColor: '#ff0000',
            layers: [
              {
                type: 'vector',
                id: 'v1',
                name: 'Vector',
                visible: true,
                locked: false,
                opacity: 1,
                blendMode: 'normal',
                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                paths: [],
                fill: { type: 'solid', color: '#00ff00', opacity: 1 },
                stroke: {
                  width: 1,
                  color: '#0000ff',
                  opacity: 1,
                  position: 'center',
                  linecap: 'butt',
                  linejoin: 'miter',
                  miterLimit: 4,
                },
              },
            ],
          },
        ],
        assets: { gradients: [], patterns: [], colors: [] },
      }

      const cmykDoc = convertDocumentToCMYK(doc)
      // Primary colours survive CMYK round-trip
      expect(cmykDoc.artboards[0]!.backgroundColor).toBe('#ff0000')
      expect((cmykDoc.artboards[0]!.layers[0]! as { fill: { color: string } }).fill.color).toBe('#00ff00')
    })

    it('should not mutate the original document', () => {
      const doc: DesignDocument = {
        id: 'test',
        metadata: { title: 'T', author: '', created: '', modified: '', colorspace: 'srgb', width: 100, height: 100 },
        artboards: [
          {
            id: 'a',
            name: 'A',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            backgroundColor: '#ff8040',
            layers: [],
          },
        ],
        assets: { gradients: [], patterns: [], colors: [] },
      }

      const original = doc.artboards[0]!.backgroundColor
      convertDocumentToCMYK(doc)
      expect(doc.artboards[0]!.backgroundColor).toBe(original)
    })
  })

  describe('convertDocumentToRGB', () => {
    it('should return a deep clone', () => {
      const doc: DesignDocument = {
        id: 'test',
        metadata: { title: 'T', author: '', created: '', modified: '', colorspace: 'srgb', width: 100, height: 100 },
        artboards: [
          { id: 'a', name: 'A', x: 0, y: 0, width: 100, height: 100, backgroundColor: '#ffffff', layers: [] },
        ],
        assets: { gradients: [], patterns: [], colors: [] },
      }
      const rgb = convertDocumentToRGB(doc)
      expect(rgb).not.toBe(doc)
      expect(rgb.artboards[0]!.backgroundColor).toBe('#ffffff')
    })
  })
})

// ══════════════════════════════════════════════════════════════
// ICC profile pipeline
// ══════════════════════════════════════════════════════════════

describe('ICC profile pipeline', () => {
  describe('parseICCProfileData', () => {
    it('should throw on short data', () => {
      expect(() => parseICCProfileData(new ArrayBuffer(50))).toThrow('ICC profile too short')
    })

    it('should parse device class and color space', () => {
      const buf = new ArrayBuffer(136)
      const bytes = new Uint8Array(buf)
      // Version
      bytes[8] = 4
      // Device class 'mntr'
      const dc = 'mntr'
      for (let i = 0; i < 4; i++) bytes[12 + i] = dc.charCodeAt(i)
      // Color space 'RGB '
      const cs = 'RGB '
      for (let i = 0; i < 4; i++) bytes[16 + i] = cs.charCodeAt(i)
      // PCS 'XYZ '
      const pcs = 'XYZ '
      for (let i = 0; i < 4; i++) bytes[20 + i] = pcs.charCodeAt(i)

      const profile = parseICCProfileData(buf)
      expect(profile.colorSpace).toBe('RGB')
      expect(profile.pcs).toBe('XYZ')
      expect(profile.deviceClass).toBe('mntr')
      expect(profile.version).toBe(4)
    })

    it('should default rendering intent to perceptual', () => {
      const buf = new ArrayBuffer(136)
      const profile = parseICCProfileData(buf)
      expect(profile.renderingIntent).toBe('perceptual')
    })
  })

  describe('convertWithProfile', () => {
    it('should return sRGB values when both profiles are null', () => {
      const [r, g, b] = convertWithProfile([128, 64, 32], null, null)
      // Should round-trip through XYZ
      expect(Math.abs(r - 128)).toBeLessThanOrEqual(1)
      expect(Math.abs(g - 64)).toBeLessThanOrEqual(1)
      expect(Math.abs(b - 32)).toBeLessThanOrEqual(1)
    })

    it('should convert using sRGB profile data', () => {
      const [r, g, b] = convertWithProfile([200, 100, 50], SRGB_PROFILE, SRGB_PROFILE)
      // sRGB→sRGB should be near-identity (slight differences due to gamma 2.2 vs exact sRGB curve)
      expect(Math.abs(r - 200)).toBeLessThan(10)
      expect(Math.abs(g - 100)).toBeLessThan(10)
      expect(Math.abs(b - 50)).toBeLessThan(10)
    })

    it('should shift colours when converting sRGB → Adobe RGB', () => {
      // Adobe RGB has a wider gamut, so colours should shift
      const [r1, g1, b1] = convertWithProfile([200, 100, 50], SRGB_PROFILE, ADOBE_RGB_PROFILE)
      const [r2, g2, b2] = convertWithProfile([200, 100, 50], SRGB_PROFILE, SRGB_PROFILE)
      // At least one channel should differ noticeably
      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)
      expect(diff).toBeGreaterThan(0)
    })

    it('should handle white correctly', () => {
      const [r, g, b] = convertWithProfile([255, 255, 255], SRGB_PROFILE, SRGB_PROFILE)
      expect(r).toBeGreaterThan(250)
      expect(g).toBeGreaterThan(250)
      expect(b).toBeGreaterThan(250)
    })

    it('should handle black correctly', () => {
      const [r, g, b] = convertWithProfile([0, 0, 0], SRGB_PROFILE, SRGB_PROFILE)
      expect(r).toBe(0)
      expect(g).toBe(0)
      expect(b).toBe(0)
    })
  })

  describe('active profiles store', () => {
    it('should start with null profiles', () => {
      setActiveProfiles({ documentProfile: null, proofProfile: null, monitorProfile: null })
      const p = getActiveProfiles()
      expect(p.documentProfile).toBeNull()
      expect(p.proofProfile).toBeNull()
      expect(p.monitorProfile).toBeNull()
    })

    it('should update profiles partially', () => {
      setActiveProfiles({ documentProfile: SRGB_PROFILE })
      const p = getActiveProfiles()
      expect(p.documentProfile).toBe(SRGB_PROFILE)
      expect(p.proofProfile).toBeNull()
    })

    it('should update all profiles', () => {
      setActiveProfiles({
        documentProfile: SRGB_PROFILE,
        proofProfile: ADOBE_RGB_PROFILE,
        monitorProfile: SRGB_PROFILE,
      })
      const p = getActiveProfiles()
      expect(p.documentProfile).toBe(SRGB_PROFILE)
      expect(p.proofProfile).toBe(ADOBE_RGB_PROFILE)
      expect(p.monitorProfile).toBe(SRGB_PROFILE)
    })
  })

  describe('built-in profile presets', () => {
    it('sRGB profile should have matrix and TRC', () => {
      expect(SRGB_PROFILE.matrix).toBeDefined()
      expect(SRGB_PROFILE.matrix).toHaveLength(9)
      expect(SRGB_PROFILE.trc).toBeDefined()
      expect(SRGB_PROFILE.trc).toHaveLength(3)
    })

    it('Adobe RGB profile should have matrix and TRC', () => {
      expect(ADOBE_RGB_PROFILE.matrix).toBeDefined()
      expect(ADOBE_RGB_PROFILE.matrix).toHaveLength(9)
      expect(ADOBE_RGB_PROFILE.trc).toBeDefined()
    })

    it('profiles should have inverse matrices', () => {
      expect(SRGB_PROFILE.matrixInv).toBeDefined()
      expect(SRGB_PROFILE.matrixInv).toHaveLength(9)
      expect(ADOBE_RGB_PROFILE.matrixInv).toBeDefined()
    })
  })
})

// ══════════════════════════════════════════════════════════════
// Soft proofing
// ══════════════════════════════════════════════════════════════

describe('Soft proofing', () => {
  describe('defaultSoftProofSettings', () => {
    it('should return sensible defaults', () => {
      const s = defaultSoftProofSettings()
      expect(s.enabled).toBe(false)
      expect(s.profile).toBeNull()
      expect(s.renderingIntent).toBe('relative-colorimetric')
      expect(s.simulatePaperColor).toBe(false)
      expect(s.gamutWarning).toBe(false)
      expect(s.gamutWarningColor).toBe('#ff00ff')
    })
  })

  describe('applySoftProof', () => {
    it('should return original imageData when profile is null', () => {
      const img = makeImageData(2, 2, [128, 64, 32, 255])
      const settings = { ...defaultSoftProofSettings(), enabled: true }
      const result = applySoftProof(img, settings)
      expect(result).toBe(img) // identity — no profile
    })

    it('should produce a new ImageData when profile is set', () => {
      setActiveProfiles({ documentProfile: SRGB_PROFILE, monitorProfile: SRGB_PROFILE })
      const img = makeImageData(2, 2, [200, 100, 50, 255])
      const settings = {
        ...defaultSoftProofSettings(),
        enabled: true,
        profile: ADOBE_RGB_PROFILE,
      }
      const result = applySoftProof(img, settings)
      expect(result).not.toBe(img)
      expect(result.width).toBe(2)
      expect(result.height).toBe(2)
    })

    it('should preserve alpha', () => {
      setActiveProfiles({ documentProfile: SRGB_PROFILE, monitorProfile: SRGB_PROFILE })
      const img = makeImageData(1, 1, [200, 100, 50, 128])
      const settings = {
        ...defaultSoftProofSettings(),
        enabled: true,
        profile: ADOBE_RGB_PROFILE,
      }
      const result = applySoftProof(img, settings)
      expect(result.data[3]).toBe(128)
    })
  })

  describe('computeGamutWarning', () => {
    it('should return a mask of correct length', () => {
      setActiveProfiles({ documentProfile: SRGB_PROFILE })
      const img = makeImageData(4, 4, [128, 128, 128, 255])
      const mask = computeGamutWarning(img, SRGB_PROFILE)
      expect(mask.length).toBe(16)
    })

    it('should mark in-gamut neutrals as 0', () => {
      setActiveProfiles({ documentProfile: SRGB_PROFILE })
      const img = makeImageData(1, 1, [128, 128, 128, 255])
      const mask = computeGamutWarning(img, SRGB_PROFILE)
      expect(mask[0]).toBe(0) // grey is always in gamut
    })
  })

  describe('applyGamutWarningOverlay', () => {
    it('should replace flagged pixels with warning colour', () => {
      const img = makeImageData(2, 1, [100, 100, 100, 255])
      const mask = new Uint8Array([1, 0])
      applyGamutWarningOverlay(img, mask, '#ff00ff')
      // First pixel replaced
      expect(img.data[0]).toBe(255)
      expect(img.data[1]).toBe(0)
      expect(img.data[2]).toBe(255)
      // Second pixel unchanged
      expect(img.data[4]).toBe(100)
      expect(img.data[5]).toBe(100)
      expect(img.data[6]).toBe(100)
    })

    it('should preserve alpha on replaced pixels', () => {
      const img = makeImageData(1, 1, [100, 100, 100, 128])
      const mask = new Uint8Array([1])
      applyGamutWarningOverlay(img, mask, '#ff0000')
      expect(img.data[3]).toBe(128)
    })
  })
})

// ══════════════════════════════════════════════════════════════
// Spot colours
// ══════════════════════════════════════════════════════════════

describe('Spot colours', () => {
  describe('PANTONE_COATED library', () => {
    it('should have at least 150 colours', () => {
      expect(PANTONE_COATED.length).toBeGreaterThanOrEqual(150)
    })

    it('every colour should have valid fields', () => {
      for (const c of PANTONE_COATED) {
        expect(c.name.length).toBeGreaterThan(0)
        expect(c.rgb).toHaveLength(3)
        expect(c.cmyk).toHaveLength(4)
        expect(c.lab).toHaveLength(3)
        expect(c.library).toBe('PANTONE+ Coated')

        // RGB in range
        for (const v of c.rgb) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(255)
        }

        // CMYK in range (0-1)
        for (const v of c.cmyk) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }

        // Lab L in range
        expect(c.lab[0]).toBeGreaterThanOrEqual(0)
        expect(c.lab[0]).toBeLessThanOrEqual(100)
      }
    })

    it('should contain common colour names', () => {
      const names = PANTONE_COATED.map((c) => c.name)
      expect(names).toContain('PANTONE 186 C')
      expect(names).toContain('PANTONE Black C')
      expect(names).toContain('PANTONE Yellow C')
      expect(names).toContain('PANTONE Process Blue C')
    })
  })

  describe('findClosestSpotColor', () => {
    it('should find pure red near PANTONE reds', () => {
      const spot = findClosestSpotColor(255, 0, 0)
      expect(spot.name).toContain('PANTONE')
      expect(spot.name.toLowerCase()).toMatch(/red|185|186|18[0-9]|warm|bright/i)
    })

    it('should find black for (0,0,0)', () => {
      const spot = findClosestSpotColor(0, 0, 0)
      expect(spot.name.toLowerCase()).toContain('black')
    })

    it('should find neutral for mid-grey', () => {
      const spot = findClosestSpotColor(128, 128, 128)
      expect(spot.name.toLowerCase()).toMatch(/gray|grey|cool|warm/i)
    })

    it('should always return a result', () => {
      const spot = findClosestSpotColor(42, 197, 133)
      expect(spot).toBeDefined()
      expect(spot.name.length).toBeGreaterThan(0)
    })
  })

  describe('searchSpotColors', () => {
    it('should find colours by name substring', () => {
      const results = searchSpotColors('186')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0]!.name).toContain('186')
    })

    it('should be case-insensitive', () => {
      const r1 = searchSpotColors('pantone')
      const r2 = searchSpotColors('PANTONE')
      expect(r1.length).toBe(r2.length)
    })

    it('should return empty for no match', () => {
      expect(searchSpotColors('ZZZZNONEXISTENT')).toHaveLength(0)
    })

    it('should find "Black" colours', () => {
      const results = searchSpotColors('Black')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should find "Cool Gray" colours', () => {
      const results = searchSpotColors('Cool Gray')
      expect(results.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('findSpotColorsInRange', () => {
    it('should return colours within ΔE threshold', () => {
      const results = findSpotColorsInRange(128, 128, 128, 10)
      expect(results.length).toBeGreaterThanOrEqual(1)
      // All should be grey-ish
      for (const c of results) {
        const maxDiff = Math.max(
          Math.abs(c.rgb[0] - c.rgb[1]),
          Math.abs(c.rgb[1] - c.rgb[2]),
          Math.abs(c.rgb[0] - c.rgb[2]),
        )
        expect(maxDiff).toBeLessThan(50)
      }
    })

    it('should return empty for impossible threshold', () => {
      const results = findSpotColorsInRange(128, 128, 128, 0.001)
      expect(results).toHaveLength(0)
    })
  })

  describe('createSpotSwatch', () => {
    it('should create a swatch with an ID', () => {
      const spot = PANTONE_COATED[0]!
      const swatch = createSpotSwatch(spot, 80)
      expect(swatch.id).toBeDefined()
      expect(swatch.id.length).toBeGreaterThan(0)
      expect(swatch.spotColor).toBe(spot)
      expect(swatch.tint).toBe(80)
    })

    it('should default tint to 100', () => {
      const swatch = createSpotSwatch(PANTONE_COATED[0]!)
      expect(swatch.tint).toBe(100)
    })

    it('should clamp tint', () => {
      const swatch = createSpotSwatch(PANTONE_COATED[0]!, 150)
      expect(swatch.tint).toBe(100)
    })
  })

  describe('tintedSpotRgb', () => {
    it('should return original colour at 100% tint', () => {
      const spot = PANTONE_COATED[0]!
      const [r, g, b] = tintedSpotRgb(spot, 100)
      expect(r).toBe(spot.rgb[0])
      expect(g).toBe(spot.rgb[1])
      expect(b).toBe(spot.rgb[2])
    })

    it('should return white at 0% tint', () => {
      const spot = PANTONE_COATED[0]!
      const [r, g, b] = tintedSpotRgb(spot, 0)
      expect(r).toBe(255)
      expect(g).toBe(255)
      expect(b).toBe(255)
    })

    it('should blend at 50% tint', () => {
      const spot: { rgb: [number, number, number] } = { rgb: [100, 0, 0] } as never
      const [r, g, b] = tintedSpotRgb(spot as never, 50)
      expect(r).toBeCloseTo(178, 0) // (100*0.5 + 255*0.5)
      expect(g).toBeCloseTo(128, 0) // (0*0.5 + 255*0.5)
      expect(b).toBeCloseTo(128, 0)
    })
  })
})
