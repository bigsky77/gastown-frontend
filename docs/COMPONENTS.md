# React Components Reference

This document describes the React components used in the Gas Town Frontend dashboard.

## Component Index

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| [ControlPanel](#controlpanel) | Quick work creation | `rigs`, `onCreateIssue`, `onSling` |
| [ConvoyList](#convoylist) | Batch work display | `convoys`, `onSelect` |
| [IssueList](#issuelist) | Issue browser | `issues`, `onSelect`, `onClose` |
| [IssueDetail](#issuedetail) | Full issue view | `issue`, `onClose`, `onAddDep` |
| [DependencyGraph](#dependencygraph) | Visual deps | `issues`, `dependencies` |
| [AgentList](#agentlist) | Agent status grid | `agents`, `onSelect` |
| [AgentLifecycle](#agentlifecycle) | Agent controls | `agent`, `onStart`, `onStop` |
| [RigList](#riglist) | Rig overview | `rigs`, `onSelect` |
| [RigManager](#rigmanager) | Rig management | `rigs`, `onCreate`, `onDelete` |
| [MergeQueue](#mergequeue) | MR processing | `items`, `onRetry`, `onReject` |
| [MailThread](#mailthread) | Mail conversation | `messages`, `onReply` |
| [EventList](#eventlist) | Activity stream | `events` |
| [SessionPeek](#sessionpeek) | Live session view | `agent`, `logs` |
| [ActivityIndicator](#activityindicator) | Status dots | `status`, `style` |

---

## ControlPanel

Central command panel for creating and dispatching work.

```jsx
<ControlPanel
  rigs={rigsArray}           // Available rigs for dispatch
  issues={issuesArray}       // Existing issues for sling
  status={statusObject}      // Town status for agent list
  onCreateIssue={fn}         // (title, description, type, priority) => void
  onSling={fn}               // (issueId, targetRig) => void
  onQuickWork={fn}           // (title, desc, rig, type, priority) => void
  onNudge={fn}               // (agent, message) => void
/>
```

**Modes:**
- **Quick Task** - Create issue and dispatch to rig in one step
- **Create Issue** - Just create an issue (no dispatch)
- **Sling Work** - Dispatch existing issue to a rig
- **Nudge Agent** - Send message to an agent

---

## ConvoyList

Displays active convoys (batches of work).

```jsx
<ConvoyList
  convoys={[
    {
      id: 'hq-cv-abc',
      title: 'Feature implementation',
      status: 'hooked',       // hooked, pending, completed
      progress: { completed: 2, total: 5 },
      created: '2024-01-15T...'
    }
  ]}
  onSelect={(convoy) => void}
/>
```

**Visual States:**
- `hooked` - Purple border, work assigned to agent
- `pending` - Gray border, waiting for pickup
- `completed` - Green border, all issues done

---

## IssueList

Browsable list of issues with filtering.

```jsx
<IssueList
  issues={issuesArray}
  selectedId={currentIssueId}
  onSelect={(issue) => void}
  onClose={(issueId) => void}
  filter={{ status: 'open', type: 'task' }}
/>
```

**Displays:**
- Issue ID and title
- Priority indicator (P0-P4)
- Type badge (task, bug, feature, epic)
- Status color coding

---

## IssueDetail

Full issue view with dependencies, comments, and history.

```jsx
<IssueDetail
  issue={issueObject}
  dependencies={{
    blockedBy: [...],    // Issues this depends on
    blocks: [...]        // Issues that depend on this
  }}
  comments={commentsArray}
  history={historyArray}
  onClose={(reason) => void}
  onAddDep={(issueId, dependsOn) => void}
  onRemoveDep={(issueId, dep) => void}
  onAddComment={(text) => void}
  onBack={() => void}
/>
```

**Sections:**
- Header with status, priority, type
- Description (markdown rendered)
- Dependency tree (visual)
- Comments thread
- Activity history

---

## DependencyGraph

Interactive visualization of issue dependencies using React Flow.

```jsx
<DependencyGraph
  issues={[
    { id: 'fr-123', title: '...', status: 'open', priority: 'P2' }
  ]}
  dependencies={[
    { from: 'fr-123', to: 'fr-456' }  // 123 blocks 456
  ]}
  onNodeClick={(issue) => void}
  highlightCriticalPath={true}
/>
```

**Features:**
- Dagre layout for DAG visualization
- Color-coded by status (green=closed, blue=in_progress, red=blocked)
- Critical path highlighting
- Zoom/pan controls
- Minimap navigation

**Status Colors:**
```javascript
{
  closed: { bg: '#1a3a1a', border: '#00ff88' },
  in_progress: { bg: '#1a2a3a', border: '#00d9ff' },
  hooked: { bg: '#2a1a3a', border: '#a855f7' },
  open: { bg: '#2a2a2a', border: '#888888' },
  blocked: { bg: '#3a1a1a', border: '#ff4444' }
}
```

---

## AgentList

Grid display of all agents with status.

```jsx
<AgentList
  agents={[
    {
      name: 'frontend/nux',
      address: 'frontend/polecats/nux',
      type: 'polecat',       // core, polecat, witness, refinery, deacon
      role: 'Worker',
      running: true,
      status: 'running'
    }
  ]}
  onSelect={(agent) => void}
/>
```

**Agent Types:**
- `core` - Mayor (global coordinator)
- `witness` - Worker monitor
- `refinery` - Merge queue processor
- `polecat` - Worker agent
- `deacon` - Session daemon

---

## AgentLifecycle

Start/stop/restart controls for a single agent.

```jsx
<AgentLifecycle
  agent={agentObject}
  rig={rigName}              // Optional, for polecat context
  onStart={() => void}
  onStop={() => void}
  onRestart={() => void}
  onViewLogs={() => void}
/>
```

**States:**
- Running (green) - Stop/Restart available
- Stopped (gray) - Start available
- Error (red) - Restart available, error message shown

---

## RigList

Overview of configured rigs.

```jsx
<RigList
  rigs={[
    {
      name: 'frontend',
      polecats: 3,
      crew: 2,
      agents: ['witness', 'refinery']
    }
  ]}
  onSelect={(rig) => void}
/>
```

---

## RigManager

Full rig management with create/delete.

```jsx
<RigManager
  rigs={rigsArray}
  onCreate={(name, repoUrl, remote) => void}
  onDelete={(name, force) => void}
  onSpawnPolecat={(rig, name, issue) => void}
  onRefresh={() => void}
/>
```

**Operations:**
- Create new rig from repo URL
- Delete rig (with force option)
- Spawn new polecat worker
- View rig details (polecats, agents)

---

## MergeQueue

Merge request processing view.

```jsx
<MergeQueue
  rig={rigName}
  items={[
    {
      id: 'mr-123',
      worker: 'nux',
      branch: 'feature/xyz',
      status: 'pending',     // pending, processing, merged, failed
      created: '...',
      epic: 'epic-abc'
    }
  ]}
  onRetry={(mrId) => void}
  onReject={(mrId, reason) => void}
  onViewDetails={(mrId) => void}
/>
```

**Statuses:**
- `pending` - In queue
- `processing` - Currently being merged
- `merged` - Successfully landed
- `failed` - Merge failed (retry available)

---

## MailThread

Threaded mail conversation view.

```jsx
<MailThread
  messages={[
    {
      id: 'hq-msg-abc',
      from: 'mayor',
      to: 'frontend/witness',
      subject: 'Status update',
      body: '...',
      thread: 'thread-xyz',
      created: '...',
      read: false
    }
  ]}
  selectedThread={threadId}
  onSelectThread={(threadId) => void}
  onReply={(to, subject, body) => void}
  onMarkRead={(messageId) => void}
  onDelete={(messageId) => void}
/>
```

**Features:**
- Thread grouping by subject
- Unread count badges
- Reply-in-thread
- Mark read/unread
- Delete messages

---

## EventList

Real-time activity stream.

```jsx
<EventList
  events={[
    {
      id: 'evt-123',
      type: 'issue_created',
      actor: 'frontend/nux',
      target: 'fr-456',
      message: 'Created issue: Fix login',
      timestamp: '...'
    }
  ]}
  limit={50}
  filter={{ types: ['issue_*', 'agent_*'] }}
/>
```

**Event Types:**
- `issue_created`, `issue_closed`, `issue_updated`
- `agent_started`, `agent_stopped`, `agent_error`
- `convoy_created`, `convoy_completed`
- `mr_submitted`, `mr_merged`, `mr_failed`

---

## SessionPeek

Live view into an agent's session.

```jsx
<SessionPeek
  agent={agentObject}
  logs={logContent}
  follow={true}              // Auto-scroll to bottom
  lines={100}                // Lines to display
  onRefresh={() => void}
/>
```

**Features:**
- Log content display
- Auto-refresh option
- Line limit configuration
- ANSI color rendering

---

## ActivityIndicator

Status indicator dots and styling utilities.

```jsx
import { ActivityDot, getActivityClass, EVENT_STYLES } from './ActivityIndicator';

// Dot indicator
<ActivityDot status="active" />  // green pulsing
<ActivityDot status="idle" />    // yellow
<ActivityDot status="error" />   // red

// Get CSS class
const className = getActivityClass(issue.status);

// Event styling
const style = EVENT_STYLES['issue_created'];
// { color: '#00ff88', icon: '📝' }
```

**Statuses:**
- `active` - Green, pulsing animation
- `idle` - Yellow, static
- `error` - Red, static
- `offline` - Gray, static

---

## Styling

All components use CSS variables for theming:

```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-tertiary: #1a1a1a;
  --border: #333333;
  --text-primary: #ffffff;
  --text-secondary: #aaaaaa;
  --accent: #00d9ff;
  --success: #00ff88;
  --warning: #ffaa00;
  --error: #ff4444;
}
```

Components use inline styles with fallbacks to these variables for consistent dark theme appearance.
