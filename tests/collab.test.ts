import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

// ── CRDT Document ──
import {
  createCRDTDoc,
  createOperation,
  applyLocalOperation,
  mergeRemoteOperations,
  getDocumentState,
  getOperationCounts,
  getContributors,
  type CRDTOperation,
} from '@/collab/crdt-doc'

// ── Sync Client ──
import { SyncClient, type SyncConnectionState } from '@/collab/sync-client'

// ── Presence ──
import {
  broadcastPresence,
  getRemotePresence,
  updateRemotePresence,
  removeRemotePresence,
  clearRemotePresences,
  followUser,
  unfollowUser,
  getFollowedUserId,
  getFollowViewport,
  getPresenceForUser,
  setBroadcastCallback,
  cancelPendingBroadcast,
  colorForUser,
  type PresenceData,
} from '@/collab/presence'

// ── Version History ──
import {
  createSnapshot,
  listSnapshots,
  getSnapshotById,
  restoreSnapshot,
  deleteSnapshot,
  clearSnapshots,
  autoSave,
  stopAutoSave,
  isAutoSaveRunning,
  computeDelta,
  applyDelta,
} from '@/collab/version-history'

// ── Branches ──
import {
  createBranch,
  getBranch,
  listBranches,
  deleteBranch,
  clearBranches,
  switchBranch,
  getActiveBranchId,
  getActiveBranch,
  addOperationToBranch,
  mergeBranch,
  forceMergeBranch,
} from '@/collab/branches'

// ── Share ──
import {
  createShareLink,
  revokeShareLink,
  validateShareToken,
  listShareLinks,
  listAllShareLinks,
  getShareLink,
  clearShareLinks,
  buildShareUrl,
  updateSharePermission,
} from '@/collab/share'

// ── Cloud Sync ──
import {
  getSyncState,
  setCloudSyncAdapter,
  onSyncStateChange,
  computeHash,
  uploadDocument,
  downloadDocument,
  syncDocument,
  resolveConflict,
  resetSyncState,
  type CloudSyncAdapter,
} from '@/collab/cloud-sync'

// ── Helpers ──

function makePresence(userId: string, x = 100, y = 200): PresenceData {
  return {
    userId,
    name: `User ${userId}`,
    color: '#e74c3c',
    cursorX: x,
    cursorY: y,
    activeTool: 'select',
    viewportRect: { x: 0, y: 0, width: 1920, height: 1080 },
  }
}

function makeOp(
  clientId: string,
  type: CRDTOperation['type'],
  path: string[],
  value?: unknown,
  timestamp?: number,
): CRDTOperation {
  return {
    id: `op-${Math.random().toString(36).slice(2, 10)}`,
    clientId,
    timestamp: timestamp ?? Date.now(),
    type,
    path,
    value,
  }
}

// ══════════════════════════════════════════════════════════════
// ── CRDT Document Tests ──
// ══════════════════════════════════════════════════════════════

