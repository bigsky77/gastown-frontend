import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function IssueDetail({ issue, onClose, onUpdate, onIssueClick }) {
  const [detail, setDetail] = useState(null);
  const [deps, setDeps] = useState({ blockedBy: [], blocks: [] });
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    if (issue?.id) {
      fetchDetails();
    }
  }, [issue?.id]);

  async function fetchDetails() {
    setLoading(true);
    await Promise.all([
      fetchIssueDetail(),
      fetchDeps(),
      fetchComments()
    ]);
    setLoading(false);
  }

  async function fetchIssueDetail() {
    try {
      const res = await fetch(`${API_URL}/api/issues/${issue.id}`);
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      console.error('Failed to fetch issue detail:', err);
    }
  }

  async function fetchDeps() {
    try {
      const res = await fetch(`${API_URL}/api/deps/${issue.id}`);
      const data = await res.json();
      setDeps(data);
    } catch (err) {
      console.error('Failed to fetch deps:', err);
    }
  }

  async function fetchComments() {
    try {
      const res = await fetch(`${API_URL}/api/issues/${issue.id}/comments`);
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/issues/${issue.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newComment })
      });
      setNewComment('');
      fetchComments();
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
    setSubmitting(false);
  }

  async function handleUpdateField(field, value) {
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      fetchIssueDetail();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update issue:', err);
    }
    setEditing(null);
    setSubmitting(false);
  }

  async function handleClose() {
    if (!confirm('Close this issue?')) return;
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/issues/${issue.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      onUpdate?.();
      onClose?.();
    } catch (err) {
      console.error('Failed to close issue:', err);
    }
    setSubmitting(false);
  }

  async function handleReopen() {
    setSubmitting(true);
    try {
      await fetch(`${API_URL}/api/issues/${issue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' })
      });
      fetchIssueDetail();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to reopen issue:', err);
    }
    setSubmitting(false);
  }

  if (!issue) return null;

  const data = detail || issue;
  const isClosed = data.status === 'closed';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '600px',
        maxWidth: '100%',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div style={{ flex: 1, marginRight: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: '0.85rem' }}>
                {data.id}
              </span>
              <span className={`badge badge-${data.status}`}>{data.status}</span>
            </div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.3 }}>
              {data.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)'
        }}>
          {['details', 'comments', 'deps'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 12px',
                border: 'none',
                borderRadius: '4px',
                background: activeTab === tab ? 'var(--bg-secondary)' : 'transparent',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500
              }}
            >
              {tab === 'deps' ? 'Dependencies' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'comments' && comments.length > 0 && (
                <span style={{ marginLeft: '4px', opacity: 0.7 }}>({comments.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <>
              {activeTab === 'details' && (
                <div>
                  {/* Metadata */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '16px',
                    marginBottom: '24px'
                  }}>
                    {/* Type */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Type
                      </label>
                      <span style={{ fontSize: '0.9rem' }}>{data.type || data.issue_type || 'task'}</span>
                    </div>

                    {/* Priority */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Priority
                      </label>
                      {editing === 'priority' ? (
                        <select
                          value={editValues.priority ?? data.priority ?? 2}
                          onChange={e => setEditValues({ ...editValues, priority: parseInt(e.target.value) })}
                          onBlur={() => handleUpdateField('priority', editValues.priority)}
                          autoFocus
                          style={{ padding: '4px 8px' }}
                        >
                          <option value="0">P0 - Critical</option>
                          <option value="1">P1 - High</option>
                          <option value="2">P2 - Medium</option>
                          <option value="3">P3 - Low</option>
                        </select>
                      ) : (
                        <span
                          onClick={() => {
                            setEditing('priority');
                            setEditValues({ priority: data.priority ?? 2 });
                          }}
                          style={{ fontSize: '0.9rem', cursor: 'pointer' }}
                        >
                          P{data.priority ?? 2}
                        </span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Status
                      </label>
                      {editing === 'status' ? (
                        <select
                          value={editValues.status ?? data.status}
                          onChange={e => setEditValues({ ...editValues, status: e.target.value })}
                          onBlur={() => handleUpdateField('status', editValues.status)}
                          autoFocus
                          style={{ padding: '4px 8px' }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="closed">Closed</option>
                        </select>
                      ) : (
                        <span
                          onClick={() => {
                            setEditing('status');
                            setEditValues({ status: data.status });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <span className={`badge badge-${data.status}`}>{data.status}</span>
                        </span>
                      )}
                    </div>

                    {/* Assignee */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Assignee
                      </label>
                      {editing === 'assignee' ? (
                        <input
                          type="text"
                          value={editValues.assignee ?? data.assignee ?? ''}
                          onChange={e => setEditValues({ ...editValues, assignee: e.target.value })}
                          onBlur={() => handleUpdateField('assignee', editValues.assignee)}
                          onKeyDown={e => e.key === 'Enter' && handleUpdateField('assignee', editValues.assignee)}
                          autoFocus
                          placeholder="Enter assignee..."
                          style={{ padding: '4px 8px' }}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditing('assignee');
                            setEditValues({ assignee: data.assignee ?? '' });
                          }}
                          style={{ fontSize: '0.9rem', cursor: 'pointer', color: data.assignee ? 'inherit' : 'var(--text-muted)' }}
                        >
                          {data.assignee || 'Unassigned'}
                        </span>
                      )}
                    </div>

                    {/* Created */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Created
                      </label>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {data.created_at ? new Date(data.created_at).toLocaleString() : 'Unknown'}
                      </span>
                    </div>

                    {/* Updated */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Updated
                      </label>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {data.updated_at ? new Date(data.updated_at).toLocaleString() : 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Description
                    </label>
                    <div style={{
                      padding: '12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap'
                    }}>
                      {data.description || <span style={{ color: 'var(--text-muted)' }}>No description</span>}
                    </div>
                  </div>

                  {/* Notes */}
                  {data.notes && (
                    <div style={{ marginBottom: '24px' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Notes
                      </label>
                      <div style={{
                        padding: '12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap'
                      }}>
                        {data.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'comments' && (
                <div>
                  {/* Comment Form */}
                  <form onSubmit={handleAddComment} style={{ marginBottom: '20px' }}>
                    <textarea
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      placeholder="Add a comment..."
                      rows={3}
                      style={{ marginBottom: '8px' }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting || !newComment.trim()}
                      style={{ width: '100%' }}
                    >
                      {submitting ? 'Adding...' : 'Add Comment'}
                    </button>
                  </form>

                  {/* Comments List */}
                  {comments.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                      No comments yet
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {comments.map((comment, i) => (
                        <div
                          key={comment.id || i}
                          style={{
                            padding: '12px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '6px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>
                              {comment.author || 'Unknown'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {comment.text || comment.content || comment.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'deps' && (
                <div>
                  {/* Blocked By */}
                  <div style={{ marginBottom: '24px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase'
                    }}>
                      Blocked By ({deps.blockedBy?.length || 0})
                    </label>
                    {deps.blockedBy?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {deps.blockedBy.map((dep, i) => (
                          <div
                            key={dep.id || i}
                            onClick={() => onIssueClick?.(dep)}
                            style={{
                              padding: '10px 12px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <span style={{ color: 'var(--error)' }}>&#x1F6D1;</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: '0.85rem' }}>
                              {dep.id}
                            </span>
                            <span style={{ flex: 1 }}>{dep.title}</span>
                            <span className={`badge badge-${dep.status}`}>{dep.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        No blockers
                      </div>
                    )}
                  </div>

                  {/* Blocks */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase'
                    }}>
                      Blocks ({deps.blocks?.length || 0})
                    </label>
                    {deps.blocks?.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {deps.blocks.map((dep, i) => (
                          <div
                            key={dep.id || i}
                            onClick={() => onIssueClick?.(dep)}
                            style={{
                              padding: '10px 12px',
                              background: 'var(--bg-tertiary)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <span style={{ color: 'var(--warning)' }}>&#x26A0;</span>
                            <span style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: '0.85rem' }}>
                              {dep.id}
                            </span>
                            <span style={{ flex: 1 }}>{dep.title}</span>
                            <span className={`badge badge-${dep.status}`}>{dep.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Not blocking any issues
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '8px'
        }}>
          {isClosed ? (
            <button
              className="btn btn-secondary"
              onClick={handleReopen}
              disabled={submitting}
              style={{ flex: 1 }}
            >
              Reopen Issue
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleClose}
              disabled={submitting}
              style={{ flex: 1 }}
            >
              Close Issue
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
