/**
 * admin-panel.js — Operator console for the local admin vault.
 *
 * Renders the modal UI over admin-vault.js and model-access.js. Secrets are
 * never rendered: the list shows metadata only, and decrypted values are copied
 * to the clipboard on demand rather than painted into the DOM. Nothing here logs
 * a secret, and every interpolated string is escaped.
 */

import {
  isUnlocked, lockVault, vaultExists, createVault, unlockVault, changePassphrase,
  listEntries, setEntry, removeEntry, getSecret, maskSecret, isValidToolId, TOOL_KINDS,
} from './admin-vault.js';
import { getVisibility, setVisibility, countByTier } from './model-access.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const $ = (id) => document.getElementById(id);

let _onModelsChanged = null;
let _catalog = []; // latest model list, for tier counts

export function initAdminPanel({ onModelsChanged } = {}) {
  _onModelsChanged = onModelsChanged || null;

  const btn = $('adminPanelBtn');
  if (btn) btn.addEventListener('click', () => { openAdminPanel(); });

  const modal = $('adminPanelModal');
  if (modal) {
    // Click-outside to dismiss, but only on the overlay itself.
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAdminPanel(); });
  }
  const close = $('adminPanelClose');
  if (close) close.addEventListener('click', () => closeAdminPanel());

  const body = $('adminPanelBody');
  if (body) {
    body.addEventListener('submit', onBodySubmit);
    body.addEventListener('click', onBodyClick);
  }
}

export function setAdminCatalog(models) {
  _catalog = Array.isArray(models) ? models : [];
}

export function openAdminPanel() {
  const modal = $('adminPanelModal');
  if (!modal) return;
  modal.hidden = false;
  renderAdminPanel();
}

export function closeAdminPanel() {
  const modal = $('adminPanelModal');
  if (modal) modal.hidden = true;
  // Drop the in-memory passphrase when the console is dismissed.
  lockVault();
  renderAdminPanel();
}

// ── Rendering ────────────────────────────────────────────────

async function renderAdminPanel() {
  const body = $('adminPanelBody');
  if (!body) return;

  const exists = await vaultExists();
  if (!isUnlocked()) {
    body.innerHTML = renderLockScreen(exists);
    return;
  }
  body.innerHTML = await renderUnlocked();
}

function renderLockScreen(exists) {
  const mode = exists ? 'unlock' : 'create';
  const title = exists ? 'Unlock vault' : 'Create your vault';
  const blurb = exists
    ? 'Enter your master passphrase to manage stored keys.'
    : `Choose a master passphrase (${8}+ characters). It encrypts every key on this device and is never stored or sent anywhere — if you lose it, the keys cannot be recovered.`;
  const cta = exists ? 'Unlock' : 'Create vault';

  return `
    <div class="admin-lock">
      <p class="admin-blurb">${esc(blurb)}</p>
      <form id="adminAuthForm" data-admin-action="${mode}" autocomplete="off">
        <div class="form-group">
          <label class="form-label" for="adminPass">Master passphrase</label>
          <input class="form-input" type="password" id="adminPass" autocomplete="new-password" required>
        </div>
        <p class="admin-error" id="adminAuthError" hidden></p>
        <button class="btn-modal-primary" type="submit" style="width:100%;">${esc(cta)}</button>
      </form>
    </div>`;
}

