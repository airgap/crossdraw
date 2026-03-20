import { useEditorStore } from '@/store/editor.store'

export function CanvasTabBar() {
  const artboards = useEditorStore((s) => s.document.artboards)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const switchTab = useEditorStore((s) => s.switchTab)
  const toggleArtboardInfinite = useEditorStore((s) => s.toggleArtboardInfinite)

  const infiniteArtboards = artboards.filter((a) => a.isInfinite)

  // Only render when at least one infinite artboard exists
  if (infiniteArtboards.length === 0) return null

  const isOverviewActive = activeTabId === 'overview'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 'var(--height-panel-header, 28px)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 12,
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      {/* Overview tab */}
      <div
        onClick={() => switchTab('overview')}
        style={{
          padding: '4px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: isOverviewActive ? 'var(--bg-base)' : 'transparent',
          color: isOverviewActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          borderBottom: isOverviewActive ? '2px solid var(--accent)' : '2px solid transparent',
          borderRight: '1px solid var(--border-subtle)',
          whiteSpace: 'nowrap',
        }}
      >
        Canvas
      </div>

      {/* Infinite artboard tabs */}
      {infiniteArtboards.map((ab) => {
        const isActive = activeTabId === ab.id

        return (
          <div
            key={ab.id}
            onClick={() => switchTab(ab.id)}
            style={{
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: isActive ? 'var(--bg-base)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              borderRight: '1px solid var(--border-subtle)',
              whiteSpace: 'nowrap',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 13 }} aria-hidden="true">
              ∞
            </span>
            {ab.name}
            {/* Close button — converts back to bounded */}
            <span
              onClick={(e) => {
                e.stopPropagation()
                toggleArtboardInfinite(ab.id)
              }}
              style={{
                marginLeft: 4,
                fontSize: 10,
                lineHeight: 1,
                padding: '1px 3px',
                borderRadius: 2,
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'
              }}
              title="Convert back to bounded artboard"
            >
              ✕
            </span>
          </div>
        )
      })}
    </div>
  )
}
