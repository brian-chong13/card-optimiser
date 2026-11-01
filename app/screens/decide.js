// Decide screen: enter a purchase, see the best three cards.

import {
  el, clear, fmtMpd, sgd, chip, segmented, progName, titleCase, networkName, icon, emptyState,
  PERIOD_LABEL, storedToggle, setToggle, storedCap, setCap,
} from '../ui.js';

const METHODS = {
  offline: [
    ['physical_tap', 'Tap card'],
    ['physical_insert', 'Insert card'],
    ['applepay_instore', 'Apple Pay'],
    ['amaze', 'Via Amaze'],
    ['heymax_voucher', 'HeyMax voucher'],
  ],
  online: [
    ['card_online', 'Card details online'],
    ['applepay_inapp', 'Apple Pay in app'],
    ['amaze', 'Via Amaze'],
    ['heymax_voucher', 'HeyMax voucher'],
  ],
};

const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'MYR', 'THB', 'HKD', 'CNY', 'TWD', 'KRW', 'IDR', 'PHP', 'VND', 'CHF', 'BHD', 'AED'];
const CATEGORY_FALLBACK = [
  'dining', 'groceries', 'transport', 'travel', 'online_shopping', 'department_store', 'utilities',
  'insurance', 'entertainment_events', 'telecoms', 'fuel', 'healthcare', 'education',
];

let S = null; // input state, kept while the app is open
const expanded = new Set(); // card ids with details open
let showAll = false;
let mccEdit = false;

function defaultState() {
  return {
    query: '', merchantId: null, category: '', amount: '', channel: 'offline',
    currency: 'SGD', currencyOther: '', location: 'sg', locationManual: false, methodsOff: [],
  };
}

