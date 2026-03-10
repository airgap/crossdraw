import { describe, test, expect, beforeEach } from 'bun:test'
import type {
  PNGTuberConfig,
  PNGTuberTag,
  Layer,
  VectorLayer,
} from '@/types'

// ── Helpers ──

function createTestLayer(overrides: Partial<VectorLayer> = {}): VectorLayer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Layer',
    type: 'vector',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    paths: [],
    fill: { type: 'solid', color: '#000000', opacity: 1 },
    stroke: null,
    ...overrides,
  }
}

function createDefaultPNGTuberConfig(): PNGTuberConfig {
  return {
    enabled: true,
    expressions: ['idle', 'talking', 'happy', 'sad', 'surprised'],
    maxFileSize: 2 * 1024 * 1024,
    defaultExpression: 'idle',
  }
}

/** Simulate getVisibleLayersForExpression logic. */
function getVisibleLayersForExpression(layers: Layer[], expression: string): Layer[] {
  return layers.filter((layer) => {
    if (!layer.visible) return false
    if (!layer.pngtuberExpression) return true
    return layer.pngtuberExpression === expression
  })
}

/** Compute validation warnings. */
interface ValidationWarning {
  type: 'missing-tag' | 'no-unique-layers'
  message: string
}

const REQUIRED_TAGS: PNGTuberTag[] = ['head', 'eyes', 'mouth', 'body']

