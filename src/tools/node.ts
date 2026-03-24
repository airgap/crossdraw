import { useEditorStore } from '@/store/editor.store'
import { snapPoint } from '@/tools/snap'
import type { Segment, VectorLayer, Path } from '@/types'

/**
 * Node tool state — tracks which path points are selected,
 * what's being dragged, etc.
 */

export interface NodeState {
  /** IDs of selected nodes as `${pathId}:${segmentIndex}` */
  selectedNodes: Set<string>
  /** Currently dragging? */
  dragging: boolean
  /** Drag start position in document space */
  dragStart: { x: number; y: number } | null
  /** Whether we're dragging a control handle vs an anchor */
  draggingHandle: { pathId: string; segIndex: number; handle: 'cp1' | 'cp2' | 'cp' } | null
  /** Whether we're bending a segment edge by dragging */
  bendingSegment: { pathId: string; segIndex: number } | null
  /** The layer being edited */
  layerId: string | null
  artboardId: string | null
}

const state: NodeState = {
  selectedNodes: new Set(),
  dragging: false,
  dragStart: null,
  draggingHandle: null,
  bendingSegment: null,
  layerId: null,
  artboardId: null,
}

/** Cursor position in document space for proximity-based node sizing */
let nodeCursorDocPos: { x: number; y: number } | null = null

export function setNodeCursorPos(docX: number, docY: number) {
  nodeCursorDocPos = { x: docX, y: docY }
}

export function getNodeCursorPos(): { x: number; y: number } | null {
  return nodeCursorDocPos
}

export function getNodeState(): NodeState {
  return state
}

export function clearNodeSelection() {
  state.selectedNodes.clear()
  state.dragging = false
  state.dragStart = null
  state.draggingHandle = null
  state.bendingSegment = null
  state.layerId = null
  state.artboardId = null
}

/** Get the selected VectorLayer for node editing, if any. */
function getEditingLayer(): { layer: VectorLayer; artboardId: string } | null {
  const store = useEditorStore.getState()
  const sel = store.selection.layerIds
  if (sel.length !== 1) return null

  for (const artboard of store.document.artboards) {
    const layer = artboard.layers.find((l) => l.id === sel[0])
    if (layer && layer.type === 'vector') {
      return { layer, artboardId: artboard.id }
    }
  }
  return null
}

/** Node key: pathId:segIndex */
function nodeKey(pathId: string, segIndex: number): string {
  return `${pathId}:${segIndex}`
}

/** Parse a node key back to pathId and segIndex. */
function parseNodeKey(key: string): { pathId: string; segIndex: number } {
  const lastColon = key.lastIndexOf(':')
  return {
    pathId: key.slice(0, lastColon),
    segIndex: parseInt(key.slice(lastColon + 1), 10),
  }
}

/** Get anchor position for a segment. */
function getAnchorPos(seg: Segment): { x: number; y: number } | null {
  if (seg.type === 'close') return null
  return { x: seg.x, y: seg.y }
}

/** Distance between two points. */
function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

/**
 * Given a raw drag delta, constrain it to the nearest guide direction.
 * Guide directions include global H/V axes plus the tangent and normal
 * of each neighbor connected to the selected node(s).
 */
