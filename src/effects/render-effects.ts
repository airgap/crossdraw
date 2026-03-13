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
  GaussianBlurEffectParams,
  BrightnessContrastEffectParams,
  ShadowHighlightEffectParams,
  ExposureEffectParams,
  PhotoFilterEffectParams,
  BlackWhiteMixerEffectParams,
  WaveEffectParams,
  TwirlEffectParams,
  PinchEffectParams,
  SpherizeEffectParams,
  DisplaceEffectParams,
  GlassEffectParams,
  RippleEffectParams,
  ZigzagEffectParams,
  PolarCoordinatesEffectParams,
  BoxBlurEffectParams,
  SurfaceBlurEffectParams,
  EmbossEffectParams,
  FindEdgesEffectParams,
  SolarizeEffectParams,
  WindEffectParams,
  ProgressiveBlurParams,
  OilPaintEffectParams,
  HalftoneEffectParams,
  PixelateEffectParams,
  SmartSharpenEffectParams,
  LUTEffectParams,
  SelectiveColorEffectParams,
  BevelEmbossEffectParams,
  ColorOverlayEffectParams,
  GradientOverlayEffectParams,
  PatternOverlayEffectParams,
  SatinEffectParams,
  CloudsEffectParams,
  LensFlareEffectParams,
  LightingEffectParams,
  ClarityEffectParams,
  DenoiseEffectParams,
  LensBlurEffectParams,
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
  applyBrightnessContrast,
  applyShadowHighlight,
  applyExposure,
  applyPhotoFilter,
  applyBlackWhiteMixer,
} from '@/filters/color-adjust'
import {
  applyWave,
  applyTwirl,
  applyPinch,
  applySphereize,
  applyRipple,
  applyZigzag,
  applyPolarCoordinates,
  applyDisplace,
  applyGlass,
} from '@/filters/distort'
import { applyProgressiveBlur } from '@/filters/progressive-blur'
import { applyGaussianBlur } from '@/filters/gaussian-blur'
import { applyBoxBlur } from '@/filters/box-blur'
import { applySurfaceBlur } from '@/filters/surface-blur'
import { applyEmboss } from '@/filters/emboss'
import { applyFindEdges } from '@/filters/find-edges'
import { applySolarize } from '@/filters/solarize'
import { applyWind } from '@/filters/wind'
import { applyOilPaint } from '@/filters/oil-paint'
import { applyHalftone } from '@/filters/halftone'
import { applyPixelate } from '@/filters/pixelate'
import { applySmartSharpen } from '@/filters/smart-sharpen'
import { applyLUT } from '@/filters/lut'
import { applySelectiveColor } from '@/filters/selective-color'
import {
  applyBevelEmboss as applyBevelEmbossFilter,
  applyColorOverlay as applyColorOverlayFilter,
  applyGradientOverlay as applyGradientOverlayFilter,
  applyPatternOverlay as applyPatternOverlayFilter,
  applySatin as applySatinFilter,
} from '@/effects/layer-effects'
import { applyClouds, applyLensFlare, applyLighting } from '@/filters/render-filters'
import { applyClarity } from '@/filters/clarity'
import { applyDenoise } from '@/filters/denoise'
import { applyLensBlur } from '@/filters/lens-blur'

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
      case 'displace':
        current = applyDisplaceEffect(current, effect.params as DisplaceEffectParams)
        break
      case 'glass':
        current = applyGlassEffect(current, effect.params as GlassEffectParams)
        break
      case 'ripple':
        current = applyRippleEffect(current, effect.params as RippleEffectParams)
        break
      case 'zigzag':
        current = applyZigzagEffect(current, effect.params as ZigzagEffectParams)
        break
      case 'polar-coordinates':
        current = applyPolarCoordinatesEffect(current, effect.params as PolarCoordinatesEffectParams)
        break
      case 'box-blur':
        current = applyBoxBlurEffect(current, effect.params as BoxBlurEffectParams)
        break
      case 'surface-blur':
        current = applySurfaceBlurEffect(current, effect.params as SurfaceBlurEffectParams)
        break
      case 'emboss':
        current = applyEmbossEffect(current, effect.params as EmbossEffectParams)
        break
      case 'find-edges':
        current = applyFindEdgesEffect(current, effect.params as FindEdgesEffectParams)
        break
      case 'solarize':
        current = applySolarizeEffect(current, effect.params as SolarizeEffectParams)
        break
      case 'wind':
        current = applyWindEffect(current, effect.params as WindEffectParams)
        break
      case 'gaussian-blur':
        current = applyGaussianBlurEffect(current, effect.params as GaussianBlurEffectParams)
        break
      case 'brightness-contrast':
        current = applyBrightnessContrastEffect(current, effect.params as BrightnessContrastEffectParams)
        break
      case 'shadow-highlight':
        current = applyShadowHighlightEffect(current, effect.params as ShadowHighlightEffectParams)
        break
      case 'exposure':
        current = applyExposureEffect(current, effect.params as ExposureEffectParams)
        break
      case 'photo-filter':
        current = applyPhotoFilterEffect(current, effect.params as PhotoFilterEffectParams)
        break
      case 'black-white':
        current = applyBlackWhiteMixerEffect(current, effect.params as BlackWhiteMixerEffectParams)
        break
      case 'oil-paint':
        current = applyOilPaintEffect(current, effect.params as OilPaintEffectParams)
        break
      case 'halftone':
        current = applyHalftoneEffect(current, effect.params as HalftoneEffectParams)
        break
      case 'pixelate':
        current = applyPixelateEffect(current, effect.params as PixelateEffectParams)
        break
      case 'smart-sharpen':
        current = applySmartSharpenEffect(current, effect.params as SmartSharpenEffectParams)
        break
      case 'lut':
        current = applyLUTEffect(current, effect.params as LUTEffectParams)
        break
      case 'selective-color':
        current = applySelectiveColorEffect(current, effect.params as SelectiveColorEffectParams)
        break
      case 'clouds':
        current = applyCloudsEffect(current, effect.params as CloudsEffectParams)
        break
      case 'lens-flare':
        current = applyLensFlareEffect(current, effect.params as LensFlareEffectParams)
        break
      case 'lighting':
        current = applyLightingEffect(current, effect.params as LightingEffectParams)
        break
      case 'clarity':
        current = applyClarityEffect(current, effect.params as ClarityEffectParams)
        break
      case 'denoise':
        current = applyDenoiseEffect(current, effect.params as DenoiseEffectParams)
        break
      case 'lens-blur':
        current = applyLensBlurEffect(current, effect.params as LensBlurEffectParams)
        break
      case 'bevel-emboss':
        current = applyBevelEmbossEffect(current, effect.params as BevelEmbossEffectParams)
        break
      case 'color-overlay':
        current = applyColorOverlayEffect(current, effect.params as ColorOverlayEffectParams)
        break
      case 'gradient-overlay':
        current = applyGradientOverlayEffect(current, effect.params as GradientOverlayEffectParams)
        break
      case 'pattern-overlay':
        current = applyPatternOverlayEffect(current, effect.params as PatternOverlayEffectParams)
        break
      case 'satin':
        current = applySatinEffect(current, effect.params as SatinEffectParams)
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

