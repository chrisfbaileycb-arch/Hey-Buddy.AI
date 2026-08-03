/**
 * agent-builder.js — Hey Buddy Phase 5 Agent Studio & Fleet Management
 *
 * Provides:
 *   1. Fleet storage persistence (Custom sub-agents & workflows stored in IndexedDB).
 *   2. Fleet Drawer UI rendering (List of agents, capability tags, trigger buttons).
 *   3. Agent Studio Modal (Co-creation prompt editor & visual node builder).
 *   4. Agent co-creation helper using Hey Buddy's core model.
 */

import { put, get, getAll, remove, UserPrefs } from '../../security/storage.js';
import { createDefaultAgent, createDefaultWorkflow, validateAgentSpec, validateWorkflowSpec, CAPABILITIES, TRIGGER_TYPES } from './agent-spec.js';

const FLEET_AGENTS_PREF_KEY    = 'hey_buddy_fleet_agents_v1';
const FLEET_WORKFLOWS_PREF_KEY = 'hey_buddy_fleet_workflows_v1';

// ── Persistence Helpers ──────────────────────────────────────────────────────

export async function loadFleetAgents() {
  const agents = await UserPrefs.get(FLEET_AGENTS_PREF_KEY, []);
  if (!agents || agents.length === 0) {
    // Return default seed agent fleet
    const defaultAgent = createDefaultAgent({
      id: 'agent_researcher',
      name: 'Web Researcher Agent',
      description: 'Scrapes specified URLs, extracts key takeaways, and posts a summary note to Hey Buddy.',
      avatar: '🔍',
      systemPrompt: 'You are an expert web research agent. Analyze provided web pages and summarize key insights concisely.',
      capabilities: [CAPABILITIES.WEB_SCRAPE, CAPABILITIES.NOTIFY_USER],
    });
    await UserPrefs.set(FLEET_AGENTS_PREF_KEY, [defaultAgent]);
    return [defaultAgent];
  }
  return agents;
}

export async function saveFleetAgent(agentSpec) {
  const validation = validateAgentSpec(agentSpec);
  if (!validation.valid) throw new Error(`Invalid Agent Spec: ${validation.errors.join(', ')}`);

  const agents = await loadFleetAgents();
  const existingIdx = agents.findIndex(a => a.id === agentSpec.id);
  agentSpec.updatedAt = Date.now();

  if (existingIdx >= 0) {
    agents[existingIdx] = agentSpec;
  } else {
    agents.push(agentSpec);
  }

  await UserPrefs.set(FLEET_AGENTS_PREF_KEY, agents);
  return agentSpec;
}

export async function deleteFleetAgent(agentId) {
  const agents = await loadFleetAgents();
  const filtered = agents.filter(a => a.id !== agentId);
  await UserPrefs.set(FLEET_AGENTS_PREF_KEY, filtered);
}

export async function loadFleetWorkflows() {
  const workflows = await UserPrefs.get(FLEET_WORKFLOWS_PREF_KEY, []);
  if (!workflows || workflows.length === 0) {
    const defaultWf = createDefaultWorkflow({
      id: 'wf_daily_brief',
      name: 'Daily Morning Briefing Workflow',
      description: 'Gathers key web updates, summarizes tech news, and notifies Hey Buddy.',
      trigger: { type: TRIGGER_TYPES.CRON, config: { cron: '0 8 * * *' } },
      nodes: [
        {
          id: 'step_scrape',
          name: 'Fetch Tech News',
          agentId: 'agent_researcher',
          toolName: 'web_scrape',
          inputs: { url: 'https://news.ycombinator.com' },
          dependsOn: [],
        },
        {
          id: 'step_summarize',
          name: 'Summarize Briefing',
          agentId: 'agent_researcher',
          toolName: 'prompt_agent',
          inputs: { prompt: 'Summarize top items from: {{step_scrape.output}}' },
          dependsOn: ['step_scrape'],
        },
      ],
    });
    await UserPrefs.set(FLEET_WORKFLOWS_PREF_KEY, [defaultWf]);
    return [defaultWf];
  }
  return workflows;
}

