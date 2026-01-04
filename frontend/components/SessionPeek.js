import { useState, useEffect, useRef, useCallback } from 'react';

// ANSI escape code to HTML converter
function ansiToHtml(text) {
  const ANSI_COLORS = {
    '30': '#4a4a4a', '31': '#ff6b6b', '32': '#69db7c', '33': '#ffd43b',
    '34': '#74c0fc', '35': '#da77f2', '36': '#66d9e8', '37': '#e9ecef',
    '90': '#868e96', '91': '#ff8787', '92': '#8ce99a', '93': '#ffe066',
    '94': '#91a7ff', '95': '#e599f7', '96': '#99e9f2', '97': '#f8f9fa',
    '40': '#4a4a4a', '41': '#c92a2a', '42': '#2f9e44', '43': '#f59f00',
    '44': '#1971c2', '45': '#9c36b5', '46': '#0c8599', '47': '#495057'
  };

  let result = '';
  let currentStyle = {};
  let i = 0;

  while (i < text.length) {
    if (text[i] === '\x1b' && text[i + 1] === '[') {
      const end = text.indexOf('m', i);
      if (end !== -1) {
        const codes = text.slice(i + 2, end).split(';');
        for (const code of codes) {
          if (code === '0') {
            currentStyle = {};
          } else if (code === '1') {
            currentStyle.bold = true;
          } else if (code === '3') {
            currentStyle.italic = true;
          } else if (code === '4') {
            currentStyle.underline = true;
          } else if (ANSI_COLORS[code]) {
            if (code >= 40) {
              currentStyle.bg = ANSI_COLORS[code];
            } else {
              currentStyle.fg = ANSI_COLORS[code];
            }
          }
        }
        i = end + 1;
        continue;
      }
    }

    // Build style string for this character
    const styles = [];
    if (currentStyle.fg) styles.push(`color:${currentStyle.fg}`);
    if (currentStyle.bg) styles.push(`background:${currentStyle.bg}`);
    if (currentStyle.bold) styles.push('font-weight:bold');
    if (currentStyle.italic) styles.push('font-style:italic');
    if (currentStyle.underline) styles.push('text-decoration:underline');

    const char = text[i] === '<' ? '&lt;' : text[i] === '>' ? '&gt;' : text[i] === '&' ? '&amp;' : text[i];

    if (styles.length > 0) {
      result += `<span style="${styles.join(';')}">${char}</span>`;
    } else {
      result += char;
    }
    i++;
  }

  return result;
}

