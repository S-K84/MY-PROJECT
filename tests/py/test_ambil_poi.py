import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'scripts'))
import ambil_poi as p


def g(d):
    return d.get


class T(unittest.TestCase):
    def test_kategori_sama_dengan_klien(self):
        c = lambda **t: p.category(g(t))
        self.assertEqual(c(amenity='fuel'), 'fuel')
        self.assertEqual(c(highway='services'), 'rest')
        self.assertEqual(c(highway='rest_area'), 'rest')
        self.assertEqual(c(amenity='place_of_worship', religion='muslim'), 'mosque')
        self.assertIsNone(c(amenity='place_of_worship', religion='buddhist'))
        self.assertEqual(c(amenity='toilets'), 'toilet')
        self.assertEqual([c(amenity=a) for a in ['restaurant', 'fast_food', 'cafe', 'food_court']], ['food'] * 4)
        self.assertEqual(c(amenity='atm'), 'atm')
        self.assertEqual(c(amenity='charging_station'), 'ev')
        self.assertEqual([c(railway='station'), c(railway='halt'), c(railway='tram_stop')], ['train', 'train', None])
        self.assertEqual(c(amenity='bus_station'), 'bus')
        self.assertIsNone(c(highway='primary'))

    def test_item_tajuk_sub_dan_pembersihan(self):
        it = p.make_item('fuel', g({'name': ' Petronas\x00 Ayer Keroh ', 'brand': 'Petronas', 'addr:street': 'Jalan Tun Razak'}), 3.15, 101.7)
        self.assertEqual(it, [3.15, 101.7, 'Petronas Ayer Keroh', 'Petronas · Jalan Tun Razak'])
        self.assertEqual(p.make_item('toilet', g({}), 3.1, 101.7)[2:], ['Tandas', ''])                 # tiada nama -> label lalai
        self.assertEqual(p.make_item('food', g({'brand': 'KFC'}), 3.1, 101.7)[2:], ['KFC', ''])         # brand = tajuk -> sub kosong
        self.assertEqual(len(p.make_item('food', g({'name': 'x' * 200}), 3.1, 101.7)[2]), 80)
        self.assertIsNone(p.make_item('fuel', g({'name': 'SG'}), 1.30, 103.85))                         # Singapura
        self.assertIsNone(p.make_item('fuel', g({'name': 'x'}), 95, 101))

    def test_build_tiles_kumpul_ikut_kategori_dan_kawasan_tanpa_pendua(self):
        a = [3.15, 101.7, 'A', '']
        t = p.build_tiles([('fuel', a), ('fuel', a), ('fuel', [4.5, 101.7, 'B', '']), ('atm', a)])
        self.assertEqual(sorted(t), ['atm', 'fuel'])
        self.assertEqual(t['fuel']['12_406'], [a])
        self.assertEqual(sorted(t['fuel']), ['12_406', '18_406'])

    def test_check_total(self):
        self.assertIn('sedikit', p.check_total(0, 10))
        self.assertIn('susut', p.check_total(100000, 50000))
        self.assertEqual(p.check_total(100000, 90000), '')

    def test_write_all_indeks_dan_buang_lama(self):
        with tempfile.TemporaryDirectory() as d:
            out = os.path.join(d, 'poi'); os.makedirs(os.path.join(out, 'fuel'))
            open(os.path.join(out, 'fuel', '1_1.json'), 'w').write('{}')
            p.write_all({'fuel': {'12_406': [[3.15, 101.7, 'Petronas', '']]}}, out)
            self.assertEqual(sorted(os.listdir(os.path.join(out, 'fuel'))), ['12_406.json'])
            self.assertEqual(json.load(open(os.path.join(out, 'indeks.json')))['k'], {'fuel': ['12_406']})
            self.assertEqual(p.count_existing(out), 1)


if __name__ == '__main__':
    unittest.main()
