// Rules viewer: a list of cards and layers, then a detail page per entry with
// plain English rules, caps, conversion, fees, sources, evidence basis flags,
// conflicts and stale or expired warnings. Reads app.data.rules directly.

const STYLE_ID = "cco-rules-css";

const CSS = `
.rv-root{--rv-fg:var(--text,var(--fg,#1b1f24));--rv-muted:var(--muted,#5d6672);--rv-surface:var(--surface,#ffffff);
--rv-bg:var(--bg,#f4f6f8);--rv-line:var(--border,#d8dde3);--rv-accent:var(--accent,#0b5fb3);--rv-warn:var(--warn,#8a5a00);--rv-warn-bg:#fff4dc;
--rv-bad:var(--bad,#a3261b);--rv-bad-bg:#fde8e6;--rv-good:var(--good,#14683a);--rv-chip:#eef1f4;
color:var(--rv-fg);padding:12px 16px 28px;max-width:680px;margin:0 auto;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .rv-root{--rv-fg:var(--text,var(--fg,#e8ecf0));--rv-muted:var(--muted,#9aa5b1);--rv-surface:var(--surface,#1a1f25);
--rv-bg:var(--bg,#101418);--rv-line:var(--border,#2e353d);--rv-accent:var(--accent,#6cb2ff);--rv-warn:var(--warn,#f0b45a);--rv-warn-bg:#3a2d12;
--rv-bad:var(--bad,#ff8a80);--rv-bad-bg:#3a1b19;--rv-good:var(--good,#5fd08c);--rv-chip:#262d35}}
:root[data-theme="dark"] .rv-root{--rv-fg:var(--text,var(--fg,#e8ecf0));--rv-muted:var(--muted,#9aa5b1);--rv-surface:var(--surface,#1a1f25);
--rv-bg:var(--bg,#101418);--rv-line:var(--border,#2e353d);--rv-accent:var(--accent,#6cb2ff);--rv-warn:var(--warn,#f0b45a);--rv-warn-bg:#3a2d12;
--rv-bad:var(--bad,#ff8a80);--rv-bad-bg:#3a1b19;--rv-good:var(--good,#5fd08c);--rv-chip:#262d35}
.rv-root h2{font-size:20px;margin:4px 0 2px}
.rv-root h3{font-size:15px;margin:14px 0 6px}
.rv-sub{color:var(--rv-muted);font-size:13px;margin:0 0 10px}
.rv-group{margin:16px 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--rv-muted)}
.rv-item{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:var(--rv-surface);border:1px solid var(--rv-line);border-radius:12px;padding:10px 12px;margin:0 0 8px;cursor:pointer}
.rv-item:focus-visible,.rv-back:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px}
.rv-item-name{font-weight:650}
.rv-item-sub{color:var(--rv-muted);font-size:13px}
.rv-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.rv-badge{font-size:11.5px;padding:2px 8px;border-radius:999px;background:var(--rv-chip);color:var(--rv-fg)}
.rv-badge.warn{background:var(--rv-warn-bg);color:var(--rv-warn)}
.rv-badge.bad{background:var(--rv-bad-bg);color:var(--rv-bad)}
.rv-badge.ok{color:var(--rv-good)}
.rv-back{font:inherit;color:var(--rv-accent);background:none;border:0;padding:6px 0;cursor:pointer}
.rv-alert{border-radius:10px;padding:8px 12px;margin:8px 0;font-size:14px}
.rv-alert.warn{background:var(--rv-warn-bg);color:var(--rv-warn)}
.rv-alert.bad{background:var(--rv-bad-bg);color:var(--rv-bad)}
.rv-sec{background:var(--rv-surface);border:1px solid var(--rv-line);border-radius:12px;margin:10px 0;padding:0 12px}
.rv-sec>summary{cursor:pointer;font-weight:650;padding:11px 0;list-style:revert}
.rv-sec[open]>summary{border-bottom:1px solid var(--rv-line);margin-bottom:8px}
.rv-body{padding-bottom:10px}
.rv-tier{border-top:1px solid var(--rv-line);padding:8px 0}
.rv-tier:first-child{border-top:0}
.rv-tier-name{font-weight:650}
.rv-tier ul,.rv-body ul{margin:4px 0 0;padding-left:18px}
.rv-note{color:var(--rv-muted);font-size:13px}
.rv-kv{display:grid;grid-template-columns:minmax(90px,35%) 1fr;gap:3px 10px;margin:4px 0}
.rv-kv dt{color:var(--rv-muted);font-size:13px}
.rv-kv dd{margin:0;word-break:break-word}
.rv-nest{margin:4px 0 4px 8px;padding-left:8px;border-left:2px solid var(--rv-line)}
.rv-chipb{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--rv-warn-bg);color:var(--rv-warn);margin-left:6px;white-space:nowrap}
.rv-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.rv-table{border-collapse:collapse;width:100%;font-size:13px;min-width:420px}
.rv-table th,.rv-table td{text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid var(--rv-line);vertical-align:top}
.rv-table th{color:var(--rv-muted);font-weight:600}
.rv-src{border-top:1px solid var(--rv-line);padding:8px 0}
.rv-src:first-child{border-top:0}
.rv-src a{color:var(--rv-accent);word-break:break-word}
.rv-quote{color:var(--rv-muted);font-size:13px;font-style:italic}
.rv-root details.rv-more>summary{cursor:pointer;color:var(--rv-accent);font-size:13px}
`;

const METHOD_LABELS = {
  physical: "Tap or insert card",
  physical_tap: "Tap card",
  physical_insert: "Insert card",
  applepay_instore: "Apple Pay in store",
  applepay_inapp: "Apple Pay in app",
  card_online: "Card details online",
  amaze: "Via Amaze",
  heymax_voucher: "HeyMax voucher",
  heymax_link: "HeyMax link",
};

const PERIOD_LABELS = {
  calendar_month: "calendar month",
  statement_month: "statement month",
  membership_quarter: "membership quarter",
  membership_year: "membership year",
  none: "no reset",
};

const BASIS_LABELS = {
  blog_only: "blog only",
  inferred: "inferred",
  general_statement: "general statement",
  explicit_clause: "explicit clause",
};

const PROGRAMME_LABELS = { KF: "KrisFlyer", AVIOS: "Avios", AM: "Asia Miles" };

const WEAK = new Set(["blog_only", "inferred"]);

const STALE_DAYS = 90;

