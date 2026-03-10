// ─── 3D Vector Extrusion Engine ───────────────────────────────
// Provides Phong-shaded 3D extrusion of 2D vector paths with
// rotation, materials, and lighting.

import type { Segment } from '@/types'

// ─── Types ────────────────────────────────────────────────────

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface MaterialConfig {
  color: string
  shininess: number // 0-100
  roughness: number // 0-1
  ambient: number // 0-1
}

export interface LightingConfig {
  direction: Vec3
  intensity: number
  ambientIntensity: number
  specularIntensity: number
}

export interface Extrude3DConfig {
  depth: number
  rotateX: number // degrees
  rotateY: number // degrees
  rotateZ: number // degrees
  material: MaterialConfig
  lighting: LightingConfig
}

export interface ExtrudedGeometry {
  front: Vec3[]
  back: Vec3[]
  sides: Vec3[][]
}

export interface ProjectedPoint {
  x: number
  y: number
  depth: number
}

interface Face {
  points2D: ProjectedPoint[]
  normal: Vec3
  centroidDepth: number
}

// ─── Default config ───────────────────────────────────────────

export function createDefaultExtrude3DConfig(): Extrude3DConfig {
  return {
    depth: 40,
    rotateX: -20,
    rotateY: 30,
    rotateZ: 0,
    material: {
      color: '#4a90d9',
      shininess: 50,
      roughness: 0.5,
      ambient: 0.15,
    },
    lighting: {
      direction: { x: -0.5, y: -0.7, z: 0.5 },
      intensity: 1.0,
      ambientIntensity: 0.3,
      specularIntensity: 0.6,
    },
  }
}

// ─── Matrix operations ────────────────────────────────────────

/** 3x3 rotation matrix around the X axis (pitch). */
export function rotateX3D(angleDeg: number): number[][] {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ]
}

/** 3x3 rotation matrix around the Y axis (yaw). */
export function rotateY3D(angleDeg: number): number[][] {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ]
}

/** 3x3 rotation matrix around the Z axis (roll). */
export function rotateZ3D(angleDeg: number): number[][] {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ]
}

/** Multiply two 3x3 matrices. */
export function multiply3x3(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i]![j] = a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!
    }
  }
  return result
}

/** Transform a 3D point by a 3x3 matrix. */
export function transformPoint3D(point: Vec3, matrix: number[][]): Vec3 {
  return {
    x: matrix[0]![0]! * point.x + matrix[0]![1]! * point.y + matrix[0]![2]! * point.z,
    y: matrix[1]![0]! * point.x + matrix[1]![1]! * point.y + matrix[1]![2]! * point.z,
    z: matrix[2]![0]! * point.x + matrix[2]![1]! * point.y + matrix[2]![2]! * point.z,
  }
}

// ─── Vector utilities ─────────────────────────────────────────

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (len < 1e-10) return { x: 0, y: 0, z: 1 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function reflect(incident: Vec3, normal: Vec3): Vec3 {
  const d = 2 * dot(incident, normal)
  return {
    x: incident.x - d * normal.x,
    y: incident.y - d * normal.y,
    z: incident.z - d * normal.z,
  }
}

// ─── Geometry extrusion ───────────────────────────────────────

/** Flatten path segments into 2D vertices (linearize curves). */
function segmentsToVertices(segments: Segment[]): { x: number; y: number }[] {
  const verts: { x: number; y: number }[] = []
  let cx = 0
  let cy = 0

  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        cx = seg.x
        cy = seg.y
        verts.push({ x: cx, y: cy })
        break
      case 'line':
        cx = seg.x
        cy = seg.y
        verts.push({ x: cx, y: cy })
        break
      case 'cubic': {
        // Subdivide cubic bezier into line segments
        const steps = 12
        const sx = cx
        const sy = cy
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const t2 = t * t
          const t3 = t2 * t
          const mt = 1 - t
          const mt2 = mt * mt
          const mt3 = mt2 * mt
          cx = mt3 * sx + 3 * mt2 * t * seg.cp1x + 3 * mt * t2 * seg.cp2x + t3 * seg.x
          cy = mt3 * sy + 3 * mt2 * t * seg.cp1y + 3 * mt * t2 * seg.cp2y + t3 * seg.y
          verts.push({ x: cx, y: cy })
        }
        break
      }
      case 'quadratic': {
        const steps = 8
        const sx = cx
        const sy = cy
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const mt = 1 - t
          cx = mt * mt * sx + 2 * mt * t * seg.cpx + t * t * seg.x
          cy = mt * mt * sy + 2 * mt * t * seg.cpy + t * t * seg.y
          verts.push({ x: cx, y: cy })
        }
        break
      }
      case 'arc': {
        // Approximate arc with line segments
        const steps = 16
        for (let i = 1; i <= steps; i++) {
          const angle = (i / steps) * Math.PI * 2
          const px = seg.x + seg.rx * Math.cos(angle)
          const py = seg.y + seg.ry * Math.sin(angle)
          verts.push({ x: px, y: py })
        }
        cx = seg.x
        cy = seg.y
        break
      }
      case 'close':
        // Closed path — no additional vertex needed
        break
    }
  }

  return verts
}

