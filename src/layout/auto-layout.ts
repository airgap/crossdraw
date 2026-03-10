import type { GroupLayer, Layer, AutoLayoutConfig, GridLayoutConfig, GridTrack } from '@/types'

/**
 * Measure a child's natural (content) bounds: width and height.
 * Uses the layerBounds map if available, otherwise falls back to the layer's transform scale.
 */
function getChildNaturalSize(
  child: Layer,
  layerBounds: Map<string, { width: number; height: number }>,
): { width: number; height: number } {
  const bounds = layerBounds.get(child.id)
  if (bounds) return bounds
  // Fallback: use transform scale as 1:1 pixel size (common for vector/text layers)
  return {
    width: Math.abs(child.transform.scaleX) * 100,
    height: Math.abs(child.transform.scaleY) * 100,
  }
}

export interface AutoLayoutResult {
  /** Updated group width (only meaningful if group uses 'hug' sizing) */
  groupWidth: number
  /** Updated group height (only meaningful if group uses 'hug' sizing) */
  groupHeight: number
}

/**
 * Default auto-layout config for newly enabled auto-layout groups.
 */
export function createDefaultAutoLayout(): AutoLayoutConfig {
  return {
    direction: 'horizontal',
    gap: 8,
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 8,
    alignItems: 'start',
    justifyContent: 'start',
    wrap: false,
    layoutMode: 'flex',
  }
}

/**
 * Default grid layout config for newly enabled grid mode.
 */
export function createDefaultGridConfig(): GridLayoutConfig {
  return {
    columns: [
      { size: 1, unit: 'fr' },
      { size: 1, unit: 'fr' },
    ],
    rows: [
      { size: 1, unit: 'fr' },
    ],
    columnGap: 8,
    rowGap: 8,
    alignItems: 'stretch',
    justifyItems: 'stretch',
  }
}

/**
 * Core auto-layout engine. Repositions children of a GroupLayer according to its
 * AutoLayoutConfig. Operates in-place on the children's transforms.
 *
 * @param group - The group layer with autoLayout config.
 * @param layerBounds - Map of layer ID -> natural { width, height } for content sizing.
 * @param groupWidth - Current width of the group container (used for fill children).
 * @param groupHeight - Current height of the group container.
 * @returns Updated group dimensions (for 'hug' sizing on the group itself).
 */
export function applyAutoLayout(
  group: GroupLayer,
  layerBounds: Map<string, { width: number; height: number }>,
  groupWidth: number,
  groupHeight: number,
): AutoLayoutResult {
  const config = group.autoLayout
  if (!config) return { groupWidth, groupHeight }

  const visibleChildren = group.children.filter((c) => c.visible)
  if (visibleChildren.length === 0) {
    return {
      groupWidth: config.paddingLeft + config.paddingRight,
      groupHeight: config.paddingTop + config.paddingBottom,
    }
  }

  // Branch on layout mode
  if (config.layoutMode === 'grid' && config.gridConfig) {
    return applyGridLayout(group, config, visibleChildren, layerBounds, groupWidth, groupHeight)
  }

  if (config.direction === 'horizontal') {
    return layoutHorizontal(group, config, visibleChildren, layerBounds, groupWidth, groupHeight)
  } else {
    return layoutVertical(group, config, visibleChildren, layerBounds, groupWidth, groupHeight)
  }
}

// ─── Grid Layout Engine ──────────────────────────────────────

/**
 * Resolve grid track sizes from a list of GridTrack definitions.
 * - 'px' tracks use their fixed size
 * - 'auto' tracks use the maximum content size of children in that track
 * - 'fr' tracks divide the remaining space proportionally
 *
 * @param tracks - Track definitions
 * @param availableSpace - Total available space (after padding)
 * @param contentSizes - Map of track index -> max content size (for 'auto' tracks)
 */
