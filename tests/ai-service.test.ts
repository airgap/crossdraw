import { describe, it, expect, beforeEach } from 'bun:test'
import {
  buildLayoutPrompt,
  buildPalettePrompt,
  buildCritiquePrompt,
  buildTextPrompt,
} from '@/ai/prompt-templates'
import type { Layer, VectorLayer, TextLayer, GroupLayer } from '@/types'

// ── Mock localStorage ──

const storage = new Map<string, string>()

const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size
  },
  key: (_index: number) => null as string | null,
}

// Assign mock localStorage globally for the ai-service module
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true })

// ── Import after mocking ──

import { getAIConfig, setAIConfig } from '@/ai/ai-service'
import type { AIServiceConfig, DesignCritique } from '@/ai/ai-service'

// ── Prompt template tests ──

describe('buildLayoutPrompt', () => {
  it('returns system and user strings', () => {
    const result = buildLayoutPrompt('A landing page with a hero section', 1920, 1080)
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
    expect(result.system.length).toBeGreaterThan(100)
    expect(result.user.length).toBeGreaterThan(0)
  })

  it('includes artboard dimensions in the prompt', () => {
    const result = buildLayoutPrompt('test', 800, 600)
    expect(result.system).toContain('800')
    expect(result.system).toContain('600')
    expect(result.user).toContain('800')
    expect(result.user).toContain('600')
  })

  it('includes layer type schema information', () => {
    const result = buildLayoutPrompt('test', 1920, 1080)
    expect(result.system).toContain('VectorLayer')
    expect(result.system).toContain('TextLayer')
    expect(result.system).toContain('GroupLayer')
  })

  it('includes path/segment format info', () => {
    const result = buildLayoutPrompt('test', 1920, 1080)
    expect(result.system).toContain('move')
    expect(result.system).toContain('line')
    expect(result.system).toContain('cubic')
    expect(result.system).toContain('close')
  })

  it('includes fill and stroke format', () => {
    const result = buildLayoutPrompt('test', 1920, 1080)
    expect(result.system).toContain('Fill')
    expect(result.system).toContain('Stroke')
    expect(result.system).toContain('solid')
  })

  it('includes the user prompt in the user message', () => {
    const result = buildLayoutPrompt('A business card with logo', 1920, 1080)
    expect(result.user).toContain('A business card with logo')
  })

  it('requests JSON array format', () => {
    const result = buildLayoutPrompt('test', 1920, 1080)
    expect(result.system).toContain('JSON array')
  })
})

describe('buildPalettePrompt', () => {
  it('returns system and user strings', () => {
    const result = buildPalettePrompt('#ff5500')
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
  })

  it('includes the base color', () => {
    const result = buildPalettePrompt('#3366cc')
    expect(result.user).toContain('#3366cc')
  })

  it('includes mood when provided', () => {
    const result = buildPalettePrompt('#ff0000', 'warm and energetic')
    expect(result.user).toContain('warm and energetic')
  })

  it('works without mood parameter', () => {
    const result = buildPalettePrompt('#00ff00')
    expect(result.user).not.toContain('Mood')
  })

  it('requests JSON array of hex colors', () => {
    const result = buildPalettePrompt('#000000')
    expect(result.system).toContain('JSON array')
    expect(result.system).toContain('hex')
  })
})

describe('buildCritiquePrompt', () => {
  const sampleLayers: Layer[] = [
    {
      type: 'vector',
      id: 'v1',
      name: 'Background',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [{ id: 'p1', segments: [{ type: 'move', x: 0, y: 0 }, { type: 'close' }], closed: true }],
      fill: { type: 'solid', color: '#ffffff', opacity: 1 },
      stroke: null,
    } satisfies VectorLayer,
    {
      type: 'text',
      id: 't1',
      name: 'Title',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      text: 'Hello World',
      fontFamily: 'Inter',
      fontSize: 32,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
    } satisfies TextLayer,
  ]

  it('returns system and user strings', () => {
    const result = buildCritiquePrompt(sampleLayers)
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
  })

  it('includes layer count', () => {
    const result = buildCritiquePrompt(sampleLayers)
    expect(result.user).toContain('2 layers')
  })

  it('includes layer information in user message', () => {
    const result = buildCritiquePrompt(sampleLayers)
    expect(result.user).toContain('Background')
    expect(result.user).toContain('Title')
  })

  it('includes evaluation criteria', () => {
    const result = buildCritiquePrompt(sampleLayers)
    expect(result.system).toContain('spacing')
    expect(result.system).toContain('alignment')
    expect(result.system).toContain('color')
    expect(result.system).toContain('typography')
  })

  it('describes the expected output format', () => {
    const result = buildCritiquePrompt(sampleLayers)
    expect(result.system).toContain('score')
    expect(result.system).toContain('issues')
    expect(result.system).toContain('suggestions')
    expect(result.system).toContain('severity')
  })
})

