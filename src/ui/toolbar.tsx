import { useEditorStore } from '@/store/editor.store'
import type { EditorState } from '@/store/editor.store'
import { toggleTheme, getTheme } from '@/ui/theme'
import { useState } from 'react'
import { ShortcutPreferences } from '@/ui/shortcut-preferences'
import {
  MousePointer2, Spline, PenTool, Square, Circle, Hexagon,
  Star, Type, Pipette, Hand, Ruler, Paintbrush, Crop,
  Keyboard, Sun, Moon,
  type LucideIcon,
} from 'lucide-react'

const tools: { id: EditorState['activeTool']; icon: LucideIcon; key: string }[] = [
  { id: 'select', icon: MousePointer2, key: 'v' },
  { id: 'node', icon: Spline, key: 'a' },
  { id: 'pen', icon: PenTool, key: 'p' },
  { id: 'rectangle', icon: Square, key: 'r' },
  { id: 'ellipse', icon: Circle, key: 'e' },
  { id: 'polygon', icon: Hexagon, key: 'y' },
  { id: 'star', icon: Star, key: 's' },
  { id: 'text', icon: Type, key: 't' },
  { id: 'eyedropper', icon: Pipette, key: 'i' },
  { id: 'hand', icon: Hand, key: 'h' },
  { id: 'measure', icon: Ruler, key: 'm' },
  { id: 'brush', icon: Paintbrush, key: 'b' },
  { id: 'crop', icon: Crop, key: 'c' },
]

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const [themeName, setThemeName] = useState(getTheme().name)
  const [showShortcuts, setShowShortcuts] = useState(false)

  const handleToggleTheme = () => {
    toggleTheme()
    setThemeName(getTheme().name)
  }

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        padding: 'var(--space-1)',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        width: 40,
        alignItems: 'center',
      }}>
        {tools.map((tool) => {
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
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          <Keyboard size={16} strokeWidth={1.75} />
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
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
          {themeName === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
        </button>
      </div>
      {showShortcuts && <ShortcutPreferences onClose={() => setShowShortcuts(false)} />}
    </>
  )
}
