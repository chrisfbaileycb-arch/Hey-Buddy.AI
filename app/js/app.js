/**
 * Hey Buddy — Main App Orchestrator
 * ===================================
 * State management, UI wiring, persona switching, chat flow.
 * All security modules and provider adapters are imported from their modules.
 */

import { openDB, put, get, Messages, Conversations, UserPrefs, nuclearDelete }
  from '../../security/storage.js';
import { encryptApiKey, decryptApiKey, verifyPassphrase }
  from '../../security/crypto.js';
import { PERSONAS, buildSystemPrompt, checkInput, checkResponse }
  from '../../security/guardrails.js';
import { PROVIDERS, streamChat, getDemoResponse }
  from './providers.js';
import { registerServiceWorker, setupInstall, promptInstall, IOS_INSTALL_HINT }
  from './pwa-install.js';
import { showSandboxNotice }
  from './sandbox-notice.js';
import { TIERS, effectiveLimits, can, shouldPersist }
  from './tier-config.js';
import { checkVoice, recordVoiceUsage }
  from './voice-meter.js';
import { speak as ttsSpeak }
  from './tts-engine.js';
import { resolveLocalOptions, localChat }
  from './local-provider.js';
import { detectDeviceKind, preflight }
  from './device-guard.js';
import { getModel, MAX_DOWNLOAD_MB } from './model-catalog.js';
import { reviewPersona, composeSystemPrompt as guardCompose }
  from './persona-guard.js';
import { savePersona, loadPersona, listPersonas, exportPersona, importPersona, clearServerCache, OFFLOAD_NOTICE }
  from './persona-vault.js';
import { probePc, pcChat, pokeAgentTask, relayChat }
  from './bridge-client.js';
import { generatePairOffer, loadPairing, isPaired, clearPairing }
  from './bridge-pairing.js';
import { logBridgeMessage, clearBridgeLog, getBridgeLogSummary }
  from './bridge-log.js';
import { loadFleetAgents, saveFleetAgent, loadFleetWorkflows, saveFleetWorkflow, renderFleetDrawerList }
  from './agent-builder.js';
import { executeCloudWorkflow }
  from './cloud-runner.js';
import { streamModelCompletion, PROVIDERS }
  from './cloud-model-adapter.js';
import { pushLocalToCloud, getCloudSyncStatus }
  from './cloud-sync.js';
import { executePlugin, PLUGINS }
  from './plugin-gateway.js';
import { renderMarketplaceGrid, installMarketplaceItem }
  from './agent-market.js';
import { seedStarterPresetsIfEmpty }
  from './fleet-presets.js';
import { shouldShowOnboarding, markOnboardingComplete, OnboardingWizard }
  from './beta-onboarding.js';
import { exportDiagnosticsToFile, copyDiagnosticsToClipboard }
  from './beta-feedback.js';
import { deductTokenCredits, stripeCheckoutCreditPackage, stripeCheckoutBYOKPro, FREE_TRIAL_TOKENS }
  from './tier-config.js';
import { hasAcceptedSafetyWaiver, acceptSafetyWaiver, initSafetyWaiverModal }
  from './guide-view.js';
import { generateDailyHunt, getProgress, checkIn, isCompleted, getTodayPoints,
         resetIfNewDay, getLeaderboard, PRIZE_TIERS } from './hunt-engine.js';
import { getPlayerLocation, renderOSMMap, isNearWaypoint,
         DEMO_COORDS, DEMO_WAYPOINTS } from './hunt-map.js';
import { isParkMomentEnabled, checkParkMoment, simulateParkMoment } from './park-moment.js';

// ── Crypto adapter (device key, fixed per-device) ────────────
const deviceKey = localStorage.getItem('hb_device_key_v1') || (() => {
  const k = crypto.getRandomValues(new Uint8Array(24));
  const s = btoa(String.fromCharCode(...k));
  localStorage.setItem('hb_device_key_v1', s);
  return s;
})();
const cryptoAdapter = {
  encrypt: (str) => encryptApiKey(str, deviceKey),
  decrypt: (blob) => decryptApiKey(blob, deviceKey),
};

// ── App State ────────────────────────────────────────────────
const state = {
  activePersona:    'drill',
  conversationId:   null,
  messages:         [],
  apiConfig:        null,
  apiKeyDecrypted:  null,
  isDemo:           false,
  isStreaming:      false,
  abortController:  null,
  coachStyle:       'calm',
  havenStyle:       'warm',
  drillIntensity:   'high',
  ledgerFormality:  'casual',
  // Tier & voice
  tierId:           'free',
  voiceEnabled:     false,
  // Local model & bridge
  localOptions:     null,   // resolved by resolveLocalOptions()
  bridgeBase:       null,   // 'http://<pc-lan-ip>:<port>/v1'
  bridgeConnected:  false,
  // Phase 4: relay state
  relayMode:        false,  // true = off-network relay, false = LAN-direct
  pairId:           null,   // set after QR pairing
  sessionKey:       null,   // CryptoKey — shared secret from ECDH pairing
  pendingPairOffer: null,   // { offer, privateKey } — held during QR pairing window
};

