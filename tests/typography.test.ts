import { describe, it, expect } from 'bun:test'
import type { FontVariationAxis, CharacterTransform, TextWarpConfig, TextLayer } from '@/types'
import {
  formatVariationSettings,
  getDefaultAxes,
  clampAxisValue,
  updateAxisValue,
  resetAxes,
} from '@/tools/variable-fonts'
import {
  beginTouchType,
  endTouchType,
  isTouchTypeActive,
  getTouchTypeState,
  selectCharacter,
  getSelectedCharIndex,
  defaultCharacterTransform,
  getCharTransform,
  transformCharacter,
  setCharacterTransform,
  resetCharacterTransform,
  resetAllCharacterTransforms,
} from '@/tools/touch-type'
import {
  TEXT_WARP_PRESET_LIST,
  getTextWarpPresets,
  defaultTextWarpConfig,
  applyTextWarp,
  warpTextPoint,
} from '@/tools/text-warp'
import type { TextBounds } from '@/tools/text-warp'

// ── Helpers ────────────────────────────────────────────────────

function makeTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: 'text-1',
    name: 'Test Text',
    type: 'text',
    text: 'Hello',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    color: '#000000',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    ...overrides,
  }
}

function makeAxis(tag: string, min: number, max: number, def: number, val: number): FontVariationAxis {
  return { tag, name: tag, min, max, default: def, value: val }
}

const unitBounds: TextBounds = { x: 0, y: 0, width: 200, height: 50 }

// ═══════════════════════════════════════════════════════════════
// Variable Fonts
// ═══════════════════════════════════════════════════════════════

