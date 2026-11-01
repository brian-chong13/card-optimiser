// Device storage for the card optimiser. localStorage key "cco.v1".
// Every access is wrapped in try/catch and falls back to memory.
// Never stores card or account numbers.

const KEY = 'cco.v1';

function defaults() {
  return {
    settings: {
      centsPerMile: 1.5,
      feeThresholdCpm: 1.5,
      programmes: { KF: true, AVIOS: true, AM: true },
    },
    deviceState: { toggles: {}, capState: {}, notAccepted: {}, mccOverrides: {} },
    recent: [],
    favourites: [],
    lastInput: null,
  };
}

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function normalise(raw) {
  const d = defaults();
  if (!isObj(raw)) return d;
  const s = isObj(raw.settings) ? raw.settings : {};
  const num = (v, fallback) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : fallback);
  d.settings.centsPerMile = num(s.centsPerMile, d.settings.centsPerMile) || d.settings.centsPerMile;
  d.settings.feeThresholdCpm = num(s.feeThresholdCpm, d.settings.feeThresholdCpm);
  if (isObj(s.programmes)) {
    for (const k of Object.keys(d.settings.programmes)) {
      if (typeof s.programmes[k] === 'boolean') d.settings.programmes[k] = s.programmes[k];
    }
  }
  const ds = isObj(raw.deviceState) ? raw.deviceState : {};
  for (const k of Object.keys(d.deviceState)) {
    if (isObj(ds[k])) d.deviceState[k] = ds[k];
  }
  d.recent = Array.isArray(raw.recent) ? raw.recent.filter((x) => typeof x === 'string').slice(0, 20) : [];
  d.favourites = Array.isArray(raw.favourites) ? raw.favourites.filter((x) => typeof x === 'string') : [];
  d.lastInput = isObj(raw.lastInput) ? raw.lastInput : null;
  return d;
}

let state = defaults();
let memoryCopy = null; // used when localStorage is unavailable
const listeners = new Set();

function readStorage() {
  try {
    const txt = window.localStorage.getItem(KEY);
    if (txt) return JSON.parse(txt);
  } catch (e) {
    /* storage blocked or corrupt */
  }
  return memoryCopy;
}

function writeStorage() {
  const txt = JSON.stringify(state);
  memoryCopy = JSON.parse(txt);
  try {
    window.localStorage.setItem(KEY, txt);
  } catch (e) {
    /* memory copy still holds it */
  }
}

export function load() {
  state = normalise(readStorage());
  return state;
}

export function get() {
  return state;
}

export function update(fn) {
  const result = fn(state);
  if (isObj(result)) state = normalise(result);
  writeStorage();
  for (const l of Array.from(listeners)) {
    try {
      l(state);
    } catch (e) {
      /* a bad listener must not break saving */
    }
  }
  return state;
}

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function importJson(str) {
  let raw;
  try {
    raw = JSON.parse(str);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }
  if (!isObj(raw) || !(isObj(raw.settings) || isObj(raw.deviceState))) {
    throw new Error('That file does not look like a Card optimiser backup.');
  }
  state = normalise(raw);
  writeStorage();
  for (const l of Array.from(listeners)) {
    try {
      l(state);
    } catch (e) {
      /* ignore */
    }
  }
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export default { load, get, update, exportJson, importJson, subscribe };
