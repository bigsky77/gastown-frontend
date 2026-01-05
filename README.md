# Gas Town Frontend

A web dashboard for **Gas Town** - the multi-agent orchestration system for autonomous Claude Code agents.

## Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design, data flow, API reference
- **[Component Reference](docs/COMPONENTS.md)** - React component documentation

## Project Structure

```
gastown-frontend/
├── api/                    # Express API (wraps gt/bd CLI)
│   └── index.js           # REST endpoints + WebSocket
├── frontend/              # Next.js React app
│   ├── components/        # UI components (14 total)
│   ├── pages/             # Next.js pages
│   └── styles/            # Dark theme CSS
├── lib/                   # Shared client SDK
│   └── gastown.js         # API client functions
├── docs/                  # Documentation
│   ├── ARCHITECTURE.md    # System design
│   └── COMPONENTS.md      # React component docs
└── start.sh               # Dev startup script
```

## Quick Start

```bash
# From gastown-frontend directory
chmod +x start.sh
./start.sh
```

Or manually:

```bash
# Terminal 1: API
cd api && npm install && npm run dev

# Terminal 2: Frontend
cd frontend && npm install && npm run dev
```

## Endpoints

### API (http://localhost:3001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Town status |
| `/api/rigs` | GET | List rigs |
| `/api/convoys` | GET | List convoys |
| `/api/convoys/:id` | GET | Convoy details |
| `/api/convoys` | POST | Create convoy |
| `/api/issues` | GET | List issues (filter: status, type, assignee) |
| `/api/issues/ready` | GET | Ready issues (no blockers) |
| `/api/issues/:id` | GET | Issue details |
| `/api/issues` | POST | Create issue |
| `/api/issues/:id` | PATCH | Update issue |
| `/api/issues/:id/close` | POST | Close issue |
| `/api/mail/inbox` | GET | Mail inbox |
| `/api/mail/:id` | GET | Read message |
| `/api/mail` | POST | Send mail |
| `/api/agents` | GET | List agents |
| `/api/rigs/:rig/polecats` | GET | List polecats |
| `/api/sling` | POST | Sling work to rig |
| `/api/events` | GET | Event feed |

### WebSocket (ws://localhost:3001/ws)

Real-time updates:
- `{ type: 'convoys', data: [...] }` - Convoy updates (every 5s)
- `{ type: 'event', data: {...} }` - New events
- `{ type: 'status', data: {...} }` - Status updates

## Features

### Work Management
- **Convoy Dashboard** - Track batch work progress with visual indicators
- **Issue Browser** - View, filter, and manage issues (tasks, bugs, features)
- **Dependency Graph** - Interactive visualization of issue dependencies
- **Control Panel** - Create issues and dispatch work to agents

### Agent Operations
- **Agent Status** - Monitor all agents (Mayor, Witness, Refinery, Polecats)
- **Lifecycle Controls** - Start/stop/restart agents from the UI
- **Session Peek** - View live agent session logs
- **Merge Queue** - Track and manage pending merge requests

### Communication
- **Mail Thread** - Read and send messages between agents
- **Event Feed** - Real-time activity stream with filtering
- **Rig Manager** - Configure and manage project rigs

## Integration with Autonomous Claude Platform

This frontend is designed to eventually integrate with the Autonomous Claude Platform:

1. **Session View**: Each convoy could map to an ACP session
2. **Real-time Updates**: WebSocket pattern matches ACP dashboard
3. **Activity Colors**: Green/yellow/red activity indicators (like ACP)
4. **Cost Tracking**: Can add token usage from beads

## Environment Variables

### API
- `PORT` - API port (default: 3001)
- `TOWN_ROOT` - Gas Town root directory (default: /home/bigsky/gt)

### Frontend
- `NEXT_PUBLIC_API_URL` - API URL (default: http://localhost:3001)
- `NEXT_PUBLIC_WS_URL` - WebSocket URL (default: ws://localhost:3001/ws)
