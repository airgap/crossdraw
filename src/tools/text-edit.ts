import { useEditorStore } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { TextLayer } from '@/types'

/**
 * In-canvas text editing state.
 * Manages cursor position, selection range, and blink timer.
 */

export interface TextEditState {
  active: boolean
  layerId: string | null
  artboardId: string | null
  cursorPos: number // character index
  selectionStart: number | null
  selectionEnd: number | null
  blinkVisible: boolean
}

const state: TextEditState = {
  active: false,
  layerId: null,
  artboardId: null,
  cursorPos: 0,
  selectionStart: null,
  selectionEnd: null,
  blinkVisible: true,
}

let blinkTimer: ReturnType<typeof setInterval> | null = null
let renderCallback: (() => void) | null = null

export function getTextEditState(): TextEditState {
  return state
}

export function setTextEditRenderCallback(cb: () => void) {
  renderCallback = cb
}

function triggerRender() {
  if (renderCallback) renderCallback()
}

function startBlink() {
  stopBlink()
  state.blinkVisible = true
  blinkTimer = setInterval(() => {
    state.blinkVisible = !state.blinkVisible
    triggerRender()
  }, 530)
}

function stopBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer)
    blinkTimer = null
  }
}

/**
 * Enter text editing mode for a given TextLayer.
 */
export function beginTextEdit(layerId: string, artboardId: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === layerId) as TextLayer | undefined
  if (!layer || layer.type !== 'text') return

  state.active = true
  state.layerId = layerId
  state.artboardId = artboardId
  state.cursorPos = layer.text.length
  state.selectionStart = null
  state.selectionEnd = null
  startBlink()
}

/**
 * Create a new empty TextLayer and begin editing it.
 */
