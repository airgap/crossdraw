import React, { Suspense, useCallback, useRef } from 'react'
import { usePanelLayoutStore } from './panel-layout-store'
import { getPanelDefinition } from './panel-registry'
import type { TabGroup as TabGroupType } from './panel-layout-store'

interface TabGroupProps {
  group: TabGroupType
  column: 'left' | 'right'
  groupIndex: number
  style?: React.CSSProperties
}

export function TabGroup({ group, column, groupIndex, style }: TabGroupProps) {
  const focusTab = usePanelLayoutStore((s) => s.focusTab)
  const reorderTabs = usePanelLayoutStore((s) => s.reorderTabs)
  const moveTab = usePanelLayoutStore((s) => s.moveTab)
  const popOut = usePanelLayoutStore((s) => s.popOut)
  const addGroupSplit = usePanelLayoutStore((s) => s.addGroupSplit)
  const toggleGroupCollapse = usePanelLayoutStore((s) => s.toggleGroupCollapse)
  const isCollapsed = usePanelLayoutStore((s) => !!s.collapsedGroups[group.id])

  const dragTabRef = useRef<string | null>(null)

  const handleDragStart = useCallback(
    (e: React.DragEvent, tabId: string) => {
      dragTabRef.current = tabId
      e.dataTransfer.setData('text/panel-tab-id', tabId)
      e.dataTransfer.setData('text/panel-source-column', column)
      e.dataTransfer.setData('text/panel-source-group', String(groupIndex))
      e.dataTransfer.effectAllowed = 'move'
    },
    [column, groupIndex],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('text/panel-tab-id')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const tabId = e.dataTransfer.getData('text/panel-tab-id')
      if (!tabId) return

      // Determine insert position based on drop location within tab bar
      const target = e.currentTarget as HTMLElement
      const tabElements = Array.from(target.querySelectorAll('[data-tab-id]'))
      let insertIndex = group.tabs.length

      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i]!.getBoundingClientRect()
        if (e.clientX < rect.left + rect.width / 2) {
          insertIndex = i
          break
        }
      }

      // If dropping in same group, just reorder
      const srcColumn = e.dataTransfer.getData('text/panel-source-column')
      const srcGroup = e.dataTransfer.getData('text/panel-source-group')
      if (srcColumn === column && srcGroup === String(groupIndex)) {
        // Reorder within same group
        const newOrder = group.tabs.filter((t) => t !== tabId)
        newOrder.splice(Math.min(insertIndex, newOrder.length), 0, tabId)
        reorderTabs(column, groupIndex, newOrder)
      } else {
        moveTab(tabId, column, groupIndex, insertIndex)
      }
    },
    [column, groupIndex, group.tabs, reorderTabs, moveTab],
  )

  const handleDropSplit = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const tabId = e.dataTransfer.getData('text/panel-tab-id')
      if (!tabId) return
      addGroupSplit(tabId, column, groupIndex + 1)
    },
    [column, groupIndex, addGroupSplit],
  )

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault()
      // Pop out on right-click context (simple approach)
      popOut(tabId, e.clientX, e.clientY)
    },
    [popOut],
  )

  const handleCollapseToggle = useCallback(() => {
    toggleGroupCollapse(group.id)
  }, [toggleGroupCollapse, group.id])

  const activePanel = getPanelDefinition(group.activeTab)
  const ActiveComponent = activePanel?.component

  // Chevron SVG paths for collapse/expand indicator
  const chevronDown = (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
  const chevronRight = (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )

  return (
    <div
      data-panel-group-id={group.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
        // When collapsed, don't flex grow — just show the tab bar header
        ...(isCollapsed ? { flex: 'none', minHeight: 'auto' } : {}),
      }}
    >
      {/* Tab bar with collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
          minHeight: 28,
          flexShrink: 0,
          overflow: 'hidden',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Collapse/expand toggle button */}
        <button
          onClick={handleCollapseToggle}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '4px 4px 4px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title={isCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isCollapsed ? chevronRight : chevronDown}
        </button>

        {group.tabs.map((tabId) => {
          const def = getPanelDefinition(tabId)
          if (!def) return null
          const isActive = tabId === group.activeTab
          return (
            <div
              key={tabId}
              data-tab-id={tabId}
              draggable
              onDragStart={(e) => handleDragStart(e, tabId)}
              onClick={() => {
                focusTab(tabId)
                // Auto-expand when clicking a tab
                if (isCollapsed) toggleGroupCollapse(group.id)
              }}
              onContextMenu={(e) => handleTabContextMenu(e, tabId)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
                userSelect: 'none',
                background: isActive ? 'var(--bg-base)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderRight: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ fontSize: 13 }}>{def.icon}</span>
              {def.label}
            </div>
          )
        })}
      </div>

      {/* Content area — hidden when collapsed */}
      {!isCollapsed && (
        <>
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--bg-base)',
            }}
          >
            {ActiveComponent && (
              <Suspense
                fallback={<div style={{ padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>}
              >
                <ActiveComponent />
              </Suspense>
            )}
          </div>

          {/* Split drop zone (thin area at the bottom between groups) */}
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('text/panel-tab-id')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
              }
            }}
            onDragLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
            onDrop={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              handleDropSplit(e)
            }}
            style={{
              height: 4,
              flexShrink: 0,
              background: 'transparent',
              transition: 'background 0.15s',
            }}
          />
        </>
      )}
    </div>
  )
}
