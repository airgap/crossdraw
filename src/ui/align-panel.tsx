import { useEditorStore } from '@/store/editor.store'
import {
  alignLeft,
  alignCenterH,
  alignRight,
  alignTop,
  alignMiddleV,
  alignBottom,
  distributeH,
  distributeV,
  distributeSpacingH,
  distributeSpacingV,
} from '@/tools/align'
import { useState } from 'react'

const iconSize = 16

function AlignIcon({ d }: { d: string }) {
  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  )
}

const alignIcons = {
  left: 'M2 2v12 M5 4h7v3H5z M5 9h5v3H5z',
  centerH: 'M8 2v12 M4 4h8v3H4z M5 9h6v3H5z',
  right: 'M14 2v12 M4 4h7v3H4z M6 9h5v3H6z',
  top: 'M2 2h12 M4 5v7h3V5z M9 5v5h3V5z',
  middleV: 'M2 8h12 M4 4v8h3V4z M9 5v6h3V5z',
  bottom: 'M2 14h12 M4 4v7h3V4z M9 6v5h3V6z',
}

const distIcons = {
  h: 'M2 2v12 M14 2v12 M6 5h4v6H6z',
  v: 'M2 2h12 M2 14h12 M5 6v4h6V6z',
  spacingH: 'M1 4v8 M5 5v6h2V5z M9 5v6h2V5z M15 4v8',
  spacingV: 'M4 1h8 M5 5h6v2H5z M5 9h6v2H5z M4 15h8',
}

export function AlignPanel() {
  const selCount = useEditorStore((s) => s.selection.layerIds.length)
  const [toArtboard, setToArtboard] = useState(false)

  const alignDisabled = toArtboard ? selCount < 1 : selCount < 2
  const distDisabled = selCount < 3

  const btnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    border: 'none',
    borderRadius: 'var(--radius-sm, 4px)',
    cursor: disabled ? 'default' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
    background: 'transparent',
    opacity: disabled ? 0.4 : 1,
  })

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Align mode toggle */}
      <div style={{ display: 'flex', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
        <button
          onClick={() => setToArtboard(false)}
          style={{
            flex: 1,
            padding: '4px 0',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer',
            fontSize: 11,
            background: !toArtboard ? 'var(--accent)' : 'transparent',
            color: !toArtboard ? '#fff' : 'var(--text-secondary)',
          }}
        >
          Selection
        </button>
        <button
          onClick={() => setToArtboard(true)}
          style={{
            flex: 1,
            padding: '4px 0',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            cursor: 'pointer',
            fontSize: 11,
            background: toArtboard ? 'var(--accent)' : 'transparent',
            color: toArtboard ? '#fff' : 'var(--text-secondary)',
          }}
        >
          Artboard
        </button>
      </div>

      {/* Align */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Align
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            disabled={alignDisabled}
            onClick={() => alignLeft(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Left"
          >
            <AlignIcon d={alignIcons.left} />
          </button>
          <button
            disabled={alignDisabled}
            onClick={() => alignCenterH(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Center"
          >
            <AlignIcon d={alignIcons.centerH} />
          </button>
          <button
            disabled={alignDisabled}
            onClick={() => alignRight(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Right"
          >
            <AlignIcon d={alignIcons.right} />
          </button>
          <button
            disabled={alignDisabled}
            onClick={() => alignTop(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Top"
          >
            <AlignIcon d={alignIcons.top} />
          </button>
          <button
            disabled={alignDisabled}
            onClick={() => alignMiddleV(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Middle"
          >
            <AlignIcon d={alignIcons.middleV} />
          </button>
          <button
            disabled={alignDisabled}
            onClick={() => alignBottom(toArtboard)}
            style={btnStyle(alignDisabled)}
            title="Align Bottom"
          >
            <AlignIcon d={alignIcons.bottom} />
          </button>
        </div>
      </div>

      {/* Distribute */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Distribute
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            disabled={distDisabled}
            onClick={() => distributeH()}
            style={btnStyle(distDisabled)}
            title="Distribute Horizontally"
          >
            <AlignIcon d={distIcons.h} />
          </button>
          <button
            disabled={distDisabled}
            onClick={() => distributeV()}
            style={btnStyle(distDisabled)}
            title="Distribute Vertically"
          >
            <AlignIcon d={distIcons.v} />
          </button>
          <button
            disabled={distDisabled}
            onClick={() => distributeSpacingH()}
            style={btnStyle(distDisabled)}
            title="Distribute Spacing H"
          >
            <AlignIcon d={distIcons.spacingH} />
          </button>
          <button
            disabled={distDisabled}
            onClick={() => distributeSpacingV()}
            style={btnStyle(distDisabled)}
            title="Distribute Spacing V"
          >
            <AlignIcon d={distIcons.spacingV} />
          </button>
        </div>
      </div>
    </div>
  )
}
