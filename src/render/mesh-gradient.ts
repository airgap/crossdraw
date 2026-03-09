import type { MeshGradientData } from '@/types'

/**
 * Render a mesh gradient into the given canvas context, clipped to `bounds`.
 *
 * The mesh is a rows×cols grid of control points, each with a position (0-1
 * within the bounding box) and a color+opacity.  For every cell (the quad
 * between four adjacent control points) we perform per-pixel bilinear
 * interpolation on an OffscreenCanvas and composite the result.
 */
export function renderMeshGradient(
  ctx: CanvasRenderingContext2D,
  mesh: MeshGradientData,
  bounds: { x: number; y: number; width: number; height: number },
): void {
  const { rows, cols, points } = mesh
  if (rows < 2 || cols < 2 || points.length < rows * cols) return

  // Resolution per cell (pixels).  64 gives smooth results without being
  // too expensive for typical 2-4 row/col meshes.
  const cellRes = 64

  const totalW = cellRes * (cols - 1)
  const totalH = cellRes * (rows - 1)

  const offscreen = new OffscreenCanvas(totalW, totalH)
  const offCtx = offscreen.getContext('2d')!
  const imageData = offCtx.createImageData(totalW, totalH)
  const data = imageData.data

  // Helper: get point at (row, col)
  const pt = (r: number, c: number) => points[r * cols + c]!

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const tl = pt(row, col)
      const tr = pt(row, col + 1)
      const bl = pt(row + 1, col)
      const br = pt(row + 1, col + 1)

      const tlRGB = parseHex(tl.color)
      const trRGB = parseHex(tr.color)
      const blRGB = parseHex(bl.color)
      const brRGB = parseHex(br.color)

      const tlA = tl.opacity
      const trA = tr.opacity
      const blA = bl.opacity
      const brA = br.opacity

      const xOff = col * cellRes
      const yOff = row * cellRes

      for (let py = 0; py < cellRes; py++) {
        const v = py / (cellRes - 1)
        for (let px = 0; px < cellRes; px++) {
          const u = px / (cellRes - 1)

          // Bilinear interpolation
          const r = bilerp(tlRGB.r, trRGB.r, blRGB.r, brRGB.r, u, v)
          const g = bilerp(tlRGB.g, trRGB.g, blRGB.g, brRGB.g, u, v)
          const b = bilerp(tlRGB.b, trRGB.b, blRGB.b, brRGB.b, u, v)
          const a = bilerp(tlA, trA, blA, brA, u, v)

          const i = ((yOff + py) * totalW + (xOff + px)) * 4
          data[i] = Math.round(r)
          data[i + 1] = Math.round(g)
          data[i + 2] = Math.round(b)
          data[i + 3] = Math.round(a * 255)
        }
      }
    }
  }

  offCtx.putImageData(imageData, 0, 0)

  // Draw the offscreen canvas into the main context, mapped to bounds
  ctx.drawImage(offscreen, bounds.x, bounds.y, bounds.width, bounds.height)
}

/** Create a default 2x2 mesh with four contrasting colors. */
export function createDefaultMeshData(): MeshGradientData {
  return {
    rows: 2,
    cols: 2,
    points: [
      { x: 0, y: 0, color: '#ff4444', opacity: 1 }, // top-left: red
      { x: 1, y: 0, color: '#44aaff', opacity: 1 }, // top-right: blue
      { x: 0, y: 1, color: '#44ff88', opacity: 1 }, // bottom-left: green
      { x: 1, y: 1, color: '#ffcc44', opacity: 1 }, // bottom-right: yellow
    ],
  }
}

// ---- helpers ----

function bilerp(tl: number, tr: number, bl: number, br: number, u: number, v: number): number {
  const top = tl + (tr - tl) * u
  const bot = bl + (br - bl) * u
  return top + (bot - top) * v
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  }
}
