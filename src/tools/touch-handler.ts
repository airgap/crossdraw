/**
 * Touch / stylus handler for the Crossdraw canvas.
 *
 * Gesture detection:
 * - Single finger  → routed to current tool (touch ↔ mouse translation)
 * - Two fingers    → pinch-to-zoom + pan
 * - Long press     → context menu (500 ms)
 * - Pen/stylus     → pressure-sensitive input + palm rejection
 */

import { useEditorStore } from '@/store/editor.store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TouchPoint {
  id: number
  x: number
  y: number
  radiusX: number
  radiusY: number
  pressure: number
  pointerType: string
}

export interface TouchHandlerCallbacks {
  /** Translate a pointer event into a synthetic MouseEvent-like object and
   *  forward it to the viewport mouse-down handler. */
  onPointerDown: (
    x: number,
    y: number,
    button: number,
    shiftKey: boolean,
    pressure: number,
    pointerType: string,
  ) => void
  onPointerMove: (x: number, y: number, shiftKey: boolean, pressure: number, pointerType: string) => void
  onPointerUp: (pressure: number, pointerType: string) => void
  onContextMenu: (x: number, y: number) => void
  onDoubleTap: (x: number, y: number) => void
  getCanvasRect: () => DOMRect
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const activeTouches = new Map<number, TouchPoint>()

let longPressTimer: ReturnType<typeof setTimeout> | null = null
const LONG_PRESS_MS = 500

/** When a stylus is in contact we flag it so we can reject palm touches. */
let stylusActive = false

/** Double-tap detection. */
let lastTapTime = 0
let lastTapX = 0
let lastTapY = 0
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_RADIUS = 30

/** Initial pinch distance (or 0 when no pinch is happening). */
let pinchStartDist = 0
let pinchStartZoom = 1
let pinchStartPanX = 0
let pinchStartPanY = 0
let pinchStartMidX = 0
let pinchStartMidY = 0
/** Whether we're in a pinch gesture (suppresses single-finger events during transition). */
let isPinching = false

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist(a: TouchPoint, b: TouchPoint): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function midpoint(a: TouchPoint, b: TouchPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function clearLongPress() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function isPalm(touch: TouchPoint): boolean {
  return touch.radiusX > 20 || touch.radiusY > 20
}

function touchFromPointer(e: PointerEvent): TouchPoint {
  return {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    radiusX: (e as any).width ? (e as any).width / 2 : 0,
    radiusY: (e as any).height ? (e as any).height / 2 : 0,
    pressure: e.pressure,
    pointerType: e.pointerType,
  }
}

// ---------------------------------------------------------------------------
// Public API — attach / detach
// ---------------------------------------------------------------------------

let attached = false
let currentCanvas: HTMLCanvasElement | null = null
let currentCallbacks: TouchHandlerCallbacks | null = null

/** Current stylus pressure (0-1). Exported so other modules (brush) can read it. */
export let currentPressure = 1

export function attachTouchHandler(canvas: HTMLCanvasElement, cbs: TouchHandlerCallbacks) {
  if (attached) detachTouchHandler()

  currentCanvas = canvas
  currentCallbacks = cbs
  attached = true

  canvas.style.touchAction = 'none'

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('touchstart', preventDefaultTouch, { passive: false })
  canvas.addEventListener('touchmove', preventDefaultTouch, { passive: false })
  canvas.addEventListener('touchend', preventDefaultTouch, { passive: false })
}

export function detachTouchHandler() {
  if (!currentCanvas) return
  const canvas = currentCanvas

  canvas.removeEventListener('pointerdown', onPointerDown)
  canvas.removeEventListener('pointermove', onPointerMove)
  canvas.removeEventListener('pointerup', onPointerUp)
  canvas.removeEventListener('pointercancel', onPointerUp)
  canvas.removeEventListener('touchstart', preventDefaultTouch)
  canvas.removeEventListener('touchmove', preventDefaultTouch)
  canvas.removeEventListener('touchend', preventDefaultTouch)

  canvas.style.touchAction = ''

  activeTouches.clear()
  clearLongPress()
  pinchStartDist = 0
  isPinching = false
  stylusActive = false
  attached = false
  currentCanvas = null
  currentCallbacks = null
}

// ---------------------------------------------------------------------------
// Prevent default on raw touch events to stop browser scroll/zoom
// ---------------------------------------------------------------------------

function preventDefaultTouch(e: TouchEvent) {
  e.preventDefault()
}

// ---------------------------------------------------------------------------
// Pointer event handlers
// ---------------------------------------------------------------------------

function onPointerDown(e: PointerEvent) {
  if (!currentCallbacks) return
  e.preventDefault()

  const tp = touchFromPointer(e)

  // Palm rejection: if stylus is active, reject large-area touches
  if (tp.pointerType === 'pen') {
    stylusActive = true
  } else if (tp.pointerType === 'touch' && stylusActive && isPalm(tp)) {
    return // rejected as palm
  }

  activeTouches.set(tp.id, tp)

  // Capture pointer for reliable tracking
  if (currentCanvas) {
    try {
      currentCanvas.setPointerCapture(e.pointerId)
    } catch {}
  }

  const count = activeTouches.size

  if (count === 1) {
    // Start long press timer
    clearLongPress()
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      if (activeTouches.size === 1) {
        currentCallbacks?.onContextMenu(tp.x, tp.y)
      }
    }, LONG_PRESS_MS)

    // Forward as mouse-down
    currentPressure = tp.pointerType === 'pen' ? tp.pressure : 1
    currentCallbacks.onPointerDown(tp.x, tp.y, 0, false, currentPressure, tp.pointerType)
  } else if (count === 2) {
    // Cancel any single-finger operations and start pinch
    clearLongPress()
    isPinching = true

    // Send a pointer-up to cancel any in-progress single-finger tool operation
    currentCallbacks.onPointerUp(1, 'touch')

    const pts = Array.from(activeTouches.values())
    const a = pts[0]!
    const b = pts[1]!
    pinchStartDist = dist(a, b)

    const store = useEditorStore.getState()
    pinchStartZoom = store.viewport.zoom
    pinchStartPanX = store.viewport.panX
    pinchStartPanY = store.viewport.panY
    const mid = midpoint(a, b)
    pinchStartMidX = mid.x
    pinchStartMidY = mid.y
  }
}

