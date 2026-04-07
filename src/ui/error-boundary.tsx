import { Component, type ReactNode } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { encodeDocument } from '@/io/file-format'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('Uncaught error in Crossdraw:', error, info.componentStack)
  }

  handleSaveRecovery = async () => {
    try {
      const doc = useEditorStore.getState().document
      const buffer = encodeDocument(doc)

      // Try Electron autosave first
      if (window.electronAPI) {
        const path = await window.electronAPI.autosaveWrite(buffer)
        alert(`Recovery file saved to: ${path}`)
      } else {
        // Browser fallback: download as file
        const blob = new Blob([buffer], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'recovery.crow'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      alert(`Failed to save recovery file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#1a1a1a',
            color: '#ddd',
            fontFamily: 'system-ui, sans-serif',
            padding: 40,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 24, marginBottom: 8, color: '#ff6b6b' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#aaa', marginBottom: 24, maxWidth: 500 }}>
            Crossdraw encountered an unexpected error. You can try to save a recovery file with your current work, then
            reload the application.
          </p>
          <pre
            style={{
              fontSize: 12,
              color: '#888',
              background: '#222',
              padding: 16,
              borderRadius: 6,
              maxWidth: 600,
              overflow: 'auto',
              marginBottom: 24,
              textAlign: 'left',
            }}
          >
            {this.state.error?.message}
            {'\n'}
            {this.state.error?.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleSaveRecovery}
              style={{
                background: '#4a7dff',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 24px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Save Recovery File
            </button>
            <button
              onClick={this.handleReload}
              style={{
                background: '#3a3a3a',
                color: '#ccc',
                border: '1px solid #555',
                borderRadius: 6,
                padding: '10px 24px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Try to Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