function constrainToGuides(
  dx: number,
  dy: number,
  layer: VectorLayer,
  selectedNodes: Set<string>,
): { dx: number; dy: number } {
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return { dx: 0, dy: 0 }

  // Collect unit direction vectors for all constraint axes
  const dirs: Array<{ nx: number; ny: number }> = [
    { nx: 1, ny: 0 }, // global horizontal
    { nx: 0, ny: 1 }, // global vertical
  ]

  // For each selected node, find tangent directions from connected neighbors
  for (const key of selectedNodes) {
    const { pathId, segIndex } = parseNodeKey(key)
    const path = layer.paths.find((p) => p.id === pathId)
    if (!path) continue
    const seg = path.segments[segIndex]
    if (!seg || seg.type === 'close') continue

    const anchor = { x: seg.x, y: seg.y }

    // Previous neighbor: the segment before this one defines a direction into this node
    if (segIndex > 0) {
      const prev = path.segments[segIndex - 1]!
      if (prev.type !== 'close') {
        // Direction from prev anchor to this anchor
        const tdx = anchor.x - prev.x
        const tdy = anchor.y - prev.y
        const tl = Math.sqrt(tdx * tdx + tdy * tdy)
        if (tl > 0.001) {
          const nx = tdx / tl
          const ny = tdy / tl
          dirs.push({ nx, ny }) // tangent
          dirs.push({ nx: -ny, ny: nx }) // normal
        }
      }
    }

    // Next neighbor: the segment after this one defines a direction out of this node
    if (segIndex + 1 < path.segments.length) {
      const next = path.segments[segIndex + 1]!
      if (next.type !== 'close' && next.type !== 'move') {
        const tdx = next.x - anchor.x
        const tdy = next.y - anchor.y
        const tl = Math.sqrt(tdx * tdx + tdy * tdy)
        if (tl > 0.001) {
          const nx = tdx / tl
          const ny = tdy / tl
          dirs.push({ nx, ny }) // tangent
          dirs.push({ nx: -ny, ny: nx }) // normal
        }
      }
    }

    // If this segment has control handles, use those for tangent direction
    if (seg.type === 'cubic') {
      // Outgoing handle direction (cp2 → anchor, mirrored = anchor → opposite of cp2)
      const hx = seg.cp2x - anchor.x
      const hy = seg.cp2y - anchor.y
      const hl = Math.sqrt(hx * hx + hy * hy)
      if (hl > 0.001) {
        const nx = hx / hl
        const ny = hy / hl
        dirs.push({ nx, ny })
        dirs.push({ nx: -ny, ny: nx })
      }
    }
    // Next segment's cp1 is the outgoing handle from this node
    if (segIndex + 1 < path.segments.length) {
      const next = path.segments[segIndex + 1]!
      if (next.type === 'cubic') {
        const hx = next.cp1x - anchor.x
        const hy = next.cp1y - anchor.y
        const hl = Math.sqrt(hx * hx + hy * hy)
        if (hl > 0.001) {
          const nx = hx / hl
          const ny = hy / hl
          dirs.push({ nx, ny })
          dirs.push({ nx: -ny, ny: nx })
        }
      }
    }
  }

  // Project dx,dy onto each direction and pick the one with smallest angular error
  let bestProj = { dx: 0, dy: 0 }
  let bestDot = -Infinity

  for (const { nx, ny } of dirs) {
    // Project: dot product gives signed length along direction
    const dot = dx * nx + dy * ny
    // Absolute projection alignment (how well the drag matches this direction)
    const absDot = Math.abs(dot)
    if (absDot > bestDot) {
      bestDot = absDot
      bestProj = { dx: dot * nx, dy: dot * ny }
    }
  }

  return bestProj
}

/**
 * Hit test: find the nearest anchor point within threshold.
 * Returns the path id and segment index.
 */
export function hitTestNode(
  docX: number,
  docY: number,
  layer: VectorLayer,
  artboardX: number,
  artboardY: number,
  zoom: number,
): { pathId: string; segIndex: number } | null {
  const threshold = 8 / zoom
  const lx = docX - artboardX - layer.transform.x
  const ly = docY - artboardY - layer.transform.y
  let bestDist = threshold
  let best: { pathId: string; segIndex: number } | null = null

  for (const path of layer.paths) {
    for (let i = 0; i < path.segments.length; i++) {
      const seg = path.segments[i]!
      const pos = getAnchorPos(seg)
      if (!pos) continue
      const d = dist(lx, ly, pos.x, pos.y)
      if (d < bestDist) {
        bestDist = d
        best = { pathId: path.id, segIndex: i }
      }
    }
  }
  return best
}

/**
 * Hit test control handles on selected nodes.
 */
