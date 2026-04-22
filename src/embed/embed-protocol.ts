/**
 * postMessage protocol spoken by the embedded iframe and its host.
 *
 * The host loads `https://.../?embed=true` in an iframe and exchanges
 * JSON messages with the inner window. All message types are namespaced
 * with `crossdraw:` so the host can filter foreign traffic.
 */

export type EditorMode = 'full' | 'pngtuber' | 'attachment'

export type ExportFormat = 'png' | 'jpeg' | 'webp'

// ── host → iframe ──────────────────────────────────────────────────

export interface ConfigMessage {
  type: 'crossdraw:config'
  payload: {
    mode?: EditorMode
    /** Optional theme token overrides (CSS custom property values). */
    theme?: Record<string, string>
  }
}

export interface LoadImageMessage {
  type: 'crossdraw:load-image'
  payload: {
    /** Raw encoded image bytes (PNG, JPEG, WebP, GIF). */
    bytes: ArrayBuffer | Uint8Array | number[]
    /** MIME type of the bytes. Used only for round-tripping on export. */
    mimeType?: string
    /** Display name, retained for the exported file. */
    name?: string
  }
}

export interface LoadDocumentMessage {
  type: 'crossdraw:load'
  payload: {
    /** Encoded .crow file. */
    buffer: ArrayBuffer | Uint8Array | number[]
  }
}

export interface ExportImageMessage {
  type: 'crossdraw:export-image'
  payload?: {
    format?: ExportFormat
    quality?: number
    scale?: number
  }
}

export interface ExportDocumentMessage {
  type: 'crossdraw:export'
}

export type HostMessage =
  | ConfigMessage
  | LoadImageMessage
  | LoadDocumentMessage
  | ExportImageMessage
  | ExportDocumentMessage

// ── iframe → host ──────────────────────────────────────────────────

export interface ReadyMessage {
  type: 'crossdraw:ready'
}

export interface SaveImageMessage {
  type: 'crossdraw:save-image'
  payload: {
    bytes: number[]
    mimeType: string
    name?: string
  }
}

export interface CancelMessage {
  type: 'crossdraw:cancel'
}

export interface ExportedImageMessage {
  type: 'crossdraw:exported'
  payload: {
    bytes: number[]
    mimeType: string
  }
}

export interface SaveDocumentMessage {
  type: 'crossdraw:save'
  payload: {
    buffer: number[]
  }
}

export interface DirtyChangedMessage {
  type: 'crossdraw:dirty-changed'
  payload: { dirty: boolean }
}

export type FrameMessage =
  | ReadyMessage
  | SaveImageMessage
  | CancelMessage
  | ExportedImageMessage
  | SaveDocumentMessage
  | DirtyChangedMessage

export const EMBED_FLAG_PARAM = 'embed'
export const EMBED_MODE_PARAM = 'mode'
