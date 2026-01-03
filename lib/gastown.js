/**
 * Gas Town Core Library
 *
 * Provides programmatic access to gt and bd CLI commands.
 * Extracted from api/index.js patterns for reuse.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// ==================== CONFIGURATION ====================

export const config = {
  townRoot: process.env.TOWN_ROOT || '/home/bigsky/gt',
  gtBin: process.env.GT_BIN || '/home/bigsky/go/bin/gt',
  bdBin: process.env.BD_BIN || '/home/bigsky/go/bin/bd',
  timeout: 30000,
};

export function getBeadsDir(cwd = config.townRoot) {
  return path.join(cwd, '.beads');
}

// ==================== COMMAND RUNNERS ====================

/**
 * Run a gt command
 * @param {string} args - Command arguments
 * @param {string} cwd - Working directory (defaults to TOWN_ROOT)
 * @returns {Promise<{success: boolean, output?: string, stderr?: string, error?: string}>}
 */
export async function runGt(args, cwd = config.townRoot) {
  try {
    const { stdout, stderr } = await execAsync(
      `${config.gtBin} ${args}`,
      { cwd, timeout: config.timeout }
    );
    return { success: true, output: stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

/**
 * Run a bd command
 * @param {string} args - Command arguments
 * @param {string} cwd - Working directory (defaults to BEADS_DIR)
 * @returns {Promise<{success: boolean, output?: string, stderr?: string, error?: string}>}
 */
export async function runBd(args, cwd = getBeadsDir()) {
  try {
    const { stdout, stderr } = await execAsync(
      `${config.bdBin} ${args}`,
      { cwd, timeout: config.timeout }
    );
    return { success: true, output: stdout, stderr };
  } catch (error) {
    return { success: false, error: error.message, stderr: error.stderr };
  }
}

// ==================== OUTPUT PARSING ====================

/**
 * Parse JSON output from commands
 * @param {string} output - Raw command output
 * @returns {object|null} Parsed JSON or null on failure
 */
export function parseJsonOutput(output) {
  try {
    return JSON.parse(output.trim());
  } catch {
    return null;
  }
}

/**
 * Parse rig list text output into structured data
 * @param {string} output - Raw gt rig list output
 * @returns {{name: string, polecats: number, crew: number, agents: string[]}[]}
 */
export function parseRigList(output) {
  const lines = output.split('\n');
  const rigs = [];
  let currentRig = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Rigs in')) continue;

    if (line.match(/^  \S/) && !line.match(/^\s{4}/)) {
      if (currentRig) rigs.push(currentRig);
      currentRig = { name: trimmed, polecats: 0, crew: 0, agents: [] };
    } else if (trimmed.startsWith('Polecats:') && currentRig) {
      const match = trimmed.match(/Polecats:\s*(\d+)\s+Crew:\s*(\d+)/);
      if (match) {
        currentRig.polecats = parseInt(match[1]);
        currentRig.crew = parseInt(match[2]);
      }
    } else if (trimmed.startsWith('Agents:') && currentRig) {
      const match = trimmed.match(/Agents:\s*\[([^\]]*)\]/);
      if (match) {
        currentRig.agents = match[1].split(/\s+/).filter(Boolean);
      }
    }
  }
  if (currentRig) rigs.push(currentRig);
  return rigs;
}

/**
 * Parse crew list text output into structured data
 * @param {string} output - Raw gt crew list output
 * @returns {{name: string, status: string, info: string}[]}
 */
export function parseCrewList(output) {
  const lines = output.split('\n');
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
  return crews;
}

// ==================== STATUS OPERATIONS ====================

/**
 * Get town status
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getStatus() {
  const result = await runGt('status --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * List rigs
 * @returns {Promise<{success: boolean, rigs?: object[], error?: string}>}
 */
export async function listRigs() {
  const result = await runGt('rig list');
  if (result.success) {
    return { success: true, rigs: parseRigList(result.output) };
  }
  return { success: false, error: result.error };
}

// ==================== CONVOY OPERATIONS ====================

/**
 * List convoys
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function listConvoys() {
  const result = await runGt('convoy list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { convoys: [], raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Get convoy status
 * @param {string} id - Convoy ID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getConvoyStatus(id) {
  const result = await runGt(`convoy status ${id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Create convoy
 * @param {string} title - Convoy title
 * @param {string[]} issues - Array of issue IDs
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function createConvoy(title, issues) {
  const issueList = issues.join(' ');
  const result = await runGt(`convoy create "${title}" ${issueList} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Close convoy
 * @param {string} id - Convoy ID
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function closeConvoy(id) {
  const result = await runGt(`convoy close ${id}`);
  return { success: result.success, error: result.error };
}

// ==================== ISSUE OPERATIONS ====================

/**
 * List issues
 * @param {object} options - Filter options
 * @param {string} options.status - Filter by status
 * @param {string} options.type - Filter by type
 * @param {string} options.assignee - Filter by assignee
 * @returns {Promise<{success: boolean, data?: object[], error?: string}>}
 */
export async function listIssues(options = {}) {
  let args = 'list --json';
  if (options.status) args += ` --status=${options.status}`;
  if (options.type) args += ` --type=${options.type}`;
  if (options.assignee) args += ` --assignee=${options.assignee}`;

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || [] };
  }
  return { success: false, error: result.error };
}

