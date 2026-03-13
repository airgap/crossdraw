import type { CharacterTransform, TextLayer } from '@/types'

// ── Touch Type state ───────────────────────────────────────────

interface TouchTypeState {
  active: boolean
  layerId: string | null
  selectedCharIndex: number | null
}

let state: TouchTypeState = {
  active: false,
  layerId: null,
  selectedCharIndex: null,
}

// ── Lifecycle ──────────────────────────────────────────────────

/**
 * Enter Touch Type editing mode for a text layer.
 * This enables per-character selection and transformation.
 */
export function beginTouchType(textLayer: TextLayer): void {
  state = {
    active: true,
    layerId: textLayer.id,
    selectedCharIndex: null,
  }
}

/**
 * Exit Touch Type editing mode.
 */
export function endTouchType(): void {
  state = {
    active: false,
    layerId: null,
    selectedCharIndex: null,
  }
}

/**
 * Check whether Touch Type mode is currently active.
 */
export function isTouchTypeActive(): boolean {
  return state.active
}

/**
 * Get the current Touch Type state.
 */
export function getTouchTypeState(): Readonly<TouchTypeState> {
  return state
}

// ── Character selection ────────────────────────────────────────

/**
 * Select a character for transformation by its index in the text string.
 *
 * @param index - Character index (0-based). Pass null to deselect.
 */
export function selectCharacter(index: number | null): void {
  state.selectedCharIndex = index
}

/**
 * Get the currently selected character index, or null if none selected.
 */
export function getSelectedCharIndex(): number | null {
  return state.selectedCharIndex
}

// ── Character transform helpers ────────────────────────────────

/**
 * Create a default (identity) character transform for a given index.
 */
export function defaultCharacterTransform(charIndex: number): CharacterTransform {
  return {
    charIndex,
    x: 0,
    y: 0,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  }
}

/**
 * Get or create the transform for a specific character index.
 * If the transform does not exist yet, a default is created.
 */
export function getCharTransform(transforms: CharacterTransform[] | undefined, charIndex: number): CharacterTransform {
  const existing = transforms?.find((t) => t.charIndex === charIndex)
  return existing ?? defaultCharacterTransform(charIndex)
}

/**
 * Apply a delta to a character's transform.
 * Returns a new array of character transforms (immutable update).
 *
 * @param existing - Current transforms array (may be undefined)
 * @param charIndex - Index of the character to transform
 * @param delta - Partial transform values to add/merge
 * @returns Updated transforms array
 */
export function transformCharacter(
  existing: CharacterTransform[] | undefined,
  charIndex: number,
  delta: Partial<Omit<CharacterTransform, 'charIndex'>>,
): CharacterTransform[] {
  const transforms = existing ? [...existing] : []
  const idx = transforms.findIndex((t) => t.charIndex === charIndex)
  const current = idx >= 0 ? transforms[idx]! : defaultCharacterTransform(charIndex)

  const updated: CharacterTransform = {
    charIndex,
    x: current.x + (delta.x ?? 0),
    y: current.y + (delta.y ?? 0),
    rotation: current.rotation + (delta.rotation ?? 0),
    scaleX: current.scaleX * (delta.scaleX ?? 1),
    scaleY: current.scaleY * (delta.scaleY ?? 1),
  }

  if (idx >= 0) {
    transforms[idx] = updated
  } else {
    transforms.push(updated)
  }

  return transforms
}

/**
 * Set absolute values for a character's transform (replacing, not adding).
 * Returns a new array of character transforms (immutable update).
 */
export function setCharacterTransform(
  existing: CharacterTransform[] | undefined,
  charIndex: number,
  values: Partial<Omit<CharacterTransform, 'charIndex'>>,
): CharacterTransform[] {
  const transforms = existing ? [...existing] : []
  const idx = transforms.findIndex((t) => t.charIndex === charIndex)
  const current = idx >= 0 ? transforms[idx]! : defaultCharacterTransform(charIndex)

  const updated: CharacterTransform = {
    charIndex,
    x: values.x ?? current.x,
    y: values.y ?? current.y,
    rotation: values.rotation ?? current.rotation,
    scaleX: values.scaleX ?? current.scaleX,
    scaleY: values.scaleY ?? current.scaleY,
  }

  if (idx >= 0) {
    transforms[idx] = updated
  } else {
    transforms.push(updated)
  }

  return transforms
}

