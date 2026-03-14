/**
 * Smart Animate (#94)
 *
 * Automatically matches layers between two frames (artboards) by name/id and
 * interpolates their visual properties to produce smooth transitions.
 *
 * Matched properties: position (x, y), size (scaleX, scaleY), rotation,
 * opacity, and fill/stroke colours.
 *
 * Layers that exist in only one frame are faded in/out.
 */

import type { Layer } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface LayerState {
  id: string
  name: string
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  opacity: number
  fillColor?: string
  strokeColor?: string
}

export interface SmartAnimateSettings {
  /** Duration of the transition in milliseconds. */
  duration: number
  /** Easing function name. */
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  /** Match layers by name (true) or by id (false). */
  matchByName: boolean
}

export const DEFAULT_SMART_ANIMATE_SETTINGS: SmartAnimateSettings = {
  duration: 300,
  easing: 'ease-in-out',
  matchByName: true,
}

// ── Easing functions ─────────────────────────────────────────────────────────

function getEasing(name: SmartAnimateSettings['easing']): (t: number) => number {
  switch (name) {
    case 'linear':
      return (t) => t
    case 'ease-in':
      return (t) => t * t
    case 'ease-out':
      return (t) => 1 - (1 - t) * (1 - t)
    case 'ease-in-out':
      return (t) => t * t * (3 - 2 * t)
  }
}

// ── Colour interpolation ────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [cl(r), cl(g), cl(b)].map((c) => c.toString(16).padStart(2, '0')).join('')
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  return toHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

// ── Layer extraction ─────────────────────────────────────────────────────────

function extractLayerState(layer: Layer): LayerState {
  const state: LayerState = {
    id: layer.id,
    name: layer.name,
    x: layer.transform.x,
    y: layer.transform.y,
    scaleX: layer.transform.scaleX,
    scaleY: layer.transform.scaleY,
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
  }

  if (layer.type === 'vector' && layer.fill?.color) {
    state.fillColor = layer.fill.color
  }
  if (layer.type === 'vector' && layer.stroke?.color) {
    state.strokeColor = layer.stroke.color
  }
  if (layer.type === 'text') {
    state.fillColor = layer.color
  }

  return state
}

function flattenLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    result.push(layer)
    if (layer.type === 'group') {
      result.push(...flattenLayers(layer.children))
    }
  }
  return result
}

// ── Matching ─────────────────────────────────────────────────────────────────

interface LayerMatch {
  from: LayerState
  to: LayerState
}

interface LayerAppearance {
  state: LayerState
  direction: 'enter' | 'exit'
}

export interface TransitionPlan {
  matches: LayerMatch[]
  appearances: LayerAppearance[]
}

/**
 * Build a transition plan by matching layers between two sets.
 */
export function buildTransitionPlan(
  fromLayers: Layer[],
  toLayers: Layer[],
  settings: SmartAnimateSettings = DEFAULT_SMART_ANIMATE_SETTINGS,
): TransitionPlan {
  const flatFrom = flattenLayers(fromLayers)
  const flatTo = flattenLayers(toLayers)

  const fromStates = flatFrom.map(extractLayerState)
  const toStates = flatTo.map(extractLayerState)

  const matches: LayerMatch[] = []
  const appearances: LayerAppearance[] = []

  const matchedToIds = new Set<string>()

  for (const fromState of fromStates) {
    const match = toStates.find((ts) => (settings.matchByName ? ts.name === fromState.name : ts.id === fromState.id))

    if (match) {
      matches.push({ from: fromState, to: match })
      matchedToIds.add(settings.matchByName ? match.name : match.id)
    } else {
      appearances.push({ state: fromState, direction: 'exit' })
    }
  }

  // Layers that only exist in "to"
  for (const toState of toStates) {
    const key = settings.matchByName ? toState.name : toState.id
    if (!matchedToIds.has(key)) {
      appearances.push({ state: toState, direction: 'enter' })
    }
  }

  return { matches, appearances }
}

// ── Interpolation ────────────────────────────────────────────────────────────

/**
 * Compute the interpolated state of a matched layer pair at time t (0-1).
 */
export function computeLayerTransition(
  fromLayer: Layer,
  toLayer: Layer,
  t: number,
  settings: SmartAnimateSettings = DEFAULT_SMART_ANIMATE_SETTINGS,
): LayerState {
  const easingFn = getEasing(settings.easing)
  const et = easingFn(Math.max(0, Math.min(1, t)))

  const from = extractLayerState(fromLayer)
  const to = extractLayerState(toLayer)

  const lerp = (a: number, b: number) => a + (b - a) * et

  const result: LayerState = {
    id: from.id,
    name: from.name,
    x: lerp(from.x, to.x),
    y: lerp(from.y, to.y),
    scaleX: lerp(from.scaleX, to.scaleX),
    scaleY: lerp(from.scaleY, to.scaleY),
    rotation: lerp(from.rotation, to.rotation),
    opacity: lerp(from.opacity, to.opacity),
  }

  if (from.fillColor && to.fillColor) {
    result.fillColor = lerpColor(from.fillColor, to.fillColor, et)
  }
  if (from.strokeColor && to.strokeColor) {
    result.strokeColor = lerpColor(from.strokeColor, to.strokeColor, et)
  }

  return result
}

/**
 * Compute all layer states at time t for a full transition plan.
 */
export function computeTransitionFrame(
  plan: TransitionPlan,
  t: number,
  settings: SmartAnimateSettings = DEFAULT_SMART_ANIMATE_SETTINGS,
): LayerState[] {
  const easingFn = getEasing(settings.easing)
  const et = easingFn(Math.max(0, Math.min(1, t)))
  const lerp = (a: number, b: number) => a + (b - a) * et

  const states: LayerState[] = []

  // Matched layers: interpolate
  for (const match of plan.matches) {
    states.push({
      id: match.from.id,
      name: match.from.name,
      x: lerp(match.from.x, match.to.x),
      y: lerp(match.from.y, match.to.y),
      scaleX: lerp(match.from.scaleX, match.to.scaleX),
      scaleY: lerp(match.from.scaleY, match.to.scaleY),
      rotation: lerp(match.from.rotation, match.to.rotation),
      opacity: lerp(match.from.opacity, match.to.opacity),
      fillColor:
        match.from.fillColor && match.to.fillColor
          ? lerpColor(match.from.fillColor, match.to.fillColor, et)
          : match.from.fillColor ?? match.to.fillColor,
      strokeColor:
        match.from.strokeColor && match.to.strokeColor
          ? lerpColor(match.from.strokeColor, match.to.strokeColor, et)
          : match.from.strokeColor ?? match.to.strokeColor,
    })
  }

  // Appearing/disappearing layers: fade in/out
  for (const app of plan.appearances) {
    const s = { ...app.state }
    if (app.direction === 'enter') {
      s.opacity = s.opacity * et
    } else {
      s.opacity = s.opacity * (1 - et)
    }
    states.push(s)
  }

  return states
}
