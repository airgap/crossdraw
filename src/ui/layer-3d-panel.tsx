import { useState, useRef, useCallback, useEffect } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, VectorLayer, RasterLayer, TextLayer, GroupLayer } from '@/types'
import { segmentsToPath2D } from '@/math/path'
import { getRasterCanvas } from '@/store/raster-data'

// ── Layer rendering ─────────────────────────────────────────

const MAX_RENDER_DIM = 400

function applyLayerTransform(
  ctx: CanvasRenderingContext2D,
  t: {
    x: number
    y: number
    scaleX: number
    scaleY: number
    rotation: number
    anchorX?: number
    anchorY?: number
    skewX?: number
    skewY?: number
  },
  bounds?: { width: number; height: number },
) {
  ctx.translate(t.x, t.y)
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
      ctx.transform(1, Math.tan(((t.skewY ?? 0) * Math.PI) / 180), Math.tan(((t.skewX ?? 0) * Math.PI) / 180), 1, 0, 0)
    }
    ctx.translate(-ox, -oy)
  } else {
    ctx.scale(t.scaleX, t.scaleY)
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
    if (t.skewX || t.skewY) {
      ctx.transform(1, Math.tan(((t.skewY ?? 0) * Math.PI) / 180), Math.tan(((t.skewX ?? 0) * Math.PI) / 180), 1, 0, 0)
    }
  }
}

/** Render a single layer's visual content to a canvas context (in artboard space). */
function renderLayerPreview(ctx: CanvasRenderingContext2D, layer: Layer) {
  if (!layer.visible) return
  ctx.save()
  ctx.globalAlpha = layer.opacity

  switch (layer.type) {
    case 'vector': {
      const vl = layer as VectorLayer
      let localW = 100,
        localH = 100
      for (const p of vl.paths) {
        for (const seg of p.segments) {
          if ('x' in seg) {
            if (seg.x > localW) localW = seg.x
            if (seg.y > localH) localH = seg.y
          }
        }
      }
      applyLayerTransform(ctx, vl.transform, { width: localW, height: localH })
      for (const path of vl.paths) {
        const path2d = segmentsToPath2D(path.segments)
        if (vl.fill) {
          ctx.globalAlpha = layer.opacity * (vl.fill.opacity ?? 1)
          if (vl.fill.type === 'solid' && vl.fill.color) {
            ctx.fillStyle = vl.fill.color
            ctx.fill(path2d, path.fillRule ?? 'nonzero')
          } else if (vl.fill.type === 'gradient' && vl.fill.gradient) {
            const g = vl.fill.gradient
            // Approximate bbox for gradient
            let minX = Infinity,
              minY = Infinity,
              maxX = -Infinity,
              maxY = -Infinity
            for (const seg of path.segments) {
              if ('x' in seg) {
                if (seg.x < minX) minX = seg.x
                if (seg.x > maxX) maxX = seg.x
                if (seg.y < minY) minY = seg.y
                if (seg.y > maxY) maxY = seg.y
              }
            }
            if (!isFinite(minX)) break
            const bw = maxX - minX || 100
            const bh = maxY - minY || 100
            let canvasGrad: CanvasGradient | null = null
            if (g.type === 'linear') {
              const angle = ((g.angle ?? 0) * Math.PI) / 180
              const cx = minX + bw / 2
              const cy = minY + bh / 2
              const len = Math.max(bw, bh) / 2
              canvasGrad = ctx.createLinearGradient(
                cx - Math.cos(angle) * len,
                cy - Math.sin(angle) * len,
                cx + Math.cos(angle) * len,
                cy + Math.sin(angle) * len,
              )
            } else if (g.type === 'radial') {
              const cx = minX + bw / 2
              const cy = minY + bh / 2
              canvasGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(bw, bh) / 2)
            }
            if (canvasGrad && g.stops) {
              for (const stop of g.stops) {
                canvasGrad.addColorStop(stop.offset, stop.color)
              }
              ctx.fillStyle = canvasGrad
              ctx.fill(path2d, path.fillRule ?? 'nonzero')
            }
          }
        }
        if (vl.stroke) {
          ctx.strokeStyle = vl.stroke.color
          ctx.lineWidth = vl.stroke.width
          ctx.lineCap = vl.stroke.linecap
          ctx.lineJoin = vl.stroke.linejoin
          ctx.globalAlpha = layer.opacity * (vl.stroke.opacity ?? 1)
          if (vl.stroke.dasharray) ctx.setLineDash(vl.stroke.dasharray)
          ctx.stroke(path2d)
          ctx.setLineDash([])
        }
      }
      break
    }
    case 'raster': {
      const rl = layer as RasterLayer
      const rasterCanvas = getRasterCanvas(rl.imageChunkId)
      if (rasterCanvas) {
        applyLayerTransform(ctx, rl.transform, { width: rl.width, height: rl.height })
        ctx.drawImage(rasterCanvas, 0, 0)
      }
      break
    }
    case 'text': {
      const tl = layer as TextLayer
      applyLayerTransform(ctx, tl.transform)
      const fontStyle = tl.fontStyle === 'italic' ? 'italic ' : ''
      const fontWeight = tl.fontWeight === 'bold' ? 'bold ' : ''
      ctx.font = `${fontStyle}${fontWeight}${tl.fontSize}px ${tl.fontFamily}`
      ctx.fillStyle = tl.color
      ctx.textBaseline = 'top'
      const lines = tl.text.split('\n')
      const lineH = tl.fontSize * (tl.lineHeight ?? 1.4)
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, 0, i * lineH)
      }
      break
    }
    case 'group': {
      const gl = layer as GroupLayer
      applyLayerTransform(ctx, gl.transform)
      for (const child of gl.children) {
        renderLayerPreview(ctx, child)
      }
      break
    }
  }

  ctx.restore()
}