const LAYER_META = {
  amaze: { name: "Amaze", sub: "Instarem Amaze linked card layer" },
  heymax: { name: "HeyMax", sub: "HeyMax voucher layer (Max Miles)" },
  applepay: { name: "Apple Pay", sub: "Apple Pay treatment per card" },
};

let view = { id: null };

// ---------- small helpers ----------

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

const DASHES = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]", "g");
const clean = (s) => String(s == null ? "" : s).replace(DASHES, "-");

function humanise(s) {
  return clean(s).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function isWrapped(x) {
  return x && typeof x === "object" && !Array.isArray(x) && "v" in x;
}
function u(x) {
  return isWrapped(x) ? x.v : x;
}
function basisOf(x) {
  return x && typeof x === "object" ? x.basis || null : null;
}
function isUnknown(v) {
  return v === "unknown" || v === null || v === undefined;
}

function num(n) {
  if (typeof n !== "number") return clean(n);
  return n.toLocaleString("en-GB", { maximumFractionDigits: 4 });
}
function money(n) {
  return typeof n === "number" ? "S$" + n.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : clean(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) {
  if (typeof iso !== "string") return "unknown";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return clean(iso);
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
}
function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}
function daysBetween(fromIso, toIso) {
  const a = dayNumber(fromIso);
  const b = dayNumber(toIso);
  return a === null || b === null ? null : b - a;
}

function listText(arr, max) {
  const items = (arr || []).map((x) => clean(typeof x === "object" ? x.name || JSON.stringify(x) : x));
  if (max && items.length > max) return items.slice(0, max).join(", ") + `, and ${items.length - max} more`;
  return items.join(", ");
}

function basisChip(node) {
  const b = basisOf(node);
  if (b && WEAK.has(b)) return h("span", { class: "rv-chipb", title: "Evidence basis" }, BASIS_LABELS[b]);
  return null;
}

// ---------- evidence flags, conflicts, windows ----------

function collectWeak(node, path, out, depth) {
  if (!node || typeof node !== "object" || depth > 9) return;
  if (Array.isArray(node)) {
    node.forEach((x, i) => collectWeak(x, `${path}[${x && typeof x === "object" && x.id ? x.id : i}]`, out, depth + 1));
    return;
  }
  if (WEAK.has(node.basis)) out.push({ path, basis: node.basis, note: node.note || "", value: u(node) });
  for (const [k, v] of Object.entries(node)) {
    if (["sources", "conflicts", "basis", "note", "s", "schemaFlags", "unknowns"].includes(k)) continue;
    collectWeak(v, path ? `${path}.${k}` : k, out, depth + 1);
  }
}

function weakFlags(record) {
  const out = [];
  collectWeak(record, "", out, 0);
  return out;
}

// Scan for ended promos and scheduled changes. Returns [{kind, text}].
function windowNotes(record, today) {
  const notes = [];
  const check = (label, from, to) => {
    if (to && to < today) notes.push({ kind: "ended", text: `${label} ended on ${fmtDate(to)}.` });
    else if (from && from > today) notes.push({ kind: "scheduled", text: `${label} starts on ${fmtDate(from)}.` });
    else if (to && to >= today) notes.push({ kind: "ending", text: `${label} ends on ${fmtDate(to)}.` });
  };
  const blocks = [];
  if (record.reward && record.reward.modes && record.reward.modes.byMode) {
    for (const [m, b] of Object.entries(record.reward.modes.byMode)) blocks.push([m, b]);
  } else blocks.push([null, record]);
  for (const [mode, b] of blocks) {
    const prefix = mode ? `${humanise(mode)} mode: ` : "";
    for (const t of (b.earn && b.earn.tiers) || []) {
      const label = `${prefix}${clean(t.label || t.id)}`;
      check(label, u(t.effectiveFrom) || (t.promo && t.promo.from), u(t.effectiveTo) || (t.promo && t.promo.to));
      for (const un of t.unlock || []) if (un.effectiveFrom || un.effectiveTo) check(`${label} condition`, un.effectiveFrom, un.effectiveTo);
    }
    for (const c of b.caps || []) {
      check(`${prefix}Cap "${c.id}"`, u(c.effectiveFrom), u(c.effectiveTo));
      for (const p of Array.isArray(c.promo) ? c.promo : c.promo ? [c.promo] : []) check(`${prefix}Cap "${c.id}" promotion${p.condition ? " (" + clean(p.condition) + ")" : ""}`, p.from, p.to);
    }
  }
  for (const g of record.gates || []) if (g.effectiveFrom) check("Card-wide condition", g.effectiveFrom, g.effectiveTo);
  const v = record.validity || {};
  if (v.effectiveTo && v.effectiveTo < today) notes.push({ kind: "ended", text: `These rules ended on ${fmtDate(v.effectiveTo)}.` });
  return notes;
}

function staleInfo(record, today) {
  const v = (record && record.validity) || {};
  const days = v.verified ? daysBetween(v.verified, today) : null;
  return { verified: v.verified || null, days, stale: days === null ? true : days > STALE_DAYS };
}

function entryList(app) {
  const rules = (app.data && app.data.rules) || {};
  const stackCards = (app.data && app.data.stack && app.data.stack.cards) || [];
  const today = app.today();
  const out = [];
  const seen = new Set();
  for (const sc of stackCards) {
    const rec = rules.cards && rules.cards[sc.id];
    seen.add(sc.id);
    out.push({ id: sc.id, type: "card", name: clean((rec && rec.name) || sc.docName || sc.id), record: rec || null, stack: sc });
  }
  for (const [id, rec] of Object.entries(rules.cards || {})) {
    if (!seen.has(id)) out.push({ id, type: "card", name: clean(rec.name || id), record: rec, stack: null });
  }
  for (const [id, rec] of Object.entries(rules.layers || {})) {
    out.push({ id: "layer:" + id, layerId: id, type: "layer", name: (LAYER_META[id] && LAYER_META[id].name) || clean(rec.name || id), record: rec, stack: null });
  }
  for (const e of out) {
    e.stale = e.record ? staleInfo(e.record, today) : { stale: true, verified: null, days: null };
    e.windows = e.record ? windowNotes(e.record, today) : [];
    e.weak = e.record ? weakFlags(e.record).length : 0;
    e.conflicts = e.record && Array.isArray(e.record.conflicts) ? e.record.conflicts.length : 0;
  }
  return out;
}

// ---------- plain English ----------

function rewardWord(currency) {
  const c = String(currency || "points");
  if (c === "cashback") return { unit: "% cashback", pct: true };
  if (c === "stockback") return { unit: "% stockback", pct: true };
  if (c === "miles") return { unit: "miles", pct: false };
  if (c === "max_miles") return { unit: "Max Miles", pct: false };
  return { unit: "points", pct: false };
}

function ratePhrase(points, unit, currency) {
  const w = rewardWord(currency);
  if (w.pct) return `${num(points)}${w.unit} on each S$1`;
  const word = Number(points) === 1 && w.unit === "points" ? "point" : w.unit;
  return `${num(points)} ${word} per S$${num(unit || 1)}`;
}

function periodText(p) {
  return PERIOD_LABELS[p] || clean(p || "unspecified period").replace(/_/g, " ");
}

function describeUnlock(un) {
  const period = periodText(u(un.period));
  switch (un.type) {
    case "min_spend":
      return `Needs spend of at least ${money(u(un.amount))} in the ${period}${un.counts ? " (" + clean(un.counts) + ")" : ""}`;
    case "min_spend_each_month_of_quarter":
      return `Needs spend of at least ${money(u(un.amount))} in each month of the quarter${un.counts ? " (" + clean(un.counts) + ")" : ""}`;
    case "merchant_count":
      return `Needs spend at ${num(u(un.count))} different participating merchants in the ${period}`;
    case "balance":
      return `Needs ${money(u(un.amount))} average daily balance${un.account ? " in " + clean(un.account) : ""}${un.measured ? " (" + clean(String(un.measured).replace(/_/g, " ")) + ")" : ""}`;
    case "linked_id":
      return "Needs your loyalty ID linked to the card";
    case "mode":
      return `Only in ${clean(un.mode)} mode`;
    default:
      return `Condition: ${humanise(un.type || un.toggle || "unspecified")}`;
  }
}

function describeWhere(match) {
  const bits = [];
  const ch = u(match.channel);
  if (ch === "online") bits.push("online only");
  else if (ch === "offline") bits.push("in store only");
  const cur = u(match.currency);
  if (cur === "sgd") bits.push("charged in SGD");
  else if (cur === "fcy") bits.push("foreign currency charges");
  const loc = u(match.location);
  if (loc === "sg") bits.push("in Singapore");
  else if (loc === "overseas") bits.push("overseas");
  return bits;
}

function describeMcc(match) {
  const bits = [];
  const inList = [...(match.mccIn || []), ...(match.mccInRanges || []).map((r) => (Array.isArray(r) ? r.join("-") : r))];
  if (inList.length) bits.push(`Merchant codes: ${listText(inList, 14)}`);
  const merch = match.merchantsIn || [];
  if (merch.length) bits.push(`Named merchants (${merch.length}): ${listText(merch, 10)}`);
  const outCount = (match.mccOut || []).length + (match.mccOutRanges || []).length;
  if (outCount) bits.push(`Excludes ${outCount} merchant code${outCount === 1 ? "" : "s"} or ranges`);
  return bits;
}

function describeMethods(match) {
  const bits = [];
  if (match.methodsIn && match.methodsIn.length) bits.push("Only via: " + match.methodsIn.map((m) => METHOD_LABELS[m] || humanise(m)).join(", "));
  if (match.methodsOut && match.methodsOut.length) bits.push("Not via: " + match.methodsOut.map((m) => METHOD_LABELS[m] || humanise(m)).join(", "));
  return bits;
}

function renderBlock(block, currency, stackCard) {
  const frag = h("div");
  const earn = block.earn || {};
  const unit = u(earn.unit) || 1;
  const base = earn.base && u(earn.base.points);
  const rounding = earn.rounding || {};
  const roundBits = [];
  if (u(rounding.amount) === "floor_unit") roundBits.push(`amount rounded down to whole S$${num(unit)} per transaction`);
  else if (u(rounding.amount) === "exact") roundBits.push("exact amount used");
  if (u(rounding.points)) roundBits.push(`points ${String(u(rounding.points)).replace(/_/g, " ")}`);
  if (u(rounding.perComponent)) roundBits.push("base and bonus rounded separately");
  const minTxn = u(earn.minTxn);

  frag.appendChild(
    h(
      "div",
      { class: "rv-tier" },
      h("div", { class: "rv-tier-name" }, "Base rate"),
      h(
        "div",
        null,
        base === undefined || isUnknown(base) ? "Base rate unknown" : ratePhrase(base, unit, currency),
        basisChip(earn.base && earn.base.points)
      ),
      roundBits.length ? h("div", { class: "rv-note" }, "Rounding: " + roundBits.join(", ") + ".") : null,
      typeof minTxn === "number" && minTxn > 0 ? h("div", { class: "rv-note" }, `Minimum transaction: ${money(minTxn)}.`) : null
    )
  );

  const tiers = earn.tiers || [];
  for (const t of tiers) {
    const match = t.match || {};
    const pts = u(t.points);
    const stacking = u(t.stacking);
    const lines = [];
    const where = describeWhere(match);
    if (where.length) lines.push("Applies: " + where.join(", "));
    lines.push(...describeMcc(match));
    lines.push(...describeMethods(match));
    if (t.requiresUserCategory) lines.push("Only for the category you have chosen on the card");
    for (const un of t.unlock || []) lines.push(describeUnlock(un));
    const from = u(t.effectiveFrom) || (t.promo && t.promo.from);
    const to = u(t.effectiveTo) || (t.promo && t.promo.to);
    if (from || to) lines.push(`Valid ${from ? "from " + fmtDate(from) : ""}${from && to ? " " : ""}${to ? "to " + fmtDate(to) : ""}`.trim());
    if (t.capId) lines.push(`Counts towards the "${clean(t.capId)}" cap`);
    if (t.exclusiveGroup) lines.push("Alternative to other tiers in its group: only the highest applies");
    const weakNodes = [t.points, t.stacking, match.channel, match.currency, match.location].filter((x) => WEAK.has(basisOf(x)));
    const tierBox = h(
      "div",
      { class: "rv-tier" },
      h("div", { class: "rv-tier-name" }, clean(t.label || t.id), weakNodes.length ? h("span", { class: "rv-chipb" }, "weak evidence") : null),
      h(
        "div",
        null,
        isUnknown(pts) ? "Rate unknown" : ratePhrase(pts, unit, currency),
        stacking === "add" ? " on top of the base rate" : stacking === "replace" ? " in total (replaces base)" : ""
      ),
      lines.length ? h("ul", null, lines.map((l) => h("li", null, clean(l)))) : null
    );
    frag.appendChild(tierBox);
  }
  if (!tiers.length) frag.appendChild(h("div", { class: "rv-note" }, "No bonus tiers: the base rate is the only rate."));
  return frag;
}

function describeCap(c) {
  const amount = u(c.amount);
  const unit = u(c.unit);
  const amountText = unit === "points" ? `${num(amount)} points` : unit === "sgd" || unit === "cash" ? money(amount) : num(amount);
  const counts = u(c.counts);
  const spend = u(c.capSpendSgd);
  const lines = [];
  lines.push(`Cap: ${amountText}${counts === "bonus_only" ? " of bonus" : counts === "base_plus_bonus" ? " of base plus bonus" : ""} per ${periodText(u(c.period))}`);
  if (typeof spend === "number") lines.push(`About ${money(spend)} of eligible spend before the cap is reached`);
  const basis = u(c.basis);
  if (basis) lines.push(`Counted by ${String(basis).replace(/_/g, " ")}`);
  const scope = u(c.scope);
  if (scope && scope !== "unknown") lines.push(scope === "principal_incl_supp" ? "Shared across principal and supplementary cards" : `Scope: ${String(scope).replace(/_/g, " ")}`);
  const after = u(c.afterCap);
  if (after) {
    const pts = u(c.afterCapPoints);
    lines.push(after === "base" ? "After the cap: base rate only" : after === "zero" ? "After the cap: no earn on these tiers" : `After the cap: ${num(pts)} per unit`);
  }
  if (c.tiers && c.tiers.length) lines.push("Applies to tiers: " + c.tiers.join(", "));
  for (const sc of c.subCaps || []) lines.push(`Sub-cap "${clean(sc.id)}": ${num(u(sc.amount))} ${u(sc.unit) || ""}`.trim());
  const promos = Array.isArray(c.promo) ? c.promo : c.promo ? [c.promo] : [];
  for (const p of promos) {
    if (p.amount) lines.push(`Promotion: ${money(u(p.amount))}${p.from ? " from " + fmtDate(p.from) : ""}${p.to ? " to " + fmtDate(p.to) : ""}${p.condition ? " (" + clean(p.condition) + ")" : ""}`);
  }
  return { title: `Cap "${clean(c.id)}"`, lines, weak: [c.amount, c.capSpendSgd, c.period, c.scope, c.basis].some((x) => WEAK.has(basisOf(x))) };
}

function renderCaps(block, record) {
  const caps = block.caps || [];
  const box = h("div");
  if (!caps.length) box.appendChild(h("div", { class: "rv-note" }, record.capsNote ? clean(record.capsNote) : "No caps recorded."));
  for (const c of caps) {
    const d = describeCap(c);
    box.appendChild(h("div", { class: "rv-tier" }, h("div", { class: "rv-tier-name" }, d.title, d.weak ? h("span", { class: "rv-chipb" }, "weak evidence") : null), h("ul", null, d.lines.map((l) => h("li", null, clean(l))))));
  }
  if (caps.length && record.capsNote) box.appendChild(h("div", { class: "rv-note" }, clean(record.capsNote)));
  return box;
}

function progRate(p) {
  const r = u(p.milesPerPoint);
  return typeof r === "number" ? r : null;
}

function renderConversion(conv, currency) {
  const box = h("div");
  if (!conv) {
    box.appendChild(h("div", { class: "rv-note" }, "No conversion data."));
    return box;
  }
  const cash = u(conv.cashValuePerUnit);
  const rows = [];
  for (const [key, p] of Object.entries(conv.programmes || {})) {
    if (!p) continue;
    const avail = u(p.available);
    const rate = progRate(p);
    const minPts = u(p.minPoints);
    const inc = u(p.incrementPoints);
    const fee = u(p.feeSgd);
    const route = u(p.route);
    const via = Array.isArray(p.via) && p.via.length ? " via " + p.via.map((v) => clean(v.to)).join(" then ") : "";
    rows.push(
      h(
        "tr",
        null,
        h("td", null, PROGRAMME_LABELS[key] || key, basisChip(p.milesPerPoint)),
        h("td", null, avail === false ? "Not available" : rate === null ? "Unknown" : `${num(rate)} per point${route === "via" ? via : ""}`),
        h("td", null, typeof minPts === "number" ? num(minPts) : "-"),
        h("td", null, typeof inc === "number" ? num(inc) : "-"),
        h("td", null, typeof fee === "number" ? (fee === 0 ? "Free" : money(fee)) : "-"),
        h("td", null, clean(u(p.days) || "-"))
      )
    );
  }
  if (rows.length) {
    box.appendChild(
      h(
        "div",
        { class: "rv-tablewrap" },
        h(
          "table",
          { class: "rv-table" },
          h("thead", null, h("tr", null, ["Programme", "Miles", "Min points", "Increment", "Fee", "Time"].map((t) => h("th", null, t)))),
          h("tbody", null, rows)
        )
      )
    );
  } else if (typeof cash === "number") {
    box.appendChild(h("div", null, `Redeemed as ${String(currency).replace("back", " back")}. Not converted to miles by the issuer.`));
  } else {
    box.appendChild(h("div", { class: "rv-note" }, "No miles programmes recorded."));
  }
  if (typeof cash === "number") box.appendChild(h("div", { class: "rv-note" }, `Cash value: ${num(cash)} per unit (about ${num(cash * 100)} ${Math.abs(cash * 100 - 1) < 1e-9 ? "cent" : "cents"}).`));
  for (const a of conv.alternatives || []) {
    box.appendChild(h("div", { class: "rv-note" }, `Alternative: ${clean(a.name)}${a.milesPerPoint ? ", " + num(a.milesPerPoint) + " miles per point" : ""}${a.note ? ". " + clean(a.note) : ""}`));
  }
  const exp = conv.expiry;
  if (exp && !isUnknown(u(exp))) box.appendChild(h("div", { class: "rv-note" }, "Expiry: " + clean(u(exp))));
  return box;
}

const FEE_LABELS = {
  fcyPct: ["Foreign currency fee", (v) => `${num(v)}%`],
  dccFeePct: ["Dynamic currency conversion fee", (v) => `${num(v)}%`],
  sgdProcessedOverseasFeePct: ["Fee on SGD charges processed overseas", (v) => `${num(v)}%`],
  annualFee: ["Annual fee", (v) => money(v)],
  dcc: ["Earn when merchant converts to SGD", (v) => String(v).replace(/_/g, " ")],
  fcyEarn: ["Earn on foreign spend", (v) => String(v).replace(/_/g, " ")],
};

function renderFees(fees) {
  const box = h("dl", { class: "rv-kv" });
  let count = 0;
  for (const [k, v] of Object.entries(fees || {})) {
    const val = u(v);
    if (val === undefined) continue;
    const def = FEE_LABELS[k];
    const label = def ? def[0] : humanise(k);
    const text = isUnknown(val) ? "Unknown" : def && typeof val !== "object" ? def[1](val) : typeof val === "object" ? JSON.stringify(val) : clean(val);
    box.appendChild(h("dt", null, label));
    box.appendChild(h("dd", null, clean(text), basisChip(v), v && v.note && typeof v.note === "string" ? h("div", { class: "rv-note" }, clean(v.note.length > 220 ? v.note.slice(0, 217) + "..." : v.note)) : null));
    count++;
  }
  if (!count) box.appendChild(h("dd", { class: "rv-note" }, "No fees recorded."));
  return box;
}

function renderExclusions(ex) {
  const bits = [];
  if (!ex) return h("div", { class: "rv-note" }, "No exclusions recorded.");
  const zero = (ex.mccZero || []).length + (ex.mccZeroRanges || []).length;
  const baseOnly = (ex.mccBaseOnly || []).length + (ex.mccBaseOnlyRanges || []).length;
  if (zero) bits.push(`No earn at ${zero} merchant code${zero === 1 ? "" : "s"} or ranges`);
  if (baseOnly) bits.push(`Base rate only at ${baseOnly} merchant code${baseOnly === 1 ? "" : "s"} or ranges`);
  if (ex.platformsZero && ex.platformsZero.length) bits.push("No earn via: " + listText(ex.platformsZero, 12));
  if (ex.descriptionsZero && ex.descriptionsZero.length) bits.push("No earn when the description contains: " + listText(ex.descriptionsZero, 10));
  const wallet = u(ex.walletTopUps);
  if (wallet && !isUnknown(wallet)) bits.push(`Wallet top-ups: ${String(wallet).replace(/_/g, " ")}`);
  if (ex.transactionTypesZero && ex.transactionTypesZero.length) bits.push("No earn on: " + listText(ex.transactionTypesZero, 10));
  if (!bits.length) return h("div", { class: "rv-note" }, "No exclusions recorded.");
  return h("ul", null, bits.map((b) => h("li", null, clean(b))));
}

const APPLE_TEXT = {
  same_as_physical_contactless: "Earns the same as tapping the physical card",
  same_as_physical: "Earns the same as the physical card",
  base_only: "Base rate only, no bonus",
  excluded: "No earn",
  online: "Treated as an online purchase",
  offline: "Treated as an in-store purchase",
  unknown: "Unknown",
};

function renderApplePayCard(ap) {
  if (!ap) return h("div", { class: "rv-note" }, "No Apple Pay data.");
  const rows = [];
  for (const [label, key] of [["Supported", "supported"], ["In store", "inStore"], ["In app and web", "inApp"]]) {
    const node = ap[key];
    if (node === undefined) continue;
    const val = u(node);
    const text = typeof val === "boolean" ? (val ? "Yes" : "No") : APPLE_TEXT[val] || humanise(String(val));
    rows.push(h("dt", null, label), h("dd", null, text, basisChip(node), node && node.note ? h("div", { class: "rv-note" }, clean(String(node.note).slice(0, 240))) : null));
  }
  return h("dl", { class: "rv-kv" }, rows);
}

// Generic key/value tree for layer records.
function kvTree(obj, depth, skip) {
  const dl = h("dl", { class: "rv-kv" });
  for (const [k, v] of Object.entries(obj || {})) {
    if (skip && skip.includes(k)) continue;
    if (["s", "sources", "basis", "note", "conflicts", "unknowns", "schemaFlags", "validity"].includes(k)) continue;
    const content = valueNode(v, depth);
    if (content === null) continue;
    dl.appendChild(h("dt", null, humanise(k)));
    dl.appendChild(h("dd", null, content));
  }
  return dl.childNodes.length ? dl : null;
}

function valueNode(v, depth) {
  if (v === null || v === undefined) return null;
  if (isWrapped(v)) {
    const inner = v.v;
    const text = Array.isArray(inner) ? listText(inner, 12) : typeof inner === "object" && inner !== null ? JSON.stringify(inner) : isUnknown(inner) ? "Unknown" : clean(inner);
    return h("span", null, text, basisChip(v), v.note ? h("div", { class: "rv-note" }, clean(String(v.note).slice(0, 260) + (String(v.note).length > 260 ? "..." : ""))) : null);
  }
  if (Array.isArray(v)) {
    if (!v.length) return null;
    if (v.every((x) => x === null || typeof x !== "object")) return h("span", null, listText(v, 14));
    if (depth > 3) return h("span", { class: "rv-note" }, `${v.length} entries`);
    return h(
      "div",
      null,
      v.slice(0, 20).map((x) => h("div", { class: "rv-nest" }, valueNode(x, depth + 1)))
    );
  }
  if (typeof v === "object") {
    if (depth > 3) return h("span", { class: "rv-note" }, "See sources");
    const inner = kvTree(v, depth + 1);
    const note = v.note ? h("div", { class: "rv-note" }, clean(String(v.note).slice(0, 260))) : null;
    if (!inner && !note) return null;
    return h("div", { class: "rv-nest" }, inner, note);
  }
  return h("span", null, clean(v));
}

// ---------- shared detail sections ----------

function section(title, body, open, badge) {
  const d = h("details", { class: "rv-sec" }, h("summary", null, title, badge ? h("span", { class: "rv-badge", style: "margin-left:8px" }, badge) : null), h("div", { class: "rv-body" }, body));
  if (open) d.setAttribute("open", "");
  return d;
}

function renderSources(sources) {
  const entries = Object.entries(sources || {});
  if (!entries.length) return h("div", { class: "rv-note" }, "No sources recorded.");
  const order = { issuer_tc: 0, issuer_page: 1, issuer_faq: 2 };
  entries.sort((a, b) => (order[a[1].type] ?? 5) - (order[b[1].type] ?? 5) || a[0].localeCompare(b[0], "en", { numeric: true }));
  return h(
    "div",
    null,
    entries.map(([id, s]) => {
      const url = typeof s.url === "string" && /^https?:\/\//i.test(s.url) ? s.url : null;
      return h(
        "div",
        { class: "rv-src" },
        h("div", null, h("b", null, id), " ", url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, clean(s.title || s.url)) : clean(s.title || "Untitled source")),
        h("div", { class: "rv-note" }, `${humanise(s.type || "source")} | verified ${fmtDate(s.verified)}`),
        s.quote ? h("div", { class: "rv-quote" }, `"${clean(s.quote)}"`) : null
      );
    })
  );
}

