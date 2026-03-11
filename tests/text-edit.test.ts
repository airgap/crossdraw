import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  getTextEditState,
  setTextEditRenderCallback,
  beginTextEdit,
  createAndEditText,
  createAreaText,
  endTextEdit,
  textEditKeyDown,
  renderTextEditOverlay,
} from '@/tools/text-edit'
import { useEditorStore } from '@/store/editor.store'
import type { TextLayer } from '@/types'

// --- helpers ---

function addTextLayer(artboardId: string, id: string, text: string): TextLayer {
  const store = useEditorStore.getState()
  const layer: TextLayer = {
    id,
    name: `Text ${id}`,
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 },
    effects: [],
    text,
    fontFamily: 'sans-serif',
    fontSize: 24,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    color: '#000000',
  }
  store.addLayer(artboardId, layer as any)
  return layer
}

function makeKeyEvent(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {},
    ...opts,
  } as unknown as KeyboardEvent
}

function mockCtx(w = 100, h = 100) {
  const imageData = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }
  return {
    canvas: { width: w, height: h },
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    arc: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    clearRect: () => {},
    fillRect: () => {},
    drawImage: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    getImageData: () => imageData,
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    isPointInPath: () => true,
    isPointInStroke: () => false,
    measureText: (text: string) => ({ width: text.length * 8 }),
    fillText: () => {},
    setLineDash: () => {},
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    strokeStyle: '#000',
    fillStyle: '#000',
    font: '',
    textBaseline: 'top',
    strokeRect: () => {},
    createImageData: (w2: number, h2: number) => ({
      data: new Uint8ClampedArray(w2 * h2 * 4),
      width: w2,
      height: h2,
      colorSpace: 'srgb',
    }),
  } as unknown as CanvasRenderingContext2D
}

