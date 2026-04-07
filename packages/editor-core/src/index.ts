/**
 * @crossdraw/editor-core
 *
 * Mountable Crossdraw editor that can be embedded in any host application.
 * Renders the full React editor into a provided DOM element with theme
 * bridging and mode restrictions.
 */

import type { CrossdrawThemeTokens } from './theme-contract'
import type { EditorMode, ModeConfig } from './mode-config'

export type { CrossdrawThemeTokens } from './theme-contract'
export type { EditorMode, ModeConfig } from './mode-config'
export { TOKEN_TO_CSS_VAR, applyThemeTokens } from './theme-contract'
export { getModeConfig } from './mode-config'

export interface CrossdrawEditorConfig {
  /** Editor mode: 'full' for complete editor, 'pngtuber' for avatar-focused */
  mode?: EditorMode
  /** Theme token overrides — applied as CSS custom properties on the mount element */
  theme?: Partial<CrossdrawThemeTokens>
  /** Maximum file size in bytes (overrides mode default, 0 = unlimited) */
  maxFileSize?: number
  /** Callback when the user saves — receives the .crow file as ArrayBuffer */
  onSave?: (buffer: ArrayBuffer) => void
  /** Callback to load a file — should return an ArrayBuffer of a .crow file */
  onLoad?: () => Promise<ArrayBuffer | null>
  /** Mode config overrides for fine-grained control */
  modeOverrides?: Partial<ModeConfig>
  /** Initial document to load (ArrayBuffer of .crow file) */
  initialDocument?: ArrayBuffer
}

export interface CrossdrawEditorInstance {
  /** Destroy the editor and clean up */
  destroy: () => void
  /** Update theme tokens without remounting */
  setTheme: (tokens: Partial<CrossdrawThemeTokens>) => void
  /** Get the current document as ArrayBuffer */
  getDocument: () => Promise<ArrayBuffer>
  /** Load a document from ArrayBuffer */
  loadDocument: (buffer: ArrayBuffer) => void
  /** Get the mode config */
  getModeConfig: () => ModeConfig
}

/**
 * Mount a Crossdraw editor instance into a DOM element.
 *
 * @example
 * ```ts
 * import { mount } from '@crossdraw/editor-core'
 *
 * const editor = await mount(document.getElementById('editor')!, {
 *   mode: 'pngtuber',
 *   theme: { accent: '#ff6b6b', bgBase: '#1a1a2e' },
 *   maxFileSize: 2_000_000,
 *   onSave: (buf) => uploadToServer(buf),
 * })
 *
 * // Later:
 * editor.destroy()
 * ```
 */
export async function mount(
  element: HTMLElement,
  config: CrossdrawEditorConfig = {},
): Promise<CrossdrawEditorInstance> {
  const { applyThemeTokens } = await import('./theme-contract')
  const { getModeConfig: getModeCfg } = await import('./mode-config')

  // Compute mode config
  const mode = config.mode ?? 'full'
  const modeConfig = getModeCfg(mode, {
    ...config.modeOverrides,
    ...(config.maxFileSize !== undefined ? { maxFileSize: config.maxFileSize } : {}),
  })

  // Set up the container
  element.style.position = element.style.position || 'relative'
  element.style.overflow = 'hidden'
  element.setAttribute('data-crossdraw-editor', '')
  element.setAttribute('data-crossdraw-mode', mode)

  // Apply theme tokens (scoped to this element)
  if (config.theme) {
    applyThemeTokens(element, config.theme)
  }

  // Store config on the element for the React app to read
  const configKey = '__crossdraw_config__' as const
  ;(element as any)[configKey] = { config, modeConfig }

  // Expose callbacks globally so the embedded React app can call them
  const callbackKey = '__crossdraw_callbacks__' as const
  ;(window as any)[callbackKey] = {
    onSave: config.onSave,
    onLoad: config.onLoad,
  }

  // Expose mode config globally for the React app
  const modeKey = '__crossdraw_mode__' as const
  ;(window as any)[modeKey] = modeConfig

  // Dynamically import React and render the app
  const React = await import('react')
  const ReactDOM = await import('react-dom/client')

  // Import the app — this resolves through the host's bundler
  // The host must ensure @/ alias or bundler config is set up
  const root = ReactDOM.createRoot(element)

  // We render a wrapper that reads mode config and restricts the UI
  const { EmbeddedApp } = await import('./embedded-app')

  root.render(
    React.createElement(EmbeddedApp, {
      modeConfig,
      initialDocument: config.initialDocument,
      onSave: config.onSave,
      onLoad: config.onLoad,
    }),
  )

  return {
    destroy() {
      root.unmount()
      element.removeAttribute('data-crossdraw-editor')
      element.removeAttribute('data-crossdraw-mode')
      delete (element as any)[configKey]
      delete (window as any)[callbackKey]
      delete (window as any)[modeKey]
    },

    setTheme(tokens: Partial<CrossdrawThemeTokens>) {
      applyThemeTokens(element, tokens)
    },

    async getDocument(): Promise<ArrayBuffer> {
      // Access the editor store to encode the current document
      const { useEditorStore } = await import('@/store/editor.store')
      const { encodeDocument } = await import('@/io/file-format')
      const doc = useEditorStore.getState().document
      return encodeDocument(doc)
    },

    loadDocument(buffer: ArrayBuffer) {
      import('@/io/file-format').then(({ decodeDocument }) => {
        import('@/store/editor.store').then(({ useEditorStore }) => {
          const doc = decodeDocument(buffer)
          useEditorStore.setState({
            document: doc,
            history: [],
            historyIndex: -1,
            selection: { layerIds: [] },
            isDirty: false,
            filePath: null,
          })
        })
      })
    },

    getModeConfig() {
      return modeConfig
    },
  }
}
