import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type {
  ComponentProperty,
  SymbolVariant,
  SymbolDefinition,
  GroupLayer,
  Layer,
  SymbolInstanceLayer,
  VectorLayer,
} from '@/types'

const smallInputStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm, 4px)',
  color: 'var(--text-primary)',
  fontSize: 'var(--font-size-sm, 12px)',
  padding: '2px 4px',
  width: '100%',
  height: 'var(--height-input, 24px)',
}

const tinyBtnStyle: React.CSSProperties = {
  padding: '2px 6px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm, 4px)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  flexShrink: 0,
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs, 10px)',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  marginBottom: 4,
  marginTop: 8,
  fontWeight: 600,
  letterSpacing: '0.3px',
}

export function SymbolsPanel() {
  const symbols = useEditorStore((s) => s.document.symbols ?? [])
  const selection = useEditorStore((s) => s.selection.layerIds)
  const viewport = useEditorStore((s) => s.viewport)
  const createSymbolDefinition = useEditorStore((s) => s.createSymbolDefinition)
  const deleteSymbolDefinition = useEditorStore((s) => s.deleteSymbolDefinition)
  const createSymbolInstance = useEditorStore((s) => s.createSymbolInstance)
  const renameSymbol = useEditorStore((s) => s.renameSymbol)
  const addComponentProperty = useEditorStore((s) => s.addComponentProperty)
  const removeComponentProperty = useEditorStore((s) => s.removeComponentProperty)
  const addVariant = useEditorStore((s) => s.addVariant)
  const removeVariant = useEditorStore((s) => s.removeVariant)
  const markAsSlot = useEditorStore((s) => s.markAsSlot)
  const unmarkSlot = useEditorStore((s) => s.unmarkSlot)
  const setSlotContent = useEditorStore((s) => s.setSlotContent)
  const clearSlotContent = useEditorStore((s) => s.clearSlotContent)
  const artboards = useEditorStore((s) => s.document.artboards)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [expandedSymbolId, setExpandedSymbolId] = useState<string | null>(null)

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

  function handleToggleExpand(symbolId: string) {
    setExpandedSymbolId(expandedSymbolId === symbolId ? null : symbolId)
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
          <div key={sym.id} style={{ marginBottom: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm, 4px)',
                background: expandedSymbolId === sym.id ? 'var(--bg-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (expandedSymbolId !== sym.id) {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (expandedSymbolId !== sym.id) {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }
              }}
            >
              {/* Expand/collapse toggle */}
              <button
                onClick={() => handleToggleExpand(sym.id)}
                style={{
                  ...tinyBtnStyle,
                  border: 'none',
                  padding: '0 4px',
                  fontSize: 10,
                  width: 16,
                  textAlign: 'center',
                }}
                title="Show properties & variants"
              >
                {expandedSymbolId === sym.id ? '\u25BC' : '\u25B6'}
              </button>

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
                  ...tinyBtnStyle,
                  padding: '2px 8px',
                  cursor: activeArtboardId ? 'pointer' : 'default',
                }}
              >
                Insert
              </button>

              {/* Delete button */}
              <button onClick={() => deleteSymbolDefinition(sym.id)} title="Delete symbol" style={tinyBtnStyle}>
                Delete
              </button>
            </div>

            {/* Expanded detail: Component Properties + Variants + Slots */}
            {expandedSymbolId === sym.id && (
              <SymbolDetail
                symbol={sym}
                addComponentProperty={addComponentProperty}
                removeComponentProperty={removeComponentProperty}
                addVariant={addVariant}
                removeVariant={removeVariant}
                markAsSlot={markAsSlot}
                unmarkSlot={unmarkSlot}
              />
            )}

            {/* Instance slot editing — show for instances of this symbol on the active artboard */}
            {expandedSymbolId === sym.id && activeArtboardId && (
              <InstanceSlotEditor
                symbol={sym}
                artboardId={activeArtboardId}
                artboards={artboards}
                setSlotContent={setSlotContent}
                clearSlotContent={clearSlotContent}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Symbol detail sub-panel (properties + variants) ─────────

function SymbolDetail({
  symbol,
  addComponentProperty,
  removeComponentProperty,
  addVariant,
  removeVariant,
  markAsSlot,
  unmarkSlot,
}: {
  symbol: SymbolDefinition
  addComponentProperty: (symbolId: string, prop: ComponentProperty) => void
  removeComponentProperty: (symbolId: string, propId: string) => void
  addVariant: (symbolId: string, variant: SymbolVariant) => void
  removeVariant: (symbolId: string, variantId: string) => void
  markAsSlot: (symbolId: string, layerId: string, slotName: string) => void
  unmarkSlot: (symbolId: string, layerId: string) => void
}) {
  const [showNewProp, setShowNewProp] = useState(false)
  const [newPropName, setNewPropName] = useState('')
  const [newPropType, setNewPropType] = useState<ComponentProperty['type']>('boolean')
  const [newPropDefault, setNewPropDefault] = useState('')
  const [newPropOptions, setNewPropOptions] = useState('')
  const [newPropTargetLayer, setNewPropTargetLayer] = useState('')

  const [showNewVariant, setShowNewVariant] = useState(false)
  const [newVariantName, setNewVariantName] = useState('')
  const [slotNameEditing, setSlotNameEditing] = useState<Record<string, string>>({})

  const props = symbol.componentProperties ?? []
  const variants = symbol.variants ?? []

  /** Flatten layers for the target layer picker */
  function flattenLayers(layers: import('@/types').Layer[], prefix = ''): { id: string; label: string }[] {
    const result: { id: string; label: string }[] = []
    for (const l of layers) {
      result.push({ id: l.id, label: prefix + l.name })
      if (l.type === 'group') {
        result.push(...flattenLayers(l.children, prefix + l.name + ' / '))
      }
    }
    return result
  }

  const flatLayers = flattenLayers(symbol.layers)

  function handleAddProperty() {
    const name = newPropName.trim()
    if (!name) return
    const prop: ComponentProperty = {
      id: uuid(),
      name,
      type: newPropType,
      defaultValue: newPropType === 'boolean' ? newPropDefault === 'true' : newPropDefault,
      options:
        newPropType === 'enum'
          ? newPropOptions
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
      targetLayerId: newPropTargetLayer || undefined,
    }
    addComponentProperty(symbol.id, prop)
    setNewPropName('')
    setNewPropDefault('')
    setNewPropOptions('')
    setNewPropTargetLayer('')
    setShowNewProp(false)
  }

  function handleAddVariant() {
    const name = newVariantName.trim()
    if (!name) return
    const variant: SymbolVariant = {
      id: uuid(),
      name,
      propertyValues: {},
      layerOverrides: {},
    }
    addVariant(symbol.id, variant)
    setNewVariantName('')
    setShowNewVariant(false)
  }

  return (
    <div
      style={{
        padding: '4px 12px 8px 28px',
        borderLeft: '2px solid var(--border-subtle)',
        marginLeft: 12,
      }}
    >
      {/* ── Component Properties ── */}
      <div style={sectionLabelStyle}>Component Properties</div>
      {props.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>No properties defined</div>
      )}
      {props.map((prop) => (
        <div
          key={prop.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
            fontSize: 11,
          }}
        >
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-primary)',
            }}
            title={`${prop.name} (${prop.type}) — default: ${String(prop.defaultValue)}${prop.targetLayerId ? ` — target: ${prop.targetLayerId}` : ''}`}
          >
            {prop.name}
            <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>{prop.type}</span>
          </span>
          <button
            onClick={() => removeComponentProperty(symbol.id, prop.id)}
            title="Remove property"
            style={{ ...tinyBtnStyle, fontSize: 10, padding: '0 4px' }}
          >
            x
          </button>
        </div>
      ))}

      {showNewProp ? (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: 6,
            marginTop: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input
              placeholder="Name"
              value={newPropName}
              onChange={(e) => setNewPropName(e.target.value)}
              style={{ ...smallInputStyle, flex: 1 }}
              autoFocus
            />
            <select
              value={newPropType}
              onChange={(e) => setNewPropType(e.target.value as ComponentProperty['type'])}
              style={{ ...smallInputStyle, width: 90 }}
            >
              <option value="boolean">Boolean</option>
              <option value="text">Text</option>
              <option value="enum">Enum</option>
              <option value="instance-swap">Instance Swap</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input
              placeholder={newPropType === 'boolean' ? 'true / false' : 'Default value'}
              value={newPropDefault}
              onChange={(e) => setNewPropDefault(e.target.value)}
              style={{ ...smallInputStyle, flex: 1 }}
            />
          </div>
          {newPropType === 'enum' && (
            <div style={{ marginBottom: 4 }}>
              <input
                placeholder="Options (comma-separated)"
                value={newPropOptions}
                onChange={(e) => setNewPropOptions(e.target.value)}
                style={smallInputStyle}
              />
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <select
              value={newPropTargetLayer}
              onChange={(e) => setNewPropTargetLayer(e.target.value)}
              style={smallInputStyle}
            >
              <option value="">No target layer</option>
              {flatLayers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleAddProperty} style={{ ...tinyBtnStyle, background: 'var(--accent)', color: '#fff' }}>
              Add
            </button>
            <button onClick={() => setShowNewProp(false)} style={tinyBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNewProp(true)} style={{ ...tinyBtnStyle, marginTop: 4, fontSize: 10 }}>
          + Add Property
        </button>
      )}

      {/* ── Variants ── */}
      <div style={{ ...sectionLabelStyle, marginTop: 12 }}>Variants</div>
      {variants.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>No variants defined</div>
      )}
      {variants.map((variant) => (
        <div
          key={variant.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 2,
            fontSize: 11,
          }}
        >
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: 'var(--text-primary)',
            }}
            title={`Variant: ${variant.name} — ${Object.keys(variant.propertyValues).length} property overrides, ${Object.keys(variant.layerOverrides).length} layer overrides`}
          >
            {variant.name}
          </span>
          <button
            onClick={() => removeVariant(symbol.id, variant.id)}
            title="Remove variant"
            style={{ ...tinyBtnStyle, fontSize: 10, padding: '0 4px' }}
          >
            x
          </button>
        </div>
      ))}

      {showNewVariant ? (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: 6,
            marginTop: 4,
          }}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <input
              placeholder="Variant name (e.g. Hover)"
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              style={{ ...smallInputStyle, flex: 1 }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddVariant()
                else if (e.key === 'Escape') setShowNewVariant(false)
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={handleAddVariant} style={{ ...tinyBtnStyle, background: 'var(--accent)', color: '#fff' }}>
              Add
            </button>
            <button onClick={() => setShowNewVariant(false)} style={tinyBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowNewVariant(true)} style={{ ...tinyBtnStyle, marginTop: 4, fontSize: 10 }}>
          + Add Variant
        </button>
      )}

      {/* ── Slots ── */}
      <div style={{ ...sectionLabelStyle, marginTop: 12 }}>Slots</div>
      {(() => {
        const groupLayers = flatLayers.filter((fl) => {
          const layer = findLayerInTree(symbol.layers, fl.id)
          return layer?.type === 'group'
        })
        if (groupLayers.length === 0) {
          return (
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              No group layers available for slots
            </div>
          )
        }
        return groupLayers.map((fl) => {
          const layer = findLayerInTree(symbol.layers, fl.id) as GroupLayer
          const isSlot = layer.isSlot === true
          return (
            <div
              key={fl.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 2,
                fontSize: 11,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flex: 1,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  minWidth: 0,
                }}
                title={isSlot ? `Slot: ${layer.slotName ?? ''}` : 'Click to mark as slot'}
              >
                <input
                  type="checkbox"
                  checked={isSlot}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const defaultName = slotNameEditing[fl.id] ?? layer.name.toLowerCase().replace(/\s+/g, '-')
                      markAsSlot(symbol.id, fl.id, defaultName)
                    } else {
                      unmarkSlot(symbol.id, fl.id)
                      setSlotNameEditing((prev) => {
                        const next = { ...prev }
                        delete next[fl.id]
                        return next
                      })
                    }
                  }}
                  style={{ margin: 0, flexShrink: 0 }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fl.label}
                </span>
              </label>
              {isSlot && (
                <input
                  placeholder="Slot name"
                  value={slotNameEditing[fl.id] ?? layer.slotName ?? ''}
                  onChange={(e) => {
                    setSlotNameEditing((prev) => ({ ...prev, [fl.id]: e.target.value }))
                  }}
                  onBlur={() => {
                    const val = (slotNameEditing[fl.id] ?? '').trim()
                    if (val && val !== layer.slotName) {
                      markAsSlot(symbol.id, fl.id, val)
                    }
                    setSlotNameEditing((prev) => {
                      const next = { ...prev }
                      delete next[fl.id]
                      return next
                    })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                  style={{ ...smallInputStyle, width: 80, flexShrink: 0 }}
                />
              )}
            </div>
          )
        })
      })()}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

