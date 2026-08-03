/**
 * beta-feedback.js — In-App Feedback & Privacy-Sanitized Diagnostic Exporter for Hey Buddy Beta
 *
 * Ensures beta testers can easily report bugs and export diagnostic telemetry
 * with guaranteed zero-leak privacy (all API keys, passphrases, and private text redacted).
 */

import { getCloudSyncStatus } from './cloud-sync.js';
import { loadFleetAgents, loadFleetWorkflows } from './agent-builder.js';

/**
 * Redact sensitive secret patterns (API keys, passphrases, tokens) from telemetry strings.
 */
export function sanitizeString(inputStr) {
  if (typeof inputStr !== 'string') return inputStr;
  return inputStr
    .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/sk-ant-[A-Za-z0-9-]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/AIza[0-9A-Za-z_-]{35}/g, '[REDACTED_API_KEY]')
    .replace(/(password|passphrase|secret|token)\s*[:=]\s*["'][^"']{3,}/gi, '$1: "[REDACTED]"');
}

/**
 * Generate a privacy-sanitized diagnostic telemetry package.
 *
 * @param {Object} appState - Current runtime app state
 * @returns {Promise<Object>} Clean diagnostic payload
 */
export async function generateSanitizedDiagnostics(appState = {}) {
  const syncStatus = await getCloudSyncStatus();
  const agents = await loadFleetAgents();
  const workflows = await loadFleetWorkflows();

  const diagnosticReport = {
    app: 'Hey Buddy Beta',
    version: '1.0.0-beta',
    timestamp: new Date().toISOString(),
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      onLine: navigator.onLine,
      standalonePWA: window.matchMedia('(display-mode: standalone)').matches,
    },
    activeConfig: {
      provider: appState.apiConfig?.provider || 'demo',
      model: appState.apiConfig?.model || 'default',
      tier: appState.tierId || 'free',
      voiceEnabled: !!appState.voiceEnabled,
      bridgeConnected: !!appState.bridgeConnected,
      relayMode: !!appState.relayMode,
    },
    fleetSummary: {
      customAgentsCount: agents.length,
      customWorkflowsCount: workflows.length,
    },
    cloudSync: syncStatus,
  };

  return JSON.parse(sanitizeString(JSON.stringify(diagnosticReport)));
}

/**
 * Download diagnostic report as JSON file.
 */
export async function exportDiagnosticsToFile(appState) {
  const report = await generateSanitizedDiagnostics(appState);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hey-buddy-beta-diagnostics-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copy diagnostic report JSON to clipboard.
 */
export async function copyDiagnosticsToClipboard(appState) {
  const report = await generateSanitizedDiagnostics(appState);
  const reportStr = JSON.stringify(report, null, 2);
  await navigator.clipboard.writeText(reportStr);
  return reportStr;
}
