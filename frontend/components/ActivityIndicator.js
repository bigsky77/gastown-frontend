// Activity color mapping
export function getActivityClass(colorClass) {
  switch (colorClass) {
    case 'green': return 'activity-green';
    case 'yellow': return 'activity-yellow';
    case 'red': return 'activity-red';
    default: return 'activity-gray';
  }
}

// Event type styling
export const EVENT_STYLES = {
  sling: { icon: '🎯', bg: '#1a2a3a' },
  hook: { icon: '🪝', bg: '#2a2a1a' },
  mail: { icon: '📬', bg: '#1a3a2a' },
  nudge: { icon: '👋', bg: '#2a1a3a' },
  session_start: { icon: '🚀', bg: '#1a3a3a' },
  convoy_created: { icon: '🚛', bg: '#3a2a1a' },
  issue_closed: { icon: '✅', bg: '#1a3a1a' },
  default: { icon: '📋', bg: '#2a2a2a' }
};

export function getEventStyle(type) {
  return EVENT_STYLES[type] || EVENT_STYLES.default;
}

// Activity dot component
export function ActivityDot({ status, className = '' }) {
  const colorClass = typeof status === 'string' ? getActivityClass(status) :
    (status ? 'activity-green' : 'activity-gray');
  return <span className={`activity-dot ${colorClass} ${className}`}></span>;
}
