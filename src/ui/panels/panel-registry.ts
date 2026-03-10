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
const LazyAccessibilityPanel = React.lazy(() =>
  import('@/ui/accessibility-panel').then((m) => ({ default: m.AccessibilityPanel })),
)
const LazyCSSInspectPanel = React.lazy(() =>
  import('@/ui/css-inspect-panel').then((m) => ({ default: m.CSSInspectPanel })),
)
const LazyCodeGenPanel = React.lazy(() =>
  import('@/ui/code-gen-panel').then((m) => ({ default: m.CodeGenPanel })),
)
const LazyDesignLintPanel = React.lazy(() =>
  import('@/ui/design-lint-panel').then((m) => ({ default: m.DesignLintPanel })),
)
const LazyCommentsPanel = React.lazy(() =>
  import('@/ui/comments-panel').then((m) => ({ default: m.CommentsPanel })),
)
const LazyAnimationTimeline = React.lazy(() =>
  import('@/ui/animation-timeline').then((m) => ({ default: m.AnimationTimeline })),
)
const LazyInteractionPanel = React.lazy(() =>
  import('@/ui/interaction-panel').then((m) => ({ default: m.InteractionPanel })),
)
const LazyCollabPanel = React.lazy(() =>
  import('@/ui/collab-panel').then((m) => ({ default: m.CollabPanel })),
)
const LazyAIPanel = React.lazy(() =>
  import('@/ui/ai-panel').then((m) => ({ default: m.AIPanel })),
)
const LazyVersionPanel = React.lazy(() =>
  import('@/ui/version-panel').then((m) => ({ default: m.VersionPanel })),
)
const LazyVariablesPanel = React.lazy(() =>
  import('@/ui/variables-panel').then((m) => ({ default: m.VariablesPanel })),
)
const LazyStylesPanel = React.lazy(() =>
  import('@/ui/styles-panel').then((m) => ({ default: m.StylesPanel })),
)
const LazyDevModePanel = React.lazy(() =>
  import('@/ui/dev-mode-panel').then((m) => ({ default: m.DevModePanel })),
)
const LazyCloudBrowserPanel = React.lazy(() =>
  import('@/ui/cloud-browser-panel').then((m) => ({ default: m.CloudBrowserPanel })),
)
const LazyLibraryPanel = React.lazy(() =>
  import('@/ui/library-panel').then((m) => ({ default: m.LibraryPanel })),
)
const LazyPNGTuberPanel = React.lazy(() =>
  import('@/ui/pngtuber-panel').then((m) => ({ default: m.PNGTuberPanel })),
)
const LazyPNGTuberPreview = React.lazy(() =>
  import('@/ui/pngtuber-preview').then((m) => ({ default: m.PNGTuberPreview })),
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
  { id: 'accessibility', label: 'Accessibility', icon: '\u267F', component: LazyAccessibilityPanel },
  { id: 'inspect', label: 'CSS Inspect', icon: '\u{1F4D0}', component: LazyCSSInspectPanel },
  { id: 'code', label: 'Code Gen', icon: '\u{1F4BB}', component: LazyCodeGenPanel },
  { id: 'lint', label: 'Design Lint', icon: '\u{1F50D}', component: LazyDesignLintPanel },
  { id: 'comments', label: 'Comments', icon: '\u{1F4AC}', component: LazyCommentsPanel },
  { id: 'animation', label: 'Animation', icon: '\u{1F3AC}', component: LazyAnimationTimeline },
  { id: 'interactions', label: 'Interactions', icon: '\u26A1', component: LazyInteractionPanel },
  { id: 'collaboration', label: 'Collaboration', icon: '\u{1F465}', component: LazyCollabPanel },
  { id: 'ai-assistant', label: 'AI Assistant', icon: '\u2728', component: LazyAIPanel },
  { id: 'versions', label: 'Version Control', icon: '\u{1F4C0}', component: LazyVersionPanel },
  { id: 'variables', label: 'Variables', icon: '\u{1F4D0}', component: LazyVariablesPanel },
  { id: 'styles', label: 'Shared Styles', icon: '\u{1F3A8}', component: LazyStylesPanel },
  { id: 'dev-mode', label: 'Dev Mode', icon: '\u{1F6E0}', component: LazyDevModePanel },
  { id: 'cloud-files', label: 'Cloud Files', icon: '\u2601', component: LazyCloudBrowserPanel },
  { id: 'libraries', label: 'Team Libraries', icon: '\uD83D\uDCDA', component: LazyLibraryPanel },
  { id: 'pngtuber', label: 'PNGtuber', icon: '\uD83D\uDC64', component: LazyPNGTuberPanel },
  { id: 'pngtuber-preview', label: 'PNGtuber Preview', icon: '\uD83C\uDFAD', component: LazyPNGTuberPreview },
]

const panelMap = new Map<string, PanelDefinition>(PANEL_DEFINITIONS.map((p) => [p.id, p]))

export function getPanelDefinition(id: string): PanelDefinition | undefined {
  return panelMap.get(id)
}

export function getAllPanelIds(): string[] {
  return PANEL_DEFINITIONS.map((p) => p.id)
}
