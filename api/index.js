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

// Create rig
app.post('/api/rigs', async (req, res) => {
  const { name, repoUrl, remote } = req.body;
  if (!name || !repoUrl) {
    return res.status(400).json({ error: 'name and repoUrl required' });
  }
  let cmd = `rig add ${name} ${repoUrl}`;
  if (remote) cmd += ` --remote=${remote}`;

  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, name, repoUrl, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Remove rig
app.delete('/api/rigs/:name', async (req, res) => {
  const { force } = req.query;
  let cmd = `rig remove ${req.params.name}`;
  if (force === 'true') cmd += ' --force';

  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, name: req.params.name });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Spawn polecat in a rig
app.post('/api/rigs/:name/polecat', async (req, res) => {
  const { name: polecatName, issue } = req.body;
  let cmd = `polecat spawn ${req.params.name}`;
  if (polecatName) cmd += ` --name=${polecatName}`;
  if (issue) cmd += ` --issue=${issue}`;

  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, rig: req.params.name, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get detailed rig status
app.get('/api/rigs/:name/status', async (req, res) => {
  const rigName = req.params.name;
  const rigPath = path.join(TOWN_ROOT, rigName);

  // Gather all status info in parallel
  const [polecatResult, witnessResult, refineryResult] = await Promise.all([
    runGt(`polecat list ${rigName}`),
    runGt(`witness status`, rigPath),
    runGt(`refinery status`, rigPath)
  ]);

  // Parse polecat list
  const polecats = [];
  if (polecatResult.success) {
    const lines = polecatResult.output.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*(\S+)\s+\[(running|stopped|idle)\]\s*(.*)$/i);
      if (match) {
        polecats.push({
          name: match[1],
          status: match[2].toLowerCase(),
          info: match[3].trim()
        });
      }
    }
  }

  res.json({
    rig: rigName,
    polecats: {
      list: polecats,
      raw: polecatResult.output,
      error: polecatResult.success ? null : polecatResult.error
    },
    witness: {
      raw: witnessResult.output,
      error: witnessResult.success ? null : witnessResult.error
    },
    refinery: {
      raw: refineryResult.output,
      error: refineryResult.success ? null : refineryResult.error
    }
  });
});

// ==================== MERGE QUEUE ENDPOINTS ====================

// List merge queue for a rig
app.get('/api/rigs/:rig/mq', async (req, res) => {
  const { status, worker, ready } = req.query;
  let cmd = `mq list ${req.params.rig} --json`;
  if (status) cmd += ` --status=${status}`;
  if (worker) cmd += ` --worker=${worker}`;
  if (ready === 'true') cmd += ' --ready';

  const result = await runGt(cmd);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || { items: [], raw: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get detailed status of a merge request
app.get('/api/rigs/:rig/mq/:id', async (req, res) => {
  const result = await runGt(`mq status ${req.params.id}`);
  if (result.success) {
    res.json({ id: req.params.id, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Retry a failed merge request
app.post('/api/rigs/:rig/mq/:id/retry', async (req, res) => {
  const result = await runGt(`mq retry ${req.params.id}`);
  if (result.success) {
    res.json({ success: true, id: req.params.id, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Reject a merge request
app.post('/api/rigs/:rig/mq/:id/reject', async (req, res) => {
  const { reason } = req.body;
  let cmd = `mq reject ${req.params.id}`;
  if (reason) cmd += ` --reason="${reason.replace(/"/g, '\\"')}"`;

  const result = await runGt(cmd);
  if (result.success) {
    res.json({ success: true, id: req.params.id, output: result.output });
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

// Get all blocked issues
app.get('/api/issues/blocked', async (req, res) => {
  const result = await runBd('blocked --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    res.json(data || []);
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get issue dependencies for graph visualization
app.get('/api/issues/dependencies', async (req, res) => {
  try {
    // Get all issues with their dependency info
    const issuesResult = await runBd('list --json');
    if (!issuesResult.success) {
      return res.status(500).json({ error: issuesResult.error });
    }

    const issues = parseJsonOutput(issuesResult.output) || [];
    const dependencies = [];

    // For each issue, get its dependencies via bd show
    for (const issue of issues) {
      const showResult = await runBd(`show ${issue.id} --json`);
      if (showResult.success) {
        const details = parseJsonOutput(showResult.output);
        // Dependencies are issues this one depends on (blocks this issue)
        if (details?.depends_on) {
          for (const dep of details.depends_on) {
            const depId = typeof dep === 'string' ? dep : dep.id;
            if (depId) {
              dependencies.push({
                from: depId,       // Dependency (blocker)
                to: issue.id,      // This issue (depends on blocker)
              });
            }
          }
        }
        // Also check blocked_by field if present
        if (details?.blocked_by) {
          for (const blocker of details.blocked_by) {
            const blockerId = typeof blocker === 'string' ? blocker : blocker.id;
            if (blockerId) {
              dependencies.push({
                from: blockerId,
                to: issue.id,
              });
            }
          }
        }
      }
    }

    // Deduplicate dependencies
    const seen = new Set();
    const uniqueDeps = dependencies.filter(d => {
      const key = `${d.from}->${d.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({
      issues,
      dependencies: uniqueDeps,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// ==================== DEPENDENCY ENDPOINTS ====================

// Get dependencies for an issue
app.get('/api/issues/:id/deps', async (req, res) => {
  const issueId = req.params.id;

  // Get both directions in parallel
  const [depsResult, dependentsResult] = await Promise.all([
    runBd(`dep list ${issueId} --json`),           // What this issue depends on
    runBd(`dep list ${issueId} --direction=up --json`)  // What depends on this issue
  ]);

  const blocks = [];      // Issues this one blocks (dependents)
  const blocked_by = [];  // Issues this one is blocked by (dependencies)

  if (depsResult.success) {
    const deps = parseJsonOutput(depsResult.output);
    if (Array.isArray(deps)) {
      blocked_by.push(...deps);
    }
  }

  if (dependentsResult.success) {
    const dependents = parseJsonOutput(dependentsResult.output);
    if (Array.isArray(dependents)) {
      blocks.push(...dependents);
    }
  }

  res.json({
    issue: issueId,
    blocks,      // Issues that depend on this one
    blocked_by   // Issues this one depends on
  });
});

// Add dependency to an issue
app.post('/api/issues/:id/deps', async (req, res) => {
  const { depends_on } = req.body;
  if (!depends_on) {
    return res.status(400).json({ error: 'depends_on required' });
  }

  const result = await runBd(`dep add ${req.params.id} ${depends_on}`);
  if (result.success) {
    res.json({ success: true, issue: req.params.id, depends_on, output: result.output });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Remove dependency from an issue
app.delete('/api/issues/:id/deps/:dep', async (req, res) => {
  const result = await runBd(`dep remove ${req.params.id} ${req.params.dep}`);
  if (result.success) {
    res.json({ success: true, issue: req.params.id, removed: req.params.dep });
  } else {
    res.status(500).json({ error: result.error });
  }
});

// Get full dependency graph for visualization
app.get('/api/deps/graph', async (req, res) => {
  const { format = 'json', issue } = req.query;

  if (issue) {
    // Get graph for a specific issue
    const result = await runBd(`graph ${issue} --json`);
    if (result.success) {
      const data = parseJsonOutput(result.output);
      res.json(data || { raw: result.output });
    } else {
      res.status(500).json({ error: result.error });
    }
  } else {
    // Get full digraph format for all issues
    if (format === 'digraph') {
      const result = await runBd('list --format=digraph');
      if (result.success) {
        res.json({ format: 'digraph', data: result.output });
      } else {
        res.status(500).json({ error: result.error });
      }
    } else if (format === 'dot') {
      const result = await runBd('list --format=dot');
      if (result.success) {
        res.json({ format: 'dot', data: result.output });
      } else {
        res.status(500).json({ error: result.error });
      }
    } else {
      // Default: get all issues and blocked issues to build graph
      const [listResult, blockedResult] = await Promise.all([
        runBd('list --json'),
        runBd('blocked --json')
      ]);

      if (listResult.success) {
        const issues = parseJsonOutput(listResult.output) || [];
        const blockedIssues = blockedResult.success ? parseJsonOutput(blockedResult.output) || [] : [];

        // Build a map of blocked_by relationships from blocked issues
        const blockedByMap = {};
        for (const bi of blockedIssues) {
          if (bi.blocked_by) {
            blockedByMap[bi.id] = bi.blocked_by;
          }
        }

        // Build graph structure
        const nodes = issues.map(i => ({
          id: i.id,
          title: i.title,
          status: i.status,
          priority: i.priority,
          dependency_count: i.dependency_count || 0,
          dependent_count: i.dependent_count || 0,
          blocked_by: blockedByMap[i.id] || []
        }));

        const edges = [];
        for (const issue of blockedIssues) {
          if (issue.blocked_by) {
            for (const dep of issue.blocked_by) {
              edges.push({ from: dep, to: issue.id });
            }
          }
        }

        res.json({ nodes, edges });
      } else {
        res.status(500).json({ error: listResult.error });
      }
    }
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

// Mark message as read/unread
app.patch('/api/mail/:id/read', async (req, res) => {
  const { read } = req.body;
  const markAs = read ? 'read' : 'unread';
  const result = await runGt(`mail mark ${req.params.id} --${markAs}`);
  if (result.success) {
    res.json({ success: true, id: req.params.id, read });
  } else {
    // If gt mail mark doesn't exist, try updating via beads
    // Messages are beads, so we can update their metadata
    const bdResult = await runBd(`update ${req.params.id} --read=${read}`);
    if (bdResult.success) {
      res.json({ success: true, id: req.params.id, read });
    } else {
      res.status(500).json({ error: result.error || 'Mark command not available' });
    }
  }
});

// Delete mail message
app.delete('/api/mail/:id', async (req, res) => {
  const result = await runGt(`mail delete ${req.params.id}`);
  if (result.success) {
    res.json({ success: true, id: req.params.id });
  } else {
    // If gt mail delete doesn't exist, try closing/archiving the bead
    const bdResult = await runBd(`close ${req.params.id} --reason="Deleted by user"`);
    if (bdResult.success) {
      res.json({ success: true, id: req.params.id });
    } else {
      res.status(500).json({ error: result.error || 'Delete command not available' });
    }
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

// ==================== AGENT LIFECYCLE ====================

// Start an agent
app.post('/api/agents/:name/start', async (req, res) => {
  const { rig } = req.body;
  const agentName = req.params.name;

  // Determine the right command based on agent type
  // Try polecat start first, fall back to generic agent start
  let result;
  if (rig) {
    result = await runGt(`polecat start ${agentName}`, path.join(TOWN_ROOT, rig));
  } else {
    result = await runGt(`${agentName} start`);
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
  const result = await runGt(`stop ${agentName}`);

  if (result.success) {
    res.json({ success: true, agent: agentName, output: result.output });
  } else {
    res.status(500).json({ error: result.error, stderr: result.stderr });
  }
});

// Restart an agent (stop + start)
app.post('/api/agents/:name/restart', async (req, res) => {
  const { rig } = req.body;
  const agentName = req.params.name;

  // Stop first
  const stopResult = await runGt(`stop ${agentName}`);
  if (!stopResult.success) {
    // Log but continue - agent might not be running
    console.log(`Stop failed for ${agentName}: ${stopResult.error}`);
  }

  // Brief delay to ensure clean shutdown
  await new Promise(resolve => setTimeout(resolve, 500));

  // Start
  let startResult;
  if (rig) {
    startResult = await runGt(`polecat start ${agentName}`, path.join(TOWN_ROOT, rig));
  } else {
    startResult = await runGt(`${agentName} start`);
  }

  if (startResult.success) {
    res.json({
      success: true,
      agent: agentName,
      stopOutput: stopResult.output,
      startOutput: startResult.output
    });
  } else {
    res.status(500).json({
      error: startResult.error,
      stopOutput: stopResult.output,
      stderr: startResult.stderr
    });
  }
});

// Get agent logs
app.get('/api/agents/:name/logs', async (req, res) => {
  const agentName = req.params.name;
  const { lines = 100, follow } = req.query;

  // Agent logs are typically in ~/.claude/projects/<path>/logs or journal
  // Try multiple log sources
  const logSources = [
    // systemd journal for the agent
    `journalctl -u gt-${agentName} -n ${lines} --no-pager 2>/dev/null`,
    // Claude session logs
    `tail -n ${lines} ~/.claude/projects/*/logs/${agentName}.log 2>/dev/null`,
    // gt logs directory
    `tail -n ${lines} ${TOWN_ROOT}/.logs/${agentName}.log 2>/dev/null`
  ];

  let logs = '';
  let source = 'none';

  for (const cmd of logSources) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 10000 });
      if (stdout.trim()) {
        logs = stdout;
        source = cmd.split(' ')[0]; // journalctl or tail
        break;
      }
    } catch {
      // Try next source
    }
  }

  // If follow is requested, note that real-time streaming needs WebSocket
  if (follow === 'true') {
    res.json({
      agent: agentName,
      lines: parseInt(lines),
      logs,
      source,
      note: 'For real-time log streaming, connect to WebSocket at /ws and subscribe to agent logs'
    });
  } else {
    res.json({
      agent: agentName,
      lines: parseInt(lines),
      logs,
      source
    });
  }
});

// ==================== SERVICES STATUS ====================

// Get status of all Gas Town services
app.get('/api/services/status', async (req, res) => {
  const services = {
    deacon: { status: 'unknown', pid: null, uptime: null },
    witnesses: [],
    refineries: [],
    polecats: []
  };

  // Check Deacon status
  try {
    const deaconResult = await runGt('deacon status');
    if (deaconResult.success) {
      const output = deaconResult.output;
      const pidMatch = output.match(/PID[:\s]+(\d+)/i);
      const runningMatch = output.match(/running|active/i);
      services.deacon = {
        status: runningMatch ? 'running' : 'stopped',
        pid: pidMatch ? parseInt(pidMatch[1]) : null,
        raw: output.trim()
      };
    } else {
      services.deacon.status = 'stopped';
      services.deacon.error = deaconResult.error;
    }
  } catch (error) {
    services.deacon.status = 'error';
    services.deacon.error = error.message;
  }

  // Get rig list first
  const rigsResult = await runGt('rig list');
  const rigNames = [];
  if (rigsResult.success) {
    const lines = rigsResult.output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('Rigs in') &&
          !trimmed.startsWith('Polecats:') &&
          !trimmed.startsWith('Agents:') &&
          line.match(/^  \S/) && !line.match(/^\s{4}/)) {
        rigNames.push(trimmed);
      }
    }
  }

  // Check each rig's services
  for (const rigName of rigNames) {
    const rigPath = path.join(TOWN_ROOT, rigName);

    // Witness status
    const witnessResult = await runGt('witness status', rigPath);
    const witnessStatus = {
      rig: rigName,
      status: 'unknown',
      pid: null
    };
    if (witnessResult.success) {
      const output = witnessResult.output;
      const pidMatch = output.match(/PID[:\s]+(\d+)/i);
      const runningMatch = output.match(/running|active|watching/i);
      witnessStatus.status = runningMatch ? 'running' : 'stopped';
      witnessStatus.pid = pidMatch ? parseInt(pidMatch[1]) : null;
      witnessStatus.raw = output.trim();
    } else {
      witnessStatus.status = 'stopped';
    }
    services.witnesses.push(witnessStatus);

    // Refinery status
    const refineryResult = await runGt('refinery status', rigPath);
    const refineryStatus = {
      rig: rigName,
      status: 'unknown',
      pid: null
    };
    if (refineryResult.success) {
      const output = refineryResult.output;
      const pidMatch = output.match(/PID[:\s]+(\d+)/i);
      const runningMatch = output.match(/running|active|processing/i);
      refineryStatus.status = runningMatch ? 'running' : 'stopped';
      refineryStatus.pid = pidMatch ? parseInt(pidMatch[1]) : null;
      refineryStatus.raw = output.trim();
    } else {
      refineryStatus.status = 'stopped';
    }
    services.refineries.push(refineryStatus);

    // Polecats in this rig
    const polecatResult = await runGt(`polecat list ${rigName}`);
    if (polecatResult.success) {
      const lines = polecatResult.output.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(\S+)\s+\[(running|stopped|idle)\]/i);
        if (match) {
          services.polecats.push({
            rig: rigName,
            name: match[1],
            status: match[2].toLowerCase()
          });
        }
      }
    }
  }

  // Summary health
  const health = {
    deaconOk: services.deacon.status === 'running',
    witnessesOk: services.witnesses.every(w => w.status === 'running'),
    refineriesOk: services.refineries.every(r => r.status === 'running'),
    polecatsRunning: services.polecats.filter(p => p.status === 'running').length,
    polecatsTotal: services.polecats.length
  };
  health.allHealthy = health.deaconOk && health.witnessesOk && health.refineriesOk;

  res.json({ services, health, rigs: rigNames });
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
const wss = new WebSocketServer({ noServer: true });

// WebSocket server for peek streaming
const wssPeek = new WebSocketServer({ noServer: true });

// Handle upgrade requests to route to correct WebSocket server
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname.startsWith('/ws/peek/')) {
    wssPeek.handleUpgrade(request, socket, head, (ws) => {
      wssPeek.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

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

// Track active peek streams
const peekStreams = new Map(); // polecatId -> { process, clients: Set }

wssPeek.on('connection', (ws, request) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  const polecatId = decodeURIComponent(pathname.replace('/ws/peek/', ''));

  console.log(`Peek connection opened for: ${polecatId}`);

  // Check if we already have a stream for this polecat
  if (peekStreams.has(polecatId)) {
    const stream = peekStreams.get(polecatId);
    stream.clients.add(ws);
    ws.send(JSON.stringify({ type: 'info', data: { message: 'Joined existing stream' } }));
  } else {
    // Start a new peek process
    const peekProcess = spawn(GT_BIN, ['peek', polecatId], {
      cwd: TOWN_ROOT,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    const stream = { process: peekProcess, clients: new Set([ws]) };
    peekStreams.set(polecatId, stream);

    peekProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          const msg = JSON.stringify({ type: 'output', data: line });
          stream.clients.forEach(client => {
            if (client.readyState === 1) client.send(msg);
          });
        }
      });
    });

    peekProcess.stderr.on('data', (data) => {
      const msg = JSON.stringify({ type: 'error', data: data.toString() });
      stream.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    });

    peekProcess.on('close', (code) => {
      const msg = JSON.stringify({ type: 'info', data: { message: `Process exited with code ${code}` } });
      stream.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
      peekStreams.delete(polecatId);
    });

    peekProcess.on('error', (err) => {
      const msg = JSON.stringify({ type: 'error', data: err.message });
      stream.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
      peekStreams.delete(polecatId);
    });
  }

  ws.on('close', () => {
    console.log(`Peek connection closed for: ${polecatId}`);
    const stream = peekStreams.get(polecatId);
    if (stream) {
      stream.clients.delete(ws);
      // If no more clients, kill the process after a delay
      if (stream.clients.size === 0) {
        setTimeout(() => {
          const currentStream = peekStreams.get(polecatId);
          if (currentStream && currentStream.clients.size === 0) {
            currentStream.process.kill();
            peekStreams.delete(polecatId);
            console.log(`Peek process killed for: ${polecatId}`);
          }
        }, 5000); // 5 second grace period
      }
    }
  });

  ws.on('error', () => {
    const stream = peekStreams.get(polecatId);
    if (stream) stream.clients.delete(ws);
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
  console.log(`Peek WebSocket at ws://localhost:${PORT}/ws/peek/:polecat`);
  console.log(`Town root: ${TOWN_ROOT}`);
});
