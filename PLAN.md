# Design Editor Project Plan

**Project:** Custom Vector + Raster Design Editor  
**Owner:** Nicole  
**Start Date:** 2026-03-06  
**Status:** Planning → Phase 1 Kickoff  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Scope](#project-scope)
3. [Use Cases & Requirements](#use-cases--requirements)
4. [Technical Architecture](#technical-architecture)
5. [File Format Specification](#file-format-specification)
6. [Data Models](#data-models)
7. [Rendering Pipeline](#rendering-pipeline)
8. [Phase Breakdown](#phase-breakdown)
9. [Tech Stack](#tech-stack)
10. [Development Workflow](#development-workflow)
11. [Performance Targets](#performance-targets)
12. [Testing & QA](#testing--qa)
13. [Risks & Mitigation](#risks--mitigation)

---

## Executive Summary

Building a **lightweight, privacy-first design editor** as a direct replacement for Affinity Designer, optimized for Nicole's workflows: vector illustration, gradient complexity, raster compositing, and batch artboards.

**Why build this:**
- Autonomy from Canva/proprietary dependency
- Privacy (local-first, no cloud vendor)
- Customizable workflows (future: scripting, optimization for meme creation, etc.)
- Full ownership of file format and data

**Scope:** MVP in 6-8 weeks (Phase 1-3), full professional tool by 12-16 weeks (Phase 4-5)

**Resources:**
- Claude Code for heavy lifting (math, complex UI, export pipelines)
- Unlimited API access for acceleration
- Proven engineering background (Lyku's microservices, game systems)

---

## Project Scope

### Core Features (MVP - Phase 1-3)

#### Phase 1: Vector Editing
- ✅ Pen tool (Bezier curves)
- ✅ Shape tools (rectangle, circle, polygon, star)
- ✅ Path selection & manipulation
- ✅ Stroke & fill (solid colors only in Phase 1)
- ✅ Undo/redo
- ✅ Save/load `.design` files
- ✅ Export to SVG, PNG, JPG
- ✅ Zoom/pan viewport
- ✅ Layers panel with visibility/lock toggle

#### Phase 2: Raster & Composite
- ✅ Import raster images
- ✅ Layer blend modes (normal, multiply, screen, overlay, etc.)
- ✅ Layer opacity
- ✅ Layer groups
- ✅ Adjustment layers (levels, curves, hue-saturation)
- ✅ Basic effects (blur, drop shadow)
- ✅ Layer masks (raster)
- ✅ Proper compositing pipeline

#### Phase 3: Advanced Gradients & Dithering
- ✅ Gradient types (linear, radial, conical, box)
- ✅ Multistop gradients with color picker
- ✅ Gradient dithering (Bayer, Floyd-Steinberg, custom)
- ✅ Gradient editor UI
- ✅ Apply gradients to fill/stroke

#### Phase 4: Boolean Ops & Professional Features
- ✅ Boolean operations (union, subtract, intersect, xor, divide)
- ✅ Path operations (offset, expand stroke, simplify)
- ✅ Artboard management (create, duplicate, delete)
- ✅ Multi-artboard viewport
- ✅ Comprehensive keyboard shortcuts
- ✅ Advanced effects (distort, warp)
- ✅ Text tool (basic)

#### Phase 5: Polish & Shipping
- ✅ Electron desktop app (Windows/Mac/Linux)
- ✅ Performance optimization & profiling
- ✅ File format versioning
- ✅ Custom UI theme
- ✅ Keyboard customization
- ✅ Optional: Cloud sync via Lyku infrastructure

### Out of Scope (Phase 1-5)

- 3D modeling/rendering (Affinity's 3D features)
- AI features (remove background, upscale, etc.)
- Web-based collaboration (focus on local-first)
- Advanced typography (text tool is basic)
- Prototype/animation features

### File Format Compatibility

- **Input:** Can import SVG, PNG, JPG, GIF
- **Output:** SVG, PNG, JPG (high-quality, maintains layer data in `.design`)
- **No Affinity Import:** AF format is proprietary; designs will be recreated in `.design`

---

## Use Cases & Requirements

### Primary Use Case: Icon & Logo Design
- Create vector logos with multiple artboards for revisions
- Apply gradients and dithering
- Export to web-ready SVG

### Secondary Use Case: Meme/Web Graphics
- Import raster images (screenshots, photos)
- Composite with vector elements
- Apply effects (blur, shadows)
- Export as PNG/JPG for social media

### Tertiary Use Case: Print Design
- High-resolution raster work (4K+)
- Advanced color management
- Complex gradients with dithering
- Export to print-ready PNG/JPG

### Design Requirements

| Requirement | Details |
|-------------|---------|
| **Artboards** | Support dozens per file; enable revision workflows |
| **Undo/Redo** | Full non-destructive history (all operations reversible) |
| **Raster layers** | Support multiple, composited with blend modes |
| **Vector paths** | Bezier curves, boolean ops, stroke + fill |
| **Gradients** | Linear, radial, conical, box, multistop; dithered export |
| **Adjustment layers** | Levels, curves, hue-sat (non-destructive) |
| **Effects** | Blur, shadow, drop shadow (non-destructive) |
| **File size** | Typical design ≤50MB (uncompressed); ~10-20% with Zstandard |
| **Performance** | 60fps viewport on modern hardware; ≤500ms save |
| **Keyboard-driven** | Shortcuts for all major operations |

---

## Technical Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    React UI Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ Toolbar      │  │ Layers Panel │  │ Properties   │   │
│  │ Viewport     │  │ Artboards    │  │ Color Picker │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────────────────────┬────────────────────────────┘
                             │ State Updates (via Immer Patches)
┌────────────────────────────▼────────────────────────────┐
│               Zustand State Store                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Document, Selection, History (Patches), Viewport   │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────┘
                             │ Transferable Objects (ArrayBuffers)
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼──────┐  ┌──────────▼────────┐  ┌──────▼──────┐
│ Render Engine│  │  File I/O (Save/  │  │  Export     │
│ (Canvas 2D + │  │  Load .design)    │  │  (SVG/PNG)  │
│  WebGL)      │  │                   │  │             │
└───────┬──────┘  └──────────┬────────┘  └──────┬──────┘
        │                    │                   │
┌───────▴────────────────────┴───────────────────┴──────┐
│              Core Libraries & Utilities                │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Bezier.js, Color.js, Matrix math, RBush (Trees) │  │
│  │ MessagePack, Zstandard, Immer (Patches)         │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### State Flow (Optimized)

```
User Action (click, drag, keypress)
    ↓
React event handler
    ↓
Zustand action (using Immer produce)
    ↓
Generate Patches (Inverse Patches for Undo)
    ↓
Document state updated + History stack (Small Diff)
    ↓
Render engine calculates Dirty Rect (AABB)
    ↓
Redraw only affected area to OffscreenCanvas cache
    ↓
Composite and display via Viewport
```

### Module Organization

```
src/
├── types/
│   ├── document.ts       # Document, Artboard, Layer types
│   ├── path.ts           # Path, Segment, BezierCurve types
│   ├── effects.ts        # Effect, Adjustment types
│   ├── gradient.ts       # Gradient, Stop types
│   └── index.ts          # Export all types
│
├── store/
│   ├── editor.store.ts   # Zustand store (state + actions)
│   ├── history.ts        # Undo/redo system
│   └── selection.ts      # Selection state
│
├── render/
│   ├── viewport.tsx      # Main Canvas component
│   ├── canvas-renderer.ts# Canvas 2D rendering
│   ├── webgl-composite.ts# WebGL for blend modes
│   ├── path-renderer.ts  # Bezier path rendering
│   └── raster-renderer.ts# Raster compositing
│
├── tools/
│   ├── pen.ts            # Pen tool logic
│   ├── selection.ts      # Selection + transform
│   ├── shapes.ts         # Rectangle, circle, polygon
│   └── gradient-tool.ts  # Gradient editor
│
├── effects/
│   ├── blur.ts           # Blur filter
│   ├── shadow.ts         # Drop shadow
│   ├── adjustment.ts     # Levels, curves, hue-sat
│   └── renderer.ts       # Apply effects to canvas
│
├── math/
│   ├── bezier.ts         # Bezier curve operations
│   ├── boolean.ts        # Boolean path operations
│   ├── color.ts          # Color conversions, gradients
│   ├── dither.ts         # Dithering algorithms
│   ├── matrix.ts         # 2D transforms
│   └── path-ops.ts       # Offset, expand, simplify
│
├── io/
│   ├── file-format.ts    # .design parser/serializer
│   ├── loader.ts         # Load .design from disk
│   ├── saver.ts          # Save .design to disk
│   ├── svg-import.ts     # Import SVG
│   ├── svg-export.ts     # Export to SVG
│   └── raster-export.ts  # Export to PNG/JPG
│
├── ui/
│   ├── toolbar.tsx       # Tool buttons
│   ├── layers-panel.tsx  # Layer tree view
│   ├── properties.tsx    # Properties sidebar
│   ├── color-picker.tsx  # Color picker
│   ├── gradient-editor.tsx# Gradient editor UI
│   └── dialogs.tsx       # Modals (new file, export, etc.)
│
├── electron/
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # IPC bridge
│   └── file-handler.ts   # OS file I/O
│
└── App.tsx               # Root component
```

### File I/O Abstraction (Critical — Do This in Phase 1)

The Zustand store must never call browser or Electron APIs directly. Abstract all file I/O
behind a `FileAdapter` interface in Phase 1, so Phase 5 Electron integration is a drop-in swap.

```typescript
// io/file-adapter.ts

export interface FileAdapter {
  open: () => Promise<ArrayBuffer | null>          // returns file bytes or null (cancelled)
  save: (data: ArrayBuffer, defaultName: string) => Promise<boolean>
  saveAs: (data: ArrayBuffer, filename: string) => Promise<boolean>
  exportAs: (data: Blob, filename: string, mimeType: string) => Promise<boolean>
  getRecentFiles: () => Promise<RecentFile[]>
}

// Two implementations — same interface, swapped at app init:
// BrowserFileAdapter: uses <input type="file">, showSaveFilePicker API
// ElectronFileAdapter: uses IPC → main process → fs.readFile / dialog.showSaveDialog
```

The store's `openDocument` / `saveDocument` call `fileAdapter.open()` / `fileAdapter.save()` only.
Never import `electron` or `fs` from inside `src/store/` or `src/render/`.

### Viewport Coordinate System & Hit Testing

The viewport has its own coordinate space (zoom + pan). All mouse events arrive in screen
coordinates and must be reverse-transformed before interacting with the document.

```
screenPoint → viewportToDocument(point, zoom, panX, panY) → documentPoint
documentPoint → artboardLocalPoint (subtract artboard x/y offset)
artboardLocalPoint → hit test against layer bounding boxes → hit test against paths
```

Hit testing order (top to bottom in layer stack):
1. Check bounding box first (fast AABB using rbush spatial index)
2. If bbox hit, do precise path hit test (point-in-polygon for filled, stroke distance for stroked)
3. Return topmost hit layer

This must be implemented correctly in Phase 1 (Week 2) — selection depends on it.

---

## File Format Specification

### Overview

**Format Name:** `.design`  
**MIME Type:** `application/x-design`  
**Versioning:** Version field in header for future compatibility

### File Structure (Binary)

```
[HEADER]
  magic:          "DESIGN" (6 bytes, ASCII)
  version:        1 (u32, little-endian)
  flags:          {compression, colorspace, metadata} (u8)
  reserved:       0x00 (1 byte, padding)

[METADATA_LENGTH] (u32, little-endian)
[METADATA] (MessagePack)
  {
    "title": string,
    "author": string,
    "created": ISO8601 timestamp,
    "modified": ISO8601 timestamp,
    "colorspace": "srgb" | "p3" | "adobe-rgb",
    "width": number (canvas width),
    "height": number (canvas height),
    "assets": {
      "gradients": [...],
      "patterns": [...],
      "colors": [...]
    }
  }

[ARTBOARDS]
  count: u32 (number of artboards)
  for each artboard:
    [ARTBOARD_DATA]

[COMPRESSED_PAYLOAD] (Zstandard)
  Contains all binary raster data, paths, effects
```

### Artboard Structure (MessagePack)

```json
{
  "id": "artboard-uuid",
  "name": "iPhone 14 Pro",
  "x": 0,
  "y": 0,
  "width": 393,
  "height": 852,
  "backgroundColor": "#ffffff",
  "layers": [
    { "type": "vector|raster|group|adjustment", ...layer data... }
  ]
}
```

### Layer Types

#### Vector Layer

```json
{
  "id": "layer-uuid",
  "name": "Logo",
  "type": "vector",
  "visible": true,
  "locked": false,
  "opacity": 1.0,
  "blendMode": "normal",
  "transform": {
    "x": 0,
    "y": 0,
    "scaleX": 1,
    "scaleY": 1,
    "rotation": 0
  },
  "paths": [
    {
      "id": "path-uuid",
      "d": "M100 100 L200 100 L200 200 Z",
      "segments": [
        {"type": "move", "x": 100, "y": 100},
        {"type": "line", "x": 200, "y": 100},
        {"type": "line", "x": 200, "y": 200},
        {"type": "close"}
      ]
    }
  ],
  "fill": {
    "type": "solid|gradient|pattern",
    "color": "#000000",  // if solid
    "gradientId": "grad-123",  // if gradient
    "opacity": 1.0
  },
  "stroke": {
    "width": 2,
    "color": "#ffffff",
    "opacity": 1.0,
    "dasharray": [5, 5],  // optional
    "linecap": "butt|round|square",
    "linejoin": "miter|bevel|round"
  },
  "effects": [
    {
      "id": "effect-uuid",
      "type": "blur|shadow|drop-shadow|distort",
      "enabled": true,
      "opacity": 1.0,
      "params": { ...effect-specific... }
    }
  ]
}
```

#### Raster Layer

```json
{
  "id": "layer-uuid",
  "name": "Background",
  "type": "raster",
  "visible": true,
  "locked": false,
  "opacity": 1.0,
  "blendMode": "normal",
  "width": 1024,
  "height": 1024,
  "imageData": "raster-chunk-uuid",  // reference to compressed chunk
  "effects": [...]
}
```

#### Group Layer

```json
{
  "id": "layer-uuid",
  "name": "Icons",
  "type": "group",
  "visible": true,
  "locked": false,
  "opacity": 1.0,
  "blendMode": "normal",
  "children": [
    { ...vector layer... },
    { ...vector layer... }
  ],
  "mask": { ...layer... }  // optional, applied to group
}
```

#### Adjustment Layer

```json
{
  "id": "layer-uuid",
  "name": "Brightness",
  "type": "adjustment",
  "adjustmentType": "levels|curves|hue-sat|color-balance",
  "enabled": true,
  "opacity": 1.0,
  // params shape is determined by adjustmentType (discriminated union):
  "params": {
    // if adjustmentType === "levels":
    "blackPoint": 0, "whitePoint": 255, "gamma": 1.0,
    // if adjustmentType === "curves":
    // "points": [[0,0], [128,140], [255,255]],
    // if adjustmentType === "hue-sat":
    // "hue": 0, "saturation": 0, "lightness": 0,
    // if adjustmentType === "color-balance":
    // "shadows": 0, "midtones": 0, "highlights": 0
  }
}
```

### Gradient Structure

```json
{
  "id": "grad-uuid",
  "name": "Sunset",
  "type": "linear|radial|conical|box",
  "angle": 0,  // for linear/conical
  "x": 0.5,    // center/start for radial/box
  "y": 0.5,
  "radius": 0.5,  // for radial
  "stops": [
    {
      "offset": 0,
      "color": "#ff0000",
      "opacity": 1.0
    },
    {
      "offset": 0.5,
      "color": "#ffff00",
      "opacity": 1.0
    },
    {
      "offset": 1.0,
      "color": "#0000ff",
      "opacity": 1.0
    }
  ],
  "dithering": {
    "enabled": true,
    "algorithm": "bayer|floyd-steinberg|atkinson",
    "strength": 0.8,
    "seed": 12345
  }
}
```

### File Size Examples

| Content | Uncompressed | Compressed (.design) |
|---------|-------------|----------------------|
| 10 simple vector icons | ~50 KB | ~15 KB |
| Complex logo (100+ paths) | ~200 KB | ~60 KB |
| Artboard + 4K raster (PNG) | ~15 MB | ~3-5 MB |
| 20-artboard design system | ~2 MB | ~400 KB |

---

## Data Models

### Core TypeScript Types

```typescript
// types/document.ts

export interface Document {
  id: string
  metadata: DocumentMetadata
  artboards: Artboard[]
  assets: {
    gradients: Gradient[]
    patterns: Pattern[]
    colors: NamedColor[]
  }
}

export interface DocumentMetadata {
  title: string
  author: string
  created: string  // ISO8601
  modified: string
  colorspace: 'srgb' | 'p3' | 'adobe-rgb'
  width: number
  height: number
}

export interface Artboard {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  backgroundColor: string  // hex or rgb
  layers: Layer[]
}

export type Layer = 
  | VectorLayer 
  | RasterLayer 
  | GroupLayer 
  | AdjustmentLayer

export interface BaseLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  transform: Transform
  effects: Effect[]
}

export interface VectorLayer extends BaseLayer {
  type: 'vector'
  paths: Path[]
  fill: Fill | null
  stroke: Stroke | null
}

export interface RasterLayer extends BaseLayer {
  type: 'raster'
  // Use ImageData (not OffscreenCanvas) as the in-memory store.
  // OffscreenCanvas is NOT structuredClone-able, which breaks the command-pattern
  // undo system. Keep OffscreenCanvas as a transient render cache only (not in state).
  imageData: ImageData
  imageChunkId?: string  // reference to compressed chunk in .design file
  width: number
  height: number
}

export interface GroupLayer extends BaseLayer {
  type: 'group'
  children: Layer[]
  mask?: Layer
}

export interface LevelsParams { blackPoint: number; whitePoint: number; gamma: number }
export interface CurvesParams { points: [number, number][] }
export interface HueSatParams { hue: number; saturation: number; lightness: number }
export interface ColorBalanceParams { shadows: number; midtones: number; highlights: number }

export type AdjustmentParams =
  | { adjustmentType: 'levels'; params: LevelsParams }
  | { adjustmentType: 'curves'; params: CurvesParams }
  | { adjustmentType: 'hue-sat'; params: HueSatParams }
  | { adjustmentType: 'color-balance'; params: ColorBalanceParams }

// AdjustmentLayer uses a discriminated union — avoid `Record<string, any>`
// which loses all type safety for the params field.
export type AdjustmentLayer = BaseLayer & { type: 'adjustment' } & AdjustmentParams

export interface Path {
  id: string
  segments: Segment[]  // canonical source of truth — edit these
  closed: boolean
  // `d` (SVG path string) is derived from segments on render/export via
  // segmentsToSVGPath(segments). Do NOT store both — they will drift out of sync.
}

export type Segment = 
  | { type: 'move'; x: number; y: number }
  | { type: 'line'; x: number; y: number }
  | { type: 'cubic'; x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }
  | { type: 'quadratic'; x: number; y: number; cpx: number; cpy: number }
  | { type: 'arc'; x: number; y: number; rx: number; ry: number; rotation: number; largeArc: boolean; sweep: boolean }
  | { type: 'close' }

export interface Fill {
  type: 'solid' | 'gradient' | 'pattern'
  color?: string
  gradient?: Gradient
  pattern?: Pattern
  opacity: number
}

export interface Stroke {
  width: number
  color: string
  opacity: number
  dasharray?: [number, number]
  linecap: 'butt' | 'round' | 'square'
  linejoin: 'miter' | 'bevel' | 'round'
  miterLimit: number
}

export interface Gradient {
  id: string
  name: string
  type: 'linear' | 'radial' | 'conical' | 'box'
  angle?: number  // for linear/conical (degrees)
  x: number  // center for radial/box, start for linear (0-1 normalized)
  y: number
  radius?: number  // for radial (0-1)
  stops: GradientStop[]
  dithering: DitheringConfig
}

export interface GradientStop {
  offset: number  // 0-1
  color: string  // hex or rgb
  opacity: number
}

export interface DitheringConfig {
  enabled: boolean
  algorithm: 'none' | 'bayer' | 'floyd-steinberg' | 'atkinson' | 'jarvis' | 'stucki'
  strength: number  // 0-1
  seed: number
}

export interface Effect {
  id: string
  type: 'blur' | 'shadow' | 'drop-shadow' | 'distort' | 'glow'
  enabled: boolean
  opacity: number
  params: BlurEffect | ShadowEffect | DistortEffect
}

export interface BlurEffect {
  radius: number  // pixels
  quality: 'low' | 'medium' | 'high'
}

export interface ShadowEffect {
  offsetX: number
  offsetY: number
  blurRadius: number
  spread: number
  color: string
  opacity: number
}

export interface DistortEffect {
  type: 'warp' | 'wave' | 'twist'
  intensity: number
  scale: number
}

export interface Transform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number  // degrees
  skewX?: number
  skewY?: number
}

export type BlendMode = 
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'hard-light'
  | 'color-dodge'
  | 'color-burn'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface Pattern {
  id: string
  name: string
  imageChunkId: string  // reference to compressed chunk (same as raster layers)
  scale: number
  // Note: resolved ImageData is a transient render cache, not stored in state.
}

export interface NamedColor {
  id: string
  name: string
  value: string  // hex or rgb
  group?: string
}

export interface ViewportState {
  zoom: number  // 0.1 to 10.0
  panX: number
  panY: number
  artboardId: string
}

export interface SelectionState {
  layerIds: string[]
  pathIds?: string[]  // for path point selection
}
```

### Zustand Store Interface

```typescript
// store/editor.store.ts

// Command pattern for undo/redo — store operations, not document snapshots.
// Snapshot-based history (Document[]) would blow up with raster layers:
// 50 undo steps × 50MB 4K raster = potentially gigabytes.
export interface Command {
  id: string
  description: string          // e.g. "Move layer", "Apply gradient"
  execute: () => void          // apply the change
  undo: () => void             // reverse the change
}

export interface HistoryState {
  commands: Command[]
  index: number                // points to last executed command (-1 = empty)
}

export interface EditorStore {
  // State
  document: Document
  history: HistoryState
  viewport: ViewportState
  selection: SelectionState
  isDirty: boolean
  
  // Document actions
  newDocument: (width?: number, height?: number) => void
  openDocument: (file: File) => Promise<void>
  saveDocument: () => Promise<void>
  saveDocumentAs: (filename: string) => Promise<void>
  exportToSVG: (artboardId?: string) => Promise<string>
  exportToPNG: (artboardId?: string, dpi?: number) => Promise<Blob>
  
  // Artboard actions
  addArtboard: (name: string, width: number, height: number) => void
  deleteArtboard: (id: string) => void
  renameArtboard: (id: string, name: string) => void
  setCurrentArtboard: (id: string) => void
  
  // Layer actions
  addLayer: (type: Layer['type'], index?: number) => void
  deleteLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  reorderLayer: (id: string, newIndex: number) => void
  updateLayer: (id: string, updates: Partial<Layer>) => void
  setLayerVisibility: (id: string, visible: boolean) => void
  setLayerLocked: (id: string, locked: boolean) => void
  setLayerOpacity: (id: string, opacity: number) => void
  setLayerBlendMode: (id: string, mode: BlendMode) => void
  groupLayers: (layerIds: string[], groupName?: string) => void
  ungroupLayers: (groupId: string) => void
  
  // Path/vector actions
  addPath: (layerId: string, path: Path) => void
  updatePath: (layerId: string, pathId: string, path: Partial<Path>) => void
  deletePath: (layerId: string, pathId: string) => void
  addSegmentToPath: (layerId: string, pathId: string, segment: Segment) => void
  deleteSegmentFromPath: (layerId: string, pathId: string, segmentIndex: number) => void
  
  // Fill/stroke
  setFill: (layerId: string, fill: Fill | null) => void
  setStroke: (layerId: string, stroke: Stroke | null) => void
  
  // Effects
  addEffect: (layerId: string, effect: Effect) => void
  updateEffect: (layerId: string, effectId: string, params: Partial<Effect>) => void
  deleteEffect: (layerId: string, effectId: string) => void
  
  // Boolean operations
  applyBooleanOp: (
    layerId: string,
    pathId: string,
    operandLayerId: string,
    operandPathId: string,
    operation: 'union' | 'subtract' | 'intersect' | 'xor' | 'divide'
  ) => void
  
  // Selection
  selectLayer: (id: string, multiselect?: boolean) => void
  deselectAll: () => void
  selectAllLayers: () => void
  
  // Adjustment layers (typed — no `any`)
  addAdjustmentLayer: (adjustment: AdjustmentParams) => void
  updateAdjustmentParams: (layerId: string, params: AdjustmentParams['params']) => void
  
  // Undo/redo (command pattern — do not snapshot entire Document)
  pushCommand: (command: Command) => void  // execute + push to history
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  
  // Viewport
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  fitToScreen: (artboardId: string) => void
  
  // Assets
  addGradient: (gradient: Gradient) => void
  updateGradient: (id: string, gradient: Partial<Gradient>) => void
  deleteGradient: (id: string) => void
  
  // Utility
  setDirty: (isDirty: boolean) => void
}
```

---

## Rendering Pipeline

### Optimization Strategies

1.  **Layer Caching (OffscreenCanvas):** Each layer is rendered to its own `OffscreenCanvas`. Only redrawn when the layer's properties or paths change.
2.  **Dirty Rect / AABB (Axis-Aligned Bounding Boxes):** Instead of clearing the whole artboard, we calculate the bounding box of the changed element and only refresh that region in the compositor.
3.  **Spatial Indexing (Hit Testing):** Use an R-Tree (e.g., `rbush`) to index all paths and shapes. This allows $O(\log n)$ lookup for clicks and selection instead of $O(n)$ iteration through every layer.
4.  **Transferable Objects:** Large binary data (MessagePack buffers) are passed to/from the Electron main process as `ArrayBuffers` without cloning to avoid IPC lag.

### Viewport Rendering Flow

```
Frame Tick (60fps target)
  ↓
1. Detect dirty layers + Calculate Dirty Rect (AABB)
  ↓
2. For each dirty layer:
   a. If vector: render paths to OffscreenCanvas
   b. If raster: composite image to OffscreenCanvas
   c. If adjustment: apply filters (WebGL)
   d. Update cached bitmap
  ↓
3. Composite all layers (WebGL or Canvas 2D) within Dirty Rect
  ↓
4. Apply viewport transform (zoom/pan)
  ↓
5. Render selection overlays (paths, handles)
  ↓
6. Display to screen
```

### Canvas Rendering (Phase 1)

```typescript
// render/canvas-renderer.ts

export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private offscreenCanvases: Map<string, OffscreenCanvas>  // layer cache
  
  renderLayer(layer: Layer, artboard: Artboard): void {
    if (!layer.visible) return
    
    const offscreen = this.getOrCreateOffscreenCanvas(layer.id, layer.bounds)
    const octx = offscreen.getContext('2d')!
    
    if (layer.type === 'vector') {
      this.renderVectorLayer(octx, layer as VectorLayer)
    } else if (layer.type === 'raster') {
      this.renderRasterLayer(octx, layer as RasterLayer)
    }
    
    // Apply effects
    if (layer.effects.length > 0) {
      this.applyEffects(octx, layer.effects, offscreen)
    }
  }
  
  private renderVectorLayer(ctx: CanvasRenderingContext2D, layer: VectorLayer): void {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    
    for (const path of layer.paths) {
      // Set fill
      if (layer.fill) {
        if (layer.fill.type === 'solid') {
          ctx.fillStyle = this.colorToCanvasStyle(layer.fill.color!)
          ctx.globalAlpha = layer.fill.opacity
        } else if (layer.fill.type === 'gradient') {
          const gradient = this.createCanvasGradient(ctx, layer.fill.gradient!)
          ctx.fillStyle = gradient
          ctx.globalAlpha = layer.fill.opacity
        }
      }
      
      // Set stroke
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke.color
        ctx.lineWidth = layer.stroke.width
        ctx.lineCap = layer.stroke.linecap
        ctx.lineJoin = layer.stroke.linejoin
        ctx.globalAlpha = layer.stroke.opacity
      }
      
      // Render path
      this.renderPath(ctx, path)
    }
    
    ctx.globalAlpha = 1.0
  }
  
  private renderPath(ctx: CanvasRenderingContext2D, path: Path): void {
    const pathObj = new Path2D(path.d)
    
    if (ctx.fillStyle) ctx.fill(pathObj)
    if (ctx.strokeStyle) ctx.stroke(pathObj)
  }
  
  // bounds: bounding box of the layer/path in canvas-local coordinates
  private createCanvasGradient(
    ctx: CanvasRenderingContext2D,
    gradient: Gradient,
    bounds: { x: number; y: number; width: number; height: number }
  ): CanvasGradient {
    let canvasGradient: CanvasGradient
    const { x, y, width, height } = bounds
    const cx = x + width * gradient.x
    const cy = y + height * gradient.y

    if (gradient.type === 'linear') {
      // Project gradient start/end across the bounding box using angle
      const rad = (gradient.angle || 0) * (Math.PI / 180)
      const half = Math.max(width, height) / 2
      canvasGradient = ctx.createLinearGradient(
        cx - half * Math.cos(rad),
        cy - half * Math.sin(rad),
        cx + half * Math.cos(rad),
        cy + half * Math.sin(rad)
      )
    } else if (gradient.type === 'radial') {
      const r = (gradient.radius || 0.5) * Math.max(width, height)
      canvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    } else {
      // conical and box gradients are NOT natively supported by Canvas 2D.
      // These require pixel-level shader rendering (WebGL or OffscreenCanvas CPU loop).
      // Phase 3 implementation: render to ImageData via custom algorithm, then
      // drawImage() the result — do NOT attempt a Canvas gradient fallback.
      // For now, degrade to a flat color (first stop).
      canvasGradient = ctx.createLinearGradient(x, y, x + width, y)
    }

    for (const stop of gradient.stops) {
      canvasGradient.addColorStop(stop.offset, stop.color)
    }

    return canvasGradient
  }
}
```

### Compositing with Blend Modes (Phase 2+)

```typescript
// For blend modes beyond Canvas 2D support, use WebGL

export class WebGLCompositor {
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  
  compositeWithBlendMode(
    sourceTexture: WebGLTexture,
    destTexture: WebGLTexture,
    blendMode: BlendMode,
    opacity: number
  ): WebGLTexture {
    const blendShader = this.getBlendShader(blendMode)
    this.gl.useProgram(this.program)
    
    // ... bind textures, set uniforms ...
    // ... render to output framebuffer ...
    
    return outputTexture
  }
  
  private getBlendShader(mode: BlendMode): string {
    // Return GLSL fragment shader for blend mode
    // Examples: multiply, screen, overlay, etc.
  }
}
```

---

## Phase Breakdown

### Phase 0: Infrastructure & "Round-Trip" (Week 0)

**Goal:** "Ensure the foundation is rock-solid before building UI"

**Tasks:**
- [ ] **Project Scaffold:** Vite + React + Zustand + Electron boilerplate.
- [ ] **The Round-Trip Test:** Script that generates a mock Document → MessagePack → Zstd → Save → Load → Compare.
- [ ] **Viewport Scaffold:** Basic zoom/pan logic on an empty grid (the "physics" of the editor).
- [ ] **Immer Setup:** Integrate Immer with Zustand for patch-based undo/redo.

**Deliverable:** A working "empty" app that can save/load a mock file and zoom/pan.

### Phase 1: Core Vector Editor (Weeks 1-4)

**Goal:** "I can draw paths, apply solid colors, save, load, export SVG"

#### Week 1: State & Serialization
- [ ] Finalize `.design` MessagePack schema.
- [ ] Implement `rbush` for spatial indexing (Hit Testing).
- [ ] UI Shell (Toolbar, Panels).

#### Week 2: Pen Tool & Math
- [ ] Implement Pen tool logic (click-to-add, drag-to-handle).
- [ ] Bezier curve rendering with path caching.
- [ ] Bounding box (AABB) calculation for all paths.

#### Week 3: Selection & Transform
- [ ] Spatial hit testing for selection (click to select path).
- [ ] Transform handles (move/scale/rotate) with patch-based history.
- [ ] Undo/redo system (History of JSON Patches).

#### Week 4: Colors & Export
- [ ] Color picker + Fill/Stroke logic.
- [ ] SVG/PNG export pipelines.
- [ ] Keyboard shortcut manager.

#### Acceptance Criteria for Phase 1
- ✅ Can create vector paths (pen tool works)
- ✅ Can apply solid fills/strokes
- ✅ Can save/load `.design` files
- ✅ Can export to SVG (with proper paths)
- ✅ Undo/redo works
- ✅ Keyboard shortcuts for common ops

---

### Phase 2: Raster & Composite (Weeks 5-7)

**Goal:** "I can blend vector + raster, apply effects, use adjustment layers"

#### Week 5: Raster Layers

**Tasks:**
- [ ] Import PNG/JPG/GIF
- [ ] Raster layer type (store image data)
- [ ] Raster layer rendering to canvas
- [ ] Layer opacity
- [ ] Layer blend modes (Canvas 2D: normal, multiply, screen, overlay, etc.)
- [ ] Layer ordering (move vectors above rasters)

**Deliverable:** Import a photo, place vector shapes on top, blend them together

#### Week 6: Effects & Adjustment Layers

**Tasks:**
- [ ] Blur effect (canvas filter + offscreen canvas)
- [ ] Drop shadow
- [ ] Adjustment layers (Levels, Hue-Saturation)
- [ ] Effect UI (parameter sliders)
- [ ] Non-destructive effect editing (chain multiple)

**Deliverable:** Apply blur + drop shadow to vector, add levels adjustment to raster

#### Week 7: Layer Masks & Groups

**Tasks:**
- [ ] Layer groups (nest layers)
- [ ] Group opacity/blend
- [ ] Layer masks (raster + vector)
- [ ] Mask editing (separate UI)

**Deliverable:** Group icons, apply mask, create organized layer hierarchy

#### Acceptance Criteria for Phase 2
- ✅ Raster layers render correctly
- ✅ Blend modes work (multiply, screen, overlay, etc.)
- ✅ Effects (blur, shadow) apply non-destructively
- ✅ Adjustment layers (levels, hue-sat)
- ✅ Export PNG preserves all compositing
- ✅ Masks work on rasters

---

### Phase 3: Gradients & Dithering (Weeks 8-9)

**Goal:** "Complex gradients, dithering, ready for advanced work"

#### Week 8: Gradient Editor
- [ ] Multistop gradient UI.
- [ ] WebGL-based gradient preview for real-time performance.

#### Week 9: Dithering
- [ ] Dithering algorithms: Bayer, Floyd-Steinberg, Atkinson (CPU for export correctness)
- [ ] Dithering UI: algorithm picker, strength slider
- [ ] Dithering on export (PNG/JPG only — rasterize with dithering applied)
- [ ] Dithering preview in viewport: **toggle only, not live per-frame**.
  Real-time dithering at 4K in JS is too slow for 60fps. User clicks "Preview Dithering"
  to compute once and display as an overlay. Clear on next edit.
  (Optional: WebGL fragment shader for live preview as a stretch goal)
- [ ] Dithering export settings (algorithm, strength, seed)

#### Acceptance Criteria for Phase 3
- ✅ All gradient types render
- ✅ Multistop gradients work
- ✅ Dithering on export (multiple algorithms)
- ✅ Export PNG with dithering looks good
- ✅ Complex gradient + raster meme creation works

---

### Phase 4: Boolean Ops & Polish (Weeks 10-13)

**Goal:** "Professional-grade vector operations, multi-artboard, shipping"

#### Week 10: Boolean Operations

**Tasks:**
- [ ] Implement boolean ops (union, subtract, intersect, xor, divide)
- [ ] Boolean UI (toolbar buttons, contextual menu)
- [ ] Path ops (offset, expand stroke, simplify)
- [ ] Path union/merge (combining paths)

**Deliverable:** Create shape, subtract another shape, get clean result

#### Week 11: Multi-Artboard & Viewport

**Tasks:**
- [ ] Artboard manager UI (create, delete, duplicate, rename)
- [ ] Multi-artboard viewport (zoom out to see all)
- [ ] Artboard scrolling/navigation
- [ ] Fit to screen
- [ ] Artboard selection (highlight current)

**Deliverable:** Create 10 artboards for revisions, navigate between them

#### Week 12: Shape Tools & Advanced Features

**Tasks:**
- [ ] Shape tools (rectangle, circle, polygon, star)
- [ ] Text tool (basic—single-line text rendering)
  - SVG export of text is straightforward (`<text>` element) and can be done in Phase 4
  - PNG rasterization of text uses Canvas 2D `fillText()` — also straightforward
  - Complex text layout (wrapping, kerning, RTL) is explicitly out of scope for v1.0
- [ ] Comprehensive keyboard shortcuts
- [ ] Preferences/settings
- [ ] History panel (visual undo tree)

**Deliverable:** Draw shapes with tools, not just pen tool

#### Week 13: Performance & Polish

**Tasks:**
- [ ] Profile rendering (target 60fps)
- [ ] Optimize layer caching
- [ ] Optimize file I/O (fast saves)
- [ ] Test with large documents (20+ artboards)
- [ ] Bug fixes, edge cases

**Deliverable:** Complex document (20 artboards, 100+ paths) opens/saves fast

#### Acceptance Criteria for Phase 4
- ✅ Boolean operations work (union, subtract, etc.)
- ✅ Multi-artboard workflow is smooth
- ✅ Shape tools work
- ✅ Viewport 60fps with large documents
- ✅ Ready for daily use

---

### Phase 5: Electron & Shipping (Weeks 14-16)

**Goal:** "Desktop app, fully featured, production-ready"

#### Week 14: Electron Setup

**Tasks:**
- [ ] Electron main process
- [ ] IPC bridge for file I/O
- [ ] Menu bar (File, Edit, View, Help)
- [ ] Window management (remember size/position)
- [ ] Native file dialogs (Open, Save, Export)
- [ ] Recent files list

**Deliverable:** App runs as native desktop app (Windows/Mac/Linux)

#### Week 15: File Format & Versioning

**Tasks:**
- [ ] File format versioning (handle future compatibility)
- [ ] Migration tools (if format changes)
- [ ] Compression optimization (Zstandard tuning)
- [ ] Large file handling (memory-efficient loading)

**Deliverable:** Can handle .design files even if format evolves

#### Week 16: Final Polish & Shipping

**Tasks:**
- [ ] Full keyboard shortcut customization
- [ ] Custom UI theme (dark mode, light mode)
- [ ] Help/documentation
- [ ] Error handling (graceful crashes, recovery)
- [ ] Performance audit

**Deliverable:** Ship v1.0 (functional, stable, daily-driver quality)

---

## Tech Stack

### Frontend

| Layer | Choice | Reason |
|-------|--------|--------|
| **Framework** | React 18 + TypeScript | Type safety, familiar |
| **State** | Zustand + Immer | Patches for Undo/Redo, clean state updates |
| **Rendering** | Canvas 2D + WebGL | WebGL for live dithering/blend modes |
| **Math** | Bezier.js + rbush | Curve math + Spatial Indexing for Hit Testing |
| **Color** | Chroma.js | Color conversions, gradients |
| **Serialization** | MessagePack | Compact binary, fast encode/decode |
| **Compression** | Zstandard.js | Better compression than gzip |

### Desktop

| Layer | Choice | Reason |
|-------|--------|--------|
| **App** | Electron | Cross-platform, proven, trusted |
| **Build** | Vite + esbuild | Fast builds, excellent DX |
| **Bundler** | esbuild + Rollup | Fast, tree-shakeable |

### Development

| Tool | Purpose |
|------|---------|
| **Vite** | Dev server, HMR, fast builds |
| **Jest + Testing Library** | Component testing |
| **ESLint + Prettier** | Code quality |
| **Storybook** (optional) | Component library |

### Libraries

```json
{
  "dependencies": {
    "react": "^18.x",
    "zustand": "^4.x",
    "immer": "^10.x",
    "rbush": "^3.x",
    "bezier-js": "^6.x",
    "clipper-lib": "^6.x",
    "chroma-js": "^2.x",
    "msgpackr": "^1.x",
    "zstd-codec": "^0.x",
    "electron": "^latest"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^latest",
    "vitest": "^latest",
    "@testing-library/react": "^14.x",
    "eslint": "^8.x",
    "prettier": "^3.x"
  }
}
```

### Why These Choices

- **Zustand over Redux:** Less boilerplate, better for graphics apps
- **MessagePack over JSON:** 50-70% smaller files, faster parsing
- **Zstandard over gzip:** 10-20% better compression ratio
- **Canvas 2D over SVG rendering:** Better performance for interactive editing
- **bezier-js for curve math:** Proven interpolation, tangents, arc length — NOT for boolean ops
- **clipper-lib for boolean ops:** Polygon clipping (union/subtract/intersect/xor). Bezier curves
  are flattened to polylines → clipped by Clipper → re-fit to beziers

---

## Development Workflow

### Repository Structure

```
design-editor/
├── src/
│   ├── types/           # TypeScript interfaces
│   ├── store/           # Zustand state
│   ├── render/          # Canvas rendering
│   ├── tools/           # User interaction tools
│   ├── effects/         # Effect rendering
│   ├── math/            # Math utilities (bezier, color, etc.)
│   ├── io/              # File I/O
│   ├── ui/              # React components
│   ├── electron/        # Electron main process
│   └── App.tsx
├── tests/
│   ├── render.test.ts
│   ├── math.test.ts
│   ├── io.test.ts
│   └── store.test.ts
├── public/
│   └── index.html
├── vite.config.ts
├── tsconfig.json
├── electron.main.ts
├── electron-builder.json
├── package.json
└── README.md
```

### Git Workflow

```bash
# Main branch: stable, production-ready
# Dev branch: integration, tested features
# Feature branches: feature/pen-tool, feature/gradients, etc.

git checkout -b feature/pen-tool
# ... work ...
git commit -m "feat: implement pen tool with bezier handles"
git push origin feature/pen-tool
# → PR → review → merge to dev → test → merge to main
```

### Development Cycle (per week)

```
Monday:   Plan tasks for week
Tuesday:  Heavy development (Claude Code for math/complex UI)
Wednesday: Testing, code review, bug fixes
Thursday: More development, performance optimization
Friday:   Polish, documentation, prepare for next week
```

### Claude Code Usage Pattern

**You request:**
```
Build the gradient editor UI:
- Linear gradient display
- Stop list (add/delete stops)
- Color picker for each stop
- Offset slider (0-100%)
- Preview of gradient
Keep it pixel-perfect and handle all interactions.
```

**Claude delivers:**
```
[Complete React component with state, event handlers, styling]
```

**You:**
```
Test it, adjust UX, integrate with store, optimize if slow
```

---

## Performance Targets

### Rendering

| Metric | Target | Rationale |
|--------|--------|-----------|
| Viewport FPS | 60 | Smooth interaction |
| Pan/zoom latency | <16ms | No input lag |
| Redraw (dirty layer) | <8ms | Real-time feedback |
| Open file | <2s (10MB file) | Snappy startup |
| Save file | <500ms | No UI freeze |

### Memory

| Scenario | Target |
|----------|--------|
| 20-artboard design | <200MB |
| Single 4K raster layer | <50MB |
| Full undo history (50 steps) | <500MB |

### File Size

| Content | Target Size (compressed) |
|---------|--------------------------|
| Simple logo (10 vectors) | <20KB |
| Complex icon set (100 vectors) | <100KB |
| Artboard + 4K raster | <5MB |
| Design system (20 artboards) | <1MB |

---

## Testing & QA

### Unit Tests

```typescript
// math/bezier.test.ts
describe('Bezier curves', () => {
  it('should interpolate point on curve', () => {
    const curve = new BezierCurve(...)
    const point = curve.getPointAtT(0.5)
    expect(point).toEqual({ x: ..., y: ... })
  })
})

// io/file-format.test.ts
describe('File format', () => {
  it('should save and load document without data loss', async () => {
    const original = createTestDocument()
    const encoded = encodeDocument(original)
    const decoded = decodeDocument(encoded)
    expect(decoded).toEqual(original)
  })
})
```

### Integration Tests

```typescript
// Full workflow tests
describe('Vector editing workflow', () => {
  it('should create path, apply gradient, export SVG', () => {
    // 1. Draw path
    // 2. Apply gradient fill
    // 3. Export to SVG
    // 4. Verify SVG contains correct path + gradient
  })
})
```

### Manual Testing Checklist (Per Phase)

**Phase 1:**
- [ ] Pen tool creates paths
- [ ] Colors apply correctly
- [ ] Save/load preserves data
- [ ] Export SVG is valid
- [ ] Undo/redo works

**Phase 2:**
- [ ] Raster layers composite
- [ ] Blend modes look right
- [ ] Effects stack properly
- [ ] Adjustment layers apply

**Phase 3:**
- [ ] Gradients render smoothly
- [ ] Dithering looks good on export
- [ ] All gradient types work

**Phase 4:**
- [ ] Boolean ops produce clean results
- [ ] Multi-artboard navigation smooth
- [ ] Shape tools work as expected
- [ ] Large document loads fast

---

## Risks & Mitigation

### Risk 1: Bezier Math Complexity

**Risk:** Implementing bezier operations (intersection, offset, boolean) is mathematically complex.

**Mitigation:**
- **Boolean ops require Clipper.js** (or `polybool`/`martinez-polygon-clipping`), NOT Bezier.js.
  Bezier.js handles curve math (interpolation, tangents, length) — it does not do polygon
  clipping. Using the wrong library here would mean rewriting Phase 4 from scratch.
- Bezier.js for curve geometry (pen tool handles, offset paths, arc length)
- Clipper.js for boolean operations (union, subtract, intersect, xor, divide)
- Curves must be flattened to polylines before passing to Clipper, then re-fit to beziers
- Claude Code for the flattening/re-fitting pipeline
- Test heavily with edge cases (overlapping paths, self-intersecting paths)

### Risk 2: Performance with Large Rasters

**Risk:** 4K rasters in Canvas could be slow/memory-intensive.

**Mitigation:**
- Load rasters as OffscreenCanvas (non-blocking)
- Implement tile rendering for very large images
- Profile early, optimize if needed
- Consider WebGL for raster composition (Phase 3+)

### Risk 3: File Format Stability

**Risk:** Changing file format mid-development breaks existing files.

**Mitigation:**
- Lock format by end of Phase 1
- Add version field for future compatibility
- Document format thoroughly
- Test backward compatibility

### Risk 4: Electron Build Complexity

**Risk:** Cross-platform desktop builds could be tricky.

**Mitigation:**
- Start with web version (Vite dev server)
- Add Electron late (Week 14, after features stable)
- Use electron-builder for packaging
- Test on Windows/Mac/Linux early

### Risk 5: Scope Creep

**Risk:** Want to add features (3D, AI, collaboration) during dev.

**Mitigation:**
- Lock scope to Phase 5 only
- Defer anything beyond basic feature set
- Evaluate after shipping v1.0
- Focus on doing core features *really well*

---

## Success Criteria

### Phase 1 ✅
You can create a logo from scratch, save it, open it, edit it, export to SVG.

### Phase 2 ✅
You can composite vector + raster, apply effects, create realistic designs.

### Phase 3 ✅
You can create dithered gradients, make meme-quality graphics.

### Phase 4 ✅
You have a fully featured vector editor that handles your actual workflows (boolean ops, multi-artboard, performance).

### Phase 5 ✅
You have a native desktop app you'd use daily instead of Affinity.

---

## Deployment & Distribution

### MVP (Phase 3-4)
- GitHub releases with binary downloads
- Windows (x64 + ARM64)
- macOS (Intel + Apple Silicon)
- Linux (x64)
- Installer via electron-builder

### Future (Post-v1.0)
- Auto-updates (Electron updater)
- Optional: Community builds / package managers (homebrew, apt, etc.)
- Optional: Web version (Vite + ServiceWorker for offline)

---

## Next Steps

1. **Create repository** on GitHub (private or public)
2. **Copy this PLAN.md** to repo root
3. **Set up boilerplate:**
   - `vite.config.ts`
   - `tsconfig.json`
   - `package.json` (with dependencies)
   - Basic React + Electron structure
4. **Start Phase 1, Week 1:**
   - File format design
   - Zustand store
   - Canvas viewport

**Recommendation:** Start small (file format + blank canvas), then progressively build toward pen tool.

---

## Appendix: Design Decisions Log

### Q: Why MessagePack + Zstandard instead of JSON?
**A:** MessagePack is ~60% smaller, faster to parse. Zstandard compresses 10-20% better than gzip. Combined: typical 20MB file → 3-5MB.

### Q: Why not three.js for rendering?
**A:** Canvas 2D is simpler for 2D design editor. WebGL adds complexity (shaders, textures). Defer to Phase 2 if blend modes need it.

### Q: Why Zustand instead of Redux?
**A:** Redux is overkill for a graphics editor. Zustand is lighter, faster, easier to reason about. Good DX for rapid development.

### Q: Why Electron instead of Tauri?
**A:** Electron is proven, has better ecosystem. Tauri is lighter but newer; Electron is safer choice for critical tool.

### Q: Can we support AF import later?
**A:** Possibly, but AF format is proprietary. Focus on open formats (SVG, PNG). Document your designs in `.design` going forward.

### Q: Should we add cloud sync?
**A:** Not in Phase 1-5. Local-first design. Could integrate with Lyku infrastructure later if desired.

### Q: Why clipper-lib for boolean ops instead of Bezier.js?
**A:** bezier-js handles curve math (interpolation, tangents, arc length) — it does not do path
boolean operations. Polygon clipping requires a dedicated library. Clipper.js is the most proven
option (used by paper.js, inkscape-js, etc.). The pipeline: flatten bezier curves to polylines →
pass to Clipper → re-fit result to bezier curves.

### Q: Why command-pattern undo instead of document snapshots?
**A:** Document snapshots (storing `Document[]` in history) are fine for pure vector work but fail
immediately when raster layers are present. A 4K raster layer is ~50MB; 50 undo steps = ~2.5GB.
Command pattern stores only the delta (e.g., "layer X moved from (10,10) to (20,20)"), making
undo O(1) in memory regardless of document size.

---

**Document Version:** 1.1
**Last Updated:** 2026-03-07
**Author:** Nicole + Claude
