/**
 * Shared test preload — sets up global polyfills once for ALL test files.
 * Configured via bunfig.toml [test].preload.
 *
 * This prevents individual test files from installing competing polyfills
 * that leak across files and cause non-deterministic failures.
 */

// ── ImageData polyfill ──────────────────────────────────────────
if (typeof globalThis.ImageData === 'undefined') {
  ;(globalThis as any).ImageData = class ImageData {
    readonly width: number
    readonly height: number
    readonly data: Uint8ClampedArray
    readonly colorSpace: string
    constructor(widthOrData: number | Uint8ClampedArray, heightOrWidth: number, height?: number) {
      if (typeof widthOrData === 'number') {
        this.width = widthOrData
        this.height = heightOrWidth
        this.data = new Uint8ClampedArray(widthOrData * heightOrWidth * 4)
      } else {
        this.data = widthOrData
        this.width = heightOrWidth
        this.height = height ?? widthOrData.length / (heightOrWidth * 4)
      }
      this.colorSpace = 'srgb'
    }
  }
}

// ── OffscreenCanvas polyfill ────────────────────────────────────
if (typeof globalThis.OffscreenCanvas === 'undefined') {
  function parseHexToRgb(hex: string): [number, number, number] {
    let h = hex.replace('#', '')
    if (h.length === 3) {
      h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!
    }
    const n = parseInt(h, 16)
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
  }

  function parseRgba(str: string): [number, number, number, number] | null {
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
    if (!m) return null
    return [
      parseInt(m[1]!, 10),
      parseInt(m[2]!, 10),
      parseInt(m[3]!, 10),
      m[4] !== undefined ? Math.round(parseFloat(m[4]!) * 255) : 255,
    ]
  }

  function parseFillColor(style: any): [number, number, number, number] | null {
    if (typeof style === 'string') {
      if (style.startsWith('#')) {
        const [r, g, b] = parseHexToRgb(style)
        return [r, g, b, 255]
      }
      if (style.startsWith('rgb')) return parseRgba(style)
    }
    // Gradient object — use first color stop as approximation
    if (style && style._stops && style._stops.length > 0) {
      return parseRgba(style._stops[0].color)
    }
    return null
  }

  ;(globalThis as any).OffscreenCanvas = class OffscreenCanvas {
    width: number
    height: number
    _imageData: ImageData
    private _ctx: any = null
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
      this._imageData = new ImageData(w, h)
    }
    getContext(_type?: string): any {
      if (this._ctx) return this._ctx
      const self = this

      // Per-context path state for arc+fill
      let pendingArc: { cx: number; cy: number; r: number } | null = null

      const ctx: any = {
        getImageData: (_sx: number, _sy: number, sw: number, sh: number) => {
          if (sw === self.width && sh === self.height) {
            const copy = new ImageData(sw, sh)
            copy.data.set(self._imageData.data)
            return copy
          }
          return new ImageData(sw, sh)
        },
        putImageData: (data: ImageData) => {
          self._imageData = data
        },
        createImageData: (w: number, h: number) => new ImageData(w, h),
        drawImage: (source: any, dx: number, dy: number) => {
          if (!source?._imageData) return
          const srcData = source._imageData.data
          const srcW = source._imageData.width
          const srcH = source._imageData.height
          const dstData = self._imageData.data
          const dstW = self.width
          const dstH = self.height
          const dxi = Math.round(dx)
          const dyi = Math.round(dy)
          for (let sy = 0; sy < srcH; sy++) {
            const dstY = dyi + sy
            if (dstY < 0 || dstY >= dstH) continue
            for (let sx = 0; sx < srcW; sx++) {
              const dstX = dxi + sx
              if (dstX < 0 || dstX >= dstW) continue
              const si = (sy * srcW + sx) * 4
              const sa = srcData[si + 3]! / 255
              if (sa === 0) continue
              const di = (dstY * dstW + dstX) * 4
              const da = dstData[di + 3]! / 255
              const oa = sa + da * (1 - sa)
              if (oa > 0) {
                dstData[di] = (srcData[si]! * sa + dstData[di]! * da * (1 - sa)) / oa
                dstData[di + 1] = (srcData[si + 1]! * sa + dstData[di + 1]! * da * (1 - sa)) / oa
                dstData[di + 2] = (srcData[si + 2]! * sa + dstData[di + 2]! * da * (1 - sa)) / oa
                dstData[di + 3] = Math.round(oa * 255)
              }
            }
          }
        },
        save: () => {},
        restore: () => {},
        fillRect: (x: number, y: number, w: number, h: number) => {
          const rgba = parseFillColor(ctx.fillStyle)
          if (!rgba) return
          const [r, g, b, a] = rgba
          const data = self._imageData.data
          const x0 = Math.max(0, Math.floor(x))
          const y0 = Math.max(0, Math.floor(y))
          const x1 = Math.min(self.width, Math.floor(x + w))
          const y1 = Math.min(self.height, Math.floor(y + h))
          for (let py = y0; py < y1; py++) {
            for (let px = x0; px < x1; px++) {
              const idx = (py * self.width + px) * 4
              data[idx] = r
              data[idx + 1] = g
              data[idx + 2] = b
              data[idx + 3] = a
            }
          }
        },
        clearRect: () => {},
        fillText: () => {},
        strokeText: () => {},
        measureText: () => ({ width: 10 }),
        beginPath: () => {
          pendingArc = null
        },
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {
          if (!pendingArc) return
          const rgba = parseFillColor(ctx.fillStyle)
          if (!rgba) return
          const [r, g, b, a] = rgba
          const { cx, cy, r: radius } = pendingArc
          const data = self._imageData.data
          for (let py = 0; py < self.height; py++) {
            for (let px = 0; px < self.width; px++) {
              const ddx = px + 0.5 - cx
              const ddy = py + 0.5 - cy
              if (ddx * ddx + ddy * ddy <= radius * radius) {
                const idx = (py * self.width + px) * 4
                data[idx] = r
                data[idx + 1] = g
                data[idx + 2] = b
                data[idx + 3] = a
              }
            }
          }
          pendingArc = null
        },
        stroke: () => {},
        clip: () => {},
        arc: (cx: number, cy: number, r: number) => {
          pendingArc = { cx, cy, r }
        },
        arcTo: () => {},
        rect: () => {},
        ellipse: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        transform: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        isPointInPath: () => false,
        createLinearGradient: () => {
          const stops: any[] = []
          return { addColorStop: (_off: number, color: string) => stops.push({ offset: _off, color }), _stops: stops }
        },
        createRadialGradient: () => {
          const stops: any[] = []
          return { addColorStop: (_off: number, color: string) => stops.push({ offset: _off, color }), _stops: stops }
        },
        createPattern: () => ({}),
        filter: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        miterLimit: 10,
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        direction: 'ltr',
        imageSmoothingEnabled: true,
        lineDashOffset: 0,
        canvas: null as any,
      }
      ctx.canvas = self
      this._ctx = ctx
      return ctx
    }
    transferToImageBitmap() {
      return {}
    }
    convertToBlob() {
      return Promise.resolve(new Blob())
    }
  }
}

// ── localStorage polyfill ───────────────────────────────────────
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => _store.get(key) ?? null,
    setItem: (key: string, value: string) => _store.set(key, value),
    removeItem: (key: string) => _store.delete(key),
    clear: () => _store.clear(),
    get length() {
      return _store.size
    },
    key: (i: number) => [..._store.keys()][i] ?? null,
  }
}

// ── document polyfill ───────────────────────────────────────────
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as any).document = {
    documentElement: {
      classList: { toggle: () => {}, add: () => {}, remove: () => {} },
      style: {},
    },
    createElement: () => ({
      getContext: () => null,
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  }
}

// ── window polyfill ─────────────────────────────────────────────
if (typeof globalThis.window === 'undefined') {
  ;(globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    devicePixelRatio: 1,
    __openCanvasContextMenu: undefined,
  }
}

// ── createImageBitmap polyfill ───────────────────────────────────
if (typeof globalThis.createImageBitmap === 'undefined') {
  ;(globalThis as any).createImageBitmap = async () => ({
    width: 100,
    height: 100,
    close: () => {},
  })
}