/**
 * Reset a character's transform back to identity.
 * Returns a new array with the transform removed.
 */
export function resetCharacterTransform(
  existing: CharacterTransform[] | undefined,
  charIndex: number,
): CharacterTransform[] {
  if (!existing) return []
  return existing.filter((t) => t.charIndex !== charIndex)
}

/**
 * Reset all character transforms.
 */
export function resetAllCharacterTransforms(): CharacterTransform[] {
  return []
}

// ── Rendering ──────────────────────────────────────────────────

/**
 * Render text with per-character transforms applied.
 *
 * Each character is drawn individually at its computed position, with rotation
 * and scale applied around the character's center.
 *
 * @param ctx - Canvas 2D context
 * @param textLayer - The text layer to render
 */
export function renderTouchType(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  textLayer: TextLayer,
): void {
  const text = textLayer.text
  if (!text) return

  const transforms = textLayer.characterTransforms
  const style = textLayer.fontStyle === 'italic' ? 'italic' : 'normal'
  const weight = textLayer.fontWeight === 'bold' ? 'bold' : 'normal'
  const fontStr = `${style} ${weight} ${textLayer.fontSize}px ${textLayer.fontFamily}`

  ctx.save()
  ctx.font = fontStr
  ctx.fillStyle = textLayer.color
  ctx.textBaseline = 'alphabetic'

  // Measure each character to get its advance width
  let cursorX = 0
  const lineHeight = textLayer.fontSize * textLayer.lineHeight

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\n') {
      cursorX = 0
      ctx.translate(0, lineHeight)
      continue
    }

    const metrics = ctx.measureText(ch)
    const charWidth = metrics.width
    const ct = getCharTransform(transforms, i)

    // Position = base cursor + character offset
    const baseX = cursorX + ct.x
    const baseY = ct.y

    ctx.save()

    // Translate to character center for rotation/scale
    const centerX = baseX + charWidth / 2
    const centerY = baseY - textLayer.fontSize / 2

    ctx.translate(centerX, centerY)
    ctx.rotate((ct.rotation * Math.PI) / 180)
    ctx.scale(ct.scaleX, ct.scaleY)
    ctx.translate(-centerX, -centerY)

    // Apply letter spacing
    ctx.fillText(ch, baseX, baseY)

    ctx.restore()

    cursorX += charWidth + textLayer.letterSpacing
  }

  ctx.restore()
}

/**
 * Hit-test a point against individual characters in Touch Type mode.
 * Returns the character index at the given position, or null if no hit.
 *
 * @param ctx - Canvas 2D context (used for text measurement)
 * @param textLayer - The text layer
 * @param px - X coordinate to test (in layer-local space)
 * @param py - Y coordinate to test (in layer-local space)
 * @returns Character index or null
 */
export function hitTestCharacter(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  textLayer: TextLayer,
  px: number,
  py: number,
): number | null {
  const text = textLayer.text
  if (!text) return null

  const transforms = textLayer.characterTransforms
  const style = textLayer.fontStyle === 'italic' ? 'italic' : 'normal'
  const weight = textLayer.fontWeight === 'bold' ? 'bold' : 'normal'
  ctx.font = `${style} ${weight} ${textLayer.fontSize}px ${textLayer.fontFamily}`

  let cursorX = 0
  let cursorY = 0
  const lineHeight = textLayer.fontSize * textLayer.lineHeight

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\n') {
      cursorX = 0
      cursorY += lineHeight
      continue
    }

    const charWidth = ctx.measureText(ch).width
    const ct = getCharTransform(transforms, i)

    const charX = cursorX + ct.x
    const charY = cursorY + ct.y - textLayer.fontSize

    // Simple AABB hit test (does not account for rotation/scale)
    if (
      px >= charX &&
      px <= charX + charWidth * ct.scaleX &&
      py >= charY &&
      py <= charY + textLayer.fontSize * ct.scaleY
    ) {
      return i
    }

    cursorX += charWidth + textLayer.letterSpacing
  }

  return null
}
