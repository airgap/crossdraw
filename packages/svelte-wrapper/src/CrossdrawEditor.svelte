<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { CrossdrawEditorConfig, CrossdrawEditorInstance, CrossdrawThemeTokens } from '../../editor-core/src/index'
  import { lykuThemeToCrossdraw, watchLykuTheme } from './theme-bridge'

  // ── Props ──

  /** Editor mode: 'full', 'pngtuber', or 'attachment' */
  export let mode: 'full' | 'pngtuber' | 'attachment' = 'pngtuber'

  /** Override theme tokens directly (takes precedence over auto-detected Lyku theme) */
  export let theme: Partial<CrossdrawThemeTokens> | undefined = undefined

  /** Auto-sync theme from Lyku's CSS variables */
  export let autoTheme: boolean = true

  /** Maximum file size in bytes */
  export let maxFileSize: number = 2_000_000

  /** Callback when the user saves */
  export let onSave: ((buffer: ArrayBuffer) => void) | undefined = undefined

  /** Callback to load a document */
  export let onLoad: (() => Promise<ArrayBuffer | null>) | undefined = undefined

  /** Initial .crow document buffer */
  export let initialDocument: ArrayBuffer | undefined = undefined

  /** CSS class for the container */
  let className: string = ''
  export { className as class }

  /** CSS height for the container (default: 100%) */
  export let height: string = '100%'

  /** CSS width for the container (default: 100%) */
  export let width: string = '100%'

  // ── Internal state ──

  let container: HTMLDivElement
  let editorInstance: CrossdrawEditorInstance | null = null
  let stopWatching: (() => void) | null = null

  onMount(async () => {
    const { mount } = await import('../../editor-core/src/index')

    // Resolve theme: explicit overrides > auto-detected Lyku theme
    const resolvedTheme = theme ?? (autoTheme ? lykuThemeToCrossdraw() : undefined)

    const config: CrossdrawEditorConfig = {
      mode,
      theme: resolvedTheme,
      maxFileSize,
      onSave,
      onLoad,
      initialDocument,
    }

    editorInstance = await mount(container, config)

    // Watch for Lyku theme changes if autoTheme is enabled
    if (autoTheme && !theme) {
      stopWatching = watchLykuTheme((tokens) => {
        editorInstance?.setTheme(tokens)
      })
    }
  })

  onDestroy(() => {
    stopWatching?.()
    editorInstance?.destroy()
    editorInstance = null
  })

  /** Expose getDocument for parent components */
  export async function getDocument(): Promise<ArrayBuffer | null> {
    return editorInstance?.getDocument() ?? null
  }

  /** Expose loadDocument for parent components */
  export function loadDocument(buffer: ArrayBuffer) {
    editorInstance?.loadDocument(buffer)
  }
</script>

<div
  bind:this={container}
  class="crossdraw-editor {className}"
  style="width: {width}; height: {height}; position: relative; overflow: hidden;"
></div>

<style>
  .crossdraw-editor {
    /* Ensure the editor fills its container */
    display: block;
    min-height: 0;
    min-width: 0;
  }
</style>
