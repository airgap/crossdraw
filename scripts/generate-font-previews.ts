#!/usr/bin/env bun
/**
 * Renders each Google Font family name as a PNG sprite sheet.
 * Uses opentype.js for font parsing and @napi-rs/canvas for PNG output.
 *
 * Output:
 *   public/font-previews.png     — tall sprite (250 × N*20), white on transparent
 *   src/fonts/preview-meta.json  — { width, rowHeight, count, missing: number[] }
 *
 * At runtime the font picker uses CSS mask-image on the sprite so text
 * renders in the current theme color. Fallback fonts render for failed downloads.
 *
 * Run: bun scripts/generate-font-previews.ts
 */

import { createCanvas } from '@napi-rs/canvas'
import opentype from 'opentype.js'
import { FONT_CATALOG } from '../src/fonts/catalog'

const ROW_WIDTH = 250
const ROW_HEIGHT = 20
const FONT_SIZE = 14
const TEXT_X = 2
const BASELINE_RATIO = 0.72
const USER_AGENT = 'Mozilla/4.0' // Old UA → Google Fonts returns TTF (opentype.js can't parse WOFF2)

async function getFontUrl(family: string): Promise<string | null> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}&display=swap`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!r.ok) return null
    const css = await r.text()
    const m = css.match(/url\(([^)]+\.ttf)\)/)
    return m ? m[1]! : null
  } catch {
    return null
  }
}

async function downloadFont(family: string): Promise<opentype.Font | null> {
  const url = await getFontUrl(family)
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return opentype.parse(await r.arrayBuffer())
  } catch {
    return null
  }
}

/** Draw an opentype.js path onto a canvas 2D context. */
function drawPath(ctx: any, path: any): void {
  ctx.beginPath()
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M':
        ctx.moveTo(cmd.x, cmd.y)
        break
      case 'L':
        ctx.lineTo(cmd.x, cmd.y)
        break
      case 'C':
        ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
        break
      case 'Q':
        ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y)
        break
      case 'Z':
        ctx.closePath()
        break
    }
  }
  ctx.fill()
}

async function main() {
  console.log(`Generating PNG sprite for ${FONT_CATALOG.length} fonts...`)

  const fallback = await downloadFont('Roboto')
  if (!fallback) throw new Error('Failed to download fallback font (Roboto)')
  console.log('  Fallback font ready')

  const totalH = FONT_CATALOG.length * ROW_HEIGHT
  const canvas = createCanvas(ROW_WIDTH, totalH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'

  const missing: number[] = []
  let ok = 0

  const BATCH = 20
  for (let i = 0; i < FONT_CATALOG.length; i += BATCH) {
    const batch = FONT_CATALOG.slice(i, i + BATCH)
    const results = await Promise.all(
      batch.map(async (entry, j) => ({
        idx: i + j,
        entry,
        font: await downloadFont(entry.f),
      })),
    )

    for (const { idx, entry, font } of results) {
      const y = idx * ROW_HEIGHT + Math.round(ROW_HEIGHT * BASELINE_RATIO)
      const f = font ?? fallback
      if (!font) missing.push(idx)
      else ok++

      const path = f.getPath(entry.f, TEXT_X, y, FONT_SIZE)
      drawPath(ctx, path)
    }

    const pct = Math.round(((i + batch.length) / FONT_CATALOG.length) * 100)
    process.stdout.write(`\r  ${pct}%  ${ok} ok / ${missing.length} fallback`)
  }

  console.log(`\n  ${ok} own font / ${missing.length} fallback`)

  const pngBuf = canvas.toBuffer('image/png')
  const pngPath = new URL('../public/font-previews.png', import.meta.url).pathname
  await Bun.write(pngPath, pngBuf)
  console.log(`  ${pngPath} (${Math.round(pngBuf.length / 1024)} KB)`)

  const meta = { width: ROW_WIDTH, rowHeight: ROW_HEIGHT, count: FONT_CATALOG.length, missing }
  const metaPath = new URL('../src/fonts/preview-meta.json', import.meta.url).pathname
  await Bun.write(metaPath, JSON.stringify(meta))
  console.log(`  ${metaPath}`)

  // Remove old SVG previews if present
  try {
    const old = new URL('../src/fonts/previews.json', import.meta.url).pathname
    const { unlinkSync } = await import('fs')
    unlinkSync(old)
    console.log('  Removed old previews.json')
  } catch {}
}

main().catch(console.error)