export function hitTestHandle(
  docX: number,
  docY: number,
  layer: VectorLayer,
  artboardX: number,
  artboardY: number,
  zoom: number,
): { pathId: string; segIndex: number; handle: 'cp1' | 'cp2' | 'cp' } | null {
  const threshold = 8 / zoom
  const lx = docX - artboardX - layer.transform.x
  const ly = docY - artboardY - layer.transform.y

  for (const key of state.selectedNodes) {
    const { pathId, segIndex } = parseNodeKey(key)
    const path = layer.paths.find((p) => p.id === pathId)
    if (!path) continue
    const seg = path.segments[segIndex]
    if (!seg) continue

    if (seg.type === 'cubic') {
      if (dist(lx, ly, seg.cp1x, seg.cp1y) < threshold) {
        return { pathId, segIndex, handle: 'cp1' }
      }
      if (dist(lx, ly, seg.cp2x, seg.cp2y) < threshold) {
        return { pathId, segIndex, handle: 'cp2' }
      }
    } else if (seg.type === 'quadratic') {
      if (dist(lx, ly, seg.cpx, seg.cpy) < threshold) {
        return { pathId, segIndex, handle: 'cp' }
      }
    }
  }
  return null
}

/**
 * Handle mousedown for node tool.
 */
export function nodeMouseDown(docX: number, docY: number, zoom: number, shiftKey: boolean) {
  const info = getEditingLayer()
  if (!info) return

  const { layer, artboardId } = info
  const artboard = useEditorStore.getState().document.artboards.find((a) => a.id === artboardId)
  if (!artboard) return

  state.layerId = layer.id
  state.artboardId = artboardId

  // Check control handles first (only on selected nodes)
  const handleHit = hitTestHandle(docX, docY, layer, artboard.x, artboard.y, zoom)
  if (handleHit) {
    state.dragging = true
    state.dragStart = { x: docX, y: docY }
    state.draggingHandle = handleHit
    return
  }

  // Check anchor points
  const hit = hitTestNode(docX, docY, layer, artboard.x, artboard.y, zoom)
  if (hit) {
    const key = nodeKey(hit.pathId, hit.segIndex)
    if (shiftKey) {
      if (state.selectedNodes.has(key)) {
        state.selectedNodes.delete(key)
      } else {
        state.selectedNodes.add(key)
      }
    } else {
      if (!state.selectedNodes.has(key)) {
        state.selectedNodes.clear()
        state.selectedNodes.add(key)
      }
    }
    state.dragging = true
    state.dragStart = { x: docX, y: docY }
    state.draggingHandle = null
    state.bendingSegment = null
    return
  }

  // Check segment edges — click-drag to bend, click/tap to insert node
  const edgeHit = hitTestSegmentEdge(docX, docY, layer, artboard.x, artboard.y, zoom)
  if (edgeHit) {
    state.dragging = true
    state.dragStart = { x: docX, y: docY }
    state.draggingHandle = null
    state.bendingSegment = edgeHit

    // Convert the segment to cubic if it's a line, so dragging bends it
    const path = layer.paths.find((p) => p.id === edgeHit.pathId)
    if (path) {
      const seg = path.segments[edgeHit.segIndex]
      if (seg && seg.type === 'line') {
        let prevX = 0,
          prevY = 0
        for (let i = edgeHit.segIndex - 1; i >= 0; i--) {
          const prev = path.segments[i]!
          if (prev.type !== 'close') {
            prevX = prev.x
            prevY = prev.y
            break
          }
        }
        // Convert to cubic with handles at 1/3 and 2/3
        const newPaths: Path[] = JSON.parse(JSON.stringify(layer.paths))
        const updatedPath = newPaths.find((p) => p.id === edgeHit.pathId)!
        updatedPath.segments[edgeHit.segIndex] = {
          type: 'cubic',
          x: seg.x,
          y: seg.y,
          cp1x: prevX + (seg.x - prevX) / 3,
          cp1y: prevY + (seg.y - prevY) / 3,
          cp2x: prevX + (2 * (seg.x - prevX)) / 3,
          cp2y: prevY + (2 * (seg.y - prevY)) / 3,
        }
        useEditorStore.getState().updateLayerSilent(artboardId, layer.id, { paths: newPaths })
      }
    }
    return
  }

  if (!shiftKey) {
    state.selectedNodes.clear()
  }
}

/**
 * Handle mousemove (drag) for node tool.
 */
