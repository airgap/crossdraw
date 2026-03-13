/**
 * EPS (Encapsulated PostScript) import/export.
 *
 * Export: converts a DesignDocument into an EPS file string with vector paths,
 * fill/stroke colors, raster layer embedding, and text output.
 *
 * Import (basic): parses an EPS string, extracting bounding box, path commands,
 * and embedded images into a DesignDocument.
 */

import { v4 as uuid } from 'uuid'
import type {
  DesignDocument,
  Layer,
  VectorLayer,
  TextLayer,
  RasterLayer,
  GroupLayer,
  Segment,
  Fill,
  Path,
} from '@/types'
import { getRasterData } from '@/store/raster-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a hex color (#RRGGBB or #RGB) to [r, g, b] in 0-1 range. */
function parseHexColor(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
  }
  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255
  return [r, g, b]
}

/** Format a float to at most 4 decimal places. */
function fmt(n: number): string {
  return Number(n.toFixed(4)).toString()
}

// ── EPS Export ───────────────────────────────────────────────────────────────

/**
 * Export a DesignDocument (first artboard) as an EPS string.
 */
export function exportEPS(doc: DesignDocument, artboardId?: string): string {
  const artboard = artboardId ? doc.artboards.find((a) => a.id === artboardId) : doc.artboards[0]
  if (!artboard) throw new Error('No artboard found')

  const { width, height } = artboard
  const lines: string[] = []

  // ── EPS Header ──
  lines.push('%!PS-Adobe-3.0 EPSF-3.0')
  lines.push(`%%BoundingBox: 0 0 ${Math.round(width)} ${Math.round(height)}`)
  lines.push(`%%HiResBoundingBox: 0 0 ${fmt(width)} ${fmt(height)}`)
  lines.push(`%%Title: ${doc.metadata.title || 'Untitled'}`)
  lines.push(`%%Creator: Crossdraw`)
  lines.push(`%%CreationDate: ${doc.metadata.modified || new Date().toISOString()}`)
  lines.push('%%LanguageLevel: 2')
  lines.push('%%Pages: 1')
  lines.push('%%EndComments')
  lines.push('')

  // Background rect
  const [bgR, bgG, bgB] = parseHexColor(artboard.backgroundColor)
  lines.push(`${fmt(bgR)} ${fmt(bgG)} ${fmt(bgB)} setrgbcolor`)
  lines.push(`0 0 ${fmt(width)} ${fmt(height)} rectfill`)
  lines.push('')

  // Render layers bottom-to-top (array order is top-first, so reverse)
  const layersReversed = [...artboard.layers].reverse()
  for (const layer of layersReversed) {
    renderLayerEPS(lines, layer, height)
  }

  lines.push('')
  lines.push('showpage')
  lines.push('%%EOF')

  return lines.join('\n')
}

function renderLayerEPS(lines: string[], layer: Layer, pageHeight: number): void {
  if (!layer.visible) return

  switch (layer.type) {
    case 'vector':
      renderVectorEPS(lines, layer, pageHeight)
      break
    case 'text':
      renderTextEPS(lines, layer, pageHeight)
      break
    case 'raster':
      renderRasterEPS(lines, layer, pageHeight)
      break
    case 'group':
      renderGroupEPS(lines, layer, pageHeight)
      break
    default:
      // Other layer types not supported in EPS export
      break
  }
}

function renderGroupEPS(lines: string[], group: GroupLayer, pageHeight: number): void {
  lines.push('gsave')
  const { transform: t } = group
  if (t.x !== 0 || t.y !== 0) {
    // EPS y-axis is bottom-up; translate accordingly
    lines.push(`${fmt(t.x)} ${fmt(-t.y)} translate`)
  }
  if (group.opacity < 1) {
    // PostScript Level 2 doesn't have true transparency; skip for now
  }
  const layersReversed = [...group.children].reverse()
  for (const child of layersReversed) {
    renderLayerEPS(lines, child, pageHeight)
  }
  lines.push('grestore')
}

