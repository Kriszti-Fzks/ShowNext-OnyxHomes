import React, { useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// ERROR BOUNDARY (Onyx only)
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  componentDidCatch(error) {
    this.setState({ error: error.message + '\n' + error.stack });
  }
  render() {
    if (this.state.error)
      return (
        <div
          style={{
            background: '#1a0000',
            color: '#ff6666',
            padding: 24,
            fontFamily: 'monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
            height: '100vh',
          }}
        >
          <strong>CRASH — copy this and share it:</strong>{'\n\n'}{this.state.error}
        </div>
      );
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const RENTCAST_KEY = '3e3426c07ce44160b258e3862f8fcdd7'; // Onyx key
const SUPABASE_URL = 'https://iuuhvostbnybioegwmvl.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1dWh2b3N0Ym55YmlvZWd3bXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzM0MjgsImV4cCI6MjA4OTI0OTQyOH0.KG0HBqHza2eVaLWgw2uIoAEeTLlqDbyIM7Sm-OM4htk';
const RENTCAST_HEADERS = { 'X-Api-Key': RENTCAST_KEY };

// ---------------------------------------------------------------------------
// SUPABASE HELPERS
// ---------------------------------------------------------------------------
async function sbSelect(table, cols, filters, single = false) {
  const params = new URLSearchParams({ select: cols });
  if (filters)
    Object.entries(filters).forEach(([k, v]) => params.set(k, 'eq.' + v));
  if (single) params.set('limit', '1');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    },
  });
  const d = await r.json();
  if (!r.ok) return { data: null, error: d };
  return {
    data: single ? (Array.isArray(d) && d.length > 0 ? d[0] : null) : d,
    error: null,
  };
}

async function sbInsert(table, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const d = await r.json();
  return {
    data: r.ok ? (Array.isArray(d) ? d[0] : d) : null,
    error: r.ok ? null : d,
  };
}

async function sbUpdate(table, row, col, val) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${col}=eq.${encodeURIComponent(val)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row),
    }
  );
  return { error: r.ok ? null : await r.json() };
}

async function sbSelectOrdered(table, cols, filterCol, filterVal, orderCol, ascending, limit) {
  const dir = ascending ? 'asc' : 'desc';
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=${cols}&${filterCol}=eq.${encodeURIComponent(
      filterVal
    )}&order=${orderCol}.${dir}&limit=${limit}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
    }
  );
  const d = await r.json();
  return { data: r.ok ? d : null, error: r.ok ? null : d };
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function fmt$(v) {
  if (!v && v !== 0) return 'N/A';
  return '$' + Number(v).toLocaleString();
}

