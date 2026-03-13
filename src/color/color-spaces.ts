/**
 * Core color space conversion utilities.
 *
 * Supports RGB, CMYK, CIE XYZ (D65), CIE L*a*b*, and HSL.
 * All RGB values are 0-255, all fractional ranges are 0-1 unless noted.
 */

// ─── RGB ↔ CMYK ──────────────────────────────────────────────

/**
 * Convert RGB (0-255) to CMYK (0-1 each).
 */
export function rgbToCmyk(r: number, g: number, b: number): [number, number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const k = 1 - Math.max(rn, gn, bn)
  if (k >= 1) return [0, 0, 0, 1]

  const c = (1 - rn - k) / (1 - k)
  const m = (1 - gn - k) / (1 - k)
  const y = (1 - bn - k) / (1 - k)

  return [c, m, y, k]
}

/**
 * Convert CMYK (0-1 each) to RGB (0-255).
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const r = Math.round(255 * (1 - c) * (1 - k))
  const g = Math.round(255 * (1 - m) * (1 - k))
  const b = Math.round(255 * (1 - y) * (1 - k))
  return [clamp255(r), clamp255(g), clamp255(b)]
}

// ─── RGB ↔ CIE XYZ (D65) ────────────────────────────────────

/** D65 reference white point. */
const D65_Xn = 0.95047
const D65_Yn = 1.0
const D65_Zn = 1.08883

/**
 * sRGB companding: linearize an sRGB channel value (0-1).
 */
function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/**
 * sRGB companding: apply gamma to a linear channel value.
 */
function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055
}

/**
 * Convert sRGB (0-255) to CIE XYZ using D65 illuminant.
 */
export function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r / 255)
  const gl = srgbToLinear(g / 255)
  const bl = srgbToLinear(b / 255)

  // sRGB → XYZ matrix (D65)
  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl
  const z = 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl

  return [x, y, z]
}

/**
 * Convert CIE XYZ to sRGB (0-255).
 */
export function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  // XYZ → sRGB matrix (D65)
  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z

  const r = Math.round(clamp01(linearToSrgb(rl)) * 255)
  const g = Math.round(clamp01(linearToSrgb(gl)) * 255)
  const b = Math.round(clamp01(linearToSrgb(bl)) * 255)

  return [r, g, b]
}

// ─── CIE XYZ ↔ L*a*b* ───────────────────────────────────────

const LAB_EPSILON = 0.008856 // 216/24389
const LAB_KAPPA = 903.3 // 24389/27

function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116
}

function labFInv(t: number): number {
  const t3 = t * t * t
  return t3 > LAB_EPSILON ? t3 : (116 * t - 16) / LAB_KAPPA
}

/**
 * Convert CIE XYZ to L*a*b* (D65 reference white).
 * L: 0-100, a: ~-128..127, b: ~-128..127
 */
export function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  const fx = labF(x / D65_Xn)
  const fy = labF(y / D65_Yn)
  const fz = labF(z / D65_Zn)

  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)

  return [L, a, b]
}

/**
 * Convert L*a*b* to CIE XYZ (D65 reference white).
 */
export function labToXyz(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const fx = a / 500 + fy
  const fz = fy - b / 200

  const x = labFInv(fx) * D65_Xn
  const y = labFInv(fy) * D65_Yn
  const z = labFInv(fz) * D65_Zn

  return [x, y, z]
}

// ─── RGB ↔ Lab (convenience) ─────────────────────────────────

/**
 * Convert sRGB (0-255) to CIE L*a*b*.
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const [x, y, z] = rgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

/**
 * Convert CIE L*a*b* to sRGB (0-255).
 */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const [x, y, z] = labToXyz(L, a, b)
  return xyzToRgb(x, y, z)
}

// ─── CIE76 Delta-E ──────────────────────────────────────────

/**
 * Compute the CIE76 colour difference between two L*a*b* colours.
 */
export function deltaE76(L1: number, a1: number, b1: number, L2: number, a2: number, b2: number): number {
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

// ─── RGB ↔ HSL ───────────────────────────────────────────────

/**
 * Convert RGB (0-255) to HSL.  h: 0-360, s: 0-1, l: 0-1
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const l = (max + min) / 2

  if (d === 0) return [0, 0, l]

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6

  return [h * 360, s, l]
}

/**
 * Convert HSL (h: 0-360, s: 0-1, l: 0-1) to RGB (0-255).
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const hn = h / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ]
}

// ─── Hex helpers ─────────────────────────────────────────────

/**
 * Parse a hex colour string to [r, g, b] (0-255).
 */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)]
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/**
 * Convert [r, g, b] (0-255) to a hex string "#rrggbb".
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    clamp255(r).toString(16).padStart(2, '0') +
    clamp255(g).toString(16).padStart(2, '0') +
    clamp255(b).toString(16).padStart(2, '0')
  )
}

// ─── Internal helpers ────────────────────────────────────────

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
