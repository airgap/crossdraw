import { useState, useEffect, useCallback, useRef } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { encodeDocument } from '@/io/file-format'
import { decodeDocument } from '@/io/file-format'
import {
  getCloudConfig,
  setCloudConfig,
  listCloudFiles,
  uploadFile,
  downloadFile,
  updateFile,
  deleteFile,
  type CloudConfig,
  type CloudFileEntry,
} from '@/cloud/cloud-client'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  disconnected: 'Not configured',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Error',
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: 'var(--text-secondary)',
  connecting: '#f39c12',
  connected: '#2ecc71',
  error: '#e74c3c',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function CloudBrowserPanel() {
  const [config, setConfig] = useState<CloudConfig>(() => getCloudConfig())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [files, setFiles] = useState<CloudFileEntry[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoSave, setAutoSave] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [cloudFileId, setCloudFileId] = useState<string | null>(null)

  // Persist config changes
  const handleConfigChange = useCallback(
    (field: keyof CloudConfig, value: string) => {
      const updated = { ...config, [field]: value }
      setConfig(updated)
      setCloudConfig(updated)
    },
    [config],
  )

  // Refresh file list
  const refresh = useCallback(async () => {
    if (!config.serverUrl) {
      setStatus('disconnected')
      return
    }
    setLoading(true)
    setStatus('connecting')
    setErrorMsg('')
    try {
      const result = await listCloudFiles(config)
      setFiles(result)
      setStatus('connected')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [config])

  // Auto-refresh on config change
  useEffect(() => {
    if (config.serverUrl) {
      refresh()
    } else {
      setStatus('disconnected')
      setFiles([])
    }
  }, [config.serverUrl, config.apiKey, refresh])

  // Open a cloud file
  const handleOpen = useCallback(
    async (entry: CloudFileEntry) => {
      setLoading(true)
      try {
        const data = await downloadFile(entry.id, config)
        const doc = decodeDocument(data)
        useEditorStore.setState({
          document: doc,
          history: [],
          historyIndex: -1,
          selection: { layerIds: [] },
          isDirty: false,
          filePath: null,
        })
        setCloudFileId(entry.id)
      } catch (err) {
        alert(`Failed to open cloud file: ${err instanceof Error ? err.message : err}`)
      } finally {
        setLoading(false)
      }
    },
    [config],
  )

  // Save current document to cloud
  const handleSaveToCloud = useCallback(async () => {
    setLoading(true)
    try {
      const doc = useEditorStore.getState().document
      const buffer = encodeDocument(doc)
      const name = `${doc.metadata.title || 'Untitled'}.xd`

      if (cloudFileId) {
        const updated = await updateFile(cloudFileId, buffer, config)
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
      } else {
        const entry = await uploadFile(name, buffer, config)
        setCloudFileId(entry.id)
        setFiles((prev) => [...prev, entry])
      }
      useEditorStore.setState({ isDirty: false })
    } catch (err) {
      alert(`Failed to save to cloud: ${err instanceof Error ? err.message : err}`)
    } finally {
      setLoading(false)
    }
  }, [config, cloudFileId])

  // Delete a file
  const handleDelete = useCallback(
    async (id: string) => {
      setLoading(true)
      try {
        await deleteFile(id, config)
        setFiles((prev) => prev.filter((f) => f.id !== id))
        if (cloudFileId === id) {
          setCloudFileId(null)
        }
      } catch (err) {
        alert(`Failed to delete file: ${err instanceof Error ? err.message : err}`)
      } finally {
        setLoading(false)
        setConfirmDeleteId(null)
      }
    },
    [config, cloudFileId],
  )

  // Auto-save toggle
  useEffect(() => {
    if (autoSave && config.serverUrl) {
      autoSaveRef.current = setInterval(() => {
        const state = useEditorStore.getState()
        if (state.isDirty) {
          handleSaveToCloud()
        }
      }, 30_000)
    }
    return () => {
      if (autoSaveRef.current) {
        clearInterval(autoSaveRef.current)
        autoSaveRef.current = null
      }
    }
  }, [autoSave, config.serverUrl, handleSaveToCloud])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    background: 'var(--bg-input, #2a2a2a)',
    border: '1px solid var(--border-color, #444)',
    borderRadius: '4px',
    color: 'var(--text-primary, #eee)',
    fontSize: 'var(--font-size-sm, 12px)',
    boxSizing: 'border-box',
  }

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    background: 'var(--bg-button, #3a3a3a)',
    border: '1px solid var(--border-color, #555)',
    borderRadius: '4px',
    color: 'var(--text-primary, #eee)',
    cursor: 'pointer',
    fontSize: 'var(--font-size-sm, 12px)',
  }

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnStyle,
    background: 'var(--accent-color, #3b82f6)',
    border: '1px solid var(--accent-color, #3b82f6)',
    color: '#fff',
  }

  const btnDangerStyle: React.CSSProperties = {
    ...btnStyle,
    background: '#e74c3c',
    border: '1px solid #c0392b',
    color: '#fff',
  }

  return (
    <div style={{ padding: 'var(--space-3, 12px)', fontSize: 'var(--font-size-base, 13px)' }}>
      {/* Connection Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          padding: '6px 10px',
          background: 'var(--bg-surface, #1e1e1e)',
          borderRadius: '6px',
          border: '1px solid var(--border-color, #333)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: STATUS_COLORS[status],
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1, color: 'var(--text-secondary, #aaa)' }}>{STATUS_LABELS[status]}</span>
        <button style={btnStyle} onClick={refresh} disabled={loading || !config.serverUrl}>
          Refresh
        </button>
      </div>

      {/* Error message */}
      {errorMsg && (
        <div
          style={{
            marginBottom: '8px',
            padding: '6px 10px',
            background: 'rgba(231, 76, 60, 0.15)',
            borderRadius: '4px',
            color: '#e74c3c',
            fontSize: 'var(--font-size-sm, 12px)',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Settings (collapsible) */}
      <div style={{ marginBottom: '12px' }}>
        <button
          style={{
            ...btnStyle,
            width: '100%',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'space-between',
          }}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <span>Settings</span>
          <span>{settingsOpen ? '\u25B2' : '\u25BC'}</span>
        </button>
        {settingsOpen && (
          <div
            style={{
              marginTop: '8px',
              padding: '10px',
              background: 'var(--bg-surface, #1e1e1e)',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #333)',
            }}
          >
            <label style={{ display: 'block', marginBottom: '8px' }}>
              <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary, #aaa)' }}>
                Server URL
              </span>
              <input
                type="text"
                style={inputStyle}
                value={config.serverUrl}
                onChange={(e) => handleConfigChange('serverUrl', e.target.value)}
                placeholder="http://localhost:3000"
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary, #aaa)' }}>
                API Key
              </span>
              <input
                type="password"
                style={inputStyle}
                value={config.apiKey}
                onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                placeholder="Leave blank for dev mode"
              />
            </label>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          style={{ ...btnPrimaryStyle, flex: 1 }}
          onClick={handleSaveToCloud}
          disabled={loading || status !== 'connected'}
        >
          {cloudFileId ? 'Update in Cloud' : 'Save to Cloud'}
        </button>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            color: 'var(--text-secondary, #aaa)',
            fontSize: 'var(--font-size-sm, 12px)',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(e) => setAutoSave(e.target.checked)}
            disabled={status !== 'connected'}
          />
          Auto-save
        </label>
      </div>

      {/* File list */}
      <div>
        {files.length === 0 && status === 'connected' && (
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: 'var(--text-secondary, #888)',
            }}
          >
            No files in cloud storage
          </div>
        )}
        {files.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '8px 10px',
              marginBottom: '4px',
              background:
                cloudFileId === entry.id
                  ? 'var(--bg-selected, rgba(59, 130, 246, 0.15))'
                  : 'var(--bg-surface, #1e1e1e)',
              borderRadius: '6px',
              border: `1px solid ${cloudFileId === entry.id ? 'var(--accent-color, #3b82f6)' : 'var(--border-color, #333)'}`,
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: '4px', wordBreak: 'break-word' }}>{entry.name}</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: 'var(--text-secondary, #888)',
                fontSize: 'var(--font-size-sm, 11px)',
                marginBottom: '6px',
              }}
            >
              <span>{formatFileSize(entry.size)}</span>
              <span>{formatDate(entry.updatedAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={btnStyle} onClick={() => handleOpen(entry)} disabled={loading}>
                Open
              </button>
              {confirmDeleteId === entry.id ? (
                <>
                  <button style={btnDangerStyle} onClick={() => handleDelete(entry.id)} disabled={loading}>
                    Confirm
                  </button>
                  <button style={btnStyle} onClick={() => setConfirmDeleteId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button style={btnStyle} onClick={() => setConfirmDeleteId(entry.id)} disabled={loading}>
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
