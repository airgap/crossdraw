import { describe, test, expect, beforeEach, afterEach, afterAll } from 'bun:test'

// Save originals
const origImageData = globalThis.ImageData
const origLocalStorage = globalThis.localStorage

afterAll(() => {
  if (origImageData !== undefined) {
    globalThis.ImageData = origImageData
  } else {
    delete (globalThis as any).ImageData
  }
  if (origLocalStorage !== undefined) {
    globalThis.localStorage = origLocalStorage
  } else {
    delete (globalThis as any).localStorage
  }
})

// Polyfill ImageData for bun:test
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    data: Uint8ClampedArray
    width: number
    height: number
    constructor(arg1: number | Uint8ClampedArray, w?: number, h?: number) {
      if (typeof arg1 === 'number') {
        this.width = arg1
        this.height = w!
        this.data = new Uint8ClampedArray(this.width * this.height * 4)
      } else {
        this.data = arg1
        this.width = w!
        this.height = h ?? arg1.length / 4 / w!
      }
    }
  }
}

// Polyfill localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  }
}

import {
  attachTouchHandler,
  detachTouchHandler,
  currentPressure,
  type TouchHandlerCallbacks,
} from '@/tools/touch-handler'

// Create a mock canvas element
function createMockCanvas() {
  const listeners = new Map<string, Function[]>()

  const canvas = {
    style: { touchAction: '' },
    addEventListener: (type: string, handler: Function, _options?: any) => {
      if (!listeners.has(type)) listeners.set(type, [])
      listeners.get(type)!.push(handler)
    },
    removeEventListener: (type: string, handler: Function) => {
      const list = listeners.get(type)
      if (list) {
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    setPointerCapture: (_id: number) => {},
    releasePointerCapture: (_id: number) => {},
    // Helper to fire events
    _listeners: listeners,
    _fire(type: string, event: any) {
      const list = listeners.get(type)
      if (list) {
        for (const handler of list) {
          handler(event)
        }
      }
    },
  } as unknown as HTMLCanvasElement & { _listeners: Map<string, Function[]>; _fire: Function }

  return canvas
}

function createMockCallbacks(): TouchHandlerCallbacks & {
  downCalls: any[]
  moveCalls: any[]
  upCalls: any[]
  contextMenuCalls: any[]
} {
  const downCalls: any[] = []
  const moveCalls: any[] = []
  const upCalls: any[] = []
  const contextMenuCalls: any[] = []

  return {
    downCalls,
    moveCalls,
    upCalls,
    contextMenuCalls,
    onPointerDown: (x, y, button, shiftKey, pressure, pointerType) => {
      downCalls.push({ x, y, button, shiftKey, pressure, pointerType })
    },
    onPointerMove: (x, y, shiftKey, pressure, pointerType) => {
      moveCalls.push({ x, y, shiftKey, pressure, pointerType })
    },
    onPointerUp: (pressure, pointerType) => {
      upCalls.push({ pressure, pointerType })
    },
    onContextMenu: (x, y) => {
      contextMenuCalls.push({ x, y })
    },
    onDoubleTap: (_x, _y) => {},
    getCanvasRect: () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => {},
      }) as DOMRect,
  }
}

function makePointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 1,
    clientX: 100,
    clientY: 200,
    pressure: 0.5,
    pointerType: 'touch',
    width: 10,
    height: 10,
    preventDefault: () => {},
    ...overrides,
  } as unknown as PointerEvent
}

describe('touch-handler - attach/detach', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('attachTouchHandler sets touch-action to none', () => {
    attachTouchHandler(canvas, callbacks)
    expect(canvas.style.touchAction).toBe('none')
  })

  test('attachTouchHandler registers pointer event listeners', () => {
    attachTouchHandler(canvas, callbacks)
    expect(canvas._listeners.has('pointerdown')).toBe(true)
    expect(canvas._listeners.has('pointermove')).toBe(true)
    expect(canvas._listeners.has('pointerup')).toBe(true)
    expect(canvas._listeners.has('pointercancel')).toBe(true)
  })

  test('attachTouchHandler registers touch event listeners', () => {
    attachTouchHandler(canvas, callbacks)
    expect(canvas._listeners.has('touchstart')).toBe(true)
    expect(canvas._listeners.has('touchmove')).toBe(true)
    expect(canvas._listeners.has('touchend')).toBe(true)
  })

  test('detachTouchHandler removes listeners', () => {
    attachTouchHandler(canvas, callbacks)
    detachTouchHandler()
    // After detach, touchAction should be reset
    expect(canvas.style.touchAction).toBe('')
  })

  test('detachTouchHandler is safe to call without attach', () => {
    // Should not throw
    detachTouchHandler()
  })

  test('re-attach detaches first', () => {
    attachTouchHandler(canvas, callbacks)
    const canvas2 = createMockCanvas()
    attachTouchHandler(canvas2, callbacks)
    // First canvas should be detached
    expect(canvas.style.touchAction).toBe('')
    expect(canvas2.style.touchAction).toBe('none')
  })
})

