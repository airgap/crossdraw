import type { Effect, BlurParams, ShadowParams, GlowParams, InnerShadowParams, BackgroundBlurParams } from '@/types'

/**
 * Apply layer effects by rendering to a temporary OffscreenCanvas
 * and compositing back. Returns the OffscreenCanvas with effects applied,
 * or null if no effects need a separate pass.
 */
export function applyEffects(sourceCanvas: OffscreenCanvas, effects: Effect[]): OffscreenCanvas {
  let current = sourceCanvas

  for (const effect of effects) {
    if (!effect.enabled) continue

    switch (effect.params.kind) {
      case 'blur':
        current = applyBlur(current, effect.params, effect.opacity)
        break
      case 'shadow':
        current = applyShadow(current, effect.params, effect.opacity)
        break
      case 'glow':
        current = applyOuterGlow(current, effect.params as GlowParams, effect.opacity)
        break
      case 'inner-shadow':
        current = applyInnerShadow(current, effect.params as InnerShadowParams, effect.opacity)
        break
      case 'background-blur':
        current = applyBackgroundBlur(current, effect.params as BackgroundBlurParams)
        break
    }
  }

  return current
}

function applyBlur(source: OffscreenCanvas, params: BlurParams, opacity: number): OffscreenCanvas {
  if (params.radius <= 0) return source

  // Expand canvas to accommodate blur overflow
  const pad = Math.ceil(params.radius * 3)
  const out = new OffscreenCanvas(source.width + pad * 2, source.height + pad * 2)
  const ctx = out.getContext('2d')!

  ctx.filter = `blur(${params.radius}px)`
  ctx.globalAlpha = opacity
  ctx.drawImage(source, pad, pad)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  return out
}

function applyShadow(source: OffscreenCanvas, params: ShadowParams, _opacity: number): OffscreenCanvas {
  // Expand canvas to accommodate shadow
  const pad = Math.ceil(
    params.blurRadius * 3 + Math.max(Math.abs(params.offsetX), Math.abs(params.offsetY)) + params.spread,
  )
  const out = new OffscreenCanvas(source.width + pad * 2, source.height + pad * 2)
  const ctx = out.getContext('2d')!

  // Draw shadow first (behind)
  ctx.shadowColor = params.color
  ctx.shadowBlur = params.blurRadius
  ctx.shadowOffsetX = params.offsetX
  ctx.shadowOffsetY = params.offsetY
  ctx.globalAlpha = params.opacity
  ctx.drawImage(source, pad, pad)

  // Draw original on top without shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.globalAlpha = 1
  ctx.drawImage(source, pad, pad)

  return out
}

function applyOuterGlow(source: OffscreenCanvas, params: GlowParams, _opacity: number): OffscreenCanvas {
  const pad = Math.ceil((params.radius + params.spread) * 3)
  const out = new OffscreenCanvas(source.width + pad * 2, source.height + pad * 2)
  const ctx = out.getContext('2d')!

  // Draw the glow: colorize + blur the source shape
  const glowCanvas = new OffscreenCanvas(out.width, out.height)
  const glowCtx = glowCanvas.getContext('2d')!
  glowCtx.drawImage(source, pad, pad)
  // Colorize by drawing a solid color over the source using source-in
  glowCtx.globalCompositeOperation = 'source-in'
  glowCtx.fillStyle = params.color
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height)
  glowCtx.globalCompositeOperation = 'source-over'

  // Blur the glow
  ctx.filter = `blur(${params.radius}px)`
  ctx.globalAlpha = params.opacity
  ctx.drawImage(glowCanvas, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  // Draw original on top
  ctx.drawImage(source, pad, pad)

  return out
}

function applyInnerShadow(source: OffscreenCanvas, params: InnerShadowParams, _opacity: number): OffscreenCanvas {
  const out = new OffscreenCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!

  // Draw original
  ctx.drawImage(source, 0, 0)

  // Create inner shadow: draw shadow into a temp canvas clipped to the source shape
  const temp = new OffscreenCanvas(source.width, source.height)
  const tCtx = temp.getContext('2d')!

  // Use the source as a clip mask (destination-in)
  tCtx.drawImage(source, 0, 0)
  tCtx.globalCompositeOperation = 'source-in'

  // Draw an inverted shadow (large rect with shadow, offset)
  tCtx.shadowColor = params.color
  tCtx.shadowBlur = params.blurRadius
  tCtx.shadowOffsetX = params.offsetX
  tCtx.shadowOffsetY = params.offsetY
  tCtx.fillStyle = params.color
  // Draw outside the canvas bounds so only the shadow appears inside
  tCtx.fillRect(-source.width - 100, -source.height - 100, source.width * 3 + 200, source.height * 3 + 200)

  // Composite inner shadow on top
  ctx.globalAlpha = params.opacity
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(temp, 0, 0)

  return out
}

function applyBackgroundBlur(source: OffscreenCanvas, params: BackgroundBlurParams): OffscreenCanvas {
  if (params.radius <= 0) return source

  const out = new OffscreenCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!

  // Apply blur to the entire source
  ctx.filter = `blur(${params.radius}px)`
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'

  // Draw original on top (unblurred content stays, blurred background shows through transparent areas)
  ctx.drawImage(source, 0, 0)

  return out
}

/** Check if a layer has any enabled effects that need a render pass. */
export function hasActiveEffects(effects: Effect[]): boolean {
  return effects.some((e) => e.enabled)
}
