import { useState, useRef, useEffect, useCallback } from 'react'
import { getLayerBBox } from '@/math/bbox'
import type { DesignDocument, Artboard, Layer, Interaction, Transition } from '@/types'

interface Props {
  document: DesignDocument
  startArtboardId: string
  onClose: () => void
}

interface HistoryItem {
  artboardId: string
}

/** Easing functions */
function getEasing(easing: Transition['easing']): string {
  switch (easing) {
    case 'linear':
      return 'linear'
    case 'ease-in':
      return 'cubic-bezier(0.42, 0, 1, 1)'
    case 'ease-out':
      return 'cubic-bezier(0, 0, 0.58, 1)'
    case 'ease-in-out':
      return 'cubic-bezier(0.42, 0, 0.58, 1)'
    default:
      return 'linear'
  }
}

/** Get CSS transform for a transition type (entering state) */
function getTransitionEnterFrom(type: Transition['type']): string {
  switch (type) {
    case 'slide-left':
      return 'translateX(100%)'
    case 'slide-right':
      return 'translateX(-100%)'
    case 'slide-up':
      return 'translateY(100%)'
    case 'slide-down':
      return 'translateY(-100%)'
    case 'push-left':
      return 'translateX(100%)'
    case 'push-right':
      return 'translateX(-100%)'
    default:
      return 'none'
  }
}

/** Get CSS transform for a transition type (exiting state for push) */
function getTransitionExitTo(type: Transition['type']): string {
  switch (type) {
    case 'push-left':
      return 'translateX(-100%)'
    case 'push-right':
      return 'translateX(100%)'
    default:
      return 'none'
  }
}

/** Render an artboard to an offscreen canvas and return it as an ImageBitmap-backed canvas */
function renderArtboardToCanvas(
  doc: DesignDocument,
  artboard: Artboard,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = artboard.width
  canvas.height = artboard.height
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = artboard.backgroundColor
  ctx.fillRect(0, 0, artboard.width, artboard.height)

  // Render layers
  for (const layer of artboard.layers) {
    renderLayerSimple(ctx, layer, doc)
  }

  return canvas
}

/** Simplified layer renderer for prototype player (reuses the same rendering logic as viewport) */
function renderLayerSimple(ctx: CanvasRenderingContext2D, layer: Layer, doc: DesignDocument) {
  if (!layer.visible) return

  ctx.save()
  ctx.globalAlpha = layer.opacity

  const t = layer.transform
  ctx.translate(t.x, t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)
  if (t.skewX || t.skewY) {
    const sx = Math.tan(((t.skewX ?? 0) * Math.PI) / 180)
    const sy = Math.tan(((t.skewY ?? 0) * Math.PI) / 180)
    ctx.transform(1, sy, sx, 1, 0, 0)
  }

  switch (layer.type) {
    case 'vector': {
      // Render fill
      if (layer.fill && layer.fill.type === 'solid' && layer.fill.color) {
        ctx.fillStyle = layer.fill.color
        ctx.globalAlpha = layer.opacity * layer.fill.opacity
        for (const path of layer.paths) {
          const p2d = new Path2D()
          for (const seg of path.segments) {
            switch (seg.type) {
              case 'move':
                p2d.moveTo(seg.x, seg.y)
                break
              case 'line':
                p2d.lineTo(seg.x, seg.y)
                break
              case 'cubic':
                p2d.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y)
                break
              case 'quadratic':
                p2d.quadraticCurveTo(seg.cpx, seg.cpy, seg.x, seg.y)
                break
              case 'close':
                p2d.closePath()
                break
            }
          }
          ctx.fill(p2d, path.fillRule ?? 'nonzero')
        }
      }
      // Render stroke
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke.color
        ctx.lineWidth = layer.stroke.width
        ctx.globalAlpha = layer.opacity * layer.stroke.opacity
        ctx.lineCap = layer.stroke.linecap
        ctx.lineJoin = layer.stroke.linejoin
        for (const path of layer.paths) {
          const p2d = new Path2D()
          for (const seg of path.segments) {
            switch (seg.type) {
              case 'move':
                p2d.moveTo(seg.x, seg.y)
                break
              case 'line':
                p2d.lineTo(seg.x, seg.y)
                break
              case 'cubic':
                p2d.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y)
                break
              case 'quadratic':
                p2d.quadraticCurveTo(seg.cpx, seg.cpy, seg.x, seg.y)
                break
              case 'close':
                p2d.closePath()
                break
            }
          }
          ctx.stroke(p2d)
        }
      }
      break
    }
    case 'text': {
      ctx.font = `${layer.fontStyle === 'italic' ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`
      ctx.fillStyle = layer.color
      ctx.textAlign = layer.textAlign
      ctx.textBaseline = 'top'
      const lines = layer.text.split('\n')
      const lineH = layer.fontSize * layer.lineHeight
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i]!, 0, i * lineH)
      }
      break
    }
    case 'group': {
      for (const child of layer.children) {
        renderLayerSimple(ctx, child, doc)
      }
      break
    }
    case 'raster': {
      // Try to draw from raster store
      try {
        const { getRasterCanvas } = require('@/store/raster-data')
        const rasterCanvas = getRasterCanvas(layer.imageChunkId)
        if (rasterCanvas) {
          ctx.drawImage(rasterCanvas, 0, 0)
        }
      } catch {
        // Raster data not available
      }
      break
    }
    case 'symbol-instance': {
      const symDef = doc.symbols?.find((s) => s.id === layer.symbolId)
      if (symDef) {
        for (const child of symDef.layers) {
          renderLayerSimple(ctx, child, doc)
        }
      }
      break
    }
  }

  ctx.restore()
}

