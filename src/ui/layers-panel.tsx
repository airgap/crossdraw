import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { EmptyState } from '@/ui/empty-state'
import type { Layer, GroupLayer } from '@/types'
import {
  PenTool,
  Image,
  Folder,
  SlidersHorizontal,
  Type,
  Component,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Lock,
  type LucideIcon,
} from 'lucide-react'

const TYPE_ICONS: Record<string, LucideIcon> = {
  vector: PenTool,
  raster: Image,
  group: Folder,
  adjustment: SlidersHorizontal,
  text: Type,
  'symbol-instance': Component,
}

interface DragState {
  layerId: string
  sourceIndex: number
}

interface ContextMenuState {
  x: number
  y: number
  layerId: string
  layerType: string
  artboardId: string
}

export function LayersPanel() {
  const document = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const setLayerVisibility = useEditorStore((s) => s.setLayerVisibility)
  const setLayerLocked = useEditorStore((s) => s.setLayerLocked)
  const reorderLayer = useEditorStore((s) => s.reorderLayer)
  const updateLayer = useEditorStore((s) => s.updateLayer)
  const deleteLayer = useEditorStore((s) => s.deleteLayer)
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer)
  const groupLayers = useEditorStore((s) => s.groupLayers)
  const ungroupLayer = useEditorStore((s) => s.ungroupLayer)

  const [dragOver, setDragOver] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | ''>('')
  const dragRef = useRef<DragState | null>(null)

  const artboard = document.artboards[0]
  if (!artboard) return null

  const handleDragStart = useCallback((layerId: string, index: number, e: React.DragEvent) => {
    dragRef.current = { layerId, sourceIndex: index }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', layerId)
    // Make ghost semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    dragRef.current = null
    setDragOver(null)
  }, [])

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(index)
  }, [])

  const handleDrop = useCallback(
    (targetIndex: number, e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(null)
      if (!dragRef.current || !artboard) return

      const { layerId, sourceIndex } = dragRef.current
      // Convert visual (reversed) indices to actual array indices
      const totalLayers = artboard.layers.length
      const actualSource = totalLayers - 1 - sourceIndex
      let actualTarget = totalLayers - 1 - targetIndex
      if (actualSource < actualTarget) actualTarget-- // adjust for removal shift

      if (actualSource !== actualTarget && actualTarget >= 0) {
        reorderLayer(artboard.id, layerId, actualTarget)
      }
      dragRef.current = null
    },
    [artboard, reorderLayer],
  )

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('click', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  const handleContextMenu = useCallback((layer: Layer, artboardId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      layerId: layer.id,
      layerType: layer.type,
      artboardId,
    })
  }, [])

  const filteredLayers = artboard.layers.filter((layer) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!layer.name.toLowerCase().includes(q)) return false
    }
    if (typeFilter && layer.type !== typeFilter) return false
    return true
  })
  const reversedLayers = [...filteredLayers].reverse()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        flex: 1,
      }}
    >
      {/* Header provided by Sidebar wrapper */}
      {/* Search and filter */}
      <div
        style={{
          padding: 'var(--space-1) var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: 'var(--space-1)',
        }}
      >
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search layers..."
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '3px 6px',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-primary)',
            outline: 'none',
            minWidth: 0,
            height: 'var(--height-input)',
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-primary)',
            width: 50,
            height: 'var(--height-input)',
          }}
        >
          <option value="">All</option>
          <option value="vector">Vec</option>
          <option value="raster">Img</option>
          <option value="text">Txt</option>
          <option value="group">Grp</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1)' }}>
        {reversedLayers.map((layer, visualIndex) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            artboardId={artboard.id}
            selection={selection}
            selectLayer={selectLayer}
            setLayerVisibility={setLayerVisibility}
            setLayerLocked={setLayerLocked}
            depth={0}
            visualIndex={visualIndex}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            dragOverIndex={dragOver}
            onContextMenu={handleContextMenu}
            editingLayerId={editingLayerId}
            setEditingLayerId={setEditingLayerId}
            updateLayer={updateLayer}
          />
        ))}
        {artboard.layers.length === 0 && (
          <EmptyState
            message="No layers"
            hint="Draw on the canvas or import a file to add layers."
          />
        )}
        {artboard.layers.length > 0 && reversedLayers.length === 0 && (
          <EmptyState
            message="No matching layers"
            hint="Try adjusting your search or filter."
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          {...contextMenu}
          selection={selection}
          deleteLayer={deleteLayer}
          duplicateLayer={duplicateLayer}
          groupLayers={groupLayers}
          ungroupLayer={ungroupLayer}
          setLayerVisibility={setLayerVisibility}
          setLayerLocked={setLayerLocked}
          reorderLayer={reorderLayer}
          setEditingLayerId={setEditingLayerId}
          layers={artboard.layers}
        />
      )}
    </div>
  )
}

