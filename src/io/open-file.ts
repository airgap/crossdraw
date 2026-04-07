import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'
import { importSVG } from '@/io/svg-import'
import { importPSD } from '@/io/psd-import'
import { decodeDocument } from '@/io/file-format'
import { isAnimatedGIF, decodeGIF } from '@/io/gif-decoder'
import type { RasterLayer, AnimationFrame, AnimationTimeline } from '@/types'

const OPEN_ACCEPT = '.crow,.psd,.png,.jpg,.jpeg,.gif,.webp,.svg'

/**
 * Open a file picker and load the selected file as a new document.
 * Supports .crow, PNG, JPEG, GIF, WebP, and SVG.
 */
export async function openFile(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = OPEN_ACCEPT
  input.multiple = false

  return new Promise((resolve) => {
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        await openFileAsDocument(file)
      }
      resolve()
    }
    input.click()
  })
}

/**
 * Open a File object as a new document, replacing the current one.
 */
export async function openFileAsDocument(file: File): Promise<void> {
  const name = file.name.toLowerCase()

  try {
    if (name.endsWith('.crow')) {
      await openDesignFile(file)
    } else if (name.endsWith('.psd')) {
      await openPSDAsDocument(file)
    } else if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
      await openSVGAsDocument(file)
    } else if (name.endsWith('.gif') || file.type === 'image/gif') {
      const buffer = await file.arrayBuffer()
      if (isAnimatedGIF(buffer)) {
        await openAnimatedGIFAsDocument(file.name, buffer)
      } else {
        await openImageAsDocument(file)
      }
    } else if (file.type.startsWith('image/')) {
      await openImageAsDocument(file)
    }
  } catch (err) {
    console.error(`Failed to open ${file.name}:`, err)
  }
}

async function openDesignFile(file: File): Promise<void> {
  const buffer = await file.arrayBuffer()
  const doc = decodeDocument(buffer)
  useEditorStore.setState({
    document: doc,
    history: [],
    historyIndex: -1,
    selection: { layerIds: [] },
    isDirty: false,
    filePath: null,
  })
}

async function openPSDAsDocument(file: File): Promise<void> {
  const buffer = await file.arrayBuffer()
  const doc = await importPSD(buffer)
  const title = file.name.replace(/\.[^.]+$/, '') || 'PSD Import'
  doc.metadata.title = title

  useEditorStore.setState({
    document: doc,
    history: [],
    historyIndex: -1,
    selection: { layerIds: [] },
    isDirty: false,
    filePath: null,
  })
}

async function openSVGAsDocument(file: File): Promise<void> {
  const svgString = await file.text()
  const doc = importSVG(svgString)
  const title = file.name.replace(/\.[^.]+$/, '') || 'SVG Import'
  doc.metadata.title = title

  useEditorStore.setState({
    document: doc,
    history: [],
    historyIndex: -1,
    selection: { layerIds: [] },
    isDirty: false,
    filePath: null,
  })
}

async function openAnimatedGIFAsDocument(fileName: string, buffer: ArrayBuffer): Promise<void> {
  const gif = decodeGIF(buffer)
  const title = fileName.replace(/\.[^.]+$/, '') || 'GIF'
  const artboardId = uuid()

  // Create one raster layer per frame
  const layers: RasterLayer[] = []
  const animFrames: AnimationFrame[] = []

  for (let i = 0; i < gif.frames.length; i++) {
    const frame = gif.frames[i]!
    const layerId = uuid()
    const chunkId = uuid()
    storeRasterData(chunkId, frame.imageData)

    layers.push({
      id: layerId,
      name: `Frame ${i + 1}`,
      type: 'raster',
      visible: i === 0, // only first frame visible initially
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      effects: [],
      imageChunkId: chunkId,
      width: frame.imageData.width,
      height: frame.imageData.height,
    })

    // Each animation frame shows only its corresponding layer
    const layerVisibility: Record<string, boolean> = {}
    for (let j = 0; j < gif.frames.length; j++) {
      layerVisibility[layers[j]?.id ?? `pending-${j}`] = false
    }
    // Fix: we'll fill in IDs after all layers are created
    animFrames.push({
      id: uuid(),
      name: `Frame ${i + 1}`,
      duration: frame.delayMs,
      layerVisibility: {}, // filled below
    })
  }

  // Now fill in layerVisibility with actual layer IDs
  for (let i = 0; i < animFrames.length; i++) {
    const vis: Record<string, boolean> = {}
    for (let j = 0; j < layers.length; j++) {
      vis[layers[j]!.id] = j === i
    }
    animFrames[i]!.layerVisibility = vis
  }

  // Compute average FPS from frame delays
  const totalMs = gif.frames.reduce((sum, f) => sum + f.delayMs, 0)
  const avgDelayMs = totalMs / gif.frames.length
  const fps = Math.round(Math.min(60, Math.max(1, 1000 / avgDelayMs)))

  const timeline: AnimationTimeline = {
    frames: animFrames,
    fps,
    loop: gif.loopCount === 0 || gif.loopCount > 1,
    currentFrame: 0,
  }

  useEditorStore.setState({
    document: {
      id: uuid(),
      metadata: {
        title,
        author: '',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        colorspace: 'srgb',
        width: gif.width,
        height: gif.height,
      },
      artboards: [
        {
          id: artboardId,
          name: 'Artboard 1',
          x: 0,
          y: 0,
          width: gif.width,
          height: gif.height,
          backgroundColor: '#ffffff',
          layers,
          animation: timeline,
        },
      ],
      assets: {
        gradients: [],
        patterns: [],
        colors: [],
      },
    },
    history: [],
    historyIndex: -1,
    selection: { layerIds: [] },
    isDirty: false,
    filePath: null,
  })
}

async function openImageAsDocument(file: File): Promise<void> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  const chunkId = uuid()
  storeRasterData(chunkId, imageData)

  const title = file.name.replace(/\.[^.]+$/, '') || 'Image'
  const artboardId = uuid()

  const layer: RasterLayer = {
    id: uuid(),
    name: title,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    imageChunkId: chunkId,
    width: imageData.width,
    height: imageData.height,
  }

  useEditorStore.setState({
    document: {
      id: uuid(),
      metadata: {
        title,
        author: '',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        colorspace: 'srgb',
        width: imageData.width,
        height: imageData.height,
      },
      artboards: [
        {
          id: artboardId,
          name: 'Artboard 1',
          x: 0,
          y: 0,
          width: imageData.width,
          height: imageData.height,
          backgroundColor: '#ffffff',
          layers: [layer],
        },
      ],
      assets: {
        gradients: [],
        patterns: [],
        colors: [],
      },
    },
    history: [],
    historyIndex: -1,
    selection: { layerIds: [] },
    isDirty: false,
    filePath: null,
  })
}
