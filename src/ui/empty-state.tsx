import type { CSSProperties } from 'react'

interface EmptyStateProps {
  /** Primary message displayed in the center */
  message: string
  /** Optional hint or subtitle shown below the message */
  hint?: string
  /** Optional custom styles for the container */
  style?: CSSProperties
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  textAlign: 'center',
  gap: 6,
}

const messageStyle: CSSProperties = {
  fontSize: 'var(--font-size-sm, 12px)',
  color: 'var(--text-secondary)',
  fontWeight: 500,
}

const hintStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs, 10px)',
  color: 'var(--text-tertiary, #666)',
  lineHeight: 1.4,
  maxWidth: 200,
}

export function EmptyState({ message, hint, style }: EmptyStateProps) {
  return (
    <div style={{ ...containerStyle, ...style }}>
      <span style={messageStyle}>{message}</span>
      {hint && <span style={hintStyle}>{hint}</span>}
    </div>
  )
}
