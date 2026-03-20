import { useEditorStore, getActiveArtboard } from '@/store/editor.store'

interface ScrollbarProps {
  viewportWidth: number
  viewportHeight: number
}

/**
 * Thin overlay scrollbars for viewport panning.
 */
export function ViewportScrollbars({ viewportWidth, viewportHeight }: ScrollbarProps) {
  const viewport = useEditorStore((s) => s.viewport)
  const setPan = useEditorStore((s) => s.setPan)
  const artboard = getActiveArtboard()

  if (!artboard) return null

  const zoom = viewport.zoom
  const contentW = artboard.width * zoom
  const contentH = artboard.height * zoom

  // Total scrollable extent (content + some padding)
  const extentW = Math.max(contentW + viewportWidth, viewportWidth * 2)
  const extentH = Math.max(contentH + viewportHeight, viewportHeight * 2)

  // Thumb sizes proportional to visible area
  const hThumbW = Math.max(30, (viewportWidth / extentW) * viewportWidth)
  const vThumbH = Math.max(30, (viewportHeight / extentH) * viewportHeight)

  // Thumb positions
  const hOffset = viewportWidth / 2 + viewport.panX
  const hPos = (hOffset / extentW) * (viewportWidth - hThumbW)
  const vOffset = viewportHeight / 2 + viewport.panY
  const vPos = (vOffset / extentH) * (viewportHeight - vThumbH)

  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    background: 'var(--text-secondary)',
    opacity: 0.3,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  }

  const handleHDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startPanX = viewport.panX
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const ratio = extentW / (viewportWidth - hThumbW)
      setPan(startPanX - dx * ratio, viewport.panY)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleVDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startPanY = viewport.panY
    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY
      const ratio = extentH / (viewportHeight - vThumbH)
      setPan(viewport.panX, startPanY - dy * ratio)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      {/* Horizontal scrollbar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 6,
          height: 6,
          pointerEvents: 'none',
        }}
      >
        <div
          onMouseDown={handleHDrag}
          style={{
            ...thumbStyle,
            left: Math.max(0, Math.min(viewportWidth - hThumbW, hPos)),
            top: 0,
            width: hThumbW,
            height: 6,
            pointerEvents: 'auto',
          }}
        />
      </div>

      {/* Vertical scrollbar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 6,
          width: 6,
          pointerEvents: 'none',
        }}
      >
        <div
          onMouseDown={handleVDrag}
          style={{
            ...thumbStyle,
            left: 0,
            top: Math.max(0, Math.min(viewportHeight - vThumbH, vPos)),
            width: 6,
            height: vThumbH,
            pointerEvents: 'auto',
          }}
        />
      </div>
    </>
  )
}

/**
 * Calculate scrollbar thumb position from pan/zoom state.
 */
export function getScrollThumbPosition(
  pan: number,
  viewportSize: number,
  contentSize: number,
  zoom: number,
): { position: number; size: number } {
  const extent = Math.max(contentSize * zoom + viewportSize, viewportSize * 2)
  const thumbSize = Math.max(30, (viewportSize / extent) * viewportSize)
  const offset = viewportSize / 2 + pan
  const position = (offset / extent) * (viewportSize - thumbSize)
  return { position: Math.max(0, Math.min(viewportSize - thumbSize, position)), size: thumbSize }
}
