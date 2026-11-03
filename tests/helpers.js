// Pembantu ujian: muatkan Code.gs dalam "vm" Node dengan servis Apps Script olok-olok.
// Code.gs tidak diubah untuk ujian — fungsi global (termasuk yang berakhir "_") dipanggil terus dari ctx.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/** CacheService olok-olok: seperti Apps Script, put() menetapkan semula tempoh luput; nilai maks 100 KB. */
function mockCache(clock) {
  const store = {};
  const cache = {
    store,
    maxValue: 0,
    get: k => (store[k] && store[k].exp > clock.now ? store[k].v : null),
    getAll: ks => {
      const o = {};
      ks.forEach(k => { const v = cache.get(k); if (v != null) o[k] = v; });
      return o;
    },
    put: (k, v, ttl) => {
      if (ttl > 21600) throw new Error('Tempoh cache melebihi 6 jam: ' + k);
      if (String(v).length > 100000) throw new Error('Nilai cache melebihi 100 KB: ' + k);
      cache.maxValue = Math.max(cache.maxValue, String(v).length);
      store[k] = { v: String(v), exp: clock.now + ttl * 1000 };
    },
    remove: k => { delete store[k]; }
  };
  return cache;
}

/**
 * Muatkan Code.gs. Pulangkan { ctx, cache, clock, logs }.
 * clock.now boleh diubah oleh ujian untuk "memajukan masa".
 */
function loadCode(extraGlobals) {
  const clock = { now: 1.8e12 };
  const cache = mockCache(clock);
  const logs = [];
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const ctx = vm.createContext(Object.assign({
    CacheService: { getScriptCache: () => cache },
    Date: FakeDate,
    console: { log: m => logs.push(String(m)), warn: m => logs.push(String(m)), error: m => logs.push(String(m)) }
  }, extraGlobals || {}));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  ctx.verify_ = token => token;           // ujian: token = id pengguna (tandatangan HMAC tidak diuji di sini)
  return { ctx, cache, clock, logs };
}

/** Skrip utama Index.html, dengan tag templat HtmlService diganti nilai contoh. */
function clientScript() {
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = scripts[scripts.length - 1];
  return main.replace('<?!= typesJson ?>', '{}').replace('<?!= initialJson ?>', 'null')
    .replace('<?!= appUrlJson ?>', '""').replace('<?!= trackJson ?>', 'null');
}

module.exports = { ROOT, loadCode, clientScript };
