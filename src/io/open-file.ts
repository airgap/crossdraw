import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'
import { importSVG } from '@/io/svg-import'
import { importPSD } from '@/io/psd-import'
import { decodeDocument } from '@/io/file-format'
import type { RasterLayer } from '@/types'

const OPEN_ACCEPT = '.xd,.psd,.png,.jpg,.jpeg,.gif,.webp,.svg'

/**
 * Open a file picker and load the selected file as a new document.
 * Supports .xd, PNG, JPEG, GIF, WebP, and SVG.
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

  if (name.endsWith('.xd')) {
    await openDesignFile(file)
  } else if (name.endsWith('.psd')) {
    await openPSDAsDocument(file)
  } else if (name.endsWith('.svg') || file.type === 'image/svg+xml') {
    await openSVGAsDocument(file)
  } else if (file.type.startsWith('image/')) {
    await openImageAsDocument(file)
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
