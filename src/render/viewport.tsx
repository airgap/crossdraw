import { useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { zoomAtPoint, screenToDocument } from '@/math/viewport'
import { segmentsToPath2D } from '@/math/path'
import { spatialIndex } from '@/math/hit-test'
import { getLayerBBox } from '@/math/bbox'
import { getRasterCanvas } from '@/store/raster-data'
import { applyEffects, hasActiveEffects } from '@/effects/render-effects'
import { applyAdjustment } from '@/effects/adjustments'
import { createCanvasGradient, renderBoxGradient } from '@/render/gradient'
import {
  penMouseDown,
  penMouseDrag,
  penMouseMove,
  penMouseUp,
  penKeyDown,
  getPenState,
  getPenPreviewState,
} from '@/tools/pen'
import {
  isTransformDragging,
  hitTestHandles,
  getHandlePositions,
  beginTransform,
  updateTransform,
  endTransform,
  getHandleCursor,
} from '@/tools/transform'
import { importImageFile, importImageFromBlob } from '@/tools/import-image'
import { beginShapeDrag, updateShapeDrag, endShapeDrag, isShapeDragging } from '@/tools/shapes'
import {
  getNodeState, nodeMouseDown, nodeMouseDrag, nodeMouseUp,
  deleteSelectedNodes, hitTestSegmentEdge, insertPointOnSegment,
  toggleNodeSmooth, hitTestNode,
} from '@/tools/node'
import { sampleColor, applyColorToSelection, renderLoupe } from '@/tools/eyedropper'
import {
  getTextEditState, beginTextEdit, endTextEdit,
  createAndEditText, textEditKeyDown, renderTextEditOverlay,
  setTextEditRenderCallback,
} from '@/tools/text-edit'
import { renderRulers, renderGuides, renderGrid, RULER_SIZE } from '@/render/rulers'
import { renderSnapLines } from '@/tools/snap'
import { openCanvasContextMenu } from '@/ui/context-menu'
import { attachTouchHandler, detachTouchHandler, currentPressure } from '@/tools/touch-handler'
import { paintStroke } from '@/tools/brush'
import type { VectorLayer, RasterLayer, GroupLayer, AdjustmentLayer, TextLayer, Layer, Artboard } from '@/types'

/** Resolve `currentColor` keyword to a concrete color. Default fallback is black. */
let _currentColor = '#000000'
export function setCurrentColor(color: string) { _currentColor = color }
function resolveColor(color: string): string {
  return color === 'currentColor' ? _currentColor : color
}

/** Map Canvas 2D globalCompositeOperation from our BlendMode type. */
function blendModeToComposite(mode: string): GlobalCompositeOperation {
  if (mode === 'normal') return 'source-over'
  return mode as GlobalCompositeOperation
}

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewport = useEditorStore((s) => s.viewport)
  const document = useEditorStore((s) => s.document)
  const activeTool = useEditorStore((s) => s.activeTool)
  const selection = useEditorStore((s) => s.selection)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setPan = useEditorStore((s) => s.setPan)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const deselectAll = useEditorStore((s) => s.deselectAll)
  const showRulers = useEditorStore((s) => s.showRulers)
  const showGrid = useEditorStore((s) => s.showGrid)
  const gridSize = useEditorStore((s) => s.gridSize)
  const activeSnapLines = useEditorStore((s) => s.activeSnapLines)
  const addGuide = useEditorStore((s) => s.addGuide)
  const touchMode = useEditorStore((s) => s.touchMode)

  const isPanning = useRef(false)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })
  const eyedropperHover = useRef<{ x: number; y: number } | null>(null)
  const mouseDocPos = useRef({ x: 0, y: 0 })
  const marquee = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const spaceHeld = useRef(false)
  const measureLine = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null)
  const brushPoints = useRef<Array<{ x: number; y: number }>>([])
  const brushPressure = useRef(1)

  // Rebuild spatial index when document changes
  useEffect(() => {
    spatialIndex.rebuild(document)
  }, [document])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(viewport.panX, viewport.panY)
    ctx.scale(viewport.zoom, viewport.zoom)

    // Render each artboard
    for (const artboard of document.artboards) {
      renderArtboard(ctx, artboard, selection.layerIds)
    }

    // Transform handles (in document space, outside artboard clip)
    if (activeTool === 'select' && selection.layerIds.length > 0) {
      renderTransformHandles(ctx, document, selection.layerIds, viewport.zoom)
    }

    // Snap lines
    if (activeSnapLines) {
      renderSnapLines(ctx, activeSnapLines, viewport.zoom)
    }

    // Node tool rendering
    if (activeTool === 'node' && selection.layerIds.length === 1) {
      renderNodeToolOverlay(ctx, document, selection.layerIds[0]!, viewport.zoom)
    }

    // Marquee selection rectangle
    if (marquee.current) {
      const m = marquee.current
      const mx = Math.min(m.startX, m.endX)
      const my = Math.min(m.startY, m.endY)
      const mw = Math.abs(m.endX - m.startX)
      const mh = Math.abs(m.endY - m.startY)
      ctx.fillStyle = 'rgba(74, 125, 255, 0.1)'
      ctx.fillRect(mx, my, mw, mh)
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = 1 / viewport.zoom
      ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
      ctx.strokeRect(mx, my, mw, mh)
      ctx.setLineDash([])
    }

    // Measure tool line
    if (measureLine.current) {
      const ml = measureLine.current
      ctx.strokeStyle = '#ff4444'
      ctx.lineWidth = 1.5 / viewport.zoom
      ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom])
      ctx.beginPath()
      ctx.moveTo(ml.startX, ml.startY)
      ctx.lineTo(ml.endX, ml.endY)
      ctx.stroke()
      ctx.setLineDash([])

      // Distance label
      const dx = ml.endX - ml.startX
      const dy = ml.endY - ml.startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * 180 / Math.PI
      const midX = (ml.startX + ml.endX) / 2
      const midY = (ml.startY + ml.endY) / 2
      ctx.save()
      ctx.translate(midX, midY)
      ctx.scale(1 / viewport.zoom, 1 / viewport.zoom)
      ctx.fillStyle = '#ff4444'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`${dist.toFixed(1)}px  ${angle.toFixed(1)}°`, 0, -8)
      ctx.fillText(`dx:${dx.toFixed(0)} dy:${dy.toFixed(0)}`, 0, 6)
      ctx.restore()
    }

    // Pen tool preview
    if (activeTool === 'pen') {
      renderPenPreview(ctx)
    }

    // Text editing overlay (cursor, selection)
    if (getTextEditState().active) {
      const textState = getTextEditState()
      const artboard = document.artboards.find(a => a.id === textState.artboardId)
      if (artboard) {
        renderTextEditOverlay(ctx, artboard.x, artboard.y, viewport.zoom)
      }
    }

    ctx.restore()

    // ── Guides, grid, rulers (screen space) ──
    const artboard0 = document.artboards[0]
    if (artboard0) {
      const rulerParams = {
        ctx,
        canvasWidth: rect.width,
        canvasHeight: rect.height,
        panX: viewport.panX,
        panY: viewport.panY,
        zoom: viewport.zoom,
        mouseDocX: mouseDocPos.current.x,
        mouseDocY: mouseDocPos.current.y,
        artboardX: artboard0.x,
        artboardY: artboard0.y,
        artboardW: artboard0.width,
        artboardH: artboard0.height,
        guides: artboard0.guides,
        showGrid,
        gridSize,
      }

      renderGuides(rulerParams)
      renderGrid(rulerParams)
      if (showRulers) renderRulers(rulerParams)
    }

    // HUD
    ctx.fillStyle = '#888'
    ctx.font = '12px monospace'
    ctx.fillText(`${Math.round(viewport.zoom * 100)}%`, showRulers ? RULER_SIZE + 4 : 8, rect.height - 8)

    const toolLabel = activeTool.toUpperCase()
    ctx.fillText(toolLabel, rect.width - ctx.measureText(toolLabel).width - 8, rect.height - 8)

    // Eyedropper loupe
    if (activeTool === 'eyedropper' && eyedropperHover.current && canvasRef.current) {
      renderLoupe(ctx, canvasRef.current, eyedropperHover.current.x, eyedropperHover.current.y)
    }
  }, [viewport, document, activeTool, selection, showRulers, showGrid, gridSize, activeSnapLines])

  useEffect(() => {
    render()
  }, [render])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => render())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [render])

  // Set up text edit render callback
  useEffect(() => {
    setTextEditRenderCallback(render)
    return () => setTextEditRenderCallback(() => {})
  }, [render])

  // Global keyboard listener for pen/node/text tools
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Text editing takes priority
      if (getTextEditState().active) {
        if (textEditKeyDown(e)) return
      }
      if (activeTool === 'pen') {
        penKeyDown(e)
      }
      if (activeTool === 'node' && (e.key === 'Delete' || e.key === 'Backspace')) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        deleteSelectedNodes()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTool])

  // Space key for temporary hand tool panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !spaceHeld.current) {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
        e.preventDefault()
        spaceHeld.current = true
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab'
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        spaceHeld.current = false
        if (isPanning.current) {
          isPanning.current = false
        }
        if (canvasRef.current) canvasRef.current.style.cursor = ''
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Drag-and-drop image import
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      const files = e.dataTransfer?.files
      if (!files) return
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          await importImageFile(file)
        }
      }
    }

    canvas.addEventListener('dragover', handleDragOver)
    canvas.addEventListener('drop', handleDrop)
    return () => {
      canvas.removeEventListener('dragover', handleDragOver)
      canvas.removeEventListener('drop', handleDrop)
    }
  }, [])

  // Clipboard paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) await importImageFromBlob(blob)
          return
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  // Touch handler attachment — wire pointer events into existing mouse logic
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !touchMode) {
      detachTouchHandler()
      return
    }

    attachTouchHandler(canvas, {
      getCanvasRect: () => canvas.getBoundingClientRect(),
      onPointerDown(x, y, button, shiftKey, pressure, _pointerType) {
        // Create a synthetic event-like object and call handleMouseDown logic
        brushPressure.current = pressure
        const synth = { clientX: x, clientY: y, button, shiftKey, nativeEvent: { clientX: x, clientY: y, button, shiftKey, altKey: false }, preventDefault() {} } as unknown as React.MouseEvent
        handleMouseDown(synth)
      },
      onPointerMove(x, y, shiftKey, pressure, _pointerType) {
        brushPressure.current = pressure
        const synth = { clientX: x, clientY: y, shiftKey, altKey: false, nativeEvent: { clientX: x, clientY: y, shiftKey, altKey: false } } as unknown as React.MouseEvent
        handleMouseMove(synth)
      },
      onPointerUp(_pressure, _pointerType) {
        handleMouseUp()
      },
      onContextMenu(x, y) {
        openCanvasContextMenu(x, y)
      },
    })

    // Apply touch-action CSS
    canvas.style.touchAction = 'none'

    return () => {
      detachTouchHandler()
      if (canvas) canvas.style.touchAction = ''
    }
  }, [touchMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply touch-mode class on mount and when touchMode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.document.documentElement.classList.toggle('touch-mode', touchMode)
    }
  }, [touchMode])

  function getCanvasRect(): DOMRect {
    return canvasRef.current!.getBoundingClientRect()
  }

  function getSelectedLayerBBox() {
    if (selection.layerIds.length === 0) return null
    for (const artboard of document.artboards) {
      for (const layer of artboard.layers) {
        if (selection.layerIds.includes(layer.id)) {
          const bbox = getLayerBBox(layer, artboard)
          if (bbox.minX !== Infinity) return bbox
        }
      }
    }
    return null
  }

  function getSelectedLayerInfo() {
    for (const artboard of document.artboards) {
      for (const layer of artboard.layers) {
        if (selection.layerIds.includes(layer.id)) {
          return { layerId: layer.id, artboardId: artboard.id }
        }
      }
    }
    return null
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = getCanvasRect()

    if (e.ctrlKey || e.metaKey) {
      const delta = -e.deltaY * 0.002
      const newViewport = zoomAtPoint(
        viewport,
        { x: e.clientX, y: e.clientY },
        rect,
        delta,
      )
      setZoom(newViewport.zoom)
      setPan(newViewport.panX, newViewport.panY)
    } else {
      setPan(viewport.panX - e.deltaX, viewport.panY - e.deltaY)
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button === 1) {
      isPanning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      e.preventDefault()
      return
    }

    if (e.button !== 0) return

    // Hand tool or space+drag → start panning
    if (activeTool === 'hand' || spaceHeld.current) {
      isPanning.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing'
      return
    }

    const rect = getCanvasRect()

    // Drag from rulers to create guides
    if (showRulers) {
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const artboard0 = document.artboards[0]
      if (artboard0) {
        if (localY < RULER_SIZE && localX > RULER_SIZE) {
          // Dragging from horizontal ruler → create horizontal guide
          const docY = (localY - viewport.panY) / viewport.zoom - artboard0.y
          addGuide(artboard0.id, 'horizontal', Math.round(docY))
          return
        }
        if (localX < RULER_SIZE && localY > RULER_SIZE) {
          // Dragging from vertical ruler → create vertical guide
          const docX = (localX - viewport.panX) / viewport.zoom - artboard0.x
          addGuide(artboard0.id, 'vertical', Math.round(docX))
          return
        }
      }
    }

    if (activeTool === 'pen') {
      penMouseDown(e.nativeEvent, rect)
      isDragging.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      render()
      return
    }

    // Shape tools
    if (activeTool === 'rectangle' || activeTool === 'ellipse' || activeTool === 'polygon' || activeTool === 'star') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      // Find which artboard was clicked
      const artboard = document.artboards.find((a) =>
        docPoint.x >= a.x && docPoint.x <= a.x + a.width &&
        docPoint.y >= a.y && docPoint.y <= a.y + a.height,
      ) ?? document.artboards[0]
      if (artboard) {
        beginShapeDrag(docPoint.x, docPoint.y, artboard.id)
        isDragging.current = true
      }
      return
    }

    // Text tool — click to place/edit text
    if (activeTool === 'text') {
      const textState = getTextEditState()
      // If already editing, clicking elsewhere ends editing
      if (textState.active) {
        endTextEdit()
      }
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards.find((a) =>
        docPoint.x >= a.x && docPoint.x <= a.x + a.width &&
        docPoint.y >= a.y && docPoint.y <= a.y + a.height,
      ) ?? document.artboards[0]
      if (artboard) {
        createAndEditText(docPoint.x, docPoint.y, artboard.id)
      }
      return
    }

    // Measure tool
    if (activeTool === 'measure') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      measureLine.current = {
        startX: docPoint.x, startY: docPoint.y,
        endX: docPoint.x, endY: docPoint.y,
      }
      isDragging.current = true
      return
    }

    // Brush tool
    if (activeTool === 'brush') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        brushPoints.current = [{ x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }]
        brushPressure.current = touchMode ? currentPressure : 1
        isDragging.current = true
      }
      return
    }

    // Eyedropper tool
    if (activeTool === 'eyedropper') {
      const canvas = canvasRef.current!
      const { hex, opacity } = sampleColor(canvas, e.clientX, e.clientY)
      applyColorToSelection(hex, opacity, e.shiftKey)
      return
    }

    // Node tool
    if (activeTool === 'node') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      nodeMouseDown(docPoint.x, docPoint.y, viewport.zoom, e.shiftKey)
      isDragging.current = true
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }

    if (activeTool === 'select') {
      const docPoint = screenToDocument(
        { x: e.clientX, y: e.clientY },
        viewport,
        rect,
      )

      // Check transform handles first
      if (selection.layerIds.length > 0) {
        const bbox = getSelectedLayerBBox()
        if (bbox) {
          const handle = hitTestHandles(docPoint, bbox, viewport.zoom)
          if (handle) {
            const info = getSelectedLayerInfo()
            if (info) {
              beginTransform(handle, docPoint, info.layerId, info.artboardId)
              isDragging.current = true
              return
            }
          }
        }
      }

      // Hit test for layer selection
      const hits = spatialIndex.hitTest(docPoint.x, docPoint.y, document)
      if (hits.length > 0) {
        selectLayer(hits[0]!.layer.id, e.shiftKey)
      } else {
        if (!e.shiftKey) deselectAll()
        // Start marquee selection
        marquee.current = {
          startX: docPoint.x,
          startY: docPoint.y,
          endX: docPoint.x,
          endY: docPoint.y,
        }
        isDragging.current = true
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanning.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      setPan(viewport.panX + dx, viewport.panY + dy)
      lastMouse.current = { x: e.clientX, y: e.clientY }
      return
    }

    const rect = getCanvasRect()

    // Track cursor position for ruler markers
    const docPt = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
    mouseDocPos.current = { x: docPt.x, y: docPt.y }
    if (showRulers) render()

    if (activeTool === 'node' && isDragging.current && getNodeState().dragging) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      nodeMouseDrag(docPoint.x, docPoint.y, e.shiftKey)
      return
    }

    // Measure drag
    if (activeTool === 'measure' && isDragging.current && measureLine.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      measureLine.current.endX = docPoint.x
      measureLine.current.endY = docPoint.y
      render()
      return
    }

    // Marquee drag
    if (activeTool === 'select' && isDragging.current && marquee.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      marquee.current.endX = docPoint.x
      marquee.current.endY = docPoint.y
      render()
      return
    }

    if (activeTool === 'select' && isDragging.current && isTransformDragging()) {
      const docPoint = screenToDocument(
        { x: e.clientX, y: e.clientY },
        viewport,
        rect,
      )
      updateTransform(docPoint, e.shiftKey)
      return
    }

    // Shape tool drag
    if (isDragging.current && isShapeDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateShapeDrag(docPoint.x, docPoint.y, e.shiftKey, e.altKey)
      return
    }

    // Brush tool drag
    if (activeTool === 'brush' && isDragging.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        const pt = { x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }
        brushPoints.current.push(pt)
        brushPressure.current = touchMode ? currentPressure : 1
        // Paint incrementally with last two points for smoother strokes
        if (brushPoints.current.length >= 2) {
          const pts = brushPoints.current.slice(-2)
          paintStroke(pts, undefined, brushPressure.current)
          render()
        }
      }
      return
    }

    // Update cursor for select tool handle hover
    if (activeTool === 'select' && !isDragging.current && canvasRef.current) {
      const docPoint = screenToDocument(
        { x: e.clientX, y: e.clientY },
        viewport,
        rect,
      )
      const bbox = getSelectedLayerBBox()
      if (bbox) {
        const handle = hitTestHandles(docPoint, bbox, viewport.zoom)
        canvasRef.current.style.cursor = getHandleCursor(handle)
      } else {
        canvasRef.current.style.cursor = 'default'
      }
    }

    if (activeTool === 'pen') {
      if (isDragging.current) {
        const dx = e.clientX - lastMouse.current.x
        const dy = e.clientY - lastMouse.current.y
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          penMouseDrag(e.nativeEvent, rect)
          render() // live bezier preview during drag
        }
      } else {
        penMouseMove(e.nativeEvent, rect)
        render() // live preview line/curve during hover
      }
    }

    // Eyedropper hover tracking for loupe
    if (activeTool === 'eyedropper') {
      eyedropperHover.current = { x: e.clientX, y: e.clientY }
      render()
    }
  }

  function handleMouseUp() {
    if (isPanning.current) {
      isPanning.current = false
      if (canvasRef.current) {
        canvasRef.current.style.cursor = (activeTool === 'hand' || spaceHeld.current) ? 'grab' : ''
      }
      return
    }

    if (activeTool === 'node' && getNodeState().dragging) {
      nodeMouseUp()
      isDragging.current = false
      return
    }

    // Finish brush stroke
    if (activeTool === 'brush' && isDragging.current) {
      if (brushPoints.current.length > 0) {
        paintStroke(brushPoints.current, undefined, brushPressure.current)
        render()
      }
      brushPoints.current = []
      isDragging.current = false
      return
    }

    if (activeTool === 'measure' && measureLine.current) {
      isDragging.current = false
      // Keep the measurement line visible until next click
      return
    }

    // Finish marquee selection
    if (activeTool === 'select' && marquee.current) {
      const m = marquee.current
      const mx = Math.min(m.startX, m.endX)
      const my = Math.min(m.startY, m.endY)
      const mw = Math.abs(m.endX - m.startX)
      const mh = Math.abs(m.endY - m.startY)

      // Only select if dragged a meaningful distance
      if (mw > 2 || mh > 2) {
        for (const artboard of document.artboards) {
          for (const layer of artboard.layers) {
            if (!layer.visible || layer.locked) continue
            const bbox = getLayerBBox(layer, artboard)
            if (bbox.minX === Infinity) continue
            // Check bbox intersection with marquee
            if (bbox.maxX >= mx && bbox.minX <= mx + mw &&
                bbox.maxY >= my && bbox.minY <= my + mh) {
              selectLayer(layer.id, true)
            }
          }
        }
      }
      marquee.current = null
      isDragging.current = false
      render()
      return
    }

    if (activeTool === 'select' && isTransformDragging()) {
      endTransform()
      isDragging.current = false
      return
    }

    if (isShapeDragging()) {
      endShapeDrag()
      isDragging.current = false
      return
    }

    if (activeTool === 'pen') {
      penMouseUp()
      isDragging.current = false
      render()
    }
  }

  function handleMouseLeave() {
    // For pen tool, don't end the interaction on mouse leave — use window-level
    // mouseup instead so dragging handles off-canvas still works correctly.
    if (activeTool === 'pen' && isDragging.current) return
    handleMouseUp()
  }

  // Window-level mouseup ensures pen tool drag completes even if mouse leaves canvas
  useEffect(() => {
    const onWindowMouseUp = () => {
      if (activeTool === 'pen' && isDragging.current) {
        penMouseUp()
        isDragging.current = false
        render()
      }
    }
    window.addEventListener('mouseup', onWindowMouseUp)
    return () => window.removeEventListener('mouseup', onWindowMouseUp)
  }, [activeTool, render])

  function handleDoubleClick(e: React.MouseEvent) {
    const rect = getCanvasRect()
    const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)

    // Double-click on a TextLayer → enter editing mode
    if (activeTool === 'select' || activeTool === 'text') {
      for (const artboard of document.artboards) {
        for (const layer of artboard.layers) {
          if (!selection.layerIds.includes(layer.id)) continue
          if (layer.type === 'text') {
            beginTextEdit(layer.id, artboard.id)
            return
          }
        }
      }
    }

    // Node tool double-click
    if (activeTool !== 'node') return

    for (const artboard of document.artboards) {
      for (const layer of artboard.layers) {
        if (!selection.layerIds.includes(layer.id) || layer.type !== 'vector') continue

        // Check if double-clicking an existing node → toggle smooth/corner
        const nodeHit = hitTestNode(docPoint.x, docPoint.y, layer, artboard.x, artboard.y, viewport.zoom)
        if (nodeHit) {
          toggleNodeSmooth(nodeHit.pathId, nodeHit.segIndex)
          return
        }

        // Check if double-clicking a segment edge → insert point
        const edgeHit = hitTestSegmentEdge(docPoint.x, docPoint.y, layer, artboard.x, artboard.y, viewport.zoom)
        if (edgeHit) {
          insertPointOnSegment(edgeHit.pathId, edgeHit.segIndex)
          return
        }
      }
    }
  }

  const cursor = isPanning.current
    ? 'grabbing'
    : activeTool === 'hand'
      ? 'grab'
      : activeTool === 'pen' || activeTool === 'node' || activeTool === 'measure'
        ? 'crosshair'
        : activeTool === 'eyedropper'
          ? 'crosshair'
          : activeTool === 'select'
            ? undefined
            : 'default'

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', cursor: cursor ?? undefined, touchAction: touchMode ? 'none' : undefined }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); openCanvasContextMenu(e.clientX, e.clientY) }}
    />
  )
}

