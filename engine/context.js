// context.js: merchant resolution, method availability and the layer transforms
// (Amaze, HeyMax voucher, DCC) that turn a purchase into the context a card sees.

import {
  unwrap, val, num, list, nameOf, normName, layerRecord, cardNetwork, normaliseNetwork, isActive,
} from './rules.js';

export const METHOD_LABELS = {
  physical_tap: 'Tap card',
  physical_insert: 'Insert card',
  applepay_instore: 'Apple Pay',
  applepay_inapp: 'Apple Pay in app',
  card_online: 'Card details online',
  amaze: 'Via Amaze',
  heymax_voucher: 'HeyMax voucher',
};

export const METHODS_BY_CHANNEL = {
  offline: ['physical_tap', 'physical_insert', 'applepay_instore', 'amaze', 'heymax_voucher'],
  online: ['card_online', 'applepay_inapp', 'amaze', 'heymax_voucher'],
};

export const METHOD_ORDER = ['physical_tap', 'physical_insert', 'applepay_instore', 'card_online', 'applepay_inapp', 'amaze', 'heymax_voucher'];

export function withDefaults(settings) {
  const s = settings || {};
  const cpm = Number(s.centsPerMile);
  const fee = Number(s.feeThresholdCpm);
  return {
    ...s,
    centsPerMile: Number.isFinite(cpm) && cpm > 0 ? cpm : 1.5,
    feeThresholdCpm: Number.isFinite(fee) && fee >= 0 ? fee : 1.5,
    programmes: { KF: true, AVIOS: true, AM: true, ...(s.programmes || {}) },
  };
}

export function withDeviceDefaults(d) {
  const x = d || {};
  return {
    ...x,
    toggles: x.toggles || {},
    capState: x.capState || {},
    notAccepted: x.notAccepted || {},
    mccOverrides: x.mccOverrides || {},
  };
}

/** Key used for the notAccepted list and MCC overrides: merchant id, else lower-cased name. */
export function notAcceptedKey(purchase) {
  if (!purchase) return null;
  if (purchase.merchantId) return String(purchase.merchantId);
  if (purchase.merchantName && String(purchase.merchantName).trim()) return String(purchase.merchantName).trim().toLowerCase();
  return null;
}

function merchantList(data) {
  const m = data && data.merchants;
  if (!m) return [];
  if (Array.isArray(m)) return m;
  return Array.isArray(m.merchants) ? m.merchants : [];
}

function confidenceOf(x, fallback = 'medium') {
  const c = String((x && typeof x === 'object' && x.confidence) || fallback).toLowerCase();
  return ['high', 'medium', 'low'].includes(c) ? c : fallback;
}

/**
 * Resolve the merchant and its MCC. Order: device override, merchants.json entry,
 * category default, else no MCC.
 */
export function resolveMerchant(purchase, data, deviceState) {
  const p = purchase || {};
  const key = notAcceptedKey(p);
  const all = merchantList(data);
  let record = null;
  if (p.merchantId) record = all.find((m) => m && m.id === p.merchantId) || null;
  if (!record && p.merchantName) {
    const n = normName(p.merchantName);
    record = all.find((m) => m && [m.displayName, ...list(m.names)].some((x) => x && normName(x) === n)) || null;
  }
  const category = (record && record.category) || p.category || null;
  const names = [];
  if (record) {
    list(record.names).forEach((x) => x && names.push(String(x)));
    if (record.displayName) names.push(String(record.displayName));
  }
  if (p.merchantName) names.push(String(p.merchantName));
  const displayName = (record && record.displayName) || p.merchantName || p.merchantId || (category ? category.replace(/_/g, ' ') : 'Unknown merchant');

  const overrides = (deviceState && deviceState.mccOverrides) || {};
  const ovr = (key && overrides[key]) || (record && overrides[record.id]) || null;
  let mcc = null;
  let confidence = 'none';
  let source = 'none';
  const recMcc = record ? val(record.mcc, null) : null;
  if (ovr) {
    mcc = String(ovr);
    confidence = 'override';
    source = 'override';
  } else if (recMcc && /^\d{4}$/.test(String(recMcc))) {
    mcc = String(recMcc);
    confidence = confidenceOf(record.mcc);
    source = 'merchants';
  } else {
    const defs = (data && data.merchants && data.merchants.categoryDefaults) || {};
    const d = category ? defs[category] : null;
    const dm = d ? val(d.mcc, null) : null;
    if (dm && /^\d{4}$/.test(String(dm))) {
      mcc = String(dm);
      confidence = 'low';
      source = 'category_default';
    }
  }
  const rawRefused = list(record && record.notAccepted).map((x) => String(unwrap(x)).toLowerCase());
  const refused = rawRefused.map(normaliseNetwork).filter(Boolean);
  return {
    key,
    id: record ? record.id : p.merchantId || null,
    displayName,
    names: names.filter(Boolean),
    category,
    mcc,
    confidence,
    source,
    record,
    notAcceptedNetworks: refused,
    notAcceptedRaw: rawRefused,
  };
}

