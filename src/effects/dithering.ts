import type { DitheringConfig } from '@/types'

/**
 * Apply dithering to an ImageData buffer in-place.
 */
export function applyDithering(imageData: ImageData, config: DitheringConfig) {
  if (!config.enabled || config.algorithm === 'none' || config.strength === 0) return

  switch (config.algorithm) {
    case 'bayer':
      applyBayerDithering(imageData, config.strength, config.seed)
      break
    case 'floyd-steinberg':
      applyFloydSteinberg(imageData, config.strength)
      break
    case 'atkinson':
      applyAtkinson(imageData, config.strength)
      break
    case 'jarvis':
      applyJarvis(imageData, config.strength)
      break
    case 'stucki':
      applyStucki(imageData, config.strength)
      break
  }
}

// ─── Bayer (ordered) dithering ───────────────────────────────

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

function applyBayerDithering(imageData: ImageData, strength: number, seed: number) {
  const { data, width, height } = imageData
  const scale = strength * 32 // strength maps to noise amplitude

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // Bayer threshold: normalized to [-0.5, 0.5]
      const bx = (x + seed) % 4
      const by = (y + seed) % 4
      const threshold = (BAYER_4X4[by]![bx]! / 16 - 0.5) * scale

      data[i] = clamp(data[i]! + threshold)
      data[i + 1] = clamp(data[i + 1]! + threshold)
      data[i + 2] = clamp(data[i + 2]! + threshold)
      // Alpha unchanged
    }
  }
}

// ─── Error diffusion framework ──────────────────────────────

interface DiffusionKernel {
  offsets: [number, number, number][] // [dx, dy, weight]
  divisor: number
}

const FLOYD_STEINBERG: DiffusionKernel = {
  offsets: [
    [1, 0, 7],
    [-1, 1, 3],
    [0, 1, 5],
    [1, 1, 1],
  ],
  divisor: 16,
}

const ATKINSON: DiffusionKernel = {
  offsets: [
    [1, 0, 1],
    [2, 0, 1],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [0, 2, 1],
  ],
  divisor: 8,
}

const JARVIS: DiffusionKernel = {
  offsets: [
    [1, 0, 7],
    [2, 0, 5],
    [-2, 1, 3],
    [-1, 1, 5],
    [0, 1, 7],
    [1, 1, 5],
    [2, 1, 3],
    [-2, 2, 1],
    [-1, 2, 3],
    [0, 2, 5],
    [1, 2, 3],
    [2, 2, 1],
  ],
  divisor: 48,
}

const STUCKI: DiffusionKernel = {
  offsets: [
    [1, 0, 8],
    [2, 0, 4],
    [-2, 1, 2],
    [-1, 1, 4],
    [0, 1, 8],
    [1, 1, 4],
    [2, 1, 2],
    [-2, 2, 1],
    [-1, 2, 2],
    [0, 2, 4],
    [1, 2, 2],
    [2, 2, 1],
  ],
  divisor: 42,
}

function applyErrorDiffusion(imageData: ImageData, strength: number, kernel: DiffusionKernel) {
  const { data, width, height } = imageData
  // Work with float errors to avoid accumulation loss
  const errors = new Float32Array(width * height * 3) // R, G, B per pixel

  // Number of quantization levels (fewer = more dithering visible)
  // At strength=1: quantize to 8 levels. At strength=0.1: quantize to ~200 levels.
  const levels = Math.max(2, Math.round(256 / (1 + strength * 31)))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const ei = (y * width + x) * 3

      for (let c = 0; c < 3; c++) {
        const oldVal = data[i + c]! + errors[ei + c]!
        const newVal = Math.round(oldVal / (256 / levels)) * (256 / levels)
        data[i + c] = clamp(newVal)
        const error = oldVal - newVal

        // Diffuse error to neighbors
        for (const [dx, dy, weight] of kernel.offsets) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const ni = (ny * width + nx) * 3
            errors[ni + c]! += (error * weight) / kernel.divisor
          }
        }
      }
    }
  }
}

function applyFloydSteinberg(imageData: ImageData, strength: number) {
  applyErrorDiffusion(imageData, strength, FLOYD_STEINBERG)
}

function applyAtkinson(imageData: ImageData, strength: number) {
  applyErrorDiffusion(imageData, strength, ATKINSON)
}

function applyJarvis(imageData: ImageData, strength: number) {
  applyErrorDiffusion(imageData, strength, JARVIS)
}

function applyStucki(imageData: ImageData, strength: number) {
  applyErrorDiffusion(imageData, strength, STUCKI)
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

// Exported for tests
export { applyBayerDithering, applyFloydSteinberg, applyAtkinson, applyJarvis, applyStucki }