function renderConflicts(conflicts) {
  if (!conflicts || !conflicts.length) return h("div", { class: "rv-note" }, "No conflicts recorded.");
  return h(
    "div",
    null,
    conflicts.map((c) => {
      const side = (x) => (x === undefined ? "-" : isWrapped(x) ? (typeof x.v === "object" ? JSON.stringify(x.v) : String(x.v)) : typeof x === "object" ? JSON.stringify(x) : String(x));
      return h(
        "div",
        { class: "rv-tier" },
        h("div", { class: "rv-tier-name" }, clean(c.field || c.id || "Conflict")),
        c.a !== undefined || c.b !== undefined ? h("div", null, `Source A says ${clean(side(c.a)).slice(0, 160)}; source B says ${clean(side(c.b)).slice(0, 160)}.`) : null,
        c.note ? h("div", { class: "rv-note" }, clean(c.note)) : null
      );
    })
  );
}

function renderWeak(flags) {
  if (!flags.length) return h("div", { class: "rv-note" }, "Every researched field has an issuer clause or general statement behind it.");
  return h(
    "div",
    null,
    h("div", { class: "rv-note" }, "Fields resting on a blog or an inference rather than issuer wording. Treat these as less certain."),
    flags.map((f) =>
      h(
        "div",
        { class: "rv-tier" },
        h("div", { class: "rv-tier-name" }, clean(f.path || "record"), h("span", { class: "rv-chipb" }, BASIS_LABELS[f.basis])),
        f.value !== undefined && typeof f.value !== "object" ? h("div", null, "Value: " + clean(f.value)) : null,
        f.note ? h("div", { class: "rv-note" }, clean(String(f.note).slice(0, 360) + (String(f.note).length > 360 ? "..." : ""))) : null
      )
    )
  );
}

