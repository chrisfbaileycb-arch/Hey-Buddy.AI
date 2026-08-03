# Scope: Milestone 2 - Sandbox Notice (R2)

## Architecture
Provide a first-run disclaimer warning notice before users start chatting, indicating they are in a sandbox.
This includes:
- Sandbox notice styling (`sandbox-notice.css`)
- Notice display and persistence logic (`sandbox-notice.js`)

## Tasks
1. Copy `app/js/sandbox-notice.js` from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/` to the workspace.
2. Copy `app/css/sandbox-notice.css` from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/css/` to the workspace.
3. Add the stylesheet link to `app/index.html` head: `<link rel="stylesheet" href="css/sandbox-notice.css" />`. (Note: in index.html, paths are relative, so verify if the href should be `css/sandbox-notice.css` or if the file is copied to `app/css/sandbox-notice.css` matching the css folder structure).
4. Wire in `app/js/app.js`: import `showSandboxNotice` from `./sandbox-notice.js` and call it after DOM is ready but before showing the chat.
5. Ensure the sandbox notice is stored in localStorage so it only appears once on the first visit, never again (dismissed state).
6. Verify and run static scanner and/or tests.
