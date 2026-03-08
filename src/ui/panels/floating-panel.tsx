import React, { Suspense, useCallback, useRef } from 'react'
import { usePanelLayoutStore, type FloatingPanel as FloatingPanelType } from './panel-layout-store'
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

  // Drag state
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handleTitleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: panel.x,
      origY: panel.y,
    }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      updatePosition(panel.tabId, dragRef.current.origX + dx, dragRef.current.origY + dy)
    }

    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panel.tabId, panel.x, panel.y, updatePosition])

  // Resize from edges/corners
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, edge: ResizeEdge) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const origX = panel.x
    const origY = panel.y
    const origW = panel.width
    const origH = panel.height

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY

      let newX = origX
      let newY = origY
      let newW = origW
      let newH = origH

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
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panel, updatePosition, updateSize])

  if (!def) return null

  const edgeSize = 5

  return (
    <div style={{
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
    }}>
      {/* Title bar */}
      <div
        onMouseDown={handleTitleMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          cursor: 'grab',
          userSelect: 'none',
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
          <Suspense fallback={<div style={{ padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>}>
            <Component />
          </Suspense>
        )}
      </div>

      {/* Resize edges */}
      {/* North */}
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'n')} style={{ position: 'absolute', top: 0, left: edgeSize, right: edgeSize, height: edgeSize, cursor: 'n-resize' }} />
      {/* South */}
      <div onMouseDown={(e) => handleResizeMouseDown(e, 's')} style={{ position: 'absolute', bottom: 0, left: edgeSize, right: edgeSize, height: edgeSize, cursor: 's-resize' }} />
      {/* East */}
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'e')} style={{ position: 'absolute', top: edgeSize, right: 0, bottom: edgeSize, width: edgeSize, cursor: 'e-resize' }} />
      {/* West */}
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'w')} style={{ position: 'absolute', top: edgeSize, left: 0, bottom: edgeSize, width: edgeSize, cursor: 'w-resize' }} />
      {/* Corners */}
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'nw')} style={{ position: 'absolute', top: 0, left: 0, width: edgeSize, height: edgeSize, cursor: 'nw-resize' }} />
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'ne')} style={{ position: 'absolute', top: 0, right: 0, width: edgeSize, height: edgeSize, cursor: 'ne-resize' }} />
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'sw')} style={{ position: 'absolute', bottom: 0, left: 0, width: edgeSize, height: edgeSize, cursor: 'sw-resize' }} />
      <div onMouseDown={(e) => handleResizeMouseDown(e, 'se')} style={{ position: 'absolute', bottom: 0, right: 0, width: edgeSize, height: edgeSize, cursor: 'se-resize' }} />
    </div>
  )
}
