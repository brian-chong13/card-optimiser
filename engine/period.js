// period.js: cycle boundaries, toggle definitions and period-aware toggle lookups.
// Pure: today is always passed in as an ISO date string.

import { unwrap, val, num, list, activeBlock, effectiveCaps, inWindow, tierInWindow, normaliseMode } from './rules.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toISO(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(isoDate, n) {
  const { y, m, d } = parts(isoDate);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** "6 Nov" style label for UI reset hints. */
export function shortDate(isoDate) {
  if (!isoDate) return '';
  const { m, d } = parts(isoDate);
  return `${d} ${MONTH_NAMES[m - 1]}`;
}

/** Quarter start months from free text such as "Quarters start 1 Jan, 1 Apr, 1 Jul, 1 Oct". */
export function parseQuarterMonths(text) {
  if (!text || typeof text !== 'string') return [1, 4, 7, 10];
  const found = [];
  const re = /\b(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/gi;
  let m;
  while ((m = re.exec(text))) {
    const idx = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (idx && !found.includes(idx)) found.push(idx);
  }
  return found.length ? found.sort((a, b) => a - b) : [1, 4, 7, 10];
}

/** Period options for a stack card. */
export function periodOpts(stackCard) {
  const sd = stackCard && Number.isFinite(Number(stackCard.statementDay)) ? Number(stackCard.statementDay) : null;
  const text = stackCard && typeof stackCard.approved === 'string' ? stackCard.approved : '';
  return {
    statementDay: sd && sd >= 1 && sd <= 31 ? sd : null,
    quarterStartMonths: parseQuarterMonths(text),
  };
}

function statementDate(y, m, sd) {
  return toISO(y, m, Math.min(sd, daysInMonth(y, m)));
}

/**
 * Start date (ISO) of the period containing `today`, or null for periods that never reset.
 * statement_month: the day after the most recent statement day before today. A statement dated
 * the 5th closes the cycle on the 5th, so the cycle starts on the 6th and today = the 5th still
 * belongs to the cycle that began on the 6th of the previous month.
 */
export function periodStart(period, opts, today) {
  const p = String(unwrap(period) ?? 'none');
  const { y, m } = parts(today);
  if (p === 'calendar_month') return toISO(y, m, 1);
  if (p === 'statement_month') {
    const sd = opts && opts.statementDay;
    if (!sd) return toISO(y, m, 1);
    let stmt = statementDate(y, m, sd);
    if (!(stmt < today)) {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      stmt = statementDate(py, pm, sd);
    }
    return addDays(stmt, 1);
  }
  if (p === 'membership_quarter') {
    const months = (opts && opts.quarterStartMonths && opts.quarterStartMonths.length ? opts.quarterStartMonths : [1, 4, 7, 10]).slice().sort((a, b) => a - b);
    const le = months.filter((x) => x <= m);
    if (le.length) return toISO(y, le[le.length - 1], 1);
    return toISO(y - 1, months[months.length - 1], 1);
  }
  return null;
}

/** Start of the next period (when a toggle resets), or null. */
export function nextPeriodStart(period, opts, today) {
  const p = String(unwrap(period) ?? 'none');
  const cur = periodStart(p, opts, today);
  if (!cur) return null;
  const { y, m } = parts(cur);
  if (p === 'calendar_month') return m === 12 ? toISO(y + 1, 1, 1) : toISO(y, m + 1, 1);
  if (p === 'statement_month') {
    const sd = opts && opts.statementDay;
    if (!sd) return m === 12 ? toISO(y + 1, 1, 1) : toISO(y, m + 1, 1);
    // cur is the day after a statement day; the next statement is one month later.
    const prevStmt = addDays(cur, -1);
    const ps = parts(prevStmt);
    const ny = ps.m === 12 ? ps.y + 1 : ps.y;
    const nm = ps.m === 12 ? 1 : ps.m + 1;
    return addDays(statementDate(ny, nm, sd), 1);
  }
  if (p === 'membership_quarter') {
    const months = (opts && opts.quarterStartMonths && opts.quarterStartMonths.length ? opts.quarterStartMonths : [1, 4, 7, 10]).slice().sort((a, b) => a - b);
    const gt = months.filter((x) => x > m);
    return gt.length ? toISO(y, gt[0], 1) : toISO(y + 1, months[0], 1);
  }
  return null;
}

// ---------- toggle definitions ----------

function periodFor(unlock, stackCard) {
  const p = val(unlock && unlock.period, null);
  if (p) return String(p);
  const type = unwrap(unlock && unlock.type);
  if (type === 'linked_id') return 'none';
  if (type === 'min_spend_each_month_of_quarter') return 'membership_quarter';
  const reset = String((stackCard && stackCard.resetText) || '').toLowerCase();
  if (reset.includes('statement') && type !== 'balance') return 'statement_month';
  return 'calendar_month';
}

/** Plain-English label for an unlock or gate. */
export function unlockLabel(u) {
  const type = String(unwrap(u && u.type) ?? '');
  const toggle = String(unwrap(u && u.toggle) ?? '');
  if (type === 'min_spend') return 'Minimum spend met';
  if (type === 'min_spend_each_month_of_quarter') return 'Minimum spend met every month this quarter';
  if (type === 'merchant_count') {
    const c = num(u.count, null);
    return c ? `${c} merchants used` : 'Merchant count met';
  }
  if (type === 'balance') return 'Balance condition met';
  if (type === 'linked_id') return /yuu/i.test(toggle + ' ' + String((u && u.what) || '')) ? 'yuu ID linked' : 'Account linked';
  return toggle || 'Condition met';
}

function unlockDetail(u) {
  const type = String(unwrap(u && u.type) ?? '');
  const amt = num(u && u.amount, null);
  if ((type === 'min_spend' || type === 'min_spend_each_month_of_quarter') && amt !== null) return `S$${amt.toLocaleString('en-SG')}`;
  if (type === 'balance' && amt !== null) return `S$${amt.toLocaleString('en-SG')}${u.account ? ' in ' + String(u.account).split(',')[0] : ''}`;
  return '';
}

/** Build a toggle definition for an unlock or gate record. */
export function unlockToggleDef(u, kind, stackCard, today) {
  const key = String(unwrap(u.toggle));
  const period = kind === 'gate' && !val(u.period, null) ? 'calendar_month' : periodFor(u, stackCard);
  const opts = periodOpts(stackCard);
  const d = unwrap(u.default);
  return {
    key,
    kind,
    type: String(unwrap(u.type) ?? ''),
    label: unlockLabel(u),
    detail: unlockDetail(u),
    period,
    periodOpts: opts,
    periodStart: periodStart(period, opts, today),
    nextReset: nextPeriodStart(period, opts, today),
    default: d === true || d === false ? d : null,
  };
}

/**
 * Every toggle for a card on `today`: unlock and gate toggles (key, label, period, default) and
 * caps (key `cap:<id>`, label "Cap probably used", default "plenty").
 */
export function toggleDefs(card, stackCard, today) {
  const block = activeBlock(card, stackCard);
  const map = new Map();
  for (const g of block.gates) {
    if (!g || !unwrap(g.toggle) || !inWindow(g.effectiveFrom, g.effectiveTo, today)) continue;
    const def = unlockToggleDef(g, 'gate', stackCard, today);
    if (!map.has(def.key)) map.set(def.key, { ...def, tierIds: [] });
  }
  const mode = normaliseMode(stackCard && stackCard.rewardMode);
  for (const t of list(block.earn && block.earn.tiers)) {
    if (!t || !tierInWindow(t, today)) continue;
    for (const u of list(t.unlock)) {
      if (!u || !unwrap(u.toggle) || !inWindow(u.effectiveFrom, u.effectiveTo, today)) continue;
      if (unwrap(u.type) === 'mode' && mode && normaliseMode(u.mode) !== mode) continue;
      const def = unlockToggleDef(u, 'unlock', stackCard, today);
      const existing = map.get(def.key);
      if (existing) existing.tierIds.push(t.id);
      else map.set(def.key, { ...def, tierIds: [t.id] });
    }
  }
  const opts = periodOpts(stackCard);
  for (const c of effectiveCaps(block.caps, today)) {
    if (!c || !c.id) continue;
    const period = String(val(c.period, 'none'));
    map.set('cap:' + c.id, {
      key: 'cap:' + c.id,
      kind: 'cap',
      type: 'cap',
      capId: c.id,
      label: 'Cap probably used',
      detail: '',
      period,
      periodOpts: opts,
      periodStart: periodStart(period, opts, today),
      nextReset: nextPeriodStart(period, opts, today),
      default: 'plenty',
      tierIds: list(c.tiers).slice(),
    });
  }
  return [...map.values()];
}

/**
 * Stored toggle value if (and only if) it was stored in the current period; otherwise the rule
 * default. Returns true, false or null (unset). `def` is a toggle definition from toggleDefs.
 */
export function currentValue(deviceState, cardId, key, def, today) {
  const stored = deviceState && deviceState.toggles && deviceState.toggles[cardId] && deviceState.toggles[cardId][key];
  const dflt = def && (def.default === true || def.default === false) ? def.default : null;
  if (!stored || (stored.value !== true && stored.value !== false)) return dflt;
  const cur = def ? (def.periodStart !== undefined ? def.periodStart : periodStart(def.period, def.periodOpts, today)) : null;
  const sp = stored.periodStart === undefined ? null : stored.periodStart;
  return sp === cur ? stored.value : dflt;
}

/** Stored cap state if it belongs to the current period, else { state: "plenty" }. */
export function currentCapState(deviceState, cardId, capId, def, today) {
  const stored = deviceState && deviceState.capState && deviceState.capState[cardId] && deviceState.capState[cardId][capId];
  const plenty = { state: 'plenty', roomSgd: null };
  if (!stored || !['plenty', 'room', 'used'].includes(stored.state)) return plenty;
  const cur = def ? (def.periodStart !== undefined ? def.periodStart : periodStart(def.period, def.periodOpts, today)) : null;
  const sp = stored.periodStart === undefined ? null : stored.periodStart;
  if (sp !== cur) return plenty;
  const room = Number(stored.roomSgd);
  if (stored.state === 'room') return Number.isFinite(room) && room >= 0 ? { state: 'room', roomSgd: room } : plenty;
  return { state: stored.state, roomSgd: null };
}
