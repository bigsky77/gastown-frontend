import { useState, useEffect, useCallback } from 'react';

export default function MergeQueue({ rig, onRetry, onReject, refreshInterval = 10000 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [reason, setReason] = useState('');

  const fetchQueue = useCallback(async () => {
    if (!rig) return;
    try {
      const res = await fetch(`/api/rigs/${rig}/mq`);
      if (!res.ok) throw new Error('Failed to fetch merge queue');
      const data = await res.json();
      setItems(data.items || data.merge_requests || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [rig]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchQueue, refreshInterval]);

  async function handleRetry(id) {
    try {
      await onRetry?.(rig, id);
      fetchQueue();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    try {
      await onReject?.(rig, rejectModal.id, reason);
      setRejectModal(null);
      setReason('');
      fetchQueue();
    } catch (err) {
      console.error('Reject failed:', err);
    }
  }

  function getStatusClass(status) {
    switch (status?.toLowerCase()) {
      case 'ready': return 'badge-ready';
      case 'in_progress': case 'merging': return 'badge-in_progress';
      case 'blocked': case 'conflict': return 'badge-blocked';
      case 'failed': return 'badge-failed';
      default: return '';
    }
  }

  function formatAge(age) {
    if (!age) return '-';
    // Age might come as string like "5m" or number of seconds
    if (typeof age === 'string') return age;
    const mins = Math.floor(age / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }

  function hasConflict(item) {
    return item.status?.toLowerCase() === 'conflict' ||
           item.status?.toLowerCase() === 'blocked' ||
           item.has_conflict;
  }

  if (!rig) {
    return <div className="empty-state"><div>Select a rig to view merge queue</div></div>;
  }

  if (loading) {
    return <div className="empty-state"><div>Loading merge queue...</div></div>;
  }

  if (error) {
    return <div className="empty-state"><div style={{ color: 'var(--danger)' }}>Error: {error}</div></div>;
  }

  if (!items.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📥</div>
        <div>Merge queue is empty</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No pending merge requests</div>
      </div>
    );
  }

  return (
    <div>
      {/* Reject Modal */}
      {rejectModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setRejectModal(null)}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px',
            width: '400px', maxWidth: '90%'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '8px' }}>Reject: {rejectModal.id}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {rejectModal.branch}
            </p>
            <form onSubmit={handleReject}>
              <div className="form-group">
                <label>Reason (optional)</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Why is this being rejected?" rows={3} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRejectModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn" style={{ background: 'var(--danger)', color: 'white' }}>
                  ❌ Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {items.length} item{items.length !== 1 ? 's' : ''} in queue
        </span>
        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={fetchQueue}>
          🔄 Refresh
        </button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Branch</th>
            <th>Worker</th>
            <th>Status</th>
            <th>Age</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id}>
              <td>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{item.id}</span>
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.branch}</span>
                  {hasConflict(item) && (
                    <span title="Has conflicts" style={{ color: 'var(--warning)' }}>⚠️</span>
                  )}
                </div>
              </td>
              <td>{item.worker || item.polecat || '-'}</td>
              <td>
                <span className={`badge ${getStatusClass(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td style={{ color: 'var(--text-muted)' }}>{formatAge(item.age)}</td>
              <td>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(item.status === 'failed' || item.status === 'blocked') && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                      onClick={() => handleRetry(item.id)}
                      title="Retry merge"
                    >
                      🔄 Retry
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                    onClick={() => setRejectModal(item)}
                    title="Reject merge request"
                  >
                    ❌ Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <style jsx>{`
        .badge-ready { background: var(--success); color: white; }
        .badge-in_progress { background: var(--info); color: white; }
        .badge-blocked { background: var(--warning); color: black; }
        .badge-failed { background: var(--danger); color: white; }
      `}</style>
    </div>
  );
}
