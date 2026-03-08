import { useState, useRef, useEffect, useCallback } from 'react'
import { hexToRgba, rgbaToHex, rgbaToHsla, hslaToRgba } from '@/math/color'
import type { HSLA } from '@/math/color'
import { useEditorStore } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'

// ─── HSV helpers (SV square needs HSV, not HSL) ────────────────

interface HSV {
  h: number // 0-360
  s: number // 0-100
  v: number // 0-100
}

function rgbToHsv(r: number, g: number, b: number): HSV {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : (d / max) * 100
  const v = max * 100
  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s, v }
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  s /= 100
  v /= 100
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
    b = 0
  } else if (h < 120) {
    r = x
    g = c
    b = 0
  } else if (h < 180) {
    r = 0
    g = c
    b = x
  } else if (h < 240) {
    r = 0
    g = x
    b = c
  } else if (h < 300) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v)
  return rgbaToHex({ r, g, b, a: 1 })
}

// ─── Recent colors ─────────────────────────────────────────────

const RECENT_KEY = 'crossdraw:recent-colors'
const MAX_RECENT = 12

function loadRecentColors(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    /* empty */
  }
  return []
}

function saveRecentColor(hex: string) {
  const recent = loadRecentColors().filter((c) => c !== hex)
  recent.unshift(hex)
  if (recent.length > MAX_RECENT) recent.length = MAX_RECENT
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

// ─── Palette integration ───────────────────────────────────────

const PALETTE_KEY = 'crossdraw:palette'

function addToPalette(hex: string) {
  let palette: { id: string; name: string; value: string }[] = []
  try {
    const stored = localStorage.getItem(PALETTE_KEY)
    if (stored) palette = JSON.parse(stored)
  } catch {
    /* empty */
  }
  // Don't add duplicates
  if (palette.some((c) => c.value === hex)) return
  palette.push({ id: uuid(), name: 'Custom', value: hex })
  localStorage.setItem(PALETTE_KEY, JSON.stringify(palette))
}

// ─── Types ─────────────────────────────────────────────────────

export interface ColorPickerProps {
  color: string // hex color
  opacity?: number // 0-1, default 1
  onChange: (hex: string, opacity: number) => void
}

type InputMode = 'hex' | 'rgb' | 'hsl'

// ─── Styles ────────────────────────────────────────────────────

const pickerContainerStyle: React.CSSProperties = {
  width: 232,
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-3)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
  fontFamily: 'var(--font-body)',
  userSelect: 'none',
  zIndex: 1000,
}

const sliderTrackStyle: React.CSSProperties = {
  width: '100%',
  height: 16,
  borderRadius: 'var(--radius-md)',
  cursor: 'crosshair',
  position: 'relative',
  border: '1px solid var(--border-default)',
}

const modeButtonStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--accent)' : 'var(--bg-elevated)',
  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-default)'),
  borderRadius: 'var(--radius-sm)',
  color: active ? '#fff' : 'var(--text-secondary)',
  fontSize: 9,
  fontWeight: 600,
  padding: '2px 6px',
  cursor: 'pointer',
  textTransform: 'uppercase' as const,
})

const fieldInputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-mono)',
  padding: '3px 4px',
  width: '100%',
  textAlign: 'center',
  outline: 'none',
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text-secondary)',
  textAlign: 'center',
  marginTop: 2,
}

const swatchStyle = (color: string): React.CSSProperties => ({
  width: 16,
  height: 16,
  borderRadius: 'var(--radius-sm)',
  background: color,
  border: '1px solid var(--border-default)',
  cursor: 'pointer',
  flexShrink: 0,
})

const smallBtnStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-xs)',
  padding: '2px 6px',
  cursor: 'pointer',
}

// ─── SV Square Component ───────────────────────────────────────

function SVSquare({
  hue,
  saturation,
  value,
  onChange,
}: {
  hue: number
  saturation: number
  value: number
  onChange: (s: number, v: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const SIZE = 208

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    // Draw hue background
    const { r, g, b } = hsvToRgb(hue, 100, 100)
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, SIZE, SIZE)
    // White → transparent gradient (horizontal = saturation)
    const whiteGrad = ctx.createLinearGradient(0, 0, SIZE, 0)
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)')
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = whiteGrad
    ctx.fillRect(0, 0, SIZE, SIZE)
    // Transparent → black gradient (vertical = value)
    const blackGrad = ctx.createLinearGradient(0, 0, 0, SIZE)
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)')
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = blackGrad
    ctx.fillRect(0, 0, SIZE, SIZE)

    // Draw indicator
    const cx = (saturation / 100) * SIZE
    const cy = (1 - value / 100) * SIZE
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 7, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [hue, saturation, value])

  const pick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.max(0, Math.min(SIZE, e.clientX - rect.left))
      const y = Math.max(0, Math.min(SIZE, e.clientY - rect.top))
      const s = (x / SIZE) * 100
      const v = (1 - y / SIZE) * 100
      onChange(s, v)
    },
    [onChange],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return
      pick(e as any)
    }
    const handleUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [pick])

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: 4,
        cursor: 'crosshair',
        display: 'block',
        border: '1px solid var(--border-default)',
      }}
      onMouseDown={(e) => {
        dragging.current = true
        pick(e)
      }}
    />
  )
}