function applyRippleEffect(source: OffscreenCanvas, params: RippleEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyRipple(imageData, params.amplitude, params.frequency, params.direction)
  return putPixels(source, result)
}

function applyZigzagEffect(source: OffscreenCanvas, params: ZigzagEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyZigzag(imageData, params.amount, params.ridges)
  return putPixels(source, result)
}

function applyPolarCoordinatesEffect(source: OffscreenCanvas, params: PolarCoordinatesEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyPolarCoordinates(imageData, params.mode)
  return putPixels(source, result)
}

function applyGaussianBlurEffect(source: OffscreenCanvas, params: GaussianBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0 || params.radius <= 0) return source
  const imageData = getPixels(source)
  const result = applyGaussianBlur(imageData, { radius: params.radius })
  return putPixels(source, result)
}

function applyBrightnessContrastEffect(
  source: OffscreenCanvas,
  params: BrightnessContrastEffectParams,
): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyBrightnessContrast(imageData, { brightness: params.brightness, contrast: params.contrast })
  return putPixels(source, result)
}

function applyShadowHighlightEffect(source: OffscreenCanvas, params: ShadowHighlightEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyShadowHighlight(imageData, { shadows: params.shadows, highlights: params.highlights })
  return putPixels(source, result)
}

function applyExposureEffect(source: OffscreenCanvas, params: ExposureEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyExposure(imageData, {
    exposure: params.exposure,
    offset: params.offset,
    gamma: params.gamma,
  })
  return putPixels(source, result)
}