// ─── Layer rendering ──────────────────────────────────────────

function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
) {
  if (!layer.visible) return

  ctx.save()
  ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode)
  ctx.globalAlpha = layer.opacity

  switch (layer.type) {
    case 'vector':
      renderVectorLayer(ctx, layer)
      break
    case 'raster':
      renderRasterLayer(ctx, layer)
      break
    case 'group':
      renderGroupLayer(ctx, layer)
      break
    case 'text':
      renderTextLayer(ctx, layer)
      break
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

function applyTransform(ctx: CanvasRenderingContext2D, t: { x: number; y: number; scaleX: number; scaleY: number; rotation: number; skewX?: number; skewY?: number }) {
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
  if (t.skewX || t.skewY) {
    const sx = Math.tan((t.skewX ?? 0) * Math.PI / 180)
    const sy = Math.tan((t.skewY ?? 0) * Math.PI / 180)
    ctx.transform(1, sy, sx, 1, 0, 0)
  }
}

function renderTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer) {
  ctx.save()
  applyTransform(ctx, layer.transform)

  const style = layer.fontStyle === 'italic' ? 'italic ' : ''
  const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
  ctx.font = `${style}${weight}${layer.fontSize}px ${layer.fontFamily}`
  ctx.fillStyle = layer.color
  ctx.textBaseline = 'top'
  ctx.textAlign = layer.textAlign ?? 'left'

  const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
  const letterSp = layer.letterSpacing ?? 0
  const lines = layer.text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const y = i * lineH
    if (letterSp === 0) {
      ctx.fillText(lines[i]!, 0, y)
    } else {
      // Manual letter spacing
      let x = 0
      for (const ch of lines[i]!) {
        ctx.fillText(ch, x, y)
        x += ctx.measureText(ch).width + letterSp
      }
    }
  }
  ctx.restore()
}

