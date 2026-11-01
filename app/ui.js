// Shared UI helpers: DOM builder, formatting, chips, segmented controls,
// date and period helpers used by several screens.

export function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    }
  } else if (attrs !== undefined && attrs !== null) {
    kids.unshift(attrs);
  }
  append(node, kids);
  return node;
}

export function append(node, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) append(node, k);
    else if (k instanceof Node) node.appendChild(k);
    else node.appendChild(document.createTextNode(String(k)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function unwrap(x) {
  if (x && typeof x === 'object' && !Array.isArray(x) && 'v' in x) return x.v;
  return x;
}

// ---------- formatting ----------

export const PROG = { KF: 'KrisFlyer', AVIOS: 'Avios', AM: 'Asia Miles', CASH: 'equivalent' };

export function progName(code) {
  return PROG[code] || code || '';
}

export function fmtMpd(n) {
  if (n === null || n === undefined || typeof n !== 'number' || !isFinite(n)) return '-';
  if (n > 0 && n < 0.05) return '<0.1';
  return (Math.round(n * 10) / 10).toFixed(1);
}

export function sgd(n, dp) {
  if (n === null || n === undefined || typeof n !== 'number' || !isFinite(n)) return '-';
  const digits = dp === undefined ? (Number.isInteger(n) ? 0 : 2) : dp;
  const abs = Math.abs(n).toLocaleString('en-SG', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (n < 0 ? '-S$' : 'S$') + abs;
}

export function titleCase(key) {
  const s = String(key || '').replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export function networkName(n) {
  const map = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', unionpay: 'UnionPay', jcb: 'JCB' };
  return map[String(n || '').toLowerCase()] || titleCase(n);
}

// ---------- dates (ISO strings, UTC arithmetic so no daylight-saving drift) ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(dt) {
  return dt.toISOString().slice(0, 10);
}

export function isoToday(d) {
  const x = d || new Date();
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${mm}-${dd}`;
}

export function addDays(iso, n) {
  const dt = toDate(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return toIso(dt);
}

function daysInMonth(y, m0) {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

export function fmtDate(iso, withYear) {
  if (!iso) return '';
  const dt = toDate(iso);
  const base = `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
  return withYear ? `${base} ${dt.getUTCFullYear()}` : base;
}

export function daysBetween(fromIso, toIsoStr) {
  return Math.round((toDate(toIsoStr) - toDate(fromIso)) / 86400000);
}

// ---------- periods ----------

export const PERIOD_LABEL = {
  calendar_month: 'Calendar month',
  statement_month: 'Statement cycle',
  membership_quarter: 'Membership quarter',
  membership_year: 'Membership year',
  none: 'No reset',
};

export function quarterMonths(stackCard) {
  const txt = stackCard && stackCard.approved ? String(stackCard.approved) : '';
  const m = /quarters?\s+start[^.]*/i.exec(txt);
  if (m) {
    const found = [];
    const re = /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/gi;
    let x;
    while ((x = re.exec(m[0]))) found.push(MONTHS.findIndex((mo) => mo.toLowerCase() === x[1].toLowerCase()) + 1);
    if (found.length) return found.sort((a, b) => a - b);
  }
  return [1, 4, 7, 10];
}

function optsFor(app, stackCard) {
  try {
    if (typeof app.engine.periodOpts === 'function') return app.engine.periodOpts(stackCard);
  } catch (e) {
    /* fall through to local parsing */
  }
  return { statementDay: stackCard ? stackCard.statementDay ?? null : null, quarterStartMonths: quarterMonths(stackCard) };
}

export function periodStartFor(app, stackCard, period) {
  try {
    const v = app.engine.periodStart(period, optsFor(app, stackCard), app.today());
    return v === undefined ? null : v;
  } catch (e) {
    return null;
  }
}

// Date the period next resets, or null when it does not reset on a known date.
export function nextReset(app, stackCard, period) {
  try {
    if (typeof app.engine.nextPeriodStart === 'function') {
      return app.engine.nextPeriodStart(period, optsFor(app, stackCard), app.today()) || null;
    }
  } catch (e) {
    /* use the local calculation */
  }
  const today = app.today();
  const t = toDate(today);
  if (period === 'calendar_month') {
    return toIso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)));
  }
  if (period === 'statement_month') {
    const day = stackCard && stackCard.statementDay;
    const start = periodStartFor(app, stackCard, period);
    if (!day) {
      return toIso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1)));
    }
    let y;
    let m0;
    if (start) {
      const prev = toDate(addDays(start, -1));
      y = prev.getUTCFullYear();
      m0 = prev.getUTCMonth();
    } else {
      y = t.getUTCFullYear();
      m0 = t.getUTCMonth();
    }
    for (let i = 0; i < 14; i++) {
      m0 += 1;
      if (m0 > 11) {
        m0 = 0;
        y += 1;
      }
      const stmt = new Date(Date.UTC(y, m0, Math.min(day, daysInMonth(y, m0))));
      const reset = addDays(toIso(stmt), 1);
      if (reset > today) return reset;
    }
    return null;
  }
  if (period === 'membership_quarter') {
    const months = quarterMonths(stackCard);
    const y = t.getUTCFullYear();
    const cands = [];
    for (const yy of [y, y + 1]) for (const mo of months) cands.push(toIso(new Date(Date.UTC(yy, mo - 1, 1))));
    return cands.find((c) => c > today) || null;
  }
  return null;
}