function renderStringList(arr, emptyText) {
  const items = (arr || []).map((x) => (typeof x === "string" ? x : x && (x.text || x.note || x.question || JSON.stringify(x))));
  if (!items.length) return h("div", { class: "rv-note" }, emptyText);
  return h("ul", null, items.map((t) => h("li", null, clean(String(t)))));
}

function warningsBox(entry, today) {
  const box = h("div");
  const st = entry.stale;
  if (entry.record) {
    if (st.verified === null) box.appendChild(h("div", { class: "rv-alert warn" }, "No verification date recorded for these rules."));
    else if (st.stale) box.appendChild(h("div", { class: "rv-alert warn" }, `Last verified ${fmtDate(st.verified)}, ${st.days} days ago. Rules older than ${STALE_DAYS} days may have changed: check the issuer before relying on them.`));
    if (entry.record.status && entry.record.status !== "active") box.appendChild(h("div", { class: "rv-alert bad" }, `Status: ${entry.record.status}. This is not used for ranking.`));
  }
  for (const w of entry.windows) {
    if (w.kind === "ended") box.appendChild(h("div", { class: "rv-alert bad" }, "Ended: " + clean(w.text)));
    else box.appendChild(h("div", { class: "rv-alert warn" }, (w.kind === "scheduled" ? "Scheduled change: " : "Time limited: ") + clean(w.text)));
  }
  return box;
}