export function resolveTrackSizes(
  tracks: GridTrack[],
  availableSpace: number,
  gap: number,
  contentSizes: Map<number, number>,
): number[] {
  const totalGaps = Math.max(0, tracks.length - 1) * gap
  let usedSpace = totalGaps
  let totalFr = 0
  const resolved: number[] = new Array(tracks.length).fill(0)

  // First pass: resolve px and auto tracks
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]!
    if (track.unit === 'px') {
      resolved[i] = track.size
      usedSpace += track.size
    } else if (track.unit === 'auto') {
      const contentSize = contentSizes.get(i) ?? 0
      resolved[i] = contentSize
      usedSpace += contentSize
    } else {
      // 'fr'
      totalFr += track.size
    }
  }

  // Second pass: distribute remaining space to fr tracks
  const remainingSpace = Math.max(0, availableSpace - usedSpace)
  if (totalFr > 0) {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]!
      if (track.unit === 'fr') {
        resolved[i] = (track.size / totalFr) * remainingSpace
      }
    }
  }

  return resolved
}

/**
 * Build a placement map: for each child, determine which grid cell (column, row) it occupies.
 * Children with explicit `gridPlacement` use that; others are auto-placed in source order,
 * filling row-by-row left to right.
 */
function buildPlacementMap(
  children: Layer[],
  numColumns: number,
  numRows: number,
): Array<{ child: Layer; col: number; row: number; colSpan: number; rowSpan: number }> {
  // Track which cells are occupied (for auto-placement)
  const occupied = new Set<string>()
  const placements: Array<{ child: Layer; col: number; row: number; colSpan: number; rowSpan: number }> = []

  function cellKey(c: number, r: number): string {
    return `${c},${r}`
  }

  function markOccupied(col: number, row: number, colSpan: number, rowSpan: number): void {
    for (let r = row; r < row + rowSpan; r++) {
      for (let c = col; c < col + colSpan; c++) {
        occupied.add(cellKey(c, r))
      }
    }
  }

  // First pass: place explicitly positioned children
  for (const child of children) {
    const placement = child.gridPlacement
    if (placement) {
      const col = Math.max(0, Math.min(placement.column, numColumns - 1))
      const row = Math.max(0, Math.min(placement.row, numRows - 1))
      const colSpan = Math.max(1, Math.min(placement.columnSpan, numColumns - col))
      const rowSpan = Math.max(1, Math.min(placement.rowSpan, numRows - row))
      placements.push({ child, col, row, colSpan, rowSpan })
      markOccupied(col, row, colSpan, rowSpan)
    }
  }

  // Second pass: auto-place remaining children
  let autoCol = 0
  let autoRow = 0

  for (const child of children) {
    if (child.gridPlacement) continue

    // Find next unoccupied cell
    while (autoRow < numRows && occupied.has(cellKey(autoCol, autoRow))) {
      autoCol++
      if (autoCol >= numColumns) {
        autoCol = 0
        autoRow++
      }
    }

    // If we've exceeded available rows, extend the grid (add implicit rows)
    const row = autoRow
    const col = autoCol

    placements.push({ child, col, row, colSpan: 1, rowSpan: 1 })
    markOccupied(col, row, 1, 1)

    autoCol++
    if (autoCol >= numColumns) {
      autoCol = 0
      autoRow++
    }
  }

  return placements
}

/**
 * Apply CSS Grid layout to a group's children.
 */
