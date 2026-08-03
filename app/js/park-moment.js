/**
 * Hey Buddy — Phase 3: Park Moment
 * =================================
 * Opt-in social proximity feature. Detects nearby players
 * and surfaces a non-intrusive nudge to say hi.
 * Uses haversineDistance from hunt-map.js.
 */

import { haversineDistance } from './hunt-map.js';

// ── localStorage key ──────────────────────────────────────────
const PARK_MOMENT_KEY = 'hb_park_moment_v1';

// ── Settings ──────────────────────────────────────────────────
export function isParkMomentEnabled() {
  try {
    return localStorage.getItem(PARK_MOMENT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setParkMomentEnabled(bool) {
  try {
    localStorage.setItem(PARK_MOMENT_KEY, bool ? 'true' : 'false');
  } catch { /* quota issues — silently ignore */ }
}

// ── Demo nearby player ────────────────────────────────────────
export const DEMO_NEARBY_PLAYER = {
  name: 'Alex',
  distance: 47,
  emoji: '👋',
};

// ── Core proximity check ──────────────────────────────────────
/**
 * Checks if a nearby player is within 100 metres.
 * @param {{ lat: number, lon: number }} playerCoords
 * @param {{ lat: number, lon: number }} nearbyPlayerCoords
 * @returns {{ nearby: boolean, player: object, distanceM: number }}
 */
export function checkParkMoment(playerCoords, nearbyPlayerCoords) {
  const THRESHOLD_M = 100;
  const distanceM = Math.round(
    haversineDistance(
      playerCoords.lat, playerCoords.lon,
      nearbyPlayerCoords.lat, nearbyPlayerCoords.lon
    )
  );
  return {
    nearby: distanceM <= THRESHOLD_M,
    player: DEMO_NEARBY_PLAYER,
    distanceM,
  };
}

// ── Simulation (demo / testing) ───────────────────────────────
/**
 * Returns a mock nearby-player event for demo purposes.
 * @returns {{ nearby: boolean, player: object, distanceM: number }}
 */
export function simulateParkMoment() {
  return {
    nearby: true,
    player: DEMO_NEARBY_PLAYER,
    distanceM: DEMO_NEARBY_PLAYER.distance,
  };
}