export function createAndEditText(docX: number, docY: number, artboardId: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer: TextLayer = {
    id: uuid(),
    name: `Text ${artboard.layers.length + 1}`,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: {
      x: docX - artboard.x,
      y: docY - artboard.y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    effects: [],
    text: '',
    fontFamily: 'sans-serif',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
  }

  store.addLayer(artboardId, layer)
  store.selectLayer(layer.id)
  beginTextEdit(layer.id, artboardId)
}

/**
 * Create a new area TextLayer (bounded text box) and begin editing it.
 */
export function createAreaText(x: number, y: number, width: number, height: number, artboardId: string) {
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  const layer: TextLayer = {
    id: uuid(),
    name: `Text ${artboard.layers.length + 1}`,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: {
      x: x - artboard.x,
      y: y - artboard.y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    },
    effects: [],
    text: '',
    fontFamily: 'sans-serif',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
    textMode: 'area',
    textWidth: width,
    textHeight: height,
  }

  store.addLayer(artboardId, layer)
  store.selectLayer(layer.id)
  beginTextEdit(layer.id, artboardId)
}

/**
 * Exit text editing mode.
 */
export function endTextEdit(cancel = false) {
  if (!state.active) return

  if (cancel && state.layerId && state.artboardId) {
    // If canceling with empty text, delete the layer
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
    if (artboard) {
      const layer = artboard.layers.find((l) => l.id === state.layerId) as TextLayer | undefined
      if (layer && layer.text === '') {
        store.deleteLayer(state.artboardId, state.layerId)
      }
    }
  }

  state.active = false
  state.layerId = null
  state.artboardId = null
  state.cursorPos = 0
  state.selectionStart = null
  state.selectionEnd = null
  stopBlink()
}

function getEditingLayer(): TextLayer | null {
  if (!state.layerId || !state.artboardId) return null
  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return null
  const layer = artboard.layers.find((l) => l.id === state.layerId) as TextLayer | undefined
  return layer && layer.type === 'text' ? layer : null
}

function updateText(newText: string) {
  if (!state.layerId || !state.artboardId) return
  useEditorStore.getState().updateLayer(state.artboardId, state.layerId, { text: newText })
}

function hasSelection(): boolean {
  return state.selectionStart !== null && state.selectionEnd !== null && state.selectionStart !== state.selectionEnd
}

function getSelectionRange(): [number, number] {
  if (!hasSelection()) return [state.cursorPos, state.cursorPos]
  const start = Math.min(state.selectionStart!, state.selectionEnd!)
  const end = Math.max(state.selectionStart!, state.selectionEnd!)
  return [start, end]
}

/**
 * Handle a keydown event during text editing.
 * Returns true if the event was consumed.
 */
export function textEditKeyDown(e: KeyboardEvent): boolean {
  if (!state.active) return false

  const layer = getEditingLayer()
  if (!layer) return false

  const text = layer.text
  const ctrlOrMeta = e.ctrlKey || e.metaKey

  // Shift+Enter or Enter without modifier — insert newline
  // Ctrl/Cmd+Enter — confirm
  if (e.key === 'Enter') {
    e.preventDefault()
    if (ctrlOrMeta) {
      endTextEdit()
      return true
    }
    // Insert newline
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      updateText(text.slice(0, start) + '\n' + text.slice(end))
      state.cursorPos = start + 1
    } else {
      updateText(text.slice(0, state.cursorPos) + '\n' + text.slice(state.cursorPos))
      state.cursorPos++
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  // Escape — cancel
  if (e.key === 'Escape') {
    e.preventDefault()
    endTextEdit(true)
    return true
  }

  // Select all
  if (ctrlOrMeta && e.key === 'a') {
    e.preventDefault()
    state.selectionStart = 0
    state.selectionEnd = text.length
    state.cursorPos = text.length
    startBlink()
    triggerRender()
    return true
  }

  // Copy
  if (ctrlOrMeta && e.key === 'c') {
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      navigator.clipboard.writeText(text.slice(start, end)).catch(() => {})
    }
    return true
  }

  // Cut
  if (ctrlOrMeta && e.key === 'x') {
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      navigator.clipboard.writeText(text.slice(start, end)).catch(() => {})
      updateText(text.slice(0, start) + text.slice(end))
      state.cursorPos = start
      state.selectionStart = null
      state.selectionEnd = null
      startBlink()
      triggerRender()
    }
    return true
  }

  // Paste
  if (ctrlOrMeta && e.key === 'v') {
    navigator.clipboard
      .readText()
      .then((clipText) => {
        const currentLayer = getEditingLayer()
        if (!currentLayer) return
        const currentText = currentLayer.text

        if (hasSelection()) {
          const [start, end] = getSelectionRange()
          updateText(currentText.slice(0, start) + clipText + currentText.slice(end))
          state.cursorPos = start + clipText.length
        } else {
          updateText(currentText.slice(0, state.cursorPos) + clipText + currentText.slice(state.cursorPos))
          state.cursorPos += clipText.length
        }
        state.selectionStart = null
        state.selectionEnd = null
        startBlink()
        triggerRender()
      })
      .catch(() => {})
    return true
  }

  // Backspace
  if (e.key === 'Backspace') {
    e.preventDefault()
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      updateText(text.slice(0, start) + text.slice(end))
      state.cursorPos = start
    } else if (state.cursorPos > 0) {
      updateText(text.slice(0, state.cursorPos - 1) + text.slice(state.cursorPos))
      state.cursorPos--
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  // Delete
  if (e.key === 'Delete') {
    e.preventDefault()
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      updateText(text.slice(0, start) + text.slice(end))
      state.cursorPos = start
    } else if (state.cursorPos < text.length) {
      updateText(text.slice(0, state.cursorPos) + text.slice(state.cursorPos + 1))
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  // Arrow Left
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (e.shiftKey) {
      if (state.selectionStart === null) state.selectionStart = state.cursorPos
      state.cursorPos = Math.max(0, state.cursorPos - 1)
      state.selectionEnd = state.cursorPos
    } else {
      if (hasSelection()) {
        state.cursorPos = getSelectionRange()[0]
      } else {
        state.cursorPos = Math.max(0, state.cursorPos - 1)
      }
      state.selectionStart = null
      state.selectionEnd = null
    }
    startBlink()
    triggerRender()
    return true
  }

  // Arrow Right
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (e.shiftKey) {
      if (state.selectionStart === null) state.selectionStart = state.cursorPos
      state.cursorPos = Math.min(text.length, state.cursorPos + 1)
      state.selectionEnd = state.cursorPos
    } else {
      if (hasSelection()) {
        state.cursorPos = getSelectionRange()[1]
      } else {
        state.cursorPos = Math.min(text.length, state.cursorPos + 1)
      }
      state.selectionStart = null
      state.selectionEnd = null
    }
    startBlink()
    triggerRender()
    return true
  }

  // Arrow Up (multi-line)
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const lines = text.split('\n')
    let lineStart = 0
    let currentLine = 0
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i]!.length
      if (state.cursorPos >= lineStart && state.cursorPos <= lineEnd) {
        currentLine = i
        break
      }
      lineStart = lineEnd + 1 // +1 for newline
    }
    if (currentLine > 0) {
      // Find offset within current line
      let curLineStart = 0
      for (let i = 0; i < currentLine; i++) curLineStart += lines[i]!.length + 1
      const colOffset = state.cursorPos - curLineStart
      // Move to same column in previous line
      let prevLineStart = 0
      for (let i = 0; i < currentLine - 1; i++) prevLineStart += lines[i]!.length + 1
      state.cursorPos = prevLineStart + Math.min(colOffset, lines[currentLine - 1]!.length)
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  // Arrow Down (multi-line)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const lines = text.split('\n')
    let lineStart = 0
    let currentLine = 0
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = lineStart + lines[i]!.length
      if (state.cursorPos >= lineStart && state.cursorPos <= lineEnd) {
        currentLine = i
        break
      }
      lineStart = lineEnd + 1
    }
    if (currentLine < lines.length - 1) {
      let curLineStart = 0
      for (let i = 0; i < currentLine; i++) curLineStart += lines[i]!.length + 1
      const colOffset = state.cursorPos - curLineStart
      let nextLineStart = 0
      for (let i = 0; i <= currentLine; i++) nextLineStart += lines[i]!.length + 1
      state.cursorPos = nextLineStart + Math.min(colOffset, lines[currentLine + 1]!.length)
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  // Home
  if (e.key === 'Home') {
    e.preventDefault()
    if (e.shiftKey) {
      if (state.selectionStart === null) state.selectionStart = state.cursorPos
      state.cursorPos = 0
      state.selectionEnd = 0
    } else {
      state.cursorPos = 0
      state.selectionStart = null
      state.selectionEnd = null
    }
    startBlink()
    triggerRender()
    return true
  }

  // End
  if (e.key === 'End') {
    e.preventDefault()
    if (e.shiftKey) {
      if (state.selectionStart === null) state.selectionStart = state.cursorPos
      state.cursorPos = text.length
      state.selectionEnd = text.length
    } else {
      state.cursorPos = text.length
      state.selectionStart = null
      state.selectionEnd = null
    }
    startBlink()
    triggerRender()
    return true
  }

  // Regular character input
  if (e.key.length === 1 && !ctrlOrMeta) {
    e.preventDefault()
    if (hasSelection()) {
      const [start, end] = getSelectionRange()
      updateText(text.slice(0, start) + e.key + text.slice(end))
      state.cursorPos = start + 1
    } else {
      updateText(text.slice(0, state.cursorPos) + e.key + text.slice(state.cursorPos))
      state.cursorPos++
    }
    state.selectionStart = null
    state.selectionEnd = null
    startBlink()
    triggerRender()
    return true
  }

  return false
}

