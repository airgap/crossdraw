import { useState } from 'react'
import { useEditorStore } from '@/store/editor.store'

export function SymbolsPanel() {
  const symbols = useEditorStore((s) => s.document.symbols ?? [])
  const selection = useEditorStore((s) => s.selection.layerIds)
  const viewport = useEditorStore((s) => s.viewport)
  const createSymbolDefinition = useEditorStore((s) => s.createSymbolDefinition)
  const deleteSymbolDefinition = useEditorStore((s) => s.deleteSymbolDefinition)
  const createSymbolInstance = useEditorStore((s) => s.createSymbolInstance)
  const renameSymbol = useEditorStore((s) => s.renameSymbol)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const hasSelection = selection.length > 0
  const activeArtboardId = viewport.artboardId ?? useEditorStore.getState().document.artboards[0]?.id

  function handleCreateSymbol() {
    if (!hasSelection) return
    const name = `Symbol ${symbols.length + 1}`
    createSymbolDefinition(name, selection)
  }

  function handleStartRename(symbolId: string, currentName: string) {
    setEditingId(symbolId)
    setEditName(currentName)
  }

  function handleFinishRename(symbolId: string) {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== symbols.find((s) => s.id === symbolId)?.name) {
      renameSymbol(symbolId, trimmed)
    }
    setEditingId(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, symbolId: string) {
    if (e.key === 'Enter') {
      handleFinishRename(symbolId)
    } else if (e.key === 'Escape') {
      setEditingId(null)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Create button */}
      <div style={{ padding: 'var(--space-2, 8px)' }}>
        <button
          disabled={!hasSelection}
          onClick={handleCreateSymbol}
          style={{
            width: '100%',
            padding: '6px 12px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            background: hasSelection ? 'var(--accent)' : 'var(--bg-surface)',
            color: hasSelection ? '#fff' : 'var(--text-disabled)',
            cursor: hasSelection ? 'pointer' : 'default',
            fontSize: 'var(--font-size-sm, 12px)',
            opacity: hasSelection ? 1 : 0.5,
          }}
        >
          Create Symbol
        </button>
        {!hasSelection && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-tertiary)',
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            Select layers to create a symbol
          </div>
        )}
      </div>

      {/* Symbols list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1, 4px)' }}>
        {symbols.length === 0 && (
          <div
            style={{
              padding: '16px 8px',
              textAlign: 'center',
              fontSize: 'var(--font-size-sm, 12px)',
              color: 'var(--text-tertiary)',
            }}
          >
            No symbols defined
          </div>
        )}

        {symbols.map((sym) => (
          <div
            key={sym.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm, 4px)',
              marginBottom: 2,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            {/* Symbol name (click to rename) */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {editingId === sym.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleFinishRename(sym.id)}
                  onKeyDown={(e) => handleRenameKeyDown(e, sym.id)}
                  style={{
                    width: '100%',
                    padding: '2px 4px',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--font-size-sm, 12px)',
                    outline: 'none',
                  }}
                />
              ) : (
                <span
                  onClick={() => handleStartRename(sym.id, sym.name)}
                  title="Click to rename"
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-sm, 12px)',
                    color: 'var(--text-primary)',
                    cursor: 'text',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sym.name}
                </span>
              )}
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                }}
              >
                {Math.round(sym.width)} x {Math.round(sym.height)} &middot; {sym.layers.length} layer
                {sym.layers.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Insert button */}
            <button
              onClick={() => {
                if (activeArtboardId) createSymbolInstance(activeArtboardId, sym.id)
              }}
              disabled={!activeArtboardId}
              title="Insert instance"
              style={{
                padding: '2px 8px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: activeArtboardId ? 'pointer' : 'default',
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              Insert
            </button>

            {/* Delete button */}
            <button
              onClick={() => deleteSymbolDefinition(sym.id)}
              title="Delete symbol"
              style={{
                padding: '2px 6px',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