// ── Oracle daily state ───────────────────────────────────────
const ORACLE_RIDDLES = [
  { riddle: "The more of me you take, the more you leave behind. What am I?",   answer: "footsteps", clues: ["Think of a physical action, not an object.", "It happens when you walk.", "You create them without trying."] },
  { riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?", answer: "echo", clues: ["I repeat what others say.", "Mountains know me well.", "I am a sound, not a creature."] },
  { riddle: "The more you take, the more you leave behind. I am invisible yet you feel me every day. What am I?", answer: "time", clues: ["I can't be stopped.", "Everyone has the same amount of me each day.", "You can't see me but you can measure me."] },
];

function getTodaysRiddle() {
  const day = Math.floor(Date.now() / 86_400_000); // days since epoch
  return ORACLE_RIDDLES[day % ORACLE_RIDDLES.length];
}

// ── DOM refs ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  body:              document.body,
  personaList:       $('personaList'),
  headerEmoji:       $('headerEmoji'),
  headerName:        $('headerName'),
  headerTag:         $('headerTag'),
  safetyBanner:      $('safetyBanner'),
  messagesArea:      $('messagesArea'),
  welcomeState:      $('welcomeState'),
  welcomeEmoji:      $('welcomeEmoji'),
  welcomeName:       $('welcomeName'),
  welcomeDesc:       $('welcomeDesc'),
  welcomeStarters:   $('welcomeStarters'),
  oracleGame:        $('oracleGame'),
  oracleRiddleText:  $('oracleRiddleText'),
  oracleClues:       $('oracleClues'),
  oracleClueBtn:     $('oracleClueBtn'),
  oracleAnswerInput: $('oracleAnswerInput'),
  oracleSubmitBtn:   $('oracleSubmitBtn'),
  oraclePlayerCount: $('oraclePlayerCount'),
  oracleTimer:       $('oracleTimer'),
  inputArea:         $('inputArea'),
  messageInput:      $('messageInput'),
  sendBtn:           $('sendBtn'),
  charCount:         $('charCount'),
  connectionBadge:   $('connectionBadge'),
  connectionLabel:   $('connectionLabel'),
  connectionDot:     document.querySelector('.connection-dot'),
  // Modals
  setupModal:        $('setupModal'),
  providerSelect:    $('providerSelect'),
  modelSelect:       $('modelSelect'),
  apiKeyInput:       $('apiKeyInput'),
  passphraseInput:   $('passphraseInput'),
  setupError:        $('setupError'),
  setupSaveBtn:      $('setupSaveBtn'),
  setupSkipBtn:      $('setupSkipBtn'),
  toggleKeyVis:      $('toggleKeyVisibility'),
  getKeyLink:        $('getKeyLink'),
  unlockModal:       $('unlockModal'),
  unlockPassphrase:  $('unlockPassphrase'),
  unlockError:       $('unlockError'),
  unlockBtn:         $('unlockBtn'),
  unlockForgotBtn:   $('unlockForgotBtn'),
  accessIdBypassBtn: $('accessIdBypassBtn'),
  unlockAccessIdBtn: $('unlockAccessIdBtn'),
  // Persona panel
  personaPanel:      $('personaPanel'),
  personaPanelClose: $('personaPanelClose'),
  personaPanelBody:  $('personaPanelBody'),
  personaSettingsBtn:$('personaSettingsBtn'),
  // Sidebar
  sidebar:           $('sidebar'),
  sidebarToggle:     $('sidebarToggle'),
  // Misc
  settingsBtn:       $('settingsBtn'),
  clearBtn:          $('clearBtn'),
  installBtn:        $('installBtn'),
  // R1: Voice toggle
  voiceToggleBtn:    $('voiceToggleBtn'),
  // R3 + Phase 4: Bridge
  bridgeBadge:            $('bridgeBadge'),
  bridgeComposeBtn:       $('bridgeComposeBtn'),
  // Bridge settings modal
  bridgeSettingsModal:     $('bridgeSettingsModal'),
  bridgeSettingsDot:       $('bridgeSettingsDot'),
  bridgeSettingsModeLabel: $('bridgeSettingsModeLabel'),
  bridgeSettingsRelayLabel:$('bridgeSettingsRelayLabel'),
  bridgeLogSummary:        $('bridgeLogSummary'),
  bridgeLogTotal:          $('bridgeLogTotal'),
  bridgeLogSent:           $('bridgeLogSent'),
  bridgeLogReceived:       $('bridgeLogReceived'),
  bridgeIpInput:           $('bridgeIpInput'),
  bridgeConnectBtn:        $('bridgeConnectBtn'),
  bridgeStatus:            $('bridgeStatus'),
  bridgePairQrBtn:         $('bridgePairQrBtn'),
  bridgeUnpairBtn:         $('bridgeUnpairBtn'),
  bridgePairedStatus:      $('bridgePairedStatus'),
  bridgeSettingsCloseBtn:  $('bridgeSettingsCloseBtn'),
  // Pairing modal
  bridgePairingModal:      $('bridgePairingModal'),
  bridgeQrArea:            $('bridgeQrArea'),
  bridgeQrFallback:        $('bridgeQrFallback'),
  bridgePairId:            $('bridgePairId'),
  bridgePairingWaiting:    $('bridgePairingWaiting'),
  bridgePairingSuccess:    $('bridgePairingSuccess'),
  bridgePairingCancelBtn:  $('bridgePairingCancelBtn'),
  // Compose toast
  bridgeComposeToast:   $('bridgeComposeToast'),
  bridgeComposeClose:   $('bridgeComposeClose'),
  bridgeComposeInput:   $('bridgeComposeInput'),
  bridgeComposeSendBtn: $('bridgeComposeSendBtn'),
  // R4: Upgrade modal
  upgradeModal:      $('upgradeModal'),
  upgradeStartTrialBtn: $('upgradeStartTrialBtn'),
  upgradeDismissBtn: $('upgradeDismissBtn'),
  // R5: Custom persona
  createPersonaModal:  $('createPersonaModal'),
  createPersonaBtn:    $('createPersonaBtn'),
  savedPersonasList:   $('savedPersonasList'),
  personaNameInput:    $('personaNameInput'),
  personaDescInput:    $('personaDescInput'),
  personaPromptInput:  $('personaPromptInput'),
  personaCreateError:  $('personaCreateError'),
  savePersonaBtn:      $('savePersonaBtn'),
  cancelPersonaBtn:    $('cancelPersonaBtn'),
  // Phase 5: Agent Studio & Fleet Drawer
  agentStudioBtn:       $('agentStudioBtn'),
  fleetDrawer:          $('fleetDrawer'),
  fleetDrawerCloseBtn:  $('fleetDrawerCloseBtn'),
  fleetDrawerBody:      $('fleetDrawerBody'),
  agentStudioModal:     $('agentStudioModal'),
  studioAgentName:      $('studioAgentName'),
  studioAgentDesc:      $('studioAgentDesc'),
  studioAgentPrompt:    $('studioAgentPrompt'),
  studioModalCancelBtn: $('studioModalCancelBtn'),
  studioModalSaveBtn:   $('studioModalSaveBtn'),
  studioModalError:     $('studioModalError'),
  // Phase 6: Agent Marketplace
  agentMarketBtn:      $('agentMarketBtn'),
  agentMarketModal:    $('agentMarketModal'),
  marketSearchInput:   $('marketSearchInput'),
  marketCategoryChips: $('marketCategoryChips'),
  marketGridBody:      $('marketGridBody'),
  marketModalCloseBtn: $('marketModalCloseBtn'),
  // Beta Release
  betaFeedbackBtn:         $('betaFeedbackBtn'),
  betaFeedbackModal:       $('betaFeedbackModal'),
  betaFeedbackText:        $('betaFeedbackText'),
  feedbackExportFileBtn:   $('feedbackExportFileBtn'),
  feedbackCopyClipboardBtn:$('feedbackCopyClipboardBtn'),
  feedbackCloseBtn:        $('feedbackCloseBtn'),
  onboardingModal:         $('onboardingModal'),
  onboardingStep1:         $('onboardingStep1'),
  onboardingStep2:         $('onboardingStep2'),
  onboardingStep3:         $('onboardingStep3'),
  onboardingStepIndicator: $('onboardingStepIndicator'),
  onboardDemoBtn:          $('onboardDemoBtn'),
  onboardSetupBtn:         $('onboardSetupBtn'),
  onboardSetupBtn:         $('onboardSetupBtn'),
  onboardNextBtn:          $('onboardNextBtn'),
  // Pricing & Upgrades
  upgradeClaimTrialBtn:    $('upgradeClaimTrialBtn'),
  upgradeBYOKProBtn:       $('upgradeBYOKProBtn'),
  creditPackageSelect:     $('creditPackageSelect'),
  upgradeBuyCreditsBtn:    $('upgradeBuyCreditsBtn'),
  // Mandatory Safety Waiver & Guide
  safetyWaiverModal: $('safetyWaiverModal'),
  waiverCheckbox:    $('waiverCheckbox'),
  waiverAcceptBtn:   $('waiverAcceptBtn'),
  guideBtn:          $('guideBtn'),
  guideModal:        $('guideModal'),
  guideCloseBtn:     $('guideCloseBtn'),
  // Hunt
  huntView:            $('huntView'),
  huntPointsBadge:     $('huntPointsBadge'),
  huntMapContainer:    $('huntMapContainer'),
  waypointList:        $('waypointList'),
  leaderboardBtn:      $('leaderboardBtn'),
  leaderboardModal:    $('leaderboardModal'),
  leaderboardRows:     $('leaderboardRows'),
  prizeSection:        $('prizeSection'),
  leaderboardCloseBtn: $('leaderboardCloseBtn'),
  parkMomentNudge:     $('parkMomentNudge'),
  parkMomentName:      $('parkMomentName'),
  parkMomentDist:      $('parkMomentDist'),
  parkMomentSayHi:     $('parkMomentSayHi'),
  parkMomentDismiss:   $('parkMomentDismiss'),
  chatTabBtn:          $('chatTabBtn'),
  huntTabBtn:          $('huntTabBtn'),
};

// ── Persona metadata ─────────────────────────────────────────
const PERSONA_META = {
  drill: {
    name:    'The Drill',
    emoji:   '🔥',
    tag:     'No excuses. All heart.',
    desc:    'Ruthless with your goals. Relentless in your corner. Every word intense — and every word kind.',
    placeholder: 'Tell The Drill what you\'re working on...',
    starters: [
      '🎯 I keep avoiding something important. Call me out.',
      '💪 I need a push — I\'m running on empty today.',
      '🔥 Give me a mindset reset. Right now.',
      '📋 I have a goal but no plan. Help me build one.',
    ],
    inputHint: '🔥 Intense but always kind — never cruel',
  },
  haven: {
    name:    'Haven',
    emoji:   '💙',
    tag:     'Warm. Present. Always.',
    desc:    'The one you can talk to at 2am. No judgment, no agenda — just genuine presence.',
    placeholder: 'What\'s on your mind? Haven is here...',
    starters: [
      '💙 I\'m having a rough one. Just need someone to talk to.',
      '🌙 Can\'t sleep. My head won\'t quiet down.',
      '😔 Something happened today and I don\'t know how to process it.',
      '🤍 I just need to feel heard right now.',
    ],
    inputHint: '💙 Private. No judgment. Always here.',
  },
  ledger: {
    name:    'The Ledger',
    emoji:   '📊',
    tag:     'Your commitments, tracked.',
    desc:    'Calm. Precise. You said you\'d do it. The Ledger remembers. No punishment — just honesty.',
    placeholder: 'What did you commit to? The Ledger is listening...',
    starters: [
      '📋 Let\'s do a weekly check-in on my goals.',
      '🔍 I told myself I\'d do something and I didn\'t. Help me understand why.',
      '📊 Track a new commitment I\'m making today.',
      '⚖️ I need an honest look at my patterns.',
    ],
    inputHint: '📊 Honesty. No shame. Just clarity.',
  },
  coach: {
    name:    'Coach',
    emoji:   '🌱',
    tag:     'Health, your way.',
    desc:    'Health and wellness guidance. Your style, your pace — calm, intense, or science-based.',
    placeholder: 'Ask Coach anything about health and wellness...',
    starters: [
      '🏃 I want to build a simple movement habit. Where do I start?',
      '😴 My sleep is wrecked. What actually helps?',
      '🥗 Nutrition basics — cut through the noise for me.',
      '🧘 I\'m burning out. What does recovery actually look like?',
    ],
    inputHint: '🌱 Wellness guidance — not medical advice',
  },
  'first-responder': {
    name:    'First Responder',
    emoji:   '🚑',
    tag:     'Emergency · First Aid · Survival',
    desc:    'Step-by-step emergency guidance. Clear, calm, actionable. Not a replacement for 911.',
    placeholder: 'Describe what\'s happening — I\'ll guide you step by step...',
    starters: [
      '🩹 How do I treat a deep cut that won\'t stop bleeding?',
      '🔥 Someone near me got burned — what do I do right now?',
      '🌡️ I think someone is having a heat stroke. Steps?',
      '🏕️ I\'m stranded outdoors with no signal. Survival basics?',
    ],
    inputHint: '🚨 Life-threatening? Call 911 first — always.',
  },
  oracle: {
    name:    'The Oracle',
    emoji:   '🔐',
    tag:     'Every day, a new mystery.',
    desc:    'One secret. One day. Ask for clues — but each one reveals more. First to answer wins.',
    placeholder: '',
    starters: [],
    inputHint: '',
  },
};

// ── Access ID Tester Bypass Helper ────────────────────────────
async function activateAccessIdBypass(accessId = 'TESTER_PASS') {
  try {
    await acceptSafetyWaiver();
  } catch (e) {}
  try {
    await markOnboardingComplete();
  } catch (e) {}

  state.isDemo = false;
  state.apiConfig = {
    provider: 'openrouter',
    model: 'meta-llama/llama-3.3-70b-instruct:free'
  };
  state.apiKeyDecrypted = 'openrouter-free-tier';
  state.tierId = 'pro';

  // Hide all login / onboarding / safety modals
  if (dom.setupModal) hideModal(dom.setupModal);
  if (dom.unlockModal) hideModal(dom.unlockModal);
  if (dom.safetyWaiverModal) hideModal(dom.safetyWaiverModal);
  if (dom.onboardingModal) hideModal(dom.onboardingModal);

  setConnectionStatus('connected', `🔑 Access ID Authorized (${accessId.toUpperCase()})`);
  dom.body.dataset.tier = 'pro';
  console.log(`[Bypass] Activated Access ID ${accessId} — full tester access enabled.`);
}

