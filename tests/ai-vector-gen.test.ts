import { describe, it, expect, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { buildVectorArtPrompt } from '@/ai/prompt-templates'
import { extractSVG } from '@/ai/ai-service'
import { importSVG } from '@/io/svg-import'

// Provide DOMParser for bun:test environment
beforeAll(() => {
  const dom = new JSDOM('')
  ;(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser
})

// ── buildVectorArtPrompt tests ──

describe('buildVectorArtPrompt', () => {
  it('returns system and user strings', () => {
    const result = buildVectorArtPrompt('a cat sitting on a windowsill', 800, 600)
    expect(result.system).toBeTypeOf('string')
    expect(result.user).toBeTypeOf('string')
    expect(result.system.length).toBeGreaterThan(100)
    expect(result.user.length).toBeGreaterThan(0)
  })

  it('includes width and height in the system prompt', () => {
    const result = buildVectorArtPrompt('test', 1024, 768)
    expect(result.system).toContain('1024')
    expect(result.system).toContain('768')
  })

  it('includes width and height in the user prompt', () => {
    const result = buildVectorArtPrompt('test', 1024, 768)
    expect(result.user).toContain('1024')
    expect(result.user).toContain('768')
  })

  it('includes the user description in the user prompt', () => {
    const result = buildVectorArtPrompt('a golden retriever playing fetch', 800, 600)
    expect(result.user).toContain('a golden retriever playing fetch')
  })

  it('requires SVG output in the system prompt', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('SVG')
    expect(result.system).toContain('valid SVG markup')
  })

  it('mentions viewBox in the system prompt', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('viewBox')
    expect(result.system).toContain('0 0 800 600')
  })

  it('forbids raster images in the system prompt', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('<image>')
  })

  it('forbids scripts in the system prompt', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('<script>')
  })

  it('mentions allowed SVG elements', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('<path>')
    expect(result.system).toContain('<rect>')
    expect(result.system).toContain('<circle>')
    expect(result.system).toContain('<ellipse>')
    expect(result.system).toContain('<polygon>')
  })

  it('mentions gradients for visual richness', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('linearGradient')
    expect(result.system).toContain('radialGradient')
  })

  it('mentions groups for organization', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('<g>')
  })

  it('instructs no markdown fences', () => {
    const result = buildVectorArtPrompt('test', 800, 600)
    expect(result.system).toContain('No explanation')
    expect(result.system).toContain('no markdown fences')
  })
})

// ── extractSVG tests ──

describe('extractSVG', () => {
  it('extracts SVG from clean response', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#f0f0f0"/></svg>'
    expect(extractSVG(svg)).toBe(svg)
  })

  it('extracts SVG from markdown code fences (svg)', () => {
    const inner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><circle cx="400" cy="300" r="100" fill="red"/></svg>'
    const wrapped = `\`\`\`svg\n${inner}\n\`\`\``
    expect(extractSVG(wrapped)).toBe(inner)
  })

  it('extracts SVG from markdown code fences (xml)', () => {
    const inner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="100" height="100"/></svg>'
    const wrapped = `\`\`\`xml\n${inner}\n\`\`\``
    expect(extractSVG(wrapped)).toBe(inner)
  })

  it('extracts SVG from plain markdown code fences', () => {
    const inner = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/></svg>'
    const wrapped = `\`\`\`\n${inner}\n\`\`\``
    expect(extractSVG(wrapped)).toBe(inner)
  })

  it('extracts SVG from response with surrounding text', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="blue"/></svg>'
    const response = `Here is the illustration:\n${svg}\nI hope you like it!`
    expect(extractSVG(response)).toBe(svg)
  })

  it('handles whitespace around SVG', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600"/></svg>'
    const response = `  \n  ${svg}  \n  `
    const result = extractSVG(response)
    expect(result).toContain('<svg')
    expect(result).toContain('</svg>')
  })

  it('returns trimmed text when no SVG found', () => {
    const text = '  no svg here  '
    expect(extractSVG(text)).toBe('no svg here')
  })
})

// ── Integration: SVG string -> importSVG -> produces layers ──

describe('SVG to layers integration', () => {
  it('converts a simple SVG with rect to layers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <rect x="10" y="20" width="100" height="50" fill="#ff0000"/>
    </svg>`
    const doc = importSVG(svg)
    expect(doc.artboards.length).toBeGreaterThan(0)
    const artboard = doc.artboards[0]!
    expect(artboard.layers.length).toBeGreaterThan(0)
  })

  it('converts SVG with multiple shapes to multiple layers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
      <rect x="0" y="0" width="400" height="400" fill="#eee"/>
      <circle cx="200" cy="200" r="100" fill="#ff5500"/>
      <ellipse cx="200" cy="300" rx="80" ry="40" fill="#00aaff"/>
    </svg>`
    const doc = importSVG(svg)
    const artboard = doc.artboards[0]!
    expect(artboard.layers.length).toBeGreaterThanOrEqual(3)
  })

  it('converts SVG with groups to group layers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
      <g id="background">
        <rect width="800" height="600" fill="#333"/>
      </g>
      <g id="foreground">
        <circle cx="400" cy="300" r="50" fill="#fff"/>
      </g>
    </svg>`
    const doc = importSVG(svg)
    const artboard = doc.artboards[0]!
    expect(artboard.layers.length).toBeGreaterThan(0)
    // Should have group layers
    const groups = artboard.layers.filter((l) => l.type === 'group')
    expect(groups.length).toBeGreaterThanOrEqual(2)
  })

  it('converts SVG with paths to vector layers', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
      <path d="M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80" stroke="#000" fill="none" stroke-width="2"/>
    </svg>`
    const doc = importSVG(svg)
    const artboard = doc.artboards[0]!
    expect(artboard.layers.length).toBeGreaterThan(0)
    const vectorLayers = artboard.layers.filter((l) => l.type === 'vector')
    expect(vectorLayers.length).toBeGreaterThan(0)
  })

  it('converts SVG with gradients', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
      <defs>
        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="100%" stop-color="#0000ff"/>
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#grad1)"/>
    </svg>`
    const doc = importSVG(svg)
    const artboard = doc.artboards[0]!
    expect(artboard.layers.length).toBeGreaterThan(0)
  })

  it('handles empty SVG gracefully', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600"></svg>`
    const doc = importSVG(svg)
    expect(doc.artboards.length).toBeGreaterThan(0)
    // An empty SVG produces an artboard with no layers
    expect(doc.artboards[0]!.layers.length).toBe(0)
  })

  it('preserves artboard dimensions from SVG viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
      <rect width="1920" height="1080" fill="#fff"/>
    </svg>`
    const doc = importSVG(svg)
    const artboard = doc.artboards[0]!
    expect(artboard.width).toBe(1920)
    expect(artboard.height).toBe(1080)
  })
})
