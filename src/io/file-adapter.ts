export interface RecentFile {
  path: string
  title: string
  lastOpened: string // ISO8601
}

export interface FileAdapter {
  open: () => Promise<ArrayBuffer | null>
  save: (data: ArrayBuffer, defaultName: string) => Promise<boolean>
  saveAs: (data: ArrayBuffer, filename: string) => Promise<boolean>
  exportAs: (data: Blob, filename: string, mimeType: string) => Promise<boolean>
  getRecentFiles: () => Promise<RecentFile[]>
}

/**
 * Browser implementation using File System Access API with fallbacks.
 */
export class BrowserFileAdapter implements FileAdapter {
  private fileHandle: FileSystemFileHandle | null = null

  async open(): Promise<ArrayBuffer | null> {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await window.showOpenFilePicker!({
          types: [
            {
              description: 'Design files',
              accept: { 'application/x-design': ['.design'] },
            },
          ],
        })
        if (!handle) return null
        this.fileHandle = handle
        const file = await handle.getFile()
        return file.arrayBuffer()
      }
      // Fallback: <input type="file">
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.design'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return resolve(null)
          resolve(file.arrayBuffer())
        }
        input.click()
      })
    } catch {
      return null // user cancelled
    }
  }

  async save(data: ArrayBuffer, defaultName: string): Promise<boolean> {
    if (this.fileHandle) {
      try {
        const writable = await this.fileHandle.createWritable()
        await writable.write(data)
        await writable.close()
        return true
      } catch {
        return false
      }
    }
    return this.saveAs(data, defaultName)
  }

  async saveAs(data: ArrayBuffer, filename: string): Promise<boolean> {
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await window.showSaveFilePicker!({
          suggestedName: filename,
          types: [
            {
              description: 'Design files',
              accept: { 'application/x-design': ['.design'] },
            },
          ],
        })
        this.fileHandle = handle
        const writable = await handle.createWritable()
        await writable.write(data)
        await writable.close()
        return true
      }
      // Fallback: download link
      this.downloadBlob(new Blob([data]), filename)
      return true
    } catch {
      return false
    }
  }

  async exportAs(data: Blob, filename: string, _mimeType: string): Promise<boolean> {
    try {
      if ('showSaveFilePicker' in window) {
        const ext = filename.split('.').pop() ?? ''
        const types: Record<string, string[]> = {
          svg: ['.svg'],
          png: ['.png'],
          jpg: ['.jpg', '.jpeg'],
        }
        const handle = await window.showSaveFilePicker!({
          suggestedName: filename,
          types: [
            {
              description: `${ext.toUpperCase()} file`,
              accept: { [`image/${ext}`]: types[ext] ?? [`.${ext}`] },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(data)
        await writable.close()
        return true
      }
      this.downloadBlob(data, filename)
      return true
    } catch {
      return false
    }
  }

  async getRecentFiles(): Promise<RecentFile[]> {
    // Browser has no persistent recent files without IndexedDB; return empty for now
    return []
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
