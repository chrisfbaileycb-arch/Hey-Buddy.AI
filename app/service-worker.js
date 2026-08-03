/**
 * service-worker.js — Hey Buddy PWA service worker.
 *
 * Goals (kept deliberately simple so it never breaks the app):
 *   1. Make the app installable + launchable offline (cache the shell).
 *   2. Be safe: NEVER cache API calls, model files, or anything with auth.
 *   3. Support push notifications (Oracle daily riddle, Hunt reminders).
 *
 * Bump CACHE_VERSION whenever you ship a new build so old shells are purged.
 */

const CACHE_VERSION = 'heybuddy-v1';

// The "app shell" — only static UI assets. Add/adjust to match your real files.
// Do NOT add API endpoints, model downloads, or user data here.
const SHELL_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/css/app.css',
  '/app/css/sandbox-notice.css',
  '/app/js/app.js',
  '/app/manifest.json',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
];

// Hosts we must always fetch fresh from the network (never cache).
const NEVER_CACHE_HOSTS = [
  'api.openai.com',
  'api.anthropic.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.elevenlabs.io',
  'huggingface.co',
  'cdn-lfs.huggingface.co',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Use addAll but tolerate a missing file so install never hard-fails.
      Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let everything else (POST to APIs, etc.) pass straight through.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Exclude service worker script from caching
  if (url.pathname === '/app/service-worker.js') {
    return;
  }

  // Never touch API / model / auth traffic — always network.
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    return; // default browser fetch, no caching
  }

  // Same-origin static assets: cache-first, fall back to network, then cache the result.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            // Only cache good, basic responses.
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => {
            if (req.mode === 'navigate') {
              return caches.match('/app/index.html');
            }
          }); // offline fallback to shell
      })
    );
  }
});

/* ---------------------- Push notifications ---------------------- */
// Fires when your push service sends a message (e.g. daily Oracle riddle).
self.addEventListener('push', (event) => {
  let data = { title: 'Hey Buddy', body: 'Your buddies have something for you.' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/app/icons/icon-192.png',
      badge: '/app/icons/icon-96.png',
      data: { url: data.url || '/app/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/app/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});
