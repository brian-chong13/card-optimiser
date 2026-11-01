// Cheat sheet screen: top 3 cards per merchant or category, recomputed live.
// Pure DOM, no framework. Reads app.data.profile.cheatSheet and re-runs the
// engine with each entry's stored purchase template and the current toggles.

const STYLE_ID = "cco-cheatsheet-css";

const CSS = `
.cs-root{--cs-fg:var(--text,var(--fg,#1b1f24));--cs-muted:var(--muted,#5d6672);--cs-surface:var(--surface,#ffffff);
--cs-bg:var(--bg,#f4f6f8);--cs-line:var(--border,#d8dde3);--cs-accent:var(--accent,#0b5fb3);--cs-soft:var(--accent-soft,#e5f0fb);
--cs-warn:var(--warn,#8a5a00);--cs-good:var(--good,#14683a);
color:var(--cs-fg);padding:12px 16px 24px;max-width:640px;margin:0 auto;font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .cs-root{--cs-fg:var(--text,var(--fg,#e8ecf0));--cs-muted:var(--muted,#9aa5b1);--cs-surface:var(--surface,#1a1f25);
--cs-bg:var(--bg,#101418);--cs-line:var(--border,#2e353d);--cs-accent:var(--accent,#6cb2ff);--cs-soft:var(--accent-soft,#1c2a3a);--cs-warn:var(--warn,#f0b45a);--cs-good:var(--good,#5fd08c)}}
:root[data-theme="dark"] .cs-root{--cs-fg:var(--text,var(--fg,#e8ecf0));--cs-muted:var(--muted,#9aa5b1);--cs-surface:var(--surface,#1a1f25);
--cs-bg:var(--bg,#101418);--cs-line:var(--border,#2e353d);--cs-accent:var(--accent,#6cb2ff);--cs-soft:var(--accent-soft,#1c2a3a);--cs-warn:var(--warn,#f0b45a);--cs-good:var(--good,#5fd08c)}
.cs-root h2{font-size:20px;margin:4px 0 2px}
.cs-sub{color:var(--cs-muted);font-size:13px;margin:0 0 10px}
.cs-search{position:sticky;top:0;z-index:2;background:var(--cs-bg);padding:6px 0 8px}
.cs-search input{width:100%;box-sizing:border-box;font:inherit;padding:11px 12px;border:1px solid var(--cs-line);border-radius:10px;background:var(--cs-surface);color:var(--cs-fg)}
.cs-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cs-chip{font:inherit;font-size:13px;padding:6px 11px;border-radius:999px;border:1px solid var(--cs-line);background:var(--cs-surface);color:var(--cs-fg);cursor:pointer}
.cs-chip[aria-pressed="true"]{background:var(--cs-accent);border-color:var(--cs-accent);color:#fff}
.cs-group{margin:16px 0 6px;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:var(--cs-muted)}
.cs-entry{background:var(--cs-surface);border:1px solid var(--cs-line);border-radius:12px;padding:10px 12px;margin:0 0 10px}
.cs-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.cs-name{font-weight:650;font-size:16px}
.cs-tags{color:var(--cs-muted);font-size:12px;white-space:nowrap}
.cs-list{list-style:none;margin:8px 0 0;padding:0}
.cs-row{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--cs-line)}
.cs-row:first-child{border-top:0}
.cs-rank{color:var(--cs-muted);font-size:13px;text-align:center}
.cs-card{font-weight:600}
.cs-meta{color:var(--cs-muted);font-size:12.5px}
.cs-meta .cs-up{color:var(--cs-good)}
.cs-meta .cs-warn{color:var(--cs-warn)}
.cs-mpd{text-align:right;font-variant-numeric:tabular-nums}
.cs-mpd b{font-size:19px}
.cs-mpd span{display:block;font-size:11.5px;color:var(--cs-muted)}
.cs-row.cs-base .cs-mpd b{color:var(--cs-muted)}
.cs-foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12px;color:var(--cs-muted)}
.cs-link{font:inherit;font-size:13px;color:var(--cs-accent);background:none;border:0;padding:4px 0;cursor:pointer}
.cs-empty{padding:24px 8px;text-align:center;color:var(--cs-muted)}
.cs-status{font-size:12px;color:var(--cs-muted);margin:2px 0 0}
`;

