import type { Segment } from '@/types'

/** Convert Segment[] to an SVG path `d` string. */
export function segmentsToSVGPath(segments: Segment[]): string {
  const parts: string[] = []
  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        parts.push(`M${seg.x} ${seg.y}`)
        break
      case 'line':
        parts.push(`L${seg.x} ${seg.y}`)
        break
      case 'cubic':
        parts.push(
          `C${seg.cp1x} ${seg.cp1y} ${seg.cp2x} ${seg.cp2y} ${seg.x} ${seg.y}`,
        )
        break
      case 'quadratic':
        parts.push(`Q${seg.cpx} ${seg.cpy} ${seg.x} ${seg.y}`)
        break
      case 'arc':
        parts.push(
          `A${seg.rx} ${seg.ry} ${seg.rotation} ${seg.largeArc ? 1 : 0} ${seg.sweep ? 1 : 0} ${seg.x} ${seg.y}`,
        )
        break
      case 'close':
        parts.push('Z')
        break
    }
  }
  return parts.join(' ')
}

/** Convert Segment[] to a Canvas Path2D object. */
export function segmentsToPath2D(segments: Segment[]): Path2D {
  const path = new Path2D()
  for (const seg of segments) {
    switch (seg.type) {
      case 'move':
        path.moveTo(seg.x, seg.y)
        break
      case 'line':
        path.lineTo(seg.x, seg.y)
        break
      case 'cubic':
        path.bezierCurveTo(seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y)
        break
      case 'quadratic':
        path.quadraticCurveTo(seg.cpx, seg.cpy, seg.x, seg.y)
        break
      case 'arc':
        // Path2D doesn't have a direct SVG arc command, use the SVG path string
        path.addPath(
          new Path2D(
            `M0 0 A${seg.rx} ${seg.ry} ${seg.rotation} ${seg.largeArc ? 1 : 0} ${seg.sweep ? 1 : 0} ${seg.x} ${seg.y}`,
          ),
        )
        break
      case 'close':
        path.closePath()
        break
    }
  }
  return path
}
