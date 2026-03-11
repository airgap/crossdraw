import { useEditorStore } from '@/store/editor.store'
import { EmptyState } from '@/ui/empty-state'

export function HistoryPanel() {
  const history = useEditorStore((s) => s.history)
  const historyIndex = useEditorStore((s) => s.historyIndex)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
      }}
    >
      {/* Header provided by Sidebar wrapper */}

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1)' }}>
        {/* Initial state entry */}
        <HistoryEntry
          label="Initial State"
          isActive={historyIndex === -1}
          isFuture={false}
          onClick={() => {
            // Undo all the way back
            while (useEditorStore.getState().historyIndex >= 0) {
              undo()
            }
          }}
        />

        {history.length === 0 && (
          <EmptyState
            message="No history"
            hint="Actions you perform will appear here. Use Ctrl+Z / Ctrl+Shift+Z to undo/redo."
            style={{ padding: '12px 16px' }}
          />
        )}
        {history.map((entry, i) => (
          <HistoryEntry
            key={i}
            label={entry.description}
            isActive={i === historyIndex}
            isFuture={i > historyIndex}
            onClick={() => {
              const current = useEditorStore.getState().historyIndex
              if (i < current) {
                // Undo to reach this state
                for (let j = current; j > i; j--) undo()
              } else if (i > current) {
                // Redo to reach this state
                for (let j = current; j < i; j++) redo()
              }
            }}
          />
        ))}
      </div>
    </div>
  )
}

function HistoryEntry({
  label,
  isActive,
  isFuture,
  onClick,
}: {
  label: string
  isActive: boolean
  isFuture: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: isActive ? 'var(--accent)' : 'transparent',
        border: 'none',
        padding: '4px 8px',
        fontSize: 'var(--font-size-sm)',
        color: isActive ? '#fff' : isFuture ? 'var(--text-disabled)' : 'var(--text-primary)',
        cursor: 'pointer',
        opacity: isFuture ? 0.5 : 1,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}
