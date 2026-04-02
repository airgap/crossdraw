import { useState, useCallback } from 'react'
import {
  login as oauthLogin,
  requestLoginEmail,
  attemptOtp,
  requestRegistrationEmail,
  submitRegistrationOtp,
} from '@/auth/auth'

type Mode = 'signin' | 'register'
type Step = 'email' | 'otp'

export function LoginPage({ onSkip }: { onSkip: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      const t = mode === 'signin' ? await requestLoginEmail(email.trim()) : await requestRegistrationEmail(email.trim())
      setToken(t)
      setStep('otp')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code')
    } finally {
      setLoading(false)
    }
  }, [email, mode])

  const handleVerify = useCallback(async () => {
    if (!code.trim()) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'signin') {
        await attemptOtp(email.trim(), code.trim(), token)
      } else {
        if (!username.trim()) {
          setError('Username is required')
          setLoading(false)
          return
        }
        await submitRegistrationOtp(email.trim(), code.trim(), username.trim(), token)
      }
      // Auth state updated — the App will detect the session change
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }, [code, email, token, mode, username])

  const handleOAuth = useCallback(() => {
    oauthLogin()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (step === 'email') handleSendCode()
        else handleVerify()
      }
    },
    [step, handleSendCode, handleVerify],
  )

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'signin' ? 'register' : 'signin'))
    setStep('email')
    setCode('')
    setToken('')
    setError('')
  }, [])

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Crossdraw</h1>
        <p style={subtitleStyle}>A free online drawing tool</p>

        {/* Skip — use without account */}
        <button onClick={onSkip} style={primaryBtnStyle}>
          Start drawing
        </button>

        {/* Divider */}
        <div style={dividerStyle}>
          <div style={dividerLineStyle} />
          <span style={dividerTextStyle}>or sign in</span>
          <div style={dividerLineStyle} />
        </div>

        {/* OAuth button */}
        <button onClick={handleOAuth} style={oauthBtnStyle}>
          Continue with Lyku
        </button>

        {/* Email step */}
        {step === 'email' && (
          <>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@example.com"
              style={inputStyle}
              autoFocus
            />
            {mode === 'register' && (
              <>
                <label style={{ ...labelStyle, marginTop: 10 }}>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Choose a username"
                  style={inputStyle}
                />
              </>
            )}
            <button onClick={handleSendCode} disabled={loading || !email.trim()} style={primaryBtnStyle}>
              {loading ? 'Sending...' : 'Send code'}
            </button>
          </>
        )}

        {/* OTP step */}
        {step === 'otp' && (
          <>
            <p style={hintStyle}>
              A 7-digit code was sent to <strong>{email}</strong>
            </p>
            <label style={labelStyle}>Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 7))}
              onKeyDown={handleKeyDown}
              placeholder="1234567"
              style={{ ...inputStyle, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
              autoFocus
              inputMode="numeric"
            />
            <button onClick={handleVerify} disabled={loading || code.length < 7} style={primaryBtnStyle}>
              {loading ? 'Verifying...' : 'Verify'}
            </button>
            <button
              onClick={() => {
                setStep('email')
                setCode('')
                setError('')
              }}
              style={linkBtnStyle}
            >
              Use a different email
            </button>
          </>
        )}

        {/* Error message */}
        {error && <p style={errorStyle}>{error}</p>}

        {/* Toggle sign in / register */}
        <div style={footerStyle}>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button onClick={toggleMode} style={linkBtnStyle}>
            {mode === 'signin' ? 'Create account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ──

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  background: 'var(--bg-base)',
  fontFamily: 'var(--font-body)',
}

const cardStyle: React.CSSProperties = {
  width: 360,
  padding: '40px 32px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-lg, 12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
}

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: '0 0 4px',
  textAlign: 'center',
  color: 'var(--text-primary)',
  letterSpacing: '-0.5px',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  margin: '0 0 24px',
  textAlign: 'center',
}

const oauthBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md, 6px)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
}

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '20px 0',
}

const dividerLineStyle: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: 'var(--border-subtle)',
}

const dividerTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: 1,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-sm, 4px)',
  background: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  fontSize: 13,
  fontWeight: 600,
  border: 'none',
  borderRadius: 'var(--radius-md, 6px)',
  background: 'var(--accent, #3b82f6)',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  marginTop: 12,
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--accent, #3b82f6)',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-body)',
  padding: 0,
  marginTop: 8,
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
  lineHeight: 1.5,
}

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#ef4444',
  margin: '10px 0 0',
  textAlign: 'center',
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 20,
  paddingTop: 16,
  borderTop: '1px solid var(--border-subtle)',
}
