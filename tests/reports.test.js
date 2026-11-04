const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers');

const P = { lat: 3.139, lng: 101.687 };

function setup() {
  const env = loadCode();
  env.reports = env.sheet('SHEET_REPORTS');
  env.stats = env.sheet('SHEET_STATS');
  /** Hantar laporan; masa dimajukan 31 s dahulu supaya had 30 s (cooldown) tidak menghalang ujian. */
  env.report = (user, items, at) => {
    env.clock.now += 31000;
    const p = at || P;
    return env.ctx.submitReports(user, { lat: p.lat, lng: p.lng, name: user, items });
  };
  env.statsOf = id => {
    const r = env.stats.data().find(x => x[0] === id);
    return r ? { reports: r[2], upRecv: r[3], votes: r[4] } : null;
  };
  return env;
}

// ---------------------------------------------------------------- Cache laporan

test('getLiveData membaca laporan dari cache, bukan Sheet', () => {
  const env = setup();
  env.report('g_A', [{ type: 'POLIS' }]);
  const before = env.reports.reads;
  for (let i = 0; i < 50; i++) assert.strictEqual(env.ctx.getReports_().length, 1);
  assert.strictEqual(env.reports.reads, before, 'Sheet dibaca semula walaupun cache ada');
});

test('laporan yang luput ditapis dari cache tanpa membaca Sheet', () => {
  const env = setup();
  env.report('g_A', [{ type: 'POLIS' }]);                 // TTL 60 minit
  const before = env.reports.reads;
  env.clock.now += 61 * 60000;
  assert.strictEqual(env.ctx.getReports_().length, 0);
  assert.strictEqual(env.reports.reads, before);
});

test('senarai besar dipecah: setiap nilai cache < 100 KB, emoji tidak rosak', () => {
  const env = setup();
  const exp = new Date(env.clock.now + 3600e3), desc = '🚧'.repeat(70) + 'é';
  for (let i = 0; i < 2000; i++) {
    env.reports.appendRow(['id-' + i, 'KERJA_JALAN', 3 + i / 1e4, 101, desc, 'g_x', 'Nama', new Date(env.clock.now), exp, 1, 0, 'g_x', '']);
  }
  env.ctx.rebuildReports_();
  assert.ok(env.cache.maxValue < 100000, 'nilai terbesar ' + env.cache.maxValue);
  const list = env.ctx.getReports_();
  assert.strictEqual(list.length, 2000);
  assert.ok(list.every(r => r.desc === desc), 'teks rosak selepas dicantum semula');
});

test('cache dibuang sebahagian oleh Google: dibina semula dari Sheet', () => {
  const env = setup();
  env.report('g_A', [{ type: 'POLIS' }]);
  Object.keys(env.cache.store).filter(k => /^rep_[0-9a-f]+_0$/.test(k)).forEach(k => delete env.cache.store[k]);
  const before = env.reports.reads;
  assert.strictEqual(env.ctx.getReports_().length, 1);
  assert.strictEqual(env.reports.reads, before + 1);
});

test('undi "tiada lagi" yang menyembunyikan laporan dikemas kini dalam cache serta-merta', () => {
  const env = setup();
  const id = env.report('g_A', [{ type: 'POLIS' }]).id;
  ['g_B', 'g_C', 'g_D'].forEach(u => env.ctx.voteReport(u, id, false));
  assert.strictEqual(env.ctx.getReports_().length, 0);
});

// ---------------------------------------------------------------- Gabung laporan berulang

test('laporan sama dalam 200 m digabung sebagai 👍, bukan pin baharu', () => {
  const env = setup();
  const a = env.report('g_A', [{ type: 'POLIS', heading: 90 }]);
  const expBefore = new Date(env.reports.data()[0][8]).getTime();
  const b = env.report('g_B', [{ type: 'POLIS', heading: 100 }], { lat: P.lat + 0.0009, lng: P.lng });   // ~100 m
  assert.strictEqual(b.merged, 1);
  assert.strictEqual(b.id, a.id);
  assert.strictEqual(env.reports.data().length, 1);
  const row = env.reports.data()[0];
  assert.strictEqual(row[9], 2);                                            // UndiYa
  assert.ok(String(row[11]).split(',').includes('g_B'));
  assert.ok(new Date(row[8]).getTime() > expBefore, 'tempoh tidak dipanjangkan');
  assert.deepStrictEqual(JSON.stringify(env.statsOf('g_B')), JSON.stringify({ reports: 0, upRecv: 0, votes: 1 }));
  assert.strictEqual(env.statsOf('g_A').upRecv, 1);
});

