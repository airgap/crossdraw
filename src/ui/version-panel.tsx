import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '@/store/editor.store'
import {
  listSnapshots,
  listBranches,
  createSnapshot,
  createBranch,
  deleteSnapshot,
  getSnapshot,
  diffSnapshots,
  mergeSnapshots,
  type VersionSnapshot,
  type VersionBranch,
  type VersionDiff,
  type MergeConflict,
} from '@/versioning/version-store'

export function VersionPanel() {
  const document = useEditorStore((s) => s.document)
  const [snapshots, setSnapshots] = useState<VersionSnapshot[]>([])
  const [branches, setBranches] = useState<VersionBranch[]>([])
  const [activeBranch, setActiveBranch] = useState('main')
  const [snapshotName, setSnapshotName] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [showMerge, setShowMerge] = useState(false)
  const [mergeBranchName, setMergeBranchName] = useState('')
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([])
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null)

  const refreshData = useCallback(async () => {
    const docId = document.id
    const [snaps, brs] = await Promise.all([listSnapshots(docId), listBranches(docId)])
    setSnapshots(snaps)
    setBranches(brs)
  }, [document.id])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  const handleCreateSnapshot = async () => {
    const name = snapshotName.trim()
    if (!name) return

    const branchSnapshots = snapshots.filter((s) => s.branchName === activeBranch)
    const parentId = branchSnapshots.length > 0 ? branchSnapshots[branchSnapshots.length - 1]!.id : undefined

    await createSnapshot(document, name, activeBranch, '', parentId)
    setSnapshotName('')
    await refreshData()
  }

  const handleCreateBranch = async () => {
    const name = newBranchName.trim()
    if (!name) return

    // Find latest snapshot on current branch to use as starting point
    const branchSnapshots = snapshots.filter((s) => s.branchName === activeBranch)
    let fromSnapshotId: string

    if (branchSnapshots.length > 0) {
      fromSnapshotId = branchSnapshots[branchSnapshots.length - 1]!.id
    } else {
      // Create an initial snapshot first
      const snap = await createSnapshot(document, 'Branch point', activeBranch)
      fromSnapshotId = snap.id
    }

    await createBranch(document.id, name, fromSnapshotId)
    setNewBranchName('')
    setShowNewBranch(false)
    setActiveBranch(name)
    await refreshData()
  }

  const handleDeleteSnapshot = async (id: string) => {
    await deleteSnapshot(id)
    if (selectedSnapshotId === id) {
      setSelectedSnapshotId(null)
      setDiff(null)
    }
    await refreshData()
  }

  const handleSelectSnapshot = async (snapshotId: string) => {
    setSelectedSnapshotId(snapshotId)

    // Diff against the current document by creating a temporary "current" snapshot
    const currentSnapshot: VersionSnapshot = {
      id: 'current',
      name: 'Current',
      description: '',
      timestamp: new Date().toISOString(),
      documentData: JSON.stringify(document),
      branchName: activeBranch,
    }

    const selected = await getSnapshot(snapshotId)
    if (selected) {
      const d = diffSnapshots(selected, currentSnapshot)
      setDiff(d)
    }
  }

  const handleRevert = async (snapshotId: string) => {
    const snapshot = await getSnapshot(snapshotId)
    if (!snapshot) return

    const doc = JSON.parse(snapshot.documentData)
    useEditorStore.setState({
      document: doc,
      history: [],
      historyIndex: -1,
      selection: { layerIds: [] },
      isDirty: true,
    })

    setConfirmRevert(null)
    setSelectedSnapshotId(null)
    setDiff(null)
  }

  const handleMerge = async () => {
    if (!mergeBranchName || mergeBranchName === activeBranch) return

    // Find the head snapshots for both branches
    const sourceBranch = branches.find((b) => b.name === mergeBranchName)
    const targetBranch = branches.find((b) => b.name === activeBranch)

    if (!sourceBranch || !targetBranch) return

    const sourceSnapshot = await getSnapshot(sourceBranch.headSnapshotId)
    const targetSnapshot = await getSnapshot(targetBranch.headSnapshotId)

    if (!sourceSnapshot || !targetSnapshot) return

    // Find common ancestor (use the source's parent if available, otherwise target is base)
    const baseSnapshot = sourceSnapshot.parentId
      ? await getSnapshot(sourceSnapshot.parentId)
      : targetSnapshot

    if (!baseSnapshot) return

    const result = mergeSnapshots(baseSnapshot, sourceSnapshot, targetSnapshot)

    if (result.conflicts.length > 0) {
      setMergeConflicts(result.conflicts)
    } else {
      // Apply merge result
      useEditorStore.setState({
        document: result.merged,
        history: [],
        historyIndex: -1,
        selection: { layerIds: [] },
        isDirty: true,
      })

      // Create a merge snapshot
      await createSnapshot(
        result.merged,
        `Merge ${mergeBranchName} into ${activeBranch}`,
        activeBranch,
      )
      setShowMerge(false)
      setMergeBranchName('')
      await refreshData()
    }
  }

  const handleResolveConflict = (index: number, resolution: 'ours' | 'theirs') => {
    setMergeConflicts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, resolution } : c)),
    )
  }

  const handleApplyResolutions = async () => {
    if (mergeConflicts.some((c) => !c.resolution)) return

    // Re-run merge and apply resolutions
    const sourceBranch = branches.find((b) => b.name === mergeBranchName)
    const targetBranch = branches.find((b) => b.name === activeBranch)
    if (!sourceBranch || !targetBranch) return

    const sourceSnapshot = await getSnapshot(sourceBranch.headSnapshotId)
    const targetSnapshot = await getSnapshot(targetBranch.headSnapshotId)
    if (!sourceSnapshot || !targetSnapshot) return

    const baseSnapshot = sourceSnapshot.parentId
      ? await getSnapshot(sourceSnapshot.parentId)
      : targetSnapshot
    if (!baseSnapshot) return

    const result = mergeSnapshots(baseSnapshot, sourceSnapshot, targetSnapshot)

    // Apply conflict resolutions
    for (const conflict of mergeConflicts) {
      if (!conflict.resolution) continue
      const resolvedLayer = conflict.resolution === 'ours' ? conflict.oursValue : conflict.theirsValue

      for (const artboard of result.merged.artboards) {
        const idx = artboard.layers.findIndex((l) => l.id === conflict.layerId)
        if (idx >= 0) {
          artboard.layers[idx] = JSON.parse(JSON.stringify(resolvedLayer))
          break
        }
      }
    }

    useEditorStore.setState({
      document: result.merged,
      history: [],
      historyIndex: -1,
      selection: { layerIds: [] },
      isDirty: true,
    })

    await createSnapshot(
      result.merged,
      `Merge ${mergeBranchName} into ${activeBranch} (resolved)`,
      activeBranch,
    )
    setMergeConflicts([])
    setShowMerge(false)
    setMergeBranchName('')
    await refreshData()
  }

  const branchSnapshots = snapshots.filter((s) => s.branchName === activeBranch)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flex: 1,
        fontSize: 'var(--font-size-sm)',
      }}
    >
      {/* Branch selector */}
      <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <label style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>Branch:</label>
          <select
            value={activeBranch}
            onChange={(e) => {
              setActiveBranch(e.target.value)
              setSelectedSnapshotId(null)
              setDiff(null)
            }}
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 4px',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <option value="main">main</option>
            {branches
              .filter((b) => b.name !== 'main')
              .map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
          </select>
          <button
            onClick={() => setShowNewBranch(!showNewBranch)}
            title="New branch"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '2px 6px',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            +
          </button>
        </div>

        {showNewBranch && (
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            <input
              type="text"
              placeholder="Branch name..."
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBranch()
              }}
              style={{
                flex: 1,
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                fontSize: 'var(--font-size-sm)',
              }}
            />
            <button
              onClick={handleCreateBranch}
              style={{
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: '#fff',
                cursor: 'pointer',
                padding: '2px 8px',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              Create
            </button>
          </div>
        )}
      </div>

      {/* Create snapshot */}
      <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          <input
            type="text"
            placeholder="Version name..."
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSnapshot()
            }}
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              fontSize: 'var(--font-size-sm)',
            }}
          />
          <button
            onClick={handleCreateSnapshot}
            disabled={!snapshotName.trim()}
            style={{
              background: snapshotName.trim() ? 'var(--accent)' : 'var(--bg-input)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: snapshotName.trim() ? '#fff' : 'var(--text-disabled)',
              cursor: snapshotName.trim() ? 'pointer' : 'default',
              padding: '2px 8px',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Merge button */}
      <div style={{ padding: 'var(--space-1) var(--space-2)', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => setShowMerge(!showMerge)}
          style={{
            width: '100%',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          Merge Branch...
        </button>

        {showMerge && (
          <div style={{ marginTop: 'var(--space-1)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'center' }}>
              <label style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>From:</label>
              <select
                value={mergeBranchName}
                onChange={(e) => setMergeBranchName(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 4px',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <option value="">Select branch...</option>
                {branches
                  .filter((b) => b.name !== activeBranch)
                  .map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={handleMerge}
                disabled={!mergeBranchName}
                style={{
                  background: mergeBranchName ? 'var(--accent)' : 'var(--bg-input)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: mergeBranchName ? '#fff' : 'var(--text-disabled)',
                  cursor: mergeBranchName ? 'pointer' : 'default',
                  padding: '2px 8px',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                Merge
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Merge conflicts */}
      {mergeConflicts.length > 0 && (
        <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: 'var(--space-1)' }}>
            Merge Conflicts ({mergeConflicts.length})
          </div>
          {mergeConflicts.map((conflict, i) => (
            <div
              key={conflict.layerId}
              style={{
                padding: 'var(--space-1)',
                marginBottom: 'var(--space-1)',
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ color: 'var(--text-primary)', marginBottom: 4 }}>
                {conflict.layerName} (Layer)
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                <button
                  onClick={() => handleResolveConflict(i, 'ours')}
                  style={{
                    flex: 1,
                    background: conflict.resolution === 'ours' ? '#22c55e' : 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: conflict.resolution === 'ours' ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  Keep Ours
                </button>
                <button
                  onClick={() => handleResolveConflict(i, 'theirs')}
                  style={{
                    flex: 1,
                    background: conflict.resolution === 'theirs' ? '#3b82f6' : 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-sm)',
                    color: conflict.resolution === 'theirs' ? '#fff' : 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  Keep Theirs
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={handleApplyResolutions}
            disabled={mergeConflicts.some((c) => !c.resolution)}
            style={{
              width: '100%',
              background: mergeConflicts.every((c) => c.resolution) ? 'var(--accent)' : 'var(--bg-input)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: mergeConflicts.every((c) => c.resolution) ? '#fff' : 'var(--text-disabled)',
              cursor: mergeConflicts.every((c) => c.resolution) ? 'pointer' : 'default',
              padding: '4px 8px',
              fontSize: 'var(--font-size-sm)',
              marginTop: 'var(--space-1)',
            }}
          >
            Apply Resolutions
          </button>
        </div>
      )}

      {/* Snapshot timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1)' }}>
        {branchSnapshots.length === 0 && (
          <div style={{ color: 'var(--text-disabled)', padding: 'var(--space-2)', textAlign: 'center' }}>
            No versions saved yet
          </div>
        )}

        {[...branchSnapshots].reverse().map((snapshot) => (
          <div key={snapshot.id} style={{ marginBottom: 2 }}>
            <button
              onClick={() => handleSelectSnapshot(snapshot.id)}
              onMouseEnter={(e) => {
                if (selectedSnapshotId !== snapshot.id)
                  (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (selectedSnapshotId !== snapshot.id)
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                background: selectedSnapshotId === snapshot.id ? 'var(--accent)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                fontSize: 'var(--font-size-sm)',
                color: selectedSnapshotId === snapshot.id ? '#fff' : 'var(--text-primary)',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {snapshot.name}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: selectedSnapshotId === snapshot.id ? 'rgba(255,255,255,0.7)' : 'var(--text-disabled)',
                  }}
                >
                  {new Date(snapshot.timestamp).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmRevert(snapshot.id)
                  }}
                  title="Revert to this version"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: selectedSnapshotId === snapshot.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '12px',
                  }}
                >
                  &#x21A9;
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSnapshot(snapshot.id)
                  }}
                  title="Delete version"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: selectedSnapshotId === snapshot.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: '12px',
                  }}
                >
                  &#x2715;
                </button>
              </div>
            </button>

            {/* Revert confirmation */}
            {confirmRevert === snapshot.id && (
              <div
                style={{
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-sm)',
                  margin: '2px 0',
                  border: '1px solid var(--border-default)',
                }}
              >
                <div style={{ color: 'var(--text-primary)', marginBottom: 4 }}>
                  Revert to &quot;{snapshot.name}&quot;?
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  <button
                    onClick={() => handleRevert(snapshot.id)}
                    style={{
                      flex: 1,
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: '#fff',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    Revert
                  </button>
                  <button
                    onClick={() => setConfirmRevert(null)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Diff view */}
      {diff && selectedSnapshotId && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: 'var(--space-2)',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontWeight: 'bold', marginBottom: 'var(--space-1)' }}>
            Changes since selected version
          </div>

          {diff.addedArtboards.map((ab) => (
            <DiffEntry key={`ab-add-${ab.id}`} kind="added" label={`Artboard: ${ab.name}`} />
          ))}
          {diff.removedArtboards.map((ab) => (
            <DiffEntry key={`ab-rm-${ab.id}`} kind="removed" label={`Artboard: ${ab.name}`} />
          ))}
          {diff.addedLayers.map((entry) => (
            <DiffEntry key={`l-add-${entry.layer.id}`} kind="added" label={`Layer: ${entry.layer.name}`} />
          ))}
          {diff.removedLayers.map((entry) => (
            <DiffEntry key={`l-rm-${entry.layer.id}`} kind="removed" label={`Layer: ${entry.layer.name}`} />
          ))}
          {diff.modifiedLayers.map((entry) => (
            <DiffEntry key={`l-mod-${entry.layerId}`} kind="modified" label={`Layer: ${entry.layerName}`} />
          ))}

          {diff.addedLayers.length === 0 &&
            diff.removedLayers.length === 0 &&
            diff.modifiedLayers.length === 0 &&
            diff.addedArtboards.length === 0 &&
            diff.removedArtboards.length === 0 && (
              <div style={{ color: 'var(--text-disabled)' }}>No changes</div>
            )}
        </div>
      )}
    </div>
  )
}

function DiffEntry({ kind, label }: { kind: 'added' | 'removed' | 'modified'; label: string }) {
  const colors = {
    added: '#22c55e',
    removed: '#ef4444',
    modified: '#f59e0b',
  }
  const prefixes = {
    added: '+',
    removed: '-',
    modified: '~',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '1px 4px',
        fontSize: 'var(--font-size-sm)',
        color: colors[kind],
      }}
    >
      <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{prefixes[kind]}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