// ─── Hue Slider Component ──────────────────────────────────────

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const WIDTH = 208
  const HEIGHT = 16

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const grad = ctx.createLinearGradient(0, 0, WIDTH, 0)
    const stops = [0, 60, 120, 180, 240, 300, 360]
    stops.forEach((deg) => {
      grad.addColorStop(deg / 360, `hsl(${deg}, 100%, 50%)`)
    })
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Indicator
    const x = (hue / 360) * WIDTH
    ctx.beginPath()
    ctx.rect(x - 2, 0, 4, HEIGHT)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [hue])

  const pick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.max(0, Math.min(WIDTH, e.clientX - rect.left))
      onChange((x / WIDTH) * 360)
    },
    [onChange],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return
      pick(e as any)
    }
    const handleUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [pick])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{ ...sliderTrackStyle, width: WIDTH, height: HEIGHT }}
      onMouseDown={(e) => {
        dragging.current = true
        pick(e)
      }}
    />
  )
}

// ─── Alpha Slider Component ───────────────────────────────────

function AlphaSlider({
  hue,
  saturation,
  value,
  alpha,
  onChange,
}: {
  hue: number
  saturation: number
  value: number
  alpha: number
  onChange: (a: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const WIDTH = 208
  const HEIGHT = 16

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // Checkerboard background
    const checkSize = 4
    for (let y = 0; y < HEIGHT; y += checkSize) {
      for (let x = 0; x < WIDTH; x += checkSize) {
        const isLight = (x / checkSize + y / checkSize) % 2 === 0
        ctx.fillStyle = isLight ? '#ddd' : '#aaa'
        ctx.fillRect(x, y, checkSize, checkSize)
      }
    }

    // Color gradient overlay
    const { r, g, b } = hsvToRgb(hue, saturation, value)
    const grad = ctx.createLinearGradient(0, 0, WIDTH, 0)
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
    grad.addColorStop(1, `rgba(${r},${g},${b},1)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, WIDTH, HEIGHT)

    // Indicator
    const x = alpha * WIDTH
    ctx.beginPath()
    ctx.rect(x - 2, 0, 4, HEIGHT)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [hue, saturation, value, alpha])

  const pick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.max(0, Math.min(WIDTH, e.clientX - rect.left))
      onChange(x / WIDTH)
    },
    [onChange],
  )

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragging.current) return
      pick(e as any)
    }
    const handleUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [pick])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      style={{ ...sliderTrackStyle, width: WIDTH, height: HEIGHT }}
      onMouseDown={(e) => {
        dragging.current = true
        pick(e)
      }}
    />
  )
}

// ─── Main ColorPicker Component ────────────────────────────────

export function ColorPicker({ color, opacity = 1, onChange }: ColorPickerProps) {
  const setActiveTool = useEditorStore((s) => s.setActiveTool)

  // Parse incoming color to HSV for internal state
  const rgba = hexToRgba(color)
  const initHsv = rgbToHsv(rgba.r, rgba.g, rgba.b)

  const [hsv, setHsv] = useState<HSV>({ h: initHsv.h, s: initHsv.s, v: initHsv.v })
  const [alpha, setAlpha] = useState(opacity)
  const [mode, setMode] = useState<InputMode>('hex')
  const [recentColors, setRecentColors] = useState<string[]>(loadRecentColors)

  // Sync from props when color changes externally
  const prevColorRef = useRef(color)
  const prevOpacityRef = useRef(opacity)
  useEffect(() => {
    if (color !== prevColorRef.current || opacity !== prevOpacityRef.current) {
      prevColorRef.current = color
      prevOpacityRef.current = opacity
      const r = hexToRgba(color)
      const h = rgbToHsv(r.r, r.g, r.b)
      setHsv(h)
      setAlpha(opacity)
    }
  }, [color, opacity])

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v)
  const currentRgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
  const currentHsla = rgbaToHsla({ ...currentRgb, a: 1 })

  const emitChange = useCallback(
    (hex: string, a: number) => {
      onChange(hex, a)
      saveRecentColor(hex)
    },
    [onChange],
  )

  const handleSVChange = useCallback(
    (s: number, v: number) => {
      const newHsv = { ...hsv, s, v }
      setHsv(newHsv)
      const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v)
      emitChange(hex, alpha)
    },
    [hsv, alpha, emitChange],
  )

  const handleHueChange = useCallback(
    (h: number) => {
      const newHsv = { ...hsv, h }
      setHsv(newHsv)
      const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v)
      emitChange(hex, alpha)
    },
    [hsv, alpha, emitChange],
  )

  const handleAlphaChange = useCallback(
    (a: number) => {
      setAlpha(a)
      emitChange(currentHex, a)
    },
    [currentHex, emitChange],
  )

  const handleHexInput = useCallback(
    (val: string) => {
      let hex = val.startsWith('#') ? val : '#' + val
      if (/^#[0-9a-fA-F]{6}$/i.test(hex)) {
        hex = hex.toLowerCase()
        const r = hexToRgba(hex)
        const h = rgbToHsv(r.r, r.g, r.b)
        setHsv(h)
        emitChange(hex, alpha)
      }
    },
    [alpha, emitChange],
  )

  const handleRgbInput = useCallback(
    (channel: 'r' | 'g' | 'b', val: number) => {
      const clamped = Math.max(0, Math.min(255, Math.round(val)))
      const rgb = { ...currentRgb, [channel]: clamped }
      const h = rgbToHsv(rgb.r, rgb.g, rgb.b)
      setHsv(h)
      const hex = rgbaToHex({ ...rgb, a: 1 })
      emitChange(hex, alpha)
    },
    [currentRgb, alpha, emitChange],
  )

  const handleHslInput = useCallback(
    (channel: 'h' | 's' | 'l', val: number) => {
      const limits = { h: 360, s: 100, l: 100 }
      const clamped = Math.max(0, Math.min(limits[channel], Math.round(val)))
      const hsl: HSLA = { ...currentHsla, [channel]: clamped, a: 1 }
      const rgba = hslaToRgba(hsl)
      const h = rgbToHsv(rgba.r, rgba.g, rgba.b)
      setHsv(h)
      const hex = rgbaToHex(rgba)
      emitChange(hex, alpha)
    },
    [currentHsla, alpha, emitChange],
  )

  const handleAlphaInput = useCallback(
    (pct: number) => {
      const a = Math.max(0, Math.min(1, pct / 100))
      setAlpha(a)
      emitChange(currentHex, a)
    },
    [currentHex, emitChange],
  )

  const handleRecentClick = useCallback(
    (hex: string) => {
      const r = hexToRgba(hex)
      const h = rgbToHsv(r.r, r.g, r.b)
      setHsv(h)
      emitChange(hex, alpha)
    },
    [alpha, emitChange],
  )

  const handleAddToPalette = useCallback(() => {
    addToPalette(currentHex)
  }, [currentHex])

  const handleEyedropper = useCallback(() => {
    setActiveTool('eyedropper')
  }, [setActiveTool])

  // Refresh recent colors when opening
  useEffect(() => {
    setRecentColors(loadRecentColors())
  }, [])

  return (
    <div style={pickerContainerStyle} onMouseDown={(e) => e.stopPropagation()}>
      {/* SV Square */}
      <SVSquare hue={hsv.h} saturation={hsv.s} value={hsv.v} onChange={handleSVChange} />

      {/* Hue Slider */}
      <div style={{ marginTop: 8 }}>
        <HueSlider hue={hsv.h} onChange={handleHueChange} />
      </div>

      {/* Alpha Slider */}
      <div style={{ marginTop: 6 }}>
        <AlphaSlider hue={hsv.h} saturation={hsv.s} value={hsv.v} alpha={alpha} onChange={handleAlphaChange} />
      </div>

      {/* Mode Toggle + Eyedropper */}
      <div style={{ display: 'flex', gap: 3, marginTop: 8, alignItems: 'center' }}>
        <button style={modeButtonStyle(mode === 'hex')} onClick={() => setMode('hex')}>
          Hex
        </button>
        <button style={modeButtonStyle(mode === 'rgb')} onClick={() => setMode('rgb')}>
          RGB
        </button>
        <button style={modeButtonStyle(mode === 'hsl')} onClick={() => setMode('hsl')}>
          HSL
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleEyedropper}
          title="Eyedropper"
          style={{
            ...smallBtnStyle,
            fontSize: 14,
            padding: '0 5px',
            lineHeight: '20px',
          }}
        >
          &#8916;
        </button>
      </div>

      {/* Input Fields */}
      <div style={{ marginTop: 6 }}>
        {mode === 'hex' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                style={fieldInputStyle}
                value={currentHex}
                onChange={(e) => handleHexInput(e.target.value)}
                onBlur={(e) => handleHexInput(e.target.value)}
                spellCheck={false}
              />
              <div style={fieldLabelStyle}>Hex</div>
            </div>
            <div style={{ width: 44 }}>
              <input
                style={fieldInputStyle}
                type="number"
                min={0}
                max={100}
                value={Math.round(alpha * 100)}
                onChange={(e) => handleAlphaInput(Number(e.target.value))}
              />
              <div style={fieldLabelStyle}>A%</div>
            </div>
          </div>
        )}
        {mode === 'rgb' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
            {(['r', 'g', 'b'] as const).map((ch) => (
              <div key={ch} style={{ flex: 1 }}>
                <input
                  style={fieldInputStyle}
                  type="number"
                  min={0}
                  max={255}
                  value={currentRgb[ch]}
                  onChange={(e) => handleRgbInput(ch, Number(e.target.value))}
                />
                <div style={fieldLabelStyle}>{ch.toUpperCase()}</div>
              </div>
            ))}
            <div style={{ width: 44 }}>
              <input
                style={fieldInputStyle}
                type="number"
                min={0}
                max={100}
                value={Math.round(alpha * 100)}
                onChange={(e) => handleAlphaInput(Number(e.target.value))}
              />
              <div style={fieldLabelStyle}>A%</div>
            </div>
          </div>
        )}
        {mode === 'hsl' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
            {(['h', 's', 'l'] as const).map((ch) => (
              <div key={ch} style={{ flex: 1 }}>
                <input
                  style={fieldInputStyle}
                  type="number"
                  min={0}
                  max={ch === 'h' ? 360 : 100}
                  value={currentHsla[ch]}
                  onChange={(e) => handleHslInput(ch, Number(e.target.value))}
                />
                <div style={fieldLabelStyle}>{ch.toUpperCase()}</div>
              </div>
            ))}
            <div style={{ width: 44 }}>
              <input
                style={fieldInputStyle}
                type="number"
                min={0}
                max={100}
                value={Math.round(alpha * 100)}
                onChange={(e) => handleAlphaInput(Number(e.target.value))}
              />
              <div style={fieldLabelStyle}>A%</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Colors */}
      {recentColors.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginBottom: 4,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Recent</span>
            <button onClick={handleAddToPalette} style={smallBtnStyle} title="Add to palette">
              + Palette
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {recentColors.map((c, i) => (
              <div key={`${c}-${i}`} style={swatchStyle(c)} title={c} onClick={() => handleRecentClick(c)} />
            ))}
          </div>
        </div>
      )}

      {/* Add to palette standalone (if no recent colors) */}
      {recentColors.length === 0 && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleAddToPalette} style={smallBtnStyle} title="Add to palette">
            + Palette
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Color Swatch + Popup Wrapper ──────────────────────────────

export interface ColorSwatchProps {
  color: string
  opacity?: number
  onChange: (hex: string, opacity: number) => void
  /** Size of the swatch in px */
  size?: number
}

export function ColorSwatch({ color, opacity = 1, onChange, size = 24 }: ColorSwatchProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        popupRef.current &&
        !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    // Delay to avoid catching the opening click
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  // Position popup
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  useEffect(() => {
    if (!open || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const viewW = window.innerWidth
    const viewH = window.innerHeight
    const pickerW = 256 // approx
    const pickerH = 420 // approx

    let top = rect.bottom + 4
    let left = rect.left

    // Flip up if not enough space below
    if (top + pickerH > viewH) {
      top = rect.top - pickerH - 4
    }
    // Shift left if off right edge
    if (left + pickerW > viewW) {
      left = viewW - pickerW - 8
    }
    // Clamp
    if (left < 4) left = 4
    if (top < 4) top = 4

    setPopupPos({ top, left })
  }, [open])

  // Display color with alpha for the swatch
  const displayColor =
    opacity < 1
      ? (() => {
          const rgba = hexToRgba(color)
          return `rgba(${rgba.r},${rgba.g},${rgba.b},${opacity})`
        })()
      : color

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: size,
          height: size,
          borderRadius: 3,
          border: '1px solid var(--border-default)',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          // Checkerboard behind for alpha visibility
          backgroundImage:
            'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
          backgroundSize: '8px 8px',
          backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: displayColor,
          }}
        />
      </div>
      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: popupPos.top,
            left: popupPos.left,
            zIndex: 10000,
          }}
        >
          <ColorPicker
            color={color}
            opacity={opacity}
            onChange={(hex, a) => {
              onChange(hex, a)
            }}
          />
        </div>
      )}
    </div>
  )
}