function collapse(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** HeyMax brand rate for a merchant: { brand, rate (Max Miles per S$ or null), asOf } or null. */
export function heymaxBrandRate(merchant, data) {
  const layer = layerRecord(data && data.rules, 'heymax');
  const rates = list(layer && layer.brandRates);
  const rec = merchant && merchant.record;
  const explicit = rec && rec.heymaxBrand;
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit) && num(explicit.maxMilesPerSgd, null) !== null) {
    return { brand: nameOf(explicit.brand) || merchant.displayName, rate: num(explicit.maxMilesPerSgd), asOf: explicit.asOf || null, volatile: true };
  }
  const wanted = explicit ? collapse(nameOf(explicit)) : null;
  const cands = new Set([merchant && merchant.id, merchant && merchant.displayName, ...((merchant && merchant.names) || [])].filter(Boolean).map(collapse));
  for (const br of rates) {
    const b = collapse(nameOf(br.brand));
    if (!b) continue;
    if ((wanted && b === wanted) || cands.has(b)) {
      return { brand: nameOf(br.brand), rate: num(br.maxMilesPerSgd, null), asOf: br.asOf || null, volatile: br.volatile !== false };
    }
  }
  if (explicit) return { brand: nameOf(explicit), rate: null, asOf: null, volatile: true };
  return null;
}

function applePayLeaf(card, rules, cardId, which) {
  const layer = layerRecord(rules, 'applepay');
  const fromLayer = layer && layer.perCard && layer.perCard[cardId];
  const leaf = (fromLayer && fromLayer[which]) || (card && card.applePay && card.applePay[which]);
  return leaf;
}

/** Apple Pay treatment for a card: { value, basis, supported }. */
export function applePayTreatment(card, rules, cardId, which) {
  const leaf = applePayLeaf(card, rules, cardId, which);
  const fromLayer = layerRecord(rules, 'applepay');
  const supportedLeaf = (fromLayer && fromLayer.perCard && fromLayer.perCard[cardId] && fromLayer.perCard[cardId].supported) || (card && card.applePay && card.applePay.supported);
  const supported = unwrap(supportedLeaf) !== false;
  const value = String(val(leaf, 'unknown'));
  const basis = leaf && typeof leaf === 'object' ? leaf.basis || null : null;
  return { value, basis, supported };
}

/** Is this method offered for this card, merchant and stack? */
export function methodOffered(method, stackCard, card, data, merchant) {
  const rules = data && data.rules;
  if (method === 'applepay_instore' || method === 'applepay_inapp') {
    return applePayTreatment(card, rules, stackCard.id, method === 'applepay_instore' ? 'inStore' : 'inApp').supported;
  }
  if (method === 'amaze') {
    const layer = layerRecord(rules, 'amaze');
    if (!layer || !isActive(layer)) return false;
    if (!list(stackCard.layers).includes('amaze')) return false;
    const accepts = list(layer.acceptsNetworks).map(normaliseNetwork);
    const net = cardNetwork(card, stackCard);
    if (accepts.length && !accepts.includes(net)) return false;
    if (card && card.amaze && unwrap(card.amaze.eligible) === false) return false;
    return true;
  }
  if (method === 'heymax_voucher') {
    const layer = layerRecord(rules, 'heymax');
    if (!layer || !isActive(layer)) return false;
    if (card && card.heymax && unwrap(card.heymax.eligible) === false) return false;
    return !!heymaxBrandRate(merchant, data);
  }
  return true;
}

/** Methods to evaluate for a card: channel methods, filtered by the user's ticks and by availability. */
export function allowedMethods(purchase, stackCard, card, data, merchant) {
  const channel = purchase && purchase.channel === 'online' ? 'online' : 'offline';
  let methods = METHODS_BY_CHANNEL[channel].slice();
  if (purchase && Array.isArray(purchase.methodsAvailable)) methods = methods.filter((m) => purchase.methodsAvailable.includes(m));
  return methods.filter((m) => methodOffered(m, stackCard, card, data, merchant));
}

/**
 * Build the context a card sees for a purchase paid by `method`, applying layer transforms.
 * Returns { method, layer, amount, channel, chargedCurrency, currency, location, mcc, mccConfidence,
 *           descriptors, merchantNames, layerFeeSgd, layerFeeEstimate, layerFeeLabel, heymax, warnings, basisFlags }
 */
