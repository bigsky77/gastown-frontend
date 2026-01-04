import { useState } from 'react';

export default function AgentList({ status, onNudge }) {
  const [nudgeModal, setNudgeModal] = useState(null);
  const [message, setMessage] = useState('');

  if (!status) return <div className="empty-state"><div>Loading status...</div></div>;

  const agents = [];

  // Core agents
  status.agents?.forEach(a => agents.push({ ...a, type: 'core' }));

  // Rig agents
  status.rigs?.forEach(rig => {
    rig.agents?.forEach(a => agents.push({ ...a, rig: rig.name, type: 'rig' }));
  });

  async function handleNudge(e) {
    e.preventDefault();
    if (!message.trim()) return;
    await onNudge(nudgeModal.address, message);
    setNudgeModal(null);
    setMessage('');
  }

  return (
    <div>
      {/* Nudge Modal */}
      {nudgeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setNudgeModal(null)}>
          <div style={{
            background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px',
            width: '400px', maxWidth: '90%'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '16px' }}>Nudge {nudgeModal.name}</h3>
            <form onSubmit={handleNudge}>
              <div className="form-group">
                <label>Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="What do you want to tell this agent?" rows={4} autoFocus />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setNudgeModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!message.trim()}>
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Role</th>
            <th>Status</th>
            <th>Work</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.address || agent.name}>
              <td>
                <div style={{ fontWeight: 500 }}>{agent.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{agent.address}</div>
              </td>
              <td>{agent.role || agent.type}</td>
              <td>
                <span className={`activity-dot ${agent.running ? 'activity-green' : 'activity-gray'}`}></span>
                {agent.running ? 'Running' : 'Stopped'}
              </td>
              <td>{agent.has_work ? '🪝 Hooked' : '-'}</td>
              <td>
                {agent.running && (
                  <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                    onClick={() => setNudgeModal(agent)}>
                    👋 Nudge
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
