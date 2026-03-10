import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import type { ConnectionState } from '@/collab/collab-provider'

/** Generate a short random room ID. */
function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

const STATUS_LABELS: Record<ConnectionState, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
}

const STATUS_COLORS: Record<ConnectionState, string> = {
  disconnected: 'var(--text-secondary)',
  connecting: '#f39c12',
  connected: '#2ecc71',
  reconnecting: '#f39c12',
}

export function CollabPanel() {
  const collabProvider = useEditorStore((s) => s.collabProvider)
  const collabPresences = useEditorStore((s) => s.collabPresences)
  const startCollabSession = useEditorStore((s) => s.startCollabSession)
  const leaveCollabSession = useEditorStore((s) => s.leaveCollabSession)

  const [roomId, setRoomId] = useState(() => generateRoomId())
  const [serverUrl, setServerUrl] = useState('ws://localhost:4000')
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [copied, setCopied] = useState(false)

  // Subscribe to connection state changes
  useEffect(() => {
    if (!collabProvider) {
      setConnectionState('disconnected')
      return
    }
    setConnectionState(collabProvider.state)
    const unsub = collabProvider.onStateChange((state) => {
      setConnectionState(state)
    })
    return unsub
  }, [collabProvider])

  const handleStart = useCallback(() => {
    startCollabSession(roomId, serverUrl)
  }, [roomId, serverUrl, startCollabSession])

  const handleJoin = useCallback(() => {
    startCollabSession(roomId, serverUrl)
  }, [roomId, serverUrl, startCollabSession])

  const handleLeave = useCallback(() => {
    leaveCollabSession()
  }, [leaveCollabSession])

  const handleCopyInvite = useCallback(() => {
    const link = `${window.location.origin}${window.location.pathname}?collab=${encodeURIComponent(roomId)}&server=${encodeURIComponent(serverUrl)}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [roomId, serverUrl])

  const isActive = collabProvider !== null

  return (
    <div style={{ padding: 'var(--space-3)', fontSize: 'var(--font-size-base)' }}>
      {/* Connection Status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 'var(--space-3)',
          padding: '8px 10px',
          background: 'var(--bg-inset)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: STATUS_COLORS[connectionState],
            flexShrink: 0,
          }}
        />
        <span style={{ color: 'var(--text-primary)' }}>{STATUS_LABELS[connectionState]}</span>
      </div>

      {/* Session Configuration */}
      {!isActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Room ID</label>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="Enter room ID"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 8px',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-base)',
              outline: 'none',
            }}
          />

          <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
            Server URL
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="ws://localhost:4000"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '6px 8px',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-base)',
              outline: 'none',
            }}
          />

          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button
              onClick={handleStart}
              disabled={!roomId.trim() || !serverUrl.trim()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-base)',
                opacity: !roomId.trim() || !serverUrl.trim() ? 0.5 : 1,
              }}
            >
              Start Session
            </button>
            <button
              onClick={handleJoin}
              disabled={!roomId.trim() || !serverUrl.trim()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-base)',
                opacity: !roomId.trim() || !serverUrl.trim() ? 0.5 : 1,
              }}
            >
              Join Session
            </button>
          </div>
        </div>
      )}

      {/* Active Session */}
      {isActive && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {/* Room info */}
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>Room</div>
              <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{collabProvider.roomId}</div>
            </div>
          </div>

          {/* Connected Users */}
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 6 }}>
              Connected Users ({collabPresences.length + 1})
            </div>

            {/* Self */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 0',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: collabProvider ? '#2ecc71' : 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: 'var(--text-primary)' }}>You</span>
            </div>

            {/* Remote users */}
            {collabPresences.map((p) => (
              <div
                key={p.clientId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: p.color,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                {p.selectedLayerIds.length > 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    ({p.selectedLayerIds.length} selected)
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button
              onClick={handleCopyInvite}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-base)',
              }}
            >
              {copied ? 'Copied!' : 'Copy Invite Link'}
            </button>
          </div>

          <button
            onClick={handleLeave}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              color: '#e74c3c',
              border: '1px solid #e74c3c',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              marginTop: 'var(--space-1)',
            }}
          >
            Leave Session
          </button>
        </div>
      )}
    </div>
  )
}