/**
 * Word-wrap text to fit within a given width for area text.
 * Returns wrapped display lines and a mapping from each source character index
 * to its (x, y, lineIdx) position on the wrapped output.
 */
function wrapTextForOverlay(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineH: number,
): { lines: string[]; charPositions: Array<{ x: number; y: number; lineIdx: number }> } {
  const paragraphs = text.split('\n')
  const lines: string[] = []
  const charPositions: Array<{ x: number; y: number; lineIdx: number }> = []
  let srcIdx = 0

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi]!
    if (para === '') {
      // Empty paragraph — still occupies a visual line
      const li = lines.length
      lines.push('')
      charPositions[srcIdx] = { x: 0, y: li * lineH, lineIdx: li }
      srcIdx++ // advance past the newline character
      continue
    }

    const words = para.split(' ')
    let currentLine = ''
    let currentLineStartSrc = srcIdx

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi]!
      const separator = wi > 0 ? ' ' : ''
      const testLine = currentLine + separator + word
      const testWidth = ctx.measureText(testLine).width

      if (testWidth > maxWidth && currentLine !== '') {
        // Emit the current line and start a new one
        const li = lines.length
        lines.push(currentLine)
        // Map char positions for this completed line
        let x = 0
        for (let ci = 0; ci < currentLine.length; ci++) {
          charPositions[currentLineStartSrc + ci] = { x, y: li * lineH, lineIdx: li }
          x = ctx.measureText(currentLine.slice(0, ci + 1)).width
        }
        // End-of-line position
        charPositions[currentLineStartSrc + currentLine.length] = { x, y: li * lineH, lineIdx: li }

        currentLineStartSrc += currentLine.length
        // The space that caused the break: we consumed it but it maps to end of prev line
        if (wi > 0) {
          // The space before this word is at currentLineStartSrc
          // It doesn't display, but advance past it
          currentLineStartSrc++ // skip the space
        }
        currentLine = word
      } else {
        currentLine = testLine
      }
    }

    // Emit remaining text of this paragraph
    if (currentLine !== '' || lines.length === 0 || pi < paragraphs.length) {
      const li = lines.length
      lines.push(currentLine)
      let x = 0
      for (let ci = 0; ci < currentLine.length; ci++) {
        charPositions[currentLineStartSrc + ci] = { x, y: li * lineH, lineIdx: li }
        x = ctx.measureText(currentLine.slice(0, ci + 1)).width
      }
      charPositions[currentLineStartSrc + currentLine.length] = { x, y: li * lineH, lineIdx: li }
    }

    srcIdx += para.length
    // Account for the newline between paragraphs (except after last paragraph)
    if (pi < paragraphs.length - 1) {
      srcIdx++ // the newline char
    }
  }

  // Ensure end position exists
  if (!charPositions[text.length]) {
    const lastLine = lines.length - 1
    const y = lastLine * lineH
    const x = ctx.measureText(lines[lastLine] ?? '').width
    charPositions[text.length] = { x, y, lineIdx: lastLine }
  }

  return { lines, charPositions }
}

