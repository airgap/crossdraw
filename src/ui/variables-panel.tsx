import { useState, useRef, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { VariableCollection, Variable, VariableValue, VariableType } from '@/variables/variable-types'
import { getInheritedVariables, getEffectiveValue, wouldCreateCycle } from '@/variables/variable-types'

// ── Variables Panel ──

export function VariablesPanel() {
  const collections = useEditorStore((s) => s.document.variableCollections ?? [])
  const activeModeIds = useEditorStore((s) => s.activeModeIds)
  const addVariableCollection = useEditorStore((s) => s.addVariableCollection)
  const removeVariableCollection = useEditorStore((s) => s.removeVariableCollection)
  const renameVariableCollection = useEditorStore((s) => s.renameVariableCollection)
  const addVariableMode = useEditorStore((s) => s.addVariableMode)
  const removeVariableMode = useEditorStore((s) => s.removeVariableMode)
  const addVariable = useEditorStore((s) => s.addVariable)
  const removeVariable = useEditorStore((s) => s.removeVariable)
  const setVariableValue = useEditorStore((s) => s.setVariableValue)
  const setActiveMode = useEditorStore((s) => s.setActiveMode)
  const setCollectionExtends = useEditorStore((s) => s.setCollectionExtends)
  const removeVariableOverride = useEditorStore((s) => s.removeVariableOverride)

  const [expandedCollectionId, setExpandedCollectionId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    variableId: string
    collectionId: string
  } | null>(null)
  const [editingName, setEditingName] = useState<{ type: 'collection' | 'variable'; id: string } | null>(null)
  const [dragState, setDragState] = useState<{ variableId: string; collectionId: string } | null>(null)

  // ── Create collection ──
  function handleCreateCollection() {
    addVariableCollection('New Collection')
  }

  // ── Create variable with type picker ──
  function handleCreateVariable(collectionId: string, type: VariableType) {
    const defaultNames: Record<VariableType, string> = {
      color: 'New Color',
      number: 'New Number',
      string: 'New String',
      boolean: 'New Boolean',
    }
    addVariable(collectionId, defaultNames[type], type)
  }

  // ── Context menu actions ──
  function handleContextMenu(e: React.MouseEvent, variableId: string, collectionId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, variableId, collectionId })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function handleDeleteVariable() {
    if (!contextMenu) return
    removeVariable(contextMenu.collectionId, contextMenu.variableId)
    closeContextMenu()
  }

  function handleDuplicateVariable() {
    if (!contextMenu) return
    const collection = collections.find((c) => c.id === contextMenu.collectionId)
    if (!collection) return
    const variable = collection.variables.find((v) => v.id === contextMenu.variableId)
    if (!variable) return
    addVariable(contextMenu.collectionId, `${variable.name} Copy`, variable.type)
    closeContextMenu()
  }

  function handleRenameVariable() {
    if (!contextMenu) return
    setEditingName({ type: 'variable', id: contextMenu.variableId })
    closeContextMenu()
  }

  // ── Filter variables by search ──
  function filterVariables(variables: Variable[]): Variable[] {
    if (!searchQuery.trim()) return variables
    const q = searchQuery.toLowerCase()
    return variables.filter((v) => v.name.toLowerCase().includes(q) || v.type.toLowerCase().includes(q))
  }

  // ── Drag to reorder ──
  function handleDragStart(variableId: string, collectionId: string) {
    setDragState({ variableId, collectionId })
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(targetVariableId: string, collectionId: string) {
    if (!dragState || dragState.collectionId !== collectionId || dragState.variableId === targetVariableId) {
      setDragState(null)
      return
    }
    // Reorder is handled by removing and re-inserting — but since we don't have a dedicated
    // reorder action, we just clear drag state. In a full implementation, a reorderVariable
    // store action would be used here.
    setDragState(null)
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}
      onClick={() => contextMenu && closeContextMenu()}
    >
      {/* Search bar */}
      <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          type="text"
          placeholder="Search variables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 8px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-sm)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Collection list */}
      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-1)' }}>
        {collections.length === 0 && (
          <div
            style={{
              padding: 'var(--space-4)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            No variable collections yet.
            <br />
            Click "+" below to create one.
          </div>
        )}

        {collections.map((collection) => {
          const allVars = getInheritedVariables(collection, collections)
          const ownVarIds = new Set(collection.variables.map((v) => v.id))
          return (
            <CollectionRow
              key={collection.id}
              collection={collection}
              allCollections={collections}
              expanded={expandedCollectionId === collection.id}
              onToggleExpand={() => setExpandedCollectionId((prev) => (prev === collection.id ? null : collection.id))}
              onRename={(name) => renameVariableCollection(collection.id, name)}
              onDelete={() => removeVariableCollection(collection.id)}
              onAddMode={(name) => addVariableMode(collection.id, name)}
              onRemoveMode={(modeId) => removeVariableMode(collection.id, modeId)}
              onCreateVariable={(type) => handleCreateVariable(collection.id, type)}
              filteredVariables={filterVariables(allVars)}
              ownVariableIds={ownVarIds}
              activeModeId={activeModeIds[collection.id] ?? collection.modes[0]?.id ?? ''}
              onSetActiveMode={(modeId) => setActiveMode(collection.id, modeId)}
              onSetVariableValue={(variableId, modeId, value) =>
                setVariableValue(collection.id, variableId, modeId, value)
              }
              onSetExtends={(extendsId) => setCollectionExtends(collection.id, extendsId)}
              onRemoveOverride={(variableId) => removeVariableOverride(collection.id, variableId)}
              onContextMenu={handleContextMenu}
              editingName={editingName}
              setEditingName={setEditingName}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            />
          )
        })}
      </div>

      {/* Bottom toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: 'var(--space-2)',
          borderTop: '1px solid var(--border-subtle)',
          gap: 'var(--space-1)',
        }}
      >
        <button
          onClick={handleCreateCollection}
          title="Create variable collection"
          style={{
            padding: '4px 12px',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-active)',
            color: '#fff',
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
          }}
        >
          + Collection
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: 140,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            padding: '4px 0',
            zIndex: 2000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenuItem label="Rename" onClick={handleRenameVariable} />
          <ContextMenuItem label="Duplicate" onClick={handleDuplicateVariable} />
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 8px' }} />
          <ContextMenuItem label="Delete" onClick={handleDeleteVariable} danger />
        </div>
      )}
    </div>
  )
}

// ── Context menu item ──

function ContextMenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 16px',
        cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        color: danger ? '#e55' : 'var(--text-primary)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {label}
    </div>
  )
}

// ── Collection row ──

interface CollectionRowProps {
  collection: VariableCollection
  allCollections: VariableCollection[]
  expanded: boolean
  onToggleExpand: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddMode: (name: string) => void
  onRemoveMode: (modeId: string) => void
  onCreateVariable: (type: VariableType) => void
  filteredVariables: Variable[]
  ownVariableIds: Set<string>
  activeModeId: string
  onSetActiveMode: (modeId: string) => void
  onSetVariableValue: (variableId: string, modeId: string, value: VariableValue) => void
  onSetExtends: (extendsId: string | null) => void
  onRemoveOverride: (variableId: string) => void
  onContextMenu: (e: React.MouseEvent, variableId: string, collectionId: string) => void
  editingName: { type: 'collection' | 'variable'; id: string } | null
  setEditingName: (v: { type: 'collection' | 'variable'; id: string } | null) => void
  onDragStart: (variableId: string, collectionId: string) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (targetVariableId: string, collectionId: string) => void
}

function CollectionRow({
  collection,
  allCollections,
  expanded,
  onToggleExpand,
  onRename,
  onDelete,
  onAddMode,
  onRemoveMode,
  onCreateVariable,
  filteredVariables,
  ownVariableIds,
  activeModeId,
  onSetActiveMode,
  onSetVariableValue,
  onSetExtends,
  onRemoveOverride,
  onContextMenu,
  editingName,
  setEditingName,
  onDragStart,
  onDragOver,
  onDrop,
}: CollectionRowProps) {
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const isEditingCollectionName = editingName?.type === 'collection' && editingName.id === collection.id

  // Compute eligible collections for the "Extends" dropdown (exclude self and anything that would cycle)
  const eligibleExtends = allCollections.filter(
    (c) => c.id !== collection.id && !wouldCreateCycle(collection.id, c.id, allCollections),
  )

  return (
    <div style={{ marginBottom: 'var(--space-1)' }}>
      {/* Collection header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          gap: 'var(--space-1)',
        }}
        onClick={onToggleExpand}
      >
        <span style={{ fontSize: 10, color: 'var(--text-secondary)', width: 12 }}>
          {expanded ? '\u25BC' : '\u25B6'}
        </span>

        {isEditingCollectionName ? (
          <InlineEdit
            value={collection.name}
            onCommit={(v) => {
              onRename(v)
              setEditingName(null)
            }}
            onCancel={() => setEditingName(null)}
          />
        ) : (
          <span
            style={{ flex: 1, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-primary)' }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditingName({ type: 'collection', id: collection.id })
            }}
          >
            {collection.name}
          </span>
        )}

        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          {collection.variables.length}
        </span>

        <button
          title="Delete collection"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '0 4px',
          }}
        >
          x
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ paddingLeft: 12 }}>
          {/* Mode tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '6px 0',
              borderBottom: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginRight: 4 }}>
              Modes:
            </span>
            {collection.modes.map((mode) => (
              <div key={mode.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  onClick={() => onSetActiveMode(mode.id)}
                  style={{
                    padding: '2px 8px',
                    border: activeModeId === mode.id ? '1px solid var(--bg-active)' : '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    background: activeModeId === mode.id ? 'var(--bg-active)' : 'transparent',
                    color: activeModeId === mode.id ? '#fff' : 'var(--text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  {mode.name}
                </button>
                {collection.modes.length > 1 && (
                  <button
                    title={`Remove mode "${mode.name}"`}
                    onClick={() => onRemoveMode(mode.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 10,
                      padding: 0,
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
            <button
              title="Add mode"
              onClick={() => {
                const name = prompt('Mode name:')
                if (name?.trim()) onAddMode(name.trim())
              }}
              style={{
                border: '1px dashed var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-sm)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              +
            </button>
          </div>

          {/* Extends dropdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              padding: '6px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginRight: 4 }}>
              Extends:
            </span>
            <select
              value={collection.extendsCollectionId ?? ''}
              onChange={(e) => {
                const val = e.target.value
                onSetExtends(val === '' ? null : val)
              }}
              style={{
                flex: 1,
                padding: '2px 4px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <option value="">None</option>
              {eligibleExtends.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Variable rows */}
          {filteredVariables.map((variable) => {
            const isInherited = !ownVariableIds.has(variable.id)
            const hasLocalOverride = variable.id in (collection.values ?? {})
            return (
              <VariableRow
                key={variable.id}
                variable={variable}
                collection={collection}
                allCollections={allCollections}
                activeModeId={activeModeId}
                isInherited={isInherited}
                hasLocalOverride={hasLocalOverride}
                onSetValue={(modeId, value) => onSetVariableValue(variable.id, modeId, value)}
                onResetOverride={isInherited && hasLocalOverride ? () => onRemoveOverride(variable.id) : undefined}
                onContextMenu={(e) => onContextMenu(e, variable.id, collection.id)}
                isEditing={editingName?.type === 'variable' && editingName.id === variable.id}
                setEditingName={setEditingName}
                onDragStart={() => onDragStart(variable.id, collection.id)}
                onDragOver={onDragOver}
                onDrop={() => onDrop(variable.id, collection.id)}
              />
            )
          })}

          {filteredVariables.length === 0 && collection.variables.length > 0 && (
            <div
              style={{
                padding: 'var(--space-2)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--font-size-sm)',
                textAlign: 'center',
              }}
            >
              No matching variables
            </div>
          )}

          {/* Add variable button with type selector */}
          <div style={{ padding: '6px 0', display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
            {showTypeSelector ? (
              <>
                {(['color', 'number', 'string', 'boolean'] as VariableType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      onCreateVariable(t)
                      setShowTypeSelector(false)
                    }}
                    style={{
                      padding: '2px 8px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--font-size-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    {typeIcon(t)} {t}
                  </button>
                ))}
                <button
                  onClick={() => setShowTypeSelector(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowTypeSelector(true)}
                style={{
                  padding: '4px 12px',
                  border: '1px dashed var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                }}
              >
                + Variable
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Type icon helper ──

function typeIcon(type: VariableType): string {
  switch (type) {
    case 'color':
      return '\u25CF'
    case 'number':
      return '#'
    case 'string':
      return 'T'
    case 'boolean':
      return '\u2713'
  }
}

// ── Variable row ──

interface VariableRowProps {
  variable: Variable
  collection: VariableCollection
  allCollections: VariableCollection[]
  activeModeId: string
  isInherited: boolean
  hasLocalOverride: boolean
  onSetValue: (modeId: string, value: VariableValue) => void
  onResetOverride?: () => void
  onContextMenu: (e: React.MouseEvent) => void
  isEditing: boolean
  setEditingName: (v: { type: 'collection' | 'variable'; id: string } | null) => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
}

function VariableRow({
  variable,
  collection,
  allCollections,
  activeModeId,
  isInherited,
  hasLocalOverride,
  onSetValue,
  onResetOverride,
  onContextMenu,
  isEditing,
  setEditingName,
  onDragStart,
  onDragOver,
  onDrop,
}: VariableRowProps) {
  // For inherited variables, resolve the effective value from the chain
  const currentValue =
    isInherited && !hasLocalOverride
      ? getEffectiveValue(collection, variable.id, activeModeId, allCollections)
      : collection.values[variable.id]?.[activeModeId] ?? null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        gap: 'var(--space-2)',
        borderBottom: '1px solid var(--border-subtle)',
        cursor: 'grab',
        opacity: isInherited && !hasLocalOverride ? 0.6 : 1,
      }}
    >
      {/* Inherited indicator */}
      {isInherited && (
        <span
          title="Inherited from parent collection"
          style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            width: 14,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {'\u2191'}
        </span>
      )}

      {/* Type indicator */}
      <span
        style={{
          width: 20,
          textAlign: 'center',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
        }}
        title={variable.type}
      >
        {typeIcon(variable.type)}
      </span>

      {/* Name */}
      {isEditing ? (
        <InlineEdit value={variable.name} onCommit={() => setEditingName(null)} onCancel={() => setEditingName(null)} />
      ) : (
        <span
          style={{
            flex: 1,
            fontSize: 'var(--font-size-sm)',
            color: isInherited ? 'var(--text-secondary)' : 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontStyle: isInherited && !hasLocalOverride ? 'italic' : 'normal',
          }}
          onDoubleClick={() => setEditingName({ type: 'variable', id: variable.id })}
        >
          {variable.name}
        </span>
      )}

      {/* Value editor for active mode */}
      <div style={{ flexShrink: 0 }}>
        <VariableValueEditor
          type={variable.type}
          value={currentValue}
          onChange={(val) => onSetValue(activeModeId, val)}
        />
      </div>

      {/* Reset to inherited button */}
      {onResetOverride && (
        <button
          title="Reset to inherited value"
          onClick={(e) => {
            e.stopPropagation()
            onResetOverride()
          }}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 10,
            padding: '0 4px',
            flexShrink: 0,
          }}
        >
          {'\u21A9'}
        </button>
      )}
    </div>
  )
}

// ── Value editor per type ──

function VariableValueEditor({
  type,
  value,
  onChange,
}: {
  type: VariableType
  value: VariableValue | null
  onChange: (v: VariableValue) => void
}) {
  switch (type) {
    case 'color': {
      const colorVal = value?.type === 'color' ? value.value : '#000000'
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="color"
            value={colorVal}
            onChange={(e) => onChange({ type: 'color', value: e.target.value })}
            style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
          />
          <input
            type="text"
            value={colorVal}
            onChange={(e) => onChange({ type: 'color', value: e.target.value })}
            style={{
              width: 72,
              padding: '2px 4px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)',
            }}
          />
        </div>
      )
    }
    case 'number': {
      const numVal = value?.type === 'number' ? value.value : 0
      return (
        <input
          type="number"
          value={numVal}
          onChange={(e) => onChange({ type: 'number', value: parseFloat(e.target.value) || 0 })}
          style={{
            width: 72,
            padding: '2px 4px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-sm)',
          }}
        />
      )
    }
    case 'string': {
      const strVal = value?.type === 'string' ? value.value : ''
      return (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange({ type: 'string', value: e.target.value })}
          style={{
            width: 100,
            padding: '2px 4px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-sm)',
          }}
        />
      )
    }
    case 'boolean': {
      const boolVal = value?.type === 'boolean' ? value.value : false
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={boolVal}
            onChange={(e) => onChange({ type: 'boolean', value: e.target.checked })}
          />
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            {boolVal ? 'true' : 'false'}
          </span>
        </label>
      )
    }
  }
}

// ── Inline edit helper ──

function InlineEdit({
  value,
  onCommit,
  onCancel,
}: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)

  const commit = useCallback(() => {
    onCommit(text.trim() || value)
  }, [text, value, onCommit])

  return (
    <input
      ref={inputRef}
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onCancel()
      }}
      style={{
        flex: 1,
        padding: '1px 4px',
        border: '1px solid var(--bg-active)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--bg-input)',
        color: 'var(--text-primary)',
        fontSize: 'var(--font-size-sm)',
        outline: 'none',
      }}
    />
  )
}
