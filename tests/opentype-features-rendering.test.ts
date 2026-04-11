/**
 * Browser-based pixel tests for OpenType feature rendering on Canvas 2D.
 *
 * Spawns real Chrome (via puppeteer-core + system chrome) and exercises
 * two facts:
 *
 *   1. Chrome's Canvas 2D text pipeline DOES honour `font-feature-settings`
 *      — but only when it's baked into a CSS `@font-face` rule (or set via
 *      the FontFace constructor's `featureSettings` descriptor) and the
 *      feature actually exists in the font binary. When Google Fonts'
 *      axis-subset response strips a feature out of the WOFF2 — which it
 *      does for most features on most fonts — there's nothing to apply and
 *      the canvas renders identical pixels with or without the descriptor.
 *      That's why the old `getStyledFontFamily` path looked like it
 *      silently failed: it was probing features that didn't survive the
 *      subset.
 *
 *   2. Crossdraw instead routes every feature through fontkit's `layout()`
 *      engine in src/fonts/glyph-paths.ts. This runs GSUB on the already
 *      fetched (and WOFF2-decompressed) font bytes, so we don't depend on
 *      Chrome's behaviour *or* on which features survived subsetting on
 *      the browser's @font-face pipeline. It also unifies features with
 *      variable-axis rendering (which Chrome can't do at all), so the
 *      two orthogonal concerns live in one code path.
 *
 *      A silent regression here means OpenType toggles in the UI become
 *      dead controls — these tests guard against that.
 *
 * ### Why Playfair Display + lnum
 *
 * Google Fonts' axis-subset response strips most OT features from the
 * WOFF2 binary (Source Serif 4, for example, loses `onum`, `smcp`,
 * `tnum`, and friends — only `liga`/`rvrn`/`kern`/`mark`/`mkmk` survive).
 * Playfair Display is one of the few fonts whose subset keeps a GSUB
 * feature that produces visually distinct output:
 *   - Its default figures are old-style (descend below the baseline).
 *   - The `lnum` feature substitutes to lining figures (align to cap
 *     height) — a meaningful glyph-path change that any pixel diff
 *     reliably picks up.
 * If a future font subset ever drops `lnum` from Playfair Display, pick
 * another font + feature pair — the point is to exercise the fontkit
 * layout path end-to-end, not Playfair specifically.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from 'puppeteer-core'

const CHROME_PATH = '/usr/bin/google-chrome'
const SKIP = !existsSync(CHROME_PATH)

let browser: Browser | null = null
let glyphPathsBundle = ''

beforeAll(async () => {
  if (SKIP) return
  // Per-run tempdir so concurrent users on a shared dev/CI host don't
  // collide on a single /tmp/<name>.mjs that the first writer owns.
  const tmpDir = mkdtempSync(join(tmpdir(), 'cd-opentype-'))
  // Make sure the vendored fontkit / wawoff2 are up to date before we
  // bundle glyph-paths.ts (which dynamic-imports them). Inherit cwd so
  // the script writes vendor output into whatever workspace we're running
  // from (jenkins workspace on CI, dev checkout locally).
  const gen = spawnSync('bun', ['scripts/build-fontkit-vendor.ts'], {
    stdio: 'pipe',
  })
  if (gen.status !== 0) throw new Error('vendor bundle: ' + gen.stderr.toString())
  const out = join(tmpDir, 'opentype-features-bundle.mjs')
  const bundle = spawnSync(
    'bun',
    ['build', 'src/fonts/glyph-paths.ts', '--target=browser', '--format=esm', '--outfile=' + out],
    { stdio: 'pipe' },
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

async function attachBundleRoute(page: Page): Promise<void> {
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

describe.skipIf(SKIP)('Chrome canvas + OpenType features', () => {
  // ── Native paths that DO work (when the feature exists in the font) ──

  test('@font-face font-feature-settings descriptor DOES apply, if the feature survives subsetting', async () => {
    const page = await browser!.newPage()
    const html = `<!doctype html><html><body>
<canvas id="c" width="400" height="100"></canvas>
<script>
(async () => {
  try {
    // Source Serif 4 has onum (oldstyle figures) as a GSUB substitution.
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    // Pick the basic-latin block so our "01234" sample maps to real glyphs.
    const blocks = Array.from(cssText.matchAll(/@font-face\\s*\\{([^}]+)\\}/g)).map(m => m[1])
    let srcUrl = null
    for (const b of blocks) {
      const ur = (b.match(/unicode-range:\\s*([^;]+)/) || [])[1] || ''
      if (ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+0041')) {
        const src = (b.match(/src:\\s*url\\(([^)]+)\\)/) || [])[1]
        if (src) { srcUrl = src; break }
      }
    }
    const fontRes = await fetch(srcUrl)
    const buf = await fontRes.arrayBuffer()
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'font/woff2' }))

    const style = document.createElement('style')
    style.textContent = \`
      @font-face {
        font-family: 'PD-plain';
        src: url('\${blobUrl}') format('woff2');
        font-weight: 400 900;
        font-display: block;
      }
      @font-face {
        font-family: 'PD-lnum';
        src: url('\${blobUrl}') format('woff2');
        font-weight: 400 900;
        font-display: block;
        font-feature-settings: "lnum" 1;
      }
    \`
    document.head.appendChild(style)
    await document.fonts.load("48px 'PD-plain'")
    await document.fonts.load("48px 'PD-lnum'")

    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'top'
    function render(family) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      ctx.font = "48px '" + family + "'"
      ctx.fillText('01234', 10, 10)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const plain = render('PD-plain')
    const lnum = render('PD-lnum')
    let diff = 0
    for (let i = 0; i < plain.length; i += 4) {
      if (plain[i] !== lnum[i] || plain[i+1] !== lnum[i+1] || plain[i+2] !== lnum[i+2]) diff++
    }
    window.__result = { ok: true, diff }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 30000 })
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    expect(result.ok).toBe(true)
    // Chrome applies lnum when it's present in the WOFF2 GSUB table.
    // (Source Serif 4's subset doesn't ship onum, which is why an
    // earlier attempt at this test mistakenly concluded the descriptor
    // was ignored — the feature simply wasn't in the font.)
    expect(result.diff).toBeGreaterThan(200)
  }, 60000)

  test('FontFace constructor featureSettings descriptor DOES apply, if the feature survives subsetting', async () => {
    const page = await browser!.newPage()
    const html = `<!doctype html><html><body>
<canvas id="c" width="400" height="100"></canvas>
<script>
(async () => {
  try {
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    const blocks = Array.from(cssText.matchAll(/@font-face\\s*\\{([^}]+)\\}/g)).map(m => m[1])
    let srcUrl = null
    for (const b of blocks) {
      const ur = (b.match(/unicode-range:\\s*([^;]+)/) || [])[1] || ''
      if (ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+0041')) {
        const src = (b.match(/src:\\s*url\\(([^)]+)\\)/) || [])[1]
        if (src) { srcUrl = src; break }
      }
    }
    const fontRes = await fetch(srcUrl)
    const buf = await fontRes.arrayBuffer()
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'font/woff2' }))

    const plainFace = new FontFace('PDPlain', 'url(' + blobUrl + ') format("woff2")', {
      weight: '400 900',
      featureSettings: '"lnum" 0',
    })
    const lnumFace = new FontFace('PDLnum', 'url(' + blobUrl + ') format("woff2")', {
      weight: '400 900',
      featureSettings: '"lnum" 1',
    })
    await plainFace.load()
    await lnumFace.load()
    document.fonts.add(plainFace)
    document.fonts.add(lnumFace)

    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    ctx.textBaseline = 'top'
    function render(family) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      ctx.font = "48px '" + family + "'"
      ctx.fillText('01234', 10, 10)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const plain = render('PDPlain')
    const lnum = render('PDLnum')
    let diff = 0
    for (let i = 0; i < plain.length; i += 4) {
      if (plain[i] !== lnum[i] || plain[i+1] !== lnum[i+1] || plain[i+2] !== lnum[i+2]) diff++
    }
    window.__result = { ok: true, diff }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 30000 })
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    expect(result.ok).toBe(true)
    expect(result.diff).toBeGreaterThan(200)
  }, 60000)

  // ── The approach Crossdraw uses: the glyph-paths fontkit pipeline ──
  // Works uniformly for any feature present in the font binary, and is
  // the same pipeline that handles variable axes. We prefer it over the
  // native descriptor path so features and axes share one code path.

  test('glyph-paths renderer applies lnum feature via fontkit.layout', async () => {
    const page = await browser!.newPage()
    await attachBundleRoute(page)

    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script type="module">
import {
  getPathText,
  needsPathRendering,
  setPathTextRenderCallback,
  __testInjectFontSource,
} from 'https://gp.invalid/glyph-paths.mjs'
;(async () => {
  try {
    // ── 1. Fetch the basic-latin subset of Playfair Display ──
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    const blocks = Array.from(cssText.matchAll(/@font-face\\s*\\{([^}]+)\\}/g)).map(m => m[1])
    let srcUrl = null
    for (const b of blocks) {
      const ur = (b.match(/unicode-range:\\s*([^;]+)/) || [])[1] || ''
      if (ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+0041')) {
        const src = (b.match(/src:\\s*url\\(([^)]+)\\)/) || [])[1]
        if (src) { srcUrl = src; break }
      }
    }
    if (!srcUrl) throw new Error('no basic-latin source')
    const fontRes = await fetch(srcUrl)
    const buf = await fontRes.arrayBuffer()

    // ── 2. Inject into loader's cache so glyph-paths can read it ──
    __testInjectFontSource('Playfair Display', srcUrl, buf, 'U+0000-00FF')

    // ── 3. Wait for render callback so async decode finishes ──
    let readyResolve
    const readyPromise = new Promise(r => { readyResolve = r })
    setPathTextRenderCallback(() => readyResolve())

    // ── 4. Gating: any enabled feature should force path rendering ──
    const gating = {
      onNoFeatures: needsPathRendering(undefined, undefined),
      onEmptyObject: needsPathRendering(undefined, {}),
      onDisabled: needsPathRendering(undefined, { lnum: false }),
      onEnabled: needsPathRendering(undefined, { lnum: true }),
    }

    // ── 5. First call kicks off the load ──
    getPathText('Playfair Display', undefined, { lnum: true }, 48)
    await readyPromise

    // ── 6. Render "01234" with and without lnum ──
    const plainHandle = getPathText('Playfair Display', undefined, undefined, 48)
    const lnumHandle = getPathText('Playfair Display', undefined, { lnum: true }, 48)

    if (!plainHandle.ready || !lnumHandle.ready) {
      throw new Error('handles not ready after readyPromise')
    }

    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    function renderOne(handle) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      handle.fillText(ctx, '01234', 10, 10, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const plain = renderOne(plainHandle)
    const lnum = renderOne(lnumHandle)
    let diff = 0
    for (let i = 0; i < plain.length; i += 4) {
      if (plain[i] !== lnum[i] || plain[i+1] !== lnum[i+1] || plain[i+2] !== lnum[i+2]) diff++
    }

    window.__result = {
      ok: true,
      gating,
      diff,
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
    console.log('opentype features rendering:', result)
    expect(result.ok).toBe(true)

    // Gating: only enabled features should trigger
    expect(result.gating.onNoFeatures).toBe(false)
    expect(result.gating.onEmptyObject).toBe(false)
    expect(result.gating.onDisabled).toBe(false)
    expect(result.gating.onEnabled).toBe(true)

    // Oldstyle figures vs lining figures must produce pixel-different output
    expect(result.diff).toBeGreaterThan(200)
  }, 120000)
})