export function nodeMouseDrag(docX: number, docY: number, shiftKey: boolean) {
  if (!state.dragging || !state.dragStart || !state.layerId || !state.artboardId) return

  const store = useEditorStore.getState()
  const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
  if (!artboard) return
  const layer = artboard.layers.find((l) => l.id === state.layerId) as VectorLayer | undefined
  if (!layer) return

  let dx = docX - state.dragStart.x
  let dy = docY - state.dragStart.y

  // Shift constrains to axis, tangent, or normal of connected nodes
  if (shiftKey && !state.bendingSegment) {
    const constrained = constrainToGuides(dx, dy, layer, state.selectedNodes)
    dx = constrained.dx
    dy = constrained.dy
  }

  if (state.bendingSegment) {
    // Bend a segment by moving both control points toward the cursor
    const { pathId, segIndex } = state.bendingSegment
    const path = layer.paths.find((p) => p.id === pathId)
    if (!path) return
    const seg = path.segments[segIndex]
    if (!seg || seg.type !== 'cubic') return

    const updates: Partial<VectorLayer> = { paths: JSON.parse(JSON.stringify(layer.paths)) }
    const updatedPath = (updates.paths as Path[]).find((p) => p.id === pathId)
    if (!updatedPath) return
    const updatedSeg = updatedPath.segments[segIndex]!
    if (updatedSeg.type === 'cubic') {
      updatedSeg.cp1x += dx
      updatedSeg.cp1y += dy
      updatedSeg.cp2x += dx
      updatedSeg.cp2y += dy
    }

    store.updateLayerSilent(state.artboardId!, state.layerId!, updates)
  } else if (state.draggingHandle) {
    // Move a control handle
    const { pathId, segIndex, handle } = state.draggingHandle
    const path = layer.paths.find((p) => p.id === pathId)
    if (!path) return
    const seg = path.segments[segIndex]
    if (!seg) return

    const updates: Partial<VectorLayer> = { paths: JSON.parse(JSON.stringify(layer.paths)) }
    const updatedPath = (updates.paths as Path[]).find((p) => p.id === pathId)
    if (!updatedPath) return
    const updatedSeg = updatedPath.segments[segIndex]!

    if (updatedSeg.type === 'cubic') {
      if (handle === 'cp1') {
        updatedSeg.cp1x += dx
        updatedSeg.cp1y += dy
      } else {
        updatedSeg.cp2x += dx
        updatedSeg.cp2y += dy
      }
    } else if (updatedSeg.type === 'quadratic' && handle === 'cp') {
      updatedSeg.cpx += dx
      updatedSeg.cpy += dy
    }

    store.updateLayerSilent(state.artboardId!, state.layerId!, updates)
  } else {
    // Move selected anchor points
    // Snap the first selected node's target position to guides/grid/edges
    let snapped = false
    for (const key of state.selectedNodes) {
      const { pathId, segIndex } = parseNodeKey(key)
      const p = layer.paths.find((pp) => pp.id === pathId)
      if (!p) continue
      const seg = p.segments[segIndex]
      if (!seg || seg.type === 'close') continue
      // Document-space target = artboard origin + layer transform + local coord + delta
      const targetX = artboard.x + layer.transform.x + seg.x + dx
      const targetY = artboard.y + layer.transform.y + seg.y + dy
      const snap = snapPoint(targetX, targetY, [state.layerId!])
      if (snap.x !== null) dx += snap.x - targetX
      if (snap.y !== null) dy += snap.y - targetY
      store.setActiveSnapLines(
        snap.snapLinesH.length || snap.snapLinesV.length ? { h: snap.snapLinesH, v: snap.snapLinesV } : null,
      )
      snapped = true
      break // snap based on first selected node only
    }
    if (!snapped) {
      store.setActiveSnapLines(null)
    }

    const updates: Partial<VectorLayer> = { paths: JSON.parse(JSON.stringify(layer.paths)) }
    const paths = updates.paths as Path[]

    for (const key of state.selectedNodes) {
      const { pathId, segIndex } = parseNodeKey(key)
      const path = paths.find((p) => p.id === pathId)
      if (!path) continue
      const seg = path.segments[segIndex]
      if (!seg || seg.type === 'close') continue

      seg.x += dx
      seg.y += dy
      // Also move attached control points
      if (seg.type === 'cubic') {
        seg.cp1x += dx
        seg.cp1y += dy
        seg.cp2x += dx
        seg.cp2y += dy
      } else if (seg.type === 'quadratic') {
        seg.cpx += dx
        seg.cpy += dy
      }
    }

    store.updateLayerSilent(state.artboardId!, state.layerId!, updates)
  }

  state.dragStart = { x: docX, y: docY }
}

