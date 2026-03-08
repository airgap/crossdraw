import { v4 as uuid } from 'uuid'
import type { Effect, BlurParams, ShadowParams, GlowParams } from '@/types'

/**
 * Parse SVG <filter> elements and map them to our Effect types.
 */
export function parseSVGFilter(filterEl: Element): Effect[] {
  const effects: Effect[] = []

  // Check for feGaussianBlur
  const blur = filterEl.querySelector('feGaussianBlur')
  if (blur) {
    const stdDev = parseFloat(blur.getAttribute('stdDeviation') ?? '0')
    const inAttr = blur.getAttribute('in') ?? 'SourceGraphic'
    const result = blur.getAttribute('result') ?? ''

    // Check if this blur feeds into an feMerge (glow pattern)
    const merge = filterEl.querySelector('feMerge')
    if (merge && result) {
      // Blur + Merge = Glow effect
      effects.push({
        id: uuid(),
        type: 'outer-glow',
        enabled: true,
        opacity: 1,
        params: {
          kind: 'glow',
          radius: stdDev,
          spread: 0,
          color: '#ffffff',
          opacity: 0.8,
        } as GlowParams,
      })
    } else if (inAttr === 'SourceGraphic' || inAttr === 'SourceAlpha') {
      // Simple blur
      effects.push({
        id: uuid(),
        type: 'blur',
        enabled: true,
        opacity: 1,
        params: {
          kind: 'blur',
          radius: stdDev,
          quality: 'medium',
        } as BlurParams,
      })
    }
  }

  // Check for feDropShadow
  const dropShadow = filterEl.querySelector('feDropShadow')
  if (dropShadow) {
    const dx = parseFloat(dropShadow.getAttribute('dx') ?? '0')
    const dy = parseFloat(dropShadow.getAttribute('dy') ?? '0')
    const stdDev = parseFloat(dropShadow.getAttribute('stdDeviation') ?? '0')
    const color = dropShadow.getAttribute('flood-color') ?? '#000000'
    const opacity = parseFloat(dropShadow.getAttribute('flood-opacity') ?? '1')

    effects.push({
      id: uuid(),
      type: 'drop-shadow',
      enabled: true,
      opacity: 1,
      params: {
        kind: 'shadow',
        offsetX: dx,
        offsetY: dy,
        blurRadius: stdDev,
        spread: 0,
        color,
        opacity,
      } as ShadowParams,
    })
  }

  // Check for feOffset + feGaussianBlur combo (manual drop-shadow)
  const feOffset = filterEl.querySelector('feOffset')
  if (feOffset && blur && !dropShadow) {
    const dx = parseFloat(feOffset.getAttribute('dx') ?? '0')
    const dy = parseFloat(feOffset.getAttribute('dy') ?? '0')
    const stdDev = parseFloat(blur.getAttribute('stdDeviation') ?? '0')

    // Check if there's a feFlood for color
    const feFlood = filterEl.querySelector('feFlood')
    const color = feFlood?.getAttribute('flood-color') ?? '#000000'
    const opacity = parseFloat(feFlood?.getAttribute('flood-opacity') ?? '0.5')

    if (!filterEl.querySelector('feMerge')) {
      effects.push({
        id: uuid(),
        type: 'shadow',
        enabled: true,
        opacity: 1,
        params: {
          kind: 'shadow',
          offsetX: dx,
          offsetY: dy,
          blurRadius: stdDev,
          spread: 0,
          color,
          opacity,
        } as ShadowParams,
      })
    }
  }

  return effects
}

/**
 * Parse all <filter> defs in an SVG and return a map of filter ID -> effects.
 */
export function parseSVGFilterDefs(svgEl: Element): Map<string, Effect[]> {
  const filterMap = new Map<string, Effect[]>()

  for (const filterEl of svgEl.querySelectorAll('filter')) {
    const id = filterEl.getAttribute('id')
    if (!id) continue
    const effects = parseSVGFilter(filterEl)
    if (effects.length > 0) {
      filterMap.set(id, effects)
    }
  }

  return filterMap
}

/**
 * Resolve a filter reference (e.g. "url(#shadow1)") to effects.
 */
export function resolveFilterReference(
  filterAttr: string | null,
  filterMap: Map<string, Effect[]>,
): Effect[] {
  if (!filterAttr) return []
  const match = filterAttr.match(/url\(#([^)]+)\)/)
  if (!match) return []
  return filterMap.get(match[1]!) ?? []
}

/**
 * Generate SVG filter XML for our Effect types.
 */
export function effectToSVGFilter(effect: Effect): string | null {
  if (!effect.enabled) return null

  const filterId = `filter-${effect.id}`
  switch (effect.params.kind) {
    case 'blur': {
      const p = effect.params as BlurParams
      return `<filter id="${filterId}"><feGaussianBlur in="SourceGraphic" stdDeviation="${p.radius}" /></filter>`
    }
    case 'shadow': {
      const p = effect.params as ShadowParams
      return `<filter id="${filterId}"><feDropShadow dx="${p.offsetX}" dy="${p.offsetY}" stdDeviation="${p.blurRadius}" flood-color="${p.color}" flood-opacity="${p.opacity}" /></filter>`
    }
    case 'glow': {
      const p = effect.params as GlowParams
      return [
        `<filter id="${filterId}">`,
        `  <feGaussianBlur in="SourceAlpha" stdDeviation="${p.radius}" result="blur" />`,
        `  <feFlood flood-color="${p.color}" flood-opacity="${p.opacity}" result="color" />`,
        `  <feComposite in="color" in2="blur" operator="in" result="glow" />`,
        `  <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>`,
        `</filter>`,
      ].join('\n')
    }
    default:
      return null
  }
}
