import { describe, test, expect, beforeAll } from 'bun:test'
import { JSDOM } from 'jsdom'
import { importSVG } from '@/io/svg-import'
import { exportArtboardToSVG } from '@/io/svg-export'
import { encodeDocument, decodeDocument } from '@/io/file-format'
import { segmentsToSVGPath } from '@/math/path'
import type { VectorLayer, TextLayer, DesignDocument, Layer } from '@/types'

// Provide DOMParser for bun:test
beforeAll(() => {
  const dom = new JSDOM('')
  ;(globalThis as any).DOMParser = dom.window.DOMParser
})

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse an SVG string into a JSDOM Document for attribute comparison. */
function parseSVGDOM(svg: string) {
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  return dom.window.document
}

/** Import an SVG, export it back, return both the doc and the re-exported SVG. */
function roundTripSVG(svg: string): { doc: DesignDocument; exported: string } {
  const doc = importSVG(svg)
  const exported = exportArtboardToSVG(doc)
  return { doc, exported }
}

/** Full round-trip through .design binary format. */
function roundTripDesign(doc: DesignDocument): DesignDocument {
  const buffer = encodeDocument(doc)
  return decodeDocument(buffer)
}

// ── Test SVGs ────────────────────────────────────────────────────────

const simpleSVGs = {
  rectangle: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect x="10" y="20" width="60" height="40" fill="#ff0000"/>
  </svg>`,

  circle: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <circle cx="50" cy="50" r="30" fill="#00ff00"/>
  </svg>`,

  ellipse: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <ellipse cx="50" cy="50" rx="40" ry="20" fill="#0000ff"/>
  </svg>`,

  line: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <line x1="10" y1="10" x2="90" y2="90" stroke="#000" stroke-width="2"/>
  </svg>`,

  polygon: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <polygon points="50,5 95,80 5,80" fill="#ffcc00"/>
  </svg>`,

  polyline: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <polyline points="10,10 40,80 70,30 90,90" fill="none" stroke="#333" stroke-width="2"/>
  </svg>`,

  path: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <path d="M10 10 L90 10 L90 90 L10 90 Z" fill="#purple"/>
  </svg>`,

  pathCubic: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M10 80 C40 10 65 10 95 80 S150 150 180 80" fill="none" stroke="#f00" stroke-width="2"/>
  </svg>`,

  pathQuadratic: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M10 80 Q52.5 10 95 80 T180 80" fill="none" stroke="#00f" stroke-width="2"/>
  </svg>`,

  pathArc: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M10 80 A45 45 0 0 0 125 125" fill="none" stroke="#0a0" stroke-width="2"/>
  </svg>`,

  text: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
    <text x="10" y="50" fill="#333" font-family="Arial" font-size="24" font-weight="bold">Hello World</text>
  </svg>`,

  group: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <g opacity="0.5" transform="translate(10 10)">
      <rect x="0" y="0" width="30" height="30" fill="red"/>
      <circle cx="50" cy="50" r="15" fill="blue"/>
    </g>
  </svg>`,

  strokeProps: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <path d="M10 50 L90 50" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 5"/>
  </svg>`,

  opacity: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect x="10" y="10" width="80" height="80" fill="#ff0000" opacity="0.5"/>
  </svg>`,

  multiShape: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect x="10" y="10" width="80" height="80" fill="#f00"/>
    <circle cx="150" cy="50" r="30" fill="#0f0"/>
    <ellipse cx="100" cy="150" rx="50" ry="25" fill="#00f"/>
    <line x1="10" y1="180" x2="190" y2="180" stroke="#000" stroke-width="1"/>
  </svg>`,

  transforms: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect x="0" y="0" width="50" height="50" fill="#f00" transform="translate(50 50) rotate(45)"/>
  </svg>`,

  fillNone: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <circle cx="50" cy="50" r="40" fill="none" stroke="#000" stroke-width="2"/>
  </svg>`,

  inlineStyle: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect x="0" y="0" width="100" height="100" style="fill:#abcdef;stroke:#123456;stroke-width:3"/>
  </svg>`,

  viewBoxOnly: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#333"/>
  </svg>`,

  linearGradient: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <defs>
      <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff0000"/>
        <stop offset="1" stop-color="#0000ff"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="100" height="100" fill="url(#lg1)"/>
  </svg>`,

  radialGradient: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <defs>
      <radialGradient id="rg1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff"/>
        <stop offset="100%" stop-color="#000"/>
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#rg1)"/>
  </svg>`,

  fillRule: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <path d="M10 10 L90 10 L90 90 L10 90 Z M30 30 L70 30 L70 70 L30 70 Z" fill="#000" fill-rule="evenodd"/>
  </svg>`,

  roundedRect: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect x="10" y="10" width="80" height="60" rx="10" fill="#6699cc"/>
  </svg>`,
}

// ── Complex test SVGs ────────────────────────────────────────────────

const complexSVGs = {
  // 1. Deeply nested groups (5 levels) with transforms at every level
  deeplyNestedGroups: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
    <g transform="translate(50 50)" opacity="0.9">
      <g transform="rotate(15)">
        <g transform="scale(1.5)">
          <g transform="translate(10 -5)">
            <g transform="rotate(-10)">
              <rect x="0" y="0" width="40" height="40" fill="#e74c3c"/>
              <circle cx="60" cy="20" r="15" fill="#3498db"/>
            </g>
          </g>
          <rect x="100" y="0" width="30" height="30" fill="#2ecc71"/>
        </g>
      </g>
      <ellipse cx="200" cy="100" rx="50" ry="30" fill="#f39c12" opacity="0.7"/>
    </g>
  </svg>`,

  // 2. Complex path with all command types: M, L, H, V, C, S, Q, T, A, Z
  allPathCommands: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <path d="M10 80 L50 10 H120 V80 C140 10 190 10 210 80 S280 150 300 80 Q320 10 350 80 T380 80 A25 25 0 0 1 350 120 L10 120 Z" fill="#8e44ad" stroke="#2c3e50" stroke-width="2"/>
  </svg>`,

  // 3. Relative commands (m, l, h, v, c, s, q, t, a, z)
  relativeCommands: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <path d="m10 150 l40 -80 h70 v40 c20 -70 60 -70 80 0 s60 70 80 0 q20 -70 50 0 t30 0 a20 20 0 0 1 -20 40 l-330 0 z" fill="#1abc9c" stroke="#16a085" stroke-width="1.5"/>
  </svg>`,

  // 4. Multiple subpaths (compound path with holes)
  compoundPath: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M10 10 L190 10 L190 190 L10 190 Z M40 40 L40 160 L160 160 L160 40 Z M70 70 L130 70 L130 130 L70 130 Z" fill="#2c3e50" fill-rule="evenodd"/>
  </svg>`,

  // 5. Many shapes with overlapping coordinates and mixed fills/strokes
  manyShapesMixed: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <rect x="0" y="0" width="800" height="600" fill="#ecf0f1"/>
    <circle cx="100" cy="100" r="80" fill="#e74c3c" opacity="0.8"/>
    <circle cx="160" cy="100" r="80" fill="#3498db" opacity="0.6"/>
    <circle cx="130" cy="160" r="80" fill="#2ecc71" opacity="0.6"/>
    <ellipse cx="400" cy="100" rx="120" ry="60" fill="none" stroke="#8e44ad" stroke-width="4" stroke-dasharray="15 5 5 5"/>
    <line x1="300" y1="200" x2="500" y2="200" stroke="#e67e22" stroke-width="3" stroke-linecap="round"/>
    <rect x="550" y="50" width="200" height="150" rx="20" fill="#1abc9c" stroke="#16a085" stroke-width="2"/>
    <polygon points="400,250 500,350 450,450 350,450 300,350" fill="#f1c40f" stroke="#f39c12" stroke-width="2" stroke-linejoin="round"/>
    <polyline points="50,300 100,250 150,350 200,280 250,380 300,300" fill="none" stroke="#9b59b6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M600 300 C600 250 700 250 700 300 C700 370 650 400 650 420 C650 400 600 370 600 300 Z" fill="#e74c3c"/>
    <path d="M50 500 Q200 400 350 500 T650 500" fill="none" stroke="#2c3e50" stroke-width="2"/>
  </svg>`,

  // 6. CSS class-based styling with multiple classes
  cssClassStyling: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <style>
      .primary { fill: #e74c3c; stroke: #c0392b; stroke-width: 2; }
      .secondary { fill: #3498db; stroke: #2980b9; stroke-width: 1; }
      .outline { fill: none; stroke: #2c3e50; stroke-width: 3; stroke-dasharray: 8 4; }
      .dimmed { opacity: 0.5; }
    </style>
    <rect class="primary" x="10" y="10" width="100" height="100"/>
    <circle class="secondary" cx="200" cy="60" r="50"/>
    <ellipse class="outline" cx="150" cy="200" rx="80" ry="40"/>
    <rect class="primary dimmed" x="10" y="180" width="60" height="60"/>
  </svg>`,

  // 7. Inline styles overriding presentation attributes
  inlineStylePrecedence: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
    <rect x="10" y="10" width="100" height="80" fill="blue" style="fill:#e74c3c;stroke:#c0392b;stroke-width:3"/>
    <circle cx="200" cy="50" r="40" fill="green" stroke="red" style="fill:none;stroke:#3498db;stroke-width:2;stroke-dasharray:5 3"/>
    <path d="M10 150 L290 150" stroke="black" style="stroke:#f39c12;stroke-width:4;stroke-linecap:round"/>
  </svg>`,

  // 8. Multiple gradients (linear + radial) on different shapes
  multipleGradients: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <defs>
      <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#e74c3c"/>
        <stop offset="50%" stop-color="#f39c12"/>
        <stop offset="100%" stop-color="#f1c40f"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
        <stop offset="70%" stop-color="#3498db" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#2c3e50" stop-opacity="0.3"/>
      </radialGradient>
      <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#bdc3c7"/>
        <stop offset="0.5" stop-color="#95a5a6"/>
        <stop offset="1" stop-color="#7f8c8d"/>
      </linearGradient>
    </defs>
    <rect x="10" y="10" width="180" height="130" fill="url(#sunset)"/>
    <circle cx="300" cy="75" r="65" fill="url(#glow)"/>
    <rect x="10" y="160" width="380" height="60" rx="10" fill="url(#steel)" stroke="#7f8c8d" stroke-width="1"/>
    <ellipse cx="200" cy="250" rx="100" ry="30" fill="url(#sunset)"/>
  </svg>`,

  // 9. Chained transforms: translate + rotate + scale combinations
  chainedTransforms: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect x="0" y="0" width="50" height="50" fill="#e74c3c" transform="translate(100 100) rotate(45) scale(1.5)"/>
    <rect x="0" y="0" width="40" height="40" fill="#3498db" transform="translate(250 100) rotate(-30) scale(0.8 1.2)"/>
    <circle cx="0" cy="0" r="25" fill="#2ecc71" transform="translate(200 300) scale(2)"/>
    <path d="M0 0 L30 0 L30 30 L0 30 Z" fill="#f39c12" transform="rotate(60 200 200) translate(10 10)"/>
  </svg>`,

  // 10. rotate(angle cx cy) with non-zero center points
  rotateCenterPoint: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect x="50" y="50" width="100" height="100" fill="#9b59b6" transform="rotate(45 100 100)"/>
    <circle cx="100" cy="100" r="10" fill="#e74c3c" transform="rotate(90 100 100)"/>
    <line x1="50" y1="100" x2="150" y2="100" stroke="#2c3e50" stroke-width="2" transform="rotate(-30 100 100)"/>
  </svg>`,

  // 11. Large path with many segments (star with 20 points)
  complexStar: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <path d="M150 10 L165 95 L250 60 L190 120 L270 160 L185 155 L200 240 L150 175 L100 240 L115 155 L30 160 L110 120 L50 60 L135 95 Z" fill="#f1c40f" stroke="#f39c12" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,

  // 12. Bezier-heavy path (flower shape with smooth curves)
  bezierFlower: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <path d="M150 50 C200 50 200 100 150 100 C200 100 200 150 150 150 C200 150 200 200 150 200 C150 200 100 200 100 150 C100 200 50 200 50 150 C50 200 0 150 50 150 C0 150 50 100 50 100 C50 100 0 50 50 50 C50 50 100 50 100 100 C100 50 150 50 150 50 Z" fill="#e74c3c" opacity="0.8"/>
  </svg>`,

  // 13. Multiple arcs with varying flags (large-arc, sweep)
  arcVariations: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <path d="M50 200 A100 100 0 0 0 250 200" fill="none" stroke="#e74c3c" stroke-width="3"/>
    <path d="M50 200 A100 100 0 1 0 250 200" fill="none" stroke="#3498db" stroke-width="3"/>
    <path d="M50 200 A100 100 0 0 1 250 200" fill="none" stroke="#2ecc71" stroke-width="3"/>
    <path d="M50 200 A100 100 0 1 1 250 200" fill="none" stroke="#f39c12" stroke-width="3"/>
    <path d="M300 100 A50 80 30 1 0 380 300" fill="none" stroke="#9b59b6" stroke-width="2"/>
    <path d="M300 100 A50 80 30 0 1 380 300" fill="none" stroke="#1abc9c" stroke-width="2"/>
  </svg>`,

  // 14. Mixed text and shapes
  mixedTextShapes: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <rect x="10" y="10" width="380" height="280" rx="15" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="2"/>
    <text x="30" y="50" fill="#2c3e50" font-family="Helvetica" font-size="28" font-weight="bold">Dashboard</text>
    <line x1="30" y1="65" x2="370" y2="65" stroke="#bdc3c7" stroke-width="1"/>
    <circle cx="80" cy="130" r="40" fill="#e74c3c"/>
    <text x="60" y="135" fill="#fff" font-family="Arial" font-size="18">42%</text>
    <rect x="150" y="90" width="220" height="80" rx="5" fill="#3498db" opacity="0.2"/>
    <text x="170" y="140" fill="#2c3e50" font-family="monospace" font-size="14">Performance metrics</text>
    <polygon points="200,200 250,250 200,250" fill="#2ecc71"/>
    <text x="270" y="240" fill="#7f8c8d" font-family="serif" font-size="12" font-style="italic">Status: OK</text>
  </svg>`,

  // 15. Paths with implicit repeated commands (e.g. multiple coords after L)
  implicitRepeats: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <path d="M10 10 L50 10 90 50 90 90 50 90 10 50 Z" fill="#e74c3c"/>
    <path d="M150 10 C170 10 190 30 190 50 190 70 170 90 150 90 130 90 110 70 110 50 110 30 130 10 150 10 Z" fill="#3498db"/>
    <path d="M10 150 l40 0 40 40 0 40 -40 0 -40 -40 z" fill="#2ecc71"/>
  </svg>`,

  // 16. Scientific notation in coordinates
  scientificNotation: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M1e1 1e1 L1.9e2 1e1 L1.9e2 1.9e2 L1e1 1.9e2 Z" fill="#e74c3c"/>
    <circle cx="1e2" cy="1e2" r="3e1" fill="#3498db"/>
  </svg>`,

  // 17. Negative coordinates and transforms
  negativeCoords: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="-200 -200 400 400">
    <rect x="-100" y="-100" width="200" height="200" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="1"/>
    <circle cx="0" cy="0" r="80" fill="none" stroke="#e74c3c" stroke-width="2"/>
    <line x1="-150" y1="0" x2="150" y2="0" stroke="#95a5a6" stroke-width="1"/>
    <line x1="0" y1="-150" x2="0" y2="150" stroke="#95a5a6" stroke-width="1"/>
    <path d="M-50 -50 L50 -50 L50 50 L-50 50 Z" fill="#3498db" opacity="0.5" transform="rotate(45)"/>
  </svg>`,

  // 18. Ultra-complex path: icon with many cubic curves (chat bubble)
  complexIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" fill="none" stroke="#2c3e50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 19. Multiple overlapping gradients with stop-opacity
  gradientWithOpacity: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#000" stop-opacity="1"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="spotlight" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" stop-opacity="0.9"/>
        <stop offset="0.3" stop-color="#ff0" stop-opacity="0.6"/>
        <stop offset="0.6" stop-color="#f00" stop-opacity="0.3"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="300" height="200" fill="url(#fade)"/>
    <circle cx="150" cy="100" r="80" fill="url(#spotlight)"/>
  </svg>`,

  // 20. Paths with consecutive Z M (multiple subpaths in one element)
  multipleSubpathsZM: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <path d="M50 50 L100 50 L100 100 L50 100 Z M150 50 L200 50 L200 100 L150 100 Z M50 150 L100 150 L100 200 L50 200 Z M150 150 L200 150 L200 200 L150 200 Z" fill="#2c3e50"/>
  </svg>`,

  // 21. Stroke properties: all linecap/linejoin combos + miter
  strokeVariations: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <path d="M20 50 L100 50 L60 100" fill="none" stroke="#e74c3c" stroke-width="8" stroke-linecap="butt" stroke-linejoin="miter"/>
    <path d="M150 50 L230 50 L190 100" fill="none" stroke="#3498db" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M280 50 L360 50 L320 100" fill="none" stroke="#2ecc71" stroke-width="8" stroke-linecap="square" stroke-linejoin="bevel"/>
    <path d="M20 200 L380 200" fill="none" stroke="#f39c12" stroke-width="4" stroke-dasharray="20 10 5 10"/>
    <path d="M20 250 L380 250" fill="none" stroke="#9b59b6" stroke-width="3" stroke-dasharray="1 5"/>
  </svg>`,

  // 22. Smooth cubics (S) chaining from C
  smoothCubicChain: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200">
    <path d="M10 100 C40 30 80 30 110 100 S180 170 210 100 S280 30 310 100 S380 170 410 100 S480 30 490 100" fill="none" stroke="#e74c3c" stroke-width="3"/>
  </svg>`,

  // 23. Smooth quadratics (T) chaining from Q
  smoothQuadraticChain: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="200">
    <path d="M10 100 Q60 30 110 100 T210 100 T310 100 T410 100 T490 100" fill="none" stroke="#3498db" stroke-width="3"/>
  </svg>`,

  // 24. Very large number of layers (grid of rectangles)
  manyLayers: `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
    ${Array.from({ length: 100 }, (_, i) => {
      const x = (i % 10) * 50
      const y = Math.floor(i / 10) * 50
      const r = Math.floor((i * 25) % 256)
      const g = Math.floor((i * 37) % 256)
      const b = Math.floor((i * 53) % 256)
      return `<rect x="${x}" y="${y}" width="48" height="48" fill="rgb(${r},${g},${b})"/>`
    }).join('\n    ')}
  </svg>`,

  // 25. viewBox scaling (content drawn at one scale, displayed at another)
  viewBoxScaling: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 1600 1200">
    <rect x="100" y="100" width="1400" height="1000" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="4"/>
    <circle cx="800" cy="600" r="300" fill="#3498db"/>
    <text x="800" y="620" fill="#fff" font-family="Arial" font-size="120" font-weight="bold">BIG</text>
  </svg>`,

  // 26. Groups with opacity at multiple nesting levels
  nestedOpacity: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <g opacity="0.8">
      <rect x="10" y="10" width="100" height="100" fill="#e74c3c"/>
      <g opacity="0.6" transform="translate(50 50)">
        <rect x="0" y="0" width="100" height="100" fill="#3498db"/>
        <g opacity="0.4" transform="translate(30 30)">
          <circle cx="30" cy="30" r="25" fill="#2ecc71"/>
        </g>
      </g>
    </g>
  </svg>`,

  // 27. Path with identical consecutive points (zero-length segments)
  degeneratePath: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <path d="M50 50 L50 50 L100 50 L100 100 L50 100 L50 50 Z" fill="#e74c3c" stroke="#c0392b" stroke-width="2"/>
    <path d="M150 50 C150 50 150 50 150 100 C150 100 100 100 100 100" fill="none" stroke="#3498db" stroke-width="2"/>
  </svg>`,

  // 28. Mixed absolute and relative in same path
  mixedAbsoluteRelative: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
    <path d="M10 150 L50 50 l40 100 L130 50 l40 100 H250 v-100 h50 V200 L10 200 Z" fill="#8e44ad" stroke="#6c3483" stroke-width="2"/>
  </svg>`,

  // 29. Elliptical arcs with non-equal rx/ry and rotation
  ellipticalArcs: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
    <path d="M50 150 A80 40 0 1 1 250 150" fill="none" stroke="#e74c3c" stroke-width="2"/>
    <path d="M50 150 A80 40 45 1 0 250 150" fill="none" stroke="#3498db" stroke-width="2"/>
    <path d="M50 150 A80 40 -45 0 1 250 150" fill="none" stroke="#2ecc71" stroke-width="2"/>
    <path d="M300 50 A30 60 30 1 1 350 250" fill="#f39c12" opacity="0.5"/>
  </svg>`,

  // 30. fill="currentColor" on <svg> element (should inherit as black)
  currentColorSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2 L22 12 L12 22 L2 12 Z"/>
  </svg>`,

  // 31. fill="currentColor" with explicit color property
  currentColorWithColor: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" color="#e74c3c">
    <rect x="10" y="10" width="80" height="80" fill="currentColor"/>
  </svg>`,

  // 32. Inherited fill from parent <g> element
  inheritedFillFromGroup: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <g fill="#e74c3c" stroke="#2c3e50" stroke-width="2">
      <rect x="10" y="10" width="80" height="80"/>
      <circle cx="150" cy="50" r="40"/>
    </g>
  </svg>`,

  // 33. Inherited stroke from parent, overridden by child
  inheritedStrokeOverride: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <g stroke="#e74c3c" stroke-width="3" fill="none">
      <rect x="10" y="10" width="80" height="80"/>
      <rect x="110" y="10" width="80" height="80" stroke="#3498db" stroke-width="1"/>
    </g>
  </svg>`,

  // 34. Deeply inherited fill through nested groups
  deepInheritedFill: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="#9b59b6">
    <g>
      <g>
        <rect x="10" y="10" width="80" height="80"/>
        <rect x="110" y="10" width="80" height="80" fill="#2ecc71"/>
      </g>
    </g>
  </svg>`,

  // 35. SVG with both CSS classes and inline styles (precedence test)
  mixedStyling: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
    <style>
      .base { fill: #e74c3c; stroke: #c0392b; stroke-width: 2; }
      .alt { fill: #3498db; }
    </style>
    <rect class="base" x="10" y="10" width="80" height="80"/>
    <rect class="base" x="110" y="10" width="80" height="80" style="fill:#2ecc71"/>
    <rect class="base alt" x="10" y="110" width="80" height="80"/>
    <rect class="alt" x="110" y="110" width="80" height="80" fill="#f39c12" style="stroke:#e67e22;stroke-width:3"/>
  </svg>`,
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SVG → export round-trip: path data preserved', () => {
  for (const [name, svg] of Object.entries(simpleSVGs)) {
    test(`${name}: segments survive import→export`, () => {
      const doc = importSVG(svg)
      const artboard = doc.artboards[0]!

      // For each vector layer, convert segments back to path d and verify it parses identically
      for (const layer of artboard.layers) {
        if (layer.type !== 'vector') continue
        for (const path of layer.paths) {
          const d = segmentsToSVGPath(path.segments)
          // Re-parse the exported d string
          const { parseSVGPathD } = require('@/io/svg-import')
          const reparsed = parseSVGPathD(d)
          expect(reparsed.length).toBe(path.segments.length)

          for (let i = 0; i < path.segments.length; i++) {
            const orig = path.segments[i]!
            const re = reparsed[i]!
            expect(re.type).toBe(orig.type)
            if ('x' in orig && 'x' in re) {
              expect(re.x).toBeCloseTo(orig.x, 10)
              expect(re.y).toBeCloseTo(orig.y, 10)
            }
            if (orig.type === 'cubic' && re.type === 'cubic') {
              expect(re.cp1x).toBeCloseTo(orig.cp1x, 10)
              expect(re.cp1y).toBeCloseTo(orig.cp1y, 10)
              expect(re.cp2x).toBeCloseTo(orig.cp2x, 10)
              expect(re.cp2y).toBeCloseTo(orig.cp2y, 10)
            }
            if (orig.type === 'quadratic' && re.type === 'quadratic') {
              expect(re.cpx).toBeCloseTo(orig.cpx, 10)
              expect(re.cpy).toBeCloseTo(orig.cpy, 10)
            }
            if (orig.type === 'arc' && re.type === 'arc') {
              expect(re.rx).toBeCloseTo(orig.rx, 10)
              expect(re.ry).toBeCloseTo(orig.ry, 10)
              expect(re.rotation).toBeCloseTo(orig.rotation, 10)
              expect(re.largeArc).toBe(orig.largeArc)
              expect(re.sweep).toBe(orig.sweep)
            }
          }
        }
      }
    })
  }
})

describe('SVG → export round-trip: fills preserved', () => {
  test('solid fill color preserved', () => {
    const { doc } = roundTripSVG(simpleSVGs.rectangle)
    const exported = exportArtboardToSVG(doc)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('#ff0000')
  })

  test('fill:none preserved', () => {
    const { doc } = roundTripSVG(simpleSVGs.fillNone)
    const exported = exportArtboardToSVG(doc)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('fill')).toBe('none')
  })

  test('inline style fill preserved', () => {
    const { doc } = roundTripSVG(simpleSVGs.inlineStyle)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill!.type).toBe('solid')
    if (layer.fill!.type === 'solid') {
      expect(layer.fill!.color).toBe('#abcdef')
    }
  })

  test('fill-rule evenodd preserved', () => {
    const { exported } = roundTripSVG(simpleSVGs.fillRule)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
  })

  test('gradient fill round-trips with URL reference', () => {
    const { exported } = roundTripSVG(simpleSVGs.linearGradient)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    const fill = path.getAttribute('fill')
    expect(fill).toMatch(/^url\(#/)
  })

  test('gradient stops preserved', () => {
    const { doc } = roundTripSVG(simpleSVGs.radialGradient)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill!.type).toBe('gradient')
    if (layer.fill!.type === 'gradient') {
      const stops = layer.fill!.gradient!.stops
      expect(stops.length).toBe(2)
      expect(stops[0]!.offset).toBeCloseTo(0, 5)
      expect(stops[0]!.color).toBe('#fff')
      expect(stops[1]!.offset).toBeCloseTo(1, 5)
      expect(stops[1]!.color).toBe('#000')
    }
  })
})

describe('SVG → export round-trip: strokes preserved', () => {
  test('stroke color and width preserved', () => {
    const { exported } = roundTripSVG(simpleSVGs.line)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('stroke')).toBe('#000')
    expect(path.getAttribute('stroke-width')).toBe('2')
  })

  test('stroke-linecap and dasharray preserved', () => {
    const { exported } = roundTripSVG(simpleSVGs.strokeProps)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('stroke-linecap')).toBe('round')
    expect(path.getAttribute('stroke-linejoin')).toBe('round')
    expect(path.getAttribute('stroke-dasharray')).toBe('10 5')
  })

  test('inline style stroke preserved', () => {
    const { doc } = roundTripSVG(simpleSVGs.inlineStyle)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.stroke).not.toBeNull()
    expect(layer.stroke!.color).toBe('#123456')
    expect(layer.stroke!.width).toBeCloseTo(3, 5)
  })
})

describe('SVG → export round-trip: transforms preserved', () => {
  test('translate + rotate chained transform on import', () => {
    const { doc } = roundTripSVG(simpleSVGs.transforms)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.transform.x).toBeCloseTo(50, 3)
    expect(layer.transform.y).toBeCloseTo(50, 3)
    expect(layer.transform.rotation).toBeCloseTo(45, 3)
  })

  test('transform written to SVG attr on export', () => {
    const { exported } = roundTripSVG(simpleSVGs.transforms)
    const svgDoc = parseSVGDOM(exported)
    const g = svgDoc.querySelector('g[transform]')
    expect(g).not.toBeNull()
    const attr = g!.getAttribute('transform')!
    expect(attr).toContain('translate(50 50)')
    expect(attr).toContain('rotate(45)')
  })

  test('transform survives export→reimport via group', () => {
    const { doc } = roundTripSVG(simpleSVGs.transforms)
    const exported = exportArtboardToSVG(doc)
    const doc2 = importSVG(exported)
    // Export wraps transformed layer in <g transform="...">, reimport creates a group
    const group = doc2.artboards[0]!.layers.find((l) => l.type === 'group')
    if (group && group.type === 'group') {
      expect(group.transform.x).toBeCloseTo(50, 1)
      expect(group.transform.y).toBeCloseTo(50, 1)
      expect(group.transform.rotation).toBeCloseTo(45, 1)
    } else {
      // Or it might be a direct vector layer if no group wrapper
      const vec = doc2.artboards[0]!.layers.find((l) => l.type === 'vector') as VectorLayer
      expect(vec.transform.x).toBeCloseTo(50, 1)
      expect(vec.transform.y).toBeCloseTo(50, 1)
      expect(vec.transform.rotation).toBeCloseTo(45, 1)
    }
  })

  test('identity transform produces no transform attr', () => {
    const { exported } = roundTripSVG(simpleSVGs.rectangle)
    expect(exported).not.toContain('transform=')
  })
})

describe('SVG → export round-trip: opacity preserved', () => {
  test('layer opacity preserved', () => {
    const { doc, exported } = roundTripSVG(simpleSVGs.opacity)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.opacity).toBeCloseTo(0.5, 5)

    const svgDoc = parseSVGDOM(exported)
    const g = svgDoc.querySelector('g[opacity]')
    expect(g).not.toBeNull()
    expect(parseFloat(g!.getAttribute('opacity')!)).toBeCloseTo(0.5, 5)
  })

  test('full opacity has no opacity attr', () => {
    const { exported } = roundTripSVG(simpleSVGs.rectangle)
    expect(exported).not.toContain('opacity=')
  })
})

describe('SVG → export round-trip: text preserved', () => {
  test('text content preserved', () => {
    const { doc, exported } = roundTripSVG(simpleSVGs.text)
    const layer = doc.artboards[0]!.layers[0] as TextLayer
    expect(layer.text).toBe('Hello World')
    expect(layer.fontWeight).toBe('bold')
    expect(layer.fontSize).toBe(24)
    expect(layer.fontFamily).toBe('Arial')
    expect(layer.color).toBe('#333')

    const svgDoc = parseSVGDOM(exported)
    const text = svgDoc.querySelector('text')!
    expect(text.textContent).toBe('Hello World')
    expect(text.getAttribute('font-weight')).toBe('bold')
    expect(text.getAttribute('font-size')).toBe('24')
  })
})

describe('SVG → export round-trip: artboard dimensions', () => {
  test('explicit width/height preserved', () => {
    const { doc, exported } = roundTripSVG(simpleSVGs.rectangle)
    expect(doc.artboards[0]!.width).toBe(100)
    expect(doc.artboards[0]!.height).toBe(100)

    const svgDoc = parseSVGDOM(exported)
    const svg = svgDoc.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('100')
    expect(svg.getAttribute('height')).toBe('100')
  })

  test('viewBox-only SVG uses viewBox dimensions', () => {
    const { doc } = roundTripSVG(simpleSVGs.viewBoxOnly)
    expect(doc.artboards[0]!.width).toBe(24)
    expect(doc.artboards[0]!.height).toBe(24)
  })
})

describe('SVG → export round-trip: layer count preserved', () => {
  test('multi-shape SVG preserves all layers', () => {
    const { doc } = roundTripSVG(simpleSVGs.multiShape)
    // rect + circle + ellipse + line = 4 layers
    expect(doc.artboards[0]!.layers.length).toBe(4)

    const exported = exportArtboardToSVG(doc)
    const doc2 = importSVG(exported)
    // After round-trip: 4 original + 1 background rect added by export = 5
    // But the background rect is from the export, which gets re-imported as a layer
    // The important thing is our 4 shapes are still there
    expect(doc2.artboards[0]!.layers.length).toBeGreaterThanOrEqual(4)
  })
})

describe('SVG → export round-trip: shape-specific geometry', () => {
  test('rectangle corners at correct positions', () => {
    const { doc } = roundTripSVG(simpleSVGs.rectangle)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    // rect x=10 y=20 w=60 h=40 → move(10,20) line(70,20) line(70,60) line(10,60) close
    expect(segs[0]).toEqual({ type: 'move', x: 10, y: 20 })
    expect(segs[1]).toEqual({ type: 'line', x: 70, y: 20 })
    expect(segs[2]).toEqual({ type: 'line', x: 70, y: 60 })
    expect(segs[3]).toEqual({ type: 'line', x: 10, y: 60 })
    expect(segs[4]).toEqual({ type: 'close' })
  })

  test('rounded rect has arc segments', () => {
    const { doc } = roundTripSVG(simpleSVGs.roundedRect)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    const arcCount = segs.filter((s) => s.type === 'arc').length
    expect(arcCount).toBe(4) // 4 corners
  })

  test('circle bezier approximation is symmetric', () => {
    const { doc } = roundTripSVG(simpleSVGs.circle)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    // move + 4 cubics + close
    expect(segs.length).toBe(6)
    expect(segs[0]!.type).toBe('move')
    expect(segs[1]!.type).toBe('cubic')
    expect(segs[2]!.type).toBe('cubic')
    expect(segs[3]!.type).toBe('cubic')
    expect(segs[4]!.type).toBe('cubic')
    expect(segs[5]!.type).toBe('close')

    // First point should be at (cx+r, cy) = (80, 50)
    if (segs[0]!.type === 'move') {
      expect(segs[0]!.x).toBeCloseTo(80, 5) // 50+30
      expect(segs[0]!.y).toBeCloseTo(50, 5)
    }
  })

  test('polygon triangle has correct vertices', () => {
    const { doc } = roundTripSVG(simpleSVGs.polygon)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    expect(segs[0]).toEqual({ type: 'move', x: 50, y: 5 })
    expect(segs[1]).toEqual({ type: 'line', x: 95, y: 80 })
    expect(segs[2]).toEqual({ type: 'line', x: 5, y: 80 })
    expect(segs[3]).toEqual({ type: 'close' })
  })
})

/** Recursively collect all vector layers, including those nested in groups. */
function collectVectorLayers(layers: Layer[]): VectorLayer[] {
  const result: VectorLayer[] = []
  for (const l of layers) {
    if (l.type === 'vector') result.push(l)
    if (l.type === 'group') result.push(...collectVectorLayers(l.children))
  }
  return result
}

describe('SVG → export → import: double round-trip', () => {
  // Test a focused subset that doesn't involve structural changes (groups, transforms, opacity)
  const stableShapes = [
    'rectangle',
    'circle',
    'ellipse',
    'line',
    'polygon',
    'polyline',
    'path',
    'pathCubic',
    'pathQuadratic',
    'pathArc',
    'fillNone',
    'multiShape',
    'fillRule',
    'roundedRect',
    'strokeProps',
  ] as const

  for (const name of stableShapes) {
    test(`${name}: path data survives double round-trip`, () => {
      const doc1 = importSVG(simpleSVGs[name])
      const exported1 = exportArtboardToSVG(doc1)
      const doc2 = importSVG(exported1)

      const vecs1 = collectVectorLayers(doc1.artboards[0]!.layers)
      const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)

      for (const l1 of vecs1) {
        const d1 = segmentsToSVGPath(l1.paths[0]!.segments)
        const match = vecs2.find((l2) => segmentsToSVGPath(l2.paths[0]!.segments) === d1)
        expect(match).toBeDefined()
      }
    })
  }

  test('solid fill color survives double round-trip', () => {
    const doc1 = importSVG(simpleSVGs.rectangle)
    const exported1 = exportArtboardToSVG(doc1)
    const doc2 = importSVG(exported1)

    const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)
    const original = collectVectorLayers(doc1.artboards[0]!.layers)[0]!
    const d1 = segmentsToSVGPath(original.paths[0]!.segments)
    const match = vecs2.find((l2) => segmentsToSVGPath(l2.paths[0]!.segments) === d1)!
    expect(match.fill?.type).toBe('solid')
    if (match.fill?.type === 'solid') {
      expect(match.fill.color).toBe('#ff0000')
    }
  })

  test('stroke properties survive double round-trip', () => {
    const doc1 = importSVG(simpleSVGs.strokeProps)
    const exported1 = exportArtboardToSVG(doc1)
    const doc2 = importSVG(exported1)

    const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)
    const original = collectVectorLayers(doc1.artboards[0]!.layers)[0]!
    const d1 = segmentsToSVGPath(original.paths[0]!.segments)
    const match = vecs2.find((l2) => segmentsToSVGPath(l2.paths[0]!.segments) === d1)!
    expect(match.stroke).not.toBeNull()
    expect(match.stroke!.linecap).toBe('round')
    expect(match.stroke!.linejoin).toBe('round')
    expect(match.stroke!.dasharray).toEqual([10, 5])
  })
})

describe('SVG → .design → SVG: binary format round-trip', () => {
  for (const [name, svg] of Object.entries(simpleSVGs)) {
    if (name === 'text') continue // Text positions shift
    if (name === 'group') continue // Group flattening

    test(`${name}: import→encode→decode preserves document`, () => {
      const doc1 = importSVG(svg)
      const doc2 = roundTripDesign(doc1)

      expect(doc2.artboards.length).toBe(doc1.artboards.length)
      const a1 = doc1.artboards[0]!
      const a2 = doc2.artboards[0]!
      expect(a2.width).toBe(a1.width)
      expect(a2.height).toBe(a1.height)
      expect(a2.layers.length).toBe(a1.layers.length)

      for (let i = 0; i < a1.layers.length; i++) {
        const l1 = a1.layers[i]!
        const l2 = a2.layers[i]!
        expect(l2.type).toBe(l1.type)
        expect(l2.opacity).toBeCloseTo(l1.opacity, 10)

        if (l1.type === 'vector' && l2.type === 'vector') {
          const d1 = segmentsToSVGPath(l1.paths[0]!.segments)
          const d2 = segmentsToSVGPath(l2.paths[0]!.segments)
          expect(d2).toBe(d1)

          // Fill
          if (l1.fill === null) {
            expect(l2.fill).toBeNull()
          } else {
            expect(l2.fill?.type).toBe(l1.fill.type)
            if (l1.fill.type === 'solid' && l2.fill?.type === 'solid') {
              expect(l2.fill.color).toBe(l1.fill.color)
              expect(l2.fill.opacity).toBeCloseTo(l1.fill.opacity, 10)
            }
          }

          // Stroke
          if (l1.stroke === null) {
            expect(l2.stroke).toBeNull()
          } else {
            expect(l2.stroke).not.toBeNull()
            expect(l2.stroke!.color).toBe(l1.stroke.color)
            expect(l2.stroke!.width).toBeCloseTo(l1.stroke.width, 10)
            expect(l2.stroke!.linecap).toBe(l1.stroke.linecap)
            expect(l2.stroke!.linejoin).toBe(l1.stroke.linejoin)
            if (l1.stroke.dasharray) {
              expect(l2.stroke!.dasharray).toEqual(l1.stroke.dasharray)
            }
          }

          // Transform
          expect(l2.transform.x).toBeCloseTo(l1.transform.x, 10)
          expect(l2.transform.y).toBeCloseTo(l1.transform.y, 10)
          expect(l2.transform.scaleX).toBeCloseTo(l1.transform.scaleX, 10)
          expect(l2.transform.scaleY).toBeCloseTo(l1.transform.scaleY, 10)
          expect(l2.transform.rotation).toBeCloseTo(l1.transform.rotation, 10)
        }

        if (l1.type === 'text' && l2.type === 'text') {
          expect(l2.text).toBe(l1.text)
          expect(l2.fontFamily).toBe(l1.fontFamily)
          expect(l2.fontSize).toBe(l1.fontSize)
          expect(l2.fontWeight).toBe(l1.fontWeight)
          expect(l2.color).toBe(l1.color)
        }
      }
    })
  }

  test('full pipeline: SVG → .design → SVG exports same paths', () => {
    const svg = simpleSVGs.multiShape
    const doc1 = importSVG(svg)
    const doc2 = roundTripDesign(doc1)
    const exported1 = exportArtboardToSVG(doc1)
    const exported2 = exportArtboardToSVG(doc2)

    // Both exports should produce identical SVG
    expect(exported2).toBe(exported1)
  })
})

describe('SVG → .design → SVG: gradient round-trip', () => {
  test('linear gradient survives binary round-trip', () => {
    const doc1 = importSVG(simpleSVGs.linearGradient)
    const doc2 = roundTripDesign(doc1)
    const layer1 = doc1.artboards[0]!.layers[0] as VectorLayer
    const layer2 = doc2.artboards[0]!.layers[0] as VectorLayer

    expect(layer2.fill?.type).toBe('gradient')
    if (layer1.fill?.type === 'gradient' && layer2.fill?.type === 'gradient') {
      const g1 = layer1.fill.gradient!
      const g2 = layer2.fill.gradient!
      expect(g2.type).toBe(g1.type)
      expect(g2.stops.length).toBe(g1.stops.length)
      for (let i = 0; i < g1.stops.length; i++) {
        expect(g2.stops[i]!.offset).toBeCloseTo(g1.stops[i]!.offset, 10)
        expect(g2.stops[i]!.color).toBe(g1.stops[i]!.color)
      }
    }
  })

  test('radial gradient survives binary round-trip', () => {
    const doc1 = importSVG(simpleSVGs.radialGradient)
    const doc2 = roundTripDesign(doc1)
    const layer1 = doc1.artboards[0]!.layers[0] as VectorLayer
    const layer2 = doc2.artboards[0]!.layers[0] as VectorLayer

    expect(layer2.fill?.type).toBe('gradient')
    if (layer1.fill?.type === 'gradient' && layer2.fill?.type === 'gradient') {
      expect(layer2.fill.gradient!.type).toBe('radial')
      expect(layer2.fill.gradient!.stops.length).toBe(layer1.fill.gradient!.stops.length)
    }
  })
})

// ── Complex SVG Tests ─────────────────────────────────────────────────

describe('Complex SVG: path data round-trip', () => {
  for (const [name, svg] of Object.entries(complexSVGs)) {
    test(`${name}: segments survive import→export`, () => {
      const doc = importSVG(svg)
      const artboard = doc.artboards[0]!
      const vectors = collectVectorLayers(artboard.layers)

      for (const layer of vectors) {
        for (const path of layer.paths) {
          const d = segmentsToSVGPath(path.segments)
          const { parseSVGPathD } = require('@/io/svg-import')
          const reparsed = parseSVGPathD(d)
          expect(reparsed.length).toBe(path.segments.length)

          for (let i = 0; i < path.segments.length; i++) {
            const orig = path.segments[i]!
            const re = reparsed[i]!
            expect(re.type).toBe(orig.type)
            if ('x' in orig && 'x' in re) {
              expect(re.x).toBeCloseTo(orig.x, 5)
              expect(re.y).toBeCloseTo(orig.y, 5)
            }
            if (orig.type === 'cubic' && re.type === 'cubic') {
              expect(re.cp1x).toBeCloseTo(orig.cp1x, 5)
              expect(re.cp1y).toBeCloseTo(orig.cp1y, 5)
              expect(re.cp2x).toBeCloseTo(orig.cp2x, 5)
              expect(re.cp2y).toBeCloseTo(orig.cp2y, 5)
            }
            if (orig.type === 'quadratic' && re.type === 'quadratic') {
              expect(re.cpx).toBeCloseTo(orig.cpx, 5)
              expect(re.cpy).toBeCloseTo(orig.cpy, 5)
            }
            if (orig.type === 'arc' && re.type === 'arc') {
              expect(re.rx).toBeCloseTo(orig.rx, 5)
              expect(re.ry).toBeCloseTo(orig.ry, 5)
              expect(re.rotation).toBeCloseTo(orig.rotation, 5)
              expect(re.largeArc).toBe(orig.largeArc)
              expect(re.sweep).toBe(orig.sweep)
            }
          }
        }
      }
    })
  }
})

describe('Complex SVG: deeply nested groups', () => {
  test('preserves all layers through group hierarchy', () => {
    const doc = importSVG(complexSVGs.deeplyNestedGroups)
    const allVecs = collectVectorLayers(doc.artboards[0]!.layers)
    // 2 shapes in deepest group + 1 rect in third group + 1 ellipse in top group
    expect(allVecs.length).toBe(4)
  })

  test('nested groups survive .design binary round-trip', () => {
    const doc1 = importSVG(complexSVGs.deeplyNestedGroups)
    const doc2 = roundTripDesign(doc1)
    const svg1 = exportArtboardToSVG(doc1)
    const svg2 = exportArtboardToSVG(doc2)
    expect(svg2).toBe(svg1)
  })
})

describe('Complex SVG: all path commands', () => {
  test('allPathCommands: M L H V C S Q T A Z all produce segments', () => {
    const doc = importSVG(complexSVGs.allPathCommands)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    const types = segs.map((s) => s.type)

    expect(types).toContain('move')
    expect(types).toContain('line') // from L, H, V
    expect(types).toContain('cubic') // from C and S
    expect(types).toContain('quadratic') // from Q and T
    expect(types).toContain('arc')
    expect(types).toContain('close')
  })

  test('relativeCommands: relative versions produce same geometry as absolute', () => {
    const doc = importSVG(complexSVGs.relativeCommands)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    const types = segs.map((s) => s.type)

    expect(types).toContain('move')
    expect(types).toContain('line')
    expect(types).toContain('cubic')
    expect(types).toContain('quadratic')
    expect(types).toContain('arc')
    expect(types).toContain('close')

    // All coordinates should be absolute (resolved from relative)
    for (const seg of segs) {
      if ('x' in seg) {
        expect(typeof seg.x).toBe('number')
        expect(isNaN(seg.x)).toBe(false)
      }
    }
  })
})

describe('Complex SVG: compound paths with fill-rule', () => {
  test('compoundPath has 3 subpaths (3 close segments)', () => {
    const doc = importSVG(complexSVGs.compoundPath)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments
    const closeCount = segs.filter((s) => s.type === 'close').length
    expect(closeCount).toBe(3)
  })

  test('compoundPath preserves evenodd fill-rule', () => {
    const { exported } = roundTripSVG(complexSVGs.compoundPath)
    const svgDoc = parseSVGDOM(exported)
    const path = svgDoc.querySelector('path')!
    expect(path.getAttribute('fill-rule')).toBe('evenodd')
  })
})

describe('Complex SVG: many shapes', () => {
  test('manyShapesMixed: all 11 shapes imported', () => {
    const doc = importSVG(complexSVGs.manyShapesMixed)
    const layers = doc.artboards[0]!.layers
    const allVecs = collectVectorLayers(layers)
    // 9 vector shapes + 1 polyline + 1 path (Q...T) = 11 vector, 0 text
    expect(allVecs.length).toBe(11)
  })

  test('manyLayers: 100 rectangles imported and survive binary round-trip', () => {
    const doc = importSVG(complexSVGs.manyLayers)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    expect(vecs.length).toBe(100)

    const doc2 = roundTripDesign(doc)
    const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)
    expect(vecs2.length).toBe(100)

    // Verify path data matches
    for (let i = 0; i < vecs.length; i++) {
      const d1 = segmentsToSVGPath(vecs[i]!.paths[0]!.segments)
      const d2 = segmentsToSVGPath(vecs2[i]!.paths[0]!.segments)
      expect(d2).toBe(d1)
    }
  })
})

describe('Complex SVG: CSS class styling', () => {
  test('cssClassStyling: class-based fills applied correctly', () => {
    const doc = importSVG(complexSVGs.cssClassStyling)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // .primary rect → fill #e74c3c
    expect(vecs[0]!.fill?.type).toBe('solid')
    if (vecs[0]!.fill?.type === 'solid') expect(vecs[0]!.fill.color).toBe('#e74c3c')

    // .secondary circle → fill #3498db
    expect(vecs[1]!.fill?.type).toBe('solid')
    if (vecs[1]!.fill?.type === 'solid') expect(vecs[1]!.fill.color).toBe('#3498db')

    // .outline ellipse → fill none
    expect(vecs[2]!.fill).toBeNull()
    expect(vecs[2]!.stroke).not.toBeNull()
  })

  test('cssClassStyling: class-based strokes applied correctly', () => {
    const doc = importSVG(complexSVGs.cssClassStyling)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // .primary → stroke #c0392b, width 2
    expect(vecs[0]!.stroke!.color).toBe('#c0392b')
    expect(vecs[0]!.stroke!.width).toBe(2)

    // .outline → dasharray
    expect(vecs[2]!.stroke!.dasharray).toEqual([8, 4])
  })
})

describe('Complex SVG: inline style precedence', () => {
  test('inline style overrides presentation attributes', () => {
    const doc = importSVG(complexSVGs.inlineStylePrecedence)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First rect: fill="blue" but style="fill:#e74c3c" → should be #e74c3c
    expect(vecs[0]!.fill?.type).toBe('solid')
    if (vecs[0]!.fill?.type === 'solid') expect(vecs[0]!.fill.color).toBe('#e74c3c')

    // Second circle: fill="green" but style="fill:none" → no fill
    expect(vecs[1]!.fill).toBeNull()
    // stroke overridden from red to #3498db
    expect(vecs[1]!.stroke!.color).toBe('#3498db')
  })

  test('mixedStyling: inline > attr > class precedence', () => {
    const doc = importSVG(complexSVGs.mixedStyling)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // rect[1]: class="base" (fill:#e74c3c) + style="fill:#2ecc71" → #2ecc71 wins
    expect(vecs[1]!.fill?.type).toBe('solid')
    if (vecs[1]!.fill?.type === 'solid') expect(vecs[1]!.fill.color).toBe('#2ecc71')

    // rect[3]: class="alt" (fill:#3498db) + fill="#f39c12" + style has stroke → fill from attr=#f39c12?
    // Precedence: inline > attr > class. No fill in inline, so attr fill="#f39c12" wins over class
    // Actually getStyleAttr checks inline first, then attr, then class
    // rect has fill="#f39c12" as attr, class="alt" has fill:#3498db
    // attr wins over class
    if (vecs[3]!.fill?.type === 'solid') expect(vecs[3]!.fill.color).toBe('#f39c12')
  })
})

describe('Complex SVG: currentColor and inherited fill', () => {
  test('currentColor resolves to #000000 by default', () => {
    const doc = importSVG(complexSVGs.currentColorSvg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill?.type).toBe('solid')
    if (layer.fill?.type === 'solid') {
      expect(layer.fill.color).toBe('#000000')
    }
  })

  test('currentColor resolves to explicit color property', () => {
    const doc = importSVG(complexSVGs.currentColorWithColor)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill?.type).toBe('solid')
    if (layer.fill?.type === 'solid') {
      expect(layer.fill.color).toBe('#e74c3c')
    }
  })

  test('fill inherited from parent <g>', () => {
    const doc = importSVG(complexSVGs.inheritedFillFromGroup)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    // Both shapes should inherit fill="#e74c3c" from the group
    for (const v of vecs) {
      expect(v.fill?.type).toBe('solid')
      if (v.fill?.type === 'solid') {
        expect(v.fill.color).toBe('#e74c3c')
      }
    }
  })

  test('inherited stroke from group, child override works', () => {
    const doc = importSVG(complexSVGs.inheritedStrokeOverride)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    // First rect inherits stroke="#e74c3c" width=3
    expect(vecs[0]!.stroke!.color).toBe('#e74c3c')
    expect(vecs[0]!.stroke!.width).toBe(3)
    // Second rect overrides to stroke="#3498db" width=1
    expect(vecs[1]!.stroke!.color).toBe('#3498db')
    expect(vecs[1]!.stroke!.width).toBe(1)
  })

  test('fill inherited through deeply nested groups', () => {
    const doc = importSVG(complexSVGs.deepInheritedFill)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    // First rect inherits fill="#9b59b6" from <svg>
    expect(vecs[0]!.fill?.type).toBe('solid')
    if (vecs[0]!.fill?.type === 'solid') {
      expect(vecs[0]!.fill.color).toBe('#9b59b6')
    }
    // Second rect has explicit fill="#2ecc71"
    expect(vecs[1]!.fill?.type).toBe('solid')
    if (vecs[1]!.fill?.type === 'solid') {
      expect(vecs[1]!.fill.color).toBe('#2ecc71')
    }
  })

  test('gamepad.svg: currentColor fill produces visible black path', () => {
    const fs = require('fs')
    const svg = fs.readFileSync('/raid/lyku/apps/webui/src/assets/platforms/gamepad.svg', 'utf-8')
    const doc = importSVG(svg)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    expect(layer.fill).not.toBeNull()
    expect(layer.fill?.type).toBe('solid')
    if (layer.fill?.type === 'solid') {
      expect(layer.fill.color).toBe('#000000')
    }

    // Re-export should have fill="#000000", not "currentColor"
    const exported = exportArtboardToSVG(doc)
    expect(exported).not.toContain('currentColor')
    expect(exported).toContain('fill="#000000"')
  })

  test('ios.svg: group scale preserved on import and export', () => {
    const fs = require('fs')
    const svg = fs.readFileSync('/raid/lyku/apps/webui/src/assets/platforms/ios.svg', 'utf-8')
    const doc = importSVG(svg)
    const layers = doc.artboards[0]!.layers

    // First layer is the tablet frame path
    expect(layers[0]!.type).toBe('vector')
    const frameFill = (layers[0] as VectorLayer).fill
    expect(frameFill?.type).toBe('solid')
    if (frameFill?.type === 'solid') expect(frameFill.color).toBe('#000000')

    // Second layer is the Apple logo group with matrix scale ~0.472
    const logoGroup = layers[1]!
    expect(logoGroup.type).toBe('group')
    expect(logoGroup.transform.scaleX).toBeCloseTo(0.472063, 3)
    expect(logoGroup.transform.scaleY).toBeCloseTo(0.472063, 3)
    expect(logoGroup.transform.x).toBeCloseTo(68.274, 1)
    expect(logoGroup.transform.y).toBeCloseTo(135.116, 1)

    // Group children (2 inner groups with Apple paths) should have fills
    if (logoGroup.type === 'group') {
      const innerVecs = collectVectorLayers(logoGroup.children)
      expect(innerVecs.length).toBe(2)
      for (const v of innerVecs) {
        expect(v.fill?.type).toBe('solid')
        if (v.fill?.type === 'solid') expect(v.fill.color).toBe('#000000')
      }
    }

    // Export should include the group with scale transform
    const exported = exportArtboardToSVG(doc)
    expect(exported).toContain('scale(0.472063 0.472063)')
    // Should have 3 paths total (frame + 2 apple logo parts)
    const pathCount = (exported.match(/<path /g) || []).length
    expect(pathCount).toBe(3)

    // Double round-trip: export→reimport should preserve all 3 paths
    const doc2 = importSVG(exported)
    const allVecs2 = collectVectorLayers(doc2.artboards[0]!.layers)
    // 3 original + 1 background rect = at least 3 vectors
    expect(allVecs2.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Complex SVG: multiple gradients', () => {
  test('multipleGradients: all gradient fills imported', () => {
    const doc = importSVG(complexSVGs.multipleGradients)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // rect with sunset, circle with glow, rounded rect with steel, ellipse with sunset
    const gradientLayers = vecs.filter((v) => v.fill?.type === 'gradient')
    expect(gradientLayers.length).toBe(4)
  })

  test('multipleGradients: 3-stop sunset gradient preserved', () => {
    const doc = importSVG(complexSVGs.multipleGradients)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    const sunsetLayer = vecs[0]!
    expect(sunsetLayer.fill?.type).toBe('gradient')
    if (sunsetLayer.fill?.type === 'gradient') {
      const stops = sunsetLayer.fill.gradient!.stops
      expect(stops.length).toBe(3)
      expect(stops[0]!.offset).toBeCloseTo(0, 5)
      expect(stops[0]!.color).toBe('#e74c3c')
      expect(stops[1]!.offset).toBeCloseTo(0.5, 5)
      expect(stops[1]!.color).toBe('#f39c12')
      expect(stops[2]!.offset).toBeCloseTo(1, 5)
      expect(stops[2]!.color).toBe('#f1c40f')
    }
  })

  test('gradientWithOpacity: stop-opacity values preserved', () => {
    const doc = importSVG(complexSVGs.gradientWithOpacity)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // Spotlight radial gradient has 4 stops with different opacities
    const spotlightLayer = vecs[1]!
    expect(spotlightLayer.fill?.type).toBe('gradient')
    if (spotlightLayer.fill?.type === 'gradient') {
      const stops = spotlightLayer.fill.gradient!.stops
      expect(stops.length).toBe(4)
      expect(stops[0]!.opacity).toBeCloseTo(0.9, 5)
      expect(stops[1]!.opacity).toBeCloseTo(0.6, 5)
      expect(stops[2]!.opacity).toBeCloseTo(0.3, 5)
      expect(stops[3]!.opacity).toBeCloseTo(0, 5)
    }
  })
})

describe('Complex SVG: chained transforms', () => {
  test('chainedTransforms: translate+rotate+scale decomposed correctly', () => {
    const doc = importSVG(complexSVGs.chainedTransforms)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First rect: translate(100 100) rotate(45) scale(1.5)
    const t1 = vecs[0]!.transform
    expect(t1.x).toBeCloseTo(100, 0)
    expect(t1.y).toBeCloseTo(100, 0)
    expect(t1.rotation).toBeCloseTo(45, 0)
    expect(t1.scaleX).toBeCloseTo(1.5, 1)
    expect(t1.scaleY).toBeCloseTo(1.5, 1)
  })

  test('rotateCenterPoint: rotate(45 100 100) applied correctly', () => {
    const doc = importSVG(complexSVGs.rotateCenterPoint)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First rect: rotate(45 100 100) — rotation around center of the rect
    const t = vecs[0]!.transform
    expect(t.rotation).toBeCloseTo(45, 1)
    // Translation from center-point rotation:
    // tx = cx*(1-cos) + cy*sin = 100*(1-cos45) + 100*sin45
    const cos45 = Math.cos(Math.PI / 4)
    const sin45 = Math.sin(Math.PI / 4)
    expect(t.x).toBeCloseTo(100 * (1 - cos45) + 100 * sin45, 0)
    expect(t.y).toBeCloseTo(100 * (1 - cos45) - 100 * sin45, 0)
  })
})

describe('Complex SVG: smooth curves', () => {
  test('smoothCubicChain: S commands generate correct reflected control points', () => {
    const doc = importSVG(complexSVGs.smoothCubicChain)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments

    // M + C + S + S + S + S = move + 5 cubics
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBe(5)

    // Each S command's cp1 should be reflection of previous cp2
    // First C: cp2 is (80, 30), endpoint (110, 100)
    // First S: cp1 = 2*110 - 80, 2*100 - 30 = (140, 170)
    if (cubics[1]!.type === 'cubic') {
      expect(cubics[1]!.cp1x).toBeCloseTo(140, 1)
      expect(cubics[1]!.cp1y).toBeCloseTo(170, 1)
    }
  })

  test('smoothQuadraticChain: T commands chain smoothly', () => {
    const doc = importSVG(complexSVGs.smoothQuadraticChain)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments

    // M + Q + T + T + T + T = move + 5 quadratics
    const quads = segs.filter((s) => s.type === 'quadratic')
    expect(quads.length).toBe(5)

    // Each T reflects the previous cp
    // Q: cp=(60,30), endpoint (110,100)
    // First T: cp = 2*110-60, 2*100-30 = (160, 170)
    if (quads[1]!.type === 'quadratic') {
      expect(quads[1]!.cpx).toBeCloseTo(160, 1)
      expect(quads[1]!.cpy).toBeCloseTo(170, 1)
    }
  })
})

describe('Complex SVG: arc variations', () => {
  test('arcVariations: all 4 large-arc/sweep combinations imported', () => {
    const doc = importSVG(complexSVGs.arcVariations)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)
    expect(vecs.length).toBe(6)

    // Check first 4 arcs have the correct flag combinations
    const getArcFlags = (v: VectorLayer) => {
      const arc = v.paths[0]!.segments.find((s) => s.type === 'arc')
      if (arc?.type === 'arc') return { largeArc: arc.largeArc, sweep: arc.sweep }
      return null
    }

    expect(getArcFlags(vecs[0]!)).toEqual({ largeArc: false, sweep: false })
    expect(getArcFlags(vecs[1]!)).toEqual({ largeArc: true, sweep: false })
    expect(getArcFlags(vecs[2]!)).toEqual({ largeArc: false, sweep: true })
    expect(getArcFlags(vecs[3]!)).toEqual({ largeArc: true, sweep: true })
  })

  test('ellipticalArcs: non-equal rx/ry and rotation preserved', () => {
    const doc = importSVG(complexSVGs.ellipticalArcs)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First arc: A80 40 0 → rx=80, ry=40, rotation=0
    const arc1 = vecs[0]!.paths[0]!.segments.find((s) => s.type === 'arc')
    if (arc1?.type === 'arc') {
      expect(arc1.rx).toBeCloseTo(80, 5)
      expect(arc1.ry).toBeCloseTo(40, 5)
      expect(arc1.rotation).toBeCloseTo(0, 5)
    }

    // Second arc: A80 40 45 → rotation=45
    const arc2 = vecs[1]!.paths[0]!.segments.find((s) => s.type === 'arc')
    if (arc2?.type === 'arc') {
      expect(arc2.rotation).toBeCloseTo(45, 5)
    }

    // Third arc: A80 40 -45 → rotation=-45
    const arc3 = vecs[2]!.paths[0]!.segments.find((s) => s.type === 'arc')
    if (arc3?.type === 'arc') {
      expect(arc3.rotation).toBeCloseTo(-45, 5)
    }

    // Fourth: A30 60 30 → rx≠ry, rotation=30
    const arc4 = vecs[3]!.paths[0]!.segments.find((s) => s.type === 'arc')
    if (arc4?.type === 'arc') {
      expect(arc4.rx).toBeCloseTo(30, 5)
      expect(arc4.ry).toBeCloseTo(60, 5)
      expect(arc4.rotation).toBeCloseTo(30, 5)
    }
  })
})

describe('Complex SVG: implicit repeated commands', () => {
  test('multiple coords after L create multiple line segments', () => {
    const doc = importSVG(complexSVGs.implicitRepeats)
    const layer0 = collectVectorLayers(doc.artboards[0]!.layers)[0]!
    const segs = layer0.paths[0]!.segments
    // M10,10 L50,10 90,50 90,90 50,90 10,50 Z → move + 5 lines + close
    expect(segs[0]).toEqual({ type: 'move', x: 10, y: 10 })
    expect(segs.filter((s) => s.type === 'line').length).toBe(5)
    expect(segs[segs.length - 1]!.type).toBe('close')
  })

  test('multiple coords after C create multiple cubic segments', () => {
    const doc = importSVG(complexSVGs.implicitRepeats)
    const layer1 = collectVectorLayers(doc.artboards[0]!.layers)[1]!
    const cubics = layer1.paths[0]!.segments.filter((s) => s.type === 'cubic')
    // 4 sets of 6 coords = 4 cubic segments
    expect(cubics.length).toBe(4)
  })

  test('relative implicit repeats resolve correctly', () => {
    const doc = importSVG(complexSVGs.implicitRepeats)
    const layer2 = collectVectorLayers(doc.artboards[0]!.layers)[2]!
    const segs = layer2.paths[0]!.segments
    // m10,150 l40,0 40,40 0,40 -40,0 -40,-40 z
    // resolved: M10,150 → L50,150 → L90,190 → L90,230 → L50,230 → L10,190
    expect(segs[0]).toEqual({ type: 'move', x: 10, y: 150 })
    if (segs[1]!.type === 'line') {
      expect(segs[1]!.x).toBeCloseTo(50, 5)
      expect(segs[1]!.y).toBeCloseTo(150, 5)
    }
    if (segs[2]!.type === 'line') {
      expect(segs[2]!.x).toBeCloseTo(90, 5)
      expect(segs[2]!.y).toBeCloseTo(190, 5)
    }
  })
})

describe('Complex SVG: scientific notation', () => {
  test('coordinates with scientific notation parsed correctly', () => {
    const doc = importSVG(complexSVGs.scientificNotation)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // 1e1 = 10, 1.9e2 = 190 → rect from (10,10) to (190,190)
    const rectSegs = vecs[0]!.paths[0]!.segments
    expect(rectSegs[0]).toEqual({ type: 'move', x: 10, y: 10 })
    if (rectSegs[1]!.type === 'line') {
      expect(rectSegs[1]!.x).toBeCloseTo(190, 5)
      expect(rectSegs[1]!.y).toBeCloseTo(10, 5)
    }

    // Circle: cx=100, cy=100, r=30
    const circleSegs = vecs[1]!.paths[0]!.segments
    if (circleSegs[0]!.type === 'move') {
      expect(circleSegs[0]!.x).toBeCloseTo(130, 5) // cx+r = 100+30
      expect(circleSegs[0]!.y).toBeCloseTo(100, 5)
    }
  })
})

describe('Complex SVG: negative coordinates and viewBox', () => {
  test('negativeCoords: negative coordinates preserved', () => {
    const doc = importSVG(complexSVGs.negativeCoords)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First rect at (-100, -100)
    const rectSegs = vecs[0]!.paths[0]!.segments
    expect(rectSegs[0]).toEqual({ type: 'move', x: -100, y: -100 })
  })

  test('viewBoxScaling: viewBox dimensions used for artboard', () => {
    const doc = importSVG(complexSVGs.viewBoxScaling)
    expect(doc.artboards[0]!.width).toBe(1600)
    expect(doc.artboards[0]!.height).toBe(1200)
  })
})

describe('Complex SVG: stroke variations', () => {
  test('all linecap values preserved', () => {
    const doc = importSVG(complexSVGs.strokeVariations)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    expect(vecs[0]!.stroke!.linecap).toBe('butt')
    expect(vecs[1]!.stroke!.linecap).toBe('round')
    expect(vecs[2]!.stroke!.linecap).toBe('square')
  })

  test('all linejoin values preserved', () => {
    const doc = importSVG(complexSVGs.strokeVariations)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    expect(vecs[0]!.stroke!.linejoin).toBe('miter')
    expect(vecs[1]!.stroke!.linejoin).toBe('round')
    expect(vecs[2]!.stroke!.linejoin).toBe('bevel')
  })

  test('complex dasharray patterns preserved', () => {
    const doc = importSVG(complexSVGs.strokeVariations)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // "20 10 5 10"
    expect(vecs[3]!.stroke!.dasharray).toEqual([20, 10, 5, 10])
    // "1 5"
    expect(vecs[4]!.stroke!.dasharray).toEqual([1, 5])
  })
})

describe('Complex SVG: mixed text and shapes', () => {
  test('mixedTextShapes: text and vector layers coexist', () => {
    const doc = importSVG(complexSVGs.mixedTextShapes)
    const layers = doc.artboards[0]!.layers
    const texts = layers.filter((l) => l.type === 'text') as TextLayer[]
    const vecs = collectVectorLayers(layers)

    expect(texts.length).toBe(4)
    expect(vecs.length).toBeGreaterThanOrEqual(4)

    // Check text content
    expect(texts[0]!.text).toBe('Dashboard')
    expect(texts[0]!.fontWeight).toBe('bold')
    expect(texts[0]!.fontSize).toBe(28)

    expect(texts[3]!.fontStyle).toBe('italic')
  })
})

describe('Complex SVG: degenerate paths', () => {
  test('zero-length line segments preserved', () => {
    const doc = importSVG(complexSVGs.degeneratePath)
    const vecs = collectVectorLayers(doc.artboards[0]!.layers)

    // First path has a zero-length L50,50 → L50,50
    const segs = vecs[0]!.paths[0]!.segments
    expect(segs[0]).toEqual({ type: 'move', x: 50, y: 50 })
    expect(segs[1]).toEqual({ type: 'line', x: 50, y: 50 }) // degenerate
    expect(segs[2]).toEqual({ type: 'line', x: 100, y: 50 })
  })
})

describe('Complex SVG: mixed absolute/relative', () => {
  test('mixed abs/rel coordinates resolve correctly', () => {
    const doc = importSVG(complexSVGs.mixedAbsoluteRelative)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments

    // M10 150 (abs) → L50 50 (abs) → l40 100 (rel: 50+40=90, 50+100=150) → L130 50 (abs)
    expect(segs[0]).toEqual({ type: 'move', x: 10, y: 150 })
    expect(segs[1]).toEqual({ type: 'line', x: 50, y: 50 })
    if (segs[2]!.type === 'line') {
      expect(segs[2]!.x).toBeCloseTo(90, 5)
      expect(segs[2]!.y).toBeCloseTo(150, 5)
    }
    expect(segs[3]).toEqual({ type: 'line', x: 130, y: 50 })
    // l40 100 → 130+40=170, 50+100=150
    if (segs[4]!.type === 'line') {
      expect(segs[4]!.x).toBeCloseTo(170, 5)
      expect(segs[4]!.y).toBeCloseTo(150, 5)
    }
  })
})

describe('Complex SVG: nested opacity', () => {
  test('opacity values at each group level preserved', () => {
    const doc = importSVG(complexSVGs.nestedOpacity)
    const topGroup = doc.artboards[0]!.layers[0]!
    expect(topGroup.type).toBe('group')
    expect(topGroup.opacity).toBeCloseTo(0.8, 5)

    if (topGroup.type === 'group') {
      // Inner group with opacity 0.6
      const innerGroup = topGroup.children.find((l) => l.type === 'group')!
      expect(innerGroup.opacity).toBeCloseTo(0.6, 5)

      if (innerGroup.type === 'group') {
        // Deepest group with opacity 0.4
        const deepGroup = innerGroup.children.find((l) => l.type === 'group')!
        expect(deepGroup.opacity).toBeCloseTo(0.4, 5)
      }
    }
  })
})

describe('Complex SVG: multiple subpaths Z M', () => {
  test('4 separate squares from Z M transitions', () => {
    const doc = importSVG(complexSVGs.multipleSubpathsZM)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments

    const moveCount = segs.filter((s) => s.type === 'move').length
    const closeCount = segs.filter((s) => s.type === 'close').length
    expect(moveCount).toBe(4) // 4 subpaths
    expect(closeCount).toBe(4) // each closed

    // Verify square positions
    const moves = segs.filter((s) => s.type === 'move') as Array<{ type: 'move'; x: number; y: number }>
    expect(moves[0]).toEqual({ type: 'move', x: 50, y: 50 })
    expect(moves[1]).toEqual({ type: 'move', x: 150, y: 50 })
    expect(moves[2]).toEqual({ type: 'move', x: 50, y: 150 })
    expect(moves[3]).toEqual({ type: 'move', x: 150, y: 150 })
  })
})

describe('Complex SVG: complex icon (many decimal cubics)', () => {
  test('complexIcon: cubic path with decimal coords parsed correctly', () => {
    const doc = importSVG(complexSVGs.complexIcon)
    const layer = doc.artboards[0]!.layers[0] as VectorLayer
    const segs = layer.paths[0]!.segments

    expect(segs.length).toBeGreaterThan(3)
    // Should contain cubics from the C commands
    const cubics = segs.filter((s) => s.type === 'cubic')
    expect(cubics.length).toBeGreaterThanOrEqual(2)

    // Verify fill=none
    expect(layer.fill).toBeNull()
    // Verify stroke
    expect(layer.stroke!.color).toBe('#2c3e50')
    expect(layer.stroke!.width).toBe(2)
    expect(layer.stroke!.linecap).toBe('round')
    expect(layer.stroke!.linejoin).toBe('round')
  })

  test('complexIcon: viewBox 0 0 24 24 sets artboard to 24x24', () => {
    const doc = importSVG(complexSVGs.complexIcon)
    expect(doc.artboards[0]!.width).toBe(24)
    expect(doc.artboards[0]!.height).toBe(24)
  })
})

describe('Complex SVG: double round-trip stability', () => {
  const stableComplex = [
    'allPathCommands',
    'relativeCommands',
    'compoundPath',
    'complexStar',
    'bezierFlower',
    'arcVariations',
    'smoothCubicChain',
    'smoothQuadraticChain',
    'implicitRepeats',
    'degeneratePath',
    'mixedAbsoluteRelative',
    'multipleSubpathsZM',
    'complexIcon',
    'ellipticalArcs',
    'strokeVariations',
  ] as const

  for (const name of stableComplex) {
    test(`${name}: double round-trip preserves paths`, () => {
      const doc1 = importSVG(complexSVGs[name])
      const exported1 = exportArtboardToSVG(doc1)
      const doc2 = importSVG(exported1)

      const vecs1 = collectVectorLayers(doc1.artboards[0]!.layers)
      const vecs2 = collectVectorLayers(doc2.artboards[0]!.layers)

      for (const l1 of vecs1) {
        const d1 = segmentsToSVGPath(l1.paths[0]!.segments)
        const match = vecs2.find((l2) => segmentsToSVGPath(l2.paths[0]!.segments) === d1)
        expect(match).toBeDefined()
      }
    })
  }
})

describe('Complex SVG: .design binary round-trip', () => {
  for (const [name, svg] of Object.entries(complexSVGs)) {
    test(`${name}: import→encode→decode→export matches`, () => {
      const doc1 = importSVG(svg)
      const doc2 = roundTripDesign(doc1)
      const svg1 = exportArtboardToSVG(doc1)
      const svg2 = exportArtboardToSVG(doc2)
      expect(svg2).toBe(svg1)
    })
  }
})

describe('coswall.svg full round-trip', () => {
  const coswallSVG = require('fs').readFileSync('/raid/lyku/apps/webui/src/assets/platforms/coswall.svg', 'utf-8')

  test('import→export→import preserves all shapes', () => {
    const doc1 = importSVG(coswallSVG)
    const exported = exportArtboardToSVG(doc1)
    const doc2 = importSVG(exported)

    const vectors1 = collectVectorLayers(doc1.artboards[0]!.layers)
    const vectors2 = collectVectorLayers(doc2.artboards[0]!.layers)

    // Should have at least as many vector layers after round-trip
    // (background rect may add one extra)
    expect(vectors2.length).toBeGreaterThanOrEqual(vectors1.length)

    // Each original layer should have a corresponding layer with
    // matching fill color and approximate position (within 1px).
    // Circles/ellipses get exported as bezier curves so path data
    // won't match exactly, but fill + position should.
    for (const l1 of vectors1) {
      const fill1 = l1.fill
      if (!fill1 || fill1.type !== 'solid') continue
      const match = vectors2.find((l2) => {
        const fill2 = l2.fill
        if (!fill2 || fill2.type !== 'solid') return false
        const colorMatch = fill1.color === fill2.color
        const posMatch = Math.abs(l1.transform.x - l2.transform.x) < 2 && Math.abs(l1.transform.y - l2.transform.y) < 2
        return colorMatch && posMatch
      })
      expect(match).toBeDefined()
    }
  })

  test('import→encode→decode→export matches direct export', () => {
    const doc1 = importSVG(coswallSVG)
    const doc2 = roundTripDesign(doc1)
    const svg1 = exportArtboardToSVG(doc1)
    const svg2 = exportArtboardToSVG(doc2)
    expect(svg2).toBe(svg1)
  })
})