function applyGridLayout(
  group: GroupLayer,
  config: AutoLayoutConfig,
  children: Layer[],
  layerBounds: Map<string, { width: number; height: number }>,
  groupWidth: number,
  groupHeight: number,
): AutoLayoutResult {
  const gridConfig = config.gridConfig!
  const availableWidth = groupWidth - config.paddingLeft - config.paddingRight
  const availableHeight = groupHeight - config.paddingTop - config.paddingBottom

  const numColumns = gridConfig.columns.length
  const numRows = gridConfig.rows.length

  // Build placement map
  const placements = buildPlacementMap(children, numColumns, numRows)

  // Determine the actual number of rows needed (may exceed defined rows for auto-placed items)
  let maxRowUsed = numRows - 1
  for (const p of placements) {
    maxRowUsed = Math.max(maxRowUsed, p.row + p.rowSpan - 1)
  }
  const actualNumRows = maxRowUsed + 1

  // Build extended row tracks if needed (implicit rows get 'auto' sizing)
  const extendedRows: GridTrack[] = [...gridConfig.rows]
  while (extendedRows.length < actualNumRows) {
    extendedRows.push({ size: 0, unit: 'auto' })
  }

  // Compute content sizes for 'auto' tracks
  const columnContentSizes = new Map<number, number>()
  const rowContentSizes = new Map<number, number>()

  for (const p of placements) {
    const natural = getChildNaturalSize(p.child, layerBounds)
    // Only count single-span children for auto track sizing
    if (p.colSpan === 1) {
      const current = columnContentSizes.get(p.col) ?? 0
      columnContentSizes.set(p.col, Math.max(current, natural.width))
    }
    if (p.rowSpan === 1) {
      const current = rowContentSizes.get(p.row) ?? 0
      rowContentSizes.set(p.row, Math.max(current, natural.height))
    }
  }

  // Resolve track sizes
  const columnSizes = resolveTrackSizes(gridConfig.columns, availableWidth, gridConfig.columnGap, columnContentSizes)
  const rowSizes = resolveTrackSizes(extendedRows, availableHeight, gridConfig.rowGap, rowContentSizes)

  // Compute track positions (cumulative offsets)
  const columnPositions: number[] = []
  let colOffset = config.paddingLeft
  for (let i = 0; i < columnSizes.length; i++) {
    columnPositions.push(colOffset)
    colOffset += columnSizes[i]! + (i < columnSizes.length - 1 ? gridConfig.columnGap : 0)
  }

  const rowPositions: number[] = []
  let rowOffset = config.paddingTop
  for (let i = 0; i < rowSizes.length; i++) {
    rowPositions.push(rowOffset)
    rowOffset += rowSizes[i]! + (i < rowSizes.length - 1 ? gridConfig.rowGap : 0)
  }

  // Position each child in its cell
  for (const p of placements) {
    const child = p.child
    const cellX = columnPositions[p.col] ?? config.paddingLeft
    const cellY = rowPositions[p.row] ?? config.paddingTop

    // Cell dimensions (spanning multiple tracks + gaps between spanned tracks)
    let cellWidth = 0
    for (let c = p.col; c < p.col + p.colSpan && c < columnSizes.length; c++) {
      cellWidth += columnSizes[c]!
      if (c > p.col) cellWidth += gridConfig.columnGap
    }
    let cellHeight = 0
    for (let r = p.row; r < p.row + p.rowSpan && r < rowSizes.length; r++) {
      cellHeight += rowSizes[r]!
      if (r > p.row) cellHeight += gridConfig.rowGap
    }

    const natural = getChildNaturalSize(child, layerBounds)
    const childWidth = gridConfig.justifyItems === 'stretch' ? cellWidth : natural.width
    const childHeight = gridConfig.alignItems === 'stretch' ? cellHeight : natural.height

    // Horizontal alignment within cell (justifyItems)
    if (gridConfig.justifyItems === 'center') {
      child.transform.x = cellX + (cellWidth - childWidth) / 2
    } else if (gridConfig.justifyItems === 'end') {
      child.transform.x = cellX + cellWidth - childWidth
    } else {
      // 'start' or 'stretch'
      child.transform.x = cellX
    }

    // Vertical alignment within cell (alignItems)
    if (gridConfig.alignItems === 'center') {
      child.transform.y = cellY + (cellHeight - childHeight) / 2
    } else if (gridConfig.alignItems === 'end') {
      child.transform.y = cellY + cellHeight - childHeight
    } else {
      // 'start' or 'stretch'
      child.transform.y = cellY
    }

    // Apply sizing for stretch mode
    applyChildSize(child, childWidth, childHeight, layerBounds)
  }

  // Compute hug dimensions
  const totalColumnWidth = columnSizes.reduce((a, b) => a + b, 0) + Math.max(0, columnSizes.length - 1) * gridConfig.columnGap
  const totalRowHeight = rowSizes.reduce((a, b) => a + b, 0) + Math.max(0, rowSizes.length - 1) * gridConfig.rowGap
  const hugWidth = config.paddingLeft + totalColumnWidth + config.paddingRight
  const hugHeight = config.paddingTop + totalRowHeight + config.paddingBottom

  return {
    groupWidth: group.layoutSizing?.horizontal === 'hug' ? hugWidth : groupWidth,
    groupHeight: group.layoutSizing?.vertical === 'hug' ? hugHeight : groupHeight,
  }
}

