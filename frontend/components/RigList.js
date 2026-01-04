export default function RigList({ rigs, status }) {
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
