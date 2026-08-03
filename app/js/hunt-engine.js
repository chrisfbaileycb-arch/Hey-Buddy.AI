/**
 * Hey Buddy — Phase 3: The Hunt Engine
 * =====================================
 * All state persisted to localStorage. No server needed.
 * Deterministic daily hunt via seeded Fisher-Yates shuffle.
 */

// ── Waypoint Templates ────────────────────────────────────────
export const WAYPOINT_TYPES = [
  {
    id: 'park',
    type: 'park',
    emoji: '🌳',
    name: 'The Local Park',
    clue: 'Find a patch of green where families gather and dogs roam free.',
    answerHint: 'A public park in your neighborhood',
    checkInMethod: 'gps',
  },
  {
    id: 'cafe',
    type: 'cafe',
    emoji: '☕',
    name: 'A Neighborhood Café',
    clue: 'Follow the scent of roasted beans to a cozy corner where locals linger.',
    answerHint: 'An independent coffee shop',
    checkInMethod: 'qr',
  },
  {
    id: 'mural',
    type: 'mural',
    emoji: '🎨',
    name: 'The Street Mural',
    clue: 'Look for where an artist turned a wall into a story. Colors shout from bricks.',
    answerHint: 'A public mural or street art piece',
    checkInMethod: 'gps',
  },
  {
    id: 'library',
    type: 'library',
    emoji: '📚',
    name: 'The Public Library',
    clue: 'A place where silence is golden and every shelf holds a new world.',
    answerHint: 'Your local library branch',
    checkInMethod: 'qr',
  },
  {
    id: 'community-business',
    type: 'community-business',
    emoji: '🏪',
    name: 'A Community Business',
    clue: 'A locally owned shop where the owner knows their regulars by name.',
    answerHint: 'Any locally-owned small business',
    checkInMethod: 'gps',
  },
  {
    id: 'playground',
    type: 'playground',
    emoji: '🛝',
    name: 'The Playground',
    clue: 'Where kids rule and swings still make adults feel five again.',
    answerHint: 'A public playground or play area',
    checkInMethod: 'gps',
  },
  {
    id: 'farmers-market',
    type: 'farmers-market',
    emoji: '🥕',
    name: 'The Farmers Market',
    clue: 'Bright stalls, fresh smells — find where the community shops local.',
    answerHint: 'A farmers market or community market',
    checkInMethod: 'qr',
  },
  {
    id: 'fire-station',
    type: 'fire-station',
    emoji: '🚒',
    name: 'The Fire Station',
    clue: 'Big red doors, brave hearts inside. The heroes never far from home.',
    answerHint: 'Your local fire station',
    checkInMethod: 'gps',
  },
  {
    id: 'bookshop',
    type: 'bookshop',
    emoji: '📖',
    name: 'The Independent Bookshop',
    clue: 'Shelves crammed floor to ceiling, run by someone who reads everything.',
    answerHint: 'An independent bookstore',
    checkInMethod: 'qr',
  },
  {
    id: 'garden',
    type: 'garden',
    emoji: '🌻',
    name: 'The Community Garden',
    clue: 'Rows of raised beds tended by many hands. Tomatoes, flowers, and hope.',
    answerHint: 'A community garden or botanical garden',
    checkInMethod: 'gps',
  },
];

// ── Seeded RNG (mulberry32) ───────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Deterministic daily hunt ──────────────────────────────────
export function generateDailyHunt() {
  const seed = Math.floor(Date.now() / 86_400_000); // same all day
  const rand = mulberry32(seed);

  // Fisher-Yates with seeded random
  const arr = [...WAYPOINT_TYPES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, 5);
}

// ── localStorage helpers ──────────────────────────────────────
const STORE_KEY = 'hb_hunt_v1';

function todayKey() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

export function getProgress() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { completed: new Set(), startedAt: null, totalPoints: 0, date: todayKey() };
    const obj = JSON.parse(raw);
    obj.completed = new Set(obj.completed || []);
    return obj;
  } catch {
    return { completed: new Set(), startedAt: null, totalPoints: 0, date: todayKey() };
  }
}

export function saveProgress(progress) {
  const obj = {
    ...progress,
    completed: [...progress.completed],
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}

export function resetIfNewDay() {
  const progress = getProgress();
  if (progress.date !== todayKey()) {
    saveProgress({ completed: new Set(), startedAt: null, totalPoints: 0, date: todayKey() });
  }
}

export function checkIn(waypointId, method) {
  const progress = getProgress();
  if (progress.completed.has(waypointId)) return; // already done
  progress.completed.add(waypointId);
  progress.totalPoints = (progress.totalPoints || 0) + (method === 'qr' ? 15 : 10);
  if (!progress.startedAt) progress.startedAt = Date.now();
  saveProgress(progress);
}

export function isCompleted(waypointId) {
  return getProgress().completed.has(waypointId);
}

export function getTodayPoints() {
  return getProgress().totalPoints || 0;
}

// ── Leaderboard ───────────────────────────────────────────────
export const LEADERBOARD_MOCK = [
  { rank: 1, name: 'WanderlustWendy',   points: 85, badge: '🔥' },
  { rank: 2, name: 'MapMasterMike',     points: 72, badge: '🗺️' },
  { rank: 3, name: 'StreetSageSimone',  points: 68, badge: '⚡' },
  { rank: 4, name: 'NomadNate',         points: 55, badge: '🧭' },
  { rank: 5, name: 'UrbanExplorerUma',  points: 50, badge: '🏙️' },
  { rank: 6, name: 'ClueHunterCarlos',  points: 44, badge: '🔍' },
  { rank: 7, name: 'TreasureTrekTasha', points: 38, badge: '💎' },
  { rank: 8, name: 'QuestQueenQuinn',   points: 25, badge: '👑' },
];

export function getLeaderboard() {
  const myPoints = getTodayPoints();
  if (myPoints === 0) {
    return LEADERBOARD_MOCK.map(p => ({ ...p }));
  }

  const meEntry = { name: 'You', points: myPoints, badge: '⭐', isCurrentPlayer: true };
  const board = LEADERBOARD_MOCK.map(p => ({ ...p }));

  // Find correct rank
  const insertAt = board.findIndex(p => myPoints > p.points);
  if (insertAt === -1) {
    board.push(meEntry);
    meEntry.rank = board.length;
  } else {
    board.splice(insertAt, 0, meEntry);
    meEntry.rank = insertAt + 1;
  }

  // Re-rank everyone below the inserted entry
  return board.slice(0, 10).map((p, i) => ({ ...p, rank: i + 1 }));
}

// ── Prize Tiers ───────────────────────────────────────────────
export const PRIZE_TIERS = [
  { minRank: 1,  maxRank: 1,   reward: '1st Place — Free coffee voucher',      emoji: '🥇' },
  { minRank: 2,  maxRank: 5,   reward: 'Top 5 — Hey Buddy badge',               emoji: '🥈' },
  { minRank: 6,  maxRank: 20,  reward: 'Top 20% — Community Explorer title',    emoji: '🌟' },
  { minRank: 21, maxRank: 9999,reward: 'All Finishers — Buddy Hunt badge',      emoji: '🎖️' },
];
