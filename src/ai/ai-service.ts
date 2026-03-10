/**
 * AI service layer for Crossdraw design assistant.
 * Uses the Claude messages API via fetch — no SDK dependencies.
 */

import type { Layer } from '@/types'
import { buildLayoutPrompt, buildPalettePrompt, buildCritiquePrompt, buildTextPrompt, buildRenamePrompt, buildVectorArtPrompt } from './prompt-templates'
import type { RenameLayerInfo } from './prompt-templates'

// ── Types ──

export interface AIServiceConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export interface DesignCritique {
  score: number
  issues: {
    type: string
    description: string
    severity: 'info' | 'warning' | 'error'
    layerId?: string
  }[]
  suggestions: string[]
}

interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ClaudeResponse {
  content: Array<{ type: 'text'; text: string }>
  stop_reason: string
}

// ── Config persistence ──

const CONFIG_KEY = 'crossdraw:ai-config'

export function getAIConfig(): AIServiceConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.apiKey !== 'string' || typeof parsed.model !== 'string') return null
    return {
      apiKey: parsed.apiKey,
      model: parsed.model,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : undefined,
    }
  } catch {
    return null
  }
}

export function setAIConfig(config: AIServiceConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

// ── Internal helpers ──

function getConfigOrThrow(): AIServiceConfig {
  const config = getAIConfig()
  if (!config) throw new Error('AI not configured. Please set your API key in the AI panel settings.')
  if (!config.apiKey) throw new Error('API key is empty. Please enter a valid Claude API key.')
  return config
}

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  config: AIServiceConfig,
): Promise<string> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com'
  const url = `${baseUrl}/v1/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Claude API key in settings.')
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.')
    }
    throw new Error(`Claude API error (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as ClaudeResponse
  const textBlock = data.content.find((c) => c.type === 'text')
  if (!textBlock) throw new Error('No text response from Claude API.')
  return textBlock.text
}

/**
 * Extract JSON from a response that might contain markdown code fences.
 */
function extractJSON(text: string): string {
  // Try to extract from code fences first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()

  // Try to find a JSON array or object
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
  if (jsonMatch?.[1]) return jsonMatch[1].trim()

  return text.trim()
}

/**
 * Extract SVG markup from a response that might contain markdown code fences or surrounding text.
 */
export function extractSVG(text: string): string {
  // Try to extract from code fences first (```svg or ```xml or plain ```)
  const fenceMatch = text.match(/```(?:svg|xml|html)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim()
    if (inner.includes('<svg')) return inner
  }

  // Try to extract the <svg...>...</svg> block directly
  const svgMatch = text.match(/<svg[\s\S]*<\/svg>/)
  if (svgMatch?.[0]) return svgMatch[0].trim()

  // Fall back to the trimmed text
  return text.trim()
}

// ── Public API ──

export async function generateVectorArt(
  prompt: string,
  width: number,
  height: number,
): Promise<string> {
  const config = getConfigOrThrow()
  const { system, user } = buildVectorArtPrompt(prompt, width, height)

  const responseText = await callClaude(
    system,
    [{ role: 'user', content: user }],
    config,
  )

  const svgString = extractSVG(responseText)

  // Validate that the result looks like SVG
  if (!svgString.includes('<svg')) {
    throw new Error('AI response does not contain valid SVG markup.')
  }

  return svgString
}

export async function generateDesignFromPrompt(
  prompt: string,
  artboardWidth: number,
  artboardHeight: number,
): Promise<Layer[]> {
  const config = getConfigOrThrow()
  const { system, user } = buildLayoutPrompt(prompt, artboardWidth, artboardHeight)

  const responseText = await callClaude(system, [{ role: 'user', content: user }], config)
  const jsonStr = extractJSON(responseText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse AI response as JSON. Response:\n${responseText.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response is not an array of layers.')
  }

  // Validate and sanitize layers
  const layers = parsed.filter((item): item is Layer => {
    if (typeof item !== 'object' || item === null) return false
    const obj = item as Record<string, unknown>
    return (
      typeof obj.type === 'string' &&
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      ['vector', 'text', 'group'].includes(obj.type as string)
    )
  })

  if (layers.length === 0) {
    throw new Error('AI response contained no valid layers.')
  }

  return layers
}

export async function suggestColorPalette(baseColor: string, mood?: string): Promise<string[]> {
  const config = getConfigOrThrow()
  const { system, user } = buildPalettePrompt(baseColor, mood)

  const responseText = await callClaude(system, [{ role: 'user', content: user }], config)
  const jsonStr = extractJSON(responseText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse color palette response. Response:\n${responseText.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Color palette response is not an array.')
  }

  const colors = parsed.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))

  if (colors.length === 0) {
    throw new Error('No valid hex colors in AI response.')
  }

  return colors
}

export async function critiqueDesign(layers: Layer[]): Promise<DesignCritique> {
  const config = getConfigOrThrow()
  const { system, user } = buildCritiquePrompt(layers)

  const responseText = await callClaude(system, [{ role: 'user', content: user }], config)
  const jsonStr = extractJSON(responseText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse critique response. Response:\n${responseText.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  if (typeof obj.score !== 'number' || !Array.isArray(obj.issues) || !Array.isArray(obj.suggestions)) {
    throw new Error('Invalid critique response structure.')
  }

  return {
    score: Math.max(1, Math.min(10, obj.score)),
    issues: (obj.issues as Record<string, unknown>[])
      .filter(
        (i) =>
          typeof i.type === 'string' &&
          typeof i.description === 'string' &&
          ['info', 'warning', 'error'].includes(i.severity as string),
      )
      .map((i) => ({
        type: i.type as string,
        description: i.description as string,
        severity: i.severity as 'info' | 'warning' | 'error',
        layerId: typeof i.layerId === 'string' ? i.layerId : undefined,
      })),
    suggestions: (obj.suggestions as unknown[]).filter((s): s is string => typeof s === 'string'),
  }
}

export async function generatePlaceholderText(
  context: string,
  length: 'short' | 'medium' | 'long',
): Promise<string> {
  const config = getConfigOrThrow()
  const { system, user } = buildTextPrompt(context, length)

  const responseText = await callClaude(system, [{ role: 'user', content: user }], config)
  return responseText.trim()
}

export interface LayerRename {
  id: string
  newName: string
}

export async function bulkRenameLayers(
  layers: RenameLayerInfo[],
): Promise<LayerRename[]> {
  if (layers.length === 0) return []

  const config = getConfigOrThrow()
  const { system, user } = buildRenamePrompt(layers)

  const responseText = await callClaude(system, [{ role: 'user', content: user }], config)
  const jsonStr = extractJSON(responseText)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse rename response as JSON. Response:\n${responseText.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Rename response is not an array.')
  }

  const renames = parsed.filter((item): item is LayerRename => {
    if (typeof item !== 'object' || item === null) return false
    const obj = item as Record<string, unknown>
    return typeof obj.id === 'string' && typeof obj.newName === 'string' && obj.newName.length > 0
  })

  if (renames.length === 0) {
    throw new Error('No valid renames in AI response.')
  }

  // Only return renames for layer IDs that were in the input
  const inputIds = new Set(layers.map((l) => l.id))
  return renames.filter((r) => inputIds.has(r.id))
}
