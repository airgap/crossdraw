import { describe, it, expect, beforeEach } from 'bun:test'
import { buildRenamePrompt } from '@/ai/prompt-templates'
import type { RenameLayerInfo } from '@/ai/prompt-templates'
import type { VectorLayer, TextLayer, GroupLayer } from '@/types'

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

// ── buildRenamePrompt tests ──

describe('buildRenamePrompt', () => {
  const sampleLayers: RenameLayerInfo[] = [
    { id: 'v1', name: 'Rectangle', type: 'vector', details: 'fill=#ff0000, stroke=none, pos=(10, 20)' },
    { id: 't1', name: 'Layer 1', type: 'text', details: 'text="Welcome", font=Inter 32px, color=#000000' },
    { id: 'g1', name: 'Group', type: 'group', details: '3 children' },
  ]

  it('returns system and user strings', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
    expect(result.system.length).toBeGreaterThan(50)
    expect(result.user.length).toBeGreaterThan(0)
  })

  it('includes layer names in the user prompt', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.user).toContain('Rectangle')
    expect(result.user).toContain('Layer 1')
    expect(result.user).toContain('Group')
  })

  it('includes layer types in the user prompt', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.user).toContain('vector')
    expect(result.user).toContain('text')
    expect(result.user).toContain('group')
  })

  it('includes layer IDs in the user prompt', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.user).toContain('v1')
    expect(result.user).toContain('t1')
    expect(result.user).toContain('g1')
  })

  it('includes layer details in the user prompt', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.user).toContain('fill=#ff0000')
    expect(result.user).toContain('Welcome')
    expect(result.user).toContain('3 children')
  })

  it('includes layer count in the user prompt', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.user).toContain('3 layers')
  })

  it('instructs to return JSON array with id and newName', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.system).toContain('JSON array')
    expect(result.system).toContain('id')
    expect(result.system).toContain('newName')
  })

  it('instructs against generic names', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.system).toContain('Layer 1')
    expect(result.system).toContain('Rectangle')
  })

  it('requests semantic, meaningful names', () => {
    const result = buildRenamePrompt(sampleLayers)
    expect(result.system).toContain('semantic')
    expect(result.system).toContain('meaningful')
  })

  it('works with a single layer', () => {
    const single: RenameLayerInfo[] = [
      { id: 'x1', name: 'Rect', type: 'vector', details: 'fill=#000' },
    ]
    const result = buildRenamePrompt(single)
    expect(result.user).toContain('1 layers')
    expect(result.user).toContain('x1')
  })
})

// ── Response parsing tests ──

