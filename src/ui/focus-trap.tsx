import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function FocusTrap({ children, onEscape }: { children: ReactNode; onEscape?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement

    // Focus the first focusable element inside the trap
    const container = containerRef.current
    if (container) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      if (first) first.focus()
    }

    return () => {
      // Restore focus to the previously focused element on unmount
      const prev = previousFocusRef.current
      if (prev && prev instanceof HTMLElement) {
        prev.focus()
      }
    }
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.stopPropagation()
        onEscape()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [onEscape])

  return <div ref={containerRef}>{children}</div>
}
