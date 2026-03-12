import { useRef, useEffect, useCallback } from 'react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import { getAnimationOverrides } from '@/animation/animator'
import { zoomAtPoint, screenToDocument } from '@/math/viewport'
import { segmentsToPath2D } from '@/math/path'
import { spatialIndex } from '@/math/hit-test'
import { getLayerBBox } from '@/math/bbox'
import { getRasterCanvas } from '@/store/raster-data'
import { applyEffects, hasActiveEffects } from '@/effects/render-effects'
import { applyAdjustment } from '@/effects/adjustments'
import { createCanvasGradient, renderBoxGradient } from '@/render/gradient'
import { renderMeshGradient } from '@/render/mesh-gradient'
import { createNoisePattern } from '@/render/noise-fill'
import { renderVariableStroke } from '@/render/variable-stroke'
import { renderWiggleStroke } from '@/render/wiggle-stroke'
import { warpPaths } from '@/render/envelope-distort'
import { render3DLayer } from '@/render/extrude-3d'
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
import { openFileAsDocument } from '@/io/open-file'
import { beginShapeDrag, updateShapeDrag, endShapeDrag, isShapeDragging } from '@/tools/shapes'
import {
  getNodeState,
  nodeMouseDown,
  nodeMouseDrag,
  nodeMouseUp,
  deleteSelectedNodes,
  hitTestSegmentEdge,
  insertPointOnSegment,
  toggleNodeSmooth,
  hitTestNode,
} from '@/tools/node'
import { sampleColor, applyColorToSelection, renderLoupe } from '@/tools/eyedropper'
import {
  getTextEditState,
  beginTextEdit,
  endTextEdit,
  createAndEditText,
  createAreaText,
  textEditKeyDown,
  renderTextEditOverlay,
  setTextEditRenderCallback,
} from '@/tools/text-edit'
import { renderRulers, renderGuides, renderGrid, RULER_SIZE } from '@/render/rulers'
import { renderPerspectiveGrid, hitTestVanishingPoint } from '@/render/perspective-grid'
import { renderSnapLines } from '@/tools/snap'
import { openCanvasContextMenu } from '@/ui/context-menu'
import { attachTouchHandler, detachTouchHandler, currentPressure } from '@/tools/touch-handler'
import { paintStroke, beginStroke, endStroke, getBrushSettings } from '@/tools/brush'
import { beginLineDrag, updateLineDrag, endLineDrag, isLineDragging } from '@/tools/line'
import { beginPencilStroke, updatePencilStroke, endPencilStroke, isPencilDrawing } from '@/tools/pencil'
import { beginEraserStroke, paintEraser, endEraserStroke, getEraserSettings } from '@/tools/eraser'
import { beginGradientDrag, updateGradientDrag, endGradientDrag, isGradientDragging } from '@/tools/gradient-tool'
import { applyFillBucket } from '@/tools/fill-bucket'
import { zoomToolClick, beginZoomDrag, updateZoomDrag, endZoomDrag, isZoomDragging } from '@/tools/zoom-tool'
import { beginLasso, updateLasso, endLasso, getLassoPoints, isLassoActive } from '@/tools/lasso'
import { beginMarquee, updateMarquee, endMarquee, getMarqueeRect, isMarqueeActive } from '@/tools/marquee-tool'
import { beginKnifeCut, updateKnifeCut, endKnifeCut, getKnifePoints, isKnifeCutting } from '@/tools/knife'
import {
  beginArtboardDrag,
  updateArtboardDrag,
  endArtboardDrag,
  isArtboardDragging,
  getArtboardDragRect,
} from '@/tools/artboard-tool'
import { beginSliceDrag, updateSliceDrag, endSliceDrag, getSliceDragRect, isSliceDragging } from '@/tools/slice-tool'
import {
  initShapeBuilder,
  isShapeBuilderActive,
  shapeBuilderHover,
  shapeBuilderMouseDown,
  shapeBuilderMouseDrag,
  shapeBuilderMouseUp,
  finalizeShapeBuilder,
  cancelShapeBuilder,
  renderShapeBuilderOverlay,
} from '@/tools/shape-builder'
import {
  setCloneSource,
  beginCloneStamp,
  paintCloneStamp,
  endCloneStamp,
  isCloneStamping,
  hasCloneSource,
  getCloneSource,
  getCloneStampSettings,
} from '@/tools/clone-stamp'
import { curvaturePenMouseDown, curvaturePenMouseMove, curvaturePenKeyDown } from '@/tools/curvature-pen'
import { spiralMouseDown, spiralMouseDrag, spiralMouseUp, isSpiralDragging } from '@/tools/spiral'
import { widthToolMouseDown, widthToolMouseDrag, widthToolMouseUp, isWidthToolDragging } from '@/tools/width-tool'
import type {
  VectorLayer,
  RasterLayer,
  GroupLayer,
  AdjustmentLayer,
  TextLayer,
  Layer,
  Artboard,
  SymbolInstanceLayer,
  SymbolDefinition,
  DesignDocument,
  Fill,
  Interaction,
} from '@/types'

/** Resolve `currentColor` keyword to a concrete color. Default fallback is black. */
let _currentColor = '#000000'
export function setCurrentColor(color: string) {
  _currentColor = color
}
function resolveColor(color: string): string {
  return color === 'currentColor' ? _currentColor : color
}

// ─── Breakpoint helpers ────────────────────────────────────────

/** Get the effective rendering width for an artboard, considering active breakpoint. */
function getEffectiveWidth(artboard: Artboard): number {
  if (!artboard.activeBreakpointId || !artboard.breakpoints) return artboard.width
  const bp = artboard.breakpoints.find((b) => b.id === artboard.activeBreakpointId)
  return bp ? bp.width : artboard.width
}

/** Apply breakpoint overrides to a layer, returning a shallow-patched copy. */
function applyBreakpointOverrides(layer: Layer, breakpointId: string | undefined): Layer {
  if (!breakpointId || !layer.breakpointOverrides) return layer
  const overrides = layer.breakpointOverrides[breakpointId]
  if (!overrides) return layer

  // Start with a shallow copy
  let patched = { ...layer } as Layer

  if (overrides.visible !== undefined) {
    patched = { ...patched, visible: overrides.visible }
  }

  if (overrides.transform) {
    patched = { ...patched, transform: { ...patched.transform, ...overrides.transform } }
  }

  if (patched.type === 'text') {
    if (overrides.fontSize !== undefined) {
      patched = { ...patched, fontSize: overrides.fontSize } as TextLayer
    }
    if (overrides.textAlign !== undefined) {
      patched = { ...patched, textAlign: overrides.textAlign } as TextLayer
    }
  }

  // Recurse into group children
  if (patched.type === 'group') {
    const group = patched as GroupLayer
    patched = {
      ...group,
      children: group.children.map((child) => applyBreakpointOverrides(child, breakpointId)),
    } as GroupLayer
  }

  return patched
}

