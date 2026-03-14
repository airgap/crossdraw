import { useState, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, VectorLayer, RasterLayer } from '@/types'

// ── Helpers ─────────────────────────────────────────────────────

function getLayerColor(layer: Layer, index: number): string {
  if (layer.type === 'vector') {
    const vl = layer as VectorLayer
    if (vl.fill?.type === 'solid' && vl.fill.color) return vl.fill.color
  }
  // Fallback: generate a hue from index
  const hue = (index * 47 + 200) % 360
  return `hsl(${hue}, 60%, 55%)`
}

function flattenLayers(layers: Layer[], depth: number = 0): Array<{ layer: Layer; depth: number }> {
  const result: Array<{ layer: Layer; depth: number }> = []
  for (const layer of layers) {
    result.push({ layer, depth })
    if (layer.type === 'group' && 'children' in layer) {
      result.push(...flattenLayers((layer as any).children ?? [], depth + 1))
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
  const containerRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only rotate on background drag, not on layer slabs
      if ((e.target as HTMLElement).dataset.layerId) return
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

  // Artboard dimensions for scaling
  const abW = artboard?.width ?? 400
  const abH = artboard?.height ?? 400
  const maxDim = Math.max(abW, abH, 1)
  const scale = 180 / maxDim // fit into ~180px viewport area

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
        ref={containerRef}
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
            width: abW * scale,
            height: abH * scale,
          }}
        >
          {flatLayers.map(({ layer, depth }, i) => {
            if (!layer.visible) return null
            const isSelected = selection.layerIds.includes(layer.id)
            const zOffset = (flatLayers.length - 1 - i) * spacing
            const color = getLayerColor(layer, i)

            // Layer bounds in artboard space
            const t = (layer as VectorLayer).transform ?? { x: 0, y: 0 }
            const lx = (t.x ?? 0) * scale
            const ly = (t.y ?? 0) * scale

            // Estimate layer size from paths or use artboard fraction
            let lw = abW * scale * 0.6
            let lh = abH * scale * 0.15
            if (layer.type === 'vector') {
              const vl = layer as VectorLayer
              if (vl.paths.length > 0) {
                let minX = Infinity,
                  minY = Infinity,
                  maxX = -Infinity,
                  maxY = -Infinity
                for (const p of vl.paths) {
                  for (const seg of p.segments) {
                    if ('x' in seg && 'y' in seg) {
                      if (seg.x < minX) minX = seg.x
                      if (seg.y < minY) minY = seg.y
                      if (seg.x > maxX) maxX = seg.x
                      if (seg.y > maxY) maxY = seg.y
                    }
                  }
                }
                if (isFinite(minX)) {
                  lw = Math.max(4, (maxX - minX) * scale * (vl.transform.scaleX ?? 1))
                  lh = Math.max(4, (maxY - minY) * scale * (vl.transform.scaleY ?? 1))
                }
              }
            }
            if (layer.type === 'raster') {
              const rl = layer as RasterLayer
              lw = (rl.width ?? 100) * scale
              lh = (rl.height ?? 100) * scale
            }

            const opacity = layer.opacity ?? 1

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
                  left: lx,
                  top: ly,
                  width: lw,
                  height: lh,
                  transform: `translateZ(${zOffset}px)`,
                  background: color,
                  opacity: opacity * 0.85,
                  border: isSelected ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 2,
                  boxShadow: isSelected ? '0 0 12px var(--accent)' : '0 1px 4px rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: 2,
                  boxSizing: 'border-box',
                  transition: 'border 0.15s, box-shadow 0.15s',
                  marginLeft: depth * 4,
                }}
              >
                <span
                  style={{
                    fontSize: 8,
                    color: '#fff',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                    lineHeight: '10px',
                  }}
                >
                  {layer.name}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