describe('CRDT Document', () => {
  test('createCRDTDoc initializes empty document', () => {
    const doc = createCRDTDoc('client-a')
    expect(doc.clientId).toBe('client-a')
    expect(doc.version).toBe(0)
    expect(doc.operations).toEqual([])
  })

  test('createOperation produces a valid operation', () => {
    const op = createOperation('client-a', 'insert', ['layers', '0'], { name: 'rect' })
    expect(op.clientId).toBe('client-a')
    expect(op.type).toBe('insert')
    expect(op.path).toEqual(['layers', '0'])
    expect(op.value).toEqual({ name: 'rect' })
    expect(typeof op.id).toBe('string')
    expect(typeof op.timestamp).toBe('number')
  })

  test('applyLocalOperation increments version and appends op', () => {
    const doc = createCRDTDoc('client-a')
    const op = createOperation('client-a', 'insert', ['layers', '0'], 'layer-data')
    const next = applyLocalOperation(doc, op)

    expect(next.version).toBe(1)
    expect(next.operations).toHaveLength(1)
    expect(next.operations[0]).toBe(op)
    // Original is unchanged (immutable)
    expect(doc.version).toBe(0)
    expect(doc.operations).toHaveLength(0)
  })

  test('applyLocalOperation chains correctly', () => {
    let doc = createCRDTDoc('client-a')
    const op1 = createOperation('client-a', 'insert', ['a'], 1)
    const op2 = createOperation('client-a', 'update', ['b'], 2)

    doc = applyLocalOperation(doc, op1)
    doc = applyLocalOperation(doc, op2)

    expect(doc.version).toBe(2)
    expect(doc.operations).toHaveLength(2)
  })

  test('mergeRemoteOperations adds non-conflicting ops', () => {
    let doc = createCRDTDoc('client-a')
    const localOp = makeOp('client-a', 'insert', ['layers', '0'], 'local', 1000)
    doc = applyLocalOperation(doc, localOp)

    const remoteOp = makeOp('client-b', 'insert', ['layers', '1'], 'remote', 1001)
    const merged = mergeRemoteOperations(doc, [remoteOp])

    expect(merged.operations).toHaveLength(2)
    expect(merged.version).toBe(2)
  })

  test('mergeRemoteOperations skips duplicate ops', () => {
    let doc = createCRDTDoc('client-a')
    const op = makeOp('client-a', 'insert', ['layers', '0'], 'data', 1000)
    doc = applyLocalOperation(doc, op)

    // Try to merge the same op again
    const merged = mergeRemoteOperations(doc, [op])
    expect(merged.operations).toHaveLength(1) // Not duplicated
    expect(merged).toBe(doc) // Returns same doc when nothing accepted
  })

  test('mergeRemoteOperations applies LWW (later timestamp wins)', () => {
    let doc = createCRDTDoc('client-a')
    const localOp = makeOp('client-a', 'update', ['layers', '0', 'opacity'], 0.5, 1000)
    doc = applyLocalOperation(doc, localOp)

    // Remote op has a later timestamp — should win
    const remoteOp = makeOp('client-b', 'update', ['layers', '0', 'opacity'], 0.8, 2000)
    const merged = mergeRemoteOperations(doc, [remoteOp])

    expect(merged.operations).toHaveLength(2)
  })

  test('mergeRemoteOperations rejects losing LWW op', () => {
    let doc = createCRDTDoc('client-a')
    const localOp = makeOp('client-a', 'update', ['layers', '0', 'opacity'], 0.5, 2000)
    doc = applyLocalOperation(doc, localOp)

    // Remote op has an earlier timestamp — should lose
    const remoteOp = makeOp('client-b', 'update', ['layers', '0', 'opacity'], 0.8, 1000)
    const merged = mergeRemoteOperations(doc, [remoteOp])

    expect(merged.operations).toHaveLength(1) // Remote op rejected
  })

  test('mergeRemoteOperations uses clientId for tie-breaking', () => {
    let doc = createCRDTDoc('client-a')
    const localOp = makeOp('client-a', 'update', ['x'], 10, 1000)
    doc = applyLocalOperation(doc, localOp)

    // Same timestamp, but 'client-z' > 'client-a'
    const remoteOp = makeOp('client-z', 'update', ['x'], 20, 1000)
    const merged = mergeRemoteOperations(doc, [remoteOp])

    expect(merged.operations).toHaveLength(2)
  })

  test('getDocumentState reconstructs from operations', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['title'], 'My Design', 1000))
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['layers', 'count'], 3, 1001))
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['layers', 'visible'], true, 1002))

    const state = getDocumentState(doc)
    expect(state['title']).toBe('My Design')
    expect((state['layers'] as Record<string, unknown>)['count']).toBe(3)
    expect((state['layers'] as Record<string, unknown>)['visible']).toBe(true)
  })

  test('getDocumentState handles delete operations', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['title'], 'Design', 1000))
    doc = applyLocalOperation(doc, makeOp('client-a', 'delete', ['title'], undefined, 1001))

    const state = getDocumentState(doc)
    expect(state['title']).toBeUndefined()
  })

  test('getDocumentState update overwrites insert', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['x'], 10, 1000))
    doc = applyLocalOperation(doc, makeOp('client-a', 'update', ['x'], 20, 1001))

    const state = getDocumentState(doc)
    expect(state['x']).toBe(20)
  })

  test('getOperationCounts returns correct counts', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['a'], 1, 1000))
    doc = applyLocalOperation(doc, makeOp('client-a', 'update', ['b'], 2, 1001))
    doc = applyLocalOperation(doc, makeOp('client-a', 'delete', ['c'], undefined, 1002))
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['d'], 4, 1003))

    const counts = getOperationCounts(doc)
    expect(counts.insert).toBe(2)
    expect(counts.update).toBe(1)
    expect(counts.delete).toBe(1)
  })

  test('getContributors returns unique client IDs', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['a'], 1, 1000))
    doc = mergeRemoteOperations(doc, [makeOp('client-b', 'insert', ['b'], 2, 1001)])
    doc = mergeRemoteOperations(doc, [makeOp('client-c', 'insert', ['c'], 3, 1002)])
    doc = applyLocalOperation(doc, makeOp('client-a', 'update', ['a'], 10, 1003))

    const contributors = getContributors(doc)
    expect(contributors.sort()).toEqual(['client-a', 'client-b', 'client-c'])
  })

  test('mergeRemoteOperations handles multiple ops in batch', () => {
    let doc = createCRDTDoc('client-a')
    doc = applyLocalOperation(doc, makeOp('client-a', 'insert', ['a'], 1, 1000))

    const remoteOps = [
      makeOp('client-b', 'insert', ['b'], 2, 1001),
      makeOp('client-b', 'insert', ['c'], 3, 1002),
      makeOp('client-b', 'update', ['d'], 4, 1003),
    ]

    const merged = mergeRemoteOperations(doc, remoteOps)
    expect(merged.operations).toHaveLength(4)
    expect(merged.version).toBe(4)
  })
})

