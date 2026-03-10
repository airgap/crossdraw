import { useState, useCallback, useMemo } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type {
  DesignDocument,
  Artboard,
  Layer,
  VectorLayer,
  TextLayer,
} from '@/types'

// ──────────────────────────────────────────────
//  Types
// ──────────────────────────────────────────────

export type LintSeverity = 'warning' | 'info'

export type LintRuleId =
  | 'inconsistent-spacing'
  | 'misaligned-layers'
  | 'orphaned-hidden'
  | 'duplicate-colors'
  | 'font-inconsistency'
  | 'empty-groups'
  | 'oversized-layers'
  | 'missing-fills'

export interface LintFinding {
  ruleId: LintRuleId
  severity: LintSeverity
  description: string
  layerId: string
  layerName: string
  artboardId: string
  /** Optional fix action identifier */
  fixAction?: LintFixAction
}

export type LintFixAction =
  | { type: 'delete-layer'; artboardId: string; layerId: string }
  | { type: 'align-layer'; artboardId: string; layerId: string; x?: number; y?: number }
  | { type: 'snap-to'; artboardId: string; layerId: string; x: number; y: number }

export interface LintRuleConfig {
  id: LintRuleId
  label: string
  enabled: boolean
}

// ──────────────────────────────────────────────
//  Helper: flatten layers recursively
// ──────────────────────────────────────────────

interface FlatLayer {
  layer: Layer
  artboardId: string
  parentGroupId?: string
}

function flattenLayers(artboard: Artboard): FlatLayer[] {
  const result: FlatLayer[] = []
  function walk(layers: Layer[], parentGroupId?: string) {
    for (const layer of layers) {
      result.push({ layer, artboardId: artboard.id, parentGroupId })
      if (layer.type === 'group') {
        walk(layer.children, layer.id)
      }
    }
  }
  walk(artboard.layers)
  return result
}

// ──────────────────────────────────────────────
//  Helper: get layer bounding box (world coords)
// ──────────────────────────────────────────────

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function getLayerRect(layer: Layer): Rect {
  const t = layer.transform
  let w: number
  let h: number

  if (layer.type === 'vector' && layer.shapeParams) {
    w = layer.shapeParams.width * Math.abs(t.scaleX)
    h = layer.shapeParams.height * Math.abs(t.scaleY)
  } else if (layer.type === 'raster') {
    w = layer.width * Math.abs(t.scaleX)
    h = layer.height * Math.abs(t.scaleY)
  } else if (layer.type === 'text') {
    // Rough estimate for text bounding
    const fontSize = layer.fontSize || 16
    const textLen = (layer.text || '').length
    w = (layer.textWidth ?? textLen * fontSize * 0.6) * Math.abs(t.scaleX)
    h = (layer.textHeight ?? fontSize * 1.4 * ((layer.text || '').split('\n').length || 1)) * Math.abs(t.scaleY)
  } else {
    w = 100 * Math.abs(t.scaleX)
    h = 100 * Math.abs(t.scaleY)
  }

  return { x: t.x, y: t.y, width: w, height: h }
}

// ──────────────────────────────────────────────
//  Helper: parse hex color to RGB
// ──────────────────────────────────────────────

function parseHexToRGB(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, '')
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16)
    const g = parseInt(clean[1]! + clean[1]!, 16)
    const b = parseInt(clean[2]! + clean[2]!, 16)
    return [r, g, b]
  }
  if (clean.length === 6 || clean.length === 8) {
    const r = parseInt(clean.substring(0, 2), 16)
    const g = parseInt(clean.substring(2, 4), 16)
    const b = parseInt(clean.substring(4, 6), 16)
    return [r, g, b]
  }
  return null
}

/**
 * Simple sRGB delta-E approximation (Euclidean distance in sRGB space).
 * Not a true CIE delta-E but sufficient for detecting "very close" colors.
 */
