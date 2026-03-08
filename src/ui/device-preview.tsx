import React, { useState, useMemo } from 'react'
import { applyConstraints } from '@/tools/constraints'
import type { Artboard, BaseLayer } from '@/types'

/**
 * Device preset definitions for responsive preview.
 */
export interface DevicePreset {
  id: string
  name: string
  width: number
  height: number
  category: 'phone' | 'tablet' | 'desktop'
  /** Optional device pixel ratio */
  dpr?: number
}

export const DEVICE_PRESETS: DevicePreset[] = [
  // Phones
  { id: 'iphone-15', name: 'iPhone 15', width: 393, height: 852, category: 'phone', dpr: 3 },
  { id: 'iphone-15-pro-max', name: 'iPhone 15 Pro Max', width: 430, height: 932, category: 'phone', dpr: 3 },
  { id: 'iphone-se', name: 'iPhone SE', width: 375, height: 667, category: 'phone', dpr: 2 },
  { id: 'galaxy-s24', name: 'Galaxy S24', width: 360, height: 780, category: 'phone', dpr: 3 },
  { id: 'pixel-8', name: 'Pixel 8', width: 412, height: 915, category: 'phone', dpr: 2.625 },

  // Tablets
  { id: 'ipad', name: 'iPad (10th gen)', width: 820, height: 1180, category: 'tablet', dpr: 2 },
  { id: 'ipad-pro-11', name: 'iPad Pro 11"', width: 834, height: 1194, category: 'tablet', dpr: 2 },
  { id: 'ipad-pro-13', name: 'iPad Pro 12.9"', width: 1024, height: 1366, category: 'tablet', dpr: 2 },
  { id: 'galaxy-tab-s9', name: 'Galaxy Tab S9', width: 800, height: 1280, category: 'tablet', dpr: 2 },

  // Desktop
  { id: 'desktop-1080p', name: 'Desktop 1080p', width: 1920, height: 1080, category: 'desktop' },
  { id: 'desktop-1440p', name: 'Desktop 1440p', width: 2560, height: 1440, category: 'desktop' },
  { id: 'desktop-4k', name: 'Desktop 4K', width: 3840, height: 2160, category: 'desktop' },
  { id: 'macbook-air-13', name: 'MacBook Air 13"', width: 1470, height: 956, category: 'desktop', dpr: 2 },
  { id: 'macbook-pro-16', name: 'MacBook Pro 16"', width: 1728, height: 1117, category: 'desktop', dpr: 2 },
]

/**
 * Get device presets filtered by category.
 */
export function getPresetsByCategory(category: DevicePreset['category']): DevicePreset[] {
  return DEVICE_PRESETS.filter((p) => p.category === category)
}

/**
 * Find a device preset by ID.
 */
export function getPresetById(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((p) => p.id === id)
}

/**
 * Compute how layers would be repositioned at a target device size using constraints.
 */
export function computeResponsiveLayout(
  artboard: Artboard,
  targetWidth: number,
  targetHeight: number,
): Array<{ layerId: string; x: number; y: number; scaleX: number; scaleY: number }> {
  const results: Array<{ layerId: string; x: number; y: number; scaleX: number; scaleY: number }> = []

  for (const layer of artboard.layers) {
    const constraints = (layer as BaseLayer).constraints ?? { horizontal: 'left', vertical: 'top' }
    const result = applyConstraints(layer, constraints, artboard.width, artboard.height, targetWidth, targetHeight)
    results.push({ layerId: layer.id, ...result })
  }

  return results
}

/**
 * Scale factor to fit a device preview within a container.
 */
export function calcPreviewScale(
  deviceWidth: number,
  deviceHeight: number,
  containerWidth: number,
  containerHeight: number,
  padding: number = 20,
): number {
  const availW = containerWidth - padding * 2
  const availH = containerHeight - padding * 2
  return Math.min(1, availW / deviceWidth, availH / deviceHeight)
}

export interface DevicePreviewProps {
  artboard: Artboard
  presetIds: string[]
  containerWidth?: number
  containerHeight?: number
  showFrame?: boolean
}

/**
 * Device preview panel showing design at multiple device sizes.
 */
export function DevicePreview({
  artboard,
  presetIds,
  containerWidth = 800,
  containerHeight = 600,
  showFrame = true,
}: DevicePreviewProps): React.JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState<DevicePreset['category'] | 'all'>('all')

  const presets = useMemo(() => {
    return presetIds.map((id) => getPresetById(id)).filter((p): p is DevicePreset => p != null)
  }, [presetIds])

  const filteredPresets = useMemo(() => {
    if (selectedCategory === 'all') return presets
    return presets.filter((p) => p.category === selectedCategory)
  }, [presets, selectedCategory])

  const layouts = useMemo(() => {
    return filteredPresets.map((preset) => ({
      preset,
      layout: computeResponsiveLayout(artboard, preset.width, preset.height),
      scale: calcPreviewScale(
        preset.width,
        preset.height,
        containerWidth / Math.max(1, filteredPresets.length),
        containerHeight,
      ),
    }))
  }, [filteredPresets, artboard, containerWidth, containerHeight])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Category filter */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {(['all', 'phone', 'tablet', 'desktop'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '4px 12px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: selectedCategory === cat ? 'var(--accent)' : 'var(--bg-elevated)',
              color: selectedCategory === cat ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-base)',
              height: 'var(--height-button-sm)',
            }}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Preview area */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          padding: 16,
          overflow: 'auto',
          flex: 1,
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        {layouts.map(({ preset, scale }) => (
          <div key={preset.id} style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-secondary)' }}>{preset.name}</div>
            <div style={{ fontSize: 'var(--font-size-xs)', marginBottom: 8, color: 'var(--text-disabled)' }}>
              {preset.width} x {preset.height}
            </div>
            <div
              style={{
                width: preset.width * scale,
                height: preset.height * scale,
                border: showFrame ? '2px solid var(--border-default)' : 'none',
                borderRadius: showFrame && preset.category === 'phone' ? 20 * scale : showFrame ? 8 * scale : 0,
                background: artboard.backgroundColor,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Placeholder for rendered preview content */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10 * Math.max(scale, 0.5),
                  color: 'var(--text-disabled)',
                }}
              >
                Preview
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