// ---------- detail screens ----------

function activeBlock(record, stackCard) {
  const modes = record.reward && record.reward.modes;
  if (modes && modes.byMode) {
    const want = String((stackCard && stackCard.rewardMode) || "").toLowerCase().replace(/[\s-]+/g, "_");
    const keys = Object.keys(modes.byMode);
    const key = keys.find((k) => k.toLowerCase() === want) || null;
    return { key, block: key ? modes.byMode[key] : null, modes };
  }
  return { key: null, block: record, modes: null };
}

function renderCardDetail(entry, app) {
  const rec = entry.record;
  const sc = entry.stack;
  const today = app.today();
  const frag = h("div");
  if (!rec) {
    frag.appendChild(h("div", { class: "rv-alert warn" }, "No rules record exists for this card yet."));
    return frag;
  }
  const { key: modeKey, block, modes } = activeBlock(rec, sc);
  const currency = (block && block.currency && u(block.currency)) || (rec.reward && u(rec.reward.currency)) || "points";

  const facts = [];
  facts.push(["Network", humanise(u(rec.network) || (sc && sc.network) || "unknown")]);
  if (rec.issuer) facts.push(["Issuer", clean(rec.issuer)]);
  facts.push(["Reward", clean((rec.reward && rec.reward.unitName) || humanise(currency))]);
  if (sc && sc.statementText) facts.push(["Statement", clean(sc.statementText)]);
  if (sc && sc.resetText) facts.push(["Resets", clean(sc.resetText)]);
  const supp = rec.supplementary;
  if (supp && supp.allowed) facts.push(["Supplementary", u(supp.allowed) ? (sc && sc.hasSupplementary ? "Held" : "Allowed, not held") : "Not offered"]);
  if (rec.validity && rec.validity.confidence) facts.push(["Confidence", humanise(rec.validity.confidence)]);
  facts.push(["Verified", fmtDate(entry.stale.verified)]);
  frag.appendChild(h("dl", { class: "rv-kv" }, facts.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]).flat()));
  if (rec.validity && rec.validity.note) frag.appendChild(h("div", { class: "rv-note" }, clean(rec.validity.note)));
  if (rec.modelNote) frag.appendChild(h("div", { class: "rv-note" }, clean(rec.modelNote)));

  // Key rules
  const rulesBody = h("div");
  if (modes) {
    rulesBody.appendChild(h("div", { class: "rv-note" }, modeKey ? `Active mode in your stack: ${humanise(modeKey)}. Switching: ${clean(u(modes.switch) || "see sources")}` : `No matching mode set in the stack document. Modes: ${modes.options ? modes.options.map(humanise).join(", ") : "unknown"}.`));
    if (block) rulesBody.appendChild(renderBlock(block, currency, sc));
  } else {
    rulesBody.appendChild(renderBlock(rec, currency, sc));
  }
  if (rec.gates && rec.gates.length) {
    rulesBody.appendChild(h("h3", null, "Card-wide conditions"));
    rec.gates.forEach((g) => {
      rulesBody.appendChild(h("div", { class: "rv-tier" }, h("div", null, describeUnlock(g)), h("div", { class: "rv-note" }, g.onFail === "zero" ? "If not met, the card earns nothing." : "")));
    });
  }
  const ap = rec.applePay;
  frag.appendChild(section("Key rules", rulesBody, true));

  const capsBody = block ? renderCaps(block, rec) : h("div", { class: "rv-note" }, "No caps recorded.");
  frag.appendChild(section("Caps and resets", capsBody, true, block && block.caps ? String(block.caps.length) : null));

  if (modes && modes.byMode) {
    const others = Object.entries(modes.byMode).filter(([k]) => k !== modeKey);
    if (others.length) {
      const wrap = h("div");
      for (const [k, b] of others) {
        wrap.appendChild(
          h("details", { class: "rv-more" }, h("summary", null, `${humanise(k)} mode`), renderBlock(b, (b.currency && u(b.currency)) || currency, sc), renderCaps(b, rec))
        );
      }
      frag.appendChild(section("Other reward modes", wrap, false));
    }
  }

  frag.appendChild(section("Miles conversion", renderConversion(block && block.conversion ? block.conversion : rec.conversion, currency), true));
  frag.appendChild(section("Fees", renderFees(rec.fees), false));
  frag.appendChild(section("Exclusions", renderExclusions((block && block.exclusions) || rec.exclusions), false));

  const layersBox = h("div");
  layersBox.appendChild(h("h3", null, "Apple Pay"));
  layersBox.appendChild(renderApplePayCard(ap));
  const lay = [];
  if (rec.amaze) lay.push(["Amaze", rec.amaze.eligible, rec.amaze.note]);
  if (rec.heymax) lay.push(["HeyMax", rec.heymax.eligible, rec.heymax.note]);
  if (lay.length) {
    layersBox.appendChild(h("h3", null, "Layers"));
    layersBox.appendChild(
      h(
        "dl",
        { class: "rv-kv" },
        lay.map(([label, el, note]) => [
          h("dt", null, label),
          h("dd", null, isUnknown(u(el)) ? "Unknown" : u(el) ? "Eligible" : "Not eligible", basisChip(el), note ? h("div", { class: "rv-note" }, clean(String(note).slice(0, 260))) : null),
        ]).flat()
      )
    );
  }
  if (rec.networkAcceptance && rec.networkAcceptance.length) {
    layersBox.appendChild(h("h3", null, "Merchant acceptance notes"));
    layersBox.appendChild(h("ul", null, rec.networkAcceptance.map((n) => h("li", null, `${clean(n.merchant)}: ${n.accepts === false ? "not accepted" : "accepted"}`))));
  }
  frag.appendChild(section("Apple Pay and layers", layersBox, false));

  const weak = weakFlags(rec);
  frag.appendChild(section("Evidence basis flags", renderWeak(weak), false, String(weak.length)));
  frag.appendChild(section("Conflicts", renderConflicts(rec.conflicts), false, String((rec.conflicts || []).length)));
  const unknowns = [...(rec.unknowns || []), ...(rec.schemaFlags || [])];
  frag.appendChild(section("Open questions and notes", renderStringList(unknowns, "None recorded."), false, String(unknowns.length)));
  frag.appendChild(section("Sources", renderSources(rec.sources), false, String(Object.keys(rec.sources || {}).length)));
  return frag;
}

