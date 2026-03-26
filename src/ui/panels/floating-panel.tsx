import React, { Suspense, useCallback, useRef, useEffect } from 'react'
import { usePanelLayoutStore, type FloatingPanel as FloatingPanelType } from './panel-layout-store'
import { usePanelDragStore } from './panel-drag'
import { getPanelDefinition } from './panel-registry'

interface FloatingPanelProps {
  panel: FloatingPanelType
}

const MIN_WIDTH = 200
const MIN_HEIGHT = 150

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function FloatingPanel({ panel }: FloatingPanelProps) {
  const updatePosition = usePanelLayoutStore((s) => s.updateFloatingPosition)
  const updateSize = usePanelLayoutStore((s) => s.updateFloatingSize)
  const dockPanel = usePanelLayoutStore((s) => s.dockPanel)
  const closeFloating = usePanelLayoutStore((s) => s.closeFloating)

  const def = getPanelDefinition(panel.tabId)
  const Component = def?.component

  // Drag state — uses document listeners so pointer events reach drop zones
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const handleTitlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      cleanupRef.current?.()

      const startX = e.clientX
      const startY = e.clientY
      const origX = panel.x
      const origY = panel.y
      let started = false

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY

        // Always update floating panel position
        updatePosition(panel.tabId, origX + dx, origY + dy)

        // Start panel drag after threshold for dock detection
        if (!started && Math.sqrt(dx * dx + dy * dy) > 5) {
          started = true
          usePanelDragStore.getState().startDrag(panel.tabId, 'floating', 0, ev.clientX, ev.clientY)
        }

        if (started) {
          usePanelDragStore.getState().updatePosition(ev.clientX, ev.clientY)
        }
      }

      const handleUp = () => {
        cleanup()
        // Drop resolution is handled by PanelShell's global pointerup handler
      }

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove)
        document.removeEventListener('pointerup', handleUp)
        cleanupRef.current = null
      }

      cleanupRef.current = cleanup
      document.addEventListener('pointermove', handleMove)
      document.addEventListener('pointerup', handleUp)
    },
    [panel.x, panel.y, panel.tabId, updatePosition],
  )

  // Resize from edges/corners
  const resizeRef = useRef<{
    edge: ResizeEdge
    startX: number
    startY: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, edge: ResizeEdge) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      resizeRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        origX: panel.x,
        origY: panel.y,
        origW: panel.width,
        origH: panel.height,
      }
    },
    [panel],
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!resizeRef.current) return
      const { edge, startX, startY, origX, origY, origW, origH } = resizeRef.current
      const dx = e.clientX - startX
      const dy = e.clientY - startY

      let newX = origX,
        newY = origY,
        newW = origW,
        newH = origH
      if (edge.includes('e')) newW = Math.max(MIN_WIDTH, origW + dx)
      if (edge.includes('w')) {
        newW = Math.max(MIN_WIDTH, origW - dx)
        newX = origX + origW - newW
      }
      if (edge.includes('s')) newH = Math.max(MIN_HEIGHT, origH + dy)
      if (edge.includes('n')) {
        newH = Math.max(MIN_HEIGHT, origH - dy)
        newY = origY + origH - newH
      }

      updatePosition(panel.tabId, newX, newY)
      updateSize(panel.tabId, newW, newH)
    },
    [panel.tabId, updatePosition, updateSize],
  )

  const handleResizePointerUp = useCallback(() => {
    resizeRef.current = null
  }, [])

  if (!def) return null

  const edgeSize = 5

  return (
    <div
      style={{
        position: 'absolute',
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        onPointerDown={handleTitlePointerDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
          flexShrink: 0,
          minHeight: 28,
        }}
      >
        <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{def.icon}</span>
          {def.label}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => dockPanel(panel.tabId, 'right')}
            title="Dock to right column"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            {'\u25A3'}
          </button>
          <button
            onClick={() => closeFloating(panel.tabId)}
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 2px',
              lineHeight: 1,
            }}
          >
            {'\u2715'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {Component && (
          <Suspense
            fallback={<div style={{ padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>}
          >
            <Component />
          </Suspense>
        )}
      </div>

      {/* Resize edges */}
      {(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'] as ResizeEdge[]).map((edge) => {
        const isH = edge === 'n' || edge === 's'
        const isV = edge === 'e' || edge === 'w'
        const style: React.CSSProperties = {
          position: 'absolute',
          cursor: `${edge}-resize`,
          ...(isH
            ? { left: edgeSize, right: edgeSize, height: edgeSize, ...(edge === 'n' ? { top: 0 } : { bottom: 0 }) }
            : isV
              ? { top: edgeSize, bottom: edgeSize, width: edgeSize, ...(edge === 'e' ? { right: 0 } : { left: 0 }) }
              : {
                  width: edgeSize,
                  height: edgeSize,
                  ...(edge.includes('n') ? { top: 0 } : { bottom: 0 }),
                  ...(edge.includes('e') ? { right: 0 } : { left: 0 }),
                }),
        }
        return (
          <div
            key={edge}
            onPointerDown={(e) => handleResizePointerDown(e, edge)}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            style={style}
          />
        )
      })}
    </div>
  )
}
