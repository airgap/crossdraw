/**
 * Paragraph / Character Styles (#84)
 *
 * Named text style definitions that can be applied to text layers.
 * Styles are persisted both in the document model (for portability) and
 * in localStorage (for cross-document reuse).
 *
 * Character styles control font appearance (family, size, weight, color,
 * spacing); paragraph styles control block-level formatting (alignment,
 * line height, indentation, spacing).
 */

import { v4 as uuid } from 'uuid'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CharacterStyle {
  id: string
  name: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  color: string
  letterSpacing: number
  textDecoration: 'none' | 'underline' | 'line-through'
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
}

export interface ParagraphStyle {
  id: string
  name: string
  alignment: 'left' | 'center' | 'right'
  lineHeight: number
  indent: number
  spaceBefore: number
  spaceAfter: number
  firstLineIndent: number
}

export interface TextStyleCollection {
  characterStyles: CharacterStyle[]
  paragraphStyles: ParagraphStyle[]
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export function createDefaultCharacterStyle(name: string = 'Untitled'): CharacterStyle {
  return {
    id: uuid(),
    name,
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#000000',
    letterSpacing: 0,
    textDecoration: 'none',
    textTransform: 'none',
  }
}

export function createDefaultParagraphStyle(name: string = 'Untitled'): ParagraphStyle {
  return {
    id: uuid(),
    name,
    alignment: 'left',
    lineHeight: 1.2,
    indent: 0,
    spaceBefore: 0,
    spaceAfter: 0,
    firstLineIndent: 0,
  }
}

// ── CRUD operations ──────────────────────────────────────────────────────────

export class TextStyleManager {
  private collection: TextStyleCollection

  constructor(initial?: TextStyleCollection) {
    this.collection = initial ?? { characterStyles: [], paragraphStyles: [] }
  }

  // ── Character styles ──

  getCharacterStyles(): CharacterStyle[] {
    return [...this.collection.characterStyles]
  }

  getCharacterStyle(id: string): CharacterStyle | undefined {
    return this.collection.characterStyles.find((s) => s.id === id)
  }

  createCharacterStyle(name: string, overrides?: Partial<CharacterStyle>): CharacterStyle {
    const style = { ...createDefaultCharacterStyle(name), ...overrides, id: uuid(), name }
    this.collection.characterStyles.push(style)
    this.persist()
    return style
  }

  updateCharacterStyle(id: string, updates: Partial<Omit<CharacterStyle, 'id'>>): CharacterStyle | null {
    const idx = this.collection.characterStyles.findIndex((s) => s.id === id)
    if (idx === -1) return null
    const updated = { ...this.collection.characterStyles[idx]!, ...updates }
    this.collection.characterStyles[idx] = updated
    this.persist()
    return updated
  }

  deleteCharacterStyle(id: string): boolean {
    const before = this.collection.characterStyles.length
    this.collection.characterStyles = this.collection.characterStyles.filter((s) => s.id !== id)
    const deleted = this.collection.characterStyles.length < before
    if (deleted) this.persist()
    return deleted
  }

  // ── Paragraph styles ──

  getParagraphStyles(): ParagraphStyle[] {
    return [...this.collection.paragraphStyles]
  }

  getParagraphStyle(id: string): ParagraphStyle | undefined {
    return this.collection.paragraphStyles.find((s) => s.id === id)
  }

  createParagraphStyle(name: string, overrides?: Partial<ParagraphStyle>): ParagraphStyle {
    const style = { ...createDefaultParagraphStyle(name), ...overrides, id: uuid(), name }
    this.collection.paragraphStyles.push(style)
    this.persist()
    return style
  }

  updateParagraphStyle(id: string, updates: Partial<Omit<ParagraphStyle, 'id'>>): ParagraphStyle | null {
    const idx = this.collection.paragraphStyles.findIndex((s) => s.id === id)
    if (idx === -1) return null
    const updated = { ...this.collection.paragraphStyles[idx]!, ...updates }
    this.collection.paragraphStyles[idx] = updated
    this.persist()
    return updated
  }

  deleteParagraphStyle(id: string): boolean {
    const before = this.collection.paragraphStyles.length
    this.collection.paragraphStyles = this.collection.paragraphStyles.filter((s) => s.id !== id)
    const deleted = this.collection.paragraphStyles.length < before
    if (deleted) this.persist()
    return deleted
  }

  // ── Serialization ──

  toJSON(): TextStyleCollection {
    return structuredClone(this.collection)
  }

  static fromJSON(json: TextStyleCollection): TextStyleManager {
    return new TextStyleManager(structuredClone(json))
  }

  // ── localStorage persistence ──

  private static readonly STORAGE_KEY = 'crossdraw:text-styles'

  private persist(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TextStyleManager.STORAGE_KEY, JSON.stringify(this.collection))
      }
    } catch {
      // localStorage may be unavailable (SSR, private browsing quota)
    }
  }

  static loadFromStorage(): TextStyleManager {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(TextStyleManager.STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as TextStyleCollection
          return new TextStyleManager(parsed)
        }
      }
    } catch {
      // Ignore parse errors
    }
    return new TextStyleManager()
  }
}
