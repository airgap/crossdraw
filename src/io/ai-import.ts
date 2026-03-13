/**
 * Adobe Illustrator (.ai) file import.
 *
 * Modern AI files (v9+) are PDF-based with embedded PostScript.
 * Legacy AI files use PostScript directly — we reuse EPS import logic for those.
 */

import { v4 as uuid } from 'uuid'
import type { DesignDocument, Layer, VectorLayer, Segment, Path } from '@/types'
import { importEPS } from '@/io/eps-io'

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Detect whether the given data is an Adobe Illustrator file.
 * Checks for `%!PS-Adobe` header with `%%Creator: Adobe Illustrator` or `%%Creator: Crossdraw`.
 * Also accepts PDF-based AI files (v9+) that start with `%PDF-`.
 */
export function isAIFile(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 4096))
  const header = new TextDecoder('ascii').decode(bytes)

  // Modern AI files (v9+) are PDF-based
  if (header.startsWith('%PDF-')) {
    // Look for an AI-specific marker within the first 4KB
    return header.includes('Illustrator') || header.includes('AIPrivateData') || header.includes('/AIMetaData')
  }

  // Legacy AI files are PostScript-based
  if (header.startsWith('%!PS-Adobe')) {
    return header.includes('%%Creator: Adobe Illustrator') || header.includes('%%Creator: Crossdraw')
  }

  return false
}

// ── PDF-based AI parsing ─────────────────────────────────────────────────────

/**
 * Extract content streams from a PDF-based AI file.
 * Simplified parser that finds stream...endstream blocks and decodes path operators.
 */
function parsePDFStreams(text: string): string[] {
  const streams: string[] = []
  let idx = 0
  while (true) {
    const start = text.indexOf('stream\n', idx)
    if (start === -1) break
    const contentStart = start + 'stream\n'.length
    const end = text.indexOf('\nendstream', contentStart)
    if (end === -1) break
    streams.push(text.substring(contentStart, end))
    idx = end + 'endstream'.length
  }
  return streams
}

/**
 * Parse PDF path operators from content streams into segments.
 * PDF operators: m (moveto), l (lineto), c (curveto), h (closepath),
 * f/f* (fill), S (stroke), re (rectangle).
 */