describe('text-edit tool', () => {
  beforeEach(() => {
    endTextEdit()
    setTextEditRenderCallback(() => {})
  })

  afterEach(() => {
    endTextEdit()
  })

  describe('getTextEditState', () => {
    test('returns inactive state initially', () => {
      const st = getTextEditState()
      expect(st.active).toBe(false)
      expect(st.layerId).toBeNull()
      expect(st.artboardId).toBeNull()
      expect(st.cursorPos).toBe(0)
      expect(st.selectionStart).toBeNull()
      expect(st.selectionEnd).toBeNull()
    })
  })

  describe('setTextEditRenderCallback', () => {
    test('sets callback without error', () => {
      let called = false
      setTextEditRenderCallback(() => {
        called = true
      })
      // Callback is called during text editing events, not directly testable here
      expect(called).toBe(false)
    })
  })

  describe('beginTextEdit', () => {
    test('activates editing on a text layer', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-1', 'Hello')
      store.selectLayer('te-1')

      beginTextEdit('te-1', artboard.id)
      const st = getTextEditState()
      expect(st.active).toBe(true)
      expect(st.layerId).toBe('te-1')
      expect(st.artboardId).toBe(artboard.id)
      expect(st.cursorPos).toBe(5) // "Hello".length
    })

    test('does nothing for non-text layer', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer = {
        id: 'te-vec',
        name: 'Vec',
        type: 'vector' as const,
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        effects: [],
        paths: [],
        fill: null,
        stroke: null,
      }
      store.addLayer(artboard.id, layer as any)

      beginTextEdit('te-vec', artboard.id)
      expect(getTextEditState().active).toBe(false)
    })

    test('does nothing for nonexistent artboard', () => {
      beginTextEdit('foo', 'nonexistent-ab')
      expect(getTextEditState().active).toBe(false)
    })
  })

  describe('createAndEditText', () => {
    test('creates a text layer and begins editing', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layerCount = artboard.layers.length
      createAndEditText(artboard.x + 50, artboard.y + 50, artboard.id)

      const updatedAb = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
      expect(updatedAb.layers.length).toBe(layerCount + 1)

      const newLayer = updatedAb.layers[updatedAb.layers.length - 1] as TextLayer
      expect(newLayer.type).toBe('text')
      expect(newLayer.text).toBe('')
      expect(newLayer.fontFamily).toBe('sans-serif')
      expect(newLayer.fontSize).toBe(24)

      expect(getTextEditState().active).toBe(true)
    })

    test('does nothing for nonexistent artboard', () => {
      createAndEditText(50, 50, 'nonexistent')
      expect(getTextEditState().active).toBe(false)
    })
  })

  describe('createAreaText', () => {
    test('creates area text layer with width/height', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      createAreaText(artboard.x + 10, artboard.y + 10, 200, 100, artboard.id)

      const updatedAb = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
      const newLayer = updatedAb.layers[updatedAb.layers.length - 1] as TextLayer
      expect(newLayer.type).toBe('text')
      expect(newLayer.textMode).toBe('area')
      expect(newLayer.textWidth).toBe(200)
      expect(newLayer.textHeight).toBe(100)

      expect(getTextEditState().active).toBe(true)
    })

    test('does nothing for nonexistent artboard', () => {
      createAreaText(10, 10, 200, 100, 'nonexistent')
      expect(getTextEditState().active).toBe(false)
    })
  })

  describe('endTextEdit', () => {
    test('deactivates text editing', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-end-1', 'World')
      beginTextEdit('te-end-1', artboard.id)
      expect(getTextEditState().active).toBe(true)

      endTextEdit()
      const st = getTextEditState()
      expect(st.active).toBe(false)
      expect(st.layerId).toBeNull()
      expect(st.artboardId).toBeNull()
    })

    test('does nothing when not active', () => {
      endTextEdit()
      expect(getTextEditState().active).toBe(false)
    })

    test('cancel=true deletes empty text layer', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-empty', '')
      beginTextEdit('te-empty', artboard.id)
      endTextEdit(true)

      const updatedAb = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
      const layer = updatedAb.layers.find((l) => l.id === 'te-empty')
      expect(layer).toBeUndefined()
    })

    test('cancel=true keeps non-empty text layer', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-nonempty', 'Keep me')
      beginTextEdit('te-nonempty', artboard.id)
      endTextEdit(true)

      const updatedAb = useEditorStore.getState().document.artboards.find((a) => a.id === artboard.id)!
      const layer = updatedAb.layers.find((l) => l.id === 'te-nonempty')
      expect(layer).toBeDefined()
    })
  })

  describe('textEditKeyDown', () => {
    test('returns false when not active', () => {
      const result = textEditKeyDown(makeKeyEvent('a'))
      expect(result).toBe(false)
    })

    test('inserts regular character', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-key-1', 'AB')
      beginTextEdit('te-key-1', artboard.id)

      // Cursor at end (pos 2)
      const result = textEditKeyDown(makeKeyEvent('C'))
      expect(result).toBe(true)

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-key-1') as TextLayer
      expect(layer.text).toBe('ABC')
      expect(getTextEditState().cursorPos).toBe(3)
    })

    test('Backspace deletes character before cursor', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-bs-1', 'Hello')
      beginTextEdit('te-bs-1', artboard.id)

      textEditKeyDown(makeKeyEvent('Backspace'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-bs-1') as TextLayer
      expect(layer.text).toBe('Hell')
    })

    test('Backspace at position 0 does nothing', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-bs-0', 'Hi')
      beginTextEdit('te-bs-0', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('Backspace'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-bs-0') as TextLayer
      expect(layer.text).toBe('Hi')
    })

    test('Delete removes character after cursor', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-del-1', 'Hello')
      beginTextEdit('te-del-1', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('Delete'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-del-1') as TextLayer
      expect(layer.text).toBe('ello')
    })

    test('Delete at end does nothing', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-del-end', 'Hi')
      beginTextEdit('te-del-end', artboard.id)
      // Cursor at end (pos 2)

      textEditKeyDown(makeKeyEvent('Delete'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-del-end') as TextLayer
      expect(layer.text).toBe('Hi')
    })

    test('Enter inserts newline', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-enter', 'AB')
      beginTextEdit('te-enter', artboard.id)
      getTextEditState().cursorPos = 1

      textEditKeyDown(makeKeyEvent('Enter'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-enter') as TextLayer
      expect(layer.text).toBe('A\nB')
      expect(getTextEditState().cursorPos).toBe(2)
    })

    test('Ctrl+Enter ends text edit', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-ctrlenter', 'Hi')
      beginTextEdit('te-ctrlenter', artboard.id)

      textEditKeyDown(makeKeyEvent('Enter', { ctrlKey: true }))
      expect(getTextEditState().active).toBe(false)
    })

    test('Escape cancels editing', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-esc', 'Bye')
      beginTextEdit('te-esc', artboard.id)

      textEditKeyDown(makeKeyEvent('Escape'))
      expect(getTextEditState().active).toBe(false)
    })

    test('Ctrl+A selects all', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-selall', 'Hello')
      beginTextEdit('te-selall', artboard.id)

      textEditKeyDown(makeKeyEvent('a', { ctrlKey: true }))
      const st = getTextEditState()
      expect(st.selectionStart).toBe(0)
      expect(st.selectionEnd).toBe(5)
      expect(st.cursorPos).toBe(5)
    })

    test('ArrowLeft moves cursor left', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-left', 'ABC')
      beginTextEdit('te-left', artboard.id)
      // Cursor at end (3)

      textEditKeyDown(makeKeyEvent('ArrowLeft'))
      expect(getTextEditState().cursorPos).toBe(2)
    })

    test('ArrowRight moves cursor right', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-right', 'ABC')
      beginTextEdit('te-right', artboard.id)
      getTextEditState().cursorPos = 1

      textEditKeyDown(makeKeyEvent('ArrowRight'))
      expect(getTextEditState().cursorPos).toBe(2)
    })

    test('ArrowLeft at position 0 stays at 0', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-left0', 'X')
      beginTextEdit('te-left0', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('ArrowLeft'))
      expect(getTextEditState().cursorPos).toBe(0)
    })

    test('ArrowRight at end stays at end', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-rightend', 'XY')
      beginTextEdit('te-rightend', artboard.id)
      // Cursor at end (2)

      textEditKeyDown(makeKeyEvent('ArrowRight'))
      expect(getTextEditState().cursorPos).toBe(2)
    })

    test('Shift+ArrowLeft creates selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-shiftleft', 'ABC')
      beginTextEdit('te-shiftleft', artboard.id)
      // Cursor at end (3)

      textEditKeyDown(makeKeyEvent('ArrowLeft', { shiftKey: true }))
      const st = getTextEditState()
      expect(st.selectionStart).toBe(3)
      expect(st.selectionEnd).toBe(2)
      expect(st.cursorPos).toBe(2)
    })

    test('Shift+ArrowRight extends selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-shiftright', 'ABC')
      beginTextEdit('te-shiftright', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('ArrowRight', { shiftKey: true }))
      const st = getTextEditState()
      expect(st.selectionStart).toBe(0)
      expect(st.selectionEnd).toBe(1)
    })

    test('ArrowLeft with selection collapses to start', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-lcollapse', 'ABCDE')
      beginTextEdit('te-lcollapse', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 3
      st.cursorPos = 3

      textEditKeyDown(makeKeyEvent('ArrowLeft'))
      expect(st.cursorPos).toBe(1)
      expect(st.selectionStart).toBeNull()
    })

    test('ArrowRight with selection collapses to end', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-rcollapse', 'ABCDE')
      beginTextEdit('te-rcollapse', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 3
      st.cursorPos = 1

      textEditKeyDown(makeKeyEvent('ArrowRight'))
      expect(st.cursorPos).toBe(3)
      expect(st.selectionStart).toBeNull()
    })

    test('Home moves cursor to start', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-home', 'Hello')
      beginTextEdit('te-home', artboard.id)

      textEditKeyDown(makeKeyEvent('Home'))
      expect(getTextEditState().cursorPos).toBe(0)
    })

    test('End moves cursor to end', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-end', 'Hello')
      beginTextEdit('te-end', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('End'))
      expect(getTextEditState().cursorPos).toBe(5)
    })

    test('Shift+Home creates selection to start', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-shifthome', 'Hello')
      beginTextEdit('te-shifthome', artboard.id)

      textEditKeyDown(makeKeyEvent('Home', { shiftKey: true }))
      const st = getTextEditState()
      expect(st.selectionStart).toBe(5)
      expect(st.selectionEnd).toBe(0)
      expect(st.cursorPos).toBe(0)
    })

    test('Shift+End creates selection to end', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-shiftend', 'Hello')
      beginTextEdit('te-shiftend', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('End', { shiftKey: true }))
      const st = getTextEditState()
      expect(st.selectionStart).toBe(0)
      expect(st.selectionEnd).toBe(5)
    })

    test('ArrowUp in multiline text', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-up', 'AB\nCD\nEF')
      beginTextEdit('te-up', artboard.id)
      // Cursor at position 5 (start of 'E' in line 3, character index: A B \n C D \n E)
      getTextEditState().cursorPos = 6

      textEditKeyDown(makeKeyEvent('ArrowUp'))
      // Should move to same column in previous line
      expect(getTextEditState().cursorPos).toBe(3) // 'C' position
    })

    test('ArrowDown in multiline text', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-down', 'AB\nCD\nEF')
      beginTextEdit('te-down', artboard.id)
      getTextEditState().cursorPos = 0

      textEditKeyDown(makeKeyEvent('ArrowDown'))
      expect(getTextEditState().cursorPos).toBe(3) // 'C' position
    })

    test('ArrowUp on first line stays on first line', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-up0', 'ABC')
      beginTextEdit('te-up0', artboard.id)
      getTextEditState().cursorPos = 1

      textEditKeyDown(makeKeyEvent('ArrowUp'))
      // Should not change much (no previous line)
      expect(getTextEditState().cursorPos).toBe(1) // stays
    })

    test('ArrowDown on last line stays on last line', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-down-last', 'ABC')
      beginTextEdit('te-down-last', artboard.id)
      getTextEditState().cursorPos = 1

      textEditKeyDown(makeKeyEvent('ArrowDown'))
      expect(getTextEditState().cursorPos).toBe(1) // stays
    })

    test('Backspace with selection deletes selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-bssel', 'ABCDE')
      beginTextEdit('te-bssel', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 3
      st.cursorPos = 3

      textEditKeyDown(makeKeyEvent('Backspace'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-bssel') as TextLayer
      expect(layer.text).toBe('ADE')
      expect(st.cursorPos).toBe(1)
    })

    test('Delete with selection deletes selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-delsel', 'ABCDE')
      beginTextEdit('te-delsel', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 2
      st.selectionEnd = 4
      st.cursorPos = 4

      textEditKeyDown(makeKeyEvent('Delete'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-delsel') as TextLayer
      expect(layer.text).toBe('ABE')
      expect(st.cursorPos).toBe(2)
    })

    test('Enter with selection replaces selection with newline', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-entersel', 'ABCDE')
      beginTextEdit('te-entersel', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 3
      st.cursorPos = 3

      textEditKeyDown(makeKeyEvent('Enter'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-entersel') as TextLayer
      expect(layer.text).toBe('A\nDE')
      expect(st.cursorPos).toBe(2)
    })

    test('typing with selection replaces selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-typesel', 'ABCDE')
      beginTextEdit('te-typesel', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 4
      st.cursorPos = 4

      textEditKeyDown(makeKeyEvent('X'))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-typesel') as TextLayer
      expect(layer.text).toBe('AXE')
    })

    test('Ctrl+C with selection (copy) returns true', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-copy', 'Hello')
      beginTextEdit('te-copy', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 0
      st.selectionEnd = 5
      st.cursorPos = 5

      // Mock navigator.clipboard for test environment
      if (typeof navigator === 'undefined') (globalThis as any).navigator = {}
      if (!(navigator as any).clipboard) {
        ;(navigator as any).clipboard = {
          writeText: () => Promise.resolve(),
          readText: () => Promise.resolve(''),
        }
      }

      const result = textEditKeyDown(makeKeyEvent('c', { ctrlKey: true }))
      expect(result).toBe(true)
    })

    test('Ctrl+X with selection (cut) removes text', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-cut', 'Hello')
      beginTextEdit('te-cut', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 4
      st.cursorPos = 4

      if (typeof navigator === 'undefined') (globalThis as any).navigator = {}
      if (!(navigator as any).clipboard) {
        ;(navigator as any).clipboard = {
          writeText: () => Promise.resolve(),
          readText: () => Promise.resolve(''),
        }
      }

      textEditKeyDown(makeKeyEvent('x', { ctrlKey: true }))

      const layer = useEditorStore
        .getState()
        .document.artboards.find((a) => a.id === artboard.id)!
        .layers.find((l) => l.id === 'te-cut') as TextLayer
      expect(layer.text).toBe('Ho')
    })

    test('Ctrl+V (paste) returns true', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-paste', 'AB')
      beginTextEdit('te-paste', artboard.id)

      if (typeof navigator === 'undefined') (globalThis as any).navigator = {}
      if (!(navigator as any).clipboard) {
        ;(navigator as any).clipboard = {
          writeText: () => Promise.resolve(),
          readText: () => Promise.resolve('pasted'),
        }
      }

      const result = textEditKeyDown(makeKeyEvent('v', { ctrlKey: true }))
      expect(result).toBe(true)
    })

    test('returns false for unhandled modifier combos', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-unhandled', 'Hi')
      beginTextEdit('te-unhandled', artboard.id)

      const result = textEditKeyDown(makeKeyEvent('z', { ctrlKey: true }))
      expect(result).toBe(false)
    })
  })

  describe('renderTextEditOverlay', () => {
    test('does nothing when not active', () => {
      const ctx = mockCtx()
      renderTextEditOverlay(ctx, 0, 0, 1)
      // Should not throw
    })

    test('renders overlay when active', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-render', 'Hello\nWorld')
      beginTextEdit('te-render', artboard.id)

      const ctx = mockCtx()
      renderTextEditOverlay(ctx, artboard.x, artboard.y, 1)
      // Should not throw
    })

    test('renders overlay with selection', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      addTextLayer(artboard.id, 'te-render-sel', 'Hello')
      beginTextEdit('te-render-sel', artboard.id)
      const st = getTextEditState()
      st.selectionStart = 1
      st.selectionEnd = 3

      const ctx = mockCtx()
      renderTextEditOverlay(ctx, artboard.x, artboard.y, 1)
      // Should not throw
    })

    test('renders area text overlay', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      createAreaText(artboard.x + 10, artboard.y + 10, 200, 100, artboard.id)
      // createAreaText starts editing

      const ctx = mockCtx()
      renderTextEditOverlay(ctx, artboard.x, artboard.y, 1)
      // Should not throw
    })

    test('renders with italic and bold styles', () => {
      const store = useEditorStore.getState()
      const artboard = store.document.artboards[0]
      if (!artboard) return

      const layer: TextLayer = {
        id: 'te-styled',
        name: 'Styled',
        type: 'text',
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 45 },
        effects: [],
        text: 'Bold Italic',
        fontFamily: 'serif',
        fontSize: 32,
        fontWeight: 'bold',
        fontStyle: 'italic',
        textAlign: 'left',
        lineHeight: 1.4,
        letterSpacing: 0,
        color: '#ff0000',
      }
      store.addLayer(artboard.id, layer as any)
      beginTextEdit('te-styled', artboard.id)

      const ctx = mockCtx()
      renderTextEditOverlay(ctx, artboard.x, artboard.y, 2)
      // Should not throw - verifies rotation, bold, italic code paths
    })
  })
})