function LayerRow({
  layer,
  artboardId,
  selection,
  selectLayer,
  setLayerVisibility,
  setLayerLocked,
  depth,
  visualIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  dragOverIndex,
  onContextMenu,
  editingLayerId,
  setEditingLayerId,
  updateLayer,
}: {
  layer: Layer
  artboardId: string
  selection: { layerIds: string[] }
  selectLayer: (id: string, multi?: boolean) => void
  setLayerVisibility: (a: string, l: string, v: boolean) => void
  setLayerLocked: (a: string, l: string, v: boolean) => void
  depth: number
  visualIndex: number
  onDragStart: (layerId: string, index: number, e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (index: number, e: React.DragEvent) => void
  onDrop: (index: number, e: React.DragEvent) => void
  dragOverIndex: number | null
  onContextMenu: (layer: Layer, artboardId: string, e: React.MouseEvent) => void
  editingLayerId: string | null
  setEditingLayerId: (id: string | null) => void
  updateLayer: (a: string, l: string, updates: Partial<Layer>) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const isGroup = layer.type === 'group'
  const isSelected = selection.layerIds.includes(layer.id)
  const isEditing = editingLayerId === layer.id
  const isDragTarget = dragOverIndex === visualIndex

  return (
    <>
      <div
        draggable={!isEditing}
        onDragStart={(e) => onDragStart(layer.id, visualIndex, e)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOver(visualIndex, e)}
        onDrop={(e) => onDrop(visualIndex, e)}
        onClick={(e) => {
          if (!isEditing) selectLayer(layer.id, e.shiftKey)
        }}
        onContextMenu={(e) => onContextMenu(layer, artboardId, e)}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
        style={{
          padding: '5px 8px',
          paddingLeft: 8 + depth * 16,
          fontSize: 'var(--font-size-base)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: isSelected ? 'var(--accent)' : 'transparent',
          color: layer.visible ? (isSelected ? '#fff' : 'var(--text-primary)') : 'var(--text-disabled)',
          opacity: layer.visible ? 1 : 0.5,
          borderTop: isDragTarget ? '2px solid var(--accent)' : '2px solid transparent',
          userSelect: 'none',
        }}
      >
        {/* Visibility toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setLayerVisibility(artboardId, layer.id, !layer.visible)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: layer.visible ? 'var(--text-secondary)' : 'var(--text-disabled)',
            padding: 0,
            width: 14,
            display: 'flex',
            alignItems: 'center',
          }}
          title={layer.visible ? 'Hide' : 'Show'}
        >
          {layer.visible ? <Eye size={12} strokeWidth={1.75} /> : <EyeOff size={12} strokeWidth={1.75} />}
        </button>

        {/* Group expand/collapse */}
        {isGroup && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: 0,
              width: 10,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {expanded ? <ChevronDown size={10} strokeWidth={2} /> : <ChevronRight size={10} strokeWidth={2} />}
          </button>
        )}

        {/* Type icon */}
        <span
          style={{
            color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
            width: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {(() => {
            const Icon = TYPE_ICONS[layer.type]
            return Icon ? <Icon size={12} strokeWidth={1.75} /> : '?'
          })()}
        </span>

        {/* Name — inline editable */}
        {isEditing ? (
          <InlineRenameInput
            initialName={layer.name}
            onConfirm={(newName) => {
              if (newName.trim()) {
                updateLayer(artboardId, layer.id, { name: newName.trim() } as Partial<Layer>)
              }
              setEditingLayerId(null)
            }}
            onCancel={() => setEditingLayerId(null)}
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditingLayerId(layer.id)
            }}
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {layer.name}
          </span>
        )}

        {/* Lock indicator */}
        {layer.locked && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              setLayerLocked(artboardId, layer.id, false)
            }}
            style={{ color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Unlock"
          >
            <Lock size={10} strokeWidth={2} />
          </span>
        )}
      </div>

      {/* Group children */}
      {isGroup &&
        expanded &&
        (layer as GroupLayer).children &&
        [...(layer as GroupLayer).children]
          .reverse()
          .map((child) => (
            <LayerRow
              key={child.id}
              layer={child}
              artboardId={artboardId}
              selection={selection}
              selectLayer={selectLayer}
              setLayerVisibility={setLayerVisibility}
              setLayerLocked={setLayerLocked}
              depth={depth + 1}
              visualIndex={visualIndex}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              dragOverIndex={dragOverIndex}
              onContextMenu={onContextMenu}
              editingLayerId={editingLayerId}
              setEditingLayerId={setEditingLayerId}
              updateLayer={updateLayer}
            />
          ))}
    </>
  )
}