/**
 * Get ready issues (no blockers)
 * @returns {Promise<{success: boolean, data?: object[], error?: string}>}
 */
export async function getReadyIssues() {
  const result = await runBd('ready --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || [] };
  }
  return { success: false, error: result.error };
}

/**
 * Get single issue
 * @param {string} id - Issue ID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getIssue(id) {
  const result = await runBd(`show ${id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Create issue
 * @param {object} options - Issue options
 * @param {string} options.title - Issue title (required)
 * @param {string} options.type - Issue type (default: 'task')
 * @param {number} options.priority - Priority 0-4 (default: 2)
 * @param {string} options.description - Issue description
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function createIssue(options) {
  const { title, type = 'task', priority = 2, description } = options;
  if (!title) {
    return { success: false, error: 'title required' };
  }

  let args = `create --title="${title}" --type=${type} --priority=${priority}`;
  if (description) args += ` --description="${description}"`;
  args += ' --json';

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Update issue
 * @param {string} id - Issue ID
 * @param {object} updates - Fields to update
 * @param {string} updates.status - New status
 * @param {string} updates.assignee - New assignee
 * @param {number} updates.priority - New priority
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function updateIssue(id, updates = {}) {
  let args = `update ${id}`;
  if (updates.status) args += ` --status=${updates.status}`;
  if (updates.assignee) args += ` --assignee=${updates.assignee}`;
  if (updates.priority !== undefined) args += ` --priority=${updates.priority}`;
  args += ' --json';

  const result = await runBd(args);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Close issue
 * @param {string} id - Issue ID
 * @param {string} reason - Optional close reason
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function closeIssue(id, reason) {
  let args = `close ${id}`;
  if (reason) args += ` --reason="${reason}"`;
  args += ' --json';

  const result = await runBd(args);
  return { success: result.success, error: result.error };
}

// ==================== MAIL OPERATIONS ====================

/**
 * Get inbox
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getInbox() {
  const result = await runGt('mail inbox --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { messages: [], raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Read mail message
 * @param {string} id - Message ID
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function readMail(id) {
  const result = await runGt(`mail read ${id} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Send mail
 * @param {string} to - Recipient address
 * @param {string} subject - Message subject
 * @param {string} body - Message body
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendMail(to, subject, body) {
  const result = await runGt(`mail send ${to} -s "${subject}" -m "${body}"`);
  return { success: result.success, error: result.error };
}

// ==================== AGENT OPERATIONS ====================

/**
 * List agents
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function listAgents() {
  const result = await runGt('agents list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { agents: [], raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * List polecats for a rig
 * @param {string} rig - Rig name
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function listPolecats(rig) {
  const result = await runGt(`polecat list ${rig} --json`);
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { polecats: [], raw: result.output } };
  }
  return { success: false, error: result.error };
}

/**
 * Nudge an agent
 * @param {string} target - Agent target
 * @param {string} message - Nudge message
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function nudgeAgent(target, message) {
  const safeMessage = message.replace(/"/g, '\\"');
  const result = await runGt(`nudge ${target} "${safeMessage}"`);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Get agent state
 * @param {string} name - Agent name
 * @returns {Promise<{success: boolean, state?: string, error?: string}>}
 */