function renderLayerDetail(entry, app) {
  const rec = entry.record;
  const frag = h("div");
  const id = entry.layerId;
  const meta = LAYER_META[id] || {};
  frag.appendChild(h("dl", { class: "rv-kv" }, [["Status", humanise(rec.status || "unknown")], ["Verified", fmtDate(entry.stale.verified)], ["Confidence", humanise((rec.validity && rec.validity.confidence) || "unknown")]].map(([k, v]) => [h("dt", null, k), h("dd", null, v)]).flat()));
  if (rec.validity && rec.validity.note) frag.appendChild(h("div", { class: "rv-note" }, clean(rec.validity.note)));
  if (rec.notes) frag.appendChild(h("div", { class: "rv-note" }, clean(rec.notes)));

  if (id === "applepay") {
    const names = {};
    for (const c of (app.data.stack && app.data.stack.cards) || []) names[c.id] = c.docName || c.id;
    const body = h("div");
    for (const [cardId, ap] of Object.entries(rec.perCard || {})) {
      body.appendChild(h("h3", null, clean(names[cardId] || cardId)));
      body.appendChild(renderApplePayCard(ap));
    }
    frag.appendChild(section("Apple Pay per card", body, true));
    if (rec.layerVia) frag.appendChild(section("Layered paths", valueNode(rec.layerVia, 0) || h("div", { class: "rv-note" }, "None recorded."), false));
  } else if (id === "heymax") {
    const rates = rec.brandRates || [];
    const tbl = h(
      "div",
      { class: "rv-tablewrap" },
      h(
        "table",
        { class: "rv-table" },
        h("thead", null, h("tr", null, ["Brand", "Max Miles per S$1", "As of"].map((t) => h("th", null, t)))),
        h(
          "tbody",
          null,
          rates.map((b) => h("tr", null, h("td", null, clean(b.brand)), h("td", null, num(u(b.maxMilesPerSgd)), basisChip(b.maxMilesPerSgd), b.volatile ? h("span", { class: "rv-chipb" }, "changes often") : null), h("td", null, clean(b.asOf || "-"))))
        )
      )
    );
    frag.appendChild(section("Brand rates", h("div", null, h("div", { class: "rv-note" }, clean(rec.brandRatesNote || "Brand rates change frequently: confirm in the HeyMax app before paying.")), tbl), true, String(rates.length)));
    frag.appendChild(section("How vouchers are treated", kvTree(rec.voucher, 0) || h("div", { class: "rv-note" }, "None recorded."), true));
    frag.appendChild(section("Conversion to airline miles", renderConversion(rec.conversion, "max_miles"), false));
    for (const [title, key] of [["Fees", "fees"], ["Apple Pay", "applePay"], ["Excluded by cards", "excludedByCards"], ["Other details", null]]) {
      const body = key ? valueNode(rec[key], 0) : kvTree(rec, 0, ["voucher", "brandRates", "conversion", "fees", "applePay", "excludedByCards", "id", "name", "issuer", "kind", "status", "brandRatesNote", "yearlyTransferCaps"]);
      if (body) frag.appendChild(section(title, body, false));
    }
  } else {
    const main = kvTree(rec, 0, ["id", "name", "issuer", "kind", "status", "applePay", "fees", "excludedByCards", "stackAnswers", "otherFees"]);
    if (main) frag.appendChild(section("How it works", main, true));
    for (const [title, key] of [["Fees", "fees"], ["Other fees", "otherFees"], ["Apple Pay", "applePay"], ["Cards that exclude it", "excludedByCards"], ["Answers for your stack", "stackAnswers"]]) {
      const body = valueNode(rec[key], 0);
      if (body) frag.appendChild(section(title, body, false));
    }
  }
  const weak = weakFlags(rec);
  frag.appendChild(section("Evidence basis flags", renderWeak(weak), false, String(weak.length)));
  frag.appendChild(section("Conflicts", renderConflicts(rec.conflicts), false, String((rec.conflicts || []).length)));
  const unknowns = [...(rec.unknowns || []), ...(rec.schemaFlags || [])];
  frag.appendChild(section("Open questions and notes", renderStringList(unknowns, "None recorded."), false, String(unknowns.length)));
  frag.appendChild(section("Sources", renderSources(rec.sources), false, String(Object.keys(rec.sources || {}).length)));
  return frag;
}

