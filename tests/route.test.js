const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

const KL = { lat: 3.139, lng: 101.687 };
const NEAR = { lat: 3.2, lng: 101.7 };
const OK = { status: 'OK', routes: [] };
const QUOTA = 'Kuota peta Google hari ini sudah habis. Cuba lagi esok.';

/** Maps.DirectionFinder olok-olok. behave(nomborPanggilan, nilaiAvoid) memulangkan jawapan atau melontar ralat. */
function setup(behave) {
  const st = { calls: 0, avoid: '' };
  const df = {};
  ['setOrigin', 'setDestination', 'setMode', 'setAlternatives', 'setRegion', 'setLanguage', 'setDepart', 'addWaypoint']
    .forEach(m => { df[m] = () => df; });
  df.setAvoid = a => { st.avoid = a; return df; };
  df.getDirections = () => { st.calls++; return behave(st.calls, st.avoid); };
  const Maps = { newDirectionFinder: () => df,
    DirectionFinder: { Mode: { WALKING: 'walking', DRIVING: 'driving' }, Avoid: { TOLLS: 'tolls', HIGHWAYS: 'highways' } } };
  const env = loadCode({ Maps });
  env.st = st;
  env.route = (o, d, opts) => {
    try { env.ctx.getRoute('g_t', o, d, opts || {}); return 'OK'; } catch (e) { return e.message; }
  };
  return env;
}

test('lokasi > 2,000 km dari destinasi: mesej jelas, Google tidak dipanggil, kuota tidak digunakan', () => {
  const env = setup(() => OK);
  const m = env.route({ lat: 51.505, lng: -3.577 }, KL);       // Bridgend, Wales → KL
  assert.match(m, /^Lokasi anda dikesan \d+ km dari destinasi\. Semak GPS atau matikan VPN\.$/);
  assert.strictEqual(env.st.calls, 0);
  assert.strictEqual(Object.keys(env.cache.store).length, 0);
});

test('Bangkok → Singapura (~1,430 km) masih dibenarkan', () => {
  assert.strictEqual(setup(() => OK).route({ lat: 13.756, lng: 100.502 }, { lat: 1.352, lng: 103.82 }), 'OK');
});

test('ZERO_RESULTS: "Tiada laluan ke destinasi ini." dan status dicatat dalam log', () => {
  const env = setup(() => ({ status: 'ZERO_RESULTS' }));
  assert.strictEqual(env.route(KL, NEAR, { avoidTolls: true }), 'Tiada laluan ke destinasi ini.');
  assert.ok(env.logs.some(l => /ZERO_RESULTS.*elak tolls/.test(l)), env.logs.join('\n'));
});

test('status OVER_QUERY_LIMIT: mesej kuota', () => {
  assert.strictEqual(setup(() => ({ status: 'OVER_QUERY_LIMIT' })).route(KL, NEAR), QUOTA);
});

test('pengecualian kuota semasa elak feri: mesej kuota tanpa cubaan kedua', () => {
  const env = setup(() => { throw new Error('Service invoked too many times for one day: route.'); });
  assert.strictEqual(env.route(KL, NEAR, { avoidFerries: true }), QUOTA);
  assert.strictEqual(env.st.calls, 1);
});

test('"ferries" ditolak oleh servis: cuba semula tanpa feri', () => {
  const env = setup((n, avoid) => { if (/ferries/.test(avoid)) throw new Error('Invalid argument: avoid'); return OK; });
  assert.strictEqual(env.route(KL, NEAR, { avoidFerries: true }), 'OK');
  assert.strictEqual(env.st.calls, 2);
});

test('status lain: "Laluan tidak dijumpai."', () => {
  assert.strictEqual(setup(() => ({ status: 'NOT_FOUND' })).route(KL, NEAR), 'Laluan tidak dijumpai.');
});

test('papan tanda "Nifai" dalam arahan Google dibetulkan kepada "Nilai" (teks banner & suara datang dari sini)', () => {
  const step = html => ({ html_instructions: html, distance: { text: '9.7 km', value: 9700 }, start_location: { lat: 3.2, lng: 101.7 }, maneuver: 'turn-left' });
  const env = setup(() => ({ status: 'OK', routes: [{ summary: 'E2', overview_polyline: { points: '_p~iF~ps|U' },
    legs: [{ distance: { text: '10 km', value: 10000, }, duration: { text: '9 min', value: 540 },
      steps: [step('Take exit <b>10</b> toward <b>Nifai</b>'), step('Ke <b>Nilai</b>')] }] }] }));
  const routes = env.ctx.getRoute('g_t', NEAR, { lat: 2.8, lng: 101.8 }, {});
  const st = routes[0].steps;
  assert.strictEqual(st[0].road, 'Nilai');
  assert.match(st[0].text, /toward Nilai$/);
  assert.strictEqual(st[1].road, 'Nilai');
});
