import type { DesignDocument, Layer, Keyframe } from '@/types'

/**
 * Export animation as Lottie JSON.
 * Generates a basic Lottie structure with transform keyframes.
 */
export function exportLottie(document: DesignDocument, artboardIndex: number = 0): object {
  const artboard = document.artboards[artboardIndex]
  if (!artboard) {
    throw new Error(`Artboard index ${artboardIndex} not found`)
  }

  // Find all animated layers
  const animatedLayers: Layer[] = []
  const collectAnimated = (layers: Layer[]) => {
    for (const layer of layers) {
      if (layer.animation && layer.animation.keyframes.length > 0) {
        animatedLayers.push(layer)
      }
      if (layer.type === 'group') {
        collectAnimated(layer.children)
      }
    }
  }
  collectAnimated(artboard.layers)

  // Determine max duration and frame rate
  const FRAME_RATE = 30
  let maxDurationMs = 0
  for (const layer of animatedLayers) {
    if (layer.animation && layer.animation.duration > maxDurationMs) {
      maxDurationMs = layer.animation.duration
    }
  }
  if (maxDurationMs === 0) maxDurationMs = 3000

  const totalFrames = Math.ceil((maxDurationMs / 1000) * FRAME_RATE)

  // Build Lottie layers
  const lottieLayers = animatedLayers.map((layer, idx) => buildLottieLayer(layer, idx, FRAME_RATE))

  return {
    v: '5.7.0', // Lottie version
    fr: FRAME_RATE,
    ip: 0, // in-point
    op: totalFrames, // out-point
    w: artboard.width,
    h: artboard.height,
    nm: artboard.name,
    ddd: 0, // no 3D
    assets: [],
    layers: lottieLayers,
  }
}

function msToFrame(ms: number, frameRate: number): number {
  return (ms / 1000) * frameRate
}

/**
 * Map our easing types to Lottie bezier easing handles.
 * Lottie uses `i` (in tangent) and `o` (out tangent) as bezier curve points.
 */
function getEasingHandles(easing: Keyframe['easing']): {
  i: { x: number[]; y: number[] }
  o: { x: number[]; y: number[] }
} {
  switch (easing) {
    case 'linear':
      return {
        i: { x: [1], y: [1] },
        o: { x: [0], y: [0] },
      }
    case 'ease-in':
      return {
        i: { x: [1], y: [1] },
        o: { x: [0.42], y: [0] },
      }
    case 'ease-out':
      return {
        i: { x: [0.58], y: [1] },
        o: { x: [0], y: [0] },
      }
    case 'ease-in-out':
      return {
        i: { x: [0.58], y: [1] },
        o: { x: [0.42], y: [0] },
      }
    case 'spring':
      // Approximate spring with fast ease-out
      return {
        i: { x: [0.3], y: [1.3] },
        o: { x: [0.1], y: [0] },
      }
  }
}

function buildLottieLayer(layer: Layer, index: number, frameRate: number): object {
  const track = layer.animation!
  const keyframes = [...track.keyframes].sort((a, b) => a.time - b.time)

  // Build transform keyframes
  const positionKeyframes = buildPropertyKeyframes(keyframes, frameRate, (kf) => {
    const x = kf.properties.x ?? layer.transform.x
    const y = kf.properties.y ?? layer.transform.y
    return [x, y]
  })

  const scaleKeyframes = buildPropertyKeyframes(keyframes, frameRate, (kf) => {
    const sx = (kf.properties.scaleX ?? layer.transform.scaleX) * 100
    const sy = (kf.properties.scaleY ?? layer.transform.scaleY) * 100
    return [sx, sy]
  })

  const rotationKeyframes = buildScalarKeyframes(keyframes, frameRate, (kf) => {
    return kf.properties.rotation ?? layer.transform.rotation
  })

  const opacityKeyframes = buildScalarKeyframes(keyframes, frameRate, (kf) => {
    return (kf.properties.opacity ?? layer.opacity) * 100
  })

  return {
    ddd: 0,
    ind: index,
    ty: 4, // shape layer
    nm: layer.name,
    sr: 1,
    ks: {
      o: opacityKeyframes, // opacity
      r: rotationKeyframes, // rotation
      p: positionKeyframes, // position
      a: { a: 0, k: [0, 0, 0] }, // anchor point
      s: scaleKeyframes, // scale
    },
    ao: 0,
    ip: 0,
    op: Math.ceil((track.duration / 1000) * frameRate),
    st: 0,
    bm: 0,
  }
}

/**
 * Build Lottie animated property with vector values (e.g., position [x,y]).
 */
function buildPropertyKeyframes(
  keyframes: Keyframe[],
  frameRate: number,
  getValue: (kf: Keyframe) => number[],
): object {
  if (keyframes.length === 0) {
    return { a: 0, k: [0, 0, 0] }
  }

  if (keyframes.length === 1) {
    const val = getValue(keyframes[0]!)
    return { a: 0, k: [...val, 0] }
  }

  // Animated
  const k: object[] = []
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!
    const val = getValue(kf)
    const frame = msToFrame(kf.time, frameRate)
    const easing = getEasingHandles(kf.easing)

    if (i < keyframes.length - 1) {
      const nextVal = getValue(keyframes[i + 1]!)
      k.push({
        t: frame,
        s: [...val, 0],
        e: [...nextVal, 0],
        i: easing.i,
        o: easing.o,
      })
    } else {
      // Last keyframe (hold)
      k.push({
        t: frame,
        s: [...val, 0],
      })
    }
  }

  return { a: 1, k }
}

/**
 * Build Lottie animated property with scalar values (e.g., rotation, opacity).
 */
function buildScalarKeyframes(keyframes: Keyframe[], frameRate: number, getValue: (kf: Keyframe) => number): object {
  if (keyframes.length === 0) {
    return { a: 0, k: 0 }
  }

  if (keyframes.length === 1) {
    return { a: 0, k: getValue(keyframes[0]!) }
  }

  // Animated
  const k: object[] = []
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!
    const val = getValue(kf)
    const frame = msToFrame(kf.time, frameRate)
    const easing = getEasingHandles(kf.easing)

    if (i < keyframes.length - 1) {
      const nextVal = getValue(keyframes[i + 1]!)
      k.push({
        t: frame,
        s: [val],
        e: [nextVal],
        i: easing.i,
        o: easing.o,
      })
    } else {
      k.push({
        t: frame,
        s: [val],
      })
    }
  }

  return { a: 1, k }
}

/**
 * Download Lottie JSON as a file.
 */
export function downloadLottie(lottieData: object, filename: string = 'animation.json'): void {
  const json = JSON.stringify(lottieData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
