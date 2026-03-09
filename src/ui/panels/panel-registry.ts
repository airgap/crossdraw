import React from 'react'

export interface PanelDefinition {
  id: string
  label: string
  icon: string
  component: React.LazyExoticComponent<React.ComponentType<any>> | React.FC<any>
}

const LazyLayers = React.lazy(() => import('@/ui/layers-panel').then((m) => ({ default: m.LayersPanel })))
const LazyProperties = React.lazy(() => import('@/ui/properties').then((m) => ({ default: m.PropertiesPanel })))
const LazyColorPalette = React.lazy(() => import('@/ui/color-palette').then((m) => ({ default: m.ColorPalette })))
const LazyHistory = React.lazy(() => import('@/ui/history-panel').then((m) => ({ default: m.HistoryPanel })))
const LazyMiniMap = React.lazy(() => import('@/ui/minimap').then((m) => ({ default: m.MiniMap })))
const LazyDevicePreview = React.lazy(() => import('@/ui/device-preview').then((m) => ({ default: m.DevicePreview })))
const LazyAlignPanel = React.lazy(() => import('@/ui/align-panel').then((m) => ({ default: m.AlignPanel })))
const LazySymbolsPanel = React.lazy(() => import('@/ui/symbols-panel').then((m) => ({ default: m.SymbolsPanel })))
const LazyPreferencesPanel = React.lazy(() =>
  import('@/ui/preferences-panel').then((m) => ({ default: m.PreferencesPanel })),
)
const LazyArtboardNavigator = React.lazy(() =>
  import('@/ui/artboard-navigator').then((m) => ({ default: m.ArtboardNavigator })),
)
const LazyGuidesPanel = React.lazy(() => import('@/ui/guides-panel').then((m) => ({ default: m.GuidesPanel })))
const LazyBatchExportPanel = React.lazy(() =>
  import('@/ui/batch-export-panel').then((m) => ({ default: m.BatchExportPanel })),
)
const LazyColorHarmonyPanel = React.lazy(() =>
  import('@/ui/color-harmony-panel').then((m) => ({ default: m.ColorHarmonyPanel })),
)
const LazyFindReplacePanel = React.lazy(() =>
  import('@/ui/find-replace-panel').then((m) => ({ default: m.FindReplacePanel })),
)
const LazyGlobalColorsPanel = React.lazy(() =>
  import('@/ui/global-colors-panel').then((m) => ({ default: m.GlobalColorsPanel })),
)

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  { id: 'layers', label: 'Layers', icon: '\u{1F4CB}', component: LazyLayers },
  { id: 'properties', label: 'Properties', icon: '\u2699', component: LazyProperties },
  { id: 'color-palette', label: 'Color Palette', icon: '\u{1F3A8}', component: LazyColorPalette },
  { id: 'align', label: 'Align & Distribute', icon: '\u2B1C', component: LazyAlignPanel },
  { id: 'history', label: 'History', icon: '\u{1F553}', component: LazyHistory },
  { id: 'minimap', label: 'Mini Map', icon: '\u{1F5FA}', component: LazyMiniMap },
  { id: 'device-preview', label: 'Device Preview', icon: '\u{1F4F1}', component: LazyDevicePreview },
  { id: 'symbols', label: 'Symbols', icon: '\u{1F9E9}', component: LazySymbolsPanel },
  { id: 'preferences', label: 'Preferences', icon: '\u{1F527}', component: LazyPreferencesPanel },
  { id: 'artboards', label: 'Artboards', icon: '\u{1F4D0}', component: LazyArtboardNavigator },
  { id: 'guides', label: 'Guides', icon: '\u{1F4CF}', component: LazyGuidesPanel },
  { id: 'export', label: 'Batch Export', icon: '\u{1F4E6}', component: LazyBatchExportPanel },
  { id: 'color-harmony', label: 'Color Harmony', icon: '\u{1F308}', component: LazyColorHarmonyPanel },
  { id: 'find-replace', label: 'Find & Replace', icon: '\u{1F50D}', component: LazyFindReplacePanel },
  { id: 'global-colors', label: 'Global Colors', icon: '\u{1F3A8}', component: LazyGlobalColorsPanel },
]

const panelMap = new Map<string, PanelDefinition>(PANEL_DEFINITIONS.map((p) => [p.id, p]))

export function getPanelDefinition(id: string): PanelDefinition | undefined {
  return panelMap.get(id)
}

export function getAllPanelIds(): string[] {
  return PANEL_DEFINITIONS.map((p) => p.id)
}
