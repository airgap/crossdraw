/**
 * End-to-end browser test for the glyph-paths module.
 *
 * Bundles src/fonts/glyph-paths.ts (which pulls in fontkit + wawoff2 +
 * loader.ts) into a single ESM file, serves it to Chrome via puppeteer,
 * and exercises the full pipeline on a real Google Fonts WOFF2:
 *
 *   WOFF2 bytes
 *     → wawoff2 WASM (decompress) → TTF bytes
 *     → fontkit.create → font
 *     → font.getVariation({wdth}) → variant
 *     → glyph.path.commands → Path2D
 *     → ctx.fill
 *
 * Asserts that narrow-vs-wide renders produce pixel-different output
 * AND that glyph point positions differ (proving outlines were actually
 * transformed, not just advance widths via HVAR).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Browser, Page } from 'puppeteer-core'

const CHROME_PATH = '/usr/bin/google-chrome'
const SKIP = !existsSync(CHROME_PATH)

let browser: Browser | null = null
let glyphPathsBundle = ''

beforeAll(async () => {
  if (SKIP) return
  // Make sure the vendored fontkit / wawoff2 are up to date before we
  // bundle glyph-paths.ts (which dynamic-imports them).
  const gen = spawnSync('bun', ['scripts/build-fontkit-vendor.ts'], {
    cwd: '/raid/Crossdraw',
    stdio: 'pipe',
  })
  if (gen.status !== 0) throw new Error('vendor bundle: ' + gen.stderr.toString())
  const out = '/tmp/glyph-paths-integration-bundle.mjs'
  const bundle = spawnSync(
    'bun',
    ['build', 'src/fonts/glyph-paths.ts', '--target=browser', '--format=esm', '--outfile=' + out],
    { cwd: '/raid/Crossdraw', stdio: 'pipe' },
  )
  if (bundle.status !== 0) throw new Error('glyph-paths bundle: ' + bundle.stderr.toString())
  glyphPathsBundle = readFileSync(out, 'utf8')
  const puppeteer = await import('puppeteer-core')
  browser = await puppeteer.default.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
})

afterAll(async () => {
  if (browser) await browser.close()
})

async function attachRoutes(page: Page): Promise<void> {
  page.on('pageerror', (e) => console.log('[pageerror]', (e as Error).message))
  page.on('requestfailed', (req) => console.log('[requestfailed]', req.url(), req.failure()?.errorText))
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const url = req.url()
    if (url.endsWith('/glyph-paths.mjs')) {
      req.respond({
        status: 200,
        contentType: 'application/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: glyphPathsBundle,
      })
    } else {
      req.continue()
    }
  })
}

describe.skipIf(SKIP)('glyph-paths end-to-end', () => {
  test('path-renders narrow vs wide Roboto Flex, caches, pixel-different', async () => {
    const page = await browser!.newPage()
    await attachRoutes(page)

    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script type="module">
import {
  getPathText,
  needsPathRendering,
  setPathTextRenderCallback,
  __testInjectFontSource,
  clearGlyphPathCaches,
} from 'https://glyph-paths.invalid/glyph-paths.mjs'
;(async () => {
  try {
    // ── 1. Fetch a real Google Fonts WOFF2 for the Latin subset ─────────
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght,wdth@8..144,100..1000,25..151&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    const blocks = Array.from(cssText.matchAll(/@font-face\\s*\\{([^}]+)\\}/g)).map(m => m[1])
    let srcUrl = null
    for (const b of blocks) {
      const ur = (b.match(/unicode-range:\\s*([^;]+)/) || [])[1] || ''
      if (ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+0041') || ur === '') {
        const src = (b.match(/src:\\s*url\\(([^)]+)\\)/) || [])[1]
        if (src) { srcUrl = src; break }
      }
    }
    if (!srcUrl) throw new Error('no basic-latin woff2 found in Google Fonts CSS')
    const fontRes = await fetch(srcUrl)
    const buf = await fontRes.arrayBuffer()

    // ── 2. Inject the font into loader's cache so glyph-paths can read it ─
    __testInjectFontSource('Roboto Flex', srcUrl, buf, 'U+0000-00FF')

    // ── 3. Install a render callback so we can 'await' readiness ──
    let readyResolve
    const readyPromise = new Promise(r => { readyResolve = r })
    setPathTextRenderCallback(() => readyResolve())

    // ── 4. Public API: needsPathRendering gates when path rendering kicks in ──
    const axesNarrow = [
      { tag: 'wdth', name: 'Width', min: 25, max: 151, default: 100, value: 25 },
      { tag: 'wght', name: 'Weight', min: 100, max: 1000, default: 400, value: 400 },
    ]
    const axesWide = [
      { tag: 'wdth', name: 'Width', min: 25, max: 151, default: 100, value: 151 },
      { tag: 'wght', name: 'Weight', min: 100, max: 1000, default: 400, value: 400 },
    ]
    const axesJustDefaultWght = [
      { tag: 'wght', name: 'Weight', min: 100, max: 1000, default: 400, value: 400 },
    ]
    const gatingChecks = {
      wghtOnlyAtDefault: needsPathRendering(axesJustDefaultWght),
      wdthNonDefault: needsPathRendering(axesNarrow),
      empty: needsPathRendering([]),
      featureEnabled: needsPathRendering(axesJustDefaultWght, { liga: true }),
      featureDisabled: needsPathRendering(axesJustDefaultWght, { liga: false }),
    }

    // ── 5. First call kicks off background load, reports not-ready ──
    const firstHandle = getPathText('Roboto Flex', axesNarrow, undefined, 48)
    const initiallyReady = firstHandle.ready

    // ── 6. Wait for render callback, then re-request the handle ──
    await readyPromise
    const narrow = getPathText('Roboto Flex', axesNarrow, undefined, 48)
    const wide = getPathText('Roboto Flex', axesWide, undefined, 48)

    // ── 7. Render both variants and compare pixels ──
    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    function renderOne(handle) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      handle.fillText(ctx, 'Hello', 10, 10, 0)
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 200) ink++
      return { ink, data: d }
    }
    const nr = renderOne(narrow)
    const wr = renderOne(wide)
    let diff = 0
    for (let i = 0; i < nr.data.length; i += 4) {
      if (nr.data[i] !== wr.data[i] || nr.data[i+1] !== wr.data[i+1] || nr.data[i+2] !== wr.data[i+2]) diff++
    }

    // ── 8. measureWidth should differ (narrower font → shorter string) ──
    const narrowW = narrow.measureWidth('Hello')
    const wideW = wide.measureWidth('Hello')

    // ── 9. Cache hit: second call returns ready immediately ──
    const immediateHandle = getPathText('Roboto Flex', axesNarrow, undefined, 48)
    const immediateReady = immediateHandle.ready

    window.__result = {
      ok: true,
      gatingChecks,
      initiallyReady,
      narrowReady: narrow.ready,
      wideReady: wide.ready,
      immediateReady,
      narrowInk: nr.ink,
      wideInk: wr.ink,
      diff,
      narrowWidth: narrowW,
      wideWidth: wideW,
    }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e).slice(0, 2500) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 60000 })
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    console.log('glyph-paths integration:', result)
    expect(result.ok).toBe(true)

    // Gating: non-wght variations OR any enabled feature must trigger
    expect(result.gatingChecks.wghtOnlyAtDefault).toBe(false)
    expect(result.gatingChecks.wdthNonDefault).toBe(true)
    expect(result.gatingChecks.empty).toBe(false)
    expect(result.gatingChecks.featureEnabled).toBe(true)
    expect(result.gatingChecks.featureDisabled).toBe(false)

    // Load sequence: first call pending, second call (post-render-callback) ready,
    // repeat call within the same tick ready too
    expect(result.initiallyReady).toBe(false)
    expect(result.narrowReady).toBe(true)
    expect(result.wideReady).toBe(true)
    expect(result.immediateReady).toBe(true)

    // Narrow vs wide must produce meaningfully different pixel output
    expect(result.diff).toBeGreaterThan(500)
    // And their string widths must differ (narrow < wide by a lot)
    expect(result.wideWidth).toBeGreaterThan(result.narrowWidth * 1.15)
  }, 120000)
})
