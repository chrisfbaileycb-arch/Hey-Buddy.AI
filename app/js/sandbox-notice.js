/**
 * sandbox-notice.js — Friendly first-run "why this is a safe sandbox" disclaimer.
 *
 * Shows once (remembered in localStorage). Reassures first-time users, explains
 * that Hey Buddy runs safely in a sandbox, no personal data leaves their device
 * without them choosing to, and that if they have no AI model yet they can try
 * Demo Mode or add a small safe one. Christopher asked for this specifically as
 * a trust + safety touch before anyone starts.
 */

const SEEN_KEY = 'heybuddy.sandboxNoticeSeen.v1';

export function shouldShowSandboxNotice() {
  try { return localStorage.getItem(SEEN_KEY) !== '1'; } catch { return true; }
}

export function markSandboxNoticeSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

/** Injects and shows the modal. Resolves when the user continues. */
export function showSandboxNotice({ force = false } = {}) {
  return new Promise((resolve) => {
    if (!force && !shouldShowSandboxNotice()) return resolve(false);

    const overlay = document.createElement('div');
    overlay.className = 'hb-sandbox-overlay';
    overlay.innerHTML = `
      <div class="hb-sandbox-card" role="dialog" aria-modal="true" aria-labelledby="hb-sb-title">
        <div class="hb-sandbox-emoji">🛡️</div>
        <h2 id="hb-sb-title">You're in a safe space</h2>
        <p class="hb-sandbox-lead">Before you meet your crew, here's how Hey Buddy keeps you safe.</p>
        <ul class="hb-sandbox-list">
          <li><strong>It's a sandbox.</strong> Hey Buddy runs in a protected bubble on your device. It can't touch the rest of your phone or computer, and it can't change your system.</li>
          <li><strong>Your conversations are yours.</strong> Nothing is sent anywhere unless you choose to connect an AI. There are no Hey Buddy servers holding your chats.</li>
          <li><strong>No model yet? No problem.</strong> Try <strong>Demo Mode</strong> with zero setup, or add a small, device-safe model — we check your free space first so nothing ever crowds your device.</li>
          <li><strong>You're always in control.</strong> One button wipes everything, and the emergency helper (First Responder) is always one tap away.</li>
        </ul>
        <label class="hb-sandbox-ack">
          <input type="checkbox" id="hb-sb-ack" />
          <span>I understand this is a safe sandbox and Hey Buddy is not a replacement for professional or emergency help.</span>
        </label>
        <button class="hb-sandbox-btn" id="hb-sb-continue" disabled>Let's go</button>
        <p class="hb-sandbox-fine">If life is at risk, always call your local emergency number first.</p>
      </div>`;

    const ack = overlay.querySelector('#hb-sb-ack');
    const btn = overlay.querySelector('#hb-sb-continue');
    ack.addEventListener('change', () => { btn.disabled = !ack.checked; });
    btn.addEventListener('click', () => {
      markSandboxNoticeSeen();
      overlay.remove();
      resolve(true);
    });

    document.body.appendChild(overlay);
    setTimeout(() => ack.focus(), 50);
  });
}
