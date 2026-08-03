/**
 * model-catalog.js — Hey Buddy curated fallback models.
 *
 * PRINCIPLE (per Christopher): the app controls the ceiling. We NEVER offer a
 * model larger than the curated choices here. These are small, high-quality,
 * device-safe GGUF models that won't threaten phone storage or the OS.
 *
 * Sizes are the actual on-disk download sizes (approx). "minFreeMb" is the
 * free-space we require BEFORE downloading (download + unpack + safety margin).
 * "minRamMb" is the RAM we require to load it without risking an OOM crash
 * (this is the PocketPal crash-on-load bug we are explicitly preventing).
 *
 * Tiers:
 *   phone-safe  -> tiny, always OK on a modern phone
 *   phone-ok    -> fine on phones with headroom; guarded
 *   desktop     -> only offered on desktop/PC, never auto-suggested on phone
 */

export const MODEL_CATALOG = [
  {
    id: 'qwen2.5-0.5b-instruct-q4',
    name: 'Qwen2.5 0.5B (tiny, fast)',
    params: '0.5B',
    quant: 'Q4_K_M',
    sizeMb: 400,
    minFreeMb: 700,      // download + margin
    minRamMb: 1200,
    tier: 'phone-safe',
    blurb: 'Featherweight. Great for quick replies on any phone. Lowest footprint.',
    repo: 'Qwen/Qwen2.5-0.5B-Instruct-GGUF',
    file: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'llama3.2-1b-instruct-q4',
    name: 'Llama 3.2 1B (balanced)',
    params: '1B',
    quant: 'Q4_K_M',
    sizeMb: 810,
    minFreeMb: 1400,
    minRamMb: 2200,
    tier: 'phone-safe',
    blurb: 'Good all-rounder. Solid conversation quality, still very light.',
    repo: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'gemma2-2b-it-q4',
    name: 'Gemma 2 2B (smart, phone-ok)',
    params: '2B',
    quant: 'Q4_K_M',
    sizeMb: 1600,
    minFreeMb: 2600,
    minRamMb: 3500,
    tier: 'phone-ok',
    blurb: 'Noticeably smarter. Best on phones with a little storage headroom.',
    repo: 'bartowski/gemma-2-2b-it-GGUF',
    file: 'gemma-2-2b-it-Q4_K_M.gguf',
  },
  {
    id: 'llama3.2-3b-instruct-q4',
    name: 'Llama 3.2 3B (desktop)',
    params: '3B',
    quant: 'Q4_K_M',
    sizeMb: 2020,
    minFreeMb: 3200,
    minRamMb: 5000,
    tier: 'desktop',
    blurb: 'Richer answers for your PC. Offered on desktop only.',
    repo: 'unsloth/Llama-3.2-3B-Instruct-GGUF',
    file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
];

// The app's hard ceiling — nothing above this may ever be downloaded in-app.
export const MAX_DOWNLOAD_MB = Math.max(...MODEL_CATALOG.map((m) => m.sizeMb));

/** Models appropriate to offer for a given device kind. */
export function catalogFor(deviceKind /* 'phone' | 'desktop' */) {
  if (deviceKind === 'desktop') return MODEL_CATALOG;
  // On phones, never auto-offer desktop-tier models.
  return MODEL_CATALOG.filter((m) => m.tier !== 'desktop');
}

/** Look up a catalog entry by id. */
export function getModel(id) {
  return MODEL_CATALOG.find((m) => m.id === id) || null;
}

// ── Free Open-Source Cloud Models (Zero Cost / $0 Token) ─────────────────────
export const FREE_CLOUD_MODELS = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: '🦙 Llama 3.3 70B Instruct [FREE]',
    provider: 'openrouter',
    isFree: true,
    blurb: 'Meta’s flagship open 70B parameter model. 100% free streaming.',
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: '🐋 DeepSeek R1 Reasoning [FREE]',
    provider: 'openrouter',
    isFree: true,
    blurb: 'DeepSeek’s open reasoning model for math, code, and logic. 100% free.',
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: '⚡ Gemini 2.0 Flash Experimental [FREE]',
    provider: 'openrouter',
    isFree: true,
    blurb: 'Google’s ultra-fast multimodal model. Zero cost streaming.',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: '💻 Qwen 2.5 Coder 32B [FREE]',
    provider: 'openrouter',
    isFree: true,
    blurb: 'Top open-source coding & automation model. 100% free.',
  },
];

export function getFreeCloudModels() {
  return FREE_CLOUD_MODELS;
}
