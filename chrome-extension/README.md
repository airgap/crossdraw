# Crossdraw Text Picker — Chrome Extension

Select text on any website and copy its content + full styling to paste into Crossdraw as a text layer.

## What it captures

- Font family, size, weight (numeric), style
- Color (resolved RGBA)
- Letter spacing, word spacing, line height
- Text decoration, text transform
- Font variation settings (variable font axes)
- OpenType feature settings (ligatures, small caps, etc.)
- Font kerning, writing mode, text orientation
- Selected text content (or full element text)

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory

## Usage

1. Click the extension icon in the toolbar (or press **Alt+Shift+T**)
2. Hover over any text — you'll see a preview of the font + color
3. Click to capture — the style is copied to clipboard
4. In Crossdraw, press **Ctrl+V** — a text layer is created with the exact styling
5. Press **Escape** to cancel without picking

## How it works

The extension reads `getComputedStyle()` from the clicked element, packages all text-related CSS properties into a JSON payload, and writes it to the system clipboard. Crossdraw's paste handler detects the `_crossdraw: "text-style"` marker and creates a TextLayer with all properties mapped.

## Generating icons

```bash
bun scripts/generate-extension-icons.ts
```