// ─── Flex Layout Engine ──────────────────────────────────────

function layoutHorizontal(
  group: GroupLayer,
  config: AutoLayoutConfig,
  children: Layer[],
  layerBounds: Map<string, { width: number; height: number }>,
  groupWidth: number,
  groupHeight: number,
): AutoLayoutResult {
  const availableWidth = groupWidth - config.paddingLeft - config.paddingRight
  const availableHeight = groupHeight - config.paddingTop - config.paddingBottom

  // First pass: measure children and count fill children
  const childSizes: Array<{ child: Layer; width: number; height: number }> = []
  let totalFixedWidth = 0
  let fillCount = 0
  const totalGaps = (children.length - 1) * config.gap

  for (const child of children) {
    const natural = getChildNaturalSize(child, layerBounds)
    const hSizing = child.layoutSizing?.horizontal ?? 'fixed'
    const vSizing = child.layoutSizing?.vertical ?? 'fixed'

    let w: number
    if (hSizing === 'fill') {
      w = 0 // placeholder, computed later
      fillCount++
    } else if (hSizing === 'hug') {
      w = natural.width
      totalFixedWidth += w
    } else {
      // fixed
      w = natural.width
      totalFixedWidth += w
    }

    let h: number
    if (vSizing === 'fill' || config.alignItems === 'stretch') {
      h = availableHeight
    } else if (vSizing === 'hug') {
      h = natural.height
    } else {
      h = natural.height
    }

    childSizes.push({ child, width: w, height: h })
  }

  // Compute fill widths
  if (fillCount > 0) {
    const remainingWidth = Math.max(0, availableWidth - totalFixedWidth - totalGaps)
    const fillWidth = remainingWidth / fillCount
    for (const entry of childSizes) {
      if ((entry.child.layoutSizing?.horizontal ?? 'fixed') === 'fill') {
        entry.width = fillWidth
      }
    }
  }

  // Compute total content width for hug sizing and space-between
  let totalContentWidth = 0
  for (const entry of childSizes) {
    totalContentWidth += entry.width
  }
  totalContentWidth += totalGaps

  // Main axis positioning
  let x = config.paddingLeft
  let spaceBetweenGap = config.gap

  if (config.justifyContent === 'center') {
    x = config.paddingLeft + (availableWidth - totalContentWidth) / 2
  } else if (config.justifyContent === 'end') {
    x = config.paddingLeft + availableWidth - totalContentWidth
  } else if (config.justifyContent === 'space-between' && children.length > 1) {
    const totalChildWidth = totalContentWidth - totalGaps
    spaceBetweenGap = (availableWidth - totalChildWidth) / (children.length - 1)
    // x stays at paddingLeft
  }

  // Position each child
  for (let i = 0; i < childSizes.length; i++) {
    const entry = childSizes[i]!
    const child = entry.child

    // Main axis (x)
    child.transform.x = x

    // Cross axis (y)
    if (config.alignItems === 'center') {
      child.transform.y = config.paddingTop + (availableHeight - entry.height) / 2
    } else if (config.alignItems === 'end') {
      child.transform.y = config.paddingTop + availableHeight - entry.height
    } else {
      // 'start' or 'stretch'
      child.transform.y = config.paddingTop
    }

    // Apply sizing to child transform scale if the child is a vector with shapeParams
    // For stretch mode on cross-axis, we update the child's effective height
    if (config.alignItems === 'stretch') {
      applyChildSize(child, entry.width, availableHeight, layerBounds)
    } else {
      applyChildSize(child, entry.width, entry.height, layerBounds)
    }

    // Advance
    const gap = config.justifyContent === 'space-between' ? spaceBetweenGap : config.gap
    x += entry.width + gap
  }

  // Compute hug dimensions
  const hugWidth = config.paddingLeft + totalContentWidth + config.paddingRight
  const maxChildHeight = childSizes.reduce((max, e) => Math.max(max, e.height), 0)
  const hugHeight = config.paddingTop + maxChildHeight + config.paddingBottom

  return {
    groupWidth: group.layoutSizing?.horizontal === 'hug' ? hugWidth : groupWidth,
    groupHeight: group.layoutSizing?.vertical === 'hug' ? hugHeight : groupHeight,
  }
}

