import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

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
  const [activeTab, setActiveTab] = useState('convoys');
  const [convoys, setConvoys] = useState([]);
  const [issues, setIssues] = useState([]);
  const [mail, setMail] = useState([]);
  const [events, setEvents] = useState([]);
  const [agents, setAgents] = useState([]);
  const [rigs, setRigs] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchAll();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([
      fetchConvoys(),
      fetchIssues(),
      fetchMail(),
      fetchEvents(),
      fetchRigs()
    ]);
    setLoading(false);
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

      ws.onopen = () => {
        setWsConnected(true);
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'convoys':
              setConvoys(msg.data.convoys || msg.data || []);
              break;
            case 'event':
              setEvents(prev => [msg.data, ...prev.slice(0, 29)]);
              break;
            case 'status':
              setStatus(msg.data);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setTimeout(connectWebSocket, 3000);
    }
  }

  // Calculate stats
  const openIssues = issues.filter(i => i.status === 'open').length;
  const inProgress = issues.filter(i => i.status === 'in_progress').length;
  const activeConvoys = convoys.filter(c => c.status === 'open').length;

  return (
    <>
      <Head>
        <title>Gas Town Dashboard</title>
      </Head>

      <header className="header">
        <h1>
          <span>Gas Town</span> Dashboard
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={`activity-dot ${wsConnected ? 'activity-green' : 'activity-red'}`}></span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {wsConnected ? 'Connected' : 'Reconnecting...'}
          </span>
          <button className="btn btn-secondary" onClick={fetchAll}>
            Refresh
          </button>
        </div>
      </header>

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-value">{activeConvoys}</span>
          <span className="stat-label">Active Convoys</span>
        </div>
        <div className="stat">
          <span className="stat-value">{openIssues}</span>
          <span className="stat-label">Open Issues</span>
        </div>
        <div className="stat">
          <span className="stat-value">{inProgress}</span>
          <span className="stat-label">In Progress</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rigs.length}</span>
          <span className="stat-label">Rigs</span>
        </div>
        <div className="stat">
          <span className="stat-value">{mail.length}</span>
          <span className="stat-label">Messages</span>
        </div>
      </div>

      <div className="container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'convoys' ? 'active' : ''}`}
            onClick={() => setActiveTab('convoys')}
          >
            Convoys
          </button>
          <button
            className={`tab ${activeTab === 'issues' ? 'active' : ''}`}
            onClick={() => setActiveTab('issues')}
          >
            Issues
          </button>
          <button
            className={`tab ${activeTab === 'mail' ? 'active' : ''}`}
            onClick={() => setActiveTab('mail')}
          >
            Mail
          </button>
          <button
            className={`tab ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Events
          </button>
        </div>

        <div className="grid grid-3">
          {/* Main content panel */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <h2>{activeTab}</h2>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {activeTab === 'convoys' && `${convoys.length} total`}
                {activeTab === 'issues' && `${issues.length} open`}
                {activeTab === 'mail' && `${mail.length} messages`}
                {activeTab === 'events' && `${events.length} recent`}
              </span>
            </div>
            <div className="card-body no-padding scrollable">
              {loading ? (
                <div className="loading">Loading...</div>
              ) : (
                <>
                  {activeTab === 'convoys' && <ConvoyList convoys={convoys} />}
                  {activeTab === 'issues' && <IssueList issues={issues} />}
                  {activeTab === 'mail' && <MailList messages={mail} />}
                  {activeTab === 'events' && <EventList events={events} />}
                </>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Rigs */}
            <div className="card">
              <div className="card-header">
                <h2>Rigs</h2>
              </div>
              <div className="card-body no-padding">
                <RigList rigs={rigs} />
              </div>
            </div>

            {/* Recent Activity */}
            <div className="card">
              <div className="card-header">
                <h2>Recent Activity</h2>
              </div>
              <div className="card-body no-padding scrollable" style={{ maxHeight: '250px' }}>
                <EventList events={events.slice(0, 5)} compact />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Convoy List Component
function ConvoyList({ convoys }) {
  if (!convoys.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🚛</div>
        <div>No active convoys</div>
      </div>
    );
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
              <div
                className="progress-fill"
                style={{ width: `${(convoy.completed / convoy.total) * 100 || 0}%` }}
              ></div>
            </div>
            <div className="convoy-stats">
              <span>{convoy.progress || `${convoy.completed || 0}/${convoy.total || 0}`}</span>
              <span>{convoy.total ? Math.round((convoy.completed / convoy.total) * 100) : 0}% complete</span>
            </div>
          </div>
          {convoy.tracked_issues?.length > 0 && (
            <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              {convoy.tracked_issues.slice(0, 3).map(issue => (
                <div key={issue.id} style={{ fontSize: '0.8rem', padding: '4px 0' }}>
                  <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{issue.id}</span>
                  <span style={{ marginLeft: '8px', color: 'var(--text-secondary)' }}>{issue.title}</span>
                  <span className={`badge badge-${issue.status}`} style={{ marginLeft: '8px' }}>{issue.status}</span>
                </div>
              ))}
              {convoy.tracked_issues.length > 3 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 0' }}>
                  +{convoy.tracked_issues.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Issue List Component
function IssueList({ issues }) {
  if (!issues.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        <div>No open issues</div>
      </div>
    );
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Title</th>
          <th>Type</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Assignee</th>
        </tr>
      </thead>
      <tbody>
        {issues.map(issue => (
          <tr key={issue.id}>
            <td>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{issue.id}</span>
            </td>
            <td>{issue.title}</td>
            <td>{issue.type || 'task'}</td>
            <td>P{issue.priority ?? 2}</td>
            <td><span className={`badge badge-${issue.status}`}>{issue.status}</span></td>
            <td style={{ color: 'var(--text-muted)' }}>{issue.assignee || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Mail List Component
function MailList({ messages }) {
  if (!messages.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📬</div>
        <div>Inbox empty</div>
      </div>
    );
  }

  return (
    <div>
      {messages.map((msg, i) => (
        <div key={msg.id || i} className={`mail-item ${msg.unread ? 'mail-unread' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mail-from">{msg.from || 'Unknown'}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : ''}
            </span>
          </div>
          <div className="mail-subject">{msg.subject}</div>
          {msg.body && <div className="mail-preview">{msg.body.substring(0, 100)}</div>}
        </div>
      ))}
    </div>
  );
}

// Event List Component
function EventList({ events, compact }) {
  if (!events.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📡</div>
        <div>No recent events</div>
      </div>
    );
  }

  return (
    <div>
      {events.map((event, i) => {
        const style = getEventStyle(event.type);
        return (
          <div key={i} className="event-item">
            <div className="event-icon" style={{ background: style.bg }}>
              {style.icon}
            </div>
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
                {event.timestamp ? new Date(event.timestamp).toLocaleString() : 'Unknown time'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Rig List Component
function RigList({ rigs }) {
  if (!rigs.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🏗️</div>
        <div>No rigs configured</div>
      </div>
    );
  }

  return (
    <div>
      {rigs.map((rig, i) => (
        <div key={rig.name || i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>{rig.name || rig}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'monospace' }}>
              {rig.prefix || ''}
            </span>
          </div>
          {rig.path && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {rig.path}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
