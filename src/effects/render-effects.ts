import type {
  Effect,
  BlurParams,
  ShadowParams,
  GlowParams,
  InnerShadowParams,
  BackgroundBlurParams,
  NoiseEffectParams,
  SharpenEffectParams,
  MotionBlurEffectParams,
  RadialBlurEffectParams,
  ColorAdjustEffectParams,
  WaveEffectParams,
  TwirlEffectParams,
  PinchEffectParams,
  SpherizeEffectParams,
  ProgressiveBlurParams,
} from '@/types'
import { applyGaussianNoise, applyUniformNoise, applyFilmGrain } from '@/filters/noise'
import { applySharpen } from '@/filters/sharpen'
import { applyMotionBlur, applyRadialBlur } from '@/filters/motion-blur'
import {
  applyPosterize,
  applyThreshold,
  applyInvert,
  applyDesaturate,
  applyVibrance,
  applyChannelMixer,
} from '@/filters/color-adjust'
import { applyWave, applyTwirl, applyPinch, applySphereize } from '@/filters/distort'
import { applyProgressiveBlur } from '@/filters/progressive-blur'

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
        current = applyBlurEffect(current, effect.params, effect.opacity)
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
        current = applyBackgroundBlurEffect(current, effect.params as BackgroundBlurParams)
        break
      case 'progressive-blur':
        current = applyProgressiveBlurEffect(current, effect.params as ProgressiveBlurParams)
        break
      case 'noise':
        current = applyNoiseEffect(current, effect.params as NoiseEffectParams)
        break
      case 'sharpen':
        current = applySharpenEffect(current, effect.params as SharpenEffectParams)
        break
      case 'motion-blur':
        current = applyMotionBlurEffect(current, effect.params as MotionBlurEffectParams)
        break
      case 'radial-blur':
        current = applyRadialBlurEffect(current, effect.params as RadialBlurEffectParams)
        break
      case 'color-adjust':
        current = applyColorAdjustEffect(current, effect.params as ColorAdjustEffectParams)
        break
      case 'wave':
        current = applyWaveEffect(current, effect.params as WaveEffectParams)
        break
      case 'twirl':
        current = applyTwirlEffect(current, effect.params as TwirlEffectParams)
        break
      case 'pinch':
        current = applyPinchEffect(current, effect.params as PinchEffectParams)
        break
      case 'spherize':
        current = applySpherizeEffect(current, effect.params as SpherizeEffectParams)
        break
    }
  }

  return current
}

// ── Helpers: get/put ImageData on an OffscreenCanvas ──

