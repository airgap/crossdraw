import { v4 as uuid } from 'uuid'
import { useEditorStore } from '@/store/editor.store'
import type { Interaction, InteractionAction, Transition, Layer, GroupLayer } from '@/types'

const TRIGGER_OPTIONS: Interaction['trigger'][] = ['click', 'hover', 'press', 'drag']
const ACTION_TYPES: InteractionAction['type'][] = ['navigate', 'overlay', 'back', 'scroll-to', 'url']
const TRANSITION_TYPES: Transition['type'][] = [
  'instant',
  'dissolve',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'push-left',
  'push-right',
]
const EASING_OPTIONS: Transition['easing'][] = ['linear', 'ease-in', 'ease-out', 'ease-in-out']

function defaultTransition(): Transition {
  return { type: 'dissolve', duration: 300, easing: 'ease-out' }
}

function defaultInteraction(firstArtboardId: string): Interaction {
  return {
    id: uuid(),
    trigger: 'click',
    action: {
      type: 'navigate',
      targetArtboardId: firstArtboardId,
      transition: defaultTransition(),
    },
  }
}

/** Find the artboard that contains a given layer (searches recursively). */
function findArtboardForLayer(layerId: string): { artboardId: string } | null {
  const doc = useEditorStore.getState().document
  for (const artboard of doc.artboards) {
    if (findLayerInTree(artboard.layers, layerId)) {
      return { artboardId: artboard.id }
    }
  }
  return null
}

function findLayerInTree(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const found = findLayerInTree((l as GroupLayer).children, id)
      if (found) return found
    }
  }
  return null
}