/** Recursively find a layer by ID within a layer tree. */
function findLayerInTree(layers: Layer[], id: string): Layer | undefined {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const found = findLayerInTree((l as GroupLayer).children, id)
      if (found) return found
    }
  }
  return undefined
}

/** Collect all slot definitions from a symbol's layer tree. */
function collectSlots(layers: Layer[]): { layerId: string; slotName: string; defaultChildCount: number }[] {
  const result: { layerId: string; slotName: string; defaultChildCount: number }[] = []
  for (const l of layers) {
    if (l.type === 'group') {
      const g = l as GroupLayer
      if (g.isSlot && g.slotName) {
        result.push({ layerId: g.id, slotName: g.slotName, defaultChildCount: g.children.length })
      }
      result.push(...collectSlots(g.children))
    }
  }
  return result
}

// ─── Instance Slot Editor ───────────────────────────────────

function InstanceSlotEditor({
  symbol,
  artboardId,
  artboards,
  setSlotContent,
  clearSlotContent,
}: {
  symbol: SymbolDefinition
  artboardId: string
  artboards: import('@/types').Artboard[]
  setSlotContent: (artboardId: string, instanceLayerId: string, slotName: string, content: Layer[]) => void
  clearSlotContent: (artboardId: string, instanceLayerId: string, slotName: string) => void
}) {
  const slots = collectSlots(symbol.layers)
  if (slots.length === 0) return null

  // Find all instances of this symbol on the active artboard
  const artboard = artboards.find((a) => a.id === artboardId)
  if (!artboard) return null

  function findInstances(layers: Layer[]): SymbolInstanceLayer[] {
    const result: SymbolInstanceLayer[] = []
    for (const l of layers) {
      if (l.type === 'symbol-instance' && (l as SymbolInstanceLayer).symbolId === symbol.id) {
        result.push(l as SymbolInstanceLayer)
      }
      if (l.type === 'group') {
        result.push(...findInstances((l as GroupLayer).children))
      }
    }
    return result
  }

  const instances = findInstances(artboard.layers)
  if (instances.length === 0) return null

  return (
    <div
      style={{
        padding: '4px 12px 8px 28px',
        borderLeft: '2px solid var(--border-subtle)',
        marginLeft: 12,
      }}
    >
      <div style={sectionLabelStyle}>Instance Slots</div>
      {instances.map((inst) => (
        <div key={inst.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-primary)',
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {inst.name}
          </div>
          {slots.map((slot) => {
            const filled = inst.slotContent?.[slot.slotName]
            const isFilled = filled !== undefined && filled.length > 0
            return (
              <div
                key={slot.slotName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  marginBottom: 2,
                  fontSize: 11,
                  paddingLeft: 8,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-primary)',
                  }}
                  title={`Slot: ${slot.slotName}${isFilled ? ` (${filled.length} layer${filled.length !== 1 ? 's' : ''})` : ' (default)'}`}
                >
                  {slot.slotName}
                  <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                    {isFilled
                      ? `${filled.length} layer${filled.length !== 1 ? 's' : ''}`
                      : `default (${slot.defaultChildCount})`}
                  </span>
                </span>
                <button
                  onClick={() => {
                    // Create a simple placeholder vector layer for the slot
                    const placeholderLayer: VectorLayer = {
                      id: uuid(),
                      name: `${slot.slotName} content`,
                      type: 'vector',
                      visible: true,
                      locked: false,
                      opacity: 1,
                      blendMode: 'normal',
                      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                      effects: [],
                      paths: [],
                      fill: { type: 'solid', color: '#cccccc', opacity: 1 },
                      stroke: null,
                    }
                    setSlotContent(artboardId, inst.id, slot.slotName, [placeholderLayer])
                  }}
                  title="Edit slot content"
                  style={{ ...tinyBtnStyle, fontSize: 10, padding: '1px 5px' }}
                >
                  Edit Slot
                </button>
                {isFilled && (
                  <button
                    onClick={() => clearSlotContent(artboardId, inst.id, slot.slotName)}
                    title="Reset to default content"
                    style={{ ...tinyBtnStyle, fontSize: 10, padding: '1px 5px' }}
                  >
                    Reset to Default
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
