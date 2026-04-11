/**
 * Browser pixel test for fontkit-based variable font rendering.
 *
 * Since Chrome Canvas 2D can't drive non-wght variable axes via any
 * API (see variable-font-rendering.test.ts), the only path forward is
 * to extract variation-applied glyph outlines ourselves and draw them
 * directly with ctx.fill().
 *
 * KEY FINDING (hard-won): fontkit's WOFF2 path is fundamentally broken
 * for variable font glyph outlining. WOFF2Font._transformGlyfTable
 * pre-decodes all glyphs WITHOUT applying variations, and WOFF2Glyph
 * just returns cached data. Variations only affect advance widths
 * (via HVAR on the fly), not glyph shapes.
 *
 * Workaround: load the raw TTF file directly. TTFFont._decode reads
 * from the glyf table on demand and applies variations via
 * _variationProcessor.transformPoints. This path DOES produce
 * variation-applied outlines.
 *
 * This test fetches Roboto Flex's raw TTF from GitHub, drives both
 * wdth and wght axes, and verifies pixel-different output — meaning
 * we can bypass the browser text stack entirely for any variable axis.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import type { Browser, Page } from 'puppeteer-core'

const CHROME_PATH = '/usr/bin/google-chrome'
const SKIP = !existsSync(CHROME_PATH)

const TTF_URL =
  'https://raw.githubusercontent.com/googlefonts/roboto-flex/main/fonts/RobotoFlex%5BGRAD%2CXOPQ%2CXTRA%2CYOPQ%2CYTAS%2CYTDE%2CYTFI%2CYTLC%2CYTUC%2Copsz%2Cslnt%2Cwdth%2Cwght%5D.ttf'

let browser: Browser | null = null
let fontkitBundle = ''

beforeAll(async () => {
  if (SKIP) return
  // fontkit's shipped browser-module.mjs has unresolved bare-specifier
  // imports (restructure, @swc/helpers, ...). Bundle it into a single
  // self-contained ESM file so the page can import it directly.
  const bundlePath = '/tmp/fontkit-bundle.mjs'
  const res = spawnSync(
    'bun',
    [
      'build',
      './node_modules/fontkit/dist/browser-module.mjs',
      '--target=browser',
      '--format=esm',
      '--outfile=' + bundlePath,
    ],
    { cwd: '/raid/Crossdraw', stdio: 'pipe' },
  )
  if (res.status !== 0) {
    throw new Error('Failed to bundle fontkit: ' + res.stderr.toString())
  }
  fontkitBundle = readFileSync(bundlePath, 'utf8')
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

/** Wire a page so fontkit.mjs is served locally from a stable URL. */
async function attachFontkitRoute(page: Page): Promise<void> {
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
    } else {
      req.continue()
    }
  })
}

/** The shared in-page JS prelude: fontkit import, font fetch, drawing helper. */
const PAGE_HELPERS = `
async function loadFont(fontkit, ttfUrl) {
  const res = await fetch(ttfUrl)
  if (!res.ok) throw new Error('ttf fetch failed: ' + res.status)
  const buf = await res.arrayBuffer()
  // Raw TTF → fontkit's TTFFont path (which DOES apply variations to outlines)
  return fontkit.create(new Uint8Array(buf))
}

function drawGlyphs(ctx, font, glyphs, fontSize) {
  const scale = fontSize / font.unitsPerEm
  ctx.save()
  ctx.translate(10, 10 + fontSize)
  ctx.scale(scale, -scale)
  let x = 0
  for (const glyph of glyphs) {
    ctx.save()
    ctx.translate(x, 0)
    const commands = glyph.path.commands
    ctx.beginPath()
    for (const cmd of commands) {
      switch (cmd.command) {
        case 'moveTo': ctx.moveTo(cmd.args[0], cmd.args[1]); break
        case 'lineTo': ctx.lineTo(cmd.args[0], cmd.args[1]); break
        case 'quadraticCurveTo': ctx.quadraticCurveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3]); break
        case 'bezierCurveTo': ctx.bezierCurveTo(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], cmd.args[4], cmd.args[5]); break
        case 'closePath': ctx.closePath(); break
      }
    }
    ctx.fill()
    ctx.restore()
    x += glyph.advanceWidth
  }
  ctx.restore()
}

function glyphsFor(font, text) {
  const out = []
  for (const ch of text) out.push(font.glyphForCodePoint(ch.codePointAt(0)))
  return out
}

function render(ctx, canvas, font, glyphs) {
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'black'
  drawGlyphs(ctx, font, glyphs, 48)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  let ink = 0
  for (let i = 0; i < data.length; i += 4) if (data[i] < 200) ink++
  return { ink, data }
}

function pixelDiff(a, b) {
  let diff = 0
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i+1] !== b[i+1] || a[i+2] !== b[i+2]) diff++
  }
  return diff
}
`