// ── Initialization ───────────────────────────────────────────
async function init() {
  await openDB();
  await loadApiConfig();
  wireEvents();
  setActivePersona('drill');

  // Seed starter fleet presets if empty
  await seedStarterPresetsIfEmpty();

  // First-run sandbox notice (shows once, then never again)
  await showSandboxNotice();

  // Check URL query parameter access ID / tester bypass (?access_id=... or ?bypass=true)
  const urlParams = new URLSearchParams(window.location.search);
  const urlAccessId = urlParams.get('access_id') || urlParams.get('accessId') || (urlParams.has('bypass') ? 'BYPASS_ACTIVE' : null);
  if (urlAccessId) {
    await activateAccessIdBypass(urlAccessId);
    return;
  }

  // Mandatory Safety & Legal Liability Waiver check (Must accept before onboarding/app access)
  const acceptedWaiver = await hasAcceptedSafetyWaiver();
  if (!acceptedWaiver) {
    showModal(dom.safetyWaiverModal);
  } else if (await shouldShowOnboarding()) {
    showModal(dom.onboardingModal);
  }


  // R4: Set tier data attribute so CSS can target locked persona badges
  dom.body.dataset.tier = state.tierId;

  // Phase 4: Restore pairing session on startup (no re-scan needed)
  isPaired().then(async (paired) => {
    if (!paired) return;
    const pairingData = await loadPairing();
    if (pairingData) {
      state.pairId     = pairingData.pairId;
      state.sessionKey = pairingData.sharedKey;
      state.relayMode  = true;
      setBridgeConnected('relay');
      setConnectionStatus('connected', '🔗 Your PC (relay)');
    }
  }).catch(() => {});

  // Register service worker and setup install UI
  registerServiceWorker();
  setupInstall({
    button: dom.installBtn,
    onAvailable: (kind) => {
      if (kind === 'ios') {
        showToast(IOS_INSTALL_HINT);
      }
    },
    onInstalled: () => {
      showToast('Hey Buddy added to your home screen ❤️');
    }
  });

  // Detect local model server in background (Ollama / LM Studio / llama.cpp / Jan)
  resolveLocalOptions().then(async (opts) => {
    state.localOptions = opts;
    // R2: Inject local option with detected status
    const localOpt = document.createElement('option');
    localOpt.value = 'local';
    if (opts.mode === 'own') {
      console.log(`[HeyBuddy] Detected local server: ${opts.endpoint.name}`);
      localOpt.textContent = `💻 Local — ${opts.endpoint.name} (running)`;
      PROVIDERS.local.models = opts.models.map(m => ({ id: m, label: m }));
    } else {
      localOpt.textContent = '💻 Local — not detected (start Ollama)';
      localOpt.disabled = true;
      if (opts.mode === 'fallback') {
        localOpt.disabled = false;
        localOpt.textContent = '💻 Local — Offline Fallback';
        PROVIDERS.local.models = opts.candidates.map(m => ({ id: m.id, label: `${m.name} (${m.sizeMb}MB)` }));
      }
    }
    // Insert before the bridge option
    const bridgeOpt = dom.providerSelect.querySelector('[value="bridge"]');
    dom.providerSelect.insertBefore(localOpt, bridgeOpt);

    const stored = await get('api_keys', 'primary');
    if (stored && stored.providerName === 'local') {
      dom.providerSelect.value = 'local';
      updateModelOptions('local');
      if (state.apiConfig) {
        dom.modelSelect.value = state.apiConfig.model;
      }
    }
  }).catch(() => {});

  // Oracle timer
  updateOracleTimer();
  setInterval(updateOracleTimer, 60_000);

  // Fake player count (replace with real server when The Oracle backend is built)
  dom.oraclePlayerCount.textContent = `👥 ${Math.floor(Math.random() * 200 + 50)} players today`;

  // R5: Show create persona button for paid tiers
  if (state.tierId !== 'free') {
    dom.createPersonaBtn.hidden = false;
    renderSavedPersonas();
  }

  // Hunt setup
  resetIfNewDay();
  await initHunt();
}

// ── API config persistence ────────────────────────────────────
async function loadApiConfig() {
  const stored = await get('api_keys', 'primary');
  if (!stored) {
    // First run — show setup
    showModal(dom.setupModal);
    return;
  }

  // Key exists encrypted — show unlock
  state.apiConfig = { provider: stored.provider, model: stored.model };
  showModal(dom.unlockModal);
}

async function saveApiKey(apiKey, passphrase, provider, model) {
  let resolvedKey = apiKey;
  if (provider === 'local') {
    resolvedKey = state.localOptions?.endpoint?.base || 'http://localhost:11434/v1';
  }
  const blob = await encryptApiKey(resolvedKey, passphrase);
  await put('api_keys', { provider: 'primary', ...blob, providerName: provider, model });
  state.apiKeyDecrypted = resolvedKey;
  state.apiConfig = { provider, model };
  state.isDemo = false;
  setConnectionStatus('connected', `${PROVIDERS[provider]?.label ?? provider} · ${model}`);
}

async function unlockApiKey(passphrase) {
  const stored = await get('api_keys', 'primary');
  if (!stored) throw new Error('No key stored.');
  const key = await decryptApiKey(stored, passphrase);
  state.apiKeyDecrypted = key;
  state.apiConfig = { provider: stored.providerName, model: stored.model };
  state.isDemo = false;
  setConnectionStatus('connected', `${PROVIDERS[stored.providerName]?.label ?? stored.providerName}`);
}

function enableDemoMode() {
  state.isDemo = true;
  state.apiKeyDecrypted = null;
  state.apiConfig = null;
  setConnectionStatus('demo', 'Demo mode');
}

// ── Connection badge ──────────────────────────────────────────
function setConnectionStatus(status, label) {
  dom.connectionBadge.className = `connection-badge ${status}`;
  dom.connectionLabel.textContent = label;
}

/**
 * Update bridge badge, body class, and settings dot.
 * Transparency requirement: badge ALWAYS visible when remote mode active.
 * @param {'lan'|'relay'|'offline'} mode
 */
function setBridgeConnected(mode) {
  const isConnected = mode === 'lan' || mode === 'relay';
  state.bridgeConnected = isConnected;

  dom.bridgeBadge.hidden = !isConnected;
  if (isConnected) {
    dom.bridgeBadge.classList.toggle('relay-mode', mode === 'relay');
    dom.bridgeBadge.textContent = mode === 'relay'
      ? '🔗 Connected to your PC (relay)'
      : '🔗 Connected to your PC';
  }

  // body.bridge-connected drives CSS visibility of compose button
  document.body.classList.toggle('bridge-connected', isConnected);

  // Update settings modal elements if present
  if (dom.bridgeSettingsDot) {
    dom.bridgeSettingsDot.className = `bridge-status-dot ${mode}`;
  }
  if (dom.bridgeSettingsModeLabel) {
    dom.bridgeSettingsModeLabel.textContent =
      mode === 'lan'   ? '🟢 LAN-direct (same Wi-Fi)' :
      mode === 'relay' ? '🟣 Relay (E2EE off-network)' :
                         'Not connected';
  }
}

/**
 * Refresh bridge settings modal with current pairing/connection state.
 * Called when opening the modal or after pairing/unpairing.
 */
async function refreshBridgeSettingsUI() {
  const paired = await isPaired();
  const pairingData = paired ? await loadPairing() : null;

  if (dom.bridgePairedStatus) {
    dom.bridgePairedStatus.hidden = !paired;
    if (paired && pairingData) {
      const d = new Date(pairingData.pairedAt);
      dom.bridgePairedStatus.textContent =
        `Paired on ${d.toLocaleDateString()} · ID: ${pairingData.pairId.slice(0, 8)}…`;
    }
  }

  if (dom.bridgePairQrBtn) {
    dom.bridgePairQrBtn.textContent = paired ? '📷 Re-pair' : '📷 Show pairing QR';
  }

  // Load stored pairing into state if not already set
  if (paired && pairingData && !state.sessionKey) {
    state.pairId     = pairingData.pairId;
    state.sessionKey = pairingData.sharedKey;
    state.relayMode  = true;
    setBridgeConnected('relay');
    setConnectionStatus('connected', '🔗 Your PC (relay)');
  }

  // Update log summary
  if (paired && pairingData?.pairId && dom.bridgeLogSummary) {
    try {
      const summary = await getBridgeLogSummary(pairingData.pairId);
      dom.bridgeLogSummary.hidden    = false;
      dom.bridgeLogTotal.textContent    = summary.total;
      dom.bridgeLogSent.textContent     = summary.sent;
      dom.bridgeLogReceived.textContent = summary.received;
    } catch { dom.bridgeLogSummary.hidden = true; }
  } else if (dom.bridgeLogSummary) {
    dom.bridgeLogSummary.hidden = true;
  }
}

/**
 * Close the quick-compose toast and reset its state.
 */
function closeBridgeCompose() {
  dom.bridgeComposeToast.classList.remove('open');
  dom.bridgeComposeInput.value = '';
  dom.bridgeComposeSendBtn.disabled = true;
}

/**
 * Render pairing offer as readable text in the QR area (fallback when
 * qrcode.js is not bundled). The phone user can manually enter the JSON
 * or the user can scan it with a text-capable scanner.
 */
