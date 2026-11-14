"""Had laju jalan seluruh Malaysia -> fail statik docs/data/had/<i>_<j>.json + indeks.json (dihidang oleh GitHub Pages).

Sumber: fail OpenStreetMap Malaysia penuh dari Geofabrik (malaysia-singapore-brunei-latest.osm.pbf), dimuat turun oleh
.github/workflows/had-bulanan.yml. Overpass TIDAK digunakan: pada 13-14 Nov 2026 ia terlalu sibuk (25-260 s setiap kawasan,
~14 jam untuk seluruh negara, tugas dihentikan GitHub selepas 5.5 jam).

Format kawasan (0.25 darjah; kunci = lantai(lat*4)_lantai(lng*4), sama seperti klien dalam IndexUji.html / Index.html):
  { "v": 1, "w": [[had_kmj, [lat1, lng1, lat2, lng2, ...]], ...] }   (semua bucu jalan dikekalkan: klien menyemak setiap bucu)
Satu jalan dimasukkan ke SETIAP kawasan yang mengandungi salah satu bucunya.
Format indeks: { "v": 1, "t": "YYYY-MM-DD", "k": ["12_406", ...] }

Penggunaan: python ambil_had.py <fail.osm.pbf>      (memerlukan pakej "osmium"; fungsi tulen di bawah tidak memerlukannya)
"""
import datetime
import json
import math
import os
import re
import sys

DIV = 4
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'data', 'had')
MIN_RATIO = 0.6          # jumlah jalan baharu < 60% daripada lama = data rosak -> fail lama dikekalkan
MIN_WAYS = 1000          # sekurang-kurangnya sekian jalan ber-had laju (Malaysia sebenar jauh lebih banyak)


def cell_key(lat, lng):
    return '%d_%d' % (math.floor(lat * DIV), math.floor(lng * DIV))


def parse_maxspeed(v):
    """'50' -> 50, '60 mph' -> 97 (0 = tidak sah / > 130). Sama seperti parseMaxspeed() dalam klien."""
    m = re.match(r'^\s*(\d{2,3})\s*(mph)?', str(v or ''), re.I)
    if not m:
        return 0
    k = round(int(m.group(1)) * 1.609) if m.group(2) else int(m.group(1))
    return 0 if k > 130 else k


def build_tiles(ways):
    """ways: [(id, had, [(lat, lng), ...])] -> {kunci: [[had, [lat, lng, ...]], ...]} (tersusun ikut id; 5 titik perpuluhan)."""
    tiles = {}
    for wid, v, pts in sorted(ways, key=lambda w: w[0]):
        if not v or len(pts) < 2:
            continue
        flat = []
        for lat, lng in pts:
            flat += [round(lat, 5), round(lng, 5)]
        item = [v, flat]
        for key in {cell_key(lat, lng) for lat, lng in pts}:
            tiles.setdefault(key, []).append(item)
    return tiles


def check_total(prev_total, new_total):
    """Pulangkan mesej ralat atau ''."""
    if new_total < MIN_WAYS:
        return 'terlalu sedikit jalan (%d)' % new_total
    if prev_total and new_total < prev_total * MIN_RATIO:
        return 'jalan susut daripada %d kepada %d' % (prev_total, new_total)
    return ''


def read_ways(pbf):
    import osmium

    class H(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.ways = []

        def way(self, w):
            if 'highway' not in w.tags:
                return
            v = parse_maxspeed(w.tags.get('maxspeed'))
            if not v:
                return
            pts = []
            for n in w.nodes:
                if not n.location.valid():
                    return
                pts.append((n.location.lat, n.location.lon))
            self.ways.append((w.id, v, pts))

    h = H()
    h.apply_file(pbf, locations=True, idx='sparse_mem_array')
    return h.ways


def write_all(tiles, out_dir=DIR):
    os.makedirs(out_dir, exist_ok=True)
    for f in os.listdir(out_dir):                       # bina semula penuh: buang kawasan lama yang sudah tiada
        if re.match(r'^\d+_\d+\.json$', f):
            os.remove(os.path.join(out_dir, f))
    size = 0
    for key, w in tiles.items():
        s = json.dumps({'v': 1, 'w': w}, separators=(',', ':'))
        with open(os.path.join(out_dir, key + '.json'), 'w') as fh:
            fh.write(s + '\n')
        size += len(s)
    idx = {'v': 1, 't': datetime.date.today().isoformat(), 'k': sorted(tiles)}
    with open(os.path.join(out_dir, 'indeks.json'), 'w') as fh:
        fh.write(json.dumps(idx, separators=(',', ':')) + '\n')
    return size


def count_existing(out_dir=DIR):
    total = 0
    if os.path.isdir(out_dir):
        for f in os.listdir(out_dir):
            if re.match(r'^\d+_\d+\.json$', f):
                try:
                    total += len(json.load(open(os.path.join(out_dir, f)))['w'])
                except Exception:
                    pass
    return total


def main(pbf):
    ways = read_ways(pbf)
    print('Jalan ber-had laju dalam fail: %d' % len(ways))
    err = check_total(count_existing(), len(ways))
    if err:
        sys.exit('Data baharu ditolak: ' + err)
    tiles = build_tiles(ways)
    size = write_all(tiles)
    print('Selesai: %d kawasan, %.1f MB' % (len(tiles), size / 1e6))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Penggunaan: python ambil_had.py <fail.osm.pbf>')
    main(sys.argv[1])
