import React, { Suspense, useCallback, useRef, useEffect, useState } from 'react'
import { usePanelLayoutStore } from './panel-layout-store'
import { usePanelDragStore } from './panel-drag'
import { getPanelDefinition } from './panel-registry'
import type { TabGroup as TabGroupType } from './panel-layout-store'

// ── Constants ──

const DRAG_THRESHOLD = 5
const TEAROFF_THRESHOLD = 60

// ── DraggableTab ──

function DraggableTab({
  tabId,
  isActive,
  column,
  groupIndex,
  onActivate,
}: {
  tabId: string
  isActive: boolean
  column: 'left' | 'right'
  groupIndex: number
  onActivate: (tabId: string) => void
}) {
  const def = getPanelDefinition(tabId)
  const popOut = usePanelLayoutStore((s) => s.popOut)
  const dragTabId = usePanelDragStore((s) => s.tabId)
  const isDraggingThis = dragTabId === tabId
  const elRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{
    startX: number
    startY: number
    pointerId: number
    started: boolean
    tornOff: boolean
  } | null>(null)

  const releaseCapture = useCallback(() => {
    const el = elRef.current
    const ds = dragState.current
    if (el && ds) {
      try {
        el.releasePointerCapture(ds.pointerId)
      } catch {}
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      started: false,
      tornOff: false,
    }
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (!dragState.current.started && dist > DRAG_THRESHOLD) {
        dragState.current.started = true
        usePanelDragStore.getState().startDrag(tabId, column, groupIndex, e.clientX, e.clientY)
      }

      if (dragState.current.started) {
        usePanelDragStore.getState().updatePosition(e.clientX, e.clientY)

        // Check for tear-off (dragging vertically away from tab bar)
        if (Math.abs(dy) > TEAROFF_THRESHOLD && !dragState.current.tornOff) {
          dragState.current.tornOff = true
          // Release capture and clear state BEFORE popOut unmounts us
          releaseCapture()
          usePanelDragStore.getState().cancelDrag()
          dragState.current = null
          popOut(tabId, e.clientX - 100, e.clientY - 14)
          return
        }
      }
    },
    [tabId, column, groupIndex, popOut, releaseCapture],
  )

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent) => {
      const ds = dragState.current
      dragState.current = null
      releaseCapture()

      if (!ds) return
      if (!ds.started) {
        // It was a click, not a drag
        onActivate(tabId)
        return
      }
      // End drag — the drop handling is done by the drop target's pointerUp
      usePanelDragStore.getState().endDrag()
    },
    [tabId, onActivate, releaseCapture],
  )

  if (!def) return null

  return (
    <div
      ref={elRef}
      data-tab-id={tabId}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-label={def.label}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault()
        popOut(tabId, e.clientX, e.clientY)
      }}
      style={{
        padding: '4px 10px',
        fontSize: 12,
        cursor: isDraggingThis ? 'grabbing' : 'pointer',
        userSelect: 'none',
        touchAction: 'none',
        background: isActive ? 'var(--bg-base)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        opacity: isDraggingThis ? 0.4 : 1,
        transition: 'opacity 0.15s',
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 13 }} aria-hidden="true">
        {def.icon}
      </span>
      {def.label}
    </div>
  )
}

// ── TabBar drop zone — shows insertion indicator ──

function TabBarDropZone({
  column,
  groupIndex,
  tabs,
}: {
  column: 'left' | 'right'
  groupIndex: number
  tabs: string[]
}) {
  const dragTabId = usePanelDragStore((s) => s.tabId)
  const dropTarget = usePanelDragStore((s) => s.dropTarget)
  const barRef = useRef<HTMLDivElement>(null)

  // Track mouse position within the tab bar to show insertion indicator
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragTabId) return
      const bar = barRef.current
      if (!bar) return

      // Compute insertion index based on mouse position
      const tabElements = Array.from(bar.querySelectorAll('[data-tab-id]'))
      let insertIndex = tabs.length
      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i]!.getBoundingClientRect()
        if (e.clientX < rect.left + rect.width / 2) {
          insertIndex = i
          break
        }
      }

      usePanelDragStore.getState().setDropTarget({
        type: 'tab-bar',
        column,
        groupIndex,
        insertIndex,
      })
    },
    [dragTabId, column, groupIndex, tabs.length],
  )

  const handlePointerEnter = useCallback(() => {
    if (!dragTabId) return
    usePanelDragStore.getState().setDropTarget({
      type: 'tab-bar',
      column,
      groupIndex,
      insertIndex: tabs.length,
    })
  }, [dragTabId, column, groupIndex, tabs.length])

  const handlePointerLeave = useCallback(() => {
    if (!dragTabId) return
    const dt = usePanelDragStore.getState().dropTarget
    if (dt?.type === 'tab-bar' && dt.column === column && dt.groupIndex === groupIndex) {
      usePanelDragStore.getState().setDropTarget(null)
    }
  }, [dragTabId, column, groupIndex])

  // Determine if we should show the indicator
  const isTargetHere =
    dropTarget?.type === 'tab-bar' && dropTarget.column === column && dropTarget.groupIndex === groupIndex

  if (!dragTabId) return null

  return (
    <>
      {/* Transparent overlay for detecting drop position */}
      <div
        ref={barRef}
        onPointerMove={handlePointerMove}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
        }}
      />
      {/* Insertion indicator line */}
      {isTargetHere && dropTarget.insertIndex != null && (
        <InsertionIndicator parentRef={barRef} insertIndex={dropTarget.insertIndex} />
      )}
    </>
  )
}

