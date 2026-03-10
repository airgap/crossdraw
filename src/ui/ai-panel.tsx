import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import {
  getAIConfig,
  setAIConfig,
  generateDesignFromPrompt,
  suggestColorPalette,
  critiqueDesign,
  generatePlaceholderText,
  generateVectorArt,
  bulkRenameLayers as aiBulkRename,
} from '@/ai/ai-service'
import type { AIServiceConfig, DesignCritique } from '@/ai/ai-service'
import type { RenameLayerInfo } from '@/ai/prompt-templates'
import { importSVG } from '@/io/svg-import'
import { v4 as uuid } from 'uuid'
import type { NamedColor, Layer } from '@/types'

// ── Message types ──

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** Attached data for actionable messages */
  palette?: string[]
  critique?: DesignCritique
  /** SVG preview markup for generated vector art */
  svgPreview?: string
}

// ── Available models ──

const CLAUDE_MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
  { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
]

// ── Component ──

export function AIPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(CLAUDE_MODELS[0]!.id)
  const [baseUrl, setBaseUrl] = useState('')
  const [paletteBaseColor, setPaletteBaseColor] = useState('#4a7dff')
  const [paletteMood, setPaletteMood] = useState('')
  const [textContext, setTextContext] = useState('')
  const [textLength, setTextLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [vectorArtDescription, setVectorArtDescription] = useState('')
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  const addDocumentColor = useEditorStore((s) => s.addDocumentColor)
  const selectLayer = useEditorStore((s) => s.selectLayer)

  // Load config on mount
  useEffect(() => {
    const config = getAIConfig()
    if (config) {
      setApiKey(config.apiKey)
      setModel(config.model)
      setBaseUrl(config.baseUrl ?? '')
    }
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const saveConfig = useCallback(() => {
    const config: AIServiceConfig = { apiKey, model, baseUrl: baseUrl || undefined }
    setAIConfig(config)
  }, [apiKey, model, baseUrl])

  const addMessage = useCallback((role: ChatMessage['role'], content: string, extra?: Partial<ChatMessage>) => {
    const msg: ChatMessage = { id: uuid(), role, content, timestamp: Date.now(), ...extra }
    setMessages((prev) => [...prev, msg])
    return msg
  }, [])

  const isConfigured = useCallback(() => {
    const config = getAIConfig()
    return config !== null && config.apiKey.length > 0
  }, [])

  // ── Quick action handlers ──

  const handleGenerateLayout = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return
      addMessage('user', prompt)
      setInput('')
      setLoading(true)
      setActiveQuickAction(null)

      try {
        const store = useEditorStore.getState()
        const artboard = store.document.artboards[0]
        if (!artboard) throw new Error('No artboard found.')

        const layers = await generateDesignFromPrompt(prompt, artboard.width, artboard.height)
        for (const layer of layers) {
          store.addLayer(artboard.id, layer)
        }
        addMessage('assistant', `Added ${layers.length} layer${layers.length !== 1 ? 's' : ''} to "${artboard.name}".`)
      } catch (err) {
        addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setLoading(false)
      }
    },
    [addMessage],
  )

  const handleSuggestColors = useCallback(async () => {
    addMessage('user', `Suggest colors based on ${paletteBaseColor}${paletteMood ? ` (mood: ${paletteMood})` : ''}`)
    setLoading(true)
    setActiveQuickAction(null)

    try {
      const colors = await suggestColorPalette(paletteBaseColor, paletteMood || undefined)
      addMessage('assistant', `Here's a palette of ${colors.length} colors:`, { palette: colors })
    } catch (err) {
      addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [paletteBaseColor, paletteMood, addMessage])

  const handleCritique = useCallback(async () => {
    addMessage('user', 'Critique my current design')
    setLoading(true)
    setActiveQuickAction(null)

    try {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) throw new Error('No artboard found.')
      if (artboard.layers.length === 0) throw new Error('Artboard has no layers to critique.')

      const result = await critiqueDesign(artboard.layers)
      addMessage('assistant', `Design score: ${result.score}/10`, { critique: result })
    } catch (err) {
      addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [addMessage])

  const handleGenerateText = useCallback(async () => {
    if (!textContext.trim()) return
    addMessage('user', `Generate ${textLength} placeholder text for: ${textContext}`)
    setLoading(true)
    setActiveQuickAction(null)

    try {
      const text = await generatePlaceholderText(textContext, textLength)
      addMessage('assistant', text)
    } catch (err) {
      addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [textContext, textLength, addMessage])

  const handleGenerateVectorArt = useCallback(async () => {
    if (!vectorArtDescription.trim()) return
    addMessage('user', `Generate vector art: ${vectorArtDescription}`)
    setLoading(true)
    setActiveQuickAction(null)

    try {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) throw new Error('No artboard found.')

      const svgString = await generateVectorArt(vectorArtDescription, artboard.width, artboard.height)

      // Parse SVG into layers via the existing SVG importer
      const svgDoc = importSVG(svgString)
      const sourceArtboard = svgDoc.artboards[0]
      if (!sourceArtboard || sourceArtboard.layers.length === 0) {
        throw new Error('Generated SVG produced no importable layers.')
      }

      // Add all layers to the artboard in a single undo step
      store.importLayersToArtboard(artboard.id, sourceArtboard.layers)

      // Select the first imported layer
      store.selectLayer(sourceArtboard.layers[0]!.id)

      addMessage(
        'assistant',
        `Generated ${sourceArtboard.layers.length} vector layer${sourceArtboard.layers.length !== 1 ? 's' : ''} from "${vectorArtDescription}".`,
        { svgPreview: svgString },
      )
      setVectorArtDescription('')
    } catch (err) {
      addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [vectorArtDescription, addMessage])

  const collectLayerInfos = useCallback((layers: Layer[]): RenameLayerInfo[] => {
    const result: RenameLayerInfo[] = []
    for (const layer of layers) {
      let details = ''
      if (layer.type === 'text') {
        details = `text="${layer.text}", font=${layer.fontFamily} ${layer.fontSize}px, color=${layer.color}`
      } else if (layer.type === 'vector') {
        const fillColor = layer.fill?.color ?? 'none'
        const strokeColor = layer.stroke?.color ?? 'none'
        details = `fill=${fillColor}, stroke=${strokeColor}, pos=(${layer.transform.x}, ${layer.transform.y})`
      } else if (layer.type === 'group') {
        details = `${layer.children.length} children`
      } else if (layer.type === 'raster') {
        details = `${layer.width}x${layer.height}`
      } else {
        details = `pos=(${layer.transform.x}, ${layer.transform.y})`
      }
      result.push({ id: layer.id, name: layer.name, type: layer.type, details })
      if (layer.type === 'group') {
        result.push(...collectLayerInfos(layer.children))
      }
    }
    return result
  }, [])

  const handleRenameLayers = useCallback(async () => {
    addMessage('user', 'AI rename all layers on the active artboard')
    setLoading(true)
    setActiveQuickAction(null)

    try {
      const s = useEditorStore.getState()
      const artboard = s.document.artboards[0]
      if (!artboard) throw new Error('No artboard found.')
      if (artboard.layers.length === 0) throw new Error('Artboard has no layers to rename.')

      const layerInfos = collectLayerInfos(artboard.layers)
      const renames = await aiBulkRename(layerInfos)
      s.bulkRenameLayers(
        artboard.id,
        renames.map((r) => ({ layerId: r.id, newName: r.newName })),
      )

      const renameList = renames
        .map((r) => `  "${layerInfos.find((l) => l.id === r.id)?.name ?? r.id}" -> "${r.newName}"`)
        .join('\n')
      addMessage('assistant', `Renamed ${renames.length} layer${renames.length !== 1 ? 's' : ''}:\n${renameList}`)
    } catch (err) {
      addMessage('assistant', `Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [addMessage, collectLayerInfos])

  const handleAddPaletteColor = useCallback(
    (color: string) => {
      const namedColor: NamedColor = { id: uuid(), name: color, value: color }
      addDocumentColor(namedColor)
    },
    [addDocumentColor],
  )

  const handleSelectIssueLayer = useCallback(
    (layerId: string) => {
      selectLayer(layerId)
    },
    [selectLayer],
  )

  const handleSubmit = useCallback(() => {
    if (!input.trim() || loading) return
    if (!isConfigured()) {
      addMessage('assistant', 'Please configure your API key first. Open Settings below.')
      return
    }
    handleGenerateLayout(input)
  }, [input, loading, isConfigured, addMessage, handleGenerateLayout])

  // ── Render ──

  const configured = isConfigured()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, fontSize: 'var(--font-size-base)' }}>
      {/* Header */}
      <div
        style={{
          padding: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>AI Assistant</span>
        <button
          onClick={() => setShowSettings((v) => !v)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'none'
          }}
        >
          Settings
        </button>
      </div>

      {/* Settings (collapsible) */}
      {showSettings && (
        <div
          style={{
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-base)',
              }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-base)',
              }}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Base URL (optional)
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.anthropic.com"
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-base)',
              }}
            />
          </label>
          <button
            onClick={saveConfig}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
            }}
          >
            Save Settings
          </button>
        </div>
      )}

      {/* Not configured notice */}
      {!configured && !showSettings && (
        <div
          style={{
            padding: 'var(--space-3)',
            margin: 'var(--space-2)',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: 'var(--text-primary)' }}>
            Welcome to AI Assistant
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            To get started, configure your Claude API key in Settings above.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: '6px 16px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
            }}
          >
            Open Settings
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div
        style={{
          padding: 'var(--space-2)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-1)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {([
          { key: 'layout', label: 'Generate Layout' },
          { key: 'vectorart', label: 'Vector Art' },
          { key: 'colors', label: 'Suggest Colors' },
          { key: 'critique', label: 'Critique Design' },
          { key: 'text', label: 'Generate Text' },
          { key: 'rename', label: 'Rename Layers' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              if (key === 'critique') {
                if (configured) {
                  handleCritique()
                } else {
                  addMessage('assistant', 'Please configure your API key first.')
                }
              } else if (key === 'rename') {
                if (configured) {
                  handleRenameLayers()
                } else {
                  addMessage('assistant', 'Please configure your API key first.')
                }
              } else {
                setActiveQuickAction(activeQuickAction === key ? null : key)
              }
            }}
            disabled={loading}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: activeQuickAction === key ? 'var(--bg-active)' : 'var(--bg-surface)',
              color: activeQuickAction === key ? '#fff' : 'var(--text-primary)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 'var(--font-size-sm)',
              whiteSpace: 'nowrap',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Quick action forms */}
      {activeQuickAction === 'colors' && (
        <div
          style={{
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>
              Base:
            </label>
            <input
              type="color"
              value={paletteBaseColor}
              onChange={(e) => setPaletteBaseColor(e.target.value)}
              style={{ width: 32, height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
            />
            <input
              type="text"
              value={paletteBaseColor}
              onChange={(e) => setPaletteBaseColor(e.target.value)}
              style={{
                flex: 1,
                padding: '4px 6px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
            />
          </div>
          <input
            type="text"
            value={paletteMood}
            onChange={(e) => setPaletteMood(e.target.value)}
            placeholder="Mood (optional): warm, corporate, playful..."
            style={{
              padding: '4px 6px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)',
            }}
          />
          <button
            onClick={handleSuggestColors}
            disabled={loading || !configured}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 'var(--font-size-sm)',
              opacity: loading || !configured ? 0.6 : 1,
            }}
          >
            Generate Palette
          </button>
        </div>
      )}

      {activeQuickAction === 'text' && (
        <div
          style={{
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          <input
            type="text"
            value={textContext}
            onChange={(e) => setTextContext(e.target.value)}
            placeholder="Context: e.g., SaaS landing page hero section"
            style={{
              padding: '4px 6px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)',
            }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {(['short', 'medium', 'long'] as const).map((len) => (
              <button
                key={len}
                onClick={() => setTextLength(len)}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  background: textLength === len ? 'var(--bg-active)' : 'var(--bg-surface)',
                  color: textLength === len ? '#fff' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  textTransform: 'capitalize',
                }}
              >
                {len}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerateText}
            disabled={loading || !configured || !textContext.trim()}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 'var(--font-size-sm)',
              opacity: loading || !configured || !textContext.trim() ? 0.6 : 1,
            }}
          >
            Generate Text
          </button>
        </div>
      )}

      {activeQuickAction === 'layout' && (
        <div
          style={{
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Type a design description below and press Enter to generate layers.
        </div>
      )}

      {activeQuickAction === 'vectorart' && (
        <div
          style={{
            padding: 'var(--space-2)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
          }}
        >
          <input
            type="text"
            value={vectorArtDescription}
            onChange={(e) => setVectorArtDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleGenerateVectorArt()
              }
            }}
            placeholder="Describe an illustration: e.g., a sunset over mountains"
            style={{
              padding: '4px 6px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              fontSize: 'var(--font-size-sm)',
            }}
          />
          <button
            onClick={handleGenerateVectorArt}
            disabled={loading || !configured || !vectorArtDescription.trim()}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 'var(--font-size-sm)',
              opacity: loading || !configured || !vectorArtDescription.trim() ? 0.6 : 1,
            }}
          >
            Generate Vector Art
          </button>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {messages.length === 0 && configured && (
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-sm)',
              textAlign: 'center',
              padding: 'var(--space-3)',
            }}
          >
            Describe a design to generate, or use the quick actions above.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-surface)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                border: msg.role === 'assistant' ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {msg.content}
            </div>

            {/* Color palette swatches */}
            {msg.palette && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
                {msg.palette.map((color, i) => (
                  <button
                    key={`${color}-${i}`}
                    onClick={() => handleAddPaletteColor(color)}
                    title={`${color} — click to add to document colors`}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--radius-sm)',
                      border: '2px solid var(--border-default)',
                      background: color,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            )}

            {/* SVG preview */}
            {msg.svgPreview && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: '#fff',
                  maxHeight: 200,
                  overflow: 'hidden',
                }}
                dangerouslySetInnerHTML={{ __html: msg.svgPreview }}
              />
            )}

            {/* Design critique details */}
            {msg.critique && (
              <div
                style={{
                  padding: '8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                {/* Score bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Score:</span>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--bg-hover)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${msg.critique.score * 10}%`,
                        height: '100%',
                        borderRadius: 3,
                        background:
                          msg.critique.score >= 7 ? '#4caf50' : msg.critique.score >= 4 ? '#ff9800' : '#f44336',
                      }}
                    />
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{msg.critique.score}/10</span>
                </div>

                {/* Issues */}
                {msg.critique.issues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Issues:</span>
                    {msg.critique.issues.map((issue, i) => (
                      <div
                        key={i}
                        onClick={() => issue.layerId && handleSelectIssueLayer(issue.layerId)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background:
                            issue.severity === 'error'
                              ? 'rgba(244, 67, 54, 0.1)'
                              : issue.severity === 'warning'
                                ? 'rgba(255, 152, 0, 0.1)'
                                : 'rgba(33, 150, 243, 0.1)',
                          borderLeft: `3px solid ${issue.severity === 'error' ? '#f44336' : issue.severity === 'warning' ? '#ff9800' : '#2196f3'}`,
                          cursor: issue.layerId ? 'pointer' : 'default',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>[{issue.type}]</span> {issue.description}
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                {msg.critique.suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Suggestions:</span>
                    {msg.critique.suggestions.map((s, i) => (
                      <div key={i} style={{ color: 'var(--text-secondary)', paddingLeft: 8 }}>
                        - {s}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Spinner />
            Thinking...
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          padding: 'var(--space-2)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          gap: 'var(--space-1)',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder={
            activeQuickAction === 'layout'
              ? 'Describe your design...'
              : 'Type a message or use quick actions...'
          }
          disabled={loading}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-input)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-base)',
            opacity: loading ? 0.6 : 1,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          style={{
            padding: '6px 12px',
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            cursor: loading || !input.trim() ? 'default' : 'pointer',
            fontSize: 'var(--font-size-base)',
            opacity: loading || !input.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

// ── Spinner component ──

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="var(--text-secondary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="20 12"
      />
    </svg>
  )
}
