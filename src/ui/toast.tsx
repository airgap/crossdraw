import { useEffect, useRef } from 'react'
import { create } from 'zustand'

// ── Types ──

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  severity: ToastSeverity
  duration: number
  exiting: boolean
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, severity?: ToastSeverity, duration?: number) => void
  dismissToast: (id: number) => void
  markExiting: (id: number) => void
}

const MAX_TOASTS = 5
const EXIT_MS = 300

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message, severity = 'info', duration?: number) => {
    const dur = duration ?? (severity === 'error' ? 6000 : 4000)
    const toast: Toast = { id: nextId++, message, severity, duration: dur, exiting: false }
    set((s) => {
      let list = [...s.toasts, toast]
      // Evict oldest if over max
      while (list.length > MAX_TOASTS) {
        list = list.slice(1)
      }
      return { toasts: list }
    })
  },
  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
  markExiting: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    }))
  },
}))

/** Convenience function — importable anywhere without React. */
export function addToast(message: string, severity?: ToastSeverity, duration?: number) {
  useToastStore.getState().addToast(message, severity, duration)
}

// ── Icons (inline SVG paths, 16x16) ──

const icons: Record<ToastSeverity, string> = {
  success: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.36 5.36-4 4a.5.5 0 0 1-.72 0l-2-2a.5.5 0 1 1 .72-.72L7 9.29l3.64-3.65a.5.5 0 1 1 .72.72Z',
  error: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm2.85 9.15a.5.5 0 0 1-.7.7L8 8.71l-2.15 2.14a.5.5 0 0 1-.7-.7L7.29 8 5.15 5.85a.5.5 0 1 1 .7-.7L8 7.29l2.15-2.14a.5.5 0 1 1 .7.7L8.71 8l2.14 2.15Z',
  warning: 'M8.94 2.45l5.53 9.6A1.09 1.09 0 0 1 13.53 14H2.47a1.09 1.09 0 0 1-.94-1.95l5.53-9.6a1.09 1.09 0 0 1 1.88 0ZM8 6a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 6Zm0 5.5a.62.62 0 1 0 0 1.24.62.62 0 0 0 0-1.24Z',
  info: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm.5 10.5a.5.5 0 0 1-1 0v-4a.5.5 0 0 1 1 0v4ZM8 5.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z',
}

const severityColor: Record<ToastSeverity, string> = {
  success: 'var(--success)',
  error: 'var(--error)',
  warning: 'var(--warning)',
  info: 'var(--info)',
}

// ── Single toast item ──

function ToastItem({ toast }: { toast: Toast }) {
  const { dismissToast, markExiting } = useToastStore()
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      markExiting(toast.id)
      setTimeout(() => dismissToast(toast.id), EXIT_MS)
    }, toast.duration)
    return () => clearTimeout(timerRef.current)
  }, [toast.id, toast.duration]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    clearTimeout(timerRef.current)
    markExiting(toast.id)
    setTimeout(() => dismissToast(toast.id), EXIT_MS)
  }

  const color = severityColor[toast.severity]

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--font-size-base)',
        color: 'var(--text-primary)',
        maxWidth: 360,
        minWidth: 240,
        pointerEvents: 'auto',
        animation: toast.exiting
          ? `toast-out ${EXIT_MS}ms ease-in forwards`
          : `toast-in ${EXIT_MS}ms ease-out`,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill={color}
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <path d={icons[toast.severity]} />
      </svg>
      <span style={{ flex: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>{toast.message}</span>
      <button
        onClick={handleClose}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

// ── Container ──

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(100%); }
        }
      `}</style>
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 'var(--space-4)',
          right: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          zIndex: 99999,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </>
  )
}