/**
 * Extrude a 2D path into 3D geometry.
 * Front face at z=0, back face at z=depth.
 * Side quads connect corresponding vertices.
 */
export function extrudePath(segments: Segment[], depth: number): ExtrudedGeometry {
  const verts2D = segmentsToVertices(segments)
  if (verts2D.length === 0) {
    return { front: [], back: [], sides: [] }
  }

  const front: Vec3[] = verts2D.map((v) => ({ x: v.x, y: v.y, z: 0 }))
  const back: Vec3[] = verts2D.map((v) => ({ x: v.x, y: v.y, z: depth }))

  const sides: Vec3[][] = []
  for (let i = 0; i < verts2D.length; i++) {
    const next = (i + 1) % verts2D.length
    // Each side is a quad: front[i], front[next], back[next], back[i]
    sides.push([front[i]!, front[next]!, back[next]!, back[i]!])
  }

  return { front, back, sides }
}

// ─── Projection ───────────────────────────────────────────────

/**
 * Orthographic projection: drop z, center within given bounds.
 * Returns x, y in output space and depth for sorting.
 */
export function projectTo2D(point: Vec3, width: number, height: number): ProjectedPoint {
  return {
    x: point.x + width / 2,
    y: point.y + height / 2,
    depth: point.z,
  }
}

// ─── Lighting ─────────────────────────────────────────────────

/** Compute face normal from three vertices via cross product. */
export function computeFaceNormal(p1: Vec3, p2: Vec3, p3: Vec3): Vec3 {
  const u: Vec3 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z }
  const v: Vec3 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z }
  const cross: Vec3 = {
    x: u.y * v.z - u.z * v.y,
    y: u.z * v.x - u.x * v.z,
    z: u.x * v.y - u.y * v.x,
  }
  return normalize(cross)
}

/** Parse hex color to RGB components (0-255). */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const fullHex = clean.length === 3 ? clean[0]! + clean[0]! + clean[1]! + clean[1]! + clean[2]! + clean[2]! : clean
  return {
    r: parseInt(fullHex.substring(0, 2), 16),
    g: parseInt(fullHex.substring(2, 4), 16),
    b: parseInt(fullHex.substring(4, 6), 16),
  }
}

/**
 * Phong illumination model.
 * Returns a CSS rgb() color string for the shaded face.
 */
export function computePhongShading(
  normal: Vec3,
  lightDir: Vec3,
  viewDir: Vec3,
  material: MaterialConfig,
  lighting: LightingConfig,
): string {
  const n = normalize(normal)
  const l = normalize(lightDir)
  const v = normalize(viewDir)

  const baseColor = parseHexColor(material.color)

  // Ambient component
  const ambientFactor = material.ambient * lighting.ambientIntensity
  const ar = baseColor.r * ambientFactor
  const ag = baseColor.g * ambientFactor
  const ab = baseColor.b * ambientFactor

  // Diffuse component (Lambert)
  const nDotL = Math.max(0, dot(n, l))
  const diffuseFactor = nDotL * lighting.intensity * (1 - material.roughness)
  const dr = baseColor.r * diffuseFactor
  const dg = baseColor.g * diffuseFactor
  const db = baseColor.b * diffuseFactor

  // Specular component (Blinn-Phong)
  const reflectedDir = reflect({ x: -l.x, y: -l.y, z: -l.z }, n)
  const rDotV = Math.max(0, dot(reflectedDir, v))
  const specPower = Math.max(1, material.shininess)
  const specFactor = Math.pow(rDotV, specPower) * lighting.specularIntensity * lighting.intensity
  const sr = 255 * specFactor
  const sg = 255 * specFactor
  const sb = 255 * specFactor

  const r = Math.min(255, Math.round(ar + dr + sr))
  const g = Math.min(255, Math.round(ag + dg + sg))
  const b = Math.min(255, Math.round(ab + db + sb))

  return `rgb(${r},${g},${b})`
}

