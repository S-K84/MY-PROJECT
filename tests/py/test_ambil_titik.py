import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))
import ambil_titik as t


class T(unittest.TestCase):
    def test_jenis(self):
        k = lambda **x: t.kind(x.get)
        self.assertEqual(k(highway='speed_camera'), 'camera')
        self.assertEqual(k(enforcement='maxspeed'), 'camera')
        self.assertEqual(k(enforcement='average_speed'), 'camera')
        self.assertEqual(k(highway='traffic_signals'), 'signal')
        self.assertEqual(k(enforcement='traffic_signals'), 'redlight')     # kamera lampu merah: bukan kamera laju
        self.assertIsNone(k(highway='bus_stop'))

    def test_build_singapura_pendua_dan_susunan(self):
        c, s = t.build([('camera', 9, 3.123456, 101.7), ('camera', 2, 5.4, 100.3), ('camera', 9, 3.2, 101.8),
                        ('camera', 5, 1.30, 103.85), ('signal', 7, 3.1, 101.6), ('redlight', 8, 3.1, 101.6), ('camera', 6, 51.5, -0.1)])
        self.assertEqual(c, [[5.4, 100.3, 2], [3.2, 101.8, 9]])            # id 9: kejadian terakhir menang; Singapura & London dibuang
        self.assertEqual(s, [[3.1, 101.6, 7]])

    def test_check(self):
        c, s = [[3, 101, i] for i in range(100)], [[3, 101, i] for i in range(2000)]
        self.assertIn('sedikit', t.check(None, c[:5], s))
        self.assertIn('susut', t.check({'c': c, 's': s}, c[:30], s))
        self.assertEqual(t.check({'c': c, 's': s}, c[:95], s[:1900]), '')
        self.assertEqual(t.check(None, c, s), '')

    def test_kamera_tambahan_parse_gabung_dan_dedup(self):
        rows, warn = t.parse_extra(['# komen', 'lat,lng,nama', '', '2.2844,102.4027,Bemban', '3.1,101.7,"A, B"', 'x,y,salah', '51.5,-0.1,London', '3.2'])
        self.assertEqual(rows, [(2.2844, 102.4027), (3.1, 101.7)])
        self.assertEqual(len(warn), 3)                                      # salah, London, baris pendek
        osm = [[2.28449, 102.40265, 6110021790]]                            # ~10 m dari kamera pertama -> diabaikan
        merged, added = t.merge_extra(osm, rows)
        self.assertEqual(added, 1)
        self.assertEqual(merged, osm + [[3.1, 101.7, -2]])                  # id negatif ikut nombor baris data

    def test_fail_contoh_kamera_tambahan_sah(self):
        rows, warn = t.parse_extra(open(t.EXTRA, encoding='utf-8').read().splitlines())
        self.assertEqual(warn, [])


if __name__ == '__main__':
    unittest.main()