export async function saveFleetWorkflow(workflowSpec) {
  const validation = validateWorkflowSpec(workflowSpec);
  if (!validation.valid) throw new Error(`Invalid Workflow Spec: ${validation.errors.join(', ')}`);

  const workflows = await loadFleetWorkflows();
  const existingIdx = workflows.findIndex(w => w.id === workflowSpec.id);
  workflowSpec.updatedAt = Date.now();

  if (existingIdx >= 0) {
    workflows[existingIdx] = workflowSpec;
  } else {
    workflows.push(workflowSpec);
  }

  await UserPrefs.set(FLEET_WORKFLOWS_PREF_KEY, workflows);
  return workflowSpec;
}

export async function deleteFleetWorkflow(workflowId) {
  const workflows = await loadFleetWorkflows();
  const filtered = workflows.filter(w => w.id !== workflowId);
  await UserPrefs.set(FLEET_WORKFLOWS_PREF_KEY, filtered);
}

// ── UI Rendering Helpers ─────────────────────────────────────────────────────

export function renderFleetDrawerList(containerEl, agents, workflows, onRunWorkflow, onEditAgent) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  // Custom Agents Section
  const agentsTitle = document.createElement('h4');
  agentsTitle.style.cssText = 'font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:0.75rem;';
  agentsTitle.textContent = `Custom Agent Fleet (${agents.length})`;
  containerEl.appendChild(agentsTitle);

  for (const agent of agents) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <div class="agent-card-header">
        <div class="agent-card-identity">
          <div class="agent-card-avatar">${agent.avatar || '🤖'}</div>
          <span class="agent-card-name">${escapeHtml(agent.name)}</span>
        </div>
      </div>
      <p class="agent-card-desc">${escapeHtml(agent.description || '')}</p>
      <div class="capability-tags">
        ${(agent.capabilities || []).map(cap => `<span class="cap-tag">${escapeHtml(cap)}</span>`).join('')}
      </div>
      <div class="agent-card-actions">
        <button class="btn-agent-card-action btn-edit-agent" data-id="${agent.id}">⚙️ Edit Spec</button>
      </div>
    `;

    card.querySelector('.btn-edit-agent')?.addEventListener('click', () => onEditAgent(agent));
    containerEl.appendChild(card);
  }

  // Workflows Section
  const wfTitle = document.createElement('h4');
  wfTitle.style.cssText = 'font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-top:1.5rem;margin-bottom:0.75rem;';
  wfTitle.textContent = `Automated Workflows (${workflows.length})`;
  containerEl.appendChild(wfTitle);

  for (const wf of workflows) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.style.borderColor = 'rgba(167, 139, 250, 0.25)';
    card.innerHTML = `
      <div class="agent-card-header">
        <div class="agent-card-identity">
          <div class="agent-card-avatar" style="background:rgba(99,210,255,0.15);border-color:rgba(99,210,255,0.25);">⚡</div>
          <span class="agent-card-name">${escapeHtml(wf.name)}</span>
        </div>
      </div>
      <p class="agent-card-desc">${escapeHtml(wf.description || '')}</p>
      <div style="font-size:0.7rem;color:var(--text-faint);margin-bottom:0.75rem;">
        Trigger: <strong style="color:#63d2ff;">${escapeHtml(wf.trigger?.type || 'manual')}</strong> · Steps: <strong>${wf.nodes?.length || 0}</strong>
      </div>
      <div class="agent-card-actions">
        <button class="btn-agent-card-action primary btn-run-wf" data-id="${wf.id}" style="background:rgba(167,139,250,0.15);color:#c4b5fd;border-color:rgba(167,139,250,0.3);">▶ Run in Cloud</button>
      </div>
    `;

    card.querySelector('.btn-run-wf')?.addEventListener('click', () => onRunWorkflow(wf));
    containerEl.appendChild(card);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, match => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match];
  });
}
