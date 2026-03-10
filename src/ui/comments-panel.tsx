import { useState } from 'react'
import { useEditorStore } from '@/store/editor.store'
import { v4 as uuid } from 'uuid'
import type { Comment } from '@/types'

type Filter = 'all' | 'unresolved' | 'resolved'

export function CommentsPanel() {
  const comments = useEditorStore((s) => s.document.comments ?? [])
  const selectedCommentId = useEditorStore((s) => s.selectedCommentId)
  const selectComment = useEditorStore((s) => s.selectComment)
  const resolveComment = useEditorStore((s) => s.resolveComment)
  const removeComment = useEditorStore((s) => s.removeComment)
  const addReply = useEditorStore((s) => s.addReply)
  const setPan = useEditorStore((s) => s.setPan)
  const viewport = useEditorStore((s) => s.viewport)

  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({})

  const filtered = comments.filter((c) => {
    if (filter === 'unresolved') return !c.resolved
    if (filter === 'resolved') return c.resolved
    return true
  })

  function panToComment(comment: Comment) {
    selectComment(comment.id)
    // Center viewport on comment position
    const canvas = document.getElementById('canvas')
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const newPanX = rect.width / 2 - comment.x * viewport.zoom
      const newPanY = rect.height / 2 - comment.y * viewport.zoom
      setPan(newPanX, newPanY)
    }
  }

  function handleReply(commentId: string) {
    const text = replyTexts[commentId]?.trim()
    if (!text) return
    addReply(commentId, {
      id: uuid(),
      author: 'You',
      text,
      createdAt: new Date().toISOString(),
    })
    setReplyTexts((prev) => ({ ...prev, [commentId]: '' }))
  }

  function formatDate(iso: string): string {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
      return iso
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          padding: 'var(--space-2)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {(['all', 'unresolved', 'resolved'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flex: 1,
              padding: '4px 8px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: filter === f ? 600 : 400,
              color: filter === f ? '#fff' : 'var(--text-secondary)',
              background: filter === f ? 'var(--accent)' : 'var(--bg-hover)',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'all' && ` (${comments.length})`}
            {f === 'unresolved' && ` (${comments.filter((c) => !c.resolved).length})`}
            {f === 'resolved' && ` (${comments.filter((c) => c.resolved).length})`}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-1)' }}>
        {filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-4)',
              color: 'var(--text-tertiary)',
              fontSize: 12,
            }}
          >
            {comments.length === 0
              ? 'No comments yet. Use the Comment tool (C) to add one.'
              : 'No comments match this filter.'}
          </div>
        )}
        {filtered.map((comment) => {
          const isExpanded = expandedId === comment.id
          const isSelected = selectedCommentId === comment.id
          const pinNumber = comments.indexOf(comment) + 1

          return (
            <div
              key={comment.id}
              style={{
                marginBottom: 'var(--space-1)',
                borderRadius: 'var(--radius-md)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                background: isSelected ? 'var(--bg-hover)' : 'var(--bg-surface)',
                overflow: 'hidden',
              }}
            >
              {/* Comment header */}
              <div
                onClick={() => panToComment(comment)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2)',
                  cursor: 'pointer',
                }}
              >
                {/* Pin badge */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: comment.resolved ? '#4caf50' : '#ffc107',
                    color: comment.resolved ? '#fff' : '#333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {pinNumber}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                      {comment.author}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{formatDate(comment.createdAt)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    }}
                  >
                    {comment.text}
                  </div>
                  {comment.replies.length > 0 && !isExpanded && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-1)',
                  padding: '0 var(--space-2) var(--space-1)',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpandedId(isExpanded ? null : comment.id)
                  }}
                  style={{
                    padding: '2px 6px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  {isExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    resolveComment(comment.id)
                  }}
                  style={{
                    padding: '2px 6px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: comment.resolved ? '#4caf50' : 'var(--bg-hover)',
                    color: comment.resolved ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  {comment.resolved ? 'Unresolve' : 'Resolve'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeComment(comment.id)
                  }}
                  style={{
                    padding: '2px 6px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-hover)',
                    color: '#f44336',
                    cursor: 'pointer',
                    fontSize: 10,
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Expanded thread */}
              {isExpanded && (
                <div
                  style={{
                    borderTop: '1px solid var(--border-subtle)',
                    padding: 'var(--space-2)',
                  }}
                >
                  {/* Replies */}
                  {comment.replies.map((reply) => (
                    <div
                      key={reply.id}
                      style={{
                        padding: 'var(--space-1) 0',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 2,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)' }}>
                          {reply.author}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                          {formatDate(reply.createdAt)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{reply.text}</div>
                    </div>
                  ))}

                  {/* Reply input */}
                  <div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
                    <input
                      type="text"
                      placeholder="Reply..."
                      value={replyTexts[comment.id] ?? ''}
                      onChange={(e) => setReplyTexts((prev) => ({ ...prev, [comment.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleReply(comment.id)
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-input)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => handleReply(comment.id)}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
