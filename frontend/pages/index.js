import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import IssueDetail from '../components/IssueDetail';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

// Activity color mapping
function getActivityClass(colorClass) {
  switch (colorClass) {
    case 'green': return 'activity-green';
    case 'yellow': return 'activity-yellow';
    case 'red': return 'activity-red';
    default: return 'activity-gray';
  }
}

// Event type styling
const EVENT_STYLES = {
  sling: { icon: '🎯', bg: '#1a2a3a' },
  hook: { icon: '🪝', bg: '#2a2a1a' },
  mail: { icon: '📬', bg: '#1a3a2a' },
  nudge: { icon: '👋', bg: '#2a1a3a' },
  session_start: { icon: '🚀', bg: '#1a3a3a' },
  convoy_created: { icon: '🚛', bg: '#3a2a1a' },
  issue_closed: { icon: '✅', bg: '#1a3a1a' },
  default: { icon: '📋', bg: '#2a2a2a' }
};

function getEventStyle(type) {
  return EVENT_STYLES[type] || EVENT_STYLES.default;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('control');
  const [convoys, setConvoys] = useState([]);
  const [issues, setIssues] = useState([]);
  const [mail, setMail] = useState([]);
  const [events, setEvents] = useState([]);
  const [rigs, setRigs] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);

  const wsRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchAll();
    connectWebSocket();
    return () => wsRef.current?.close();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchConvoys(),
      fetchIssues(),
      fetchMail(),
      fetchEvents(),
      fetchRigs(),
      fetchStatus()
    ]);
    setLoading(false);
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${API_URL}/api/status`);
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }

  async function fetchConvoys() {
    try {
      const res = await fetch(`${API_URL}/api/convoys`);
      const data = await res.json();
      setConvoys(data.convoys || data || []);
    } catch (err) {
      console.error('Failed to fetch convoys:', err);
    }
  }

  async function fetchIssues() {
    try {
      const res = await fetch(`${API_URL}/api/issues?status=open`);
      const data = await res.json();
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch issues:', err);
    }
  }

  async function fetchMail() {
    try {
      const res = await fetch(`${API_URL}/api/mail/inbox`);
      const data = await res.json();
      setMail(data.messages || []);
    } catch (err) {
      console.error('Failed to fetch mail:', err);
    }
  }

  async function fetchEvents() {
    try {
      const res = await fetch(`${API_URL}/api/events?limit=30`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  }

  async function fetchRigs() {
    try {
      const res = await fetch(`${API_URL}/api/rigs`);
      const data = await res.json();
      setRigs(data.rigs || data || []);
    } catch (err) {
      console.error('Failed to fetch rigs:', err);
    }
  }

  function connectWebSocket() {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'convoys') setConvoys(msg.data.convoys || msg.data || []);
          if (msg.type === 'event') setEvents(prev => [msg.data, ...prev.slice(0, 29)]);
          if (msg.type === 'status') setStatus(msg.data);
        } catch (err) {}
      };
      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };
    } catch (err) {
      setTimeout(connectWebSocket, 3000);
    }
  }

  // API Actions
  async function createIssue(title, description, type, priority) {
    try {
      const res = await fetch(`${API_URL}/api/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, type, priority: parseInt(priority) })
      });
      const data = await res.json();
      setActionResult({ success: true, message: `Created issue ${data.id}`, data });
      fetchIssues();
      return data;
    } catch (err) {
      setActionResult({ success: false, message: err.message });
      return null;
    }
  }

  async function slingIssue(issueId, target, naked = false) {
    try {
      const res = await fetch(`${API_URL}/api/sling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: issueId, rig: target, naked })
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ success: true, message: `Slung ${issueId} to ${target}`, data });
        fetchConvoys();
        fetchEvents();
      } else {
        setActionResult({ success: false, message: data.error });
      }
      return data;
    } catch (err) {
      setActionResult({ success: false, message: err.message });
      return null;
    }
  }

  async function nudgeAgent(target, message) {
    try {
      const res = await fetch(`${API_URL}/api/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message })
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ success: true, message: `Nudged ${target}` });
      } else {
        setActionResult({ success: false, message: data.error });
      }
      return data;
    } catch (err) {
      setActionResult({ success: false, message: err.message });
      return null;
    }
  }

  async function quickWork(title, description, target, type = 'task', priority = 2) {
    try {
      const res = await fetch(`${API_URL}/api/work/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, target, type, priority })
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({
          success: true,
          message: `Created ${data.issue?.id}${data.slung ? ` and slung to ${target}` : ''}`,
          data
        });
        fetchIssues();
        fetchConvoys();
      } else {
        setActionResult({ success: false, message: data.error || 'Failed' });
      }
      return data;
    } catch (err) {
      setActionResult({ success: false, message: err.message });
      return null;
    }
  }

  // Stats
  const openIssues = issues.filter(i => i.status === 'open').length;
  const inProgress = issues.filter(i => i.status === 'in_progress').length;
  const activeConvoys = convoys.filter(c => c.status === 'open').length;
  const runningAgents = status?.agents?.filter(a => a.running)?.length || 0;

  return (
    <>
      <Head>
        <title>Gas Town Control</title>
      </Head>

      <header className="header">
        <h1><span>Gas Town</span> Control Center</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`activity-dot ${wsConnected ? 'activity-green' : 'activity-red'}`}></span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {wsConnected ? 'Live' : 'Reconnecting...'}
          </span>
          <button className="btn btn-secondary" onClick={fetchAll}>Refresh</button>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{runningAgents}</span>
          <span className="stat-label">Agents Running</span>
        </div>
        <div className="stat">
          <span className="stat-value">{activeConvoys}</span>
          <span className="stat-label">Active Convoys</span>
        </div>
        <div className="stat">
          <span className="stat-value">{openIssues}</span>
          <span className="stat-label">Open Issues</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rigs.length}</span>
          <span className="stat-label">Rigs</span>
        </div>
      </div>

      {/* Action Result Toast */}
      {actionResult && (
        <div style={{
          position: 'fixed', top: '80px', right: '20px', zIndex: 1000,
          padding: '12px 20px', borderRadius: '8px', maxWidth: '400px',
          background: actionResult.success ? '#1a3a1a' : '#3a1a1a',
          border: `1px solid ${actionResult.success ? 'var(--success)' : 'var(--error)'}`,
          color: actionResult.success ? 'var(--success)' : 'var(--error)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{actionResult.success ? '✓' : '✗'} {actionResult.message}</span>
            <button onClick={() => setActionResult(null)} style={{
              background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: '12px'
            }}>×</button>
          </div>
        </div>
      )}

      <div className="container">
        <div className="tabs">
          {['control', 'convoys', 'issues', 'agents', 'events'].map(tab => (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-3">
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <h2>{activeTab}</h2>
            </div>
            <div className="card-body no-padding scrollable">
              {loading ? <div className="loading">Loading...</div> : (
                <>
                  {activeTab === 'control' && <ControlPanel rigs={rigs} issues={issues}
                    onCreateIssue={createIssue} onSling={slingIssue} onQuickWork={quickWork} onNudge={nudgeAgent} status={status} />}
                  {activeTab === 'convoys' && <ConvoyList convoys={convoys} />}
                  {activeTab === 'issues' && <IssueList issues={issues} rigs={rigs} onSling={slingIssue} onIssueClick={setSelectedIssue} />}
                  {activeTab === 'agents' && <AgentList status={status} onNudge={nudgeAgent} />}
                  {activeTab === 'events' && <EventList events={events} />}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <div className="card-header"><h2>Rigs</h2></div>
              <div className="card-body no-padding">
                <RigList rigs={rigs} status={status} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2>Recent Events</h2></div>
              <div className="card-body no-padding scrollable" style={{ maxHeight: '250px' }}>
                <EventList events={events.slice(0, 5)} compact />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <IssueDetail
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onUpdate={fetchIssues}
          onIssueClick={setSelectedIssue}
        />
      )}
    </>
  );
}

// Control Panel - Main entry point for creating and dispatching work
function ControlPanel({ rigs, issues, onCreateIssue, onSling, onQuickWork, onNudge, status }) {
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

// Agent List with status and nudge actions
function AgentList({ status, onNudge }) {
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

// Issue List with sling actions
function IssueList({ issues, rigs, onSling, onIssueClick }) {
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

// Convoy List
function ConvoyList({ convoys }) {
  if (!convoys.length) {
    return <div className="empty-state"><div className="empty-state-icon">🚛</div><div>No active convoys</div></div>;
  }

  return (
    <div>
      {convoys.map(convoy => (
        <div key={convoy.id} className="convoy-item">
          <div className="convoy-header">
            <div>
              <div className="convoy-title">{convoy.title}</div>
              <div className="convoy-id">{convoy.id}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {convoy.last_activity && (
                <>
                  <span className={`activity-dot ${getActivityClass(convoy.last_activity.color_class)}`}></span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {convoy.last_activity.formatted_age}
                  </span>
                </>
              )}
              <span className={`badge badge-${convoy.status}`}>{convoy.status}</span>
            </div>
          </div>
          <div className="convoy-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(convoy.completed / convoy.total) * 100 || 0}%` }}></div>
            </div>
            <div className="convoy-stats">
              <span>{convoy.progress || `${convoy.completed || 0}/${convoy.total || 0}`}</span>
              <span>{convoy.total ? Math.round((convoy.completed / convoy.total) * 100) : 0}% complete</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Event List
function EventList({ events, compact }) {
  if (!events.length) {
    return <div className="empty-state"><div className="empty-state-icon">📡</div><div>No recent events</div></div>;
  }

  return (
    <div>
      {events.map((event, i) => {
        const style = getEventStyle(event.type);
        return (
          <div key={i} className="event-item">
            <div className="event-icon" style={{ background: style.bg }}>{style.icon}</div>
            <div className="event-content">
              <div className="event-title">
                <strong>{event.type}</strong>
                {event.actor && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>{event.actor}</span>}
                {!compact && event.payload && (
                  <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                    {JSON.stringify(event.payload).substring(0, 50)}
                  </span>
                )}
              </div>
              <div className="event-time">
                {event.timestamp || event.ts ? new Date(event.timestamp || event.ts).toLocaleString() : ''}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Rig List with agent counts
function RigList({ rigs, status }) {
  if (!rigs.length) {
    return <div className="empty-state"><div className="empty-state-icon">🏗️</div><div>No rigs</div></div>;
  }

  // Get rig details from status
  const rigDetails = {};
  status?.rigs?.forEach(r => { rigDetails[r.name] = r; });

  return (
    <div>
      {rigs.map((rig, i) => {
        const details = rigDetails[rig.name] || {};
        const runningAgents = details.agents?.filter(a => a.running)?.length || 0;
        return (
          <div key={rig.name || i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{rig.name}</span>
              {runningAgents > 0 && (
                <span className="badge badge-running">{runningAgents} running</span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {rig.polecats || 0} polecats · {rig.crew || 0} crew
            </div>
          </div>
        );
      })}
    </div>
  );
}
