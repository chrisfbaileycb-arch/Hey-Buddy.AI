/**
 * Hey Buddy — Phase 3: Hunt Map (OpenStreetMap, no API key)
 * ==========================================================
 * Lightweight map using OSM embed iframes + CSS pin overlays.
 * Gracefully degrades when location is denied or unavailable.
 */

// ── Demo / fallback data ──────────────────────────────────────
export const DEMO_COORDS = { lat: 39.7392, lon: -104.9903 }; // Denver, CO

export const DEMO_WAYPOINTS = [
  { id: 'park',             lat: 39.7484, lon: -104.9997, emoji: '🌳', name: 'The Local Park' },
  { id: 'cafe',             lat: 39.7411, lon: -104.9877, emoji: '☕', name: 'A Neighborhood Café' },
  { id: 'mural',            lat: 39.7358, lon: -104.9845, emoji: '🎨', name: 'The Street Mural' },
  { id: 'library',          lat: 39.7315, lon: -104.9950, emoji: '📚', name: 'The Public Library' },
  { id: 'community-business',lat: 39.7450, lon: -104.9975, emoji: '🏪', name: 'A Community Business' },
];

// ── Geolocation ───────────────────────────────────────────────
/**
 * Returns {lat, lon} or null if denied / unavailable.
 * Resolves (never rejects) — graceful degradation.
 */
export function getPlayerLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ()    => resolve(null),
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false }
    );
  });
}

// ── Distance math ─────────────────────────────────────────────
/**
 * Haversine formula — returns distance in metres between two lat/lon points.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the player is within thresholdM metres of the waypoint.
 */
export function isNearWaypoint(playerCoords, waypointCoords, thresholdM = 80) {
  const d = haversineDistance(
    playerCoords.lat, playerCoords.lon,
    waypointCoords.lat, waypointCoords.lon
  );
  return d <= thresholdM;
}

// ── OSM Map renderer ──────────────────────────────────────────
/**
 * Renders an OpenStreetMap embed inside containerId.
 * Overlays emoji pins for each waypoint using CSS absolute positioning.
 *
 * @param {string}  containerId - ID of the wrapping element
 * @param {number}  centerLat   - map center latitude
 * @param {number}  centerLon   - map center longitude
 * @param {Array}   waypointList - array of { id, emoji, lat, lon, name }
 */
export function renderOSMMap(containerId, centerLat, centerLon, waypointList) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Bounding box: ~1km radius around center
  const delta = 0.009; // ~1km in degrees
  const bbox = [
    centerLon - delta,
    centerLat - delta,
    centerLon + delta,
    centerLat + delta,
  ].join(',');

  const osmUrl =
    `https://www.openstreetmap.org/export/embed.html` +
    `?bbox=${bbox}` +
    `&layer=mapnik` +
    `&marker=${centerLat},${centerLon}`;

  // Build map wrapper
  container.style.position = 'relative';
  container.style.width    = '100%';
  container.style.height   = '220px';
  container.style.overflow = 'hidden';

  container.innerHTML = `
    <iframe
      src="${osmUrl}"
      style="width:100%;height:100%;border:0;"
      loading="lazy"
      title="Hunt map"
      sandbox="allow-scripts allow-same-origin"
    ></iframe>
    <div class="map-pin-layer" style="
      position:absolute;inset:0;pointer-events:none;overflow:hidden;
    "></div>
  `;

  const pinLayer = container.querySelector('.map-pin-layer');
  if (!pinLayer || !waypointList?.length) return;

  // Project lat/lon to pixel offsets within the iframe
  const mapW = container.offsetWidth  || 360;
  const mapH = 220;

  const latMin = centerLat - delta;
  const latMax = centerLat + delta;
  const lonMin = centerLon - delta;
  const lonMax = centerLon + delta;

  waypointList.forEach((wp) => {
    if (wp.lat == null || wp.lon == null) return;

    // Simple linear projection (good enough for ~1km scale)
    const xPct = ((wp.lon - lonMin) / (lonMax - lonMin)) * 100;
    const yPct = ((latMax - wp.lat) / (latMax - latMin)) * 100; // y flipped

    // Clamp to visible area with padding
    if (xPct < 5 || xPct > 95 || yPct < 5 || yPct > 95) return;

    const pin = document.createElement('div');
    pin.className = 'map-pin';
    pin.dataset.id = wp.id;
    pin.title = wp.name || wp.id;
    pin.style.cssText = `
      position: absolute;
      left: ${xPct}%;
      top: ${yPct}%;
      transform: translate(-50%, -100%);
      font-size: 22px;
      line-height: 1;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
      pointer-events: auto;
      cursor: default;
      user-select: none;
      z-index: 10;
    `;
    pin.textContent = wp.emoji || '📍';
    pinLayer.appendChild(pin);
  });
}
