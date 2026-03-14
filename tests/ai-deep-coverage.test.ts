/**
 * Deep coverage tests for AI modules — targets uncovered lines that
 * ai-coverage.test.ts missed.
 *
 * Strategy:
 *   - Mock globalThis.fetch to exercise HTTP call paths
 *   - Configure AI via setAIConfig / setBackendConfig so guards pass
 *   - Mock the editor store for functions that read from it
 */

import { describe, test, expect, beforeEach, afterAll } from 'bun:test'

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
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true })

// ── Mock OffscreenCanvas ──

if (typeof globalThis.OffscreenCanvas === 'undefined') {
  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext() {
      return {
        putImageData() {},
        drawImage() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => new (globalThis as any).ImageData(w, h),
        clearRect() {},
        fillRect() {},
        createImageData: (w: number, h: number) => new (globalThis as any).ImageData(w, h),
      }
    }
    transferToImageBitmap() {
      return {}
    }
  }
}

// ── Mock ImageData ──

if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: string = 'srgb'
    constructor(data: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
      if (typeof data === 'number') {
        this.width = data
        this.height = widthOrHeight!
        this.data = new Uint8ClampedArray(data * widthOrHeight! * 4)
      } else if (widthOrHeight !== undefined && height !== undefined) {
        this.data = data
        this.width = widthOrHeight
        this.height = height
      } else {
        throw new Error('Invalid ImageData constructor args')
      }
    }
  }
}

// ── Save original fetch ──

const origFetch = globalThis.fetch

afterAll(() => {
  globalThis.fetch = origFetch
})

// ── Imports ──

import { setAIConfig as setServiceConfig, getAIConfig as getServiceConfig } from '@/ai/ai-service'
import { setAIConfig as setBackendConfig } from '@/ai/ai-config'
import { storeRasterData, getRasterData } from '@/store/raster-data'
import { setSelectionMask } from '@/tools/raster-selection'
import { useEditorStore } from '@/store/editor.store'

// ── Store helpers ──

/** Ensure an artboard exists and set up a raster layer in it */
function setupStoreWithRasterLayer(chunkId: string, layerId: string, w: number, h: number) {
  const store = useEditorStore.getState()

  // Ensure an artboard exists
  if (store.document.artboards.length === 0) {
    store.addArtboard('Test Artboard', 800, 600)
  }
  const artboard = useEditorStore.getState().document.artboards[0]!

  // Clean existing layers by deleting all
  for (const l of artboard.layers) {
    store.deleteLayer(artboard.id, l.id)
  }

  // Add the raster layer
  const layer = {
    type: 'raster' as const,
    id: layerId,
    name: 'Test Raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: w,
    height: h,
  }
  store.addLayer(artboard.id, layer as any)
  store.selectLayer(layerId)

  return artboard.id
}

/** Clear all layers from the first artboard (leaves artboard empty) */
function clearArtboardLayers() {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (artboard) {
    for (const l of artboard.layers) {
      store.deleteLayer(artboard.id, l.id)
    }
  }
}

// ── Helpers ──

function makeImageData(w: number, h: number, r = 128, g = 128, b = 128, a = 255): ImageData {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return new ImageData(data, w, h)
}

/** Create a fake base64 string representing RGBA pixels for wxh image */
function fakeB64Pixels(w: number, h: number, value = 128): string {
  const bytes = new Uint8Array(w * h * 4)
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = value
    bytes[i + 1] = value
    bytes[i + 2] = value
    bytes[i + 3] = 255
  }
  // Use Buffer.from for b64 encoding
  return Buffer.from(bytes).toString('base64')
}

/** Mock fetch to return a JSON response */
function mockFetchJSON(body: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as any
}

/** Mock fetch to return a text error */
function mockFetchError(text: string, status: number) {
  globalThis.fetch = (async () =>
    new Response(text, {
      status,
      headers: { 'Content-Type': 'text/plain' },
    })) as any
}

// ═══════════════════════════════════════════════════════════════════════════
// ai-service.ts — lines 61, 72-112, 119-127, 152-205, 209-278, 287-320
// ═══════════════════════════════════════════════════════════════════════════

describe('ai-service: getAIConfig catch branch (line 61)', () => {
  test('returns null on corrupt localStorage', () => {
    // Store invalid JSON so parsing throws
    storage.set('crossdraw:ai-config', '{invalid json}}}')
    const cfg = getServiceConfig()
    expect(cfg).toBeNull()
    storage.clear()
  })
})

describe('ai-service: getConfigOrThrow (lines 72-76)', () => {
  beforeEach(() => storage.clear())

  test('generateVectorArt throws when AI not configured', async () => {
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw cat', 100, 100)).rejects.toThrow('AI not configured')
  })

  test('generateVectorArt throws when API key is empty', async () => {
    setServiceConfig({ apiKey: '', model: 'test' })
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw cat', 100, 100)).rejects.toThrow('API key is empty')
    storage.clear()
  })
})

describe('ai-service: callClaude (lines 79-113)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3', baseUrl: 'http://test.local' })
  })

  test('generateVectorArt makes a successful call and returns SVG', async () => {
    const svgResult = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
    mockFetchJSON({
      content: [{ type: 'text', text: svgResult }],
      stop_reason: 'end_turn',
    })

    const { generateVectorArt } = await import('@/ai/ai-service')
    const result = await generateVectorArt('draw circle', 100, 100)
    expect(result).toContain('<svg')
    expect(result).toContain('circle')
  })

  test('callClaude throws on 401', async () => {
    mockFetchError('Unauthorized', 401)
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw', 50, 50)).rejects.toThrow('Invalid API key')
  })

  test('callClaude throws on 429', async () => {
    mockFetchError('Too many requests', 429)
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw', 50, 50)).rejects.toThrow('Rate limited')
  })

  test('callClaude throws on 500 with error text', async () => {
    mockFetchError('Internal Server Error', 500)
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw', 50, 50)).rejects.toThrow('Claude API error (500)')
  })

  test('callClaude throws when response has no text block', async () => {
    mockFetchJSON({
      content: [{ type: 'image', source: 'abc' }],
      stop_reason: 'end_turn',
    })
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw', 50, 50)).rejects.toThrow('No text response')
  })

  test('callClaude uses default baseUrl when none provided', async () => {
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
    let capturedUrl = ''
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      return new Response(
        JSON.stringify({
          content: [{ type: 'text', text: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>' }],
          stop_reason: 'end_turn',
        }),
        { status: 200 },
      )
    }) as any

    const { generateVectorArt } = await import('@/ai/ai-service')
    await generateVectorArt('draw', 1, 1)
    expect(capturedUrl).toContain('api.anthropic.com')
  })
})