function onPointerMove(e: PointerEvent) {
  if (!currentCallbacks) return

  const tp = touchFromPointer(e)

  // Palm rejection while stylus active
  if (tp.pointerType === 'touch' && stylusActive && isPalm(tp)) return

  if (!activeTouches.has(tp.id)) return
  activeTouches.set(tp.id, tp)

  const count = activeTouches.size

  if (count === 1 && !isPinching) {
    // Any movement cancels long press
    clearLongPress()

    currentPressure = tp.pointerType === 'pen' ? tp.pressure : 1
    currentCallbacks.onPointerMove(tp.x, tp.y, false, currentPressure, tp.pointerType)
  } else if (count === 2 && pinchStartDist > 0) {
    // Pinch-to-zoom + pan
    const pts = Array.from(activeTouches.values())
    const a = pts[0]!
    const b = pts[1]!
    const newDist = dist(a, b)
    const mid = midpoint(a, b)

    const scale = newDist / pinchStartDist
    const newZoom = Math.max(0.1, Math.min(10, pinchStartZoom * scale))

    // Keep the pinch midpoint fixed on the same document point.
    // The document point under the initial midpoint was:
    //   docX = (pinchStartMidX - canvasLeft - pinchStartPanX) / pinchStartZoom
    // We want: mid.x - canvasLeft = docX * newZoom + newPanX
    // So:      newPanX = (mid.x - canvasLeft) - docX * newZoom
    // Since canvasLeft cancels out when we substitute docX, we can simplify:
    const rect = currentCallbacks!.getCanvasRect()
    const docX = (pinchStartMidX - rect.left - pinchStartPanX) / pinchStartZoom
    const docY = (pinchStartMidY - rect.top - pinchStartPanY) / pinchStartZoom
    const newPanX = mid.x - rect.left - docX * newZoom
    const newPanY = mid.y - rect.top - docY * newZoom

    const store = useEditorStore.getState()
    store.setZoom(newZoom)
    store.setPan(newPanX, newPanY)
  }
}

function onPointerUp(e: PointerEvent) {
  if (!currentCallbacks) return

  const tp = touchFromPointer(e)

  if (tp.pointerType === 'pen') {
    stylusActive = false
  }

  if (!activeTouches.has(tp.id)) return
  activeTouches.delete(tp.id)

  clearLongPress()

  if (currentCanvas) {
    try {
      currentCanvas.releasePointerCapture(e.pointerId)
    } catch {}
  }

  if (activeTouches.size === 0) {
    pinchStartDist = 0
    currentPressure = 1
    // Only forward pointer-up if we weren't pinching — pinch already sent
    // a synthetic pointer-up when it started
    if (!isPinching) {
      currentCallbacks.onPointerUp(tp.pressure, tp.pointerType)

      // Double-tap detection
      const now = Date.now()
      const dx = tp.x - lastTapX
      const dy = tp.y - lastTapY
      if (now - lastTapTime < DOUBLE_TAP_MS && dx * dx + dy * dy < DOUBLE_TAP_RADIUS * DOUBLE_TAP_RADIUS) {
        currentCallbacks.onDoubleTap(tp.x, tp.y)
        lastTapTime = 0 // Reset so triple-tap doesn't fire again
      } else {
        lastTapTime = now
        lastTapX = tp.x
        lastTapY = tp.y
      }
    }
    isPinching = false
  } else if (activeTouches.size === 1 && isPinching) {
    // Transitioning from pinch to single finger — reset pinch state
    // but stay in isPinching mode so we don't start a new tool operation
    // with a stale finger position. The user must lift all fingers first.
    pinchStartDist = 0
  }
}
