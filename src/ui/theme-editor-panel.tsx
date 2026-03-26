import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getTheme,
  getThemePreference,
  setTheme,
  getAllThemes,
  saveCustomTheme,
  deleteCustomTheme,
  duplicateTheme,
  applyAccentToTheme,
  exportTheme,
  importTheme,
  isBuiltinTheme,
  type Theme,
  type ThemeColors,
} from '@/ui/theme'

// ── Category grouping for color keys ──

interface ColorGroup {
  label: string
  keys: (keyof ThemeColors)[]
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: 'Surfaces',
    keys: ['bgBase', 'bgSurface', 'bgElevated', 'bgOverlay', 'bgInput', 'bgHover', 'bgActive', 'canvasBg'],
  },
  { label: 'Borders', keys: ['borderSubtle', 'borderDefault', 'borderStrong'] },
  { label: 'Text', keys: ['textPrimary', 'textSecondary', 'textDisabled', 'textAccent'] },
  { label: 'Accent', keys: ['accent', 'accentHover', 'accentActive', 'accentDisabled'] },
  { label: 'Semantic', keys: ['success', 'warning', 'error', 'info'] },
]

// ── Readable label from camelCase key ──

function keyToLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

// ── Styles ──

const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  marginTop: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 600,
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '3px 0',
  gap: 8,
}

const labelSt: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-primary)',
  flex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const btnSt: React.CSSProperties = {
  height: 24,
  padding: '0 8px',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: 11,
  cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  ...btnSt,
  borderColor: 'var(--error)',
  color: 'var(--error)',
}

// ── Component ──

