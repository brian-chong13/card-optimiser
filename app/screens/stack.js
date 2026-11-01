// Stack info: where the data came from and the cards in the stack. Opened from Settings.

import { el, clear, chip, icon, networkName, fmtDate, titleCase } from '../ui.js';

function kv(k, v) {
  return el('div', { class: 'kv' }, el('span', { class: 'muted' }, k), el('span', { class: 'kv-v' }, v === null || v === undefined || v === '' ? 'Not known' : String(v)));
}

export default {
  id: 'stack',
  title: 'Stack info',

  render(root, app) {
    const { stack, rules, build } = app.data;
    clear(root);
    root.appendChild(el('button', {
      type: 'button', class: 'back-btn', onClick: () => app.navigate('settings'),
    }, icon('back', 20), 'Settings'));

    const doc = stack.doc || {};
    const buildKeys = Object.keys(build || {}).filter((k) => ['string', 'number'].includes(typeof build[k]));
    root.appendChild(el('section', { class: 'block' },
      el('h2', { class: 'block-title' }, 'Data'),
      kv('Stack document', doc.name),
      kv('Stack as of', doc.asOf ? fmtDate(doc.asOf, true) : null),
      kv('Rules built', rules.builtAt ? fmtDate(String(rules.builtAt).slice(0, 10), true) : null),
      ...buildKeys.map((k) => kv(`Build ${titleCase(k).toLowerCase()}`, build[k])),
      kv('Cards in stack', (stack.cards || []).length),
    ));

    for (const c of stack.cards || []) {
      const rc = rules.cards && rules.cards[c.id];
      root.appendChild(el('section', { class: 'tcard' },
        el('header', { class: 'tcard-head' },
          el('h2', null, (rc && rc.name) || c.docName),
          el('div', { class: 'tcard-sub' },
            chip(networkName(c.network), { kind: 'quiet' }),
            c.status !== 'active' ? chip(titleCase(c.status), { kind: 'warn' }) : null,
            !rc ? chip('No rules yet', { kind: 'warn' }) : null)),
        kv('Supplementary card', c.hasSupplementary ? 'Yes' : 'No'),
        kv('Payment layers', (c.layers || []).length ? c.layers.map(titleCase).join(', ') : 'None'),
        kv('Statement day', c.statementDay ? `${c.statementDay}${c.statementText ? ` (${c.statementText})` : ''}` : c.statementText),
        kv('Reward mode', c.rewardMode ? titleCase(c.rewardMode) : 'Standard'),
        c.resetText ? kv('Reset', c.resetText) : null,
        c.balanceCondition ? el('p', { class: 'muted small' }, c.balanceCondition) : null,
        c.notes ? el('p', { class: 'muted small' }, c.notes) : null,
      ));
    }
  },
};