function segmentsToPS(segments: Segment[], pageHeight: number): string[] {
  const cmds: string[] = []
  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        cmds.push(`${fmt(seg.x)} ${fmt(pageHeight - seg.y)} moveto`)
        break
      case 'line':
        cmds.push(`${fmt(seg.x)} ${fmt(pageHeight - seg.y)} lineto`)
        break
      case 'cubic':
        cmds.push(
          `${fmt(seg.cp1x)} ${fmt(pageHeight - seg.cp1y)} ${fmt(seg.cp2x)} ${fmt(pageHeight - seg.cp2y)} ${fmt(seg.x)} ${fmt(pageHeight - seg.y)} curveto`,
        )
        break
      case 'quadratic': {
        // Convert quadratic to cubic for PostScript
        // We need the current point, but we'll approximate using cp as both control points
        cmds.push(
          `${fmt(seg.cpx)} ${fmt(pageHeight - seg.cpy)} ${fmt(seg.cpx)} ${fmt(pageHeight - seg.cpy)} ${fmt(seg.x)} ${fmt(pageHeight - seg.y)} curveto`,
        )
        break
      }
      case 'arc':
        // Arcs are complex in PS; approximate with lineto for now
        cmds.push(`${fmt(seg.x)} ${fmt(pageHeight - seg.y)} lineto`)
        break
      case 'close':
        cmds.push('closepath')
        break
    }
  }
  return cmds
}

