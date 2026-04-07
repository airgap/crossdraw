# Crossdraw

A lightweight, privacy-first vector and raster design editor. Built as an open alternative to Affinity Designer, optimized for vector illustration, gradient complexity, raster compositing, and batch artboard workflows.

**Local-first. No cloud vendor lock-in. Full ownership of your files and data.**

## Features

### Vector Editing
- Pen tool with full Bezier curve support, curvature pen, and node editing
- Shape tools: rectangle, ellipse, polygon, star, spiral, line
- Boolean operations: union, subtract, intersect, XOR, divide
- Path operations: offset, expand stroke, simplify, compound paths
- Shape builder, knife tool, and path cutting
- Clipping masks, blend tool, and repeater patterns

### Raster & Compositing
- 30+ layer blend modes with full compositing pipeline
- Brush, pencil, eraser, clone stamp, healing brush, and mixer brush
- Pressure-sensitive stylus support
- Content-aware fill, move, and scale (seam carving)
- Dodge/burn, smudge, sharpen/blur brush, red-eye removal
- Frequency separation, patch tool, and spot healing
- Layer masks, adjustment layers (levels, curves, hue-saturation, color balance)
- Layer effects: drop shadow, glow, stroke, blur

### Gradients & Fills
- Linear, radial, conical, and box gradients with multistop editor
- Gradient dithering (Bayer, Floyd-Steinberg)
- Mesh gradients and procedural noise fills
- Variable-width strokes

### Text & Typography
- Artistic text and frame text (text boxes with wrapping)
- Text on path and text warping
- Variable fonts support with font matching
- Text styles and typography panel

### Selection Tools
- Marquee, lasso, polygonal lasso, magnetic lasso
- Color range selection and quick selection
- Select subject, select sky, and focus area detection
- Quick mask mode and refine edge
- Selection filters and object selection

### Warp & Transform
- Perspective transform, liquify, mesh warp
- Puppet warp, perspective warp, cage transform
- Envelope distortion, 3D extrusion
- Image trace (raster to vector)

### Color Management
- sRGB, Adobe RGB, Display P3, and CMYK color spaces
- ICC profile support and soft proofing
- HDR color support
- Spot colors and color separations
- Color harmony panel and global color swatches

### Import Formats
- PSD (Photoshop) with layer parsing, blend modes, and masks
- Figma (via URL/API)
- Sketch, Illustrator (AI), Affinity Designer (.afdesign)
- SVG, EPS, RAW images, GIF (animated)

### Export Formats
- **Vector:** SVG, EPS, PDF, PDF/X (print-ready)
- **Raster:** PNG, JPEG, WebP, AVIF, HEIF, TIFF, OpenEXR
- **Animation:** GIF, MP4, WebM, Lottie
- **Code:** React, Flutter, Swift, CSS
- **Other:** Design tokens, color separations, website HTML, batch export
- Slice tool for export regions with batch pipeline

### Collaboration & Cloud
- Real-time co-editing with CRDT sync
- Live cursors and shared asset libraries
- Comments with threaded replies
- Cloud sync and share links with permissions
- Document versioning and branching

### Additional Capabilities
- Artboards with infinite canvas
- Symbols and component instances
- Auto-layout (constraint-based sizing)
- Interactive prototyping with hotspot links
- Design variables and tokens
- Plugin system with sandboxed execution
- Rulers, smart guides, grids, and snapping
- Measurement tool and CSS inspector
- Minimap, histogram, and design lint
- PNGTuber asset configuration
- Keyboard shortcut customization
- Touch-friendly interface
- Accessibility support (screen reader, high contrast, focus management)

### AI-Powered Tools
- Generative fill and expand
- Background and object removal
- Super-resolution upscaling
- Neural filters and ML-based denoise

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 18, TypeScript 5.7 |
| State Management | Zustand + Immer (patch-based undo/redo) |
| Build Tool | Vite 6 |
| Runtime | Bun |
| Desktop | Electron 40 |
| Mobile | Capacitor 8 (Android & iOS) |
| Web Server | Bun compiled binaries |
| Testing | Vitest, Testing Library |
| Geometry | Bezier.js, Clipper-lib, RBush |
| Color | Chroma.js, custom ICC/CMYK/HDR |
| Serialization | MessagePack (msgpackr), fflate compression |
| CI/CD | Jenkins, Cloudflare Workers + R2 |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- Git