// ---------- list ----------

function badgesFor(e) {
  const b = [];
  if (!e.record) return [h("span", { class: "rv-badge bad" }, "No rules yet")];
  if (e.record.status && e.record.status !== "active") b.push(h("span", { class: "rv-badge bad" }, humanise(e.record.status)));
  if (e.stale.stale) b.push(h("span", { class: "rv-badge warn" }, e.stale.verified ? `Stale: ${e.stale.days} days` : "Not verified"));
  else b.push(h("span", { class: "rv-badge ok" }, `Verified ${fmtDate(e.stale.verified)}`));
  const ended = e.windows.filter((w) => w.kind === "ended").length;
  const sched = e.windows.filter((w) => w.kind !== "ended").length;
  if (ended) b.push(h("span", { class: "rv-badge bad" }, `${ended} ended`));
  if (sched) b.push(h("span", { class: "rv-badge warn" }, `${sched} dated change${sched === 1 ? "" : "s"}`));
  if (e.conflicts) b.push(h("span", { class: "rv-badge" }, `${e.conflicts} conflict${e.conflicts === 1 ? "" : "s"}`));
  if (e.weak) b.push(h("span", { class: "rv-badge" }, `${e.weak} weak basis`));
  return b;
}

function subtitleFor(e) {
  if (e.type === "layer") return (LAYER_META[e.layerId] && LAYER_META[e.layerId].sub) || "Payment layer";
  const bits = [];
  const net = e.record ? u(e.record.network) : e.stack && e.stack.network;
  if (net) bits.push(humanise(net));
  if (e.stack && e.stack.rewardMode) bits.push(humanise(e.stack.rewardMode) + " mode");
  if (e.stack && e.stack.layers && e.stack.layers.length) bits.push("Layers: " + e.stack.layers.map(humanise).join(", "));
  return bits.join(" | ");
}