describe.skipIf(SKIP)('fontkit variable path rendering', () => {
  test('getVariation drives wght axis (non-wght axis for native canvas)', async () => {
    const page = await browser!.newPage()
    await attachFontkitRoute(page)

    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script type="module">
import * as fontkit from 'https://fontkit.invalid/fontkit.mjs'
;(async () => {
  try {
    ${PAGE_HELPERS}
    const font = await loadFont(fontkit, '${TTF_URL}')
    const axisInfo = Object.keys(font.variationAxes).join(',')
    const fontType = font.type
    const lightFont = font.getVariation({ wght: 100 })
    const heavyFont = font.getVariation({ wght: 900 })
    const lightGlyphs = glyphsFor(lightFont, 'Hello')
    const heavyGlyphs = glyphsFor(heavyFont, 'Hello')
    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    const light = render(ctx, canvas, lightFont, lightGlyphs)
    const heavy = render(ctx, canvas, heavyFont, heavyGlyphs)
    const diff = pixelDiff(light.data, heavy.data)
    window.__result = {
      ok: true,
      fontType,
      axisInfo,
      lightInk: light.ink,
      heavyInk: heavy.ink,
      diff,
      lightFirstCmdCount: lightGlyphs[0].path.commands.length,
      heavyFirstCmdCount: heavyGlyphs[0].path.commands.length,
    }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e).slice(0, 1500) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 60000 })
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    console.log('fontkit wght path rendering:', result)
    expect(result.ok).toBe(true)
    // Heavy weight must have meaningfully more ink than light weight
    expect(result.heavyInk).toBeGreaterThan(result.lightInk * 1.2)
    expect(result.diff).toBeGreaterThan(500)
  }, 90000)

  test('getVariation drives wdth axis (non-wght axis canvas cannot drive)', async () => {
    const page = await browser!.newPage()
    await attachFontkitRoute(page)

    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script type="module">
import * as fontkit from 'https://fontkit.invalid/fontkit.mjs'
;(async () => {
  try {
    ${PAGE_HELPERS}
    const font = await loadFont(fontkit, '${TTF_URL}')
    const narrowFont = font.getVariation({ wdth: 25, wght: 400 })
    const wideFont = font.getVariation({ wdth: 151, wght: 400 })
    const narrowGlyphs = glyphsFor(narrowFont, 'Hello')
    const wideGlyphs = glyphsFor(wideFont, 'Hello')
    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')
    const narrow = render(ctx, canvas, narrowFont, narrowGlyphs)
    const wide = render(ctx, canvas, wideFont, wideGlyphs)
    const diff = pixelDiff(narrow.data, wide.data)
    // Compare 'H' glyph point positions to prove shapes actually differ
    const nCmds = narrowGlyphs[0].path.commands
    const wCmds = wideGlyphs[0].path.commands
    let pathDiff = 0
    for (let i = 0; i < Math.min(nCmds.length, wCmds.length); i++) {
      const a = nCmds[i].args, b = wCmds[i].args
      if (!a || !b) continue
      for (let j = 0; j < a.length; j++) if (Math.abs(a[j] - b[j]) > 0.5) pathDiff++
    }
    window.__result = {
      ok: true,
      narrowInk: narrow.ink,
      wideInk: wide.ink,
      diff,
      pathDiff,
      nCmdCount: nCmds.length,
      wCmdCount: wCmds.length,
      narrowAdvances: narrowGlyphs.map(g => g.advanceWidth),
      wideAdvances: wideGlyphs.map(g => g.advanceWidth),
    }
  } catch (e) {
    window.__result = { ok: false, error: String(e && e.stack || e).slice(0, 1500) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 60000 })
    const result: any = await page.evaluate(() => (window as any).__result)
    await page.close()
    console.log('fontkit wdth path rendering:', result)
    expect(result.ok).toBe(true)
    // Widened glyphs should span more pixels
    expect(result.diff).toBeGreaterThan(500)
    // And the underlying glyph outline point positions must actually differ
    expect(result.pathDiff).toBeGreaterThan(0)
  }, 90000)
})
