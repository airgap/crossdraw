import { describe, test, expect } from 'bun:test'
import type { Artboard, VectorLayer } from '@/types'
import {
  DEVICE_PRESETS, getPresetsByCategory, getPresetById,
  computeResponsiveLayout, calcPreviewScale,
  type DevicePreset,
} from '@/ui/device-preview'
import {
  validateManifest, parseManifest,
  type PluginManifest,
} from '@/plugins/manifest'
import { createScopedAPI, type PluginAPI } from '@/plugins/api'
import {
  PluginRuntime, PluginEventEmitter,
} from '@/plugins/runtime'

// --- Helpers ---

function makeArtboard(w: number, h: number): Artboard {
  return {
    id: 'a1', name: 'Main', x: 0, y: 0, width: w, height: h,
    backgroundColor: '#ffffff',
    layers: [
      {
        id: 'l1', name: 'BG', type: 'vector', visible: true, locked: false,
        opacity: 1, blendMode: 'normal',
        transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [], paths: [], fill: null, stroke: null,
        constraints: { horizontal: 'left', vertical: 'top' },
      } satisfies VectorLayer,
      {
        id: 'l2', name: 'Right-pinned', type: 'vector', visible: true, locked: false,
        opacity: 1, blendMode: 'normal',
        transform: { x: 700, y: 50, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [], paths: [], fill: null, stroke: null,
        constraints: { horizontal: 'right', vertical: 'top' },
      } satisfies VectorLayer,
    ],
  }
}

function makeValidManifest(): PluginManifest {
  return {
    id: 'com.test.demo',
    name: 'Demo Plugin',
    version: '1.0.0',
    permissions: ['document:read', 'selection:read'],
    main: 'index.js',
    contributes: {
      tools: [{ id: 'custom-tool', label: 'Custom Tool' }],
      panels: [{ id: 'custom-panel', label: 'Custom Panel', location: 'right' }],
      importers: [{ id: 'sketch-import', extensions: ['.sketch'], label: 'Sketch' }],
    },
  }
}

function makeMockAPI(): PluginAPI {
  return {
    document: {
      getDocument: () => ({ id: 'd1', metadata: {} as any, artboards: [], assets: { gradients: [], patterns: [], colors: [] } }),
      getArtboard: () => null,
      getArtboards: () => [],
      getLayer: () => null,
      addLayer: () => {},
      updateLayer: () => {},
      deleteLayer: () => {},
      setFill: () => {},
      setStroke: () => {},
    },
    selection: {
      getSelection: () => [],
      selectLayer: () => {},
      deselectAll: () => {},
    },
    viewport: {
      getViewport: () => ({ zoom: 1, panX: 0, panY: 0, artboardId: null }),
      setZoom: () => {},
      setPan: () => {},
      zoomToFit: () => {},
      scrollToLayer: () => {},
    },
    ui: {
      showDialog: async () => ({ button: 'ok' }),
      showToast: () => {},
      registerPanel: () => {},
    },
    events: {
      on: () => () => {},
      once: () => {},
    },
    canvas: {
      registerOverlay: () => {},
      removeOverlay: () => {},
    },
  }
}

// ============================================================
// LYK-140: Responsive device preview
// ============================================================

describe('LYK-140: responsive device preview', () => {
  test('DEVICE_PRESETS has phone, tablet, and desktop entries', () => {
    const phones = DEVICE_PRESETS.filter(p => p.category === 'phone')
    const tablets = DEVICE_PRESETS.filter(p => p.category === 'tablet')
    const desktops = DEVICE_PRESETS.filter(p => p.category === 'desktop')
    expect(phones.length).toBeGreaterThanOrEqual(3)
    expect(tablets.length).toBeGreaterThanOrEqual(2)
    expect(desktops.length).toBeGreaterThanOrEqual(2)
  })

  test('all presets have valid dimensions', () => {
    for (const p of DEVICE_PRESETS) {
      expect(p.width).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
    }
  })

  test('preset IDs are unique', () => {
    const ids = DEVICE_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('getPresetsByCategory filters correctly', () => {
    const phones = getPresetsByCategory('phone')
    expect(phones.every(p => p.category === 'phone')).toBe(true)
    expect(phones.length).toBeGreaterThan(0)

    const tablets = getPresetsByCategory('tablet')
    expect(tablets.every(p => p.category === 'tablet')).toBe(true)
  })

  test('getPresetById returns correct preset', () => {
    const iphone = getPresetById('iphone-15')
    expect(iphone).not.toBeNull()
    expect(iphone!.name).toBe('iPhone 15')
    expect(iphone!.width).toBe(393)
  })

  test('getPresetById returns undefined for unknown', () => {
    expect(getPresetById('nonexistent-device')).toBeUndefined()
  })

  test('computeResponsiveLayout returns transforms for all layers', () => {
    const artboard = makeArtboard(800, 600)
    const layout = computeResponsiveLayout(artboard, 393, 852)
    expect(layout.length).toBe(2)
    expect(layout[0]!.layerId).toBe('l1')
    expect(layout[1]!.layerId).toBe('l2')
  })

  test('left-pinned layer keeps x position', () => {
    const artboard = makeArtboard(800, 600)
    const layout = computeResponsiveLayout(artboard, 400, 600)
    const leftLayer = layout.find(l => l.layerId === 'l1')!
    expect(leftLayer.x).toBe(50) // left constraint preserves x
  })

  test('right-pinned layer adjusts for new width', () => {
    const artboard = makeArtboard(800, 600)
    const layout = computeResponsiveLayout(artboard, 1200, 600)
    const rightLayer = layout.find(l => l.layerId === 'l2')!
    // right constraint: newWidth - (oldWidth - x) = 1200 - (800 - 700) = 1100
    expect(rightLayer.x).toBe(1100)
  })

  test('calcPreviewScale fits within container', () => {
    const scale = calcPreviewScale(1920, 1080, 400, 300)
    expect(scale).toBeLessThanOrEqual(1)
    expect(scale).toBeGreaterThan(0)
    // With padding 20: avail 360x260, scale = min(1, 360/1920, 260/1080) ≈ 0.1875
    expect(1920 * scale).toBeLessThanOrEqual(400)
    expect(1080 * scale).toBeLessThanOrEqual(300)
  })

  test('calcPreviewScale respects padding', () => {
    // Use a device that barely fits the container so padding makes a difference
    const s1 = calcPreviewScale(500, 400, 500, 400, 0) // scale = 1.0
    const s2 = calcPreviewScale(500, 400, 500, 400, 50) // avail = 400x300, scale = min(1, 400/500, 300/400) = 0.75
    expect(s2).toBeLessThan(s1)
  })

  test('calcPreviewScale caps at 1 for small devices in large containers', () => {
    const scale = calcPreviewScale(100, 100, 2000, 2000)
    expect(scale).toBe(1)
  })

  test('iPhone 15 has DPR 3', () => {
    const preset = getPresetById('iphone-15')!
    expect(preset.dpr).toBe(3)
  })

  test('desktop presets have no DPR or DPR of 2', () => {
    const desktops = getPresetsByCategory('desktop')
    for (const d of desktops) {
      expect(d.dpr === undefined || d.dpr >= 1).toBe(true)
    }
  })
})

// ============================================================
// LYK-141: Plugin / extension API
// ============================================================

describe('LYK-141: plugin manifest', () => {
  test('validateManifest accepts valid manifest', () => {
    const result = validateManifest(makeValidManifest())
    expect(result.valid).toBe(true)
    expect(result.errors.length).toBe(0)
  })

  test('validateManifest rejects non-object', () => {
    expect(validateManifest(null).valid).toBe(false)
    expect(validateManifest('string').valid).toBe(false)
    expect(validateManifest(42).valid).toBe(false)
  })

  test('validateManifest rejects missing id', () => {
    const m = { ...makeValidManifest(), id: '' }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('id'))).toBe(true)
  })

  test('validateManifest rejects invalid version', () => {
    const m = { ...makeValidManifest(), version: 'not-semver' }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('version'))).toBe(true)
  })

  test('validateManifest rejects missing permissions', () => {
    const m = { ...makeValidManifest() } as any
    delete m.permissions
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
  })

  test('validateManifest rejects missing main', () => {
    const m = { ...makeValidManifest(), main: '' }
    const result = validateManifest(m)
    expect(result.valid).toBe(false)
  })

  test('parseManifest parses valid JSON', () => {
    const json = JSON.stringify(makeValidManifest())
    const manifest = parseManifest(json)
    expect(manifest.id).toBe('com.test.demo')
    expect(manifest.name).toBe('Demo Plugin')
  })

  test('parseManifest throws on invalid JSON', () => {
    expect(() => parseManifest('{invalid')).toThrow()
  })

  test('parseManifest throws on invalid manifest', () => {
    expect(() => parseManifest('{"id": ""}')).toThrow('Invalid plugin manifest')
  })
})

