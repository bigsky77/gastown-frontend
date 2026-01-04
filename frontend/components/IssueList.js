import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function IssueList({ issues, rigs, onSling }) {
  const [slingModal, setSlingModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [target, setTarget] = useState('');

  if (!issues.length) {
    return <div className="empty-state"><div className="empty-state-icon">📋</div><div>No open issues</div></div>;
  }

  async function handleSling(e) {
    e.preventDefault();
    if (!target) return;
    await onSling(slingModal.id, target);
    setSlingModal(null);
    setTarget('');
  }

  async function handleViewIssue(issue) {
    setViewLoading(true);
    setViewModal({ ...issue, loading: true });
    try {
      const res = await fetch(`${API_URL}/api/issues/${issue.id}`);
      const data = await res.json();
      setViewModal({ ...issue, ...data, loading: false });
    } catch (err) {
      setViewModal({ ...issue, error: err.message, loading: false });
    }
    setViewLoading(false);
  }

  return (
    <div>
      {/* View Issue Modal */}
      {viewModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setViewModal(null)}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px',
            width: '600px', maxWidth: '90%', maxHeight: '80vh', overflow: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ marginBottom: '4px' }}>{viewModal.title}</h3>
                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--accent)' }}>{viewModal.id}</span>
              </div>
              <button onClick={() => setViewModal(null)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem'
              }}>×</button>
            </div>

            {viewModal.loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
            ) : viewModal.error ? (
              <div style={{ padding: '20px', color: 'var(--error)' }}>Error: {viewModal.error}</div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</div>
                    <div>{viewModal.type || viewModal.issue_type || 'task'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Priority</div>
                    <div>P{viewModal.priority ?? 2}</div>
                  </div>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Status</div>
                    <div><span className={`badge badge-${viewModal.status}`}>{viewModal.status}</span></div>
                  </div>
                  <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Assignee</div>
                    <div>{viewModal.assignee || '-'}</div>
                  </div>
                </div>

                {viewModal.description && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Description</div>
                    <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '8px', whiteSpace: 'pre-wrap' }}>
                      {viewModal.description}
                    </div>
                  </div>
                )}

                {(viewModal.depends_on?.length > 0 || viewModal.blocked_by?.length > 0) && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Dependencies</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {(viewModal.depends_on || viewModal.blocked_by || []).map((dep, i) => {
                        const depId = typeof dep === 'string' ? dep : dep.id;
                        return (
                          <span key={i} style={{
                            background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px',
                            fontFamily: 'monospace', fontSize: '0.85rem'
                          }}>
                            {depId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {viewModal.blocks?.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Blocks</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {viewModal.blocks.map((blocked, i) => {
                        const blockedId = typeof blocked === 'string' ? blocked : blocked.id;
                        return (
                          <span key={i} style={{
                            background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px',
                            fontFamily: 'monospace', fontSize: '0.85rem'
                          }}>
                            {blockedId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                  <button className="btn btn-secondary" onClick={() => setViewModal(null)}>Close</button>
                  <button className="btn btn-primary" onClick={() => { setViewModal(null); setSlingModal(viewModal); }}>
                    Sling
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sling Modal */}
      {slingModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setSlingModal(null)}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px',
            width: '400px', maxWidth: '90%'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px' }}>Sling: {slingModal.title}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {slingModal.id}
            </p>
            <form onSubmit={handleSling}>
              <div className="form-group">
                <label>Target</label>
                <select value={target} onChange={e => setTarget(e.target.value)} autoFocus>
                  <option value="">Select target...</option>
                  {rigs?.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSlingModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!target}>
                  Sling
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {issues.map(issue => (
            <tr key={issue.id} style={{ cursor: 'pointer' }} onClick={() => handleViewIssue(issue)}>
              <td><span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{issue.id}</span></td>
              <td style={{ color: 'var(--accent)' }}>{issue.title}</td>
              <td>{issue.type || issue.issue_type || 'task'}</td>
              <td>P{issue.priority ?? 2}</td>
              <td><span className={`badge badge-${issue.status}`}>{issue.status}</span></td>
              <td>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  onClick={(e) => { e.stopPropagation(); setSlingModal(issue); }}>
                  Sling
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
