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
  TextCursorInput,
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
  Grid2x2,
  RectangleHorizontal,
  CircleDot,
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

// ---------------------------------------------------------------------------
// Toolbar order persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'crossdraw:toolbar-order'

/** Serialisable token: tool id, 'separator', or 'shapes' */
type ToolToken = string

function defaultOrder(): ToolToken[] {
  return DEFAULT_TOOLS.map((t) => (typeof t === 'string' ? t : t.id))
}

function loadOrder(): ToolToken[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultOrder()
    const parsed = JSON.parse(raw) as ToolToken[]
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultOrder()
    return parsed
  } catch {
    return defaultOrder()
  }
}

export function saveToolbarOrder(order: ToolToken[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  window.dispatchEvent(new Event('crossdraw:toolbar-changed'))
}

export function resetToolbarOrder() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event('crossdraw:toolbar-changed'))
}

export function getToolbarOrder(): ToolToken[] {
  return loadOrder()
}

/** All known tool entries by id for lookup */
const toolEntryMap = new Map<string, ToolEntry>()

const shapeTools: ToolEntry[] = [
  { id: 'rectangle', icon: Square, key: 'r' },
  { id: 'ellipse', icon: Circle, key: 'e' },
  { id: 'polygon', icon: Hexagon, key: 'y' },
  { id: 'star', icon: Star, key: 'shift+s' },
]

const shapeToolIds = new Set(shapeTools.map((t) => t.id))

const textTools: ToolEntry[] = [
  { id: 'text', icon: Type, key: 't' },
  { id: 'frame-text', icon: TextCursorInput, key: 'shift+t' },
]

const textToolIds = new Set(textTools.map((t) => t.id))

const pixelTools: ToolEntry[] = [
  { id: 'pixel-draw', icon: Grid2x2, key: 'shift+p' },
  { id: 'pixel-line', icon: Minus, key: 'shift+l' },
  { id: 'pixel-rect', icon: RectangleHorizontal, key: 'shift+r' },
  { id: 'pixel-ellipse', icon: CircleDot, key: 'shift+e' },
  { id: 'pixel-erase', icon: Eraser, key: 'shift+x' },
]

const pixelToolIds = new Set(pixelTools.map((t) => t.id))

const DEFAULT_TOOLS: (ToolEntry | 'shapes' | 'textTools' | 'pixelTools' | 'separator')[] = [
  // ── Selection & navigation ──
  { id: 'select', icon: MousePointer2, key: 'v' },
  { id: 'node', icon: Spline, key: 'a' },
  { id: 'hand', icon: Hand, key: 'h' },
  { id: 'zoom', icon: ZoomIn, key: 'z' },
  'separator',
  // ── Vector drawing ──
  { id: 'pen', icon: PenTool, key: 'p' },
  { id: 'pencil', icon: Pencil, key: 'n' },
  { id: 'line', icon: Minus, key: 'l' },
  'shapes',
  'textTools',
  'separator',
  // ── Raster painting ──
  { id: 'brush', icon: BrushIcon, key: 'b' },
  { id: 'eraser', icon: Eraser, key: 'x' },
  { id: 'clone-stamp', icon: Stamp, key: 's' },
  { id: 'fill', icon: PaintBucket, key: 'g' },
  { id: 'gradient', icon: Blend, key: 'j' },
  'pixelTools',
  'separator',
  // ── Selection regions ──
  { id: 'marquee', icon: SquareDashed, key: 'm' },
  { id: 'lasso', icon: Lasso, key: 'q' },
  'separator',
  // ── Transform & modify ──
  { id: 'crop', icon: Crop, key: 'shift+c' },
  { id: 'knife', icon: Scissors, key: 'k' },
  { id: 'shape-builder', icon: Combine, key: 'shift+m' },
  { id: 'eyedropper', icon: Pipette, key: 'i' },
  { id: 'measure', icon: Ruler, key: 'u' },
  'separator',
  // ── Layout & export ──
  { id: 'artboard', icon: Frame, key: 'f' },
  { id: 'slice', icon: ScissorsLineDashed, key: 'w' },
  { id: 'comment', icon: MessageCircle, key: 'c' },
]

// Populate tool entry map
for (const t of DEFAULT_TOOLS) {
  if (typeof t !== 'string') toolEntryMap.set(t.id, t)
}
for (const t of shapeTools) {
  toolEntryMap.set(t.id, t)
}
for (const t of textTools) {
  toolEntryMap.set(t.id, t)
}
for (const t of pixelTools) {
  toolEntryMap.set(t.id, t)
}