function renderVectorLayer(ctx: CanvasRenderingContext2D, layer: VectorLayer) {
  ctx.save()
  applyTransform(ctx, layer.transform)

  // Compute bounding box for gradient sizing
  let bboxW = 100, bboxH = 100
  if (layer.fill?.type === 'gradient' && layer.fill.gradient) {
    // Approximate bbox from paths
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of layer.paths) {
      for (const seg of p.segments) {
        if ('x' in seg) {
          if (seg.x < minX) minX = seg.x
          if (seg.x > maxX) maxX = seg.x
          if (seg.y < minY) minY = seg.y
          if (seg.y > maxY) maxY = seg.y
        }
      }
    }
    if (minX !== Infinity) {
      bboxW = maxX - minX || 100
      bboxH = maxY - minY || 100
    }
  }

  for (const path of layer.paths) {
    const path2d = segmentsToPath2D(path.segments)
    const fillRule = path.fillRule ?? 'nonzero'

    if (layer.fill) {
      ctx.globalAlpha = layer.opacity * layer.fill.opacity
      const fillColor = layer.fill.type === 'solid' && layer.fill.color
        ? resolveColor(layer.fill.color) : null
      if (fillColor) {
        ctx.fillStyle = fillColor
        ctx.fill(path2d, fillRule)
      } else if (layer.fill.type === 'gradient' && layer.fill.gradient) {
        const grad = layer.fill.gradient
        if (grad.type === 'box') {
          const boxCanvas = renderBoxGradient(ctx, grad, bboxW, bboxH)
          ctx.save()
          ctx.clip(path2d, fillRule)
          ctx.drawImage(boxCanvas, 0, 0)
          ctx.restore()
        } else {
          const canvasGrad = createCanvasGradient(ctx, grad, bboxW, bboxH)
          if (canvasGrad) {
            ctx.fillStyle = canvasGrad
            ctx.fill(path2d, fillRule)
          }
        }
      }
    }

    if (layer.stroke) {
      const pos = layer.stroke.position ?? 'center'
      ctx.strokeStyle = resolveColor(layer.stroke.color)
      ctx.lineCap = layer.stroke.linecap
      ctx.lineJoin = layer.stroke.linejoin
      ctx.globalAlpha = layer.opacity * layer.stroke.opacity
      if (layer.stroke.dasharray) {
        ctx.setLineDash(layer.stroke.dasharray)
      }

      if (pos === 'inside') {
        ctx.save()
        ctx.clip(path2d)
        ctx.lineWidth = layer.stroke.width * 2
        ctx.stroke(path2d)
        ctx.restore()
      } else if (pos === 'outside') {
        ctx.save()
        // Create an inverted clip: fill the whole canvas, then cut out the path
        ctx.beginPath()
        ctx.rect(-1e5, -1e5, 2e5, 2e5)
        // Add path in reverse winding to create hole
        const region = new Path2D()
        region.addPath(path2d)
        region.rect(-1e5, -1e5, 2e5, 2e5)
        ctx.clip(region, 'evenodd')
        ctx.lineWidth = layer.stroke.width * 2
        ctx.stroke(path2d)
        ctx.restore()
      } else {
        ctx.lineWidth = layer.stroke.width
        ctx.stroke(path2d)
      }
      ctx.setLineDash([])
    }

    // Additional fills (rendered on top of primary)
    if (layer.additionalFills) {
      for (const addFill of layer.additionalFills) {
        ctx.globalAlpha = layer.opacity * addFill.opacity
        if (addFill.type === 'solid' && addFill.color) {
          ctx.fillStyle = resolveColor(addFill.color)
          ctx.fill(path2d, fillRule)
        }
      }
    }

    // Additional strokes
    if (layer.additionalStrokes) {
      for (const addStroke of layer.additionalStrokes) {
        ctx.strokeStyle = resolveColor(addStroke.color)
        ctx.lineWidth = addStroke.width
        ctx.lineCap = addStroke.linecap
        ctx.lineJoin = addStroke.linejoin
        ctx.globalAlpha = layer.opacity * addStroke.opacity
        if (addStroke.dasharray) ctx.setLineDash(addStroke.dasharray)
        ctx.stroke(path2d)
        ctx.setLineDash([])
      }
    }
  }

  ctx.restore()
}