/** Get layers with breakpoint overrides applied. */
function getEffectiveLayers(artboard: Artboard): Layer[] {
  const bpId = artboard.activeBreakpointId
  if (!bpId) return artboard.layers
  return artboard.layers.map((layer) => applyBreakpointOverrides(layer, bpId))
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
  const setPan = useEditorStore((s) => s.setPan)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const deselectAll = useEditorStore((s) => s.deselectAll)
  const showRulers = useEditorStore((s) => s.showRulers)
  const showGrid = useEditorStore((s) => s.showGrid)
  const gridSize = useEditorStore((s) => s.gridSize)
  const activeSnapLines = useEditorStore((s) => s.activeSnapLines)
  const addGuide = useEditorStore((s) => s.addGuide)
  const touchMode = useEditorStore((s) => s.touchMode)
  const showInspectOverlay = useEditorStore((s) => s.showInspectOverlay)
  const selectedCommentId = useEditorStore((s) => s.selectedCommentId)
  const prototypeMode = useEditorStore((s) => s.prototypeMode)

  const lastDocId = useRef<string | null>(null)

  // Zoom-to-fit on initial mount and when the document changes (new/open)
  useEffect(() => {
    if (document.id !== lastDocId.current) {
      lastDocId.current = document.id
      // Defer to next frame so canvas has its layout dimensions
      requestAnimationFrame(() => {
        const canvas = canvasRef.current
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          useEditorStore.getState().zoomToFit(rect.width, rect.height)
        }
      })
    }
  }, [document.id])

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
  const brushRafId = useRef(0)
  const eraserPoints = useRef<Array<{ x: number; y: number }>>([])
  const eraserRafId = useRef(0)
  const gradientEnd = useRef<{ x: number; y: number } | null>(null)
  const cloneStampRafId = useRef(0)
  const textDragStart = useRef<{ x: number; y: number; artboardId: string } | null>(null)
  const textDragEnd = useRef<{ x: number; y: number } | null>(null)
  const vpDragState = useRef<{ artboardId: string; vpIndex: number } | null>(null)

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
      renderArtboard(ctx, artboard, selection.layerIds, viewport.zoom)
    }

    // Pixel grid at high zoom
    if (viewport.zoom >= 8) {
      for (const artboard of document.artboards) {
        const ax = artboard.x
        const ay = artboard.y
        const aw = getEffectiveWidth(artboard)
        const ah = artboard.height

        // Calculate visible pixel range in artboard space
        const visLeft = Math.max(0, Math.floor(-viewport.panX / viewport.zoom - ax))
        const visTop = Math.max(0, Math.floor(-viewport.panY / viewport.zoom - ay))
        const visRight = Math.min(aw, Math.ceil((rect.width - viewport.panX) / viewport.zoom - ax))
        const visBottom = Math.min(ah, Math.ceil((rect.height - viewport.panY) / viewport.zoom - ay))

        const hLines = visBottom - visTop
        const vLines = visRight - visLeft
        if (hLines > 0 && vLines > 0 && hLines * vLines < 4000000) {
          ctx.save()
          ctx.strokeStyle = 'rgba(128,128,128,0.15)'
          ctx.lineWidth = 0.5 / viewport.zoom
          ctx.beginPath()
          for (let x = visLeft; x <= visRight; x++) {
            ctx.moveTo(ax + x, ay + visTop)
            ctx.lineTo(ax + x, ay + visBottom)
          }
          for (let y = visTop; y <= visBottom; y++) {
            ctx.moveTo(ax + visLeft, ay + y)
            ctx.lineTo(ax + visRight, ay + y)
          }
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // Perspective grid overlay
    for (const artboard of document.artboards) {
      if (artboard.perspectiveGrid) {
        renderPerspectiveGrid(
          ctx,
          artboard.perspectiveGrid,
          { x: artboard.x, y: artboard.y, width: getEffectiveWidth(artboard), height: artboard.height },
          viewport.zoom,
        )
      }
    }

    // Auto-layout group overlays (in document space)
    if (selection.layerIds.length > 0) {
      for (const artboard of document.artboards) {
        renderAutoLayoutOverlay(ctx, artboard, selection.layerIds, viewport.zoom)
      }
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

    // Text tool drag preview (area text box)
    if (textDragStart.current && textDragEnd.current && isDragging.current && activeTool === 'text') {
      const ts = textDragStart.current
      const te = textDragEnd.current
      const tx = Math.min(ts.x, te.x)
      const ty = Math.min(ts.y, te.y)
      const tw = Math.abs(te.x - ts.x)
      const th = Math.abs(te.y - ts.y)
      if (tw > 2 || th > 2) {
        ctx.fillStyle = 'rgba(74, 125, 255, 0.05)'
        ctx.fillRect(tx, ty, tw, th)
        ctx.strokeStyle = '#4a7dff'
        ctx.lineWidth = 1 / viewport.zoom
        ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
        ctx.strokeRect(tx, ty, tw, th)
        ctx.setLineDash([])
      }
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
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
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

    // Brush cursor (circle outline at mouse position)
    if (activeTool === 'brush') {
      const bs = getBrushSettings()
      const mx = mouseDocPos.current.x
      const my = mouseDocPos.current.y
      const r = bs.size / 2
      ctx.save()
      ctx.lineWidth = 1.5 / viewport.zoom
      // Outer ring (dark) + inner ring (light) for visibility on any background
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 0.75 / viewport.zoom
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      // Crosshair dot at center
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(mx, my, 1.5 / viewport.zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Eraser cursor
    if (activeTool === 'eraser') {
      const es = getEraserSettings()
      const mx = mouseDocPos.current.x
      const my = mouseDocPos.current.y
      const r = es.size / 2
      ctx.save()
      ctx.lineWidth = 1.5 / viewport.zoom
      ctx.strokeStyle = 'rgba(255,100,100,0.6)'
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 0.75 / viewport.zoom
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Clone Stamp cursor
    if (activeTool === 'clone-stamp') {
      const cs = getCloneStampSettings()
      const mx = mouseDocPos.current.x
      const my = mouseDocPos.current.y
      const r = cs.size / 2
      ctx.save()
      // Brush circle outline
      ctx.lineWidth = 1.5 / viewport.zoom
      ctx.strokeStyle = 'rgba(0,200,200,0.6)'
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 0.75 / viewport.zoom
      ctx.beginPath()
      ctx.arc(mx, my, r, 0, Math.PI * 2)
      ctx.stroke()
      // Crosshair dot at center
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(mx, my, 1.5 / viewport.zoom, 0, Math.PI * 2)
      ctx.fill()
      // Draw source crosshair if set
      const source = getCloneSource()
      if (source) {
        const artboard = document.artboards[0]
        if (artboard) {
          const srcDocX = source.x + artboard.x
          const srcDocY = source.y + artboard.y
          const crossSize = 8 / viewport.zoom
          ctx.strokeStyle = 'rgba(0,255,200,0.8)'
          ctx.lineWidth = 1.5 / viewport.zoom
          ctx.beginPath()
          ctx.moveTo(srcDocX - crossSize, srcDocY)
          ctx.lineTo(srcDocX + crossSize, srcDocY)
          ctx.moveTo(srcDocX, srcDocY - crossSize)
          ctx.lineTo(srcDocX, srcDocY + crossSize)
          ctx.stroke()
          // Circle around source crosshair
          ctx.beginPath()
          ctx.arc(srcDocX, srcDocY, crossSize, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.restore()
    }

    // Gradient drag line
    if (activeTool === 'gradient' && gradientEnd.current && isGradientDragging()) {
      ctx.save()
      ctx.strokeStyle = '#ff8800'
      ctx.lineWidth = 1.5 / viewport.zoom
      ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
      ctx.beginPath()
      const ge = gradientEnd.current
      // dragState start is stored internally; use mouseDocPos for the line start estimate
      ctx.moveTo(ge.x, ge.y) // This is approximate
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }

    // Lasso selection path
    if (activeTool === 'lasso' && isLassoActive()) {
      const pts = getLassoPoints()
      if (pts.length > 1) {
        ctx.save()
        ctx.strokeStyle = '#4a7dff'
        ctx.lineWidth = 1 / viewport.zoom
        ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
        ctx.beginPath()
        ctx.moveTo(pts[0]!.x, pts[0]!.y)
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i]!.x, pts[i]!.y)
        }
        ctx.closePath()
        ctx.fillStyle = 'rgba(74, 125, 255, 0.1)'
        ctx.fill()
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // Marquee selection rectangle
    if (activeTool === 'marquee' && isMarqueeActive()) {
      const mr = getMarqueeRect()
      if (mr) {
        ctx.save()
        ctx.fillStyle = 'rgba(74, 125, 255, 0.1)'
        ctx.fillRect(mr.x, mr.y, mr.w, mr.h)
        ctx.strokeStyle = '#4a7dff'
        ctx.lineWidth = 1 / viewport.zoom
        ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
        ctx.strokeRect(mr.x, mr.y, mr.w, mr.h)
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // Knife cut path
    if (activeTool === 'knife' && isKnifeCutting()) {
      const kp = getKnifePoints()
      if (kp.length > 1) {
        ctx.save()
        ctx.strokeStyle = '#ff4444'
        ctx.lineWidth = 1.5 / viewport.zoom
        ctx.setLineDash([2 / viewport.zoom, 2 / viewport.zoom])
        ctx.beginPath()
        ctx.moveTo(kp[0]!.x, kp[0]!.y)
        for (let i = 1; i < kp.length; i++) {
          ctx.lineTo(kp[i]!.x, kp[i]!.y)
        }
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // Shape Builder regions overlay
    if (activeTool === 'shape-builder' && isShapeBuilderActive()) {
      ctx.save()
      renderShapeBuilderOverlay(ctx, viewport.zoom)
      ctx.restore()
    }

    // Artboard creation rect
    if (activeTool === 'artboard' && isArtboardDragging()) {
      const ar = getArtboardDragRect(mouseDocPos.current.x, mouseDocPos.current.y)
      if (ar) {
        ctx.save()
        ctx.strokeStyle = '#00cc88'
        ctx.lineWidth = 1.5 / viewport.zoom
        ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom])
        ctx.strokeRect(ar.x, ar.y, ar.w, ar.h)
        ctx.setLineDash([])
        // Label
        ctx.translate(ar.x, ar.y - 4 / viewport.zoom)
        ctx.scale(1 / viewport.zoom, 1 / viewport.zoom)
        ctx.fillStyle = '#00cc88'
        ctx.font = '11px monospace'
        ctx.fillText(`${Math.round(ar.w)} × ${Math.round(ar.h)}`, 0, 0)
        ctx.restore()
      }
    }

    // Slice creation rect
    if (activeTool === 'slice' && isSliceDragging()) {
      const sr = getSliceDragRect(mouseDocPos.current.x, mouseDocPos.current.y)
      if (sr) {
        ctx.save()
        ctx.fillStyle = 'rgba(255, 165, 0, 0.1)'
        ctx.fillRect(sr.x, sr.y, sr.w, sr.h)
        ctx.strokeStyle = '#ff8800'
        ctx.lineWidth = 1 / viewport.zoom
        ctx.setLineDash([4 / viewport.zoom, 3 / viewport.zoom])
        ctx.strokeRect(sr.x, sr.y, sr.w, sr.h)
        ctx.setLineDash([])
        ctx.restore()
      }
    }

    // Existing slice overlays
    for (const artboard of document.artboards) {
      if (artboard.slices && artboard.slices.length > 0) {
        ctx.save()
        for (const slice of artboard.slices) {
          const sx = artboard.x + slice.x
          const sy = artboard.y + slice.y
          ctx.strokeStyle = 'rgba(255, 165, 0, 0.5)'
          ctx.lineWidth = 0.5 / viewport.zoom
          ctx.strokeRect(sx, sy, slice.width, slice.height)
          // Slice name label
          ctx.save()
          ctx.translate(sx, sy - 2 / viewport.zoom)
          ctx.scale(1 / viewport.zoom, 1 / viewport.zoom)
          ctx.fillStyle = 'rgba(255, 165, 0, 0.7)'
          ctx.font = '9px sans-serif'
          ctx.fillText(slice.name, 0, 0)
          ctx.restore()
        }
        ctx.restore()
      }
    }

    // Comment pins
    const comments = document.comments ?? []
    if (comments.length > 0) {
      for (let i = 0; i < comments.length; i++) {
        const comment = comments[i]!
        const pinR = 8 / viewport.zoom
        const isSelected = selectedCommentId === comment.id

        ctx.save()
        ctx.translate(comment.x, comment.y)

        // Pin circle
        ctx.beginPath()
        ctx.arc(0, 0, pinR, 0, Math.PI * 2)
        ctx.fillStyle = comment.resolved ? '#4caf50' : '#ffc107'
        ctx.fill()
        if (isSelected) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2 / viewport.zoom
          ctx.stroke()
        } else {
          ctx.strokeStyle = 'rgba(0,0,0,0.4)'
          ctx.lineWidth = 1 / viewport.zoom
          ctx.stroke()
        }

        // Pin number
        ctx.scale(1 / viewport.zoom, 1 / viewport.zoom)
        ctx.fillStyle = comment.resolved ? '#fff' : '#333'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${i + 1}`, 0, 0)

        ctx.restore()
      }
    }

    // Prototype flow overlay — show interaction arrows between layers and target artboards
    if (prototypeMode) {
      renderPrototypeFlowOverlay(ctx, document, viewport.zoom)
    }

    // Text editing overlay (cursor, selection)
    if (getTextEditState().active) {
      const textState = getTextEditState()
      const artboard = document.artboards.find((a) => a.id === textState.artboardId)
      if (artboard) {
        renderTextEditOverlay(ctx, artboard.x, artboard.y, viewport.zoom)
      }
    }

    // CSS Inspect measurement overlay — show distances to parent (artboard) edges
    if (showInspectOverlay && selection.layerIds.length > 0) {
      const inspArtboard = document.artboards[0]
      if (inspArtboard) {
        for (const layerId of selection.layerIds) {
          // Find layer recursively
          const findRec = (layers: Layer[]): Layer | null => {
            for (const l of layers) {
              if (l.id === layerId) return l
              if (l.type === 'group') {
                const found = findRec((l as GroupLayer).children)
                if (found) return found
              }
            }
            return null
          }
          const layer = findRec(inspArtboard.layers)
          if (!layer) continue

          const bbox = getLayerBBox(layer, inspArtboard)
          if (bbox.minX === Infinity) continue

          const abX = inspArtboard.x
          const abY = inspArtboard.y
          const abR = inspArtboard.x + inspArtboard.width
          const abB = inspArtboard.y + inspArtboard.height

          const distTop = bbox.minY - abY
          const distBottom = abB - bbox.maxY
          const distLeft = bbox.minX - abX
          const distRight = abR - bbox.maxX

          const lineW = 1 / viewport.zoom
          const dashLen = 4 / viewport.zoom
          const gapLen = 3 / viewport.zoom
          const labelFont = `${11 / viewport.zoom}px monospace`
          const measureColor = '#ff4444'

          ctx.save()
          ctx.strokeStyle = measureColor
          ctx.fillStyle = measureColor
          ctx.lineWidth = lineW
          ctx.setLineDash([dashLen, gapLen])
          ctx.font = labelFont
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          const centerX = (bbox.minX + bbox.maxX) / 2
          const centerY = (bbox.minY + bbox.maxY) / 2

          // Top measurement line
          if (distTop > 0) {
            ctx.beginPath()
            ctx.moveTo(centerX, abY)
            ctx.lineTo(centerX, bbox.minY)
            ctx.stroke()
            // Small caps at ends
            const capW = 4 / viewport.zoom
            ctx.beginPath()
            ctx.moveTo(centerX - capW, abY)
            ctx.lineTo(centerX + capW, abY)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(centerX - capW, bbox.minY)
            ctx.lineTo(centerX + capW, bbox.minY)
            ctx.stroke()
            // Label
            const labelY = (abY + bbox.minY) / 2
            const pad = 3 / viewport.zoom
            const text = `${Math.round(distTop)}`
            ctx.setLineDash([])
            ctx.save()
            ctx.fillStyle = 'rgba(255,68,68,0.85)'
            const tw = ctx.measureText(text).width + pad * 2
            ctx.fillRect(centerX - tw / 2, labelY - 6 / viewport.zoom, tw, 12 / viewport.zoom)
            ctx.fillStyle = '#fff'
            ctx.fillText(text, centerX, labelY)
            ctx.restore()
            ctx.setLineDash([dashLen, gapLen])
          }

          // Bottom measurement line
          if (distBottom > 0) {
            ctx.beginPath()
            ctx.moveTo(centerX, bbox.maxY)
            ctx.lineTo(centerX, abB)
            ctx.stroke()
            const capW = 4 / viewport.zoom
            ctx.beginPath()
            ctx.moveTo(centerX - capW, bbox.maxY)
            ctx.lineTo(centerX + capW, bbox.maxY)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(centerX - capW, abB)
            ctx.lineTo(centerX + capW, abB)
            ctx.stroke()
            const labelY = (bbox.maxY + abB) / 2
            const pad = 3 / viewport.zoom
            const text = `${Math.round(distBottom)}`
            ctx.setLineDash([])
            ctx.save()
            ctx.fillStyle = 'rgba(255,68,68,0.85)'
            const tw = ctx.measureText(text).width + pad * 2
            ctx.fillRect(centerX - tw / 2, labelY - 6 / viewport.zoom, tw, 12 / viewport.zoom)
            ctx.fillStyle = '#fff'
            ctx.fillText(text, centerX, labelY)
            ctx.restore()
            ctx.setLineDash([dashLen, gapLen])
          }

          // Left measurement line
          if (distLeft > 0) {
            ctx.beginPath()
            ctx.moveTo(abX, centerY)
            ctx.lineTo(bbox.minX, centerY)
            ctx.stroke()
            const capH = 4 / viewport.zoom
            ctx.beginPath()
            ctx.moveTo(abX, centerY - capH)
            ctx.lineTo(abX, centerY + capH)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(bbox.minX, centerY - capH)
            ctx.lineTo(bbox.minX, centerY + capH)
            ctx.stroke()
            const labelX = (abX + bbox.minX) / 2
            const pad = 3 / viewport.zoom
            const text = `${Math.round(distLeft)}`
            ctx.setLineDash([])
            ctx.save()
            ctx.fillStyle = 'rgba(255,68,68,0.85)'
            const tw = ctx.measureText(text).width + pad * 2
            ctx.fillRect(labelX - tw / 2, centerY - 6 / viewport.zoom, tw, 12 / viewport.zoom)
            ctx.fillStyle = '#fff'
            ctx.fillText(text, labelX, centerY)
            ctx.restore()
            ctx.setLineDash([dashLen, gapLen])
          }

          // Right measurement line
          if (distRight > 0) {
            ctx.beginPath()
            ctx.moveTo(bbox.maxX, centerY)
            ctx.lineTo(abR, centerY)
            ctx.stroke()
            const capH = 4 / viewport.zoom
            ctx.beginPath()
            ctx.moveTo(bbox.maxX, centerY - capH)
            ctx.lineTo(bbox.maxX, centerY + capH)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(abR, centerY - capH)
            ctx.lineTo(abR, centerY + capH)
            ctx.stroke()
            const labelX = (bbox.maxX + abR) / 2
            const pad = 3 / viewport.zoom
            const text = `${Math.round(distRight)}`
            ctx.setLineDash([])
            ctx.save()
            ctx.fillStyle = 'rgba(255,68,68,0.85)'
            const tw = ctx.measureText(text).width + pad * 2
            ctx.fillRect(labelX - tw / 2, centerY - 6 / viewport.zoom, tw, 12 / viewport.zoom)
            ctx.fillStyle = '#fff'
            ctx.fillText(text, labelX, centerY)
            ctx.restore()
            ctx.setLineDash([dashLen, gapLen])
          }

          ctx.setLineDash([])
          ctx.restore()
        }
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
  }, [
    viewport,
    document,
    activeTool,
    selection,
    showRulers,
    showGrid,
    gridSize,
    activeSnapLines,
    showInspectOverlay,
    selectedCommentId,
    prototypeMode,
  ])

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
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
        return
      // Text editing takes priority
      if (getTextEditState().active) {
        if (textEditKeyDown(e)) return
      }
      if (activeTool === 'pen') {
        penKeyDown(e)
      }
      if (activeTool === 'curvature-pen') {
        curvaturePenKeyDown(e.key)
      }
      if (activeTool === 'node' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        deleteSelectedNodes()
      }
      // Shape Builder: Enter to finalize, Escape to cancel
      if (activeTool === 'shape-builder' && isShapeBuilderActive()) {
        if (e.key === 'Enter') {
          e.preventDefault()
          finalizeShapeBuilder()
          render()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelShapeBuilder()
          render()
        }
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
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        )
          return
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
      if (!files || files.length === 0) return

      const file = files[0]!
      const name = file.name.toLowerCase()

      // SVG and .xd files open as new documents
      if (name.endsWith('.xd') || name.endsWith('.svg') || file.type === 'image/svg+xml') {
        await openFileAsDocument(file)
      } else if (file.type.startsWith('image/')) {
        // Raster images import into the current canvas
        await importImageFile(file)
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
        // Single finger → forward to active tool (two-finger pan handled by touch-handler pinch)
        brushPressure.current = pressure
        const synth = {
          clientX: x,
          clientY: y,
          button,
          shiftKey,
          nativeEvent: { clientX: x, clientY: y, button, shiftKey, altKey: false },
          preventDefault() {},
        } as unknown as React.MouseEvent
        handleMouseDown(synth)
      },
      onPointerMove(x, y, shiftKey, pressure, _pointerType) {
        brushPressure.current = pressure
        const synth = {
          clientX: x,
          clientY: y,
          shiftKey,
          altKey: false,
          nativeEvent: { clientX: x, clientY: y, shiftKey, altKey: false },
        } as unknown as React.MouseEvent
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

  // Wheel handler is attached natively with { passive: false } so preventDefault works
  // (React registers wheel listeners as passive by default)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()

      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.01
        const vp = useEditorStore.getState().viewport
        const newViewport = zoomAtPoint(vp, { x: e.clientX, y: e.clientY }, rect, delta)
        useEditorStore.getState().setZoom(newViewport.zoom)
        useEditorStore.getState().setPan(newViewport.panX, newViewport.panY)
      } else if (e.shiftKey) {
        const vp = useEditorStore.getState().viewport
        useEditorStore.getState().setPan(vp.panX - e.deltaY, vp.panY)
      } else {
        const vp = useEditorStore.getState().viewport
        useEditorStore.getState().setPan(vp.panX - e.deltaX, vp.panY - e.deltaY)
      }
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, []) // reads from store directly, no deps needed

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

    // Perspective grid VP dragging — hit-test VP circles before other interactions
    {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      for (const ab of document.artboards) {
        if (!ab.perspectiveGrid) continue
        const vpIdx = hitTestVanishingPoint(
          docPoint.x,
          docPoint.y,
          ab.perspectiveGrid,
          { x: ab.x, y: ab.y },
          viewport.zoom,
        )
        if (vpIdx >= 0) {
          vpDragState.current = { artboardId: ab.id, vpIndex: vpIdx }
          isDragging.current = true
          e.preventDefault()
          return
        }
      }
    }

    // Comment tool — click to place or select a comment pin
    if (activeTool === 'comment') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const store = useEditorStore.getState()
      const allComments = store.document.comments ?? []

      // Hit-test existing comment pins first (8px radius in screen space)
      const hitRadius = 8 / viewport.zoom
      for (let i = allComments.length - 1; i >= 0; i--) {
        const c = allComments[i]!
        const dx = docPoint.x - c.x
        const dy = docPoint.y - c.y
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          store.selectComment(c.id)
          render()
          return
        }
      }

      // Find which artboard was clicked
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        const text = window.prompt('Add comment:')
        if (text && text.trim()) {
          store.addComment({
            id: uuid(),
            x: docPoint.x,
            y: docPoint.y,
            artboardId: artboard.id,
            author: 'You',
            text: text.trim(),
            createdAt: new Date().toISOString(),
            resolved: false,
            replies: [],
          })
          render()
        }
      }
      return
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
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        beginShapeDrag(docPoint.x, docPoint.y, artboard.id)
        isDragging.current = true
      }
      return
    }

    // Text tool — click to place point text, drag to create area text box
    if (activeTool === 'text') {
      const textState = getTextEditState()
      // If already editing, clicking elsewhere ends editing
      if (textState.active) {
        endTextEdit()
      }
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        textDragStart.current = { x: docPoint.x, y: docPoint.y, artboardId: artboard.id }
        textDragEnd.current = { x: docPoint.x, y: docPoint.y }
        isDragging.current = true
      }
      return
    }

    // Measure tool
    if (activeTool === 'measure') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      measureLine.current = {
        startX: docPoint.x,
        startY: docPoint.y,
        endX: docPoint.x,
        endY: docPoint.y,
      }
      isDragging.current = true
      return
    }

    // Brush tool
    if (activeTool === 'brush') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard && beginStroke()) {
        brushPoints.current = [{ x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }]
        brushPressure.current = touchMode ? currentPressure : 1
        isDragging.current = true
      }
      return
    }

    // Line tool
    if (activeTool === 'line') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        beginLineDrag(docPoint.x, docPoint.y, artboard.id)
        isDragging.current = true
      }
      return
    }

    // Pencil tool
    if (activeTool === 'pencil') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        beginPencilStroke(docPoint.x, docPoint.y, artboard.id)
        isDragging.current = true
      }
      return
    }

    // Eraser tool
    if (activeTool === 'eraser') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard && beginEraserStroke()) {
        eraserPoints.current = [{ x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }]
        isDragging.current = true
      }
      return
    }

    // Clone Stamp tool
    if (activeTool === 'clone-stamp') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        const localX = docPoint.x - artboard.x
        const localY = docPoint.y - artboard.y
        if (e.altKey) {
          // Alt+Click → set clone source
          setCloneSource(localX, localY)
          render()
        } else if (hasCloneSource()) {
          // Regular click → begin clone stamp stroke
          if (beginCloneStamp(localX, localY, artboard.id)) {
            isDragging.current = true
            render()
          }
        }
      }
      return
    }

    // Gradient tool
    if (activeTool === 'gradient') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        beginGradientDrag(docPoint.x, docPoint.y, artboard.id)
        gradientEnd.current = { x: docPoint.x, y: docPoint.y }
        isDragging.current = true
      }
      return
    }

    // Fill bucket tool
    if (activeTool === 'fill') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      applyFillBucket(docPoint.x, docPoint.y)
      return
    }

    // Zoom tool
    if (activeTool === 'zoom') {
      if (e.altKey) {
        zoomToolClick(e.clientX, e.clientY, rect, true)
      } else {
        beginZoomDrag(e.clientX, e.clientY)
        isDragging.current = true
      }
      return
    }

    // Lasso tool
    if (activeTool === 'lasso') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      beginLasso(docPoint.x, docPoint.y)
      isDragging.current = true
      return
    }

    // Marquee tool
    if (activeTool === 'marquee') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      beginMarquee(docPoint.x, docPoint.y)
      isDragging.current = true
      return
    }

    // Knife tool
    if (activeTool === 'knife') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      beginKnifeCut(docPoint.x, docPoint.y)
      isDragging.current = true
      return
    }

    // Shape Builder tool
    if (activeTool === 'shape-builder') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      // Initialize shape builder on first click if not already active
      if (!isShapeBuilderActive()) {
        const selectedIds = useEditorStore.getState().selection.layerIds
        if (selectedIds.length < 2) return
        if (!initShapeBuilder(selectedIds)) return
      }
      shapeBuilderMouseDown(docPoint.x, docPoint.y, e.nativeEvent.altKey)
      isDragging.current = true
      render()
      return
    }

    // Curvature Pen tool
    if (activeTool === 'curvature-pen') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        curvaturePenMouseDown(docPoint.x, docPoint.y, artboard.id, artboard.x, artboard.y, e.shiftKey, false)
        render()
      }
      return
    }

    // Spiral tool
    if (activeTool === 'spiral') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        spiralMouseDown(docPoint.x, docPoint.y, artboard.id, artboard.x, artboard.y)
        isDragging.current = true
      }
      return
    }

    // Width tool
    if (activeTool === 'width') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        widthToolMouseDown(docPoint.x, docPoint.y, viewport.zoom, artboard.id, artboard.x, artboard.y)
        isDragging.current = true
      }
      return
    }

    // Artboard tool
    if (activeTool === 'artboard') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      beginArtboardDrag(docPoint.x, docPoint.y)
      isDragging.current = true
      return
    }

    // Slice tool
    if (activeTool === 'slice') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        beginSliceDrag(docPoint.x, docPoint.y, artboard.id)
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
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)

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

    // VP dragging for perspective grid
    if (vpDragState.current && isDragging.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const store = useEditorStore.getState()
      const ab = store.document.artboards.find((a) => a.id === vpDragState.current!.artboardId)
      if (ab && ab.perspectiveGrid) {
        const vpIdx = vpDragState.current.vpIndex
        const newVPs = ab.perspectiveGrid.vanishingPoints.map((vp, i) =>
          i === vpIdx ? { x: docPoint.x - ab.x, y: docPoint.y - ab.y } : { ...vp },
        )
        const newConfig = { ...ab.perspectiveGrid, vanishingPoints: newVPs }
        // Use silent update to avoid undo spam during drag
        useEditorStore.setState((s) => ({
          document: {
            ...s.document,
            artboards: s.document.artboards.map((a) =>
              a.id === vpDragState.current!.artboardId ? { ...a, perspectiveGrid: newConfig } : a,
            ),
          },
        }))
        render()
      }
      return
    }

    if ((activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'clone-stamp') && !isDragging.current) {
      // Throttle cursor-only redraws to animation frame
      if (!brushRafId.current) {
        brushRafId.current = requestAnimationFrame(() => {
          brushRafId.current = 0
          render()
        })
      }
    } else if (showRulers) {
      render()
    }

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
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateTransform(docPoint, e.shiftKey)
      return
    }

    // Text tool drag (area text creation)
    if (activeTool === 'text' && isDragging.current && textDragStart.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      textDragEnd.current = { x: docPoint.x, y: docPoint.y }
      render()
      return
    }

    // Shape tool drag
    if (isDragging.current && isShapeDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateShapeDrag(docPoint.x, docPoint.y, e.shiftKey, e.altKey)
      return
    }

    // Brush tool drag — accumulate points, paint on rAF
    if (activeTool === 'brush' && isDragging.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        const pt = { x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }
        brushPoints.current.push(pt)
        brushPressure.current = touchMode ? currentPressure : 1
        if (!brushRafId.current) {
          brushRafId.current = requestAnimationFrame(() => {
            brushRafId.current = 0
            const len = brushPoints.current.length
            if (len >= 2) {
              paintStroke(brushPoints.current.slice(-2), undefined, brushPressure.current)
              render()
            }
          })
        }
      }
      return
    }

    // Line tool drag
    if (isDragging.current && isLineDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateLineDrag(docPoint.x, docPoint.y, e.shiftKey)
      return
    }

    // Pencil tool drag
    if (activeTool === 'pencil' && isDragging.current && isPencilDrawing()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updatePencilStroke(docPoint.x, docPoint.y)
      return
    }

    // Eraser tool drag
    if (activeTool === 'eraser' && isDragging.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        const pt = { x: docPoint.x - artboard.x, y: docPoint.y - artboard.y }
        eraserPoints.current.push(pt)
        if (!eraserRafId.current) {
          eraserRafId.current = requestAnimationFrame(() => {
            eraserRafId.current = 0
            const len = eraserPoints.current.length
            if (len >= 2) {
              paintEraser(eraserPoints.current.slice(-2))
              render()
            }
          })
        }
      }
      return
    }

    // Clone Stamp tool drag
    if (activeTool === 'clone-stamp' && isDragging.current && isCloneStamping()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      const artboard = document.artboards[0]
      if (artboard) {
        const localX = docPoint.x - artboard.x
        const localY = docPoint.y - artboard.y
        if (!cloneStampRafId.current) {
          cloneStampRafId.current = requestAnimationFrame(() => {
            cloneStampRafId.current = 0
            paintCloneStamp(localX, localY)
            render()
          })
        }
      }
      return
    }

    // Gradient tool drag
    if (activeTool === 'gradient' && isDragging.current && isGradientDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      gradientEnd.current = { x: docPoint.x, y: docPoint.y }
      updateGradientDrag(docPoint.x, docPoint.y, e.shiftKey)
      render()
      return
    }

    // Zoom tool drag
    if (activeTool === 'zoom' && isDragging.current && isZoomDragging()) {
      updateZoomDrag(e.clientY, rect)
      return
    }

    // Lasso tool drag
    if (activeTool === 'lasso' && isDragging.current && isLassoActive()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateLasso(docPoint.x, docPoint.y)
      render()
      return
    }

    // Marquee tool drag
    if (activeTool === 'marquee' && isDragging.current && isMarqueeActive()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateMarquee(docPoint.x, docPoint.y, e.shiftKey)
      render()
      return
    }

    // Knife tool drag
    if (activeTool === 'knife' && isDragging.current && isKnifeCutting()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateKnifeCut(docPoint.x, docPoint.y)
      render()
      return
    }

    // Shape Builder tool drag / hover
    if (activeTool === 'shape-builder' && isShapeBuilderActive()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      if (isDragging.current) {
        shapeBuilderMouseDrag(docPoint.x, docPoint.y)
      } else {
        shapeBuilderHover(docPoint.x, docPoint.y)
      }
      render()
      return
    }

    // Spiral tool drag
    if (activeTool === 'spiral' && isDragging.current && isSpiralDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      spiralMouseDrag(docPoint.x, docPoint.y)
      render()
      return
    }

    // Width tool drag
    if (activeTool === 'width' && isDragging.current && isWidthToolDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      widthToolMouseDrag(docPoint.x, docPoint.y)
      render()
      return
    }

    // Artboard tool drag
    if (activeTool === 'artboard' && isDragging.current && isArtboardDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateArtboardDrag(docPoint.x, docPoint.y, e.shiftKey)
      render()
      return
    }

    // Slice tool drag
    if (activeTool === 'slice' && isDragging.current && isSliceDragging()) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      updateSliceDrag(docPoint.x, docPoint.y)
      render()
      return
    }

    // Update cursor for select tool handle hover
    if (activeTool === 'select' && !isDragging.current && canvasRef.current) {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
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

    // Curvature Pen tool hover preview
    if (activeTool === 'curvature-pen') {
      const docPoint = screenToDocument({ x: e.clientX, y: e.clientY }, viewport, rect)
      curvaturePenMouseMove(docPoint.x, docPoint.y)
      render()
    }

    // Eyedropper hover tracking for loupe
    if (activeTool === 'eyedropper') {
      eyedropperHover.current = { x: e.clientX, y: e.clientY }
      render()
    }
  }

  function handleMouseUp(_e?: React.MouseEvent) {
    if (isPanning.current) {
      isPanning.current = false
      if (canvasRef.current) {
        canvasRef.current.style.cursor = activeTool === 'hand' || spaceHeld.current ? 'grab' : ''
      }
      return
    }

    // Finish VP dragging — commit to undo history
    if (vpDragState.current) {
      const store = useEditorStore.getState()
      const ab = store.document.artboards.find((a) => a.id === vpDragState.current!.artboardId)
      if (ab && ab.perspectiveGrid) {
        store.setPerspectiveGrid(ab.id, ab.perspectiveGrid)
      }
      vpDragState.current = null
      isDragging.current = false
      render()
      return
    }

    if (activeTool === 'node' && getNodeState().dragging) {
      nodeMouseUp()
      isDragging.current = false
      return
    }

    // Text tool — finish drag or click
    if (activeTool === 'text' && isDragging.current && textDragStart.current) {
      const start = textDragStart.current
      const end = textDragEnd.current ?? start
      const dx = Math.abs(end.x - start.x)
      const dy = Math.abs(end.y - start.y)

      if (dx > 10 || dy > 10) {
        // Dragged enough — create area text box
        const rectX = Math.min(start.x, end.x)
        const rectY = Math.min(start.y, end.y)
        createAreaText(rectX, rectY, dx, dy, start.artboardId)
      } else {
        // Click — create point text
        createAndEditText(start.x, start.y, start.artboardId)
      }

      textDragStart.current = null
      textDragEnd.current = null
      isDragging.current = false
      render()
      return
    }

    // Finish brush stroke — sync canvas to ImageData for serialization
    if (activeTool === 'brush' && isDragging.current) {
      endStroke()
      brushPoints.current = []
      isDragging.current = false
      render()
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
            if (bbox.maxX >= mx && bbox.minX <= mx + mw && bbox.maxY >= my && bbox.minY <= my + mh) {
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

    // Line tool
    if (isLineDragging()) {
      endLineDrag()
      isDragging.current = false
      return
    }

    // Pencil tool
    if (activeTool === 'pencil' && isPencilDrawing()) {
      endPencilStroke()
      isDragging.current = false
      return
    }

    // Eraser tool
    if (activeTool === 'eraser' && isDragging.current) {
      endEraserStroke()
      eraserPoints.current = []
      isDragging.current = false
      render()
      return
    }

    // Clone Stamp tool
    if (activeTool === 'clone-stamp' && isDragging.current) {
      endCloneStamp()
      isDragging.current = false
      render()
      return
    }

    // Gradient tool
    if (isGradientDragging()) {
      endGradientDrag()
      gradientEnd.current = null
      isDragging.current = false
      render()
      return
    }

    // Zoom tool
    if (isZoomDragging()) {
      endZoomDrag()
      isDragging.current = false
      return
    }

    // Lasso tool
    if (isLassoActive()) {
      endLasso(false)
      isDragging.current = false
      render()
      return
    }

    // Marquee tool
    if (isMarqueeActive()) {
      endMarquee(false)
      isDragging.current = false
      render()
      return
    }

    // Knife tool
    if (isKnifeCutting()) {
      endKnifeCut()
      isDragging.current = false
      render()
      return
    }

    // Shape Builder tool
    if (activeTool === 'shape-builder' && isShapeBuilderActive()) {
      shapeBuilderMouseUp()
      isDragging.current = false
      render()
      return
    }

    // Spiral tool
    if (isSpiralDragging()) {
      spiralMouseUp()
      isDragging.current = false
      render()
      return
    }

    // Width tool
    if (isWidthToolDragging()) {
      widthToolMouseUp()
      isDragging.current = false
      render()
      return
    }

    // Artboard tool
    if (isArtboardDragging()) {
      endArtboardDrag(mouseDocPos.current.x, mouseDocPos.current.y)
      isDragging.current = false
      render()
      return
    }

    // Slice tool
    if (isSliceDragging()) {
      endSliceDrag(mouseDocPos.current.x, mouseDocPos.current.y)
      isDragging.current = false
      render()
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

    // Curvature Pen double-click → place corner point
    if (activeTool === 'curvature-pen') {
      const artboard =
        document.artboards.find(
          (a) => docPoint.x >= a.x && docPoint.x <= a.x + a.width && docPoint.y >= a.y && docPoint.y <= a.y + a.height,
        ) ?? document.artboards[0]
      if (artboard) {
        curvaturePenMouseDown(docPoint.x, docPoint.y, artboard.id, artboard.x, artboard.y, e.shiftKey, true)
        render()
      }
      return
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
      : activeTool === 'brush' || activeTool === 'clone-stamp'
        ? 'none'
        : activeTool === 'pen' || activeTool === 'curvature-pen' || activeTool === 'node' || activeTool === 'measure'
          ? 'crosshair'
          : activeTool === 'eyedropper' || activeTool === 'width'
            ? 'crosshair'
            : activeTool === 'select'
              ? undefined
              : activeTool === 'comment'
                ? 'crosshair'
                : 'default'

  return (
    <canvas
      id="canvas"
      ref={canvasRef}
      tabIndex={0}
      role="application"
      aria-label="Design canvas"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: cursor ?? undefined,
        touchAction: touchMode ? 'none' : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        openCanvasContextMenu(e.clientX, e.clientY)
      }}
    />
  )
}

// ─── Layer rendering ──────────────────────────────────────────

function renderLayer(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (!layer.visible) return

  // Apply animation overrides as temporary layer changes (non-mutating)
  const overrides = getAnimationOverrides().get(layer.id)
  let effectiveLayer = layer
  if (overrides) {
    const newTransform = { ...layer.transform }
    if (overrides.x !== undefined) newTransform.x = overrides.x
    if (overrides.y !== undefined) newTransform.y = overrides.y
    if (overrides.scaleX !== undefined) newTransform.scaleX = overrides.scaleX
    if (overrides.scaleY !== undefined) newTransform.scaleY = overrides.scaleY
    if (overrides.rotation !== undefined) newTransform.rotation = overrides.rotation

    const newOpacity = overrides.opacity !== undefined ? overrides.opacity : layer.opacity

    effectiveLayer = { ...layer, transform: newTransform, opacity: newOpacity } as Layer

    // Apply color overrides for vector layers
    if (effectiveLayer.type === 'vector') {
      const vl = effectiveLayer as VectorLayer
      if (overrides.fillColor !== undefined && vl.fill) {
        effectiveLayer = { ...effectiveLayer, fill: { ...vl.fill, color: overrides.fillColor } } as Layer
      }
      if (overrides.strokeColor !== undefined && vl.stroke) {
        effectiveLayer = { ...effectiveLayer, stroke: { ...vl.stroke, color: overrides.strokeColor } } as Layer
      }
    }
  }

  ctx.save()
  ctx.globalCompositeOperation = blendModeToComposite(effectiveLayer.blendMode)
  ctx.globalAlpha = effectiveLayer.opacity

  switch (effectiveLayer.type) {
    case 'vector':
      renderVectorLayer(ctx, effectiveLayer)
      break
    case 'raster':
      renderRasterLayer(ctx, effectiveLayer)
      break
    case 'group':
      renderGroupLayer(ctx, effectiveLayer)
      break
    case 'text':
      renderTextLayer(ctx, effectiveLayer)
      break
    case 'symbol-instance':
      renderSymbolInstanceLayer(ctx, effectiveLayer)
      break
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

function applyTransform(
  ctx: CanvasRenderingContext2D,
  t: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    skewX?: number
    skewY?: number
    anchorX?: number
    anchorY?: number
  },
  bounds?: { width: number; height: number },
) {
  ctx.translate(t.x, t.y)

  // If anchor point is set and bounds are known, offset the transform origin
  const ax = t.anchorX ?? 0.5
  const ay = t.anchorY ?? 0.5
  const hasCustomAnchor = bounds && (Math.abs(ax - 0.5) > 0.001 || Math.abs(ay - 0.5) > 0.001)

  if (hasCustomAnchor) {
    const ox = ax * bounds.width
    const oy = ay * bounds.height
    ctx.translate(ox, oy)
    ctx.scale(t.scaleX, t.scaleY)
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
    if (t.skewX || t.skewY) {
      const sx = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
      const sy = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
      ctx.transform(1, sy, sx, 1, 0, 0)
    }
    ctx.translate(-ox, -oy)
  } else {
    ctx.scale(t.scaleX, t.scaleY)
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
    if (t.skewX || t.skewY) {
      const sx = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
      const sy = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
      ctx.transform(1, sy, sx, 1, 0, 0)
    }
  }
}

/**
 * Word-wrap text to fit within a given width.
 * Splits on spaces and explicit newlines.
 */
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, letterSpacing: number): string[] {
  const paragraphs = text.split('\n')
  const wrapped: string[] = []

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      wrapped.push('')
      continue
    }
    const words = paragraph.split(' ')
    let currentLine = ''
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!
      const testLine = currentLine ? currentLine + ' ' + word : word
      let testWidth: number
      if (letterSpacing === 0) {
        testWidth = ctx.measureText(testLine).width
      } else {
        testWidth = 0
        for (const ch of testLine) {
          testWidth += ctx.measureText(ch).width + letterSpacing
        }
        testWidth -= letterSpacing // no extra spacing after last char
      }
      if (testWidth > maxWidth && currentLine !== '') {
        wrapped.push(currentLine)
        currentLine = word
      } else {
        currentLine = testLine
      }
    }
    wrapped.push(currentLine)
  }
  return wrapped
}

/** Check if a character is CJK (should remain upright in vertical text). */
function isCJKChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0x3000 && code <= 0x303f) || // CJK Symbols and Punctuation
    (code >= 0x3040 && code <= 0x309f) || // Hiragana
    (code >= 0x30a0 && code <= 0x30ff) || // Katakana
    (code >= 0xff00 && code <= 0xffef) || // Fullwidth Forms
    (code >= 0xac00 && code <= 0xd7af) // Hangul Syllables
  )
}

/** Characters that hang outside the text box for optical margin alignment. */
const OPTICAL_MARGIN_CHARS: Record<string, number> = {
  '"': 1.0,
  "'": 1.0,
  '\u201C': 1.0, // left double quote
  '\u201D': 1.0, // right double quote
  '\u2018': 1.0, // left single quote
  '\u2019': 1.0, // right single quote
  '.': 0.5,
  ',': 0.5,
  '-': 0.5,
  '\u2013': 0.7, // en-dash
  '\u2014': 0.7, // em-dash
  '(': 0.6,
  ')': 0.6,
}

/**
 * Get the optical margin offset for a character at the start or end of a line.
 * Returns the pixel amount to shift the line outside the margin.
 */
function getOpticalMarginOffset(ctx: CanvasRenderingContext2D, ch: string, _position: 'start' | 'end'): number {
  const factor = OPTICAL_MARGIN_CHARS[ch]
  if (factor == null) return 0
  return ctx.measureText(ch).width * factor
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

  // NOTE: OpenType features (layer.openTypeFeatures) are stored on the layer but
  // Canvas 2D does not support CSS font-feature-settings. These features are
  // applied in SVG export (which supports font-feature-settings as a style attribute).
  // A future enhancement could render text via an HTML overlay or use the CSS Font
  // Loading API with an OffscreenCanvas to apply OT features on the canvas.

  const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)
  const letterSp = layer.letterSpacing ?? 0
  const isVertical = layer.textOrientation === 'vertical'

  // Area text: word-wrap and clip to bounding box
  const isAreaText = layer.textMode === 'area' && layer.textWidth != null && layer.textWidth > 0

  // ── Vertical Text ──
  if (isVertical) {
    renderVerticalText(ctx, layer, lineH, letterSp, isAreaText)
    ctx.restore()
    return
  }

  // ── Horizontal Text (columns support) ──
  const numColumns = isAreaText && layer.columns != null && layer.columns > 1 ? layer.columns : 1
  const columnGap = layer.columnGap ?? 16
  const totalWidth = isAreaText ? layer.textWidth! : 0
  const colWidth = numColumns > 1 ? (totalWidth - (numColumns - 1) * columnGap) / numColumns : totalWidth
  const opticalMargins = layer.opticalMarginAlignment === true

  let lines: string[]
  if (isAreaText) {
    lines = wrapTextLines(ctx, layer.text, colWidth, letterSp)
    // Clip to text box bounds
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, layer.textWidth!, layer.textHeight ?? lineH * lines.length)
    ctx.clip()
  } else {
    lines = layer.text.split('\n')
  }

  if (numColumns > 1 && isAreaText) {
    // Multi-column layout: distribute lines across columns
    const maxLinesPerCol = layer.textHeight != null ? Math.floor(layer.textHeight / lineH) : lines.length
    let lineIdx = 0
    for (let col = 0; col < numColumns && lineIdx < lines.length; col++) {
      const colX = col * (colWidth + columnGap)
      const linesInCol = Math.min(maxLinesPerCol, lines.length - lineIdx)
      for (let i = 0; i < linesInCol; i++) {
        const y = i * lineH
        const line = lines[lineIdx]!
        renderHorizontalLine(ctx, line, colX, y, letterSp, opticalMargins, colWidth, layer.textAlign ?? 'left')
        lineIdx++
      }
    }
  } else {
    // Single column rendering
    for (let i = 0; i < lines.length; i++) {
      const y = i * lineH
      // Skip lines below the clipping area for area text
      if (isAreaText && layer.textHeight != null && y >= layer.textHeight) break
      if (opticalMargins && isAreaText) {
        renderHorizontalLine(ctx, lines[i]!, 0, y, letterSp, true, colWidth, layer.textAlign ?? 'left')
      } else if (letterSp === 0) {
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
  }

  if (isAreaText) {
    ctx.restore() // restore clip
  }

  ctx.restore()
}

/**
 * Render a single horizontal text line with optional optical margin alignment.
 */
function renderHorizontalLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  baseX: number,
  y: number,
  letterSp: number,
  opticalMargins: boolean,
  _columnWidth: number,
  _textAlign: 'left' | 'center' | 'right',
) {
  let xOffset = baseX
  if (opticalMargins && line.length > 0) {
    const firstChar = line[0]!
    const startHang = getOpticalMarginOffset(ctx, firstChar, 'start')
    xOffset -= startHang
  }
  if (letterSp === 0) {
    ctx.fillText(line, xOffset, y)
  } else {
    let x = xOffset
    for (const ch of line) {
      ctx.fillText(ch, x, y)
      x += ctx.measureText(ch).width + letterSp
    }
  }
}

/**
 * Render vertical text: characters flow top-to-bottom.
 * Latin characters are rotated 90 degrees CW; CJK characters remain upright.
 */
function renderVerticalText(
  ctx: CanvasRenderingContext2D,
  layer: TextLayer,
  lineH: number,
  letterSp: number,
  isAreaText: boolean,
) {
  const text = layer.text
  const charSpacing = lineH // vertical "line height" becomes character spacing
  const columnWidth = layer.fontSize * 1.5 // width of each vertical column
  const align = layer.textAlign ?? 'left' // becomes vertical alignment: left=top, center=center, right=bottom

  if (isAreaText) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, layer.textWidth!, layer.textHeight ?? 1000)
    ctx.clip()
  }

  // Split text into paragraphs (which become vertical columns, right-to-left)
  const paragraphs = text.split('\n')
  let colIdx = 0

  for (const paragraph of paragraphs) {
    const chars = [...paragraph] // handle multi-byte chars
    const totalHeight = chars.length * charSpacing + (chars.length - 1) * letterSp
    const areaHeight = isAreaText && layer.textHeight ? layer.textHeight : totalHeight

    let startY = 0
    if (align === 'center') {
      startY = (areaHeight - totalHeight) / 2
    } else if (align === 'right') {
      startY = areaHeight - totalHeight
    }

    // Vertical text columns go right-to-left traditionally
    const colX = colIdx * columnWidth

    for (let ci = 0; ci < chars.length; ci++) {
      const ch = chars[ci]!
      const cy = startY + ci * (charSpacing + letterSp)

      if (isCJKChar(ch)) {
        // CJK: render upright, centered in column
        const charW = ctx.measureText(ch).width
        ctx.fillText(ch, colX + (columnWidth - charW) / 2, cy)
      } else {
        // Latin: rotate 90 degrees clockwise
        ctx.save()
        ctx.translate(colX + columnWidth / 2, cy + charSpacing / 2)
        ctx.rotate(Math.PI / 2)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(ch, 0, 0)
        ctx.restore()
        // Restore text settings for next character
        ctx.textAlign = layer.textAlign ?? 'left'
        ctx.textBaseline = 'top'
      }
    }
    colIdx++
  }

  if (isAreaText) {
    ctx.restore()
  }
}

function renderVectorLayer(ctx: CanvasRenderingContext2D, layer: VectorLayer) {
  // Pre-compute local bounds for anchor point support
  let localW = 100,
    localH = 100
  for (const p of layer.paths) {
    for (const seg of p.segments) {
      if ('x' in seg) {
        if (seg.x > localW) localW = seg.x
        if (seg.y > localH) localH = seg.y
      }
    }
  }

  // 3D extrusion rendering — replaces normal 2D pipeline
  if (layer.extrude3d) {
    ctx.save()
    applyTransform(ctx, layer.transform, { width: localW, height: localH })
    const allSegments = layer.paths.flatMap((p) => p.segments)
    render3DLayer(ctx, allSegments, layer.extrude3d, {
      x: 0,
      y: 0,
      width: localW,
      height: localH,
    })
    ctx.restore()
    return
  }

  ctx.save()
  applyTransform(ctx, layer.transform, { width: localW, height: localH })

  // Apply envelope distortion if configured
  const renderPaths =
    layer.envelope && layer.envelope.preset !== 'none' ? warpPaths(layer.paths, layer.envelope) : layer.paths

  // Compute bounding box for gradient/noise sizing
  let bboxX = 0,
    bboxY = 0,
    bboxW = 100,
    bboxH = 100
  if ((layer.fill?.type === 'gradient' && layer.fill.gradient) || (layer.fill?.type === 'noise' && layer.fill.noise)) {
    // Approximate bbox from paths
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const p of renderPaths) {
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
      bboxX = minX
      bboxY = minY
      bboxW = maxX - minX || 100
      bboxH = maxY - minY || 100
    }
  }

  for (const path of renderPaths) {
    const path2d = segmentsToPath2D(path.segments)
    const fillRule = path.fillRule ?? 'nonzero'

    if (layer.fill) {
      ctx.globalAlpha = layer.opacity * layer.fill.opacity
      const fillColor = layer.fill.type === 'solid' && layer.fill.color ? resolveColor(layer.fill.color) : null
      if (fillColor) {
        ctx.fillStyle = fillColor
        ctx.fill(path2d, fillRule)
      } else if (layer.fill.type === 'gradient' && layer.fill.gradient) {
        const grad = layer.fill.gradient
        if (grad.type === 'mesh' && grad.mesh) {
          ctx.save()
          ctx.clip(path2d, fillRule)
          renderMeshGradient(ctx, grad.mesh, { x: bboxX, y: bboxY, width: bboxW, height: bboxH })
          ctx.restore()
        } else if (grad.type === 'box') {
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
      } else if (layer.fill.type === 'noise' && layer.fill.noise) {
        const noisePat = createNoisePattern(
          ctx,
          layer.fill.noise,
          Math.ceil(bboxW) || 100,
          Math.ceil(bboxH) || 100,
          layer.fill.opacity,
        )
        if (noisePat) {
          ctx.fillStyle = noisePat
          ctx.fill(path2d, fillRule)
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

      const hasVariableWidth = layer.stroke.widthProfile && layer.stroke.widthProfile.length > 0
      const hasWiggle = layer.stroke.wiggle?.enabled && layer.stroke.wiggle.amplitude > 0

      if (hasWiggle) {
        // Wiggle stroke: render displaced polyline (always center position)
        ctx.lineWidth = layer.stroke.width
        renderWiggleStroke(ctx, path.segments, layer.stroke.width, {
          amplitude: layer.stroke.wiggle!.amplitude,
          frequency: layer.stroke.wiggle!.frequency,
          seed: layer.stroke.wiggle!.seed,
          taperStart: layer.stroke.wiggle!.taperStart,
          taperEnd: layer.stroke.wiggle!.taperEnd,
        })
      } else if (hasVariableWidth && pos === 'center') {
        // Variable-width stroke: render as filled offset curves
        renderVariableStroke(ctx, path, layer.stroke, path2d)
      } else if (pos === 'inside') {
        ctx.save()
        ctx.clip(path2d)
        ctx.lineWidth = layer.stroke.width * 2
        if (hasVariableWidth) {
          renderVariableStroke(ctx, path, { ...layer.stroke, width: layer.stroke.width * 2 }, path2d)
        } else {
          ctx.stroke(path2d)
        }
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
        if (hasVariableWidth) {
          renderVariableStroke(ctx, path, { ...layer.stroke, width: layer.stroke.width * 2 }, path2d)
        } else {
          ctx.stroke(path2d)
        }
        ctx.restore()
      } else {
        ctx.lineWidth = layer.stroke.width
        if (hasVariableWidth) {
          renderVariableStroke(ctx, path, layer.stroke, path2d)
        } else {
          ctx.stroke(path2d)
        }
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
        if (addStroke.wiggle?.enabled && addStroke.wiggle.amplitude > 0) {
          renderWiggleStroke(ctx, path.segments, addStroke.width, {
            amplitude: addStroke.wiggle.amplitude,
            frequency: addStroke.wiggle.frequency,
            seed: addStroke.wiggle.seed,
            taperStart: addStroke.wiggle.taperStart,
            taperEnd: addStroke.wiggle.taperEnd,
          })
        } else if (addStroke.widthProfile && addStroke.widthProfile.length > 0) {
          renderVariableStroke(ctx, path, addStroke, path2d)
        } else {
          ctx.stroke(path2d)
        }
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
  applyTransform(ctx, layer.transform, { width: layer.width, height: layer.height })

  ctx.drawImage(rasterCanvas, 0, 0)
  ctx.restore()
}

function renderGroupLayer(ctx: CanvasRenderingContext2D, group: GroupLayer) {
  ctx.save()
  applyTransform(ctx, group.transform)

  for (const child of group.children) {
    renderLayer(ctx, child)
  }

  ctx.restore()
}

/**
 * Resolve the effective layers for a symbol instance, applying component
 * property values, active variant overrides, and per-layer overrides at
 * render time (never mutates stored data).
 */
export function resolveSymbolLayers(instance: SymbolInstanceLayer, symbolDef: SymbolDefinition): Layer[] {
  const layers: Layer[] = JSON.parse(JSON.stringify(symbolDef.layers))

  // 1. Collect effective property values: defaults -> variant -> instance overrides
  const effectiveProps: Record<string, string | boolean> = {}
  for (const prop of symbolDef.componentProperties ?? []) {
    effectiveProps[prop.id] = prop.defaultValue
  }
  // Apply variant property values
  if (instance.activeVariant && symbolDef.variants) {
    const variant = symbolDef.variants.find((v) => v.name === instance.activeVariant)
    if (variant) {
      for (const [k, v] of Object.entries(variant.propertyValues)) {
        effectiveProps[k] = v
      }
    }
  }
  // Apply instance-level property overrides (highest priority)
  if (instance.propertyValues) {
    for (const [k, v] of Object.entries(instance.propertyValues)) {
      effectiveProps[k] = v
    }
  }

  // 2. Apply component property effects to target layers
  const layerMap = new Map<string, Layer>()
  function indexLayers(ls: Layer[]) {
    for (const l of ls) {
      layerMap.set(l.id, l)
      if (l.type === 'group') indexLayers(l.children)
    }
  }
  indexLayers(layers)

  for (const prop of symbolDef.componentProperties ?? []) {
    const val = effectiveProps[prop.id]
    if (prop.targetLayerId) {
      const target = layerMap.get(prop.targetLayerId)
      if (!target) continue
      if (prop.type === 'boolean') {
        target.visible = val === true || val === 'true'
      } else if (prop.type === 'text' && target.type === 'text') {
        ;(target as TextLayer).text = String(val)
      }
    }
  }

  // 3. Apply variant layer overrides
  if (instance.activeVariant && symbolDef.variants) {
    const variant = symbolDef.variants.find((v) => v.name === instance.activeVariant)
    if (variant) {
      for (const [layerId, overrides] of Object.entries(variant.layerOverrides)) {
        const target = layerMap.get(layerId)
        if (!target) continue
        if (overrides.visible !== undefined) target.visible = overrides.visible
        if (overrides.opacity !== undefined) target.opacity = overrides.opacity
        if (overrides.fill !== undefined && target.type === 'vector') {
          ;(target as VectorLayer).fill = overrides.fill as Fill | null
        }
        if (overrides.text !== undefined && target.type === 'text') {
          ;(target as TextLayer).text = overrides.text
        }
      }
    }
  }

  // 4. Resolve slot content — replace slot group children with injected content
  function resolveSlots(ls: Layer[]) {
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i]!
      if (l.type === 'group') {
        const group = l as GroupLayer
        if (group.isSlot && group.slotName) {
          const injected = instance.slotContent?.[group.slotName]
          if (injected && injected.length > 0) {
            // Replace group children with injected content (deep clone)
            group.children = JSON.parse(JSON.stringify(injected))
          }
          // else: keep original children as default content
        }
        // Recurse into children (whether replaced or default)
        resolveSlots(group.children)
      }
    }
  }
  resolveSlots(layers)

  // 5. Apply instance-level per-layer overrides (existing overrides field)
  if (instance.overrides) {
    for (const [layerId, overrides] of Object.entries(instance.overrides)) {
      const target = layerMap.get(layerId)
      if (!target) continue
      if (overrides.visible !== undefined) target.visible = overrides.visible
      if (overrides.opacity !== undefined) target.opacity = overrides.opacity
      if (overrides.fill !== undefined && target.type === 'vector') {
        ;(target as VectorLayer).fill = overrides.fill as Fill | null
      }
    }
  }

  return layers
}

function renderSymbolInstanceLayer(ctx: CanvasRenderingContext2D, layer: SymbolInstanceLayer) {
  const state = useEditorStore.getState()
  const symbolDef = (state.document.symbols ?? []).find((s) => s.id === layer.symbolId)
  if (!symbolDef) return

  ctx.save()
  applyTransform(ctx, layer.transform)

  const resolvedLayers = resolveSymbolLayers(layer, symbolDef)
  for (const child of resolvedLayers) {
    if (child.visible) renderLayer(ctx, child)
  }

  ctx.restore()
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
  } else if (layer.mask && layer.maskType === 'alpha') {
    // Alpha / luminance mask: use the brightness of the mask layer as alpha
    const maskCanvas = new OffscreenCanvas(artboardWidth, artboardHeight)
    const maskCtx = maskCanvas.getContext('2d')!
    renderLayerContent(maskCtx, layer.mask)

    // Render the actual layer content
    const contentCanvas = new OffscreenCanvas(artboardWidth, artboardHeight)
    const contentCtx = contentCanvas.getContext('2d')!
    renderLayerContent(contentCtx, layer)

    // Apply luminance of mask as alpha to content
    const maskData = maskCtx.getImageData(0, 0, artboardWidth, artboardHeight)
    const contentData = contentCtx.getImageData(0, 0, artboardWidth, artboardHeight)
    const mPix = maskData.data
    const cPix = contentData.data
    for (let i = 0; i < mPix.length; i += 4) {
      // Luminance: 0.299*R + 0.587*G + 0.114*B
      const luminance = (0.299 * mPix[i]! + 0.587 * mPix[i + 1]! + 0.114 * mPix[i + 2]!) / 255
      // Multiply the mask alpha by the luminance for full control
      const maskAlpha = (mPix[i + 3]! / 255) * luminance
      cPix[i + 3] = Math.round(cPix[i + 3]! * maskAlpha)
    }
    contentCtx.putImageData(contentData, 0, 0)

    ctx.save()
    ctx.globalCompositeOperation = blendModeToComposite(layer.blendMode)
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(contentCanvas, 0, 0)
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
    case 'symbol-instance':
      renderSymbolInstanceLayer(ctx as CanvasRenderingContext2D, layer)
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

function renderArtboard(ctx: CanvasRenderingContext2D, artboard: Artboard, selectedLayerIds: string[], zoom: number) {
  const effectiveW = getEffectiveWidth(artboard)
  const effectiveH = artboard.height
  const effectiveLayers = getEffectiveLayers(artboard)

  // Transparency checkerboard behind artboard
  ctx.save()
  ctx.fillStyle = getCheckerboardPattern(ctx)
  ctx.fillRect(artboard.x, artboard.y, effectiveW, effectiveH)
  ctx.restore()

  // Artboard background
  ctx.fillStyle = artboard.backgroundColor
  ctx.fillRect(artboard.x, artboard.y, effectiveW, effectiveH)

  // Artboard border
  ctx.strokeStyle = '#555'
  ctx.lineWidth = 1
  ctx.strokeRect(artboard.x, artboard.y, effectiveW, effectiveH)

  // Artboard label (constant screen size regardless of zoom)
  ctx.save()
  const fontSize = 12 / zoom
  ctx.fillStyle = '#888'
  ctx.font = `${fontSize}px sans-serif`
  ctx.fillText(artboard.name, artboard.x, artboard.y - 6 / zoom)

  // Responsive width indicator when a breakpoint is active
  if (artboard.activeBreakpointId && artboard.breakpoints) {
    const activeBp = artboard.breakpoints.find((b) => b.id === artboard.activeBreakpointId)
    if (activeBp) {
      const indicatorFontSize = 10 / zoom
      ctx.font = `${indicatorFontSize}px sans-serif`
      const label = `${activeBp.name} \u2014 ${activeBp.width}px`
      const labelW = ctx.measureText(label).width
      const indicatorX = artboard.x + effectiveW / 2 - labelW / 2 - 4 / zoom
      const indicatorY = artboard.y - 22 / zoom
      const pillH = 14 / zoom
      const pillW = labelW + 8 / zoom
      ctx.fillStyle = 'rgba(74, 125, 255, 0.15)'
      ctx.beginPath()
      ctx.roundRect(indicatorX, indicatorY, pillW, pillH, 3 / zoom)
      ctx.fill()
      ctx.fillStyle = '#4a7dff'
      ctx.fillText(label, artboard.x + effectiveW / 2 - labelW / 2, artboard.y - 12 / zoom)
    }
  }
  ctx.restore()

  // Check if any adjustment layers present
  const hasAdjustments = effectiveLayers.some((l) => l.type === 'adjustment' && l.visible)

  if (hasAdjustments) {
    renderArtboardWithAdjustments(ctx, artboard, effectiveLayers, effectiveW, effectiveH, selectedLayerIds)
  } else {
    renderArtboardDirect(ctx, artboard, effectiveLayers, effectiveW, effectiveH, selectedLayerIds)
  }
}

function renderArtboardDirect(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  layers: Layer[],
  width: number,
  height: number,
  selectedLayerIds: string[],
) {
  ctx.save()
  ctx.translate(artboard.x, artboard.y)
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()

  for (const layer of layers) {
    renderLayerWithEffects(ctx, layer, width, height)
  }

  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  for (const layer of layers) {
    if (!selectedLayerIds.includes(layer.id)) continue
    if (layer.type === 'vector') renderSelectionOutline(ctx, layer)
  }

  ctx.restore()
}

function renderArtboardWithAdjustments(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  layers: Layer[],
  width: number,
  height: number,
  selectedLayerIds: string[],
) {
  // Render to offscreen canvas so we can apply pixel-level adjustments
  const offscreen = new OffscreenCanvas(width, height)
  const offCtx = offscreen.getContext('2d')!

  offCtx.fillStyle = artboard.backgroundColor
  offCtx.fillRect(0, 0, width, height)

  for (const layer of layers) {
    if (!layer.visible) continue

    if (layer.type === 'adjustment') {
      // Apply adjustment to current pixel state
      const imageData = offCtx.getImageData(0, 0, width, height)
      applyAdjustment(imageData, layer as AdjustmentLayer)
      offCtx.putImageData(imageData, 0, 0)
    } else {
      // Render layer using the offscreen context (cast is safe — same drawing API)
      renderLayerWithEffects(offCtx as unknown as CanvasRenderingContext2D, layer, width, height)
    }
  }

  // Draw the composited result onto the main canvas
  ctx.drawImage(offscreen, artboard.x, artboard.y)

  // Selection outlines on main canvas (not affected by adjustments)
  ctx.save()
  ctx.translate(artboard.x, artboard.y)
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()

  for (const layer of layers) {
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

// ─── Auto-layout group overlay ────────────────────────────────

function renderAutoLayoutOverlay(
  ctx: CanvasRenderingContext2D,
  artboard: Artboard,
  selectedLayerIds: string[],
  zoom: number,
) {
  for (const layer of artboard.layers) {
    if (!selectedLayerIds.includes(layer.id)) continue
    if (layer.type !== 'group') continue
    const group = layer as GroupLayer
    if (!group.autoLayout) continue

    const bbox = getLayerBBox(group, artboard)
    if (bbox.minX === Infinity) continue

    const config = group.autoLayout
    const lineWidth = 1 / zoom

    ctx.save()

    // Outer dashed outline (auto-layout indicator)
    ctx.strokeStyle = '#ff8800'
    ctx.lineWidth = lineWidth
    ctx.setLineDash([4 / zoom, 3 / zoom])
    ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
    ctx.setLineDash([])

    // Direction indicator arrow
    const cx = (bbox.minX + bbox.maxX) / 2
    const cy = (bbox.minY + bbox.maxY) / 2
    const arrowLen = 12 / zoom
    ctx.strokeStyle = 'rgba(255, 136, 0, 0.6)'
    ctx.lineWidth = 1.5 / zoom
    ctx.beginPath()
    if (config.direction === 'horizontal') {
      ctx.moveTo(cx - arrowLen, cy)
      ctx.lineTo(cx + arrowLen, cy)
      ctx.moveTo(cx + arrowLen - 3 / zoom, cy - 3 / zoom)
      ctx.lineTo(cx + arrowLen, cy)
      ctx.lineTo(cx + arrowLen - 3 / zoom, cy + 3 / zoom)
    } else {
      ctx.moveTo(cx, cy - arrowLen)
      ctx.lineTo(cx, cy + arrowLen)
      ctx.moveTo(cx - 3 / zoom, cy + arrowLen - 3 / zoom)
      ctx.lineTo(cx, cy + arrowLen)
      ctx.lineTo(cx + 3 / zoom, cy + arrowLen - 3 / zoom)
    }
    ctx.stroke()

    // Padding area (subtle inner rectangle)
    const padLeft = config.paddingLeft
    const padTop = config.paddingTop
    const padRight = config.paddingRight
    const padBottom = config.paddingBottom
    const innerX = bbox.minX + padLeft
    const innerY = bbox.minY + padTop
    const innerW = bbox.maxX - bbox.minX - padLeft - padRight
    const innerH = bbox.maxY - bbox.minY - padTop - padBottom
    if (innerW > 0 && innerH > 0) {
      ctx.strokeStyle = 'rgba(255, 136, 0, 0.25)'
      ctx.lineWidth = 0.5 / zoom
      ctx.setLineDash([2 / zoom, 2 / zoom])
      ctx.strokeRect(innerX, innerY, innerW, innerH)
      ctx.setLineDash([])
    }

    // "Auto" label
    ctx.save()
    const labelX = bbox.minX
    const labelY = bbox.minY - 4 / zoom
    ctx.translate(labelX, labelY)
    ctx.scale(1 / zoom, 1 / zoom)
    ctx.fillStyle = '#ff8800'
    ctx.font = '9px sans-serif'
    ctx.fillText(`Auto ${config.direction === 'horizontal' ? 'H' : 'V'} | gap:${config.gap}`, 0, 0)
    ctx.restore()

    ctx.restore()
  }
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

      const handleSize = Math.min(10, Math.max(4, 6 / zoom))
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

  const artboard = useEditorStore.getState().document.artboards.find((a) => a.id === pen.artboardId)
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
      ctx.bezierCurveTo(preview.lastHandle.x, preview.lastHandle.y, pp.x, pp.y, pp.x, pp.y)
    } else {
      // No previous handle — straight line preview
      ctx.lineTo(pp.x, pp.y)
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.restore()
}

function drawHandle(ctx: CanvasRenderingContext2D, px: number, py: number, hx: number, hy: number, radius: number) {
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
    const layer = artboard.layers.find((l) => l.id === selectedLayerId)
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
            let prevX = 0,
              prevY = 0
            for (let j = i - 1; j >= 0; j--) {
              const prev = path.segments[j]!
              if (prev.type !== 'close') {
                prevX = prev.x
                prevY = prev.y
                break
              }
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

// ─── Prototype flow overlay ──────────────────────────────────────

/** Collect all layers with interactions across all artboards */
function collectAllInteractiveLayers(
  doc: DesignDocument,
): Array<{ artboard: Artboard; layer: Layer; interactions: Interaction[] }> {
  const result: Array<{ artboard: Artboard; layer: Layer; interactions: Interaction[] }> = []
  for (const artboard of doc.artboards) {
    collectLayersRecursive(artboard, artboard.layers, result)
  }
  return result
}

function collectLayersRecursive(
  artboard: Artboard,
  layers: Layer[],
  result: Array<{ artboard: Artboard; layer: Layer; interactions: Interaction[] }>,
) {
  for (const layer of layers) {
    if (layer.interactions && layer.interactions.length > 0) {
      result.push({ artboard, layer, interactions: layer.interactions })
    }
    if (layer.type === 'group') {
      collectLayersRecursive(artboard, (layer as GroupLayer).children, result)
    }
  }
}

/** Render prototype flow overlay: arrows from interactive layers to target artboards */
function renderPrototypeFlowOverlay(ctx: CanvasRenderingContext2D, doc: DesignDocument, zoom: number) {
  const interactiveLayers = collectAllInteractiveLayers(doc)
  if (interactiveLayers.length === 0) return

  ctx.save()

  // Draw interaction indicators on layers
  for (const { artboard, layer, interactions } of interactiveLayers) {
    const bbox = getLayerBBox(layer, artboard)
    if (bbox.minX === Infinity) continue

    const cx = (bbox.minX + bbox.maxX) / 2
    const cy = (bbox.minY + bbox.maxY) / 2

    // Draw interaction trigger icon (blue lightning bolt)
    const iconSize = 12 / zoom
    ctx.save()
    ctx.translate(bbox.maxX - iconSize * 0.5, bbox.minY - iconSize * 0.5)
    ctx.scale(1 / zoom, 1 / zoom)

    // Blue circle background
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, Math.PI * 2)
    ctx.fillStyle = '#4a7dff'
    ctx.fill()

    // Lightning bolt
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u26A1', 0, 0)
    ctx.restore()

    // Draw blue outline around the interactive layer
    ctx.save()
    ctx.strokeStyle = '#4a7dff'
    ctx.lineWidth = 2 / zoom
    ctx.setLineDash([4 / zoom, 3 / zoom])
    ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
    ctx.setLineDash([])
    ctx.restore()

    // Draw arrows to target artboards
    for (const ix of interactions) {
      let targetArtboardId: string | null = null
      if (ix.action.type === 'navigate') {
        targetArtboardId = ix.action.targetArtboardId
      } else if (ix.action.type === 'overlay') {
        targetArtboardId = ix.action.targetArtboardId
      }

      if (!targetArtboardId) continue

      const targetArtboard = doc.artboards.find((a) => a.id === targetArtboardId)
      if (!targetArtboard) continue

      // Target center
      const tx = targetArtboard.x + targetArtboard.width / 2
      const ty = targetArtboard.y + targetArtboard.height / 2

      // Arrow from layer center to target artboard center
      const startX = cx
      const startY = cy

      // Calculate arrow end (stop a bit before the target center)
      const dx = tx - startX
      const dy = ty - startY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 10) continue

      const endX = tx - (dx / dist) * 30
      const endY = ty - (dy / dist) * 30

      // Draw curved arrow
      ctx.save()
      ctx.strokeStyle = '#4a7dff'
      ctx.lineWidth = 2 / zoom
      ctx.globalAlpha = 0.7

      // Bezier control point offset for a slight curve
      const midX = (startX + endX) / 2
      const midY = (startY + endY) / 2
      const perpX = -(dy / dist) * 40
      const perpY = (dx / dist) * 40
      const cpX = midX + perpX
      const cpY = midY + perpY

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.quadraticCurveTo(cpX, cpY, endX, endY)
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(endY - cpY, endX - cpX)
      const arrowLen = 8 / zoom
      ctx.beginPath()
      ctx.moveTo(endX, endY)
      ctx.lineTo(endX - arrowLen * Math.cos(angle - 0.4), endY - arrowLen * Math.sin(angle - 0.4))
      ctx.lineTo(endX - arrowLen * Math.cos(angle + 0.4), endY - arrowLen * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fillStyle = '#4a7dff'
      ctx.fill()

      ctx.restore()
    }
  }

  // Highlight flow starting artboards
  for (const artboard of doc.artboards) {
    if (artboard.flowStarting) {
      ctx.save()
      ctx.strokeStyle = '#00cc88'
      ctx.lineWidth = 3 / zoom
      ctx.setLineDash([8 / zoom, 4 / zoom])
      ctx.strokeRect(
        artboard.x - 2 / zoom,
        artboard.y - 2 / zoom,
        artboard.width + 4 / zoom,
        artboard.height + 4 / zoom,
      )
      ctx.setLineDash([])

      // "Start" label
      ctx.translate(artboard.x, artboard.y - 14 / zoom)
      ctx.scale(1 / zoom, 1 / zoom)
      ctx.fillStyle = '#00cc88'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText('\u25B6 Flow Start', 0, 0)
      ctx.restore()
    }
  }

  ctx.restore()
}
