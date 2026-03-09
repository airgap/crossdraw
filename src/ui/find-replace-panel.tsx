import { useState, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { Layer, TextLayer, GroupLayer } from '@/types'

/** A match record: which artboard and layer contain matching text. */
interface TextMatch {
  artboardId: string
  layerId: string
  layerName: string
  text: string
}

/**
 * Recursively collect all text layers from a layer tree (handles groups).
 */
function collectTextLayers(layers: Layer[], artboardId: string, results: TextMatch[]) {
  for (const layer of layers) {
    if (layer.type === 'text') {
      results.push({
        artboardId,
        layerId: layer.id,
        layerName: layer.name,
        text: (layer as TextLayer).text,
      })
    } else if (layer.type === 'group') {
      collectTextLayers((layer as GroupLayer).children, artboardId, results)
    }
  }
}

/**
 * Test whether `text` contains the search term, respecting options.
 */
function textMatches(text: string, searchTerm: string, matchCase: boolean, wholeWord: boolean): boolean {
  if (!searchTerm) return false
  let haystack = text
  let needle = searchTerm
  if (!matchCase) {
    haystack = haystack.toLowerCase()
    needle = needle.toLowerCase()
  }
  if (wholeWord) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, matchCase ? '' : 'i')
    return re.test(text)
  }
  return haystack.includes(needle)
}

/**
 * Count how many times the search term appears in a string.
 */
function countOccurrences(text: string, searchTerm: string, matchCase: boolean, wholeWord: boolean): number {
  if (!searchTerm) return 0
  if (wholeWord) {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, matchCase ? 'g' : 'gi')
    const matches = text.match(re)
    return matches ? matches.length : 0
  }
  let haystack = text
  let needle = searchTerm
  if (!matchCase) {
    haystack = haystack.toLowerCase()
    needle = needle.toLowerCase()
  }
  let count = 0
  let pos = 0
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++
    pos += needle.length
  }
  return count
}

/**
 * Replace occurrences in text, respecting options.
 */
function replaceText(
  text: string,
  searchTerm: string,
  replacement: string,
  matchCase: boolean,
  wholeWord: boolean,
  all: boolean,
): string {
  if (!searchTerm) return text
  if (wholeWord) {
    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const flags = matchCase ? (all ? 'g' : '') : all ? 'gi' : 'i'
    const re = new RegExp(`\\b${escaped}\\b`, flags)
    return text.replace(re, replacement)
  }
  if (all) {
    if (!matchCase) {
      // Case-insensitive replace all
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(escaped, 'gi')
      return text.replace(re, replacement)
    }
    return text.split(searchTerm).join(replacement)
  }
  // Replace first occurrence
  if (!matchCase) {
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase())
    if (idx === -1) return text
    return text.slice(0, idx) + replacement + text.slice(idx + searchTerm.length)
  }
  const idx = text.indexOf(searchTerm)
  if (idx === -1) return text
  return text.slice(0, idx) + replacement + text.slice(idx + searchTerm.length)
}

