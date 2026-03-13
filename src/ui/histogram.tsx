import { useState, useEffect, useRef, useCallback } from 'react'

export interface HistogramData {
  red: Uint32Array // 256 bins
  green: Uint32Array // 256 bins
  blue: Uint32Array // 256 bins
  luminance: Uint32Array // 256 bins
}

export function computeHistogram(imageData: ImageData): HistogramData {
  const red = new Uint32Array(256)
  const green = new Uint32Array(256)
  const blue = new Uint32Array(256)
  const luminance = new Uint32Array(256)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    red[r] = (red[r] ?? 0) + 1
    green[g] = (green[g] ?? 0) + 1
    blue[b] = (blue[b] ?? 0) + 1
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    luminance[Math.min(255, lum)] = (luminance[Math.min(255, lum)] ?? 0) + 1
  }

  return { red, green, blue, luminance }
}

export type HistogramChannel = 'rgb' | 'red' | 'green' | 'blue' | 'luminance'

export interface HistogramProps {
  imageData: ImageData | null
  width?: number // default 256
  height?: number // default 100
  channel?: HistogramChannel // default 'luminance'
  style?: React.CSSProperties
}

const CHANNEL_COLORS: Record<Exclude<HistogramChannel, 'rgb'>, string> = {
  red: '#ff4444',
  green: '#44ff44',
  blue: '#4488ff',
  luminance: '#cccccc',
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  bins: Uint32Array,
  maxVal: number,
  width: number,
  height: number,
  color: string,
  alpha: number,
) {
  if (maxVal === 0) return

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, height)

  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * width
    const h = (bins[i]! / maxVal) * height
    ctx.lineTo(x, height - h)
  }

  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

export function Histogram({ imageData, width = 256, height = 100, channel = 'luminance', style }: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [histogram, setHistogram] = useState<HistogramData | null>(null)

  useEffect(() => {
    if (!imageData) {
      setHistogram(null)
      return
    }
    setHistogram(computeHistogram(imageData))
  }, [imageData])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    if (!histogram) return

    if (channel === 'rgb') {
      // Find global max across all three channels for consistent scaling
      let maxVal = 0
      for (let i = 0; i < 256; i++) {
        maxVal = Math.max(maxVal, histogram.red[i]!, histogram.green[i]!, histogram.blue[i]!)
      }

      drawChannel(ctx, histogram.red, maxVal, width, height, '#ff4444', 0.4)
      drawChannel(ctx, histogram.green, maxVal, width, height, '#44ff44', 0.4)
      drawChannel(ctx, histogram.blue, maxVal, width, height, '#4488ff', 0.4)
    } else {
      const bins = histogram[channel]
      let maxVal = 0
      for (let i = 0; i < 256; i++) {
        if (bins[i]! > maxVal) maxVal = bins[i]!
      }

      drawChannel(ctx, bins, maxVal, width, height, CHANNEL_COLORS[channel], 1)
    }
  }, [histogram, width, height, channel])

  useEffect(() => {
    render()
  }, [render])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width,
        height,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm, 4px)',
        display: 'block',
        ...style,
      }}
    />
  )
}
