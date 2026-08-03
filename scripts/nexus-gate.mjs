#!/usr/bin/env node
/**
 * nexus-gate.mjs — Release-gating security scanner for the Nexus project.
 *
 * Mirrors ECC's three protections and enforces them on committed code before
 * it can ship, so the 8 Nexus sub-agents can never regress the repo to an
 * insecure state as it grows:
 *
 *   1. governance-capture  -> hardcoded secret detection (ECC SECRET_PATTERNS)
 *   2. config-protection   -> blocks lint/formatter-weakening changes (ECC PROTECTED_FILES)
 *   3. AgentShield         -> runs `agentshield scan` if installed (optional, non-fatal if absent)
 *   + network-call check   -> flags unauthorized outbound calls / base-URL overrides
 *
 * Zero runtime dependencies. Node >= 18. Uses only `git` + Node stdlib.
 *
 * Usage:
 *   node nexus-gate.mjs                 # scan staged changes (pre-commit)
 *   node nexus-gate.mjs --staged        # same, explicit
 *   node nexus-gate.mjs --range A..B    # scan a commit range (CI on PRs)
 *   node nexus-gate.mjs --all           # scan the whole tree (audit)
 *   node nexus-gate.mjs --json          # machine-readable output
 *   node nexus-gate.mjs --allow-net URL # allowlist a network host (repeatable)
 *
 * Exit codes: 0 = clean, 1 = violations found (blocks commit/merge), 2 = internal error.
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// 1. SECRET PATTERNS  (mirrors ECC scripts/hooks/governance-capture.js)
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { name: 'aws_key',        pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/ },
  { name: 'generic_secret', pattern: /(?:secret|password|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}/i },
  { name: 'private_key',    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'jwt',            pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'github_token',   pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/ },
  { name: 'openai_key',     pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'anthropic_key',  pattern: /sk-ant-[A-Za-z0-9-]{20,}/ },
  { name: 'slack_token',    pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'google_api_key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
];

// Lines carrying these markers are treated as intentional fixtures / examples.
const SECRET_IGNORE = /(YOUR_|_HERE|example|placeholder|dummy|fake|xxxx|<[a-z-]+>|redacted|test-fixture|nosecret|gitleaks:allow)/i;

// ---------------------------------------------------------------------------
// 2. PROTECTED CONFIG FILES  (mirrors ECC scripts/hooks/config-protection.js)
//    Editing these is how an agent silently weakens your safety tooling.
// ---------------------------------------------------------------------------
const PROTECTED_FILES = new Set([
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
  '.prettierrc', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
  'biome.json', 'biome.jsonc',
  '.ruff.toml', 'ruff.toml',
  '.shellcheckrc', '.stylelintrc', '.stylelintrc.json', '.stylelintrc.yml',
  '.markdownlint.json', '.markdownlint.yaml', '.markdownlintrc',
  // Hey Buddy / Nexus-specific safety surface (agentic execution boundary)
  '.mcp.json', 'nexus-gate.config.json', '.gitleaks.toml', '.gitleaksignore',
]);

// Diff content in a protected file that signals a *weakening* (not just any edit).
const LINT_WEAKENING = [
  { name: 'eslint_rule_off',    pattern: /["']?[\w@/-]+["']?\s*:\s*(?:0|["']off["'])/ },
  { name: 'eslint_disable',     pattern: /eslint-disable(?!-next-line\s+[\w@/-]+\s*--)/ },
  { name: 'ts_ignore',          pattern: /@ts-(?:ignore|nocheck)/ },
  { name: 'ts_expect_error',    pattern: /@ts-expect-error(?!\s+\S)/ },
  { name: 'strict_off',         pattern: /["']strict["']\s*:\s*false/ },
  { name: 'noimplicitany_off',  pattern: /["']noImplicitAny["']\s*:\s*false/ },
  { name: 'biome_rule_off',     pattern: /["']\w+["']\s*:\s*["']off["']/ },
  { name: 'ruff_ignore_all',    pattern: /ignore\s*=\s*\[\s*["']ALL["']/i },
];

// ---------------------------------------------------------------------------
// 3. UNAUTHORIZED NETWORK CALLS
//    Flags outbound calls and — critically — base-URL overrides (CVE-2026-21852
//    class: redirecting ANTHROPIC_BASE_URL to exfiltrate keys).
// ---------------------------------------------------------------------------
const NETWORK_PATTERNS = [
  { name: 'fetch_literal_url',  pattern: /\bfetch\s*\(\s*["'`](https?:\/\/[^"'`]+)/ },
  { name: 'axios_url',          pattern: /\baxios\.(?:get|post|put|delete|patch|request)\s*\(\s*["'`](https?:\/\/[^"'`]+)/ },
  { name: 'http_request',       pattern: /https?\.(?:get|request)\s*\(\s*["'`](https?:\/\/[^"'`]+)/ },
  { name: 'xhr_open',           pattern: /\.open\s*\(\s*["'][A-Z]+["']\s*,\s*["'`](https?:\/\/[^"'`]+)/ },
  { name: 'curl_wget',          pattern: /\b(?:curl|wget)\s+[^|\n]*?(https?:\/\/[^\s"'`]+)/ },
  { name: 'websocket',          pattern: /new\s+WebSocket\s*\(\s*["'`](wss?:\/\/[^"'`]+)/ },
  // Highest severity: base-URL / endpoint override (key-exfiltration vector).
  { name: 'base_url_override',  pattern: /\b(?:ANTHROPIC_BASE_URL|OPENAI_BASE_URL|OPENAI_API_BASE|[A-Z_]*BASE_URL)\s*[:=]\s*["'`]?(https?:\/\/[^"'`\s]+)/ },
];

// Hosts that are always allowed (extend via --allow-net or config).
const DEFAULT_NET_ALLOW = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'api.anthropic.com', 'api.openai.com', 'openrouter.ai',
  'huggingface.co', 'cdn-lfs.huggingface.co',
  'github.com', 'api.github.com', 'raw.githubusercontent.com',
  'registry.npmjs.org',
  // Hey Buddy specific
  'fonts.googleapis.com', 'fonts.gstatic.com',
];

const BINARY_OR_SKIP = /\.(png|jpe?g|gif|webp|ico|pdf|zip|tar|gz|tgz|woff2?|ttf|eot|mp4|mov|wasm|lock)$/i;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val  = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const asJson = flag('--json');

const allowNet = new Set(DEFAULT_NET_ALLOW);
for (let i = 0; i < args.length; i++) if (args[i] === '--allow-net' && args[i + 1]) allowNet.add(args[i + 1]);

// Optional config file (nexus-gate.config.json): { "allowNet": [...] }
const CONFIG_PATH = 'nexus-gate.config.json';
if (existsSync(CONFIG_PATH)) {
  try {
    const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    (cfg.allowNet || []).forEach((h) => allowNet.add(h));
  } catch { /* ignore malformed config; fail safe = stricter */ }
}

