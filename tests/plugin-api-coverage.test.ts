import { describe, test, expect } from 'bun:test'
import { createScopedAPI, type PluginAPI } from '@/plugins/api'
import type { PluginPermission } from '@/plugins/manifest'

// ── Mock Full API ──

function createMockFullAPI(): PluginAPI {
  return {
    document: {
      getDocument: () => ({}) as any,
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
      getViewport: () => ({
        zoom: 1,
        panX: 0,
        panY: 0,
        artboardId: null,
        view3d: { enabled: false, rotX: -25, rotY: 35, spacing: 40 },
      }),
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

describe('createScopedAPI', () => {
  test('no permissions returns empty API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, [])
    expect(scoped.document).toBeUndefined()
    expect(scoped.selection).toBeUndefined()
    expect(scoped.viewport).toBeUndefined()
    expect(scoped.ui).toBeUndefined()
    expect(scoped.events).toBeUndefined()
    expect(scoped.canvas).toBeUndefined()
  })

  test('document:read gives read-only document API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['document:read'])
    expect(scoped.document).toBeDefined()
    // Read methods work
    expect(scoped.document!.getDocument).toBeDefined()
    expect(scoped.document!.getArtboard).toBeDefined()
    expect(scoped.document!.getArtboards).toBeDefined()
    expect(scoped.document!.getLayer).toBeDefined()
    // Write methods throw
    expect(() => scoped.document!.addLayer('ab', {} as any)).toThrow('Permission denied')
    expect(() => scoped.document!.updateLayer('ab', 'l', {})).toThrow('Permission denied')
    expect(() => scoped.document!.deleteLayer('ab', 'l')).toThrow('Permission denied')
    expect(() => scoped.document!.setFill('ab', 'l', null)).toThrow('Permission denied')
    expect(() => scoped.document!.setStroke('ab', 'l', null)).toThrow('Permission denied')
  })

  test('document:write gives full document API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['document:write'])
    expect(scoped.document).toBeDefined()
    // Write methods should not throw
    expect(() => scoped.document!.addLayer('ab', {} as any)).not.toThrow()
    expect(() => scoped.document!.updateLayer('ab', 'l', {})).not.toThrow()
    expect(() => scoped.document!.deleteLayer('ab', 'l')).not.toThrow()
    expect(() => scoped.document!.setFill('ab', 'l', null)).not.toThrow()
    expect(() => scoped.document!.setStroke('ab', 'l', null)).not.toThrow()
  })

  test('document:read + document:write gives full document API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['document:read', 'document:write'])
    expect(scoped.document).toBeDefined()
    expect(() => scoped.document!.addLayer('ab', {} as any)).not.toThrow()
  })

  test('selection:read gives read-only selection API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['selection:read'])
    expect(scoped.selection).toBeDefined()
    expect(scoped.selection!.getSelection).toBeDefined()
    expect(() => scoped.selection!.selectLayer('l')).toThrow('Permission denied')
    expect(() => scoped.selection!.deselectAll()).toThrow('Permission denied')
  })

  test('selection:write gives full selection API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['selection:write'])
    expect(scoped.selection).toBeDefined()
    expect(() => scoped.selection!.selectLayer('l')).not.toThrow()
    expect(() => scoped.selection!.deselectAll()).not.toThrow()
  })

  test('viewport:read gives read-only viewport API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['viewport:read'])
    expect(scoped.viewport).toBeDefined()
    expect(scoped.viewport!.getViewport).toBeDefined()
    expect(() => scoped.viewport!.setZoom(2)).toThrow('Permission denied')
    expect(() => scoped.viewport!.setPan(0, 0)).toThrow('Permission denied')
    expect(() => scoped.viewport!.zoomToFit()).toThrow('Permission denied')
    expect(() => scoped.viewport!.scrollToLayer('l')).toThrow('Permission denied')
  })

  test('viewport:write gives full viewport API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['viewport:write'])
    expect(scoped.viewport).toBeDefined()
    expect(() => scoped.viewport!.setZoom(2)).not.toThrow()
    expect(() => scoped.viewport!.setPan(0, 0)).not.toThrow()
    expect(() => scoped.viewport!.zoomToFit()).not.toThrow()
    expect(() => scoped.viewport!.scrollToLayer('l')).not.toThrow()
  })

  test('viewport:read + viewport:write gives full viewport API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['viewport:read', 'viewport:write'])
    expect(scoped.viewport).toBeDefined()
    expect(() => scoped.viewport!.setZoom(3)).not.toThrow()
  })

  test('ui:dialogs gives UI API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['ui:dialogs'])
    expect(scoped.ui).toBeDefined()
    expect(scoped.ui!.showDialog).toBeDefined()
    expect(scoped.ui!.showToast).toBeDefined()
    expect(scoped.ui!.registerPanel).toBeDefined()
  })

  test('ui:panels gives UI API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['ui:panels'])
    expect(scoped.ui).toBeDefined()
  })

  test('events:subscribe gives Events API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['events:subscribe'])
    expect(scoped.events).toBeDefined()
    expect(scoped.events!.on).toBeDefined()
    expect(scoped.events!.once).toBeDefined()
  })

  test('canvas:overlay gives Canvas API', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['canvas:overlay'])
    expect(scoped.canvas).toBeDefined()
    expect(scoped.canvas!.registerOverlay).toBeDefined()
    expect(scoped.canvas!.removeOverlay).toBeDefined()
  })

  test('all permissions gives everything', () => {
    const full = createMockFullAPI()
    const allPerms: PluginPermission[] = [
      'document:read',
      'document:write',
      'selection:read',
      'selection:write',
      'viewport:read',
      'viewport:write',
      'ui:dialogs',
      'ui:panels',
      'events:subscribe',
      'canvas:overlay',
    ]
    const scoped = createScopedAPI(full, allPerms)
    expect(scoped.document).toBeDefined()
    expect(scoped.selection).toBeDefined()
    expect(scoped.viewport).toBeDefined()
    expect(scoped.ui).toBeDefined()
    expect(scoped.events).toBeDefined()
    expect(scoped.canvas).toBeDefined()
  })

  test('mixed permissions only expose granted APIs', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['document:read', 'events:subscribe'])
    expect(scoped.document).toBeDefined()
    expect(scoped.events).toBeDefined()
    expect(scoped.selection).toBeUndefined()
    expect(scoped.viewport).toBeUndefined()
    expect(scoped.ui).toBeUndefined()
    expect(scoped.canvas).toBeUndefined()
  })

  test('read-only document:read error messages are specific', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['document:read'])
    try {
      scoped.document!.addLayer('ab', {} as any)
    } catch (e: any) {
      expect(e.message).toBe('Permission denied: document:write')
    }
  })

  test('read-only selection:read error messages are specific', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['selection:read'])
    try {
      scoped.selection!.selectLayer('l')
    } catch (e: any) {
      expect(e.message).toBe('Permission denied: selection:write')
    }
  })

  test('read-only viewport:read error messages are specific', () => {
    const full = createMockFullAPI()
    const scoped = createScopedAPI(full, ['viewport:read'])
    try {
      scoped.viewport!.setZoom(2)
    } catch (e: any) {
      expect(e.message).toBe('Permission denied: viewport:write')
    }
  })
})