export function colorDeltaE(c1: [number, number, number], c2: [number, number, number]): number {
  const dr = c1[0] - c2[0]
  const dg = c1[1] - c2[1]
  const db = c1[2] - c2[2]
  // Weighted Euclidean (redmean approximation for perceptual distance)
  const rMean = (c1[0] + c2[0]) / 2
  const wR = 2 + rMean / 256
  const wG = 4
  const wB = 2 + (255 - rMean) / 256
  return Math.sqrt(wR * dr * dr + wG * dg * dg + wB * db * db)
}

// ──────────────────────────────────────────────
//  Helper: collect all colors from a layer
// ──────────────────────────────────────────────

interface ColorRef {
  color: string
  layerId: string
  layerName: string
  artboardId: string
  source: 'fill' | 'stroke' | 'text-color'
}

function collectLayerColors(flat: FlatLayer): ColorRef[] {
  const refs: ColorRef[] = []
  const { layer, artboardId } = flat

  const addColor = (c: string, source: ColorRef['source']) => {
    if (c && c !== 'transparent' && c !== 'none') {
      refs.push({ color: c.toLowerCase(), layerId: layer.id, layerName: layer.name, artboardId, source })
    }
  }

  if (layer.type === 'vector') {
    if (layer.fill?.color) addColor(layer.fill.color, 'fill')
    if (layer.stroke?.color) addColor(layer.stroke.color, 'stroke')
    if (layer.additionalFills) {
      for (const f of layer.additionalFills) {
        if (f.color) addColor(f.color, 'fill')
      }
    }
    if (layer.additionalStrokes) {
      for (const s of layer.additionalStrokes) {
        if (s.color) addColor(s.color, 'stroke')
      }
    }
  } else if (layer.type === 'text') {
    addColor(layer.color, 'text-color')
  }

  return refs
}

// ──────────────────────────────────────────────
//  LINT RULES — pure functions
// ──────────────────────────────────────────────

/**
 * Rule: Inconsistent spacing between similar layers.
 * Groups layers by type and similar size, then checks gaps.
 */
export function lintInconsistentSpacing(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []
  const TOLERANCE = 2

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    // Group by type
    const byType = new Map<string, FlatLayer[]>()
    for (const f of flat) {
      if (f.layer.type === 'group' || f.layer.type === 'adjustment') continue
      const key = f.layer.type
      if (!byType.has(key)) byType.set(key, [])
      byType.get(key)!.push(f)
    }

    for (const [, group] of byType) {
      if (group.length < 3) continue

      // Check if sizes are similar (within 20% of each other)
      const rects = group.map((f) => ({ flat: f, rect: getLayerRect(f.layer) }))

      // Sort by x then by y to find row/column patterns
      const sortedByX = [...rects].sort((a, b) => a.rect.x - b.rect.x)

      // Check horizontal spacing consistency
      const hSpacings: { spacing: number; idx: number }[] = []
      for (let i = 1; i < sortedByX.length; i++) {
        const prev = sortedByX[i - 1]!
        const curr = sortedByX[i]!
        // Check if they're roughly on the same row (y within 20px)
        if (Math.abs(prev.rect.y - curr.rect.y) < 20) {
          const spacing = curr.rect.x - (prev.rect.x + prev.rect.width)
          hSpacings.push({ spacing, idx: i })
        }
      }

      if (hSpacings.length >= 2) {
        const avgSpacing = hSpacings.reduce((sum, s) => sum + s.spacing, 0) / hSpacings.length
        for (const s of hSpacings) {
          if (Math.abs(s.spacing - avgSpacing) > TOLERANCE) {
            const f = sortedByX[s.idx]!
            findings.push({
              ruleId: 'inconsistent-spacing',
              severity: 'warning',
              description: `Horizontal spacing (${s.spacing.toFixed(1)}px) differs from average (${avgSpacing.toFixed(1)}px) in group of similar layers`,
              layerId: f.flat.layer.id,
              layerName: f.flat.layer.name,
              artboardId: artboard.id,
            })
          }
        }
      }

      // Check vertical spacing consistency
      const sortedByY = [...rects].sort((a, b) => a.rect.y - b.rect.y)
      const vSpacings: { spacing: number; idx: number }[] = []
      for (let i = 1; i < sortedByY.length; i++) {
        const prev = sortedByY[i - 1]!
        const curr = sortedByY[i]!
        if (Math.abs(prev.rect.x - curr.rect.x) < 20) {
          const spacing = curr.rect.y - (prev.rect.y + prev.rect.height)
          vSpacings.push({ spacing, idx: i })
        }
      }

      if (vSpacings.length >= 2) {
        const avgSpacing = vSpacings.reduce((sum, s) => sum + s.spacing, 0) / vSpacings.length
        for (const s of vSpacings) {
          if (Math.abs(s.spacing - avgSpacing) > TOLERANCE) {
            const f = sortedByY[s.idx]!
            findings.push({
              ruleId: 'inconsistent-spacing',
              severity: 'warning',
              description: `Vertical spacing (${s.spacing.toFixed(1)}px) differs from average (${avgSpacing.toFixed(1)}px) in group of similar layers`,
              layerId: f.flat.layer.id,
              layerName: f.flat.layer.name,
              artboardId: artboard.id,
            })
          }
        }
      }
    }
  }

  return findings
}

