import { useRef, useState } from 'react'
import { useEditorStore, getActiveArtboard } from '@/store/editor.store'
import type { NamedColor } from '@/types'
import { v4 as uuid } from 'uuid'
import { setPrimaryColor, setSecondaryColor } from '@/ui/tool-options-state'

const STORAGE_KEY = 'crossdraw:palette'

function loadPalette(): NamedColor[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    /* empty */
  }
  return [
    { id: uuid(), name: 'Black', value: '#000000' },
    { id: uuid(), name: 'White', value: '#ffffff' },
    { id: uuid(), name: 'Red', value: '#ff0000' },
    { id: uuid(), name: 'Green', value: '#00ff00' },
    { id: uuid(), name: 'Blue', value: '#0000ff' },
    { id: uuid(), name: 'Yellow', value: '#ffff00' },
    { id: uuid(), name: 'Cyan', value: '#00ffff' },
    { id: uuid(), name: 'Magenta', value: '#ff00ff' },
  ]
}

function savePalette(colors: NamedColor[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
}

export function ColorPalette() {
  const [colors, setColors] = useState<NamedColor[]>(loadPalette)
  const selection = useEditorStore((s) => s.selection)
  const setFill = useEditorStore((s) => s.setFill)

  const artboard = getActiveArtboard()
  const selectedLayer = artboard?.layers.find((l) => selection.layerIds.includes(l.id))

  function handleSwatchClick(color: string, secondary: boolean) {
    if (secondary) {
      setSecondaryColor(color, 1)
      return
    }
    setPrimaryColor(color, 1)
    if (artboard && selectedLayer) {
      if (selectedLayer.type === 'vector') {
        setFill(artboard.id, selectedLayer.id, { type: 'solid', color, opacity: 1 })
      } else if (selectedLayer.type === 'text') {
        useEditorStore.getState().updateLayer(artboard.id, selectedLayer.id, { color })
      }
    }
  }

  function handleAddColor() {
    const newColor: NamedColor = { id: uuid(), name: 'Custom', value: '#888888' }
    const updated = [...colors, newColor]
    setColors(updated)
    savePalette(updated)
  }

  function handleRemoveColor(id: string) {
    const updated = colors.filter((c) => c.id !== id)
    setColors(updated)
    savePalette(updated)
  }

  function handleChangeColor(id: string, value: string) {
    const updated = colors.map((c) => (c.id === id ? { ...c, value } : c))
    setColors(updated)
    savePalette(updated)
  }

  return (
    <div style={{ padding: 'var(--space-2)', flex: 1 }}>
      {/* Header provided by Sidebar wrapper */}
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={handleAddColor}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 14,
            padding: 0,
          }}
          title="Add swatch"
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
          }}
        >
          +
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {colors.map((c) => (
          <Swatch
            key={c.id}
            color={c}
            onSelect={(secondary) => handleSwatchClick(c.value, secondary)}
            onEdit={(v) => handleChangeColor(c.id, v)}
            onRemove={() => handleRemoveColor(c.id)}
          />
        ))}
      </div>
    </div>
  )
}

function Swatch({
  color,
  onSelect,
  onEdit,
  onRemove,
}: {
  color: NamedColor
  onSelect: (secondary: boolean) => void
  onEdit: (value: string) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      title={`${color.name}: ${color.value} — click: primary · shift-click: secondary · alt-click: edit · right-click: remove`}
      onClick={(e) => {
        if (e.altKey) {
          inputRef.current?.click()
          return
        }
        onSelect(e.shiftKey)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onRemove()
      }}
      style={{
        width: 20,
        height: 20,
        background: color.value,
        border: '1px solid var(--border-default)',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      <input
        ref={inputRef}
        type="color"
        value={color.value}
        onChange={(e) => onEdit(e.target.value)}
        tabIndex={-1}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
