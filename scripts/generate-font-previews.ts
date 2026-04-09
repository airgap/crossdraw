#!/usr/bin/env bun
/**
 * Pre-renders each Google Font family name as SVG path data using opentype.js.
 *
 * Output: src/fonts/previews.json
 *   { "0": { "d": "M0 10L...", "vx": 0, "vy": 4, "vw": 80, "vh": 14 }, ... }
 *
 * At runtime the font picker renders <svg><path d="..." /></svg> instead of
 * loading the actual font, so the list stays fast with 1,929 entries.
 *
 * Run: bun scripts/generate-font-previews.ts
 */

import opentype from 'opentype.js'
import { FONT_CATALOG } from '../src/fonts/catalog'

const FONT_SIZE = 14
const MAX_PATH_LENGTH = 8000 // Skip overly complex glyphs (ornate display fonts)

// Old User-Agent so Google Fonts returns TTF (opentype.js doesn't support WOFF2)
const USER_AGENT = 'Mozilla/4.0'

interface Preview {
  d: string // SVG path data
  vx: number // viewBox minX
  vy: number // viewBox minY
  vw: number // viewBox width
  vh: number // viewBox height
}

/** Fetch the Google Fonts CSS and extract the TTF URL. */
async function getFontUrl(family: string): Promise<string | null> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`
  try {
    const resp = await fetch(cssUrl, { headers: { 'User-Agent': USER_AGENT } })
    if (!resp.ok) return null
    const css = await resp.text()
    const match = css.match(/url\(([^)]+\.ttf)\)/)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

/** Download a TTF font and convert the font name to SVG path data. */
async function renderFont(url: string, text: string): Promise<Preview | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buffer = await resp.arrayBuffer()
    const font = opentype.parse(buffer)
    const path = font.getPath(text, 0, FONT_SIZE, FONT_SIZE)
    const bbox = path.getBoundingBox()
    // Precision 0 = integer coordinates only, much smaller output
    const pathData = path.toPathData(0)

    const vw = Math.ceil(bbox.x2 - bbox.x1)
    const vh = Math.ceil(bbox.y2 - bbox.y1)
    if (vw <= 0 || vh <= 0 || !pathData) return null
    if (pathData.length > MAX_PATH_LENGTH) return null // too complex for preview

    return {
      d: pathData,
      vx: Math.floor(bbox.x1),
      vy: Math.floor(bbox.y1),
      vw: vw + 1,
      vh: vh + 1,
    }
  } catch {
    return null
  }
}

async function main() {
  console.log(`Generating SVG previews for ${FONT_CATALOG.length} fonts...`)

  const previews: Record<number, Preview> = {}
  let done = 0
  let failed = 0

  // Process in batches to stay within connection limits
  const BATCH = 20
  for (let i = 0; i < FONT_CATALOG.length; i += BATCH) {
    const batch = FONT_CATALOG.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (font, j) => {
        const idx = i + j
        const url = await getFontUrl(font.f)
        if (!url) return { idx, preview: null }
        const preview = await renderFont(url, font.f)
        return { idx, preview }
      }),
    )

    for (const { idx, preview } of results) {
      if (preview) {
        previews[idx] = preview
        done++
      } else {
        failed++
      }
    }

    const pct = Math.round(((i + batch.length) / FONT_CATALOG.length) * 100)
    process.stdout.write(`\r  ${pct}%  ${done} ok / ${failed} failed`)
  }

  console.log(`\n  Generated ${done} previews (${failed} failed)`)

  const outPath = new URL('../src/fonts/previews.json', import.meta.url).pathname
  await Bun.write(outPath, JSON.stringify(previews))

  const size = (await Bun.file(outPath).stat())?.size ?? 0
  console.log(`  Wrote ${outPath} (${Math.round(size / 1024)} KB)`)
}

main().catch(console.error)