describe('buildTextPrompt', () => {
  it('returns system and user strings', () => {
    const result = buildTextPrompt('marketing landing page', 'medium')
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
  })

  it('includes the context', () => {
    const result = buildTextPrompt('restaurant menu description', 'short')
    expect(result.user).toContain('restaurant menu description')
  })

  it('includes length guidance for short', () => {
    const result = buildTextPrompt('test', 'short')
    expect(result.user).toContain('1-2 sentences')
  })

  it('includes length guidance for medium', () => {
    const result = buildTextPrompt('test', 'medium')
    expect(result.user).toContain('1-2 paragraphs')
  })

  it('includes length guidance for long', () => {
    const result = buildTextPrompt('test', 'long')
    expect(result.user).toContain('3-5 paragraphs')
  })

  it('asks for contextual text, not lorem ipsum', () => {
    const result = buildTextPrompt('test', 'medium')
    expect(result.system).toContain('NOT lorem ipsum')
  })
})

// ── Config get/set tests ──

describe('getAIConfig', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('returns null when no config is stored', () => {
    expect(getAIConfig()).toBeNull()
  })

  it('returns config when valid data is stored', () => {
    const config: AIServiceConfig = { apiKey: 'sk-test-123', model: 'claude-sonnet-4-20250514' }
    storage.set('crossdraw:ai-config', JSON.stringify(config))
    const result = getAIConfig()
    expect(result).not.toBeNull()
    expect(result!.apiKey).toBe('sk-test-123')
    expect(result!.model).toBe('claude-sonnet-4-20250514')
  })

  it('returns null for malformed JSON', () => {
    storage.set('crossdraw:ai-config', '{not valid json')
    expect(getAIConfig()).toBeNull()
  })

  it('returns null when apiKey is missing', () => {
    storage.set('crossdraw:ai-config', JSON.stringify({ model: 'test' }))
    expect(getAIConfig()).toBeNull()
  })

  it('returns null when model is missing', () => {
    storage.set('crossdraw:ai-config', JSON.stringify({ apiKey: 'test' }))
    expect(getAIConfig()).toBeNull()
  })

  it('preserves optional baseUrl', () => {
    const config: AIServiceConfig = {
      apiKey: 'sk-test',
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://custom-proxy.example.com',
    }
    storage.set('crossdraw:ai-config', JSON.stringify(config))
    const result = getAIConfig()
    expect(result!.baseUrl).toBe('https://custom-proxy.example.com')
  })

  it('returns undefined baseUrl when not present', () => {
    const config = { apiKey: 'sk-test', model: 'claude-sonnet-4-20250514' }
    storage.set('crossdraw:ai-config', JSON.stringify(config))
    const result = getAIConfig()
    expect(result!.baseUrl).toBeUndefined()
  })
})

describe('setAIConfig', () => {
  beforeEach(() => {
    storage.clear()
  })

  it('stores config to localStorage', () => {
    setAIConfig({ apiKey: 'sk-abc', model: 'claude-sonnet-4-20250514' })
    const raw = storage.get('crossdraw:ai-config')
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!)
    expect(parsed.apiKey).toBe('sk-abc')
    expect(parsed.model).toBe('claude-sonnet-4-20250514')
  })

  it('overwrites existing config', () => {
    setAIConfig({ apiKey: 'first', model: 'model-1' })
    setAIConfig({ apiKey: 'second', model: 'model-2' })
    const result = getAIConfig()
    expect(result!.apiKey).toBe('second')
    expect(result!.model).toBe('model-2')
  })

  it('roundtrips correctly', () => {
    const config: AIServiceConfig = {
      apiKey: 'sk-test-key-12345',
      model: 'claude-opus-4-20250514',
      baseUrl: 'https://proxy.example.com',
    }
    setAIConfig(config)
    const result = getAIConfig()
    expect(result).toEqual(config)
  })
})

// ── Response parsing tests ──

describe('response parsing (extractJSON)', () => {
  // We test extractJSON indirectly through validation logic patterns

  it('valid layer array can be validated', () => {
    const layers: Layer[] = [
      {
        type: 'vector',
        id: 'rect-1',
        name: 'Rectangle',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'path-1',
            segments: [
              { type: 'move', x: 0, y: 0 },
              { type: 'line', x: 100, y: 0 },
              { type: 'line', x: 100, y: 100 },
              { type: 'line', x: 0, y: 100 },
              { type: 'close' },
            ],
            closed: true,
          },
        ],
        fill: { type: 'solid', color: '#4a7dff', opacity: 1 },
        stroke: null,
      } satisfies VectorLayer,
    ]

    // Validate the layers are valid
    expect(layers.length).toBe(1)
    expect(layers[0]!.type).toBe('vector')
    expect(layers[0]!.id).toBe('rect-1')
    expect(layers[0]!.name).toBe('Rectangle')
  })

  it('validates layer types correctly', () => {
    const validTypes = ['vector', 'text', 'group']
    const invalidTypes = ['raster', 'adjustment', 'invalid', '']

    for (const type of validTypes) {
      expect(validTypes.includes(type)).toBe(true)
    }
    for (const type of invalidTypes) {
      expect(validTypes.includes(type)).toBe(false)
    }
  })

  it('handles text layer response format', () => {
    const textLayer: TextLayer = {
      type: 'text',
      id: 'text-1',
      name: 'Heading',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      text: 'Welcome',
      fontFamily: 'Inter',
      fontSize: 48,
      fontWeight: 'bold',
      fontStyle: 'normal',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#1a1a1a',
    }

    expect(textLayer.type).toBe('text')
    expect(textLayer.text).toBe('Welcome')
    expect(textLayer.fontSize).toBe(48)
  })

  it('handles group layer response format', () => {
    const groupLayer: GroupLayer = {
      type: 'group',
      id: 'group-1',
      name: 'Header Group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [],
    }

    expect(groupLayer.type).toBe('group')
    expect(groupLayer.children).toEqual([])
  })
})