export async function getAgentState(name) {
  const result = await runGt(`agents state ${name}`);
  if (result.success) {
    return { success: true, state: result.output.trim() };
  }
  return { success: false, error: result.error };
}

/**
 * Set agent state
 * @param {string} name - Agent name
 * @param {string} state - New state
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function setAgentState(name, state) {
  const result = await runGt(`agents state ${name} ${state}`);
  return { success: result.success, error: result.error };
}

// ==================== CREW OPERATIONS ====================

/**
 * List crew workers
 * @param {string} rig - Optional rig name
 * @returns {Promise<{success: boolean, crews?: object[], error?: string}>}
 */
export async function listCrew(rig) {
  const cwd = rig ? path.join(config.townRoot, rig, 'mayor', 'rig') : config.townRoot;
  const result = await runGt('crew list', cwd);
  if (result.success) {
    return { success: true, crews: parseCrewList(result.output), raw: result.output };
  }
  return { success: false, error: result.error };
}

/**
 * Add crew worker
 * @param {string} name - Worker name
 * @param {string} rig - Optional rig name
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function addCrew(name, rig) {
  const cwd = rig ? path.join(config.townRoot, rig) : config.townRoot;
  const result = await runGt(`crew add ${name}`, cwd);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Start crew worker
 * @param {string} name - Worker name
 * @param {string} rig - Optional rig name
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function startCrew(name, rig) {
  const cwd = rig ? path.join(config.townRoot, rig) : config.townRoot;
  const result = await runGt(`crew start ${name}`, cwd);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Restart crew worker
 * @param {string} name - Worker name
 * @param {string} rig - Optional rig name
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function restartCrew(name, rig) {
  const cwd = rig ? path.join(config.townRoot, rig) : config.townRoot;
  const result = await runGt(`crew restart ${name}`, cwd);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Remove crew worker
 * @param {string} name - Worker name
 * @param {string} rig - Optional rig name
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function removeCrew(name, rig) {
  const cwd = rig ? path.join(config.townRoot, rig) : config.townRoot;
  const result = await runGt(`crew remove ${name}`, cwd);
  return { success: result.success, error: result.error };
}

// ==================== HOOK OPERATIONS ====================

/**
 * Get hook status
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function getHookStatus() {
  const result = await runGt('hook status --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    return { success: true, data: data || { raw: result.output } };
  }
  // Try without --json
  const result2 = await runGt('hook status');
  return { success: true, data: { raw: result2.output || result.error } };
}

/**
 * Attach work to hook
 * @param {string} beadId - Bead ID to hook
 * @param {string} subject - Optional subject
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function attachToHook(beadId, subject) {
  let cmd = `hook ${beadId}`;
  if (subject) cmd += ` -s "${subject}"`;
  const result = await runGt(cmd);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Detach work from hook
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function detachFromHook() {
  const result = await runGt('unsling');
  return { success: result.success, output: result.output, error: result.error };
}

// ==================== MOLECULE OPERATIONS ====================

/**
 * Get molecule status
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function getMolStatus() {
  const result = await runGt('mol status');
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Get current molecule step
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function getMolCurrent() {
  const result = await runGt('mol current');
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Get molecule progress
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function getMolProgress() {
  const result = await runGt('mol progress');
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Complete current molecule step
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function completeMolStep() {
  const result = await runGt('mol step done');
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Attach molecule to hook
 * @param {string} molId - Molecule ID
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function attachMol(molId) {
  const result = await runGt(`mol attach ${molId}`);
  return { success: result.success, output: result.output, error: result.error };
}

/**
 * Detach molecule from hook
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function detachMol() {
  const result = await runGt('mol detach');
  return { success: result.success, output: result.output, error: result.error };
}

// ==================== FORMULA OPERATIONS ====================

/**
 * List formulas
 * @returns {Promise<{success: boolean, formulas?: object[], error?: string}>}
 */
export async function listFormulas() {
  const result = await runGt('formula list --json');
  if (result.success) {
    const data = parseJsonOutput(result.output);
    if (data) return { success: true, formulas: data.formulas || data };
  }
  // Try without --json
  const result2 = await runGt('formula list');
  if (result2.success) {
    const lines = result2.output.split('\n').filter(l => l.trim());
    const formulas = lines.map(l => ({ name: l.trim() }));
    return { success: true, formulas, raw: result2.output };
  }
  return { success: false, formulas: [], error: result.error };
}