function renderRasterLayer(ctx: CanvasRenderingContext2D, layer: RasterLayer) {
  const rasterCanvas = getRasterCanvas(layer.imageChunkId)
  if (!rasterCanvas) return

  ctx.save()
  applyTransform(ctx, layer.transform)

  ctx.drawImage(rasterCanvas, 0, 0)
  ctx.restore()
}

function renderGroupLayer(ctx: CanvasRenderingContext2D, group: GroupLayer) {
  // Render group children with the group's composite settings
  for (const child of group.children) {
    renderLayer(ctx, child)
  }
}

function renderLayerWithEffects(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  artboardWidth: number,
  artboardHeight: number,
) {
  if (!layer.visible) return
  if (layer.type === 'adjustment') return // handled separately

  if (hasActiveEffects(layer.effects)) {
    const temp = new OffscreenCanvas(artboardWidth, artboardHeight)
    const tempCtx = temp.getContext('2d')!
    renderLayerContent(tempCtx, layer)
    const result = applyEffects(temp, layer.effects)

    ctx.save()
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode)
    ctx.globalAlpha = layer.opacity
    const dx = (result.width - artboardWidth) / 2
    const dy = (result.height - artboardHeight) / 2
    ctx.drawImage(result, -dx, -dy)
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  } else if (layer.mask && layer.mask.type === 'vector') {
    // Render with vector mask (clip path)
    ctx.save()
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode)
    ctx.globalAlpha = layer.opacity

    const maskT = layer.mask.transform
    ctx.translate(maskT.x, maskT.y)
    ctx.scale(maskT.scaleX, maskT.scaleY)
    if (maskT.rotation) ctx.rotate((maskT.rotation * Math.PI) / 180)
    for (const path of layer.mask.paths) {
      ctx.clip(segmentsToPath2D(path.segments))
    }
    // Reset transform for the layer itself (mask transform was only for clipping)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // We need to re-derive the context state — simpler to use temp canvas
    ctx.restore()
    // Fallback: render to temp with clip
    const temp = new OffscreenCanvas(artboardWidth, artboardHeight)
    const tempCtx = temp.getContext('2d')!
    // Set up clip on temp
    tempCtx.save()
    tempCtx.translate(maskT.x, maskT.y)
    tempCtx.scale(maskT.scaleX, maskT.scaleY)
    if (maskT.rotation) tempCtx.rotate((maskT.rotation * Math.PI) / 180)
    for (const path of layer.mask.paths) {
      tempCtx.clip(segmentsToPath2D(path.segments))
    }
    tempCtx.restore()
    // Render layer content within clip
    renderLayerContent(tempCtx, layer)
    // Draw masked result
    ctx.save()
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode)
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(temp, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  } else {
    renderLayer(ctx, layer)
  }
}

