// Pembantu ujian: muatkan Code.gs dalam "vm" Node dengan servis Apps Script olok-olok.
// Code.gs tidak diubah untuk ujian — fungsi global (termasuk yang berakhir "_") dipanggil terus dari ctx.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

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
    putAll: (obj, ttl) => { Object.keys(obj).forEach(k => cache.put(k, obj[k], ttl)); },
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

/** Satu helaian Google Sheets olok-olok (baris 1 = tajuk). Nilai disimpan seperti getValues() memulangkannya. */
class FakeSheet {
  constructor(headers) { this.rows = [headers.slice()]; this.reads = 0; }
  getLastRow() { return this.rows.length; }
  getRange(r, c, nr, nc) {
    const sh = this; nr = nr || 1; nc = nc || 1;
    const cell = (i, j) => { const row = sh.rows[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? '' : v; };
    const ensure = i => { while (sh.rows.length < r + i) sh.rows.push([]); return sh.rows[r - 1 + i]; };
    const strip = v => (typeof v === 'string' && v[0] === "'" ? v.slice(1) : v);   // seperti Sheets: awalan ' tidak dipulangkan
    return {
      getValues() { sh.reads++; const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(cell(i, j)); out.push(row); } return out; },
      getValue() { return cell(0, 0); },
      setValues(vals) { vals.forEach((v, i) => { const row = ensure(i); v.forEach((x, j) => { row[c - 1 + j] = strip(x); }); }); return this; },
      setValue(v) { ensure(0)[c - 1] = strip(v); return this; },
      clearContent() { for (let i = 0; i < nr; i++) { const row = ensure(i); for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } trim(); return this; },
      setFontWeight() { return this; }
    };
    function trim() { while (sh.rows.length > 1 && sh.rows[sh.rows.length - 1].every(v => v === '' || v == null)) sh.rows.pop(); }
  }
  appendRow(row) { this.rows.push(row.map(v => (typeof v === 'string' && v[0] === "'" ? v.slice(1) : v))); }
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  setFrozenRows() {}
  data() { return this.rows.slice(1); }
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
  const sheets = {};
  const spreadsheet = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = new FakeSheet([])),
    getId: () => 'sheet-ujian'
  };
  let uuid = 0;
  const props = { SHEET_ID: 'sheet-ujian', TOKEN_SECRET: 'rahsia-ujian' };
  const session = { key: 'kunci-google-A', email: 'pengguna@example.com', owner: 'pemilik@example.com' };
  const bytes = buf => Array.from(buf).map(b => (b > 127 ? b - 256 : b));   // seperti Apps Script: Byte[] bertanda
  const ctx = vm.createContext(Object.assign({
    CacheService: { getScriptCache: () => cache },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    Session: {
      getTemporaryActiveUserKey: () => session.key,
      getActiveUser: () => ({ getEmail: () => session.email }),
      getEffectiveUser: () => ({ getEmail: () => session.owner })
    },
    SpreadsheetApp: { openById: () => spreadsheet },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0'),
      computeHmacSha256Signature: (v, k) => bytes(crypto.createHmac('sha256', k).update(v).digest()),
      computeDigest: (alg, v) => bytes(crypto.createHash('sha256').update(v).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      base64EncodeWebSafe: b => Buffer.from(b.map(x => x & 255)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')
    },
    Date: FakeDate,
    console: { log: m => logs.push(String(m)), warn: m => logs.push(String(m)), error: m => logs.push(String(m)) }
  }, extraGlobals || {}));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  ctx.realVerify_ = ctx.verify_;
  ctx.verify_ = token => token;           // kebanyakan ujian: token = id pengguna (ujian pindah guna realVerify_)
  // Cipta helaian dengan tajuk sebenar dari Code.gs
  ['SHEET_REPORTS:REPORT_HEADERS', 'SHEET_STATS:STATS_HEADERS', 'SHEET_PREFS:PREFS_HEADERS', 'SHEET_SHARES:SHARE_HEADERS',
    'SHEET_USERS:USER_HEADERS'].forEach(p => {
    const [n, h] = p.split(':');
    const name = vm.runInContext(n, ctx), headers = vm.runInContext(h, ctx);
    sheets[name] = new FakeSheet(Array.from(headers));
  });
  return { ctx, cache, clock, logs, sheets, props, session, sheet: n => sheets[vm.runInContext(n, ctx)] };
}

/** Skrip utama Index.html, dengan tag templat HtmlService diganti nilai contoh. */
function clientScript() {
  const html = fs.readFileSync(path.join(ROOT, 'Index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const main = scripts[scripts.length - 1];
  return main.replace('<?!= typesJson ?>', '{}').replace('<?!= initialJson ?>', 'null')
    .replace('<?!= appUrlJson ?>', '""').replace('<?!= trackJson ?>', 'null').replace('<?!= versionJson ?>', '"ujian"');
}

module.exports = { ROOT, loadCode, clientScript };
