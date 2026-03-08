/**
 * Color space conversion utilities.
 * Supports RGBA, HSLA, and CMYK color representations.
 */

export interface RGBA {
  r: number // 0–255
  g: number // 0–255
  b: number // 0–255
  a: number // 0–1
}

export interface HSLA {
  h: number // 0–360
  s: number // 0–100
  l: number // 0–100
  a: number // 0–1
}

export interface CMYK {
  c: number // 0–100
  m: number // 0–100
  y: number // 0–100
  k: number // 0–100
}

// ─── Hex ↔ RGBA ───────────────────────────────────────────────

export function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '')
  const len = h.length
  if (len === 3 || len === 4) {
    const r = parseInt(h[0]! + h[0]!, 16)
    const g = parseInt(h[1]! + h[1]!, 16)
    const b = parseInt(h[2]! + h[2]!, 16)
    const a = len === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1
    return { r, g, b, a }
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = len === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return { r, g, b, a }
}

export function rgbaToHex(c: RGBA): string {
  const r = Math.round(c.r).toString(16).padStart(2, '0')
  const g = Math.round(c.g).toString(16).padStart(2, '0')
  const b = Math.round(c.b).toString(16).padStart(2, '0')
  if (c.a < 1) {
    const a = Math.round(c.a * 255)
      .toString(16)
      .padStart(2, '0')
    return `#${r}${g}${b}${a}`
  }
  return `#${r}${g}${b}`
}

// ─── RGBA ↔ HSLA ──────────────────────────────────────────────

export function rgbaToHsla(c: RGBA): HSLA {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6
    } else {
      h = ((r - g) / d + 4) / 6
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: c.a,
  }
}

export function hslaToRgba(c: HSLA): RGBA {
  const h = c.h / 360
  const s = c.s / 100
  const l = c.l / 100

  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v, a: c.a }
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    a: c.a,
  }
}

// ─── RGBA ↔ CMYK ──────────────────────────────────────────────

export function rgbaToCmyk(c: RGBA): CMYK {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255

  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }

  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  }
}

export function cmykToRgba(c: CMYK, a = 1): RGBA {
  const k = c.k / 100
  return {
    r: Math.round(255 * (1 - c.c / 100) * (1 - k)),
    g: Math.round(255 * (1 - c.m / 100) * (1 - k)),
    b: Math.round(255 * (1 - c.y / 100) * (1 - k)),
    a,
  }
}

// ─── Convenience hex ↔ HSLA / CMYK ────────────────────────────

export function hexToHsla(hex: string): HSLA {
  return rgbaToHsla(hexToRgba(hex))
}

export function hslaToHex(c: HSLA): string {
  return rgbaToHex(hslaToRgba(c))
}

export function hexToCmyk(hex: string): CMYK {
  return rgbaToCmyk(hexToRgba(hex))
}

export function cmykToHex(c: CMYK): string {
  return rgbaToHex(cmykToRgba(c))
}

/**
 * Format HSLA as CSS string.
 */
export function hslaToString(c: HSLA): string {
  return c.a < 1 ? `hsla(${c.h}, ${c.s}%, ${c.l}%, ${c.a})` : `hsl(${c.h}, ${c.s}%, ${c.l}%)`
}

/**
 * Parse a CSS hsl/hsla string.
 */
export function parseHsla(str: string): HSLA | null {
  const m = str.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\s*\)/)
  if (!m) return null
  return {
    h: parseInt(m[1]!, 10),
    s: parseInt(m[2]!, 10),
    l: parseInt(m[3]!, 10),
    a: m[4] !== undefined ? parseFloat(m[4]) : 1,
  }
}