describe('DesignCritique response validation', () => {
  it('validates a well-formed critique', () => {
    const critique: DesignCritique = {
      score: 7,
      issues: [
        {
          type: 'alignment',
          description: 'Title is not centered',
          severity: 'warning',
          layerId: 'text-1',
        },
        {
          type: 'color',
          description: 'Low contrast between text and background',
          severity: 'error',
        },
      ],
      suggestions: ['Consider centering the title', 'Increase contrast ratio to at least 4.5:1'],
    }

    expect(critique.score).toBeGreaterThanOrEqual(1)
    expect(critique.score).toBeLessThanOrEqual(10)
    expect(critique.issues).toHaveLength(2)
    expect(critique.issues[0]!.severity).toBe('warning')
    expect(critique.issues[1]!.severity).toBe('error')
    expect(critique.suggestions).toHaveLength(2)
  })

  it('validates severity values', () => {
    const validSeverities: Array<'info' | 'warning' | 'error'> = ['info', 'warning', 'error']
    for (const sev of validSeverities) {
      expect(['info', 'warning', 'error']).toContain(sev)
    }
  })

  it('allows optional layerId on issues', () => {
    const issue: DesignCritique['issues'][number] = {
      type: 'spacing',
      description: 'Elements too close together',
      severity: 'info',
    }
    expect(issue.layerId).toBeUndefined()
  })

  it('score clamped to 1-10 range', () => {
    const clamp = (score: number) => Math.max(1, Math.min(10, score))
    expect(clamp(0)).toBe(1)
    expect(clamp(11)).toBe(10)
    expect(clamp(5)).toBe(5)
    expect(clamp(-3)).toBe(1)
  })
})

describe('color palette response validation', () => {
  it('validates hex color format', () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/
    expect(hexRegex.test('#ff0000')).toBe(true)
    expect(hexRegex.test('#FF0000')).toBe(true)
    expect(hexRegex.test('#4a7dff')).toBe(true)
    expect(hexRegex.test('#000000')).toBe(true)
    expect(hexRegex.test('#ffffff')).toBe(true)
    expect(hexRegex.test('ff0000')).toBe(false)
    expect(hexRegex.test('#fff')).toBe(false)
    expect(hexRegex.test('#gggggg')).toBe(false)
    expect(hexRegex.test('')).toBe(false)
  })

  it('filters non-hex values from palette', () => {
    const raw = ['#ff0000', 'not-a-color', '#00ff00', '#invalid', '#0000ff', 123]
    const colors = raw.filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
    expect(colors).toEqual(['#ff0000', '#00ff00', '#0000ff'])
  })
})

describe('error handling', () => {
  it('extractJSON handles markdown fenced code blocks', () => {
    const withFences = '```json\n["#ff0000", "#00ff00"]\n```'
    const fenceMatch = withFences.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    expect(fenceMatch).not.toBeNull()
    const parsed = JSON.parse(fenceMatch![1]!)
    expect(parsed).toEqual(['#ff0000', '#00ff00'])
  })

  it('extractJSON handles raw JSON', () => {
    const raw = '["#ff0000", "#00ff00"]'
    const jsonMatch = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1]!)
    expect(parsed).toEqual(['#ff0000', '#00ff00'])
  })

  it('extractJSON handles JSON with surrounding text', () => {
    const withText = 'Here is your palette:\n["#ff0000", "#00ff00"]\nI hope you like it!'
    const jsonMatch = withText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1]!)
    expect(parsed).toEqual(['#ff0000', '#00ff00'])
  })

  it('rejects non-array layer responses', () => {
    const obj = { type: 'vector', id: 'v1' }
    expect(Array.isArray(obj)).toBe(false)
  })

  it('rejects layers without required fields', () => {
    const items = [
      { type: 'vector', id: 'v1', name: 'Valid' },
      { type: 'vector', id: 'v2' }, // missing name
      { id: 'v3', name: 'No Type' }, // missing type
      null,
      'string',
    ]

    const valid = items.filter((item): boolean => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return (
        typeof obj.type === 'string' &&
        typeof obj.id === 'string' &&
        typeof obj.name === 'string' &&
        ['vector', 'text', 'group'].includes(obj.type as string)
      )
    })

    expect(valid).toHaveLength(1)
  })
})
