const STORAGE_KEY = 'crossdraw:recent-files'
const MAX_ENTRIES = 20

export interface RecentFileEntry {
  /** File name */
  name: string
  /** File path (Electron) or IndexedDB key (web) */
  path: string
  /** ISO date string */
  lastOpened: string
  /** Document dimensions */
  width: number
  height: number
}

export function getRecentFiles(): RecentFileEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored) as RecentFileEntry[]
  } catch {
    return []
  }
}

export function addRecentFile(entry: Omit<RecentFileEntry, 'lastOpened'>) {
  const files = getRecentFiles().filter((f) => f.path !== entry.path)
  files.unshift({ ...entry, lastOpened: new Date().toISOString() })
  if (files.length > MAX_ENTRIES) files.length = MAX_ENTRIES
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch {}
}

export function removeRecentFile(path: string) {
  const files = getRecentFiles().filter((f) => f.path !== path)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch {}
}

export function clearRecentFiles() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
