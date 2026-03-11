import React, { useCallback, useRef } from 'react'
import { usePanelLayoutStore, MIN_GROUP_HEIGHT, type PanelColumn as PanelColumnType } from './panel-layout-store'
import { usePanelDragStore } from './panel-drag'
import { TabGroup, SplitDropZone } from './tab-group'

interface PanelColumnProps {
  column: PanelColumnType
  side: 'left' | 'right'
}

export function PanelColumn({ column, side }: PanelColumnProps) {
  const resizeColumn = usePanelLayoutStore((s) => s.resizeColumn)
  const setGroupHeight = usePanelLayoutStore((s) => s.setGroupHeight)
  const resetGroupHeight = usePanelLayoutStore((s) => s.resetGroupHeight)
  const groupHeights = usePanelLayoutStore((s) => s.groupHeights)
  const collapsedGroups = usePanelLayoutStore((s) => s.collapsedGroups)
  const dragTabId = usePanelDragStore((s) => s.tabId)

  const containerRef = useRef<HTMLDivElement>(null)

  // Column edge resize drag
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizeRef.current = { startX: e.clientX, startWidth: column.width }

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return
        const delta = side === 'left' ? ev.clientX - resizeRef.current.startX : resizeRef.current.startX - ev.clientX
        resizeColumn(side, resizeRef.current.startWidth + delta)
      }

      const onUp = () => {
        resizeRef.current = null
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [side, column.width, resizeColumn],
  )

  const groupCount = column.groups.length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        height: '100%',
      }}
    >
      {/* Resize handle (on the edge facing the viewport) */}
      {side === 'left' && (
        <div style={{ order: 2 }}>
          <ResizeHandle onMouseDown={handleResizeMouseDown} />
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: column.width,
          minWidth: 180,
          maxWidth: 400,
          height: '100%',
          overflow: 'hidden',
          background: 'var(--bg-base)',
          borderLeft: side === 'right' ? '1px solid var(--border-subtle)' : undefined,
          borderRight: side === 'left' ? '1px solid var(--border-subtle)' : undefined,
          order: side === 'left' ? 1 : undefined,
        }}
        onPointerEnter={() => {
          if (dragTabId) {
            usePanelDragStore.getState().setDropTarget({ type: 'column', column: side, groupIndex: 0 })
          }
        }}
      >
        {column.groups.map((group, i) => {
          const isCollapsed = !!collapsedGroups[group.id]
          const explicitHeight = groupHeights[group.id]
          const showDivider = i < groupCount - 1

          const groupStyle: React.CSSProperties = isCollapsed
            ? { flex: 'none', minHeight: 'auto' }
            : explicitHeight != null
              ? { height: explicitHeight, minHeight: MIN_GROUP_HEIGHT, flex: 'none' }
              : { flex: 1, minHeight: MIN_GROUP_HEIGHT }

          return (
            <React.Fragment key={group.id}>
              <TabGroup group={group} column={side} groupIndex={i} style={groupStyle} />
              {showDivider && !dragTabId && (
                <GroupDivider
                  aboveGroupId={group.id}
                  belowGroupId={column.groups[i + 1]!.id}
                  containerRef={containerRef}
                  groupHeights={groupHeights}
                  collapsedGroups={collapsedGroups}
                  setGroupHeight={setGroupHeight}
                  resetGroupHeight={resetGroupHeight}
                />
              )}
              {/* Split drop zone between groups (visible during drag) */}
              {dragTabId && <SplitDropZone column={side} insertAtIndex={i + 1} />}
            </React.Fragment>
          )
        })}

        {/* Drop zone at the bottom for adding new group */}
        {dragTabId && groupCount > 0 && (
          <div
            onPointerEnter={() => {
              usePanelDragStore.getState().setDropTarget({
                type: 'column',
                column: side,
                groupIndex: column.groups.length,
              })
            }}
            onPointerLeave={() => {
              const dt = usePanelDragStore.getState().dropTarget
              if (dt?.type === 'column' && dt.column === side) {
                usePanelDragStore.getState().setDropTarget(null)
              }
            }}
            style={{
              flex: 1,
              minHeight: 20,
            }}
          />
        )}
      </div>

      {side === 'right' && (
        <div style={{ order: -1 }}>
          <ResizeHandle onMouseDown={handleResizeMouseDown} />
        </div>
      )}
    </div>
  )
}

// ── Vertical divider between groups (drag to resize heights) ──

function GroupDivider({
  aboveGroupId,
  belowGroupId,
  containerRef,
  groupHeights,
  collapsedGroups,
  setGroupHeight,
  resetGroupHeight,
}: {
  aboveGroupId: string
  belowGroupId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  groupHeights: Record<string, number>
  collapsedGroups: Record<string, boolean>
  setGroupHeight: (groupId: string, height: number) => void
  resetGroupHeight: (groupId: string) => void
}) {
  const dragging = useRef(false)
  const startY = useRef(0)
  const startAboveH = useRef(0)
  const startBelowH = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (collapsedGroups[aboveGroupId] || collapsedGroups[belowGroupId]) return

      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      startY.current = e.clientY

      if (containerRef.current) {
        const groups = containerRef.current.querySelectorAll('[data-panel-group-id]')
        groups.forEach((el) => {
          const gid = (el as HTMLElement).dataset.panelGroupId
          if (gid === aboveGroupId) startAboveH.current = el.getBoundingClientRect().height
          if (gid === belowGroupId) startBelowH.current = el.getBoundingClientRect().height
        })
      }

      if (startAboveH.current === 0) startAboveH.current = groupHeights[aboveGroupId] ?? 200
      if (startBelowH.current === 0) startBelowH.current = groupHeights[belowGroupId] ?? 200

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const deltaY = ev.clientY - startY.current
        const totalH = startAboveH.current + startBelowH.current
        const newAboveH = Math.max(MIN_GROUP_HEIGHT, Math.min(totalH - MIN_GROUP_HEIGHT, startAboveH.current + deltaY))
        const newBelowH = totalH - newAboveH

        setGroupHeight(aboveGroupId, newAboveH)
        setGroupHeight(belowGroupId, newBelowH)
      }

      const handleMouseUp = () => {
        dragging.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [aboveGroupId, belowGroupId, containerRef, groupHeights, collapsedGroups, setGroupHeight],
  )

  const handleDoubleClick = useCallback(() => {
    resetGroupHeight(aboveGroupId)
    resetGroupHeight(belowGroupId)
  }, [aboveGroupId, belowGroupId, resetGroupHeight])

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        height: 4,
        cursor: 'row-resize',
        background: 'var(--border-subtle)',
        flexShrink: 0,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'var(--border-subtle)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -3,
          left: 0,
          right: 0,
          height: 10,
          cursor: 'row-resize',
        }}
      />
    </div>
  )
}

// ── Column edge resize handle ──

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 4,
        cursor: 'col-resize',
        background: 'transparent',
        height: '100%',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    />
  )
}
