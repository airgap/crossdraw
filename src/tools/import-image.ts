import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { storeRasterData } from '@/store/raster-data'
import { importSVG } from '@/io/svg-import'
import type { RasterLayer } from '@/types'

/**
 * Import an image file (PNG/JPG/GIF/WebP) as a RasterLayer on the first artboard.
 */
export async function importImageFile(file: File): Promise<void> {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  const chunkId = uuid()
  storeRasterData(chunkId, imageData)

  const name = file.name.replace(/\.[^.]+$/, '') || 'Image'
  const layer: RasterLayer = {
    id: uuid(),
    name,
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

  store.addLayer(artboard.id, layer)
  store.selectLayer(layer.id)
}

/**
 * Import an image from a Blob (e.g. from clipboard paste).
 */
export async function importImageFromBlob(blob: Blob, name = 'Pasted Image'): Promise<void> {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  const chunkId = uuid()
  storeRasterData(chunkId, imageData)

  const layer: RasterLayer = {
    id: uuid(),
    name,
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

  store.addLayer(artboard.id, layer)
  store.selectLayer(layer.id)
}

/**
 * Open a file picker and import the selected image (raster or SVG).
 */
export async function importImageFromPicker(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,.svg'
  input.multiple = false

  return new Promise((resolve) => {
    input.onchange = async () => {
      const file = input.files?.[0]
      if (file) {
        const isSvg =
          file.type === 'image/svg+xml' ||
          file.name.toLowerCase().endsWith('.svg')

        if (isSvg) {
          await importSVGAsMergedLayers(file)
        } else {
          await importImageFile(file)
        }
      }
      resolve()
    }
    input.click()
  })
}

/**
 * Import an SVG file by parsing it and merging the resulting layers
 * into the current document's active/first artboard.
 */
async function importSVGAsMergedLayers(file: File): Promise<void> {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards[0]
  if (!artboard) return

  const svgString = await file.text()
  const svgDoc = importSVG(svgString)

  const sourceArtboard = svgDoc.artboards[0]
  if (!sourceArtboard || sourceArtboard.layers.length === 0) return

  const addedIds: string[] = []
  for (const layer of sourceArtboard.layers) {
    store.addLayer(artboard.id, layer)
    addedIds.push(layer.id)
  }

  // Select all newly added layers
  if (addedIds.length > 0) {
    store.selectLayer(addedIds[0]!)
    for (let i = 1; i < addedIds.length; i++) {
      store.selectLayer(addedIds[i]!, true)
    }
  }
}
