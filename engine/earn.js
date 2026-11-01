// earn.js: per card and method evaluation (points, caps, conditions, miles, fees, warnings).
// Pure: no DOM, no storage, no clock. `today` is an ISO date string.

import {
  PROGRAMMES, unwrap, val, num, list, nameOf, basisOf, isUnknown, isWeak, inWindow, tierInWindow,
  activeBlock, isCashCurrency, mccInSet, normName, wordContains, descriptorMatches,
  effectiveCaps, isDated, programmeInfo, layerRecord, normaliseMode,
} from './rules.js';
import { periodStart, periodOpts, currentValue, currentCapState, unlockToggleDef } from './period.js';
import { METHOD_LABELS, applePayTreatment, withDefaults, withDeviceDefaults } from './context.js';
import { warn, staleWarning, dedupe } from './warnings.js';

const EPS = 1e-9;

// ---------- small helpers ----------

function roundPts(x, mode) {
  switch (mode) {
    case 'floor': return Math.floor(x + EPS);
    case 'round_half_up': return Math.floor(x + 0.5 + EPS);
    case 'round_1dp': return Math.round(x * 10 + EPS) / 10;
    case 'ceil_1dp': return Math.ceil(x * 10 - EPS) / 10;
    default: return x;
  }
}

function collapse(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function rounding(earn) {
  const r = earn && earn.rounding;
  const raw = unwrap(r);
  if (typeof raw === 'string') {
    // v1 vocabulary
    const map = {
      floor_txn_unit: ['floor_unit', 'floor'],
      floor_txn_points: ['exact', 'floor'],
      round_component: ['exact', 'round_half_up'],
      ceil_1dp: ['exact', 'ceil_1dp'],
      exact: ['exact', 'exact'],
    };
    const m = map[raw] || ['exact', 'exact'];
    return { amount: m[0], points: m[1], perComponent: true, amountLeaf: r, pointsLeaf: r };
  }
  const rr = r || {};
  return {
    amount: String(val(rr.amount, 'exact')),
    points: String(val(rr.points, 'exact')),
    perComponent: unwrap(rr.perComponent) !== false,
    amountLeaf: rr.amount,
    pointsLeaf: rr.points,
  };
}

function entryWindowOk(entry, today) {
  if (!entry || typeof entry !== 'object') return true;
  return inWindow(entry.from, entry.to, today);
}

function entryNames(entry) {
  const out = [nameOf(entry)];
  if (entry && typeof entry === 'object') list(entry.match).forEach((m) => out.push(nameOf(m)));
  return out.filter(Boolean);
}

function entryMatches(entry, nameNorms, nameCollapsed, bidirectional, today) {
  if (!entryWindowOk(entry, today)) return false;
  for (const s of entryNames(entry)) {
    const e = normName(s);
    if (e.length < 3) continue;
    const ec = collapse(e);
    if (nameCollapsed.has(ec)) return true;
    for (const n of nameNorms) {
      if (wordContains(n, e)) return true;
      // Reverse match (typed name inside a listed name) only when the typed name is most of it,
      // so a short word such as "Shop" does not match a longer listed merchant.
      if (bidirectional && n.length >= 4 && n.length >= 0.6 * e.length && wordContains(e, n)) return true;
    }
  }
  return false;
}

function userCategoryOf(stackCard) {
  const c = stackCard && (stackCard.userCategory || stackCard.bonusCategory || stackCard.category);
  return c ? String(c).toLowerCase() : null;
}

// ---------- tier matching ----------

function matchTier(tier, ctx, method, apple, stackCard, today, nameNorms, nameCollapsed) {
  const m = tier.match || {};
  const ch = String(val(m.channel, 'any'));
  if (ch !== 'any' && ch !== ctx.channel) return { matched: false };
  const cur = String(val(m.currency, 'any'));
  if (cur !== 'any' && cur !== ctx.chargedCurrency) return { matched: false };
  const loc = String(val(m.location, 'any'));
  if (loc !== 'any' && loc !== ctx.location) return { matched: false };

  const cat = unwrap(tier.requiresUserCategory);
  if (cat && userCategoryOf(stackCard) !== String(cat).toLowerCase()) return { matched: false };

  // methods
  const mOut = list(m.methodsOut);
  if (mOut.includes(method)) return { matched: false };
  const mIn = list(m.methodsIn);
  if (mIn.length) {
    let ok = mIn.includes(method);
    if (!ok && method === 'applepay_instore' && apple && apple.mode !== 'excluded') ok = mIn.includes('physical_tap');
    if (!ok && method === 'applepay_inapp' && apple && apple.mode !== 'excluded') ok = mIn.includes('card_online');
    if (!ok && method === 'heymax_voucher') ok = mIn.includes('card_online');
    if (!ok) return { matched: false };
  }

  // merchants out
  const outs = list(m.merchantsOut);
  if (outs.length && outs.some((e) => entryMatches(e, nameNorms, nameCollapsed, false, today))) return { matched: false };

  // MCC and merchants
  const mccOut = ctx.mcc ? mccInSet(ctx.mcc, m.mccOut, m.mccOutRanges) : false;
  if (mccOut) return { matched: false };
  const hasMcc = list(m.mccIn).length > 0 || list(m.mccInRanges).length > 0;
  const ins = list(m.merchantsIn);
  const hasMerch = ins.length > 0;
  const notes = [];
  if (hasMcc || hasMerch) {
    const merchHit = hasMerch ? ins.find((e) => entryMatches(e, nameNorms, nameCollapsed, true, today)) : null;
    const mccHit = hasMcc && ctx.mcc ? mccInSet(ctx.mcc, m.mccIn, m.mccInRanges) : false;
    if (!merchHit && !mccHit) {
      if (hasMcc && !ctx.mcc) return { matched: false, unknownMcc: true };
      return { matched: false };
    }
    if (merchHit && typeof merchHit === 'object' && merchHit.conditions) notes.push(`${nameOf(merchHit)}: ${merchHit.conditions}`);
  }
  const excludeUnknown = !ctx.mcc && (list(m.mccOut).length > 0 || list(m.mccOutRanges).length > 0);
  return { matched: true, notes, excludeUnknown };
}

// ---------- preparation (everything independent of the toggle scenario) ----------

function prepare(card, stackCard, method, ctx, data, settings, deviceState, today, block) {
  const rules = data && data.rules;
  const cardId = stackCard.id;
  const earn = block.earn || {};
  const opts = periodOpts(stackCard);
  const rnd = rounding(earn);
  const unit = num(earn.unit, 1) > 0 ? num(earn.unit, 1) : 1;
  const prep = {
    cardId, card, stackCard, block, method, ctx, settings, today,
    unit,
    floorAmount: rnd.amount === 'floor_unit',
    pointsMode: rnd.points,
    perComponent: rnd.perComponent,
    rnd,
    minTxn: num(earn.minTxn, null),
    basePerUnit: num(earn.base && earn.base.points, 0) || 0,
    zeroReason: null,
    baseOnlyReason: null,
    apple: null,
    gates: [],
    cands: [],
    unresolved: [],
    unknownBonus: false,
    capMetas: new Map(),
    bandCapIds: [],
    notes: [],
    warnings: [],
  };
  const ex = block.exclusions || {};

  // Apple Pay treatment
  if (method === 'applepay_instore' || method === 'applepay_inapp') {
    const which = method === 'applepay_instore' ? 'inStore' : 'inApp';
    const t = applePayTreatment(card, rules, cardId, which);
    let mode = 'physical';
    if (t.value === 'base_only') mode = 'base_only';
    else if (t.value === 'excluded') mode = 'excluded';
    else if (t.value === 'unknown') mode = 'unknown';
    prep.apple = { ...t, mode, which };
    if (mode === 'unknown' || t.basis === 'blog_only' || t.basis === 'inferred') {
      prep.warnings.push(warn('APPLE_PAY_UNCERTAIN', mode === 'unknown'
        ? 'Apple Pay treatment is not documented for this card: assumed to earn like the physical or online card (low confidence).'
        : `Apple Pay treatment rests on ${t.basis === 'blog_only' ? 'blog reports' : 'inference'} rather than an issuer clause (low confidence).`));
    }
    if (mode === 'excluded') prep.zeroReason = 'Apple Pay spend earns nothing on this card';
  }

  // MCC and descriptor exclusions
  if (!prep.zeroReason && ctx.mcc && mccInSet(ctx.mcc, ex.mccZero, ex.mccZeroRanges)) prep.zeroReason = `MCC ${ctx.mcc} earns no points on this card`;
  if (!prep.zeroReason) {
    const zeroNames = [...list(ex.descriptionsZero), ...list(ex.platformsZero), ...list(ex.platformsInferredZero)].map(nameOf).filter(Boolean);
    for (const d of ctx.descriptors) {
      const hit = zeroNames.find((z) => descriptorMatches(d, z));
      if (hit) { prep.zeroReason = `"${hit}" is excluded and earns no points on this card`; break; }
    }
  }
  if (!prep.zeroReason && ctx.mcc && mccInSet(ctx.mcc, ex.mccBaseOnly, ex.mccBaseOnlyRanges)) prep.baseOnlyReason = `MCC ${ctx.mcc} earns base rate only on this card`;
  if (!prep.baseOnlyReason && !prep.zeroReason) {
    const baseNames = [
      ...list(ex.descriptionsBaseOnly).map(nameOf),
      ...list(ex.bonusOnlyExclusions).flatMap((b) => (b && Array.isArray(b.match) && b.match.length ? b.match.map(nameOf) : [])),
    ].filter(Boolean);
    for (const d of ctx.descriptors) {
      const hit = baseNames.find((z) => descriptorMatches(d, z));
      if (hit) { prep.baseOnlyReason = `"${hit}" loses the bonus on this card (base rate only)`; break; }
    }
  }
  if (prep.apple && prep.apple.mode === 'base_only') prep.baseOnlyReason = prep.baseOnlyReason || 'Apple Pay earns base rate only on this card for this payment type';

  // gates
  for (const g of block.gates) {
    if (!g || !unwrap(g.toggle) || !inWindow(g.effectiveFrom, g.effectiveTo, today)) continue;
    const def = unlockToggleDef(g, 'gate', stackCard, today);
    prep.gates.push({ key: def.key, def, state: currentValue(deviceState, cardId, def.key, def, today), onFail: String(val(g.onFail, 'zero')) });
  }

  // caps
  const mode = normaliseMode(stackCard.rewardMode);
  const capsEff = effectiveCaps(block.caps, today);
  const refTier = new Set(list(earn.tiers).map((t) => t && t.capId).filter(Boolean));
  for (const c of capsEff) {
    if (!c || !c.id) continue;
    const period = String(val(c.period, 'none'));
    const def = { key: 'cap:' + c.id, period, periodOpts: opts, periodStart: periodStart(period, opts, today) };
    const st = currentCapState(deviceState, cardId, c.id, def, today);
    const meta = {
      id: c.id, cap: c, period, def, state: st.state, roomSgd: st.roomSgd,
      afterCap: String(val(c.afterCap, 'base')), afterCapPoints: num(c.afterCapPoints, null),
      scope: String(val(c.scope, 'unknown')), dated: isDated(c),
    };
    prep.capMetas.set(c.id, meta);
    if (list(c.tiers).length === 0 && !refTier.has(c.id)) prep.bandCapIds.push(c.id);
  }
  const capIdForTier = (t) => {
    const matching = [...prep.capMetas.values()].filter((m) => list(m.cap.tiers).includes(t.id) || t.capId === m.id);
    if (!matching.length) return null;
    const dated = matching.filter((m) => m.dated);
    return (dated[0] || matching[0]).id;
  };

  // tiers
  const nameNorms = ctx.merchantNames.map(normName).filter(Boolean);
  const nameCollapsed = new Set(nameNorms.map(collapse));
  for (const t of list(earn.tiers)) {
    if (!t || !tierInWindow(t, today)) continue;
    if (isUnknown(t.points)) { prep.unresolved.push(t.id); continue; }
    const mt = matchTier(t, ctx, method, prep.apple, stackCard, today, nameNorms, nameCollapsed);
    if (!mt.matched) {
      if (mt.unknownMcc) prep.unknownBonus = true;
      continue;
    }
    if (mt.excludeUnknown) prep.unknownBonus = true;
    mt.notes.forEach((n) => prep.notes.push(n));
    const unlocks = [];
    for (const u of list(t.unlock)) {
      if (!u || !inWindow(u.effectiveFrom, u.effectiveTo, today)) continue;
      const type = unwrap(u.type);
      if (type === 'mode') {
        unlocks.push({ kind: 'mode', ok: !mode || normaliseMode(u.mode) === mode });
        continue;
      }
      if (!unwrap(u.toggle)) continue;
      const def = unlockToggleDef(u, 'unlock', stackCard, today);
      unlocks.push({ kind: 'toggle', key: def.key, def, state: currentValue(deviceState, cardId, def.key, def, today) });
    }
    prep.cands.push({
      tier: t, id: t.id,
      points: num(t.points, 0),
      stacking: String(val(t.stacking, 'replace')),
      group: unwrap(t.exclusiveGroup) || null,
      capId: capIdForTier(t),
      unlocks,
    });
  }

  // distinct toggles (gates and tier unlocks) that bear on this result
  const toggles = new Map();
  prep.gates.forEach((g) => toggles.set(g.key, { key: g.key, def: g.def, state: g.state }));
  prep.cands.forEach((c) => c.unlocks.forEach((u) => { if (u.kind === 'toggle' && !toggles.has(u.key)) toggles.set(u.key, { key: u.key, def: u.def, state: u.state }); }));
  prep.toggles = [...toggles.values()];
  return prep;
}

// ---------- scenario evaluation ----------

function stateIn(opts, key, state) {
  if (opts.force && Object.prototype.hasOwnProperty.call(opts.force, key)) return opts.force[key];
  return state === null ? !!opts.unsetAs : state;
}

/** Which tiers apply in a scenario (unlocks, exclusive groups, replace singularity). */
function appliedTiers(prep, opts) {
  for (const g of prep.gates) {
    if (stateIn(opts, g.key, g.state) === false && g.onFail === 'zero') return { zero: true, zeroReason: 'Balance or eligibility condition not met: no earn', tiers: [] };
  }
  if (prep.zeroReason) return { zero: true, zeroReason: prep.zeroReason, tiers: [] };
  if (prep.baseOnlyReason) return { zero: false, tiers: [] };
  let tiers = prep.cands.filter((c) => c.unlocks.every((u) => (u.kind === 'mode' ? u.ok : stateIn(opts, u.key, u.state))));
  const best = new Map();
  const ungrouped = [];
  for (const t of tiers) {
    if (t.group) {
      const cur = best.get(t.group);
      if (!cur || t.points > cur.points) best.set(t.group, t);
    } else ungrouped.push(t);
  }
  tiers = [...ungrouped, ...best.values()];
  const replace = tiers.filter((t) => t.stacking === 'replace');
  if (replace.length > 1) {
    const top = replace.reduce((a, b) => (b.points > a.points ? b : a));
    tiers = tiers.filter((t) => t.stacking !== 'replace' || t === top);
  }
  return { zero: false, tiers };
}

function perUnitBonus(prep, t) {
  return t.stacking === 'replace' ? t.points - prep.basePerUnit : t.points;
}

/** Spend (S$) at which a cap is reached for the tiers applied in this scenario. */
function capCapacity(prep, meta, ap) {
  const cap = meta.cap;
  const unitKind = String(val(cap.unit, 'points'));
  const amount = num(cap.amount, null);
  const sdLeaf = cap.capSpendSgd;
  const sd = num(sdLeaf, null);
  const derived = !!(sdLeaf && typeof sdLeaf === 'object' && sdLeaf.derived === true);
  if (sd !== null && !derived) return sd;
  if (unitKind === 'sgd' && amount !== null) return amount;
  if (amount !== null && (unitKind === 'points' || unitKind === 'cash')) {
    const counts = String(val(cap.counts, 'bonus_only'));
    const onCap = ap.tiers.filter((t) => t.capId === meta.id);
    let perUnit = onCap.reduce((s, t) => s + perUnitBonus(prep, t), 0);
    if (counts === 'base_plus_bonus') perUnit += prep.basePerUnit;
    let perSgd = perUnit / prep.unit;
    if (unitKind === 'cash') {
      const cv = num(prep.block.conversion && prep.block.conversion.cashValuePerUnit, null);
      perSgd = cv === null ? 0 : perSgd * cv;
    }
    if (perSgd > EPS) return amount / perSgd;
  }
  return sd;
}

/** Points for `amount` with the given caps treated as outside (used up). */
function computePoints(prep, ap, amount, outside, wholeAmount) {
  const out = { points: 0, bonusPoints: 0, bonusActive: false, units: 0, belowMin: false, bonusWiped: false, zero: false };
  if (ap.zero || amount <= 0) { out.zero = ap.zero; return out; }
  if (prep.minTxn !== null && wholeAmount < prep.minTxn - EPS) { out.belowMin = true; return out; }
  const units = prep.floorAmount ? Math.floor(amount / prep.unit + EPS) : amount / prep.unit;
  out.units = units;
  const mode = prep.pointsMode;
  const comps = [{ kind: 'base', pts: prep.basePerUnit * units }];
  let override = null;
  let baseRemoved = false;
  for (const t of ap.tiers) {
    const per = perUnitBonus(prep, t);
    if (t.capId && outside.has(t.capId)) {
      const meta = prep.capMetas.get(t.capId);
      if (meta.afterCap === 'points' && meta.afterCapPoints !== null) override = meta.afterCapPoints * units;
      else if (meta.afterCap === 'zero' && t.stacking === 'replace') baseRemoved = true;
      continue;
    }
    comps.push({ kind: 'bonus', id: t.id, pts: per * units });
  }
  for (const id of prep.bandCapIds) {
    if (!outside.has(id)) continue;
    const meta = prep.capMetas.get(id);
    if (meta.afterCap === 'points' && meta.afterCapPoints !== null) override = meta.afterCapPoints * units;
    else if (meta.afterCap === 'zero') return { ...out, units, zero: false };
  }
  if (override !== null) {
    out.points = roundPts(override, mode);
    return out;
  }
  if (baseRemoved) comps[0].pts = 0;
  const rawBonus = comps.filter((c) => c.kind === 'bonus').reduce((s, c) => s + c.pts, 0);
  if (prep.perComponent) {
    const rounded = comps.map((c) => roundPts(c.pts, mode));
    out.points = rounded.reduce((s, x) => s + x, 0);
    out.bonusPoints = comps.reduce((s, c, i) => s + (c.kind === 'bonus' ? rounded[i] : 0), 0);
  } else {
    out.points = roundPts(comps.reduce((s, c) => s + c.pts, 0), mode);
    out.bonusPoints = roundPts(rawBonus, mode);
  }
  out.bonusActive = out.bonusPoints > EPS;
  out.bonusWiped = rawBonus > EPS && out.bonusPoints <= EPS;
  return out;
}

/** Evaluate a scenario: actual (per cap state), all within, all outside. */
function evalScenario(prep, opts) {
  const ap = appliedTiers(prep, opts);
  const amount = prep.ctx.amount;
  const capIds = new Set(ap.tiers.map((t) => t.capId).filter(Boolean));
  prep.bandCapIds.forEach((id) => capIds.add(id));
  const caps = [...capIds].map((id) => {
    const meta = prep.capMetas.get(id);
    return { meta, id, capacity: capCapacity(prep, meta, ap) };
  });
  const none = new Set();
  const all = new Set(capIds);
  const within = computePoints(prep, ap, amount, none, amount);
  const outsideAll = computePoints(prep, ap, amount, all, amount);

  // actual, honouring stored cap states
  const usedSet = new Set(caps.filter((c) => c.meta.state === 'used').map((c) => c.id));
  const candidates = caps.filter((c) => c.meta.state !== 'used');
  let actual;
  let straddle = null;
  let boundary = null;
  const capacities = candidates.map((c) => (c.meta.state === 'room' ? c.meta.roomSgd : c.capacity));
  const known = capacities.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
  if (known.length) boundary = Math.min(...known);
  if (boundary !== null && amount > boundary + EPS) {
    const a = computePoints(prep, ap, boundary, usedSet, amount);
    const b = computePoints(prep, ap, amount - boundary, all, amount);
    actual = { points: a.points + b.points, bonusActive: a.bonusActive, bonusPoints: a.bonusPoints + b.bonusPoints, units: a.units + b.units, belowMin: a.belowMin, bonusWiped: a.bonusWiped, zero: false };
    straddle = { withinSgd: boundary, outsideSgd: amount - boundary, blendedMpd: null };
  } else {
    actual = computePoints(prep, ap, amount, usedSet, amount);
  }
  // primary cap: tightest capacity among the caps in play, else the first
  let primary = null;
  if (caps.length) {
    primary = caps.slice().sort((x, y) => (x.capacity ?? Infinity) - (y.capacity ?? Infinity))[0];
  }
  return { ap, caps, primary, actual, within, outsideAll, straddle, boundary };
}

// ---------- miles ----------

function milesFor(prep, points, extraMax) {
  const { block, ctx, settings } = prep;
  const conv = block.conversion;
  const amount = ctx.amount;
  const miles = {};
  const hmLayer = layerRecord(prep.data && prep.data.rules, 'heymax');
  const hmConv = hmLayer && hmLayer.conversion;
  const cash = isCashCurrency(block.currency);
  const eq = cash ? points * (num(conv && conv.cashValuePerUnit, 0) || 0) * 100 / settings.centsPerMile : 0;
  for (const p of PROGRAMMES) {
    const info = programmeInfo(conv, p);
    const hm = extraMax > 0 ? programmeInfo(hmConv, p) : { available: false, milesPerPoint: null };
    if (cash) {
      miles[p] = hm.available ? eq + extraMax * hm.milesPerPoint : null;
    } else if (info.available) {
      miles[p] = points * info.milesPerPoint + (hm.available ? extraMax * hm.milesPerPoint : 0);
    } else {
      miles[p] = null;
    }
  }
  if (cash) miles.CASH = eq;
  // headline: best enabled programme (cash equivalents are programme independent)
  let best = null;
  for (const p of [...PROGRAMMES, 'CASH']) {
    if (miles[p] === null || miles[p] === undefined) continue;
    if (p !== 'CASH' && settings.programmes[p] === false) continue;
    if (best === null || miles[p] > miles[best] + EPS) best = p;
  }
  const mpdBy = {};
  for (const k of Object.keys(miles)) mpdBy[k] = miles[k] === null ? null : amount > 0 ? miles[k] / amount : 0;
  const headMiles = best ? miles[best] : 0;
  return { programme: best, miles: headMiles, mpd: amount > 0 ? headMiles / amount : 0, byProgramme: mpdBy, milesBy: miles, equivalent: cash };
}

function scenarioView(prep, ev, which) {
  const extra = prep.ctx.heymax ? prep.ctx.heymax.extraMaxMiles : 0;
  const pts = which === 'within' ? ev.within : which === 'outside' ? ev.outsideAll : ev.actual;
  const m = milesFor(prep, pts.points, extra);
  return { ...m, points: pts.points, raw: pts };
}

// ---------- basis flags ----------

function weakFlag(list_, leaf, what, cardName) {
  const b = basisOf(leaf);
  if (b === 'blog_only' || b === 'inferred') list_.push(`${b}: ${cardName} ${what}`);
}

// ---------- main entry ----------

/**
 * Evaluate one card paid by one method.
 * @returns CardResult (see BUILD-SPEC)
 */
export function evaluateCard(card, stackCard, method, ctx, data, settings, deviceState, today) {
  settings = withDefaults(settings);
  deviceState = withDeviceDefaults(deviceState);
  const block = activeBlock(card, stackCard);
  const cardId = stackCard.id;
  const cardName = (card && card.name) || stackCard.docName || cardId;
  const prep = prepare(card, stackCard, method, ctx, data, settings, deviceState, today, block);
  prep.data = data;

  const fb = evalScenario(prep, { unsetAs: false });
  const cd = evalScenario(prep, { unsetAs: true });
  const fbView = scenarioView(prep, fb, 'actual');
  const cdView = scenarioView(prep, cd, 'actual');

  // conditions
  const conditions = prep.toggles.map((t) => {
    const f = scenarioView(prep, evalScenario(prep, { unsetAs: false, force: { [t.key]: false } }), 'actual');
    const c = scenarioView(prep, evalScenario(prep, { unsetAs: true, force: { [t.key]: true } }), 'actual');
    return { key: t.key, label: t.def.label, detail: t.def.detail || '', state: t.state, conditionalMpd: c.mpd, fallbackMpd: f.mpd, period: t.def.period, resetsOn: t.def.nextReset || null };
  });

  // cap presentation: prefer the headline scenario, else the conditional one
  let capEv = fb;
  let capFromConditional = false;
  if (!fb.primary && cd.primary) { capEv = cd; capFromConditional = true; }
  const capView = {
    within: scenarioView(prep, capEv, 'within'),
    outside: scenarioView(prep, capEv, 'outside'),
  };
  const primary = capEv.primary;
  let cap = null;
  if (primary) {
    const state = primary.meta.state;
    cap = {
      id: primary.id,
      capacitySgd: primary.capacity,
      period: primary.meta.period,
      scope: primary.meta.scope,
      state,
      roomSgd: primary.meta.roomSgd,
      afterCap: primary.meta.afterCap,
      fromConditional: capFromConditional,
    };
  }
  const straddle = fb.straddle ? { ...fb.straddle, blendedMpd: fbView.mpd } : null;
  const withinCapMpd = cap ? capView.within.mpd : fbView.mpd;
  const outsideCapMpd = cap ? capView.outside.mpd : fbView.mpd;

  // fees
  const chargedFcy = ctx.chargedCurrency === 'fcy';
  const fcyPctLeaf = card && card.fees && card.fees.fcyPct;
  const fcyPct = num(fcyPctLeaf, 0) || 0;
  const fcySgd = chargedFcy ? (fcyPct / 100) * ctx.amount : 0;
  const layerSgd = ctx.layerFeeSgd || 0;
  const totalSgd = fcySgd + layerSgd;
  const headMiles = fbView.miles;
  const centsPerMile = headMiles > EPS ? (totalSgd * 100) / headMiles : null;
  const feeEstimate = !!(ctx.layerFeeEstimate || (chargedFcy && (isWeak(fcyPctLeaf) || isUnknown(fcyPctLeaf))));
  const flagged = totalSgd > EPS && (centsPerMile === null || centsPerMile > settings.feeThresholdCpm + EPS);
  const fees = { fcySgd, layerSgd, totalSgd, centsPerMile, flagged, estimate: feeEstimate && totalSgd > 0 };
  if (ctx.layerFeeLabel) fees.layerLabel = ctx.layerFeeLabel;

  // warnings
  const w = [...ctx.warnings, ...prep.warnings];
  const apBase = fb.ap;
  if (prep.unknownBonus) {
    w.push(warn('MCC_UNKNOWN_BONUS', 'A bonus tier could apply but depends on the MCC, which is unknown for this merchant: bonus not counted.'));
  }
  const flatPoints = fbView.points;
  const isZeroEarn = flatPoints <= EPS && !(ctx.heymax && ctx.heymax.extraMaxMiles > 0);
  if (!apBase.zero && ctx.amount > 0 && flatPoints <= EPS && (fb.actual.belowMin || fb.actual.units < 1)) {
    const why = fb.actual.belowMin ? `below the card's minimum transaction (S$${prep.minTxn})` : `below the earn unit (S$${prep.unit})`;
    w.push(warn('ROUNDING_ZERO', `Amount is ${why}: no points are earned.`));
  } else if (fb.actual.bonusWiped) {
    w.push(warn('ROUNDING_ZERO', 'Rounding wipes out the bonus on this amount: only base earn remains.'));
  }
  if (prep.floorAmount && fb.actual.units >= 1 && ctx.amount > 0) {
    const lost = ctx.amount - fb.actual.units * prep.unit;
    if (lost / ctx.amount > 0.1) w.push(warn('SMALL_AMOUNT_ROUNDING', `Earn is rounded down to whole S$${prep.unit} blocks: S$${lost.toFixed(2)} of this purchase earns nothing.`));
  }
  if (cap && cap.scope === 'principal_incl_supp' && stackCard.hasSupplementary) {
    w.push(warn('SHARED_CAP_SUPP', 'This cap is shared with the supplementary card: spend on either card uses it up.'));
  }
  if (straddle) {
    w.push(warn('CAP_STRADDLE', `S$${straddle.withinSgd.toFixed(2)} earns at the bonus rate, S$${straddle.outsideSgd.toFixed(2)} falls outside the cap.`));
  }
  if (ctx.heymax) {
    w.push(warn('BRAND_RATE_VOLATILE', ctx.heymax.rateKnown
      ? `HeyMax brand rates change often (${ctx.heymax.brand}: ${ctx.heymax.rate} Max Miles per S$, as of ${ctx.heymax.asOf || 'unknown'}). Check the app before buying.`
      : 'HeyMax rate for this brand is not recorded: only the card side of the earn is counted. Check the app.'));
  }
  if (fees.estimate) {
    w.push(warn('FEE_ESTIMATE', 'Fees are an estimate (rate not confirmed by the issuer or the layer publishes a maximum).'));
  }
  if (layerSgd > EPS) {
    const cpmLayer = headMiles > EPS ? (layerSgd * 100) / headMiles : null;
    if (cpmLayer === null || cpmLayer > settings.feeThresholdCpm + EPS) {
      w.push(warn('LAYER_FEE_EXCEEDS_VALUE', `The ${ctx.layer === 'amaze' ? 'Amaze' : 'layer'} fee (S$${layerSgd.toFixed(2)}) costs ${cpmLayer === null ? 'more than the miles earned' : cpmLayer.toFixed(2) + ' cents per mile'}, above your ${settings.feeThresholdCpm} cent threshold.`));
    }
  }
  if (apBase.zero && prep.zeroReason) { /* shown through zeroReason */ }
  const sub = [];
  for (const meta of prep.capMetas.values()) {
    for (const sc of list(meta.cap.subCaps)) {
      if (ctx.mcc && mccInSet(ctx.mcc, sc.mccIn, sc.mccInRanges)) {
        sub.push(`${sc.id}: ${num(sc.amount, '?')} ${val(sc.unit, 'points')} per period then ${val(sc.afterCap, 'zero')}`);
      }
    }
  }
  if (sub.length) w.push(warn('SUBCAP', `A sub-cap applies at this MCC (${sub.join('; ')}); not modelled in the rate shown.`));

  const stale = staleWarning(cardName, card && card.validity && unwrap(card.validity.verified), today);
  if (stale) w.push(stale);
  if (ctx.layer) {
    const layer = layerRecord(data && data.rules, ctx.layer);
    const sl = staleWarning(ctx.layer === 'amaze' ? 'Amaze' : 'HeyMax', layer && layer.validity && unwrap(layer.validity.verified), today);
    if (sl) w.push(sl);
  }

  // basis flags
  const bf = [...ctx.basisFlags];
  for (const t of fb.ap.tiers.concat(cd.ap.tiers.filter((x) => !fb.ap.tiers.includes(x)))) {
    const tr = t.tier;
    weakFlag(bf, tr.points, `tier ${t.id} rate`, cardName);
    weakFlag(bf, tr.stacking, `tier ${t.id} stacking`, cardName);
    const m = tr.match || {};
    weakFlag(bf, m.channel, `tier ${t.id} channel`, cardName);
    weakFlag(bf, m.currency, `tier ${t.id} currency`, cardName);
    weakFlag(bf, m.location, `tier ${t.id} location`, cardName);
  }
  if (prep.apple) weakFlag(bf, applePayLeafOf(card, data, cardId, prep.apple.which), `Apple Pay ${prep.apple.which}`, cardName);
  if (primary) {
    const c = primary.meta.cap;
    weakFlag(bf, c.amount, `cap ${c.id} amount`, cardName);
    weakFlag(bf, c.scope, `cap ${c.id} scope`, cardName);
    weakFlag(bf, c.period, `cap ${c.id} period`, cardName);
    if (primary.meta.dated && c.condition) bf.push(`condition: cap ${c.id} (${c.condition})`);
  }
  if (chargedFcy) weakFlag(bf, fcyPctLeaf, 'foreign currency fee', cardName);
  if (fbView.programme && fbView.programme !== 'CASH' && block.conversion && block.conversion.programmes) {
    const rec = block.conversion.programmes[fbView.programme];
    if (rec) weakFlag(bf, rec.milesPerPoint, `${fbView.programme} conversion ratio`, cardName);
  }
  prep.notes.forEach((n) => bf.push(`condition: ${n}`));
  if (prep.baseOnlyReason) bf.push(`rule: ${prep.baseOnlyReason}`);
  const weakOnes = bf.filter((x) => x.startsWith('blog_only') || x.startsWith('inferred'));
  if (weakOnes.length) {
    w.push(warn('BASIS_WEAK', `${weakOnes.length} rule input${weakOnes.length === 1 ? '' : 's'} behind this result ${weakOnes.length === 1 ? 'is' : 'are'} blog-only or inferred, not issuer wording.`));
  }
  if (block.modeFallback) bf.push('rule: reward mode in stack.json not recognised, default mode used');

  const toRes = (v) => ({ mpd: v.mpd, programme: v.programme, byProgramme: v.byProgramme, points: v.points, miles: v.miles });
  const bonusActive = fb.actual.bonusActive;
  return {
    cardId,
    name: cardName,
    network: stackCard.network || unwrap(card && card.network) || null,
    method,
    methodLabel: METHOD_LABELS[method] || method,
    layer: ctx.layer || null,
    scenario: { fallback: toRes(fbView), conditional: toRes(cdView) },
    headline: { mpd: fbView.mpd, programme: fbView.programme },
    withinCapMpd,
    outsideCapMpd,
    capDiff: withinCapMpd - outsideCapMpd,
    cap,
    straddle,
    conditions,
    fees,
    equivalent: fbView.equivalent,
    isBaseRate: !bonusActive,
    isZero: isZeroEarn,
    zeroReason: fb.ap.zero ? fb.ap.zeroReason : null,
    baseOnlyReason: prep.baseOnlyReason,
    unresolvedTiers: prep.unresolved,
    capsApplicable: fb.caps.length,
    warnings: dedupe(w),
    basisFlags: [...new Set(bf)],
  };
}

function applePayLeafOf(card, data, cardId, which) {
  const layer = layerRecord(data && data.rules, 'applepay');
  const fromLayer = layer && layer.perCard && layer.perCard[cardId];
  return (fromLayer && fromLayer[which]) || (card && card.applePay && card.applePay[which]);
}
