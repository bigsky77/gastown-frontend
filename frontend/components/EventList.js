import { getEventStyle } from './ActivityIndicator';

export default function EventList({ events, compact }) {
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