describe('rename response parsing', () => {
  it('parses valid JSON array of renames', () => {
    const json = '[{"id":"v1","newName":"Hero Background"},{"id":"t1","newName":"Welcome Heading"}]'
    const parsed = JSON.parse(json) as unknown[]

    const renames = parsed.filter((item): item is { id: string; newName: string } => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return typeof obj.id === 'string' && typeof obj.newName === 'string' && (obj.newName as string).length > 0
    })

    expect(renames).toHaveLength(2)
    expect(renames[0]!.id).toBe('v1')
    expect(renames[0]!.newName).toBe('Hero Background')
    expect(renames[1]!.id).toBe('t1')
    expect(renames[1]!.newName).toBe('Welcome Heading')
  })

  it('filters out entries with missing id', () => {
    const json = '[{"newName":"Background"},{"id":"v1","newName":"Valid"}]'
    const parsed = JSON.parse(json) as unknown[]

    const renames = parsed.filter((item): item is { id: string; newName: string } => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return typeof obj.id === 'string' && typeof obj.newName === 'string' && (obj.newName as string).length > 0
    })

    expect(renames).toHaveLength(1)
    expect(renames[0]!.id).toBe('v1')
  })

  it('filters out entries with missing newName', () => {
    const json = '[{"id":"v1"},{"id":"v2","newName":"Valid Name"}]'
    const parsed = JSON.parse(json) as unknown[]

    const renames = parsed.filter((item): item is { id: string; newName: string } => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return typeof obj.id === 'string' && typeof obj.newName === 'string' && (obj.newName as string).length > 0
    })

    expect(renames).toHaveLength(1)
    expect(renames[0]!.id).toBe('v2')
  })

  it('filters out entries with empty newName', () => {
    const json = '[{"id":"v1","newName":""},{"id":"v2","newName":"Good Name"}]'
    const parsed = JSON.parse(json) as unknown[]

    const renames = parsed.filter((item): item is { id: string; newName: string } => {
      if (typeof item !== 'object' || item === null) return false
      const obj = item as Record<string, unknown>
      return typeof obj.id === 'string' && typeof obj.newName === 'string' && (obj.newName as string).length > 0
    })

    expect(renames).toHaveLength(1)
    expect(renames[0]!.id).toBe('v2')
  })

  it('handles malformed JSON gracefully', () => {
    const badJson = 'not valid json at all'
    expect(() => JSON.parse(badJson)).toThrow()
  })

  it('rejects non-array response', () => {
    const json = '{"id":"v1","newName":"Name"}'
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(false)
  })

  it('extracts JSON from markdown code fences', () => {
    const withFences = '```json\n[{"id":"v1","newName":"Background"}]\n```'
    const fenceMatch = withFences.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    expect(fenceMatch).not.toBeNull()
    const parsed = JSON.parse(fenceMatch![1]!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].id).toBe('v1')
    expect(parsed[0].newName).toBe('Background')
  })

  it('extracts JSON from surrounding text', () => {
    const withText = 'Here are the renames:\n[{"id":"v1","newName":"Background"}]\nHope this helps!'
    const jsonMatch = withText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
    expect(jsonMatch).not.toBeNull()
    const parsed = JSON.parse(jsonMatch![1]!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].newName).toBe('Background')
  })

  it('filters renames to only known layer IDs', () => {
    const inputIds = new Set(['v1', 'v2'])
    const renames = [
      { id: 'v1', newName: 'Background' },
      { id: 'v2', newName: 'Foreground' },
      { id: 'unknown', newName: 'Stray' },
    ]
    const filtered = renames.filter((r) => inputIds.has(r.id))
    expect(filtered).toHaveLength(2)
    expect(filtered.map((r) => r.id)).toEqual(['v1', 'v2'])
  })
})

// ── Filtering out already-meaningful names ──

describe('filtering layers with meaningful names', () => {
  const GENERIC_PATTERNS = [
    /^Layer\s*\d*$/i,
    /^Rectangle\s*\d*$/i,
    /^Ellipse\s*\d*$/i,
    /^Group\s*\d*$/i,
    /^Vector\s*\d*$/i,
    /^Path\s*\d*$/i,
    /^Text\s*\d*$/i,
    /^Frame\s*\d*$/i,
    /^Shape\s*\d*$/i,
    /^Image\s*\d*$/i,
  ]

  function isGenericName(name: string): boolean {
    return GENERIC_PATTERNS.some((p) => p.test(name.trim()))
  }

  it('identifies generic names', () => {
    expect(isGenericName('Layer 1')).toBe(true)
    expect(isGenericName('Rectangle')).toBe(true)
    expect(isGenericName('Rectangle 2')).toBe(true)
    expect(isGenericName('Group')).toBe(true)
    expect(isGenericName('Vector 5')).toBe(true)
    expect(isGenericName('Ellipse')).toBe(true)
    expect(isGenericName('Text')).toBe(true)
    expect(isGenericName('Path 12')).toBe(true)
  })

  it('recognizes meaningful names', () => {
    expect(isGenericName('Hero Background')).toBe(false)
    expect(isGenericName('Submit Button')).toBe(false)
    expect(isGenericName('Navigation Bar')).toBe(false)
    expect(isGenericName('User Avatar')).toBe(false)
    expect(isGenericName('Logo Icon')).toBe(false)
  })

  it('can filter a layer list to only generic names', () => {
    const layers: RenameLayerInfo[] = [
      { id: 'v1', name: 'Rectangle', type: 'vector', details: '' },
      { id: 'v2', name: 'Hero Background', type: 'vector', details: '' },
      { id: 't1', name: 'Layer 1', type: 'text', details: '' },
      { id: 'g1', name: 'Navigation Bar', type: 'group', details: '' },
    ]

    const genericLayers = layers.filter((l) => isGenericName(l.name))
    expect(genericLayers).toHaveLength(2)
    expect(genericLayers[0]!.id).toBe('v1')
    expect(genericLayers[1]!.id).toBe('t1')
  })
})

// ── Store bulk rename action ──

