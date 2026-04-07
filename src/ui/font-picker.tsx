import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { FONT_CATALOG, CATEGORIES, type CatalogFont, type FontCategory } from '@/fonts/catalog'
import { loadFont, isFontLoaded } from '@/fonts/loader'

// ── Constants ──

export const WEIGHT_NAMES: Record<number, string> = {
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

/** Resolve the available weights for a catalog font. */
function getAvailableWeights(font: CatalogFont): number[] {
  const wghtAxis = font.a?.find(([tag]) => tag === 'wght')
  if (wghtAxis) {
    // Variable font — generate standard weight stops within range
    const [, min, max] = wghtAxis
    return [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => w >= min && w <= max)
  }
  return font.w.length > 0 ? font.w : [400]
}

/** Whether a font is a variable font (has any variation axes). */
function isVariable(font: CatalogFont): boolean {
  return !!font.a && font.a.length > 0
}

// ── Lookup helpers ──

const catalogByFamily = new Map<string, CatalogFont>()
for (const f of FONT_CATALOG) catalogByFamily.set(f.f, f)

export function getCatalogFont(family: string): CatalogFont | undefined {
  return catalogByFamily.get(family)
}

export function getBuiltinFonts() {
  return FONT_CATALOG
}

// ── Font Picker component ──

const CATEGORY_LABELS: Record<FontCategory, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Hand',
  monospace: 'Mono',
}

interface FontPickerProps {
  value: string
  weight: number
  onFamilyChange: (family: string) => void
  onWeightChange: (weight: number) => void
}

/** Number of fonts visible in the dropdown before scrolling. */
const VISIBLE_ITEM_HEIGHT = 32
const MAX_VISIBLE = 8
const DROPDOWN_HEIGHT = VISIBLE_ITEM_HEIGHT * MAX_VISIBLE

/** How many fonts to pre-render with their actual font face in the dropdown. */
const PREVIEW_BATCH = 12

export function FontPicker({ value, weight, onFamilyChange, onWeightChange }: FontPickerProps) {
  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [category, setCategory] = useState<FontCategory | null>(null)
  const [previewLoaded, setPreviewLoaded] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen])

  // Focus search on open
  useEffect(() => {
    if (isOpen) searchRef.current?.focus()
  }, [isOpen])

  // Filter fonts
  const filtered = useMemo(() => {
    let fonts = FONT_CATALOG
    if (category !== null) {
      const catIdx = CATEGORIES.indexOf(category)
      fonts = fonts.filter((f) => f.c === catIdx)
    }
    if (search) {
      const q = search.toLowerCase()
      fonts = fonts.filter((f) => f.f.toLowerCase().includes(q))
    }
    return fonts
  }, [search, category])

  // Eagerly load fonts visible in the dropdown for preview
  const loadVisiblePreviews = useCallback(() => {
    const toLoad = filtered.slice(0, previewLoaded + PREVIEW_BATCH)
    let didLoad = false
    for (const font of toLoad) {
      if (!isFontLoaded(font.f)) {
        loadFont(font)
        didLoad = true
      }
    }
    if (didLoad || previewLoaded < toLoad.length) {
      setPreviewLoaded(toLoad.length)
    }
  }, [filtered, previewLoaded])

  useEffect(() => {
    if (isOpen) {
      setPreviewLoaded(0)
      // Load first batch immediately
      const toLoad = filtered.slice(0, PREVIEW_BATCH)
      for (const font of toLoad) {
        if (!isFontLoaded(font.f)) loadFont(font)
      }
      setPreviewLoaded(PREVIEW_BATCH)
    }
  }, [isOpen, filtered])

  // Load more on scroll
  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const scrollBottom = el.scrollTop + el.clientHeight
    const neededIndex = Math.ceil(scrollBottom / VISIBLE_ITEM_HEIGHT) + 4
    if (neededIndex > previewLoaded) {
      loadVisiblePreviews()
    }
  }, [previewLoaded, loadVisiblePreviews])

  const currentFont = catalogByFamily.get(value)
  const availableWeights = currentFont ? getAvailableWeights(currentFont) : [400, 700]

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
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
            fontFamily: `"${value}", sans-serif`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            height: 'var(--height-button)',
          }}
        >
          {value}
          {currentFont && isVariable(currentFont) && (
            <span
              style={{
                fontSize: 8,
                color: 'var(--text-secondary)',
                marginLeft: 4,
                verticalAlign: 'super',
              }}
            >
              VAR
            </span>
          )}
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
          {availableWeights.map((w) => (
            <option key={w} value={w}>
              {getWeightName(w)}
            </option>
          ))}
        </select>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.2)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            marginTop: 2,
          }}
        >
          {/* Search */}
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search 1,929 fonts..."
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

          {/* Category filter tabs */}
          <div
            style={{
              display: 'flex',
              gap: 0,
              borderBottom: '1px solid var(--border-subtle)',
              padding: '0 4px',
            }}
          >
            <CategoryTab label="All" active={category === null} onClick={() => setCategory(null)} />
            {CATEGORIES.map((cat) => (
              <CategoryTab
                key={cat}
                label={CATEGORY_LABELS[cat]}
                active={category === cat}
                onClick={() => setCategory(category === cat ? null : cat)}
              />
            ))}
          </div>

          {/* Font list */}
          <div ref={listRef} onScroll={handleScroll} style={{ maxHeight: DROPDOWN_HEIGHT, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div
                style={{
                  padding: '12px 8px',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                }}
              >
                No fonts match
              </div>
            )}
            {filtered.map((font, i) => {
              const isSelected = font.f === value
              const shouldPreview = i < previewLoaded
              return (
                <button
                  key={font.f}
                  onClick={() => {
                    loadFont(font).then(() => {
                      onFamilyChange(font.f)
                    })
                    onFamilyChange(font.f)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                    // Load font on hover for preview
                    if (!isFontLoaded(font.f)) loadFont(font)
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'none'
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    background: isSelected ? 'var(--accent)' : 'none',
                    border: 'none',
                    padding: '4px 8px',
                    height: VISIBLE_ITEM_HEIGHT,
                    fontSize: 14,
                    color: isSelected ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: shouldPreview ? `"${font.f}", sans-serif` : 'inherit',
                    gap: 6,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {font.f}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-secondary)',
                      flexShrink: 0,
                      display: 'flex',
                      gap: 4,
                      alignItems: 'center',
                    }}
                  >
                    {isVariable(font) && (
                      <span
                        style={{
                          background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--bg-input)',
                          padding: '1px 3px',
                          borderRadius: 2,
                          fontSize: 8,
                          fontFamily: 'inherit',
                        }}
                      >
                        VAR
                      </span>
                    )}
                    {CATEGORIES[font.c]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Status bar */}
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: '3px 8px',
              fontSize: 9,
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{filtered.length} fonts</span>
            <span>All fonts licensed for commercial use (OFL / Apache 2.0)</span>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        padding: '4px 6px',
        fontSize: 10,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  )
}

// ── Backward compat ──

export type FontEntry = CatalogFont

/** @deprecated Use FONT_CATALOG directly. Kept for backward compat. */
export async function enumerateSystemFonts(): Promise<CatalogFont[]> {
  return FONT_CATALOG
}
