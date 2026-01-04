import { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';

const nodeWidth = 180;
const nodeHeight = 60;

// Status to color mapping
const statusColors = {
  closed: { bg: '#1a3a1a', border: '#00ff88', text: '#00ff88' },
  in_progress: { bg: '#1a2a3a', border: '#00d9ff', text: '#00d9ff' },
  hooked: { bg: '#2a1a3a', border: '#a855f7', text: '#a855f7' },
  open: { bg: '#2a2a2a', border: '#888888', text: '#888888' },
  blocked: { bg: '#3a1a1a', border: '#ff4444', text: '#ff4444' },
};

// Custom node component
function IssueNode({ data }) {
  const colors = statusColors[data.status] || statusColors.open;
  const isOnCriticalPath = data.criticalPath;

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        background: colors.bg,
        border: `2px solid ${colors.border}`,
        boxShadow: isOnCriticalPath ? `0 0 12px ${colors.border}` : 'none',
        minWidth: nodeWidth,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      className="issue-node"
    >
      <div style={{
        fontSize: '0.7rem',
        fontFamily: 'monospace',
        color: colors.text,
        marginBottom: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{data.id}</span>
        <span style={{
          padding: '1px 6px',
          borderRadius: '3px',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          fontSize: '0.65rem',
        }}>
          {data.status}
        </span>
      </div>
      <div style={{
        fontSize: '0.85rem',
        color: '#e5e5e5',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: nodeWidth - 28,
      }}>
        {data.title}
      </div>
      {data.type && (
        <div style={{
          fontSize: '0.65rem',
          color: '#666',
          marginTop: '4px',
        }}>
          {data.type} | P{data.priority ?? 2}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { issue: IssueNode };

// Use dagre to layout the graph
function getLayoutedElements(nodes, edges, direction = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// Find critical path (longest path in DAG)
function findCriticalPath(nodes, edges) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const adjList = new Map();
  const inDegree = new Map();

  // Initialize
  nodes.forEach(n => {
    adjList.set(n.id, []);
    inDegree.set(n.id, 0);
  });

  // Build adjacency list and in-degrees
  edges.forEach(e => {
    adjList.get(e.source)?.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
  });

  // Topological sort with longest path
  const dist = new Map();
  const prev = new Map();
  nodes.forEach(n => dist.set(n.id, 0));

  // Find nodes with no incoming edges
  const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);

  while (queue.length > 0) {
    const u = queue.shift();
    const neighbors = adjList.get(u) || [];

    for (const v of neighbors) {
      if (dist.get(u) + 1 > dist.get(v)) {
        dist.set(v, dist.get(u) + 1);
        prev.set(v, u);
      }
      inDegree.set(v, inDegree.get(v) - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  // Find the end of critical path
  let maxDist = 0;
  let endNode = null;
  dist.forEach((d, id) => {
    if (d >= maxDist) {
      maxDist = d;
      endNode = id;
    }
  });

  // Trace back to build critical path
  const criticalPath = new Set();
  let current = endNode;
  while (current) {
    criticalPath.add(current);
    current = prev.get(current);
  }

  return criticalPath;
}

export default function DependencyGraph({
  issues = [],
  dependencies = [],
  convoys = [],
  selectedConvoy = null,
  onNodeClick,
  showCriticalPath = true,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterConvoy, setFilterConvoy] = useState(selectedConvoy);
  const [direction, setDirection] = useState('TB');

  // Filter issues by convoy if selected
  const filteredIssues = useMemo(() => {
    if (!filterConvoy) return issues;
    const convoy = convoys.find(c => c.id === filterConvoy);
    if (!convoy?.issues) return issues;
    const convoyIssueIds = new Set(convoy.issues.map(i => i.id || i));
    return issues.filter(i => convoyIssueIds.has(i.id));
  }, [issues, convoys, filterConvoy]);

  // Build graph from issues and dependencies
  useEffect(() => {
    if (!filteredIssues.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const issueIds = new Set(filteredIssues.map(i => i.id));

    // Create nodes
    const graphNodes = filteredIssues.map(issue => ({
      id: issue.id,
      type: 'issue',
      data: {
        id: issue.id,
        title: issue.title,
        status: issue.status,
        type: issue.type || issue.issue_type,
        priority: issue.priority,
        criticalPath: false,
      },
      position: { x: 0, y: 0 },
    }));

    // Create edges from dependencies (only for visible nodes)
    const graphEdges = dependencies
      .filter(dep => issueIds.has(dep.from) && issueIds.has(dep.to))
      .map((dep, idx) => ({
        id: `e-${dep.from}-${dep.to}`,
        source: dep.from,
        target: dep.to,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#555', strokeWidth: 2 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#555',
        },
      }));

    // Calculate critical path
    if (showCriticalPath && graphNodes.length > 0) {
      const criticalPath = findCriticalPath(graphNodes, graphEdges);
      graphNodes.forEach(node => {
        if (criticalPath.has(node.id)) {
          node.data.criticalPath = true;
        }
      });
      // Highlight critical path edges
      graphEdges.forEach(edge => {
        if (criticalPath.has(edge.source) && criticalPath.has(edge.target)) {
          edge.style = { stroke: '#ff6b6b', strokeWidth: 3 };
          edge.markerEnd = { type: MarkerType.ArrowClosed, color: '#ff6b6b' };
          edge.animated = true;
        }
      });
    }

    // Layout the graph
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      graphNodes,
      graphEdges,
      direction
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [filteredIssues, dependencies, showCriticalPath, direction, setNodes, setEdges]);

  const handleNodeClick = useCallback((event, node) => {
    if (onNodeClick) {
      onNodeClick(node.data);
    }
  }, [onNodeClick]);

  const handleDirectionChange = (newDirection) => {
    setDirection(newDirection);
  };

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚠️</div>
        <div>{error}</div>
      </div>
    );
  }

  if (!filteredIssues.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🕸️</div>
        <div>No issues with dependencies</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Controls bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border)',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {/* Convoy filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Filter:
          </label>
          <select
            value={filterConvoy || ''}
            onChange={(e) => setFilterConvoy(e.target.value || null)}
            style={{
              padding: '4px 8px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
            }}
          >
            <option value="">All Issues</option>
            {convoys.map(c => (
              <option key={c.id} value={c.id}>{c.title || c.id}</option>
            ))}
          </select>
        </div>

        {/* Direction toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => handleDirectionChange('TB')}
            className={`btn btn-secondary ${direction === 'TB' ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              background: direction === 'TB' ? 'var(--accent)' : undefined,
              color: direction === 'TB' ? 'var(--bg-primary)' : undefined,
            }}
          >
            ↓ Vertical
          </button>
          <button
            onClick={() => handleDirectionChange('LR')}
            className={`btn btn-secondary ${direction === 'LR' ? 'active' : ''}`}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              background: direction === 'LR' ? 'var(--accent)' : undefined,
              color: direction === 'LR' ? 'var(--bg-primary)' : undefined,
            }}
          >
            → Horizontal
          </button>
        </div>

        {/* Stats */}
        <div style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
        }}>
          {nodes.length} issues | {edges.length} dependencies
        </div>
      </div>

      {/* Graph */}
      <div style={{ flex: 1, minHeight: '400px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background color="#333" gap={20} />
          <Controls
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
            }}
          />
          <MiniMap
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
            }}
            nodeColor={(node) => {
              const colors = statusColors[node.data?.status] || statusColors.open;
              return colors.border;
            }}
            maskColor="rgba(0, 0, 0, 0.8)"
          />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderTop: '1px solid var(--border)',
        fontSize: '0.75rem',
        flexWrap: 'wrap',
      }}>
        {Object.entries(statusColors).map(([status, colors]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              background: colors.bg,
              border: `2px solid ${colors.border}`,
            }} />
            <span style={{ color: 'var(--text-secondary)' }}>{status}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
          <div style={{
            width: '20px',
            height: '3px',
            background: '#ff6b6b',
            borderRadius: '2px',
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>critical path</span>
        </div>
      </div>

      <style jsx global>{`
        .issue-node:hover {
          transform: scale(1.02);
        }
        .react-flow__controls button {
          background: var(--bg-tertiary) !important;
          border-color: var(--border) !important;
          color: var(--text-primary) !important;
        }
        .react-flow__controls button:hover {
          background: var(--border) !important;
        }
        .react-flow__minimap {
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
}