function layoutVertical(
  group: GroupLayer,
  config: AutoLayoutConfig,
  children: Layer[],
  layerBounds: Map<string, { width: number; height: number }>,
  groupWidth: number,
  groupHeight: number,
): AutoLayoutResult {
  const availableWidth = groupWidth - config.paddingLeft - config.paddingRight
  const availableHeight = groupHeight - config.paddingTop - config.paddingBottom

  // First pass: measure children and count fill children
  const childSizes: Array<{ child: Layer; width: number; height: number }> = []
  let totalFixedHeight = 0
  let fillCount = 0
  const totalGaps = (children.length - 1) * config.gap

  for (const child of children) {
    const natural = getChildNaturalSize(child, layerBounds)
    const hSizing = child.layoutSizing?.horizontal ?? 'fixed'
    const vSizing = child.layoutSizing?.vertical ?? 'fixed'

    let w: number
    if (hSizing === 'fill' || config.alignItems === 'stretch') {
      w = availableWidth
    } else if (hSizing === 'hug') {
      w = natural.width
    } else {
      w = natural.width
    }

    let h: number
    if (vSizing === 'fill') {
      h = 0 // placeholder
      fillCount++
    } else if (vSizing === 'hug') {
      h = natural.height
      totalFixedHeight += h
    } else {
      h = natural.height
      totalFixedHeight += h
    }

    childSizes.push({ child, width: w, height: h })
  }

  // Compute fill heights
  if (fillCount > 0) {
    const remainingHeight = Math.max(0, availableHeight - totalFixedHeight - totalGaps)
    const fillHeight = remainingHeight / fillCount
    for (const entry of childSizes) {
      if ((entry.child.layoutSizing?.vertical ?? 'fixed') === 'fill') {
        entry.height = fillHeight
      }
    }
  }

  // Compute total content height
  let totalContentHeight = 0
  for (const entry of childSizes) {
    totalContentHeight += entry.height
  }
  totalContentHeight += totalGaps

  // Main axis positioning
  let y = config.paddingTop
  let spaceBetweenGap = config.gap

  if (config.justifyContent === 'center') {
    y = config.paddingTop + (availableHeight - totalContentHeight) / 2
  } else if (config.justifyContent === 'end') {
    y = config.paddingTop + availableHeight - totalContentHeight
  } else if (config.justifyContent === 'space-between' && children.length > 1) {
    const totalChildHeight = totalContentHeight - totalGaps
    spaceBetweenGap = (availableHeight - totalChildHeight) / (children.length - 1)
  }

  // Position each child
  for (let i = 0; i < childSizes.length; i++) {
    const entry = childSizes[i]!
    const child = entry.child

    // Main axis (y)
    child.transform.y = y

    // Cross axis (x)
    if (config.alignItems === 'center') {
      child.transform.x = config.paddingLeft + (availableWidth - entry.width) / 2
    } else if (config.alignItems === 'end') {
      child.transform.x = config.paddingLeft + availableWidth - entry.width
    } else {
      // 'start' or 'stretch'
      child.transform.x = config.paddingLeft
    }

    // Apply sizing
    if (config.alignItems === 'stretch') {
      applyChildSize(child, availableWidth, entry.height, layerBounds)
    } else {
      applyChildSize(child, entry.width, entry.height, layerBounds)
    }

    // Advance
    const gap = config.justifyContent === 'space-between' ? spaceBetweenGap : config.gap
    y += entry.height + gap
  }

  // Compute hug dimensions
  const maxChildWidth = childSizes.reduce((max, e) => Math.max(max, e.width), 0)
  const hugWidth = config.paddingLeft + maxChildWidth + config.paddingRight
  const hugHeight = config.paddingTop + totalContentHeight + config.paddingBottom

  return {
    groupWidth: group.layoutSizing?.horizontal === 'hug' ? hugWidth : groupWidth,
    groupHeight: group.layoutSizing?.vertical === 'hug' ? hugHeight : groupHeight,
  }
}

/**
 * Apply computed size back to a child layer. For vector layers with shapeParams,
 * we update the shapeParams width/height and regenerate the path. For other layers,
 * we adjust the transform scale.
 */
