import { useState, useEffect, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Agent type icons
const AGENT_ICONS = {
  core: '👑',
  witness: '👁️',
  refinery: '🏭',
  deacon: '🕯️',
  polecat: '🦨',
  agent: '🤖'
};

// Status colors matching the design system
const STATUS_STYLES = {
  running: { dot: 'activity-green', badge: 'badge-running', label: 'Running' },
  stopped: { dot: 'activity-gray', badge: 'badge-closed', label: 'Stopped' },
  error: { dot: 'activity-red', badge: 'badge-error', label: 'Error' },
  starting: { dot: 'activity-yellow', badge: 'badge-in_progress', label: 'Starting...' },
  stopping: { dot: 'activity-yellow', badge: 'badge-in_progress', label: 'Stopping...' }
};

export default function AgentLifecycle({ onRefresh }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [logs, setLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [filter, setFilter] = useState('all');
  const logsEndRef = useRef(null);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchLogs(selectedAgent);
    }
  }, [selectedAgent]);

  async function fetchAgents() {
    try {
      const res = await fetch(`${API_URL}/api/agents`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs(agent) {
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agents/${encodeURIComponent(agent.name || agent.address)}/logs?lines=100`);
      const data = await res.json();
      setLogs(data.content || data.error || 'No logs available');
    } catch (err) {
      setLogs('Failed to fetch logs');
    } finally {
      setLogsLoading(false);
    }
  }

  async function handleAction(agent, action) {
    const agentId = agent.name || agent.address;
    setActionInProgress(`${agentId}-${action}`);

    try {
      const res = await fetch(`${API_URL}/api/agents/${encodeURIComponent(agentId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rig: agent.rig })
      });
      const data = await res.json();

      if (!data.success && data.error) {
        console.error(`Failed to ${action} agent:`, data.error);
      }

      // Refresh agent list after action
      setTimeout(fetchAgents, 1000);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(`Failed to ${action} agent:`, err);
    } finally {
      setTimeout(() => setActionInProgress(null), 1500);
    }
  }

  // Filter agents
  const filteredAgents = filter === 'all'
    ? agents
    : agents.filter(a => a.type === filter || (filter === 'running' && a.running));

  // Group agents by type for better organization
  const groupedAgents = filteredAgents.reduce((acc, agent) => {
    const type = agent.type || 'agent';
    if (!acc[type]) acc[type] = [];
    acc[type].push(agent);
    return acc;
  }, {});

  const typeOrder = ['core', 'witness', 'refinery', 'deacon', 'polecat', 'agent'];

  if (loading) {
    return <div className="loading">Loading agents...</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '500px' }}>
      {/* Agent List Panel */}
      <div style={{ flex: 1, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
        {/* Filter Tabs */}
        <div style={{
          display: 'flex', gap: '4px', padding: '12px',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary)'
        }}>
          {[
            { id: 'all', label: 'All' },
            { id: 'running', label: 'Running' },
            { id: 'core', label: 'Core' },
            { id: 'polecat', label: 'Workers' }
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{
                padding: '6px 12px', border: 'none', borderRadius: '4px',
                background: filter === f.id ? 'var(--accent)' : 'transparent',
                color: filter === f.id ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '0.8rem', cursor: 'pointer'
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Agent Groups */}
        {typeOrder.filter(t => groupedAgents[t]).map(type => (
          <div key={type}>
            <div style={{
              padding: '8px 16px', background: 'var(--bg-tertiary)',
              fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase',
              color: 'var(--text-muted)', letterSpacing: '0.5px',
              borderBottom: '1px solid var(--border)'
            }}>
              {AGENT_ICONS[type]} {type === 'polecat' ? 'Workers' : type}
            </div>
            {groupedAgents[type].map(agent => {
              const agentId = agent.name || agent.address;
              const status = actionInProgress?.startsWith(agentId)
                ? (actionInProgress.endsWith('start') ? 'starting' : 'stopping')
                : (agent.running ? 'running' : (agent.status === 'error' ? 'error' : 'stopped'));
              const style = STATUS_STYLES[status];
              const isSelected = selectedAgent?.address === agent.address;

              return (
                <div key={agentId}
                  onClick={() => setSelectedAgent(agent)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                    background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent'
                  }}>
                  {/* Status LED */}
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: status === 'running' ? 'var(--success)' :
                      status === 'error' ? 'var(--error)' :
                        status === 'starting' || status === 'stopping' ? 'var(--warning)' : 'var(--text-muted)',
                    boxShadow: status === 'running' ? '0 0 8px var(--success)' :
                      status === 'error' ? '0 0 8px var(--error)' : 'none'
                  }} />

                  {/* Agent Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                      {agent.name || agentId}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {agent.role || agent.type}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {agent.running ? (
                      <>
                        <button className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                          onClick={(e) => { e.stopPropagation(); handleAction(agent, 'restart'); }}
                          disabled={actionInProgress}>
                          ↻
                        </button>
                        <button className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--error)' }}
                          onClick={(e) => { e.stopPropagation(); handleAction(agent, 'stop'); }}
                          disabled={actionInProgress}>
                          ■
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.7rem', color: 'var(--success)' }}
                        onClick={(e) => { e.stopPropagation(); handleAction(agent, 'start'); }}
                        disabled={actionInProgress}>
                        ▶
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {filteredAgents.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🤖</div>
            <div>No agents found</div>
          </div>
        )}
      </div>

      {/* Detail/Logs Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {selectedAgent ? (
          <>
            {/* Agent Header */}
            <div style={{
              padding: '16px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-secondary)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '1.5rem' }}>
                  {AGENT_ICONS[selectedAgent.type] || AGENT_ICONS.agent}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    {selectedAgent.name || selectedAgent.address}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {selectedAgent.role || selectedAgent.type}
                    {selectedAgent.rig && ` · ${selectedAgent.rig}`}
                  </div>
                </div>
              </div>

              {/* Status & Health */}
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className={`activity-dot ${selectedAgent.running ? 'activity-green' : 'activity-gray'}`}></span>
                  <span style={{ fontSize: '0.85rem' }}>
                    {selectedAgent.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                {selectedAgent.uptime && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Uptime: {selectedAgent.uptime}
                  </div>
                )}
                {selectedAgent.has_work && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                    🪝 Has work
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {selectedAgent.running ? (
                  <>
                    <button className="btn btn-secondary" onClick={() => handleAction(selectedAgent, 'restart')}
                      disabled={actionInProgress}>
                      ↻ Restart
                    </button>
                    <button className="btn btn-secondary" style={{ borderColor: 'var(--error)' }}
                      onClick={() => handleAction(selectedAgent, 'stop')}
                      disabled={actionInProgress}>
                      ■ Stop
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={() => handleAction(selectedAgent, 'start')}
                    disabled={actionInProgress}>
                    ▶ Start
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => fetchLogs(selectedAgent)}>
                  ↻ Refresh Logs
                </button>
              </div>
            </div>

            {/* Logs Viewer */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '8px 16px', background: 'var(--bg-tertiary)',
                fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border)'
              }}>
                Logs (last 100 lines)
              </div>
              <div style={{
                flex: 1, overflow: 'auto', padding: '12px', fontFamily: 'monospace',
                fontSize: '0.75rem', lineHeight: '1.6', whiteSpace: 'pre-wrap',
                background: '#0d0d12', color: 'var(--text-secondary)'
              }}>
                {logsLoading ? (
                  <div style={{ color: 'var(--text-muted)' }}>Loading logs...</div>
                ) : logs ? (
                  logs.split('\n').map((line, i) => (
                    <div key={i} style={{
                      color: line.includes('ERROR') || line.includes('error') ? 'var(--error)' :
                        line.includes('WARN') || line.includes('warn') ? 'var(--warning)' :
                          line.includes('INFO') ? 'var(--accent)' : 'var(--text-secondary)'
                    }}>
                      {line}
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-muted)' }}>No logs available</div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div>
              <div className="empty-state-icon">👈</div>
              <div>Select an agent to view details</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