/**
 * Handle mouseup for node tool.
 */
export function nodeMouseUp(docX: number, docY: number) {
  if (!state.dragging) return

  // If we clicked a segment edge without dragging, insert a node at midpoint
  if (state.bendingSegment && state.dragStart) {
    const movedDist = dist(docX, docY, state.dragStart.x, state.dragStart.y)
    if (movedDist < 2) {
      // Tap/click without drag — insert node at midpoint
      insertPointOnSegment(state.bendingSegment.pathId, state.bendingSegment.segIndex)
      state.dragging = false
      state.dragStart = null
      state.draggingHandle = null
      state.bendingSegment = null
      return
    }
  }

  // Commit as an undo entry
  if (state.layerId && state.artboardId) {
    const store = useEditorStore.getState()
    const artboard = store.document.artboards.find((a) => a.id === state.artboardId)
    if (artboard) {
      const layer = artboard.layers.find((l) => l.id === state.layerId) as VectorLayer | undefined
      if (layer) {
        store.updateLayer(state.artboardId, state.layerId, { paths: JSON.parse(JSON.stringify(layer.paths)) })
      }
    }
  }

  useEditorStore.getState().setActiveSnapLines(null)
  state.dragging = false
  state.dragStart = null
  state.draggingHandle = null
  state.bendingSegment = null
}

/**
 * Delete selected nodes.
 */
export function deleteSelectedNodes() {
  if (state.selectedNodes.size === 0) return
  const info = getEditingLayer()
  if (!info) return

  const { layer, artboardId } = info
  const newPaths: Path[] = JSON.parse(JSON.stringify(layer.paths))

  // Group selected nodes by path
  const byPath = new Map<string, number[]>()
  for (const key of state.selectedNodes) {
    const { pathId, segIndex } = parseNodeKey(key)
    if (!byPath.has(pathId)) byPath.set(pathId, [])
    byPath.get(pathId)!.push(segIndex)
  }

  for (const [pathId, indices] of byPath) {
    const path = newPaths.find((p) => p.id === pathId)
    if (!path) continue
    // Remove segments at indices (reverse order to keep indices stable)
    const sorted = [...indices].sort((a, b) => b - a)
    for (const idx of sorted) {
      path.segments.splice(idx, 1)
    }
    // If path is now empty or has only a move, remove it
    if (path.segments.length <= 1) {
      const pi = newPaths.indexOf(path)
      if (pi !== -1) newPaths.splice(pi, 1)
    }
  }

  useEditorStore.getState().updateLayer(artboardId, layer.id, { paths: newPaths })
  state.selectedNodes.clear()
}

/**
 * Insert a point on a segment by splitting it at t=0.5.
 * Uses de Casteljau subdivision for cubic segments.
 */
