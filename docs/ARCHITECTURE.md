# Gas Town Frontend Architecture

## Overview

The Gas Town Frontend is a web-based dashboard for managing **Gas Town** - a multi-agent orchestration system for autonomous Claude Code agents. It provides real-time visibility into agent activity, work coordination, and issue management.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Gas Town Frontend                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │   Next.js   │◄──►│  Express    │◄──►│  gt/bd CLI       │    │
│  │   React UI  │    │  API Server │    │  (Gas Town Core) │    │
│  └─────────────┘    └─────────────┘    └──────────────────┘    │
│        ▲                  │                                     │
│        │             WebSocket                                  │
│        └──────────────────┘                                     │
└─────────────────────────────────────────────────────────────────┘
```

## System Components

### 1. Express API Server (`api/`)

The API server wraps the Gas Town CLI tools (`gt` and `bd`) to provide RESTful endpoints:

```
api/
└── index.js          # Express server with all endpoints
    ├── Status endpoints      (/api/status, /api/rigs)
    ├── Convoy endpoints      (/api/convoys)
    ├── Issue endpoints       (/api/issues)
    ├── Mail endpoints        (/api/mail)
    ├── Agent endpoints       (/api/agents)
    ├── Merge queue endpoints (/api/rigs/:rig/mq)
    └── WebSocket server      (/ws)
```

**Key Design Decisions:**
- Wraps CLI tools rather than direct database access for consistency
- Parses text output when JSON not available from CLI
- WebSocket for real-time updates (convoys every 5s, events on change)
- 30s timeout on CLI commands

### 2. React Frontend (`frontend/`)

```
frontend/
├── pages/
│   ├── _app.js           # App wrapper
│   └── index.js          # Main dashboard page
├── components/           # Reusable UI components
│   ├── ControlPanel.js   # Quick work creation
│   ├── ConvoyList.js     # Batch work tracking
│   ├── IssueList.js      # Issue browser
│   ├── IssueDetail.js    # Full issue view with deps
│   ├── DependencyGraph.js# Visual dependency graph
│   ├── AgentList.js      # Agent status grid
│   ├── AgentLifecycle.js # Start/stop/restart controls
│   ├── RigList.js        # Rig overview
│   ├── RigManager.js     # Rig management UI
│   ├── MergeQueue.js     # MR processing view
│   ├── MailThread.js     # Mail conversation view
│   ├── EventList.js      # Activity stream
│   ├── SessionPeek.js    # Live session viewer
│   └── ActivityIndicator.js # Status indicators
└── styles/
    └── globals.css       # Dark theme CSS
```

### 3. Shared Library (`lib/`)

```
lib/
└── gastown.js            # Client SDK for API calls
    ├── Convoy operations
    ├── Issue operations
    ├── Mail operations
    └── Agent operations
```

## Data Flow

### 1. Read Operations

```
User Action → React Component → lib/gastown.js → HTTP GET → Express API
                                                     ↓
                                              execAsync(gt/bd)
                                                     ↓
                                              Parse output
                                                     ↓
Component ← JSON Response ← Express API ←───────────┘
```

### 2. Real-time Updates

```
                    ┌──────────────────────┐
                    │    Express Server    │
                    │  ┌────────────────┐  │
                    │  │ setInterval()  │  │
                    │  │ (every 5s)     │  │
                    │  └───────┬────────┘  │
                    │          ↓           │
                    │  gt convoy list      │
                    │          ↓           │
    ┌───────────────┤  ws.send(convoys)    │
    │               └──────────────────────┘
    │
    ↓
┌───────────────────────────────────────────┐
│              React Client                  │
│  ┌────────────────────────────────────┐   │
│  │ useEffect(() => {                   │   │
│  │   ws.onmessage = (data) => {       │   │
│  │     if (data.type === 'convoys')   │   │
│  │       setConvoys(data.data)        │   │
│  │   }                                 │   │
│  │ })                                  │   │
│  └────────────────────────────────────┘   │
└───────────────────────────────────────────┘
```

## Key Concepts

### Rigs
A **rig** is a project container holding:
- `polecats/` - Worker agent worktrees
- `refinery/` - Merge queue processor
- `witness/` - Worker lifecycle manager
- `.beads/` - Issue tracking database

### Convoys
**Convoys** are batches of work being processed together. They track:
- Issues in the batch
- Completion progress
- Which agents are assigned

### Beads
**Beads** are issues/tasks tracked by the `bd` CLI:
- Types: task, bug, feature, epic, message
- States: open, in_progress, closed
- Dependencies: issue A blocks issue B

### Agents

| Type | Role |
|------|------|
| **Mayor** | Global coordinator |
| **Witness** | Per-rig worker monitor |
| **Refinery** | Per-rig merge queue |
| **Polecat** | Worker (one per worktree) |
| **Deacon** | Session daemon |

## API Endpoint Summary

### Status
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Town status with stats |
| `/api/rigs` | GET | List all rigs |
| `/api/rigs/:rig/status` | GET | Detailed rig status |

### Work Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/convoys` | GET | List convoys |
| `/api/convoys/:id` | GET | Convoy details |
| `/api/convoys` | POST | Create convoy |
| `/api/sling` | POST | Dispatch work to rig |

### Issues
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/issues` | GET | List issues (filter: status, type) |
| `/api/issues/ready` | GET | Issues with no blockers |
| `/api/issues/blocked` | GET | Blocked issues |
| `/api/issues/:id` | GET | Issue details |
| `/api/issues/:id/deps` | GET | Issue dependencies |
| `/api/issues/:id/close` | POST | Close issue |

### Merge Queue
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rigs/:rig/mq` | GET | List merge requests |
| `/api/rigs/:rig/mq/:id/retry` | POST | Retry failed MR |
| `/api/rigs/:rig/mq/:id/reject` | POST | Reject MR |

### Agents
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List all agents |
| `/api/agents/:name/start` | POST | Start agent |
| `/api/agents/:name/stop` | POST | Stop agent |
| `/api/agents/:name/restart` | POST | Restart agent |
| `/api/agents/:name/logs` | GET | Agent logs |

### Mail
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mail/inbox` | GET | Inbox messages |
| `/api/mail/:id` | GET | Read message |
| `/api/mail` | POST | Send message |

## WebSocket Events

Connect to `ws://localhost:3001/ws` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'convoys':    // Array of convoy objects (every 5s)
    case 'event':      // New event occurred
    case 'status':     // Status update
    case 'mail':       // New mail message
  }
};
```

## Environment Configuration

### API Server
```bash
PORT=3001                        # API server port
TOWN_ROOT=/home/user/gt          # Gas Town root directory
GT_BIN=/path/to/gt               # gt CLI binary
BD_BIN=/path/to/bd               # bd CLI binary
```

### Frontend
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

## Integration Points

### Autonomous Claude Platform (ACP)

The frontend is designed for future ACP integration:

1. **Session View** - Convoys map to ACP sessions
2. **Activity Colors** - Green/yellow/red indicators match ACP
3. **Real-time Updates** - WebSocket pattern compatible
4. **Cost Tracking** - Token usage can be added via beads

### CLI Compatibility

All operations go through `gt` and `bd` CLI, ensuring:
- Consistent behavior with command line
- No direct database modification
- Full audit trail in git