const METHOD_LABELS = {
  physical_tap: "Tap card",
  physical_insert: "Insert card",
  applepay_instore: "Apple Pay",
  applepay_inapp: "Apple Pay in app",
  card_online: "Card details online",
  amaze: "Via Amaze",
  heymax_voucher: "HeyMax voucher",
};

const PROGRAMMES = { KF: "KrisFlyer", AVIOS: "Avios", AM: "Asia Miles", CASH: "cash value" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "merchant", label: "Merchants" },
  { id: "category", label: "Categories" },
  { id: "online", label: "Online" },
  { id: "offline", label: "In store" },
  { id: "overseas", label: "Overseas" },
];

let unsubscribe = null;
let uiState = { query: "", filter: "all" };

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
  return clean(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function unwrap(x) {
  return x && typeof x === "object" && !Array.isArray(x) && "v" in x ? x.v : x;
}

function fmtMpd(n) {
  return typeof n === "number" && isFinite(n) ? n.toFixed(1) : "-";
}

function cardNameMap(app) {
  const map = {};
  const stackCards = (app.data && app.data.stack && app.data.stack.cards) || [];
  for (const c of stackCards) map[c.id] = c.docName || c.id;
  const ruleCards = (app.data && app.data.rules && app.data.rules.cards) || {};
  for (const [id, c] of Object.entries(ruleCards)) if (c && c.name) map[id] = c.name;
  return map;
}

// Build the list of entries to show. Prefers the stored profile; if the profile
// has no cheat sheet yet, derive entries from merchants.json so the screen is
// still useful on a fresh install.
function buildEntries(app) {
  const profile = (app.data && app.data.profile) || {};
  const stored = Array.isArray(profile.cheatSheet) ? profile.cheatSheet : [];
  if (stored.length) {
    const rankByKey = {};
    (profile.topMerchants || []).forEach((m, i) => {
      rankByKey[m.key] = m.rankValue != null ? m.rankValue : i + 1;
    });
    return stored.map((e) => normaliseEntry(e, rankByKey));
  }
  const out = [];
  const merchants = (app.data.merchants && app.data.merchants.merchants) || [];
  const topKeys = new Set((profile.topMerchants || []).map((m) => m.key));
  const pool = merchants.filter((m) => topKeys.size === 0 || topKeys.has(m.id));
  pool.slice(0, 60).forEach((m, i) => {
    const channels = m.channels || [];
    const channel = channels.length === 1 ? channels[0] : "offline";
    out.push(
      normaliseEntry(
        {
          key: m.id,
          displayName: m.displayName || m.id,
          template: { merchantId: m.id, merchantName: m.displayName || null, category: m.category || null, amount: 100, channel, currency: "SGD", location: "sg" },
          top3: [],
        },
        { [m.id]: i + 1 }
      )
    );
  });
  const cats = Object.keys((app.data.merchants && app.data.merchants.categoryDefaults) || {});
  for (const cat of cats) {
    for (const channel of ["offline", "online"]) {
      out.push(
        normaliseEntry(
          { key: `cat:${cat}:${channel}`, displayName: humanise(cat), template: { merchantId: null, category: cat, amount: 100, channel, currency: "SGD", location: "sg" }, top3: [] },
          {}
        )
      );
    }
  }
  return out;
}

function normaliseEntry(e, rankByKey) {
  const t = Object.assign({ merchantId: null, merchantName: null, category: null, amount: 100, channel: "offline", currency: "SGD", location: "sg" }, e.template || {});
  const isCategory = !t.merchantId && (String(e.key || "").startsWith("cat:") || !t.merchantName);
  return {
    key: e.key,
    displayName: clean(e.displayName || e.key),
    template: t,
    stored: Array.isArray(e.top3) ? e.top3 : [],
    kind: isCategory ? "category" : "merchant",
    rank: rankByKey[e.key] != null ? rankByKey[e.key] : 9999,
  };
}

function runLive(app, entry) {
  const engine = app.engine;
  if (!engine || typeof engine.decide !== "function") return null;
  const st = (app.store && app.store.get && app.store.get()) || {};
  const settings = st.settings || { centsPerMile: 1.5, feeThresholdCpm: 1.5, programmes: { KF: true, AVIOS: true, AM: true } };
  const deviceState = st.deviceState || { toggles: {}, capState: {}, notAccepted: {}, mccOverrides: {} };
  const purchase = Object.assign({ methodsAvailable: null }, entry.template, { amount: entry.template.amount || 100 });
  try {
    const res = engine.decide(purchase, app.data, settings, deviceState, app.today());
    if (!res || !Array.isArray(res.top3)) return null;
    return res.top3;
  } catch (err) {
    return null;
  }
}

function liveRow(r, names, idx) {
  const mpd = r.headline && r.headline.mpd;
  const prog = r.headline && r.headline.programme;
  const cond = r.scenario && r.scenario.conditional && r.scenario.conditional.mpd;
  const upTo = typeof cond === "number" && typeof mpd === "number" && cond > mpd + 0.049 ? cond : null;
  const meta = [r.methodLabel || METHOD_LABELS[r.method] || r.method];
  if (r.network) meta.push(humanise(r.network));
  const sub = h("div", { class: "cs-meta" }, meta.join(" | "));
  if (upTo !== null) sub.appendChild(h("div", { class: "cs-up" }, `Up to ${fmtMpd(upTo)} mpd if conditions met`));
  if (r.cap && r.capDiff > 0.049) sub.appendChild(h("div", null, `Outside cap: ${fmtMpd(r.outsideCapMpd)} mpd`));
  if (r.isZero) sub.appendChild(h("div", { class: "cs-warn" }, "No earn on this path"));
  else if (r.warnings && r.warnings.some((w) => w.code === "MCC_UNKNOWN_BONUS" || w.code === "MCC_UNKNOWN")) sub.appendChild(h("div", { class: "cs-warn" }, "Merchant code uncertain"));
  const progLabel = r.equivalent ? "equiv. " + (PROGRAMMES[prog] || prog || "") : PROGRAMMES[prog] || prog || "";
  return h(
    "li",
    { class: "cs-row" + (r.isBaseRate ? " cs-base" : "") },
    h("div", { class: "cs-rank" }, String(idx + 1)),
    h("div", null, h("div", { class: "cs-card" }, clean(r.name || names[r.cardId] || r.cardId)), sub),
    h("div", { class: "cs-mpd" }, h("b", null, fmtMpd(mpd)), h("span", null, `mpd ${progLabel}`.trim()))
  );
}

function storedRow(s, names, idx) {
  const progLabel = PROGRAMMES[s.programme] || s.programme || "";
  return h(
    "li",
    { class: "cs-row" },
    h("div", { class: "cs-rank" }, String(idx + 1)),
    h("div", null, h("div", { class: "cs-card" }, clean(names[s.cardId] || s.cardId)), h("div", { class: "cs-meta" }, METHOD_LABELS[s.method] || humanise(s.method || ""))),
    h("div", { class: "cs-mpd" }, h("b", null, fmtMpd(s.mpd)), h("span", null, `mpd ${progLabel}`.trim()))
  );
}

function tagsFor(t) {
  const bits = [t.channel === "online" ? "Online" : "In store"];
  bits.push(t.currency || "SGD");
  if (t.location === "overseas") bits.push("Overseas");
  return bits.join(" | ");
}

function matches(entry, query, filter) {
  const t = entry.template;
  if (filter === "merchant" && entry.kind !== "merchant") return false;
  if (filter === "category" && entry.kind !== "category") return false;
  if (filter === "online" && t.channel !== "online") return false;
  if (filter === "offline" && t.channel === "online") return false;
  if (filter === "overseas" && !(t.location === "overseas" || (t.currency && t.currency !== "SGD"))) return false;
  if (!query) return true;
  const hay = [entry.displayName, entry.key, t.category, t.merchantName, t.merchantId, t.channel, t.currency].filter(Boolean).join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function renderList(listEl, statusEl, app, entries) {
  listEl.textContent = "";
  const names = cardNameMap(app);
  const visible = entries.filter((e) => matches(e, uiState.query, uiState.filter));
  let liveCount = 0;
  let storedCount = 0;
  if (!visible.length) {
    listEl.appendChild(h("div", { class: "cs-empty" }, entries.length ? "Nothing matches that search." : "The cheat sheet is empty. Build the spend profile to populate it."));
  }
  const groups = [
    { id: "merchant", title: "Merchants" },
    { id: "category", title: "Categories" },
  ];
  for (const g of groups) {
    const items = visible.filter((e) => e.kind === g.id).sort((a, b) => (g.id === "merchant" ? a.rank - b.rank : a.displayName.localeCompare(b.displayName)) || a.displayName.localeCompare(b.displayName));
    if (!items.length) continue;
    listEl.appendChild(h("div", { class: "cs-group" }, `${g.title} (${items.length})`));
    for (const entry of items) {
      const live = runLive(app, entry);
      let rows;
      if (live && live.length) {
        liveCount++;
        rows = live.map((r, i) => liveRow(r, names, i));
      } else {
        storedCount++;
        rows = entry.stored.map((s, i) => storedRow(s, names, i));
        if (!rows.length) rows = [h("li", { class: "cs-row" }, h("div"), h("div", { class: "cs-meta" }, "No result available"), h("div"))];
      }
      const open = h(
        "button",
        {
          class: "cs-link",
          type: "button",
          onclick: () => {
            if (app.navigate) app.navigate("decide", Object.assign({ from: "cheatsheet" }, entry.template));
          },
        },
        "Open in Decide"
      );
      listEl.appendChild(
        h(
          "section",
          { class: "cs-entry", "aria-label": entry.displayName },
          h("div", { class: "cs-head" }, h("div", { class: "cs-name" }, entry.displayName), h("div", { class: "cs-tags" }, tagsFor(entry.template))),
          h("ol", { class: "cs-list" }, rows),
          h("div", { class: "cs-foot" }, h("span", null, `Based on S$${entry.template.amount || 100}${live && live.length ? "" : " (stored values)"}`), open)
        )
      );
    }
  }
  statusEl.textContent = !visible.length
    ? ""
    : storedCount && !liveCount
    ? "Showing stored values: the live engine is not available."
    : `Live from your current toggles and cap settings. ${visible.length} shown.`;
}

export default {
  id: "cheatsheet",
  title: "Cheat sheet",
  render(root, app, params) {
    injectStyle();
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (e) {
        /* ignore */
      }
      unsubscribe = null;
    }
    root.textContent = "";
    if (params && typeof params.query === "string") uiState.query = params.query;

    const entries = buildEntries(app);
    const listEl = h("div", { class: "cs-results", "aria-live": "polite" });
    const statusEl = h("p", { class: "cs-status" });
    const input = h("input", {
      type: "search",
      placeholder: "Search merchant or category",
      "aria-label": "Search the cheat sheet",
      autocomplete: "off",
      value: uiState.query,
    });
    input.value = uiState.query;
    let timer = null;
    input.addEventListener("input", () => {
      uiState.query = input.value;
      clearTimeout(timer);
      timer = setTimeout(() => renderList(listEl, statusEl, app, entries), 80);
    });

    const chipBox = h("div", { class: "cs-chips", role: "group", "aria-label": "Filter" });
    const chipEls = FILTERS.map((f) => {
      const b = h("button", { class: "cs-chip", type: "button", "aria-pressed": String(uiState.filter === f.id) }, f.label);
      b.addEventListener("click", () => {
        uiState.filter = f.id;
        chipEls.forEach((c, i) => c.setAttribute("aria-pressed", String(FILTERS[i].id === f.id)));
        renderList(listEl, statusEl, app, entries);
      });
      return b;
    });
    chipEls.forEach((c) => chipBox.appendChild(c));

    const wrap = h(
      "div",
      { class: "cs-root" },
      h("h2", null, "Cheat sheet"),
      h("p", { class: "cs-sub" }, "Best three cards for each merchant or category, worked out from your current toggles."),
      h("div", { class: "cs-search" }, input, chipBox),
      statusEl,
      listEl
    );
    root.appendChild(wrap);
    renderList(listEl, statusEl, app, entries);

    if (app.store && typeof app.store.subscribe === "function") {
      let pending = null;
      const off = app.store.subscribe(() => {
        if (!wrap.isConnected) {
          if (typeof off === "function") off();
          return;
        }
        clearTimeout(pending);
        pending = setTimeout(() => renderList(listEl, statusEl, app, entries), 50);
      });
      unsubscribe = typeof off === "function" ? off : null;
    }
  },
};