describe('bulkRenameLayers store action', () => {
  // We test the store action by importing the actual store
  // Need to ensure enablePatches is called

  let storeModule: typeof import('@/store/editor.store')

  beforeEach(async () => {
    storeModule = await import('@/store/editor.store')
    // Reset to a fresh document
    storeModule.useEditorStore.getState().newDocument({ title: 'Test', width: 800, height: 600 })
  })

  it('renames multiple layers in one undo-able action', () => {
    const store = storeModule.useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    // Add some layers
    const vectorLayer: VectorLayer = {
      type: 'vector',
      id: 'rename-v1',
      name: 'Rectangle',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: { type: 'solid', color: '#ff0000', opacity: 1 },
      stroke: null,
    }

    const textLayer: TextLayer = {
      type: 'text',
      id: 'rename-t1',
      name: 'Layer 1',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      text: 'Hello',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textAlign: 'left',
      lineHeight: 1.2,
      letterSpacing: 0,
      color: '#000000',
    }

    store.addLayer(artboard.id, vectorLayer)
    store.addLayer(artboard.id, textLayer)

    // Apply bulk renames
    store.bulkRenameLayers(artboard.id, [
      { layerId: 'rename-v1', newName: 'Hero Background' },
      { layerId: 'rename-t1', newName: 'Welcome Heading' },
    ])

    // Check renames applied
    const updatedArtboard = storeModule.useEditorStore.getState().document.artboards[0]!
    const v1 = updatedArtboard.layers.find((l) => l.id === 'rename-v1')
    const t1 = updatedArtboard.layers.find((l) => l.id === 'rename-t1')

    expect(v1!.name).toBe('Hero Background')
    expect(t1!.name).toBe('Welcome Heading')
  })

  it('can be undone to restore original names', () => {
    const store = storeModule.useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const vectorLayer: VectorLayer = {
      type: 'vector',
      id: 'undo-v1',
      name: 'Original Name',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }

    store.addLayer(artboard.id, vectorLayer)

    store.bulkRenameLayers(artboard.id, [{ layerId: 'undo-v1', newName: 'New Name' }])

    expect(storeModule.useEditorStore.getState().document.artboards[0]!.layers.find((l) => l.id === 'undo-v1')!.name).toBe('New Name')

    // Undo
    storeModule.useEditorStore.getState().undo()

    expect(storeModule.useEditorStore.getState().document.artboards[0]!.layers.find((l) => l.id === 'undo-v1')!.name).toBe('Original Name')
  })

  it('skips layers that do not exist', () => {
    const store = storeModule.useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const vectorLayer: VectorLayer = {
      type: 'vector',
      id: 'exists-v1',
      name: 'Existing Layer',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }

    store.addLayer(artboard.id, vectorLayer)

    // Include a rename for a non-existent layer — should not throw
    store.bulkRenameLayers(artboard.id, [
      { layerId: 'exists-v1', newName: 'Renamed' },
      { layerId: 'nonexistent', newName: 'Ghost' },
    ])

    const updated = storeModule.useEditorStore.getState().document.artboards[0]!
    expect(updated.layers.find((l) => l.id === 'exists-v1')!.name).toBe('Renamed')
  })

  it('handles empty renames array without error', () => {
    const store = storeModule.useEditorStore.getState()
    const artboard = store.document.artboards[0]!
    const layersBefore = artboard.layers.length

    // Should be a no-op
    store.bulkRenameLayers(artboard.id, [])

    const layersAfter = storeModule.useEditorStore.getState().document.artboards[0]!.layers.length
    expect(layersAfter).toBe(layersBefore)
  })

  it('renames layers inside groups', () => {
    const store = storeModule.useEditorStore.getState()
    const artboard = store.document.artboards[0]!

    const childLayer: VectorLayer = {
      type: 'vector',
      id: 'child-v1',
      name: 'Vector 1',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      paths: [],
      fill: null,
      stroke: null,
    }

    const groupLayer: GroupLayer = {
      type: 'group',
      id: 'group-v1',
      name: 'Group',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      children: [childLayer],
    }

    store.addLayer(artboard.id, groupLayer)

    store.bulkRenameLayers(artboard.id, [
      { layerId: 'group-v1', newName: 'Navigation Group' },
      { layerId: 'child-v1', newName: 'Nav Icon' },
    ])

    const updated = storeModule.useEditorStore.getState().document.artboards[0]!
    const group = updated.layers.find((l) => l.id === 'group-v1') as GroupLayer
    expect(group.name).toBe('Navigation Group')
    expect(group.children[0]!.name).toBe('Nav Icon')
  })
})