/** Render layer content without blend mode / opacity wrapper (for effects pipeline). */
function renderLayerContent(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, layer: Layer) {
  switch (layer.type) {
    case 'vector':
      renderVectorLayer(ctx as CanvasRenderingContext2D, layer)
      break
    case 'raster':
      renderRasterLayer(ctx as CanvasRenderingContext2D, layer)
      break
    case 'group':
      for (const child of layer.children) {
        if (child.visible) renderLayerContent(ctx, child)
      }
      break
    case 'text':
      renderTextLayer(ctx as CanvasRenderingContext2D, layer)
      break
  }
}

// ─── Artboard rendering ──────────────────────────────────────

let checkerboardPattern: CanvasPattern | null = null
function getCheckerboardPattern(ctx: CanvasRenderingContext2D): CanvasPattern {
  if (checkerboardPattern) return checkerboardPattern
  const size = 8
  const off = new OffscreenCanvas(size * 2, size * 2)
  const oc = off.getContext('2d')!
  oc.fillStyle = '#ffffff'
  oc.fillRect(0, 0, size * 2, size * 2)
  oc.fillStyle = '#e0e0e0'
  oc.fillRect(0, 0, size, size)
  oc.fillRect(size, size, size, size)
  checkerboardPattern = ctx.createPattern(off, 'repeat')!
  return checkerboardPattern
}

