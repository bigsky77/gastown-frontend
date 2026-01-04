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
const GT_BIN = process.env.GT_BIN || '/home/bigsky/go/bin/gt';
const BD_BIN = process.env.BD_BIN || '/home/bigsky/go/bin/bd';

app.use(cors());
app.use(express.json());

// Helper to run gt commands
async function runGt(args, cwd = TOWN_ROOT) {
  try {
    const { stdout, stderr } = await execAsync(`${GT_BIN} ${args}`, { cwd, timeout: 30000 });
    return { success: true, output: stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

// Helper to run bd commands
async function runBd(args, cwd = BEADS_DIR) {
  try {
    const { stdout, stderr } = await execAsync(`${BD_BIN} ${args}`, { cwd, timeout: 30000 });
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

// Town status - construct from parts since gt status --json doesn't exist
app.get('/api/status', async (req, res) => {
  try {
    // Get rigs
    const rigsResult = await runGt('rig list');
    const rigs = [];
    if (rigsResult.success) {
      const lines = rigsResult.output.split('\n');
      let currentRig = null;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('Rigs in')) continue;
        if (line.match(/^  \S/) && !line.match(/^\s{4}/)) {
          if (currentRig) rigs.push(currentRig);
          currentRig = { name: trimmed, polecats: 0, crew: 0, agents: [], running: 0 };
        } else if (trimmed.startsWith('Polecats:') && currentRig) {
          const match = trimmed.match(/Polecats:\s*(\d+)\s+Crew:\s*(\d+)/);
          if (match) {
            currentRig.polecats = parseInt(match[1]);
            currentRig.crew = parseInt(match[2]);
          }
        }
      }
      if (currentRig) rigs.push(currentRig);
    }

    // Get issue counts
    const issuesResult = await runBd('list --status=open --json');
    let openIssues = 0;
    if (issuesResult.success) {
      try {
        const issues = JSON.parse(issuesResult.output);
        openIssues = Array.isArray(issues) ? issues.length : 0;
      } catch {}
    }

    // Get convoy count
    const convoysResult = await runGt('convoy list --json');
    let activeConvoys = 0;
    if (convoysResult.success) {
      try {
        const data = JSON.parse(convoysResult.output);
        activeConvoys = data.convoys?.length || 0;
      } catch {}
    }

    // Count running agents
    let runningAgents = 0;
    for (const rig of rigs) {
      runningAgents += rig.polecats; // Approximate - could parse gt polecat list
    }

    res.json({
      connected: true,
      town: {
        name: 'gt',
        path: TOWN_ROOT,
        rigs: rigs
      },
      stats: {
        runningAgents,
        activeConvoys,
        openIssues,
        rigCount: rigs.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message, connected: false });
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

// List all agents with lifecycle info (for AgentLifecycle component)
app.get('/api/agents', async (req, res) => {
  try {
    // Get agents from gt agents list
    const agentsResult = await runGt('agents list --json');
    let agents = [];

    if (agentsResult.success) {
      const data = parseJsonOutput(agentsResult.output);
      if (data?.agents) {
        agents = data.agents;
      }
    }

    // If no JSON output, parse text output
    if (agents.length === 0 && agentsResult.success) {
      const lines = agentsResult.output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        // Parse lines like "mayor [running]" or "gtf/witness [stopped]"
        const match = line.match(/^\s*(\S+)\s*\[(running|stopped|error)\]/i);
        if (match) {
          agents.push({
            name: match[1],
            address: match[1],
            running: match[2].toLowerCase() === 'running',
            status: match[2].toLowerCase()
          });
        }
      }
    }

    // Add type categorization
    agents = agents.map(a => ({
      ...a,
      type: getAgentType(a.name || a.address),
      role: getAgentRole(a.name || a.address)
    }));

    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper to categorize agent types
function getAgentType(name) {
  if (name === 'mayor' || name.endsWith('/mayor')) return 'core';
  if (name.includes('witness')) return 'witness';
  if (name.includes('refinery')) return 'refinery';
  if (name.includes('deacon')) return 'deacon';
  if (name.includes('polecat') || name.includes('crew/')) return 'polecat';
  return 'agent';
}

// Helper to get agent role description
function getAgentRole(name) {
  if (name === 'mayor' || name.endsWith('/mayor')) return 'Global Coordinator';
  if (name.includes('witness')) return 'Worker Monitor';
  if (name.includes('refinery')) return 'Merge Queue';
  if (name.includes('deacon')) return 'Session Daemon';
  if (name.includes('polecat') || name.includes('crew/')) return 'Worker';
  return 'Agent';
}

// Start an agent
app.post('/api/agents/:name/start', async (req, res) => {
  const agentName = req.params.name;
  const { rig } = req.body;

  // Determine the command based on agent type
  let result;
  if (agentName.includes('polecat') || agentName.includes('crew/')) {
    // For crew/polecats, use crew start
    const crewName = agentName.split('/').pop();
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt(`crew start ${crewName}`, cwd);
  } else if (agentName === 'deacon' || agentName.includes('/deacon')) {
    // For deacon, use deacon start
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt('deacon start', cwd);
  } else {
    // For other agents, try agents start
    result = await runGt(`agents start ${agentName}`);
  }

  if (result.success) {
    res.json({ success: true, agent: agentName, output: result.output });
  } else {
    res.status(500).json({ error: result.error, stderr: result.stderr });
  }
});

// Stop an agent
app.post('/api/agents/:name/stop', async (req, res) => {
  const agentName = req.params.name;
  const { rig } = req.body;

  let result;
  if (agentName.includes('polecat') || agentName.includes('crew/')) {
    // For crew/polecats, use crew stop
    const crewName = agentName.split('/').pop();
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt(`crew stop ${crewName}`, cwd);
  } else if (agentName === 'deacon' || agentName.includes('/deacon')) {
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt('deacon stop', cwd);
  } else {
    result = await runGt(`agents stop ${agentName}`);
  }

  if (result.success) {
    res.json({ success: true, agent: agentName, output: result.output });
  } else {
    res.status(500).json({ error: result.error, stderr: result.stderr });
  }
});

// Restart an agent
app.post('/api/agents/:name/restart', async (req, res) => {
  const agentName = req.params.name;
  const { rig } = req.body;

  let result;
  if (agentName.includes('polecat') || agentName.includes('crew/')) {
    const crewName = agentName.split('/').pop();
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt(`crew restart ${crewName}`, cwd);
  } else if (agentName === 'deacon' || agentName.includes('/deacon')) {
    const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
    result = await runGt('deacon restart', cwd);
  } else {
    // Stop then start for generic agents
    await runGt(`agents stop ${agentName}`);
    result = await runGt(`agents start ${agentName}`);
  }

  if (result.success) {
    res.json({ success: true, agent: agentName, output: result.output });
  } else {
    res.status(500).json({ error: result.error, stderr: result.stderr });
  }
});

// Get agent logs
app.get('/api/agents/:name/logs', async (req, res) => {
  const agentName = req.params.name;
  const { lines = 50, rig } = req.query;

  try {
    let logPath;
    const rigPath = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;

    // Determine log file location based on agent type
    if (agentName === 'deacon' || agentName.includes('/deacon')) {
      logPath = path.join(rigPath, '.runtime', 'deacon.log');
    } else if (agentName.includes('witness')) {
      logPath = path.join(rigPath, '.runtime', 'witness.log');
    } else if (agentName.includes('refinery')) {
      logPath = path.join(rigPath, '.runtime', 'refinery.log');
    } else if (agentName.includes('polecat') || agentName.includes('crew/')) {
      const workerName = agentName.split('/').pop();
      logPath = path.join(rigPath, 'polecats', workerName, '.runtime', 'session.log');
      // Also try crew path
      if (!await fs.access(logPath).then(() => true).catch(() => false)) {
        logPath = path.join(rigPath, 'crew', workerName, '.runtime', 'session.log');
      }
    } else if (agentName === 'mayor') {
      logPath = path.join(TOWN_ROOT, 'mayor', '.runtime', 'session.log');
    } else {
      // Generic: try to find in .runtime
      logPath = path.join(rigPath, '.runtime', `${agentName}.log`);
    }

    // Read last N lines of log
    const content = await fs.readFile(logPath, 'utf-8');
    const allLines = content.split('\n');
    const lastLines = allLines.slice(-parseInt(lines)).join('\n');

    res.json({
      agent: agentName,
      logPath,
      lines: parseInt(lines),
      content: lastLines
    });
  } catch (error) {
    // Try alternative: use tail command
    try {
      const { stdout } = await execAsync(`tail -n ${lines} ${logPath} 2>/dev/null || echo "Log not found"`);
      res.json({ agent: agentName, content: stdout, error: 'Log file may not exist' });
    } catch {
      res.json({ agent: agentName, content: '', error: 'Could not read logs' });
    }
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
  const { issue, rig, message, naked } = req.body;
  if (!issue) {
    return res.status(400).json({ error: 'issue required' });
  }
  let cmd = `sling ${issue}`;
  if (rig) cmd += ` ${rig}`;
  if (message) cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
  if (naked) cmd += ' --naked';

  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, issue, rig: rig || 'self', output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== CREW MANAGEMENT ====================

// List crew workers
app.get('/api/crew', async (req, res) => {
  const { rig } = req.query;
  // Run from rig directory to get crew list
  const cwd = rig ? path.join(TOWN_ROOT, rig, 'mayor', 'rig') : TOWN_ROOT;
  const result = await runGt('crew list', cwd);
  if (result.success) {
    // Parse text output into structured data
    const lines = result.output.split('\n');
    const crews = [];
    for (const line of lines) {
      const match = line.match(/^\s*(\S+)\s+\[(running|stopped)\]\s*(.*)$/);
      if (match) {
        crews.push({
          name: match[1],
          status: match[2],
          info: match[3].trim()
        });
      }
    }
    res.json({ crews, rig: rig || 'all', raw: result.output });
  } else {
    res.status(500).json({ error: result.error, rig });
  }
});

// Add crew worker
app.post('/api/crew', async (req, res) => {
  const { name, rig } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name required' });
  }
  const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
  const result = await runGt(`crew add ${name}`, cwd);
  if (result.success) {
    res.json({ success: true, name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Start crew worker
app.post('/api/crew/:name/start', async (req, res) => {
  const { rig } = req.body;
  const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
  const result = await runGt(`crew start ${req.params.name}`, cwd);
  if (result.success) {
    res.json({ success: true, name: req.params.name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get crew worker status
app.get('/api/crew/:name/status', async (req, res) => {
  const { rig } = req.query;
  const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
  const result = await runGt(`crew status ${req.params.name}`, cwd);
  if (result.success) {
    res.json({ name: req.params.name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Remove crew worker
app.delete('/api/crew/:name', async (req, res) => {
  const { rig } = req.query;
  const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
  const result = await runGt(`crew remove ${req.params.name}`, cwd);
  if (result.success) {
    res.json({ success: true, name: req.params.name });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Restart crew worker
app.post('/api/crew/:name/restart', async (req, res) => {
  const { rig } = req.query;
  const cwd = rig ? path.join(TOWN_ROOT, rig) : TOWN_ROOT;
  const result = await runGt(`crew restart ${req.params.name}`, cwd);
  if (result.success) {
    res.json({ success: true, name: req.params.name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== AGENT CONTROL ====================

// Nudge an agent (send message to Claude session)
app.post('/api/nudge', async (req, res) => {
  const { target, message } = req.body;
  if (!target || !message) {
    return res.status(400).json({ error: 'target and message required' });
  }
  // Escape quotes in message
  const safeMessage = message.replace(/"/g, '\\"');
  const result = await runGt(`nudge ${target} "${safeMessage}"`);
  if (result.success) {
    res.json({ success: true, target, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get agent state
app.get('/api/agents/:name/state', async (req, res) => {
  const result = await runGt(`agents state ${req.params.name}`);
  if (result.success) {
    res.json({ name: req.params.name, state: result.output.trim() });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Set agent state
app.put('/api/agents/:name/state', async (req, res) => {
  const { state } = req.body;
  if (!state) {
    return res.status(400).json({ error: 'state required' });
  }
  const result = await runGt(`agents state ${req.params.name} ${state}`);
  if (result.success) {
    res.json({ success: true, name: req.params.name, state });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== HOOK MANAGEMENT ====================

// Get current hook status
app.get('/api/hook', async (req, res) => {
  const result = await runGt('hook status --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { raw: result.output });
  } else {
    // Try without --json
    const result2 = await runGt('hook status');
    res.json({ raw: result2.output || result.error });
  }
});

// Attach work to hook
app.post('/api/hook', async (req, res) => {
  const { beadId, subject } = req.body;
  if (!beadId) {
    return res.status(400).json({ error: 'beadId required' });
  }
  let cmd = `hook ${beadId}`;
  if (subject) cmd += ` -s "${subject}"`;
  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, beadId, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Detach work from hook (unsling)
app.delete('/api/hook', async (req, res) => {
  const result = await runGt('unsling');
  if (result.success) {
    res.json({ success: true, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== MOLECULE/WORKFLOW ====================

// Get molecule status (current work)
app.get('/api/mol/status', async (req, res) => {
  const result = await runGt('mol status');
  if (result.success) {
    res.json({ output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get current step
app.get('/api/mol/current', async (req, res) => {
  const result = await runGt('mol current');
  if (result.success) {
    res.json({ output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get molecule progress
app.get('/api/mol/progress', async (req, res) => {
  const result = await runGt('mol progress');
  if (result.success) {
    res.json({ output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Complete current step
app.post('/api/mol/step/done', async (req, res) => {
  const result = await runGt('mol step done');
  if (result.success) {
    res.json({ success: true, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Attach molecule to hook
app.post('/api/mol/attach', async (req, res) => {
  const { molId } = req.body;
  if (!molId) {
    return res.status(400).json({ error: 'molId required' });
  }
  const result = await runGt(`mol attach ${molId}`);
  if (result.success) {
    res.json({ success: true, molId, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Detach molecule from hook
app.post('/api/mol/detach', async (req, res) => {
  const result = await runGt('mol detach');
  if (result.success) {
    res.json({ success: true, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== FORMULAS ====================

// List available formulas
app.get('/api/formulas', async (req, res) => {
  const result = await runGt('formula list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { formulas: [], raw: result.output });
  } else {
    // Try without --json
    const result2 = await runGt('formula list');
    if (result2.success) {
      // Parse text output
      const lines = result2.output.split('\n').filter(l => l.trim());
      const formulas = lines.map(l => ({ name: l.trim() }));
      res.json({ formulas, raw: result2.output });
    } else {
      res.json({ formulas: [], raw: result2.output || result.error });
    }
  }
});

// Pour a formula (create molecule from template)
app.post('/api/formulas/:name/pour', async (req, res) => {
  const { target, params } = req.body;
  let cmd = `pour ${req.params.name}`;
  if (target) cmd += ` ${target}`;
  // Add any parameters
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      cmd += ` --${key}="${value}"`;
    }
  }
  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, formula: req.params.name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== HANDOFF ====================

// Create handoff (save context for next session)
app.post('/api/handoff', async (req, res) => {
  const { message, beadId } = req.body;
  let cmd = 'handoff';
  if (message) cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
  if (beadId) cmd += ` ${beadId}`;
  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== CONVOY EXTENDED ====================

// Close convoy
app.post('/api/convoys/:id/close', async (req, res) => {
  const result = await runGt(`convoy close ${req.params.id}`);
  if (result.success) {
    res.json({ success: true, id: req.params.id });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Add issue to convoy
app.post('/api/convoys/:id/track', async (req, res) => {
  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ error: 'issueId required' });
  }
  const result = await runGt(`convoy track ${req.params.id} ${issueId}`);
  if (result.success) {
    res.json({ success: true, convoyId: req.params.id, issueId });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// ==================== QUICK ACTIONS ====================

// Sling work with auto-convoy (main entry point for starting work)
app.post('/api/work/start', async (req, res) => {
  const { issue, target, title } = req.body;
  if (!issue) {
    return res.status(400).json({ error: 'issue required' });
  }

  // Default target is self
  const targetArg = target || '';

  // Sling creates auto-convoy
  const result = await runGt(`sling ${issue} ${targetArg}`.trim());
  if (result.success) {
    res.json({
      success: true,
      issue,
      target: target || 'self',
      output: result.output
    });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Quick create issue and sling it
app.post('/api/work/quick', async (req, res) => {
  const { title, description, target, type = 'task', priority = 2 } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title required' });
  }

  // Create issue first
  let createCmd = `create --title="${title}" --type=${type} --priority=${priority}`;
  if (description) createCmd += ` --description="${description}"`;
  createCmd += ' --json';

  const createResult = await runBd(createCmd);
  if (!createResult.success) {
    return res.status(500).json({ error: 'Failed to create issue', detail: createResult.error });
  }

  const issueData = parseJsonOutput(createResult.output);
  const issueId = issueData?.id;

  if (!issueId) {
    return res.status(500).json({ error: 'Failed to parse issue ID', raw: createResult.output });
  }

  // If target specified, sling it
  if (target) {
    const slingResult = await runGt(`sling ${issueId} ${target}`);
    if (slingResult.success) {
      res.json({
        success: true,
        issue: issueData,
        slung: true,
        target,
        slingOutput: slingResult.output
      });
    } else {
      res.json({
        success: true,
        issue: issueData,
        slung: false,
        slingError: slingResult.error
      });
    }
  } else {
    res.json({ success: true, issue: issueData, slung: false });
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
