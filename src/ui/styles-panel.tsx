import { useState, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { TextStyle, ColorStyle, EffectStyle, Layer, VectorLayer, TextLayer, GroupLayer } from '@/types'

// ── Helpers ──

function findLayerDeep(layers: readonly Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findLayerDeep((l as GroupLayer).children, id)
      if (child) return child
    }
  }
  return null
}

// ── Section components ──

function TextStylesSection() {
  const styles = useEditorStore((s) => s.document.styles?.textStyles ?? [])
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const addTextStyle = useEditorStore((s) => s.addTextStyle)
  const updateTextStyle = useEditorStore((s) => s.updateTextStyle)
  const removeTextStyle = useEditorStore((s) => s.removeTextStyle)
  const applyTextStyle = useEditorStore((s) => s.applyTextStyle)
  const detachTextStyle = useEditorStore((s) => s.detachTextStyle)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreateFromSelection = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    const layer = findLayerDeep(artboard.layers, layerId)
    if (!layer || layer.type !== 'text') return
    const tl = layer as TextLayer
    const style: TextStyle = {
      id: uuid(),
      name: tl.name || 'Text Style',
      fontFamily: tl.fontFamily,
      fontSize: tl.fontSize,
      fontWeight: tl.fontWeight,
      fontStyle: tl.fontStyle,
      lineHeight: tl.lineHeight,
      letterSpacing: tl.letterSpacing,
      color: tl.color,
    }
    addTextStyle(style)
  }, [selection, document, addTextStyle])

  const handleApply = useCallback(
    (styleId: string) => {
      const layerId = selection.layerIds[0]
      if (!layerId) return
      const artboard = document.artboards[0]
      if (!artboard) return
      applyTextStyle(layerId, artboard.id, styleId)
    },
    [selection, document, applyTextStyle],
  )

  const handleDetach = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    detachTextStyle(layerId, artboard.id)
  }, [selection, document, detachTextStyle])

  const startEdit = (style: TextStyle) => {
    setEditingId(style.id)
    setEditName(style.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      updateTextStyle(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>Text Styles</strong>
        <button
          onClick={handleCreateFromSelection}
          style={{
            background: 'var(--bg-active)',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 3,
          }}
          title="Create text style from selected text layer"
        >
          + Create
        </button>
      </div>
      {styles.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, padding: '4px 0' }}>No text styles defined</div>
      )}
      {styles.map((style) => (
        <div
          key={style.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: style.color,
              fontFamily: style.fontFamily,
              fontSize: 12,
              fontWeight: style.fontWeight,
              fontStyle: style.fontStyle,
            }}
          >
            A
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingId === style.id ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                autoFocus
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-active)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  padding: '1px 4px',
                }}
              />
            ) : (
              <div
                style={{ fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}
                onDoubleClick={() => startEdit(style)}
              >
                {style.name}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {style.fontFamily} {style.fontSize}px
            </div>
          </div>
          <button
            onClick={() => handleApply(style.id)}
            title="Apply to selected layer"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            Apply
          </button>
          <button
            onClick={() => removeTextStyle(style.id)}
            title="Delete style"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            X
          </button>
        </div>
      ))}
      {selection.layerIds.length > 0 &&
        (() => {
          const artboard = document.artboards[0]
          if (!artboard) return null
          const layer = findLayerDeep(artboard.layers, selection.layerIds[0]!)
          if (!layer || !layer.textStyleId) return null
          return (
            <button
              onClick={handleDetach}
              style={{
                marginTop: 4,
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 3,
              }}
            >
              Detach Text Style
            </button>
          )
        })()}
    </div>
  )
}

function ColorStylesSection() {
  const styles = useEditorStore((s) => s.document.styles?.colorStyles ?? [])
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const addColorStyle = useEditorStore((s) => s.addColorStyle)
  const updateColorStyle = useEditorStore((s) => s.updateColorStyle)
  const removeColorStyle = useEditorStore((s) => s.removeColorStyle)
  const applyColorStyle = useEditorStore((s) => s.applyColorStyle)
  const detachColorStyle = useEditorStore((s) => s.detachColorStyle)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreateFromSelection = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    const layer = findLayerDeep(artboard.layers, layerId)
    if (!layer || layer.type !== 'vector') return
    const vec = layer as VectorLayer
    const style: ColorStyle = {
      id: uuid(),
      name: vec.name || 'Color Style',
      color: vec.fill?.color ?? '#000000',
      opacity: vec.fill?.opacity ?? 1,
    }
    addColorStyle(style)
  }, [selection, document, addColorStyle])

  const handleApply = useCallback(
    (styleId: string) => {
      const layerId = selection.layerIds[0]
      if (!layerId) return
      const artboard = document.artboards[0]
      if (!artboard) return
      applyColorStyle(layerId, artboard.id, styleId)
    },
    [selection, document, applyColorStyle],
  )

  const handleDetach = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    detachColorStyle(layerId, artboard.id)
  }, [selection, document, detachColorStyle])

  const startEdit = (style: ColorStyle) => {
    setEditingId(style.id)
    setEditName(style.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      updateColorStyle(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>Color Styles</strong>
        <button
          onClick={handleCreateFromSelection}
          style={{
            background: 'var(--bg-active)',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 3,
          }}
          title="Create color style from selected vector layer"
        >
          + Create
        </button>
      </div>
      {styles.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, padding: '4px 0' }}>No color styles defined</div>
      )}
      {styles.map((style) => (
        <div
          key={style.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              backgroundColor: style.color,
              opacity: style.opacity,
              border: '1px solid var(--border-subtle)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingId === style.id ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                autoFocus
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-active)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  padding: '1px 4px',
                }}
              />
            ) : (
              <div
                style={{ fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}
                onDoubleClick={() => startEdit(style)}
              >
                {style.name}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {style.color} ({Math.round(style.opacity * 100)}%)
            </div>
          </div>
          <button
            onClick={() => handleApply(style.id)}
            title="Apply to selected layer"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            Apply
          </button>
          <button
            onClick={() => removeColorStyle(style.id)}
            title="Delete style"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            X
          </button>
        </div>
      ))}
      {selection.layerIds.length > 0 &&
        (() => {
          const artboard = document.artboards[0]
          if (!artboard) return null
          const layer = findLayerDeep(artboard.layers, selection.layerIds[0]!)
          if (!layer || !layer.fillStyleId) return null
          return (
            <button
              onClick={handleDetach}
              style={{
                marginTop: 4,
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 3,
              }}
            >
              Detach Color Style
            </button>
          )
        })()}
    </div>
  )
}

