/**
 * Document branching for collaborative editing.
 *
 * Features:
 * - Create branches from any snapshot
 * - Switch between branches
 * - Merge branches with path-level conflict detection
 *
 * @module collab/branches
 */

import { v4 as uuid } from 'uuid'
import type { CRDTOperation } from './crdt-doc'

// ── Types ──

export interface Branch {
  id: string
  name: string
  baseSnapshotId: string
  /** Operations applied on this branch since the base snapshot */
  operations: CRDTOperation[]
  createdAt: number
}

export interface MergeConflict {
  path: string
  sourceOp: CRDTOperation
  targetOp: CRDTOperation
}

export interface MergeResult {
  /** Operations successfully merged from source onto target */
  mergedOps: CRDTOperation[]
  /** Conflicts at the path level */
  conflicts: MergeConflict[]
}

// ── Branch store ──

const branches = new Map<string, Branch>()
let activeBranchId: string | null = null

/**
 * Create a new branch from a base snapshot.
 * Returns the newly created branch.
 */
export function createBranch(name: string, baseSnapshotId: string): Branch {
  const branch: Branch = {
    id: uuid(),
    name,
    baseSnapshotId,
    operations: [],
    createdAt: Date.now(),
  }
  branches.set(branch.id, branch)
  return branch
}

/** Get a branch by ID. */
export function getBranch(id: string): Branch | undefined {
  return branches.get(id)
}

/** List all branches. */
export function listBranches(): Branch[] {
  return Array.from(branches.values()).sort((a, b) => a.createdAt - b.createdAt)
}

/** Delete a branch by ID. Returns true if found and deleted. */
export function deleteBranch(id: string): boolean {
  if (activeBranchId === id) {
    activeBranchId = null
  }
  return branches.delete(id)
}

/** Clear all branches (for testing). */
export function clearBranches(): void {
  branches.clear()
  activeBranchId = null
}

// ── Active branch ──

/** Switch to a branch by ID. Returns the branch or undefined if not found. */
export function switchBranch(id: string): Branch | undefined {
  const branch = branches.get(id)
  if (branch) {
    activeBranchId = id
  }
  return branch
}

/** Get the currently active branch ID (or null). */
export function getActiveBranchId(): string | null {
  return activeBranchId
}

/** Get the currently active branch (or undefined). */
export function getActiveBranch(): Branch | undefined {
  if (!activeBranchId) return undefined
  return branches.get(activeBranchId)
}

// ── Branch operations ──

/** Add an operation to a branch. */
export function addOperationToBranch(branchId: string, op: CRDTOperation): boolean {
  const branch = branches.get(branchId)
  if (!branch) return false
  branch.operations.push(op)
  return true
}

// ── Merge ──

/**
 * Merge operations from a source branch onto a target branch.
 * Detects conflicts at the path level (same path modified in both branches).
 *
 * Non-conflicting operations from the source are appended to the target.
 * Conflicting operations are reported but NOT auto-resolved.
 */
export function mergeBranch(sourceId: string, targetId: string): MergeResult {
  const source = branches.get(sourceId)
  const target = branches.get(targetId)

  if (!source || !target) {
    return { mergedOps: [], conflicts: [] }
  }

  // Build a map of the latest operation per path in the target
  const targetPaths = new Map<string, CRDTOperation>()
  for (const op of target.operations) {
    const key = op.path.join('/')
    const existing = targetPaths.get(key)
    if (!existing || op.timestamp > existing.timestamp) {
      targetPaths.set(key, op)
    }
  }

  const mergedOps: CRDTOperation[] = []
  const conflicts: MergeConflict[] = []

  for (const sourceOp of source.operations) {
    const pathStr = sourceOp.path.join('/')
    const targetOp = targetPaths.get(pathStr)

    if (targetOp) {
      // Same path modified in both branches — conflict
      conflicts.push({
        path: pathStr,
        sourceOp,
        targetOp,
      })
    } else {
      // No conflict — safe to merge
      mergedOps.push(sourceOp)
      target.operations.push(sourceOp)
    }
  }

  return { mergedOps, conflicts }
}

/**
 * Force-merge: apply source operations to target, overwriting target on conflicts.
 * Returns the number of operations applied.
 */
export function forceMergeBranch(sourceId: string, targetId: string): number {
  const source = branches.get(sourceId)
  const target = branches.get(targetId)

  if (!source || !target) return 0

  for (const op of source.operations) {
    target.operations.push(op)
  }

  return source.operations.length
}