export function insertPointOnSegment(pathId: string, segIndex: number) {
  const info = getEditingLayer()
  if (!info) return

  const { layer, artboardId } = info
  const newPaths: Path[] = JSON.parse(JSON.stringify(layer.paths))
  const path = newPaths.find((p) => p.id === pathId)
  if (!path) return

  const seg = path.segments[segIndex]
  if (!seg || seg.type === 'close' || seg.type === 'move') return

  // Get previous point
  let prevX = 0,
    prevY = 0
  for (let i = segIndex - 1; i >= 0; i--) {
    const prev = path.segments[i]!
    if (prev.type !== 'close') {
      prevX = prev.x
      prevY = prev.y
      break
    }
  }

  const t = 0.5

  if (seg.type === 'cubic') {
    // De Casteljau subdivision at t=0.5
    const p0x = prevX,
      p0y = prevY
    const p1x = seg.cp1x,
      p1y = seg.cp1y
    const p2x = seg.cp2x,
      p2y = seg.cp2y
    const p3x = seg.x,
      p3y = seg.y

    const q0x = p0x + t * (p1x - p0x),
      q0y = p0y + t * (p1y - p0y)
    const q1x = p1x + t * (p2x - p1x),
      q1y = p1y + t * (p2y - p1y)
    const q2x = p2x + t * (p3x - p2x),
      q2y = p2y + t * (p3y - p2y)

    const r0x = q0x + t * (q1x - q0x),
      r0y = q0y + t * (q1y - q0y)
    const r1x = q1x + t * (q2x - q1x),
      r1y = q1y + t * (q2y - q1y)

    const sx = r0x + t * (r1x - r0x),
      sy = r0y + t * (r1y - r0y)

    // Replace the original cubic with two cubics
    const firstHalf: Segment = {
      type: 'cubic',
      x: sx,
      y: sy,
      cp1x: q0x,
      cp1y: q0y,
      cp2x: r0x,
      cp2y: r0y,
    }
    const secondHalf: Segment = {
      type: 'cubic',
      x: p3x,
      y: p3y,
      cp1x: r1x,
      cp1y: r1y,
      cp2x: q2x,
      cp2y: q2y,
    }

    path.segments.splice(segIndex, 1, firstHalf, secondHalf)
  } else if (seg.type === 'line') {
    // Simple midpoint insertion
    const midX = (prevX + seg.x) / 2
    const midY = (prevY + seg.y) / 2
    const firstHalf: Segment = { type: 'line', x: midX, y: midY }
    const secondHalf: Segment = { type: 'line', x: seg.x, y: seg.y }
    path.segments.splice(segIndex, 1, firstHalf, secondHalf)
  } else if (seg.type === 'quadratic') {
    // Subdivide quadratic at t=0.5
    const p0x = prevX,
      p0y = prevY
    const p1x = seg.cpx,
      p1y = seg.cpy
    const p2x = seg.x,
      p2y = seg.y

    const q0x = p0x + t * (p1x - p0x),
      q0y = p0y + t * (p1y - p0y)
    const q1x = p1x + t * (p2x - p1x),
      q1y = p1y + t * (p2y - p1y)
    const sx = q0x + t * (q1x - q0x),
      sy = q0y + t * (q1y - q0y)

    const firstHalf: Segment = { type: 'quadratic', x: sx, y: sy, cpx: q0x, cpy: q0y }
    const secondHalf: Segment = { type: 'quadratic', x: p2x, y: p2y, cpx: q1x, cpy: q1y }
    path.segments.splice(segIndex, 1, firstHalf, secondHalf)
  }

  useEditorStore.getState().updateLayer(artboardId, layer.id, { paths: newPaths })
}

/**
 * Toggle a node between corner and smooth.
 * Corner: control handles are independent.
 * Smooth: control handles are mirrored.
 */