function sh(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
  catch { return ''; }
}

// ---------------------------------------------------------------------------
// Determine the set of changed files + their added lines
// ---------------------------------------------------------------------------
function getTargets() {
  let diffCmd, files;
  if (flag('--all')) {
    files = sh('git ls-files').split('\n').filter(Boolean);
    diffCmd = null; // whole-file scan
  } else if (val('--range')) {
    const range = val('--range');
    files = sh(`git diff --name-only --diff-filter=ACMR ${range}`).split('\n').filter(Boolean);
    diffCmd = (f) => `git diff --unified=0 ${range} -- "${f}"`;
  } else {
    // default / --staged: staged changes (pre-commit)
    files = sh('git diff --cached --name-only --diff-filter=ACMR').split('\n').filter(Boolean);
    diffCmd = (f) => `git diff --cached --unified=0 -- "${f}"`;
  }
  return { files, diffCmd };
}

// Extract only ADDED lines from a unified diff (lines starting with '+', not '+++').
function addedLines(diff) {
  return diff.split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

function fileAddedContent(file, diffCmd) {
  if (!diffCmd) { // --all mode: scan full file
    try { return readFileSync(file, 'utf8').split('\n'); } catch { return []; }
  }
  return addedLines(sh(diffCmd(file)));
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Scanners
// ---------------------------------------------------------------------------
function scanSecrets(file, lines, findings) {
  lines.forEach((line) => {
    if (SECRET_IGNORE.test(line)) return;
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        findings.push({ check: 'secret', severity: 'critical', file, rule: name,
          detail: `Possible hardcoded secret (${name})`, line: preview(line) });
      }
    }
  });
}

function scanProtectedConfig(file, lines, findings) {
  const base = path.basename(file);
  if (!PROTECTED_FILES.has(base)) return;
  // Editing a protected file is only a violation if the change weakens safety.
  let weakened = false;
  for (const line of lines) {
    for (const { name, pattern } of LINT_WEAKENING) {
      if (pattern.test(line)) {
        weakened = true;
        findings.push({ check: 'config-protection', severity: 'high', file, rule: name,
          detail: `Lint/type-safety weakening in protected file`, line: preview(line) });
      }
    }
  }
  if (!weakened && lines.length) {
    findings.push({ check: 'config-protection', severity: 'medium', file, rule: 'protected_file_touched',
      detail: `Protected safety-config file modified — requires manual review`, line: `(${lines.length} added lines)` });
  }
}

