/**
 * Prompt templates for AI design assistant operations.
 * Each builder returns a { system, user } pair for the Claude messages API.
 */

import type { Layer } from '@/types'

export interface PromptPair {
  system: string
  user: string
}

const LAYER_SCHEMA = `
You are an AI design assistant for Crossdraw, a vector + raster design editor.
You must return valid JSON matching the Crossdraw layer format.

Layer types:
- VectorLayer: { type: "vector", id: string, name: string, visible: true, locked: false, opacity: number (0-1), blendMode: "normal", transform: { x: number, y: number, scaleX: 1, scaleY: 1, rotation: 0 }, effects: [], paths: Path[], fill: Fill | null, stroke: Stroke | null }
- TextLayer: { type: "text", id: string, name: string, visible: true, locked: false, opacity: 1, blendMode: "normal", transform: { x: number, y: number, scaleX: 1, scaleY: 1, rotation: 0 }, effects: [], text: string, fontFamily: string, fontSize: number, fontWeight: "normal" | "bold", fontStyle: "normal" | "italic", textAlign: "left" | "center" | "right", lineHeight: 1.2, letterSpacing: 0, color: string (hex) }
- GroupLayer: { type: "group", id: string, name: string, visible: true, locked: false, opacity: 1, blendMode: "normal", transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, effects: [], children: Layer[] }

Path format:
- Path: { id: string, segments: Segment[], closed: boolean }
- Segments: { type: "move", x, y } | { type: "line", x, y } | { type: "cubic", x, y, cp1x, cp1y, cp2x, cp2y } | { type: "close" }
- For rectangles: move, 3 lines, close
- For ellipses: move, 4 cubics (using kappa=0.5522847498), close

Fill: { type: "solid", color: "#hexcolor", opacity: 1 }
Stroke: { width: number, color: "#hexcolor", opacity: 1, position: "center", linecap: "round", linejoin: "round", miterLimit: 4 }

Generate unique IDs using simple strings like "layer-1", "path-1", etc.
All coordinates are relative to the artboard origin (0, 0 is top-left).
`

export function buildLayoutPrompt(userPrompt: string, width: number, height: number): PromptPair {
  return {
    system: `${LAYER_SCHEMA}

The artboard is ${width}px wide and ${height}px tall.
Return ONLY a JSON array of Layer objects. No markdown, no explanation, no code fences.
Place elements thoughtfully within the artboard bounds using good design principles:
- Use consistent spacing and alignment
- Choose harmonious colors
- Use appropriate font sizes (headings 24-48px, body 14-18px)
- Leave adequate padding from artboard edges (at least 20px)`,
    user: `Design request: ${userPrompt}

Return a JSON array of layers to create this design on a ${width}x${height} artboard.`,
  }
}

export function buildPalettePrompt(baseColor: string, mood?: string): PromptPair {
  return {
    system: `You are a color theory expert. Given a base color and optional mood, generate a harmonious color palette of 5-8 colors.
Return ONLY a JSON array of hex color strings (e.g., ["#ff0000", "#00ff00"]).
No markdown, no explanation, no code fences.
Consider color theory principles: complementary, analogous, triadic, split-complementary.
Include the base color in the palette.
Ensure good contrast between colors and that they work well together.`,
    user: `Base color: ${baseColor}${mood ? `\nMood/style: ${mood}` : ''}

Generate a harmonious color palette.`,
  }
}

export function buildCritiquePrompt(layers: Layer[]): PromptPair {
  const layerSummary = layers.map((l) => {
    const base = { id: l.id, name: l.name, type: l.type, transform: l.transform, opacity: l.opacity }
    if (l.type === 'vector') {
      return { ...base, fill: l.fill, stroke: l.stroke }
    }
    if (l.type === 'text') {
      return { ...base, text: l.text, fontSize: l.fontSize, color: l.color, textAlign: l.textAlign }
    }
    if (l.type === 'group') {
      return { ...base, childCount: l.children.length }
    }
    return base
  })

  return {
    system: `You are a design critic and UX expert. Analyze the provided design layers and give constructive feedback.
Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{
  "score": <number 1-10>,
  "issues": [
    {
      "type": "spacing" | "alignment" | "color" | "typography" | "hierarchy" | "contrast" | "consistency",
      "description": "<clear description>",
      "severity": "info" | "warning" | "error",
      "layerId": "<optional layer id>"
    }
  ],
  "suggestions": ["<improvement suggestion>"]
}

Evaluate:
- Spacing consistency between elements
- Alignment of related elements
- Color harmony and contrast (WCAG compliance)
- Typography hierarchy and readability
- Visual balance and composition
- Naming conventions of layers`,
    user: `Analyze this design with ${layers.length} layers:\n${JSON.stringify(layerSummary, null, 2)}`,
  }
}

export function buildTextPrompt(context: string, length: 'short' | 'medium' | 'long'): PromptPair {
  const lengthGuide = {
    short: '1-2 sentences (20-40 words)',
    medium: '1-2 paragraphs (50-120 words)',
    long: '3-5 paragraphs (150-300 words)',
  }

  return {
    system: `You are a copywriter generating placeholder text for design mockups.
Generate realistic, contextual placeholder text — NOT lorem ipsum.
The text should feel like real content appropriate for the described context.
Return ONLY the plain text. No markdown, no quotes, no explanation.`,
    user: `Context: ${context}\nLength: ${lengthGuide[length]}

Generate appropriate placeholder text.`,
  }
}
