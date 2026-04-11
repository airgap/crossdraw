/**
 * Browser test: wawoff2 decompresses Google Fonts WOFF2 to TTF, and the
 * resulting buffer feeds fontkit's TTF path which DOES apply variations
 * to glyph outlines.
 *
 * This is the integration that enables every non-wght variable axis
 * in Canvas 2D rendering (by bypassing the browser text stack entirely).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Browser, Page } from 'puppeteer-core'

const CHROME_PATH = '/usr/bin/google-chrome'
const SKIP = !existsSync(CHROME_PATH)

let browser: Browser | null = null
let fontkitBundle = ''
let wawoff2Bundle = ''

beforeAll(async () => {
  if (SKIP) return
  const fkPath = '/tmp/fontkit-bundle.mjs'
  const wwPath = '/tmp/wawoff2-bundle.mjs'
  const fk = spawnSync(
    'bun',
    [
      'build',
      './node_modules/fontkit/dist/browser-module.mjs',
      '--target=browser',
      '--format=esm',
      '--outfile=' + fkPath,
    ],
    { cwd: '/raid/Crossdraw', stdio: 'pipe' },
  )
  if (fk.status !== 0) throw new Error('fontkit bundle: ' + fk.stderr.toString())
  const ww = spawnSync(
    'bun',
    ['build', './node_modules/wawoff2/decompress.js', '--target=browser', '--format=esm', '--outfile=' + wwPath],
    { cwd: '/raid/Crossdraw', stdio: 'pipe' },
  )
  if (ww.status !== 0) throw new Error('wawoff2 bundle: ' + ww.stderr.toString())
  fontkitBundle = readFileSync(fkPath, 'utf8')
  // Patch the wawoff2 bundle: the Emscripten binding only exports Module
  // inside its ENVIRONMENT_IS_NODE branch, leaving the browser with a
  // stale `{}`. Inject a module.exports assignment before the final run()
  // call of the binding closure so the decompress wrapper sees the real
  // Module object. (Without this patch the wrapper hangs forever.)
  wawoff2Bundle = readFileSync(wwPath, 'utf8').replace(
    'Module["run"] = run;',
    'Module["run"] = run; module.exports = Module;',
  )
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
    if (url.endsWith('/fontkit.mjs')) {
      req.respond({
        status: 200,
        contentType: 'application/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: fontkitBundle,
      })
    } else if (url.endsWith('/wawoff2.mjs')) {
      req.respond({
        status: 200,
        contentType: 'application/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: wawoff2Bundle,
      })
    } else {
      req.continue()
    }
  })
}

describe.skipIf(SKIP)('wawoff2 + fontkit pipeline', () => {
  test('decompresses Google Fonts WOFF2 to TTF and drives wdth axis', async () => {
    const page = await browser!.newPage()
    await attachRoutes(page)
    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script type="module">
window.__progress = 'script-top'
import * as fontkit from 'https://fontkit.invalid/fontkit.mjs'
window.__progress = 'fontkit-imported'
import wawoff2Default from 'https://wawoff2.invalid/wawoff2.mjs'
window.__progress = 'wawoff2-imported'
;(async () => {
  try {
    window.__progress = 'async-start'
    // Fetch Google Fonts CSS2 and pick a Latin-range WOFF2
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght,wdth@8..144,100..1000,25..151&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    // Match all @font-face blocks and pick one with basic Latin unicode-range
    const blocks = Array.from(cssText.matchAll(/@font-face\\s*\\{([^}]+)\\}/g)).map(m => m[1])
    let pickedUrl = null
    for (const b of blocks) {
      const ur = (b.match(/unicode-range:\\s*([^;]+)/) || [])[1] || ''
      if (ur.includes('U+0000') || ur.includes('U+0020') || ur.includes('U+00') || ur === '') {
        const src = (b.match(/src:\\s*url\\(([^)]+)\\)/) || [])[1]
        if (src) { pickedUrl = src; break }
      }
    }
    if (!pickedUrl) throw new Error('No basic-latin woff2 found in Google Fonts CSS')

    window.__progress = 'css-parsed: ' + pickedUrl
    const fontRes = await fetch(pickedUrl)
    const woff2Buf = await fontRes.arrayBuffer()
    const woff2Bytes = new Uint8Array(woff2Buf)
    window.__progress = 'woff2-fetched: ' + woff2Bytes.length
    const isWoff2 = woff2Bytes[0] === 0x77 && woff2Bytes[1] === 0x4F && woff2Bytes[2] === 0x46 && woff2Bytes[3] === 0x32

    // Decompress WOFF2 → TTF via wawoff2 WASM
    window.__progress = 'decompress-call: ' + typeof wawoff2Default
    const decompress = wawoff2Default
    // Give WASM a moment to init; also race with a 20s internal timeout
    // so we can surface hangs as a readable error rather than bland test timeout
    const ttfBytes = await Promise.race([
      decompress(woff2Bytes),
      new Promise((_, rej) => setTimeout(() => rej(new Error('decompress internal timeout (20s)')), 20000)),
    ])
    window.__progress = 'decompressed: ' + (ttfBytes && ttfBytes.length)
    // Verify TTF magic (0x00010000 or 'OTTO')
    const magic = (ttfBytes[0] << 24) | (ttfBytes[1] << 16) | (ttfBytes[2] << 8) | ttfBytes[3]
    const isTtf = magic === 0x00010000 || magic === 0x4F54544F

    // Create fontkit Font from the TTF buffer
    const font = fontkit.create(ttfBytes instanceof Uint8Array ? ttfBytes : new Uint8Array(ttfBytes))
    const axes = Object.keys(font.variationAxes || {})

    // Drive wdth axis
    const narrow = font.getVariation({ wdth: 25, wght: 400 })
    const wide = font.getVariation({ wdth: 151, wght: 400 })
    const nH = narrow.glyphForCodePoint('H'.charCodeAt(0))
    const wH = wide.glyphForCodePoint('H'.charCodeAt(0))
    const nCmds = nH.path.commands
    const wCmds = wH.path.commands
    let pathDiff = 0
    for (let i = 0; i < Math.min(nCmds.length, wCmds.length); i++) {
      const a = nCmds[i].args, b = wCmds[i].args
      for (let j = 0; j < (a?.length || 0); j++) {
        if (Math.abs(a[j] - b[j]) > 0.5) pathDiff++
      }
    }

    // Render both widths
    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    function render(variant) {
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      const scale = 48 / font.unitsPerEm
      ctx.save(); ctx.translate(10, 10 + 48); ctx.scale(scale, -scale)
      let x = 0
      for (const ch of 'Hello') {
        const g = variant.glyphForCodePoint(ch.codePointAt(0))
        ctx.save(); ctx.translate(x, 0)
        ctx.beginPath()
        for (const cmd of g.path.commands) {
          const a = cmd.args
          switch (cmd.command) {
            case 'moveTo': ctx.moveTo(a[0], a[1]); break
            case 'lineTo': ctx.lineTo(a[0], a[1]); break
            case 'quadraticCurveTo': ctx.quadraticCurveTo(a[0], a[1], a[2], a[3]); break
            case 'bezierCurveTo': ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); break
            case 'closePath': ctx.closePath(); break
          }
        }
        ctx.fill(); ctx.restore()
        x += g.advanceWidth
      }
      ctx.restore()
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = 0
      for (let i = 0; i < d.length; i += 4) if (d[i] < 200) ink++
      return { ink, data: d }
    }
    const n = render(narrow)
    const w = render(wide)
    let diff = 0
    for (let i = 0; i < n.data.length; i += 4) {
      if (n.data[i] !== w.data[i] || n.data[i+1] !== w.data[i+1] || n.data[i+2] !== w.data[i+2]) diff++
    }

    window.__result = {
      ok: true,
      isWoff2,
      isTtf,
      magic: magic.toString(16),
      woff2Size: woff2Bytes.length,
      ttfSize: ttfBytes.length,
      axes,
      pathDiff,
      diff,
      narrowInk: n.ink,
      wideInk: w.ink,
    }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e).slice(0, 2000) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    try {
      await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 60000 })
    } catch (e) {
      const progress = await page.evaluate(() => (window as any).__progress)
      console.log('[timeout] last progress:', progress)
      throw e
    }
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    console.log('wawoff2 + fontkit pipeline:', result)
    expect(result.ok).toBe(true)
    expect(result.isWoff2).toBe(true)
    expect(result.isTtf).toBe(true)
    expect(result.axes).toContain('wdth')
    expect(result.pathDiff).toBeGreaterThan(0)
    expect(result.diff).toBeGreaterThan(500)
  }, 90000)
})