function InlineRenameInput({
  initialName,
  onConfirm,
  onCancel,
}: {
  initialName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.focus()
      el.select()
    }
  }, [])

  return (
    <input
      ref={inputRef}
      defaultValue={initialName}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          onConfirm((e.target as HTMLInputElement).value)
        } else if (e.key === 'Escape') {
          onCancel()
        }
      }}
      onBlur={(e) => onConfirm(e.target.value)}
      style={{
        flex: 1,
        background: 'var(--bg-input)',
        border: '1px solid var(--accent)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-primary)',
        fontSize: 'var(--font-size-base)',
        padding: '1px 4px',
        outline: 'none',
        minWidth: 0,
      }}
    />
  )
}

function ContextMenu({
  x,
  y,
  layerId,
  layerType,
  artboardId,
  selection,
  deleteLayer,
  duplicateLayer,
  groupLayers,
  ungroupLayer,
  setLayerVisibility,
  setLayerLocked,
  reorderLayer,
  setEditingLayerId,
  layers,
}: ContextMenuState & {
  selection: { layerIds: string[] }
  deleteLayer: (a: string, l: string) => void
  duplicateLayer: (a: string, l: string) => void
  groupLayers: (a: string, ids: string[]) => void
  ungroupLayer: (a: string, g: string) => void
  setLayerVisibility: (a: string, l: string, v: boolean) => void
  setLayerLocked: (a: string, l: string, v: boolean) => void
  reorderLayer: (a: string, l: string, idx: number) => void
  setEditingLayerId: (id: string | null) => void
  layers: Layer[]
}) {
  const layer = layers.find((l) => l.id === layerId)
  if (!layer) return null

  const multiSelected = selection.layerIds.length >= 2

  const menuItems: { label: string; action: () => void; disabled?: boolean; separator?: boolean }[] = [
    { label: 'Rename', action: () => setEditingLayerId(layerId) },
    { label: 'Duplicate', action: () => duplicateLayer(artboardId, layerId) },
    { label: 'Delete', action: () => deleteLayer(artboardId, layerId) },
    { label: '', action: () => {}, separator: true },
    {
      label: 'Group Selection',
      action: () => groupLayers(artboardId, selection.layerIds),
      disabled: !multiSelected,
    },
    {
      label: 'Ungroup',
      action: () => ungroupLayer(artboardId, layerId),
      disabled: layerType !== 'group',
    },
    { label: '', action: () => {}, separator: true },
    {
      label: 'Move to Top',
      action: () => reorderLayer(artboardId, layerId, layers.length - 1),
    },
    {
      label: 'Move Up',
      action: () => {
        const idx = layers.findIndex((l) => l.id === layerId)
        if (idx < layers.length - 1) reorderLayer(artboardId, layerId, idx + 1)
      },
    },
    {
      label: 'Move Down',
      action: () => {
        const idx = layers.findIndex((l) => l.id === layerId)
        if (idx > 0) reorderLayer(artboardId, layerId, idx - 1)
      },
    },
    {
      label: 'Move to Bottom',
      action: () => reorderLayer(artboardId, layerId, 0),
    },
    { label: '', action: () => {}, separator: true },
    {
      label: layer.locked ? 'Unlock' : 'Lock',
      action: () => setLayerLocked(artboardId, layerId, !layer.locked),
    },
    {
      label: layer.visible ? 'Hide' : 'Show',
      action: () => setLayerVisibility(artboardId, layerId, !layer.visible),
    },
  ]

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-1) 0',
        zIndex: 9999,
        minWidth: 160,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item, i) =>
        item.separator ? (
          <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: 'var(--space-1) 0' }} />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            onClick={() => item.action()}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              padding: '6px 12px',
              fontSize: 'var(--font-size-base)',
              color: item.disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.4 : 1,
              borderRadius: 0,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
