import { useState, useCallback } from 'react'
import { openFile, openFileAsDocument } from '@/io/open-file'
import { NewDocumentModal } from '@/ui/new-document-modal'
import { useEditorStore } from '@/store/editor.store'

export function SplashScreen({ onReady }: { onReady: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [showNewDoc, setShowNewDoc] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await openFileAsDocument(file)
  }, [])

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'var(--bg-base)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              margin: '0 0 8px',
              letterSpacing: '-0.5px',
            }}
          >
            Crossdraw
          </h1>
          <p
            style={{
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-secondary)',
              margin: '0 0 32px',
            }}
          >
            Vector &amp; raster design editor
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 32 }}>
            <button onClick={() => setShowNewDoc(true)} style={btnStyle}>
              New Document
            </button>
            <button onClick={() => openFile()} style={btnStyle}>
              Open File
            </button>
          </div>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '40px 24px',
              color: dragging ? 'var(--accent)' : 'var(--text-tertiary)',
              transition: 'border-color 0.15s, color 0.15s',
              background: dragging ? 'rgba(var(--accent-rgb, 59,130,246), 0.05)' : 'transparent',
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--font-size-base)' }}>Drop a file here to open</p>
            <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>.xd, .svg, .png, .jpg, .gif, .webp</p>
          </div>
        </div>
      </div>

      {showNewDoc && (
        <NewDocumentModal
          onClose={() => setShowNewDoc(false)}
          onCreate={(settings) => {
            useEditorStore.getState().newDocument(settings)
            onReady()
          }}
        />
      )}
    </>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: 14,
  fontWeight: 600,
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-body)',
  transition: 'background 0.15s',
}
