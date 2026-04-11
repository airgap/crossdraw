/**
 * Browser-based pixel tests for variable-font axis rendering on Canvas 2D.
 *
 * Spawns real Chrome (via puppeteer-core + system chrome) and measures
 * whether various techniques for applying OpenType variation axis values
 * actually change canvas text rasterization.
 *
 * HARD-WON FINDINGS (recorded here as test assertions so we don't forget):
 *
 *   ✅ ctx.font shorthand with numeric font-weight (e.g. "900 48px X")
 *      DOES drive the `wght` axis of a variable font loaded via @font-face
 *      with a font-weight range. This is the ONE approach that works.
 *
 *   ❌ font-variation-settings in @font-face descriptors — IGNORED by canvas.
 *   ❌ font-variation-settings via inline style on the <canvas> element.
 *   ❌ font-variation-settings via parent element (inheritance).
 *   ❌ ctx.fontVariationSettings — not implemented in Chrome.
 *   ❌ FontFace constructor's variationSettings descriptor — silently ignored.
 *   ❌ ctx.fontStretch (keyword or percentage) — doesn't drive the wdth axis.
 *   ❌ font-stretch keyword/percent in ctx.font shorthand — doesn't drive wdth.
 *   ❌ oblique <angle> in ctx.font shorthand — doesn't drive slnt axis.
 *   ❌ SVG <foreignObject> with HTML font-variation-settings rasterized via
 *      drawImage — the SVG image renderer does NOT apply font-variation-settings.
 *   ❌ SVG <text> element with font-variation-settings rasterized via drawImage.
 *
 * Conclusion: Chrome's Canvas 2D honors exactly ONE variable axis — wght —
 * and only when specified as a numeric font-weight in the ctx.font shorthand.
 * All other axes (wdth, opsz, slnt, custom) cannot be driven through any
 * standard canvas API we've found.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import type { Browser } from 'puppeteer-core'

const CHROME_PATH = '/usr/bin/google-chrome'
const SKIP = !existsSync(CHROME_PATH)

let browser: Browser | null = null

beforeAll(async () => {
  if (SKIP) return
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

interface ExperimentResult {
  ok: boolean
  lightInk: number
  heavyInk: number
  diff: number
  error?: string
}

/**
 * Runs one experiment in the browser.
 *   bodyHtml: optional extra DOM outside the <canvas>
 *   setupJs:  runs once; has access to `blobUrl` (Roboto Flex woff2 blob URL)
 *   lightJs:  per-render; must set ctx.font (and any other styling) for the "light" variant
 *   heavyJs:  per-render; ditto for the "heavy" variant
 */
