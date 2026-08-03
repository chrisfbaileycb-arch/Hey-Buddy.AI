# Scope: Milestone 1 - PWA (R1)

## Architecture
Integrate Progressive Web App (PWA) capabilities to make Hey Buddy installable on mobile and desktop devices.
This includes:
- Web app manifest (`manifest.json`)
- Service worker for offline app shell caching (`service-worker.js`)
- Install UI logic (`pwa-install.js` and `#installBtn`)
- Full icon set (`app/icons/`)

## Tasks
1. Copy `app/manifest.json`, `app/service-worker.js`, and `app/icons/` (full icon set) from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/` to the workspace.
2. Copy `app/js/pwa-install.js` from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/` to the workspace.
3. Add required head meta tags to `app/index.html`.
4. Add the optional install button `#installBtn` to the app header in `app/index.html`.
5. Wire in `app/js/app.js`: import and call `registerServiceWorker()` and `setupInstall()` from `pwa-install.js` on startup.
6. Verify service worker does not cache API keys, model files, or provider responses.
7. Run tests / verify that everything compiles and is formatted correctly.