/**
 * Pour a formula (create molecule from template)
 * @param {string} name - Formula name
 * @param {string} target - Optional target
 * @param {object} params - Optional parameters
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function pourFormula(name, target, params = {}) {
  let cmd = `pour ${name}`;
  if (target) cmd += ` ${target}`;
  for (const [key, value] of Object.entries(params)) {
    cmd += ` --${key}="${value}"`;
  }
  const result = await runGt(cmd);
  return { success: result.success, output: result.output, error: result.error };
}

// ==================== SLING OPERATIONS ====================

/**
 * Sling issue to rig/polecat
 * @param {string} issue - Issue ID
 * @param {string} rig - Optional target rig
 * @param {object} options - Options
 * @param {string} options.message - Optional message
 * @param {boolean} options.naked - Naked sling (no molecule)
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function sling(issue, rig, options = {}) {
  let cmd = `sling ${issue}`;
  if (rig) cmd += ` ${rig}`;
  if (options.message) cmd += ` -m "${options.message.replace(/"/g, '\\"')}"`;
  if (options.naked) cmd += ' --naked';

  const result = await runGt(cmd);
  return { success: result.success, output: result.output, error: result.error };
}

// ==================== HANDOFF OPERATIONS ====================

/**
 * Create handoff
 * @param {string} message - Handoff message
 * @param {string} beadId - Optional bead ID
 * @returns {Promise<{success: boolean, output?: string, error?: string}>}
 */
export async function createHandoff(message, beadId) {
  let cmd = 'handoff';
  if (message) cmd += ` -m "${message.replace(/"/g, '\\"')}"`;
  if (beadId) cmd += ` ${beadId}`;
  const result = await runGt(cmd);
  return { success: result.success, output: result.output, error: result.error };
}

// ==================== QUICK ACTIONS ====================

/**
 * Quick create issue and optionally sling it
 * @param {object} options - Options
 * @param {string} options.title - Issue title (required)
 * @param {string} options.description - Description
 * @param {string} options.type - Issue type
 * @param {number} options.priority - Priority
 * @param {string} options.target - Optional sling target
 * @returns {Promise<{success: boolean, issue?: object, slung?: boolean, error?: string}>}
 */
export async function quickCreateAndSling(options) {
  const { title, description, type = 'task', priority = 2, target } = options;

  const createResult = await createIssue({ title, description, type, priority });
  if (!createResult.success) {
    return { success: false, error: 'Failed to create issue: ' + createResult.error };
  }

  const issueId = createResult.data?.id;
  if (!issueId) {
    return { success: false, error: 'Failed to parse issue ID' };
  }

  if (target) {
    const slingResult = await sling(issueId, target);
    return {
      success: true,
      issue: createResult.data,
      slung: slingResult.success,
      slingError: slingResult.error
    };
  }

  return { success: true, issue: createResult.data, slung: false };
}

// ==================== DEFAULT EXPORT ====================

export default {
  // Config
  config,
  getBeadsDir,

  // Core
  runGt,
  runBd,
  parseJsonOutput,
  parseRigList,
  parseCrewList,

  // Status
  getStatus,
  listRigs,

  // Convoys
  listConvoys,
  getConvoyStatus,
  createConvoy,
  closeConvoy,

  // Issues
  listIssues,
  getReadyIssues,
  getIssue,
  createIssue,
  updateIssue,
  closeIssue,

  // Mail
  getInbox,
  readMail,
  sendMail,

  // Agents
  listAgents,
  listPolecats,
  nudgeAgent,
  getAgentState,
  setAgentState,

  // Crew
  listCrew,
  addCrew,
  startCrew,
  restartCrew,
  removeCrew,

  // Hooks
  getHookStatus,
  attachToHook,
  detachFromHook,

  // Molecules
  getMolStatus,
  getMolCurrent,
  getMolProgress,
  completeMolStep,
  attachMol,
  detachMol,

  // Formulas
  listFormulas,
  pourFormula,

  // Sling
  sling,

  // Handoff
  createHandoff,

  // Quick actions
  quickCreateAndSling,
};