function _renderQrTextFallback(container, payload) {
  container.style.cssText = 'font-size:0.5rem;word-break:break-all;color:#000;padding:0.5rem;line-height:1.3;';
  container.textContent = payload;
}

/**
 * Send a note to the PC-side agent via the bridge.
 * BRIDGE RULE: this is a message-taker. It sends the raw text as a note.
 * Hey Buddy never interprets, parses for trigger words, or executes anything.
 */
async function sendBridgeNote() {
  const text = dom.bridgeComposeInput.value.trim();
  if (!text || !state.bridgeConnected) return;

  dom.bridgeComposeSendBtn.disabled = true;
  dom.bridgeComposeInput.disabled   = true;

  try {
    if (state.relayMode && state.sessionKey && state.pairId) {
      // E2EE relay path — log it before sending (ciphertext-only)
      await logBridgeMessage({
        pairId:    state.pairId,
        direction: 'sent',
        plaintext: text,
        sharedKey: state.sessionKey,
      });

      await pokeAgentTask({
        base:      state.bridgeBase || '',
        taskId:    'default',
        message:   text,
        relayMode: true,
        pairId:    state.pairId,
        sharedKey: state.sessionKey,
      });
    } else {
      // LAN-direct path
      await pokeAgentTask({
        base:    state.bridgeBase,
        taskId:  'default',
        message: text,
      });
    }

    showToast('📨 Note delivered to your PC buddy ✓');
    closeBridgeCompose();
  } catch (err) {
    showToast(`Couldn't reach your PC — ${err.message}`);
    dom.bridgeComposeSendBtn.disabled = false;
  } finally {
    dom.bridgeComposeInput.disabled = false;
  }
}

/**
 * Poll the relay for the phone's public key to complete the PC-side pairing.
 * This runs in the background while the QR pairing modal is open.
 *
 * In a production relay deployment, the phone POSTs its public key to
 * /relay/pair, and this poll picks it up. For now it times out gracefully.
 *
 * @param {string}    pairId
 * @param {CryptoKey} pcPrivateKey
 */
async function _pollForPairingCompletion(pairId, pcPrivateKey) {
  const MAX_POLLS = 30;   // ~60 seconds
  const POLL_MS   = 2000;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_MS));
    if (!state.pendingPairOffer || state.pendingPairOffer.offer?.pairId !== pairId) return;

    try {
      // TODO: Replace with real relay /pair/poll endpoint when relay is deployed
      // Signature: GET /relay/pair/poll?pairId=<id> → { phonePublicKeyB64 } or 204
      const res = await fetch(
        `https://nexus-relay.hey-buddy.local/relay/pair/poll?pairId=${encodeURIComponent(pairId)}`, // TODO: real host
        { signal: AbortSignal.timeout(3000) }
      ).catch(() => null);

      if (!res || res.status === 204) continue;
      if (!res.ok) continue;

      const { phonePublicKeyB64 } = await res.json();
      if (!phonePublicKeyB64) continue;

      // Complete PC side of the handshake
      const { acceptPairing } = await import('./bridge-pairing.js');
      await acceptPairing(pcPrivateKey, phonePublicKeyB64, pairId);

      // Load the completed pairing into state
      const pairingData = await loadPairing();
      if (pairingData) {
        state.pairId     = pairingData.pairId;
        state.sessionKey = pairingData.sharedKey;
        state.relayMode  = true;
        setBridgeConnected('relay');
        setConnectionStatus('connected', '🔗 Your PC (relay)');
      }

      // Show success in the modal
      dom.bridgePairingWaiting.hidden = true;
      dom.bridgePairingSuccess.hidden = false;
      state.pendingPairOffer = null;
      setTimeout(() => hideModal(dom.bridgePairingModal), 2000);
      return;
    } catch { /* keep polling */ }
  }

  // Timed out — show a message
  if (dom.bridgePairingWaiting && !dom.bridgePairingWaiting.hidden) {
    dom.bridgePairingWaiting.textContent = 'Timed out. Try again.';
  }
}

// ── Persona switching ─────────────────────────────────────────
function setActivePersona(id) {
  // R4: Oracle tier gate
  if (id === 'oracle' && state.tierId === 'free') {
    showModal(dom.upgradeModal);
    return;
  }

  state.activePersona = id;
  const meta = PERSONA_META[id];

  // Body class for CSS theming
  dom.body.dataset.persona = id;

  // Header
  dom.headerEmoji.textContent = meta.emoji;
  dom.headerName.textContent  = meta.name;
  dom.headerTag.textContent   = meta.tag;

  // Input placeholder
  dom.messageInput.placeholder = meta.placeholder || '';

  // Input hint
  document.getElementById('privacyIndicator').textContent = meta.inputHint || '🔒 Private — stays on your device';

  // Safety banner — only for first responder
  dom.safetyBanner.hidden = (id !== 'first-responder');

  // Oracle game vs chat
  const isOracle = id === 'oracle';
  dom.oracleGame.hidden  = !isOracle;
  dom.inputArea.hidden   = isOracle;
  dom.messagesArea.hidden = false;

  if (isOracle) {
    dom.messagesArea.hidden = true;
    loadOracleUI();
  } else {
    // Show welcome state
    showWelcome(meta);
  }

  // Active button highlight
  document.querySelectorAll('.persona-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.persona === id);
  });

  // Clear messages from previous persona session
  state.messages = [];
  state.conversationId = null;
}

function showWelcome(meta) {
  dom.welcomeEmoji.textContent = meta.emoji;
  dom.welcomeName.textContent  = meta.name;
  dom.welcomeDesc.textContent  = meta.desc;

  // Starter prompts
  dom.welcomeStarters.innerHTML = meta.starters.map(s =>
    `<button class="starter-btn">${s}</button>`
  ).join('');

  dom.welcomeStarters.querySelectorAll('.starter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dom.messageInput.value = btn.textContent.replace(/^[\p{Emoji}\s]+/u, '').trim();
      sendMessage();
    });
  });

  dom.welcomeState.style.display = '';
}

function hideWelcome() {
  dom.welcomeState.style.display = 'none';
}

// ── Send message ──────────────────────────────────────────────
async function sendMessage() {
  const text = dom.messageInput.value.trim();
  if (!text || state.isStreaming) return;

  if (state.apiConfig?.provider === 'local' && state.localOptions?.mode === 'fallback') {
    const modelObj = getModel(state.apiConfig.model);
    if (modelObj) {
      const verdictObj = await preflight(modelObj);
      if (verdictObj.verdict === 'block') {
        showToast(verdictObj.download.reason || verdictObj.load.reason || 'Blocked by device guard.');
        return;
      } else if (verdictObj.verdict === 'warn') {
        showToast(verdictObj.download.reason || verdictObj.load.reason || 'Warning: Device resources tight.');
      }
    }
  }

  // Guardrail: check input
  const { proceed, reason } = checkInput(state.activePersona, text);
  if (!proceed) {
    appendMessage('buddy', reason);
    return;
  }

  hideWelcome();
  dom.messageInput.value = '';
  autoResizeTextarea();
  dom.sendBtn.disabled = true;

  // Add user message
  state.messages.push({ role: 'user', content: text });
  appendMessage('user', text);

  // Save to DB
  if (!state.conversationId) {
    state.conversationId = await Conversations.create(state.activePersona, text.slice(0, 50));
  }
  await Messages.add(state.conversationId, 'user', text);

  // Show typing
  const typingEl = appendTyping();
  state.isStreaming = true;

  try {
    let response = '';

    if (state.isDemo) {
      // Demo mode: simulate streaming
      await new Promise(r => setTimeout(r, 600));
      response = getDemoResponse(state.activePersona);
      await _simulateStream(response, (chunk) => {
        typingEl.textContent = (typingEl.textContent || '') + chunk;
      });
    } else if (state.apiConfig?.provider === 'local') {
      // R2: Local model provider
      state.abortController = new AbortController();
      await localChat({
        base: state.localOptions?.endpoint?.base || 'http://localhost:11434/v1',
        model: state.localOptions?.models?.[0] || state.apiConfig.model,
        messages: state.messages,
        onToken: (tok) => {
          typingEl.textContent += tok;
          scrollToBottom();
        },
        signal: state.abortController.signal,
      });
      response = typingEl.textContent;
    } else if (state.apiConfig?.provider === 'bridge') {
      // Phase 4: Bridge (Your PC) provider — relay or LAN-direct
      state.abortController = new AbortController();
      try {
        if (state.relayMode && state.sessionKey && state.pairId) {
          // E2EE relay path: log outgoing message, route through relay
          await logBridgeMessage({
            pairId:    state.pairId,
            direction: 'sent',
            plaintext: text,
            sharedKey: state.sessionKey,
          });
          await relayChat({
            pairId:    state.pairId,
            sharedKey: state.sessionKey,
            model:     'default',
            messages:  state.messages,
            onToken:   (tok) => {
              typingEl.textContent += tok;
              scrollToBottom();
            },
            signal: state.abortController.signal,
          });
          // Log the received reply (ciphertext-only)
          const reply = typingEl.textContent;
          if (reply) {
            await logBridgeMessage({
              pairId:    state.pairId,
              direction: 'received',
              plaintext: reply,
              sharedKey: state.sessionKey,
            }).catch(() => {});
          }
        } else {
          // LAN-direct path (Phase A — unchanged)
          await pcChat({
            base:   state.bridgeBase,
            model:  'default',
            messages: state.messages,
            onToken: (tok) => {
              typingEl.textContent += tok;
              scrollToBottom();
            },
            signal: state.abortController.signal,
          });
        }
        response = typingEl.textContent;
      } catch (bridgeErr) {
        showToast('Lost connection to your PC — switching to Demo mode');
        enableDemoMode();
        throw bridgeErr;
      }
    } else {
      // Real API call
      state.abortController = new AbortController();
      const systemPrompt = buildSystemPrompt(state.activePersona, {
        style: state.coachStyle,
        intensity: state.drillIntensity,
      });

      response = await streamChat({
        provider: state.apiConfig.provider,
        model:    state.apiConfig.model,
        apiKey:   state.apiKeyDecrypted,
        system:   systemPrompt,
        messages: state.messages,
        signal:   state.abortController.signal,
        onChunk:  (chunk) => {
          typingEl.textContent = (typingEl.textContent || '') + chunk;
          scrollToBottom();
        },
      });
    }

    // Run response through guardrails
    const { content } = checkResponse(state.activePersona, response);

    // Replace typing with final content
    typingEl.remove();
    appendMessage('buddy', content);

    // Voice — metered, self-hosted TTS
    if (state.voiceEnabled) {
      const isStarter = !state.activePersona.startsWith('custom-');
      const gate = checkVoice({ text: content, tierId: state.tierId, isStarterPersona: isStarter });
      if (gate.allowed) {
        recordVoiceUsage(content.length, state.tierId);
        ttsSpeak({ personaId: state.activePersona, text: content }).catch(() => {});
      } else {
        showToast(gate.reason);
      }
    }

    // Persist (only for paid tiers)
    state.messages.push({ role: 'assistant', content });
    if (shouldPersist(state.tierId)) {
      await Messages.add(state.conversationId, 'assistant', content);
    }

  } catch (err) {
    typingEl.remove();
    if (err.name === 'AbortError') {
      appendMessage('buddy', '*(response stopped)*');
    } else {
      if (state.apiConfig?.provider === 'local') {
        appendMessage('buddy', `⚠️ ${err.message}\n\nMake sure your local server (Ollama/LM Studio) is running and CORS is enabled.`);
      } else {
        appendMessage('buddy', `⚠️ ${err.message}\n\nCheck your API key in Settings, or switch to Demo mode.`);
      }
    }
  } finally {
    state.isStreaming = false;
    state.abortController = null;
    dom.sendBtn.disabled = !dom.messageInput.value.trim();
  }
}