function fmtNum(v) {
  if (!v && v !== 0) return 'N/A';
  return Number(v).toLocaleString();
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Onyx-specific: normalize address string for URL slug building
function normAddr(s) {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Onyx-specific: routes comps to onyxhomes.com instead of Zillow
function buildListingUrl(comp) {
  if (!comp)
    return 'https://www.onyxhomes.com/property-search/results/?searchtype=3&searchid=3458534';
  try {
    const street = comp.addressLine1 || comp.address || comp.streetAddress || comp.street || '';
    const city = comp.city || '';
    const state = comp.state || '';
    const zip = comp.zipCode || comp.zip || comp.postalCode || '';
    const mls = comp.listingId || comp.mlsId || comp.mls || comp.mlsNumber || '';
    const slugParts = [street, city, state, zip].map((p) => normAddr(p)).filter(Boolean);
    const slug = slugParts.join('-');
    if (mls && slug) {
      return 'https://www.onyxhomes.com/property-search/detail/10/' + mls + '/' + slug + '/';
    }
    if (slug) {
      return (
        'https://www.onyxhomes.com/property-search/results/?searchtype=2&q=' +
        encodeURIComponent([street, city, state, zip].filter(Boolean).join(' '))
      );
    }
    return 'https://www.onyxhomes.com/property-search/results/?searchtype=3&searchid=3458534';
  } catch (e) {
    return 'https://www.onyxhomes.com/property-search/results/?searchtype=3&searchid=3458534';
  }
}

function typeCompatible(a, b) {
  const t = ['condo', 'condominium', 'townhouse', 'townhome'];
  const aL = (a || '').toLowerCase();
  const bL = (b || '').toLowerCase();
  return (
    (t.some((x) => aL.includes(x)) && t.some((x) => bL.includes(x))) ||
    aL === bL
  );
}

async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buildAddress(prop) {
  return [prop.addressLine1, prop.city, prop.state, prop.zipCode]
    .filter(Boolean)
    .join(', ');
}

// Returns the best open house date string from a comp, or null if none
function getOpenHouseDate(comp) {
  if (comp.openHouseDate) return comp.openHouseDate;
  if (comp.openHouseDates && comp.openHouseDates.length > 0) return comp.openHouseDates[0];
  return null;
}

// Returns 'now' | 'today' | 'upcoming' | null
function openHouseStatus(comp) {
  const raw = getOpenHouseDate(comp);
  if (!raw) return null;
  const now = new Date();
  const ohDate = new Date(raw);
  if (isNaN(ohDate)) return null;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  // Check if it's happening right now (within a 3-hour window of the listed time)
  const diffMs = ohDate - now;
  if (diffMs >= -3 * 60 * 60 * 1000 && diffMs <= 3 * 60 * 60 * 1000) return 'now';
  if (ohDate >= todayStart && ohDate < todayEnd) return 'today';
  if (ohDate > now) return 'upcoming';
  return null;
}

function formatOpenHouseLabel(comp) {
  const raw = getOpenHouseDate(comp);
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric',
    ...(d.getMinutes() > 0 || d.getHours() > 0 ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

// ---------------------------------------------------------------------------
// SCORING
// ---------------------------------------------------------------------------

// FIXED (from generic): strict exact bedroom match — no ±1 or ±2 tolerance.
// This prevents loosely-matched comps from neighboring cities sneaking through.
function scoreComp(subject, comp, distMiles, maxRadius) {
  let d = 0;
  if ((comp.bedrooms || 0) !== (subject.bedrooms || 0)) return null;
  const sp = subject._displayPrice;
  const cp = comp.price || comp.listPrice;
  if (sp && cp) d += Math.min(30, (Math.abs(cp - sp) / sp) * 60);
  else d += 15;
  if (subject.squareFootage && comp.squareFootage)
    d += Math.min(
      20,
      (Math.abs(comp.squareFootage - subject.squareFootage) / subject.squareFootage) * 40
    );
  else d += 10;
  d += Math.min(distMiles / maxRadius, 1) * 10;
  return Math.max(0, Math.round(100 - d));
}

function scoreLabel(score) {
  if (score >= 85) return { label: 'Very Strong', color: '#c8a96e' }; // Onyx gold
  if (score >= 70) return { label: 'Strong', color: '#84cc16' };
  if (score >= 55) return { label: 'Good', color: '#eab308' };
  if (score >= 40) return { label: 'Fair', color: '#f97316' };
  return { label: 'Loose', color: '#ef4444' };
}

function keyDiffs(subject, comp) {
  const diffs = [];
  const sp = subject._displayPrice;
  const cp = comp.price || comp.listPrice;
  if (sp && cp) {
    const diff = cp - sp;
    const pct = ((diff / sp) * 100).toFixed(0);
    diffs.push(
      Math.abs(Number(pct)) < 3
        ? 'Similar price'
        : `${diff > 0 ? '+' : ''}${fmt$(diff)} (${pct}%)`
    );
  }
  if (subject.squareFootage && comp.squareFootage) {
    const diff = comp.squareFootage - subject.squareFootage;
    const pct = ((Math.abs(diff) / subject.squareFootage) * 100).toFixed(0);
    diffs.push(
      Math.abs(Number(pct)) < 4
        ? 'Similar size'
        : `${diff > 0 ? '+' : ''}${fmtNum(diff)} sqft (${pct}% ${diff > 0 ? 'larger' : 'smaller'})`
    );
  }
  return diffs.slice(0, 2);
}

function talkingPoints(subject, comp) {
  const pts = [];
  const bedDiff = Math.abs((comp.bedrooms || 0) - (subject.bedrooms || 0));
  if (bedDiff === 0) pts.push(`Same bedroom count (${comp.bedrooms} bed)`);
  else pts.push(`${comp.bedrooms} bed vs ${subject.bedrooms} bed`);
  const sp = subject._displayPrice;
  const cp = comp.price || comp.listPrice;
  if (sp && cp) {
    const diff = cp - sp;
    const pct = ((diff / sp) * 100).toFixed(1);
    pts.push(
      Math.abs(diff) < 10000
        ? 'Nearly identical price'
        : `${diff > 0 ? '+' : ''}${fmt$(diff)} (${pct}%)`
    );
  }
  if (subject.squareFootage && comp.squareFootage) {
    const diff = comp.squareFootage - subject.squareFootage;
    const pct = ((Math.abs(diff) / subject.squareFootage) * 100).toFixed(0);
    pts.push(
      Math.abs(Number(pct)) < 5
        ? 'Very similar sqft'
        : `${diff > 0 ? '+' : ''}${fmtNum(diff)} sqft (${pct}%)`
    );
  }
  return pts;
}

function shortAnalysis(subject, comp, score) {
  const { label } = scoreLabel(score);
  const bedMatch = (comp.bedrooms || 0) === (subject.bedrooms || 0);
  const sp = subject._displayPrice;
  const cp = comp.price || comp.listPrice;
  const pDiff = sp && cp ? Math.abs(cp - sp) / sp : null;
  const sDiff =
    subject.squareFootage && comp.squareFootage
      ? Math.abs(comp.squareFootage - subject.squareFootage) / subject.squareFootage
      : null;
  let t = `${label} comparable. `;
  t += bedMatch ? 'Matches on bedroom count. ' : 'Different bedroom count. ';
  if (pDiff !== null)
    t +=
      pDiff < 0.05
        ? 'Price very close. '
        : pDiff < 0.15
        ? 'Price reasonably aligned. '
        : 'Price gap may need explanation. ';
  if (sDiff !== null)
    t += sDiff < 0.1 ? 'Size well-matched.' : 'Note size difference.';
  return t;
}

// ---------------------------------------------------------------------------
// API CALLS
// ---------------------------------------------------------------------------
const RADIUS_OPTIONS = [3, 5, 10, 15, 25];
const DEFAULT_RADIUS = 10;

// FIXED (from generic): try listings API first so we always get propertyType,
// bedrooms, and price from a full Rentcast record. The old Onyx version went
// straight to the properties API and fell back to Nominatim (which returns
// ONLY lat/lon — no propertyType), breaking typeCompatible and scoreComp.
async function fetchSubjectProperty(address) {
  // Step 1: listings API — returns full record including propertyType & price
  const cleanedAddress = address.replace(/#/g, '').replace(/\s+/g, ' ').trim();
  const listingRes = await fetch(
    `https://api.rentcast.io/v1/listings/sale?address=${encodeURIComponent(cleanedAddress)}&status=Active&limit=1`,
    { headers: RENTCAST_HEADERS }
  );
  if (listingRes.ok) {
    const listingData = await listingRes.json();
    if (Array.isArray(listingData) && listingData.length > 0) {
      return { ...listingData[0], _isActiveListing: true };
    }
  }

  // Step 2: properties API — still returns propertyType and bedrooms
  const res = await fetch(
    `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}&limit=1`,
    { headers: RENTCAST_HEADERS }
  );
  if (res.ok) {
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data[0];
  }

  // Step 3: city/area search via Rentcast — keeps us inside Rentcast so we
  // still get propertyType on any matching record. Avoids Nominatim fallback
  // which stripped all property metadata and caused the neighboring-city bleed.
  const cleanCity = address.trim().replace(/,?\s*CA$/i, '').trim();
  const cityRes = await fetch(
    `https://api.rentcast.io/v1/listings/sale?city=${encodeURIComponent(cleanCity)}&state=CA&limit=1`,
    { headers: RENTCAST_HEADERS }
  );
  const cityData = await cityRes.json();
  if (cityRes.ok && Array.isArray(cityData) && cityData.length > 0 && cityData[0].latitude) {
    return { latitude: cityData[0].latitude, longitude: cityData[0].longitude };
  }

  throw new Error('Location not found. Try typing just the city name, e.g. "Irvine"');
}

// Onyx-specific: separate listing price lookup (kept from Onyx — useful when
// subject is active and fetchSubjectProperty hit the properties API fallback)
async function fetchSubjectListingPrice(address) {
  try {
    const res = await fetch(
      `https://api.rentcast.io/v1/listings/sale?address=${encodeURIComponent(address)}&limit=1`,
      { headers: RENTCAST_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].price)
      return { price: data[0].price, label: 'List Price' };
  } catch (_) {}
  return null;
}

// Onyx-specific: AVM estimate as third price source
async function fetchAVMPrice(address) {
  try {
    const res = await fetch(
      `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`,
      { headers: RENTCAST_HEADERS }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.price) return { price: data.price, label: 'Est. Value' };
  } catch (_) {}
  return null;
}

async function fetchActiveListings(lat, lng, radius) {
  const base = `https://api.rentcast.io/v1/listings/sale?latitude=${lat}&longitude=${lng}&radius=${radius}&status=Active&limit=500`;
  const [cR, tR, sfR] = await Promise.all([
    fetch(base + '&propertyType=Condo', { headers: RENTCAST_HEADERS }),
    fetch(base + '&propertyType=Townhouse', { headers: RENTCAST_HEADERS }),
    fetch(base + '&propertyType=Single%20Family', { headers: RENTCAST_HEADERS }),
  ]);
  const [cD, tD, sfD] = await Promise.all([
    cR.ok ? cR.json() : [],
    tR.ok ? tR.json() : [],
    sfR.ok ? sfR.json() : [],
  ]);
  const all = [...(cD || []), ...(tD || []), ...(sfD || [])];
  const seen = new Set();
  return all.filter((p) => {
    const k = p.id || p.addressLine1 + p.zipCode;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// FIXED (from generic): prioritise same-city results. Only spills into
// neighboring cities if fewer than 5 same-city matches are found.
function findSimilarHomes(subject, listings, radius, centerLat, centerLng, centerCity) {
  centerLat = centerLat ?? subject.latitude;
  centerLng = centerLng ?? subject.longitude;
  const usingAltLocation = centerLat !== subject.latitude || centerLng !== subject.longitude;
  const subjectCity = (subject.city || '').toLowerCase();
  // centerCity: the target alt city name in lowercase, passed in from handleSearch

  const sameCityResults = [];
  const otherResults = [];

  for (const comp of listings) {
    if (!comp.latitude || !comp.longitude) continue;

    // distToSubject only used to detect and skip the subject property itself
    const distToSubject = haversine(
      subject.latitude,
      subject.longitude,
      comp.latitude,
      comp.longitude
    );
    if (distToSubject < 0.02) continue; // skip the subject itself

    if (!typeCompatible(subject.propertyType, comp.propertyType)) continue;

    // Always enforce radius against the search center (alt city or subject).
    // Previously skipped when usingAltLocation — that let all of CA through.
    const distToCenter = haversine(centerLat, centerLng, comp.latitude, comp.longitude);
    if (distToCenter > radius) continue;

    // Score by distToCenter so proximity to Newport Beach (not Irvine) is rewarded
    const score = scoreComp(subject, comp, distToCenter, radius);
    if (score === null) continue;

    const compCity = (comp.city || '').toLowerCase();
    // When using alt location, treat the alt city as the "same city" priority bucket
    const targetCity = usingAltLocation
      ? centerCity
      : subjectCity;

    if (targetCity && compCity === targetCity) {
      sameCityResults.push({ ...comp, _dist: distToCenter, _score: score });
    } else {
      otherResults.push({ ...comp, _dist: distToCenter, _score: score });
    }
  }

  sameCityResults.sort((a, b) => b._score - a._score);
  otherResults.sort((a, b) => b._score - a._score);

  // Prioritise target-city results; pad with neighbors only if fewer than 5
  const combined =
    sameCityResults.length >= 5
      ? sameCityResults.slice(0, 10)
      : [...sameCityResults, ...otherResults].slice(0, 10);
  return combined;
}

// ---------------------------------------------------------------------------
// SUBJECT PROPERTY CARD  (Onyx branding)
// ---------------------------------------------------------------------------
function SubjectCard({ subject }) {
  const [expanded, setExpanded] = useState(false);
  const addr = buildAddress(subject);
  const url = buildListingUrl(subject);
  const price = subject._displayPrice;
  return (
    <div
      style={{
        marginBottom: 12,
        background: '#3d2a0f',
        border: '2px solid #c8a96e',
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span
              style={{
                background: '#c8a96e',
                color: '#fff',
                padding: '2px 10px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              ★ SUBJECT
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#c8a96e', fontWeight: 700, fontSize: 15, textDecoration: 'underline', wordBreak: 'break-word' }}
            >
              {addr}
            </a>
          </div>
          <span style={{ color: '#64748b', fontSize: 16, userSelect: 'none', flexShrink: 0 }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {price != null ? (
            <span style={{ color: '#c8a96e', fontWeight: 800, fontSize: 17 }}>
              {fmt$(price)}
              <span style={{ color: '#86efac', fontSize: 11, marginLeft: 6, fontWeight: 400 }}>
                ({subject._displayPriceLabel})
              </span>
            </span>
          ) : (
            <span style={{ color: '#64748b', fontSize: 14 }}>Price unavailable</span>
          )}
          <span style={{ color: '#86efac', fontSize: 14 }}>
            {subject.bedrooms ?? '?'} bd · {subject.bathrooms ?? '?'} ba
            {subject.squareFootage ? ` · ${fmtNum(subject.squareFootage)} sqft` : ''}
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid #5a3e1b', padding: '14px 16px', background: '#3d2a0f' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {subject.propertyType && (
              <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
                {subject.propertyType}
              </span>
            )}
            {subject.lastSaleDate && (
              <span style={{ background: '#111111', color: '#94a3b8', padding: '3px 10px', borderRadius: 20, fontSize: 11 }}>
                Sold{' '}
                {new Date(subject.lastSaleDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMP CARD  (Onyx branding)
// ---------------------------------------------------------------------------
function CompCard({ comp, subject, index, isSelected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const { label, color } = scoreLabel(comp._score);
  const addr = buildAddress(comp);
  const url = buildListingUrl(comp);
  const diffs = keyDiffs(subject, comp);
  const points = talkingPoints(subject, comp);
  const analysis = shortAnalysis(subject, comp, comp._score);
  const compPrice = comp.price || comp.listPrice;
  const ohStatus = openHouseStatus(comp);
  const ohLabel = formatOpenHouseLabel(comp);
  return (
    <div
      style={{
        marginBottom: 12,
        background: isSelected ? '#1a1a1a' : '#0a0a0a',
        border: `2px solid ${isSelected ? '#111111' : expanded ? '#333333' : '#1e1e1e'}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(index)}
              onClick={(e) => e.stopPropagation()}
              style={{ accentColor: '#c8a96e', width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }}
            />
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, textDecoration: 'underline', wordBreak: 'break-word' }}
            >
              {addr}
            </a>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <span
              style={{
                background: color + '22',
                color,
                border: `1px solid ${color}66`,
                padding: '3px 10px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {comp._score} · {label}
            </span>
            <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 10px', borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap' }}>
              {comp._dist.toFixed(1)} mi
            </span>
            <span style={{ color: '#64748b', fontSize: 16, userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ color: '#f0fdf4', fontWeight: 800, fontSize: 17 }}>{fmt$(compPrice)}</span>
          <span style={{ color: '#94a3b8', fontSize: 14 }}>
            {comp.bedrooms ?? '?'} bd · {comp.bathrooms ?? '?'} ba
            {comp.squareFootage ? ` · ${fmtNum(comp.squareFootage)} sqft` : ''}
          </span>
        </div>
        {diffs.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {diffs.map((d, i) => (
              <span key={i} style={{ background: '#1a1a1a', color: '#94a3b8', padding: '3px 10px', borderRadius: 8, fontSize: 12, border: '1px solid #333333' }}>
                {d}
              </span>
            ))}
          </div>
        )}
        {/* MLS number + open house — always visible on collapsed card */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {comp.listingId && (
            <span style={{ background: '#3d2a0f', color: '#c8a96e', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
              MLS# {comp.listingId}
            </span>
          )}
          {ohStatus === 'now' && (
            <span style={{ background: '#14532d', color: '#4ade80', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid #16a34a', animation: 'pulse 2s infinite' }}>
              🟢 Open House NOW
            </span>
          )}
          {ohStatus === 'today' && (
            <span style={{ background: '#1a2f1a', color: '#86efac', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid #166534' }}>
              🏡 Open Today · {ohLabel}
            </span>
          )}
          {ohStatus === 'upcoming' && (
            <span style={{ background: '#111111', color: '#94a3b8', padding: '3px 10px', borderRadius: 20, fontSize: 11, border: '1px solid #333333' }}>
              🏡 Open {ohLabel}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid #1e1e1e', padding: '14px 16px', background: '#111111' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {comp.propertyType && (
              <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
                {comp.propertyType}
              </span>
            )}
            {comp.daysOnMarket != null && (
              <span style={{ background: '#222222', color: '#c4b5fd', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
                DOM: {comp.daysOnMarket}
              </span>
            )}
            {comp.listingId && (
              <span style={{ background: '#3d2a0f', color: '#c8a96e', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
                MLS# {comp.listingId}
              </span>
            )}
            {comp.listingAgent?.name && (
              <span style={{ background: '#1a2535', color: '#94a3b8', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
                🏠 {comp.listingAgent.name}
              </span>
            )}
            {comp.listingAgent?.phone && (
              <a
                href={`tel:${comp.listingAgent.phone}`}
                style={{ background: '#1a2535', color: '#7dd3fc', padding: '3px 10px', borderRadius: 20, fontSize: 12, textDecoration: 'none' }}
              >
                📞 {comp.listingAgent.phone}
              </a>
            )}
            {ohStatus && (
              <span style={{
                background: ohStatus === 'now' ? '#14532d' : '#1a2f1a',
                color: ohStatus === 'now' ? '#4ade80' : '#c8a96e',
                padding: '3px 10px', borderRadius: 20, fontSize: 12,
                border: ohStatus === 'now' ? '1px solid #16a34a' : 'none',
                fontWeight: ohStatus === 'now' ? 700 : 400,
              }}>
                {ohStatus === 'now' ? '🟢 Open House NOW' : `🏡 Open: ${ohLabel}`}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {points.map((pt, j) => (
              <span key={j} style={{ background: '#0a0a0a', color: '#7dd3fc', padding: '3px 10px', borderRadius: 8, fontSize: 12, border: '1px solid #1e1e1e' }}>
                {pt}
              </span>
            ))}
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>{analysis}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AUTH SCREEN  (Onyx branding)
// ---------------------------------------------------------------------------
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleRegister(e) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) { setError('All fields are required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const pwHash = await hashPassword(password);
      const { data: existArr } = await sbSelect('users', 'user_id', { email: email.trim().toLowerCase() });
      if (existArr && existArr.length > 0) { setError('An account with this email already exists.'); setLoading(false); return; }
      await sbInsert('users', { full_name: fullName.trim(), email: email.trim().toLowerCase(), password_hash: pwHash, search_count: 0, search_limit: 20 });
      setSuccess('Account created! You can now sign in.');
      setMode('login'); setFullName(''); setPassword('');
    } catch (err) { setError(err.message || 'Registration failed.'); }
    setLoading(false);
  }

  async function handleLogin(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    try {
      const pwHash = await hashPassword(password);
      const { data: loginResults } = await sbSelect('users', '*', { email: email.trim().toLowerCase() });
      const data = loginResults && loginResults.length > 0 ? loginResults.find((u) => u.password_hash === pwHash) || null : null;
      if (!data) { setError('Invalid email or password.'); setLoading(false); return; }
      onLogin(data);
    } catch (err) { console.error(err); setError('Login failed. Please try again.'); }
    setLoading(false);
  }

  const inp = { width: '100%', padding: '11px 14px', background: '#1e1e1e', border: '1.5px solid #333333', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 1 };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#ffffff' }}>ShowNext</h1>
        <p style={{ margin: '0', color: '#c8a96e', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>for Onyx Homes</p>
        <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>Find similar active listings in seconds</p>
      </div>
      <div style={{ background: '#111111', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', gap: 0, marginBottom: 22, background: '#0a0a0a', borderRadius: 10, padding: 3 }}>
          {['login', 'register'].map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(''); setSuccess(''); }}
              style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 8, background: mode === m ? '#1e1e1e' : 'transparent', color: mode === m ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all .2s' }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>
        {error && <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 14 }}>⚠️ {error}</div>}
        {success && <div style={{ background: '#052e16', border: '1px solid #5a3e1b', borderRadius: 8, padding: '10px 14px', color: '#86efac', fontSize: 13, marginBottom: 14 }}>✓ {success}</div>}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          {mode === 'register' && (
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Full Name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" style={inp} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@example.com" style={inp} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inp} />
          </div>
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? '#1a1a1a' : 'linear-gradient(90deg,#c8a96e,#a07840)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign In →' : 'Create Free Account →')}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#333333' }}>
          Test limit: 20 searches · Track your comp searches · Free during beta
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DASHBOARD  (Onyx branding)
// ---------------------------------------------------------------------------
function Dashboard({ user, onBack }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    sbSelectOrdered('search_logs', '*', 'user_id', user.user_id, 'timestamp', false, 50).then(
      ({ data }) => { setLogs(data || []); setLoading(false); }
    );
  }, [user.user_id]);
  const used = user.search_count;
  const limit = user.search_limit;
  const pct = Math.round((used / limit) * 100);
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: 'linear-gradient(135deg,#1a1a1a,#000000)', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#ffffff' }}>My Dashboard</h1>
          <p style={{ margin: '3px 0 0', color: '#c8a96e', fontSize: 13 }}>Welcome, {user.full_name}</p>
        </div>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#000000', border: '1px solid #333333', borderRadius: 8, color: '#ffffff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ← Search
        </button>
      </div>
      <div style={{ maxWidth: 700, margin: '24px auto', padding: '0 16px' }}>
        <div style={{ background: '#111111', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #1e1e1e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0' }}>Searches Used</span>
            <span style={{ fontWeight: 800, fontSize: 20, color: used >= limit ? '#ef4444' : '#c8a96e' }}>{used} / {limit}</span>
          </div>
          <div style={{ background: '#1e1e1e', borderRadius: 99, height: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: pct + '%', background: used >= limit ? 'linear-gradient(90deg,#dc2626,#ef4444)' : 'linear-gradient(90deg,#c8a96e,#a07840)', borderRadius: 99, transition: 'width .4s' }} />
          </div>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 12 }}>{limit - used} search{limit - used !== 1 ? 'es' : ''} remaining</p>
        </div>
        <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: '#c8a96e' }}>Search History</h2>
        {loading && <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>}
        {!loading && logs.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>No searches yet. Go find some comps!</p>}
        {logs.map((log, i) => (
          <div key={i} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: '12px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f0' }}>{log.address_searched}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                {new Date(log.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <span style={{ background: '#1e3a5f', color: '#93c5fd', padding: '3px 10px', borderRadius: 20, fontSize: 12, whiteSpace: 'nowrap' }}>
              {log.api_calls_used} API calls
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('search');
  const [query, setQuery] = useState('');
  const [altLocation, setAltLocation] = useState('');
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [subject, setSubject] = useState(null);
  const [comps, setComps] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function refreshUser(userId) {
    const { data: userData } = await sbSelect('users', '*', { user_id: userId }, true);
    if (userData) setUser(userData);
    return userData;
  }

  function handleLogin(userData) { setUser(userData); setView('search'); }

  function handleLogout() {
    setUser(null); setView('search'); setSubject(null); setComps([]); setSelected(new Set());
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!user) return;
    const searchAddress = query.trim();
    if (!searchAddress) return;
    const freshUser = await refreshUser(user.user_id);
    if (freshUser.search_count >= freshUser.search_limit) {
      setError('Test limit reached. You have used your ' + freshUser.search_limit + ' searches.');
      return;
    }
    setLoading(true); setError(''); setComps([]); setSelected(new Set()); setSubject(null);
    let apiCallsUsed = 0;
    try {
      setLoadingMsg('Looking up subject property…');
      let subjectProp = await fetchSubjectProperty(searchAddress);
      apiCallsUsed++;

      // Onyx price resolution pipeline: listing price → AVM → last sale → raw price
      setLoadingMsg('Fetching property value…');
      let displayPrice, displayPriceLabel;

      if (subjectProp._isActiveListing) {
        // Already have the price from the listings API hit in fetchSubjectProperty
        displayPrice = subjectProp.price || subjectProp.listPrice;
        displayPriceLabel = 'List Price';
      } else {
        const listingPrice = await fetchSubjectListingPrice(searchAddress);
        apiCallsUsed++;
        if (listingPrice) {
          displayPrice = listingPrice.price;
          displayPriceLabel = listingPrice.label;
        } else {
          const avm = await fetchAVMPrice(searchAddress);
          apiCallsUsed++;
          if (avm) {
            displayPrice = avm.price;
            displayPriceLabel = avm.label;
          } else if (subjectProp.lastSalePrice) {
            displayPrice = subjectProp.lastSalePrice;
            displayPriceLabel = 'Last Sale';
          } else {
            displayPrice = subjectProp.price || null;
            displayPriceLabel = 'Est. Value';
          }
        }
      }

      subjectProp = { ...subjectProp, _displayPrice: displayPrice, _displayPriceLabel: displayPriceLabel };

      let searchLat = subjectProp.latitude;
      let searchLng = subjectProp.longitude;

      let searchCenterCity = null;
      if (altLocation.trim()) {
        setLoadingMsg('Looking up search location…');
        const cleanAlt = altLocation.trim().replace(/,?\s*CA$/i, '');
        const altProp = await fetchSubjectProperty(cleanAlt + ', CA');
        apiCallsUsed++;
        searchLat = altProp.latitude;
        searchLng = altProp.longitude;
        // Extract the city name so findSimilarHomes can prioritise it
        searchCenterCity = (altProp.city || cleanAlt.split(',')[0]).trim().toLowerCase();
      }

      setSubject(subjectProp);
      setLoadingMsg('Searching for similar active sale listings…');
      const listings = await fetchActiveListings(searchLat, searchLng, radius);
      apiCallsUsed += 3;

      // Check if subject appears in the listing pool (update price if found)
      let subjectFoundInListings = listings.find((p) => {
        if (!p.latitude || !p.longitude) return false;
        return haversine(subjectProp.latitude, subjectProp.longitude, p.latitude, p.longitude) < 0.02;
      });
      if (!subjectFoundInListings) {
        try {
          const fallbackRes = await fetch(
            `https://api.rentcast.io/v1/listings/sale?address=${encodeURIComponent(searchAddress)}&status=Active&limit=1`,
            { headers: RENTCAST_HEADERS }
          );
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            if (Array.isArray(fallbackData) && fallbackData.length > 0 && fallbackData[0].price) {
              subjectFoundInListings = fallbackData[0];
            }
          }
          apiCallsUsed++;
        } catch (_) {}
      }
      if (subjectFoundInListings && (subjectFoundInListings.price || subjectFoundInListings.listPrice)) {
        subjectProp = {
          ...subjectProp,
          _displayPrice: subjectFoundInListings.price || subjectFoundInListings.listPrice,
          _displayPriceLabel: 'List Price',
        };
        setSubject(subjectProp);
      }

      const ranked = findSimilarHomes(subjectProp, listings, radius, searchLat, searchLng, searchCenterCity);
      setComps(ranked);

      await sbInsert('search_logs', { user_id: user.user_id, address_searched: searchAddress, api_calls_used: apiCallsUsed });
      await sbUpdate('users', { search_count: freshUser.search_count + 1 }, 'user_id', user.user_id);
      await refreshUser(user.user_id);

      if (ranked.length === 0) setError('No similar active listings found. Try a larger radius.');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    }
    setLoading(false); setLoadingMsg('');
  }

  function toggleSelect(id) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(comps.map((_, i) => i))); }
  function clearAll() { setSelected(new Set()); }

  const selectedComps = useMemo(() => comps.filter((_, i) => selected.has(i)), [comps, selected]);

  function buildClientMessageText() {
    if (!subject || selectedComps.length === 0) return '';
    const lines = selectedComps.map((c) => {
      const addr = buildAddress(c);
      const price = fmt$(c.price || c.listPrice);
      const beds = c.bedrooms ?? '?';
      const baths = c.bathrooms ?? '?';
      const sqft = c.squareFootage ? fmtNum(c.squareFootage) : '?';
      const url = buildListingUrl(c);
      return `• ${addr} — ${price} | ${beds} bed / ${baths} bath | ${sqft} sqft\n  ${url}`;
    }).join('\n');
    return `Hi! Here are some similar homes for sale to ${query.trim()} that I thought you'd find interesting:\n\n${lines}\n\nWould you like to tour any of these? Let me know and I'll set it up!`;
  }

  function buildClientMessageHTML() {
    if (!subject || selectedComps.length === 0) return '';
    const items = selectedComps.map((c) => {
      const addr = buildAddress(c);
      const price = fmt$(c.price || c.listPrice);
      const beds = c.bedrooms ?? '?';
      const baths = c.bathrooms ?? '?';
      const sqft = c.squareFootage ? fmtNum(c.squareFootage) : '?';
      const url = buildListingUrl(c);
      return `<li><a href="${url}">${addr}</a> — ${price} | ${beds} bed / ${baths} bath | ${sqft} sqft</li>`;
    }).join('');
    return `<p>Hi! Here are some similar homes to <a href="${buildListingUrl(subject)}">${query.trim()}</a> that I thought you'd find interesting:</p><ul>${items}</ul><p>Would you like to tour any of these? Let me know and I'll set it up!</p>`;
  }

  function copyMessage(asHtml) {
    if (asHtml) {
      const html = buildClientMessageHTML();
      const text = buildClientMessageText();
      if (!html) return;
      try {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        });
        navigator.clipboard.write([item]).then(() => { setCopied('html'); setTimeout(() => setCopied(false), 2500); });
      } catch (_) {
        navigator.clipboard.writeText(text).then(() => { setCopied('text'); setTimeout(() => setCopied(false), 2500); });
      }
    } else {
      const msg = buildClientMessageText();
      if (!msg) return;
      navigator.clipboard.writeText(msg).then(() => { setCopied('text'); setTimeout(() => setCopied(false), 2500); });
    }
  }

  if (!user) return <AuthScreen onLogin={handleLogin} />;
  if (view === 'dashboard') return <Dashboard user={user} onBack={() => setView('search')} />;

  const limitReached = user.search_count >= user.search_limit;

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e2e8f0', fontFamily: "'Inter', sans-serif" }}>

        {/* HEADER */}
        <div style={{ background: 'linear-gradient(135deg,#1a1a1a,#000000)', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#ffffff' }}>ShowNext</h1>
            <p style={{ margin: '0', color: '#c8a96e', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>for Onyx Homes</p>
            <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>Find similar active listings in seconds</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setView('dashboard')} style={{ padding: '7px 14px', background: '#000000', border: '1px solid #333333', borderRadius: 8, color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              📊 {user.search_count}/{user.search_limit} searches
            </button>
            <span style={{ color: '#c8a96e', fontSize: 13, fontWeight: 600 }}>{user.full_name}</span>
            <button onClick={handleLogout} style={{ padding: '7px 12px', background: '#111111', border: '1px solid #333333', borderRadius: 8, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 700, margin: '24px auto', padding: '0 16px' }}>
          {limitReached && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: 12, padding: '16px 20px', marginBottom: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fca5a5', marginBottom: 4 }}>🚫 Test limit reached</div>
              <p style={{ margin: 0, color: '#fca5a5', fontSize: 14 }}>You have used your {user.search_limit} searches. Contact us to get more access.</p>
            </div>
          )}

          {/* SEARCH FORM */}
          <form onSubmit={handleSearch} style={{ background: '#111111', borderRadius: 16, padding: 22, boxShadow: '0 4px 24px rgba(0,0,0,.4)', opacity: limitReached ? 0.5 : 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#ffffff', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Subject Property Address
            </label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Address" disabled={limitReached}
              style={{ width: '100%', padding: '12px 14px', background: '#1e1e1e', border: '1.5px solid #333333', borderRadius: 10, color: '#e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginTop: 14, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
              Search Comps in Different Location{' '}
              <span style={{ color: '#64748b', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
            </label>
            <input value={altLocation} onChange={(e) => setAltLocation(e.target.value)} placeholder="City, State or full address" disabled={limitReached}
              style={{ width: '100%', padding: '11px 14px', background: '#1e1e1e', border: '1.5px solid #333333', borderRadius: 10, color: '#e2e8f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            <p style={{ margin: '5px 0 0', color: '#64748b', fontSize: 11 }}>Leave blank to search near the subject property</p>

            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 1 }}>
                Search Radius
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {RADIUS_OPTIONS.map((r) => (
                  <button key={r} type="button" onClick={() => setRadius(r)} disabled={limitReached}
                    style={{ padding: '7px 16px', background: radius === r ? '#1e1e1e' : '#0a0a0a', border: radius === r ? '2px solid #c8a96e' : '2px solid #333333', borderRadius: 8, color: radius === r ? '#c8a96e' : '#94a3b8', fontSize: 13, fontWeight: radius === r ? 700 : 400, cursor: limitReached ? 'not-allowed' : 'pointer' }}>
                    {r} mi
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading || !query.trim() || limitReached}
              style={{ marginTop: 18, width: '100%', padding: '13px', background: loading ? '#1a1a1a' : limitReached ? '#111111' : 'linear-gradient(90deg,#c8a96e,#a07840)', border: limitReached ? '1px solid #333333' : 'none', borderRadius: 10, color: limitReached ? '#64748b' : '#fff', fontSize: 16, fontWeight: 700, cursor: loading || limitReached ? 'not-allowed' : 'pointer' }}>
              {loading ? loadingMsg || 'Searching…' : limitReached ? '🚫 Limit Reached' : '🔍 Find Similar Homes'}
            </button>
          </form>

          {error && !limitReached && (
            <div style={{ marginTop: 14, background: '#450a0a', border: '1px solid #991b1b', borderRadius: 10, padding: '13px 16px', color: '#fca5a5', fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {comps.length > 0 && !loading && (
            <div style={{ marginTop: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#ffffff' }}>{comps.length} Similar Active Listings</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={selectAll} style={{ padding: '5px 12px', background: '#000000', border: '1px solid #c8a96e', borderRadius: 8, color: '#c8a96e', fontSize: 12, cursor: 'pointer' }}>Select All</button>
                  <button onClick={clearAll} style={{ padding: '5px 12px', background: '#111111', border: '1px solid #333333', borderRadius: 8, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>Clear</button>
                </div>
              </div>
              <p style={{ margin: '0 0 14px', color: '#444444', fontSize: 12 }}>Tap a card to expand details · Tap address to view listing</p>
              {subject && <SubjectCard subject={subject} />}
              {comps.map((comp, i) => (
                <CompCard key={i} comp={comp} subject={subject} index={i} isSelected={selected.has(i)} onToggleSelect={toggleSelect} />
              ))}
            </div>
          )}

          {!subject && !loading && (
            <div style={{ marginTop: 32, textAlign: 'center', color: '#333333', fontSize: 13 }}>
              <p>Enter an address to find similar active listings</p>
              <p style={{ marginTop: 4 }}>Powered by Rentcast · Data updates daily</p>
            </div>
          )}
          <div style={{ height: 120 }} />
        </div>

        {/* FLOATING COPY BAR */}
        {selected.size > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'linear-gradient(90deg,#1a1a1a,#000000)', borderTop: '1px solid #c8a96e', padding: '13px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,.5)' }}>
            <span style={{ color: '#c8a96e', fontWeight: 600, fontSize: 14 }}>
              {selected.size} propert{selected.size === 1 ? 'y' : 'ies'} selected
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => copyMessage(true)}
                style={{ padding: '9px 16px', background: copied === 'html' ? '#c8a96e' : 'linear-gradient(90deg,#c8a96e,#a07840)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {copied === 'html' ? '✓ Copied!' : '✉️ Copy for Email'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
