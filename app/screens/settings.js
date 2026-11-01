// Settings: miles value, fee limit, programmes, backup, not-accepted list, MCC overrides.

import {
  el, clear, chip, switchBtn, toast, icon, cardName, PROG, section, titleCase,
} from '../ui.js';

function numberField(label, hint, value, onChange, suffix) {
  const input = el('input', {
    class: 'input num', type: 'text', inputmode: 'decimal', value: String(value), 'aria-label': label,
  });
  input.addEventListener('change', () => {
    const n = parseFloat(input.value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(n) && n >= 0) onChange(n);
    else input.value = String(value);
  });
  return el('div', { class: 'field' },
    el('label', { class: 'label' }, label),
    el('div', { class: 'num-row' }, input, suffix ? el('span', { class: 'muted' }, suffix) : null),
    hint ? el('p', { class: 'muted small' }, hint) : null);
}

export default {
  id: 'settings',
  title: 'Settings',

  render(root, app) {
    const { store } = app;
    const repaint = () => this.render(root, app);
    const st = store.get();
    clear(root);

    // Miles value
    const cpmPresets = [1.0, 1.2, 1.5, 1.8, 2.0];
    root.appendChild(section('Value of a mile',
      numberField('Cents per mile', 'Used to turn cashback and similar rewards into miles. Higher means cash is worth less.', st.settings.centsPerMile,
        (n) => {
          if (n <= 0) return toast('Enter more than zero.');
          store.update((s) => { s.settings.centsPerMile = n; });
          repaint();
        }, 'cents'),
      el('div', { class: 'chips' }, cpmPresets.map((p) => chip(p.toFixed(1), {
        pressed: st.settings.centsPerMile === p,
        onClick: () => { store.update((s) => { s.settings.centsPerMile = p; }); repaint(); },
      }))),
      numberField('Fee limit', 'Warn when fees on a purchase cost more than this many cents per mile earned.', st.settings.feeThresholdCpm,
        (n) => { store.update((s) => { s.settings.feeThresholdCpm = n; }); repaint(); }, 'cents per mile'),
    ));

    // Programmes
    root.appendChild(section('Miles programmes',
      el('p', { class: 'muted small' }, 'Switch off a programme you do not collect. Rankings use the best programme that is on.'),
      ...Object.keys(PROG).map((code) => el('div', { class: 'srow' },
        el('span', null, PROG[code]),
        switchBtn(st.settings.programmes[code] !== false, (on) => {
          const others = Object.keys(PROG).filter((c) => c !== code && st.settings.programmes[c] !== false);
          if (!on && !others.length) return toast('Keep at least one programme on.');
          store.update((s) => { s.settings.programmes[code] = on; });
          repaint();
        }, PROG[code])))));

    // Not accepted
    const na = st.deviceState.notAccepted || {};
    const naKeys = Object.keys(na).filter((k) => na[k] && na[k].length);
    const naBlock = section('Cards refused by merchants');
    if (!naKeys.length) naBlock.appendChild(el('p', { class: 'muted' }, 'None recorded. Use "Not accepted here" on a result to add one.'));
    for (const k of naKeys) {
      naBlock.appendChild(el('div', { class: 'srow srow-col' },
        el('strong', null, app.data.merchants.merchants.find((m) => m.id === k)?.displayName || titleCase(k)),
        el('div', { class: 'chips' }, na[k].map((cid) => chip(`${cardName(app, cid)}  x`, {
          kind: 'quiet', title: 'Remove',
          onClick: () => {
            store.update((s) => {
              const arr = (s.deviceState.notAccepted[k] || []).filter((c) => c !== cid);
              if (arr.length) s.deviceState.notAccepted[k] = arr; else delete s.deviceState.notAccepted[k];
            });
            repaint();
          },
        })))));
    }
    if (naKeys.length) {
      naBlock.appendChild(el('button', {
        type: 'button', class: 'btn btn-ghost',
        onClick: () => { store.update((s) => { s.deviceState.notAccepted = {}; }); toast('Cleared.'); repaint(); },
      }, 'Clear not-accepted list'));
    }
    root.appendChild(naBlock);

    // MCC overrides
    const ov = st.deviceState.mccOverrides || {};
    const ovKeys = Object.keys(ov);
    const ovBlock = section('MCC overrides');
    if (!ovKeys.length) ovBlock.appendChild(el('p', { class: 'muted' }, 'None. Use "Change MCC" on a result if a merchant is categorised wrongly.'));
    for (const k of ovKeys) {
      const input = el('input', { class: 'input input-code num', type: 'text', inputmode: 'numeric', maxlength: '4', value: ov[k], 'aria-label': `MCC for ${k}` });
      input.addEventListener('change', () => {
        const v = input.value.replace(/\D/g, '');
        if (v.length !== 4) { input.value = ov[k]; return toast('An MCC has 4 digits.'); }
        store.update((s) => { s.deviceState.mccOverrides[k] = v; });
        toast('Saved.');
      });
      ovBlock.appendChild(el('div', { class: 'srow' },
        el('span', { class: 'grow ellipsis' }, app.data.merchants.merchants.find((m) => m.id === k)?.displayName || titleCase(k)),
        input,
        el('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Delete override for ${k}`,
          onClick: () => { store.update((s) => { delete s.deviceState.mccOverrides[k]; }); repaint(); },
        }, icon('close', 20))));
    }
    root.appendChild(ovBlock);

    // Backup
    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      try {
        store.importJson(await f.text());
        toast('Backup restored.');
        repaint();
      } catch (e) {
        toast(e.message || 'Could not read that file.');
      }
      fileInput.value = '';
    });
    root.appendChild(section('Backup',
      el('p', { class: 'muted small' }, 'Your settings, toggles and lists live only on this device. Export a copy to move them elsewhere.'),
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button', class: 'btn btn-primary',
          onClick: () => {
            try {
              const blob = new Blob([store.exportJson()], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = el('a', { href: url, download: `card-optimiser-${app.today()}.json` });
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
            } catch (e) {
              toast('Could not create the file.');
            }
          },
        }, 'Export JSON'),
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => fileInput.click() }, 'Import JSON'),
        fileInput),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-block',
        onClick: () => { store.update((s) => { s.recent = []; }); toast('Recent merchants cleared.'); },
      }, 'Clear recent merchants')));

    // Stack info link
    root.appendChild(section('About',
      el('button', { type: 'button', class: 'nav-row', onClick: () => app.navigate('stack') },
        el('span', null, 'Stack info'),
        el('span', { class: 'muted small grow-r' }, `As of ${(app.data.stack.doc && app.data.stack.doc.asOf) || 'unknown'}`),
        icon('chevron', 20))));
  },
};
