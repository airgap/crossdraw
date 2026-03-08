import { useState } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { NamedColor } from '@/types'
import { v4 as uuid } from 'uuid'

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
  const document = useEditorStore((s) => s.document)
  const setFill = useEditorStore((s) => s.setFill)

  const artboard = document.artboards[0]
  const selectedLayer = artboard?.layers.find((l) => selection.layerIds.includes(l.id))

  function handleSwatchClick(color: string) {
    if (!artboard || !selectedLayer) return
    if (selectedLayer.type === 'vector' || selectedLayer.type === 'text') {
      if (selectedLayer.type === 'vector') {
        setFill(artboard.id, selectedLayer.id, { type: 'solid', color, opacity: 1 })
      } else {
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
          <div
            key={c.id}
            title={`${c.name}: ${c.value}`}
            onClick={() => handleSwatchClick(c.value)}
            onContextMenu={(e) => {
              e.preventDefault()
              handleRemoveColor(c.id)
            }}
            style={{
              width: 20,
              height: 20,
              borderRadius: 'var(--radius-sm)',
              background: c.value,
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <input
              type="color"
              value={c.value}
              onChange={(e) => handleChangeColor(c.id, e.target.value)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                cursor: 'pointer',
                width: '100%',
                height: '100%',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