export function FindReplacePanel() {
  const [findText, setFindText] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [matchIndex, setMatchIndex] = useState(-1)
  const findInputRef = useRef<HTMLInputElement>(null)

  const doc = useEditorStore((s) => s.document)
  const selectLayer = useEditorStore((s) => s.selectLayer)
  const updateLayer = useEditorStore((s) => s.updateLayer)

  // Focus the find input when the panel mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      findInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // Collect all matching text layers
  const getMatches = useCallback((): TextMatch[] => {
    if (!findText) return []
    const allTextLayers: TextMatch[] = []
    for (const artboard of doc.artboards) {
      collectTextLayers(artboard.layers, artboard.id, allTextLayers)
    }
    return allTextLayers.filter((m) => textMatches(m.text, findText, matchCase, wholeWord))
  }, [doc, findText, matchCase, wholeWord])

  const matches = getMatches()

  // Count total occurrences across all matching layers
  const totalOccurrences = matches.reduce((sum, m) => sum + countOccurrences(m.text, findText, matchCase, wholeWord), 0)

  const handleFindNext = useCallback(() => {
    const m = getMatches()
    if (m.length === 0) {
      setMatchIndex(-1)
      return
    }
    const nextIdx = matchIndex + 1 >= m.length ? 0 : matchIndex + 1
    setMatchIndex(nextIdx)
    selectLayer(m[nextIdx]!.layerId)
  }, [getMatches, matchIndex, selectLayer])

  const handleReplace = useCallback(() => {
    const m = getMatches()
    if (m.length === 0 || matchIndex < 0 || matchIndex >= m.length) return
    const match = m[matchIndex]!
    const newText = replaceText(match.text, findText, replaceValue, matchCase, wholeWord, false)
    updateLayer(match.artboardId, match.layerId, { text: newText })
    // After replacing, advance to next match (recalculate since the list changed)
    // The matchIndex stays the same since the current match may have been removed
    const updated = getMatches()
    if (updated.length === 0) {
      setMatchIndex(-1)
    } else {
      const newIdx = matchIndex >= updated.length ? 0 : matchIndex
      setMatchIndex(newIdx)
      if (updated[newIdx]) {
        selectLayer(updated[newIdx]!.layerId)
      }
    }
  }, [getMatches, matchIndex, findText, replaceValue, matchCase, wholeWord, updateLayer, selectLayer])

  const handleReplaceAll = useCallback(() => {
    const m = getMatches()
    if (m.length === 0) return
    for (const match of m) {
      const newText = replaceText(match.text, findText, replaceValue, matchCase, wholeWord, true)
      updateLayer(match.artboardId, match.layerId, { text: newText })
    }
    setMatchIndex(-1)
  }, [getMatches, findText, replaceValue, matchCase, wholeWord, updateLayer])

  // Reset match index when search parameters change
  useEffect(() => {
    setMatchIndex(-1)
  }, [findText, matchCase, wholeWord])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'var(--bg-input, var(--bg-surface))',
    color: 'var(--text-primary)',
    fontSize: 'var(--font-size-base)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm, 4px)',
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    fontSize: 'var(--font-size-sm, 11px)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--accent)',
    color: '#fff',
    borderColor: 'var(--accent)',
  }

  const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 'var(--font-size-sm, 11px)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  }

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Find input */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Find
        </div>
        <input
          ref={findInputRef}
          type="text"
          value={findText}
          onChange={(e) => setFindText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleFindNext()
            }
          }}
          placeholder="Search text layers..."
          style={inputStyle}
        />
      </div>

      {/* Replace input */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Replace
        </div>
        <input
          type="text"
          value={replaceValue}
          onChange={(e) => setReplaceValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleReplace()
            }
          }}
          placeholder="Replacement text..."
          style={inputStyle}
        />
      </div>

      {/* Options */}
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
          Match case
        </label>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
          Whole word
        </label>
      </div>

      {/* Results count */}
      <div
        style={{
          fontSize: 'var(--font-size-sm, 11px)',
          color: findText ? 'var(--text-secondary)' : 'var(--text-tertiary)',
          padding: '4px 0',
        }}
      >
        {findText
          ? `${totalOccurrences} match${totalOccurrences !== 1 ? 'es' : ''} in ${matches.length} layer${matches.length !== 1 ? 's' : ''}`
          : 'Type to search text layers'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={handleFindNext}
          disabled={matches.length === 0}
          style={{
            ...btnPrimaryStyle,
            opacity: matches.length === 0 ? 0.5 : 1,
            cursor: matches.length === 0 ? 'default' : 'pointer',
          }}
        >
          Find Next
        </button>
        <button
          onClick={handleReplace}
          disabled={matches.length === 0 || matchIndex < 0}
          style={{
            ...btnStyle,
            opacity: matches.length === 0 || matchIndex < 0 ? 0.5 : 1,
            cursor: matches.length === 0 || matchIndex < 0 ? 'default' : 'pointer',
          }}
        >
          Replace
        </button>
        <button
          onClick={handleReplaceAll}
          disabled={matches.length === 0}
          style={{
            ...btnStyle,
            opacity: matches.length === 0 ? 0.5 : 1,
            cursor: matches.length === 0 ? 'default' : 'pointer',
          }}
        >
          Replace All
        </button>
      </div>

      {/* Current match indicator */}
      {matchIndex >= 0 && matches.length > 0 && (
        <div
          style={{
            fontSize: 'var(--font-size-sm, 11px)',
            color: 'var(--text-secondary)',
            padding: '2px 0',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 8,
          }}
        >
          Match {matchIndex + 1} of {matches.length}: "{matches[matchIndex]?.layerName}"
        </div>
      )}
    </div>
  )
}