export function buildContext(purchase, merchant, method, stackCard, card, data, settings) {
  const p = purchase || {};
  const amount = Number(p.amount) > 0 ? Number(p.amount) : 0;
  const currency = String(p.currency || 'SGD').toUpperCase();
  const isSgd = currency === 'SGD';
  const location = p.location === 'overseas' ? 'overseas' : 'sg';
  const rules = data && data.rules;
  const ctx = {
    method,
    layer: null,
    amount,
    channel: p.channel === 'online' ? 'online' : 'offline',
    chargedCurrency: isSgd ? 'sgd' : 'fcy',
    currency,
    location,
    mcc: merchant.mcc,
    mccConfidence: merchant.confidence,
    merchantNames: merchant.names.slice(),
    descriptors: merchant.names.map((n) => String(n).toUpperCase()),
    layerFeeSgd: 0,
    layerFeeEstimate: false,
    layerFeeLabel: null,
    heymax: null,
    warnings: [],
    basisFlags: [],
  };

  if (method === 'applepay_inapp') ctx.channel = 'online';
  if (method === 'card_online') ctx.channel = 'online';
  if (method === 'physical_tap' || method === 'physical_insert' || method === 'applepay_instore') ctx.channel = 'offline';

  if (method === 'amaze') {
    const layer = layerRecord(rules, 'amaze') || {};
    ctx.layer = 'amaze';
    ctx.channel = 'online';
    ctx.chargedCurrency = 'sgd';
    ctx.descriptors = ctx.descriptors.map((d) => 'AMAZE* ' + d);
    if (!ctx.descriptors.length) ctx.descriptors = ['AMAZE*'];
    const feeRec = list(layer.fees).find((f) => String(unwrap(f.when)).toLowerCase() === 'sgd');
    if (isSgd) {
      const pct = feeRec ? num(feeRec.pct, null) : null;
      const min = feeRec ? num(feeRec.minSgd, 0) : 0;
      if (pct === null) {
        ctx.layerFeeEstimate = true;
      } else {
        ctx.layerFeeSgd = Math.max((pct / 100) * amount, amount > 0 ? min : 0);
      }
      ctx.layerFeeLabel = `Amaze fee: ${pct === null ? 'unknown' : pct + '%'}${min ? ', minimum S$' + min.toFixed(2) : ''}`;
    } else {
      const spread = num(layer.fcySpreadPctMax, null);
      ctx.layerFeeSgd = spread === null ? 0 : (spread / 100) * amount;
      ctx.layerFeeEstimate = true;
      ctx.layerFeeLabel = `Amaze FX spread estimate: up to ${spread === null ? 'unknown' : spread + '%'}`;
    }
    if (feeRec && feeRec.pct && feeRec.pct.basis && ['blog_only', 'inferred'].includes(feeRec.pct.basis)) ctx.layerFeeEstimate = true;
    const tr = layer.transform || {};
    for (const k of ['channel', 'currencyCharged', 'mcc']) {
      const b = tr[k] && typeof tr[k] === 'object' ? tr[k].basis : null;
      if (b === 'blog_only' || b === 'inferred') ctx.basisFlags.push(`${b}: Amaze transform ${k}`);
    }
  } else if (method === 'heymax_voucher') {
    const layer = layerRecord(rules, 'heymax') || {};
    ctx.layer = 'heymax';
    const voucher = layer.voucher || {};
    const vm = val(voucher.mcc, null) ?? val(layer.transform && layer.transform.voucherMcc, null) ?? '5311';
    ctx.mcc = String(vm);
    ctx.mccConfidence = confidenceOf(voucher.mcc, 'medium');
    ctx.channel = 'online';
    ctx.chargedCurrency = 'sgd';
    ctx.location = 'sg';
    ctx.merchantNames = ['HeyMax voucher'];
    ctx.descriptors = ['HEYMAX VOUCHER'];
    const br = heymaxBrandRate(merchant, data);
    const rate = br && br.rate !== null ? br.rate : 0;
    ctx.heymax = { brand: br ? br.brand : null, rate, asOf: br ? br.asOf : null, extraMaxMiles: rate * amount, rateKnown: !!(br && br.rate !== null) };
    const b = voucher.mcc && typeof voucher.mcc === 'object' ? voucher.mcc.basis : null;
    if (b === 'blog_only' || b === 'inferred') ctx.basisFlags.push(`${b}: HeyMax voucher MCC`);
  } else if (location === 'overseas' && isSgd) {
    ctx.warnings.push({
      code: 'DCC',
      text: 'Charged in SGD overseas (dynamic currency conversion): foreign-currency bonuses do not apply and the merchant sets the exchange rate. Pay in the local currency if offered.',
    });
  }
  return ctx;
}
