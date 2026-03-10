import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import {
  listLibraries,
  getLibrary,
  publishLibrary,
  deleteLibrary,
  type LibraryEntry,
  type LibraryData,
} from '@/cloud/library-client'
import { getCloudConfig } from '@/cloud/cloud-client'
import type { SymbolDefinition } from '@/types'

// ── Helpers ──

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ── Component ──

export function LibraryPanel() {
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<LibraryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const subscribedLibraries = useEditorStore((s) => s.subscribedLibraries)
  const subscribeToLibrary = useEditorStore((s) => s.subscribeToLibrary)
  const unsubscribeFromLibrary = useEditorStore((s) => s.unsubscribeFromLibrary)
  const importSymbolFromLibrary = useEditorStore((s) => s.importSymbolFromLibrary)

  const refresh = useCallback(async () => {
    const config = getCloudConfig()
    if (!config.serverUrl) {
      setError('No cloud server configured. Set a server URL in cloud settings.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listLibraries(config)
      setLibraries(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load libraries')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handlePublish = useCallback(async () => {
    const config = getCloudConfig()
    if (!config.serverUrl) {
      setError('No cloud server configured.')
      return
    }

    const doc = useEditorStore.getState().document
    const name = prompt('Library name:', doc.metadata.title || 'My Library')
    if (!name || !name.trim()) return

    setPublishing(true)
    setError(null)
    try {
      await publishLibrary(
        {
          name: name.trim(),
          symbols: doc.symbols ?? [],
          textStyles: doc.styles?.textStyles ?? [],
          colorStyles: doc.styles?.colorStyles ?? [],
          effectStyles: doc.styles?.effectStyles ?? [],
          variables: doc.variableCollections ?? [],
        },
        config,
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish library')
    } finally {
      setPublishing(false)
    }
  }, [refresh])

  const handleExpand = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null)
        setExpandedData(null)
        return
      }
      setExpandedId(id)
      setExpandedData(null)
      try {
        const data = await getLibrary(id)
        setExpandedData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load library')
        setExpandedId(null)
      }
    },
    [expandedId],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this library? This cannot be undone.')) return
      try {
        await deleteLibrary(id)
        unsubscribeFromLibrary(id)
        if (expandedId === id) {
          setExpandedId(null)
          setExpandedData(null)
        }
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete library')
      }
    },
    [expandedId, refresh, unsubscribeFromLibrary],
  )

  const handleUseSymbol = useCallback(
    (symbol: SymbolDefinition) => {
      importSymbolFromLibrary(symbol)
    },
    [importSymbolFromLibrary],
  )

  const handleToggleSubscribe = useCallback(
    (lib: LibraryEntry) => {
      const sub = subscribedLibraries.find((s) => s.id === lib.id)
      if (sub) {
        unsubscribeFromLibrary(lib.id)
      } else {
        subscribeToLibrary(lib.id, lib.name, lib.version)
      }
    },
    [subscribedLibraries, subscribeToLibrary, unsubscribeFromLibrary],
  )

  const handleAcceptUpdate = useCallback(
    (lib: LibraryEntry) => {
      // Re-subscribe with the latest version
      unsubscribeFromLibrary(lib.id)
      subscribeToLibrary(lib.id, lib.name, lib.version)
    },
    [subscribeToLibrary, unsubscribeFromLibrary],
  )

  const isSubscribed = (id: string) => subscribedLibraries.some((s) => s.id === id)
  const hasUpdate = (lib: LibraryEntry) => {
    const sub = subscribedLibraries.find((s) => s.id === lib.id)
    return sub !== undefined && sub.version < lib.version
  }

  return (
    <div style={{ padding: 8, fontSize: 'var(--font-size-base)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>Team Libraries</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              padding: '2px 8px',
              fontSize: 'inherit',
              cursor: loading ? 'wait' : 'pointer',
              background: 'var(--bg-control)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              color: 'var(--text-primary)',
            }}
          >
            Refresh
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            style={{
              padding: '2px 8px',
              fontSize: 'inherit',
              cursor: publishing ? 'wait' : 'pointer',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
            }}
          >
            {publishing ? 'Publishing...' : 'Publish Library'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: 6,
            marginBottom: 8,
            background: 'rgba(255,80,80,0.1)',
            border: '1px solid rgba(255,80,80,0.3)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {loading && libraries.length === 0 && (
        <div style={{ color: 'var(--text-secondary)', padding: 16, textAlign: 'center' }}>Loading...</div>
      )}

      {!loading && libraries.length === 0 && !error && (
        <div style={{ color: 'var(--text-secondary)', padding: 16, textAlign: 'center' }}>
          No libraries published yet. Use "Publish Library" to share symbols and styles with your team.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {libraries.map((lib) => {
          const subscribed = isSubscribed(lib.id)
          const updateAvailable = hasUpdate(lib)
          return (
            <div
              key={lib.id}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                background: 'var(--bg-surface)',
              }}
            >
              {/* Library header */}
              <div
                style={{
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => handleExpand(lib.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {expandedId === lib.id ? '\u25BC' : '\u25B6'}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {lib.name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11, flexShrink: 0 }}>v{lib.version}</span>
                  {updateAvailable && (
                    <span
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        padding: '1px 5px',
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Update Available
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                    {lib.symbolCount} symbols, {lib.styleCount} styles
                  </span>
                </div>
              </div>

              {/* Subscription / actions bar */}
              <div
                style={{
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-raised)',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleSubscribe(lib)
                  }}
                  style={{
                    padding: '1px 6px',
                    fontSize: 11,
                    cursor: 'pointer',
                    background: subscribed ? 'var(--accent)' : 'var(--bg-control)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 3,
                    color: subscribed ? '#fff' : 'var(--text-primary)',
                  }}
                >
                  {subscribed ? 'Subscribed' : 'Subscribe'}
                </button>
                {updateAvailable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAcceptUpdate(lib)
                    }}
                    style={{
                      padding: '1px 6px',
                      fontSize: 11,
                      cursor: 'pointer',
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: 3,
                      color: '#fff',
                    }}
                  >
                    Accept Update
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{formatDate(lib.updatedAt)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(lib.id)
                  }}
                  style={{
                    padding: '1px 6px',
                    fontSize: 11,
                    cursor: 'pointer',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 3,
                    color: 'var(--text-secondary)',
                  }}
                  title="Delete library"
                >
                  Delete
                </button>
              </div>

              {/* Expanded content */}
              {expandedId === lib.id && expandedData && (
                <div
                  style={{
                    padding: 8,
                    borderTop: '1px solid var(--border-subtle)',
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {/* Symbols */}
                  {expandedData.symbols.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                        Symbols ({expandedData.symbols.length})
                      </div>
                      {expandedData.symbols.map((sym) => (
                        <div
                          key={sym.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '3px 4px',
                            borderRadius: 3,
                          }}
                        >
                          <span style={{ fontSize: 12 }}>{sym.name}</span>
                          <button
                            onClick={() => handleUseSymbol(sym)}
                            style={{
                              padding: '1px 6px',
                              fontSize: 10,
                              cursor: 'pointer',
                              background: 'var(--bg-control)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 3,
                              color: 'var(--text-primary)',
                            }}
                          >
                            Use
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Text Styles */}
                  {expandedData.textStyles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                        Text Styles ({expandedData.textStyles.length})
                      </div>
                      {expandedData.textStyles.map((style) => (
                        <div key={style.id} style={{ padding: '2px 4px', fontSize: 12 }}>
                          {style.name} — {style.fontFamily} {style.fontSize}px
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Color Styles */}
                  {expandedData.colorStyles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                        Color Styles ({expandedData.colorStyles.length})
                      </div>
                      {expandedData.colorStyles.map((style) => (
                        <div
                          key={style.id}
                          style={{ padding: '2px 4px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: style.color,
                              border: '1px solid var(--border-subtle)',
                            }}
                          />
                          {style.name}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Effect Styles */}
                  {expandedData.effectStyles.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                        Effect Styles ({expandedData.effectStyles.length})
                      </div>
                      {expandedData.effectStyles.map((style) => (
                        <div key={style.id} style={{ padding: '2px 4px', fontSize: 12 }}>
                          {style.name} ({style.effects.length} effects)
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Variables */}
                  {expandedData.variables.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>
                        Variables ({expandedData.variables.length} collections)
                      </div>
                      {expandedData.variables.map((coll) => (
                        <div key={coll.id} style={{ padding: '2px 4px', fontSize: 12 }}>
                          {coll.name} ({coll.variables.length} variables)
                        </div>
                      ))}
                    </div>
                  )}

                  {expandedData.symbols.length === 0 &&
                    expandedData.textStyles.length === 0 &&
                    expandedData.colorStyles.length === 0 &&
                    expandedData.effectStyles.length === 0 &&
                    expandedData.variables.length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center', padding: 8 }}>
                        This library is empty.
                      </div>
                    )}
                </div>
              )}

              {expandedId === lib.id && !expandedData && (
                <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
                  Loading library data...
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
