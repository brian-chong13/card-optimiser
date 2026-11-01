// decide.js: rank the stack for a purchase and return the top three distinct cards.

import {
  stackCards, getCardRules, isActive, cardNetwork, normaliseNetwork, list,
} from './rules.js';
import {
  resolveMerchant, notAcceptedKey, allowedMethods, buildContext, withDefaults, withDeviceDefaults, METHOD_ORDER,
} from './context.js';
import { evaluateCard } from './earn.js';
import { merchantWarnings, dedupe } from './warnings.js';

export { notAcceptedKey };

const EPS = 1e-6;

function key(r) {
  const unset = r.conditions.filter((c) => c.state === null).length;
  return {
    mpd: Math.round(r.headline.mpd / EPS) * EPS,
    fee: Math.round(r.fees.totalSgd * 1e6) / 1e6,
    unset,
    caps: r.capsApplicable || 0,
  };
}

/** Comparator: higher MPD, lower fee, fewer unset conditions, fewer caps. Negative = a ranks first. */
function compareKeys(a, b) {
  const ka = key(a);
  const kb = key(b);
  if (Math.abs(ka.mpd - kb.mpd) > EPS / 2) return kb.mpd - ka.mpd;
  if (ka.fee !== kb.fee) return ka.fee - kb.fee;
  if (ka.unset !== kb.unset) return ka.unset - kb.unset;
  if (ka.caps !== kb.caps) return ka.caps - kb.caps;
  return 0;
}

function compareMethods(a, b) {
  const c = compareKeys(a, b);
  if (c !== 0) return c;
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
}

function compareCards(a, b) {
  const c = compareKeys(a, b);
  if (c !== 0) return c;
  return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
}

/**
 * @param purchase see BUILD-SPEC
 * @returns { merchant, ranked, top3, excluded, skipped, warnings }
 */
export function decide(purchase, data, settings, deviceState, today) {
  const st = withDefaults(settings);
  const dev = withDeviceDefaults(deviceState);
  const merchant = resolveMerchant(purchase, data, dev);
  const key0 = notAcceptedKey(purchase);
  const refusedCards = new Set([
    ...list(key0 ? dev.notAccepted[key0] : []),
    ...list(merchant.id && merchant.id !== key0 ? dev.notAccepted[merchant.id] : []),
  ]);

  const ranked = [];
  const excluded = [];
  const skipped = [];
  const globalWarnings = merchantWarnings(merchant);
  if (purchase && purchase.location === 'overseas' && String(purchase.currency || 'SGD').toUpperCase() === 'SGD') {
    globalWarnings.push({
      code: 'DCC',
      text: 'Charged in SGD overseas (dynamic currency conversion): foreign-currency bonuses are removed from the ranking and the merchant sets the exchange rate.',
    });
  }

  for (const sc of stackCards(data && data.stack)) {
    if (!isActive(sc)) { skipped.push({ cardId: sc.id, reason: 'inactive' }); continue; }
    if (sc.needsResearch === true) { skipped.push({ cardId: sc.id, reason: 'needs_research' }); continue; }
    const card = getCardRules(data && data.rules, sc.id);
    if (!card) { skipped.push({ cardId: sc.id, reason: 'no_rules' }); continue; }
    if (!isActive(card)) { skipped.push({ cardId: sc.id, reason: 'inactive' }); continue; }

    const net = cardNetwork(card, sc);
    if (net && merchant.notAcceptedNetworks.includes(net)) {
      excluded.push({ cardId: sc.id, reason: `${merchant.displayName} does not accept ${net === 'amex' ? 'American Express' : net.charAt(0).toUpperCase() + net.slice(1)}` });
      continue;
    }
    if (refusedCards.has(sc.id) || merchant.notAcceptedRaw.includes(String(sc.id).toLowerCase())) {
      excluded.push({ cardId: sc.id, reason: 'Marked as not accepted at this merchant' });
      continue;
    }

    const methods = allowedMethods(purchase, sc, card, data, merchant);
    let best = null;
    const considered = [];
    for (const method of methods) {
      const ctx = buildContext(purchase, merchant, method, sc, card, data, st);
      const res = evaluateCard(card, sc, method, ctx, data, st, dev, today);
      considered.push({ method: res.method, methodLabel: res.methodLabel, mpd: res.headline.mpd, programme: res.headline.programme });
      if (!best || compareMethods(res, best) < 0) best = res;
    }
    if (best) {
      best.methodsConsidered = considered.sort((a, b) => b.mpd - a.mpd);
      ranked.push(best);
    } else {
      skipped.push({ cardId: sc.id, reason: 'no_method' });
    }
  }

  ranked.sort(compareCards);
  return {
    merchant: {
      key: merchant.key,
      id: merchant.id,
      displayName: merchant.displayName,
      mcc: merchant.mcc,
      confidence: merchant.confidence,
      source: merchant.source,
    },
    ranked,
    top3: ranked.slice(0, 3),
    excluded,
    skipped,
    warnings: dedupe(globalWarnings),
  };
}

/** Convenience: pick a card result out of a decision. */
export function resultFor(decision, cardId) {
  return decision.ranked.find((r) => r.cardId === cardId) || null;
}