/**
 * Rule: Misaligned layers — edges within 3px but not exactly aligned.
 */
export function lintMisalignedLayers(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []
  const THRESHOLD = 3

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    const rects = flat.map((f) => ({ flat: f, rect: getLayerRect(f.layer) }))

    for (let i = 0; i < rects.length; i++) {
      const a = rects[i]!
      for (let j = i + 1; j < rects.length; j++) {
        const b = rects[j]!

        // Check left edge alignment
        const leftDiff = Math.abs(a.rect.x - b.rect.x)
        if (leftDiff > 0 && leftDiff <= THRESHOLD) {
          findings.push({
            ruleId: 'misaligned-layers',
            severity: 'info',
            description: `Left edge is ${leftDiff.toFixed(1)}px off from "${b.flat.layer.name}" — consider aligning`,
            layerId: a.flat.layer.id,
            layerName: a.flat.layer.name,
            artboardId: artboard.id,
            fixAction: {
              type: 'snap-to',
              artboardId: artboard.id,
              layerId: a.flat.layer.id,
              x: b.rect.x,
              y: a.rect.y,
            },
          })
          continue // only report one issue per pair
        }

        // Check top edge alignment
        const topDiff = Math.abs(a.rect.y - b.rect.y)
        if (topDiff > 0 && topDiff <= THRESHOLD) {
          findings.push({
            ruleId: 'misaligned-layers',
            severity: 'info',
            description: `Top edge is ${topDiff.toFixed(1)}px off from "${b.flat.layer.name}" — consider aligning`,
            layerId: a.flat.layer.id,
            layerName: a.flat.layer.name,
            artboardId: artboard.id,
            fixAction: {
              type: 'snap-to',
              artboardId: artboard.id,
              layerId: a.flat.layer.id,
              x: a.rect.x,
              y: b.rect.y,
            },
          })
          continue
        }

        // Check right edge alignment
        const aRight = a.rect.x + a.rect.width
        const bRight = b.rect.x + b.rect.width
        const rightDiff = Math.abs(aRight - bRight)
        if (rightDiff > 0 && rightDiff <= THRESHOLD) {
          findings.push({
            ruleId: 'misaligned-layers',
            severity: 'info',
            description: `Right edge is ${rightDiff.toFixed(1)}px off from "${b.flat.layer.name}" — consider aligning`,
            layerId: a.flat.layer.id,
            layerName: a.flat.layer.name,
            artboardId: artboard.id,
            fixAction: {
              type: 'snap-to',
              artboardId: artboard.id,
              layerId: a.flat.layer.id,
              x: a.rect.x + (bRight - aRight),
              y: a.rect.y,
            },
          })
          continue
        }

        // Check bottom edge alignment
        const aBottom = a.rect.y + a.rect.height
        const bBottom = b.rect.y + b.rect.height
        const bottomDiff = Math.abs(aBottom - bBottom)
        if (bottomDiff > 0 && bottomDiff <= THRESHOLD) {
          findings.push({
            ruleId: 'misaligned-layers',
            severity: 'info',
            description: `Bottom edge is ${bottomDiff.toFixed(1)}px off from "${b.flat.layer.name}" — consider aligning`,
            layerId: a.flat.layer.id,
            layerName: a.flat.layer.name,
            artboardId: artboard.id,
            fixAction: {
              type: 'snap-to',
              artboardId: artboard.id,
              layerId: a.flat.layer.id,
              x: a.rect.x,
              y: a.rect.y + (bBottom - aBottom),
            },
          })
        }
      }
    }
  }

  return findings
}

