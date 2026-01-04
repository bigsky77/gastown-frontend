import { useState, useEffect } from 'react';

export default function RigManager({ rigs, status, onRefresh }) {
  const [selectedRig, setSelectedRig] = useState(null);
  const [rigDetails, setRigDetails] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [showSpawnModal, setShowSpawnModal] = useState(null);
  const [newRigName, setNewRigName] = useState('');
  const [spawnName, setSpawnName] = useState('');
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);

  // Fetch polecats for a specific rig
  async function fetchRigDetails(rigName) {
    setLoading(prev => ({ ...prev, [rigName]: true }));
    try {
      const [polecatsRes, statusRes] = await Promise.all([
        fetch(`/api/rigs/${rigName}/polecats`),
        fetch(`/api/rigs/${rigName}/status`)
      ]);
      const polecats = polecatsRes.ok ? await polecatsRes.json() : { polecats: [] };
      const rigStatus = statusRes.ok ? await statusRes.json() : {};
      setRigDetails(prev => ({
        ...prev,
        [rigName]: { polecats: polecats.polecats || [], status: rigStatus }
      }));
    } catch (err) {
      console.error('Failed to fetch rig details:', err);
    }
    setLoading(prev => ({ ...prev, [rigName]: false }));
  }

  // Create new rig
  async function handleCreateRig(e) {
    e.preventDefault();
    if (!newRigName.trim()) return;
    setLoading(prev => ({ ...prev, create: true }));
    setError(null);
    try {
      const res = await fetch('/api/rigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRigName.trim() })
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewRigName('');
        onRefresh?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create rig');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(prev => ({ ...prev, create: false }));
  }

  // Delete rig
  async function handleDeleteRig(rigName) {
    setLoading(prev => ({ ...prev, [`delete-${rigName}`]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/rigs/${rigName}`, { method: 'DELETE' });
      if (res.ok) {
        setShowDeleteModal(null);
        setSelectedRig(null);
        onRefresh?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete rig');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(prev => ({ ...prev, [`delete-${rigName}`]: false }));
  }

  // Spawn polecat
  async function handleSpawnPolecat(rigName) {
    if (!spawnName.trim()) return;
    setLoading(prev => ({ ...prev, [`spawn-${rigName}`]: true }));
    setError(null);
    try {
      const res = await fetch(`/api/rigs/${rigName}/polecat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: spawnName.trim() })
      });
      if (res.ok) {
        setShowSpawnModal(null);
        setSpawnName('');
        fetchRigDetails(rigName);
        onRefresh?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to spawn polecat');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(prev => ({ ...prev, [`spawn-${rigName}`]: false }));
  }

  // Expand/collapse rig
  function toggleRig(rigName) {
    if (selectedRig === rigName) {
      setSelectedRig(null);
    } else {
      setSelectedRig(rigName);
      if (!rigDetails[rigName]) {
        fetchRigDetails(rigName);
      }
    }
  }

  // Get status info from parent status prop
  function getRigStatusInfo(rigName) {
    return status?.rigs?.find(r => r.name === rigName) || {};
  }

  if (!rigs?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏗️</div>
        <div>No rigs configured</div>
        <button className="btn btn-primary" style={{ marginTop: '12px' }}
          onClick={() => setShowCreateModal(true)}>
          + Create Rig
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 600 }}>Rigs ({rigs.length})</span>
        <button className="btn btn-sm" onClick={() => setShowCreateModal(true)}>
          + New Rig
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{ padding: '8px 16px', background: 'rgba(255,100,100,0.1)',
          color: 'var(--status-error)', fontSize: '0.875rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '8px', background: 'none',
            border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Rig Cards */}
      {rigs.map(rig => {
        const statusInfo = getRigStatusInfo(rig.name);
        const details = rigDetails[rig.name];
        const isExpanded = selectedRig === rig.name;
        const isLoading = loading[rig.name];
        const runningCount = statusInfo.agents?.filter(a => a.running)?.length || 0;

        return (
          <div key={rig.name} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Rig Header - Clickable */}
            <div onClick={() => toggleRig(rig.name)}
              style={{ padding: '12px 16px', cursor: 'pointer',
                background: isExpanded ? 'var(--bg-secondary)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
                  <span style={{ fontWeight: 600 }}>{rig.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {runningCount > 0 && (
                    <span className="badge badge-running">{runningCount} active</span>
                  )}
                  <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>
                    {rig.polecats || 0} polecats
                  </span>
                  <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>
                    {rig.crew || 0} crew
                  </span>
                </div>
              </div>
              {rig.agents?.length > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)',
                  marginTop: '4px', marginLeft: '20px' }}>
                  Agents: {rig.agents.join(', ')}
                </div>
              )}
            </div>

            {/* Expanded Detail View */}
            {isExpanded && (
              <div style={{ padding: '0 16px 16px', background: 'var(--bg-secondary)' }}>
                {isLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading...
                  </div>
                ) : (
                  <>
                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={(e) => {
                        e.stopPropagation(); setShowSpawnModal(rig.name); }}>
                        🚀 Spawn Polecat
                      </button>
                      <button className="btn btn-sm" onClick={(e) => {
                        e.stopPropagation(); fetchRigDetails(rig.name); }}>
                        🔄 Refresh
                      </button>
                      <button className="btn btn-sm" style={{ marginLeft: 'auto',
                        color: 'var(--status-error)', borderColor: 'var(--status-error)' }}
                        onClick={(e) => { e.stopPropagation(); setShowDeleteModal(rig.name); }}>
                        🗑️ Delete Rig
                      </button>
                    </div>

                    {/* System Agents Section */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
                        marginBottom: '8px', textTransform: 'uppercase' }}>System Agents</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {['witness', 'refinery', 'mayor'].map(agent => {
                          const agentInfo = statusInfo.agents?.find(a => a.name === agent);
                          const isRunning = agentInfo?.running;
                          return (
                            <div key={agent} style={{ padding: '8px 12px', borderRadius: '6px',
                              background: 'var(--bg-tertiary)', display: 'flex',
                              justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ textTransform: 'capitalize' }}>{agent}</span>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%',
                                background: isRunning ? 'var(--status-running)' : 'var(--status-stopped)' }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Polecats Section */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
                        marginBottom: '8px', textTransform: 'uppercase' }}>
                        Polecats ({details?.polecats?.length || 0})
                      </div>
                      {details?.polecats?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {details.polecats.map((p, i) => (
                            <div key={p.name || i} style={{ padding: '8px 12px', borderRadius: '6px',
                              background: 'var(--bg-tertiary)', display: 'flex',
                              justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <span style={{ fontWeight: 500 }}>{p.name}</span>
                                {p.branch && (
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)',
                                    marginLeft: '8px' }}>({p.branch})</span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {p.hooked && (
                                  <span className="badge badge-running" style={{ fontSize: '0.7rem' }}>
                                    hooked
                                  </span>
                                )}
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%',
                                  background: p.running ? 'var(--status-running)' : 'var(--status-stopped)' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ padding: '12px', background: 'var(--bg-tertiary)',
                          borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          No polecats spawned
                        </div>
                      )}
                    </div>

                    {/* Crew Section */}
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)',
                        marginBottom: '8px', textTransform: 'uppercase' }}>
                        Crew Workers ({rig.crew || 0})
                      </div>
                      {rig.crew > 0 ? (
                        <div style={{ padding: '12px', background: 'var(--bg-tertiary)',
                          borderRadius: '6px', fontSize: '0.875rem' }}>
                          {rig.crew} crew worker(s) available
                        </div>
                      ) : (
                        <div style={{ padding: '12px', background: 'var(--bg-tertiary)',
                          borderRadius: '6px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                          No crew workers
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Create Rig Modal */}
      {showCreateModal && (
        <Modal onClose={() => setShowCreateModal(false)} title="Create New Rig">
          <form onSubmit={handleCreateRig}>
            <div className="form-group">
              <label>Rig Name *</label>
              <input value={newRigName} onChange={e => setNewRigName(e.target.value)}
                placeholder="e.g., my-project" required autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading.create}>
                {loading.create ? 'Creating...' : 'Create Rig'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Spawn Polecat Modal */}
      {showSpawnModal && (
        <Modal onClose={() => setShowSpawnModal(null)} title={`Spawn Polecat in ${showSpawnModal}`}>
          <form onSubmit={(e) => { e.preventDefault(); handleSpawnPolecat(showSpawnModal); }}>
            <div className="form-group">
              <label>Polecat Name *</label>
              <input value={spawnName} onChange={e => setSpawnName(e.target.value)}
                placeholder="e.g., worker-1" required autoFocus />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setShowSpawnModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary"
                disabled={loading[`spawn-${showSpawnModal}`]}>
                {loading[`spawn-${showSpawnModal}`] ? 'Spawning...' : '🚀 Spawn'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal onClose={() => setShowDeleteModal(null)} title="Delete Rig">
          <p style={{ marginBottom: '16px' }}>
            Are you sure you want to delete <strong>{showDeleteModal}</strong>?
            This will remove all polecats and crew workers.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => setShowDeleteModal(null)}>
              Cancel
            </button>
            <button className="btn" onClick={() => handleDeleteRig(showDeleteModal)}
              style={{ background: 'var(--status-error)', color: 'white' }}
              disabled={loading[`delete-${showDeleteModal}`]}>
              {loading[`delete-${showDeleteModal}`] ? 'Deleting...' : '🗑️ Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Simple Modal component
function Modal({ children, onClose, title }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: '12px',
        padding: '20px', minWidth: '400px', maxWidth: '90vw' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}
