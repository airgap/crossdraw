import { useState, useEffect } from 'react'

const STORAGE_KEY = 'crossdraw:onboarding-complete'

interface OnboardingStep {
  title: string
  description: string
}

const steps: OnboardingStep[] = [
  {
    title: 'Toolbar',
    description:
      'The toolbar on the left has tools for drawing, selecting, and editing. Hover over each icon to see its name and keyboard shortcut.',
  },
  {
    title: 'Canvas',
    description:
      'The center area is your workspace. Scroll to pan, pinch or Ctrl+scroll to zoom, and drag with the Hand tool (H) to navigate.',
  },
  {
    title: 'Layers Panel',
    description:
      'The Layers panel on the right lets you manage and organize your layers. Drag to reorder, toggle visibility, and group layers together.',
  },
  {
    title: 'Properties',
    description:
      'When you select an object, the Properties panel shows its fill, stroke, dimensions, and other attributes you can adjust.',
  },
  {
    title: 'Menu Bar',
    description:
      'The menu bar at the top gives you access to file operations, export options, filters, and more. Check Help > Keyboard Shortcuts to learn the key bindings.',
  },
]

export function isOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

function markOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // ignore
  }
}

export function Onboarding() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!isOnboardingComplete()) {
      setVisible(true)
    }
    const handler = () => {
      setStep(0)
      setVisible(true)
    }
    window.addEventListener('crossdraw:show-onboarding', handler)
    return () => window.removeEventListener('crossdraw:show-onboarding', handler)
  }, [])

  if (!visible) return null

  const current = steps[step]!
  const isLast = step === steps.length - 1

  const close = () => {
    markOnboardingComplete()
    setVisible(false)
  }

  const next = () => {
    if (isLast) {
      close()
    } else {
      setStep(step + 1)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '32px',
          maxWidth: 440,
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 20,
            justifyContent: 'center',
          }}
        >
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i === step ? 'var(--accent)' : 'var(--border-subtle)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Title */}
        <h2
          style={{
            margin: '0 0 8px 0',
            fontSize: '18px',
            fontWeight: 600,
          }}
        >
          {step + 1}. {current.title}
        </h2>

        {/* Description */}
        <p
          style={{
            margin: '0 0 24px 0',
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
          }}
        >
          {current.description}
        </p>

        {/* Buttons */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button
            onClick={close}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md, 6px)',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            Skip
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-md, 6px)',
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              style={{
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                padding: '6px 20px',
                borderRadius: 'var(--radius-md, 6px)',
              }}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