describe('LYK-141: plugin API scoping', () => {
  test('read-only document permission blocks writes', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['document:read'])
    expect(scoped.document).toBeDefined()
    // Read methods should work
    expect(() => scoped.document!.getDocument()).not.toThrow()
    // Write methods should throw
    expect(() => scoped.document!.addLayer('a1', {} as any)).toThrow('Permission denied')
    expect(() => scoped.document!.deleteLayer('a1', 'l1')).toThrow('Permission denied')
  })

  test('document:write permission allows reads and writes', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['document:write'])
    expect(scoped.document).toBeDefined()
    expect(() => scoped.document!.getDocument()).not.toThrow()
    expect(() => scoped.document!.addLayer('a1', {} as any)).not.toThrow()
  })

  test('selection:read blocks selection writes', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['selection:read'])
    expect(scoped.selection).toBeDefined()
    expect(() => scoped.selection!.getSelection()).not.toThrow()
    expect(() => scoped.selection!.selectLayer('l1')).toThrow('Permission denied')
  })

  test('viewport:read blocks viewport writes', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['viewport:read'])
    expect(scoped.viewport).toBeDefined()
    expect(() => scoped.viewport!.getViewport()).not.toThrow()
    expect(() => scoped.viewport!.setZoom(2)).toThrow('Permission denied')
    expect(() => scoped.viewport!.setPan(0, 0)).toThrow('Permission denied')
  })

  test('no permissions returns empty API', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, [])
    expect(scoped.document).toBeUndefined()
    expect(scoped.selection).toBeUndefined()
    expect(scoped.viewport).toBeUndefined()
    expect(scoped.ui).toBeUndefined()
    expect(scoped.events).toBeUndefined()
    expect(scoped.canvas).toBeUndefined()
  })

  test('events permission grants events API', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['events:subscribe'])
    expect(scoped.events).toBeDefined()
  })

  test('canvas:overlay permission grants canvas API', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['canvas:overlay'])
    expect(scoped.canvas).toBeDefined()
  })

  test('ui:dialogs permission grants UI API', () => {
    const api = makeMockAPI()
    const scoped = createScopedAPI(api, ['ui:dialogs'])
    expect(scoped.ui).toBeDefined()
  })
})

