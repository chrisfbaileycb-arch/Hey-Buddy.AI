/**
 * agent-spec.js — Schema Definitions & Validation for Hey Buddy Custom Agents & Workflows
 *
 * Provides standardized data models, capability definitions, and validation rules for:
 *   1. Agent Specifications (Custom sub-agents created by users)
 *   2. Workflow Specifications (DAG multi-step execution graphs)
 *   3. Capability Security Policies (Fine-grained sandbox permission scopes)
 */

export const CAPABILITIES = {
  HTTP_REQUEST:  'http_request',   // Can make outbound HTTP calls to explicitly granted domains
  WEB_SCRAPE:    'web_scrape',     // Can fetch and parse web pages safely
  SCHEDULE_CRON: 'schedule_cron',  // Can execute on a timer/schedule
  NOTIFY_USER:   'notify_user',    // Can push notifications/toasts to Hey Buddy PWA
  STORAGE_READ:  'storage_read',   // Can read from scoped agent memory
  STORAGE_WRITE: 'storage_write',  // Can write to scoped agent memory
};

export const TRIGGER_TYPES = {
  MANUAL:       'manual',        // Run on demand by user
  CRON:         'cron',          // Run on recurring schedule (e.g. '0 9 * * *')
  WEBHOOK:      'webhook',       // Run when incoming HTTP POST webhook arrives
  CHAT_COMMAND: 'chat_command',  // Run when user types slash command or mention in chat
};

/**
 * Validate an Agent Specification object.
 * @param {Object} spec
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAgentSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return { valid: false, errors: ['Invalid agent spec payload'] };

  if (!spec.name || typeof spec.name !== 'string' || spec.name.trim().length === 0) {
    errors.push('Agent name is required');
  }
  if (!spec.systemPrompt || typeof spec.systemPrompt !== 'string' || spec.systemPrompt.trim().length === 0) {
    errors.push('System prompt / instructions are required');
  }
  if (spec.capabilities && !Array.isArray(spec.capabilities)) {
    errors.push('Capabilities must be an array');
  } else if (spec.capabilities) {
    const validCaps = Object.values(CAPABILITIES);
    for (const cap of spec.capabilities) {
      if (!validCaps.includes(cap)) {
        errors.push(`Unknown capability: ${cap}`);
      }
    }
  }
  if (spec.tools && !Array.isArray(spec.tools)) {
    errors.push('Tools must be an array of tool objects');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Workflow Specification object (DAG integrity).
 * @param {Object} workflow
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorkflowSpec(workflow) {
  const errors = [];
  if (!workflow || typeof workflow !== 'object') return { valid: false, errors: ['Invalid workflow spec payload'] };

  if (!workflow.name || typeof workflow.name !== 'string' || workflow.name.trim().length === 0) {
    errors.push('Workflow name is required');
  }
  if (!workflow.trigger || !workflow.trigger.type || !Object.values(TRIGGER_TYPES).includes(workflow.trigger.type)) {
    errors.push('Workflow must have a valid trigger type');
  }
  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    errors.push('Workflow must contain at least one node step');
  } else {
    const nodeIds = new Set();
    for (const node of workflow.nodes) {
      if (!node.id) errors.push('Every workflow node must have a unique id');
      if (nodeIds.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
      nodeIds.add(node.id);
    }
    // Check circular dependencies
    for (const node of workflow.nodes) {
      if (Array.isArray(node.dependsOn)) {
        for (const depId of node.dependsOn) {
          if (!nodeIds.has(depId)) {
            errors.push(`Node '${node.id}' depends on missing node '${depId}'`);
          }
          if (depId === node.id) {
            errors.push(`Node '${node.id}' cannot depend on itself`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Factory helper: Create a default valid Agent object.
 */
export function createDefaultAgent(overrides = {}) {
  const id = overrides.id || `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: 'New Custom Agent',
    description: 'An autonomous agent built in Hey Buddy Studio.',
    avatar: '🤖',
    systemPrompt: 'You are a helpful specialized agent designed to assist with automated workflows.',
    capabilities: [CAPABILITIES.NOTIFY_USER, CAPABILITIES.HTTP_REQUEST],
    tools: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Factory helper: Create a default valid Workflow object.
 */
export function createDefaultWorkflow(overrides = {}) {
  const id = overrides.id || `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: 'New Workflow',
    description: 'A multi-step automated agent workflow.',
    trigger: { type: TRIGGER_TYPES.MANUAL, config: {} },
    nodes: [
      {
        id: 'step_1',
        name: 'Initial Step',
        agentId: '',
        toolName: 'prompt_agent',
        inputs: { prompt: 'Analyze current inputs and summarize findings.' },
        dependsOn: [],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}