function renderList(root, app, entries) {
  const wrap = h("div", { class: "rv-root" }, h("h2", null, "Rules"), h("p", { class: "rv-sub" }, "What the app believes about each card and layer, with sources and how sure we are."));
  const stale = entries.filter((e) => e.record && e.stale.stale).length;
  const ended = entries.filter((e) => e.windows.some((w) => w.kind === "ended")).length;
  if (stale) wrap.appendChild(h("div", { class: "rv-alert warn" }, `${stale} record${stale === 1 ? " is" : "s are"} older than ${STALE_DAYS} days since verification.`));
  if (ended) wrap.appendChild(h("div", { class: "rv-alert bad" }, `${ended} record${ended === 1 ? " has" : "s have"} an ended promotion or tier.`));
  for (const [title, type] of [["Cards", "card"], ["Layers", "layer"]]) {
    const items = entries.filter((e) => e.type === type);
    if (!items.length) continue;
    wrap.appendChild(h("div", { class: "rv-group" }, title));
    for (const e of items) {
      wrap.appendChild(
        h(
          "button",
          {
            class: "rv-item",
            type: "button",
            onclick: () => {
              view = { id: e.id };
              draw(root, app);
              window.scrollTo(0, 0);
            },
          },
          h("div", { class: "rv-item-name" }, e.name),
          h("div", { class: "rv-item-sub" }, subtitleFor(e)),
          h("div", { class: "rv-badges" }, badgesFor(e))
        )
      );
    }
  }
  root.appendChild(wrap);
}

function renderDetail(root, app, entry, entries) {
  const wrap = h("div", { class: "rv-root" });
  wrap.appendChild(
    h(
      "button",
      {
        class: "rv-back",
        type: "button",
        onclick: () => {
          view = { id: null };
          draw(root, app);
          window.scrollTo(0, 0);
        },
      },
      "< All rules"
    )
  );
  wrap.appendChild(h("h2", null, entry.name));
  wrap.appendChild(h("p", { class: "rv-sub" }, subtitleFor(entry)));
  wrap.appendChild(warningsBox(entry, app.today()));
  wrap.appendChild(entry.type === "card" ? renderCardDetail(entry, app) : entry.record ? renderLayerDetail(entry, app) : h("div", { class: "rv-alert warn" }, "No record."));
  root.appendChild(wrap);
}

function draw(root, app) {
  root.textContent = "";
  const entries = entryList(app);
  const entry = view.id ? entries.find((e) => e.id === view.id) : null;
  if (entry) renderDetail(root, app, entry, entries);
  else renderList(root, app, entries);
}

export default {
  id: "rules",
  title: "Rules",
  render(root, app, params) {
    injectStyle();
    if (params && params.id) view = { id: String(params.id) };
    else if (params && params.reset) view = { id: null };
    draw(root, app);
  },
};
