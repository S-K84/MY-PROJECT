"""Tempat (minyak, R&R, masjid, tandas, makan, ATM, caj EV, stesen tren & bas) seluruh Malaysia -> fail statik
docs/data/poi/<kategori>/<i>_<j>.json + indeks.json (dihidang oleh GitHub Pages). Dibaca oleh klien untuk "Cari sepanjang laluan" dan "Berdekatan".

Sumber: fail OpenStreetMap Malaysia penuh dari Geofabrik (sama seperti ambil_had.py). Overpass/Photon dari telefon tidak boleh diharap.
Kawasan 0.25 darjah, kunci = lantai(lat*4)_lantai(lng*4) (sama seperti data had laju). Satu tempat ada dalam SATU kawasan (titik; jalan/bangunan = purata bucu).
Format kawasan: { "v": 1, "p": [[lat, lng, tajuk, sub], ...] }      Format indeks: { "v": 1, "t": "YYYY-MM-DD", "k": { "fuel": ["12_406", ...], ... } }

Penggunaan: python ambil_poi.py <fail.osm.pbf>      (memerlukan pakej "osmium"; fungsi tulen tidak memerlukannya)
"""
import datetime
import json
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ambil_had import cell_key, in_singapore  # noqa: E402

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'data', 'poi')
MIN_RATIO = 0.6
MIN_ITEMS = 5000         # jumlah tempat Malaysia sebenar jauh lebih banyak
# Tajuk lalai bila tempat tiada nama (sama seperti ALONG_Q dalam klien)
LABEL = {'fuel': 'Stesen minyak', 'rest': 'R&R', 'mosque': 'Masjid / surau', 'toilet': 'Tandas', 'food': 'Makan',
         'atm': 'ATM', 'ev': 'Caj EV', 'train': 'Stesen tren', 'bus': 'Stesen bas'}


def category(get):
    """get(kunci) -> nilai teg atau None. Pulangkan kategori atau None. Sama seperti ALONG_Q dalam klien."""
    a, h, r = get('amenity'), get('highway'), get('railway')
    if a == 'fuel':
        return 'fuel'
    if h in ('rest_area', 'services'):
        return 'rest'
    if a == 'place_of_worship' and get('religion') == 'muslim':
        return 'mosque'
    if a == 'toilets':
        return 'toilet'
    if a in ('restaurant', 'fast_food', 'cafe', 'food_court'):
        return 'food'
    if a == 'atm':
        return 'atm'
    if a == 'charging_station':
        return 'ev'
    if r in ('station', 'halt'):
        return 'train'
    if a == 'bus_station':
        return 'bus'
    return None


def clean(v):
    return re.sub(r'[\x00-\x1f]', '', str(v if v is not None else '')).strip()[:80]


def make_item(cat, get, lat, lng):
    """[lat, lng, tajuk, sub] atau None jika koordinat tidak sah / di Singapura."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or in_singapore(lat, lng):
        return None
    title = clean(get('name') or get('brand') or get('operator')) or LABEL[cat]
    brand = clean(get('brand'))
    sub = clean(' · '.join(x for x in [brand if brand and brand != title else '', clean(get('addr:street'))] if x))
    return [round(lat, 5), round(lng, 5), title, sub]


def build_tiles(items):
    """items: [(cat, [lat, lng, tajuk, sub])] -> {cat: {kunci: [[...], ...]}} (tersusun, tanpa pendua)."""
    out = {}
    for cat, it in items:
        out.setdefault(cat, {}).setdefault(cell_key(it[0], it[1]), set()).add(json.dumps(it, ensure_ascii=False, separators=(',', ':')))
    return {c: {k: [json.loads(s) for s in sorted(v)] for k, v in t.items()} for c, t in out.items()}


def check_total(prev_total, new_total):
    if new_total < MIN_ITEMS:
        return 'terlalu sedikit tempat (%d)' % new_total
    if prev_total and new_total < prev_total * MIN_RATIO:
        return 'tempat susut daripada %d kepada %d' % (prev_total, new_total)
    return ''


def read_items(pbf):
    import osmium

    class H(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.items = []

        def node(self, n):
            if len(n.tags) and n.location.valid():
                cat = category(n.tags.get)
                if cat:
                    it = make_item(cat, n.tags.get, n.location.lat, n.location.lon)
                    if it:
                        self.items.append((cat, it))

        def way(self, w):
            if not len(w.tags):
                return
            cat = category(w.tags.get)
            if not cat:
                return
            pts = [(n.location.lat, n.location.lon) for n in w.nodes if n.location.valid()]
            if not pts:
                return
            it = make_item(cat, w.tags.get, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
            if it:
                self.items.append((cat, it))

    h = H()
    h.apply_file(pbf, locations=True, idx='sparse_mem_array')
    return h.items


def count_existing(out_dir=DIR):
    total = 0
    for root, _, files in os.walk(out_dir):
        for f in files:
            if re.match(r'^\d+_\d+\.json$', f):
                try:
                    total += len(json.load(open(os.path.join(root, f), encoding='utf-8'))['p'])
                except Exception:
                    pass
    return total


def write_all(tiles, out_dir=DIR):
    if os.path.isdir(out_dir):                          # bina semula penuh: buang kawasan lama yang sudah tiada
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    size, idx = 0, {}
    for cat, t in sorted(tiles.items()):
        os.makedirs(os.path.join(out_dir, cat))
        idx[cat] = sorted(t)
        for key, p in t.items():
            s = json.dumps({'v': 1, 'p': p}, ensure_ascii=False, separators=(',', ':'))
            with open(os.path.join(out_dir, cat, key + '.json'), 'w', encoding='utf-8') as fh:
                fh.write(s + '\n')
            size += len(s.encode('utf-8'))
    with open(os.path.join(out_dir, 'indeks.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'v': 1, 't': datetime.date.today().isoformat(), 'k': idx}, separators=(',', ':')) + '\n')
    return size


def main(pbf):
    items = read_items(pbf)
    tiles = build_tiles(items)
    total = sum(len(p) for t in tiles.values() for p in t.values())
    print('Tempat dalam fail: %d (%s)' % (total, ', '.join('%s %d' % (c, sum(len(p) for p in t.values())) for c, t in sorted(tiles.items()))))
    err = check_total(count_existing(), total)
    if err:
        sys.exit('Data baharu ditolak: ' + err)
    size = write_all(tiles)
    print('Selesai: %d kawasan-kategori, %.1f MB' % (sum(len(t) for t in tiles.values()), size / 1e6))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Penggunaan: python ambil_poi.py <fail.osm.pbf>')
    main(sys.argv[1])