export function toggleNodeSmooth(pathId: string, segIndex: number) {
  const info = getEditingLayer()
  if (!info) return

  const { layer, artboardId } = info
  const newPaths: Path[] = JSON.parse(JSON.stringify(layer.paths))
  const path = newPaths.find((p) => p.id === pathId)
  if (!path) return

  const seg = path.segments[segIndex]
  if (!seg) return

  if (seg.type === 'cubic') {
    // If handles are symmetric around the anchor, convert to corner (collapse handles)
    // Otherwise, make them symmetric (smooth)
    const dx1 = seg.cp2x - seg.x
    const dy1 = seg.cp2y - seg.y
    const handleLen = Math.sqrt(dx1 * dx1 + dy1 * dy1)

    if (handleLen < 0.1) {
      // It's a corner — make it smooth by extending handles along the line direction
      let prevX = 0,
        prevY = 0
      for (let i = segIndex - 1; i >= 0; i--) {
        const prev = path.segments[i]!
        if (prev.type !== 'close') {
          prevX = prev.x
          prevY = prev.y
          break
        }
      }
      const dirX = seg.x - prevX
      const dirY = seg.y - prevY
      const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      const ext = len * 0.25
      seg.cp2x = seg.x - (dirX / len) * ext
      seg.cp2y = seg.y - (dirY / len) * ext
      // Also adjust the next segment's cp1 if it's cubic
      const next = path.segments[segIndex + 1]
      if (next && next.type === 'cubic') {
        next.cp1x = seg.x + (dirX / len) * ext
        next.cp1y = seg.y + (dirY / len) * ext
      }
    } else {
      // It's smooth — convert to corner (collapse handles to anchor)
      seg.cp2x = seg.x
      seg.cp2y = seg.y
      const next = path.segments[segIndex + 1]
      if (next && next.type === 'cubic') {
        next.cp1x = seg.x
        next.cp1y = seg.y
      }
    }
  } else if (seg.type === 'line') {
    // Convert line to cubic with handles at 1/3 and 2/3
    let prevX = 0,
      prevY = 0
    for (let i = segIndex - 1; i >= 0; i--) {
      const prev = path.segments[i]!
      if (prev.type !== 'close') {
        prevX = prev.x
        prevY = prev.y
        break
      }
    }
    const cubic: Segment = {
      type: 'cubic',
      x: seg.x,
      y: seg.y,
      cp1x: prevX + (seg.x - prevX) / 3,
      cp1y: prevY + (seg.y - prevY) / 3,
      cp2x: prevX + (2 * (seg.x - prevX)) / 3,
      cp2y: prevY + (2 * (seg.y - prevY)) / 3,
    }
    path.segments[segIndex] = cubic
  }

  useEditorStore.getState().updateLayer(artboardId, layer.id, { paths: newPaths })
}

/**
 * Find the nearest segment (edge) to a point for insertion.
 */
export function hitTestSegmentEdge(
  docX: number,
  docY: number,
  layer: VectorLayer,
  artboardX: number,
  artboardY: number,
  zoom: number,
): { pathId: string; segIndex: number } | null {
  const threshold = 10 / zoom
  const lx = docX - artboardX - layer.transform.x
  const ly = docY - artboardY - layer.transform.y
  let bestDist = threshold
  let best: { pathId: string; segIndex: number } | null = null

  for (const path of layer.paths) {
    let curX = 0,
      curY = 0
    for (let i = 0; i < path.segments.length; i++) {
      const seg = path.segments[i]!
      if (seg.type === 'move') {
        curX = seg.x
        curY = seg.y
        continue
      }
      if (seg.type === 'close') continue

      // Simple distance to line segment for line type
      if (seg.type === 'line') {
        const d = distToLineSegment(lx, ly, curX, curY, seg.x, seg.y)
        if (d < bestDist) {
          bestDist = d
          best = { pathId: path.id, segIndex: i }
        }
      } else {
        // For curves, sample 10 points and find nearest
        for (let t = 0; t <= 1; t += 0.1) {
          const pt = sampleSegment(seg, curX, curY, t)
          const d = dist(lx, ly, pt.x, pt.y)
          if (d < bestDist) {
            bestDist = d
            best = { pathId: path.id, segIndex: i }
          }
        }
      }

      curX = seg.x
      curY = seg.y
    }
  }

  return best
}

function distToLineSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax,
    aby = by - ay
  const apx = px - ax,
    apy = py - ay
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)))
  const projX = ax + t * abx,
    projY = ay + t * aby
  return dist(px, py, projX, projY)
}

function sampleSegment(seg: Segment, prevX: number, prevY: number, t: number): { x: number; y: number } {
  if (seg.type === 'cubic') {
    const mt = 1 - t
    return {
      x: mt * mt * mt * prevX + 3 * mt * mt * t * seg.cp1x + 3 * mt * t * t * seg.cp2x + t * t * t * seg.x,
      y: mt * mt * mt * prevY + 3 * mt * mt * t * seg.cp1y + 3 * mt * t * t * seg.cp2y + t * t * t * seg.y,
    }
  }
  if (seg.type === 'quadratic') {
    const mt = 1 - t
    return {
      x: mt * mt * prevX + 2 * mt * t * seg.cpx + t * t * seg.x,
      y: mt * mt * prevY + 2 * mt * t * seg.cpy + t * t * seg.y,
    }
  }
  // line or other: lerp
  return { x: prevX + t * ((seg as { x: number }).x - prevX), y: prevY + t * ((seg as { y: number }).y - prevY) }
}
