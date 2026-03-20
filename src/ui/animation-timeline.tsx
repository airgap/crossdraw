import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { v4 as uuid } from 'uuid'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import {
  startAnimation,
  stopAnimation,
  setAnimationTime,
  isAnimationPlaying,
  getAnimationCurrentTime,
  subscribeAnimation,
  getMaxDuration,
} from '@/animation/animator'
import type { AnimationTrack, Keyframe, KeyframeProperties, Layer, VectorLayer } from '@/types'

// ── Helpers ──

function formatTime(ms: number): string {
  const s = ms / 1000
  if (s < 1) return `${Math.round(ms)}ms`
  return `${s.toFixed(1)}s`
}

function findLayer(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const found = findLayer(l.children, id)
      if (found) return found
    }
  }
  return null
}

function getAnimatedLayers(doc: {
  artboards: { id: string; layers: Layer[] }[]
}): Array<{ layer: Layer; artboardId: string }> {
  const result: Array<{ layer: Layer; artboardId: string }> = []
  for (const ab of doc.artboards) {
    const collect = (layers: Layer[]) => {
      for (const l of layers) {
        if (l.animation && l.animation.keyframes.length > 0) {
          result.push({ layer: l, artboardId: ab.id })
        }
        if (l.type === 'group') collect(l.children)
      }
    }
    collect(ab.layers)
  }
  return result
}

// ── Constants ──

const TRACK_HEIGHT = 28
const HEADER_HEIGHT = 30
const RULER_HEIGHT = 24
const TIME_LABEL_WIDTH = 140
const KEYFRAME_SIZE = 10

// ── Easing menu items ──

const EASING_OPTIONS: Keyframe['easing'][] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'spring']

// ── Component ──