/** Build ordered tool list from persisted order, falling back to defaults. */
function getOrderedTools(): (ToolEntry | 'shapes' | 'textTools' | 'pixelTools' | 'separator')[] {
  const order = loadOrder()
  const result: (ToolEntry | 'shapes' | 'textTools' | 'pixelTools' | 'separator')[] = []
  const seen = new Set<string>()
  for (const token of order) {
    if (token === 'separator') {
      result.push('separator')
    } else if (token === 'shapes') {
      if (!seen.has('shapes')) {
        result.push('shapes')
        seen.add('shapes')
      }
    } else if (token === 'textTools') {
      if (!seen.has('textTools')) {
        result.push('textTools')
        seen.add('textTools')
      }
    } else if (token === 'pixelTools') {
      if (!seen.has('pixelTools')) {
        result.push('pixelTools')
        seen.add('pixelTools')
      }
    } else {
      const entry = toolEntryMap.get(token)
      if (entry && !seen.has(token)) {
        result.push(entry)
        seen.add(token)
      }
    }
  }
  // Append any tools not in the persisted order (e.g. newly added tools)
  for (const t of DEFAULT_TOOLS) {
    const id = typeof t === 'string' ? t : t.id
    if (id === 'separator') continue
    if (!seen.has(id)) {
      result.push(t)
      seen.add(id)
    }
  }
  return result
}

/** Long-press delay in ms before showing shape picker */
const LONG_PRESS_MS = 300