async function _simulateStream(text, onChunk) {
  const words = text.split(' ');
  for (const word of words) {
    await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
    onChunk(word + ' ');
    scrollToBottom();
  }
}

// ── Message rendering ────────────────────────────────────────
function appendMessage(role, content) {
  const meta = PERSONA_META[state.activePersona];
  const isUser = role === 'user';

  const el = document.createElement('div');
  el.className = `message ${isUser ? 'user-msg' : 'buddy-msg'}`;
  el.innerHTML = `
    <div class="message-avatar">${isUser ? '🙂' : meta.emoji}</div>
    <div class="message-body">
      <div class="message-bubble">${escapeHtml(content)}</div>
      <div class="message-meta">${formatTime(new Date())}</div>
    </div>
  `;

  dom.messagesArea.appendChild(el);
  scrollToBottom();
  return el.querySelector('.message-bubble');
}

function appendTyping() {
  const meta = PERSONA_META[state.activePersona];
  const el = document.createElement('div');
  el.className = 'message buddy-msg';
  el.id = 'typingMsg';
  el.innerHTML = `
    <div class="message-avatar">${meta.emoji}</div>
    <div class="message-body">
      <div class="message-bubble" id="streamingBubble"></div>
      <div class="message-meta">Thinking...</div>
    </div>
  `;
  dom.messagesArea.appendChild(el);
  scrollToBottom();
  return el.querySelector('#streamingBubble');
}

function escapeHtml(str) {
  return str
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function scrollToBottom() {
  dom.messagesArea.scrollTop = dom.messagesArea.scrollHeight;
}

// ── Oracle UI ────────────────────────────────────────────────
let oracleCluesAsked = 0;

function loadOracleUI() {
  const today = getTodaysRiddle();
  dom.oracleRiddleText.textContent = `"${today.riddle}"`;
  oracleCluesAsked = 0;
  dom.oracleClues.innerHTML = `<p class="oracle-clue-hint">Ask The Oracle for a clue — each one reveals a little more...</p>`;
}

function updateOracleTimer() {
  const now   = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight - now;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  dom.oracleTimer.textContent = `⏱️ ${h}h ${m}m remaining`;
}

// ── Modal helpers ─────────────────────────────────────────────
function showModal(modal) { modal.hidden = false; }
function hideModal(modal) { modal.hidden = true; }

function showError(el, msg) {
  el.hidden = false;
  el.textContent = msg;
}

function clearError(el) {
  el.hidden = true;
  el.textContent = '';
}

// ── Provider model switcher ───────────────────────────────────
function updateModelOptions(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return;

  dom.modelSelect.innerHTML = provider.models
    .map(m => `<option value="${m.id}">${m.label}</option>`)
    .join('');

  // Update the docs link
  dom.getKeyLink.href = provider.docsUrl;

  const apiKeyGroup = dom.apiKeyInput.closest('.form-group');
  if (apiKeyGroup) {
    if (providerId === 'local') {
      apiKeyGroup.style.display = 'none';
    } else {
      apiKeyGroup.style.display = '';
    }
  }
}

// ── Persona settings panel ────────────────────────────────────
function showPersonaPanel() {
  const id = state.activePersona;

  let html = '';

  if (id === 'coach') {
    html = `
      <div class="panel-section">
        <div class="panel-section-label">Coaching Style</div>
        <div class="style-options">
          ${['calm','intense','scientific'].map(s => `
            <label class="style-option ${state.coachStyle === s ? 'selected' : ''}">
              <input type="radio" name="coachStyle" value="${s}">
              <span class="style-option-icon">${{calm:'🌿',intense:'⚡',scientific:'🧬'}[s]}</span>
              ${s.charAt(0).toUpperCase() + s.slice(1)}
            </label>
          `).join('')}
        </div>
      </div>`;
  } else if (id === 'haven') {
    html = `
      <div class="panel-section">
        <div class="panel-section-label">Presence Style</div>
        <div class="style-options">
          ${[['warm','🤍','Warm & quiet'],['expressive','💙','Warm & expressive']].map(([v,icon,label]) => `
            <label class="style-option ${state.havenStyle === v ? 'selected' : ''}">
              <input type="radio" name="havenStyle" value="${v}">
              <span class="style-option-icon">${icon}</span>
              ${label}
            </label>
          `).join('')}
        </div>
      </div>`;
  } else if (id === 'drill') {
    html = `
      <div class="panel-section">
        <div class="panel-section-label">Intensity Level</div>
        <div class="style-options">
          ${[['high','🔥','High — fierce but grounded'],['max','🚀','Max — pure fire']].map(([v,icon,label]) => `
            <label class="style-option ${state.drillIntensity === v ? 'selected' : ''}">
              <input type="radio" name="drillIntensity" value="${v}">
              <span class="style-option-icon">${icon}</span>
              ${label}
            </label>
          `).join('')}
        </div>
      </div>`;
  } else if (id === 'first-responder') {
    html = `
      <div class="panel-section">
        <p style="font-size:0.8rem;color:var(--text-muted);line-height:1.6;">
          First Responder settings are locked to ensure consistent, safe guidance.
          <br><br>
          🚨 <strong>Always call 911 first</strong> in a life-threatening emergency.
          This buddy provides guidance only — not a substitute for emergency services.
        </p>
      </div>`;
  } else {
    html = `<p style="font-size:0.8rem;color:var(--text-muted);">No additional settings for ${PERSONA_META[id].name}.</p>`;
  }

  dom.personaPanelBody.innerHTML = html;

  // Wire radio buttons
  dom.personaPanelBody.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.name === 'coachStyle')     state.coachStyle     = radio.value;
      if (radio.name === 'havenStyle')     state.havenStyle     = radio.value;
      if (radio.name === 'drillIntensity') state.drillIntensity = radio.value;
      // Refresh selected state
      dom.personaPanelBody.querySelectorAll('.style-option').forEach(opt => {
        opt.classList.toggle('selected', opt.querySelector('input').value === radio.value && opt.querySelector('input').name === radio.name);
      });
    });
  });

  showModal(dom.personaPanel);
}

