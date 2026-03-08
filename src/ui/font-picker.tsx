import { useState, useMemo } from 'react'

/** Known web-safe fonts with their weight ranges. */
export interface FontEntry {
  family: string
  weights: number[]
  category: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'handwriting'
}

const BUILTIN_FONTS: FontEntry[] = [
  { family: 'Arial', weights: [400, 700], category: 'sans-serif' },
  { family: 'Helvetica', weights: [300, 400, 700], category: 'sans-serif' },
  { family: 'Times New Roman', weights: [400, 700], category: 'serif' },
  { family: 'Georgia', weights: [400, 700], category: 'serif' },
  { family: 'Courier New', weights: [400, 700], category: 'monospace' },
  { family: 'Verdana', weights: [400, 700], category: 'sans-serif' },
  { family: 'Trebuchet MS', weights: [400, 700], category: 'sans-serif' },
  { family: 'Impact', weights: [400], category: 'display' },
  { family: 'Comic Sans MS', weights: [400, 700], category: 'handwriting' },
  { family: 'Palatino Linotype', weights: [400, 700], category: 'serif' },
  { family: 'Lucida Console', weights: [400], category: 'monospace' },
  { family: 'Tahoma', weights: [400, 700], category: 'sans-serif' },
  { family: 'Segoe UI', weights: [300, 400, 600, 700], category: 'sans-serif' },
  { family: 'Roboto', weights: [100, 300, 400, 500, 700, 900], category: 'sans-serif' },
  { family: 'Open Sans', weights: [300, 400, 600, 700, 800], category: 'sans-serif' },
  { family: 'Lato', weights: [100, 300, 400, 700, 900], category: 'sans-serif' },
  { family: 'Montserrat', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif' },
  { family: 'Inter', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], category: 'sans-serif' },
]

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
}

export function getWeightName(weight: number): string {
  return WEIGHT_NAMES[weight] ?? `${weight}`
}

export function getBuiltinFonts(): FontEntry[] {
  return BUILTIN_FONTS
}

/**
 * Try to enumerate system fonts via the Local Font Access API.
 * Falls back to built-in list if not available.
 */
export async function enumerateSystemFonts(): Promise<FontEntry[]> {
  if ('queryLocalFonts' in window) {
    try {
      const fonts = await (window as unknown as { queryLocalFonts: () => Promise<Array<{ family: string; style: string }>> }).queryLocalFonts()
      const familyMap = new Map<string, Set<number>>()
      for (const font of fonts) {
        if (!familyMap.has(font.family)) {
          familyMap.set(font.family, new Set())
        }
        // Parse weight from style string (rough heuristic)
        const style = font.style.toLowerCase()
        let weight = 400
        if (style.includes('thin')) weight = 100
        else if (style.includes('extralight') || style.includes('ultralight')) weight = 200
        else if (style.includes('light')) weight = 300
        else if (style.includes('medium')) weight = 500
        else if (style.includes('semibold') || style.includes('demibold')) weight = 600
        else if (style.includes('extrabold') || style.includes('ultrabold')) weight = 800
        else if (style.includes('black') || style.includes('heavy')) weight = 900
        else if (style.includes('bold')) weight = 700
        familyMap.get(font.family)!.add(weight)
      }

      return Array.from(familyMap.entries()).map(([family, weights]) => ({
        family,
        weights: Array.from(weights).sort((a, b) => a - b),
        category: 'sans-serif' as const,
      }))
    } catch {
      // Permission denied or API not available
    }
  }

  return BUILTIN_FONTS
}

interface FontPickerProps {
  value: string
  weight: number
  onFamilyChange: (family: string) => void
  onWeightChange: (weight: number) => void
}

export function FontPicker({ value, weight, onFamilyChange, onWeightChange }: FontPickerProps) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const fonts = BUILTIN_FONTS

  const filtered = useMemo(() => {
    if (!search) return fonts
    const q = search.toLowerCase()
    return fonts.filter(f => f.family.toLowerCase().includes(q))
  }, [fonts, search])

  const currentFont = fonts.find(f => f.family === value)
  const availableWeights = currentFont?.weights ?? [400, 700]

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '4px 8px',
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-primary)',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: value,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            height: 'var(--height-button)',
          }}
        >
          {value}
        </button>
        <select
          value={weight}
          onChange={(e) => onWeightChange(parseInt(e.target.value))}
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '4px',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-primary)',
            width: 90,
            height: 'var(--height-button)',
          }}
        >
          {availableWeights.map(w => (
            <option key={w} value={w}>{getWeightName(w)}</option>
          ))}
        </select>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
          maxHeight: 240,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          marginTop: 2,
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fonts..."
            autoFocus
            style={{
              background: 'var(--bg-input)',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              padding: '6px 8px',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(font => (
              <button
                key={font.family}
                onClick={() => {
                  onFamilyChange(font.family)
                  setIsOpen(false)
                  setSearch('')
                }}
                onMouseEnter={(e) => {
                  if (font.family !== value) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                }}
                onMouseLeave={(e) => {
                  if (font.family !== value) (e.currentTarget as HTMLElement).style.background = 'none'
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: font.family === value ? 'var(--accent)' : 'none',
                  border: 'none',
                  padding: '4px 8px',
                  fontSize: 'var(--font-size-lg)',
                  color: font.family === value ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: font.family,
                }}
              >
                {font.family}
                <span style={{ fontSize: 'var(--font-size-xs)', color: font.family === value ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)', marginLeft: 8 }}>
                  {font.category}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