/**
 * Rule: Orphaned/hidden layers — invisible or zero opacity.
 */
export function lintOrphanedHidden(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      const { layer } = f
      if (!layer.visible) {
        findings.push({
          ruleId: 'orphaned-hidden',
          severity: 'info',
          description: 'Layer is hidden — consider deleting if unused',
          layerId: layer.id,
          layerName: layer.name,
          artboardId: artboard.id,
          fixAction: { type: 'delete-layer', artboardId: artboard.id, layerId: layer.id },
        })
      } else if (layer.opacity === 0) {
        findings.push({
          ruleId: 'orphaned-hidden',
          severity: 'info',
          description: 'Layer has 0% opacity — consider deleting if unused',
          layerId: layer.id,
          layerName: layer.name,
          artboardId: artboard.id,
          fixAction: { type: 'delete-layer', artboardId: artboard.id, layerId: layer.id },
        })
      }
    }
  }

  return findings
}

/**
 * Rule: Duplicate colors — colors within delta-E < 5 but not identical.
 */
export function lintDuplicateColors(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []
  const DELTA_THRESHOLD = 5

  const allColors: ColorRef[] = []
  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      allColors.push(...collectLayerColors(f))
    }
  }

  // Build unique color list
  const uniqueColors = new Map<string, ColorRef[]>()
  for (const ref of allColors) {
    if (!uniqueColors.has(ref.color)) uniqueColors.set(ref.color, [])
    uniqueColors.get(ref.color)!.push(ref)
  }

  const colorEntries = [...uniqueColors.entries()]
  const reported = new Set<string>()

  for (let i = 0; i < colorEntries.length; i++) {
    const [colorA, refsA] = colorEntries[i]!
    const rgbA = parseHexToRGB(colorA)
    if (!rgbA) continue

    for (let j = i + 1; j < colorEntries.length; j++) {
      const [colorB] = colorEntries[j]!
      if (colorA === colorB) continue

      const rgbB = parseHexToRGB(colorB)
      if (!rgbB) continue

      const delta = colorDeltaE(rgbA, rgbB)
      if (delta > 0 && delta < DELTA_THRESHOLD) {
        const pairKey = [colorA, colorB].sort().join('|')
        if (reported.has(pairKey)) continue
        reported.add(pairKey)

        for (const ref of refsA) {
          findings.push({
            ruleId: 'duplicate-colors',
            severity: 'warning',
            description: `Color ${colorA} is very similar to ${colorB} (delta ${delta.toFixed(1)}) — consider consolidating`,
            layerId: ref.layerId,
            layerName: ref.layerName,
            artboardId: ref.artboardId,
          })
        }
      }
    }
  }

  return findings
}

/**
 * Rule: Font inconsistency — similar but not identical font settings.
 */