// ── Auto-resize textarea ──────────────────────────────────────
function autoResizeTextarea() {
  const ta = dom.messageInput;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

// ── Event wiring ─────────────────────────────────────────────
function wireEvents() {
  // Persona buttons
  dom.personaList.querySelectorAll('.persona-btn:not(.custom-locked)').forEach(btn => {
    btn.addEventListener('click', () => {
      setActivePersona(btn.dataset.persona);
      // Close sidebar on mobile
      dom.sidebar.classList.remove('open');
    });
  });

  // Custom locked buttons — tease upgrade
  dom.personaList.querySelectorAll('.custom-locked').forEach(btn => {
    btn.addEventListener('click', () => {
      alert('Custom persona slots unlock with Buddy+ ($7.95/mo). Coming soon!');
    });
  });

  // Send button
  dom.sendBtn.addEventListener('click', sendMessage);

  // Textarea: Enter to send (Shift+Enter = newline)
  dom.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  dom.messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    const len = dom.messageInput.value.length;
    dom.sendBtn.disabled = !len || state.isStreaming;
    dom.charCount.textContent = len > 3500 ? `${len}/4000` : '';
  });

  // Clear chat
  dom.clearBtn.addEventListener('click', () => {
    if (confirm('Clear this conversation?')) {
      state.messages = [];
      state.conversationId = null;
      dom.messagesArea.querySelectorAll('.message').forEach(el => el.remove());
      showWelcome(PERSONA_META[state.activePersona]);
    }
  });

  // Settings → re-open setup modal
  dom.settingsBtn.addEventListener('click', () => {
    clearError(dom.setupError);
    showModal(dom.setupModal);
  });

  // Persona settings panel
  dom.personaSettingsBtn.addEventListener('click', showPersonaPanel);
  dom.personaPanelClose.addEventListener('click', () => hideModal(dom.personaPanel));
  dom.personaPanel.addEventListener('click', (e) => {
    if (e.target === dom.personaPanel) hideModal(dom.personaPanel);
  });

  // Mobile sidebar toggle
  dom.sidebarToggle.addEventListener('click', () => {
    dom.sidebar.classList.toggle('open');
  });

  // Setup modal: show/hide bridge setup when provider changes
  // (Bridge settings modal wiring is in the Phase 4 bridge block above)
  updateModelOptions('openai'); // init model options for default provider

  // R1: Voice toggle
  dom.voiceToggleBtn.addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    dom.voiceToggleBtn.textContent = state.voiceEnabled ? '🔊' : '🔇';
    dom.voiceToggleBtn.classList.toggle('voice-active', state.voiceEnabled);
  });

  // R3: Bridge connect (LAN-direct)
  dom.bridgeConnectBtn.addEventListener('click', async () => {
    const addr = dom.bridgeIpInput.value.trim();
    if (!addr) return;
    dom.bridgeStatus.textContent = 'Connecting…';
    dom.bridgeConnectBtn.disabled = true;
    try {
      const result = await probePc('http://' + addr + '/v1');
      if (result?.online) {
        state.bridgeBase = 'http://' + addr + '/v1';
        state.relayMode  = false;
        setBridgeConnected('lan');
        setConnectionStatus('connected', '💻 Your PC (LAN)');
        dom.bridgeStatus.textContent = '✅ Connected!';
        dom.bridgeStatus.style.color = '#10b981';
      } else {
        dom.bridgeStatus.textContent = "Can't reach that address — check Wi-Fi";
        dom.bridgeStatus.style.color = '#fca5a5';
      }
    } catch {
      dom.bridgeStatus.textContent = "Can't reach that address — check Wi-Fi";
      dom.bridgeStatus.style.color = '#fca5a5';
    } finally {
      dom.bridgeConnectBtn.disabled = false;
    }
  });

  // Phase 4: Open bridge settings when bridge is selected in provider picker
  dom.providerSelect.addEventListener('change', () => {
    const provider = dom.providerSelect.value;
    updateModelOptions(provider);
    if (provider === 'bridge') {
      showModal(dom.bridgeSettingsModal);
      refreshBridgeSettingsUI();
    }
  });

  // Bridge settings modal: close
  dom.bridgeSettingsCloseBtn.addEventListener('click', () => hideModal(dom.bridgeSettingsModal));
  dom.bridgeSettingsModal.addEventListener('click', e => {
    if (e.target === dom.bridgeSettingsModal) hideModal(dom.bridgeSettingsModal);
  });

  // Bridge settings: Show QR pairing modal
  dom.bridgePairQrBtn.addEventListener('click', async () => {
    showModal(dom.bridgePairingModal);
    dom.bridgePairingWaiting.hidden  = false;
    dom.bridgePairingSuccess.hidden  = true;
    dom.bridgeQrFallback.textContent = 'Generating…';
    dom.bridgePairId.textContent     = '—';

    try {
      const { offer, privateKey } = await generatePairOffer();
      state.pendingPairOffer = { offer, privateKey };
      dom.bridgePairId.textContent = offer.pairId;

      // Render QR code.
      // If a locally-bundled QRCode lib is present (window.QRCode), use it.
      // Never load QRCode from a CDN at runtime — that would fail the network gate.
      // To enable canvas QR rendering, bundle qrcode.js locally and include it
      // in app/index.html before app.js (e.g. <script src="js/vendor/qrcode.min.js">).
      const qrPayload = JSON.stringify(offer);
      dom.bridgeQrFallback.textContent = '';
      if (typeof window.QRCode !== 'undefined') {
        try {
          dom.bridgeQrArea.innerHTML = '';
          const canvas = document.createElement('canvas');
          dom.bridgeQrArea.appendChild(canvas);
          await window.QRCode.toCanvas(canvas, qrPayload, { width: 180, margin: 1 });
        } catch {
          _renderQrTextFallback(dom.bridgeQrFallback, qrPayload);
        }
      } else {
        _renderQrTextFallback(dom.bridgeQrFallback, qrPayload);
      }

      _pollForPairingCompletion(offer.pairId, privateKey);
    } catch (err) {
      dom.bridgeQrFallback.textContent = `Error: ${err.message}`;
    }
  });

  // Pairing modal: cancel
  dom.bridgePairingCancelBtn.addEventListener('click', () => {
    state.pendingPairOffer = null;
    hideModal(dom.bridgePairingModal);
  });
  dom.bridgePairingModal.addEventListener('click', e => {
    if (e.target === dom.bridgePairingModal) {
      state.pendingPairOffer = null;
      hideModal(dom.bridgePairingModal);
    }
  });

  // Bridge settings: Unpair
  dom.bridgeUnpairBtn.addEventListener('click', async () => {
    if (!confirm('Unpair this device? The encrypted bridge log will be wiped.')) return;
    const pairingData = await loadPairing();
    if (pairingData?.pairId) await clearBridgeLog(pairingData.pairId);
    await clearPairing();
    state.pairId     = null;
    state.sessionKey = null;
    state.relayMode  = false;
    setBridgeConnected('offline');
    refreshBridgeSettingsUI();
    showToast('🔓 Device unpaired.');
  });

  // Phase 4: "Message your buddy" compose button (header)
  dom.bridgeComposeBtn.addEventListener('click', () => {
    dom.bridgeComposeToast.classList.add('open');
    dom.bridgeComposeInput.focus();
  });

  // Compose toast: close
  dom.bridgeComposeClose.addEventListener('click', closeBridgeCompose);

  // Compose textarea: enable/disable send button
  dom.bridgeComposeInput.addEventListener('input', () => {
    dom.bridgeComposeSendBtn.disabled = !dom.bridgeComposeInput.value.trim();
  });

  dom.bridgeComposeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBridgeNote(); }
    if (e.key === 'Escape') closeBridgeCompose();
  });

  dom.bridgeComposeSendBtn.addEventListener('click', sendBridgeNote);

  // R4: Upgrade modal events
  dom.upgradeDismissBtn.addEventListener('click', () => hideModal(dom.upgradeModal));
  dom.upgradeStartTrialBtn.addEventListener('click', () => {
    // Placeholder — link to payment flow when available
    showToast('Trial sign-up coming soon!');
  });
  dom.upgradeModal.addEventListener('click', (e) => {
    if (e.target === dom.upgradeModal) hideModal(dom.upgradeModal);
  });

  // R5: Create persona modal
  dom.createPersonaBtn.addEventListener('click', () => {
    dom.personaNameInput.value = '';
    dom.personaDescInput.value = '';
    dom.personaPromptInput.value = '';
    clearError(dom.personaCreateError);
    showModal(dom.createPersonaModal);
  });

  dom.cancelPersonaBtn.addEventListener('click', () => hideModal(dom.createPersonaModal));
  dom.createPersonaModal.addEventListener('click', (e) => {
    if (e.target === dom.createPersonaModal) hideModal(dom.createPersonaModal);
  });

  dom.savePersonaBtn.addEventListener('click', async () => {
    clearError(dom.personaCreateError);
    const name = dom.personaNameInput.value.trim();
    const description = dom.personaDescInput.value.trim();
    const systemPromptValue = dom.personaPromptInput.value.trim();

    // Step 1: Guard review
    const check = reviewPersona({ name, systemPrompt: systemPromptValue, description });
    if (!check.ok) {
      showError(dom.personaCreateError, check.message);
      return;
    }

    // Step 2: Compose guarded system prompt
    const composedPrompt = guardCompose(systemPromptValue);

    // Step 3: Build persona object
    const persona = {
      id: 'custom-' + Date.now(),
      name,
      description,
      systemPrompt: composedPrompt,
    };

    dom.savePersonaBtn.disabled = true;
    dom.savePersonaBtn.textContent = 'Saving…';
    try {
      await savePersona(persona, cryptoAdapter);
      showToast(OFFLOAD_NOTICE);
      hideModal(dom.createPersonaModal);
      renderSavedPersonas();
    } catch (err) {
      showError(dom.personaCreateError, `Save failed: ${err.message}`);
    } finally {
      dom.savePersonaBtn.disabled = false;
      dom.savePersonaBtn.textContent = 'Save Buddy';
    }
  });

  // Phase 5: Agent Studio & Fleet Drawer Events
  async function refreshFleetUI() {
    const agents = await loadFleetAgents();
    const workflows = await loadFleetWorkflows();
    renderFleetDrawerList(
      dom.fleetDrawerBody,
      agents,
      workflows,
      async (workflowToRun) => {
        showToast(`⚡ Starting Cloud Workflow: ${workflowToRun.name}…`);
        try {
          const res = await executeCloudWorkflow({
            workflowSpec: workflowToRun,
            sessionKey: state.sessionKey,
            onStatusUpdate: (up) => showToast(`☁️ ${up.message}`),
          });
          showToast(`✅ Workflow '${workflowToRun.name}' Finished!`);
        } catch (err) {
          showToast(`❌ Cloud Execution Error: ${err.message}`);
        }
      },
      (agentToEdit) => {
        dom.studioAgentName.value = agentToEdit.name || '';
        dom.studioAgentDesc.value = agentToEdit.description || '';
        dom.studioAgentPrompt.value = agentToEdit.systemPrompt || '';
        showModal(dom.agentStudioModal);
      }
    );
  }

  dom.agentStudioBtn?.addEventListener('click', () => {
    dom.fleetDrawer.classList.add('open');
    refreshFleetUI();
  });

  dom.fleetDrawerCloseBtn?.addEventListener('click', () => {
    dom.fleetDrawer.classList.remove('open');
  });

  dom.studioModalCancelBtn?.addEventListener('click', () => {
    hideModal(dom.agentStudioModal);
  });

  dom.studioModalSaveBtn?.addEventListener('click', async () => {
    const name = dom.studioAgentName.value.trim();
    const description = dom.studioAgentDesc.value.trim();
    const systemPrompt = dom.studioAgentPrompt.value.trim();

    if (!name || !systemPrompt) {
      showError(dom.studioModalError, 'Name and system instructions are required.');
      return;
    }

    try {
      await saveFleetAgent({
        id: `agent_${Date.now()}`,
        name,
        description,
        systemPrompt,
        avatar: '⚡',
        capabilities: ['http_request', 'notify_user'],
      });
      showToast('⚡ Custom Agent Spec Saved!');
      hideModal(dom.agentStudioModal);
      refreshFleetUI();
    } catch (err) {
      showError(dom.studioModalError, err.message);
    }
  });

  // Phase 6: Agent & Workflow Marketplace Events
  let currentMarketCategory = 'All';

  function refreshMarketUI() {
    renderMarketplaceGrid(
      dom.marketGridBody,
      currentMarketCategory,
      dom.marketSearchInput?.value.trim() || '',
      async (itemToInstall) => {
        try {
          await installMarketplaceItem(itemToInstall);
          showToast(`🛒 Installed '${itemToInstall.name}' to your fleet!`);
          hideModal(dom.agentMarketModal);
          if (dom.fleetDrawer.classList.contains('open')) refreshFleetUI();
        } catch (err) {
          showToast(`❌ Installation Error: ${err.message}`);
        }
      }
    );
  }

  dom.agentMarketBtn?.addEventListener('click', () => {
    showModal(dom.agentMarketModal);
    refreshMarketUI();
  });

  dom.marketModalCloseBtn?.addEventListener('click', () => {
    hideModal(dom.agentMarketModal);
  });

  dom.marketSearchInput?.addEventListener('input', () => {
    refreshMarketUI();
  });

  dom.marketCategoryChips?.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    dom.marketCategoryChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentMarketCategory = chip.dataset.category || 'All';
    refreshMarketUI();
  });

  // Beta Release: Onboarding & Feedback Events
  const wizard = new OnboardingWizard({
    step1: dom.onboardingStep1,
    step2: dom.onboardingStep2,
    step3: dom.onboardingStep3,
    stepIndicator: dom.onboardingStepIndicator,
  }, {
    onComplete: () => hideModal(dom.onboardingModal),
  });

  dom.onboardDemoBtn?.addEventListener('click', () => {
    enableDemoMode();
    wizard.next();
  });

  dom.onboardSetupBtn?.addEventListener('click', () => {
    hideModal(dom.onboardingModal);
    showModal(dom.setupModal);
  });

  dom.onboardNextBtn?.addEventListener('click', () => {
    wizard.next();
  });

  dom.betaFeedbackBtn?.addEventListener('click', () => {
    showModal(dom.betaFeedbackModal);
  });

  dom.feedbackCloseBtn?.addEventListener('click', () => {
    hideModal(dom.betaFeedbackModal);
  });

  dom.feedbackExportFileBtn?.addEventListener('click', async () => {
    await exportDiagnosticsToFile(state);
    showToast('📥 Sanitized diagnostics exported to JSON file!');
  });

  dom.feedbackCopyClipboardBtn?.addEventListener('click', async () => {
    await copyDiagnosticsToClipboard(state);
    showToast('📋 Sanitized diagnostics copied to clipboard!');
  });

  // Pricing & Stripe Payment Triggers
  dom.upgradeClaimTrialBtn?.addEventListener('click', () => {
    hideModal(dom.upgradeModal);
    showModal(dom.setupModal);
  });

  dom.upgradeBYOKProBtn?.addEventListener('click', async () => {
    try {
      const checkout = await stripeCheckoutBYOKPro();
      showToast('💳 Redirecting to Stripe BYOK Pro Subscription Checkout…');
      hideModal(dom.upgradeModal);
    } catch (err) {
      showToast(`❌ Payment Error: ${err.message}`);
    }
  });

  dom.upgradeBuyCreditsBtn?.addEventListener('click', async () => {
    const pkgId = dom.creditPackageSelect?.value || 'pkg-10';
    try {
      const checkout = await stripeCheckoutCreditPackage(pkgId);
      showToast(`💳 Redirecting to Stripe for ${checkout.package.label}…`);
      hideModal(dom.upgradeModal);
    } catch (err) {
      showToast(`❌ Payment Error: ${err.message}`);
    }
  });

  // Mandatory Safety Waiver Controller Initialization
  initSafetyWaiverModal(dom, async () => {
    hideModal(dom.safetyWaiverModal);
    showToast('✅ Safety Protocols & Legal Waiver Accepted');
    if (await shouldShowOnboarding()) {
      showModal(dom.onboardingModal);
    }
  });

  // Interactive Instructional Guide Events
  dom.guideBtn?.addEventListener('click', () => {
    showModal(dom.guideModal);
  });

  dom.guideCloseBtn?.addEventListener('click', () => {
    hideModal(dom.guideModal);
  });






  // Setup: toggle key visibility
  dom.toggleKeyVis.addEventListener('click', () => {
    const isText = dom.apiKeyInput.type === 'text';
    dom.apiKeyInput.type = isText ? 'password' : 'text';
    dom.toggleKeyVis.textContent = isText ? '👁' : '🙈';
  });

  // Setup: Save
  dom.setupSaveBtn.addEventListener('click', async () => {
    clearError(dom.setupError);
    const key        = dom.apiKeyInput.value.trim();
    const passphrase = dom.passphraseInput.value;
    const provider   = dom.providerSelect.value;
    const model      = dom.modelSelect.value;

    if (provider !== 'local' && !key) return showError(dom.setupError, 'Please enter your API key.');
    if (!passphrase) return showError(dom.setupError, 'Please choose an encryption passphrase.');
    if (passphrase.length < 8) return showError(dom.setupError, 'Passphrase must be at least 8 characters.');

    if (provider === 'local' && state.localOptions?.mode === 'fallback') {
      const modelObj = getModel(model);
      if (modelObj) {
        const verdictObj = await preflight(modelObj);
        if (verdictObj.verdict === 'block') {
          return showError(dom.setupError, verdictObj.download.reason || verdictObj.load.reason || 'Blocked by device guard.');
        } else if (verdictObj.verdict === 'warn') {
          showToast(verdictObj.download.reason || verdictObj.load.reason || 'Warning: Device resources tight.');
        }
      }
    }

    dom.setupSaveBtn.textContent = 'Encrypting...';
    dom.setupSaveBtn.disabled = true;

    try {
      await saveApiKey(key, passphrase, provider, model);
      // Clear fields immediately — key should not stay in DOM
      dom.apiKeyInput.value    = '';
      dom.passphraseInput.value = '';
      hideModal(dom.setupModal);
    } catch (err) {
      showError(dom.setupError, `Error: ${err.message}`);
    } finally {
      dom.setupSaveBtn.textContent = 'Save & Connect';
      dom.setupSaveBtn.disabled = false;
    }
  });

  // Setup: Access ID Tester Bypass
  if (dom.accessIdBypassBtn) {
    dom.accessIdBypassBtn.addEventListener('click', async () => {
      const code = prompt('Enter your Access ID for Tester Bypass:', 'TESTER_PASS');
      if (code) {
        await activateAccessIdBypass(code);
      }
    });
  }

  // Setup: Demo mode
  dom.setupSkipBtn.addEventListener('click', () => {
    enableDemoMode();
    hideModal(dom.setupModal);
  });

  // Unlock modal
  dom.unlockBtn.addEventListener('click', async () => {
    clearError(dom.unlockError);
    const passphrase = dom.unlockPassphrase.value;
    if (!passphrase) return showError(dom.unlockError, 'Please enter your passphrase.');

    dom.unlockBtn.textContent = 'Unlocking...';
    dom.unlockBtn.disabled = true;

    try {
      await unlockApiKey(passphrase);
      dom.unlockPassphrase.value = '';
      hideModal(dom.unlockModal);
    } catch {
      showError(dom.unlockError, 'Wrong passphrase — try again, or click "Forgot" to re-enter your key.');
    } finally {
      dom.unlockBtn.textContent = 'Unlock';
      dom.unlockBtn.disabled = false;
    }
  });

  dom.unlockPassphrase.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.unlockBtn.click();
  });

  dom.unlockForgotBtn.addEventListener('click', () => {
    hideModal(dom.unlockModal);
    showModal(dom.setupModal);
  });

  if (dom.unlockAccessIdBtn) {
    dom.unlockAccessIdBtn.addEventListener('click', async () => {
      const code = prompt('Enter your Access ID for Tester Bypass:', 'TESTER_PASS');
      if (code) {
        await activateAccessIdBypass(code);
      }
    });
  }

  // Oracle clue button
  dom.oracleClueBtn.addEventListener('click', () => {
    const today = getTodaysRiddle();
    if (oracleCluesAsked >= today.clues.length) {
      dom.oracleClueBtn.textContent = 'No more clues!';
      dom.oracleClueBtn.disabled = true;
      return;
    }
    const clue = today.clues[oracleCluesAsked++];
    const clueEl = document.createElement('div');
    clueEl.className = 'oracle-clue-item';
    clueEl.innerHTML = `
      <div class="oracle-clue-num">Clue ${oracleCluesAsked}</div>
      <div class="oracle-clue-text">${clue}</div>
    `;
    // Remove hint text if present
    dom.oracleClues.querySelector('.oracle-clue-hint')?.remove();
    dom.oracleClues.appendChild(clueEl);

    if (oracleCluesAsked >= today.clues.length) {
      dom.oracleClueBtn.textContent = 'Final clue shown';
      dom.oracleClueBtn.disabled = true;
    }
  });

  // Oracle submit
  dom.oracleSubmitBtn.addEventListener('click', () => {
    const answer = dom.oracleAnswerInput.value.trim().toLowerCase();
    const today  = getTodaysRiddle();
    if (!answer) return;

    if (answer === today.answer.toLowerCase()) {
      dom.oracleAnswerInput.value = '';
      const win = document.createElement('div');
      win.style.cssText = 'padding:1.5rem;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:1rem;text-align:center;animation:fadeUp 0.4s ease';
      win.innerHTML = `<div style="font-size:2rem;margin-bottom:0.5rem">🏆</div><strong style="color:#10b981">You got it!</strong><p style="font-size:0.85rem;color:var(--text-muted);margin-top:0.5rem">Answer: <em>${today.answer}</em><br>You solved today's Oracle with ${oracleCluesAsked} clue(s).</p>`;
      dom.oracleClues.appendChild(win);
      dom.oracleSubmitBtn.disabled = true;
      dom.oracleClueBtn.disabled   = true;
    } else {
      dom.oracleAnswerInput.style.borderColor = 'rgba(239,68,68,0.5)';
      setTimeout(() => { dom.oracleAnswerInput.style.borderColor = ''; }, 1500);
    }
  });

  dom.oracleAnswerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') dom.oracleSubmitBtn.click();
  });

  // PWA installation prompt
  if (dom.installBtn) {
    dom.installBtn.addEventListener('click', async () => {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        showToast('Thank you for installing Hey Buddy!');
      }
    });
  }

  // Clear API key on page unload — key lives in memory only
  window.addEventListener('beforeunload', () => {
    state.apiKeyDecrypted = null;
  });
}

