import { useEditorStore } from '@/store/editor.store'
import { useRef, useCallback } from 'react'

const MINIMAP_WIDTH = 150
const MINIMAP_HEIGHT = 100

/**
 * Mini-map overlay showing a scaled-down view of the artboard
 * with a viewport indicator rectangle.
 */
export function MiniMap({ viewportWidth, viewportHeight }: { viewportWidth: number; viewportHeight: number }) {
  const artboard = useEditorStore((s) => s.document.artboards[0])
  const viewport = useEditorStore((s) => s.viewport)
  const setPan = useEditorStore((s) => s.setPan)
  const mapRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!artboard || !mapRef.current) return
      const rect = mapRef.current.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Convert minimap coords to document coords
      const scale = Math.min(MINIMAP_WIDTH / artboard.width, MINIMAP_HEIGHT / artboard.height)
      const docX = mx / scale
      const docY = my / scale

      // Center viewport on this point
      const newPanX = viewportWidth / 2 - docX * viewport.zoom
      const newPanY = viewportHeight / 2 - docY * viewport.zoom
      setPan(newPanX, newPanY)
    },
    [artboard, viewport.zoom, viewportWidth, viewportHeight, setPan],
  )

  if (!artboard) return null

  const scale = Math.min(MINIMAP_WIDTH / artboard.width, MINIMAP_HEIGHT / artboard.height)
  const mapW = artboard.width * scale
  const mapH = artboard.height * scale

  // Viewport indicator rectangle
  const vpX = (-viewport.panX / viewport.zoom) * scale
  const vpY = (-viewport.panY / viewport.zoom) * scale
  const vpW = (viewportWidth / viewport.zoom) * scale
  const vpH = (viewportHeight / viewport.zoom) * scale

  return (
    <div
      ref={mapRef}
      onClick={handleClick}
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        opacity: 0.9,
      }}
    >
      {/* Artboard representation */}
      <div
        style={{
          position: 'absolute',
          left: (MINIMAP_WIDTH - mapW) / 2,
          top: (MINIMAP_HEIGHT - mapH) / 2,
          width: mapW,
          height: mapH,
          background: artboard.backgroundColor,
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Layer representations (simplified dots/rects) */}
        {artboard.layers
          .filter((l) => l.visible)
          .map((layer) => {
            const lx = layer.transform.x * scale
            const ly = layer.transform.y * scale
            return (
              <div
                key={layer.id}
                style={{
                  position: 'absolute',
                  left: lx,
                  top: ly,
                  width: Math.max(2, 4),
                  height: Math.max(2, 4),
                  background: 'var(--text-secondary)',
                  borderRadius: 1,
                }}
              />
            )
          })}
      </div>

      {/* Viewport indicator */}
      <div
        style={{
          position: 'absolute',
          left: (MINIMAP_WIDTH - mapW) / 2 + vpX,
          top: (MINIMAP_HEIGHT - mapH) / 2 + vpY,
          width: Math.min(vpW, MINIMAP_WIDTH),
          height: Math.min(vpH, MINIMAP_HEIGHT),
          border: '1.5px solid var(--accent)',
          borderRadius: 1,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/**
 * Calculate the minimap viewport indicator dimensions.
 */
export function calcMinimapViewport(
  artboardW: number,
  artboardH: number,
  viewportW: number,
  viewportH: number,
  zoom: number,
  panX: number,
  panY: number,
  mapW: number,
  mapH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(mapW / artboardW, mapH / artboardH)
  return {
    x: (-panX / zoom) * scale,
    y: (-panY / zoom) * scale,
    w: (viewportW / zoom) * scale,
    h: (viewportH / zoom) * scale,
  }
}