export function lintFontInconsistency(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []

  interface TextInfo {
    layer: TextLayer
    artboardId: string
  }

  const textLayers: TextInfo[] = []
  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      if (f.layer.type === 'text') {
        textLayers.push({ layer: f.layer, artboardId: artboard.id })
      }
    }
  }

  // Check font family inconsistency (case-insensitive matching)
  const familyGroups = new Map<string, TextInfo[]>()
  for (const ti of textLayers) {
    const key = ti.layer.fontFamily.toLowerCase().trim()
    if (!familyGroups.has(key)) familyGroups.set(key, [])
    familyGroups.get(key)!.push(ti)
  }

  // Find families that differ only in casing
  const familyKeys = [...familyGroups.keys()]
  for (let i = 0; i < familyKeys.length; i++) {
    for (let j = i + 1; j < familyKeys.length; j++) {
      const a = familyKeys[i]!
      const b = familyKeys[j]!
      // Check if they're the same when fully normalized
      if (a.replace(/[\s-_]/g, '') === b.replace(/[\s-_]/g, '')) {
        const layersB = familyGroups.get(b)!
        for (const ti of layersB) {
          findings.push({
            ruleId: 'font-inconsistency',
            severity: 'warning',
            description: `Font family "${ti.layer.fontFamily}" is similar to "${familyGroups.get(a)![0]!.layer.fontFamily}" — consider standardizing`,
            layerId: ti.layer.id,
            layerName: ti.layer.name,
            artboardId: ti.artboardId,
          })
        }
      }
    }
  }

  // Check font size inconsistency (sizes within 1px of each other)
  const sizeGroups = new Map<number, TextInfo[]>()
  for (const ti of textLayers) {
    const rounded = Math.round(ti.layer.fontSize)
    if (!sizeGroups.has(rounded)) sizeGroups.set(rounded, [])
    sizeGroups.get(rounded)!.push(ti)
  }

  const sizes = [...sizeGroups.keys()].sort((a, b) => a - b)
  for (let i = 0; i < sizes.length - 1; i++) {
    const sizeA = sizes[i]!
    const sizeB = sizes[i + 1]!
    if (sizeB - sizeA === 1) {
      // These sizes are suspiciously close
      const layersB = sizeGroups.get(sizeB)!
      for (const ti of layersB) {
        findings.push({
          ruleId: 'font-inconsistency',
          severity: 'info',
          description: `Font size ${ti.layer.fontSize}px is close to ${sizeA}px used elsewhere — consider standardizing`,
          layerId: ti.layer.id,
          layerName: ti.layer.name,
          artboardId: ti.artboardId,
        })
      }
    }
  }

  return findings
}

/**
 * Rule: Empty groups — groups with no children.
 */
export function lintEmptyGroups(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      if (f.layer.type === 'group' && f.layer.children.length === 0) {
        findings.push({
          ruleId: 'empty-groups',
          severity: 'warning',
          description: 'Empty group — consider deleting',
          layerId: f.layer.id,
          layerName: f.layer.name,
          artboardId: artboard.id,
          fixAction: { type: 'delete-layer', artboardId: artboard.id, layerId: f.layer.id },
        })
      }
    }
  }

  return findings
}

/**
 * Rule: Oversized layers — bounds extend beyond the artboard.
 */
export function lintOversizedLayers(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      if (f.layer.type === 'group') continue // groups don't have inherent size

      const rect = getLayerRect(f.layer)
      const exceeds =
        rect.x < artboard.x ||
        rect.y < artboard.y ||
        rect.x + rect.width > artboard.x + artboard.width ||
        rect.y + rect.height > artboard.y + artboard.height

      if (exceeds) {
        findings.push({
          ruleId: 'oversized-layers',
          severity: 'warning',
          description: 'Layer extends beyond artboard bounds',
          layerId: f.layer.id,
          layerName: f.layer.name,
          artboardId: artboard.id,
        })
      }
    }
  }

  return findings
}

/**
 * Rule: Missing fills — vector layers with no fill and no stroke.
 */
export function lintMissingFills(doc: DesignDocument): LintFinding[] {
  const findings: LintFinding[] = []

  for (const artboard of doc.artboards) {
    const flat = flattenLayers(artboard)
    for (const f of flat) {
      if (f.layer.type !== 'vector') continue
      const v = f.layer as VectorLayer

      const hasFill = v.fill !== null || (v.additionalFills && v.additionalFills.length > 0)
      const hasStroke = v.stroke !== null || (v.additionalStrokes && v.additionalStrokes.length > 0)

      if (!hasFill && !hasStroke) {
        findings.push({
          ruleId: 'missing-fills',
          severity: 'warning',
          description: 'Vector layer has no fill and no stroke — it will be invisible',
          layerId: v.id,
          layerName: v.name,
          artboardId: artboard.id,
          fixAction: { type: 'delete-layer', artboardId: artboard.id, layerId: v.id },
        })
      }
    }
  }

  return findings
}

