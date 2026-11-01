// Toggles screen: per card unlock conditions and cap state, reset automatically each period.

import {
  el, clear, segmented, chip, networkName, PERIOD_LABEL, resetCaption, periodStartFor,
  storedToggle, setToggle, storedCap, setCap, activeCards, unwrap, sgd, section, emptyState,
} from '../ui.js';

function findCapSpend(ruleCard, capId) {
  // Look through card-level and per-mode caps for a spend figure to show as context.
  const blocks = [];
  if (ruleCard && ruleCard.earn) blocks.push(ruleCard.earn);
  if (ruleCard && ruleCard.caps) blocks.push({ caps: ruleCard.caps });
  const modes = ruleCard && ruleCard.reward && ruleCard.reward.modes && ruleCard.reward.modes.byMode;
  if (modes) for (const m of Object.values(modes)) if (m) blocks.push(m);
  for (const b of blocks) {
    const caps = (b && b.caps) || (b && b.earn && b.earn.caps) || [];
    for (const c of caps) {
      if (c && c.id === capId) {
        const spend = unwrap(c.capSpendSgd);
        if (typeof spend === 'number') return spend;
      }
    }
  }
  return null;
}

export default {
  id: 'toggles',
  title: 'Toggles and caps',

  render(root, app) {
    const { engine, store } = app;
    const today = app.today();
    clear(root);
    root.appendChild(el('p', { class: 'lead' },
      'Tell the app what is true this period. Answers reset on their own when the card cycle rolls over.'));

    const cards = activeCards(app);
    if (!cards.length) {
      root.appendChild(emptyState('No active cards found', 'Check the stack document.'));
      return;
    }

    for (const sc of cards) {
      const host = el('div', { class: 'tcard-host' });
      root.appendChild(host);
      paint(host, sc);
    }

    function paint(host, sc) {
      const rc = app.data.rules.cards[sc.id];
      let defs = [];
      try {
        defs = engine.toggleDefs(rc, sc, today) || [];
      } catch (e) {
        console.error(e);
      }
      const seen = new Set();
      defs = defs.filter((d) => d && d.key && !seen.has(d.key) && seen.add(d.key));
      const unlocks = defs.filter((d) => !String(d.key).startsWith('cap:'));
      const caps = defs.filter((d) => String(d.key).startsWith('cap:'));
      const ex = app.data.profile.capExhaustion && app.data.profile.capExhaustion[sc.id];

      const wrap = el('section', { class: 'tcard' },
        el('header', { class: 'tcard-head' },
          el('h2', null, (rc && rc.name) || sc.docName),
          el('div', { class: 'tcard-sub' },
            chip(networkName(sc.network), { kind: 'quiet' }),
            sc.statementDay ? chip(`Statement day ${sc.statementDay}`, { kind: 'quiet' }) : chip('Statement day unknown', { kind: 'quiet' }))),
      );

      if (!defs.length) wrap.appendChild(el('p', { class: 'muted' }, 'Nothing to track for this card.'));

      for (const d of unlocks) wrap.appendChild(toggleRow(host, sc, d));
      for (const d of caps) wrap.appendChild(capRow(host, sc, rc, d, ex));
      if (ex && ex.label && !caps.length) wrap.appendChild(el('p', { class: 'note' }, el('span', { class: 'dot' }), el('span', null, ex.label)));

      clear(host);
      host.appendChild(wrap);
    }

    function periodLine(sc, period) {
      const label = PERIOD_LABEL[period] || 'Per period';
      return `${label}. ${resetCaption(app, sc, period)}.`;
    }

    function toggleRow(host, sc, d) {
      const stored = storedToggle(app, sc.id, d.key, sc, d.period);
      const def = d.default === undefined ? null : d.default;
      const value = stored ? (stored.value ? 'yes' : 'no') : 'unset';
      const assumed = def === true ? 'Assumed yes' : def === false ? 'Assumed no' : 'Not known';
      return el('div', { class: 'trow' },
        el('div', { class: 'trow-text' },
          el('strong', null, (d.label || d.key) + (d.detail ? ` (${d.detail})` : '')),
          el('span', { class: 'muted small' }, periodLine(sc, d.period)),
          value === 'unset' ? el('span', { class: 'muted small' }, `Not set. ${assumed} until you say.`) : null),
        segmented({
          label: d.label || d.key,
          options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unset', label: 'Not set' }],
          value,
          onChange: (v) => {
            setToggle(app, sc.id, d.key, v === 'yes' ? true : v === 'no' ? false : null, sc, d.period);
            paint(host, sc);
          },
        }),
      );
    }

    function capRow(host, sc, rc, d, ex) {
      const capId = String(d.key).slice(4);
      const rec = storedCap(app, sc.id, capId, sc, d.period);
      const state = rec ? rec.state : 'plenty';
      const spend = findCapSpend(rc, capId);
      const row = el('div', { class: 'trow trow-cap' },
        el('div', { class: 'trow-text' },
          el('strong', null, d.label && d.label !== 'Cap probably used' ? d.label : `Bonus cap${capId ? ` (${capId})` : ''}`),
          el('span', { class: 'muted small' }, `${spend ? `Cap ${sgd(spend)} of spend. ` : ''}${periodLine(sc, d.period)}`),
          ex && ex.label ? el('span', { class: 'prompt' }, ex.label) : null),
        segmented({
          label: 'Cap state',
          options: [
            { value: 'plenty', label: 'Plenty left' },
            { value: 'room', label: rec && rec.state === 'room' ? `About ${sgd(rec.roomSgd || 0)} left` : 'About S$__ left' },
            { value: 'used', label: 'Probably used' },
          ],
          value: state,
          onChange: (v) => {
            if (v === 'room') {
              const start = rec && rec.state === 'room' ? rec.roomSgd : spend ? Math.round(spend / 2) : 100;
              setCap(app, sc.id, capId, 'room', start, sc, d.period);
            } else setCap(app, sc.id, capId, v, 0, sc, d.period);
            paint(host, sc);
          },
        }),
      );
      if (state === 'room') {
        const input = el('input', {
          class: 'input', type: 'text', inputmode: 'decimal', value: String(rec && rec.roomSgd != null ? rec.roomSgd : ''),
          'aria-label': 'Spend left under the cap in Singapore dollars', placeholder: '0',
        });
        input.addEventListener('change', () => {
          const n = parseFloat(input.value.replace(/[^0-9.]/g, ''));
          setCap(app, sc.id, capId, 'room', Number.isFinite(n) ? n : 0, sc, d.period);
          paint(host, sc);
        });
        row.appendChild(el('label', { class: 'room-field' }, el('span', { class: 'label' }, 'Spend left under the cap (S$)'), input));
      }
      return row;
    }
  },
};