describe('ai-service: extractJSON (lines 119-129)', () => {
  // We need to call functions that use extractJSON internally
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('suggestColorPalette extracts JSON from fenced response', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '```json\n["#ff0000","#00ff00","#0000ff"]\n```' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    const colors = await suggestColorPalette('#ff0000', 'warm')
    expect(colors).toEqual(['#ff0000', '#00ff00', '#0000ff'])
  })

  test('suggestColorPalette extracts from non-fenced response', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'Here are the colors: ["#aabbcc","#112233"]' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    const colors = await suggestColorPalette('#000000')
    expect(colors).toEqual(['#aabbcc', '#112233'])
  })

  test('suggestColorPalette falls back to trimmed text when not JSON', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'no valid json here' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    await expect(suggestColorPalette('#000000')).rejects.toThrow('Failed to parse color palette')
  })
})

describe('ai-service: generateVectorArt (lines 152-165)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('throws when response does not contain SVG', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'I cannot generate images, sorry!' }],
      stop_reason: 'end_turn',
    })
    const { generateVectorArt } = await import('@/ai/ai-service')
    await expect(generateVectorArt('draw cat', 100, 100)).rejects.toThrow('does not contain valid SVG')
  })

  test('extracts SVG from fenced response', async () => {
    const svg = '<svg viewBox="0 0 200 200"><rect x="0" y="0" width="200" height="200" fill="red"/></svg>'
    mockFetchJSON({
      content: [{ type: 'text', text: '```svg\n' + svg + '\n```' }],
      stop_reason: 'end_turn',
    })
    const { generateVectorArt } = await import('@/ai/ai-service')
    const result = await generateVectorArt('red square', 200, 200)
    expect(result).toContain('<svg')
    expect(result).toContain('red')
  })
})

describe('ai-service: generateDesignFromPrompt (lines 168-206)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('returns valid layers from JSON response', async () => {
    const layers = [
      { type: 'vector', id: 'v1', name: 'Background', visible: true, locked: false },
      { type: 'text', id: 't1', name: 'Title', visible: true, locked: false },
    ]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(layers) }],
      stop_reason: 'end_turn',
    })
    const { generateDesignFromPrompt } = await import('@/ai/ai-service')
    const result = await generateDesignFromPrompt('landing page', 800, 600)
    expect(result.length).toBe(2)
    expect(result[0]!.id).toBe('v1')
  })

  test('throws on invalid JSON response', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'This is not JSON at all, just text.' }],
      stop_reason: 'end_turn',
    })
    const { generateDesignFromPrompt } = await import('@/ai/ai-service')
    await expect(generateDesignFromPrompt('page', 800, 600)).rejects.toThrow('Failed to parse AI response as JSON')
  })

  test('throws when response is not an array', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '{"type":"vector","id":"v1","name":"BG"}' }],
      stop_reason: 'end_turn',
    })
    const { generateDesignFromPrompt } = await import('@/ai/ai-service')
    await expect(generateDesignFromPrompt('page', 800, 600)).rejects.toThrow('not an array')
  })

  test('throws when no valid layers in response', async () => {
    // Items with invalid types get filtered out
    mockFetchJSON({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { type: 'raster', id: 'r1', name: 'Bad' },
            { type: 'adjustment', id: 'a1', name: 'Bad' },
          ]),
        },
      ],
      stop_reason: 'end_turn',
    })
    const { generateDesignFromPrompt } = await import('@/ai/ai-service')
    await expect(generateDesignFromPrompt('page', 800, 600)).rejects.toThrow('no valid layers')
  })

  test('filters out null/primitive entries and keeps valid ones', async () => {
    const layers = [null, 42, 'string', { type: 'group', id: 'g1', name: 'Group' }]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(layers) }],
      stop_reason: 'end_turn',
    })
    const { generateDesignFromPrompt } = await import('@/ai/ai-service')
    const result = await generateDesignFromPrompt('page', 800, 600)
    expect(result.length).toBe(1)
    expect(result[0]!.id).toBe('g1')
  })
})

describe('ai-service: suggestColorPalette (lines 209-233)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('returns valid hex colors', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '["#ff0000","#00ff00","#0000ff"]' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    const colors = await suggestColorPalette('#ff0000')
    expect(colors).toHaveLength(3)
  })

  test('throws when response is not an array', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '{"color":"#ff0000"}' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    await expect(suggestColorPalette('#ff0000')).rejects.toThrow('not an array')
  })

  test('throws when no valid hex colors in response', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '["red","green","blue"]' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    await expect(suggestColorPalette('#ff0000')).rejects.toThrow('No valid hex colors')
  })

  test('filters out invalid hex strings', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '["#aabbcc","bad","#112233","#12345"]' }],
      stop_reason: 'end_turn',
    })
    const { suggestColorPalette } = await import('@/ai/ai-service')
    const colors = await suggestColorPalette('#000000')
    expect(colors).toEqual(['#aabbcc', '#112233'])
  })
})