async function renderUnlocked() {
  const [entries, vis] = await Promise.all([listEntries(), getVisibility()]);
  const counts = countByTier(_catalog);

  const rows = entries.length
    ? entries.map(renderEntryRow).join('')
    : `<tr><td colspan="4" class="admin-empty">No keys stored yet.</td></tr>`;

  return `
    <div class="admin-section">
      <div class="admin-section-head">
        <h3>Key vault</h3>
        <span class="admin-pill">${entries.length} stored</span>
      </div>
      <p class="admin-blurb">
        Encrypted with AES-256-GCM on this device. Values are never displayed —
        use copy to place one on the clipboard. Stored here, keys are available to
        this device only; serving a key to your end users needs a server to broker
        the call.
      </p>
      <table class="admin-table">
        <thead>
          <tr><th>Name</th><th>Kind</th><th>Value</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="admin-note" id="adminCopyNote" hidden></p>
    </div>

    <div class="admin-section">
      <div class="admin-section-head">
        <h3>${entries.some(e => e.id) ? 'Add or update key' : 'Add a key'}</h3>
      </div>
      <form id="adminEntryForm" data-admin-action="save-entry" autocomplete="off">
        <div class="admin-grid">
          <div class="form-group">
            <label class="form-label" for="adminEntryId">Id</label>
            <input class="form-input" type="text" id="adminEntryId" placeholder="openrouter" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="adminEntryLabel">Display name</label>
            <input class="form-input" type="text" id="adminEntryLabel" placeholder="OpenRouter">
          </div>
          <div class="form-group">
            <label class="form-label" for="adminEntryKind">Kind</label>
            <select class="form-select" id="adminEntryKind">
              <option value="${TOOL_KINDS.PROVIDER_KEY}">Provider key</option>
              <option value="${TOOL_KINDS.TOOL_SECRET}">Tool secret</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="adminEntryProvider">Provider</label>
            <input class="form-input" type="text" id="adminEntryProvider" placeholder="openrouter">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="adminEntrySecret">Secret</label>
          <input class="form-input" type="password" id="adminEntrySecret"
                 autocomplete="new-password" placeholder="Paste the key">
          <span class="admin-hint">Leave blank to keep the existing value when editing.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="adminEntryNotes">Notes</label>
          <input class="form-input" type="text" id="adminEntryNotes" placeholder="Optional">
        </div>
        <p class="admin-error" id="adminEntryError" hidden></p>
        <button class="btn-modal-primary" type="submit" style="width:100%;">Save key</button>
      </form>
    </div>

    <div class="admin-section">
      <div class="admin-section-head"><h3>Model visibility</h3></div>
      <p class="admin-blurb">
        Controls which models reach the picker. Filtering happens at classification
        time, so hiding a group never removes a model you actively selected.
      </p>
      <label class="admin-check">
        <input type="checkbox" id="adminShowFree" ${vis.showFree ? 'checked' : ''}>
        <span>Show free models <span class="admin-pill">${counts.free}</span></span>
      </label>
      <label class="admin-check">
        <input type="checkbox" id="adminShowPaid" ${vis.showPaid ? 'checked' : ''}>
        <span>Show paid models <span class="admin-pill">${counts.paid}</span></span>
      </label>
      <p class="admin-hint" id="adminVisNote">${_catalog.length} models in the current catalog.</p>
    </div>

    <div class="admin-section">
      <div class="admin-section-head"><h3>Maintenance</h3></div>
      <form id="adminRotateForm" data-admin-action="rotate" autocomplete="off" class="admin-inline">
        <input class="form-input" type="password" id="adminNewPass"
               placeholder="New master passphrase" autocomplete="new-password" required>
        <button class="admin-btn" type="submit">Re-encrypt vault</button>
      </form>
      <button class="admin-btn admin-btn-danger" type="button" data-admin-action="lock">Lock vault</button>
    </div>`;
}

function renderEntryRow(e) {
  return `
    <tr>
      <td>
        <div class="admin-entry-label">${esc(e.label)}</div>
        <div class="admin-entry-id">${esc(e.id)}${e.providerName ? ' · ' + esc(e.providerName) : ''}</div>
      </td>
      <td><span class="admin-pill">${esc(e.kind)}</span></td>
      <td>${e.hasSecret ? '•••• stored' : '<em>no value</em>'}</td>
      <td class="admin-row-actions">
        <button class="admin-btn" type="button" data-admin-action="copy" data-id="${esc(e.id)}">Copy</button>
        <button class="admin-btn" type="button" data-admin-action="edit" data-id="${esc(e.id)}">Edit</button>
        <button class="admin-btn admin-btn-danger" type="button" data-admin-action="delete" data-id="${esc(e.id)}">Delete</button>
      </td>
    </tr>`;
}

// ── Interaction ──────────────────────────────────────────────

const FIELD_MESSAGES = {
  adminEntryId: 'Id must start with a lowercase letter or number, may contain lowercase letters, numbers, underscores or dashes, and must end with a letter or number.',
};

