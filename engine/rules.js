// rules.js: tolerant accessors over rules.json and stack.json records.
// Records vary in shape: a leaf may be wrapped ({ v, s, basis }), bare, or the string "unknown".
// Everything here is pure: no DOM, no storage, no clock.

export const PROGRAMMES = ['KF', 'AVIOS', 'AM'];
export const CASH_CURRENCIES = ['cashback', 'stockback', 'cash'];
export const WEAK_BASES = ['blog_only', 'inferred'];

/** Unwrap a researched leaf: { v: x } gives x, a bare value gives itself. */
export function unwrap(x) {
  if (x && typeof x === 'object' && !Array.isArray(x) && 'v' in x) return x.v;
  return x;
}

/** True when a leaf is missing or flagged unknown. */
export function isUnknown(x) {
  const v = unwrap(x);
  return v === undefined || v === null || v === 'unknown';
}

/** Unwrap and replace unknown or missing with a default. */
export function val(x, def = null) {
  const v = unwrap(x);
  return v === undefined || v === null || v === 'unknown' ? def : v;
}

/** Unwrap to a finite number, else the default. */
export function num(x, def = null) {
  const v = unwrap(x);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && v !== 'unknown' && Number.isFinite(Number(v))) return Number(v);
  return def;
}

/** Unwrap to an array (a single value becomes a one-item array, null becomes empty). */
export function list(x) {
  const v = unwrap(x);
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === 'unknown') return [];
  return [v];
}

/** Provenance tag on a leaf, if any. */
export function basisOf(x) {
  return x && typeof x === 'object' && !Array.isArray(x) ? x.basis || null : null;
}

export function isWeak(x) {
  return WEAK_BASES.includes(basisOf(x));
}

/** Plain-string form of a name entry (string or { name }). */
export function nameOf(entry) {
  if (entry === null || entry === undefined) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') return String(unwrap(entry.name) ?? unwrap(entry.brand) ?? unwrap(entry.what) ?? '');
  return String(entry);
}

// ---------- dates ----------

function iso(x) {
  const v = unwrap(x);
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}

/** Inclusive window check on ISO date strings; null bounds are open. */
export function inWindow(from, to, today) {
  const f = iso(from);
  const t = iso(to);
  if (f && today < f) return false;
  if (t && today > t) return false;
  return true;
}

export function daysBetween(a, b) {
  const pa = String(a).slice(0, 10).split('-').map(Number);
  const pb = String(b).slice(0, 10).split('-').map(Number);
  const ta = Date.UTC(pa[0], pa[1] - 1, pa[2]);
  const tb = Date.UTC(pb[0], pb[1] - 1, pb[2]);
  return Math.round((tb - ta) / 86400000);
}

// ---------- records ----------

export function getCardRules(rules, id) {
  const cards = rules && rules.cards;
  if (!cards) return null;
  if (Array.isArray(cards)) return cards.find((c) => c && c.id === id) || null;
  return cards[id] || null;
}

export function stackCards(stack) {
  return (stack && Array.isArray(stack.cards) ? stack.cards : []).filter(Boolean);
}

