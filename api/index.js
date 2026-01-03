import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3001;
const TOWN_ROOT = process.env.TOWN_ROOT || '/home/bigsky/gt';
const BEADS_DIR = path.join(TOWN_ROOT, '.beads');

app.use(cors());
app.use(express.json());

// Helper to run gt commands
async function runGt(args, cwd = TOWN_ROOT) {
  try {
    const { stdout, stderr } = await execAsync(`gt ${args}`, { cwd, timeout: 30000 });
    return { success: true, output: stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

// Helper to run bd commands
async function runBd(args, cwd = BEADS_DIR) {
  try {
    const { stdout, stderr } = await execAsync(`bd ${args}`, { cwd, timeout: 30000 });
    return { success: true, output: stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

// Parse JSON output from commands
function parseJsonOutput(output) {
  try {
    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

// ==================== STATUS ENDPOINTS ====================

// Town status
app.get('/api/status', async (req, res) => {
  const result = await runGt('status --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// List rigs (parse text output since --json not supported)
app.get('/api/rigs', async (req, res) => {
  const result = await runGt('rig list');
  if (result.success) {
    // Parse text output: "  rigname\n    Polecats: N  Crew: M\n    Agents: [...]"
    const lines = result.output.split('\n');
    const rigs = [];
    let currentRig = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Rigs in')) continue;

      // New rig name (not indented much)
      if (line.match(/^  \S/) && !line.match(/^\s{4}/)) {
        if (currentRig) rigs.push(currentRig);
        currentRig = { name: trimmed, polecats: 0, crew: 0, agents: [] };
      }
      // Polecat/Crew line
      else if (trimmed.startsWith('Polecats:') && currentRig) {
        const match = trimmed.match(/Polecats:\s*(\d+)\s+Crew:\s*(\d+)/);
        if (match) {
          currentRig.polecats = parseInt(match[1]);
          currentRig.crew = parseInt(match[2]);
        }
      }
      // Agents line
      else if (trimmed.startsWith('Agents:') && currentRig) {
        const match = trimmed.match(/Agents:\s*\[([^\]]*)\]/);
        if (match) {
          currentRig.agents = match[1].split(/\s+/).filter(Boolean);
        }
      }
    }
    if (currentRig) rigs.push(currentRig);

    res.json({ rigs });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== CONVOY ENDPOINTS ====================

// List convoys
app.get('/api/convoys', async (req, res) => {
  const result = await runGt('convoy list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { convoys: [], raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get convoy details
app.get('/api/convoys/:id', async (req, res) => {
  const result = await runGt(`convoy status ${req.params.id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Create convoy
app.post('/api/convoys', async (req, res) => {
  const { title, issues } = req.body;
  if (!title || !issues?.length) {
    return res.status(400).json({ error: 'title and issues required' });
  }
  const issueList = issues.join(' ');
  const result = await runGt(`convoy create "${title}" ${issueList} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== ISSUE ENDPOINTS ====================

// List issues
app.get('/api/issues', async (req, res) => {
  const { status, type, assignee } = req.query;
  let args = 'list --json';
  if (status) args += ` --status=${status}`;
  if (type) args += ` --type=${type}`;
  if (assignee) args += ` --assignee=${assignee}`;

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || []);
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get ready issues (no blockers)
app.get('/api/issues/ready', async (req, res) => {
  const result = await runBd('ready --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || []);
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get single issue
app.get('/api/issues/:id', async (req, res) => {
  const result = await runBd(`show ${req.params.id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Create issue
app.post('/api/issues', async (req, res) => {
  const { title, type = 'task', priority = 2, description } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title required' });
  }
  let args = `create --title="${title}" --type=${type} --priority=${priority}`;
  if (description) args += ` --description="${description}"`;
  args += ' --json';

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Update issue
app.patch('/api/issues/:id', async (req, res) => {
  const { status, assignee, priority } = req.body;
  let args = `update ${req.params.id}`;
  if (status) args += ` --status=${status}`;
  if (assignee) args += ` --assignee=${assignee}`;
  if (priority !== undefined) args += ` --priority=${priority}`;
  args += ' --json';

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Close issue
app.post('/api/issues/:id/close', async (req, res) => {
  const { reason } = req.body;
  let args = `close ${req.params.id}`;
  if (reason) args += ` --reason="${reason}"`;
  args += ' --json';

  const result = await runBd(args);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== MAIL ENDPOINTS ====================

// Get inbox
app.get('/api/mail/inbox', async (req, res) => {
  const result = await runGt('mail inbox --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { messages: [], raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Read message
app.get('/api/mail/:id', async (req, res) => {
  const result = await runGt(`mail read ${req.params.id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Send mail
app.post('/api/mail', async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body required' });
  }
  const result = await runGt(`mail send ${to} -s "${subject}" -m "${body}"`);
  if (result.success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== AGENT ENDPOINTS ====================

// List agents
app.get('/api/agents', async (req, res) => {
  const result = await runGt('agents list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { agents: [], raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get agent hook status
app.get('/api/agents/:name/hook', async (req, res) => {
  // For specific agent, we'd need to query their hook
  // For now, return the current hook status
  const result = await runGt('hook --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// List polecats for a rig
app.get('/api/rigs/:rig/polecats', async (req, res) => {
  const result = await runGt(`polecat list ${req.params.rig} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { polecats: [], raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== SLING WORK ====================

// Sling issue to rig
app.post('/api/sling', async (req, res) => {
  const { issue, rig } = req.body;
  if (!issue || !rig) {
    return res.status(400).json({ error: 'issue and rig required' });
  }
  const result = await runGt(`sling ${issue} ${rig} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { success: true, raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== EVENTS ENDPOINT ====================

// Get recent events
app.get('/api/events', async (req, res) => {
  const { limit = 50, type } = req.query;
  try {
    const eventsFile = path.join(TOWN_ROOT, '.events.jsonl');
    const content = await fs.readFile(eventsFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let events = lines.map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    // Filter by type if specified
    if (type) {
      events = events.filter(e => e.type === type);
    }

    // Return most recent first, limited
    events = events.slice(-parseInt(limit)).reverse();

    res.json({ events });
  } catch (error) {
    res.json({ events: [], error: error.message });
  }
});

// ==================== WEBSOCKET FOR REAL-TIME ====================

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('WebSocket client connected');

  // Send initial status
  runGt('status --json').then(result => {
    if (result.success) {
      ws.send(JSON.stringify({ type: 'status', data: parseJsonOutput(result.output) }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

// Broadcast to all clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

// Watch events file for changes and broadcast
let lastEventCount = 0;
async function watchEvents() {
  try {
    const eventsFile = path.join(TOWN_ROOT, '.events.jsonl');
    const content = await fs.readFile(eventsFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length > lastEventCount) {
      // New events - broadcast them
      const newEvents = lines.slice(lastEventCount).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      newEvents.forEach(event => {
        broadcast({ type: 'event', data: event });
      });

      lastEventCount = lines.length;
    }
  } catch (error) {
    // File might not exist yet
  }
}

// Poll for new events every 2 seconds
setInterval(watchEvents, 2000);

// Poll for convoy updates every 5 seconds
setInterval(async () => {
  const result = await runGt('convoy list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    if (data) {
      broadcast({ type: 'convoys', data });
    }
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Gas Town API running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
  console.log(`Town root: ${TOWN_ROOT}`);
});
