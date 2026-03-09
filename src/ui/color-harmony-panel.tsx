import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, VectorLayer } from '@/types'

// --- HSL helpers ---

function hexToHsl(hex: string): [number, number, number] {
  const h6 = hex.replace(/^#/, '')
  const r = parseInt(h6.slice(0, 2), 16) / 255
  const g = parseInt(h6.slice(2, 4), 16) / 255
  const b = parseInt(h6.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6

  return [hue * 360, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// --- Harmony generators ---

interface Harmony {
  label: string
  colors: string[]
}

function generateHarmonies(baseHex: string): Harmony[] {
  const [h, s, l] = hexToHsl(baseHex)

  return [
    {
      label: 'Complementary',
      colors: [baseHex, hslToHex(h + 180, s, l)],
    },
    {
      label: 'Analogous',
      colors: [hslToHex(h - 30, s, l), baseHex, hslToHex(h + 30, s, l)],
    },
    {
      label: 'Triadic',
      colors: [baseHex, hslToHex(h + 120, s, l), hslToHex(h + 240, s, l)],
    },
    {
      label: 'Split-complementary',
      colors: [baseHex, hslToHex(h + 150, s, l), hslToHex(h + 210, s, l)],
    },
    {
      label: 'Tetradic',
      colors: [baseHex, hslToHex(h + 90, s, l), hslToHex(h + 180, s, l), hslToHex(h + 270, s, l)],
    },
    {
      label: 'Monochromatic',
      colors: [hslToHex(h, s, 0.25), hslToHex(h, s, 0.5), hslToHex(h, s, 0.75), hslToHex(h, s, 1.0)],
    },
  ]
}

// --- Swatch component ---

const swatchStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 'var(--radius-sm, 4px)',
  border: '1px solid var(--border-subtle)',
  cursor: 'pointer',
  flexShrink: 0,
}

function Swatch({ color, onClick }: { color: string; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ ...swatchStyle, background: color }} title={`Click to apply ${color}`} onClick={onClick} />
      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{color}</span>
    </div>
  )
}

// --- Panel component ---

export function ColorHarmonyPanel() {
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const setFill = useEditorStore((s) => s.setFill)

  const artboard = document.artboards[0]
  const selectedLayerRaw = artboard?.layers.find((l: Layer) => selection.layerIds.includes(l.id))
  const selectedLayer = selectedLayerRaw?.type === 'vector' ? (selectedLayerRaw as VectorLayer) : null
  const selectedFillColor =
    selectedLayer?.fill?.type === 'solid' && selectedLayer.fill.color ? selectedLayer.fill.color : null

  const [baseColor, setBaseColor] = useState('#e63946')

  // Sync base color from selected layer's fill
  useEffect(() => {
    if (selectedFillColor) {
      setBaseColor(selectedFillColor)
    }
  }, [selectedFillColor])

  const harmonies = generateHarmonies(baseColor)

  const applyColor = useCallback(
    (hex: string) => {
      // Copy to clipboard
      navigator.clipboard?.writeText(hex)

      // Apply as fill to selected layer
      if (artboard && selectedLayer) {
        setFill(artboard.id, selectedLayer.id, {
          type: 'solid',
          color: hex,
          opacity: selectedLayer.fill?.opacity ?? 1,
        })
      }
    },
    [artboard, selectedLayer, setFill],
  )

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Base color input */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Base Color
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={baseColor}
            onChange={(e) => setBaseColor(e.target.value)}
            style={{
              width: 32,
              height: 32,
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              padding: 0,
              cursor: 'pointer',
              background: 'transparent',
            }}
          />
          <input
            type="text"
            value={baseColor}
            onChange={(e) => {
              const v = e.target.value
              if (/^#[0-9a-fA-F]{6}$/.test(v)) setBaseColor(v)
            }}
            style={{
              flex: 1,
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '4px 6px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--bg-secondary, #2a2a2a)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Harmony rows */}
      {harmonies.map((harmony) => (
        <div key={harmony.label}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {harmony.label}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {harmony.colors.map((color, i) => (
              <Swatch key={`${harmony.label}-${i}`} color={color} onClick={() => applyColor(color)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
