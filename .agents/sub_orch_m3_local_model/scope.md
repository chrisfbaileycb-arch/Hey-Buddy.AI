# Scope: Milestone 3 - Local Model Support (R3)

## Architecture
Integrate local model execution capabilities, including device compatibility pre-flight checks, local LLM server detection (Ollama/LM Studio/llama.cpp/Jan), and a curated model catalog with strict download ceilings.
This includes:
- Small model catalog and download ceiling configuration (`model-catalog.js`)
- Device RAM and storage pre-flight checking (`device-guard.js`)
- Local provider connection and streaming logic (`local-provider.js`)

## Tasks
1. Copy `app/js/model-catalog.js`, `app/js/device-guard.js`, and `app/js/local-provider.js` from `/home/christopher/Downloads/Nexus_Extracted/Nexus_HeyBuddy_Master/04_HeyBuddy_v1.0_Build/app/js/` to the workspace.
2. Wire local options into `app/js/providers.js` or `app/js/app.js`:
   - Call `resolveLocalOptions()` on startup.
   - If `local.detected`: add "Local (Ollama/LM Studio)" to the provider picker option list in `app/js/app.js` or `providers.js`.
   - If local server is not detected: display the guarded catalog options (only phone-safe / phone-ok models, hide desktop-only models on mobile devices).
   - Before starting any model download or load, call `preflight(model)` to verify adequate storage and memory. Block and display a clean warning/error UI if the device fails the check.
   - Enforce that no model size exceeding `MAX_DOWNLOAD_MB` is allowed for download.
3. Validate through build check and node security scanner verification.