function applyPhotoFilterEffect(source: OffscreenCanvas, params: PhotoFilterEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyPhotoFilter(imageData, {
    color: params.color,
    density: params.density,
    preserveLuminosity: params.preserveLuminosity,
  })
  return putPixels(source, result)
}

function applyBlackWhiteMixerEffect(source: OffscreenCanvas, params: BlackWhiteMixerEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyBlackWhiteMixer(imageData, {
    reds: params.reds,
    yellows: params.yellows,
    greens: params.greens,
    cyans: params.cyans,
    blues: params.blues,
    magentas: params.magentas,
  })
  return putPixels(source, result)
}

function applyBoxBlurEffect(source: OffscreenCanvas, params: BoxBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0 || params.radius <= 0) return source
  const imageData = getPixels(source)
  const result = applyBoxBlur(imageData, { radius: params.radius })
  return putPixels(source, result)
}

function applySurfaceBlurEffect(source: OffscreenCanvas, params: SurfaceBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySurfaceBlur(imageData, { radius: params.radius, threshold: params.threshold })
  return putPixels(source, result)
}

function applyEmbossEffect(source: OffscreenCanvas, params: EmbossEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyEmboss(imageData, { angle: params.angle, height: params.height, amount: params.amount })
  return putPixels(source, result)
}

function applyFindEdgesEffect(source: OffscreenCanvas, params: FindEdgesEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyFindEdges(imageData, { threshold: params.threshold })
  return putPixels(source, result)
}

function applySolarizeEffect(source: OffscreenCanvas, params: SolarizeEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySolarize(imageData, { threshold: params.threshold })
  return putPixels(source, result)
}

function applyWindEffect(source: OffscreenCanvas, params: WindEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyWind(imageData, {
    strength: params.strength,
    direction: params.direction,
    method: params.method,
  })
  return putPixels(source, result)
}

function applyOilPaintEffect(source: OffscreenCanvas, params: OilPaintEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyOilPaint(imageData, { radius: params.radius, levels: params.levels })
  return putPixels(source, result)
}

function applyHalftoneEffect(source: OffscreenCanvas, params: HalftoneEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyHalftone(imageData, { dotSize: params.dotSize, angle: params.angle, shape: params.shape })
  return putPixels(source, result)
}

function applyPixelateEffect(source: OffscreenCanvas, params: PixelateEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyPixelate(imageData, { cellSize: params.cellSize, mode: params.mode })
  return putPixels(source, result)
}

function applyDisplaceEffect(source: OffscreenCanvas, params: DisplaceEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyDisplace(imageData, {
    scaleX: params.scaleX,
    scaleY: params.scaleY,
    mapData: null,
    wrap: params.wrap,
  })
  return putPixels(source, result)
}