/**
 * Render the text editing cursor and selection overlay.
 */
export function renderTextEditOverlay(
  ctx: CanvasRenderingContext2D,
  artboardX: number,
  artboardY: number,
  zoom: number,
) {
  if (!state.active) return

  const layer = getEditingLayer()
  if (!layer) return

  const t = layer.transform

  ctx.save()
  ctx.translate(artboardX + t.x, artboardY + t.y)
  ctx.scale(t.scaleX, t.scaleY)
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180)

  const style = layer.fontStyle === 'italic' ? 'italic ' : ''
  const weight = layer.fontWeight === 'bold' ? 'bold ' : ''
  ctx.font = `${style}${weight}${layer.fontSize}px ${layer.fontFamily}`
  ctx.textBaseline = 'top'

  const text = layer.text
  const lineH = layer.fontSize * (layer.lineHeight ?? 1.4)

  const isAreaText = layer.textMode === 'area' && layer.textWidth != null && layer.textWidth > 0

  // Build per-character (x, y, line) positions
  interface CharPos {
    x: number
    y: number
    lineIdx: number
  }

  let charPositions: CharPos[]
  let lines: string[]
  let maxWidth: number
  let totalHeight: number

  if (isAreaText) {
    const wrapped = wrapTextForOverlay(ctx, text, layer.textWidth!, lineH)
    lines = wrapped.lines
    charPositions = wrapped.charPositions
    maxWidth = layer.textWidth!
    totalHeight = layer.textHeight ?? lines.length * lineH
  } else {
    lines = text.split('\n')
    charPositions = []
    let charIdx = 0
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!
      const y = li * lineH
      let x = 0
      for (let ci = 0; ci < line.length; ci++) {
        charPositions[charIdx] = { x, y, lineIdx: li }
        x = ctx.measureText(line.slice(0, ci + 1)).width
        charIdx++
      }
      // After last char of this line (or newline position)
      charPositions[charIdx] = { x, y, lineIdx: li }
      charIdx++ // for the newline char itself (except last line)
    }
    // Ensure end position exists
    if (!charPositions[text.length]) {
      const lastLine = lines.length - 1
      const y = lastLine * lineH
      const x = ctx.measureText(lines[lastLine]!).width
      charPositions[text.length] = { x, y, lineIdx: lastLine }
    }
    maxWidth = 0
    for (const line of lines) {
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width)
    }
    totalHeight = lines.length * lineH
  }

  // Draw selection highlight
  if (hasSelection()) {
    const [start, end] = getSelectionRange()
    ctx.fillStyle = 'rgba(74, 125, 255, 0.3)'
    for (let i = start; i < end; i++) {
      const cp = charPositions[i]
      const cpNext = charPositions[i + 1]
      if (cp && cpNext && cp.lineIdx === cpNext.lineIdx) {
        ctx.fillRect(cp.x, cp.y, cpNext.x - cp.x, lineH)
      } else if (cp) {
        // End of line highlight
        ctx.fillRect(cp.x, cp.y, 4, lineH)
      }
    }
  }

  // Draw text bounding box (dashed)
  ctx.strokeStyle = '#4a7dff'
  ctx.lineWidth = 1 / zoom / t.scaleX
  ctx.setLineDash([4 / zoom / t.scaleX, 3 / zoom / t.scaleX])
  if (isAreaText) {
    // For area text, draw the actual text box bounds
    ctx.strokeRect(0, 0, layer.textWidth!, layer.textHeight ?? totalHeight)
  } else {
    ctx.strokeRect(-2, -2, maxWidth + 4, totalHeight + 4)
  }
  ctx.setLineDash([])

  // Draw cursor
  if (state.blinkVisible) {
    const cp = charPositions[state.cursorPos]
    if (cp) {
      ctx.strokeStyle = layer.color
      ctx.lineWidth = 1 / zoom / t.scaleX
      ctx.beginPath()
      ctx.moveTo(cp.x, cp.y)
      ctx.lineTo(cp.x, cp.y + lineH)
      ctx.stroke()
    }
  }

  ctx.restore()
}