async function onBodySubmit(ev) {
  const form = ev.target.closest('form[data-admin-action]');
  if (!form) return;
  ev.preventDefault();

  const action = form.dataset.adminAction;
  try {
    // Reject bad ids here so the operator gets a field-specific message; the
    // vault layer independently re-validates before writing.
    if (action === 'save-entry') {
      const idField = $('adminEntryId');
      if (idField && !isValidToolId(idField.value.trim())) {
        throw new Error(FIELD_MESSAGES.adminEntryId);
      }
    }

    if (action === 'create') {
      await createVault($('adminPass').value);
    } else if (action === 'unlock') {
      await unlockVault($('adminPass').value);
    } else if (action === 'save-entry') {
      await saveEntryFromForm();
      clearEntryForm();
    } else if (action === 'rotate') {
      await changePassphrase($('adminNewPass').value);
      $('adminNewPass').value = '';
    }
  } catch (err) {
    showAuthError(form, err.message);
    return;
  }
  await renderAdminPanel();
}

async function saveEntryFromForm() {
  const kind = $('adminEntryKind').value;
  await setEntry({
    id: $('adminEntryId').value.trim(),
    label: $('adminEntryLabel').value.trim(),
    kind,
    providerName: kind === TOOL_KINDS.PROVIDER_KEY ? $('adminEntryProvider').value.trim() : '',
    notes: $('adminEntryNotes').value.trim(),
    secret: $('adminEntrySecret').value,
  });
}

function clearEntryForm() {
  for (const id of ['adminEntryId', 'adminEntryLabel', 'adminEntryProvider', 'adminEntrySecret', 'adminEntryNotes']) {
    const node = $(id);
    if (node) node.value = '';
  }
}

async function onBodyClick(ev) {
  const btn = ev.target.closest('[data-admin-action]');
  if (!btn) return;
  const action = btn.dataset.adminAction;

  if (action === 'lock') {
    lockVault();
    await renderAdminPanel();
    return;
  }
  if (action === 'copy') {
    await copySecret(btn.dataset.id);
    return;
  }
  if (action === 'edit') {
    await loadEntryIntoForm(btn.dataset.id);
    return;
  }
  if (action === 'delete') {
    const id = btn.dataset.id;
    if (confirm(`Delete the stored key "${id}"? This cannot be undone.`)) {
      await removeEntry(id);
      await renderAdminPanel();
    }
  }
}

async function copySecret(id) {
  const note = $('adminCopyNote');
  try {
    const secret = await getSecret(id);
    if (!secret) throw new Error('no value stored for that entry');
    await navigator.clipboard.writeText(secret);
    if (note) { note.textContent = `Copied ${maskSecret(secret)} to the clipboard.`; note.hidden = false; }
  } catch (err) {
    if (note) { note.textContent = `Could not copy: ${err.message}`; note.hidden = false; }
  }
}

async function loadEntryIntoForm(id) {
  const entries = await listEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return;
  if ($('adminEntryId')) $('adminEntryId').value = entry.id;
  if ($('adminEntryLabel')) $('adminEntryLabel').value = entry.label;
  if ($('adminEntryKind')) $('adminEntryKind').value = entry.kind;
  if ($('adminEntryProvider')) $('adminEntryProvider').value = entry.providerName;
  if ($('adminEntryNotes')) $('adminEntryNotes').value = entry.notes;
  // Deliberately blank: the stored value is only ever revealed via copy.
  if ($('adminEntrySecret')) $('adminEntrySecret').value = '';
  $('adminEntryForm')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showAuthError(form, message) {
  const err = form.querySelector('.admin-error') || $('adminAuthError') || $('adminEntryError');
  if (err) { err.textContent = message; err.hidden = false; }
}

// ─ Visibility changes (delegated from the checkboxes) ───────

export async function applyVisibilityFromPanel() {
  const showFree = $('adminShowFree')?.checked !== false;
  const showPaid = $('adminShowPaid')?.checked !== false;
  await setVisibility({ showFree, showPaid });
  if (_onModelsChanged) _onModelsChanged();
}

document.addEventListener('change', (e) => {
  if (e.target?.id === 'adminShowFree' || e.target?.id === 'adminShowPaid') {
    applyVisibilityFromPanel();
  }
});