function applyGlassEffect(source: OffscreenCanvas, params: GlassEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyGlass(imageData, {
    distortion: params.distortion,
    smoothness: params.smoothness,
    texture: params.texture,
    scale: params.scale,
  })
  return putPixels(source, result)
}

function applySmartSharpenEffect(source: OffscreenCanvas, params: SmartSharpenEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySmartSharpen(imageData, {
    amount: params.amount,
    radius: params.radius,
    noiseReduction: params.noiseReduction,
    shadowFade: params.shadowFade,
    highlightFade: params.highlightFade,
  })
  return putPixels(source, result)
}

function applyLUTEffect(source: OffscreenCanvas, params: LUTEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyLUT(imageData, { lutData: params.lutData, size: params.size })
  return putPixels(source, result)
}

function applySelectiveColorEffect(source: OffscreenCanvas, params: SelectiveColorEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySelectiveColor(imageData, {
    reds: params.reds,
    yellows: params.yellows,
    greens: params.greens,
    cyans: params.cyans,
    blues: params.blues,
    magentas: params.magentas,
    whites: params.whites,
    neutrals: params.neutrals,
    blacks: params.blacks,
  })
  return putPixels(source, result)
}

function applyCloudsEffect(source: OffscreenCanvas, params: CloudsEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyClouds(imageData, {
    scale: params.scale,
    seed: params.seed,
    turbulence: params.turbulence,
  })
  return putPixels(source, result)
}

function applyLensFlareEffect(source: OffscreenCanvas, params: LensFlareEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyLensFlare(imageData, {
    x: params.x,
    y: params.y,
    brightness: params.brightness,
    lensType: params.lensType,
  })
  return putPixels(source, result)
}

function applyLightingEffect(source: OffscreenCanvas, params: LightingEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyLighting(imageData, {
    lightX: params.lightX,
    lightY: params.lightY,
    intensity: params.intensity,
    ambientLight: params.ambientLight,
    surfaceHeight: params.surfaceHeight,
  })
  return putPixels(source, result)
}

function applyClarityEffect(source: OffscreenCanvas, params: ClarityEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyClarity(imageData, { amount: params.amount })
  return putPixels(source, result)
}

function applyDenoiseEffect(source: OffscreenCanvas, params: DenoiseEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyDenoise(imageData, { strength: params.strength, detail: params.detail })
  return putPixels(source, result)
}

function applyLensBlurEffect(source: OffscreenCanvas, params: LensBlurEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0 || params.radius <= 0) return source
  const imageData = getPixels(source)
  const result = applyLensBlur(imageData, {
    radius: params.radius,
    bladeCount: params.bladeCount,
    rotation: params.rotation,
    brightness: params.brightness,
    threshold: params.threshold,
  })
  return putPixels(source, result)
}

// ── Layer effects (bevel/emboss, overlays, satin) ──

function applyBevelEmbossEffect(source: OffscreenCanvas, params: BevelEmbossEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyBevelEmbossFilter(imageData, params)
  return putPixels(source, result)
}

function applyColorOverlayEffect(source: OffscreenCanvas, params: ColorOverlayEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyColorOverlayFilter(imageData, params)
  return putPixels(source, result)
}

function applyGradientOverlayEffect(source: OffscreenCanvas, params: GradientOverlayEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyGradientOverlayFilter(imageData, params)
  return putPixels(source, result)
}

function applyPatternOverlayEffect(source: OffscreenCanvas, params: PatternOverlayEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applyPatternOverlayFilter(imageData, params)
  return putPixels(source, result)
}

function applySatinEffect(source: OffscreenCanvas, params: SatinEffectParams): OffscreenCanvas {
  if (source.width === 0 || source.height === 0) return source
  const imageData = getPixels(source)
  const result = applySatinFilter(imageData, params)
  return putPixels(source, result)
}

/** Check if a layer has any enabled effects that need a render pass. */
export function hasActiveEffects(effects: Effect[]): boolean {
  return effects.some((e) => e.enabled)
}
