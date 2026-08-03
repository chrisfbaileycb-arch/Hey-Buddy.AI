/**
 * fleet-presets.js — Starter Agent & Workflow Presets for Hey Buddy Beta
 *
 * Pre-populates default starter agents and workflows into IndexedDB so beta testers
 * receive immediate out-of-the-box value without needing manual setup.
 */

import { loadFleetAgents, saveFleetAgent, loadFleetWorkflows, saveFleetWorkflow } from './agent-builder.js';
import { CAPABILITIES, TRIGGER_TYPES } from './agent-spec.js';

export const STARTER_AGENTS = [
  {
    id: 'agent_preset_researcher',
    name: 'Research Companion Agent',
    description: 'Scrapes specified web pages, extracts key takeaways, and delivers clean summary notes.',
    avatar: '🔍',
    systemPrompt: 'You are an expert research agent. Analyze web page content and summarize top insights concisely.',
    capabilities: [CAPABILITIES.WEB_SCRAPE, CAPABILITIES.NOTIFY_USER],
  },
  {
    id: 'agent_preset_auditor',
    name: 'Code Auditor Agent',
    description: 'Audits code snippets for security vulnerabilities, logic bugs, and optimization opportunities.',
    avatar: '🛡️',
    systemPrompt: 'You are a principal security engineer. Inspect code snippets and point out security risks or bugs.',
    capabilities: [CAPABILITIES.NOTIFY_USER],
  },
  {
    id: 'agent_preset_writer',
    name: 'Content Copywriter Agent',
    description: 'Crafts engaging blog posts, announcement copy, and social media summaries.',
    avatar: '✍️',
    systemPrompt: 'You are a creative copywriter. Write clear, engaging, and impactful content tailored to the audience.',
    capabilities: [CAPABILITIES.NOTIFY_USER],
  },
];

export const STARTER_WORKFLOWS = [
  {
    id: 'wf_preset_morning_digest',
    name: 'Daily Morning Digest',
    description: 'Scrapes tech news, summarizes top highlights, and pushes a morning briefing.',
    trigger: { type: TRIGGER_TYPES.CRON, config: { cron: '0 8 * * *' } },
    nodes: [
      { id: 'step_fetch', name: 'Scrape News', agentId: 'agent_preset_researcher', toolName: 'web_scrape', inputs: { url: 'https://news.ycombinator.com' }, dependsOn: [] },
      { id: 'step_digest', name: 'Summarize Briefing', agentId: 'agent_preset_researcher', toolName: 'prompt_agent', inputs: { prompt: 'Summarize top news items from: {{step_fetch.output}}' }, dependsOn: ['step_fetch'] },
    ],
  },
  {
    id: 'wf_preset_api_check',
    name: 'API Health Check',
    description: 'Sends automated HTTP status request and reports endpoint availability.',
    trigger: { type: TRIGGER_TYPES.MANUAL, config: {} },
    nodes: [
      { id: 'step_check', name: 'Check API Status', agentId: '', toolName: 'http_request', inputs: { url: 'https://api.github.com' }, dependsOn: [] },
    ],
  },
];

/**
 * Seed starter agents & workflows if the user fleet is currently empty.
 */
export async function seedStarterPresetsIfEmpty() {
  const existingAgents = await loadFleetAgents();
  if (existingAgents.length === 0) {
    for (const agent of STARTER_AGENTS) {
      await saveFleetAgent(agent);
    }
  }

  const existingWorkflows = await loadFleetWorkflows();
  if (existingWorkflows.length === 0) {
    for (const wf of STARTER_WORKFLOWS) {
      await saveFleetWorkflow(wf);
    }
  }
}
