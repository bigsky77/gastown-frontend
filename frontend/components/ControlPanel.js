import { useState } from 'react';

export default function ControlPanel({ rigs, issues, onCreateIssue, onSling, onQuickWork, onNudge, status }) {
  const [mode, setMode] = useState('quick'); // quick, create, sling, nudge
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('task');
  const [priority, setPriority] = useState('2');
  const [target, setTarget] = useState('');
  const [issueId, setIssueId] = useState('');
  const [nudgeTarget, setNudgeTarget] = useState('');
  const [nudgeMessage, setNudgeMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleQuickWork(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onQuickWork(title, description, target || undefined, type, parseInt(priority));
    setTitle(''); setDescription('');
    setSubmitting(false);
  }

  async function handleCreateIssue(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onCreateIssue(title, description, type, priority);
    setTitle(''); setDescription('');
    setSubmitting(false);
  }

  async function handleSling(e) {
    e.preventDefault();
    if (!issueId || !target) return;
    setSubmitting(true);
    await onSling(issueId, target);
    setIssueId('');
    setSubmitting(false);
  }

  async function handleNudge(e) {
    e.preventDefault();
    if (!nudgeTarget || !nudgeMessage) return;
    setSubmitting(true);
    await onNudge(nudgeTarget, nudgeMessage);
    setNudgeMessage('');
    setSubmitting(false);
  }

  // Get all agents for nudge target
  const allAgents = [];
  if (status?.agents) {
    status.agents.forEach(a => allAgents.push({ name: a.name, address: a.address, running: a.running }));
  }
  if (status?.rigs) {
    status.rigs.forEach(rig => {
      rig.agents?.forEach(a => allAgents.push({ name: `${rig.name}/${a.name}`, address: a.address, running: a.running }));
      rig.hooks?.forEach(h => {
        if (!allAgents.find(a => a.address === h.agent)) {
          allAgents.push({ name: h.agent, address: h.agent, running: false });
        }
      });
    });
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Mode Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { id: 'quick', label: '⚡ Quick Task', desc: 'Create & dispatch' },
          { id: 'create', label: '📝 Create Issue', desc: 'Just create' },
          { id: 'sling', label: '🎯 Sling Work', desc: 'Dispatch existing' },
          { id: 'nudge', label: '👋 Nudge Agent', desc: 'Send message' }
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{
              flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: '8px',
              background: mode === m.id ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: mode === m.id ? 'var(--bg-primary)' : 'var(--text-primary)',
              cursor: 'pointer', textAlign: 'left'
            }}>
            <div style={{ fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Quick Task Form */}
      {mode === 'quick' && (
        <form onSubmit={handleQuickWork}>
          <div className="form-group">
            <label>Task Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?" required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Details, requirements, context..." rows={3} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="task">Task</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="0">P0 - Critical</option>
                <option value="1">P1 - High</option>
                <option value="2">P2 - Medium</option>
                <option value="3">P3 - Low</option>
              </select>
            </div>
            <div className="form-group">
              <label>Target Rig (optional)</label>
              <select value={target} onChange={e => setTarget(e.target.value)}>
                <option value="">Don't dispatch yet</option>
                {rigs.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}
            style={{ width: '100%', marginTop: '8px' }}>
            {submitting ? 'Creating...' : target ? '⚡ Create & Dispatch' : '📝 Create Task'}
          </button>
        </form>
      )}

      {/* Create Issue Form */}
      {mode === 'create' && (
        <form onSubmit={handleCreateIssue}>
          <div className="form-group">
            <label>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Issue title" required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value)}>
                <option value="task">Task</option>
                <option value="bug">Bug</option>
                <option value="feature">Feature</option>
                <option value="epic">Epic</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="0">P0</option>
                <option value="1">P1</option>
                <option value="2">P2</option>
                <option value="3">P3</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Creating...' : 'Create Issue'}
          </button>
        </form>
      )}

      {/* Sling Form */}
      {mode === 'sling' && (
        <form onSubmit={handleSling}>
          <div className="form-group">
            <label>Issue ID *</label>
            <select value={issueId} onChange={e => setIssueId(e.target.value)} required>
              <option value="">Select issue...</option>
              {issues.map(i => <option key={i.id} value={i.id}>{i.id} - {i.title}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Target *</label>
            <select value={target} onChange={e => setTarget(e.target.value)} required>
              <option value="">Select target...</option>
              {rigs.map(r => <option key={r.name} value={r.name}>{r.name} (spawn polecat)</option>)}
              <option value="mayor">Mayor (self)</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting || !issueId || !target}
            style={{ width: '100%' }}>
            {submitting ? 'Slinging...' : '🎯 Sling Work'}
          </button>
        </form>
      )}

      {/* Nudge Form */}
      {mode === 'nudge' && (
        <form onSubmit={handleNudge}>
          <div className="form-group">
            <label>Agent *</label>
            <select value={nudgeTarget} onChange={e => setNudgeTarget(e.target.value)} required>
              <option value="">Select agent...</option>
              {allAgents.filter(a => a.running).map(a => (
                <option key={a.address} value={a.address}>
                  {a.name} {a.running ? '(running)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Message *</label>
            <textarea value={nudgeMessage} onChange={e => setNudgeMessage(e.target.value)}
              placeholder="Message to send to the agent..." rows={3} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting || !nudgeTarget || !nudgeMessage}
            style={{ width: '100%' }}>
            {submitting ? 'Sending...' : '👋 Send Nudge'}
          </button>
        </form>
      )}
    </div>
  );
}
