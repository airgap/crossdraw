import { useState, useEffect, useRef } from 'react'
import { getCurrentUser, login, logout, type AuthUser } from '@/auth/auth'

export function UserProfile() {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setUser(getCurrentUser())
    window.addEventListener('crossdraw:auth-changed', handler)
    return () => window.removeEventListener('crossdraw:auth-changed', handler)
  }, [])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  if (!user) {
    return (
      <button
        onClick={() => login()}
        style={{
          height: 24,
          padding: '0 10px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          fontSize: 11,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Sign in
      </button>
    )
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 8px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {user.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.displayName}
        </span>
      </button>

      {showMenu && (
        <div
          style={{
            position: 'absolute',
            top: 30,
            right: 0,
            width: 200,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 9999,
            overflow: 'hidden',
          }}
        >
          {/* User info */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                marginBottom: 2,
              }}
            >
              {user.displayName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{user.email}</div>
          </div>

          {/* Menu items */}
          <MenuItem
            label="Sign out"
            onClick={() => {
              logout()
              setShowMenu(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 12px',
        background: 'none',
        border: 'none',
        color: 'var(--text-primary)',
        fontSize: 11,
        textAlign: 'left',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'none'
      }}
    >
      {label}
    </button>
  )
}
