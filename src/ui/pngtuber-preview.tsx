import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, Artboard } from '@/types'
import { segmentsToPath2D } from '@/math/path'
import { getRasterCanvas } from '@/store/raster-data'

function collectAllLayers(layers: Layer[]): Layer[] {
  const result: Layer[] = []
  for (const layer of layers) {
    result.push(layer)
    if (layer.type === 'group') {
      result.push(...collectAllLayers(layer.children))
    }
  }
  return result
}

/** Determine which layers are visible for a given expression. */
function getVisibleLayersForExpression(layers: Layer[], expression: string): Layer[] {
  return layers.filter((layer) => {
    if (!layer.visible) return false
    // If the layer has no expression set (or 'all'), it's always visible
    if (!layer.pngtuberExpression) return true
    return layer.pngtuberExpression === expression
  })
}

/** Render a single layer to a canvas context at the given offset. */
function renderLayerToContext(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  artboard: Artboard,
  offsetX: number,
  offsetY: number,
  scale: number,
) {
  ctx.save()
  ctx.globalAlpha = layer.opacity
  const tx = (layer.transform.x - artboard.x + offsetX) * scale
  const ty = (layer.transform.y - artboard.y + offsetY) * scale
  ctx.translate(tx, ty)
  ctx.scale(layer.transform.scaleX * scale, layer.transform.scaleY * scale)
  if (layer.transform.rotation) {
    ctx.rotate((layer.transform.rotation * Math.PI) / 180)
  }

  if (layer.type === 'vector') {
    for (const path of layer.paths) {
      const p2d = segmentsToPath2D(path.segments)
      if (layer.fill) {
        ctx.fillStyle = layer.fill.color ?? '#000'
        ctx.globalAlpha = layer.opacity * (layer.fill.opacity ?? 1)
        ctx.fill(p2d, path.fillRule ?? 'nonzero')
      }
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke.color ?? '#000'
        ctx.lineWidth = layer.stroke.width / scale
        ctx.globalAlpha = layer.opacity * (layer.stroke.opacity ?? 1)
        ctx.stroke(p2d)
      }
    }
  } else if (layer.type === 'raster') {
    const rasterCanvas = getRasterCanvas(layer.imageChunkId)
    if (rasterCanvas) {
      ctx.drawImage(rasterCanvas, 0, 0, layer.width / scale, layer.height / scale)
    }
  } else if (layer.type === 'text') {
    ctx.font = `${layer.fontStyle} ${layer.fontWeight} ${layer.fontSize / scale}px ${layer.fontFamily}`
    ctx.fillStyle = layer.color
    ctx.textAlign = layer.textAlign as CanvasTextAlign
    ctx.fillText(layer.text, 0, layer.fontSize / scale)
  }

  ctx.restore()
}