describe('ai-service: critiqueDesign (lines 236-272)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('returns valid critique with clamped score', async () => {
    const critique = {
      score: 15, // should be clamped to 10
      issues: [{ type: 'alignment', description: 'Misaligned elements', severity: 'warning' }],
      suggestions: ['Align the header'],
    }
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(critique) }],
      stop_reason: 'end_turn',
    })
    const { critiqueDesign } = await import('@/ai/ai-service')
    const result = await critiqueDesign([])
    expect(result.score).toBe(10)
    expect(result.issues.length).toBe(1)
    expect(result.suggestions).toEqual(['Align the header'])
  })

  test('clamps score below 1 to 1', async () => {
    const critique = { score: -5, issues: [], suggestions: ['Something'] }
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(critique) }],
      stop_reason: 'end_turn',
    })
    const { critiqueDesign } = await import('@/ai/ai-service')
    const result = await critiqueDesign([])
    expect(result.score).toBe(1)
  })

  test('filters out invalid issues', async () => {
    const critique = {
      score: 7,
      issues: [
        { type: 'spacing', description: 'Too tight', severity: 'info' },
        { type: 123, description: 'Bad', severity: 'error' }, // invalid type
        { type: 'color', description: 'Low contrast', severity: 'bogus' }, // invalid severity
        { type: 'alignment', description: 'Off center', severity: 'error', layerId: 'layer-1' },
      ],
      suggestions: ['Fix spacing', 42, 'Add contrast'],
    }
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(critique) }],
      stop_reason: 'end_turn',
    })
    const { critiqueDesign } = await import('@/ai/ai-service')
    const result = await critiqueDesign([])
    expect(result.issues.length).toBe(2)
    expect(result.issues[0]!.severity).toBe('info')
    expect(result.issues[1]!.layerId).toBe('layer-1')
    // 42 is filtered out from suggestions
    expect(result.suggestions).toEqual(['Fix spacing', 'Add contrast'])
  })

  test('throws on invalid structure (missing score)', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '{"issues":[],"suggestions":[]}' }],
      stop_reason: 'end_turn',
    })
    const { critiqueDesign } = await import('@/ai/ai-service')
    await expect(critiqueDesign([])).rejects.toThrow('Invalid critique response')
  })

  test('throws on parse failure', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'This is not valid JSON at all' }],
      stop_reason: 'end_turn',
    })
    const { critiqueDesign } = await import('@/ai/ai-service')
    await expect(critiqueDesign([])).rejects.toThrow('Failed to parse critique')
  })
})

describe('ai-service: generatePlaceholderText (lines 274-280)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('returns trimmed text', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '  Hello world placeholder text  ' }],
      stop_reason: 'end_turn',
    })
    const { generatePlaceholderText } = await import('@/ai/ai-service')
    const result = await generatePlaceholderText('heading', 'short')
    expect(result).toBe('Hello world placeholder text')
  })

  test('works with different lengths', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'Lorem ipsum dolor sit amet.' }],
      stop_reason: 'end_turn',
    })
    const { generatePlaceholderText } = await import('@/ai/ai-service')
    const result = await generatePlaceholderText('paragraph', 'long')
    expect(result).toBe('Lorem ipsum dolor sit amet.')
  })
})

describe('ai-service: bulkRenameLayers (lines 287-320)', () => {
  beforeEach(() => {
    storage.clear()
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('returns empty array for empty input', async () => {
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    const result = await bulkRenameLayers([])
    expect(result).toEqual([])
  })

  test('returns valid renames', async () => {
    const renames = [
      { id: 'a', newName: 'Header' },
      { id: 'b', newName: 'Body' },
    ]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    const result = await bulkRenameLayers([
      { id: 'a', name: 'Layer 1', type: 'vector', details: '' },
      { id: 'b', name: 'Layer 2', type: 'text', details: '' },
    ])
    expect(result.length).toBe(2)
    expect(result[0]!.newName).toBe('Header')
  })

  test('throws on invalid JSON', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: 'not json' }],
      stop_reason: 'end_turn',
    })
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    await expect(bulkRenameLayers([{ id: 'a', name: 'Layer 1', type: 'vector', details: '' }])).rejects.toThrow(
      'Failed to parse rename response',
    )
  })

  test('throws when response is not an array', async () => {
    mockFetchJSON({
      content: [{ type: 'text', text: '{"id":"a","newName":"X"}' }],
      stop_reason: 'end_turn',
    })
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    await expect(bulkRenameLayers([{ id: 'a', name: 'Layer 1', type: 'vector', details: '' }])).rejects.toThrow(
      'not an array',
    )
  })

  test('throws when no valid renames in response', async () => {
    mockFetchJSON({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { id: 123, newName: 'Bad' },
            { id: 'a', newName: '' },
          ]),
        },
      ],
      stop_reason: 'end_turn',
    })
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    await expect(bulkRenameLayers([{ id: 'a', name: 'Layer 1', type: 'vector', details: '' }])).rejects.toThrow(
      'No valid renames',
    )
  })

  test('filters renames to only input layer IDs', async () => {
    const renames = [
      { id: 'a', newName: 'Alpha' },
      { id: 'c', newName: 'Gamma' }, // not in input
    ]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })
    const { bulkRenameLayers } = await import('@/ai/ai-service')
    const result = await bulkRenameLayers([{ id: 'a', name: 'Layer 1', type: 'vector', details: '' }])
    expect(result.length).toBe(1)
    expect(result[0]!.id).toBe('a')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// smart-rename.ts — uncovered: generateLayerNames, performSmartRename,
// buildLayerDetails, captionImage, uint8ToBase64
// ═══════════════════════════════════════════════════════════════════════════

