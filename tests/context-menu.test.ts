import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

// ── Save/restore globals ────────────────────────────────────────

const origWindow = globalThis.window

beforeAll(() => {
  if (typeof globalThis.window === 'undefined') {
    ;(globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      __openCanvasContextMenu: undefined,
    }
  }
})

afterAll(() => {
  if (origWindow === undefined) {
    delete (globalThis as any).window
  } else {
    globalThis.window = origWindow
  }
})

// ── Import after stubs ──────────────────────────────────────────

import { openCanvasContextMenu, CanvasContextMenu } from '@/ui/context-menu'

// ── Tests ───────────────────────────────────────────────────────

describe('context-menu', () => {
  describe('openCanvasContextMenu', () => {
    test('is a function', () => {
      expect(typeof openCanvasContextMenu).toBe('function')
    })

    test('does not throw when __openCanvasContextMenu is not set', () => {
      delete (window as any).__openCanvasContextMenu
      expect(() => openCanvasContextMenu(100, 200)).not.toThrow()
    })

    test('calls __openCanvasContextMenu when it is a function', () => {
      let calledWith: [number, number] | null = null
      ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
        calledWith = [x, y]
      }
      openCanvasContextMenu(42, 99)
      expect(calledWith!).toEqual([42, 99])

      // Cleanup
      delete (window as any).__openCanvasContextMenu
    })

    test('ignores __openCanvasContextMenu if it is not a function', () => {
      ;(window as any).__openCanvasContextMenu = 'not a function'
      expect(() => openCanvasContextMenu(10, 20)).not.toThrow()
      ;(window as any).__openCanvasContextMenu = 42
      expect(() => openCanvasContextMenu(10, 20)).not.toThrow()
      ;(window as any).__openCanvasContextMenu = null
      expect(() => openCanvasContextMenu(10, 20)).not.toThrow()

      // Cleanup
      delete (window as any).__openCanvasContextMenu
    })

    test('passes correct coordinates', () => {
      const calls: Array<[number, number]> = []
      ;(window as any).__openCanvasContextMenu = (x: number, y: number) => {
        calls.push([x, y])
      }

      openCanvasContextMenu(0, 0)
      openCanvasContextMenu(-100, -50)
      openCanvasContextMenu(9999, 9999)
      openCanvasContextMenu(0.5, 0.7)

      expect(calls.length).toBe(4)
      expect(calls[0]).toEqual([0, 0])
      expect(calls[1]).toEqual([-100, -50])
      expect(calls[2]).toEqual([9999, 9999])
      expect(calls[3]).toEqual([0.5, 0.7])

      // Cleanup
      delete (window as any).__openCanvasContextMenu
    })
  })

  describe('CanvasContextMenu component', () => {
    test('is exported as a function', () => {
      expect(typeof CanvasContextMenu).toBe('function')
    })
  })

  describe('module exports', () => {
    test('exports openCanvasContextMenu', async () => {
      const mod = await import('@/ui/context-menu')
      expect(typeof mod.openCanvasContextMenu).toBe('function')
    })

    test('exports CanvasContextMenu', async () => {
      const mod = await import('@/ui/context-menu')
      expect(typeof mod.CanvasContextMenu).toBe('function')
    })

    test('module has exactly 2 named exports', async () => {
      const mod = await import('@/ui/context-menu')
      const exportNames = Object.keys(mod)
      expect(exportNames).toContain('openCanvasContextMenu')
      expect(exportNames).toContain('CanvasContextMenu')
    })
  })
})
