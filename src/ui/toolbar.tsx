import { useEditorStore } from '@/store/editor.store'
import type { EditorState } from '@/store/editor.store'
import { toggleTheme, getTheme } from '@/ui/theme'
import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ShortcutPreferences } from '@/ui/shortcut-preferences'
import { UISettings } from '@/ui/ui-settings'
import {
  MousePointer2,
  Spline,
  PenTool,
  Square,
  Circle,
  Hexagon,
  Star,
  Type,
  Pipette,
  Hand,
  Ruler,
  Crop,
  Keyboard,
  Sun,
  Moon,
  Settings,
  Minus,
  Pencil,
  Eraser,
  Blend,
  PaintBucket,
  ZoomIn,
  Lasso,
  SquareDashed,
  Scissors,
  Frame,
  ScissorsLineDashed,
  Stamp,
  MessageCircle,
  Combine,
  type LucideIcon,
} from 'lucide-react'

/** Custom brush icon — round-tipped paint brush with visible bristle tip */
function BrushIcon({ size = 24, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Handle */}
      <line x1="18" y1="2" x2="12" y2="8" />
      {/* Ferrule */}
      <path d="M12 8 L9.5 10.5 Q8 12 9 14 L10 14 Q12 12 14.5 9.5 Z" />
      {/* Bristle tip */}
      <path d="M9 14 Q6 17 4 20 Q5 21 6 20 Q8 19 10 14" fill="currentColor" strokeWidth={strokeWidth * 0.7} />
    </svg>
  )
}

type ToolIcon = LucideIcon | ((props: { size?: number; strokeWidth?: number }) => JSX.Element)
type ToolEntry = { id: EditorState['activeTool']; icon: ToolIcon; key: string }

const shapeTools: ToolEntry[] = [
  { id: 'rectangle', icon: Square, key: 'r' },
  { id: 'ellipse', icon: Circle, key: 'e' },
  { id: 'polygon', icon: Hexagon, key: 'y' },
  { id: 'star', icon: Star, key: 'shift+s' },
]

const shapeToolIds = new Set(shapeTools.map((t) => t.id))

const tools: (ToolEntry | 'shapes' | 'separator')[] = [
  { id: 'select', icon: MousePointer2, key: 'v' },
  { id: 'node', icon: Spline, key: 'a' },
  { id: 'artboard', icon: Frame, key: 'f' },
  'separator',
  { id: 'pen', icon: PenTool, key: 'p' },
  { id: 'pencil', icon: Pencil, key: 'n' },
  { id: 'line', icon: Minus, key: 'l' },
  'shapes',
  { id: 'text', icon: Type, key: 't' },
  'separator',
  { id: 'brush', icon: BrushIcon, key: 'b' },
  { id: 'eraser', icon: Eraser, key: 'x' },
  { id: 'clone-stamp', icon: Stamp, key: 's' },
  { id: 'fill', icon: PaintBucket, key: 'g' },
  { id: 'gradient', icon: Blend, key: 'j' },
  { id: 'eyedropper', icon: Pipette, key: 'i' },
  'separator',
  { id: 'marquee', icon: SquareDashed, key: 'm' },
  { id: 'lasso', icon: Lasso, key: 'q' },
  { id: 'knife', icon: Scissors, key: 'k' },
  { id: 'shape-builder', icon: Combine, key: 'shift+m' },
  { id: 'slice', icon: ScissorsLineDashed, key: 'w' },
  'separator',
  { id: 'hand', icon: Hand, key: 'h' },
  { id: 'zoom', icon: ZoomIn, key: 'z' },
  { id: 'measure', icon: Ruler, key: 'u' },
  { id: 'crop', icon: Crop, key: 'shift+c' },
  { id: 'comment', icon: MessageCircle, key: 'c' },
]

/** Long-press delay in ms before showing shape picker */
const LONG_PRESS_MS = 300