function getPixels(canvas: OffscreenCanvas): ImageData {
  const ctx = canvas.getContext('2d')!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

function putPixels(_canvas: OffscreenCanvas, imageData: ImageData): OffscreenCanvas {
  const out = new OffscreenCanvas(imageData.width, imageData.height)
  out.getContext('2d')!.putImageData(imageData, 0, 0)
  return out
}

// ── Existing effects ──

function applyBlurEffect(source: OffscreenCanvas, params: BlurParams, opacity: number): OffscreenCanvas {
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

  const glowCanvas = new OffscreenCanvas(out.width, out.height)
  const glowCtx = glowCanvas.getContext('2d')!
  glowCtx.drawImage(source, pad, pad)
  glowCtx.globalCompositeOperation = 'source-in'
  glowCtx.fillStyle = params.color
  glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height)
  glowCtx.globalCompositeOperation = 'source-over'

  ctx.filter = `blur(${params.radius}px)`
  ctx.globalAlpha = params.opacity
  ctx.drawImage(glowCanvas, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1

  ctx.drawImage(source, pad, pad)

  return out
}

function applyInnerShadow(source: OffscreenCanvas, params: InnerShadowParams, _opacity: number): OffscreenCanvas {
  const out = new OffscreenCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!

  ctx.drawImage(source, 0, 0)

  const temp = new OffscreenCanvas(source.width, source.height)
  const tCtx = temp.getContext('2d')!

  tCtx.drawImage(source, 0, 0)
  tCtx.globalCompositeOperation = 'source-in'

  tCtx.shadowColor = params.color
  tCtx.shadowBlur = params.blurRadius
  tCtx.shadowOffsetX = params.offsetX
  tCtx.shadowOffsetY = params.offsetY
  tCtx.fillStyle = params.color
  tCtx.fillRect(-source.width - 100, -source.height - 100, source.width * 3 + 200, source.height * 3 + 200)

  ctx.globalAlpha = params.opacity
  ctx.globalCompositeOperation = 'source-atop'
  ctx.drawImage(temp, 0, 0)

  return out
}

function applyBackgroundBlurEffect(source: OffscreenCanvas, params: BackgroundBlurParams): OffscreenCanvas {
  if (params.radius <= 0) return source

  const out = new OffscreenCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!

  ctx.filter = `blur(${params.radius}px)`
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'

  ctx.drawImage(source, 0, 0)

  return out
}

function applyProgressiveBlurEffect(source: OffscreenCanvas, params: ProgressiveBlurParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyProgressiveBlur(imageData, params)
  return putPixels(source, result)
}

// ── New nondestructive filter effects ──

function applyNoiseEffect(source: OffscreenCanvas, params: NoiseEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  switch (params.noiseType) {
    case 'gaussian':
      applyGaussianNoise(imageData, params.amount, params.monochrome, params.seed)
      break
    case 'uniform':
      applyUniformNoise(imageData, params.amount, params.monochrome, params.seed)
      break
    case 'film-grain':
      applyFilmGrain(imageData, params.amount, params.size ?? 3, params.seed)
      break
  }
  return putPixels(source, imageData)
}

function applySharpenEffect(source: OffscreenCanvas, params: SharpenEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySharpen(imageData, { amount: params.amount, radius: params.radius, threshold: params.threshold })
  return putPixels(source, result)
}

function applyMotionBlurEffect(source: OffscreenCanvas, params: MotionBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyMotionBlur(imageData, { angle: params.angle, distance: params.distance })
  return putPixels(source, result)
}

function applyRadialBlurEffect(source: OffscreenCanvas, params: RadialBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyRadialBlur(imageData, { centerX: params.centerX, centerY: params.centerY, amount: params.amount })
  return putPixels(source, result)
}

function applyColorAdjustEffect(source: OffscreenCanvas, params: ColorAdjustEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  let result: ImageData
  switch (params.adjustType) {
    case 'posterize':
      result = applyPosterize(imageData, { levels: params.levels ?? 4 })
      break
    case 'threshold':
      result = applyThreshold(imageData, { value: params.thresholdValue ?? 128 })
      break
    case 'invert':
      result = applyInvert(imageData)
      break
    case 'desaturate':
      result = applyDesaturate(imageData)
      break
    case 'vibrance':
      result = applyVibrance(imageData, { amount: params.vibranceAmount ?? 50 })
      break
    case 'channel-mixer': {
      const m = params.channelMatrix ?? { rr: 1, rg: 0, rb: 0, gr: 0, gg: 1, gb: 0, br: 0, bg: 0, bb: 1 }
      result = applyChannelMixer(imageData, m)
      break
    }
    default:
      return source
  }
  return putPixels(source, result)
}

function applyWaveEffect(source: OffscreenCanvas, params: WaveEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyWave(imageData, params.amplitudeX, params.amplitudeY, params.frequencyX, params.frequencyY)
  return putPixels(source, result)
}

function applyTwirlEffect(source: OffscreenCanvas, params: TwirlEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyTwirl(imageData, params.angle, params.radius)
  return putPixels(source, result)
}

function applyPinchEffect(source: OffscreenCanvas, params: PinchEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyPinch(imageData, params.amount)
  return putPixels(source, result)
}

function applySpherizeEffect(source: OffscreenCanvas, params: SpherizeEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySphereize(imageData, params.amount)
  return putPixels(source, result)
}

/** Check if a layer has any enabled effects that need a render pass. */
export function hasActiveEffects(effects: Effect[]): boolean {
  return effects.some((e) => e.enabled)
}