function ShapeToolButton({
  activeTool,
  setActiveTool,
  btnSize,
  iconSize,
}: {
  activeTool: EditorState['activeTool']
  setActiveTool: (tool: EditorState['activeTool']) => void
  btnSize?: number
  iconSize: number
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
          width: btnSize ?? 'var(--height-toolbar)',
          height: btnSize ?? 'var(--height-toolbar)',
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
        <Icon size={iconSize} strokeWidth={1.75} />
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
                  width: btnSize ?? 'var(--height-toolbar)',
                  height: btnSize ?? 'var(--height-toolbar)',
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
                <ShapeIcon size={iconSize} strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TextToolButton({
  activeTool,
  setActiveTool,
  btnSize,
  iconSize,
}: {
  activeTool: EditorState['activeTool']
  setActiveTool: (tool: EditorState['activeTool']) => void
  btnSize?: number
  iconSize: number
}) {
  const [currentText, setCurrentText] = useState<EditorState['activeTool']>('text')
  const [showPicker, setShowPicker] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (textToolIds.has(activeTool)) setCurrentText(activeTool)
  }, [activeTool])

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
      setActiveTool(currentText)
      setShowPicker(false)
    }
  }, [currentText, setActiveTool])

  const onPointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const isActive = textToolIds.has(activeTool)
  const current = textTools.find((t) => t.id === currentText) || textTools[0]!
  const Icon = current.icon

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        data-tool-texttools="true"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        title={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more`}
        role="button"
        tabIndex={0}
        aria-label={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more text tools`}
        aria-pressed={isActive}
        className="cd-hoverable"
        style={{
          width: btnSize ?? 'var(--height-toolbar)',
          height: btnSize ?? 'var(--height-toolbar)',
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
        <Icon size={iconSize} strokeWidth={1.75} />
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
          aria-label="Text tools"
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
          {textTools.map((tt) => {
            const TtIcon = tt.icon
            const isTtActive = activeTool === tt.id
            return (
              <button
                key={tt.id}
                onClick={() => {
                  setCurrentText(tt.id)
                  setActiveTool(tt.id)
                  setShowPicker(false)
                }}
                title={`${toolLabel(tt.id)} (${tt.key.toUpperCase()})`}
                role="menuitem"
                aria-label={`${toolLabel(tt.id)} (${tt.key.toUpperCase()})`}
                className="cd-hoverable"
                style={{
                  width: btnSize ?? 'var(--height-toolbar)',
                  height: btnSize ?? 'var(--height-toolbar)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isTtActive ? '#fff' : 'var(--text-secondary)',
                  background: isTtActive ? 'var(--accent)' : 'transparent',
                }}
              >
                <TtIcon size={iconSize} strokeWidth={1.75} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PixelToolButton({
  activeTool,
  setActiveTool,
  btnSize,
  iconSize,
}: {
  activeTool: EditorState['activeTool']
  setActiveTool: (tool: EditorState['activeTool']) => void
  btnSize?: number
  iconSize: number
}) {
  const [currentPixel, setCurrentPixel] = useState<EditorState['activeTool']>('pixel-draw')
  const [showPicker, setShowPicker] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pixelToolIds.has(activeTool)) setCurrentPixel(activeTool)
  }, [activeTool])

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
      setActiveTool(currentPixel)
      setShowPicker(false)
    }
  }, [currentPixel, setActiveTool])

  const onPointerLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const isActive = pixelToolIds.has(activeTool)
  const current = pixelTools.find((t) => t.id === currentPixel) || pixelTools[0]!
  const Icon = current.icon

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        data-tool-pixeltools="true"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        title={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more`}
        role="button"
        tabIndex={0}
        aria-label={`${toolLabel(current.id)} (${current.key.toUpperCase()}) — hold for more pixel tools`}
        aria-pressed={isActive}
        className="cd-hoverable"
        style={{
          width: btnSize ?? 'var(--height-toolbar)',
          height: btnSize ?? 'var(--height-toolbar)',
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
        <Icon size={iconSize} strokeWidth={1.75} />
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
          aria-label="Pixel tools"
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
          {pixelTools.map((pt) => {
            const PtIcon = pt.icon
            const isPtActive = activeTool === pt.id
            return (
              <button
                key={pt.id}
                onClick={() => {
                  setCurrentPixel(pt.id)
                  setActiveTool(pt.id)
                  setShowPicker(false)
                }}
                title={`${toolLabel(pt.id)} (${pt.key.toUpperCase()})`}
                role="menuitem"
                aria-label={`${toolLabel(pt.id)} (${pt.key.toUpperCase()})`}
                className="cd-hoverable"
                style={{
                  width: btnSize ?? 'var(--height-toolbar)',
                  height: btnSize ?? 'var(--height-toolbar)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isPtActive ? '#fff' : 'var(--text-secondary)',
                  background: isPtActive ? 'var(--accent)' : 'transparent',
                }}
              >
                <PtIcon size={iconSize} strokeWidth={1.75} />
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
  text: 'Artistic Text',
  'frame-text': 'Frame Text',
  brush: 'Brush',
  eraser: 'Eraser',
  'clone-stamp': 'Clone Stamp',
  fill: 'Fill',
  gradient: 'Gradient',
  'pixel-draw': 'Pixel Draw',
  'pixel-line': 'Pixel Line',
  'pixel-rect': 'Pixel Rectangle',
  'pixel-ellipse': 'Pixel Ellipse',
  'pixel-erase': 'Pixel Erase',
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

export function toolLabel(id: string): string {
  return toolLabels[id] ?? id.charAt(0).toUpperCase() + id.slice(1)
}

// ---------------------------------------------------------------------------
// Custom overlay scrollbar for the tool list
// ---------------------------------------------------------------------------

function ToolScrollArea({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [thumbH, setThumbH] = useState(0)
  const [thumbTop, setThumbTop] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dragging, setDragging] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStart = useRef({ y: 0, scrollTop: 0 })

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollHeight, clientHeight, scrollTop } = el
    if (scrollHeight <= clientHeight) {
      setThumbH(0)
      return
    }
    const ratio = clientHeight / scrollHeight
    const h = Math.max(16, ratio * clientHeight)
    const maxTop = clientHeight - h
    const top = (scrollTop / (scrollHeight - clientHeight)) * maxTop
    setThumbH(h)
    setThumbTop(top)
  }, [])

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setVisible(true)
    hideTimer.current = setTimeout(() => {
      if (!dragging) setVisible(false)
    }, 1200)
  }, [dragging])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update])

  const onScroll = useCallback(() => {
    update()
    show()
  }, [update, show])

  const onThumbDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragging(true)
      dragStart.current = { y: e.clientY, scrollTop: scrollRef.current?.scrollTop ?? 0 }
      const onMove = (ev: MouseEvent) => {
        const el = scrollRef.current
        if (!el) return
        const dy = ev.clientY - dragStart.current.y
        const { scrollHeight, clientHeight } = el
        const maxTop = clientHeight - thumbH
        if (maxTop <= 0) return
        const scrollRange = scrollHeight - clientHeight
        el.scrollTop = dragStart.current.scrollTop + (dy / maxTop) * scrollRange
      }
      const onUp = () => {
        setDragging(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [thumbH],
  )

  const onTrackClick = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current
    const track = trackRef.current
    if (!el || !track) return
    const rect = track.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const { scrollHeight, clientHeight } = el
    const ratio = clickY / clientHeight
    el.scrollTop = ratio * (scrollHeight - clientHeight) - clientHeight / 2
  }, [])

  return (
    <div
      style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%' }}
      onMouseEnter={show}
      onMouseLeave={() => {
        if (!dragging) setVisible(false)
      }}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          alignItems: 'center',
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          width: '100%',
        }}
      >
        {children}
      </div>
      {/* Custom scrollbar track + thumb */}
      {thumbH > 0 && (
        <div
          ref={trackRef}
          onClick={onTrackClick}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: 4,
            opacity: visible || dragging ? 1 : 0,
            transition: 'opacity 0.2s',
            cursor: 'pointer',
          }}
        >
          <div
            ref={thumbRef}
            onMouseDown={onThumbDown}
            style={{
              position: 'absolute',
              right: 0,
              top: thumbTop,
              width: 4,
              height: thumbH,
              borderRadius: 2,
              background: 'var(--text-secondary)',
              opacity: dragging ? 0.6 : 0.35,
              transition: dragging ? 'none' : 'opacity 0.15s',
              cursor: 'grab',
            }}
          />
        </div>
      )}
    </div>
  )
}

export function Toolbar({ modeConfig }: { modeConfig?: { tools: string[] } } = {}) {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setActiveTool = useEditorStore((s) => s.setActiveTool)
  const touchMode = useEditorStore((s) => s.touchMode)
  const btnSize = touchMode ? 48 : undefined // undefined → use var(--height-toolbar)
  const iconSize = touchMode ? 20 : 16
  const toolbarWidth = touchMode ? 56 : 40
  const [themeName, setThemeName] = useState(getTheme().name)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [toolAnnouncement, setToolAnnouncement] = useState('')
  const [tools, setTools] = useState(getOrderedTools)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // Re-read tool order when it changes
  useEffect(() => {
    const handler = () => setTools(getOrderedTools())
    window.addEventListener('crossdraw:toolbar-changed', handler)
    return () => window.removeEventListener('crossdraw:toolbar-changed', handler)
  }, [])

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
          width: toolbarWidth,
          alignItems: 'center',
          minHeight: 0,
        }}
      >
        {/* Scrollable tool list with custom scrollbar */}
        <ToolScrollArea>
          {tools
            .filter((tool) => {
              if (!modeConfig) return true
              if (tool === 'separator' || tool === 'shapes' || tool === 'textTools' || tool === 'pixelTools')
                return true
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
                return (
                  <ShapeToolButton
                    key="shapes"
                    activeTool={activeTool}
                    setActiveTool={handleSetActiveTool}
                    btnSize={btnSize}
                    iconSize={iconSize}
                  />
                )
              }
              if (tool === 'textTools') {
                return (
                  <TextToolButton
                    key="textTools"
                    activeTool={activeTool}
                    setActiveTool={handleSetActiveTool}
                    btnSize={btnSize}
                    iconSize={iconSize}
                  />
                )
              }
              if (tool === 'pixelTools') {
                return (
                  <PixelToolButton
                    key="pixelTools"
                    activeTool={activeTool}
                    setActiveTool={handleSetActiveTool}
                    btnSize={btnSize}
                    iconSize={iconSize}
                  />
                )
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
                    width: btnSize ?? 'var(--height-toolbar)',
                    height: btnSize ?? 'var(--height-toolbar)',
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
                  <Icon size={iconSize} strokeWidth={1.75} />
                </button>
              )
            })}
        </ToolScrollArea>
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
              width: btnSize ?? 'var(--height-toolbar)',
              height: btnSize ?? 'var(--height-toolbar)',
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
            <Keyboard size={iconSize} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="UI Settings"
            aria-label="UI Settings"
            className="cd-hoverable"
            style={{
              width: btnSize ?? 'var(--height-toolbar)',
              height: btnSize ?? 'var(--height-toolbar)',
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
            <Settings size={iconSize} strokeWidth={1.75} />
          </button>
          <button
            onClick={handleToggleTheme}
            title={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
            aria-label={`Switch to ${themeName === 'dark' ? 'light' : 'dark'} theme`}
            className="cd-hoverable"
            style={{
              width: btnSize ?? 'var(--height-toolbar)',
              height: btnSize ?? 'var(--height-toolbar)',
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
            {themeName === 'dark' ? (
              <Sun size={iconSize} strokeWidth={1.75} />
            ) : (
              <Moon size={iconSize} strokeWidth={1.75} />
            )}
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