describe('touch-handler - single finger', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('single pointer down fires onPointerDown callback', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1, clientX: 50, clientY: 60 }))
    expect(callbacks.downCalls.length).toBe(1)
    expect(callbacks.downCalls[0].x).toBe(50)
    expect(callbacks.downCalls[0].y).toBe(60)
  })

  test('single pointer move fires onPointerMove callback', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1 }))
    canvas._fire('pointermove', makePointerEvent({ pointerId: 1, clientX: 150, clientY: 250 }))
    expect(callbacks.moveCalls.length).toBe(1)
    expect(callbacks.moveCalls[0].x).toBe(150)
    expect(callbacks.moveCalls[0].y).toBe(250)
  })

  test('pointer up fires onPointerUp callback', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1 }))
    canvas._fire('pointerup', makePointerEvent({ pointerId: 1 }))
    expect(callbacks.upCalls.length).toBe(1)
  })

  test('pointer move without prior down is ignored', () => {
    canvas._fire('pointermove', makePointerEvent({ pointerId: 1 }))
    expect(callbacks.moveCalls.length).toBe(0)
  })

  test('pointer up without prior down is ignored', () => {
    canvas._fire('pointerup', makePointerEvent({ pointerId: 1 }))
    expect(callbacks.upCalls.length).toBe(0)
  })
})

describe('touch-handler - stylus/pen', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('pen pointer down uses actual pressure', () => {
    canvas._fire(
      'pointerdown',
      makePointerEvent({
        pointerId: 1,
        pointerType: 'pen',
        pressure: 0.7,
      }),
    )
    expect(callbacks.downCalls.length).toBe(1)
    expect(callbacks.downCalls[0].pressure).toBe(0.7)
    expect(callbacks.downCalls[0].pointerType).toBe('pen')
  })

  test('touch pointer down uses pressure 1', () => {
    canvas._fire(
      'pointerdown',
      makePointerEvent({
        pointerId: 1,
        pointerType: 'touch',
        pressure: 0.5,
      }),
    )
    expect(callbacks.downCalls.length).toBe(1)
    expect(callbacks.downCalls[0].pressure).toBe(1)
  })

  test('palm rejection: large touch rejected when stylus active', () => {
    // First activate stylus
    canvas._fire(
      'pointerdown',
      makePointerEvent({
        pointerId: 1,
        pointerType: 'pen',
        pressure: 0.5,
      }),
    )
    canvas._fire(
      'pointerup',
      makePointerEvent({
        pointerId: 1,
        pointerType: 'pen',
      }),
    )

    // Now try a large touch while stylus was active (stylus resets on up)
    // Actually, on pen up, stylusActive is set to false, so we need to test during pen down
    // Reset and test properly:
    detachTouchHandler()
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)

    // Pen down first
    canvas._fire(
      'pointerdown',
      makePointerEvent({
        pointerId: 1,
        pointerType: 'pen',
        pressure: 0.5,
      }),
    )

    // Large touch (palm) while pen is active
    canvas._fire(
      'pointerdown',
      makePointerEvent({
        pointerId: 2,
        pointerType: 'touch',
        width: 50, // > 20, so radiusX = 25 > 20 => isPalm
        height: 50,
      }),
    )

    // Only the pen down should have registered
    expect(callbacks.downCalls.length).toBe(1)
    expect(callbacks.downCalls[0].pointerType).toBe('pen')
  })
})

describe('touch-handler - two finger pinch', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('two pointers down initiates pinch (no second onPointerDown)', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' }))
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch' }))
    // Only first finger should trigger onPointerDown
    expect(callbacks.downCalls.length).toBe(1)
  })

  test('move during pinch does not fire onPointerMove', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch' }))
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch' }))
    canvas._fire('pointermove', makePointerEvent({ pointerId: 1, clientX: 90, clientY: 90, pointerType: 'touch' }))
    // onPointerMove should not be called during pinch
    expect(callbacks.moveCalls.length).toBe(0)
  })
})

describe('touch-handler - touch event prevention', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('touchstart is prevented', () => {
    let defaultPrevented = false
    const touchEvent = {
      preventDefault: () => {
        defaultPrevented = true
      },
    } as unknown as TouchEvent
    canvas._fire('touchstart', touchEvent)
    expect(defaultPrevented).toBe(true)
  })

  test('touchmove is prevented', () => {
    let defaultPrevented = false
    const touchEvent = {
      preventDefault: () => {
        defaultPrevented = true
      },
    } as unknown as TouchEvent
    canvas._fire('touchmove', touchEvent)
    expect(defaultPrevented).toBe(true)
  })

  test('touchend is prevented', () => {
    let defaultPrevented = false
    const touchEvent = {
      preventDefault: () => {
        defaultPrevented = true
      },
    } as unknown as TouchEvent
    canvas._fire('touchend', touchEvent)
    expect(defaultPrevented).toBe(true)
  })
})

describe('touch-handler - currentPressure export', () => {
  test('currentPressure is exported as number', () => {
    expect(typeof currentPressure).toBe('number')
  })

  test('currentPressure defaults to 1', () => {
    // After detach, it should be reset to 1
    detachTouchHandler()
    // Re-import to check (it's a let binding so the module maintains it)
    expect(currentPressure).toBe(1)
  })
})

describe('touch-handler - pointer cancel', () => {
  let canvas: ReturnType<typeof createMockCanvas>
  let callbacks: ReturnType<typeof createMockCallbacks>

  beforeEach(() => {
    canvas = createMockCanvas()
    callbacks = createMockCallbacks()
    attachTouchHandler(canvas, callbacks)
  })

  afterEach(() => {
    detachTouchHandler()
  })

  test('pointercancel triggers pointer up logic', () => {
    canvas._fire('pointerdown', makePointerEvent({ pointerId: 1, clientX: 100, clientY: 200 }))
    canvas._fire('pointercancel', makePointerEvent({ pointerId: 1, clientX: 100, clientY: 200 }))
    expect(callbacks.upCalls.length).toBe(1)
  })
})
