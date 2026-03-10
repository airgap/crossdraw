import { v4 as uuid } from 'uuid'
import type { Layer, GroupLayer, Transform } from '@/types'

// ── Repeater Config ──

export interface RepeaterConfig {
  mode: 'linear' | 'radial' | 'grid'
  count: number
  linearSpacing: number
  linearAngle: number
  gridRows: number
  gridColumns: number
  gridRowGap: number
  gridColumnGap: number
  radialRadius: number
  radialStartAngle: number
  radialEndAngle: number
  progressiveRotation: number
  progressiveScale: number
  progressiveOpacity: number
}

export function createDefaultRepeaterConfig(): RepeaterConfig {
  return {
    mode: 'linear',
    count: 5,
    linearSpacing: 50,
    linearAngle: 0,
    gridRows: 3,
    gridColumns: 3,
    gridRowGap: 50,
    gridColumnGap: 50,
    radialRadius: 100,
    radialStartAngle: 0,
    radialEndAngle: 360,
    progressiveRotation: 0,
    progressiveScale: 0,
    progressiveOpacity: 0,
  }
}

// ── Deep clone a layer with a new ID and name ──

function cloneLayer(layer: Layer, suffix: string): Layer {
  const json = JSON.parse(JSON.stringify(layer)) as Layer
  json.id = uuid()
  json.name = `${layer.name} ${suffix}`
  // Recursively re-ID children for group layers
  if (json.type === 'group') {
    json.children = json.children.map((child, idx) => cloneLayer(child, `${suffix}.${idx + 1}`))
  }
  return json
}

// ── Generate repeater instances ──

export function generateRepeaterInstances(sourceLayer: Layer, config: RepeaterConfig): Layer[] {
  const instances: Layer[] = []

  for (let i = 1; i <= config.count; i++) {
    const clone = cloneLayer(sourceLayer, `#${i + 1}`)

    // Compute base transform offset for this instance
    const baseTransform = computeInstanceTransform(sourceLayer.transform, config, i)

    // Apply progressive effects
    const progressFraction = i / config.count

    clone.transform = {
      ...clone.transform,
      x: baseTransform.x,
      y: baseTransform.y,
      scaleX: clone.transform.scaleX * (1 + config.progressiveScale * progressFraction),
      scaleY: clone.transform.scaleY * (1 + config.progressiveScale * progressFraction),
      rotation: clone.transform.rotation + config.progressiveRotation * i,
    }

    // Progressive opacity: decrease from source opacity
    const opacityDelta = config.progressiveOpacity * progressFraction
    clone.opacity = Math.max(0, Math.min(1, sourceLayer.opacity - opacityDelta))

    instances.push(clone)
  }

  return instances
}

// ── Compute the transform for instance at index ──

function computeInstanceTransform(
  sourceTransform: Transform,
  config: RepeaterConfig,
  index: number,
): { x: number; y: number } {
  switch (config.mode) {
    case 'linear': {
      const angleRad = (config.linearAngle * Math.PI) / 180
      const dx = Math.cos(angleRad) * config.linearSpacing * index
      const dy = Math.sin(angleRad) * config.linearSpacing * index
      return {
        x: sourceTransform.x + dx,
        y: sourceTransform.y + dy,
      }
    }
    case 'grid': {
      // The source is at (0,0) position; instances fill the grid starting from (1, 0)
      // index starts at 1 (first clone), so index=1 maps to the second cell
      const c = index % config.gridColumns
      const r = Math.floor(index / config.gridColumns)
      return {
        x: sourceTransform.x + c * config.gridColumnGap,
        y: sourceTransform.y + r * config.gridRowGap,
      }
    }
    case 'radial': {
      const totalAngle = config.radialEndAngle - config.radialStartAngle
      // Distribute count+1 items (source + clones) across the angle range
      const totalItems = config.count + 1
      const angleStep = totalAngle / totalItems
      const angleDeg = config.radialStartAngle + angleStep * index
      const angleRad = (angleDeg * Math.PI) / 180
      return {
        x: sourceTransform.x + Math.cos(angleRad) * config.radialRadius,
        y: sourceTransform.y + Math.sin(angleRad) * config.radialRadius,
      }
    }
  }
}

// ── Create a group wrapping source + clones ──

export function createRepeaterGroup(sourceLayer: Layer, instances: Layer[]): GroupLayer {
  return {
    id: uuid(),
    name: `${sourceLayer.name} Repeat`,
    type: 'group',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    children: [cloneLayer(sourceLayer, '#1'), ...instances],
  }
}