// Format uptime from seconds
function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '-';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export default function SessionPeek({ polecats = [], status, onNudge, apiUrl = 'http://localhost:3001' }) {
  const [sessions, setSessions] = useState({}); // { polecatName: { output: [], info: {} } }
  const [activeSession, setActiveSession] = useState(null);
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState({});
  const [nudgeModal, setNudgeModal] = useState(null);
  const [nudgeMessage, setNudgeMessage] = useState('');

  const terminalRef = useRef(null);
  const wsRefs = useRef({});
  const pausedRef = useRef(paused);

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Get list of running polecats from status
  const runningPolecats = [];
  status?.rigs?.forEach(rig => {
    rig.agents?.forEach(agent => {
      if (agent.running && agent.role === 'polecat') {
        runningPolecats.push({
          name: agent.name,
          address: agent.address,
          rig: rig.name,
          hasWork: agent.has_work
        });
      }
    });
  });

  // Also check the polecats prop
  polecats.forEach(p => {
    if (p.status === 'running' && !runningPolecats.find(r => r.name === p.name)) {
      runningPolecats.push({
        name: p.name,
        address: p.address || `${p.rig}/polecats/${p.name}`,
        rig: p.rig,
        hasWork: p.hasWork
      });
    }
  });

  // Connect to a polecat's peek stream
  const connectToPolecat = useCallback((polecat) => {
    const wsUrl = apiUrl.replace('http', 'ws') + `/ws/peek/${encodeURIComponent(polecat.address || polecat.name)}`;

    if (wsRefs.current[polecat.name]) {
      wsRefs.current[polecat.name].close();
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRefs.current[polecat.name] = ws;

      ws.onopen = () => {
        setConnected(prev => ({ ...prev, [polecat.name]: true }));
        setSessions(prev => ({
          ...prev,
          [polecat.name]: { output: ['[Connected to session]'], info: polecat }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output') {
            setSessions(prev => ({
              ...prev,
              [polecat.name]: {
                ...prev[polecat.name],
                output: [...(prev[polecat.name]?.output || []), msg.data].slice(-1000) // Keep last 1000 lines
              }
            }));
          } else if (msg.type === 'info') {
            setSessions(prev => ({
              ...prev,
              [polecat.name]: {
                ...prev[polecat.name],
                info: { ...prev[polecat.name]?.info, ...msg.data }
              }
            }));
          } else if (msg.type === 'error') {
            setSessions(prev => ({
              ...prev,
              [polecat.name]: {
                ...prev[polecat.name],
                output: [...(prev[polecat.name]?.output || []), `[Error: ${msg.data}]`]
              }
            }));
          }
        } catch (e) {
          // Raw text output
          setSessions(prev => ({
            ...prev,
            [polecat.name]: {
              ...prev[polecat.name],
              output: [...(prev[polecat.name]?.output || []), event.data].slice(-1000)
            }
          }));
        }
      };

      ws.onclose = () => {
        setConnected(prev => ({ ...prev, [polecat.name]: false }));
        setSessions(prev => ({
          ...prev,
          [polecat.name]: {
            ...prev[polecat.name],
            output: [...(prev[polecat.name]?.output || []), '[Connection closed]']
          }
        }));
      };

      ws.onerror = () => {
        setConnected(prev => ({ ...prev, [polecat.name]: false }));
      };

    } catch (err) {
      console.error('WebSocket error:', err);
      setConnected(prev => ({ ...prev, [polecat.name]: false }));
    }
  }, [apiUrl]);

  // Auto-connect to first running polecat
  useEffect(() => {
    if (runningPolecats.length > 0 && !activeSession) {
      setActiveSession(runningPolecats[0].name);
      connectToPolecat(runningPolecats[0]);
    }
  }, [runningPolecats.length, activeSession, connectToPolecat]);

  // Auto-scroll when new output arrives
  useEffect(() => {
    if (terminalRef.current && !pausedRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [sessions[activeSession]?.output?.length]);

  // Cleanup WebSocket connections on unmount
  useEffect(() => {
    return () => {
      Object.values(wsRefs.current).forEach(ws => ws?.close());
    };
  }, []);

  // Switch to a session
  function switchSession(polecat) {
    setActiveSession(polecat.name);
    if (!connected[polecat.name]) {
      connectToPolecat(polecat);
    }
  }

  // Handle nudge
  async function handleNudge(e) {
    e.preventDefault();
    if (!nudgeMessage.trim() || !nudgeModal) return;
    await onNudge?.(nudgeModal.address, nudgeMessage);
    setNudgeModal(null);
    setNudgeMessage('');
  }

  const currentSession = sessions[activeSession];
  const currentInfo = currentSession?.info || {};

  if (runningPolecats.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '10px' }}>👀</div>
        <div>No running polecat sessions to peek</div>
        <div style={{ fontSize: '0.8rem', marginTop: '8px' }}>
          Start a polecat to view its live output
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '500px'
    }}>
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
                <textarea value={nudgeMessage} onChange={e => setNudgeMessage(e.target.value)}
                  placeholder="What do you want to tell this agent?" rows={4} autoFocus
                  style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                    borderRadius: '6px', padding: '10px', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setNudgeModal(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!nudgeMessage.trim()}>
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Session Tabs */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto'
      }}>
        {runningPolecats.map(polecat => (
          <button
            key={polecat.name}
            onClick={() => switchSession(polecat)}
            style={{
              padding: '8px 16px',
              background: activeSession === polecat.name ? 'var(--bg-primary)' : 'transparent',
              border: 'none',
              borderBottom: activeSession === polecat.name ? '2px solid var(--accent)' : '2px solid transparent',
              color: activeSession === polecat.name ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              fontSize: '0.85rem'
            }}
          >
            <span className={`activity-dot ${connected[polecat.name] ? 'activity-green' : 'activity-gray'}`}
              style={{ width: '6px', height: '6px' }}></span>
            {polecat.name}
            {polecat.hasWork && <span style={{ color: 'var(--warning)' }}>🪝</span>}
          </button>
        ))}
      </div>

      {/* Session Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.8rem'
      }}>
        <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{currentInfo.name || activeSession}</strong>
            {currentInfo.rig && <span style={{ marginLeft: '4px' }}>({currentInfo.rig})</span>}
          </span>
          {currentInfo.hasWork && (
            <span style={{ color: 'var(--warning)' }}>🪝 Work hooked</span>
          )}
          {currentInfo.uptime && (
            <span>⏱️ {formatUptime(currentInfo.uptime)}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setPaused(!paused)}
            style={{
              padding: '4px 8px',
              background: paused ? 'var(--warning)' : 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: paused ? 'var(--bg-primary)' : 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.75rem'
            }}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={() => setNudgeModal(currentInfo)}
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
          >
            👋 Nudge
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div
        ref={terminalRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
          fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
          fontSize: '0.8rem',
          lineHeight: '1.5',
          background: '#0d1117',
          color: '#c9d1d9'
        }}
      >
        {currentSession?.output?.map((line, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />
        )) || (
          <div style={{ color: 'var(--text-muted)' }}>
            Connecting to session...
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div style={{
        padding: '4px 12px',
        background: 'var(--bg-tertiary)',
        borderTop: '1px solid var(--border)',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>
          {connected[activeSession] ? '🟢 Connected' : '⚫ Disconnected'}
          {paused && ' (Paused)'}
        </span>
        <span>
          {currentSession?.output?.length || 0} lines
        </span>
      </div>
    </div>
  );
}
