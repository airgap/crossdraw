import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { encodeDocument } from '@/io/file-format'
import { getCloudConfig } from '@/cloud/cloud-client'
import {
  createShareWithName,
  deleteShare,
  listShares,
  getShareUrl,
  type ShareEntry,
  type CreateShareOptions,
} from '@/cloud/share-client'

interface Props {
  onClose: () => void
}

export function ShareDialog({ onClose }: Props) {
  const [shares, setShares] = useState<ShareEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Options for new share
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [useExpiry, setUseExpiry] = useState(false)
  const [expiryDate, setExpiryDate] = useState('')

  const config = getCloudConfig()
  const hasServer = config.serverUrl.length > 0

  const refreshShares = useCallback(async () => {
    if (!hasServer) return
    try {
      const entries = await listShares()
      setShares(entries)
    } catch {
      // Silently ignore — server may be unavailable
    }
  }, [hasServer])

  useEffect(() => {
    refreshShares()
  }, [refreshShares])

  const handleCreateShare = async () => {
    setLoading(true)
    setError(null)
    try {
      const doc = useEditorStore.getState().document
      const encoded = encodeDocument(doc)
      const name = doc.metadata.title || 'Untitled'

      const options: CreateShareOptions = {}
      if (usePassword && password) {
        options.password = password
      }
      if (useExpiry && expiryDate) {
        options.expiresAt = new Date(expiryDate).toISOString()
      }

      const result = await createShareWithName(encoded, name, options)
      const shareUrl = getShareUrl(result.slug)

      // Copy to clipboard
      await navigator.clipboard.writeText(shareUrl)
      setCopied(result.slug)
      setTimeout(() => setCopied(null), 2000)

      // Refresh list
      await refreshShares()

      // Reset options
      setPassword('')
      setUsePassword(false)
      setUseExpiry(false)
      setExpiryDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteShare = async (slug: string) => {
    try {
      await deleteShare(slug)
      setShares((prev) => prev.filter((s) => s.slug !== slug))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete share')
    }
  }

  const handleCopyLink = async (slug: string) => {
    const shareUrl = getShareUrl(slug)
    await navigator.clipboard.writeText(shareUrl)
    setCopied(slug)
    setTimeout(() => setCopied(null), 2000)
  }

  const formatDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Share Prototype</h2>
          <button onClick={onClose} style={closeButtonStyle} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Server check */}
        {!hasServer && (
          <div style={warningStyle}>
            No cloud server configured. Set a server URL in the Cloud settings to share prototypes.
          </div>
        )}

        {/* Error */}
        {error && <div style={errorStyle}>{error}</div>}

        {/* Create new share */}
        {hasServer && (
          <div style={sectionStyle}>
            <div style={{ marginBottom: 12 }}>
              {/* Password option */}
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                  style={checkboxStyle}
                />
                Password protect
              </label>
              {usePassword && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={inputStyle}
                />
              )}

              {/* Expiry option */}
              <label style={{ ...checkboxLabelStyle, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={useExpiry}
                  onChange={(e) => setUseExpiry(e.target.checked)}
                  style={checkboxStyle}
                />
                Set expiration date
              </label>
              {useExpiry && (
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                  style={inputStyle}
                />
              )}
            </div>

            <button
              onClick={handleCreateShare}
              disabled={loading || (usePassword && !password) || (useExpiry && !expiryDate)}
              style={{
                ...primaryButtonStyle,
                opacity: loading || (usePassword && !password) || (useExpiry && !expiryDate) ? 0.5 : 1,
              }}
            >
              {loading ? 'Generating...' : 'Generate Share Link'}
            </button>
          </div>
        )}

        {/* Existing shares */}
        {shares.length > 0 && (
          <div style={{ ...sectionStyle, borderTop: '1px solid #2a2a2a', marginTop: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#999', marginBottom: 8 }}>Active Share Links</h3>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {shares.map((share) => (
                <div key={share.slug} style={shareRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#ddd', marginBottom: 2 }}>{share.name}</div>
                    <div style={{ fontSize: 11, color: '#777' }}>
                      {share.viewCount} view{share.viewCount !== 1 ? 's' : ''}
                      {' \u00b7 '}
                      {formatDate(share.createdAt)}
                      {share.hasPassword && ' \u00b7 Password'}
                      {share.expiresAt && ` \u00b7 Expires ${formatDate(share.expiresAt)}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => handleCopyLink(share.slug)} style={iconButtonStyle} title="Copy link">
                      {copied === share.slug ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                    <button onClick={() => handleDeleteShare(share.slug)} style={iconButtonStyle} title="Delete share">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 20000,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const dialogStyle: React.CSSProperties = {
  background: '#161616',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  width: 420,
  maxHeight: '80vh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #2a2a2a',
}

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
}

const sectionStyle: React.CSSProperties = {
  padding: '16px 20px',
}

const warningStyle: React.CSSProperties = {
  padding: '12px 20px',
  background: '#1c1c0a',
  borderBottom: '1px solid #2a2a1a',
  color: '#d4a017',
  fontSize: 13,
}

const errorStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#1c0a0a',
  color: '#ef4444',
  fontSize: 13,
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  color: '#ccc',
  cursor: 'pointer',
}

const checkboxStyle: React.CSSProperties = {
  accentColor: '#2563eb',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #333',
  borderRadius: 6,
  background: '#111',
  color: '#fff',
  fontSize: 13,
  marginTop: 6,
  outline: 'none',
}

const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const shareRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 0',
  borderBottom: '1px solid #222',
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #333',
  borderRadius: 4,
  color: '#aaa',
  padding: '4px 6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}
