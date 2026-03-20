import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import { getLayerBBox, type BBox } from '@/math/bbox'
import type { Layer } from '@/types'

interface LayerBBox {
  layerId: string
  bbox: BBox
}

function getSelectedLayerBBoxes(): LayerBBox[] {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return []

  const results: LayerBBox[] = []
  for (const id of store.selection.layerIds) {
    const layer = artboard.layers.find((l) => l.id === id)
    if (!layer) continue
    const bbox = getLayerBBox(layer, artboard)
    if (bbox.minX === Infinity) continue
    results.push({ layerId: id, bbox })
  }
  return results
}

function getArtboardBBox(): BBox | null {
  const artboard = getActiveArtboard()
  if (!artboard) return null
  return {
    minX: artboard.x,
    minY: artboard.y,
    maxX: artboard.x + artboard.width,
    maxY: artboard.y + artboard.height,
  }
}

function moveLayerBy(layerId: string, dx: number, dy: number) {
  const store = useEditorStore.getState()
  const artboard = getActiveArtboard()
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId)
  if (!layer) return
  store.updateLayer(artboard.id, layerId, {
    transform: {
      ...layer.transform,
      x: layer.transform.x + dx,
      y: layer.transform.y + dy,
    },
  } as Partial<Layer>)
}

// ── Alignment ──

export function alignLeft(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  const targetX = toArtboard ? (getArtboardBBox()?.minX ?? 0) : Math.min(...items.map((i) => i.bbox.minX))

  for (const item of items) {
    const dx = targetX - item.bbox.minX
    if (dx !== 0) moveLayerBy(item.layerId, dx, 0)
  }
}

export function alignCenterH(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  let targetCenterX: number
  if (toArtboard) {
    const ab = getArtboardBBox()
    if (!ab) return
    targetCenterX = (ab.minX + ab.maxX) / 2
  } else {
    const allMinX = Math.min(...items.map((i) => i.bbox.minX))
    const allMaxX = Math.max(...items.map((i) => i.bbox.maxX))
    targetCenterX = (allMinX + allMaxX) / 2
  }

  for (const item of items) {
    const centerX = (item.bbox.minX + item.bbox.maxX) / 2
    const dx = targetCenterX - centerX
    if (dx !== 0) moveLayerBy(item.layerId, dx, 0)
  }
}

export function alignRight(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  const targetX = toArtboard ? (getArtboardBBox()?.maxX ?? 0) : Math.max(...items.map((i) => i.bbox.maxX))

  for (const item of items) {
    const dx = targetX - item.bbox.maxX
    if (dx !== 0) moveLayerBy(item.layerId, dx, 0)
  }
}

export function alignTop(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  const targetY = toArtboard ? (getArtboardBBox()?.minY ?? 0) : Math.min(...items.map((i) => i.bbox.minY))

  for (const item of items) {
    const dy = targetY - item.bbox.minY
    if (dy !== 0) moveLayerBy(item.layerId, 0, dy)
  }
}

export function alignMiddleV(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  let targetCenterY: number
  if (toArtboard) {
    const ab = getArtboardBBox()
    if (!ab) return
    targetCenterY = (ab.minY + ab.maxY) / 2
  } else {
    const allMinY = Math.min(...items.map((i) => i.bbox.minY))
    const allMaxY = Math.max(...items.map((i) => i.bbox.maxY))
    targetCenterY = (allMinY + allMaxY) / 2
  }

  for (const item of items) {
    const centerY = (item.bbox.minY + item.bbox.maxY) / 2
    const dy = targetCenterY - centerY
    if (dy !== 0) moveLayerBy(item.layerId, 0, dy)
  }
}

export function alignBottom(toArtboard = false) {
  const items = getSelectedLayerBBoxes()
  if (items.length === 0) return

  const targetY = toArtboard ? (getArtboardBBox()?.maxY ?? 0) : Math.max(...items.map((i) => i.bbox.maxY))

  for (const item of items) {
    const dy = targetY - item.bbox.maxY
    if (dy !== 0) moveLayerBy(item.layerId, 0, dy)
  }
}

// ── Distribution ──

export function distributeH() {
  const items = getSelectedLayerBBoxes()
  if (items.length < 3) return

  // Sort by center X
  items.sort((a, b) => {
    const aCx = (a.bbox.minX + a.bbox.maxX) / 2
    const bCx = (b.bbox.minX + b.bbox.maxX) / 2
    return aCx - bCx
  })

  const firstCx = (items[0]!.bbox.minX + items[0]!.bbox.maxX) / 2
  const lastCx = (items[items.length - 1]!.bbox.minX + items[items.length - 1]!.bbox.maxX) / 2
  const step = (lastCx - firstCx) / (items.length - 1)

  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!
    const currentCx = (item.bbox.minX + item.bbox.maxX) / 2
    const targetCx = firstCx + step * i
    const dx = targetCx - currentCx
    if (dx !== 0) moveLayerBy(item.layerId, dx, 0)
  }
}

export function distributeV() {
  const items = getSelectedLayerBBoxes()
  if (items.length < 3) return

  items.sort((a, b) => {
    const aCy = (a.bbox.minY + a.bbox.maxY) / 2
    const bCy = (b.bbox.minY + b.bbox.maxY) / 2
    return aCy - bCy
  })

  const firstCy = (items[0]!.bbox.minY + items[0]!.bbox.maxY) / 2
  const lastCy = (items[items.length - 1]!.bbox.minY + items[items.length - 1]!.bbox.maxY) / 2
  const step = (lastCy - firstCy) / (items.length - 1)

  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!
    const currentCy = (item.bbox.minY + item.bbox.maxY) / 2
    const targetCy = firstCy + step * i
    const dy = targetCy - currentCy
    if (dy !== 0) moveLayerBy(item.layerId, 0, dy)
  }
}

export function distributeSpacingH() {
  const items = getSelectedLayerBBoxes()
  if (items.length < 3) return

  items.sort((a, b) => a.bbox.minX - b.bbox.minX)

  const totalWidth = items.reduce((sum, i) => sum + (i.bbox.maxX - i.bbox.minX), 0)
  const totalSpan = items[items.length - 1]!.bbox.maxX - items[0]!.bbox.minX
  const totalGap = totalSpan - totalWidth
  const gap = totalGap / (items.length - 1)

  let x = items[0]!.bbox.maxX + gap
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!
    const dx = x - item.bbox.minX
    if (dx !== 0) moveLayerBy(item.layerId, dx, 0)
    x += item.bbox.maxX - item.bbox.minX + gap
  }
}

export function distributeSpacingV() {
  const items = getSelectedLayerBBoxes()
  if (items.length < 3) return

  items.sort((a, b) => a.bbox.minY - b.bbox.minY)

  const totalHeight = items.reduce((sum, i) => sum + (i.bbox.maxY - i.bbox.minY), 0)
  const totalSpan = items[items.length - 1]!.bbox.maxY - items[0]!.bbox.minY
  const totalGap = totalSpan - totalHeight
  const gap = totalGap / (items.length - 1)

  let y = items[0]!.bbox.maxY + gap
  for (let i = 1; i < items.length - 1; i++) {
    const item = items[i]!
    const dy = y - item.bbox.minY
    if (dy !== 0) moveLayerBy(item.layerId, 0, dy)
    y += item.bbox.maxY - item.bbox.minY + gap
  }
}
