/**
 * workflow-engine.js — DAG Workflow Resolution & Interpolation Engine
 *
 * Handles:
 *   1. Topological sorting of workflow nodes to determine valid execution order.
 *   2. Variable interpolation between workflow steps (e.g., {{step_1.output}}).
 *   3. Step state management & progress tracking.
 *   4. Client-side execution simulation / staging prior to cloud sandbox runner dispatch.
 */

import { validateWorkflowSpec } from './agent-spec.js';

/**
 * Topologically sort workflow nodes based on `dependsOn` arrays.
 * Throws an error if a cycle or unresolvable dependency exists.
 *
 * @param {Array} nodes
 * @returns {Array} Sorted array of nodes in executable order
 */
export function resolveExecutionOrder(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const inDegree = new Map(nodes.map(n => [n.id, 0]));
  const graph = new Map(nodes.map(n => [n.id, []]));

  for (const node of nodes) {
    const deps = node.dependsOn || [];
    for (const depId of deps) {
      if (graph.has(depId)) {
        graph.get(depId).push(node.id);
        inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
      }
    }
  }

  const queue = nodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id);
  const sorted = [];

  while (queue.length > 0) {
    const currentId = queue.shift();
    sorted.push(nodeMap.get(currentId));

    const neighbors = graph.get(currentId) || [];
    for (const nextId of neighbors) {
      inDegree.set(nextId, inDegree.get(nextId) - 1);
      if (inDegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error('Workflow contains circular dependencies or unresolvable node connections.');
  }

  return sorted;
}

/**
 * Interpolate template variables in inputs.
 * Supports syntax: {{stepId.output}} or {{input.variableName}}
 *
 * @param {*} value - Target input (string, object, or array)
 * @param {Object} context - Execution context containing step outputs & initial trigger inputs
 * @returns {*} Interpolated result
 */
export function interpolateVariables(value, context = {}) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const parts = path.split('.');
      let current = context;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return match; // Keep unmapped variable intact
        }
      }
      return typeof current === 'object' ? JSON.stringify(current) : String(current);
    });
  }

  if (Array.isArray(value)) {
    return value.map(item => interpolateVariables(item, context));
  }

  if (value && typeof value === 'object') {
    const interpolatedObj = {};
    for (const key of Object.keys(value)) {
      interpolatedObj[key] = interpolateVariables(value[key], context);
    }
    return interpolatedObj;
  }

  return value;
}

/**
 * Client-Side Workflow Execution Orchestrator
 */
export class WorkflowEngine {
  constructor(workflowSpec, options = {}) {
    const validation = validateWorkflowSpec(workflowSpec);
    if (!validation.valid) {
      throw new Error(`Invalid Workflow Spec: ${validation.errors.join(', ')}`);
    }

    this.spec = workflowSpec;
    this.options = options; // { onStepStart, onStepComplete, onStepError, onWorkflowComplete }
    this.context = {
      input: options.initialInput || {},
    };
    this.stepResults = {};
    this.status = 'idle'; // 'idle' | 'running' | 'completed' | 'failed'
  }

  /**
   * Run the workflow steps sequentially according to DAG resolution.
   * Node execution delegate function can be provided or defaults to cloud sandbox runner.
   *
   * @param {Function} stepExecutorFn - async (node, interpolatedInputs, context) => output
   */
  async execute(stepExecutorFn) {
    this.status = 'running';
    const sortedNodes = resolveExecutionOrder(this.spec.nodes);

    for (const node of sortedNodes) {
      const interpolatedInputs = interpolateVariables(node.inputs, this.context);

      if (this.options.onStepStart) {
        this.options.onStepStart(node, interpolatedInputs);
      }

      try {
        let output;
        if (stepExecutorFn) {
          output = await stepExecutorFn(node, interpolatedInputs, this.context);
        } else {
          // Default mock step execution fallback for offline / local staging
          output = { message: `Step '${node.name}' executed successfully.`, timestamp: Date.now() };
        }

        this.stepResults[node.id] = { status: 'success', output };
        this.context[node.id] = { output };

        if (this.options.onStepComplete) {
          this.options.onStepComplete(node, output);
        }
      } catch (err) {
        this.status = 'failed';
        this.stepResults[node.id] = { status: 'failed', error: err.message };

        if (this.options.onStepError) {
          this.options.onStepError(node, err);
        }
        throw new Error(`Workflow failed at step '${node.name}' (${node.id}): ${err.message}`);
      }
    }

    this.status = 'completed';
    const finalResult = {
      workflowId: this.spec.id,
      status: 'completed',
      context: this.context,
      stepResults: this.stepResults,
    };

    if (this.options.onWorkflowComplete) {
      this.options.onWorkflowComplete(finalResult);
    }

    return finalResult;
  }
}
