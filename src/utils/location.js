// src/utils/location.js
// Smart Geolocation helpers (offline-first)

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Normalize a location object to a stable shape.
 * - Accepts {lat,lng} or {latitude,longitude}
 * - Returns { lat, lng } rounded to 6 decimals, or null if invalid.
 */
export function normalizeLatLng(loc) {
  const o = loc && typeof loc === "object" ? loc : null;
  if (!o) return null;

  const lat = Number(o.lat ?? o.latitude);
  const lng = Number(o.lng ?? o.lon ?? o.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat: round6(lat), lng: round6(lng) };
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance in meters.
 */
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1);
  const o1 = Number(lng1);
  const a2 = Number(lat2);
  const o2 = Number(lng2);

  if (![a1, o1, a2, o2].every((x) => Number.isFinite(x))) return Number.POSITIVE_INFINITY;

  const R = 6371000; // meters
  const dLat = toRad(a2 - a1);
  const dLng = toRad(o2 - o1);
  const s1 = toRad(a1);
  const s2 = toRad(a2);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aa = sinDLat * sinDLat + Math.cos(s1) * Math.cos(s2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
}

/**
 * Find the closest known merchant location within a radius.
 *
 * merchantsData: Array of
 *   { merchant: string, location: {lat,lng}, categoryId?: string, accountId?: string, updatedAt?: number }
 */
export function findNearbyMerchant(currentLat, currentLng, merchantsData, { maxDistanceM = 80 } = {}) {
  const lat = Number(currentLat);
  const lng = Number(currentLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const list = Array.isArray(merchantsData) ? merchantsData : [];

  let best = null;
  let bestD = Number.POSITIVE_INFINITY;

  for (const it of list) {
    const merchant = String(it?.merchant || "").trim();
    if (!merchant) continue;

    const loc = normalizeLatLng(it?.location || it);
    if (!loc) continue;

    const d = haversineDistanceMeters(lat, lng, loc.lat, loc.lng);
    if (!Number.isFinite(d)) continue;
    if (d > maxDistanceM) continue;

    // Prefer nearer; tie-breaker: more recent
    if (
      d < bestD ||
      (Math.abs(d - bestD) < 0.01 && Number(it?.updatedAt || 0) > Number(best?.updatedAt || 0))
    ) {
      bestD = d;
      best = {
        merchant,
        distanceM: d,
        location: loc,
        categoryId: it?.categoryId ? String(it.categoryId) : "",
        accountId: it?.accountId ? String(it.accountId) : "",
        updatedAt: Number(it?.updatedAt || 0) || 0,
      };
    }
  }

  return best;
}