// ── Toast Notification Utility ────────────────────────────────
let activeToast = null;

function showToast(msg) {
  if (activeToast) {
    activeToast.remove();
  }
  const toast = document.createElement('div');
  activeToast = toast;
  toast.className = 'toast-notification';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translate(-50%, 10px);
    opacity: 0;
    background: rgba(15, 18, 32, 0.95);
    color: #fff;
    padding: 0.75rem 1.5rem;
    border-radius: 2rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.85rem;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s ease;
  `;
  document.body.appendChild(toast);
  
  // Force a reflow
  toast.offsetHeight;
  
  // Fade in
  toast.style.opacity = '1';
  toast.style.transform = 'translate(-50%, 0)';
  
  setTimeout(() => {
    if (activeToast === toast) {
      activeToast = null;
    }
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── R5: Saved Personas List ───────────────────────────────────
async function renderSavedPersonas() {
  const list = listPersonas(); // [{id, updatedAt}]
  if (!dom.savedPersonasList) return;

  if (!list.length) {
    dom.savedPersonasList.innerHTML = `<p style="font-size:0.8rem;color:var(--text-faint);margin-bottom:0.75rem;">No custom buddies yet.</p>`;
    return;
  }

  dom.savedPersonasList.innerHTML = '';
  for (const entry of list) {
    let displayName = entry.id;
    try {
      const persona = await loadPersona(entry.id, cryptoAdapter);
      displayName = persona?.name || entry.id;
    } catch { /* keep id as fallback */ }

    const row = document.createElement('div');
    row.className = 'saved-persona-row';
    row.innerHTML = `
      <span class="saved-persona-name">🎭 ${escapeHtml(displayName)}</span>
      <div class="saved-persona-actions">
        <button class="btn-persona-export" data-id="${entry.id}">Export</button>
        <button class="btn-persona-delete" data-id="${entry.id}">Delete</button>
      </div>
    `;

    row.querySelector('.btn-persona-export').addEventListener('click', async () => {
      try {
        const blob = await exportPersona(entry.id, cryptoAdapter);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hey-buddy-persona-${entry.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast(`Export failed: ${err.message}`);
      }
    });

    row.querySelector('.btn-persona-delete').addEventListener('click', async () => {
      if (!confirm('Delete this buddy? This cannot be undone.')) return;
      deletePersona(entry.id);
      renderSavedPersonas();
    });

    dom.savedPersonasList.appendChild(row);
  }
}

// ── Hunt ──────────────────────────────────────────────────────
async function initHunt() {
  // Tab switching
  dom.chatTabBtn.addEventListener('click', () => switchView('chat'));
  dom.huntTabBtn.addEventListener('click', () => switchView('hunt'));

  // Leaderboard
  dom.leaderboardBtn.addEventListener('click', showLeaderboard);
  dom.leaderboardCloseBtn.addEventListener('click', () => hideModal(dom.leaderboardModal));
  dom.leaderboardModal.addEventListener('click', (e) => {
    if (e.target === dom.leaderboardModal) hideModal(dom.leaderboardModal);
  });

  // Park Moment
  dom.parkMomentDismiss.addEventListener('click', () => { dom.parkMomentNudge.hidden = true; });
  dom.parkMomentSayHi.addEventListener('click', () => {
    dom.parkMomentNudge.hidden = true;
    showToast('👋 Wave sent! Keep hunting together.');
  });

  // Enable park moment by default (opt-out)
  if (localStorage.getItem('hb_park_moment_v1') === null) {
    localStorage.setItem('hb_park_moment_v1', 'true');
  }
}

function switchView(view) {
  const isHunt = view === 'hunt';
  dom.huntView.hidden      = !isHunt;
  dom.messagesArea.hidden  = isHunt;
  dom.oracleGame.hidden    = true;
  dom.inputArea.hidden     = isHunt;
  dom.chatTabBtn.classList.toggle('active', !isHunt);
  dom.huntTabBtn.classList.toggle('active', isHunt);
  if (isHunt) renderHunt();
}

async function renderHunt() {
  const waypoints = generateDailyHunt();

  // Update points badge
  dom.huntPointsBadge.textContent = `${getTodayPoints()} pts today`;

  // Render map
  let coords = null;
  try { coords = await getPlayerLocation(); } catch { coords = null; }
  const mapCoords = coords || DEMO_COORDS;
  const mapWaypoints = waypoints.map((w, i) => ({
    ...w,
    lat: DEMO_WAYPOINTS[i]?.lat || (mapCoords.lat + (i * 0.002)),
    lon: DEMO_WAYPOINTS[i]?.lon || (mapCoords.lon + (i * 0.002)),
  }));
  renderOSMMap('huntMapContainer', mapCoords.lat, mapCoords.lon, mapWaypoints);

  // Render waypoint cards
  dom.waypointList.innerHTML = waypoints.map((w, i) => {
    const done   = isCompleted(w.id);
    const mapW   = mapWaypoints[i];
    const nearby = coords ? isNearWaypoint(coords, mapW) : false;
    return `
      <div class="waypoint-card ${done ? 'completed' : nearby ? 'active' : ''}" data-id="${w.id}">
        <span class="waypoint-emoji">${w.emoji}</span>
        <div class="waypoint-info">
          <div class="waypoint-name">${w.name}</div>
          <div class="waypoint-clue">${done ? '✅ Completed!' : w.clue}</div>
          <span class="waypoint-method">${w.checkInMethod === 'gps' ? '📍 GPS' : '📷 QR'}</span>
          <button class="checkin-btn ${done ? 'done' : ''}" data-id="${w.id}" ${done ? 'disabled' : ''}>
            ${done ? '✅ Checked in!' : nearby ? 'Check In 📍' : '📍 Get Closer'}
          </button>
        </div>
      </div>`;
  }).join('');

  // Wire check-in buttons
  dom.waypointList.querySelectorAll('.checkin-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id      = btn.dataset.id;
      const waypoint = waypoints.find(w => w.id === id);
      if (!waypoint) return;
      // Demo: always allow check-in; production would verify GPS/QR
      checkIn(id, waypoint.checkInMethod);
      const pts = waypoint.checkInMethod === 'qr' ? 15 : 10;
      showToast(`📍 Checked in at ${waypoint.name}! +${pts} pts`);
      await renderHunt();

      // Park Moment demo: 30% chance of nearby player after check-in
      if (isParkMomentEnabled() && Math.random() < 0.3) {
        const moment = simulateParkMoment();
        if (moment.nearby) triggerParkMoment(moment);
      }
    });
  });
}

function triggerParkMoment({ player, distanceM }) {
  dom.parkMomentName.textContent = player.name;
  dom.parkMomentDist.textContent = `${distanceM}m`;
  dom.parkMomentNudge.hidden = false;
  setTimeout(() => { dom.parkMomentNudge.hidden = true; }, 12_000);
}

function showLeaderboard() {
  const board = getLeaderboard();
  dom.leaderboardRows.innerHTML = board.map(p => `
    <div class="leaderboard-row ${p.isCurrentPlayer ? 'current-player' : ''}">
      <span class="lb-rank">${p.rank <= 3 ? ['🥇','🥈','🥉'][p.rank - 1] : p.rank}</span>
      <span class="lb-name">${p.name}</span>
      <span class="lb-pts">${p.points} pts</span>
      <span class="lb-badge">${p.badge || ''}</span>
    </div>`).join('');

  dom.prizeSection.innerHTML = PRIZE_TIERS.map(t =>
    `<div class="prize-row">${t.emoji} <strong>${t.reward}</strong></div>`
  ).join('');

  showModal(dom.leaderboardModal);
}

// ── Boot ─────────────────────────────────────────────────────
init().catch(console.error);