// ──────────────────────────────────────────────
//  Run all lint rules
// ──────────────────────────────────────────────

export interface LintRuleRunner {
  id: LintRuleId
  label: string
  run: (doc: DesignDocument) => LintFinding[]
}

export const LINT_RULES: LintRuleRunner[] = [
  { id: 'inconsistent-spacing', label: 'Inconsistent Spacing', run: lintInconsistentSpacing },
  { id: 'misaligned-layers', label: 'Misaligned Layers', run: lintMisalignedLayers },
  { id: 'orphaned-hidden', label: 'Orphaned/Hidden Layers', run: lintOrphanedHidden },
  { id: 'duplicate-colors', label: 'Duplicate Colors', run: lintDuplicateColors },
  { id: 'font-inconsistency', label: 'Font Inconsistency', run: lintFontInconsistency },
  { id: 'empty-groups', label: 'Empty Groups', run: lintEmptyGroups },
  { id: 'oversized-layers', label: 'Oversized Layers', run: lintOversizedLayers },
  { id: 'missing-fills', label: 'Missing Fills', run: lintMissingFills },
]

export function runAllLintRules(doc: DesignDocument, enabledRules: Set<LintRuleId>): LintFinding[] {
  const findings: LintFinding[] = []
  for (const rule of LINT_RULES) {
    if (enabledRules.has(rule.id)) {
      findings.push(...rule.run(doc))
    }
  }
  return findings
}

// ──────────────────────────────────────────────
//  Severity icon
// ──────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: LintSeverity }) {
  if (severity === 'warning') {
    return (
      <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
        <path d="M8 1L1 14h14L8 1z" fill="#e8a83e" stroke="#c88b2e" strokeWidth="0.5" />
        <text x="8" y="12" textAnchor="middle" fontSize="9" fontWeight="bold" fill="#000">
          !
        </text>
      </svg>
    )
  }
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" fill="#4a9eed" stroke="#3a7ecd" strokeWidth="0.5" />
      <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff">
        i
      </text>
    </svg>
  )
}

// ──────────────────────────────────────────────
//  Panel Component
// ──────────────────────────────────────────────

const DEFAULT_ENABLED_RULES = new Set<LintRuleId>([
  'inconsistent-spacing',
  'misaligned-layers',
  'orphaned-hidden',
  'duplicate-colors',
  'font-inconsistency',
  'empty-groups',
  'oversized-layers',
  'missing-fills',
])

