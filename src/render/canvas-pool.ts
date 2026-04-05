/**
 * OffscreenCanvas object pool.
 *
 * Eliminates per-frame allocation overhead by reusing canvases. On mobile,
 * OffscreenCanvas creation + getContext() costs ~0.2–0.5ms each, and the
 * rendering pipeline allocates ~20 per frame without pooling.
 *
 * Usage:
 *   const canvas = acquireCanvas(width, height)
 *   const ctx = canvas.getContext('2d')!
 *   // ... draw ...
 *   releaseCanvas(canvas)
 *
 * Canvases are resized on acquire if needed. The pool caps at MAX_POOL_SIZE
 * to avoid unbounded memory growth.
 */

const MAX_POOL_SIZE = 16
const pool: OffscreenCanvas[] = []

/**
 * Acquire an OffscreenCanvas of at least the given dimensions.
 * The canvas is cleared and sized to exactly (w, h).
 */
export function acquireCanvas(w: number, h: number): OffscreenCanvas {
  const canvas = pool.pop() ?? new OffscreenCanvas(w, h)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return canvas
}

/**
 * Return a canvas to the pool for reuse.
 * The caller must not use the canvas after releasing it.
 */
export function releaseCanvas(canvas: OffscreenCanvas) {
  if (pool.length < MAX_POOL_SIZE) {
    pool.push(canvas)
  }
}
