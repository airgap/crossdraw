import { useEditorStore } from '@/store/editor.store'
import type { EditorState } from '@/store/editor.store'
import { toggleTheme, getTheme } from '@/ui/theme'
import { useState, useEffect, useRef, useCallback } from 'react'
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
  type LucideIcon,
} from 'lucide-react'

/** Custom brush icon — round-tipped paint brush with visible bristle tip */
function BrushIcon({ size = 24, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
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
  { id: 'star', icon: Star, key: 's' },
]

const shapeToolIds = new Set(shapeTools.map((t) => t.id))

const tools: (ToolEntry | 'shapes')[] = [
  { id: 'select', icon: MousePointer2, key: 'v' },
  { id: 'node', icon: Spline, key: 'a' },
  { id: 'pen', icon: PenTool, key: 'p' },
  'shapes',
  { id: 'text', icon: Type, key: 't' },
  { id: 'eyedropper', icon: Pipette, key: 'i' },
  { id: 'hand', icon: Hand, key: 'h' },
  { id: 'measure', icon: Ruler, key: 'm' },
  { id: 'brush', icon: BrushIcon, key: 'b' },
  { id: 'crop', icon: Crop, key: 'c' },
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
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        title={`${current.id} (${current.key.toUpperCase()}) — hold for more`}
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
        onMouseEnter={(e) => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
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
                title={`${shape.id} (${shape.key.toUpperCase()})`}
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
                onMouseEnter={(e) => {
                  if (!isShapeActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (!isShapeActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
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

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const [themeName, setThemeName] = useState(getTheme().name)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleToggleTheme = () => {
    toggleTheme()
    setThemeName(getTheme().name)
  }

  // Listen for menu bar events
  useEffect(() => {
    const onShowSettings = () => setShowSettings(true)
    window.addEventListener('crossdraw:show-settings', onShowSettings)
    return () => window.removeEventListener('crossdraw:show-settings', onShowSettings)
  }, [])

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          padding: 'var(--space-1)',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          width: 40,
          alignItems: 'center',
        }}
      >
        {tools.map((tool) => {
          if (tool === 'shapes') {
            return <ShapeToolButton key="shapes" activeTool={activeTool} setActiveTool={setActiveTool} />
          }
          const Icon = tool.icon
          const isActive = activeTool === tool.id
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${tool.id} (${tool.key.toUpperCase()})`}
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
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <Icon size={16} strokeWidth={1.75} />
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowShortcuts(true)}
          title="Keyboard shortcuts"
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
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          <Keyboard size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => setShowSettings(true)}
          title="UI Settings"
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
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          <Settings size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={handleToggleTheme}
          title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
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
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          {themeName === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
        </button>
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