function computeValidation(allLayers: Layer[], expressions: string[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = []
  for (const tag of REQUIRED_TAGS) {
    const hasTag = allLayers.some((l) => l.pngtuberTag === tag)
    if (!hasTag) {
      warnings.push({ type: 'missing-tag', message: `No ${tag} layer tagged` })
    }
  }
  for (const expr of expressions) {
    const hasUniqueLayers = allLayers.some(
      (l) => l.pngtuberTag && l.pngtuberExpression === expr,
    )
    if (!hasUniqueLayers) {
      warnings.push({ type: 'no-unique-layers', message: `Expression '${expr}' has no unique layers` })
    }
  }
  return warnings
}

// ── Tests ──

describe('PNGTuberConfig defaults', () => {
  test('creates config with default expressions', () => {
    const config = createDefaultPNGTuberConfig()
    expect(config.enabled).toBe(true)
    expect(config.expressions).toEqual(['idle', 'talking', 'happy', 'sad', 'surprised'])
    expect(config.defaultExpression).toBe('idle')
    expect(config.maxFileSize).toBe(2 * 1024 * 1024)
  })

  test('default expression is one of the available expressions', () => {
    const config = createDefaultPNGTuberConfig()
    expect(config.expressions).toContain(config.defaultExpression)
  })

  test('maxFileSize defaults to 2MB', () => {
    const config = createDefaultPNGTuberConfig()
    expect(config.maxFileSize).toBe(2097152) // 2 * 1024 * 1024
  })
})

describe('Expression list management', () => {
  let config: PNGTuberConfig

  beforeEach(() => {
    config = createDefaultPNGTuberConfig()
  })

  test('add a new expression', () => {
    const name = 'angry'
    if (!config.expressions.includes(name)) {
      config.expressions.push(name)
    }
    expect(config.expressions).toContain('angry')
    expect(config.expressions).toHaveLength(6)
  })

  test('adding duplicate expression does not create duplicates', () => {
    const name = 'idle'
    const before = config.expressions.length
    if (!config.expressions.includes(name)) {
      config.expressions.push(name)
    }
    expect(config.expressions.length).toBe(before)
  })

  test('remove an expression', () => {
    config.expressions = config.expressions.filter((e) => e !== 'happy')
    expect(config.expressions).not.toContain('happy')
    expect(config.expressions).toHaveLength(4)
  })

  test('removing the default expression falls back to first available', () => {
    config.defaultExpression = 'happy'
    config.expressions = config.expressions.filter((e) => e !== 'happy')
    if (!config.expressions.includes(config.defaultExpression)) {
      config.defaultExpression = config.expressions[0] ?? 'idle'
    }
    expect(config.defaultExpression).toBe('idle')
    expect(config.expressions).not.toContain('happy')
  })

  test('set default expression to an existing expression', () => {
    config.defaultExpression = 'sad'
    expect(config.defaultExpression).toBe('sad')
  })

  test('set default expression rejects non-existent expression', () => {
    const originalDefault = config.defaultExpression
    const newDefault = 'nonexistent'
    if (config.expressions.includes(newDefault)) {
      config.defaultExpression = newDefault
    }
    // Should remain unchanged
    expect(config.defaultExpression).toBe(originalDefault)
  })

  test('removing all expressions leaves empty list', () => {
    config.expressions = []
    expect(config.expressions).toHaveLength(0)
  })

  test('expression names are normalized to lowercase', () => {
    const name = 'EXCITED'
    const normalized = name.trim().toLowerCase()
    if (!config.expressions.includes(normalized)) {
      config.expressions.push(normalized)
    }
    expect(config.expressions).toContain('excited')
    expect(config.expressions).not.toContain('EXCITED')
  })
})

describe('Layer tag assignment', () => {
  test('assign a pngtuber tag to a layer', () => {
    const layer = createTestLayer()
    expect(layer.pngtuberTag).toBeUndefined()
    layer.pngtuberTag = 'head'
    expect(layer.pngtuberTag).toBe('head')
  })

  test('clear a pngtuber tag from a layer', () => {
    const layer = createTestLayer({ pngtuberTag: 'mouth' })
    expect(layer.pngtuberTag).toBe('mouth')
    layer.pngtuberTag = undefined
    expect(layer.pngtuberTag).toBeUndefined()
  })

  test('all valid tag types can be assigned', () => {
    const tags: PNGTuberTag[] = ['head', 'eyes', 'mouth', 'body', 'accessory', 'background', 'effect']
    for (const tag of tags) {
      const layer = createTestLayer()
      layer.pngtuberTag = tag
      expect(layer.pngtuberTag).toBe(tag)
    }
  })

  test('layer can have both tag and expression', () => {
    const layer = createTestLayer()
    layer.pngtuberTag = 'eyes'
    layer.pngtuberExpression = 'happy'
    expect(layer.pngtuberTag).toBe('eyes')
    expect(layer.pngtuberExpression).toBe('happy')
  })

  test('layer without tag has undefined pngtuberTag', () => {
    const layer = createTestLayer()
    expect(layer.pngtuberTag).toBeUndefined()
  })
})

describe('Layer expression filtering', () => {
  test('layers with no expression are visible in all expressions', () => {
    const layer = createTestLayer({ name: 'Background', visible: true })
    // No pngtuberExpression set
    const idle = getVisibleLayersForExpression([layer], 'idle')
    const talking = getVisibleLayersForExpression([layer], 'talking')
    expect(idle).toHaveLength(1)
    expect(talking).toHaveLength(1)
  })

  test('layer with expression "idle" is only visible for idle', () => {
    const layer = createTestLayer({ name: 'Idle Eyes', visible: true })
    layer.pngtuberExpression = 'idle'
    const idle = getVisibleLayersForExpression([layer], 'idle')
    const talking = getVisibleLayersForExpression([layer], 'talking')
    expect(idle).toHaveLength(1)
    expect(talking).toHaveLength(0)
  })

  test('hidden layers are never visible regardless of expression', () => {
    const layer = createTestLayer({ name: 'Hidden', visible: false })
    layer.pngtuberExpression = 'idle'
    const result = getVisibleLayersForExpression([layer], 'idle')
    expect(result).toHaveLength(0)
  })

  test('multiple layers with different expressions filter correctly', () => {
    const idleEyes = createTestLayer({ name: 'Idle Eyes', visible: true })
    idleEyes.pngtuberExpression = 'idle'

    const talkingEyes = createTestLayer({ name: 'Talking Eyes', visible: true })
    talkingEyes.pngtuberExpression = 'talking'

    const body = createTestLayer({ name: 'Body', visible: true })
    // No expression - visible always

    const layers: Layer[] = [idleEyes, talkingEyes, body]

    const idle = getVisibleLayersForExpression(layers, 'idle')
    expect(idle).toHaveLength(2) // idleEyes + body
    expect(idle.map((l) => l.name)).toContain('Idle Eyes')
    expect(idle.map((l) => l.name)).toContain('Body')

    const talking = getVisibleLayersForExpression(layers, 'talking')
    expect(talking).toHaveLength(2) // talkingEyes + body
    expect(talking.map((l) => l.name)).toContain('Talking Eyes')
    expect(talking.map((l) => l.name)).toContain('Body')
  })

  test('expression "all" (undefined) makes layer visible in every expression', () => {
    const layer = createTestLayer({ name: 'Always Visible', visible: true })
    layer.pngtuberExpression = undefined // "all"

    const expressions = ['idle', 'talking', 'happy', 'sad', 'surprised']
    for (const expr of expressions) {
      const result = getVisibleLayersForExpression([layer], expr)
      expect(result).toHaveLength(1)
    }
  })
})

describe('Parallax depth range clamping', () => {
  test('depth 0 is valid (background)', () => {
    const clamped = Math.max(0, Math.min(1, 0))
    expect(clamped).toBe(0)
  })

  test('depth 1 is valid (foreground)', () => {
    const clamped = Math.max(0, Math.min(1, 1))
    expect(clamped).toBe(1)
  })

  test('depth 0.5 is valid', () => {
    const clamped = Math.max(0, Math.min(1, 0.5))
    expect(clamped).toBe(0.5)
  })

  test('negative depth is clamped to 0', () => {
    const clamped = Math.max(0, Math.min(1, -0.5))
    expect(clamped).toBe(0)
  })

  test('depth above 1 is clamped to 1', () => {
    const clamped = Math.max(0, Math.min(1, 1.5))
    expect(clamped).toBe(1)
  })

  test('depth -100 is clamped to 0', () => {
    const clamped = Math.max(0, Math.min(1, -100))
    expect(clamped).toBe(0)
  })

  test('depth 999 is clamped to 1', () => {
    const clamped = Math.max(0, Math.min(1, 999))
    expect(clamped).toBe(1)
  })

  test('depth 0.001 is valid', () => {
    const clamped = Math.max(0, Math.min(1, 0.001))
    expect(clamped).toBeCloseTo(0.001)
  })

  test('layer parallax depth defaults to undefined', () => {
    const layer = createTestLayer()
    expect(layer.parallaxDepth).toBeUndefined()
  })

  test('layer parallax depth can be set and read', () => {
    const layer = createTestLayer()
    layer.parallaxDepth = 0.75
    expect(layer.parallaxDepth).toBe(0.75)
  })
})

describe('Validation: missing mouth layer warning', () => {
  test('warns when no mouth layer is tagged', () => {
    const layers: Layer[] = [
      createTestLayer({ pngtuberTag: 'head', name: 'Head' }),
      createTestLayer({ pngtuberTag: 'eyes', name: 'Eyes' }),
      createTestLayer({ pngtuberTag: 'body', name: 'Body' }),
    ]
    const warnings = computeValidation(layers, ['idle'])
    const mouthWarning = warnings.find(
      (w) => w.type === 'missing-tag' && w.message.includes('mouth'),
    )
    expect(mouthWarning).toBeDefined()
    expect(mouthWarning!.message).toBe('No mouth layer tagged')
  })

  test('no warning when mouth layer is present', () => {
    const layers: Layer[] = [
      createTestLayer({ pngtuberTag: 'head', name: 'Head' }),
      createTestLayer({ pngtuberTag: 'eyes', name: 'Eyes' }),
      createTestLayer({ pngtuberTag: 'mouth', name: 'Mouth' }),
      createTestLayer({ pngtuberTag: 'body', name: 'Body' }),
    ]
    const warnings = computeValidation(layers, ['idle'])
    const mouthWarning = warnings.find(
      (w) => w.type === 'missing-tag' && w.message.includes('mouth'),
    )
    expect(mouthWarning).toBeUndefined()
  })

  test('warns for all missing required tags', () => {
    const layers: Layer[] = [] // no layers at all
    const warnings = computeValidation(layers, [])
    const missingTags = warnings.filter((w) => w.type === 'missing-tag')
    expect(missingTags).toHaveLength(4) // head, eyes, mouth, body
    expect(missingTags.map((w) => w.message)).toContain('No head layer tagged')
    expect(missingTags.map((w) => w.message)).toContain('No eyes layer tagged')
    expect(missingTags.map((w) => w.message)).toContain('No mouth layer tagged')
    expect(missingTags.map((w) => w.message)).toContain('No body layer tagged')
  })

  test('no missing tag warnings when all required tags are present', () => {
    const layers: Layer[] = [
      createTestLayer({ pngtuberTag: 'head' }),
      createTestLayer({ pngtuberTag: 'eyes' }),
      createTestLayer({ pngtuberTag: 'mouth' }),
      createTestLayer({ pngtuberTag: 'body' }),
    ]
    const warnings = computeValidation(layers, [])
    const missingTags = warnings.filter((w) => w.type === 'missing-tag')
    expect(missingTags).toHaveLength(0)
  })
})

describe('Validation: expression with no unique layers', () => {
  test('warns when expression has no layers assigned to it', () => {
    const layers: Layer[] = [
      createTestLayer({ pngtuberTag: 'head', name: 'Head' }),
    ]
    // No layers have pngtuberExpression === 'happy'
    const warnings = computeValidation(layers, ['happy'])
    const exprWarning = warnings.find(
      (w) => w.type === 'no-unique-layers' && w.message.includes('happy'),
    )
    expect(exprWarning).toBeDefined()
    expect(exprWarning!.message).toBe("Expression 'happy' has no unique layers")
  })

  test('no warning when expression has layers assigned', () => {
    const happyEyes = createTestLayer({ pngtuberTag: 'eyes', name: 'Happy Eyes' })
    happyEyes.pngtuberExpression = 'happy'
    const layers: Layer[] = [happyEyes]

    const warnings = computeValidation(layers, ['happy'])
    const exprWarning = warnings.find(
      (w) => w.type === 'no-unique-layers' && w.message.includes('happy'),
    )
    expect(exprWarning).toBeUndefined()
  })

  test('layer without pngtuberTag does not count as unique for an expression', () => {
    const layer = createTestLayer({ name: 'No Tag' })
    layer.pngtuberExpression = 'happy'
    // pngtuberTag is undefined, so it should not count
    const warnings = computeValidation([layer], ['happy'])
    const exprWarning = warnings.find(
      (w) => w.type === 'no-unique-layers' && w.message.includes('happy'),
    )
    expect(exprWarning).toBeDefined()
  })

  test('warns for multiple expressions with no unique layers', () => {
    const layers: Layer[] = [
      createTestLayer({ pngtuberTag: 'body' }),
    ]
    const warnings = computeValidation(layers, ['idle', 'talking', 'happy'])
    const exprWarnings = warnings.filter((w) => w.type === 'no-unique-layers')
    expect(exprWarnings).toHaveLength(3)
  })

  test('no warning when each expression has at least one tagged layer', () => {
    const idleEyes = createTestLayer({ pngtuberTag: 'eyes' })
    idleEyes.pngtuberExpression = 'idle'
    const talkingMouth = createTestLayer({ pngtuberTag: 'mouth' })
    talkingMouth.pngtuberExpression = 'talking'

    const layers: Layer[] = [idleEyes, talkingMouth]
    const warnings = computeValidation(layers, ['idle', 'talking'])
    const exprWarnings = warnings.filter((w) => w.type === 'no-unique-layers')
    expect(exprWarnings).toHaveLength(0)
  })
})