test('TIDAK digabung: jenis lain, lebih 200 m, arah bertentangan, atau laporan asal disembunyikan', () => {
  const env = setup();
  const a = env.report('g_A', [{ type: 'POLIS', heading: 0 }]);
  assert.strictEqual(env.report('g_B', [{ type: 'SESAK', heading: 0 }]).merged, 0);
  assert.strictEqual(env.report('g_C', [{ type: 'POLIS', heading: 0 }], { lat: P.lat + 0.003, lng: P.lng }).merged, 0); // ~330 m
  assert.strictEqual(env.report('g_D', [{ type: 'POLIS', heading: 180 }]).merged, 0);                                   // arah lain
  ['g_E', 'g_F', 'g_G'].forEach(u => env.ctx.voteReport(u, a.id, false));                                                // disembunyikan
  const e = env.report('g_H', [{ type: 'POLIS', heading: 0 }], { lat: P.lat, lng: P.lng + 0.0005 });
  assert.notStrictEqual(e.id, a.id);
});

test('laporan tanpa arah boleh digabung dengan laporan berarah', () => {
  const env = setup();
  const a = env.report('g_A', [{ type: 'BANJIR', heading: 45 }]);
  assert.strictEqual(env.report('g_B', [{ type: 'BANJIR' }]).id, a.id);
});

test('pengguna yang sama melapor semula: tiada 👍 tambahan', () => {
  const env = setup();
  env.report('g_A', [{ type: 'POLIS' }]);
  const again = env.report('g_A', [{ type: 'POLIS' }]);
  assert.strictEqual(again.merged, 1);
  assert.strictEqual(env.reports.data()[0][9], 1);
  assert.strictEqual(env.statsOf('g_A').reports, 1);
});

test('laporan berbilang: yang sama digabung, yang baharu dicipta', () => {
  const env = setup();
  const a = env.report('g_A', [{ type: 'POLIS' }]);
  const b = env.report('g_B', [{ type: 'POLIS' }, { type: 'BANJIR' }]);
  assert.strictEqual(b.merged, 1);
  assert.strictEqual(b.ids[0], a.id);
  assert.strictEqual(env.reports.data().length, 2);
  assert.strictEqual(env.statsOf('g_B').reports, 1);
  assert.strictEqual(env.ctx.getReports_().length, 2);
});

// ---------------------------------------------------------------- Pembersihan Statistik

test('cleanup memadam statistik tidak aktif lebih setahun; yang aktif kekal', () => {
  const env = setup();
  env.ctx.isRealTrigger_ = () => true;
  const day = 864e5, now = env.clock.now;
  env.stats.appendRow(['g_lama', 'A', 5, 0, 0, new Date(now - 800 * day), new Date(now - 400 * day)]);
  env.stats.appendRow(['g_aktif', 'B', 5, 0, 0, new Date(now - 800 * day), new Date(now - 10 * day)]);
  env.stats.appendRow(['g_tanpaAktif_lama', 'C', 1, 0, 0, new Date(now - 500 * day), '']);
  env.stats.appendRow(['g_tanpaAktif_baru', 'D', 1, 0, 0, new Date(now - 30 * day), '']);
  env.ctx.cleanup({ triggerUid: 'x' });
  assert.strictEqual(JSON.stringify(env.stats.data().map(r => r[0])), JSON.stringify(['g_aktif', 'g_tanpaAktif_baru']));
  assert.strictEqual(env.stats.rows[0][6], 'Aktif');
});

test('bumpStats_ mengemas kini lajur Aktif', () => {
  const env = setup();
  env.report('g_A', [{ type: 'POLIS' }]);
  env.clock.now += 5 * 864e5;
  env.report('g_A', [{ type: 'SESAK' }], { lat: 4, lng: 102 });
  assert.strictEqual(new Date(env.stats.data()[0][6]).getTime(), env.clock.now);
});

test('deleteMyReport: pelapor boleh memadam laporannya; orang lain tidak', () => {
  const env = setup();
  const res = env.report('g_A1234567', [{ type: 'POLIS', desc: '' }]);
  const id = res.ids[0];
  assert.throws(() => env.ctx.deleteMyReport('g_B1234567', id), /Hanya pelapor/);
  assert.strictEqual(env.reports.data().length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(env.ctx.deleteMyReport('g_A1234567', id))), { ok: true });
  assert.strictEqual(env.reports.data().length, 0);
  assert.strictEqual(env.ctx.getReports_().length, 0);           // cache laporan dibina semula
  assert.throws(() => env.ctx.deleteMyReport('g_A1234567', id), /tidak dijumpai/);
});
