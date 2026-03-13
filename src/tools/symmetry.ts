// ---------------------------------------------------------------------------
// Symmetry Drawing
// ---------------------------------------------------------------------------
// Mirrors brush strokes across one or more axes. When enabled, each paint
// point is duplicated at rotated positions around a centre point, producing
// radial symmetry (mandala-style drawing).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymmetrySettings {
  enabled: boolean
  axes: number // number of symmetry axes (2 = simple mirror, 4 = quad, etc.)
  angle: number // rotation offset in degrees
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const defaultSettings: SymmetrySettings = {
  enabled: false,
  axes: 2,
  angle: 0,
}

let currentSettings: SymmetrySettings = { ...defaultSettings }

export function getSymmetrySettings(): SymmetrySettings {
  return { ...currentSettings }
}

export function setSymmetrySettings(settings: Partial<SymmetrySettings>) {
  Object.assign(currentSettings, settings)
}

export function isSymmetryEnabled(): boolean {
  return currentSettings.enabled && currentSettings.axes >= 2
}

// ---------------------------------------------------------------------------
// Compute mirrored points
// ---------------------------------------------------------------------------

/**
 * Given a paint point (x, y) and a centre of symmetry (centerX, centerY),
 * compute all symmetry-mirrored points for the configured number of axes.
 *
 * For N axes the point is rotated by `360/N * i` degrees for i = 0 .. N-1,
 * plus an optional base angle offset.
 *
 * Returns an array of {x, y} including the original point (at i=0 with angle offset applied
 * — or more precisely, i=0 returns a point rotated by `angle` from the raw offset,
 * so when angle=0 the first point is the original).
 */
export function getSymmetryPoints(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  settings?: Partial<SymmetrySettings>,
): Array<{ x: number; y: number }> {
  const s = { ...currentSettings, ...settings }

  if (!s.enabled || s.axes < 2) {
    return [{ x, y }]
  }

  const results: Array<{ x: number; y: number }> = []
  const angleStep = (2 * Math.PI) / s.axes
  const baseAngle = (s.angle * Math.PI) / 180

  // Offset from centre
  const dx = x - centerX
  const dy = y - centerY

  for (let i = 0; i < s.axes; i++) {
    const theta = angleStep * i + baseAngle
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)

    // For the first axis (i=0) with angle=0, this returns the original point
    const rx = centerX + dx * cos - dy * sin
    const ry = centerY + dx * sin + dy * cos
    results.push({ x: rx, y: ry })
  }

  return results
}

/**
 * Transform an array of paint points into symmetry-expanded points.
 * Useful for wrapping around existing brush/eraser paint functions.
 */
export function expandSymmetryPoints(
  points: Array<{ x: number; y: number }>,
  centerX: number,
  centerY: number,
  settings?: Partial<SymmetrySettings>,
): Array<Array<{ x: number; y: number }>> {
  const s = { ...currentSettings, ...settings }

  if (!s.enabled || s.axes < 2) {
    return [points]
  }

  // Create one array of points per axis
  const axisCount = s.axes
  const result: Array<Array<{ x: number; y: number }>> = []
  for (let i = 0; i < axisCount; i++) {
    result.push([])
  }

  const angleStep = (2 * Math.PI) / axisCount
  const baseAngle = (s.angle * Math.PI) / 180

  for (const pt of points) {
    const dx = pt.x - centerX
    const dy = pt.y - centerY

    for (let i = 0; i < axisCount; i++) {
      const theta = angleStep * i + baseAngle
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      result[i]!.push({
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos,
      })
    }
  }

  return result
}