// ══════════════════════════════════════════════════════════════
// ── Sync Client Tests ──
// ══════════════════════════════════════════════════════════════

describe('SyncClient', () => {
  test('constructor initializes with disconnected state', () => {
    const client = new SyncClient('client-a')
    expect(client.state).toBe('disconnected')
    expect(client.clientId).toBe('client-a')
    expect(client.queueLength).toBe(0)
  })

  test('sendOperations queues when disconnected', () => {
    const client = new SyncClient('client-a')
    const ops = [makeOp('client-a', 'insert', ['x'], 1)]
    client.sendOperations(ops)
    expect(client.queueLength).toBe(1)
  })

  test('sendOperations queues multiple batches', () => {
    const client = new SyncClient('client-a')
    client.sendOperations([makeOp('client-a', 'insert', ['a'], 1)])
    client.sendOperations([makeOp('client-a', 'insert', ['b'], 2)])
    expect(client.queueLength).toBe(2)
  })

  test('sendOperations does nothing for empty array', () => {
    const client = new SyncClient('client-a')
    client.sendOperations([])
    expect(client.queueLength).toBe(0)
  })

  test('onRemoteOperations registers and unregisters callback', () => {
    const client = new SyncClient('client-a')
    const callback = (_ops: CRDTOperation[]) => {}
    const unsub = client.onRemoteOperations(callback)
    expect(typeof unsub).toBe('function')
    unsub() // Should not throw
  })

  test('onStateChange registers and unregisters callback', () => {
    const client = new SyncClient('client-a')
    const states: SyncConnectionState[] = []
    const unsub = client.onStateChange((s) => states.push(s))

    // Disconnect emits state change
    client.disconnect()
    // After disconnect, state should be disconnected
    expect(client.state).toBe('disconnected')
    unsub()
  })

  test('onError registers and unregisters callback', () => {
    const client = new SyncClient('client-a')
    const errors: Error[] = []
    const unsub = client.onError((e) => errors.push(e))
    expect(typeof unsub).toBe('function')
    unsub()
  })

  test('disconnect clears state cleanly', () => {
    const client = new SyncClient('client-a')
    client.sendOperations([makeOp('client-a', 'insert', ['x'], 1)])
    client.disconnect()
    expect(client.state).toBe('disconnected')
    // Queue should still be preserved for potential reconnect
  })
})

// ══════════════════════════════════════════════════════════════
// ── Presence Tests ──
// ══════════════════════════════════════════════════════════════

