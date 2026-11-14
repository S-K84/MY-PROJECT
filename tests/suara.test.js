const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const { clientScript } = require('./helpers');

const s = clientScript('IndexUji.html');
const fn = name => s.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))[0];
const ctx = {};
vm.runInNewContext('const LIMIT_STABLE_MS = 6000, LIMIT_GAP_MS = 60000, OVER_STABLE_MS = 8000, OVER_GAP_MS = 90000;' +
  fn('shouldSayLimit') + fn('shouldWarnSpeeding') + ';this.say = shouldSayLimit; this.warn = shouldWarnSpeeding;', ctx);

const T = 1e6;   // masa sebenar (Date.now) tidak pernah 0
test('suara had laju: tidak disebut bila berkelip; disebut bila kekal >= 6 s; hanya penurunan; selang >= 60 s', () => {
  const st = {};
  // had pertama: tidak disebut serta-merta, disebut selepas kekal 6 s
  st.limSince = T;
  assert.strictEqual(ctx.say(st, 90, T + 3000), false);
  assert.strictEqual(ctx.say(st, 90, T + 6000), true);
  // had berkelip 90 -> 70 -> 90 -> 70: limSince ditetapkan semula setiap kali berubah, tiada sebutan
  let t = T + 10000;
  for (const v of [70, 90, 70, 90, 70]) { st.limSince = t; assert.strictEqual(ctx.say(st, v, t + 3000), false, 'berkelip ' + v); t += 3500; }
  // had 70 kekal 6 s tetapi baru 60 s belum berlalu sejak sebutan lalu (t=6000): ditahan; selepas 60 s disebut
  st.limSince = T + 20000;
  assert.strictEqual(ctx.say(st, 70, T + 26500), false);   // 20.5 s sejak sebutan lalu
  assert.strictEqual(ctx.say(st, 70, T + 66100), true);    // > 60 s
  // kenaikan tidak disebut tetapi diingat; penurunan seterusnya disebut (selepas selang)
  st.limSince = T + 70000;
  assert.strictEqual(ctx.say(st, 90, T + 77000), false);
  assert.strictEqual(st.saidLimit, 90);
  st.limSince = T + 130000;
  assert.strictEqual(ctx.say(st, 60, T + 137000), true);
});

test('suara melebihi had laju: tidak serta-merta; selepas melebihi >= 8 s; ulang paling kerap 90 s; reset bila tidak melebihi', () => {
  const st = {};
  assert.strictEqual(ctx.warn(st, true, T), false);
  assert.strictEqual(ctx.warn(st, true, T + 7000), false);
  assert.strictEqual(ctx.warn(st, true, T + 8000), true);
  for (let t = T + 9000; t < T + 98000; t += 10000) assert.strictEqual(ctx.warn(st, true, t), false, 't=' + (t - T));   // lama: setiap 60 s
  assert.strictEqual(ctx.warn(st, true, T + 98000), true);
  // perlahan seketika (tidak melebihi) -> pemasa melebihi bermula semula
  assert.strictEqual(ctx.warn(st, false, T + 200000), false);
  assert.strictEqual(ctx.warn(st, true, T + 500000), false);   // baru melebihi
  assert.strictEqual(ctx.warn(st, true, T + 508000), true);
});

test('saluran uji: amaran suara had laju guna margin 3 km/j untuk had automatik dan fungsi pengawal', () => {
  assert.match(s, /S\.speedLimit === -1 \? 3 : 2/);
  assert.match(s, /shouldWarnSpeeding\(state, overVoice, Date\.now\(\)\)/);
  assert.match(s, /shouldSayLimit\(state, state\.shownLimit, Date\.now\(\)\)/);
  assert.ok(!/> 60000\) \{ state\.speedWarnAt/.test(s), 'amaran 60 s lama masih ada');
});