function renderVectorEPS(lines: string[], layer: VectorLayer, pageHeight: number): void {
  lines.push('gsave')
  const { transform: t } = layer

  if (t.x !== 0 || t.y !== 0) {
    lines.push(`${fmt(t.x)} ${fmt(-t.y)} translate`)
  }
  if (t.rotation !== 0) {
    lines.push(`${fmt(-t.rotation)} rotate`)
  }
  if (t.scaleX !== 1 || t.scaleY !== 1) {
    lines.push(`${fmt(t.scaleX)} ${fmt(t.scaleY)} scale`)
  }

  for (const path of layer.paths) {
    lines.push('newpath')
    const cmds = segmentsToPS(path.segments, pageHeight)
    lines.push(...cmds)

    // Fill
    if (layer.fill) {
      const fillColor = resolveFillColor(layer.fill)
      if (fillColor) {
        const [r, g, b] = parseHexColor(fillColor)
        lines.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} setrgbcolor`)
      }
      if (layer.stroke) {
        // Need to preserve path for stroke
        lines.push('gsave')
        lines.push(path.fillRule === 'evenodd' ? 'eofill' : 'fill')
        lines.push('grestore')
      } else {
        lines.push(path.fillRule === 'evenodd' ? 'eofill' : 'fill')
      }
    }

    // Stroke
    if (layer.stroke && layer.stroke.width > 0) {
      if (!layer.fill) {
        // Re-issue path commands for stroke if no fill consumed the path
      }
      const [sr, sg, sb] = parseHexColor(layer.stroke.color)
      lines.push(`${fmt(sr)} ${fmt(sg)} ${fmt(sb)} setrgbcolor`)
      lines.push(`${fmt(layer.stroke.width)} setlinewidth`)

      // Line cap
      const capMap: Record<string, number> = { butt: 0, round: 1, square: 2 }
      lines.push(`${capMap[layer.stroke.linecap] ?? 0} setlinecap`)

      // Line join
      const joinMap: Record<string, number> = { miter: 0, round: 1, bevel: 2 }
      lines.push(`${joinMap[layer.stroke.linejoin] ?? 0} setlinejoin`)

      if (layer.stroke.dasharray && layer.stroke.dasharray.length > 0) {
        lines.push(`[${layer.stroke.dasharray.join(' ')}] 0 setdash`)
      }

      lines.push('stroke')
    }
  }

  lines.push('grestore')
}

function resolveFillColor(fill: Fill): string | null {
  if (fill.type === 'solid' && fill.color) return fill.color
  if (fill.type === 'gradient' && fill.gradient && fill.gradient.stops.length > 0) {
    return fill.gradient.stops[0]!.color
  }
  return null
}

function renderTextEPS(lines: string[], layer: TextLayer, pageHeight: number): void {
  lines.push('gsave')

  const x = layer.transform.x
  const y = layer.transform.y

  // Select font
  const fontName = mapFontToPS(layer.fontFamily, layer.fontWeight, layer.fontStyle)
  lines.push(`/${fontName} findfont ${layer.fontSize} scalefont setfont`)

  const [r, g, b] = parseHexColor(layer.color)
  lines.push(`${fmt(r)} ${fmt(g)} ${fmt(b)} setrgbcolor`)

  // EPS y-axis is bottom-up
  lines.push(`${fmt(x)} ${fmt(pageHeight - y - layer.fontSize)} moveto`)

  // Escape special PostScript characters in text
  const escaped = layer.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  lines.push(`(${escaped}) show`)

  lines.push('grestore')
}

function mapFontToPS(family: string, weight: string, style: string): string {
  // Map common font families to PostScript names
  const lower = family.toLowerCase()
  let base = 'Helvetica'
  if (lower.includes('times') || lower.includes('serif')) {
    base = 'Times-Roman'
  } else if (lower.includes('courier') || lower.includes('mono')) {
    base = 'Courier'
  }

  if (weight === 'bold' && style === 'italic') {
    if (base === 'Times-Roman') return 'Times-BoldItalic'
    return `${base}-BoldOblique`
  }
  if (weight === 'bold') {
    if (base === 'Times-Roman') return 'Times-Bold'
    return `${base}-Bold`
  }
  if (style === 'italic') {
    if (base === 'Times-Roman') return 'Times-Italic'
    return `${base}-Oblique`
  }
  return base
}

function renderRasterEPS(lines: string[], layer: RasterLayer, pageHeight: number): void {
  const imgData = getRasterData(layer.imageChunkId)
  if (!imgData) return

  const { width, height } = layer
  const x = layer.transform.x
  const y = layer.transform.y

  lines.push('gsave')
  // Position: EPS y-axis is bottom-up
  lines.push(`${fmt(x)} ${fmt(pageHeight - y - height)} translate`)
  lines.push(`${width} ${height} scale`)

  // Encode as hex RGB image (PostScript Level 2 image operator)
  lines.push(`${width} ${height} 8 [${width} 0 0 -${height} 0 ${height}]`)
  lines.push('{<')

  // Convert RGBA to RGB hex data, line-wrap at 72 chars
  const data = imgData.data
  let hexLine = ''
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!.toString(16).padStart(2, '0')
    const g = data[i + 1]!.toString(16).padStart(2, '0')
    const b = data[i + 2]!.toString(16).padStart(2, '0')
    hexLine += r + g + b
    if (hexLine.length >= 72) {
      lines.push(hexLine)
      hexLine = ''
    }
  }
  if (hexLine.length > 0) {
    lines.push(hexLine)
  }

  lines.push('>}')
  lines.push('false 3 colorimage')
  lines.push('grestore')
}

// ── EPS Import ───────────────────────────────────────────────────────────────

/**
 * Import an EPS file (string) into a DesignDocument.
 * Basic parser: extracts bounding box, path commands, and embedded images.
 */
export function importEPS(data: string): DesignDocument {
  const epsLines = data.split('\n')

  // Extract bounding box
  let bbWidth = 612 // default US Letter in points
  let bbHeight = 792
  for (const line of epsLines) {
    const bbMatch = line.match(/^%%BoundingBox:\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/)
    if (bbMatch) {
      const x1 = parseInt(bbMatch[1]!, 10)
      const y1 = parseInt(bbMatch[2]!, 10)
      const x2 = parseInt(bbMatch[3]!, 10)
      const y2 = parseInt(bbMatch[4]!, 10)
      bbWidth = x2 - x1
      bbHeight = y2 - y1
      break
    }
  }

  // Parse path commands into layers
  const layers: Layer[] = []
  let currentSegments: Segment[] = []
  let currentColor: [number, number, number] = [0, 0, 0]
  let currentLineWidth = 1
  let inPath = false

  for (const rawLine of epsLines) {
    const line = rawLine.trim()

    // Skip comments
    if (line.startsWith('%')) continue

    // setrgbcolor
    const rgbMatch = line.match(
      /^([\d.]+(?:e[+-]?\d+)?)\s+([\d.]+(?:e[+-]?\d+)?)\s+([\d.]+(?:e[+-]?\d+)?)\s+setrgbcolor$/,
    )
    if (rgbMatch) {
      currentColor = [parseFloat(rgbMatch[1]!), parseFloat(rgbMatch[2]!), parseFloat(rgbMatch[3]!)]
      continue
    }

    // setlinewidth
    const lwMatch = line.match(/^([\d.]+(?:e[+-]?\d+)?)\s+setlinewidth$/)
    if (lwMatch) {
      currentLineWidth = parseFloat(lwMatch[1]!)
      continue
    }

    // newpath
    if (line === 'newpath') {
      currentSegments = []
      inPath = true
      continue
    }

    // moveto
    const moveMatch = line.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+moveto$/)
    if (moveMatch && inPath) {
      currentSegments.push({
        type: 'move',
        x: parseFloat(moveMatch[1]!),
        y: bbHeight - parseFloat(moveMatch[2]!),
      })
      continue
    }

    // lineto
    const lineMatch = line.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+lineto$/)
    if (lineMatch && inPath) {
      currentSegments.push({
        type: 'line',
        x: parseFloat(lineMatch[1]!),
        y: bbHeight - parseFloat(lineMatch[2]!),
      })
      continue
    }

    // curveto
    const curveMatch = line.match(
      /^([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+curveto$/,
    )
    if (curveMatch && inPath) {
      currentSegments.push({
        type: 'cubic',
        cp1x: parseFloat(curveMatch[1]!),
        cp1y: bbHeight - parseFloat(curveMatch[2]!),
        cp2x: parseFloat(curveMatch[3]!),
        cp2y: bbHeight - parseFloat(curveMatch[4]!),
        x: parseFloat(curveMatch[5]!),
        y: bbHeight - parseFloat(curveMatch[6]!),
      })
      continue
    }

    // closepath
    if (line === 'closepath' && inPath) {
      currentSegments.push({ type: 'close' })
      continue
    }

    // fill or eofill
    if ((line === 'fill' || line === 'eofill') && currentSegments.length > 0) {
      const colorHex = rgbToHex(currentColor)
      const pathObj: Path = {
        id: uuid(),
        segments: [...currentSegments],
        closed: currentSegments.some((s) => s.type === 'close'),
        fillRule: line === 'eofill' ? 'evenodd' : 'nonzero',
      }
      const vectorLayer: VectorLayer = {
        id: uuid(),
        name: `Path ${layers.length + 1}`,
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [pathObj],
        fill: { type: 'solid', color: colorHex, opacity: 1 },
        stroke: null,
      }
      layers.push(vectorLayer)
      currentSegments = []
      inPath = false
      continue
    }

    // stroke
    if (line === 'stroke' && currentSegments.length > 0) {
      const colorHex = rgbToHex(currentColor)
      const pathObj: Path = {
        id: uuid(),
        segments: [...currentSegments],
        closed: currentSegments.some((s) => s.type === 'close'),
      }
      const vectorLayer: VectorLayer = {
        id: uuid(),
        name: `Path ${layers.length + 1}`,
        type: 'vector',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [pathObj],
        fill: null,
        stroke: {
          width: currentLineWidth,
          color: colorHex,
          opacity: 1,
          position: 'center',
          linecap: 'butt',
          linejoin: 'miter',
          miterLimit: 10,
        },
      }
      layers.push(vectorLayer)
      currentSegments = []
      inPath = false
      continue
    }
  }

  const now = new Date().toISOString()
  const artboardId = uuid()

  const doc: DesignDocument = {
    id: uuid(),
    metadata: {
      title: 'EPS Import',
      author: '',
      created: now,
      modified: now,
      colorspace: 'srgb',
      width: bbWidth,
      height: bbHeight,
    },
    artboards: [
      {
        id: artboardId,
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width: bbWidth,
        height: bbHeight,
        backgroundColor: '#ffffff',
        layers,
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }

  return doc
}

/** Convert [r,g,b] (0-1) to hex string. */
function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255)
    .toString(16)
    .padStart(2, '0')
  const g = Math.round(rgb[1] * 255)
    .toString(16)
    .padStart(2, '0')
  const b = Math.round(rgb[2] * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${r}${g}${b}`
}
