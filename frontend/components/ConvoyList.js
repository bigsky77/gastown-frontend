import { getActivityClass } from './ActivityIndicator';

export default function ConvoyList({ convoys }) {
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
