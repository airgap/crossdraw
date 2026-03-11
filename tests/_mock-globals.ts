/**
 * Shared mock factories for global browser APIs used across test files.
 * Import the factory functions you need — do NOT set globals at module level here.
 */

/** Full OffscreenCanvas mock whose getContext('2d') returns a comprehensive stub. */
export function createOffscreenCanvasMock() {
  return class MockOffscreenCanvas {
    width: number
    height: number
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
    }
    getContext(_type?: string) {
      return {
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
          colorSpace: 'srgb',
        }),
        putImageData: () => {},
        fillRect: () => {},
        clearRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        bezierCurveTo: () => {},
        quadraticCurveTo: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        save: () => {},
        restore: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        scale: () => {},
        translate: () => {},
        rotate: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        }),
        measureText: () => ({ width: 50 }),
        fillText: () => {},
        setLineDash: () => {},
        getLineDash: () => [],
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        canvas: {
          width: 100,
          height: 100,
          toDataURL: () => 'data:image/png;base64,',
          toBlob: (cb: any) => cb(new Blob()),
        },
      }
    }
    convertToBlob(opts?: { type?: string; quality?: number }) {
      return Promise.resolve(new Blob(['mock-image'], { type: opts?.type ?? 'image/png' }))
    }
  }
}