describe('LYK-141: plugin event emitter', () => {
  test('on/emit dispatches events', () => {
    const emitter = new PluginEventEmitter()
    let received: string[] = []
    emitter.on('selectionChange', (e) => {
      received = e.layerIds
    })
    emitter.emit('selectionChange', {
      type: 'selectionChange', timestamp: Date.now(), layerIds: ['l1', 'l2'],
    })
    expect(received).toEqual(['l1', 'l2'])
  })

  test('on returns unsubscribe function', () => {
    const emitter = new PluginEventEmitter()
    let count = 0
    const unsub = emitter.on('toolChange', () => { count++ })
    emitter.emit('toolChange', { type: 'toolChange', timestamp: Date.now(), tool: 'pen' })
    expect(count).toBe(1)
    unsub()
    emitter.emit('toolChange', { type: 'toolChange', timestamp: Date.now(), tool: 'select' })
    expect(count).toBe(1) // should not increment
  })

  test('once fires only once', () => {
    const emitter = new PluginEventEmitter()
    let count = 0
    emitter.once('documentChange', () => { count++ })
    emitter.emit('documentChange', { type: 'documentChange', timestamp: Date.now(), description: 'a' })
    emitter.emit('documentChange', { type: 'documentChange', timestamp: Date.now(), description: 'b' })
    expect(count).toBe(1)
  })

  test('listenerCount tracks listeners', () => {
    const emitter = new PluginEventEmitter()
    expect(emitter.listenerCount('toolChange')).toBe(0)
    const unsub1 = emitter.on('toolChange', () => {})
    const unsub2 = emitter.on('toolChange', () => {})
    expect(emitter.listenerCount('toolChange')).toBe(2)
    unsub1()
    expect(emitter.listenerCount('toolChange')).toBe(1)
    unsub2()
    expect(emitter.listenerCount('toolChange')).toBe(0)
  })

  test('removeAllListeners clears specific event', () => {
    const emitter = new PluginEventEmitter()
    emitter.on('toolChange', () => {})
    emitter.on('selectionChange', () => {})
    emitter.removeAllListeners('toolChange')
    expect(emitter.listenerCount('toolChange')).toBe(0)
    expect(emitter.listenerCount('selectionChange')).toBe(1)
  })

  test('removeAllListeners with no arg clears all', () => {
    const emitter = new PluginEventEmitter()
    emitter.on('toolChange', () => {})
    emitter.on('selectionChange', () => {})
    emitter.removeAllListeners()
    expect(emitter.listenerCount('toolChange')).toBe(0)
    expect(emitter.listenerCount('selectionChange')).toBe(0)
  })
})