describe('Variable Fonts', () => {
  describe('getDefaultAxes', () => {
    it('returns standard registered axes', () => {
      const axes = getDefaultAxes()
      expect(axes.length).toBe(5)
      const tags = axes.map((a) => a.tag)
      expect(tags).toContain('wght')
      expect(tags).toContain('wdth')
      expect(tags).toContain('ital')
      expect(tags).toContain('slnt')
      expect(tags).toContain('opsz')
    })

    it('all axes have valid ranges', () => {
      for (const axis of getDefaultAxes()) {
        expect(axis.min).toBeLessThanOrEqual(axis.max)
        expect(axis.default).toBeGreaterThanOrEqual(axis.min)
        expect(axis.default).toBeLessThanOrEqual(axis.max)
        expect(axis.value).toBe(axis.default)
      }
    })
  })

  describe('formatVariationSettings', () => {
    it('returns empty string when no axes differ from default', () => {
      const axes = getDefaultAxes()
      expect(formatVariationSettings(axes)).toBe('')
    })

    it('includes only modified axes by default', () => {
      const axes: FontVariationAxis[] = [makeAxis('wght', 100, 900, 400, 700), makeAxis('wdth', 75, 125, 100, 100)]
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700")
    })

    it('includes all axes when includeAll is true', () => {
      const axes: FontVariationAxis[] = [makeAxis('wght', 100, 900, 400, 400), makeAxis('wdth', 75, 125, 100, 85)]
      const result = formatVariationSettings(axes, true)
      expect(result).toBe("'wght' 400, 'wdth' 85")
    })

    it('formats multiple modified axes', () => {
      const axes: FontVariationAxis[] = [
        makeAxis('wght', 100, 900, 400, 700),
        makeAxis('wdth', 75, 125, 100, 85),
        makeAxis('slnt', -90, 90, 0, -12),
      ]
      const result = formatVariationSettings(axes)
      expect(result).toBe("'wght' 700, 'wdth' 85, 'slnt' -12")
    })
  })

  describe('clampAxisValue', () => {
    it('clamps below minimum', () => {
      const axis = makeAxis('wght', 100, 900, 400, 400)
      expect(clampAxisValue(axis, 50)).toBe(100)
    })

    it('clamps above maximum', () => {
      const axis = makeAxis('wght', 100, 900, 400, 400)
      expect(clampAxisValue(axis, 1000)).toBe(900)
    })

    it('passes through values in range', () => {
      const axis = makeAxis('wght', 100, 900, 400, 400)
      expect(clampAxisValue(axis, 550)).toBe(550)
    })

    it('handles exact boundary values', () => {
      const axis = makeAxis('wght', 100, 900, 400, 400)
      expect(clampAxisValue(axis, 100)).toBe(100)
      expect(clampAxisValue(axis, 900)).toBe(900)
    })
  })

  describe('updateAxisValue', () => {
    it('updates matching axis tag', () => {
      const axes = [makeAxis('wght', 100, 900, 400, 400), makeAxis('wdth', 75, 125, 100, 100)]
      const updated = updateAxisValue(axes, 'wght', 700)
      expect(updated[0]!.value).toBe(700)
      expect(updated[1]!.value).toBe(100)
    })

    it('clamps value to axis range', () => {
      const axes = [makeAxis('wght', 100, 900, 400, 400)]
      const updated = updateAxisValue(axes, 'wght', 1200)
      expect(updated[0]!.value).toBe(900)
    })

    it('does not mutate original array', () => {
      const axes = [makeAxis('wght', 100, 900, 400, 400)]
      const updated = updateAxisValue(axes, 'wght', 700)
      expect(axes[0]!.value).toBe(400)
      expect(updated[0]!.value).toBe(700)
    })

    it('leaves unmatched axes unchanged', () => {
      const axes = [makeAxis('wght', 100, 900, 400, 400)]
      const updated = updateAxisValue(axes, 'slnt', 10)
      expect(updated[0]!.value).toBe(400)
    })
  })

  describe('resetAxes', () => {
    it('resets all axes to their defaults', () => {
      const axes = [makeAxis('wght', 100, 900, 400, 700), makeAxis('wdth', 75, 125, 100, 85)]
      const reset = resetAxes(axes)
      expect(reset[0]!.value).toBe(400)
      expect(reset[1]!.value).toBe(100)
    })
  })

  describe('FontVariationAxis type', () => {
    it('TextLayer can hold fontVariationAxes', () => {
      const layer = makeTextLayer({
        fontVariationAxes: [makeAxis('wght', 100, 900, 400, 600)],
      })
      expect(layer.fontVariationAxes).toBeDefined()
      expect(layer.fontVariationAxes!.length).toBe(1)
      expect(layer.fontVariationAxes![0]!.tag).toBe('wght')
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Touch Type
// ═══════════════════════════════════════════════════════════════

describe('Touch Type', () => {
  describe('lifecycle', () => {
    it('starts inactive', () => {
      endTouchType() // ensure clean state
      expect(isTouchTypeActive()).toBe(false)
    })

    it('activates with beginTouchType', () => {
      const layer = makeTextLayer()
      beginTouchType(layer)
      expect(isTouchTypeActive()).toBe(true)
      expect(getTouchTypeState().layerId).toBe('text-1')
      endTouchType()
    })

    it('deactivates with endTouchType', () => {
      const layer = makeTextLayer()
      beginTouchType(layer)
      endTouchType()
      expect(isTouchTypeActive()).toBe(false)
      expect(getTouchTypeState().layerId).toBeNull()
    })
  })

  describe('character selection', () => {
    it('starts with no selection', () => {
      endTouchType()
      const layer = makeTextLayer()
      beginTouchType(layer)
      expect(getSelectedCharIndex()).toBeNull()
      endTouchType()
    })

    it('selects a character by index', () => {
      const layer = makeTextLayer()
      beginTouchType(layer)
      selectCharacter(3)
      expect(getSelectedCharIndex()).toBe(3)
      endTouchType()
    })

    it('deselects when null is passed', () => {
      const layer = makeTextLayer()
      beginTouchType(layer)
      selectCharacter(2)
      selectCharacter(null)
      expect(getSelectedCharIndex()).toBeNull()
      endTouchType()
    })
  })

  describe('defaultCharacterTransform', () => {
    it('returns identity transform', () => {
      const ct = defaultCharacterTransform(5)
      expect(ct.charIndex).toBe(5)
      expect(ct.x).toBe(0)
      expect(ct.y).toBe(0)
      expect(ct.rotation).toBe(0)
      expect(ct.scaleX).toBe(1)
      expect(ct.scaleY).toBe(1)
    })
  })

  describe('getCharTransform', () => {
    it('returns existing transform when present', () => {
      const transforms: CharacterTransform[] = [{ charIndex: 2, x: 10, y: -5, rotation: 15, scaleX: 1.2, scaleY: 0.8 }]
      const ct = getCharTransform(transforms, 2)
      expect(ct.x).toBe(10)
      expect(ct.rotation).toBe(15)
    })

    it('returns default when transform not found', () => {
      const transforms: CharacterTransform[] = [{ charIndex: 0, x: 5, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]
      const ct = getCharTransform(transforms, 3)
      expect(ct.charIndex).toBe(3)
      expect(ct.x).toBe(0)
    })

    it('returns default when transforms is undefined', () => {
      const ct = getCharTransform(undefined, 0)
      expect(ct.charIndex).toBe(0)
      expect(ct.x).toBe(0)
      expect(ct.scaleX).toBe(1)
    })
  })

  describe('transformCharacter', () => {
    it('creates new transform for unset character', () => {
      const result = transformCharacter(undefined, 0, { x: 10, y: -5 })
      expect(result.length).toBe(1)
      expect(result[0]!.charIndex).toBe(0)
      expect(result[0]!.x).toBe(10)
      expect(result[0]!.y).toBe(-5)
    })

    it('adds deltas to existing transform', () => {
      const existing: CharacterTransform[] = [{ charIndex: 1, x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1 }]
      const result = transformCharacter(existing, 1, { x: 5, y: -3 })
      expect(result[0]!.x).toBe(15)
      expect(result[0]!.y).toBe(2)
    })

    it('multiplies scale deltas', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 2 }]
      const result = transformCharacter(existing, 0, { scaleX: 0.5, scaleY: 1.5 })
      expect(result[0]!.scaleX).toBe(1)
      expect(result[0]!.scaleY).toBe(3)
    })

    it('adds rotation delta', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 0, y: 0, rotation: 45, scaleX: 1, scaleY: 1 }]
      const result = transformCharacter(existing, 0, { rotation: -15 })
      expect(result[0]!.rotation).toBe(30)
    })

    it('does not mutate original array', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }]
      const result = transformCharacter(existing, 0, { x: 5 })
      expect(existing[0]!.x).toBe(10)
      expect(result[0]!.x).toBe(15)
    })

    it('preserves other transforms', () => {
      const existing: CharacterTransform[] = [
        { charIndex: 0, x: 1, y: 1, rotation: 0, scaleX: 1, scaleY: 1 },
        { charIndex: 1, x: 2, y: 2, rotation: 0, scaleX: 1, scaleY: 1 },
      ]
      const result = transformCharacter(existing, 0, { x: 10 })
      expect(result.length).toBe(2)
      expect(result[1]!.x).toBe(2) // unchanged
    })
  })

  describe('setCharacterTransform', () => {
    it('sets absolute values', () => {
      const result = setCharacterTransform(undefined, 0, { x: 50, y: -20, rotation: 90 })
      expect(result[0]!.x).toBe(50)
      expect(result[0]!.y).toBe(-20)
      expect(result[0]!.rotation).toBe(90)
      expect(result[0]!.scaleX).toBe(1) // default
    })

    it('replaces existing values', () => {
      const existing: CharacterTransform[] = [{ charIndex: 0, x: 10, y: 10, rotation: 45, scaleX: 2, scaleY: 2 }]
      const result = setCharacterTransform(existing, 0, { x: 0 })
      expect(result[0]!.x).toBe(0)
      expect(result[0]!.y).toBe(10) // not specified, keeps old value
      expect(result[0]!.rotation).toBe(45)
    })
  })

  describe('resetCharacterTransform', () => {
    it('removes the transform for the specified character', () => {
      const existing: CharacterTransform[] = [
        { charIndex: 0, x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        { charIndex: 1, x: 20, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      ]
      const result = resetCharacterTransform(existing, 0)
      expect(result.length).toBe(1)
      expect(result[0]!.charIndex).toBe(1)
    })

    it('returns empty array for undefined input', () => {
      expect(resetCharacterTransform(undefined, 0)).toEqual([])
    })
  })

  describe('resetAllCharacterTransforms', () => {
    it('returns empty array', () => {
      expect(resetAllCharacterTransforms()).toEqual([])
    })
  })

  describe('TextLayer characterTransforms field', () => {
    it('TextLayer can hold characterTransforms', () => {
      const layer = makeTextLayer({
        characterTransforms: [{ charIndex: 0, x: 5, y: -2, rotation: 10, scaleX: 1.1, scaleY: 0.9 }],
      })
      expect(layer.characterTransforms).toBeDefined()
      expect(layer.characterTransforms!.length).toBe(1)
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Text Warp Presets
// ═══════════════════════════════════════════════════════════════

describe('Text Warp', () => {
  describe('getTextWarpPresets', () => {
    it('returns all preset names', () => {
      const presets = getTextWarpPresets()
      expect(presets.length).toBe(16)
      expect(presets[0]).toBe('none')
      expect(presets).toContain('arc')
      expect(presets).toContain('arc-lower')
      expect(presets).toContain('arc-upper')
      expect(presets).toContain('arch')
      expect(presets).toContain('bulge')
      expect(presets).toContain('shell-lower')
      expect(presets).toContain('shell-upper')
      expect(presets).toContain('flag')
      expect(presets).toContain('wave')
      expect(presets).toContain('fish')
      expect(presets).toContain('rise')
      expect(presets).toContain('fisheye')
      expect(presets).toContain('inflate')
      expect(presets).toContain('squeeze')
      expect(presets).toContain('twist')
    })
  })

  describe('defaultTextWarpConfig', () => {
    it('returns no-op config', () => {
      const cfg = defaultTextWarpConfig()
      expect(cfg.preset).toBe('none')
      expect(cfg.bend).toBe(0)
      expect(cfg.distortH).toBe(0)
      expect(cfg.distortV).toBe(0)
    })
  })

  describe('applyTextWarp with none preset', () => {
    it('returns original coordinates unchanged', () => {
      const cfg: TextWarpConfig = { preset: 'none', bend: 50, distortH: 0, distortV: 0 }
      const warp = applyTextWarp(unitBounds, cfg)
      const p = warp(100, 25)
      expect(p.x).toBe(100)
      expect(p.y).toBe(25)
    })
  })

  describe('applyTextWarp with zero-size bounds', () => {
    it('returns original coordinates for zero-width bounds', () => {
      const cfg: TextWarpConfig = { preset: 'arc', bend: 50, distortH: 0, distortV: 0 }
      const zeroBounds: TextBounds = { x: 0, y: 0, width: 0, height: 50 }
      const warp = applyTextWarp(zeroBounds, cfg)
      const p = warp(10, 20)
      expect(p.x).toBe(10)
      expect(p.y).toBe(20)
    })
  })

  describe('warpTextPoint convenience', () => {
    it('warps a single point through preset', () => {
      const cfg: TextWarpConfig = { preset: 'arc', bend: 50, distortH: 0, distortV: 0 }
      const center = warpTextPoint(100, 25, unitBounds, cfg)
      const edge = warpTextPoint(0, 25, unitBounds, cfg)
      // Arc: center displaced more than edge
      expect(Math.abs(center.y - 25)).toBeGreaterThan(0)
      expect(Math.abs(center.y - 25)).toBeGreaterThanOrEqual(Math.abs(edge.y - 25))
    })
  })

  describe('arc preset', () => {
    const cfg: TextWarpConfig = { preset: 'arc', bend: 50, distortH: 0, distortV: 0 }

    it('displaces center point', () => {
      const p = warpTextPoint(100, 25, unitBounds, cfg)
      expect(p.y).not.toBe(25)
    })

    it('does not displace edge points horizontally', () => {
      const p = warpTextPoint(0, 25, unitBounds, cfg)
      expect(p.x).toBe(0)
    })

    it('center is displaced more than edges', () => {
      const center = warpTextPoint(100, 25, unitBounds, cfg)
      const edge = warpTextPoint(0, 25, unitBounds, cfg)
      expect(Math.abs(center.y - 25)).toBeGreaterThanOrEqual(Math.abs(edge.y - 25))
    })

    it('negative bend displaces in opposite direction', () => {
      const posBend: TextWarpConfig = { preset: 'arc', bend: 50, distortH: 0, distortV: 0 }
      const negBend: TextWarpConfig = { preset: 'arc', bend: -50, distortH: 0, distortV: 0 }
      const pos = warpTextPoint(100, 25, unitBounds, posBend)
      const neg = warpTextPoint(100, 25, unitBounds, negBend)
      // They should be on opposite sides of the original y
      expect((pos.y - 25) * (neg.y - 25)).toBeLessThanOrEqual(0)
    })
  })

  describe('arc-lower preset', () => {
    it('affects bottom more than top', () => {
      const cfg: TextWarpConfig = { preset: 'arc-lower', bend: 80, distortH: 0, distortV: 0 }
      const top = warpTextPoint(100, 0, unitBounds, cfg) // ny = 0
      const bottom = warpTextPoint(100, 50, unitBounds, cfg) // ny = 1
      // Bottom should be displaced more
      expect(Math.abs(bottom.y - 50)).toBeGreaterThan(Math.abs(top.y - 0))
    })
  })

  describe('arc-upper preset', () => {
    it('affects top more than bottom', () => {
      const cfg: TextWarpConfig = { preset: 'arc-upper', bend: 80, distortH: 0, distortV: 0 }
      const top = warpTextPoint(100, 0, unitBounds, cfg) // ny = 0
      const bottom = warpTextPoint(100, 50, unitBounds, cfg) // ny = 1
      // Top should be displaced more
      expect(Math.abs(top.y - 0)).toBeGreaterThan(Math.abs(bottom.y - 50))
    })
  })

  describe('wave preset', () => {
    const cfg: TextWarpConfig = { preset: 'wave', bend: 80, distortH: 0, distortV: 0 }

    it('creates sinusoidal displacement', () => {
      // Sample multiple points; the y displacement should vary
      const p1 = warpTextPoint(0, 25, unitBounds, cfg)
      const p2 = warpTextPoint(50, 25, unitBounds, cfg)
      const p3 = warpTextPoint(100, 25, unitBounds, cfg)
      const p4 = warpTextPoint(150, 25, unitBounds, cfg)

      // Not all the same
      const ys = [p1.y, p2.y, p3.y, p4.y]
      const allSame = ys.every((y) => y === ys[0])
      expect(allSame).toBe(false)
    })
  })

  describe('flag preset', () => {
    const cfg: TextWarpConfig = { preset: 'flag', bend: 80, distortH: 0, distortV: 0 }

    it('amplitude increases with x position', () => {
      const left = warpTextPoint(10, 25, unitBounds, cfg)
      const right = warpTextPoint(190, 25, unitBounds, cfg)
      // Right side should generally have larger amplitude
      // (because flag multiplies by nx)
      expect(Math.abs(right.y - 25)).toBeGreaterThanOrEqual(Math.abs(left.y - 25) * 0.5)
    })
  })

  describe('bulge preset', () => {
    const cfg: TextWarpConfig = { preset: 'bulge', bend: 80, distortH: 0, distortV: 0 }

    it('displaces center point outward', () => {
      // Center point (0.5, 0.5) in normalized coords has dx=0, dy=0 (cx=0, cy=0)
      // so it should stay approximately in place
      const centerPt = warpTextPoint(100, 25, unitBounds, cfg)
      expect(Math.abs(centerPt.x - 100)).toBeLessThan(1)
      // Points slightly off-center should be displaced
      const offCenter = warpTextPoint(120, 30, unitBounds, cfg)
      const dx = offCenter.x - 120
      const dy = offCenter.y - 30
      // With positive bend, points should be pushed outward from center
      expect(dx).toBeGreaterThan(0)
      expect(dy).toBeGreaterThan(0)
    })
  })

  describe('fish preset', () => {
    it('creates radial distortion', () => {
      const cfg: TextWarpConfig = { preset: 'fish', bend: 80, distortH: 0, distortV: 0 }
      const offCenter = warpTextPoint(150, 40, unitBounds, cfg)
      // Point should be moved away from center
      expect(offCenter.x).not.toBe(150)
      expect(offCenter.y).not.toBe(40)
    })
  })

  describe('rise preset', () => {
    it('skews vertically increasing left-to-right', () => {
      const cfg: TextWarpConfig = { preset: 'rise', bend: 80, distortH: 0, distortV: 0 }
      const left = warpTextPoint(0, 25, unitBounds, cfg)
      const right = warpTextPoint(200, 25, unitBounds, cfg)
      // Left edge should have no vertical displacement (nx=0)
      expect(left.y).toBe(25)
      // Right edge should be displaced
      expect(right.y).not.toBe(25)
    })
  })

  describe('fisheye preset', () => {
    it('creates barrel distortion', () => {
      const cfg: TextWarpConfig = { preset: 'fisheye', bend: 80, distortH: 0, distortV: 0 }
      const p = warpTextPoint(150, 40, unitBounds, cfg)
      expect(p.x).not.toBe(150)
      expect(p.y).not.toBe(40)
    })
  })

  describe('inflate preset', () => {
    it('pushes points outward from center', () => {
      const cfg: TextWarpConfig = { preset: 'inflate', bend: 80, distortH: 0, distortV: 0 }
      const p = warpTextPoint(140, 30, unitBounds, cfg)
      // Should be pushed away from center (100, 25)
      expect(p.x).toBeGreaterThan(140)
      expect(p.y).toBeGreaterThan(30)
    })
  })

  describe('squeeze preset', () => {
    it('compresses horizontally near vertical center', () => {
      const cfg: TextWarpConfig = { preset: 'squeeze', bend: 80, distortH: 0, distortV: 0 }
      // Point to the right of center
      const p = warpTextPoint(150, 25, unitBounds, cfg)
      // Squeeze should pull it toward center horizontally
      expect(p.x).toBeLessThan(150)
    })
  })

  describe('twist preset', () => {
    it('rotates points around center', () => {
      const cfg: TextWarpConfig = { preset: 'twist', bend: 80, distortH: 0, distortV: 0 }
      const p = warpTextPoint(150, 25, unitBounds, cfg)
      // Point should be rotated, so both x and y change
      expect(p.x).not.toBe(150)
    })
  })

  describe('shell-lower preset', () => {
    it('curves bottom of text', () => {
      const cfg: TextWarpConfig = { preset: 'shell-lower', bend: 80, distortH: 0, distortV: 0 }
      const top = warpTextPoint(100, 0, unitBounds, cfg)
      const bottom = warpTextPoint(100, 50, unitBounds, cfg)
      expect(Math.abs(bottom.y - 50)).toBeGreaterThan(Math.abs(top.y - 0))
    })
  })

  describe('shell-upper preset', () => {
    it('curves top of text', () => {
      const cfg: TextWarpConfig = { preset: 'shell-upper', bend: 80, distortH: 0, distortV: 0 }
      const top = warpTextPoint(100, 0, unitBounds, cfg)
      const bottom = warpTextPoint(100, 50, unitBounds, cfg)
      expect(Math.abs(top.y - 0)).toBeGreaterThan(Math.abs(bottom.y - 50))
    })
  })

  describe('arch preset', () => {
    it('creates arch shape', () => {
      const cfg: TextWarpConfig = { preset: 'arch', bend: 80, distortH: 0, distortV: 0 }
      const center = warpTextPoint(100, 0, unitBounds, cfg)
      const edge = warpTextPoint(0, 0, unitBounds, cfg)
      // Center should be displaced more
      expect(Math.abs(center.y)).toBeGreaterThanOrEqual(Math.abs(edge.y))
    })
  })

  describe('distortion parameters', () => {
    it('horizontal distortion shifts based on vertical position', () => {
      const cfg: TextWarpConfig = { preset: 'arc', bend: 0, distortH: 50, distortV: 0 }
      const top = warpTextPoint(100, 0, unitBounds, cfg)
      const bottom = warpTextPoint(100, 50, unitBounds, cfg)
      // Top (ny=0) and bottom (ny=1) should be shifted in opposite x directions
      expect(top.x - 100).not.toBe(bottom.x - 100)
    })

    it('vertical distortion shifts based on horizontal position', () => {
      const cfg: TextWarpConfig = { preset: 'arc', bend: 0, distortH: 0, distortV: 50 }
      const left = warpTextPoint(0, 25, unitBounds, cfg)
      const right = warpTextPoint(200, 25, unitBounds, cfg)
      expect(left.y - 25).not.toBe(right.y - 25)
    })
  })

  describe('TextLayer textWarp field', () => {
    it('TextLayer can hold textWarp config', () => {
      const layer = makeTextLayer({
        textWarp: { preset: 'arc', bend: 50, distortH: 0, distortV: 0 },
      })
      expect(layer.textWarp).toBeDefined()
      expect(layer.textWarp!.preset).toBe('arc')
      expect(layer.textWarp!.bend).toBe(50)
    })
  })

  describe('every preset produces a valid warp function', () => {
    for (const preset of TEXT_WARP_PRESET_LIST) {
      it(`preset "${preset}" returns a function from applyTextWarp`, () => {
        const cfg: TextWarpConfig = { preset, bend: 50, distortH: 10, distortV: 10 }
        const warp = applyTextWarp(unitBounds, cfg)
        expect(typeof warp).toBe('function')
        const p = warp(100, 25)
        expect(typeof p.x).toBe('number')
        expect(typeof p.y).toBe('number')
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      })
    }
  })
})
