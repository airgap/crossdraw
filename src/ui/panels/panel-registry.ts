import React from 'react'

export interface PanelDefinition {
  id: string
  label: string
  icon: string
  component: React.LazyExoticComponent<React.ComponentType<any>> | React.FC<any>
}

const LazyLayers = React.lazy(() =>
  import('@/ui/layers-panel').then((m) => ({ default: m.LayersPanel }))
)
const LazyProperties = React.lazy(() =>
  import('@/ui/properties').then((m) => ({ default: m.PropertiesPanel }))
)
const LazyColorPalette = React.lazy(() =>
  import('@/ui/color-palette').then((m) => ({ default: m.ColorPalette }))
)
const LazyHistory = React.lazy(() =>
  import('@/ui/history-panel').then((m) => ({ default: m.HistoryPanel }))
)
const LazyMiniMap = React.lazy(() =>
  import('@/ui/minimap').then((m) => ({ default: m.MiniMap }))
)
const LazyDevicePreview = React.lazy(() =>
  import('@/ui/device-preview').then((m) => ({ default: m.DevicePreview }))
)

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  { id: 'layers', label: 'Layers', icon: '\u{1F4CB}', component: LazyLayers },
  { id: 'properties', label: 'Properties', icon: '\u2699', component: LazyProperties },
  { id: 'color-palette', label: 'Color Palette', icon: '\u{1F3A8}', component: LazyColorPalette },
  { id: 'history', label: 'History', icon: '\u{1F553}', component: LazyHistory },
  { id: 'minimap', label: 'Mini Map', icon: '\u{1F5FA}', component: LazyMiniMap },
  { id: 'device-preview', label: 'Device Preview', icon: '\u{1F4F1}', component: LazyDevicePreview },
]

const panelMap = new Map<string, PanelDefinition>(
  PANEL_DEFINITIONS.map((p) => [p.id, p])
)

export function getPanelDefinition(id: string): PanelDefinition | undefined {
  return panelMap.get(id)
}

export function getAllPanelIds(): string[] {
  return PANEL_DEFINITIONS.map((p) => p.id)
}