function words(s) {
  return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

function matchKey(s) {
  return String(s || '').trim().toLowerCase();
}

export default {
  id: 'decide',
  title: 'Which card?',

  render(root, app) {
    const { store, engine } = app;
    const merchantsList = app.data.merchants.merchants || [];
    const byId = {};
    const index = merchantsList.map((m) => {
      byId[m.id] = m;
      const names = [m.displayName, ...(Array.isArray(m.names) ? m.names : [])].filter(Boolean).map(matchKey);
      return { m, names };
    });
    const topList = app.data.profile.topMerchants || [];
    const topByKey = {};
    for (const t of topList) topByKey[matchKey(t.key)] = t;
    const categories = Object.keys(app.data.merchants.categoryDefaults || {});
    const catList = categories.length ? categories : CATEGORY_FALLBACK;

    if (!S) {
      S = Object.assign(defaultState(), store.get().lastInput || {});
      if (!Array.isArray(S.methodsOff)) S.methodsOff = [];
      if (S.merchantId && !byId[S.merchantId]) S.merchantId = null;
    }

    function persist() {
      store.update((s) => {
        s.lastInput = JSON.parse(JSON.stringify(S));
      });
    }

    function curCode() {
      return S.currency === 'OTHER' ? (S.currencyOther || '').toUpperCase().slice(0, 3) || 'SGD' : S.currency;
    }

    function findExact(q) {
      const k = matchKey(q);
      if (!k) return null;
      const hit = index.find((x) => x.names.includes(k));
      return hit ? hit.m : null;
    }

    function suggestions(q) {
      const k = matchKey(q);
      if (!k) return [];
      const scored = [];
      for (const x of index) {
        let best = -1;
        for (const n of x.names) {
          if (n.startsWith(k)) best = Math.max(best, 3);
          else if (n.split(/\s+/).some((w) => w.startsWith(k))) best = Math.max(best, 2);
          else if (n.includes(k)) best = Math.max(best, 1);
        }
        if (best > 0) scored.push({ best, m: x.m });
      }
      scored.sort((a, b) => b.best - a.best || String(a.m.displayName).localeCompare(String(b.m.displayName)));
      return scored.slice(0, 6).map((s) => s.m);
    }

    function autoLocation() {
      if (S.locationManual) return;
      S.location = curCode() !== 'SGD' ? 'overseas' : 'sg';
    }

    function applyUsual(rec) {
      if (!rec) return;
      if (rec.channel === 'online' || rec.channel === 'offline') S.channel = rec.channel;
      if (rec.currency && typeof rec.currency === 'string') {
        const c = rec.currency.toUpperCase();
        if (CURRENCIES.includes(c)) {
          S.currency = c;
          S.currencyOther = '';
        } else {
          S.currency = 'OTHER';
          S.currencyOther = c;
        }
      }
      S.locationManual = false;
      autoLocation();
    }

    function selectMerchant(m, rec) {
      S.merchantId = m.id;
      S.query = m.displayName || m.id;
      S.category = '';
      const ch = Array.isArray(m.channels) ? m.channels.filter((c) => c === 'online' || c === 'offline') : [];
      if (ch.length && !ch.includes(S.channel)) S.channel = ch[0];
      applyUsual(rec || topByKey[matchKey(m.id)] || null);
      mccEdit = false;
      recordRecent();
      syncAll();
      if (!S.amount) amountInput.focus();
    }

    function selectFreeText(name, rec) {
      S.merchantId = null;
      S.query = name;
      S.category = (rec && rec.category) || '';
      applyUsual(rec);
      mccEdit = false;
      recordRecent();
      syncAll();
      if (!S.amount) amountInput.focus();
    }

    function currentKey() {
      if (S.merchantId) return S.merchantId;
      const q = matchKey(S.query);
      return q || null;
    }

    function recordRecent() {
      const key = currentKey();
      if (!key) return;
      store.update((s) => {
        s.recent = [key, ...s.recent.filter((k) => k !== key)].slice(0, 12);
      });
    }

    function keyLabel(key) {
      if (byId[key]) return byId[key].displayName || key;
      const t = topByKey[matchKey(key)];
      return t && t.displayName ? t.displayName : words(key);
    }

    function pickKey(key) {
      if (byId[key]) return selectMerchant(byId[key]);
      const rec = topByKey[matchKey(key)];
      const hit = findExact(key);
      if (hit) return selectMerchant(hit, rec);
      return selectFreeText(rec && rec.displayName ? rec.displayName : words(key), rec);
    }

    // ---------- build static input DOM ----------
    const input = el('input', {
      class: 'input input-lg', type: 'text', id: 'merchant', placeholder: 'Merchant, e.g. Grab',
      autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Merchant',
      value: S.query,
    });
    const clearBtn = el('button', {
      type: 'button', class: 'icon-btn input-clear', 'aria-label': 'Clear merchant',
      onClick: () => {
        S.query = '';
        S.merchantId = null;
        S.category = '';
        mccEdit = false;
        input.value = '';
        syncAll();
        input.focus();
      },
    }, icon('close', 20));
    const suggEl = el('div', { class: 'sugg', role: 'listbox' });
    const chipsEl = el('div', { class: 'chip-strip', 'aria-label': 'Quick merchants' });
    const catWrap = el('div', { class: 'field cat-field' });

    input.addEventListener('input', () => {
      S.query = input.value;
      const hit = findExact(S.query);
      S.merchantId = hit ? hit.id : null;
      if (hit) {
        const ch = Array.isArray(hit.channels) ? hit.channels.filter((c) => c === 'online' || c === 'offline') : [];
        if (ch.length && !ch.includes(S.channel)) {
          S.channel = ch[0];
          autoLocation();
        }
      }
      mccEdit = false;
      syncAll(true);
    });
    input.addEventListener('blur', () => setTimeout(recordRecentIfReady, 150));
    function recordRecentIfReady() {
      if (matchKey(S.query)) recordRecent();
    }

    const amountInput = el('input', {
      class: 'input input-xl num', type: 'text', inputmode: 'decimal', id: 'amount', placeholder: '0.00',
      autocomplete: 'off', 'aria-label': 'Amount in Singapore dollars', value: S.amount,
    });
    amountInput.addEventListener('input', () => {
      let v = amountInput.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
      const dot = v.indexOf('.');
      if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
      if (v !== amountInput.value) amountInput.value = v;
      S.amount = v;
      persist();
      scheduleResults();
    });
    amountInput.addEventListener('blur', recordRecentIfReady);

    const amountLabel = el('label', { class: 'label', for: 'amount' });
    const currencySel = el('select', { class: 'select', 'aria-label': 'Currency' },
      CURRENCIES.map((c) => el('option', { value: c }, c)),
      el('option', { value: 'OTHER' }, 'Other'),
    );
    currencySel.value = S.currency;
    const otherInput = el('input', {
      class: 'input input-code', type: 'text', maxlength: '3', placeholder: 'ABC', autocapitalize: 'characters',
      'aria-label': 'Currency code', value: S.currencyOther,
    });
    currencySel.addEventListener('change', () => {
      S.currency = currencySel.value;
      S.locationManual = false;
      autoLocation();
      syncAll();
    });
    otherInput.addEventListener('input', () => {
      S.currencyOther = otherInput.value.toUpperCase().replace(/[^A-Z]/g, '');
      otherInput.value = S.currencyOther;
      S.locationManual = false;
      autoLocation();
      syncControls();
      persist();
      scheduleResults();
    });

    const channelSeg = el('div', { class: 'grow' });
    const locationSeg = el('div', { class: 'grow' });
    const methodsWrap = el('div', { class: 'methods' });
    const resultsEl = el('div', { class: 'results', 'aria-live': 'polite' });

    const merchantField = el('div', { class: 'field merchant-field' },
      el('label', { class: 'label', for: 'merchant' }, 'Where are you paying?'),
      el('div', { class: 'input-wrap' }, input, clearBtn),
      suggEl, chipsEl, catWrap,
    );
    const amountField = el('div', { class: 'field' },
      amountLabel,
      el('div', { class: 'amount-row' }, amountInput, currencySel, otherInput),
    );
    const switches = el('div', { class: 'switch-row' },
      el('div', { class: 'field grow' }, el('span', { class: 'label' }, 'How'), channelSeg),
      el('div', { class: 'field grow' }, el('span', { class: 'label' }, 'Where'), locationSeg),
    );

    const panel = el('div', { class: 'panel' }, merchantField, amountField, switches, methodsWrap);
    clear(root);
    root.append(panel, resultsEl);

    // ---------- sync of dynamic bits ----------
    function syncSuggestions() {
      clear(suggEl);
      const q = matchKey(S.query);
      if (!q || S.merchantId) {
        suggEl.hidden = true;
        return;
      }
      const list = suggestions(S.query);
      suggEl.hidden = list.length === 0;
      for (const m of list) {
        suggEl.appendChild(el('button', {
          type: 'button', class: 'sugg-item', role: 'option',
          onClick: () => {
            input.value = m.displayName;
            selectMerchant(m);
          },
        }, el('span', null, m.displayName), el('span', { class: 'muted small' }, titleCase(m.category || ''))));
      }
    }

    function syncChips() {
      clear(chipsEl);
      const q = matchKey(S.query);
      if (q) {
        chipsEl.hidden = true;
        return;
      }
      const st = store.get();
      const seen = new Set();
      const items = [];
      const add = (key, kind) => {
        const k = matchKey(key);
        if (!k || seen.has(k)) return;
        seen.add(k);
        items.push({ key, kind });
      };
      st.favourites.forEach((k) => add(k, 'fav'));
      st.recent.forEach((k) => add(k, 'recent'));
      topList.forEach((t) => add(t.key, 'top'));
      const shown = items.slice(0, 14);
      chipsEl.hidden = shown.length === 0;
      for (const it of shown) {
        chipsEl.appendChild(chip(keyLabel(it.key), {
          kind: it.kind === 'fav' ? 'fav' : it.kind === 'recent' ? 'recent' : '',
          onClick: () => {
            const k = it.key;
            pickKey(k);
            input.value = S.query;
          },
        }));
      }
    }

    function syncCategory() {
      clear(catWrap);
      const q = matchKey(S.query);
      if (!q || S.merchantId) {
        catWrap.hidden = true;
        return;
      }
      catWrap.hidden = false;
      const sel = el('select', { class: 'select', id: 'category', 'aria-label': 'Type of spend' },
        el('option', { value: '' }, 'Not sure'),
        catList.map((c) => el('option', { value: c }, titleCase(c))),
      );
      sel.value = S.category || '';
      sel.addEventListener('change', () => {
        S.category = sel.value;
        persist();
        scheduleResults(true);
      });
      catWrap.append(
        el('label', { class: 'label', for: 'category' }, 'Not in my list. What kind of spend is it?'),
        sel,
      );
    }

    function syncControls() {
      const code = curCode();
      amountLabel.textContent = code === 'SGD' ? 'Amount (S$)' : `Amount in S$ (your estimate of the charge, in ${code})`;
      otherInput.hidden = S.currency !== 'OTHER';
      currencySel.value = S.currency;
      clear(channelSeg);
      channelSeg.appendChild(segmented({
        label: 'Channel',
        options: [{ value: 'offline', label: 'In store' }, { value: 'online', label: 'Online' }],
        value: S.channel,
        onChange: (v) => {
          S.channel = v;
          autoLocation();
          syncAll();
        },
      }));
      clear(locationSeg);
      locationSeg.appendChild(segmented({
        label: 'Location',
        options: [{ value: 'sg', label: 'Singapore' }, { value: 'overseas', label: 'Overseas' }],
        value: S.location,
        onChange: (v) => {
          S.location = v;
          S.locationManual = true;
          syncAll();
        },
      }));
      syncMethods();
    }

    let methodsOpen = false;
    function syncMethods() {
      clear(methodsWrap);
      const list = METHODS[S.channel];
      const off = list.filter(([id]) => S.methodsOff.includes(id));
      const summary = off.length ? `Payment methods (${list.length - off.length} of ${list.length} on)` : 'Payment methods (all on)';
      methodsWrap.append(
        el('button', {
          type: 'button', class: 'link-btn', 'aria-expanded': String(methodsOpen),
          onClick: () => {
            methodsOpen = !methodsOpen;
            syncMethods();
          },
        }, summary, el('span', { class: `caret ${methodsOpen ? 'open' : ''}` }, icon('chevron', 16))),
      );
      if (methodsOpen) {
        const row = el('div', { class: 'chips' });
        for (const [id, label] of list) {
          const on = !S.methodsOff.includes(id);
          row.appendChild(chip(label, {
            pressed: on,
            onClick: () => {
              S.methodsOff = on ? [...S.methodsOff, id] : S.methodsOff.filter((x) => x !== id);
              syncMethods();
              persist();
              scheduleResults(true);
            },
          }));
        }
        methodsWrap.append(row, el('p', { class: 'muted small' }, 'Turn off anything you cannot use at this merchant.'));
      }
    }

    function syncAll(keepInput) {
      if (!keepInput) input.value = S.query;
      amountInput.value = S.amount;
      syncSuggestions();
      syncChips();
      syncCategory();
      syncControls();
      persist();
      scheduleResults(true);
    }

    // ---------- purchase and results ----------
    function buildPurchase(amount) {
      const valid = METHODS[S.channel].map(([id]) => id);
      const on = valid.filter((id) => !S.methodsOff.includes(id));
      return {
        merchantId: S.merchantId || null,
        merchantName: S.merchantId ? null : S.query.trim() || null,
        category: S.merchantId ? null : S.category || null,
        amount,
        channel: S.channel === 'offline' ? 'offline' : 'online',
        currency: curCode(),
        location: S.location,
        methodsAvailable: on.length === valid.length ? null : on,
      };
    }

    let timer = null;
    function scheduleResults(now) {
      clearTimeout(timer);
      if (now) refreshResults();
      else timer = setTimeout(refreshResults, 90);
    }

    function stackCard(id) {
      return app.data.stack.cards.find((c) => c.id === id) || null;
    }

    function refreshResults() {
      clear(resultsEl);
      const amount = parseFloat(S.amount);
      if (!(amount > 0)) {
        resultsEl.appendChild(emptyState('Enter an amount to see the best card', 'Pick a merchant, type the amount, and the ranking appears here.'));
        return;
      }
      const purchase = buildPurchase(amount);
      const st = store.get();
      let out;
      try {
        out = engine.decide(purchase, app.data, st.settings, st.deviceState, app.today());
      } catch (e) {
        console.error(e);
        resultsEl.appendChild(emptyState('Could not work that out', String(e && e.message ? e.message : e)));
        return;
      }
      const ctx = { app, purchase, out, amount, st, stackCard, refresh: () => refreshResults() };
      resultsEl.appendChild(merchantLine(ctx));
      if (!out.ranked.length) {
        resultsEl.appendChild(emptyState('No card is available for this payment', 'Check the payment methods above, or clear the not-accepted list in Settings.'));
      }
      const hasAny = METHODS[S.channel].some(([id]) => !S.methodsOff.includes(id));
      if (!hasAny) {
        resultsEl.appendChild(el('p', { class: 'note warn' }, 'All payment methods are switched off. Turn at least one on.'));
      }
      out.top3.forEach((r, i) => resultsEl.appendChild(resultCard(r, i + 1, ctx)));
      const rest = out.ranked.slice(3);
      if (rest.length) {
        if (!showAll) {
          resultsEl.appendChild(el('button', {
            type: 'button', class: 'btn btn-ghost btn-block',
            onClick: () => {
              showAll = true;
              refreshResults();
            },
          }, `Show the other ${rest.length} card${rest.length === 1 ? '' : 's'}`));
        } else {
          rest.forEach((r, i) => resultsEl.appendChild(resultCard(r, i + 4, ctx)));
          resultsEl.appendChild(el('button', {
            type: 'button', class: 'btn btn-ghost btn-block',
            onClick: () => {
              showAll = false;
              refreshResults();
            },
          }, 'Hide the others'));
        }
      }
      resultsEl.appendChild(excludedBlock(ctx));
      const gw = (out.warnings || []).filter((w) => w && w.text);
      if (gw.length) {
        const seen = new Set();
        resultsEl.appendChild(el('div', { class: 'notes' }, gw.filter((w) => !seen.has(w.text) && seen.add(w.text)).map((w) => noteLine(w))));
      }
    }

    function noteLine(w) {
      return el('p', { class: 'note', 'data-code': w.code || null }, el('span', { class: 'dot' }), el('span', null, w.text));
    }

    function merchantLine(ctx) {
      const { out } = ctx;
      const m = out.merchant || {};
      const key = m.key || currentKey();
      const isFav = key && ctx.st.favourites.includes(key);
      const conf = m.confidence || 'none';
      const lowConf = conf === 'low' || conf === 'none';
      const row = el('div', { class: 'merchant-line' },
        el('div', { class: 'ml-main' },
          el('strong', null, m.displayName || S.query || 'Unknown merchant'),
          el('span', { class: 'muted small' },
            m.mcc ? `MCC ${m.mcc}` : 'MCC unknown', ' ',
            chip(conf === 'override' ? 'your override' : `${conf} confidence`, { kind: lowConf ? 'warn' : 'quiet' })),
        ),
        el('div', { class: 'ml-actions' },
          el('button', {
            type: 'button', class: 'link-small',
            onClick: () => {
              mccEdit = !mccEdit;
              refreshResults();
            },
          }, 'Change MCC'),
          key ? el('button', {
            type: 'button', class: `icon-btn star ${isFav ? 'is-on' : ''}`,
            'aria-label': isFav ? 'Remove from favourites' : 'Add to favourites', 'aria-pressed': String(!!isFav),
            onClick: () => {
              store.update((s) => {
                s.favourites = isFav ? s.favourites.filter((k) => k !== key) : [key, ...s.favourites];
              });
              syncChips();
              refreshResults();
            },
          }, icon('star', 22)) : null,
        ),
      );
      const wrap = el('div', { class: 'ml-wrap' }, row);
      if (mccEdit && key) {
        const cur = ctx.st.deviceState.mccOverrides[key] || '';
        const mccInput = el('input', {
          class: 'input', type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '4 digits, e.g. 5812',
          'aria-label': 'MCC override', value: cur,
        });
        wrap.appendChild(el('div', { class: 'mcc-edit' },
          mccInput,
          el('button', {
            type: 'button', class: 'btn btn-primary',
            onClick: () => {
              const v = mccInput.value.replace(/\D/g, '');
              if (v.length !== 4) {
                mccInput.setAttribute('aria-invalid', 'true');
                return;
              }
              store.update((s) => {
                s.deviceState.mccOverrides[key] = v;
              });
              mccEdit = false;
              refreshResults();
            },
          }, 'Save'),
          cur ? el('button', {
            type: 'button', class: 'btn btn-ghost',
            onClick: () => {
              store.update((s) => {
                delete s.deviceState.mccOverrides[key];
              });
              mccEdit = false;
              refreshResults();
            },
          }, 'Remove') : null,
        ));
      }
      return wrap;
    }

    function excludedBlock(ctx) {
      const { out, st } = ctx;
      const list = out.excluded || [];
      if (!list.length) return el('span');
      const key = out.merchant && out.merchant.key;
      const names = {};
      for (const c of app.data.stack.cards) names[c.id] = c.docName;
      const body = el('div', { class: 'excluded-body' });
      for (const x of list) {
        const mine = key && (st.deviceState.notAccepted[key] || []).includes(x.cardId);
        body.appendChild(el('div', { class: 'excluded-row' },
          el('div', null, el('strong', null, (app.data.rules.cards[x.cardId] && app.data.rules.cards[x.cardId].name) || names[x.cardId] || x.cardId),
            el('div', { class: 'muted small' }, x.reason || 'Not available')),
          mine ? el('button', {
            type: 'button', class: 'btn btn-small btn-ghost',
            onClick: () => {
              store.update((s) => {
                const arr = (s.deviceState.notAccepted[key] || []).filter((c) => c !== x.cardId);
                if (arr.length) s.deviceState.notAccepted[key] = arr;
                else delete s.deviceState.notAccepted[key];
              });
              refreshResults();
            },
          }, 'Undo') : null));
      }
      return el('details', { class: 'excluded' },
        el('summary', null, `Not available here (${list.length})`), body);
    }

    function resultCard(res, rank, ctx) {
      const top = rank === 1;
      const compact = rank > 3;
      const open = expanded.has(res.cardId);
      const hl = res.headline || {};
      const sc = ctx.stackCard(res.cardId);
      const art = el('article', { class: `res ${top ? 'res-top' : 'res-sub'} ${compact ? 'res-compact' : ''} ${res.isZero ? 'is-zero' : ''}`, 'data-card': res.cardId });

      function toggleOpen() {
        if (open) expanded.delete(res.cardId);
        else expanded.add(res.cardId);
        ctx.refresh();
      }
      const head = el('button', {
        type: 'button', class: 'res-head', 'aria-expanded': String(open),
        'aria-label': `${res.name}, ${fmtMpd(hl.mpd)} miles per dollar. Show details`,
        onClick: toggleOpen,
      },
        el('span', { class: 'rank' }, String(rank)),
        el('span', { class: 'res-id' },
          el('span', { class: 'res-name' }, res.name),
          el('span', { class: 'res-meta' },
            chip(res.methodLabel || res.method, { kind: 'method' }),
            chip(networkName(res.network), { kind: 'quiet' }),
            res.isBaseRate && !res.isZero ? chip('Base rate', { kind: 'quiet' }) : null,
            res.isZero ? chip('No miles', { kind: 'warn' }) : null,
          )),
        el('span', { class: 'res-mpd' },
          el('span', { class: 'num mpd-num' }, fmtMpd(hl.mpd)),
          el('span', { class: 'mpd-unit' }, 'mpd ', progName(hl.programme)),
          res.equivalent && hl.programme !== 'CASH' ? el('span', { class: 'mpd-unit' }, 'incl. cash value') : (res.equivalent ? el('span', { class: 'mpd-unit' }, 'from cashback') : null)),
      );
      art.appendChild(head);

      const body = el('div', { class: 'res-body' });
      if (!compact) {
        const capBlock = capView(res, ctx);
        if (capBlock) body.appendChild(capBlock);
        if (res.straddle) {
          const s = res.straddle;
          body.appendChild(el('div', { class: 'straddle' },
            el('strong', null, 'This purchase crosses the cap'),
            el('div', { class: 'kv' }, el('span', null, `${sgd(s.withinSgd)} at`), el('span', { class: 'num' }, `${fmtMpd(res.withinCapMpd)} mpd`)),
            el('div', { class: 'kv' }, el('span', null, `${sgd(s.outsideSgd)} at`), el('span', { class: 'num' }, `${fmtMpd(res.outsideCapMpd)} mpd`)),
            el('div', { class: 'kv strong' }, el('span', null, 'Blended'), el('span', { class: 'num' }, `${fmtMpd(s.blendedMpd)} mpd`)),
          ));
        }
        const conds = (res.conditions || []).filter((c) => c && c.key);
        if (conds.length) {
          const row = el('div', { class: 'conds' });
          for (const c of conds) row.appendChild(condChip(c, res, sc, ctx));
          body.appendChild(row);
        }
        const fees = res.fees || {};
        if (fees.totalSgd > 0) {
          body.appendChild(el('p', { class: `fees ${fees.flagged ? 'flag' : ''}` },
            `Fees ${sgd(fees.totalSgd, 2)}${fees.estimate ? ' (estimate)' : ''}`,
            fees.centsPerMile != null ? el('span', { class: 'num' }, ` ${fees.centsPerMile.toFixed(1)} cents per mile`) : null,
            fees.flagged ? ' - above your limit' : ''));
        }
        if (res.equivalent) {
          body.appendChild(el('p', { class: 'muted small' }, `Cash rewards shown as miles at ${ctx.st.settings.centsPerMile} cents per mile.`));
        }
        const ws = dedupeWarnings(res.warnings);
        const showWs = top || open ? ws : [];
        if (showWs.length) body.appendChild(el('div', { class: 'notes' }, showWs.map(noteLine)));
        else if (ws.length) body.appendChild(el('p', { class: 'muted small' }, `${ws.length} note${ws.length === 1 ? '' : 's'}. Tap to read.`));
      }

      if (open) {
        body.appendChild(progTable(res, ctx));
        const fb = (res.basisFlags || []).filter(Boolean);
        if (fb.length) {
          body.appendChild(el('div', { class: 'notes' },
            el('p', { class: 'muted small' }, 'How sure the rule is:'),
            fb.map((f) => el('p', { class: 'note' }, el('span', { class: 'dot' }), el('span', null, String(f))))));
        }
        const fee = res.fees || {};
        if (fee.totalSgd > 0 && (fee.fcySgd || fee.layerSgd)) {
          body.appendChild(el('p', { class: 'muted small' },
            `Fee breakdown: foreign currency ${sgd(fee.fcySgd || 0, 2)}, payment layer ${sgd(fee.layerSgd || 0, 2)}.`));
        }
      }

      const actions = el('div', { class: 'res-actions' },
        el('button', {
          type: 'button', class: 'btn btn-small btn-ghost',
          onClick: () => {
            const key = engine.notAcceptedKey ? engine.notAcceptedKey(ctx.purchase) : currentKey();
            if (!key) return;
            store.update((s) => {
              const arr = s.deviceState.notAccepted[key] || [];
              if (!arr.includes(res.cardId)) arr.push(res.cardId);
              s.deviceState.notAccepted[key] = arr;
            });
            ctx.refresh();
          },
        }, 'Not accepted here'),
        el('button', {
          type: 'button', class: 'btn btn-small btn-ghost',
          onClick: toggleOpen,
        }, open ? 'Hide details' : 'All programmes'),
      );
      if (body.childNodes.length) art.appendChild(body);
      art.appendChild(actions);
      return art;
    }

    function dedupeWarnings(ws) {
      const seen = new Set();
      return (ws || []).filter((w) => w && w.text && !seen.has(w.text) && seen.add(w.text));
    }

    function capView(res) {
      const cap = res.cap;
      if (!cap) return null;
      const period = PERIOD_LABEL[cap.period] ? PERIOD_LABEL[cap.period].toLowerCase() : '';
      const capText = cap.capacitySgd && isFinite(cap.capacitySgd) ? `${sgd(cap.capacitySgd)} of spend` : 'Spend cap';
      const diff = typeof res.capDiff === 'number' ? Math.abs(res.capDiff) : Math.abs((res.withinCapMpd || 0) - (res.outsideCapMpd || 0));
      const st = ctxCapState(res);
      const wrap = el('div', { class: 'cap' },
        el('div', { class: 'cap-title' }, el('span', null, 'Bonus cap'), el('span', { class: 'muted small' }, `${capText}${period ? `, ${period}` : ''}`)));
      if (diff >= 0.05) {
        wrap.append(
          el('div', { class: 'kv' }, el('span', null, 'Within cap'), el('span', { class: 'num' }, `${fmtMpd(res.withinCapMpd)} mpd`)),
          el('div', { class: 'kv' }, el('span', null, 'Outside cap'), el('span', { class: 'num' }, `${fmtMpd(res.outsideCapMpd)} mpd`)),
          el('div', { class: 'kv strong' }, el('span', null, 'Difference'), el('span', { class: 'num' }, `${fmtMpd(diff)} mpd`)),
        );
      }
      wrap.appendChild(el('p', { class: 'muted small' }, `Cap marked as: ${st}. `,
        el('button', { type: 'button', class: 'text-link', onClick: () => app.navigate('toggles') }, 'Change')));
      return wrap;
    }

    function ctxCapState(res) {
      const sc = stackCard(res.cardId);
      const cap = res.cap;
      const rec = cap ? storedCap(app, res.cardId, cap.id, sc, cap.period) : null;
      if (!rec) return 'plenty left';
      if (rec.state === 'used') return 'probably used';
      if (rec.state === 'room') return `about ${sgd(rec.roomSgd || 0)} left`;
      return 'plenty left';
    }

    function condChip(c, res, sc, ctx) {
      const state = c.state === true ? 'yes' : c.state === false ? 'no' : 'unset';
      const stateText = state === 'yes' ? 'Yes' : state === 'no' ? 'No' : 'Not set';
      let hint = '';
      if (state !== 'yes' && typeof c.conditionalMpd === 'number' && typeof c.fallbackMpd === 'number'
        && c.conditionalMpd - c.fallbackMpd >= 0.05) {
        hint = state === 'unset' ? `up to ${fmtMpd(c.conditionalMpd)} if met` : `${fmtMpd(c.conditionalMpd)} if met`;
      }
      return el('button', {
        type: 'button', class: `cond cond-${state}`,
        'aria-label': `${c.label}: ${stateText}. Tap to change.`,
        onClick: (ev) => {
          ev.stopPropagation();
          cycleCondition(c, res, sc);
          ctx.refresh();
        },
      },
        el('span', { class: 'cond-top' }, el('span', null, c.label), el('strong', null, stateText)),
        hint ? el('span', { class: 'cond-hint num' }, hint) : null);
    }

    function cycleCondition(c, res, sc) {
      if (String(c.key).startsWith('cap:')) {
        const capId = c.key.slice(4);
        const cur = storedCap(app, res.cardId, capId, sc, c.period);
        const used = cur && cur.state === 'used';
        setCap(app, res.cardId, capId, used ? null : 'used', 0, sc, c.period);
        return;
      }
      const stored = storedToggle(app, res.cardId, c.key, sc, c.period);
      if (!stored) setToggle(app, res.cardId, c.key, c.state === true ? false : true, sc, c.period);
      else if (stored.value === true) setToggle(app, res.cardId, c.key, false, sc, c.period);
      else setToggle(app, res.cardId, c.key, null, sc, c.period);
    }

    function progTable(res, ctx) {
      const fb = (res.scenario && res.scenario.fallback) || {};
      const cd = (res.scenario && res.scenario.conditional) || {};
      const enabled = ctx.st.settings.programmes || {};
      const codes = Object.keys(fb.byProgramme || {}).filter((c) => enabled[c] !== false);
      const amount = ctx.amount;
      const readMpd = (bp, code) => {
        const v = bp && bp[code];
        if (v === null || v === undefined) return null;
        if (typeof v === 'number') return v;
        if (typeof v === 'object') {
          if (typeof v.mpd === 'number') return v.mpd;
          if (typeof v.miles === 'number' && amount > 0) return v.miles / amount;
        }
        return null;
      };
      const showCond = codes.some((c) => {
        const a = readMpd(fb.byProgramme, c);
        const b = readMpd(cd.byProgramme, c);
        return a !== null && b !== null && Math.abs(a - b) >= 0.05;
      });
      const table = el('table', { class: 'ptable' },
        el('thead', null, el('tr', null,
          el('th', null, 'Programme'),
          el('th', { class: 'r' }, 'Now'),
          showCond ? el('th', { class: 'r' }, 'If conditions met') : null,
          el('th', { class: 'r' }, 'Miles'))),
        el('tbody', null, codes.map((c) => {
          const a = readMpd(fb.byProgramme, c);
          const b = readMpd(cd.byProgramme, c);
          return el('tr', null,
            el('td', null, progName(c)),
            el('td', { class: 'r num' }, a === null ? '-' : `${fmtMpd(a)} mpd`),
            showCond ? el('td', { class: 'r num' }, b === null ? '-' : `${fmtMpd(b)} mpd`) : null,
            el('td', { class: 'r num' }, a === null ? '-' : Math.round(a * amount).toLocaleString('en-SG')));
        })));
      if (!codes.length) return el('p', { class: 'muted small' }, 'No programme breakdown available.');
      return el('div', { class: 'ptable-wrap' }, table);
    }

    // initial paint
    syncAll();
  },
};