function renderArtboard(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  selectedLayerIds: string[],
) {
  // Transparency checkerboard behind artboard
  ctx.save()
  ctx.fillStyle = getCheckerboardPattern(ctx)
  ctx.fillRect(artboard.x, artboard.y, artboard.width, artboard.height)
  ctx.restore()

  // Artboard background
  ctx.fillStyle = artboard.backgroundColor
  ctx.fillRect(artboard.x, artboard.y, artboard.width, artboard.height)

  // Artboard border
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 1
  ctx.strokeRect(artboard.x, artboard.y, artboard.width, artboard.height)

  // Artboard label
  ctx.fillStyle = '#888'
  ctx.font = '14px sans-serif'
  ctx.fillText(artboard.name, artboard.x, artboard.y - 8)

  // Check if any adjustment layers present
  const hasAdjustments = artboard.layers.some((l) => l.type === 'adjustment' && l.visible)

  if (hasAdjustments) {
    renderArtboardWithAdjustments(ctx, artboard, selectedLayerIds)
  } else {
    renderArtboardDirect(ctx, artboard, selectedLayerIds)
  }
}

function renderArtboardDirect(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  selectedLayerIds: string[],
) {
  ctx.save()
  ctx.translate(artboard.x, artboard.y)
  ctx.beginPath()
  ctx.rect(0, 0, artboard.width, artboard.height)
  ctx.clip()

  for (const layer of artboard.layers) {
    renderLayerWithEffects(ctx, layer, artboard.width, artboard.height)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  for (const layer of artboard.layers) {
    if (!selectedLayerIds.includes(layer.id)) continue
    if (layer.type === 'vector') renderSelectionOutline(ctx, layer)
  }

  ctx.restore()
}

function renderArtboardWithAdjustments(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  selectedLayerIds: string[],
) {
  // Render to offscreen canvas so we can apply pixel-level adjustments
  const offscreen = new OffscreenCanvas(artboard.width, artboard.height)
  const offCtx = offscreen.getContext('2d')!

  offCtx.fillStyle = artboard.backgroundColor
  offCtx.fillRect(0, 0, artboard.width, artboard.height)

  for (const layer of artboard.layers) {
    if (!layer.visible) continue

    if (layer.type === 'adjustment') {
      // Apply adjustment to current pixel state
      const imageData = offCtx.getImageData(0, 0, artboard.width, artboard.height)
      applyAdjustment(imageData, layer as AdjustmentLayer)
      offCtx.putImageData(imageData, 0, 0)
    } else {
      // Render layer using the offscreen context (cast is safe — same drawing API)
      renderLayerWithEffects(
        offCtx as unknown as CanvasRenderingContext2D,
        layer,
        artboard.width,
        artboard.height,
      )
    }
  }

  // Draw the composited result onto the main canvas
  ctx.drawImage(offscreen, artboard.x, artboard.y)

  // Selection outlines on main canvas (not affected by adjustments)
  ctx.save()
  ctx.translate(artboard.x, artboard.y)
  ctx.beginPath()
  ctx.rect(0, 0, artboard.width, artboard.height)
  ctx.clip()

  for (const layer of artboard.layers) {
    if (!selectedLayerIds.includes(layer.id)) continue
    if (layer.type === 'vector') renderSelectionOutline(ctx, layer)
  }

  ctx.restore()
}

// ─── Selection outline ────────────────────────────────────────

function renderSelectionOutline(ctx: CanvasRenderingContext2D, layer: VectorLayer) {
  ctx.save()
  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  const zoom = useEditorStore.getState().viewport.zoom
  ctx.strokeStyle = '#4a7dff'
  ctx.lineWidth = 1.5 / zoom
  ctx.setLineDash([])

  for (const path of layer.paths) {
    const path2d = segmentsToPath2D(path.segments)
    ctx.stroke(path2d)
  }

  const pointRadius = 3.5 / zoom
  for (const path of layer.paths) {
    for (const seg of path.segments) {
      if (seg.type !== 'close' && 'x' in seg) {
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#4a7dff'
        ctx.lineWidth = 1.5 / zoom
        ctx.beginPath()
        ctx.arc(seg.x, seg.y, pointRadius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  ctx.restore()
}

// ─── Transform handles ────────────────────────────────────────

function renderTransformHandles(
  ctx: CanvasRenderingContext2D,
  doc: { artboards: Artboard[] },
  selectedLayerIds: string[],
  zoom: number,
) {
  for (const artboard of doc.artboards) {
    for (const layer of artboard.layers) {
      if (!selectedLayerIds.includes(layer.id)) continue

      const bbox = getLayerBBox(layer, artboard)
      if (bbox.minX === Infinity) continue

      const handleSize = 6 / zoom
      const lineWidth = 1 / zoom

      // Dashed bbox
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = lineWidth
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
      ctx.setLineDash([])

      const handles = getHandlePositions(bbox, zoom)

      // Rotation handle stem
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(handles.n.x, handles.n.y)
      ctx.lineTo(handles.rotation.x, handles.rotation.y)
      ctx.stroke()

      // Rotation handle (circle)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.arc(handles.rotation.x, handles.rotation.y, handleSize * 0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // 8 resize handles (squares)
      const resizeHandles: (keyof typeof handles)[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
      for (const key of resizeHandles) {
        const h = handles[key]
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = '#4a7dff'
        ctx.lineWidth = lineWidth
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize)
        ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize)
      }
    }
  }
}

// ─── Pen preview ──────────────────────────────────────────────

function renderPenPreview(ctx: CanvasRenderingContext2D) {
  const pen = getPenState()
  const preview = getPenPreviewState()
  if (!pen.isDrawing || pen.currentPath.length === 0) return

  const artboard = useEditorStore.getState().document.artboards.find(
    (a) => a.id === pen.artboardId,
  )
  if (!artboard) return

  const zoom = useEditorStore.getState().viewport.zoom

  ctx.save()
  ctx.translate(artboard.x, artboard.y)

  const pointRadius = 4 / zoom
  const lineWidth = 1 / zoom

  // Draw the actual path strokes between placed nodes (always fresh from penState)
  if (pen.currentPath.length >= 2) {
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2 / zoom
    ctx.setLineDash([])
    ctx.beginPath()
    for (const seg of pen.currentPath) {
      if (seg.type === 'move') {
        ctx.moveTo(seg.x, seg.y)
      } else if (seg.type === 'line') {
        ctx.lineTo(seg.x, seg.y)
      } else if (seg.type === 'cubic') {
        ctx.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y)
      } else if (seg.type === 'close') {
        ctx.closePath()
      }
    }
    ctx.stroke()
  }

  // Draw anchor points for all placed segments
  for (const seg of pen.currentPath) {
    if (seg.type !== 'close' && 'x' in seg) {
      ctx.fillStyle = '#4a9eff'
      ctx.beginPath()
      ctx.arc(seg.x, seg.y, pointRadius, 0, Math.PI * 2)
      ctx.fill()

      if (seg.type === 'cubic') {
        drawHandle(ctx, seg.x, seg.y, seg.cp2x, seg.cp2y, pointRadius)
      }
    }
  }

  // ── Live bezier preview during drag ──
  if (preview.isDragging && preview.dragHandle && preview.lastPoint) {
    const lp = preview.lastPoint
    const dh = preview.dragHandle

    // Mirror handle: symmetric reflection of dragHandle about lastPoint
    const mirrorHandle = {
      x: 2 * lp.x - dh.x,
      y: 2 * lp.y - dh.y,
    }

    // Draw handle lines (dashed, from anchor to both handles)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = lineWidth
    ctx.setLineDash([4 / zoom, 3 / zoom])

    // Line from anchor to drag handle (outgoing direction)
    ctx.beginPath()
    ctx.moveTo(lp.x, lp.y)
    ctx.lineTo(dh.x, dh.y)
    ctx.stroke()

    // Line from anchor to mirror handle (incoming direction)
    ctx.beginPath()
    ctx.moveTo(lp.x, lp.y)
    ctx.lineTo(mirrorHandle.x, mirrorHandle.y)
    ctx.stroke()

    ctx.setLineDash([])

    // Draw handle circles (hollow, white fill with dark border)
    const handleRadius = pointRadius * 0.7
    for (const hp of [dh, mirrorHandle]) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#333'
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.arc(hp.x, hp.y, handleRadius, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  // ── Hover preview (line or curve from lastPoint to mouse position) ──
  if (!preview.isDragging && preview.previewPoint && preview.lastPoint) {
    const lp = preview.lastPoint
    const pp = preview.previewPoint

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)' // #4a9eff at 60%
    ctx.lineWidth = lineWidth
    ctx.setLineDash([6 / zoom, 4 / zoom])

    ctx.beginPath()
    ctx.moveTo(lp.x, lp.y)

    if (preview.lastHandle) {
      // Previous point had a handle — draw cubic preview
      // cp1 = the outgoing handle (the drag direction itself)
      ctx.bezierCurveTo(
        preview.lastHandle.x, preview.lastHandle.y,
        pp.x, pp.y,
        pp.x, pp.y,
      )
    } else {
      // No previous handle — straight line preview
      ctx.lineTo(pp.x, pp.y)
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.restore()
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  hx: number, hy: number,
  radius: number,
) {
  ctx.strokeStyle = '#4a7dff88'
  ctx.lineWidth = 1 / useEditorStore.getState().viewport.zoom
  ctx.beginPath()
  ctx.moveTo(px, py)
  ctx.lineTo(hx, hy)
  ctx.stroke()

  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#4a7dff'
  ctx.beginPath()
  ctx.arc(hx, hy, radius * 0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

// ─── Node tool overlay ───────────────────────────────────────

function renderNodeToolOverlay(
  ctx: CanvasRenderingContext2D,
  doc: { artboards: Artboard[] },
  selectedLayerId: string,
  zoom: number,
) {
  const nodeState = getNodeState()

  for (const artboard of doc.artboards) {
    const layer = artboard.layers.find(l => l.id === selectedLayerId)
    if (!layer || layer.type !== 'vector') continue

    ctx.save()
    ctx.translate(artboard.x + layer.transform.x, artboard.y + layer.transform.y)
    ctx.scale(layer.transform.scaleX, layer.transform.scaleY)
    if (layer.transform.rotation) ctx.rotate((layer.transform.rotation * Math.PI) / 180)

    const anchorSize = 3.5 / zoom
    const handleRadius = 2.5 / zoom
    const lineWidth = 1 / zoom

    for (const path of layer.paths) {
      // Draw the path outline
      const path2d = segmentsToPath2D(path.segments)
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = lineWidth
      ctx.stroke(path2d)

      for (let i = 0; i < path.segments.length; i++) {
        const seg = path.segments[i]!
        if (seg.type === 'close') continue
        if (!('x' in seg)) continue

        const key = `${path.id}:${i}`
        const isSelected = nodeState.selectedNodes.has(key)

        // Draw control handles for selected nodes
        if (isSelected) {
          if (seg.type === 'cubic') {
            // cp1 handle line + circle
            ctx.strokeStyle = '#4a7dff88'
            ctx.lineWidth = lineWidth
            ctx.beginPath()
            // cp1 is the incoming handle — draw from previous point
            ctx.moveTo(seg.x, seg.y)
            ctx.lineTo(seg.cp2x, seg.cp2y)
            ctx.stroke()

            ctx.fillStyle = '#fff'
            ctx.strokeStyle = '#4a7dff'
            ctx.lineWidth = lineWidth
            ctx.beginPath()
            ctx.arc(seg.cp2x, seg.cp2y, handleRadius, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()

            // Also draw cp1
            let prevX = 0, prevY = 0
            for (let j = i - 1; j >= 0; j--) {
              const prev = path.segments[j]!
              if (prev.type !== 'close') { prevX = prev.x; prevY = prev.y; break }
            }
            ctx.strokeStyle = '#4a7dff88'
            ctx.beginPath()
            ctx.moveTo(prevX, prevY)
            ctx.lineTo(seg.cp1x, seg.cp1y)
            ctx.stroke()

            ctx.fillStyle = '#fff'
            ctx.strokeStyle = '#4a7dff'
            ctx.beginPath()
            ctx.arc(seg.cp1x, seg.cp1y, handleRadius, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          } else if (seg.type === 'quadratic') {
            ctx.strokeStyle = '#4a7dff88'
            ctx.lineWidth = lineWidth
            ctx.beginPath()
            ctx.moveTo(seg.x, seg.y)
            ctx.lineTo(seg.cpx, seg.cpy)
            ctx.stroke()

            ctx.fillStyle = '#fff'
            ctx.strokeStyle = '#4a7dff'
            ctx.beginPath()
            ctx.arc(seg.cpx, seg.cpy, handleRadius, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
          }
        }

        // Draw anchor point (square for anchors)
        ctx.fillStyle = isSelected ? '#4a7dff' : '#fff'
        ctx.strokeStyle = isSelected ? '#fff' : '#4a7dff'
        ctx.lineWidth = lineWidth
        ctx.fillRect(seg.x - anchorSize, seg.y - anchorSize, anchorSize * 2, anchorSize * 2)
        ctx.strokeRect(seg.x - anchorSize, seg.y - anchorSize, anchorSize * 2, anchorSize * 2)
      }
    }

    ctx.restore()
  }
}
