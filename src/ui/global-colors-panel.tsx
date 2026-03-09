import { useState, useRef } from 'react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { NamedColor, Layer, VectorLayer, TextLayer } from '@/types'

/** Extract all unique hex colors from a set of layers. */
function extractColorsFromLayers(layers: Layer[]): string[] {
  const colors = new Set<string>()
  for (const layer of layers) {
    if (layer.type === 'vector') {
      const vl = layer as VectorLayer
      if (vl.fill?.color) colors.add(vl.fill.color.toLowerCase())
      if (vl.stroke?.color) colors.add(vl.stroke.color.toLowerCase())
      if (vl.additionalFills) {
        for (const f of vl.additionalFills) {
          if (f.color) colors.add(f.color.toLowerCase())
        }
      }
      if (vl.additionalStrokes) {
        for (const s of vl.additionalStrokes) {
          if (s.color) colors.add(s.color.toLowerCase())
        }
      }
    } else if (layer.type === 'text') {
      const tl = layer as TextLayer
      if (tl.color) colors.add(tl.color.toLowerCase())
    } else if (layer.type === 'group') {
      for (const c of extractColorsFromLayers(layer.children)) {
        colors.add(c)
      }
    }
  }
  return Array.from(colors)
}

export function GlobalColorsPanel() {
  const colors = useEditorStore((s) => s.document.assets.colors)
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const addDocumentColor = useEditorStore((s) => s.addDocumentColor)
  const removeDocumentColor = useEditorStore((s) => s.removeDocumentColor)
  const updateDocumentColor = useEditorStore((s) => s.updateDocumentColor)

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Get selected layers for "Add from Selection" and default color
  const selectedLayers: Layer[] = []
  for (const artboard of document.artboards) {
    for (const layer of artboard.layers) {
      if (selection.layerIds.includes(layer.id)) {
        selectedLayers.push(layer)
      }
      if (layer.type === 'group') {
        for (const child of layer.children) {
          if (selection.layerIds.includes(child.id)) {
            selectedLayers.push(child)
          }
        }
      }
    }
  }

  const handleAddColor = () => {
    let defaultColor = '#000000'
    // Try to get the fill color of the first selected vector layer
    for (const layer of selectedLayers) {
      if (layer.type === 'vector' && layer.fill?.color) {
        defaultColor = layer.fill.color
        break
      } else if (layer.type === 'text' && layer.color) {
        defaultColor = layer.color
        break
      }
    }
    const newColor: NamedColor = {
      id: uuid(),
      name: `Color ${colors.length + 1}`,
      value: defaultColor,
    }
    addDocumentColor(newColor)
  }

  const handleAddFromSelection = () => {
    const extracted = extractColorsFromLayers(selectedLayers)
    const existing = new Set(colors.map((c) => c.value.toLowerCase()))
    let added = 0
    for (const hex of extracted) {
      if (!existing.has(hex)) {
        addDocumentColor({
          id: uuid(),
          name: `Color ${colors.length + added + 1}`,
          value: hex,
        })
        existing.add(hex)
        added++
      }
    }
  }

  const handleColorChange = (id: string, newValue: string) => {
    updateDocumentColor(id, { value: newValue })
  }

  const handleNameChange = (id: string, newName: string) => {
    updateDocumentColor(id, { name: newName })
    setEditingNameId(null)
  }

  const handleGroupChange = (id: string, newGroup: string) => {
    updateDocumentColor(id, { group: newGroup || undefined })
  }

  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  // Group colors
  const ungrouped: NamedColor[] = []
  const groups = new Map<string, NamedColor[]>()
  for (const color of colors) {
    if (color.group) {
      const list = groups.get(color.group) ?? []
      list.push(color)
      groups.set(color.group, list)
    } else {
      ungrouped.push(color)
    }
  }
  const allGroupNames = Array.from(groups.keys()).sort()

  // Filter
  const filteredUngrouped = groupFilter === null ? ungrouped : []
  const filteredGroups = groupFilter === null ? allGroupNames : allGroupNames.filter((g) => g === groupFilter)

  const btnStyle: React.CSSProperties = {
    padding: '4px 8px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm, 4px)',
    cursor: 'pointer',
    fontSize: 11,
    background: 'transparent',
    color: 'var(--text-secondary)',
  }

  const renderColorEntry = (color: NamedColor) => (
    <div
      key={color.id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 0',
      }}
    >
      {/* Color swatch with native color picker */}
      <label
        style={{
          width: 20,
          height: 20,
          borderRadius: 3,
          backgroundColor: color.value,
          border: '1px solid var(--border-subtle)',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <input
          type="color"
          value={color.value}
          onChange={(e) => handleColorChange(color.id, e.target.value)}
          style={{
            position: 'absolute',
            opacity: 0,
            width: '100%',
            height: '100%',
            cursor: 'pointer',
            border: 'none',
            padding: 0,
          }}
        />
      </label>

      {/* Name (editable) */}
      {editingNameId === color.id ? (
        <input
          ref={nameInputRef}
          defaultValue={color.name}
          autoFocus
          onBlur={(e) => handleNameChange(color.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNameChange(color.id, e.currentTarget.value)
            if (e.key === 'Escape') setEditingNameId(null)
          }}
          style={{
            flex: 1,
            fontSize: 11,
            padding: '1px 4px',
            border: '1px solid var(--accent)',
            borderRadius: 2,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            outline: 'none',
            minWidth: 0,
          }}
        />
      ) : (
        <span
          onDoubleClick={() => setEditingNameId(color.id)}
          style={{
            flex: 1,
            fontSize: 11,
            color: 'var(--text-primary)',
            cursor: 'default',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title="Double-click to rename"
        >
          {color.name}
        </span>
      )}

      {/* Hex value */}
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          fontFamily: 'monospace',
          flexShrink: 0,
        }}
      >
        {color.value.toUpperCase()}
      </span>

      {/* Group tag */}
      {color.group && (
        <span
          style={{
            fontSize: 9,
            color: 'var(--accent)',
            background: 'var(--bg-secondary)',
            padding: '1px 4px',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          {color.group}
        </span>
      )}

      {/* Delete button */}
      <button
        onClick={() => removeDocumentColor(color.id)}
        style={{
          width: 16,
          height: 16,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 0,
        }}
        title="Delete color"
      >
        ×
      </button>
    </div>
  )

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Header actions */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={handleAddColor} style={btnStyle}>
          + Add Color
        </button>
        <button
          onClick={handleAddFromSelection}
          disabled={selectedLayers.length === 0}
          style={{
            ...btnStyle,
            opacity: selectedLayers.length === 0 ? 0.4 : 1,
            cursor: selectedLayers.length === 0 ? 'default' : 'pointer',
          }}
        >
          + From Selection
        </button>
      </div>

      {/* Group filter */}
      {allGroupNames.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button
            onClick={() => setGroupFilter(null)}
            style={{
              ...btnStyle,
              fontSize: 10,
              padding: '2px 6px',
              background: groupFilter === null ? 'var(--accent)' : 'transparent',
              color: groupFilter === null ? '#fff' : 'var(--text-secondary)',
            }}
          >
            All
          </button>
          {allGroupNames.map((g) => (
            <button
              key={g}
              onClick={() => setGroupFilter(groupFilter === g ? null : g)}
              style={{
                ...btnStyle,
                fontSize: 10,
                padding: '2px 6px',
                background: groupFilter === g ? 'var(--accent)' : 'transparent',
                color: groupFilter === g ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Color list */}
      {colors.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
          No document colors yet.
          <br />
          Add colors to share them across layers.
        </div>
      )}

      {/* Ungrouped colors */}
      {filteredUngrouped.length > 0 && (
        <div>
          {allGroupNames.length > 0 && (
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Ungrouped
            </div>
          )}
          {filteredUngrouped.map(renderColorEntry)}
        </div>
      )}

      {/* Grouped colors */}
      {filteredGroups.map((groupName) => {
        const groupColors = groups.get(groupName) ?? []
        const collapsed = collapsedGroups.has(groupName)
        return (
          <div key={groupName}>
            <div
              onClick={() => toggleGroupCollapse(groupName)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: 4,
                userSelect: 'none',
              }}
            >
              <span
                style={{
                  fontSize: 8,
                  transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              >
                ▼
              </span>
              {groupName} ({groupColors.length})
            </div>
            {!collapsed && groupColors.map(renderColorEntry)}
          </div>
        )
      })}

      {/* Assign group to color */}
      {colors.length > 0 && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 8,
            marginTop: 4,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Assign Group
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              id="gc-color-select"
              style={{
                flex: 1,
                fontSize: 11,
                padding: '2px 4px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {colors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              id="gc-group-input"
              placeholder="Group name"
              style={{
                flex: 1,
                fontSize: 11,
                padding: '2px 4px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={() => {
                const sel = (window.document.getElementById('gc-color-select') as HTMLSelectElement)?.value
                const grp = (window.document.getElementById('gc-group-input') as HTMLInputElement)?.value
                if (sel) handleGroupChange(sel, grp)
              }}
              style={btnStyle}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
