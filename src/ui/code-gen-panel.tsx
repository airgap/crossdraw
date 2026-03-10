import { useState, useMemo, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { generateCSS, type CSSOptions } from '@/codegen/css-generator'
import { generateReact, type ReactOptions } from '@/codegen/react-generator'
import { generateSwiftUI } from '@/codegen/swift-generator'
import { generateFlutter } from '@/codegen/flutter-generator'
import type { Layer } from '@/types'

type Language = 'css' | 'react' | 'swiftui' | 'flutter'
type ReactStyling = 'inline' | 'tailwind' | 'styled-components'
type CSSUnit = 'px' | 'rem'

function findLayerRecursive(layers: Layer[], id: string): Layer | null {
  for (const l of layers) {
    if (l.id === id) return l
    if (l.type === 'group') {
      const child = findLayerRecursive(l.children, id)
      if (child) return child
    }
  }
  return null
}

const buttonStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '4px 0',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm, 4px)',
  cursor: 'pointer',
  fontSize: 11,
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
  transition: 'background 0.15s, color 0.15s',
})

const smallButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm, 4px)',
  cursor: 'pointer',
  fontSize: 10,
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? '#fff' : 'var(--text-secondary)',
  transition: 'background 0.15s, color 0.15s',
})

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-tertiary)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

export function CodeGenPanel() {
  const [language, setLanguage] = useState<Language>('css')
  const [reactStyling, setReactStyling] = useState<ReactStyling>('inline')
  const [cssUnits, setCSSUnits] = useState<CSSUnit>('px')
  const [includePosition, setIncludePosition] = useState(true)
  const [copied, setCopied] = useState(false)

  const selection = useEditorStore((s) => s.selection)
  const document = useEditorStore((s) => s.document)

  // Find all selected layers across all artboards
  const selectedLayers = useMemo(() => {
    const layers: Layer[] = []
    for (const artboard of document.artboards) {
      for (const layerId of selection.layerIds) {
        const found = findLayerRecursive(artboard.layers, layerId)
        if (found) layers.push(found)
      }
    }
    return layers
  }, [document, selection.layerIds])

  // Generate code for all selected layers
  const generatedCode = useMemo(() => {
    if (selectedLayers.length === 0) return ''

    return selectedLayers
      .map((layer) => {
        switch (language) {
          case 'css':
            return generateCSS(layer, {
              units: cssUnits,
              includePosition,
            } as CSSOptions)
          case 'react':
            return generateReact(layer, {
              styling: reactStyling,
            } as Partial<ReactOptions>)
          case 'swiftui':
            return generateSwiftUI(layer)
          case 'flutter':
            return generateFlutter(layer)
          default:
            return ''
        }
      })
      .join('\n\n')
  }, [selectedLayers, language, reactStyling, cssUnits, includePosition])

  const handleCopy = useCallback(async () => {
    if (!generatedCode) return
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = window.document.createElement('textarea')
      textarea.value = generatedCode
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      window.document.body.appendChild(textarea)
      textarea.select()
      window.document.execCommand('copy')
      window.document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [generatedCode])

  return (
    <div style={{ padding: 'var(--space-2, 8px)', display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      {/* Language selector */}
      <div>
        <div style={labelStyle}>Language</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setLanguage('css')} style={buttonStyle(language === 'css')}>
            CSS
          </button>
          <button onClick={() => setLanguage('react')} style={buttonStyle(language === 'react')}>
            React
          </button>
          <button onClick={() => setLanguage('swiftui')} style={buttonStyle(language === 'swiftui')}>
            SwiftUI
          </button>
          <button onClick={() => setLanguage('flutter')} style={buttonStyle(language === 'flutter')}>
            Flutter
          </button>
        </div>
      </div>

      {/* Language-specific options */}
      {language === 'react' && (
        <div>
          <div style={labelStyle}>Styling</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setReactStyling('inline')} style={smallButtonStyle(reactStyling === 'inline')}>
              Inline
            </button>
            <button onClick={() => setReactStyling('tailwind')} style={smallButtonStyle(reactStyling === 'tailwind')}>
              Tailwind
            </button>
            <button
              onClick={() => setReactStyling('styled-components')}
              style={smallButtonStyle(reactStyling === 'styled-components')}
            >
              Styled
            </button>
          </div>
        </div>
      )}

      {language === 'css' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div style={{ ...labelStyle, marginBottom: 0 }}>Units</div>
            <button onClick={() => setCSSUnits('px')} style={smallButtonStyle(cssUnits === 'px')}>
              px
            </button>
            <button onClick={() => setCSSUnits('rem')} style={smallButtonStyle(cssUnits === 'rem')}>
              rem
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label
              style={{
                ...labelStyle,
                marginBottom: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <input
                type="checkbox"
                checked={includePosition}
                onChange={(e) => setIncludePosition(e.target.checked)}
                style={{ margin: 0 }}
              />
              Position
            </label>
          </div>
        </div>
      )}

      {/* Code output */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <div style={labelStyle}>
            {selectedLayers.length === 0
              ? 'No Selection'
              : selectedLayers.length === 1
                ? selectedLayers[0]!.name
                : `${selectedLayers.length} layers`}
          </div>
          <button
            onClick={handleCopy}
            disabled={!generatedCode}
            style={{
              padding: '2px 10px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm, 4px)',
              cursor: generatedCode ? 'pointer' : 'default',
              fontSize: 10,
              background: copied ? 'var(--accent)' : 'transparent',
              color: copied ? '#fff' : generatedCode ? 'var(--text-secondary)' : 'var(--text-tertiary)',
              opacity: generatedCode ? 1 : 0.5,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre
          style={{
            flex: 1,
            margin: 0,
            padding: 'var(--space-2, 8px)',
            background: 'var(--bg-tertiary, #1a1a2e)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm, 4px)',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            minHeight: 80,
          }}
        >
          {generatedCode || (selectedLayers.length === 0 ? 'Select a layer to generate code.' : '')}
        </pre>
      </div>
    </div>
  )
}