// ─── Main render function ─────────────────────────────────────

/**
 * Render a 3D extruded vector layer onto a 2D canvas.
 * Uses painter's algorithm (depth sort) for hidden-surface removal.
 */
export function render3DLayer(
  ctx: CanvasRenderingContext2D,
  segments: Segment[],
  config: Extrude3DConfig,
  bounds: { x: number; y: number; width: number; height: number },
): void {
  const geometry = extrudePath(segments, config.depth)
  if (geometry.front.length === 0) return

  // Build combined rotation matrix: Z * Y * X
  const rx = rotateX3D(config.rotateX)
  const ry = rotateY3D(config.rotateY)
  const rz = rotateZ3D(config.rotateZ)
  const rotationMatrix = multiply3x3(rz, multiply3x3(ry, rx))

  // Compute centroid of the geometry for rotation pivot
  let cx = 0
  let cy = 0
  let cz = 0
  const allPoints = [...geometry.front, ...geometry.back]
  for (const p of allPoints) {
    cx += p.x
    cy += p.y
    cz += p.z
  }
  cx /= allPoints.length
  cy /= allPoints.length
  cz /= allPoints.length

  // Transform function: center -> rotate -> uncenter
  function transformVert(p: Vec3): Vec3 {
    const centered: Vec3 = { x: p.x - cx, y: p.y - cy, z: p.z - cz }
    const rotated = transformPoint3D(centered, rotationMatrix)
    return { x: rotated.x + cx, y: rotated.y + cy, z: rotated.z + cz }
  }

  // Transform all geometry
  const tFront = geometry.front.map(transformVert)
  const tBack = geometry.back.map(transformVert)
  const tSides = geometry.sides.map((quad) => quad.map(transformVert))

  // View direction for specular (looking along -z)
  const viewDir: Vec3 = { x: 0, y: 0, z: -1 }

  // Project and build face list
  const faces: Face[] = []

  // Front face
  if (tFront.length >= 3) {
    const projected = tFront.map((p) => projectTo2D(p, bounds.width, bounds.height))
    const normal = computeFaceNormal(tFront[0]!, tFront[1]!, tFront[2]!)
    const avgDepth = projected.reduce((s, p) => s + p.depth, 0) / projected.length
    faces.push({ points2D: projected, normal, centroidDepth: avgDepth })
  }

  // Back face (reverse winding for correct normal direction)
  if (tBack.length >= 3) {
    const projected = tBack.map((p) => projectTo2D(p, bounds.width, bounds.height))
    const normal = computeFaceNormal(tBack[2]!, tBack[1]!, tBack[0]!)
    const avgDepth = projected.reduce((s, p) => s + p.depth, 0) / projected.length
    faces.push({ points2D: projected.slice().reverse(), normal, centroidDepth: avgDepth })
  }

  // Side faces
  for (const quad of tSides) {
    if (quad.length < 3) continue
    const projected = quad.map((p) => projectTo2D(p, bounds.width, bounds.height))
    const normal = computeFaceNormal(quad[0]!, quad[1]!, quad[2]!)
    const avgDepth = projected.reduce((s, p) => s + p.depth, 0) / projected.length
    faces.push({ points2D: projected, normal, centroidDepth: avgDepth })
  }

  // Sort faces by depth (painter's algorithm: far faces first)
  faces.sort((a, b) => b.centroidDepth - a.centroidDepth)

  // Render each face
  ctx.save()
  ctx.translate(bounds.x, bounds.y)

  for (const face of faces) {
    if (face.points2D.length < 3) continue

    const color = computePhongShading(face.normal, config.lighting.direction, viewDir, config.material, config.lighting)

    ctx.beginPath()
    ctx.moveTo(face.points2D[0]!.x, face.points2D[0]!.y)
    for (let i = 1; i < face.points2D.length; i++) {
      ctx.lineTo(face.points2D[i]!.x, face.points2D[i]!.y)
    }
    ctx.closePath()

    ctx.fillStyle = color
    ctx.fill()

    // Subtle edge stroke for definition
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  ctx.restore()
}