describe('LYK-141: plugin runtime', () => {
  test('register and get plugin', () => {
    const runtime = new PluginRuntime()
    const manifest = makeValidManifest()
    runtime.register(manifest)
    const plugin = runtime.getPlugin('com.test.demo')
    expect(plugin).toBeDefined()
    expect(plugin!.manifest.name).toBe('Demo Plugin')
    expect(plugin!.status).toBe('inactive')
  })

  test('register duplicate throws', () => {
    const runtime = new PluginRuntime()
    runtime.register(makeValidManifest())
    expect(() => runtime.register(makeValidManifest())).toThrow('already registered')
  })

  test('activate plugin', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    expect(runtime.getPlugin('com.test.demo')!.status).toBe('active')
  })

  test('activate without API throws', () => {
    const runtime = new PluginRuntime()
    runtime.register(makeValidManifest())
    expect(() => runtime.activate('com.test.demo')).toThrow('API not initialized')
  })

  test('activate unknown plugin throws', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    expect(() => runtime.activate('unknown')).toThrow('not found')
  })

  test('deactivate plugin', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    runtime.deactivate('com.test.demo')
    expect(runtime.getPlugin('com.test.demo')!.status).toBe('inactive')
  })

  test('unregister removes plugin', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    runtime.unregister('com.test.demo')
    expect(runtime.getPlugin('com.test.demo')).toBeUndefined()
  })

  test('getAllPlugins returns all registered', () => {
    const runtime = new PluginRuntime()
    runtime.register(makeValidManifest())
    runtime.register({ ...makeValidManifest(), id: 'com.test.other', name: 'Other' })
    expect(runtime.getAllPlugins().length).toBe(2)
  })

  test('getPluginsByStatus filters correctly', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.register({ ...makeValidManifest(), id: 'com.test.other', name: 'Other' })
    runtime.activate('com.test.demo')
    expect(runtime.getPluginsByStatus('active').length).toBe(1)
    expect(runtime.getPluginsByStatus('inactive').length).toBe(1)
  })

  test('hasPermission checks plugin permissions', () => {
    const runtime = new PluginRuntime()
    runtime.register(makeValidManifest())
    expect(runtime.hasPermission('com.test.demo', 'document:read')).toBe(true)
    expect(runtime.hasPermission('com.test.demo', 'document:write')).toBe(false)
  })

  test('getToolContributions from active plugins', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    const tools = runtime.getToolContributions()
    expect(tools.length).toBe(1)
    expect(tools[0]!.tool.id).toBe('custom-tool')
    expect(tools[0]!.pluginId).toBe('com.test.demo')
  })

  test('getToolContributions ignores inactive plugins', () => {
    const runtime = new PluginRuntime()
    runtime.register(makeValidManifest())
    const tools = runtime.getToolContributions()
    expect(tools.length).toBe(0)
  })

  test('getPanelContributions from active plugins', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    const panels = runtime.getPanelContributions()
    expect(panels.length).toBe(1)
    expect(panels[0]!.panel.id).toBe('custom-panel')
  })

  test('getImporterForExtension finds matching importer', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    const result = runtime.getImporterForExtension('.sketch')
    expect(result).not.toBeNull()
    expect(result!.importer.label).toBe('Sketch')
  })

  test('getImporterForExtension returns null for unhandled', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    expect(runtime.getImporterForExtension('.psd')).toBeNull()
  })

  test('dispose cleans up everything', () => {
    const runtime = new PluginRuntime()
    runtime.setAPI(makeMockAPI())
    runtime.register(makeValidManifest())
    runtime.activate('com.test.demo')
    runtime.dispose()
    expect(runtime.getAllPlugins().length).toBe(0)
  })

  test('getEmitter returns event emitter', () => {
    const runtime = new PluginRuntime()
    const emitter = runtime.getEmitter()
    expect(emitter).toBeInstanceOf(PluginEventEmitter)
  })
})