/** Recursively collect all layers with their absolute positions in the artboard */
function collectInteractiveLayers(
  layers: Layer[],
  artboard: Artboard,
  result: Array<{ layer: Layer; interactions: Interaction[] }>,
) {
  for (const layer of layers) {
    if (layer.interactions && layer.interactions.length > 0) {
      result.push({ layer, interactions: layer.interactions })
    }
    if (layer.type === 'group') {
      collectInteractiveLayers(layer.children, artboard, result)
    }
  }
}

/** Check if a point (relative to artboard origin) hits a layer */
function hitTestLayer(layer: Layer, x: number, y: number, artboard: Artboard): boolean {
  const bbox = getLayerBBox(layer, artboard)
  if (bbox.minX === Infinity) {
    // Fallback: use transform position and a rough bounding box
    const t = layer.transform
    const w = 100 // rough estimate
    const h = 100
    return x >= t.x && x <= t.x + w && y >= t.y && y <= t.y + h
  }
  // bbox is in document coords (includes artboard offset), convert to artboard-local
  const lx = bbox.minX - artboard.x
  const ly = bbox.minY - artboard.y
  const lw = bbox.maxX - bbox.minX
  const lh = bbox.maxY - bbox.minY
  return x >= lx && x <= lx + lw && y >= ly && y <= ly + lh
}

