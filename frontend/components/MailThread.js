import { useState, useMemo } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function MailThread({ messages, onRefresh, onSend }) {
  const [selectedThread, setSelectedThread] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSender, setFilterSender] = useState('');
  const [filterRecipient, setFilterRecipient] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  // Group messages by thread (subject-based)
  const threads = useMemo(() => {
    if (!messages?.length) return [];

    const threadMap = new Map();

    messages.forEach(msg => {
      // Normalize subject for threading (remove Re:, Fwd:, etc.)
      const normalizedSubject = (msg.subject || 'No Subject')
        .replace(/^(Re|Fwd|Fw|RE|FWD|FW):\s*/gi, '')
        .trim()
        .toLowerCase();

      if (!threadMap.has(normalizedSubject)) {
        threadMap.set(normalizedSubject, {
          id: normalizedSubject,
          subject: msg.subject || 'No Subject',
          messages: [],
          lastActivity: null,
          unreadCount: 0
        });
      }

      const thread = threadMap.get(normalizedSubject);
      thread.messages.push(msg);

      // Track latest activity
      const msgDate = new Date(msg.created_at || msg.timestamp || 0);
      if (!thread.lastActivity || msgDate > thread.lastActivity) {
        thread.lastActivity = msgDate;
      }

      // Count unread
      if (!msg.read) {
        thread.unreadCount++;
      }
    });

    // Sort threads by last activity (most recent first)
    return Array.from(threadMap.values())
      .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
  }, [messages]);

  // Get unique senders and recipients for filters
  const { senders, recipients } = useMemo(() => {
    const senderSet = new Set();
    const recipientSet = new Set();

    messages?.forEach(msg => {
      if (msg.from) senderSet.add(msg.from);
      if (msg.to) recipientSet.add(msg.to);
    });

    return {
      senders: Array.from(senderSet).sort(),
      recipients: Array.from(recipientSet).sort()
    };
  }, [messages]);

  // Filter threads
  const filteredThreads = useMemo(() => {
    return threads.filter(thread => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSubject = thread.subject.toLowerCase().includes(query);
        const matchesBody = thread.messages.some(m =>
          (m.body || '').toLowerCase().includes(query)
        );
        if (!matchesSubject && !matchesBody) return false;
      }

      // Sender filter
      if (filterSender) {
        const hasMatchingSender = thread.messages.some(m => m.from === filterSender);
        if (!hasMatchingSender) return false;
      }

      // Recipient filter
      if (filterRecipient) {
        const hasMatchingRecipient = thread.messages.some(m => m.to === filterRecipient);
        if (!hasMatchingRecipient) return false;
      }

      return true;
    });
  }, [threads, searchQuery, filterSender, filterRecipient]);

  // Mark message as read/unread
  async function toggleRead(msgId, currentlyRead) {
    setActionLoading(msgId);
    try {
      await fetch(`${API_URL}/api/mail/${msgId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: !currentlyRead })
      });
      onRefresh?.();
    } catch (err) {
      console.error('Failed to toggle read status:', err);
    }
    setActionLoading(null);
  }

  // Delete message
  async function deleteMessage(msgId) {
    if (!confirm('Delete this message?')) return;
    setActionLoading(msgId);
    try {
      await fetch(`${API_URL}/api/mail/${msgId}`, { method: 'DELETE' });
      onRefresh?.();
      // If we deleted the last message in the thread, close it
      if (selectedThread?.messages.length === 1) {
        setSelectedThread(null);
      }
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
    setActionLoading(null);
  }

  // Archive thread (mark all as read)
  async function archiveThread(thread) {
    setActionLoading(thread.id);
    try {
      await Promise.all(
        thread.messages
          .filter(m => !m.read)
          .map(m =>
            fetch(`${API_URL}/api/mail/${m.id}/read`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ read: true })
            })
          )
      );
      onRefresh?.();
    } catch (err) {
      console.error('Failed to archive thread:', err);
    }
    setActionLoading(null);
  }

  // Reply to thread
  async function handleReply(e) {
    e.preventDefault();
    if (!replyText.trim() || !selectedThread) return;

    setSending(true);
    try {
      // Get the last message to determine reply recipient
      const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
      const replyTo = lastMsg.from;
      const subject = lastMsg.subject?.startsWith('Re:')
        ? lastMsg.subject
        : `Re: ${lastMsg.subject || 'No Subject'}`;

      await onSend?.(replyTo, subject, replyText);
      setReplyText('');
      onRefresh?.();
    } catch (err) {
      console.error('Failed to send reply:', err);
    }
    setSending(false);
  }

  // Clear all filters
  function clearFilters() {
    setSearchQuery('');
    setFilterSender('');
    setFilterRecipient('');
  }

  if (!messages?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📬</div>
        <div>No messages</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: '400px' }}>
      {/* Thread List */}
      <div style={{
        width: selectedThread ? '40%' : '100%',
        borderRight: selectedThread ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Search & Filter Bar */}
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Search mail..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                color: 'var(--text-primary)'
              }}
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                padding: '8px 12px',
                background: showFilters ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: showFilters ? 'var(--bg-primary)' : 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              🔽
            </button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={filterSender}
                onChange={e => setFilterSender(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  minWidth: '140px'
                }}
              >
                <option value="">All Senders</option>
                {senders.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterRecipient}
                onChange={e => setFilterRecipient(e.target.value)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  minWidth: '140px'
                }}
              >
                <option value="">All Recipients</option>
                {recipients.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {(filterSender || filterRecipient || searchQuery) && (
                <button
                  onClick={clearFilters}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Thread List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredThreads.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No matching messages
            </div>
          ) : (
            filteredThreads.map(thread => (
              <div
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selectedThread?.id === thread.id
                    ? 'var(--bg-tertiary)'
                    : thread.unreadCount > 0
                      ? 'rgba(255, 200, 0, 0.05)'
                      : 'transparent',
                  transition: 'background 0.15s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    fontWeight: thread.unreadCount > 0 ? 600 : 400,
                    color: 'var(--text-primary)',
                    marginBottom: '4px'
                  }}>
                    {thread.subject}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {thread.unreadCount > 0 && (
                      <span style={{
                        background: 'var(--accent)',
                        color: 'var(--bg-primary)',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        fontSize: '0.7rem',
                        fontWeight: 600
                      }}>
                        {thread.unreadCount}
                      </span>
                    )}
                    {thread.messages.length > 1 && (
                      <span style={{
                        color: 'var(--text-muted)',
                        fontSize: '0.75rem'
                      }}>
                        ({thread.messages.length})
                      </span>
                    )}
                  </div>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>{thread.messages[0]?.from || 'Unknown'}</span>
                  <span>
                    {thread.lastActivity?.toLocaleDateString() || ''}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Thread Detail View */}
      {selectedThread && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0
        }}>
          {/* Thread Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedThread.subject}</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => archiveThread(selectedThread)}
                disabled={actionLoading === selectedThread.id}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
                title="Mark all as read"
              >
                {actionLoading === selectedThread.id ? '...' : '📥 Archive'}
              </button>
              <button
                onClick={() => setSelectedThread(null)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {selectedThread.messages
              .sort((a, b) => new Date(a.created_at || a.timestamp || 0) - new Date(b.created_at || b.timestamp || 0))
              .map((msg, idx) => (
                <div
                  key={msg.id || idx}
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: msg.read ? 'var(--bg-secondary)' : 'rgba(255, 200, 0, 0.08)',
                    borderRadius: '8px',
                    border: '1px solid var(--border)'
                  }}
                >
                  {/* Message Header */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--accent)' }}>
                        {msg.from}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        To: {msg.to} · {new Date(msg.created_at || msg.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => toggleRead(msg.id, msg.read)}
                        disabled={actionLoading === msg.id}
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)'
                        }}
                        title={msg.read ? 'Mark as unread' : 'Mark as read'}
                      >
                        {actionLoading === msg.id ? '...' : msg.read ? '📭' : '📬'}
                      </button>
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        disabled={actionLoading === msg.id}
                        style={{
                          padding: '4px 8px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          color: 'var(--error)'
                        }}
                        title="Delete"
                      >
                        {actionLoading === msg.id ? '...' : '🗑️'}
                      </button>
                    </div>
                  </div>

                  {/* Message Body */}
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.9rem',
                    lineHeight: '1.5',
                    color: 'var(--text-primary)'
                  }}>
                    {msg.body || msg.content || '(No content)'}
                  </div>
                </div>
              ))}
          </div>

          {/* Reply Box */}
          {onSend && (
            <form onSubmit={handleReply} style={{
              padding: '12px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-secondary)'
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  rows={2}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    minHeight: '60px'
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || !replyText.trim()}
                  style={{
                    padding: '10px 16px',
                    background: replyText.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: replyText.trim() ? 'var(--bg-primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: replyText.trim() ? 'pointer' : 'not-allowed',
                    fontWeight: 500,
                    alignSelf: 'flex-end'
                  }}
                >
                  {sending ? '...' : '📤'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