export function resetCaption(app, stackCard, period) {
  const next = nextReset(app, stackCard, period);
  if (next) return `Resets ${fmtDate(next)}`;
  if (period === 'membership_year') return 'Resets on your membership anniversary';
  return 'Does not reset on its own';
}

// ---------- stored toggle and cap state ----------

export function storedToggle(app, cardId, key, stackCard, period) {
  const ds = app.store.get().deviceState;
  const rec = ds.toggles && ds.toggles[cardId] && ds.toggles[cardId][key];
  if (!rec || typeof rec.value !== 'boolean') return null;
  const cur = periodStartFor(app, stackCard, period);
  if ((rec.periodStart ?? null) !== (cur ?? null)) return null;
  return rec;
}

// value: true, false, or null to clear (falls back to the rule default)
export function setToggle(app, cardId, key, value, stackCard, period) {
  const start = periodStartFor(app, stackCard, period);
  app.store.update((s) => {
    const t = (s.deviceState.toggles[cardId] = s.deviceState.toggles[cardId] || {});
    if (value === null) delete t[key];
    else t[key] = { value, periodStart: start };
  });
}

export function storedCap(app, cardId, capId, stackCard, period) {
  const ds = app.store.get().deviceState;
  const rec = ds.capState && ds.capState[cardId] && ds.capState[cardId][capId];
  if (!rec || !rec.state) return null;
  const cur = periodStartFor(app, stackCard, period);
  if ((rec.periodStart ?? null) !== (cur ?? null)) return null;
  return rec;
}

// state: "plenty" | "room" | "used" | null (clear)
export function setCap(app, cardId, capId, state, roomSgd, stackCard, period) {
  const start = periodStartFor(app, stackCard, period);
  app.store.update((s) => {
    const c = (s.deviceState.capState[cardId] = s.deviceState.capState[cardId] || {});
    if (state === null || state === 'plenty') delete c[capId];
    else {
      const rec = { state, periodStart: start };
      if (state === 'room') rec.roomSgd = Number.isFinite(roomSgd) ? roomSgd : 0;
      c[capId] = rec;
    }
  });
}

export function activeCards(app) {
  const rules = (app.data.rules && app.data.rules.cards) || {};
  return ((app.data.stack && app.data.stack.cards) || []).filter((c) => c.status === 'active' && rules[c.id]);
}

export function cardName(app, id) {
  const sc = ((app.data.stack && app.data.stack.cards) || []).find((c) => c.id === id);
  const rc = app.data.rules && app.data.rules.cards && app.data.rules.cards[id];
  return (rc && rc.name) || (sc && sc.docName) || id;
}

// ---------- small widgets ----------

export function chip(text, opts) {
  const o = opts || {};
  const cls = ['chip', o.kind ? `chip-${o.kind}` : '', o.pressed ? 'is-on' : '', o.class || ''].filter(Boolean).join(' ');
  if (o.onClick) {
    return el(
      'button',
      {
        type: 'button',
        class: cls,
        'aria-pressed': o.pressed === undefined ? null : String(!!o.pressed),
        title: o.title || null,
        onClick: o.onClick,
      },
      text,
    );
  }
  return el('span', { class: cls, title: o.title || null }, text);
}

// options: [{ value, label }]; returns the container. onChange(value)
export function segmented(opts) {
  const { options, value, onChange, label, size } = opts;
  const wrap = el('div', { class: `seg ${size === 'sm' ? 'seg-sm' : ''}`, role: 'radiogroup', 'aria-label': label || null });
  for (const o of options) {
    const on = o.value === value;
    wrap.appendChild(
      el(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: `seg-btn ${on ? 'is-on' : ''}`,
          'aria-checked': String(on),
          onClick: () => onChange(o.value),
        },
        o.label,
      ),
    );
  }
  return wrap;
}

export function switchBtn(on, onChange, label) {
  return el(
    'button',
    {
      type: 'button',
      role: 'switch',
      class: `switch ${on ? 'is-on' : ''}`,
      'aria-checked': String(!!on),
      'aria-label': label || null,
      onClick: () => onChange(!on),
    },
    el('span', { class: 'switch-knob' }),
  );
}

export function section(title, ...kids) {
  return el('section', { class: 'block' }, title ? el('h2', { class: 'block-title' }, title) : null, ...kids);
}

let toastTimer = null;
export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  decide: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 15h4"/>',
  toggles: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  cheatsheet: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  rules: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name, size) {
  const s = size || 24;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(s));
  svg.setAttribute('height', String(s));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

export function emptyState(title, text) {
  return el('div', { class: 'empty' }, el('p', { class: 'empty-title' }, title), text ? el('p', { class: 'muted' }, text) : null);
}