function EffectStylesSection() {
  const styles = useEditorStore((s) => s.document.styles?.effectStyles ?? [])
  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)
  const addEffectStyle = useEditorStore((s) => s.addEffectStyle)
  const updateEffectStyle = useEditorStore((s) => s.updateEffectStyle)
  const removeEffectStyle = useEditorStore((s) => s.removeEffectStyle)
  const applyEffectStyle = useEditorStore((s) => s.applyEffectStyle)
  const detachEffectStyle = useEditorStore((s) => s.detachEffectStyle)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Silence lint about unused updateEffectStyle — it is available for inline editing flows
  void updateEffectStyle

  const handleCreateFromSelection = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    const layer = findLayerDeep(artboard.layers, layerId)
    if (!layer || (layer.effects ?? []).length === 0) return
    const style: EffectStyle = {
      id: uuid(),
      name: layer.name || 'Effect Style',
      effects: JSON.parse(JSON.stringify(layer.effects ?? [])),
    }
    addEffectStyle(style)
  }, [selection, document, addEffectStyle])

  const handleApply = useCallback(
    (styleId: string) => {
      const layerId = selection.layerIds[0]
      if (!layerId) return
      const artboard = document.artboards[0]
      if (!artboard) return
      applyEffectStyle(layerId, artboard.id, styleId)
    },
    [selection, document, applyEffectStyle],
  )

  const handleDetach = useCallback(() => {
    const layerId = selection.layerIds[0]
    if (!layerId) return
    const artboard = document.artboards[0]
    if (!artboard) return
    detachEffectStyle(layerId, artboard.id)
  }, [selection, document, detachEffectStyle])

  const startEdit = (style: EffectStyle) => {
    setEditingId(style.id)
    setEditName(style.name)
  }

  const commitEdit = () => {
    if (editingId && editName.trim()) {
      updateEffectStyle(editingId, { name: editName.trim() })
    }
    setEditingId(null)
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ color: 'var(--text-primary)', fontSize: 12 }}>Effect Styles</strong>
        <button
          onClick={handleCreateFromSelection}
          style={{
            background: 'var(--bg-active)',
            border: 'none',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 3,
          }}
          title="Create effect style from selected layer"
        >
          + Create
        </button>
      </div>
      {styles.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 11, padding: '4px 0' }}>No effect styles defined</div>
      )}
      {styles.map((style) => (
        <div
          key={style.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 0',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            FX
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingId === style.id ? (
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                autoFocus
                style={{
                  width: '100%',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-active)',
                  color: 'var(--text-primary)',
                  fontSize: 11,
                  padding: '1px 4px',
                }}
              />
            ) : (
              <div
                style={{ fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}
                onDoubleClick={() => startEdit(style)}
              >
                {style.name}
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {style.effects.length} effect{style.effects.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={() => handleApply(style.id)}
            title="Apply to selected layer"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            Apply
          </button>
          <button
            onClick={() => removeEffectStyle(style.id)}
            title="Delete style"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-secondary)',
              padding: '2px 4px',
            }}
          >
            X
          </button>
        </div>
      ))}
      {selection.layerIds.length > 0 &&
        (() => {
          const artboard = document.artboards[0]
          if (!artboard) return null
          const layer = findLayerDeep(artboard.layers, selection.layerIds[0]!)
          if (!layer || !layer.effectStyleId) return null
          return (
            <button
              onClick={handleDetach}
              style={{
                marginTop: 4,
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 3,
              }}
            >
              Detach Effect Style
            </button>
          )
        })()}
    </div>
  )
}

// ── Main panel ──

export function StylesPanel() {
  return (
    <div
      style={{
        padding: 12,
        fontSize: 12,
        color: 'var(--text-primary)',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <h3
        style={{
          margin: '0 0 12px',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        Shared Styles
      </h3>
      <TextStylesSection />
      <ColorStylesSection />
      <EffectStylesSection />
    </div>
  )
}