export function PrototypePlayer({ document: doc, startArtboardId, onClose }: Props) {
  const [currentArtboardId, setCurrentArtboardId] = useState(startArtboardId)
  const [history, setHistory] = useState<HistoryItem[]>([{ artboardId: startArtboardId }])
  const [transitioning, setTransitioning] = useState(false)
  const [transitionStyle, setTransitionStyle] = useState<{
    entering: React.CSSProperties
    exiting: React.CSSProperties
  } | null>(null)
  const [overlayArtboardId, setOverlayArtboardId] = useState<string | null>(null)
  const [overlayPosition, setOverlayPosition] = useState<'center' | 'top' | 'bottom'>('center')
  const [overlayVisible, setOverlayVisible] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)

  const currentArtboard = doc.artboards.find((a) => a.id === currentArtboardId)
  const overlayArtboard = overlayArtboardId ? doc.artboards.find((a) => a.id === overlayArtboardId) : null

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overlayVisible) {
          setOverlayVisible(false)
          setTimeout(() => setOverlayArtboardId(null), 200)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, overlayVisible])

  // Compute device scale to fit the artboard in the viewport
  const getScale = useCallback(() => {
    if (!currentArtboard || !containerRef.current) return 1
    const containerRect = containerRef.current.getBoundingClientRect()
    const padding = 40
    const scaleX = (containerRect.width - padding * 2) / currentArtboard.width
    const scaleY = (containerRect.height - padding * 2) / currentArtboard.height
    return Math.min(scaleX, scaleY, 1)
  }, [currentArtboard])

  const navigateTo = useCallback(
    (targetArtboardId: string, transition: Transition) => {
      if (transitioning) return
      const targetArtboard = doc.artboards.find((a) => a.id === targetArtboardId)
      if (!targetArtboard) return

      if (transition.type === 'instant') {
        setCurrentArtboardId(targetArtboardId)
        setHistory((prev) => [...prev, { artboardId: targetArtboardId }])
        return
      }

      setTransitioning(true)

      const duration = transition.duration
      const easing = getEasing(transition.easing)

      if (transition.type === 'dissolve') {
        setTransitionStyle({
          entering: {
            opacity: 0,
            transition: `opacity ${duration}ms ${easing}`,
            position: 'absolute',
            inset: 0,
          },
          exiting: {
            opacity: 1,
            transition: `opacity ${duration}ms ${easing}`,
            position: 'absolute',
            inset: 0,
          },
        })

        // Force reflow then animate
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTransitionStyle({
              entering: {
                opacity: 1,
                transition: `opacity ${duration}ms ${easing}`,
                position: 'absolute',
                inset: 0,
              },
              exiting: {
                opacity: 0,
                transition: `opacity ${duration}ms ${easing}`,
                position: 'absolute',
                inset: 0,
              },
            })
          })
        })
      } else {
        // Slide / push transitions
        const enterFrom = getTransitionEnterFrom(transition.type)
        const exitTo = getTransitionExitTo(transition.type)
        const isPush = transition.type.startsWith('push')

        setTransitionStyle({
          entering: {
            transform: enterFrom,
            transition: `transform ${duration}ms ${easing}`,
            position: 'absolute',
            inset: 0,
          },
          exiting: {
            transform: 'translateX(0) translateY(0)',
            transition: isPush ? `transform ${duration}ms ${easing}` : undefined,
            position: 'absolute',
            inset: 0,
          },
        })

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTransitionStyle({
              entering: {
                transform: 'translateX(0) translateY(0)',
                transition: `transform ${duration}ms ${easing}`,
                position: 'absolute',
                inset: 0,
              },
              exiting: {
                transform: isPush ? exitTo : 'translateX(0) translateY(0)',
                transition: isPush ? `transform ${duration}ms ${easing}` : undefined,
                position: 'absolute',
                inset: 0,
              },
            })
          })
        })
      }

      // After transition completes
      setTimeout(() => {
        setCurrentArtboardId(targetArtboardId)
        setHistory((prev) => [...prev, { artboardId: targetArtboardId }])
        setTransitioning(false)
        setTransitionStyle(null)
      }, duration + 20)
    },
    [doc, transitioning],
  )

  const goBack = useCallback(
    (transition: Transition) => {
      if (history.length <= 1) return
      const prevItem = history[history.length - 2]!
      // Remove last entry
      setHistory((prev) => prev.slice(0, -1))
      // Navigate to previous with a reversed transition
      const reversedTransition: Transition = {
        ...transition,
        type: reverseTransitionType(transition.type),
      }
      navigateTo(prevItem.artboardId, reversedTransition)
    },
    [history, navigateTo],
  )

  const handleInteraction = useCallback(
    (interaction: Interaction) => {
      switch (interaction.action.type) {
        case 'navigate':
          navigateTo(interaction.action.targetArtboardId, interaction.action.transition)
          break
        case 'overlay':
          setOverlayArtboardId(interaction.action.targetArtboardId)
          setOverlayPosition(interaction.action.position)
          requestAnimationFrame(() => setOverlayVisible(true))
          break
        case 'back':
          goBack(interaction.action.transition)
          break
        case 'url':
          window.open(interaction.action.url, '_blank')
          break
        case 'scroll-to':
          // Basic scroll-to: not implemented for canvas rendering
          break
      }
    },
    [navigateTo, goBack],
  )

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!currentArtboard || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const scale = getScale()
      const artboardDisplayW = currentArtboard.width * scale
      const artboardDisplayH = currentArtboard.height * scale
      const offsetX = (rect.width - artboardDisplayW) / 2
      const offsetY = (rect.height - artboardDisplayH) / 2

      const clickX = (e.clientX - rect.left - offsetX) / scale
      const clickY = (e.clientY - rect.top - offsetY) / scale

      // Check if click is within artboard bounds
      if (clickX < 0 || clickX > currentArtboard.width || clickY < 0 || clickY > currentArtboard.height) return

      // Find interactive layers (reverse order = topmost first)
      const interactiveLayers: Array<{ layer: Layer; interactions: Interaction[] }> = []
      collectInteractiveLayers(currentArtboard.layers, currentArtboard, interactiveLayers)

      for (let i = interactiveLayers.length - 1; i >= 0; i--) {
        const { layer, interactions } = interactiveLayers[i]!
        if (hitTestLayer(layer, clickX, clickY, currentArtboard)) {
          const clickInteraction = interactions.find((ix) => ix.trigger === 'click')
          if (clickInteraction) {
            handleInteraction(clickInteraction)
            return
          }
        }
      }
    },
    [currentArtboard, getScale, handleInteraction],
  )

  if (!currentArtboard) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div>
          <p>No artboard found to preview.</p>
          <button onClick={onClose} style={closeButtonStyle}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const scale = getScale()
  const artboardCanvas = renderArtboardToCanvas(doc, currentArtboard)

  // If transitioning, also render the target artboard
  let targetCanvas: HTMLCanvasElement | null = null
  if (transitioning && transitionStyle) {
    const nextId = history[history.length - 1]?.artboardId
    if (nextId) {
      const nextArtboard = doc.artboards.find((a) => a.id === nextId)
      if (nextArtboard) {
        targetCanvas = renderArtboardToCanvas(doc, nextArtboard)
      }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 40,
          background: '#222',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#888', fontSize: 13 }}>Prototype Preview</span>
          <span style={{ color: '#555', fontSize: 12 }}>
            {currentArtboard.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => {
              if (history.length > 1) {
                goBack({ type: 'slide-right', duration: 300, easing: 'ease-out' })
              }
            }}
            disabled={history.length <= 1}
            style={{
              ...navButtonStyle,
              opacity: history.length <= 1 ? 0.3 : 1,
            }}
            title="Go back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={() => {
              setCurrentArtboardId(startArtboardId)
              setHistory([{ artboardId: startArtboardId }])
            }}
            style={navButtonStyle}
            title="Restart"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button onClick={onClose} style={closeButtonStyle} title="Close (Escape)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Artboard display area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
        }}
        onClick={handleCanvasClick}
      >
        {/* Current artboard */}
        <div
          style={{
            width: currentArtboard.width * scale,
            height: currentArtboard.height * scale,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 4px 40px rgba(0,0,0,0.5)',
            borderRadius: 2,
          }}
        >
          {/* Transition layers */}
          {transitioning && transitionStyle ? (
            <>
              {/* Exiting (current) artboard */}
              <div style={{ ...transitionStyle.exiting, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArtboardImage canvas={artboardCanvas} scale={scale} />
              </div>
              {/* Entering (next) artboard */}
              {targetCanvas && (
                <div style={{ ...transitionStyle.entering, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ArtboardImage canvas={targetCanvas} scale={scale} />
                </div>
              )}
            </>
          ) : (
            <ArtboardImage canvas={artboardCanvas} scale={scale} />
          )}
        </div>

        {/* Overlay artboard */}
        {overlayArtboard && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: overlayPosition === 'top' ? 'flex-start' : overlayPosition === 'bottom' ? 'flex-end' : 'center',
              justifyContent: 'center',
              background: overlayVisible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
              transition: 'background 200ms ease',
              zIndex: 1,
            }}
            onClick={(e) => {
              e.stopPropagation()
              setOverlayVisible(false)
              setTimeout(() => setOverlayArtboardId(null), 200)
            }}
          >
            <div
              style={{
                transform: overlayVisible ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(20px)',
                opacity: overlayVisible ? 1 : 0,
                transition: 'transform 200ms ease, opacity 200ms ease',
                boxShadow: '0 8px 60px rgba(0,0,0,0.6)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <ArtboardImage
                canvas={renderArtboardToCanvas(doc, overlayArtboard)}
                scale={scale * 0.8}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar - artboard indicator */}
      <div
        style={{
          height: 32,
          background: '#222',
          borderTop: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        {doc.artboards.map((ab) => (
          <div
            key={ab.id}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ab.id === currentArtboardId ? '#4a7dff' : '#555',
              cursor: 'pointer',
              transition: 'background 150ms',
            }}
            title={ab.name}
            onClick={(e) => {
              e.stopPropagation()
              if (ab.id !== currentArtboardId) {
                navigateTo(ab.id, { type: 'dissolve', duration: 200, easing: 'ease-out' })
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

/** Render a canvas element as a scaled image */
function ArtboardImage({ canvas, scale }: { canvas: HTMLCanvasElement; scale: number }) {
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (imgRef.current) {
      imgRef.current.src = canvas.toDataURL()
    }
  }, [canvas])

  return (
    <img
      ref={imgRef}
      alt="Artboard preview"
      style={{
        width: canvas.width * scale,
        height: canvas.height * scale,
        imageRendering: 'auto',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  )
}

function reverseTransitionType(type: Transition['type']): Transition['type'] {
  switch (type) {
    case 'slide-left':
      return 'slide-right'
    case 'slide-right':
      return 'slide-left'
    case 'slide-up':
      return 'slide-down'
    case 'slide-down':
      return 'slide-up'
    case 'push-left':
      return 'push-right'
    case 'push-right':
      return 'push-left'
    default:
      return type
  }
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #555',
  borderRadius: 4,
  color: '#ccc',
  padding: '4px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
}

const navButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#aaa',
  padding: '4px 6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