function ShapeToolButton({
  activeTool,
  setActiveTool,
}: {
  activeTool: EditorState['activeTool']
  setActiveTool: (tool: EditorState['activeTool']) => void
}) {
  const [currentShape, setCurrentShape] = useState<EditorState['activeTool']>('rectangle')
  const [showPicker, setShowPicker] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // If user presses a shape shortcut key, update currentShape to match
  useEffect(() => {
    if (shapeToolIds.has(activeTool)) setCurrentShape(activeTool)
  }, [activeTool])

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const close = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return
      setShowPicker(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [showPicker])

  const onPointerDown = useCallback(() => {
    didLongPress.current = false
    timerRef.current = setTimeout(() => {
      didLongPress.current = true
      setShowPicker(true)
    }, LONG_PRESS_MS)
  }, [])

  const onPointerUp = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!didLongPress.current) {
      setActiveTool(currentShape)
      setShowPicker(false)
    }
  }, [currentShape, setActiveTool])

  const onPointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const isActive = shapeToolIds.has(activeTool)
  const current = shapeTools.find((t) => t.id === currentShape) || shapeTools[0]!
  const Icon = current.icon

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        data-tool-shapes="true"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        title={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more`}
        role="button"
        tabIndex={0}
        aria-label={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more shapes`}
        aria-pressed={isActive}
        className="cd-hoverable"
        style={{
          width: 'var(--height-toolbar)',
          height: 'var(--height-toolbar)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isActive ? '#fff' : 'var(--text-secondary)',
          background: isActive ? 'var(--accent)' : 'transparent',
          position: 'relative',
        }}
      >
        <Icon size={16} strokeWidth={1.75} />
        {/* Small triangle indicator for flyout */}
        <svg
          width={5}
          height={5}
          viewBox="0 0 5 5"
          style={{ position: 'absolute', bottom: 2, right: 2, opacity: 0.6 }}
          fill="currentColor"
        >
          <polygon points="0,5 5,5 5,0" />
        </svg>
      </button>

      {showPicker && (
        <div
          role="menu"
          aria-label="Shape tools"
          style={{
            position: 'absolute',
            left: '100%',
            top: 0,
            marginLeft: 2,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {shapeTools.map((shape) => {
            const ShapeIcon = shape.icon
            const isShapeActive = activeTool === shape.id
            return (
              <button
                key={shape.id}
                onClick={() => {
                  setCurrentShape(shape.id)
                  setActiveTool(shape.id)
                  setShowPicker(false)
                }}
                title={`${toolLabel(shape.id)} (${shape.key.toUpperCase()})`}
                role="menuitem"
                aria-label={`${toolLabel(shape.id)} (${shape.key.toUpperCase()})`}
                className="cd-hoverable"
                style={{
                  width: 'var(--height-toolbar)',
                  height: 'var(--height-toolbar)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isShapeActive ? '#fff' : 'var(--text-secondary)',
                  background: isShapeActive ? 'var(--accent)' : 'transparent',
                }}
              >
                <ShapeIcon size={16} strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Human-readable label for each tool id */
const toolLabels: Record<string, string> = {
  select: 'Select',
  node: 'Node',
  artboard: 'Artboard',
  pen: 'Pen Tool',
  pencil: 'Pencil',
  line: 'Line',
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  text: 'Text',
  brush: 'Brush',
  eraser: 'Eraser',
  'clone-stamp': 'Clone Stamp',
  fill: 'Fill',
  gradient: 'Gradient',
  eyedropper: 'Eyedropper',
  marquee: 'Marquee',
  lasso: 'Lasso',
  knife: 'Knife',
  'shape-builder': 'Shape Builder',
  slice: 'Slice',
  hand: 'Hand',
  zoom: 'Zoom',
  measure: 'Measure',
  crop: 'Crop',
  comment: 'Comment',
}

function toolLabel(id: string): string {
  return toolLabels[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

export function Toolbar({ modeConfig }: { modeConfig?: { tools: string[] } } = {}) {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const [themeName, setThemeName] = useState(getTheme().name)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [toolAnnouncement, setToolAnnouncement] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)

  const handleToggleTheme = () => {
    toggleTheme()
    setThemeName(getTheme().name)
  }

  // Announce tool changes to screen readers
  const handleSetActiveTool = useCallback(
    (toolId: EditorState['activeTool']) => {
      setActiveTool(toolId)
      setToolAnnouncement(`Selected ${toolLabel(toolId)} tool`)
    },
    [setActiveTool],
  )

  // Keyboard navigation: arrow keys to move between tool buttons
  const handleToolbarKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const toolbar = toolbarRef.current
    if (!toolbar) return
    const buttons = Array.from(toolbar.querySelectorAll<HTMLElement>('button[data-tool-id], button[data-tool-shapes]'))
    const currentIndex = buttons.findIndex((b) => b === document.activeElement || b.contains(document.activeElement))
    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1
    }
    buttons[nextIndex]?.focus()
  }, [])

  // Listen for menu bar events
  useEffect(() => {
    const onShowSettings = () => setShowSettings(true)
    window.addEventListener('crossdraw:show-settings', onShowSettings)
    return () => window.removeEventListener('crossdraw:show-settings', onShowSettings)
  }, [])

  return (
    <>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="Drawing tools"
        aria-orientation="vertical"
        onKeyDown={handleToolbarKeyDown}
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-1)',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          width: 40,
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Scrollable tool list */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            alignItems: 'center',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'none',
            width: '100%',
          }}
        >
          {tools
            .filter((tool) => {
              if (!modeConfig) return true
              if (tool === 'separator' || tool === 'shapes') return true
              return modeConfig.tools.includes(tool.id)
            })
            .map((tool, idx) => {
              if (tool === 'separator') {
                return (
                  <div
                    key={`sep-${idx}`}
                    role="separator"
                    style={{
                      width: 24,
                      height: 1,
                      background: 'var(--border-subtle)',
                      margin: '2px 0',
                      flexShrink: 0,
                    }}
                  />
                )
              }
              if (tool === 'shapes') {
                return <ShapeToolButton key="shapes" activeTool={activeTool} setActiveTool={handleSetActiveTool} />
              }
              const Icon = tool.icon
              const isActive = activeTool === tool.id
              return (
                <button
                  key={tool.id}
                  data-tool-id={tool.id}
                  onClick={() => handleSetActiveTool(tool.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSetActiveTool(tool.id)
                    }
                  }}
                  title={`${toolLabel(tool.id)} (${tool.key.toUpperCase()})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${toolLabel(tool.id)} tool (${tool.key.toUpperCase()})`}
                  aria-pressed={isActive}
                  className="cd-hoverable"
                  style={{
                    width: 'var(--height-toolbar)',
                    height: 'var(--height-toolbar)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isActive ? '#fff' : 'var(--text-secondary)',
                    background: isActive ? 'var(--accent)' : 'transparent',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </button>
              )
            })}
        </div>
        {/* Pinned bottom buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            alignItems: 'center',
            flexShrink: 0,
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 'var(--space-1)',
            marginTop: 'var(--space-1)',
            width: '100%',
          }}
        >
          <button
            onClick={() => setShowShortcuts(true)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            className="cd-hoverable"
            style={{
              width: 'var(--height-toolbar)',
              height: 'var(--height-toolbar)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            <Keyboard size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="UI Settings"
            aria-label="UI Settings"
            className="cd-hoverable"
            style={{
              width: 'var(--height-toolbar)',
              height: 'var(--height-toolbar)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            <Settings size={16} strokeWidth={1.75} />
          </button>
          <button
            onClick={handleToggleTheme}
            title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
            aria-label={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
            className="cd-hoverable"
            style={{
              width: 'var(--height-toolbar)',
              height: 'var(--height-toolbar)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
              background: 'transparent',
            }}
          >
            {themeName === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          </button>
        </div>
      </div>
      {/* Screen reader live region for tool announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {toolAnnouncement}
      </div>
      {showShortcuts && <ShortcutPreferences onClose={() => setShowShortcuts(false)} />}
      {showSettings && (
        <UISettings
          onClose={() => {
            setShowSettings(false)
            setThemeName(getTheme().name)
          }}
        />
      )}
    </>
  )
}
