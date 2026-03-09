/**
 * Persist/restore the last open document to IndexedDB so it survives page reload.
 * Uses the binary .xd format for compact, lossless round-tripping.
 */
import { useEditorStore } from '@/store/editor.store'
import { encodeDocument, decodeDocument } from '@/io/file-format'

const DB_NAME = 'crossdraw'
const DB_VERSION = 1
const STORE_NAME = 'session'
const KEY = 'last-document'

/** Debounce timer handle */
let saveTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 2000

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Save the current document to IndexedDB. */
async function persistDocument(): Promise<void> {
  try {
    const doc = useEditorStore.getState().document
    const buffer = encodeDocument(doc)
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(buffer, KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Non-critical — silently fail
  }
}

/** Try to restore the last document from IndexedDB. Returns true if restored. */
export async function restoreLastDocument(): Promise<boolean> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(KEY)
    const result = await new Promise<ArrayBuffer | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined)
      req.onerror = () => reject(req.error)
    })
    db.close()

    if (!result || !(result instanceof ArrayBuffer) || result.byteLength < 16) return false

    const doc = decodeDocument(result)
    useEditorStore.setState({
      document: doc,
      history: [],
      historyIndex: -1,
      selection: { layerIds: [] },
      isDirty: false,
      filePath: null,
    })
    return true
  } catch {
    return false
  }
}

/** Clear the persisted document (e.g. when user explicitly creates new). */
export async function clearPersistedDocument(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Non-critical
  }
}

/** Debounced save — call on every document change. */
function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    persistDocument()
    saveTimer = null
  }, DEBOUNCE_MS)
}

/** Subscribe to store changes and auto-persist. Call once on app boot. */
export function setupSessionPersist() {
  let prevDoc = useEditorStore.getState().document
  useEditorStore.subscribe((state) => {
    if (state.document !== prevDoc) {
      prevDoc = state.document
      schedulePersist()
    }
  })
}