describe('Presence', () => {
  beforeEach(() => {
    clearRemotePresences()
    setBroadcastCallback(null)
    cancelPendingBroadcast()
    unfollowUser()
  })

  test('getRemotePresence returns empty array initially', () => {
    expect(getRemotePresence()).toEqual([])
  })

  test('updateRemotePresence adds a presence', () => {
    updateRemotePresence(makePresence('user-a'))
    expect(getRemotePresence()).toHaveLength(1)
    expect(getRemotePresence()[0]!.userId).toBe('user-a')
  })

  test('updateRemotePresence updates existing user', () => {
    updateRemotePresence(makePresence('user-a', 100, 200))
    updateRemotePresence(makePresence('user-a', 300, 400))
    expect(getRemotePresence()).toHaveLength(1)
    expect(getRemotePresence()[0]!.cursorX).toBe(300)
  })

  test('removeRemotePresence removes a user', () => {
    updateRemotePresence(makePresence('user-a'))
    updateRemotePresence(makePresence('user-b'))
    removeRemotePresence('user-a')
    expect(getRemotePresence()).toHaveLength(1)
    expect(getRemotePresence()[0]!.userId).toBe('user-b')
  })

  test('clearRemotePresences removes all', () => {
    updateRemotePresence(makePresence('user-a'))
    updateRemotePresence(makePresence('user-b'))
    clearRemotePresences()
    expect(getRemotePresence()).toEqual([])
  })

  test('getPresenceForUser returns specific user', () => {
    updateRemotePresence(makePresence('user-a', 10, 20))
    const p = getPresenceForUser('user-a')
    expect(p).toBeDefined()
    expect(p!.cursorX).toBe(10)
  })

  test('getPresenceForUser returns undefined for unknown user', () => {
    expect(getPresenceForUser('unknown')).toBeUndefined()
  })

  test('broadcastPresence calls callback immediately on first call', () => {
    const sent: PresenceData[] = []
    setBroadcastCallback((data) => sent.push(data))

    broadcastPresence(makePresence('user-a'))
    expect(sent).toHaveLength(1)
  })

  test('followUser / unfollowUser sets and clears followed user', () => {
    expect(getFollowedUserId()).toBeNull()

    followUser('user-b')
    expect(getFollowedUserId()).toBe('user-b')

    unfollowUser()
    expect(getFollowedUserId()).toBeNull()
  })

  test('getFollowViewport returns null when not following', () => {
    expect(getFollowViewport()).toBeNull()
  })

  test('getFollowViewport returns viewport when following existing user', () => {
    updateRemotePresence(makePresence('user-b', 50, 60))
    followUser('user-b')

    const vp = getFollowViewport()
    expect(vp).toBeDefined()
    expect(vp!.width).toBe(1920)
    expect(vp!.height).toBe(1080)
  })

  test('getFollowViewport returns null when followed user not present', () => {
    followUser('user-z')
    expect(getFollowViewport()).toBeNull()
  })

  test('colorForUser returns consistent color for same userId', () => {
    const c1 = colorForUser('user-a')
    const c2 = colorForUser('user-a')
    expect(c1).toBe(c2)
    expect(c1).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('colorForUser returns different colors for different users', () => {
    // Not guaranteed to be different for all inputs, but statistically likely
    const colors = new Set<string>()
    for (let i = 0; i < 20; i++) {
      colors.add(colorForUser(`user-${i}`))
    }
    expect(colors.size).toBeGreaterThan(1)
  })
})

// ══════════════════════════════════════════════════════════════
// ── Version History Tests ──
// ══════════════════════════════════════════════════════════════

describe('Version History', () => {
  beforeEach(() => {
    clearSnapshots()
    stopAutoSave()
  })

  afterEach(() => {
    stopAutoSave()
  })

  test('createSnapshot creates a snapshot with data', () => {
    const data = new Uint8Array([1, 2, 3, 4])
    const snap = createSnapshot(data, 'Test Snapshot')

    expect(snap.name).toBe('Test Snapshot')
    expect(snap.data).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(typeof snap.id).toBe('string')
    expect(typeof snap.timestamp).toBe('number')
  })

  test('createSnapshot auto-names when no name provided', () => {
    const snap = createSnapshot(new Uint8Array([1]))
    expect(snap.name).toBe('Snapshot 1')

    const snap2 = createSnapshot(new Uint8Array([2]))
    expect(snap2.name).toBe('Snapshot 2')
  })

  test('createSnapshot sets parentId from previous snapshot', () => {
    const snap1 = createSnapshot(new Uint8Array([1]), 'First')
    const snap2 = createSnapshot(new Uint8Array([2]), 'Second')

    expect(snap1.parentId).toBeUndefined()
    expect(snap2.parentId).toBe(snap1.id)
  })

  test('listSnapshots returns ordered snapshots', () => {
    createSnapshot(new Uint8Array([1]), 'A')
    createSnapshot(new Uint8Array([2]), 'B')
    createSnapshot(new Uint8Array([3]), 'C')

    const list = listSnapshots()
    expect(list).toHaveLength(3)
    expect(list[0]!.name).toBe('A')
    expect(list[2]!.name).toBe('C')
  })

  test('getSnapshotById finds existing snapshot', () => {
    const snap = createSnapshot(new Uint8Array([42]), 'Find Me')
    const found = getSnapshotById(snap.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Find Me')
  })

  test('getSnapshotById returns undefined for missing ID', () => {
    expect(getSnapshotById('nonexistent')).toBeUndefined()
  })

  test('restoreSnapshot returns data copy', () => {
    const data = new Uint8Array([10, 20, 30])
    const snap = createSnapshot(data, 'Restore Me')
    const restored = restoreSnapshot(snap.id)

    expect(restored).toEqual(data)
    // Should be a new copy, not the same reference
    expect(restored).not.toBe(snap.data)
  })

  test('restoreSnapshot returns null for missing ID', () => {
    expect(restoreSnapshot('nonexistent')).toBeNull()
  })

  test('deleteSnapshot removes a snapshot', () => {
    const snap = createSnapshot(new Uint8Array([1]), 'Delete Me')
    expect(deleteSnapshot(snap.id)).toBe(true)
    expect(listSnapshots()).toHaveLength(0)
    expect(deleteSnapshot(snap.id)).toBe(false) // Already deleted
  })

  test('clearSnapshots removes all', () => {
    createSnapshot(new Uint8Array([1]))
    createSnapshot(new Uint8Array([2]))
    clearSnapshots()
    expect(listSnapshots()).toHaveLength(0)
  })

  // ── Auto-save ──

  test('autoSave creates snapshots at interval', async () => {
    let callCount = 0
    autoSave(() => {
      callCount++
      return new Uint8Array([callCount])
    }, 50)

    expect(isAutoSaveRunning()).toBe(true)

    // Wait for 2+ intervals
    await new Promise((resolve) => setTimeout(resolve, 130))
    stopAutoSave()

    expect(isAutoSaveRunning()).toBe(false)
    const snaps = listSnapshots()
    expect(snaps.length).toBeGreaterThanOrEqual(2)
  })

  test('stopAutoSave stops the timer', () => {
    autoSave(() => new Uint8Array([1]), 100)
    expect(isAutoSaveRunning()).toBe(true)
    stopAutoSave()
    expect(isAutoSaveRunning()).toBe(false)
  })

  // ── Delta compression ──

  test('computeDelta and applyDelta round-trip identical data', () => {
    const prev = new Uint8Array([1, 2, 3, 4, 5])
    const curr = new Uint8Array([1, 2, 3, 4, 5])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta and applyDelta round-trip modified data', () => {
    const prev = new Uint8Array([1, 2, 3, 4, 5])
    const curr = new Uint8Array([1, 99, 3, 4, 88])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta and applyDelta handle extended data', () => {
    const prev = new Uint8Array([1, 2, 3])
    const curr = new Uint8Array([1, 2, 3, 4, 5, 6])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta and applyDelta handle truncated data', () => {
    const prev = new Uint8Array([1, 2, 3, 4, 5])
    const curr = new Uint8Array([1, 2])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta and applyDelta handle completely different data', () => {
    const prev = new Uint8Array([1, 2, 3, 4])
    const curr = new Uint8Array([5, 6, 7, 8])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta and applyDelta handle empty arrays', () => {
    const prev = new Uint8Array([])
    const curr = new Uint8Array([1, 2, 3])

    const delta = computeDelta(prev, curr)
    const restored = applyDelta(prev, delta)
    expect(restored).toEqual(curr)
  })

  test('computeDelta produces smaller output for similar data', () => {
    // 1000 bytes with only a few changes
    const prev = new Uint8Array(1000)
    for (let i = 0; i < 1000; i++) prev[i] = i & 0xff

    const curr = new Uint8Array(prev)
    curr[500] = 255
    curr[501] = 255

    const delta = computeDelta(prev, curr)
    // Delta should be much smaller than the full 1000 bytes
    expect(delta.length).toBeLessThan(100)
  })
})

// ══════════════════════════════════════════════════════════════
// ── Branches Tests ──
// ══════════════════════════════════════════════════════════════

describe('Branches', () => {
  beforeEach(() => {
    clearBranches()
  })

  test('createBranch creates a new branch', () => {
    const branch = createBranch('feature-1', 'snapshot-abc')
    expect(branch.name).toBe('feature-1')
    expect(branch.baseSnapshotId).toBe('snapshot-abc')
    expect(branch.operations).toEqual([])
    expect(typeof branch.id).toBe('string')
    expect(typeof branch.createdAt).toBe('number')
  })

  test('getBranch retrieves a branch by ID', () => {
    const branch = createBranch('feature-1', 'snap-1')
    const found = getBranch(branch.id)
    expect(found).toBeDefined()
    expect(found!.name).toBe('feature-1')
  })

  test('getBranch returns undefined for missing ID', () => {
    expect(getBranch('nonexistent')).toBeUndefined()
  })

  test('listBranches returns all branches sorted by creation', () => {
    createBranch('alpha', 'snap-1')
    createBranch('beta', 'snap-2')
    createBranch('gamma', 'snap-3')

    const all = listBranches()
    expect(all).toHaveLength(3)
    expect(all[0]!.name).toBe('alpha')
    expect(all[2]!.name).toBe('gamma')
  })

  test('deleteBranch removes a branch', () => {
    const branch = createBranch('temp', 'snap-1')
    expect(deleteBranch(branch.id)).toBe(true)
    expect(listBranches()).toHaveLength(0)
    expect(deleteBranch(branch.id)).toBe(false) // Already deleted
  })

  test('deleteBranch clears active branch if deleted', () => {
    const branch = createBranch('active', 'snap-1')
    switchBranch(branch.id)
    expect(getActiveBranchId()).toBe(branch.id)

    deleteBranch(branch.id)
    expect(getActiveBranchId()).toBeNull()
  })

  test('switchBranch sets active branch', () => {
    const b1 = createBranch('feature-1', 'snap-1')
    const b2 = createBranch('feature-2', 'snap-2')

    switchBranch(b1.id)
    expect(getActiveBranchId()).toBe(b1.id)
    expect(getActiveBranch()!.name).toBe('feature-1')

    switchBranch(b2.id)
    expect(getActiveBranchId()).toBe(b2.id)
    expect(getActiveBranch()!.name).toBe('feature-2')
  })

  test('switchBranch returns undefined for missing branch', () => {
    expect(switchBranch('nonexistent')).toBeUndefined()
    expect(getActiveBranchId()).toBeNull()
  })

  test('addOperationToBranch appends operations', () => {
    const branch = createBranch('dev', 'snap-1')
    const op = makeOp('client-a', 'insert', ['x'], 1)

    expect(addOperationToBranch(branch.id, op)).toBe(true)
    expect(getBranch(branch.id)!.operations).toHaveLength(1)
  })

  test('addOperationToBranch returns false for missing branch', () => {
    const op = makeOp('client-a', 'insert', ['x'], 1)
    expect(addOperationToBranch('nonexistent', op)).toBe(false)
  })

  test('mergeBranch merges non-conflicting operations', () => {
    const source = createBranch('source', 'snap-1')
    const target = createBranch('target', 'snap-1')

    addOperationToBranch(source.id, makeOp('client-a', 'insert', ['a'], 1, 1000))
    addOperationToBranch(source.id, makeOp('client-a', 'insert', ['b'], 2, 1001))
    addOperationToBranch(target.id, makeOp('client-b', 'insert', ['c'], 3, 1000))

    const result = mergeBranch(source.id, target.id)
    expect(result.mergedOps).toHaveLength(2)
    expect(result.conflicts).toHaveLength(0)
    // Target should now have 3 operations
    expect(getBranch(target.id)!.operations).toHaveLength(3)
  })

  test('mergeBranch detects conflicts on same path', () => {
    const source = createBranch('source', 'snap-1')
    const target = createBranch('target', 'snap-1')

    addOperationToBranch(source.id, makeOp('client-a', 'update', ['layers', '0', 'opacity'], 0.5, 1000))
    addOperationToBranch(target.id, makeOp('client-b', 'update', ['layers', '0', 'opacity'], 0.8, 1001))

    const result = mergeBranch(source.id, target.id)
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.path).toBe('layers/0/opacity')
    expect(result.mergedOps).toHaveLength(0) // Conflicting ops not merged
  })

  test('mergeBranch handles mixed conflicts and merges', () => {
    const source = createBranch('source', 'snap-1')
    const target = createBranch('target', 'snap-1')

    addOperationToBranch(source.id, makeOp('client-a', 'update', ['shared-path'], 1, 1000))
    addOperationToBranch(source.id, makeOp('client-a', 'insert', ['unique-source'], 2, 1001))
    addOperationToBranch(target.id, makeOp('client-b', 'update', ['shared-path'], 3, 1000))

    const result = mergeBranch(source.id, target.id)
    expect(result.conflicts).toHaveLength(1)
    expect(result.mergedOps).toHaveLength(1)
  })

  test('mergeBranch returns empty results for missing branches', () => {
    const result = mergeBranch('nonexistent', 'also-nonexistent')
    expect(result.mergedOps).toHaveLength(0)
    expect(result.conflicts).toHaveLength(0)
  })

  test('forceMergeBranch applies all operations', () => {
    const source = createBranch('source', 'snap-1')
    const target = createBranch('target', 'snap-1')

    addOperationToBranch(source.id, makeOp('client-a', 'update', ['x'], 1, 1000))
    addOperationToBranch(source.id, makeOp('client-a', 'update', ['y'], 2, 1001))
    addOperationToBranch(target.id, makeOp('client-b', 'update', ['x'], 3, 1000))

    const count = forceMergeBranch(source.id, target.id)
    expect(count).toBe(2)
    expect(getBranch(target.id)!.operations).toHaveLength(3)
  })

  test('forceMergeBranch returns 0 for missing branches', () => {
    expect(forceMergeBranch('a', 'b')).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════
// ── Share Tests ──
// ══════════════════════════════════════════════════════════════

describe('Share', () => {
  beforeEach(() => {
    clearShareLinks()
  })

  test('createShareLink creates a link with correct properties', () => {
    const link = createShareLink('doc-1', 'edit', {
      createdBy: 'nicole@muzz.in',
    })

    expect(link.docId).toBe('doc-1')
    expect(link.permission).toBe('edit')
    expect(link.createdBy).toBe('nicole@muzz.in')
    expect(typeof link.token).toBe('string')
    expect(typeof link.createdAt).toBe('number')
  })

  test('createShareLink supports all permission types', () => {
    const view = createShareLink('doc-1', 'view')
    const comment = createShareLink('doc-1', 'comment')
    const edit = createShareLink('doc-1', 'edit')

    expect(view.permission).toBe('view')
    expect(comment.permission).toBe('comment')
    expect(edit.permission).toBe('edit')
  })

  test('createShareLink supports password and expiration', () => {
    const future = Date.now() + 3600000
    const link = createShareLink('doc-1', 'view', {
      password: 'secret123',
      expiresAt: future,
    })

    expect(link.password).toBe('secret123')
    expect(link.expiresAt).toBe(future)
  })

  test('revokeShareLink removes a link', () => {
    const link = createShareLink('doc-1', 'view')
    expect(revokeShareLink(link.token)).toBe(true)
    expect(getShareLink(link.token)).toBeUndefined()
    expect(revokeShareLink(link.token)).toBe(false)
  })

  test('validateShareToken returns link for valid token', () => {
    const link = createShareLink('doc-1', 'edit')
    const validated = validateShareToken(link.token)
    expect(validated).toBeDefined()
    expect(validated!.permission).toBe('edit')
  })

  test('validateShareToken returns null for unknown token', () => {
    expect(validateShareToken('bogus-token')).toBeNull()
  })

  test('validateShareToken returns null for expired link', () => {
    const past = Date.now() - 1000
    const link = createShareLink('doc-1', 'view', { expiresAt: past })
    expect(validateShareToken(link.token)).toBeNull()
    // Expired link should have been cleaned up
    expect(getShareLink(link.token)).toBeUndefined()
  })

  test('validateShareToken checks password', () => {
    const link = createShareLink('doc-1', 'edit', { password: 'abc' })

    // Wrong password
    expect(validateShareToken(link.token, 'wrong')).toBeNull()
    // Correct password
    expect(validateShareToken(link.token, 'abc')).toBeDefined()
    // No password provided
    expect(validateShareToken(link.token)).toBeNull()
  })

  test('listShareLinks returns links for a specific doc', () => {
    createShareLink('doc-1', 'view')
    createShareLink('doc-1', 'edit')
    createShareLink('doc-2', 'comment')

    expect(listShareLinks('doc-1')).toHaveLength(2)
    expect(listShareLinks('doc-2')).toHaveLength(1)
    expect(listShareLinks('doc-3')).toHaveLength(0)
  })

  test('listAllShareLinks returns all links', () => {
    createShareLink('doc-1', 'view')
    createShareLink('doc-2', 'edit')
    expect(listAllShareLinks()).toHaveLength(2)
  })

  test('buildShareUrl constructs proper URL', () => {
    expect(buildShareUrl('https://app.crossdraw.com', 'abc-123')).toBe('https://app.crossdraw.com/share/abc-123')
    // Handles trailing slash
    expect(buildShareUrl('https://app.crossdraw.com/', 'abc-123')).toBe('https://app.crossdraw.com/share/abc-123')
  })

  test('updateSharePermission updates permission', () => {
    const link = createShareLink('doc-1', 'view')
    const updated = updateSharePermission(link.token, 'edit')
    expect(updated).toBeDefined()
    expect(updated!.permission).toBe('edit')

    // Verify it persists
    const fetched = getShareLink(link.token)
    expect(fetched!.permission).toBe('edit')
  })

  test('updateSharePermission returns null for missing token', () => {
    expect(updateSharePermission('bogus', 'edit')).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════
// ── Cloud Sync Tests ──
// ══════════════════════════════════════════════════════════════

describe('Cloud Sync', () => {
  // Mock adapter store
  let store: Map<string, { data: Uint8Array; hash: string }>

  function createMockAdapter(): CloudSyncAdapter {
    return {
      async upload(docId: string, data: Uint8Array) {
        const hash = computeHash(data)
        store.set(docId, { data: new Uint8Array(data), hash })
        return { hash }
      },
      async download(docId: string) {
        const entry = store.get(docId)
        if (!entry) throw new Error('Not found')
        return { data: new Uint8Array(entry.data), hash: entry.hash }
      },
      async getRemoteHash(docId: string) {
        const entry = store.get(docId)
        if (!entry) return ''
        return entry.hash
      },
    }
  }

  beforeEach(() => {
    resetSyncState()
    store = new Map()
    setCloudSyncAdapter(createMockAdapter())
  })

  afterEach(() => {
    resetSyncState()
  })

  test('getSyncState returns initial offline state', () => {
    resetSyncState()
    const state = getSyncState()
    expect(state.status).toBe('offline')
    expect(state.lastSync).toBe(0)
    expect(state.cloudDocId).toBeNull()
  })

  test('computeHash produces consistent hash', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const h1 = computeHash(data)
    const h2 = computeHash(data)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{8}$/)
  })

  test('computeHash produces different hash for different data', () => {
    const h1 = computeHash(new Uint8Array([1, 2, 3]))
    const h2 = computeHash(new Uint8Array([4, 5, 6]))
    expect(h1).not.toBe(h2)
  })

  test('uploadDocument uploads and updates state', async () => {
    const data = new Uint8Array([10, 20, 30])
    const hash = await uploadDocument('doc-1', data)

    expect(typeof hash).toBe('string')
    const state = getSyncState()
    expect(state.status).toBe('synced')
    expect(state.cloudDocId).toBe('doc-1')
    expect(state.lastSync).toBeGreaterThan(0)
  })

  test('downloadDocument downloads and updates state', async () => {
    // First upload some data
    const original = new Uint8Array([1, 2, 3])
    await uploadDocument('doc-1', original)

    // Reset state to simulate fresh start
    resetSyncState()
    setCloudSyncAdapter(createMockAdapter())

    const data = await downloadDocument('doc-1')
    expect(data).toEqual(original)

    const state = getSyncState()
    expect(state.status).toBe('synced')
    expect(state.cloudDocId).toBe('doc-1')
  })

  test('uploadDocument without adapter throws', async () => {
    resetSyncState()
    // No adapter set
    await expect(uploadDocument('doc-1', new Uint8Array([1]))).rejects.toThrow('No cloud sync adapter')
  })

  test('syncDocument returns synced when hashes match', async () => {
    const data = new Uint8Array([1, 2, 3])
    await uploadDocument('doc-1', data)

    const result = await syncDocument('doc-1', data)
    expect(result).toBe('synced')
  })

  test('syncDocument returns uploaded when only local changed', async () => {
    const data = new Uint8Array([1, 2, 3])
    await uploadDocument('doc-1', data)

    // Modify local data
    const newData = new Uint8Array([1, 2, 99])
    const result = await syncDocument('doc-1', newData)
    expect(result).toBe('uploaded')

    const state = getSyncState()
    expect(state.status).toBe('synced')
  })

  test('syncDocument returns conflict when both sides changed', async () => {
    const data = new Uint8Array([1, 2, 3])
    await uploadDocument('doc-1', data)

    // Simulate remote change: directly modify the store
    const remoteData = new Uint8Array([9, 9, 9])
    const remoteHash = computeHash(remoteData)
    store.set('doc-1', { data: remoteData, hash: remoteHash })

    // Local also changed
    const localData = new Uint8Array([5, 5, 5])
    const result = await syncDocument('doc-1', localData)
    expect(result).toBe('conflict')

    const state = getSyncState()
    expect(state.status).toBe('conflict')
  })

  test('resolveConflict with local strategy uploads local data', async () => {
    const localData = new Uint8Array([1, 2, 3])
    store.set('doc-1', { data: new Uint8Array([9, 9, 9]), hash: 'remote-hash' })

    const result = await resolveConflict('doc-1', 'local', localData)
    expect(result).toEqual(localData)

    const state = getSyncState()
    expect(state.status).toBe('synced')
  })

  test('resolveConflict with remote strategy downloads remote data', async () => {
    const remoteData = new Uint8Array([9, 9, 9])
    store.set('doc-1', { data: remoteData, hash: computeHash(remoteData) })

    const result = await resolveConflict('doc-1', 'remote', new Uint8Array([1, 2, 3]))
    expect(result).toEqual(remoteData)
  })

  test('resolveConflict with merge strategy uploads merged data', async () => {
    store.set('doc-1', { data: new Uint8Array([9]), hash: 'h' })
    const merged = new Uint8Array([5, 5, 5])
    const result = await resolveConflict('doc-1', 'merge', new Uint8Array([1]), merged)
    expect(result).toEqual(merged)
  })

  test('resolveConflict merge without mergedData throws', async () => {
    store.set('doc-1', { data: new Uint8Array([9]), hash: 'h' })
    await expect(resolveConflict('doc-1', 'merge', new Uint8Array([1]))).rejects.toThrow('mergedData is required')
  })

  test('onSyncStateChange notifies on state changes', async () => {
    const states: string[] = []
    onSyncStateChange((s) => states.push(s.status))

    await uploadDocument('doc-1', new Uint8Array([1]))

    // Should have received 'syncing' then 'synced'
    expect(states).toContain('syncing')
    expect(states).toContain('synced')
  })
})
