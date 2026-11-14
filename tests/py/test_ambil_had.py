import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))
import ambil_had as a


class T(unittest.TestCase):
    def test_cell_key_sama_dengan_klien(self):
        self.assertEqual(a.cell_key(3.14, 101.69), '12_406')
        self.assertEqual(a.cell_key(1.55, 110.35), '6_441')

    def test_parse_maxspeed(self):
        self.assertEqual([a.parse_maxspeed(v) for v in ['90', '60 mph', '140', 'walk', '', None, '30']], [90, 97, 0, 0, 0, 0, 30])

    def test_build_tiles_jalan_masuk_setiap_kawasan_bucunya(self):
        # jalan dari kawasan 12_406 ke 13_406 (lat 3.2 -> 3.3), satu lagi jalan tanpa had ditolak
        t = a.build_tiles([(9, 60, [(3.1, 101.7), (3.3, 101.7)]), (2, 90, [(3.1, 101.7), (3.15, 101.7)]), (5, 0, [(3.1, 101.7), (3.2, 101.7)])])
        self.assertEqual(sorted(t), ['12_406', '13_406'])
        self.assertEqual([w[0] for w in t['12_406']], [90, 60])              # tersusun ikut id
        self.assertEqual(t['13_406'], [[60, [3.1, 101.7, 3.3, 101.7]]])      # jalan penuh, bukan dipotong

    def test_check_total(self):
        self.assertIn('sedikit', a.check_total(0, 10))
        self.assertIn('susut', a.check_total(100000, 50000))
        self.assertEqual(a.check_total(100000, 90000), '')
        self.assertEqual(a.check_total(0, 5000), '')

    def test_write_all_membuang_kawasan_lama(self):
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, '1_1.json'), 'w').write('{}')
            a.write_all({'12_406': [[90, [3.1, 101.7, 3.2, 101.7]]]}, d)
            self.assertEqual(sorted(os.listdir(d)), ['12_406.json', 'indeks.json'])
            self.assertEqual(json.load(open(os.path.join(d, 'indeks.json')))['k'], ['12_406'])
            self.assertEqual(a.count_existing(d), 1)


if __name__ == '__main__':
    unittest.main()
