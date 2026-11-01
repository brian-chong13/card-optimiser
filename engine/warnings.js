// warnings.js: warning codes and builders. A warning is { code, text }.

import { daysBetween } from './rules.js';

export const WARNING_CODES = [
  'MCC_UNKNOWN',
  'MCC_LOW_CONFIDENCE',
  'MCC_UNKNOWN_BONUS',
  'DCC',
  'LAYER_FEE_EXCEEDS_VALUE',
  'ROUNDING_ZERO',
  'SMALL_AMOUNT_ROUNDING',
  'SHARED_CAP_SUPP',
  'CAP_STRADDLE',
  'RULE_STALE',
  'BASIS_WEAK',
  'BRAND_RATE_VOLATILE',
  'APPLE_PAY_UNCERTAIN',
  'FEE_ESTIMATE',
  'SUBCAP',
];

export function warn(code, text) {
  return { code, text };
}

/** Merchant level warnings: MCC unknown or low confidence. */
export function merchantWarnings(merchant) {
  const out = [];
  if (!merchant.mcc) {
    out.push(warn('MCC_UNKNOWN', 'MCC unknown for this merchant: bonus categories cannot be checked, so only base earn is certain. Pick a category or set the MCC.'));
  } else if (merchant.confidence === 'low') {
    out.push(warn('MCC_LOW_CONFIDENCE', `MCC ${merchant.mcc} is a best guess (${merchant.source === 'category_default' ? 'category default' : 'low confidence source'}): check the bonus before relying on it.`));
  }
  return out;
}

/** RULE_STALE when a record was last verified more than 90 days before today. */
export function staleWarning(label, verified, today) {
  if (!verified) return warn('RULE_STALE', `${label}: no verification date recorded.`);
  const days = daysBetween(verified, today);
  if (days > 90) return warn('RULE_STALE', `${label}: rules last verified ${days} days ago (${verified}). Re-check before relying on them.`);
  return null;
}

export function dedupe(warnings) {
  const seen = new Set();
  const out = [];
  for (const w of warnings) {
    if (!w) continue;
    const k = w.code + '|' + w.text;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}