// ── Helpers ─────────────────────────────────────────────────────

function flattenLayers(layers: Layer[], depth: number = 0): Array<{ layer: Layer; depth: number }> {
  const result: Array<{ layer: Layer; depth: number }> = []
  for (const layer of layers) {
    result.push({ layer, depth })
    if (layer.type === 'group') {
      result.push(...flattenLayers((layer as GroupLayer).children ?? [], depth + 1))
    }
  }
  return result
}

// ── Component ──────────────────────────────────────────────────

export function Layer3DPanel() {
  const document = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)
  const selectLayer = useEditorStore((s) => s.selectLayer)

  const artboard = document.artboards[0]
  const layers = artboard?.layers ?? []
  const flatLayers = flattenLayers(layers)

  // Camera rotation state
  const [rotX, setRotX] = useState(-25)
  const [rotY, setRotY] = useState(35)
  const [spacing, setSpacing] = useState(30)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, rotX: 0, rotY: 0 })
  const canvasRefs = useRef(new Map<string, HTMLCanvasElement>())

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-layer-id]')) return
      dragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY, rotX, rotY }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [rotX, rotY],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setRotY(dragStart.current.rotY + dx * 0.5)
    setRotX(Math.max(-90, Math.min(90, dragStart.current.rotX - dy * 0.5)))
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // Artboard dimensions
  const abW = artboard?.width ?? 400
  const abH = artboard?.height ?? 400
  const renderScale = Math.min(1, MAX_RENDER_DIM / Math.max(abW, abH, 1))
  const cW = Math.ceil(abW * renderScale)
  const cH = Math.ceil(abH * renderScale)
  const displayScale = 180 / Math.max(abW, abH, 1)

  // Render layer content to canvases
  useEffect(() => {
    for (const { layer } of flatLayers) {
      if (!layer.visible || layer.type === 'group') continue
      const canvas = canvasRefs.current.get(layer.id)
      if (!canvas) continue
      if (canvas.width !== cW || canvas.height !== cH) {
        canvas.width = cW
        canvas.height = cH
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.clearRect(0, 0, cW, cH)
      ctx.save()
      ctx.scale(renderScale, renderScale)
      renderLayerPreview(ctx, layer)
      ctx.restore()
    }
  })

  const setRef = useCallback(
    (id: string) => (el: HTMLCanvasElement | null) => {
      if (el) canvasRefs.current.set(id, el)
      else canvasRefs.current.delete(id)
    },
    [],
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
        background: 'var(--bg-surface)',
      }}
    >
      {/* Controls */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 10,
          color: 'var(--text-secondary)',
        }}
      >
        <span>Spacing</span>
        <input
          type="range"
          min={5}
          max={80}
          value={spacing}
          onChange={(e) => setSpacing(Number(e.target.value))}
          style={{ flex: 1, height: 12, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', minWidth: 24 }}>{spacing}</span>
      </div>

      {/* 3D Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          flex: 1,
          perspective: 800,
          perspectiveOrigin: '50% 50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: dragging.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            position: 'relative',
            width: abW * displayScale,
            height: abH * displayScale,
          }}
        >
          {flatLayers.map(({ layer, depth }, i) => {
            if (!layer.visible) return null
            const isSelected = selection.layerIds.includes(layer.id)
            const zOffset = (flatLayers.length - 1 - i) * spacing
            const isGroup = layer.type === 'group'

            return (
              <div
                key={layer.id}
                data-layer-id={layer.id}
                onClick={(e) => {
                  e.stopPropagation()
                  selectLayer(layer.id)
                }}
                title={layer.name}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: abW * displayScale,
                  height: abH * displayScale,
                  transform: `translateZ(${zOffset}px)`,
                  border: isSelected
                    ? '2px solid var(--accent)'
                    : isGroup
                      ? '1px dashed rgba(255,255,255,0.15)'
                      : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 2,
                  boxShadow: isSelected ? '0 0 12px var(--accent)' : 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  transition: 'border 0.15s, box-shadow 0.15s',
                  overflow: 'hidden',
                  marginLeft: depth * 2,
                }}
              >
                {isGroup ? (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 4,
                      fontSize: 8,
                      color: 'var(--text-disabled)',
                      textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      lineHeight: '10px',
                    }}
                  >
                    {layer.name}
                  </span>
                ) : (
                  <canvas
                    ref={setRef(layer.id)}
                    width={cW}
                    height={cH}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