function InsertionIndicator({
  parentRef,
  insertIndex,
}: {
  parentRef: React.RefObject<HTMLDivElement | null>
  insertIndex: number
}) {
  const [left, setLeft] = useState(0)

  useEffect(() => {
    const overlay = parentRef.current
    if (!overlay) return
    // The overlay covers the tab bar; the tab bar is its parent
    const bar = overlay.parentElement
    if (!bar) return
    const tabElements = Array.from(bar.querySelectorAll('[data-tab-id]'))
    const barRect = bar.getBoundingClientRect()

    if (tabElements.length === 0) {
      setLeft(0)
      return
    }

    if (insertIndex >= tabElements.length) {
      const last = tabElements[tabElements.length - 1]!.getBoundingClientRect()
      setLeft(last.right - barRect.left)
    } else {
      const el = tabElements[insertIndex]!.getBoundingClientRect()
      setLeft(el.left - barRect.left)
    }
  }, [parentRef, insertIndex])

  return (
    <div
      style={{
        position: 'absolute',
        left: left - 1,
        top: 2,
        bottom: 2,
        width: 2,
        background: 'var(--accent)',
        borderRadius: 1,
        zIndex: 20,
        pointerEvents: 'none',
        transition: 'left 0.1s ease',
      }}
    />
  )
}

// ── SplitDropZone — shown between groups ──

export function SplitDropZone({ column, insertAtIndex }: { column: 'left' | 'right'; insertAtIndex: number }) {
  const dragTabId = usePanelDragStore((s) => s.tabId)
  const dropTarget = usePanelDragStore((s) => s.dropTarget)
  const [hovered, setHovered] = useState(false)

  const isTarget =
    dropTarget?.type === 'split' && dropTarget.column === column && dropTarget.groupIndex === insertAtIndex

  if (!dragTabId) {
    return <div style={{ height: 4, flexShrink: 0 }} />
  }

  return (
    <div
      onPointerEnter={() => {
        setHovered(true)
        usePanelDragStore.getState().setDropTarget({ type: 'split', column, groupIndex: insertAtIndex })
      }}
      onPointerLeave={() => {
        setHovered(false)
        const dt = usePanelDragStore.getState().dropTarget
        if (dt?.type === 'split' && dt.column === column && dt.groupIndex === insertAtIndex) {
          usePanelDragStore.getState().setDropTarget(null)
        }
      }}
      style={{
        height: isTarget || hovered ? 20 : 8,
        flexShrink: 0,
        background: isTarget ? 'var(--accent)' : 'transparent',
        opacity: isTarget ? 0.3 : 1,
        transition: 'height 0.1s ease, background 0.1s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 2,
        margin: '0 4px',
      }}
    >
      {(isTarget || hovered) && (
        <div
          style={{
            width: '60%',
            height: 2,
            background: 'var(--accent)',
            borderRadius: 1,
            opacity: isTarget ? 1 : 0.4,
          }}
        />
      )}
    </div>
  )
}

// ── Main TabGroup component ──

interface TabGroupProps {
  group: TabGroupType
  column: 'left' | 'right'
  groupIndex: number
  style?: React.CSSProperties
}

export function TabGroup({ group, column, groupIndex, style }: TabGroupProps) {
  const focusTab = usePanelLayoutStore((s) => s.focusTab)
  const toggleGroupCollapse = usePanelLayoutStore((s) => s.toggleGroupCollapse)
  const isCollapsed = usePanelLayoutStore((s) => !!s.collapsedGroups[group.id])
  const dragTabId = usePanelDragStore((s) => s.tabId)

  const handleActivate = useCallback(
    (tabId: string) => {
      focusTab(tabId)
      if (isCollapsed) toggleGroupCollapse(group.id)
    },
    [focusTab, isCollapsed, toggleGroupCollapse, group.id],
  )

  const handleCollapseToggle = useCallback(() => {
    toggleGroupCollapse(group.id)
  }, [toggleGroupCollapse, group.id])

  const activePanel = getPanelDefinition(group.activeTab)
  const ActiveComponent = activePanel?.component

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
      role="region"
      aria-label={activePanel?.label ?? 'Panel'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
        ...(isCollapsed ? { flex: 'none', minHeight: 'auto' } : {}),
      }}
    >
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Panel tabs"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--bg-surface)',
          borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
          minHeight: 28,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Collapse toggle */}
        <button
          onClick={handleCollapseToggle}
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!isCollapsed}
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

        {/* Tab buttons */}
        {group.tabs.map((tabId) => (
          <DraggableTab
            key={tabId}
            tabId={tabId}
            isActive={tabId === group.activeTab}
            column={column}
            groupIndex={groupIndex}
            onActivate={handleActivate}
          />
        ))}

        {/* Drop zone overlay for this tab bar */}
        <TabBarDropZone column={column} groupIndex={groupIndex} tabs={group.tabs} />

        {/* Highlight border when this tab bar is a drop target */}
        {dragTabId && (
          <div
            onPointerEnter={() => {
              usePanelDragStore.getState().setDropTarget({
                type: 'tab-bar',
                column,
                groupIndex,
                insertIndex: group.tabs.length,
              })
            }}
            style={{
              flex: 1,
              minWidth: 20,
              height: '100%',
            }}
          />
        )}
      </div>

      {/* Content area */}
      {!isCollapsed && (
        <div
          role="tabpanel"
          aria-label={activePanel?.label ?? 'Panel content'}
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
      )}
    </div>
  )
}