export function DesignLintPanel() {
  const doc = useEditorStore((s) => s.document)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const deleteLayer = useEditorStore((s) => s.deleteLayer)
  const updateLayer = useEditorStore((s) => s.updateLayer)

  const [findings, setFindings] = useState<LintFinding[]>([])
  const [hasScanned, setHasScanned] = useState(false)
  const [enabledRules, setEnabledRules] = useState<Set<LintRuleId>>(new Set(DEFAULT_ENABLED_RULES))
  const [showRuleConfig, setShowRuleConfig] = useState(false)

  const handleScan = useCallback(() => {
    const results = runAllLintRules(doc, enabledRules)
    setFindings(results)
    setHasScanned(true)
  }, [doc, enabledRules])

  const toggleRule = useCallback((ruleId: LintRuleId) => {
    setEnabledRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return next
    })
  }, [])

  const handleFindingClick = useCallback(
    (finding: LintFinding) => {
      selectLayer(finding.layerId)
    },
    [selectLayer],
  )

  const handleFix = useCallback(
    (finding: LintFinding) => {
      if (!finding.fixAction) return

      switch (finding.fixAction.type) {
        case 'delete-layer':
          deleteLayer(finding.fixAction.artboardId, finding.fixAction.layerId)
          // Remove this finding from the list
          setFindings((prev) => prev.filter((f) => f.layerId !== finding.layerId))
          break
        case 'snap-to':
        case 'align-layer':
          updateLayer(finding.fixAction.artboardId, finding.fixAction.layerId, {
            transform: {
              ...doc.artboards
                .flatMap((a) => {
                  function findDeep(layers: Layer[]): Layer | undefined {
                    for (const l of layers) {
                      if (l.id === finding.fixAction!.layerId) return l
                      if (l.type === 'group') {
                        const found = findDeep(l.children)
                        if (found) return found
                      }
                    }
                    return undefined
                  }
                  return a.layers.map((l) => findDeep([l])).filter(Boolean) as Layer[]
                })
                .find((l) => l.id === finding.fixAction!.layerId)!.transform,
              x: finding.fixAction.x ?? 0,
              y: finding.fixAction.y ?? 0,
            },
          } as Partial<Layer>)
          // Remove this finding from the list
          setFindings((prev) => prev.filter((f) => f !== finding))
          break
      }
    },
    [deleteLayer, updateLayer, doc],
  )

  // Group findings by rule
  const grouped = useMemo(() => {
    const map = new Map<LintRuleId, LintFinding[]>()
    for (const f of findings) {
      if (!map.has(f.ruleId)) map.set(f.ruleId, [])
      map.get(f.ruleId)!.push(f)
    }
    return map
  }, [findings])

  const warningCount = findings.filter((f) => f.severity === 'warning').length
  const infoCount = findings.filter((f) => f.severity === 'info').length

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-tertiary)',
    marginBottom: 4,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  }

  const findingRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 6px',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm, 4px)',
    fontSize: 11,
    lineHeight: '16px',
  }

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Scan button */}
      <button
        onClick={handleScan}
        style={{
          padding: '6px 12px',
          border: 'none',
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'var(--accent)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Scan Design
      </button>

      {/* Rule toggle button */}
      <button
        onClick={() => setShowRuleConfig((v) => !v)}
        style={{
          padding: '4px 8px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm, 4px)',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        {showRuleConfig ? 'Hide Rules' : 'Configure Rules'}
      </button>

      {/* Rule config */}
      {showRuleConfig && (
        <div
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: 6,
          }}
        >
          {LINT_RULES.map((rule) => (
            <label
              key={rule.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 0',
                fontSize: 11,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={enabledRules.has(rule.id)}
                onChange={() => toggleRule(rule.id)}
                style={{ margin: 0 }}
              />
              {rule.label}
            </label>
          ))}
        </div>
      )}

      {/* Summary */}
      {hasScanned && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            padding: '4px 6px',
            background: 'var(--bg-elevated, rgba(255,255,255,0.05))',
            borderRadius: 'var(--radius-sm, 4px)',
          }}
        >
          {findings.length === 0
            ? 'No issues found'
            : `${warningCount} warning${warningCount !== 1 ? 's' : ''}, ${infoCount} suggestion${infoCount !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Findings grouped by rule */}
      {hasScanned && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 400, overflowY: 'auto' }}>
          {LINT_RULES.filter((r) => grouped.has(r.id)).map((rule) => {
            const rulefindings = grouped.get(rule.id)!
            return (
              <div key={rule.id}>
                <div style={sectionHeaderStyle}>
                  {rule.label} ({rulefindings.length})
                </div>
                {rulefindings.map((finding, idx) => (
                  <div
                    key={`${finding.layerId}-${idx}`}
                    style={findingRowStyle}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.background =
                        'var(--bg-hover, rgba(255,255,255,0.08))'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
                    }}
                    onClick={() => handleFindingClick(finding)}
                  >
                    <SeverityIcon severity={finding.severity} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={finding.description}
                      >
                        {finding.description}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{finding.layerName}</div>
                    </div>
                    {finding.fixAction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleFix(finding)
                        }}
                        style={{
                          padding: '2px 8px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm, 4px)',
                          background: 'transparent',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                        title="Auto-fix this issue"
                      >
                        Fix
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