export function AnimationTimeline() {
  const doc = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)
  const updateLayer = useEditorStore((s) => s.updateLayer)

  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    keyframeId: string
    layerId: string
    artboardId: string
  } | null>(null)
  const [dragKeyframe, setDragKeyframe] = useState<{
    keyframeId: string
    layerId: string
    artboardId: string
    startX: number
    startTime: number
  } | null>(null)

  const trackAreaRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(600)

  // Subscribe to animation state
  useEffect(() => {
    return subscribeAnimation(() => {
      setPlaying(isAnimationPlaying())
      setCurrentTime(getAnimationCurrentTime())
    })
  }, [])

  // Measure track width
  useEffect(() => {
    const el = trackAreaRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxDuration = useMemo(() => getMaxDuration(), [doc])

  const animatedLayers = useMemo(() => getAnimatedLayers(doc), [doc])

  // Also include selected layers that don't have animation yet
  const displayLayers = useMemo(() => {
    const layerMap = new Map<string, { layer: Layer; artboardId: string }>()
    for (const al of animatedLayers) {
      layerMap.set(al.layer.id, al)
    }
    // Add selected layers
    for (const layerId of selection.layerIds) {
      if (!layerMap.has(layerId)) {
        for (const ab of doc.artboards) {
          const layer = findLayer(ab.layers, layerId)
          if (layer) {
            layerMap.set(layerId, { layer, artboardId: ab.id })
            break
          }
        }
      }
    }
    return Array.from(layerMap.values())
  }, [animatedLayers, selection.layerIds, doc])

  const msToX = useCallback(
    (ms: number) => {
      return (ms / maxDuration) * trackWidth
    },
    [maxDuration, trackWidth],
  )

  const xToMs = useCallback(
    (x: number) => {
      return Math.max(0, Math.min(maxDuration, (x / trackWidth) * maxDuration))
    },
    [maxDuration, trackWidth],
  )

  // ── Play/Pause ──

  const handlePlayPause = useCallback(() => {
    if (playing) {
      stopAnimation()
    } else {
      startAnimation()
    }
  }, [playing])

  // ── Scrubber click ──

  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const ms = xToMs(x)
      setAnimationTime(ms)
      setCurrentTime(ms)
    },
    [xToMs],
  )

  // ── Add keyframe ──

  const handleAddKeyframe = useCallback(() => {
    if (selection.layerIds.length === 0) return
    const layerId = selection.layerIds[0]!
    const artboard = getActiveArtboard()
    if (!artboard) return

    const layer = findLayer(artboard.layers, layerId)
    if (!layer) return

    const time = currentTime

    // Capture current layer state as keyframe properties
    const properties: KeyframeProperties = {
      x: layer.transform.x,
      y: layer.transform.y,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation,
      opacity: layer.opacity,
    }

    // Capture fill/stroke color if vector
    if (layer.type === 'vector') {
      const vl = layer as VectorLayer
      if (vl.fill?.color) properties.fillColor = vl.fill.color
      if (vl.stroke?.color) properties.strokeColor = vl.stroke.color
    }

    const newKeyframe: Keyframe = {
      id: uuid(),
      time: Math.round(time),
      easing: 'ease-in-out',
      properties,
    }

    const existingTrack = layer.animation
    const track: AnimationTrack = existingTrack
      ? {
          ...existingTrack,
          keyframes: [...existingTrack.keyframes, newKeyframe],
        }
      : {
          duration: maxDuration,
          loop: false,
          keyframes: [newKeyframe],
        }

    updateLayer(artboard.id, layerId, { animation: track } as Partial<Layer>)
  }, [selection, doc, currentTime, maxDuration, updateLayer])

  // ── Delete keyframe ──

  const handleDeleteKeyframe = useCallback(() => {
    if (!selectedKeyframeId) return

    for (const ab of doc.artboards) {
      const deleteFromLayers = (layers: Layer[]): boolean => {
        for (const layer of layers) {
          if (layer.animation) {
            const idx = layer.animation.keyframes.findIndex((kf) => kf.id === selectedKeyframeId)
            if (idx >= 0) {
              const newKeyframes = layer.animation.keyframes.filter((kf) => kf.id !== selectedKeyframeId)
              const track: AnimationTrack | undefined =
                newKeyframes.length > 0 ? { ...layer.animation, keyframes: newKeyframes } : undefined
              updateLayer(ab.id, layer.id, { animation: track } as Partial<Layer>)
              setSelectedKeyframeId(null)
              return true
            }
          }
          if (layer.type === 'group') {
            if (deleteFromLayers(layer.children)) return true
          }
        }
        return false
      }
      if (deleteFromLayers(ab.layers)) break
    }
  }, [selectedKeyframeId, doc, updateLayer])

  // ── Toggle loop for selected layer ──

  const handleToggleLoop = useCallback(() => {
    if (selection.layerIds.length === 0) return
    const layerId = selection.layerIds[0]!
    for (const ab of doc.artboards) {
      const layer = findLayer(ab.layers, layerId)
      if (layer && layer.animation) {
        updateLayer(ab.id, layerId, {
          animation: { ...layer.animation, loop: !layer.animation.loop },
        } as Partial<Layer>)
        break
      }
    }
  }, [selection, doc, updateLayer])

  // ── Duration change ──

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const ms = Math.max(100, parseInt(e.target.value, 10) || 1000)
      if (selection.layerIds.length === 0) return
      const layerId = selection.layerIds[0]!
      for (const ab of doc.artboards) {
        const layer = findLayer(ab.layers, layerId)
        if (layer && layer.animation) {
          updateLayer(ab.id, layerId, {
            animation: { ...layer.animation, duration: ms },
          } as Partial<Layer>)
          break
        }
      }
    },
    [selection, doc, updateLayer],
  )

  // ── Keyframe drag ──

  const handleKeyframeMouseDown = useCallback(
    (e: React.MouseEvent, kf: Keyframe, layerId: string, artboardId: string) => {
      e.stopPropagation()
      e.preventDefault()
      setSelectedKeyframeId(kf.id)

      if (e.button === 2) {
        // Right-click -> context menu
        setContextMenu({ x: e.clientX, y: e.clientY, keyframeId: kf.id, layerId, artboardId })
        return
      }

      setDragKeyframe({
        keyframeId: kf.id,
        layerId,
        artboardId,
        startX: e.clientX,
        startTime: kf.time,
      })
    },
    [],
  )

  // Drag move/up via window listeners
  useEffect(() => {
    if (!dragKeyframe) return

    const onMove = (e: MouseEvent) => {
      const trackEl = trackAreaRef.current
      if (!trackEl) return
      const deltaX = e.clientX - dragKeyframe.startX
      const deltaMs = (deltaX / trackWidth) * maxDuration
      const newTime = Math.max(0, Math.min(maxDuration, Math.round(dragKeyframe.startTime + deltaMs)))

      // Update the keyframe time
      const layer = (() => {
        for (const ab of doc.artboards) {
          if (ab.id === dragKeyframe.artboardId) {
            return findLayer(ab.layers, dragKeyframe.layerId)
          }
        }
        return null
      })()

      if (layer && layer.animation) {
        const newKeyframes = layer.animation.keyframes.map((kf) =>
          kf.id === dragKeyframe.keyframeId ? { ...kf, time: newTime } : kf,
        )
        updateLayer(dragKeyframe.artboardId, dragKeyframe.layerId, {
          animation: { ...layer.animation, keyframes: newKeyframes },
        } as Partial<Layer>)
      }
    }

    const onUp = () => {
      setDragKeyframe(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragKeyframe, doc, maxDuration, trackWidth, updateLayer])

  // ── Set easing from context menu ──

  const handleSetEasing = useCallback(
    (easing: Keyframe['easing']) => {
      if (!contextMenu) return
      const { keyframeId, layerId, artboardId } = contextMenu
      const layer = (() => {
        for (const ab of doc.artboards) {
          if (ab.id === artboardId) return findLayer(ab.layers, layerId)
        }
        return null
      })()

      if (layer && layer.animation) {
        const newKeyframes = layer.animation.keyframes.map((kf) => (kf.id === keyframeId ? { ...kf, easing } : kf))
        updateLayer(artboardId, layerId, {
          animation: { ...layer.animation, keyframes: newKeyframes },
        } as Partial<Layer>)
      }
      setContextMenu(null)
    },
    [contextMenu, doc, updateLayer],
  )

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [contextMenu])

  // ── Get selected layer's track info ──

  const selectedLayer = useMemo(() => {
    if (selection.layerIds.length === 0) return null
    for (const ab of doc.artboards) {
      const layer = findLayer(ab.layers, selection.layerIds[0]!)
      if (layer) return layer
    }
    return null
  }, [selection, doc])

  const selectedTrack = selectedLayer?.animation

  // ── Ruler tick marks ──

  const rulerTicks = useMemo(() => {
    const ticks: Array<{ ms: number; label: string }> = []
    // Adaptive tick spacing
    let step = 100
    if (maxDuration > 2000) step = 250
    if (maxDuration > 5000) step = 500
    if (maxDuration > 10000) step = 1000
    if (maxDuration > 30000) step = 5000

    for (let ms = 0; ms <= maxDuration; ms += step) {
      ticks.push({ ms, label: formatTime(ms) })
    }
    return ticks
  }, [maxDuration])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 120,
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 'var(--font-size-sm)',
        userSelect: 'none',
      }}
    >
      {/* Controls bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
          height: HEADER_HEIGHT,
        }}
      >
        {/* Play/Pause */}
        <button
          onClick={handlePlayPause}
          title={playing ? 'Pause' : 'Play'}
          style={{
            background: playing ? 'var(--bg-active)' : 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {playing ? '\u23F8' : '\u25B6'}
        </button>

        {/* Current time display */}
        <span style={{ color: 'var(--text-secondary)', minWidth: 60 }}>{formatTime(currentTime)}</span>

        {/* Add Keyframe */}
        <button
          onClick={handleAddKeyframe}
          title="Add Keyframe at current time"
          disabled={selection.layerIds.length === 0}
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: selection.layerIds.length > 0 ? 'var(--text-primary)' : 'var(--text-disabled)',
            cursor: selection.layerIds.length > 0 ? 'pointer' : 'default',
            padding: '2px 8px',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          + Keyframe
        </button>

        {/* Delete Keyframe */}
        <button
          onClick={handleDeleteKeyframe}
          title="Delete selected keyframe"
          disabled={!selectedKeyframeId}
          style={{
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: selectedKeyframeId ? 'var(--text-primary)' : 'var(--text-disabled)',
            cursor: selectedKeyframeId ? 'pointer' : 'default',
            padding: '2px 8px',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Delete
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Duration input */}
        <label style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Duration:
          <input
            type="number"
            min={100}
            step={100}
            value={selectedTrack?.duration ?? maxDuration}
            onChange={handleDurationChange}
            style={{
              width: 60,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              padding: '1px 4px',
              fontSize: 'var(--font-size-sm)',
            }}
          />
          ms
        </label>

        {/* Loop toggle */}
        <button
          onClick={handleToggleLoop}
          title="Toggle loop"
          style={{
            background: selectedTrack?.loop ? 'var(--bg-active)' : 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: selectedTrack?.loop ? '#fff' : 'var(--text-primary)',
            cursor: 'pointer',
            padding: '2px 8px',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Loop
        </button>
      </div>

      {/* Timeline area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Layer names column */}
        <div
          style={{
            width: TIME_LABEL_WIDTH,
            flexShrink: 0,
            borderRight: '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}
        >
          {/* Ruler placeholder */}
          <div style={{ height: RULER_HEIGHT, borderBottom: '1px solid var(--border-subtle)' }} />

          {/* Layer names */}
          {displayLayers.map(({ layer }) => (
            <div
              key={layer.id}
              style={{
                height: TRACK_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                borderBottom: '1px solid var(--border-subtle)',
                color: selection.layerIds.includes(layer.id) ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: selection.layerIds.includes(layer.id) ? 'var(--bg-hover)' : 'transparent',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 11,
              }}
            >
              {layer.name}
              {layer.animation?.loop && (
                <span style={{ marginLeft: 4, color: 'var(--text-disabled)', fontSize: 9 }}>[loop]</span>
              )}
            </div>
          ))}
        </div>

        {/* Track area with ruler */}
        <div
          ref={trackAreaRef}
          style={{
            flex: 1,
            overflow: 'auto',
            position: 'relative',
          }}
        >
          {/* Time ruler */}
          <div
            onClick={handleRulerClick}
            style={{
              height: RULER_HEIGHT,
              borderBottom: '1px solid var(--border-subtle)',
              position: 'sticky',
              top: 0,
              background: 'var(--bg-surface)',
              zIndex: 2,
              cursor: 'pointer',
            }}
          >
            {rulerTicks.map(({ ms, label }) => (
              <div
                key={ms}
                style={{
                  position: 'absolute',
                  left: msToX(ms),
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 1,
                    height: ms % 1000 === 0 ? 12 : 6,
                    background: 'var(--text-disabled)',
                    marginTop: 'auto',
                  }}
                />
                {ms % (maxDuration > 5000 ? 1000 : 500) === 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      fontSize: 9,
                      color: 'var(--text-disabled)',
                      whiteSpace: 'nowrap',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {label}
                  </span>
                )}
              </div>
            ))}

            {/* Scrubber head */}
            <div
              style={{
                position: 'absolute',
                left: msToX(currentTime),
                top: 0,
                width: 0,
                height: '100%',
                borderLeft: '2px solid #ff4444',
                zIndex: 3,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: -5,
                  width: 0,
                  height: 0,
                  borderLeft: '5px solid transparent',
                  borderRight: '5px solid transparent',
                  borderTop: '6px solid #ff4444',
                }}
              />
            </div>
          </div>

          {/* Tracks */}
          {displayLayers.map(({ layer, artboardId }) => {
            const track = layer.animation
            const keyframes = track?.keyframes ?? []

            return (
              <div
                key={layer.id}
                style={{
                  height: TRACK_HEIGHT,
                  borderBottom: '1px solid var(--border-subtle)',
                  position: 'relative',
                  background: selection.layerIds.includes(layer.id) ? 'rgba(74, 125, 255, 0.04)' : 'transparent',
                }}
                onClick={(e) => {
                  // Click on track -> move scrubber
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const ms = xToMs(x)
                  setAnimationTime(ms)
                  setCurrentTime(ms)
                }}
              >
                {/* Track line */}
                <div
                  style={{
                    position: 'absolute',
                    top: TRACK_HEIGHT / 2,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: 'var(--border-subtle)',
                  }}
                />

                {/* Keyframe diamonds */}
                {keyframes.map((kf) => (
                  <div
                    key={kf.id}
                    onMouseDown={(e) => handleKeyframeMouseDown(e, kf, layer.id, artboardId)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      handleKeyframeMouseDown(e, kf, layer.id, artboardId)
                    }}
                    title={`${formatTime(kf.time)} (${kf.easing})`}
                    style={{
                      position: 'absolute',
                      left: msToX(kf.time) - KEYFRAME_SIZE / 2,
                      top: (TRACK_HEIGHT - KEYFRAME_SIZE) / 2,
                      width: KEYFRAME_SIZE,
                      height: KEYFRAME_SIZE,
                      transform: 'rotate(45deg)',
                      background:
                        selectedKeyframeId === kf.id ? '#ff8844' : kf.easing === 'spring' ? '#44aaff' : '#ffaa00',
                      border: selectedKeyframeId === kf.id ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
                      borderRadius: 2,
                      cursor: 'pointer',
                      zIndex: 1,
                    }}
                  />
                ))}
              </div>
            )
          })}

          {/* Scrubber line across tracks */}
          <div
            style={{
              position: 'absolute',
              left: msToX(currentTime),
              top: RULER_HEIGHT,
              bottom: 0,
              width: 0,
              borderLeft: '1px solid rgba(255, 68, 68, 0.5)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />

          {/* Empty state */}
          {displayLayers.length === 0 && (
            <div
              style={{
                padding: 16,
                color: 'var(--text-disabled)',
                textAlign: 'center',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Select a layer and click "+ Keyframe" to start animating
            </div>
          )}
        </div>
      </div>

      {/* Context menu for easing */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            padding: '4px 0',
            zIndex: 10000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '4px 12px',
              color: 'var(--text-disabled)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            Easing
          </div>
          {EASING_OPTIONS.map((easing) => (
            <div
              key={easing}
              onClick={() => handleSetEasing(easing)}
              style={{
                padding: '4px 16px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              {easing}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