function parsePDFContentStream(
  stream: string,
  pageHeight: number,
): { layers: VectorLayer[]; parsedColor: [number, number, number] } {
  const layers: VectorLayer[] = []
  let currentSegments: Segment[] = []
  let currentColor: [number, number, number] = [0, 0, 0]
  let currentLineWidth = 1

  const lines = stream.split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // setrgbcolor: r g b rg (non-stroking) or r g b RG (stroking)
    const rgMatch = line.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(?:rg|RG)$/)
    if (rgMatch) {
      currentColor = [parseFloat(rgMatch[1]!), parseFloat(rgMatch[2]!), parseFloat(rgMatch[3]!)]
      continue
    }

    // Line width
    const lwMatch = line.match(/^([\d.]+)\s+w$/)
    if (lwMatch) {
      currentLineWidth = parseFloat(lwMatch[1]!)
      continue
    }

    // moveto: x y m
    const moveMatch = line.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+m$/)
    if (moveMatch) {
      currentSegments.push({
        type: 'move',
        x: parseFloat(moveMatch[1]!),
        y: pageHeight - parseFloat(moveMatch[2]!),
      })
      continue
    }

    // lineto: x y l
    const lineMatch = line.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+l$/)
    if (lineMatch) {
      currentSegments.push({
        type: 'line',
        x: parseFloat(lineMatch[1]!),
        y: pageHeight - parseFloat(lineMatch[2]!),
      })
      continue
    }

    // curveto: x1 y1 x2 y2 x3 y3 c
    const curveMatch = line.match(
      /^([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+c$/,
    )
    if (curveMatch) {
      currentSegments.push({
        type: 'cubic',
        cp1x: parseFloat(curveMatch[1]!),
        cp1y: pageHeight - parseFloat(curveMatch[2]!),
        cp2x: parseFloat(curveMatch[3]!),
        cp2y: pageHeight - parseFloat(curveMatch[4]!),
        x: parseFloat(curveMatch[5]!),
        y: pageHeight - parseFloat(curveMatch[6]!),
      })
      continue
    }

    // rectangle: x y w h re
    const reMatch = line.match(/^([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+re$/)
    if (reMatch) {
      const rx = parseFloat(reMatch[1]!)
      const ry = pageHeight - parseFloat(reMatch[2]!)
      const rw = parseFloat(reMatch[3]!)
      const rh = parseFloat(reMatch[4]!)
      currentSegments.push(
        { type: 'move', x: rx, y: ry },
        { type: 'line', x: rx + rw, y: ry },
        { type: 'line', x: rx + rw, y: ry - rh },
        { type: 'line', x: rx, y: ry - rh },
        { type: 'close' },
      )
      continue
    }

    // closepath: h
    if (line === 'h') {
      currentSegments.push({ type: 'close' })
      continue
    }

    // fill: f or f*
    if ((line === 'f' || line === 'f*' || line === 'F') && currentSegments.length > 0) {
      const colorHex = rgbFloatToHex(currentColor)
      const pathObj: Path = {
        id: uuid(),
        segments: [...currentSegments],
        closed: currentSegments.some((s) => s.type === 'close'),
        fillRule: line === 'f*' ? 'evenodd' : 'nonzero',
      }
      layers.push({
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
      })
      currentSegments = []
      continue
    }

    // stroke: S
    if (line === 'S' && currentSegments.length > 0) {
      const colorHex = rgbFloatToHex(currentColor)
      const pathObj: Path = {
        id: uuid(),
        segments: [...currentSegments],
        closed: currentSegments.some((s) => s.type === 'close'),
      }
      layers.push({
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
      })
      currentSegments = []
      continue
    }

    // fill+stroke: B or B*
    if ((line === 'B' || line === 'B*') && currentSegments.length > 0) {
      const colorHex = rgbFloatToHex(currentColor)
      const pathObj: Path = {
        id: uuid(),
        segments: [...currentSegments],
        closed: currentSegments.some((s) => s.type === 'close'),
        fillRule: line === 'B*' ? 'evenodd' : 'nonzero',
      }
      layers.push({
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
        stroke: {
          width: currentLineWidth,
          color: colorHex,
          opacity: 1,
          position: 'center',
          linecap: 'butt',
          linejoin: 'miter',
          miterLimit: 10,
        },
      })
      currentSegments = []
      continue
    }
  }

  return { layers, parsedColor: currentColor }
}

/**
 * Extract page dimensions from PDF MediaBox.
 */
function extractMediaBox(text: string): { width: number; height: number } {
  const match = text.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/)
  if (match) {
    return {
      width: parseFloat(match[3]!) - parseFloat(match[1]!),
      height: parseFloat(match[4]!) - parseFloat(match[2]!),
    }
  }
  return { width: 612, height: 792 } // default US Letter in points
}

// ── Main import ──────────────────────────────────────────────────────────────

/**
 * Import an Adobe Illustrator (.ai) file into a DesignDocument.
 *
 * Modern AI files (v9+) are PDF-based: we extract content streams and parse
 * PDF path operators. Legacy AI files are PostScript-based: we delegate to
 * the EPS import logic.
 */
export function importAI(data: ArrayBuffer): DesignDocument {
  const text = new TextDecoder('latin1').decode(new Uint8Array(data))

  // Modern AI: PDF-based
  if (text.startsWith('%PDF-')) {
    return importPDFBasedAI(text)
  }

  // Legacy AI: PostScript-based — delegate to EPS importer
  return importEPS(text)
}

function importPDFBasedAI(text: string): DesignDocument {
  const { width, height } = extractMediaBox(text)
  const streams = parsePDFStreams(text)

  const allLayers: Layer[] = []
  for (const stream of streams) {
    const { layers } = parsePDFContentStream(stream, height)
    allLayers.push(...layers)
  }

  const now = new Date().toISOString()

  return {
    id: uuid(),
    metadata: {
      title: 'AI Import',
      author: '',
      created: now,
      modified: now,
      colorspace: 'srgb',
      width,
      height,
    },
    artboards: [
      {
        id: uuid(),
        name: 'Artboard 1',
        x: 0,
        y: 0,
        width,
        height,
        backgroundColor: '#ffffff',
        layers: allLayers,
      },
    ],
    assets: {
      gradients: [],
      patterns: [],
      colors: [],
    },
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rgbFloatToHex(rgb: [number, number, number]): string {
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
