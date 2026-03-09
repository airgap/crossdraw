import { useEditorStore } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import { useState } from 'react'
import type { ExportSlice, Artboard } from '@/types'
import { exportArtboardToBlob, downloadBlob } from '@/io/raster-export'
import { exportArtboardToSVG, downloadSVG } from '@/io/svg-export'

const FORMAT_OPTIONS: ExportSlice['format'][] = ['png', 'jpeg', 'svg']
const SCALE_OPTIONS = [1, 2, 3, 4]

function createSliceFromArtboard(artboard: Artboard): ExportSlice {
  return {
    id: uuid(),
    name: artboard.name,
    x: 0,
    y: 0,
    width: artboard.width,
    height: artboard.height,
    format: 'png',
    scale: 1,
  }
}

async function exportSlice(slice: ExportSlice, artboardId: string) {
  const doc = useEditorStore.getState().document
  if (slice.format === 'svg') {
    const svgString = exportArtboardToSVG(doc, artboardId)
    const safeName = slice.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    downloadSVG(svgString, `${safeName}.svg`)
  } else {
    const blob = await exportArtboardToBlob(
      doc,
      {
        format: slice.format,
        scale: slice.scale,
      },
      artboardId,
    )
    const ext = slice.format === 'jpeg' ? 'jpg' : 'png'
    const safeName = slice.name.replace(/[^a-zA-Z0-9_-]/g, '_')
    const scaleSuffix = slice.scale > 1 ? `@${slice.scale}x` : ''
    downloadBlob(blob, `${safeName}${scaleSuffix}.${ext}`)
  }
}

async function exportAllSlices(artboards: Artboard[]) {
  for (const artboard of artboards) {
    const slices = artboard.slices ?? []
    for (const slice of slices) {
      await exportSlice(slice, artboard.id)
    }
  }
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const selectStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 4px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm, 4px)',
  background: 'var(--bg-secondary, #222)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  outline: 'none',
}

const smallBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm, 4px)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
}

const accentBtnStyle: React.CSSProperties = {
  ...smallBtnStyle,
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
}

function SliceRow({
  slice,
  artboardId,
  artboardName,
}: {
  slice: ExportSlice
  artboardId: string
  artboardName: string
}) {
  const updateSlice = useEditorStore((s) => s.updateSlice)
  const removeSlice = useEditorStore((s) => s.removeSlice)
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(slice.name)
  const [exporting, setExporting] = useState(false)

  const commitRename = () => {
    setEditing(false)
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== slice.name) {
      updateSlice(artboardId, slice.id, { name: trimmed })
    } else {
      setNameVal(slice.name)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportSlice(slice, artboardId)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      style={{
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm, 4px)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Row 1: name + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {editing ? (
          <input
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setNameVal(slice.name)
                setEditing(false)
              }
            }}
            autoFocus
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              padding: '1px 4px',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--bg-secondary, #222)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'text',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {slice.name}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>{artboardName}</span>
        <button
          onClick={() => removeSlice(artboardId, slice.id)}
          title="Delete slice"
          style={{
            ...smallBtnStyle,
            padding: '1px 5px',
            fontSize: 13,
            color: 'var(--text-tertiary)',
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Row 2: dims, format, scale, export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>
          {slice.width}&times;{slice.height}
        </span>

        <select
          value={slice.format}
          onChange={(e) =>
            updateSlice(artboardId, slice.id, {
              format: e.target.value as ExportSlice['format'],
            })
          }
          style={selectStyle}
        >
          {FORMAT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>

        <select
          value={slice.scale}
          onChange={(e) =>
            updateSlice(artboardId, slice.id, {
              scale: Number(e.target.value),
            })
          }
          style={selectStyle}
          disabled={slice.format === 'svg'}
          title={slice.format === 'svg' ? 'Scale not applicable to SVG' : undefined}
        >
          {SCALE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>

        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ ...accentBtnStyle, marginLeft: 'auto', opacity: exporting ? 0.6 : 1 }}
        >
          {exporting ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </div>
  )
}

export function BatchExportPanel() {
  const artboards = useEditorStore((s) => s.document.artboards)
  const addSlice = useEditorStore((s) => s.addSlice)
  const [exportingAll, setExportingAll] = useState(false)

  // Gather all slices across all artboards
  const allSlices: { slice: ExportSlice; artboardId: string; artboardName: string }[] = []
  for (const ab of artboards) {
    for (const slice of ab.slices ?? []) {
      allSlices.push({ slice, artboardId: ab.id, artboardName: ab.name })
    }
  }

  const handleExportAll = async () => {
    if (allSlices.length === 0) return
    setExportingAll(true)
    try {
      await exportAllSlices(artboards)
    } finally {
      setExportingAll(false)
    }
  }

  const handleAddSlice = (artboard: Artboard) => {
    addSlice(artboard.id, createSliceFromArtboard(artboard))
  }

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Export All */}
      <button
        onClick={handleExportAll}
        disabled={allSlices.length === 0 || exportingAll}
        style={{
          ...accentBtnStyle,
          width: '100%',
          padding: '6px 0',
          fontSize: 12,
          fontWeight: 600,
          opacity: allSlices.length === 0 || exportingAll ? 0.5 : 1,
          cursor: allSlices.length === 0 || exportingAll ? 'default' : 'pointer',
        }}
      >
        {exportingAll ? 'Exporting...' : `Export All (${allSlices.length})`}
      </button>

      {/* Slice list */}
      {allSlices.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>
          No export slices. Add a slice from an artboard below.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {allSlices.map(({ slice, artboardId, artboardName }) => (
          <SliceRow key={slice.id} slice={slice} artboardId={artboardId} artboardName={artboardName} />
        ))}
      </div>

      {/* Add Slice section — one button per artboard */}
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Add Slice</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {artboards.map((ab) => (
            <button
              key={ab.id}
              onClick={() => handleAddSlice(ab)}
              style={{
                ...smallBtnStyle,
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 13 }}>+</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ab.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {ab.width}&times;{ab.height}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
