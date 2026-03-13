import { useState, useEffect, useCallback } from 'react'
import { openFile, openFileAsDocument } from '@/io/open-file'
import { NewDocumentModal } from '@/ui/new-document-modal'
import { useEditorStore } from '@/store/editor.store'
import { getRecentFiles, clearRecentFiles, type RecentFileEntry } from '@/io/recent-files'
import { decodeDocument } from '@/io/file-format'
import { newDocumentFromClipboardBlob } from '@/tools/import-image'

// ── Relative time formatter ──

function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay} days ago`
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7)
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`
  }
  if (diffDay < 365) {
    const months = Math.floor(diffDay / 30)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  const years = Math.floor(diffDay / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

// ── Open a recent file by its path ──

async function openRecentByPath(entry: RecentFileEntry) {
  const api = window.electronAPI
  if (api) {
    // Electron: read the file from disk by path
    try {
      const data = await api.fileRead(entry.path)
      const ext = entry.path.split('.').pop()?.toLowerCase()

      if (ext === 'xd') {
        const doc = decodeDocument(data)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
          filePath: entry.path,
        })
      } else {
        // For images / SVGs, wrap in a File and reuse generic open
        const name = entry.path.split(/[/\\]/).pop() || 'file'
        const mimeMap: Record<string, string> = {
          png: 'image/png',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          gif: 'image/gif',
          webp: 'image/webp',
          svg: 'image/svg+xml',
          psd: 'application/octet-stream',
        }
        const file = new File([data], name, { type: mimeMap[ext || ''] || '' })
        await openFileAsDocument(file)
      }
    } catch (err) {
      console.error('Failed to open recent file:', err)
      alert(`Failed to open file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  } else {
    // Web: the path is an IndexedDB key or similar — fall back to file picker
    // Since we can't access arbitrary paths in the browser, just open file picker
    await openFile()
  }
}

// ── Component ──

export function SplashScreen({ onReady }: { onReady: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [showNewDoc, setShowNewDoc] = useState(false)
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([])

  useEffect(() => {
    setRecentFiles(getRecentFiles().slice(0, 10))
  }, [])

  // Ctrl+V on splash → create new document from clipboard image
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          if (blob) {
            const created = await newDocumentFromClipboardBlob(blob)
            if (created) onReady()
          }
          return
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [onReady])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await openFileAsDocument(file)
  }, [])

  const handleClearRecent = useCallback(() => {
    clearRecentFiles()
    setRecentFiles([])
  }, [])

  const handleOpenRecent = useCallback(async (entry: RecentFileEntry) => {
    await openRecentByPath(entry)
  }, [])

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: '0 0 8px',
              letterSpacing: '-0.5px',
            }}
          >
            Crossdraw
          </h1>
          <p
            style={{
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-secondary)',
              margin: '0 0 32px',
            }}
          >
            Vector &amp; raster design editor
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 32 }}>
            <button onClick={() => setShowNewDoc(true)} style={btnStyle}>
              New Document
            </button>
            <button onClick={() => openFile()} style={btnStyle}>
              Open File
            </button>
          </div>

          {/* Recent Files Section */}
          <div
            style={{
              textAlign: 'left',
              marginBottom: 24,
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg, 12px)',
              background: 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--font-size-sm, 12px)',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Recent Files
              </span>
              {recentFiles.length > 0 && (
                <button
                  onClick={handleClearRecent}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm, 12px)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    fontFamily: 'var(--font-body)',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  Clear Recent
                </button>
              )}
            </div>

            {recentFiles.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--font-size-sm, 12px)',
                }}
              >
                No recent files
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {recentFiles.map((entry) => (
                  <RecentFileItem key={entry.path} entry={entry} onClick={() => handleOpenRecent(entry)} />
                ))}
              </div>
            )}
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '40px 24px',
              color: dragging ? 'var(--accent)' : 'var(--text-tertiary)',
              transition: 'border-color 0.15s, color 0.15s',
              background: dragging ? 'rgba(var(--accent-rgb, 59,130,246), 0.05)' : 'transparent',
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>Drop a file here to open</p>
            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>.xd, .svg, .png, .jpg, .gif, .webp</p>
          </div>
        </div>
      </div>

      {showNewDoc && (
        <NewDocumentModal
          onClose={() => setShowNewDoc(false)}
          onCreate={(settings) => {
            useEditorStore.getState().newDocument(settings)
            onReady()
          }}
        />
      )}
    </>
  )
}

// ── Recent file list item ──

function RecentFileItem({ entry, onClick }: { entry: RecentFileEntry; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)

  // Extract filename from path
  const fileName = entry.name || entry.path.split(/[/\\]/).pop() || 'Untitled'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        cursor: 'pointer',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 'var(--font-size-base, 13px)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {fileName}
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-sm, 11px)',
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 2,
          }}
        >
          {entry.path}
        </div>
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-sm, 11px)',
          color: 'var(--text-tertiary)',
          marginLeft: 12,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(entry.lastOpened)}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  transition: 'background 0.15s',
}