function applyChildSize(
  child: Layer,
  width: number,
  height: number,
  layerBounds: Map<string, { width: number; height: number }>,
): void {
  const natural = layerBounds.get(child.id)
  if (!natural) return

  // Only adjust if sizing is fill or stretch (otherwise keep natural size)
  const hSizing = child.layoutSizing?.horizontal ?? 'fixed'
  const vSizing = child.layoutSizing?.vertical ?? 'fixed'

  if (hSizing === 'fixed' && vSizing === 'fixed') return

  if (child.type === 'vector' && child.shapeParams) {
    // Update parametric shape dimensions
    if (hSizing !== 'fixed') {
      child.shapeParams.width = width
    }
    if (vSizing !== 'fixed') {
      child.shapeParams.height = height
    }
  }

  // Adjust scale to achieve target size
  if (natural.width > 0 && hSizing !== 'fixed') {
    child.transform.scaleX = (width / natural.width) * Math.sign(child.transform.scaleX || 1)
  }
  if (natural.height > 0 && vSizing !== 'fixed') {
    child.transform.scaleY = (height / natural.height) * Math.sign(child.transform.scaleY || 1)
  }
}

/**
 * Compute natural bounds for all children of a group, using the same logic
 * the bbox module uses but in local (layer) space.
 */
export function computeLayerBounds(children: Layer[]): Map<string, { width: number; height: number }> {
  const bounds = new Map<string, { width: number; height: number }>()

  for (const child of children) {
    switch (child.type) {
      case 'vector': {
        if (child.paths.length === 0) {
          if (child.shapeParams) {
            bounds.set(child.id, { width: child.shapeParams.width, height: child.shapeParams.height })
          } else {
            bounds.set(child.id, { width: 0, height: 0 })
          }
          break
        }
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        for (const path of child.paths) {
          for (const seg of path.segments) {
            if (seg.type !== 'close' && 'x' in seg) {
              minX = Math.min(minX, seg.x)
              minY = Math.min(minY, seg.y)
              maxX = Math.max(maxX, seg.x)
              maxY = Math.max(maxY, seg.y)
            }
            if (seg.type === 'cubic') {
              minX = Math.min(minX, seg.cp1x, seg.cp2x)
              minY = Math.min(minY, seg.cp1y, seg.cp2y)
              maxX = Math.max(maxX, seg.cp1x, seg.cp2x)
              maxY = Math.max(maxY, seg.cp1y, seg.cp2y)
            }
            if (seg.type === 'quadratic') {
              minX = Math.min(minX, seg.cpx)
              minY = Math.min(minY, seg.cpy)
              maxX = Math.max(maxX, seg.cpx)
              maxY = Math.max(maxY, seg.cpy)
            }
          }
        }
        if (minX !== Infinity) {
          bounds.set(child.id, {
            width: (maxX - minX) * Math.abs(child.transform.scaleX),
            height: (maxY - minY) * Math.abs(child.transform.scaleY),
          })
        } else {
          bounds.set(child.id, { width: 0, height: 0 })
        }
        break
      }
      case 'raster':
        bounds.set(child.id, { width: child.width, height: child.height })
        break
      case 'text': {
        const lines = child.text.split('\n')
        let maxLineWidth = 0
        for (const line of lines) {
          maxLineWidth = Math.max(maxLineWidth, child.fontSize * line.length * 0.6)
        }
        const lineH = child.fontSize * (child.lineHeight ?? 1.4)
        bounds.set(child.id, {
          width: maxLineWidth * Math.abs(child.transform.scaleX),
          height: lines.length * lineH * Math.abs(child.transform.scaleY),
        })
        break
      }
      case 'group': {
        // Recursively compute group bounds
        const childBounds = computeLayerBounds(child.children.filter((c) => c.visible))
        let totalW = 0,
          totalH = 0
        for (const [, b] of childBounds) {
          totalW = Math.max(totalW, b.width)
          totalH = Math.max(totalH, b.height)
        }
        bounds.set(child.id, { width: totalW, height: totalH })
        break
      }
      default:
        bounds.set(child.id, { width: 100, height: 100 })
    }
  }

  return bounds
}