export function PNGTuberPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const document = useEditorStore((s) => s.document)
  const viewport = useEditorStore((s) => s.viewport)
  const config = document.pngtuber

  const expressions = config?.expressions ?? ['idle', 'talking', 'happy', 'sad', 'surprised']
  const defaultExpression = config?.defaultExpression ?? 'idle'

  const [activeExpression, setActiveExpression] = useState(defaultExpression)
  const [simulateTalking, setSimulateTalking] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })
  const talkingRef = useRef(false)

  // Get active artboard
  const activeArtboardId = viewport.artboardId ?? document.artboards[0]?.id
  const artboard = document.artboards.find((a) => a.id === activeArtboardId)

  // Collect all layers (flattened)
  const allLayers = useMemo(() => {
    if (!artboard) return []
    return collectAllLayers(artboard.layers)
  }, [artboard])

  // Filter visible layers for current expression
  const visibleLayers = useMemo(
    () => getVisibleLayersForExpression(allLayers, activeExpression),
    [allLayers, activeExpression],
  )

  // Simulate talking: rapidly switch between idle and talking
  useEffect(() => {
    talkingRef.current = simulateTalking
    if (!simulateTalking) {
      return
    }

    let toggle = false
    const interval = setInterval(() => {
      if (!talkingRef.current) return
      toggle = !toggle
      setActiveExpression(toggle ? 'talking' : 'idle')
    }, 200)

    return () => clearInterval(interval)
  }, [simulateTalking])

  // Mouse parallax handler
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    setMousePos({ x, y })
  }, [])

  // Render the preview
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !artboard) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const previewSize = 200
    canvas.width = previewSize
    canvas.height = previewSize

    const scaleX = previewSize / artboard.width
    const scaleY = previewSize / artboard.height
    const scale = Math.min(scaleX, scaleY)

    const offsetX = (previewSize / scale - artboard.width) / 2
    const offsetY = (previewSize / scale - artboard.height) / 2

    // Clear
    ctx.clearRect(0, 0, previewSize, previewSize)

    // Draw artboard background
    ctx.fillStyle = artboard.backgroundColor || '#ffffff'
    ctx.fillRect(offsetX * scale, offsetY * scale, artboard.width * scale, artboard.height * scale)

    // Sort layers by parallax depth (background first)
    const sorted = [...visibleLayers].sort((a, b) => (a.parallaxDepth ?? 0) - (b.parallaxDepth ?? 0))

    // Render each visible layer with parallax offset
    const parallaxMaxShift = 8 // max pixels of shift at depth=1
    const mx = (mousePos.x - 0.5) * 2 // -1 to 1
    const my = (mousePos.y - 0.5) * 2

    for (const layer of sorted) {
      const depth = layer.parallaxDepth ?? 0
      const px = mx * depth * parallaxMaxShift
      const py = my * depth * parallaxMaxShift

      ctx.save()
      ctx.translate(px, py)

      // Simple rendering for preview
      renderLayerToContext(ctx, layer, artboard, offsetX, offsetY, scale)

      ctx.restore()
    }
  }, [artboard, visibleLayers, mousePos])

  if (!config?.enabled) {
    return (
      <div
        style={{
          padding: '16px 8px',
          textAlign: 'center',
          fontSize: 'var(--font-size-sm, 12px)',
          color: 'var(--text-tertiary)',
        }}
      >
        PNGtuber mode is not enabled
      </div>
    )
  }

  const sectionStyle: React.CSSProperties = {
    padding: '8px',
    borderBottom: '1px solid var(--border-color, #333)',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '3px 8px',
    fontSize: '11px',
    background: 'var(--button-bg, #3a3a3a)',
    color: 'var(--text-primary, #eee)',
    border: '1px solid var(--border-color, #444)',
    borderRadius: '3px',
    cursor: 'pointer',
  }

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: 'var(--accent-bg, #3366cc)',
    borderColor: 'var(--accent-color, #4488ee)',
  }

  return (
    <div style={{ fontSize: 'var(--font-size-sm, 12px)', color: 'var(--text-primary, #eee)' }}>
      {/* Preview Canvas */}
      <div style={{ ...sectionStyle, display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={200}
          height={200}
          onMouseMove={handleMouseMove}
          style={{
            width: 200,
            height: 200,
            border: '1px solid var(--border-color, #444)',
            borderRadius: '4px',
            cursor: 'crosshair',
            background: '#111',
          }}
        />
      </div>

      {/* Expression Switcher */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary, #aaa)',
            marginBottom: '4px',
            fontWeight: 'bold',
          }}
        >
          Expression
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {expressions.map((expr) => (
            <button
              key={expr}
              style={activeExpression === expr ? activeButtonStyle : buttonStyle}
              onClick={() => {
                setSimulateTalking(false)
                setActiveExpression(expr)
              }}
            >
              {expr}
            </button>
          ))}
        </div>
      </div>

      {/* Simulate Talking */}
      <div style={sectionStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={simulateTalking}
            onChange={(e) => {
              setSimulateTalking(e.target.checked)
              if (!e.target.checked) {
                setActiveExpression(defaultExpression)
              }
            }}
          />
          <span>Simulate Talking</span>
        </label>
      </div>

      {/* Visible Layers Info */}
      <div style={sectionStyle}>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary, #aaa)',
            marginBottom: '4px',
            fontWeight: 'bold',
          }}
        >
          Visible Layers ({visibleLayers.length})
        </div>
        <div style={{ maxHeight: '120px', overflow: 'auto' }}>
          {visibleLayers.map((layer) => (
            <div
              key={layer.id}
              style={{
                padding: '2px 4px',
                fontSize: '11px',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-color, #222)',
              }}
            >
              <span>{layer.name}</span>
              <span style={{ color: 'var(--text-tertiary, #666)' }}>
                {layer.pngtuberTag ?? ''}
                {layer.parallaxDepth !== undefined ? ` d=${layer.parallaxDepth.toFixed(1)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
