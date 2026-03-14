import * as vscode from 'vscode'

// ── Activation ─────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Register both custom editor providers
  context.subscriptions.push(
    CrossdrawEditorProvider.register(context, 'crossdraw.editor'),
    CrossdrawEditorProvider.register(context, 'crossdraw.imageEditor'),
  )

  // "Open in Crossdraw" command
  context.subscriptions.push(
    vscode.commands.registerCommand('crossdraw.openInEditor', async (uri: vscode.Uri) => {
      if (!uri) {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'Image files': ['xd', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'psd'] },
        })
        uri = uris?.[0]!
        if (!uri) return
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        uri.path.endsWith('.xd') ? 'crossdraw.editor' : 'crossdraw.imageEditor',
      )
    }),
  )
}

export function deactivate() {}

// ── Custom Editor Provider ─────────────────────────────────────

class CrossdrawEditorProvider implements vscode.CustomEditorProvider<CrossdrawDocument> {
  private static readonly viewType = 'crossdraw.editor'

  static register(context: vscode.ExtensionContext, viewType: string): vscode.Disposable {
    const provider = new CrossdrawEditorProvider(context)
    return vscode.window.registerCustomEditorProvider(viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    })
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ── Document lifecycle ───────────────────────────────────────

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): Promise<CrossdrawDocument> {
    const data = await vscode.workspace.fs.readFile(uri)
    return new CrossdrawDocument(uri, data)
  }

  // ── Webview ──────────────────────────────────────────────────

  async resolveCustomEditor(
    document: CrossdrawDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    }

    const config = vscode.workspace.getConfiguration('crossdraw')
    const serverUrl = config.get<string>('serverUrl', '')
    const apiKey = config.get<string>('apiKey', '')

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview, document, serverUrl)

    // Send file data to webview once ready
    const ready = webviewPanel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'ready':
          webviewPanel.webview.postMessage({
            type: 'load',
            fileName: document.uri.path.split('/').pop() ?? 'untitled',
            data: Array.from(document.data),
            mimeType: mimeFromUri(document.uri),
            serverUrl,
            apiKey,
          })
          break

        case 'save':
          document.update(new Uint8Array(msg.data))
          break

        case 'dirty':
          document.markDirty()
          break
      }
    })

    webviewPanel.onDidDispose(() => ready.dispose())
  }

  // ── Persistence ──────────────────────────────────────────────

  async saveCustomDocument(
    document: CrossdrawDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(document.uri, document.data)
  }

  async saveCustomDocumentAs(
    document: CrossdrawDocument,
    destination: vscode.Uri,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    await vscode.workspace.fs.writeFile(destination, document.data)
  }

  async revertCustomDocument(
    document: CrossdrawDocument,
    _cancellation: vscode.CancellationToken,
  ): Promise<void> {
    const data = await vscode.workspace.fs.readFile(document.uri)
    document.update(data)
  }

  async backupCustomDocument(
    document: CrossdrawDocument,
    context: vscode.CustomDocumentBackupContext,
    _cancellation: vscode.CancellationToken,
  ): Promise<vscode.CustomDocumentBackup> {
    await vscode.workspace.fs.writeFile(context.destination, document.data)
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination)
        } catch {
          // backup already cleaned up
        }
      },
    }
  }

  // ── Webview HTML ─────────────────────────────────────────────

  private getHtml(
    webview: vscode.Webview,
    document: CrossdrawDocument,
    serverUrl: string,
  ): string {
    const nonce = getNonce()
    const ext = document.uri.path.split('.').pop()?.toLowerCase() ?? ''
    const isNativeFormat = ext === 'xd'

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      img-src ${webview.cspSource} data: blob:;
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      connect-src ${serverUrl ? serverUrl.replace(/\/$/, '') : 'ws://localhost:3000'} wss: ws:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crossdraw</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: var(--vscode-editor-background, #1e1e1e); }
    #canvas-container {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
    }
    canvas {
      image-rendering: pixelated;
      max-width: 100%; max-height: 100%;
    }
    #status {
      position: fixed; bottom: 8px; left: 50%;
      transform: translateX(-50%);
      font-family: var(--vscode-font-family, monospace);
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #888);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 4px 12px; border-radius: 4px;
      opacity: 0.9;
    }
    #status.connected { color: var(--vscode-testing-iconPassed, #4caf50); }
    #status.error { color: var(--vscode-testing-iconFailed, #f44336); }
    .toolbar {
      position: fixed; top: 8px; right: 8px;
      display: flex; gap: 4px;
    }
    .toolbar button {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #ccc);
      border: none; border-radius: 4px;
      padding: 4px 10px; cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-font-family, monospace);
    }
    .toolbar button:hover {
      background: var(--vscode-button-secondaryHoverBackground, #505357);
    }
  </style>
</head>
<body>
  <div id="canvas-container">
    <canvas id="canvas"></canvas>
  </div>
  <div class="toolbar">
    <button id="btn-zoom-fit" title="Fit to view">Fit</button>
    <button id="btn-zoom-1x" title="Actual size">1:1</button>
    <button id="btn-save" title="Save">Save</button>
  </div>
  <div id="status">Loading…</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi()
    const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const status = document.getElementById('status')

    let imageData = null
    let ws = null
    let fileName = ''
    let zoom = 1
    let panX = 0, panY = 0
    let isDragging = false
    let lastMouse = { x: 0, y: 0 }

    // ── Message handling ──────────────────────────────

    window.addEventListener('message', (e) => {
      const msg = e.data
      switch (msg.type) {
        case 'load':
          fileName = msg.fileName
          loadFileData(new Uint8Array(msg.data), msg.mimeType)
          if (msg.serverUrl) connectMultiplayer(msg.serverUrl, msg.apiKey)
          break
      }
    })

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' })

    // ── File loading ──────────────────────────────────

    async function loadFileData(data, mimeType) {
      if (mimeType === 'application/x-crossdraw') {
        // .xd native format — show placeholder until full renderer is embedded
        canvas.width = 400
        canvas.height = 200
        ctx.fillStyle = '#2d2d2d'
        ctx.fillRect(0, 0, 400, 200)
        ctx.fillStyle = '#ccc'
        ctx.font = '14px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Crossdraw Document', 200, 90)
        ctx.fillText(fileName, 200, 120)
        status.textContent = 'Loaded ' + fileName
        return
      }

      // Image formats — decode and display
      const blob = new Blob([data], { type: mimeType })
      const bitmap = await createImageBitmap(blob)
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()

      imageData = data
      fitToView()
      status.textContent = bitmap.width + '×' + bitmap.height + ' — ' + fileName
    }

    // ── Viewport controls ─────────────────────────────

    function fitToView() {
      const container = document.getElementById('canvas-container')
      const scaleX = container.clientWidth / canvas.width
      const scaleY = container.clientHeight / canvas.height
      zoom = Math.min(scaleX, scaleY, 1) * 0.95
      applyTransform()
    }

    function applyTransform() {
      canvas.style.transform = 'scale(' + zoom + ') translate(' + panX + 'px, ' + panY + 'px)'
      canvas.style.transformOrigin = 'center center'
    }

    document.getElementById('btn-zoom-fit').onclick = () => { fitToView() }
    document.getElementById('btn-zoom-1x').onclick = () => { zoom = 1; panX = 0; panY = 0; applyTransform() }
    document.getElementById('btn-save').onclick = () => {
      // Export current canvas state
      canvas.toBlob((blob) => {
        blob.arrayBuffer().then((buf) => {
          vscode.postMessage({ type: 'save', data: Array.from(new Uint8Array(buf)) })
        })
      })
    }

    // Wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      zoom = Math.max(0.1, Math.min(10, zoom * delta))
      applyTransform()
    }, { passive: false })

    // Pan with middle mouse
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        isDragging = true
        lastMouse = { x: e.clientX, y: e.clientY }
        e.preventDefault()
      }
    })
    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        panX += (e.clientX - lastMouse.x) / zoom
        panY += (e.clientY - lastMouse.y) / zoom
        lastMouse = { x: e.clientX, y: e.clientY }
        applyTransform()
      }
    })
    window.addEventListener('mouseup', (e) => {
      if (e.button === 1) isDragging = false
    })

    // ── Multiplayer ───────────────────────────────────

    function connectMultiplayer(serverUrl, apiKey) {
      const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws/vscode'
      try {
        ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          status.textContent = 'Connected'
          status.className = 'connected'
          ws.send(JSON.stringify({
            type: 'join',
            fileName,
            apiKey,
          }))
        }

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'update' && msg.data) {
              // Remote update — re-render
              loadFileData(new Uint8Array(msg.data), 'image/png')
              vscode.postMessage({ type: 'dirty' })
            }
          } catch {}
        }

        ws.onclose = () => {
          status.textContent = 'Disconnected'
          status.className = ''
          // Reconnect after 3s
          setTimeout(() => connectMultiplayer(serverUrl, apiKey), 3000)
        }

        ws.onerror = () => {
          status.textContent = 'Connection error'
          status.className = 'error'
        }
      } catch {
        status.textContent = 'No server'
        status.className = ''
      }
    }
  </script>
</body>
</html>`
  }
}

// ── CrossdrawDocument ──────────────────────────────────────────

class CrossdrawDocument extends vscode.Disposable implements vscode.CustomDocument {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<CrossdrawDocument>>()
  readonly onDidChange = this._onDidChange.event

  private _data: Uint8Array

  constructor(
    readonly uri: vscode.Uri,
    initialData: Uint8Array,
  ) {
    super(() => this._onDidChange.dispose())
    this._data = initialData
  }

  get data(): Uint8Array {
    return this._data
  }

  update(newData: Uint8Array): void {
    const oldData = this._data
    this._data = newData
    this._onDidChange.fire({
      document: this,
      undo: async () => { this._data = oldData },
      redo: async () => { this._data = newData },
    })
  }

  markDirty(): void {
    this._onDidChange.fire({
      document: this,
      undo: async () => {},
      redo: async () => {},
    })
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function mimeFromUri(uri: vscode.Uri): string {
  const ext = uri.path.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'psd': return 'image/vnd.adobe.photoshop'
    case 'xd': return 'application/x-crossdraw'
    default: return 'application/octet-stream'
  }
}