export function normaliseNetwork(n) {
  const s = String(unwrap(n) ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  if (s.includes('amex') || s.includes('americanexpress')) return 'amex';
  if (s.includes('master')) return 'mastercard';
  if (s.includes('visa')) return 'visa';
  if (s.includes('unionpay')) return 'unionpay';
  if (s.includes('jcb')) return 'jcb';
  return s;
}

export function cardNetwork(card, stackCard) {
  return normaliseNetwork(stackCard && stackCard.network) || normaliseNetwork(card && card.network);
}

export function isActive(rec) {
  if (!rec) return false;
  const s = String(unwrap(rec.status) ?? 'active').toLowerCase();
  return s === 'active';
}

export function normaliseMode(m) {
  return String(unwrap(m) ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
}

/**
 * The earn block in force: the reward-mode block when the card has modes, else the card-level block.
 * Returns { mode, modeFallback, currency, earn, caps, conversion, exclusions, gates }.
 */
export function activeBlock(card, stackCard) {
  const modes = card && card.reward && card.reward.modes;
  let mode = null;
  let modeFallback = false;
  let b = null;
  if (modes && modes.byMode && typeof modes.byMode === 'object') {
    const keys = Object.keys(modes.byMode);
    const wanted = normaliseMode(stackCard && stackCard.rewardMode);
    if (wanted) {
      mode = keys.find((k) => normaliseMode(k) === wanted) || keys.find((k) => normaliseMode(k).includes(wanted)) || null;
    }
    if (!mode) {
      const def = normaliseMode(modes.defaultMode);
      mode = keys.find((k) => normaliseMode(k) === def) || keys[0] || null;
      modeFallback = true;
    }
    b = modes.byMode[mode] || null;
  }
  const cardGates = list(card && card.gates);
  const modeGates = list(b && b.gates);
  return {
    mode,
    modeFallback,
    currency: String(unwrap((b && b.currency) ?? (card && card.reward && card.reward.currency)) ?? 'points').toLowerCase(),
    earn: (b && b.earn) || (card && card.earn) || null,
    caps: list((b && b.caps) ?? (card && card.caps)),
    conversion: (b && b.conversion) || (card && card.conversion) || null,
    exclusions: (b && b.exclusions) || (card && card.exclusions) || {},
    gates: [...cardGates, ...modeGates],
  };
}

export function isCashCurrency(currency) {
  return CASH_CURRENCIES.includes(String(currency || '').toLowerCase());
}

// ---------- MCC helpers ----------

export function mccNumber(m) {
  const s = String(unwrap(m) ?? '').trim();
  return /^\d{4}$/.test(s) ? Number(s) : null;
}

/** MCC membership in a list of codes and a list of [lo, hi] ranges. */
export function mccInSet(mcc, codes, ranges) {
  const n = mccNumber(mcc);
  if (n === null) return false;
  for (const c of list(codes)) if (mccNumber(c) === n) return true;
  for (const r of list(ranges)) {
    const pair = list(r);
    if (pair.length >= 2) {
      const lo = mccNumber(pair[0]);
      const hi = mccNumber(pair[1]);
      if (lo !== null && hi !== null && n >= lo && n <= hi) return true;
    }
  }
  return false;
}

// ---------- name matching ----------

/** Lower-case, strip punctuation to single spaces. */
export function normName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Whole-word containment of b in a (both normalised). */
export function wordContains(a, b) {
  if (!a || !b) return false;
  return (' ' + a + ' ').includes(' ' + b + ' ');
}

/**
 * Descriptor pattern match (statement descriptor exclusions). Whole-word, case-insensitive,
 * trailing "*" means prefix, parenthetical notes are ignored.
 */
export function descriptorMatches(descriptor, pattern) {
  let p = String(pattern ?? '').replace(/\([^)]*\)/g, ' ').trim().toUpperCase();
  const prefix = p.endsWith('*');
  if (prefix) p = p.slice(0, -1).trim();
  if (!p) return false;
  const d = String(descriptor ?? '').toUpperCase();
  let from = 0;
  for (;;) {
    const i = d.indexOf(p, from);
    if (i < 0) return false;
    const before = i === 0 || !/[A-Z0-9]/.test(d[i - 1]);
    const j = i + p.length;
    const after = prefix || j >= d.length || !/[A-Z0-9]/.test(d[j]);
    if (before && after) return true;
    from = i + 1;
  }
}

// ---------- caps ----------

/**
 * Caps in force on a date. A cap that another cap lists in `supersedes` drops out while the
 * superseding cap is in force.
 */
export function effectiveCaps(caps, today) {
  const live = list(caps).filter((c) => c && inWindow(c.effectiveFrom, c.effectiveTo, today));
  const superseded = new Set(live.map((c) => unwrap(c.supersedes)).filter(Boolean));
  return live.filter((c) => !superseded.has(c.id));
}

export function isDated(rec) {
  return !!(iso(rec && rec.effectiveFrom) || iso(rec && rec.effectiveTo));
}

export function tierInWindow(tier, today) {
  const p = tier && tier.promo;
  return inWindow(tier.effectiveFrom, tier.effectiveTo, today) && (!p || inWindow(p.from, p.to, today));
}

// ---------- layers ----------

export function layerRecord(rules, id) {
  return (rules && rules.layers && rules.layers[id]) || null;
}

/** Per-programme conversion info: { available, milesPerPoint, basis } */
export function programmeInfo(conversion, p) {
  const rec = conversion && conversion.programmes && conversion.programmes[p];
  if (!rec) return { available: false, milesPerPoint: null, basis: null };
  const mpp = num(rec.milesPerPoint, null);
  const availRaw = unwrap(rec.available);
  const available = availRaw === false ? false : mpp !== null && mpp > 0;
  return { available, milesPerPoint: available ? mpp : null, basis: basisOf(rec.milesPerPoint) };
}

// ---------- audit (rules viewer and tests) ----------

/**
 * Per card audit: stale verification, ended promos and unresolved (unknown rate) tiers.
 * Returns { [cardId]: { verified, daysSinceVerified, stale, endedPromos, unresolved, inactive } }
 */
export function auditRules(rules, stack, today) {
  const out = {};
  const ids = new Set();
  if (rules && rules.cards) {
    if (Array.isArray(rules.cards)) rules.cards.forEach((c) => c && ids.add(c.id));
    else Object.keys(rules.cards).forEach((k) => ids.add(k));
  }
  for (const id of ids) {
    const card = getCardRules(rules, id);
    const sc = stackCards(stack).find((c) => c.id === id) || null;
    const verified = iso(card && card.validity && card.validity.verified);
    const days = verified ? daysBetween(verified, today) : null;
    const blocks = [];
    const modes = card && card.reward && card.reward.modes;
    if (modes && modes.byMode) Object.entries(modes.byMode).forEach(([k, b]) => blocks.push({ mode: k, earn: b.earn, caps: b.caps }));
    else blocks.push({ mode: null, earn: card && card.earn, caps: card && card.caps });
    const endedPromos = [];
    const unresolved = [];
    for (const b of blocks) {
      for (const t of list(b.earn && b.earn.tiers)) {
        const to = iso(t.effectiveTo) || iso(t.promo && t.promo.to);
        if (to && to < today) endedPromos.push({ kind: 'tier', id: t.id, mode: b.mode, to });
        if (isUnknown(t.points)) unresolved.push({ tierId: t.id, mode: b.mode, field: 'points' });
      }
      for (const c of list(b.caps)) {
        const to = iso(c.effectiveTo);
        if (to && to < today) endedPromos.push({ kind: 'cap', id: c.id, mode: b.mode, to });
      }
    }
    out[id] = {
      verified,
      daysSinceVerified: days,
      stale: days === null ? true : days > 90,
      endedPromos,
      unresolved,
      inactive: !isActive(card) || (sc ? !isActive(sc) : false),
    };
  }
  return out;
}
