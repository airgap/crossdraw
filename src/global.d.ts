// File System Access API — not yet in all TS libs
interface FileSystemFileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: ArrayBuffer | Blob | string): Promise<void>
  close(): Promise<void>
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[]
  multiple?: boolean
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface Window {
  showOpenFilePicker?: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

// Injected by Vite at build time from package.json
declare const __APP_VERSION__: string