/** Transition type visual preview as a tiny inline SVG */
function TransitionPreview({ type }: { type: Transition['type'] }) {
  const size = 24
  const color = '#4a7dff'
  const bg = '#333'

  const arrows: Record<string, { dx: number; dy: number }> = {
    'slide-left': { dx: -1, dy: 0 },
    'slide-right': { dx: 1, dy: 0 },
    'slide-up': { dx: 0, dy: -1 },
    'slide-down': { dx: 0, dy: 1 },
    'push-left': { dx: -1, dy: 0 },
    'push-right': { dx: 1, dy: 0 },
  }

  if (type === 'instant') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" fill={bg} stroke={color} strokeWidth="1.5" />
        <path d="M8 12h8M12 8v8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === 'dissolve') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24">
        <rect x="3" y="3" width="12" height="12" rx="1" fill={bg} stroke={color} strokeWidth="1" opacity="0.5" />
        <rect x="9" y="9" width="12" height="12" rx="1" fill={bg} stroke={color} strokeWidth="1" />
      </svg>
    )
  }

  const arrow = arrows[type]
  if (!arrow) return null

  const cx = 12
  const cy = 12
  const len = 6

  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" fill={bg} stroke="#555" strokeWidth="1" />
      <line
        x1={cx - arrow.dx * len}
        y1={cy - arrow.dy * len}
        x2={cx + arrow.dx * len}
        y2={cy + arrow.dy * len}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <polyline
        points={`${cx + arrow.dx * (len - 3) - arrow.dy * 3},${cy + arrow.dy * (len - 3) - arrow.dx * 3} ${cx + arrow.dx * len},${cy + arrow.dy * len} ${cx + arrow.dx * (len - 3) + arrow.dy * 3},${cy + arrow.dy * (len - 3) + arrow.dx * 3}`}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InteractionPanel() {
  const doc = useEditorStore((s) => s.document)
  const selection = useEditorStore((s) => s.selection)
  const addInteraction = useEditorStore((s) => s.addInteraction)
  const removeInteraction = useEditorStore((s) => s.removeInteraction)
  const updateInteraction = useEditorStore((s) => s.updateInteraction)

  const selectedLayerId = selection.layerIds[0]
  if (!selectedLayerId) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Interactions</div>
        <div style={emptyStyle}>Select a layer to add interactions.</div>
      </div>
    )
  }

  const artboardInfo = findArtboardForLayer(selectedLayerId)
  if (!artboardInfo) {
    return (
      <div style={panelStyle}>
        <div style={headerStyle}>Interactions</div>
        <div style={emptyStyle}>Layer not found in any artboard.</div>
      </div>
    )
  }

  const artboard = doc.artboards.find((a) => a.id === artboardInfo.artboardId)!
  const layer = findLayerInTree(artboard.layers, selectedLayerId)
  if (!layer) return null

  const interactions = layer.interactions ?? []

  const handleAdd = () => {
    const firstArtboard = doc.artboards[0]
    if (!firstArtboard) return
    addInteraction(artboardInfo.artboardId, selectedLayerId, defaultInteraction(firstArtboard.id))
  }

  const handleUpdateTrigger = (interactionId: string, trigger: Interaction['trigger']) => {
    updateInteraction(artboardInfo.artboardId, selectedLayerId, interactionId, { trigger })
  }

  const handleUpdateAction = (interactionId: string, actionType: InteractionAction['type'], currentAction: InteractionAction) => {
    let newAction: InteractionAction
    const firstArtboardId = doc.artboards[0]?.id ?? ''

    switch (actionType) {
      case 'navigate':
        newAction = {
          type: 'navigate',
          targetArtboardId: 'targetArtboardId' in currentAction ? currentAction.targetArtboardId : firstArtboardId,
          transition: 'transition' in currentAction ? currentAction.transition : defaultTransition(),
        }
        break
      case 'overlay':
        newAction = {
          type: 'overlay',
          targetArtboardId: 'targetArtboardId' in currentAction ? currentAction.targetArtboardId : firstArtboardId,
          position: 'center',
          transition: 'transition' in currentAction ? currentAction.transition : defaultTransition(),
        }
        break
      case 'back':
        newAction = {
          type: 'back',
          transition: 'transition' in currentAction ? currentAction.transition : defaultTransition(),
        }
        break
      case 'scroll-to':
        newAction = { type: 'scroll-to', targetLayerId: '' }
        break
      case 'url':
        newAction = { type: 'url', url: '' }
        break
      default:
        return
    }

    updateInteraction(artboardInfo.artboardId, selectedLayerId, interactionId, { action: newAction })
  }

  const handleUpdateTarget = (interactionId: string, action: InteractionAction, targetId: string) => {
    if (action.type === 'navigate') {
      const updatedAction: InteractionAction = { ...action, targetArtboardId: targetId }
      updateInteraction(artboardInfo.artboardId, selectedLayerId, interactionId, { action: updatedAction })
    } else if (action.type === 'overlay') {
      const updatedAction: InteractionAction = { ...action, targetArtboardId: targetId }
      updateInteraction(artboardInfo.artboardId, selectedLayerId, interactionId, { action: updatedAction })
    }
  }

  const handleUpdateTransition = (interactionId: string, action: InteractionAction, updates: Partial<Transition>) => {
    if ('transition' in action) {
      const updatedTransition = { ...action.transition, ...updates }
      const updatedAction = { ...action, transition: updatedTransition } as InteractionAction
      updateInteraction(artboardInfo.artboardId, selectedLayerId, interactionId, { action: updatedAction })
    }
  }

  const handleDelete = (interactionId: string) => {
    removeInteraction(artboardInfo.artboardId, selectedLayerId, interactionId)
  }

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span>Interactions</span>
        <button onClick={handleAdd} style={addButtonStyle} title="Add interaction">
          +
        </button>
      </div>

      {interactions.length === 0 && <div style={emptyStyle}>No interactions. Click + to add one.</div>}

      {interactions.map((ix) => (
        <div key={ix.id} style={interactionCardStyle}>
          {/* Trigger */}
          <div style={rowStyle}>
            <label style={labelStyle}>Trigger</label>
            <select
              value={ix.trigger}
              onChange={(e) => handleUpdateTrigger(ix.id, e.target.value as Interaction['trigger'])}
              style={selectStyle}
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Action type */}
          <div style={rowStyle}>
            <label style={labelStyle}>Action</label>
            <select
              value={ix.action.type}
              onChange={(e) => handleUpdateAction(ix.id, e.target.value as InteractionAction['type'], ix.action)}
              style={selectStyle}
            >
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Target artboard (for navigate / overlay) */}
          {(ix.action.type === 'navigate' || ix.action.type === 'overlay') && (
            <div style={rowStyle}>
              <label style={labelStyle}>Target</label>
              <select
                value={'targetArtboardId' in ix.action ? ix.action.targetArtboardId : ''}
                onChange={(e) => handleUpdateTarget(ix.id, ix.action, e.target.value)}
                style={selectStyle}
              >
                {doc.artboards.map((ab) => (
                  <option key={ab.id} value={ab.id}>
                    {ab.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Overlay position */}
          {ix.action.type === 'overlay' && (
            <div style={rowStyle}>
              <label style={labelStyle}>Position</label>
              <select
                value={ix.action.position}
                onChange={(e) => {
                  const updatedAction = { ...ix.action, position: e.target.value as 'center' | 'top' | 'bottom' }
                  updateInteraction(artboardInfo.artboardId, selectedLayerId, ix.id, { action: updatedAction })
                }}
                style={selectStyle}
              >
                <option value="center">Center</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
          )}

          {/* URL input */}
          {ix.action.type === 'url' && (
            <div style={rowStyle}>
              <label style={labelStyle}>URL</label>
              <input
                type="text"
                value={ix.action.url}
                onChange={(e) => {
                  const updatedAction: InteractionAction = { type: 'url', url: e.target.value }
                  updateInteraction(artboardInfo.artboardId, selectedLayerId, ix.id, { action: updatedAction })
                }}
                style={inputStyle}
                placeholder="https://..."
              />
            </div>
          )}

          {/* Transition settings (for navigate, overlay, back) */}
          {'transition' in ix.action && (
            <>
              <div style={rowStyle}>
                <label style={labelStyle}>Transition</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TransitionPreview type={(ix.action as { transition: Transition }).transition.type} />
                  <select
                    value={(ix.action as { transition: Transition }).transition.type}
                    onChange={(e) =>
                      handleUpdateTransition(ix.id, ix.action, { type: e.target.value as Transition['type'] })
                    }
                    style={{ ...selectStyle, flex: 1 }}
                  >
                    {TRANSITION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={rowStyle}>
                <label style={labelStyle}>Duration</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={50}
                    value={(ix.action as { transition: Transition }).transition.duration}
                    onChange={(e) =>
                      handleUpdateTransition(ix.id, ix.action, { duration: Number(e.target.value) })
                    }
                    style={{ ...inputStyle, width: 70 }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>ms</span>
                </div>
              </div>

              <div style={rowStyle}>
                <label style={labelStyle}>Easing</label>
                <select
                  value={(ix.action as { transition: Transition }).transition.easing}
                  onChange={(e) =>
                    handleUpdateTransition(ix.id, ix.action, { easing: e.target.value as Transition['easing'] })
                  }
                  style={selectStyle}
                >
                  {EASING_OPTIONS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Delete button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={() => handleDelete(ix.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#e55',
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 6px',
              }}
              title="Delete interaction"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Styles ---

const panelStyle: React.CSSProperties = {
  padding: 'var(--space-2)',
  fontSize: 'var(--font-size-sm, 12px)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontWeight: 600,
  fontSize: 13,
  marginBottom: 8,
  color: 'var(--text-primary)',
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  textAlign: 'center',
  padding: '12px 0',
}

const addButtonStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 4,
  border: '1px solid var(--border-default)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: '20px',
  textAlign: 'center',
  padding: 0,
}

const interactionCardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md, 4px)',
  padding: '8px',
  marginBottom: 6,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 11,
  minWidth: 60,
  flexShrink: 0,
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-input, #333)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontSize: 11,
  padding: '2px 4px',
  flex: 1,
  minWidth: 0,
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input, #333)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontSize: 11,
  padding: '2px 4px',
  flex: 1,
  minWidth: 0,
}
