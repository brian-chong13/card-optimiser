// App shell: loads data and the engine, builds the app object, runs the tab router.

import store from './store.js';
import { el, clear, icon, isoToday, toast, emptyState } from './ui.js';

const TABS = [
  { id: 'decide', label: 'Decide', title: 'Which card?' },
  { id: 'toggles', label: 'Toggles', title: 'Toggles and caps' },
  { id: 'cheatsheet', label: 'Cheat sheet', title: 'Cheat sheet' },
  { id: 'rules', label: 'Rules', title: 'Card rules' },
  { id: 'settings', label: 'Settings', title: 'Settings' },
];
const EXTRA = { stack: { tab: 'settings', title: 'Stack info' } };

const EMPTY = {
  merchants: { merchants: [], categoryDefaults: {} },
  profile: { topMerchants: [], capExhaustion: {}, cheatSheet: [] },
  build: {},
};

async function loadJson(path, fallback) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    return await res.json();
  } catch (e) {
    if (fallback === undefined) throw e;
    return fallback;
  }
}

function todayFn() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return () => q;
  return () => isoToday();
}

function showFatal(root, msg) {
  clear(root);
  root.appendChild(
    el(
      'div',
      { class: 'fatal' },
      el('h1', null, 'Card optimiser'),
      el('p', null, msg),
      el('button', { class: 'btn btn-primary', type: 'button', onClick: () => location.reload() }, 'Try again'),
    ),
  );
}

async function boot() {
  const root = document.getElementById('app');
  store.load();

  let stack;
  let rules;
  try {
    [stack, rules] = await Promise.all([loadJson('data/stack.json'), loadJson('data/rules.json')]);
  } catch (e) {
    showFatal(root, 'Could not load the card data. If you are offline, open the app once while online first.');
    return;
  }
  const [merchants, profile, build] = await Promise.all([
    loadJson('data/merchants.json', EMPTY.merchants),
    loadJson('data/spend-profile.json', EMPTY.profile),
    loadJson('data/build.json', EMPTY.build),
  ]);
  merchants.merchants = Array.isArray(merchants.merchants) ? merchants.merchants : [];
  merchants.categoryDefaults = merchants.categoryDefaults || {};
  profile.topMerchants = Array.isArray(profile.topMerchants) ? profile.topMerchants : [];
  profile.capExhaustion = profile.capExhaustion || {};
  profile.cheatSheet = Array.isArray(profile.cheatSheet) ? profile.cheatSheet : [];

  let engine;
  try {
    engine = await import('../engine/index.js');
  } catch (e) {
    showFatal(root, 'The calculation engine could not be loaded.');
    return;
  }

  const app = {
    data: { stack, rules, merchants, profile, build },
    store,
    engine,
    today: todayFn(),
    navigate,
  };

  // ---------- shell ----------
  clear(root);
  const titleEl = el('h1', { id: 'screen-title', class: 'top-title' });
  const header = el('header', { class: 'top' }, titleEl);
  const screenEl = el('main', { id: 'screen', class: 'screen', tabindex: '-1' });
  const tabbar = el('nav', { class: 'tabbar', 'aria-label': 'Main' });
  const tabButtons = {};
  for (const t of TABS) {
    const b = el(
      'button',
      { type: 'button', class: 'tab', 'data-tab': t.id, onClick: () => navigate(t.id) },
      icon(t.id, 24),
      el('span', { class: 'tab-label' }, t.label),
    );
    tabButtons[t.id] = b;
    tabbar.appendChild(b);
  }
  root.append(header, screenEl, tabbar);

  let pendingParams = null;
  let renderToken = 0;

  function currentId() {
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    return TABS.some((t) => t.id === h) || EXTRA[h] ? h : 'decide';
  }

  function navigate(id, params) {
    pendingParams = params || null;
    if (location.hash.replace(/^#\/?/, '') === id) renderScreen();
    else location.hash = id;
  }

  async function renderScreen() {
    const id = currentId();
    const token = ++renderToken;
    const params = pendingParams;
    pendingParams = null;
    const tabId = EXTRA[id] ? EXTRA[id].tab : id;
    for (const t of TABS) {
      tabButtons[t.id].classList.toggle('is-on', t.id === tabId);
      if (t.id === tabId) tabButtons[t.id].setAttribute('aria-current', 'page');
      else tabButtons[t.id].removeAttribute('aria-current');
    }
    const meta = EXTRA[id] || TABS.find((t) => t.id === id);
    titleEl.textContent = meta.title;
    document.title = `${meta.title} - Card optimiser`;

    if (typeof screenEl.__cleanup === 'function') {
      try {
        screenEl.__cleanup();
      } catch (e) {
        /* ignore */
      }
      screenEl.__cleanup = null;
    }

    let mod = null;
    try {
      mod = (await import(`./screens/${id}.js`)).default;
    } catch (e) {
      mod = null;
    }
    if (token !== renderToken) return;
    clear(screenEl);
    window.scrollTo(0, 0);
    if (!mod || typeof mod.render !== 'function') {
      screenEl.appendChild(emptyState(`${meta.title} is not ready yet`, 'This screen has not been added to this build.'));
      return;
    }
    try {
      await mod.render(screenEl, app, params);
    } catch (e) {
      console.error(e);
      clear(screenEl);
      screenEl.appendChild(emptyState('Something went wrong on this screen', String(e && e.message ? e.message : e)));
    }
  }

  window.addEventListener('hashchange', renderScreen);
  renderScreen();

  // ---------- service worker updates ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'updated') toast('Updated to the latest data. Reload to use it.');
    });
  }
}

boot();