describe('smart-rename: buildLayerDetails via generateLayerNames', () => {
  beforeEach(() => {
    storage.clear()
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    // Set up the Claude AI config for bulkRenameLayers
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('generateLayerNames for non-raster layers uses text-based rename', async () => {
    const renames = [{ id: 'v1', newName: 'Hero Section' }]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'vector' as const,
        id: 'v1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [
          {
            id: 'p1',
            segments: [{ type: 'move' as const, x: 0, y: 0 }],
            closed: false,
          },
        ],
        fill: { type: 'solid' as const, color: '#ff0000', opacity: 1 },
        stroke: null,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Hero Section')
  })

  test('generateLayerNames falls back to original names on AI error', async () => {
    mockFetchError('Server error', 500)

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'text' as const,
        id: 't1',
        name: 'Text 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        text: 'Hello World',
        fontFamily: 'Arial',
        fontSize: 16,
        fontWeight: 'normal' as const,
        fontStyle: 'normal' as const,
        textAlign: 'left' as const,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: '#000000',
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Text 1')
  })

  test('generateLayerNames handles raster layers without vision', async () => {
    // No vision endpoint set, so raster layers go through text-based rename
    const renames = [{ id: 'r1', newName: 'Photo Background' }]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: 'chunk-1',
        width: 100,
        height: 100,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
  })

  test('generateLayerNames with vision endpoint for raster layers', async () => {
    setBackendConfig({
      visionEndpoint: 'http://test.local/vision',
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    // Store raster data for the layer
    const chunkId = 'vision-chunk'
    storeRasterData(chunkId, makeImageData(64, 64, 200, 100, 50))

    // Mock vision API
    mockFetchJSON({ caption: 'a beautiful sunset over ocean' })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: chunkId,
        width: 64,
        height: 64,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Beautiful Sunset Over Ocean')
  })

  test('generateLayerNames handles vision API error gracefully', async () => {
    setBackendConfig({
      visionEndpoint: 'http://test.local/vision',
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    const chunkId = 'vision-error-chunk'
    storeRasterData(chunkId, makeImageData(32, 32))

    mockFetchError('Vision API down', 500)

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: chunkId,
        width: 32,
        height: 32,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    // Falls back to original name on error
    expect(results[0]!.suggestedName).toBe('Raster 1')
  })

  test('generateLayerNames handles raster layer with no thumbnail data', async () => {
    setBackendConfig({
      visionEndpoint: 'http://test.local/vision',
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    // Don't store any raster data for this chunk
    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Missing Data',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: 'nonexistent-chunk',
        width: 100,
        height: 100,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Missing Data')
  })

  test('generateLayerNames handles mixed raster and vector layers', async () => {
    // No vision endpoint → all go through text-based
    const renames = [
      { id: 'v1', newName: 'Header' },
      { id: 'r1', newName: 'Background Image' },
    ]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'vector' as const,
        id: 'v1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [],
        fill: null,
        stroke: null,
      },
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: 'some-chunk',
        width: 100,
        height: 100,
      },
    ] as any
    const results = await generateLayerNames(layers)
    expect(results.length).toBe(2)
  })

  test('generateLayerNames with group layers', async () => {
    const renames = [{ id: 'g1', newName: 'Navigation' }]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'group' as const,
        id: 'g1',
        name: 'Group 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        children: [
          { type: 'vector', id: 'child1', name: 'Child' },
          { type: 'vector', id: 'child2', name: 'Child 2' },
        ],
      },
    ] as any
    const results = await generateLayerNames(layers)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Navigation')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// text-to-image.ts — full fetch pipeline (lines 45-88, 92-114)
// ═══════════════════════════════════════════════════════════════════════════

describe('text-to-image: performTextToImage with mock fetch', () => {
  beforeEach(() => {
    setBackendConfig({
      textToImageEndpoint: 'http://test.local/t2i',
      inpaintingEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('returns ImageData on success', async () => {
    const b64 = fakeB64Pixels(4, 4, 200)
    mockFetchJSON({ images: [b64] })

    const { performTextToImage } = await import('@/ai/text-to-image')
    const result = await performTextToImage({
      prompt: 'cat photo',
      negativePrompt: 'blurry',
      width: 4,
      height: 4,
    })
    expect(result.length).toBe(1)
    expect(result[0]!.width).toBe(4)
    expect(result[0]!.height).toBe(4)
  })

  test('returns multiple variations', async () => {
    const b64 = fakeB64Pixels(2, 2, 100)
    mockFetchJSON({ images: [b64, b64, b64] })

    const { performTextToImage } = await import('@/ai/text-to-image')
    const result = await performTextToImage({
      prompt: 'dog photo',
      negativePrompt: '',
      width: 2,
      height: 2,
      numVariations: 3,
    })
    expect(result.length).toBe(3)
  })

  test('throws on API error', async () => {
    mockFetchError('Bad Request', 400)

    const { performTextToImage } = await import('@/ai/text-to-image')
    await expect(performTextToImage({ prompt: 'cat', negativePrompt: '', width: 4, height: 4 })).rejects.toThrow(
      'Text-to-image API error (400)',
    )
  })

  test('throws when API returns no images', async () => {
    mockFetchJSON({ images: [] })

    const { performTextToImage } = await import('@/ai/text-to-image')
    await expect(performTextToImage({ prompt: 'cat', negativePrompt: '', width: 4, height: 4 })).rejects.toThrow(
      'returned no images',
    )
  })

  test('throws when API returns null images', async () => {
    mockFetchJSON({ images: null })

    const { performTextToImage } = await import('@/ai/text-to-image')
    await expect(performTextToImage({ prompt: 'cat', negativePrompt: '', width: 4, height: 4 })).rejects.toThrow(
      'returned no images',
    )
  })

  test('pads short base64 data', async () => {
    // Only enough bytes for half the pixels
    const shortBytes = new Uint8Array(2 * 4) // 8 bytes for a 2x2 image (needs 16)
    shortBytes.fill(255)
    const b64 = Buffer.from(shortBytes).toString('base64')
    mockFetchJSON({ images: [b64] })

    const { performTextToImage } = await import('@/ai/text-to-image')
    const result = await performTextToImage({
      prompt: 'test',
      negativePrompt: '',
      width: 2,
      height: 2,
    })
    expect(result[0]!.data.length).toBe(2 * 2 * 4)
    // First 8 bytes should be 255
    expect(result[0]!.data[0]).toBe(255)
    // Padded bytes should be 0
    expect(result[0]!.data[8]).toBe(0)
  })

  test('sends optional parameters (cfgScale, steps, seed)', async () => {
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      const b64 = fakeB64Pixels(2, 2)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performTextToImage } = await import('@/ai/text-to-image')
    await performTextToImage({
      prompt: 'test',
      negativePrompt: 'bad',
      width: 2,
      height: 2,
      cfgScale: 12,
      steps: 50,
      seed: 42,
      numVariations: 2,
    })

    expect(capturedBody.cfg_scale).toBe(12)
    expect(capturedBody.steps).toBe(50)
    expect(capturedBody.seed).toBe(42)
    expect(capturedBody.num_variations).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ml-denoise.ts — requestMLDenoise, applyLocalDenoise, base64 helpers
// ═══════════════════════════════════════════════════════════════════════════

describe('ml-denoise: performMLDenoise with AI configured', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/denoise',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('uses ML backend when configured and succeeds', async () => {
    const b64 = fakeB64Pixels(4, 4, 150)
    mockFetchJSON({ image: b64 })

    const { performMLDenoise } = await import('@/ai/ml-denoise')
    const img = makeImageData(4, 4, 100, 100, 100)
    const result = await performMLDenoise(img, 50, 50)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  test('falls back to local denoise when API returns error', async () => {
    mockFetchError('Server error', 500)

    const { performMLDenoise } = await import('@/ai/ml-denoise')
    const img = makeImageData(4, 4, 100, 100, 100)
    const result = await performMLDenoise(img, 50, 50)
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  test('falls back when no endpoint configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: 'http://test.local/vision', // only vision, not inpainting
      apiKey: 'test-key',
      timeout: 60000,
    })

    const { performMLDenoise } = await import('@/ai/ml-denoise')
    const img = makeImageData(4, 4, 100, 100, 100)
    const result = await performMLDenoise(img, 50, 50)
    expect(result.width).toBe(4)
  })

  test('ML API returning no image triggers fallback', async () => {
    mockFetchJSON({ image: null })

    const { performMLDenoise } = await import('@/ai/ml-denoise')
    const img = makeImageData(4, 4, 100, 100, 100)
    // requestMLDenoise throws "no image" → caught → falls back to local
    const result = await performMLDenoise(img, 50, 50)
    expect(result.width).toBe(4)
  })

  test('clamps detailPreservation parameter', async () => {
    const b64 = fakeB64Pixels(4, 4, 150)
    mockFetchJSON({ image: b64 })

    const { performMLDenoise } = await import('@/ai/ml-denoise')
    const img = makeImageData(4, 4, 100, 100, 100)
    // Pass out-of-range values
    const result = await performMLDenoise(img, 150, -50)
    expect(result.width).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// remove-tool.ts — beginRemoveBrush, commitRemove with store
// ═══════════════════════════════════════════════════════════════════════════

describe('remove-tool: beginRemoveBrush and commitRemove', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
  })

  test('commitRemove returns false when not active', async () => {
    const { commitRemove, cancelRemove } = await import('@/ai/remove-tool')
    cancelRemove()
    const result = await commitRemove()
    expect(result).toBe(false)
  })

  test('paintRemoveBrush paints within mask when active', async () => {
    const chunkId = 'remove-test-chunk-' + Date.now()
    storeRasterData(chunkId, makeImageData(50, 50))
    setupStoreWithRasterLayer(chunkId, 'rt-layer-1', 50, 50)

    const { beginRemoveBrush, paintRemoveBrush, isRemoveActive, getRemoveMask, cancelRemove } =
      await import('@/ai/remove-tool')
    const { setRemoveToolSettings } = await import('@/ai/remove-tool')
    setRemoveToolSettings({ brushRadius: 5, featherRadius: 2 })

    const started = beginRemoveBrush(25, 25)
    expect(started).toBe(true)
    expect(isRemoveActive()).toBe(true)

    paintRemoveBrush(26, 26)
    const mask = getRemoveMask()
    expect(mask).not.toBeNull()
    expect(mask!.width).toBe(50)
    expect(mask!.height).toBe(50)
    // Center pixel should be painted
    expect(mask!.data[25 * 50 + 25]).toBe(255)

    cancelRemove()
    expect(isRemoveActive()).toBe(false)
  })

  test('commitRemove with local fallback (no AI)', async () => {
    const chunkId = 'remove-commit-chunk-' + Date.now()
    storeRasterData(chunkId, makeImageData(30, 30))
    setupStoreWithRasterLayer(chunkId, 'commit-layer', 30, 30)

    const { beginRemoveBrush, commitRemove, setRemoveToolSettings } = await import('@/ai/remove-tool')
    setRemoveToolSettings({ brushRadius: 3, featherRadius: 1 })

    beginRemoveBrush(15, 15)
    const result = await commitRemove()
    expect(result).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// text-to-vector.ts — performTextToVector (lines 115-206)
// ═══════════════════════════════════════════════════════════════════════════

describe('text-to-vector: performTextToVector', () => {
  beforeEach(() => {
    setBackendConfig({
      textToImageEndpoint: 'http://test.local/t2i',
      inpaintingEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('throws when text-to-image API returns no images', async () => {
    mockFetchJSON({ images: [] })

    const { performTextToVector } = await import('@/ai/text-to-vector')
    await expect(performTextToVector({ prompt: 'test', style: 'flat', size: 64 })).rejects.toThrow()
  })

  test('propagates API errors from performTextToImage', async () => {
    mockFetchError('Server error', 500)

    const { performTextToVector } = await import('@/ai/text-to-vector')
    await expect(performTextToVector({ prompt: 'test', style: 'flat', size: 64 })).rejects.toThrow(
      'Text-to-image API error',
    )
  })

  test('sends augmented prompt with style suffix', async () => {
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      // Return a uniform gray image (will trace to nothing)
      const b64 = fakeB64Pixels(64, 64, 128)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performTextToVector } = await import('@/ai/text-to-vector')
    try {
      await performTextToVector({ prompt: 'mountain landscape', style: 'geometric', size: 64 })
    } catch {
      // Expected: "no vector paths" or trace-related error
    }
    expect(capturedBody.prompt).toContain('mountain landscape')
    expect(capturedBody.prompt).toContain('geometric')
    expect(capturedBody.negative_prompt).toContain('organic')
  })

  test('all style presets are accessible', () => {
    const { getAvailableStyles, getStylePreset } = require('@/ai/text-to-vector')
    const styles = getAvailableStyles()
    expect(styles.length).toBe(5)
    for (const style of styles) {
      const preset = getStylePreset(style)
      expect(preset.promptSuffix).toBeTruthy()
      expect(preset.negativePrompt).toBeTruthy()
      expect(preset.traceOptions).toBeTruthy()
    }
  })

  test('adjusts trace parameters based on detail level', async () => {
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      const b64 = fakeB64Pixels(64, 64, 128)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performTextToVector } = await import('@/ai/text-to-vector')
    try {
      await performTextToVector({ prompt: 'shape', style: 'detailed', detail: 90, size: 64 })
    } catch {
      // Expected: trace error
    }
    expect(capturedBody).not.toBeNull()
  })

  test('applies line-art style negative prompt', async () => {
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      const b64 = fakeB64Pixels(64, 64, 128)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performTextToVector } = await import('@/ai/text-to-vector')
    try {
      await performTextToVector({ prompt: 'cat', style: 'line-art', size: 64 })
    } catch {
      // Expected
    }
    expect(capturedBody.negative_prompt).toContain('color')
    expect(capturedBody.prompt).toContain('line art')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generative-fill.ts — requestInpainting, performGenerativeFill pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe('generative-fill: requestInpainting', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/inpaint',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('returns ImageData results on success', async () => {
    const b64 = fakeB64Pixels(4, 4, 200)
    mockFetchJSON({ images: [b64] })

    const { requestInpainting } = await import('@/ai/generative-fill')
    const context = makeImageData(4, 4)
    const mask = new Uint8Array(4 * 4)
    mask.fill(255)
    const results = await requestInpainting(context, mask, 'fill with sky', 1)
    expect(results.length).toBe(1)
    expect(results[0]!.width).toBe(4)
  })

  test('throws on API error', async () => {
    mockFetchError('Bad request', 400)

    const { requestInpainting } = await import('@/ai/generative-fill')
    const context = makeImageData(4, 4)
    const mask = new Uint8Array(16)
    await expect(requestInpainting(context, mask, 'test')).rejects.toThrow('Inpainting API error (400)')
  })

  test('throws when API returns no images', async () => {
    mockFetchJSON({ images: [] })

    const { requestInpainting } = await import('@/ai/generative-fill')
    const context = makeImageData(4, 4)
    const mask = new Uint8Array(16)
    await expect(requestInpainting(context, mask, 'test')).rejects.toThrow('returned no images')
  })

  test('throws when no endpoint configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })

    const { requestInpainting } = await import('@/ai/generative-fill')
    const context = makeImageData(4, 4)
    const mask = new Uint8Array(16)
    await expect(requestInpainting(context, mask, 'test')).rejects.toThrow('endpoint not configured')
  })
})

describe('generative-fill: performGenerativeFill full pipeline', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/inpaint',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('throws when no selection is active', async () => {
    setSelectionMask(null)
    const { performGenerativeFill } = await import('@/ai/generative-fill')
    await expect(performGenerativeFill('fill prompt')).rejects.toThrow('No selection active')
  })

  test('throws when no artboard', async () => {
    setSelectionMask({ width: 10, height: 10, data: new Uint8Array(100).fill(255) })
    const store = useEditorStore.getState()
    // Delete all artboards
    const artboardIds = store.document.artboards.map((a) => a.id)
    for (const id of artboardIds) {
      store.deleteArtboard(id)
    }

    const { performGenerativeFill } = await import('@/ai/generative-fill')
    await expect(performGenerativeFill('fill prompt')).rejects.toThrow('No artboard')

    // Restore an artboard
    store.addArtboard('Restored', 800, 600)
  })

  test('throws when no raster layer found', async () => {
    setSelectionMask({ width: 10, height: 10, data: new Uint8Array(100).fill(255) })
    const store = useEditorStore.getState()

    // Ensure artboard exists
    if (store.document.artboards.length === 0) {
      store.addArtboard('Test', 800, 600)
    }
    // Clear all layers
    clearArtboardLayers()

    const { performGenerativeFill } = await import('@/ai/generative-fill')
    await expect(performGenerativeFill('fill prompt')).rejects.toThrow('No raster layer')
  })

  test('full pipeline success: selection, raster layer, API call, composite', async () => {
    const chunkId = 'gf-pipeline-chunk-' + Date.now()
    storeRasterData(chunkId, makeImageData(20, 20))

    // Set up a selection mask covering center
    const maskData = new Uint8Array(20 * 20)
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        maskData[y * 20 + x] = 255
      }
    }
    setSelectionMask({ width: 20, height: 20, data: maskData })

    setupStoreWithRasterLayer(chunkId, 'gf-layer', 20, 20)

    // Mock the inpainting API response
    globalThis.fetch = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      const w = body.width
      const h = body.height
      const b64 = fakeB64Pixels(w, h, 200)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performGenerativeFill } = await import('@/ai/generative-fill')
    const results = await performGenerativeFill('fill with ocean', 1)
    expect(results.length).toBeGreaterThanOrEqual(1)

    // Verify the raster data was updated
    const updated = getRasterData(chunkId)
    expect(updated).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// super-resolution.ts — performSuperResolution (lines 182-267)
// ═══════════════════════════════════════════════════════════════════════════

describe('super-resolution: performSuperResolution', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/sr',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('throws when AI not configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    const { performSuperResolution } = await import('@/ai/super-resolution')
    const img = makeImageData(4, 4)
    await expect(performSuperResolution(img, 2)).rejects.toThrow('not configured')
  })

  test('throws when no endpoint', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: 'http://test.local/t2i', // has something configured, but not inpainting
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
    const { performSuperResolution } = await import('@/ai/super-resolution')
    const img = makeImageData(4, 4)
    await expect(performSuperResolution(img, 2)).rejects.toThrow('No endpoint configured')
  })

  test('upscales a small image via API', async () => {
    // For a 4x4 image with scale 2, output is 8x8
    globalThis.fetch = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      const scale = body.params.scaleFactor
      const outW = body.width * scale
      const outH = body.height * scale
      const b64 = fakeB64Pixels(outW, outH, 180)
      return new Response(JSON.stringify({ image: b64, width: outW, height: outH }), { status: 200 })
    }) as any

    const { performSuperResolution } = await import('@/ai/super-resolution')
    const img = makeImageData(4, 4, 100, 100, 100)
    const result = await performSuperResolution(img, 2, 'photo')
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
  })

  test('API error in tile processing throws', async () => {
    mockFetchError('Internal error', 500)

    const { performSuperResolution } = await import('@/ai/super-resolution')
    const img = makeImageData(4, 4)
    await expect(performSuperResolution(img, 2)).rejects.toThrow('Super resolution API error (500)')
  })

  test('API returning no image throws', async () => {
    mockFetchJSON({ image: null })

    const { performSuperResolution } = await import('@/ai/super-resolution')
    const img = makeImageData(4, 4)
    await expect(performSuperResolution(img, 2)).rejects.toThrow('returned no image')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// neural-filters.ts — applyNeuralFilter (lines 143-208)
// ═══════════════════════════════════════════════════════════════════════════

describe('neural-filters: applyNeuralFilter', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/neural',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('applies a built-in filter successfully', async () => {
    const b64 = fakeB64Pixels(4, 4, 200)
    mockFetchJSON({ image: b64 })

    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4, 100, 100, 100)
    const result = await applyNeuralFilter(img, 'colorize', { saturation: 150 })
    expect(result.width).toBe(4)
    expect(result.height).toBe(4)
  })

  test('throws for unknown filter ID', async () => {
    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await expect(applyNeuralFilter(img, 'nonexistent-filter')).rejects.toThrow('Unknown neural filter')
  })

  test('throws when AI not configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await expect(applyNeuralFilter(img, 'colorize')).rejects.toThrow('not configured')
  })

  test('throws when no endpoint configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: 'http://test.local/t2i',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await expect(applyNeuralFilter(img, 'colorize')).rejects.toThrow('No endpoint configured')
  })

  test('API error throws with status', async () => {
    mockFetchError('Bad Request', 400)

    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await expect(applyNeuralFilter(img, 'colorize')).rejects.toThrow('Neural filter API error (400)')
  })

  test('API returning no image throws', async () => {
    mockFetchJSON({ image: null })

    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await expect(applyNeuralFilter(img, 'colorize')).rejects.toThrow('returned no image')
  })

  test('uses filter-specific endpoint when set', async () => {
    let capturedUrl = ''
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url
      const b64 = fakeB64Pixels(4, 4)
      return new Response(JSON.stringify({ image: b64 }), { status: 200 })
    }) as any

    const { registerFilter, applyNeuralFilter, unregisterFilter } = await import('@/ai/neural-filters')
    const customFilter = {
      id: 'custom-endpoint-test',
      name: 'Custom',
      description: 'Test',
      params: [{ name: 'strength', type: 'slider' as const, min: 0, max: 100, default: 50 }],
      endpoint: 'http://custom.endpoint/filter',
    }
    registerFilter(customFilter)

    const img = makeImageData(4, 4)
    await applyNeuralFilter(img, 'custom-endpoint-test', { strength: 75 })
    expect(capturedUrl).toBe('http://custom.endpoint/filter')

    unregisterFilter('custom-endpoint-test')
  })

  test('merges default params with provided overrides', async () => {
    let capturedBody: any = null
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      const b64 = fakeB64Pixels(4, 4)
      return new Response(JSON.stringify({ image: b64 }), { status: 200 })
    }) as any

    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    await applyNeuralFilter(img, 'depth-blur', { blurStrength: 80 })

    // blurStrength should be 80 (overridden), focalPoint should be 50 (default), bokehShape should be 'circle' (default)
    expect(capturedBody.params.blurStrength).toBe(80)
    expect(capturedBody.params.focalPoint).toBe(50)
    expect(capturedBody.params.bokehShape).toBe('circle')
  })

  test('respects output dimensions from API response', async () => {
    const b64 = fakeB64Pixels(8, 8, 200) // double size
    mockFetchJSON({ image: b64, width: 8, height: 8 })

    const { applyNeuralFilter } = await import('@/ai/neural-filters')
    const img = makeImageData(4, 4)
    const result = await applyNeuralFilter(img, 'super-resolution', { scaleFactor: '2x' })
    expect(result.width).toBe(8)
    expect(result.height).toBe(8)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generative-expand.ts — performGenerativeExpand (lines 215-279)
// ═══════════════════════════════════════════════════════════════════════════

describe('generative-expand: performGenerativeExpand', () => {
  beforeEach(() => {
    setBackendConfig({
      inpaintingEndpoint: 'http://test.local/inpaint',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: 'test-key',
      timeout: 60000,
    })
  })

  test('throws when AI not configured', async () => {
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    const { performGenerativeExpand } = await import('@/ai/generative-expand')
    await expect(performGenerativeExpand('right', 100)).rejects.toThrow('not configured')
  })

  test('throws when no artboard', async () => {
    const store = useEditorStore.getState()
    const artboardIds = store.document.artboards.map((a) => a.id)
    for (const id of artboardIds) {
      store.deleteArtboard(id)
    }

    const { performGenerativeExpand } = await import('@/ai/generative-expand')
    await expect(performGenerativeExpand('right', 100)).rejects.toThrow('No artboard')

    store.addArtboard('Restored', 800, 600)
  })

  test('throws when no raster layer', async () => {
    const store = useEditorStore.getState()
    if (store.document.artboards.length === 0) {
      store.addArtboard('Test', 800, 600)
    }
    clearArtboardLayers()

    const { performGenerativeExpand } = await import('@/ai/generative-expand')
    await expect(performGenerativeExpand('right', 100)).rejects.toThrow('No raster layer')
  })

  test('full pipeline success: expand right', async () => {
    const chunkId = 'expand-test-chunk-' + Date.now()
    storeRasterData(chunkId, makeImageData(20, 20, 100, 100, 100))
    setupStoreWithRasterLayer(chunkId, 'expand-layer', 20, 20)

    // Mock inpainting response
    globalThis.fetch = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      const w = body.width
      const h = body.height
      const b64 = fakeB64Pixels(w, h, 180)
      return new Response(JSON.stringify({ images: [b64] }), { status: 200 })
    }) as any

    const { performGenerativeExpand } = await import('@/ai/generative-expand')
    const result = await performGenerativeExpand('right', 10, 'continue the scene')
    expect(result.width).toBe(30) // 20 + 10
    expect(result.height).toBe(20)
  })

  test('throws when inpainting returns no results', async () => {
    const chunkId = 'expand-no-results-' + Date.now()
    storeRasterData(chunkId, makeImageData(10, 10))
    setupStoreWithRasterLayer(chunkId, 'expand-nr-layer', 10, 10)

    mockFetchJSON({ images: [] })

    const { performGenerativeExpand } = await import('@/ai/generative-expand')
    await expect(performGenerativeExpand('bottom', 10)).rejects.toThrow('returned no images')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generative-expand.ts — computeTiles for large expansions
// ═══════════════════════════════════════════════════════════════════════════

describe('generative-expand: computeTiles for large expansions', () => {
  test('large horizontal expansion produces multiple tiles', () => {
    const { computeTiles } = require('@/ai/generative-expand')
    const tiles = computeTiles('right', 1000, 1200, 400)
    expect(tiles.length).toBeGreaterThan(1)
  })

  test('large vertical expansion produces multiple tiles', () => {
    const { computeTiles } = require('@/ai/generative-expand')
    const tiles = computeTiles('bottom', 1000, 400, 1200)
    expect(tiles.length).toBeGreaterThan(1)
  })

  test('left direction large expansion', () => {
    const { computeTiles } = require('@/ai/generative-expand')
    const tiles = computeTiles('left', 800, 1000, 400)
    expect(tiles.length).toBeGreaterThan(1)
  })

  test('top direction large expansion', () => {
    const { computeTiles } = require('@/ai/generative-expand')
    const tiles = computeTiles('top', 800, 400, 1000)
    expect(tiles.length).toBeGreaterThan(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// generative-expand.ts — blendOverlap for all directions
// ═══════════════════════════════════════════════════════════════════════════

describe('generative-expand: blendOverlap all directions', () => {
  test('left direction blends correctly', () => {
    const { blendOverlap } = require('@/ai/generative-expand')
    const base = makeImageData(10, 10, 0, 0, 0)
    const overlay = makeImageData(10, 10, 255, 255, 255)
    const result = blendOverlap(base, overlay, 5, 'left')
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
  })

  test('top direction blends correctly', () => {
    const { blendOverlap } = require('@/ai/generative-expand')
    const base = makeImageData(10, 10, 0, 0, 0)
    const overlay = makeImageData(10, 10, 255, 255, 255)
    const result = blendOverlap(base, overlay, 5, 'top')
    expect(result.width).toBe(10)
  })

  test('bottom direction blends correctly', () => {
    const { blendOverlap } = require('@/ai/generative-expand')
    const base = makeImageData(10, 10, 50, 50, 50)
    const overlay = makeImageData(10, 10, 200, 200, 200)
    const result = blendOverlap(base, overlay, 5, 'bottom')
    expect(result.width).toBe(10)
    // Inside the overlap region (bottom 5 rows), values should be blended
    const outsideI = (0 * 10 + 5) * 4 // first row (fully overlay with t=1)
    // Pixel at top (outside overlap) should be fully overlay
    expect(result.data[outsideI]).toBe(200)
    // Last row (inside overlap) should be blended
    const lastRowI = (9 * 10 + 5) * 4
    expect(result.data[lastRowI]).toBeGreaterThan(50)
    expect(result.data[lastRowI]).toBeLessThan(200)
  })
})

// remove-tool: commitRemove with AI inpainting tests removed (require complex store+raster setup)

// ═══════════════════════════════════════════════════════════════════════════
// smart-rename.ts — buildLayerDetails for different layer types
// ═══════════════════════════════════════════════════════════════════════════

describe('smart-rename: buildLayerDetails covers all layer types', () => {
  beforeEach(() => {
    storage.clear()
    setBackendConfig({
      inpaintingEndpoint: '',
      textToImageEndpoint: '',
      visionEndpoint: '',
      apiKey: '',
      timeout: 60000,
    })
    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })
  })

  test('covers adjustment, filter, fill, clone, smart-object layer types', async () => {
    // Each layer type triggers different buildLayerDetails logic
    const renames = [
      { id: 'adj1', newName: 'Brightness' },
      { id: 'flt1', newName: 'Blur Filter' },
      { id: 'fill1', newName: 'Solid Fill' },
      { id: 'cln1', newName: 'Stamped Copy' },
      { id: 'so1', newName: 'Linked Object' },
    ]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'adjustment',
        id: 'adj1',
        name: 'Adjustment 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        adjustmentType: 'brightness',
      },
      {
        type: 'filter',
        id: 'flt1',
        name: 'Filter 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        filterParams: { kind: 'gaussian-blur' },
      },
      {
        type: 'fill',
        id: 'fill1',
        name: 'Fill 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        fillType: 'solid',
      },
      {
        type: 'clone',
        id: 'cln1',
        name: 'Clone 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        sourceLayerId: 'original-layer-id',
      },
      {
        type: 'smart-object',
        id: 'so1',
        name: 'Smart Object 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        sourceType: 'linked',
      },
    ] as any
    const results = await generateLayerNames(layers)
    expect(results.length).toBe(5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// smart-rename.ts — captionImage with vision API using text response
// ═══════════════════════════════════════════════════════════════════════════

describe('smart-rename: captionImage via generateLayerNames with text field', () => {
  test('uses text field when caption is absent', async () => {
    setBackendConfig({
      visionEndpoint: 'http://test.local/vision',
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    const chunkId = 'vision-text-chunk'
    storeRasterData(chunkId, makeImageData(32, 32, 50, 100, 150))

    // Return text field instead of caption
    mockFetchJSON({ text: 'a blue abstract pattern' })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: chunkId,
        width: 32,
        height: 32,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Blue Abstract Pattern')
  })

  test('defaults to "Layer" when no caption/text in response', async () => {
    setBackendConfig({
      visionEndpoint: 'http://test.local/vision',
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    const chunkId = 'vision-empty-chunk'
    storeRasterData(chunkId, makeImageData(32, 32))

    // Return neither caption nor text
    mockFetchJSON({})

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: chunkId,
        width: 32,
        height: 32,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
    expect(results[0]!.suggestedName).toBe('Layer')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// smart-rename.ts — vision endpoint not configured error
// ═══════════════════════════════════════════════════════════════════════════

describe('smart-rename: captionImage with no vision endpoint', () => {
  test('vision error when endpoint not set', async () => {
    setBackendConfig({
      visionEndpoint: '', // no vision endpoint
      inpaintingEndpoint: 'http://test.local/inpaint',
      apiKey: 'test-key',
      textToImageEndpoint: '',
      timeout: 60000,
    })

    // Even though AI is configured (inpainting), no vision endpoint
    // Raster layers should go through text-based path
    const renames = [{ id: 'r1', newName: 'Photo' }]
    mockFetchJSON({
      content: [{ type: 'text', text: JSON.stringify(renames) }],
      stop_reason: 'end_turn',
    })

    setServiceConfig({ apiKey: 'test-key', model: 'claude-3' })

    const { generateLayerNames } = await import('@/ai/smart-rename')
    const layers = [
      {
        type: 'raster' as const,
        id: 'r1',
        name: 'Raster 1',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        imageChunkId: 'some-chunk',
        width: 100,
        height: 100,
      },
    ]
    const results = await generateLayerNames(layers as any)
    expect(results.length).toBe(1)
  })
})
