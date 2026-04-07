// Crossdraw Text Picker — content script
// Captures text content + full computed styling from any element on the page.

;(() => {
  'use strict'

  let active = false
  let overlay = null
  let tooltip = null
  let hoveredEl = null

  // ── Clipboard format identifier ──
  const MIME = 'application/x-crossdraw-text-style'

  // ── CSS properties we care about ──
  const TEXT_PROPS = [
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'fontStretch',
    'fontVariationSettings',
    'fontFeatureSettings',
    'fontOpticalSizing',
    'fontKerning',
    'color',
    'textAlign',
    'textDecoration',
    'textDecorationColor',
    'textDecorationStyle',
    'textTransform',
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'textIndent',
    'textShadow',
    'whiteSpace',
    'writingMode',
    'direction',
    'textOrientation',
    // Variable font axes
    'fontVariantCaps',
    'fontVariantNumeric',
    'fontVariantLigatures',
    'fontVariantEastAsian',
  ]

  // ── Activation ──

  function activate() {
    if (active) return
    active = true
    createOverlay()
    document.addEventListener('mousemove', onMouseMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
  }

  function deactivate() {
    if (!active) return
    active = false
    removeOverlay()
    unhighlight()
    document.removeEventListener('mousemove', onMouseMove, true)
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKeyDown, true)
  }

  // ── Overlay + tooltip ──

  function createOverlay() {
    overlay = document.createElement('div')
    overlay.id = '__crossdraw-picker-overlay'
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;pointer-events:none;'

    tooltip = document.createElement('div')
    tooltip.id = '__crossdraw-picker-tooltip'
    tooltip.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'background:#1a1a2e',
      'color:#e0e0e0',
      'font:12px/1.4 system-ui,sans-serif',
      'padding:6px 10px',
      'border-radius:6px',
      'box-shadow:0 2px 12px rgba(0,0,0,.4)',
      'pointer-events:none',
      'max-width:320px',
      'white-space:pre-line',
      'display:none',
    ].join(';')
    document.documentElement.appendChild(overlay)
    document.documentElement.appendChild(tooltip)
  }

  function removeOverlay() {
    overlay?.remove()
    tooltip?.remove()
    overlay = null
    tooltip = null
  }

  function showTooltip(x, y, text) {
    if (!tooltip) return
    tooltip.textContent = text
    tooltip.style.display = 'block'
    // Keep tooltip on screen
    const pad = 12
    let left = x + pad
    let top = y + pad
    const rect = tooltip.getBoundingClientRect()
    if (left + rect.width > window.innerWidth) left = x - rect.width - pad
    if (top + rect.height > window.innerHeight) top = y - rect.height - pad
    tooltip.style.left = left + 'px'
    tooltip.style.top = top + 'px'
  }

  // ── Highlight ──

  function highlight(el) {
    if (hoveredEl === el) return
    unhighlight()
    hoveredEl = el
    el.dataset.__crossdrawOutline = el.style.outline
    el.style.outline = '2px solid #6c5ce7'
  }

  function unhighlight() {
    if (!hoveredEl) return
    hoveredEl.style.outline = hoveredEl.dataset.__crossdrawOutline || ''
    delete hoveredEl.dataset.__crossdrawOutline
    hoveredEl = null
  }

  // ── Event handlers ──

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || el === overlay || el === tooltip) return

    highlight(el)

    const cs = getComputedStyle(el)
    const preview = [
      cs.fontFamily.split(',')[0].replace(/['"]/g, ''),
      cs.fontSize,
      `w${cs.fontWeight}`,
      cs.color,
    ].join('  ')
    showTooltip(e.clientX, e.clientY, `🎨 ${preview}\nClick to copy`)
  }

  function onClick(e) {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el || el === overlay || el === tooltip) return

    const payload = extractTextStyle(el)
    copyToClipboard(payload)
    flashConfirm(e.clientX, e.clientY)
    deactivate()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      deactivate()
    }
  }

  // ── Style extraction ──

  function extractTextStyle(el) {
    const cs = getComputedStyle(el)

    // Get the text content — prefer selection if any, else element text
    const selection = window.getSelection()
    const selectedText =
      selection && selection.toString().trim() ? selection.toString() : el.innerText || el.textContent || ''

    // Collect all computed text properties
    const style = {}
    for (const prop of TEXT_PROPS) {
      const val = cs[prop]
      if (val !== undefined && val !== '') {
        style[prop] = val
      }
    }

    // Parse font-variation-settings into structured axes
    const axes = parseFontVariationSettings(cs.fontVariationSettings)

    // Parse font-feature-settings into structured features
    const features = parseFontFeatureSettings(cs.fontFeatureSettings)

    // Resolve actual RGBA color
    style.colorRGBA = parseColor(cs.color)

    // Background color for context
    style.backgroundColor = cs.backgroundColor
    style.backgroundColorRGBA = parseColor(cs.backgroundColor)

    // Compute numeric weight (font-weight can be 'normal'/'bold' or numeric)
    const numWeight = cs.fontWeight === 'normal' ? 400 : cs.fontWeight === 'bold' ? 700 : Number(cs.fontWeight) || 400
    style.fontWeightNumeric = numWeight

    // Parse letter-spacing to numeric px
    style.letterSpacingPx = parseFloat(cs.letterSpacing) || 0

    // Parse word-spacing to numeric px
    style.wordSpacingPx = parseFloat(cs.wordSpacing) || 0

    // Parse line-height to numeric ratio
    const lh = parseFloat(cs.lineHeight)
    const fs = parseFloat(cs.fontSize)
    style.lineHeightRatio = lh && fs ? Math.round((lh / fs) * 100) / 100 : 1.4

    // Parse font-size to numeric px
    style.fontSizePx = fs

    // Build the Crossdraw-compatible payload
    return {
      _crossdraw: 'text-style',
      version: 1,
      text: selectedText,
      style,
      variationAxes: axes,
      openTypeFeatures: features,
      sourceUrl: location.href,
      timestamp: Date.now(),
    }
  }

  function parseFontVariationSettings(val) {
    if (!val || val === 'normal') return []
    // Format: "'wght' 700, 'wdth' 100"
    const axes = []
    for (const chunk of val.split(',')) {
      const match = chunk.trim().match(/['"](\w{4})['"]\s+([\d.]+)/)
      if (match) {
        axes.push({ tag: match[1], value: parseFloat(match[2]) })
      }
    }
    return axes
  }

  function parseFontFeatureSettings(val) {
    if (!val || val === 'normal') return {}
    const features = {}
    for (const chunk of val.split(',')) {
      const match = chunk.trim().match(/['"](\w{4})['"]\s*([\d]+)?/)
      if (match) {
        features[match[1]] = match[2] ? parseInt(match[2]) !== 0 : true
      }
    }
    return features
  }

  function parseColor(str) {
    if (!str) return null
    // Use a canvas to resolve any CSS color to RGBA
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = str
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: Math.round((a / 255) * 100) / 100 }
  }

  // ── Clipboard ──

  async function copyToClipboard(payload) {
    const json = JSON.stringify(payload, null, 2)

    try {
      // Write both plain text (the actual text) and our custom JSON
      // Clipboard API: use text/plain for the JSON payload since custom MIME
      // types aren't universally supported in clipboardWrite.
      // We prefix it so Crossdraw can detect it.
      await navigator.clipboard.writeText(json)
    } catch {
      // Fallback: execCommand
      const textarea = document.createElement('textarea')
      textarea.value = json
      textarea.style.cssText = 'position:fixed;left:-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
  }

  // ── Visual feedback ──

  function flashConfirm(x, y) {
    const flash = document.createElement('div')
    flash.textContent = '✓ Copied to Crossdraw'
    flash.style.cssText = [
      'position:fixed',
      `left:${x}px`,
      `top:${y - 30}px`,
      'z-index:2147483647',
      'background:#00b894',
      'color:#fff',
      'font:600 13px/1 system-ui,sans-serif',
      'padding:6px 12px',
      'border-radius:6px',
      'box-shadow:0 2px 8px rgba(0,0,0,.3)',
      'pointer-events:none',
      'transition:all .4s ease',
    ].join(';')
    document.documentElement.appendChild(flash)
    requestAnimationFrame(() => {
      flash.style.opacity = '0'
      flash.style.transform = 'translateY(-20px)'
    })
    setTimeout(() => flash.remove(), 500)
  }

  // ── Message listener ──

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'toggle-picker') {
      if (active) deactivate()
      else activate()
    }
  })
})()
