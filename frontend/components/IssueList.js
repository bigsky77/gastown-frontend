import { useState } from 'react';

export default function IssueList({ issues, rigs, onSling, onIssueClick }) {
  const [slingModal, setSlingModal] = useState(null);
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

  return (
    <div>
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
                  🎯 Sling
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
            <tr key={issue.id} style={{ cursor: 'pointer' }} onClick={() => onIssueClick?.(issue)}>
              <td><span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{issue.id}</span></td>
              <td>{issue.title}</td>
              <td>{issue.type || issue.issue_type || 'task'}</td>
              <td>P{issue.priority ?? 2}</td>
              <td><span className={`badge badge-${issue.status}`}>{issue.status}</span></td>
              <td>
                <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                  onClick={(e) => { e.stopPropagation(); setSlingModal(issue); }}>
                  🎯 Sling
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