function scanNetwork(file, lines, findings) {
  lines.forEach((line) => {
    for (const { name, pattern } of NETWORK_PATTERNS) {
      const m = line.match(pattern);
      if (!m) continue;
      const url = m[1] || '';
      const host = hostOf(url) || url.replace(/^https?:\/\//, '').split(/[\/:?]/)[0];
      const allowed = host && [...allowNet].some((a) => host === a || host.endsWith('.' + a));
      if (name === 'base_url_override') {
        findings.push({ check: 'network', severity: 'critical', file, rule: name,
          detail: `Base-URL override (key-exfiltration vector, CVE-2026-21852 class)`, line: preview(line) });
      } else if (!allowed) {
        findings.push({ check: 'network', severity: 'high', file, rule: name,
          detail: `Unauthorized outbound call to '${host || 'unknown'}' (not in allowlist)`, line: preview(line) });
      }
    }
  });
}

function preview(line) {
  const t = line.trim();
  return t.length > 120 ? t.slice(0, 117) + '...' : t;
}

// ---------------------------------------------------------------------------
// AgentShield integration (optional, non-fatal if not installed)
// ---------------------------------------------------------------------------
function runAgentShield(findings, notes) {
  const has = sh('command -v agentshield || npx --no-install agentshield --version 2>/dev/null').trim();
  if (!has) { notes.push('AgentShield not installed — skipped. Install with: npm i -g ecc-agentshield'); return; }
  const out = sh('agentshield scan --format json 2>/dev/null') || sh('npx --no-install agentshield scan --format json 2>/dev/null');
  if (!out) { notes.push('AgentShield present but returned no output.'); return; }
  try {
    const rep = JSON.parse(out);
    const items = rep.findings || rep.violations || rep.results || [];
    for (const it of items) {
      const sev = (it.severity || it.level || 'high').toLowerCase();
      if (['critical', 'high', 'error'].includes(sev)) {
        findings.push({ check: 'agentshield', severity: sev === 'error' ? 'high' : sev,
          file: it.file || it.path || '(repo)', rule: it.rule || it.id || 'agentshield',
          detail: it.message || it.title || 'AgentShield finding', line: '' });
      }
    }
    notes.push(`AgentShield scan complete: ${items.length} finding(s) reviewed.`);
  } catch { notes.push('AgentShield output was not valid JSON — inspect manually.'); }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { files, diffCmd } = getTargets();
  const findings = [];
  const notes = [];

  const scanFiles = files.filter((f) => !BINARY_OR_SKIP.test(f));
  for (const file of scanFiles) {
    const lines = fileAddedContent(file, diffCmd);
    if (!lines.length) continue;
    scanSecrets(file, lines, findings);
    scanProtectedConfig(file, lines, findings);
    scanNetwork(file, lines, findings);
  }

  runAgentShield(findings, notes);

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  const advisory = findings.filter((f) => f.severity === 'medium' || f.severity === 'low');

  if (asJson) {
    console.log(JSON.stringify({ scanned: scanFiles.length, findings, notes,
      blocking: blocking.length, advisory: advisory.length,
      result: blocking.length ? 'FAIL' : 'PASS' }, null, 2));
    process.exit(blocking.length ? 1 : 0);
  }

  const B = '\x1b[1m', R = '\x1b[31m', Y = '\x1b[33m', G = '\x1b[32m', D = '\x1b[2m', X = '\x1b[0m';
  console.log(`\n${B}🛡  Hey Buddy / Nexus Security Gate${X}  ${D}(${scanFiles.length} file(s) scanned)${X}`);
  for (const n of notes) console.log(`   ${D}· ${n}${X}`);

  if (!findings.length) {
    console.log(`\n${G}${B}✔ PASS${X} — no secrets, no lint-weakening, no unauthorized network calls.\n`);
    process.exit(0);
  }

  const group = (arr, color, label) => {
    if (!arr.length) return;
    console.log(`\n${color}${B}${label} (${arr.length})${X}`);
    for (const f of arr) {
      console.log(`  ${color}●${X} [${f.check}/${f.rule}] ${B}${f.file}${X}`);
      console.log(`     ${f.detail}`);
      if (f.line) console.log(`     ${D}${f.line}${X}`);
    }
  };
  group(blocking, R, '✖ BLOCKING');
  group(advisory, Y, '⚠ ADVISORY (review, non-blocking)');

  if (blocking.length) {
    console.log(`\n${R}${B}✖ FAIL${X} — ${blocking.length} blocking issue(s). Commit/merge refused.`);
    console.log(`${D}Fix the issues above, or annotate intentional lines with a whitelist marker (e.g. YOUR_, _HERE, gitleaks:allow) / add hosts via --allow-net.${X}\n`);
    process.exit(1);
  }
  console.log(`\n${Y}${B}⚠ PASS (with advisories)${X} — no blocking issues; review the warnings above.\n`);
  process.exit(0);
}

try { main(); }
catch (e) { console.error('nexus-gate internal error:', e.message); process.exit(2); }