### Install

```bash
git clone <repo-url>
cd Crossdraw
bun install
```

### Development

```bash
# Start dev server (http://localhost:5173)
bun run dev

# Type check
bun run typecheck

# Lint
bun run lint

# Format code
bun run format

# Run tests
bun test
```

### Build

```bash
# Build web assets
bun run build

# Preview production build
bun run preview
```

### Desktop App (Electron)

```bash
# Development (requires dev server running)
bun run electron:dev

# Build & package
bun run electron:pack            # All platforms
bun run electron:pack:win        # Windows (NSIS + portable)
bun run electron:pack:mac        # macOS (DMG, universal)
bun run electron:pack:linux      # Linux (AppImage + deb)
```

Packaged apps are output to the `release/` directory.

### Web Server (Standalone Binary)

The standalone server embeds all web assets into a single binary — no Node.js or Bun required on the target machine.

```bash
# Run with Bun
bun run server:dev

# Compile native binaries
bun run server:compile                  # Current platform
bun run server:compile:linux-x64
bun run server:compile:linux-arm64
bun run server:compile:darwin-x64       # macOS Intel
bun run server:compile:darwin-arm64     # macOS Apple Silicon
bun run server:compile:windows-x64
```

### Mobile (Capacitor)

```bash
# Sync web assets to native projects
bun run mobile:sync

# Android
bun run mobile:android:build    # Build APK
bun run mobile:android:open     # Open in Android Studio

# iOS
bun run mobile:ios:build        # Build archive
bun run mobile:ios:open         # Open in Xcode
```

## Project Structure

```
src/
├── ai/              # AI/ML features (generative fill, super-resolution)
├── animation/       # Timeline, keyframes, video export (MP4/WebM)
├── auth/            # OAuth & authentication
├── cloud/           # Cloud sync, shared libraries, preferences
├── codegen/         # Code generation (React, Flutter, Swift, CSS)
├── collab/          # Real-time collaboration (CRDT, cursors, sync)
├── color/           # Color spaces, ICC profiles, CMYK, HDR, soft proof
├── effects/         # Adjustment layers, layer effects, range masks
├── filters/         # Image filters (blur, sharpen, denoise, distort, etc.)
├── io/              # File I/O — import (PSD, Figma, Sketch, AI, SVG, RAW)
│                    #            export (SVG, PDF, PNG, TIFF, GIF, MP4, etc.)
├── layers/          # Layer operations and management
├── layout/          # Auto-layout and constraint system
├── math/            # Geometry, bounding boxes, hit testing, viewport math
├── plugins/         # Plugin manager, sandbox, and API
├── prototype/       # Interactive prototyping player
├── render/          # Canvas rendering, blend modes, gradients, smart guides,
│                    #   rulers, layer cache, 3D extrusion, perspective grid
├── store/           # Zustand state (editor store, raster data, undo)
├── tools/           # 85+ editing tools (pen, brush, selection, warp, etc.)
├── types/           # TypeScript type definitions and document model
├── ui/              # 65+ React components (toolbar, panels, dialogs, menus)
├── variables/       # Design variables and tokens
└── versioning/      # Document version control
electron/            # Electron main process, preload, IPC bridge
server/              # Standalone HTTP/WebSocket server
tests/               # 215+ test files with fixtures
android/             # Android app (Capacitor)
ios/                 # iOS app (Capacitor)
vscode-extension/    # VS Code language support
```

## File Format

Crossdraw uses the `.crow` file format — a MessagePack-encoded document with fflate compression. The format stores the full document model including artboards, layers, vector paths, raster data, gradients, symbols, styles, comments, and design variables.

## CI/CD

The Jenkins pipeline runs on pushes to `main` and `release/*` branches:

1. **Build & Test** — Format check, TypeScript compilation, test suite, Vite build
2. **Package** (parallel) — Electron apps (Linux, macOS, Windows), web server binaries (5 platforms), Android APK
3. **Deploy** — Cloudflare Workers + R2 for web app and release binaries

## Author

**airgap** — [crossdraw.app](https://crossdraw.app)
