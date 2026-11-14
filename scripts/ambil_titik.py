"""Lampu isyarat & kamera laju seluruh Malaysia -> docs/data/titik.json (dihidang oleh GitHub Pages), dari fail OSM Geofabrik yang sama
seperti ambil_had.py / ambil_poi.py (Overpass tidak lagi digunakan di sini).

Format: { "v": 1, "t": "YYYY-MM-DD", "c": [[lat, lng, id], ...] (kamera laju), "s": [[lat, lng, id], ...] (lampu isyarat) }
Kamera laju: highway=speed_camera  ATAU  enforcement=maxspeed / average_speed (peranti kamera yang ditanda cara baharu).
Kamera lampu merah (enforcement=traffic_signals) TIDAK dimasukkan. Bilangan setiap jenis dicetak dalam log supaya liputan OSM kelihatan.

Penggunaan: python ambil_titik.py <fail.osm.pbf>      (memerlukan pakej "osmium"; fungsi tulen tidak memerlukannya)
"""
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ambil_had import in_singapore  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'data', 'titik.json')
MIN_RATIO = 0.6
MIN_CAMERAS, MIN_SIGNALS = 20, 1000


def kind(get):
    """'camera' | 'signal' | 'redlight' | None. get(kunci) -> nilai teg atau None."""
    if get('highway') == 'speed_camera' or get('enforcement') in ('maxspeed', 'average_speed'):
        return 'camera'
    if get('highway') == 'traffic_signals':
        return 'signal'
    if get('enforcement') == 'traffic_signals':
        return 'redlight'
    return None


def build(nodes):
    """nodes: [(jenis, id, lat, lng)] -> (kamera, lampu) masing-masing [[lat, lng, id]] (5 titik perpuluhan, tersusun ikut id, tanpa pendua; bukan Singapura)."""
    out = {'camera': {}, 'signal': {}}
    for k, nid, lat, lng in nodes:
        if k in out and not in_singapore(lat, lng) and -1 < lat < 8 and 98 < lng < 120:
            out[k][nid] = [round(lat, 5), round(lng, 5), nid]
    return [out['camera'][i] for i in sorted(out['camera'])], [out['signal'][i] for i in sorted(out['signal'])]


def check(prev, c, s):
    if len(c) < MIN_CAMERAS or len(s) < MIN_SIGNALS:
        return 'terlalu sedikit (kamera %d, lampu isyarat %d)' % (len(c), len(s))
    for key, new, label in (('c', c, 'kamera'), ('s', s, 'lampu isyarat')):
        old = (prev or {}).get(key) or []
        if old and len(new) < len(old) * MIN_RATIO:
            return '%s susut daripada %d kepada %d' % (label, len(old), len(new))
    return ''


def read_nodes(pbf):
    import osmium

    class H(osmium.SimpleHandler):
        def __init__(self):
            super().__init__()
            self.nodes, self.tags = [], {}

        def node(self, n):
            if len(n.tags) and n.location.valid():
                k = kind(n.tags.get)
                if k:
                    self.nodes.append((k, n.id, n.location.lat, n.location.lon))
                    key = 'highway=speed_camera' if n.tags.get('highway') == 'speed_camera' else (
                        'enforcement=' + n.tags.get('enforcement') if n.tags.get('enforcement') else 'highway=traffic_signals')
                    self.tags[key] = self.tags.get(key, 0) + 1

    h = H()
    h.apply_file(pbf)
    return h.nodes, h.tags


def main(pbf):
    nodes, tags = read_nodes(pbf)
    print('Bilangan mengikut teg: ' + ', '.join('%s %d' % kv for kv in sorted(tags.items())))
    c, s = build(nodes)
    prev = None
    try:
        prev = json.load(open(OUT, encoding='utf-8'))
    except Exception:
        pass
    err = check(prev, c, s)
    if err:
        sys.exit('Data baharu ditolak: ' + err)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(json.dumps({'v': 1, 't': datetime.date.today().isoformat(), 'c': c, 's': s}, separators=(',', ':')) + '\n')
    print('Disimpan: %d kamera (lama %d), %d lampu isyarat (lama %d)' % (len(c), len((prev or {}).get('c') or []), len(s), len((prev or {}).get('s') or [])))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Penggunaan: python ambil_titik.py <fail.osm.pbf>')
    main(sys.argv[1])
