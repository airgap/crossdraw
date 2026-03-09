/**
 * Tool-specific option defaults that persist during a session.
 * These are read by shape/line/pen/text tools when creating new objects,
 * and by the ToolOptionsBar UI to display and edit them.
 */

// ── Shape defaults (rectangle, polygon, star) ──

interface ShapeDefaults {
  cornerRadius: number
  polygonSides: number
  starPoints: number
  starInnerRatio: number
}

const shapeDefaults: ShapeDefaults = {
  cornerRadius: 0,
  polygonSides: 6,
  starPoints: 5,
  starInnerRatio: 0.4,
}

export function getShapeDefaults(): ShapeDefaults {
  return { ...shapeDefaults }
}

export function setShapeDefaults(patch: Partial<ShapeDefaults>) {
  Object.assign(shapeDefaults, patch)
}

// ── Pen / pencil defaults ──

interface PenDefaults {
  strokeWidth: number
  strokeColor: string
}

const penDefaults: PenDefaults = {
  strokeWidth: 2,
  strokeColor: '#000000',
}

export function getPenDefaults(): PenDefaults {
  return { ...penDefaults }
}

export function setPenDefaults(patch: Partial<PenDefaults>) {
  Object.assign(penDefaults, patch)
}

// ── Line defaults ──

interface LineDefaults {
  strokeWidth: number
  strokeColor: string
}

const lineDefaults: LineDefaults = {
  strokeWidth: 2,
  strokeColor: '#000000',
}

export function getLineDefaults(): LineDefaults {
  return { ...lineDefaults }
}

export function setLineDefaults(patch: Partial<LineDefaults>) {
  Object.assign(lineDefaults, patch)
}

// ── Text defaults ──

interface TextDefaults {
  fontFamily: string
  fontSize: number
}

const textDefaults: TextDefaults = {
  fontFamily: 'sans-serif',
  fontSize: 16,
}

export function getTextDefaults(): TextDefaults {
  return { ...textDefaults }
}

export function setTextDefaults(patch: Partial<TextDefaults>) {
  Object.assign(textDefaults, patch)
}

// ── Fill tool defaults ──

interface FillDefaults {
  fillColor: string
}

const fillDefaults: FillDefaults = {
  fillColor: '#4a7dff',
}

export function getFillDefaults(): FillDefaults {
  return { ...fillDefaults }
}

export function setFillDefaults(patch: Partial<FillDefaults>) {
  Object.assign(fillDefaults, patch)
}

// ── Gradient defaults ──

interface GradientDefaults {
  gradientType: 'linear' | 'radial'
}

const gradientDefaults: GradientDefaults = {
  gradientType: 'linear',
}

export function getGradientDefaults(): GradientDefaults {
  return { ...gradientDefaults }
}

export function setGradientDefaults(patch: Partial<GradientDefaults>) {
  Object.assign(gradientDefaults, patch)
}

// ── Zoom mode ──

let zoomMode: 'in' | 'out' = 'in'

export function getZoomMode(): 'in' | 'out' {
  return zoomMode
}

export function setZoomMode(mode: 'in' | 'out') {
  zoomMode = mode
}