export function ThemeEditorPanel() {
  const [pref, setPref] = useState(getThemePreference)
  const [themes, setThemes] = useState(getAllThemes)
  const [editTheme, setEditTheme] = useState<Theme>({ ...getTheme() })
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isBuiltIn = isBuiltinTheme(editTheme.name)

  // Sync when theme changes externally
  useEffect(() => {
    const handler = () => {
      setPref(getThemePreference())
      setThemes(getAllThemes())
      if (!dirty) setEditTheme({ ...getTheme() })
    }
    window.addEventListener('crossdraw:theme-changed', handler)
    window.addEventListener('crossdraw:themes-changed', handler)
    return () => {
      window.removeEventListener('crossdraw:theme-changed', handler)
      window.removeEventListener('crossdraw:themes-changed', handler)
    }
  }, [dirty])

  const handleSelectTheme = useCallback((name: string) => {
    setTheme(name)
    setPref(name)
    const t = getAllThemes().find((th) => th.name === name)
    if (t) {
      setEditTheme({ ...t })
      setDirty(false)
    }
  }, [])

  const handleColorChange = useCallback((key: keyof ThemeColors, value: string) => {
    setEditTheme((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  const handleAccentChange = useCallback((value: string) => {
    setEditTheme((prev) => applyAccentToTheme(prev, value))
    setDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    if (isBuiltIn) return
    saveCustomTheme(editTheme)
    setTheme(editTheme.name)
    setDirty(false)
    setThemes(getAllThemes())
  }, [editTheme, isBuiltIn])

  const handleDuplicate = useCallback(() => {
    const baseName = editTheme.name
    let n = 1
    let name = `${baseName} Copy`
    const existing = new Set(getAllThemes().map((t) => t.name))
    while (existing.has(name)) {
      n++
      name = `${baseName} Copy ${n}`
    }
    const dup = duplicateTheme(editTheme.name, name)
    if (dup) {
      setTheme(name)
      setEditTheme({ ...dup })
      setDirty(false)
      setThemes(getAllThemes())
    }
  }, [editTheme])

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return
    const theme: Theme = { ...editTheme, name: newName.trim() }
    saveCustomTheme(theme)
    setTheme(theme.name)
    setEditTheme({ ...theme })
    setDirty(false)
    setThemes(getAllThemes())
    setNewName('')
    setShowCreate(false)
  }, [editTheme, newName])

  const handleDelete = useCallback(() => {
    if (isBuiltIn) return
    deleteCustomTheme(editTheme.name)
    setEditTheme({ ...getTheme() })
    setDirty(false)
    setThemes(getAllThemes())
  }, [editTheme, isBuiltIn])

  const handleExport = useCallback(() => {
    const json = exportTheme(editTheme)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${editTheme.name}.crossdraw-theme`
    a.click()
    URL.revokeObjectURL(url)
  }, [editTheme])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importTheme(reader.result as string)
      if (result) {
        setTheme(result.name)
        setEditTheme({ ...result })
        setDirty(false)
        setThemes(getAllThemes())
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ''
  }, [])

  return (
    <div
      style={{
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        overflow: 'auto',
        height: '100%',
      }}
    >
      {/* Theme selector */}
      <div style={sectionHeader}>Active Theme</div>
      <div style={row}>
        <select
          value={pref}
          onChange={(e) => handleSelectTheme(e.target.value)}
          style={{
            ...btnSt,
            flex: 1,
            textAlign: 'left',
          }}
        >
          <option value="system">System</option>
          {themes.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        <button style={btnSt} onClick={handleDuplicate} title="Duplicate current theme">
          Duplicate
        </button>
        <button style={btnSt} onClick={() => setShowCreate(true)} title="Create new theme from current">
          New
        </button>
        <button style={btnSt} onClick={handleExport} title="Export as .crossdraw-theme file">
          Export
        </button>
        <button style={btnSt} onClick={handleImport} title="Import .crossdraw-theme file">
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".crossdraw-theme,.json"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
        {!isBuiltIn && (
          <button style={dangerBtn} onClick={handleDelete} title="Delete this custom theme">
            Delete
          </button>
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Theme name..."
            autoFocus
            style={{
              ...btnSt,
              flex: 1,
              textAlign: 'left',
            }}
          />
          <button style={btnSt} onClick={handleCreate}>
            Create
          </button>
          <button
            style={btnSt}
            onClick={() => {
              setShowCreate(false)
              setNewName('')
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Quick accent picker */}
      <div style={sectionHeader}>Accent Color</div>
      <div style={row}>
        <span style={labelSt}>Base accent</span>
        <input
          type="color"
          value={editTheme.accent}
          onChange={(e) => handleAccentChange(e.target.value)}
          disabled={isBuiltIn}
          style={{ width: 32, height: 24, border: 'none', cursor: isBuiltIn ? 'not-allowed' : 'pointer' }}
        />
      </div>

      {/* Color editor by category */}
      {COLOR_GROUPS.map((group) => (
        <div key={group.label}>
          <div style={sectionHeader}>{group.label}</div>
          {group.keys.map((key) => (
            <div key={key} style={row}>
              <span style={labelSt}>{keyToLabel(key)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="color"
                  value={editTheme[key].startsWith('rgba') ? '#888888' : editTheme[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  disabled={isBuiltIn}
                  style={{
                    width: 24,
                    height: 20,
                    border: 'none',
                    cursor: isBuiltIn ? 'not-allowed' : 'pointer',
                    padding: 0,
                  }}
                />
                <input
                  type="text"
                  value={editTheme[key]}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  disabled={isBuiltIn}
                  style={{
                    width: 100,
                    height: 20,
                    padding: '0 4px',
                    border: '1px solid var(--border-default)',
                    borderRadius: 2,
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Save button for custom themes */}
      {!isBuiltIn && dirty && (
        <button
          style={{
            ...btnSt,
            marginTop: 12,
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
          }}
          onClick={handleSave}
        >
          Save Theme
        </button>
      )}

      {isBuiltIn && (
        <div
          style={{
            marginTop: 12,
            fontSize: 10,
            color: 'var(--text-secondary)',
            textAlign: 'center',
          }}
        >
          Built-in themes are read-only. Duplicate to customize.
        </div>
      )}
    </div>
  )
}
