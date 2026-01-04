import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RigManager({ rigs: initialRigs, status, onRefresh }) {
  const [rigs, setRigs] = useState(initialRigs || []);
  const [expandedRig, setExpandedRig] = useState(null);
  const [rigDetails, setRigDetails] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSpawnModal, setShowSpawnModal] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);

  // Form state for create rig
  const [newRigName, setNewRigName] = useState('');
  const [newRigRepoUrl, setNewRigRepoUrl] = useState('');
  const [newRigRemote, setNewRigRemote] = useState('origin');

  // Form state for spawn polecat
  const [spawnName, setSpawnName] = useState('');
  const [spawnIssue, setSpawnIssue] = useState('');

  // Sync with prop updates
  useEffect(() => {
    if (initialRigs) setRigs(initialRigs);
  }, [initialRigs]);

  // Fetch detailed status for a rig
  const fetchRigDetails = useCallback(async (rigName) => {
    if (rigDetails[rigName]?.loading) return;

    setRigDetails(prev => ({ ...prev, [rigName]: { ...prev[rigName], loading: true } }));

    try {
      const [polecatsRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/rigs/${rigName}/polecats`),
        fetch(`${API_BASE}/api/rigs/${rigName}/status`).catch(() => null)
      ]);

      const polecatsData = polecatsRes.ok ? await polecatsRes.json() : { polecats: [] };
      const statusData = statusRes?.ok ? await statusRes.json() : null;

      setRigDetails(prev => ({
        ...prev,
        [rigName]: {
          polecats: polecatsData.polecats || [],
          status: statusData,
          loading: false,
          lastFetch: Date.now()
        }
      }));
    } catch (err) {
      setRigDetails(prev => ({
        ...prev,
        [rigName]: { ...prev[rigName], loading: false, error: err.message }
      }));
    }
  }, [rigDetails]);

  // Fetch details when rig is expanded
  useEffect(() => {
    if (expandedRig && !rigDetails[expandedRig]?.lastFetch) {
      fetchRigDetails(expandedRig);
    }
  }, [expandedRig, rigDetails, fetchRigDetails]);

  // Create new rig
  async function handleCreateRig(e) {
    e.preventDefault();
    if (!newRigName.trim() || !newRigRepoUrl.trim()) return;

    setLoading(prev => ({ ...prev, create: true }));
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/rigs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRigName.trim(),
          repoUrl: newRigRepoUrl.trim(),
          remote: newRigRemote.trim() || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create rig');
      }

      // Reset form and close modal
      setNewRigName('');
      setNewRigRepoUrl('');
      setNewRigRemote('origin');
      setShowCreateModal(false);

      // Refresh rig list
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, create: false }));
    }
  }

  // Spawn polecat
  async function handleSpawnPolecat(e) {
    e.preventDefault();
    if (!showSpawnModal) return;

    setLoading(prev => ({ ...prev, spawn: true }));
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/rigs/${showSpawnModal}/polecat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: spawnName.trim() || undefined,
          issue: spawnIssue.trim() || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to spawn polecat');
      }

      // Reset form and close modal
      setSpawnName('');
      setSpawnIssue('');
      setShowSpawnModal(null);

      // Refresh rig details
      fetchRigDetails(showSpawnModal);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, spawn: false }));
    }
  }

  // Delete rig
  async function handleDeleteRig() {
    if (!showDeleteConfirm) return;

    setLoading(prev => ({ ...prev, delete: true }));
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/rigs/${showDeleteConfirm}?force=true`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete rig');
      }

      setShowDeleteConfirm(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, delete: false }));
    }
  }

  // Get rig status info from town status
  const getRigStatus = (rigName) => {
    return status?.rigs?.find(r => r.name === rigName) || {};
  };

  if (!rigs.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏗️</div>
        <div>No rigs configured</div>
        <button className="btn btn-primary" style={{ marginTop: '16px' }}
          onClick={() => setShowCreateModal(true)}>
          + Add Rig
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Error display */}
      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: '16px', borderRadius: '8px',
          background: '#3a1a1a', border: '1px solid var(--error)', color: 'var(--error)'
        }}>
          {error}
          <button onClick={() => setError(null)} style={{
            float: 'right', background: 'none', border: 'none',
            color: 'var(--error)', cursor: 'pointer'
          }}>×</button>
        </div>
      )}

      {/* Header with Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Rigs ({rigs.length})
        </h3>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + Add Rig
        </button>
      </div>

      {/* Rig Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rigs.map(rig => {
          const rigStatus = getRigStatus(rig.name);
          const isExpanded = expandedRig === rig.name;
          const details = rigDetails[rig.name] || {};
          const runningAgents = rigStatus.agents?.filter(a => a.running)?.length || 0;

          return (
            <div key={rig.name} className="card" style={{
              border: isExpanded ? '1px solid var(--accent)' : undefined
            }}>
              {/* Card Header - Clickable to expand */}
              <div
                style={{
                  padding: '16px', cursor: 'pointer',
                  background: isExpanded ? 'var(--bg-tertiary)' : undefined
                }}
                onClick={() => setExpandedRig(isExpanded ? null : rig.name)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '1.25rem' }}>🏗️</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1rem' }}>{rig.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {rig.polecats || 0} polecats · {rig.crew || 0} crew
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {runningAgents > 0 && (
                      <span className="badge badge-running">
                        <span className="activity-dot activity-green"></span>
                        {runningAgents} running
                      </span>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {details.loading ? (
                    <div className="loading">Loading rig details...</div>
                  ) : (
                    <>
                      {/* Action Buttons */}
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary" onClick={(e) => {
                          e.stopPropagation();
                          setShowSpawnModal(rig.name);
                        }}>
                          🐾 Spawn Polecat
                        </button>
                        <button className="btn btn-secondary" onClick={(e) => {
                          e.stopPropagation();
                          fetchRigDetails(rig.name);
                        }}>
                          🔄 Refresh
                        </button>
                        <button className="btn btn-secondary" onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(rig.name);
                        }} style={{ marginLeft: 'auto', color: 'var(--error)' }}>
                          🗑️ Remove
                        </button>
                      </div>

                      {/* Polecats Section */}
                      <div style={{ padding: '12px 16px' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                          Polecats ({details.polecats?.length || 0})
                        </h4>
                        {details.polecats?.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {details.polecats.map(polecat => (
                              <div key={polecat.name || polecat} style={{
                                padding: '10px 12px', background: 'var(--bg-tertiary)',
                                borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}>
                                <div>
                                  <div style={{ fontWeight: 500 }}>{polecat.name || polecat}</div>
                                  {polecat.branch && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      Branch: {polecat.branch}
                                    </div>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {polecat.running !== undefined && (
                                    <span className={`activity-dot ${polecat.running ? 'activity-green' : 'activity-gray'}`}></span>
                                  )}
                                  {polecat.has_work && <span className="badge badge-in_progress">🪝 Hooked</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            No polecats spawned
                          </div>
                        )}
                      </div>

                      {/* Crew Section */}
                      {rigStatus.crew > 0 && (
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Crew ({rigStatus.crew || 0})
                          </h4>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {rigStatus.crew} crew worker(s) configured
                          </div>
                        </div>
                      )}

                      {/* Agents Section */}
                      {rigStatus.agents?.length > 0 && (
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            Rig Agents
                          </h4>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {rigStatus.agents.map(agent => (
                              <div key={agent.name} style={{
                                padding: '8px 12px', background: 'var(--bg-tertiary)',
                                borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px'
                              }}>
                                <span className={`activity-dot ${agent.running ? 'activity-green' : 'activity-gray'}`}></span>
                                <span style={{ fontSize: '0.85rem' }}>{agent.name}</span>
                                {agent.role && (
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    ({agent.role})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Rig Modal */}
      {showCreateModal && (
        <Modal title="Add New Rig" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreateRig}>
            <div className="form-group">
              <label>Rig Name *</label>
              <input
                value={newRigName}
                onChange={e => setNewRigName(e.target.value)}
                placeholder="e.g., my-project"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Repository URL *</label>
              <input
                value={newRigRepoUrl}
                onChange={e => setNewRigRepoUrl(e.target.value)}
                placeholder="e.g., git@github.com:org/repo.git"
                required
              />
            </div>
            <div className="form-group">
              <label>Remote Name (optional)</label>
              <input
                value={newRigRemote}
                onChange={e => setNewRigRemote(e.target.value)}
                placeholder="origin"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading.create || !newRigName.trim() || !newRigRepoUrl.trim()}>
                {loading.create ? 'Creating...' : 'Create Rig'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Spawn Polecat Modal */}
      {showSpawnModal && (
        <Modal title={`Spawn Polecat in ${showSpawnModal}`} onClose={() => setShowSpawnModal(null)}>
          <form onSubmit={handleSpawnPolecat}>
            <div className="form-group">
              <label>Polecat Name (optional)</label>
              <input
                value={spawnName}
                onChange={e => setSpawnName(e.target.value)}
                placeholder="Auto-generated if empty"
                autoFocus
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Leave empty for random Mad Max-themed name
              </div>
            </div>
            <div className="form-group">
              <label>Sling Issue (optional)</label>
              <input
                value={spawnIssue}
                onChange={e => setSpawnIssue(e.target.value)}
                placeholder="e.g., gt-abc123"
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Issue ID to assign to the new polecat
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSpawnModal(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading.spawn}>
                {loading.spawn ? 'Spawning...' : '🐾 Spawn'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Modal title="Remove Rig" onClose={() => setShowDeleteConfirm(null)}>
          <div style={{ marginBottom: '20px' }}>
            <p style={{ color: 'var(--error)', marginBottom: '12px' }}>
              Are you sure you want to remove <strong>{showDeleteConfirm}</strong>?
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              This will remove the rig configuration and all associated worktrees.
              This action cannot be undone.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDeleteRig}
              disabled={loading.delete}
              style={{ background: 'var(--error)' }}
            >
              {loading.delete ? 'Removing...' : 'Remove Rig'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Reusable Modal component
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px',
        width: '450px', maxWidth: '90%', border: '1px solid var(--border)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.2rem', padding: '4px'
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