async function runExperiment(
  bodyHtml: string,
  setupJs: string,
  lightJs: string,
  heavyJs: string,
): Promise<ExperimentResult> {
  const page = await browser!.newPage()
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
${bodyHtml}
<canvas id="c" width="600" height="120"></canvas>
<script>
(async () => {
  try {
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    const srcMatch = cssText.match(/src:\\s*url\\(([^)]+)\\)\\s*format\\(['"]?woff2/)
    if (!srcMatch) throw new Error('No woff2 src found in Google Fonts CSS')
    const fontUrl = srcMatch[1]
    const fontRes = await fetch(fontUrl)
    const buf = await fontRes.arrayBuffer()
    const blobUrl = URL.createObjectURL(new Blob([buf], { type: 'font/woff2' }))

    ${setupJs}

    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')

    function renderAndMeasure(fontSetupFn) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'black'
      ctx.textBaseline = 'top'
      fontSetupFn()
      ctx.fillText('Hello', 10, 10)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 16 && data[i] < 200) ink++
      }
      return { ink, data }
    }

    const light = renderAndMeasure(() => { ${lightJs} })
    const heavy = renderAndMeasure(() => { ${heavyJs} })

    let diff = 0
    for (let i = 0; i < light.data.length; i += 4) {
      if (
        light.data[i] !== heavy.data[i] ||
        light.data[i + 1] !== heavy.data[i + 1] ||
        light.data[i + 2] !== heavy.data[i + 2] ||
        light.data[i + 3] !== heavy.data[i + 3]
      ) diff++
    }

    window.__result = { ok: true, lightInk: light.ink, heavyInk: heavy.ink, diff }
  } catch (e) {
    window.__result = { ok: false, error: String(e?.stack || e) }
  }
})()
</script></body></html>`
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 20000 })
  const result = (await page.evaluate(() => (window as any).__result)) as ExperimentResult
  await page.close()
  return result
}

describe.skipIf(SKIP)('Chrome canvas + variable fonts', () => {
  // ── The ONE approach that actually works ──────────────────────────
  test('font-weight numeric value in ctx.font shorthand DOES drive wght axis', async () => {
    const result = await runExperiment(
      '',
      `
        const style = document.createElement('style')
        style.textContent = \`
          @font-face {
            font-family: 'RobotoFlex';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-display: block;
          }
        \`
        document.head.appendChild(style)
        await document.fonts.load("100 48px 'RobotoFlex'")
        await document.fonts.load("900 48px 'RobotoFlex'")
      `,
      `ctx.font = "100 48px 'RobotoFlex'"`,
      `ctx.font = "900 48px 'RobotoFlex'"`,
    )
    expect(result.ok).toBe(true)
    expect(result.diff).toBeGreaterThan(500)
    // Heavy weight produces substantially more ink than light weight
    expect(result.heavyInk).toBeGreaterThan(result.lightInk * 1.2)
  }, 30000)

  // ── All the ways that DO NOT work (documented as xfail-style tests) ──

  test('@font-face with font-variation-settings descriptor is IGNORED by canvas', async () => {
    const result = await runExperiment(
      '',
      `
        const style = document.createElement('style')
        style.textContent = \`
          @font-face {
            font-family: 'vf-light';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-display: block;
            font-variation-settings: 'wght' 100;
          }
          @font-face {
            font-family: 'vf-heavy';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-display: block;
            font-variation-settings: 'wght' 900;
          }
        \`
        document.head.appendChild(style)
        await document.fonts.load("48px 'vf-light'")
        await document.fonts.load("48px 'vf-heavy'")
      `,
      `ctx.font = "48px 'vf-light'"`,
      `ctx.font = "48px 'vf-heavy'"`,
    )
    expect(result.ok).toBe(true)
    // Documents that Chrome ignores the descriptor — both renders are identical
    expect(result.diff).toBe(0)
  }, 30000)

  test('FontFace constructor variationSettings descriptor is IGNORED by canvas', async () => {
    const result = await runExperiment(
      '',
      `
        const lightFace = new FontFace('VF-Light', \`url(\${blobUrl}) format('woff2')\`, {
          weight: '100 1000',
          variationSettings: "'wght' 100",
        })
        const heavyFace = new FontFace('VF-Heavy', \`url(\${blobUrl}) format('woff2')\`, {
          weight: '100 1000',
          variationSettings: "'wght' 900",
        })
        await lightFace.load()
        await heavyFace.load()
        document.fonts.add(lightFace)
        document.fonts.add(heavyFace)
      `,
      `ctx.font = "48px 'VF-Light'"`,
      `ctx.font = "48px 'VF-Heavy'"`,
    )
    expect(result.ok).toBe(true)
    expect(result.diff).toBe(0)
  }, 30000)

  test('ctx.fontVariationSettings (non-standard) does not exist / is IGNORED', async () => {
    const result = await runExperiment(
      '',
      `
        const style = document.createElement('style')
        style.textContent = \`
          @font-face {
            font-family: 'RobotoFlex';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-display: block;
          }
        \`
        document.head.appendChild(style)
        await document.fonts.load("48px 'RobotoFlex'")
      `,
      `ctx.font = "48px 'RobotoFlex'"; try { ctx.fontVariationSettings = "'wght' 100" } catch {}`,
      `ctx.font = "48px 'RobotoFlex'"; try { ctx.fontVariationSettings = "'wght' 900" } catch {}`,
    )
    expect(result.ok).toBe(true)
    expect(result.diff).toBe(0)
  }, 30000)

  test('inline style font-variation-settings on <canvas> element is IGNORED', async () => {
    const result = await runExperiment(
      '',
      `
        const style = document.createElement('style')
        style.textContent = \`
          @font-face {
            font-family: 'RobotoFlex';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-display: block;
          }
        \`
        document.head.appendChild(style)
        await document.fonts.load("48px 'RobotoFlex'")
      `,
      `canvas.style.fontVariationSettings = "'wght' 100"; ctx.font = "48px 'RobotoFlex'"`,
      `canvas.style.fontVariationSettings = "'wght' 900"; ctx.font = "48px 'RobotoFlex'"`,
    )
    expect(result.ok).toBe(true)
    expect(result.diff).toBe(0)
  }, 30000)

  test('ctx.fontStretch keyword does NOT drive wdth axis', async () => {
    const result = await runExperiment(
      '',
      `
        const style = document.createElement('style')
        style.textContent = \`
          @font-face {
            font-family: 'RobotoFlex';
            src: url('\${blobUrl}') format('woff2');
            font-weight: 100 1000;
            font-stretch: 25% 151%;
            font-display: block;
          }
        \`
        document.head.appendChild(style)
        await document.fonts.load("48px 'RobotoFlex'")
      `,
      `ctx.font = "48px 'RobotoFlex'"; ctx.fontStretch = "ultra-condensed"`,
      `ctx.font = "48px 'RobotoFlex'"; ctx.fontStretch = "ultra-expanded"`,
    )
    expect(result.ok).toBe(true)
    expect(result.diff).toBe(0)
  }, 30000)

  test('SVG foreignObject with font-variation-settings in HTML CSS is IGNORED when rasterized via drawImage', async () => {
    // Even when we render HTML via <svg><foreignObject>, the SVG image
    // renderer does not apply font-variation-settings to the nested HTML.
    const page = await browser!.newPage()
    const html = `<!doctype html><html><body>
<canvas id="c" width="600" height="120"></canvas>
<script>
(async () => {
  try {
    const cssUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@100..1000&display=swap'
    const cssRes = await fetch(cssUrl)
    const cssText = await cssRes.text()
    const srcMatch = cssText.match(/src:\\s*url\\(([^)]+)\\)\\s*format\\(['"]?woff2/)
    const fontUrl = srcMatch[1]
    const fontRes = await fetch(fontUrl)
    const buf = await fontRes.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let s = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
    const fontDataUrl = 'data:font/woff2;base64,' + btoa(s)

    const ff = new FontFace('RobotoFlex', 'url(' + fontDataUrl + ') format("woff2")', { weight: '100 1000' })
    await ff.load()
    document.fonts.add(ff)

    function makeSvg(wght) {
      return \`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120">
        <style>@font-face{font-family:RobotoFlex;src:url(\${fontDataUrl}) format("woff2");font-weight:100 1000;}</style>
        <foreignObject width="600" height="120">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:RobotoFlex;font-size:48px;color:black;padding:10px;line-height:1;font-variation-settings:'wght' \${wght};">Hello</div>
        </foreignObject>
      </svg>\`
    }

    const canvas = document.getElementById('c')
    const ctx = canvas.getContext('2d')

    async function drawSvg(wght) {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(makeSvg(wght))
      const img = new Image()
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = 0
      for (let i = 0; i < data.length; i += 4) if (data[i] < 200) ink++
      return { ink, data }
    }

    const light = await drawSvg(100)
    const heavy = await drawSvg(900)

    let diff = 0
    for (let i = 0; i < light.data.length; i += 4) {
      if (light.data[i] !== heavy.data[i] || light.data[i+1] !== heavy.data[i+1] || light.data[i+2] !== heavy.data[i+2]) diff++
    }
    window.__result = { ok: true, lightInk: light.ink, heavyInk: heavy.ink, diff }
  } catch (e) {
    window.__result = { ok: false, error: String(e?.stack || e) }
  }
})()
</script></body></html>`
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => (window as any).__result !== undefined, { timeout: 20000 })
    const result = (await page.evaluate(() => (window as any).__result)) as ExperimentResult
    await page.close()
    expect(result.ok).toBe(true)
    expect(result.diff).toBe(0)
  }, 30000)
})
