# AGENTS.md — Hey Buddy.AI

Repo-specific notes for future agent sessions. Keep this factual and short.

## Project shape

Static PWA, no build step. Two entry points:

- `index.html` — public landing page. CSP is deliberately `connect-src 'none'`.
- `app/index.html` — the actual app. CSP is `script-src 'self'` (no inline scripts
  or inline handlers) and `connect-src` limited to named API hosts.

Modules live in `app/js/`, `security/`, and `js/` (plain ES modules).

## Verification commands

There is no test framework. Verify with these:

```bash
# Syntax-check every module
for f in app/js/*.js security/*.js scripts/*.mjs; do
  node --input-type=module --check < "$f"
done

# Security gate (secrets, lint-weakening, network allowlist)
node scripts/nexus-gate.mjs

# Serve locally (needed for browser checks / service worker)
python3 -m http.server 8899   # then open /app/index.html?bypass=true
```

Named-import mistakes are the highest-value bug class here: ES modules validate
every named import at link time, so one missing export kills the whole module
graph and the app silently renders only its static shell. After touching
imports/exports, verify every specifier resolves before believing a fix works.

## Gotchas learned the hard way

- **`permissions: {admin: true}` from the REST API is the *user's* repo role, not
  the token's grant.** GraphQL `viewerPermission: ADMIN` is likewise the user.
  Neither tells you whether the app token can write. Probe writes directly
  (e.g. attempt to create a ref) before assuming push will work.
- **The app's boot success is not visible in the DOM alone.** Confirm
  `document.body.dataset.tier` becomes set and the sandbox/waiver UI appears;
  otherwise the module graph may have failed to link.
- **`showSandboxNotice()` is awaited before the access-id bypass in `init()`**,
  so `?bypass=true` still shows the sandbox notice first.
- **CSP `connect-src` cannot express arbitrary LAN IPs.** The LAN bridge
  (`bridge-client.js` `probePc()`) and local-model detection
  (`local-provider.js`, probing localhost:11434/1234/8080/1337) are blocked by
  the current `connect-src` on every boot. Fixing this requires loosening the
  policy (e.g. `http://*:*`) — a security decision, not a mechanical one.
- Prefer `escapeHtml()` for anything interpolated into `innerHTML`. Note that
  `<option value="...">` attributes built in `paintModelOptions()` are NOT
  escaped, so values must be validated at the source.

## Theming

`app/css/theme-customization.css` holds the palette as CSS custom properties.
Theme selection works by setting `body[data-theme="..."]`.

Current limitations (verified, not assumptions):

- Only two themes exist: `dark` and `light` (`getAvailableThemes()`).
- **There is no theme picker UI.** `themeToggleBtn`, `.theme-option`, and
  `.bg-option` are referenced by `theme-manager.js` but do not exist anywhere in
  the HTML, so `getAvailableThemes()` / `toggleTheme()` have no callers.
  Themes only apply from saved prefs or system preference.
- `toggleTheme()` hardcodes a dark<->light flip, and `theme-init.js`
  `syncThemeColor()` hardcodes `isLight ? '#f8f9ff' : '#0f1220'`. Adding a third
  or fourth theme requires replacing both with a palette lookup.
- ~90 hardcoded color literals in `app.css` and ~60 in
  `theme-customization.css`, including dark-only surfaces (sidebar, chat header,
  input area) that each carry a single `body[data-theme="light"]` override. Every
  new theme needs its own pass over these.

## Pending work

- Branch `pr-2-review` holds a fix (commit `ea7537e`) hardening the OpenRouter
  catalog mapper in `app/js/providers.js` against malformed rows: rows without a
  usable `id` previously became selectable `<option value="">` /
  `value="undefined"` entries, and a `null` row threw inside `_isFreeModel()`,
  which the outer `catch` swallowed — silently discarding the entire 300+ model
  catalog and falling back to the 6 curated models.
  Patch also exported to `/workspace/project/pr2-openrouter-mapper-fix.patch`.
- PR #2 (`claude/code-review-deployment-mct1jf`) has one open review thread on
  `app/js/theme-init.js` (theme-color meta staying dark on a restored light
  theme). Already fixed in `d7ee907`; the thread just needs a reply + resolve.
- Requested but not started: an **admin panel** for managing backend/API keys,
  free-vs-paid model toggles surfaced in the chat window, and an extensible
  layer for future tools/keys. Build on a dedicated branch, not on PR #2.
